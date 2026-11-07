/**
 * Forwards MCP messages between a stdio client (Claude Desktop) and the Unilytics HTTP endpoint.
 *
 * A .mcpb installed from a file never auto-updates (Claude Desktop skips `local.mcpb*` ids), so this stays
 * protocol-thin: tools live on the server, and nothing here knows about them.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  isJSONRPCRequest,
  type JSONRPCMessage,
  type JSONRPCRequest,
} from "@modelcontextprotocol/sdk/types.js";

import { BRIDGE_VERSION } from "./version.js";

/** Server-defined JSON-RPC range, clear of the SDK's -32000 (connection closed) and -32001 (request timeout). */
export const ERROR_API_KEY_REJECTED = -32010;
export const ERROR_TRANSPORT_FAILED = -32011;

const API_KEYS_URL = "https://app.unilytics.ai/settings/api-keys";

/**
 * The user-facing answer to a request the bridge could not deliver or read a reply for.
 *
 * Never retried and never described as "safe to retry": the response can be lost after the server ran the tool and
 * charged for it, so only the caller can decide whether to run it again.
 */
function failureFor(request: JSONRPCRequest, err: unknown): { code: number; message: string } {
  if (err instanceof StreamableHTTPError && (err.code === 401 || err.code === 403)) {
    return {
      code: ERROR_API_KEY_REJECTED,
      message:
        `Unilytics didn't accept the API key. Create a new key at ${API_KEYS_URL}, then update it ` +
        "(Claude Desktop: Settings → Extensions → Unilytics → Configure).",
    };
  }
  if (request.method === "tools/call") {
    return {
      code: ERROR_TRANSPORT_FAILED,
      message:
        "The connection to Unilytics failed before a result came back, so this tool call may or may not have " +
        "finished and may have used credits. Check for its result in Unilytics before running it again. If this " +
        "keeps happening, check your internet connection.",
    };
  }
  return {
    code: ERROR_TRANSPORT_FAILED,
    message: "Couldn't reach Unilytics. Check your internet connection and try again.",
  };
}

/**
 * Only allowlisted metadata reaches the log. An SDK error's `message` can quote a response body, and a fetch error
 * can quote a header value, so neither is ever printed: this is what keeps the API key out of Claude's log files.
 */
function logFailure(context: string, err: unknown): void {
  const parts = [`[unilytics] ${context}`];
  if (err instanceof StreamableHTTPError) {
    parts.push(`status=${err.code ?? "none"}`);
  } else if (err instanceof Error) {
    parts.push(`error=${err.name}`);
    const cause = (err as Error & { cause?: { code?: unknown } }).cause;
    if (typeof cause?.code === "string") parts.push(`cause=${cause.code}`);
  }
  console.error(parts.join(" "));
}

export async function runBridge(options: { apiKey: string; serverUrl: URL }): Promise<void> {
  const stdio = new StdioServerTransport();
  const http = new StreamableHTTPClientTransport(options.serverUrl, {
    requestInit: {
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "User-Agent": `unilytics-mcp-bridge/${BRIDGE_VERSION}`,
      },
    },
  });

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    await Promise.allSettled([http.close(), stdio.close()]);
    process.exit(0);
  };

  const writeToClient = async (message: JSONRPCMessage): Promise<void> => {
    try {
      await stdio.send(message);
    } catch (err) {
      logFailure("could not write to the client", err);
      await shutdown();
    }
  };

  const forwardToServer = async (message: JSONRPCMessage): Promise<void> => {
    try {
      await http.send(message);
    } catch (err) {
      if (shuttingDown) return;
      const method = "method" in message ? message.method : "response";
      logFailure(`${method} failed`, err);
      // Notifications and responses take no reply: JSON-RPC forbids answering them.
      if (isJSONRPCRequest(message)) {
        await writeToClient({
          jsonrpc: "2.0",
          id: message.id,
          error: failureFor(message, err),
        });
      }
    }
  };

  stdio.onmessage = (message) => void forwardToServer(message);
  http.onmessage = (message) => void writeToClient(message);
  stdio.onerror = (err) => logFailure("client sent an unreadable message", err);
  http.onerror = (err) => logFailure("transport error", err);
  stdio.onclose = () => void shutdown();
  http.onclose = () => void shutdown();

  // A client that has gone away closes the pipe: writing to it must end the bridge, not crash it.
  process.stdout.on("error", () => void shutdown());
  // StdioServerTransport doesn't watch for end of input, and open keep-alive sockets would hold the process up.
  process.stdin.on("end", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  // HTTP first: it creates the AbortController that sending needs, and stdio starts delivering messages at once.
  await http.start();
  await stdio.start();
}
