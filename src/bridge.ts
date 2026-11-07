/**
 * Forwards MCP messages between a stdio client (Claude Desktop) and the Unilytics HTTP endpoint.
 *
 * A .mcpb installed from a file never auto-updates (Claude Desktop skips `local.mcpb*` ids), so this stays
 * protocol-thin: tools live on the server, and nothing here knows about them.
 *
 * Relies on the server answering each POST with a JSON response, which its buffered Lambda mode guarantees. The SDK's
 * send() has resolved with the reply delivered by then, so a failed send is the only way a reply can go missing. See
 * "Keep old bridges working" in the README.
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
export const ERROR_API_KEY = -32010;
export const ERROR_TRANSPORT_FAILED = -32011;
export const ERROR_REQUEST_REFUSED = -32012;

const API_KEYS_URL = "https://app.unilytics.ai/settings/api-keys";
const REPLACE_KEY =
  `Create a new key at ${API_KEYS_URL}, then update it ` +
  "(Claude Desktop: Settings → Extensions → Unilytics → Configure).";

export const NO_KEY_MESSAGE = `No Unilytics API key is set. ${REPLACE_KEY}`;
export const UNUSABLE_KEY_MESSAGE =
  "The Unilytics API key contains a space or an unusual character, so it was probably copied incompletely. " +
  REPLACE_KEY;

/**
 * The user-facing answer to a request the bridge could not deliver or read a reply for.
 *
 * Never retried, and a failed tool call is never called safe to repeat. Any HTTP error can come from something in
 * between (a CDN, a proxy) after the server ran the tool and charged for it, so only the caller can decide.
 */
function failureFor(request: JSONRPCRequest, err: unknown): { code: number; message: string } {
  const status = err instanceof StreamableHTTPError ? err.code : undefined;
  const checkFirst =
    request.method === "tools/call"
      ? " This tool call may or may not have finished and may have used credits, so check for its result in " +
        "Unilytics before running it again."
      : "";
  if (status === 401) {
    return { code: ERROR_API_KEY, message: `Unilytics didn't accept the API key. ${REPLACE_KEY}` };
  }
  if (status === 429) {
    return {
      code: ERROR_REQUEST_REFUSED,
      message: `Unilytics is receiving too many requests. Wait a minute.${checkFirst}`,
    };
  }
  if (status !== undefined && status >= 400 && status < 500) {
    // A proxy or firewall can send these too, so this doesn't claim that the key is at fault.
    return {
      code: ERROR_REQUEST_REFUSED,
      message:
        `Unilytics refused this request (HTTP ${status}).${checkFirst} If this keeps happening, check for a ` +
        `network proxy or firewall, or create a new API key at ${API_KEYS_URL}.`,
    };
  }
  if (checkFirst) {
    return {
      code: ERROR_TRANSPORT_FAILED,
      message:
        `The connection to Unilytics failed before a result came back.${checkFirst} If this keeps happening, ` +
        "check your internet connection.",
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

/** A method name is client text, so only the ones we expect go in the log. */
const LOGGED_METHODS = new Set([
  "initialize",
  "ping",
  "tools/list",
  "tools/call",
  "prompts/list",
  "prompts/get",
  "resources/list",
  "resources/read",
  "notifications/initialized",
  "notifications/cancelled",
]);

function methodForLog(message: JSONRPCMessage): string {
  if (!("method" in message)) return "response";
  return LOGGED_METHODS.has(message.method) ? message.method : "other method";
}

/** Above the origin's 120 s limit: a reply can't still be on its way after this. */
const DRAIN_LIMIT_MS = 130_000;
const FLUSH_LIMIT_MS = 2_000;

/** Exits once the last reply has reached the pipe (stdout pipes are asynchronous on Windows), or after a short limit. */
function exitAfterFlush(code: number): void {
  const exit = () => process.exit(code);
  setTimeout(exit, FLUSH_LIMIT_MS).unref();
  if (process.stdout.destroyed) exit();
  else process.stdout.write("", exit);
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
    exitAfterFlush(0);
  };

  const writeToClient = async (message: JSONRPCMessage): Promise<void> => {
    try {
      await stdio.send(message);
    } catch (err) {
      logFailure("could not write to the client", err);
      await shutdown();
    }
  };

  let inFlight = 0;
  let inputEnded = false;

  const forwardToServer = async (message: JSONRPCMessage): Promise<void> => {
    inFlight += 1;
    try {
      await http.send(message);
    } catch (err) {
      if (shuttingDown) return;
      logFailure(`${methodForLog(message)} failed`, err);
      // Notifications and responses take no reply: JSON-RPC forbids answering them.
      if (isJSONRPCRequest(message)) {
        await writeToClient({ jsonrpc: "2.0", id: message.id, error: failureFor(message, err) });
      }
    } finally {
      inFlight -= 1;
      if (inputEnded && inFlight === 0) void shutdown();
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
  // A client can close its input right after its last request, so replies still on their way are delivered first.
  process.stdin.on("end", () => {
    inputEnded = true;
    if (inFlight === 0) void shutdown();
    else setTimeout(() => void shutdown(), DRAIN_LIMIT_MS).unref();
  });
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  // HTTP first: it creates the AbortController that sending needs, and stdio starts delivering messages at once.
  await http.start();
  await stdio.start();
}

/**
 * Answers every request with the same explanation when the key can't be used at all.
 *
 * stderr goes to a log file, so a reply on stdout is the only way to reach the client: its answer to `initialize` is
 * what the client can show as the connection error. Claude Desktop's required-field check lets a whitespace-only value
 * through, so this is reachable.
 */
export async function runWithoutKey(message: string): Promise<void> {
  const stdio = new StdioServerTransport();
  stdio.onmessage = (incoming) => {
    if (!isJSONRPCRequest(incoming)) return;
    stdio
      .send({ jsonrpc: "2.0", id: incoming.id, error: { code: ERROR_API_KEY, message } })
      .catch((err: unknown) => logFailure("could not write to the client", err));
  };
  stdio.onerror = (err) => logFailure("client sent an unreadable message", err);

  process.stdout.on("error", () => process.exit(1));
  process.stdin.on("end", () => exitAfterFlush(1));
  await stdio.start();
}
