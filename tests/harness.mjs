// Runs a bridge entry point the way a stdio MCP client does, against a local stand-in for the Unilytics endpoint.

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** BRIDGE_ENTRY is set by the smoke test to run this same suite against the unpacked .mcpb. */
export const ENTRY = process.env.BRIDGE_ENTRY || join(root, "dist", "index.js");

export const TEST_KEY = "ulk_test_harness_secret_value";

/** `respond(req, body, res)` overrides the default behaviour for a test. */
export async function startServer() {
  const server = {
    requests: [],
    respond: null,
    http: null,
    url: "",
    close: () => new Promise((resolve) => server.http.close(resolve)),
  };
  server.http = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", async () => {
      const text = Buffer.concat(chunks).toString();
      const body = text ? JSON.parse(text) : undefined;
      server.requests.push({ method: req.method, url: req.url, headers: req.headers, body });
      if (server.respond) return server.respond(req, body, res);
      if (req.method !== "POST") {
        res.writeHead(405).end();
      } else if (body.id === undefined) {
        res.writeHead(202).end();
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { echoed: body.method } }));
      }
    });
  });
  await new Promise((resolve) => server.http.listen(0, "127.0.0.1", resolve));
  server.url = `http://127.0.0.1:${server.http.address().port}/mcp`;
  return server;
}

export function startBridge({ url, key = TEST_KEY, args = [], env = {} }) {
  const { UNILYTICS_API_KEY: _key, UNILYTICS_MCP_URL: _url, ...parentEnv } = process.env;
  const child = spawn(process.execPath, [ENTRY, ...args], {
    env: {
      ...parentEnv,
      ...(key === null ? {} : { UNILYTICS_API_KEY: key }),
      ...(url ? { UNILYTICS_MCP_URL: url } : {}),
      ...env,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const bridge = {
    child,
    stdout: "",
    stderr: "",
    messages: [],
    send: (message) => child.stdin.write(`${JSON.stringify(message)}\n`),
    exited: new Promise((resolve) => child.on("exit", (code) => resolve(code))),
    /** Resolves with the reply to a request id, or rejects after 10 s. */
    reply: async (id) => {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const found = bridge.messages.find((m) => m.id === id);
        if (found) return found;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`No reply to id ${JSON.stringify(id)}. stderr: ${bridge.stderr}`);
    },
    stop: async () => {
      child.kill();
      await bridge.exited;
    },
  };
  let buffered = "";
  child.stdout.on("data", (chunk) => {
    bridge.stdout += chunk;
    buffered += chunk;
    const lines = buffered.split("\n");
    buffered = lines.pop();
    for (const line of lines) if (line.trim()) bridge.messages.push(JSON.parse(line));
  });
  child.stderr.on("data", (chunk) => {
    bridge.stderr += chunk;
  });
  return bridge;
}

export const request = (id, method, params = {}) => ({ jsonrpc: "2.0", id, method, params });
