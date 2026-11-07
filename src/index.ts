#!/usr/bin/env node

/**
 * Unilytics MCP Server: stdio-to-HTTP bridge.
 *
 * Connects a stdio MCP client to the Unilytics MCP endpoint. All tool logic lives server-side.
 * Ships two ways from this one entry point: the npm package (`npx -y @unilytics/mcp-server`) and the Claude Desktop
 * Extension (`unilytics.mcpb`, see mcpb/manifest.json).
 *
 * Environment:
 *   UNILYTICS_API_KEY  your API key from https://app.unilytics.ai/settings/api-keys
 *   UNILYTICS_MCP_URL  developers only: another endpoint (https, or http on localhost)
 */

import { NO_KEY_MESSAGE, runBridge, runWithoutKey, UNUSABLE_KEY_MESSAGE } from "./bridge.js";

/**
 * The permanent public host (founder-approved, UNI-252), never a raw function URL: an installed .mcpb can't be
 * updated remotely, so this value has to outlive any infrastructure change behind it.
 */
const DEFAULT_MCP_URL = "https://mcp.unilytics.ai/mcp";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function readServerUrl(): URL {
  const raw = process.env.UNILYTICS_MCP_URL || DEFAULT_MCP_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    fail("UNILYTICS_MCP_URL is not a valid URL.");
  }
  // The API key travels with every request, so it must not cross the network unencrypted.
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname))) {
    fail("UNILYTICS_MCP_URL must use https (http is allowed only on localhost).");
  }
  return url;
}

function start(): Promise<void> {
  const serverUrl = readServerUrl();

  const arg = process.argv.find((a) => a.startsWith("--api-key="));
  // Trimmed because a key is usually pasted, and a paste can carry a stray space or line break.
  const apiKey = (arg ? arg.slice("--api-key=".length) : (process.env.UNILYTICS_API_KEY ?? "")).trim();

  // Format is the server's call. This only stops what can't travel in a header. The key is never echoed.
  const problem = !apiKey ? NO_KEY_MESSAGE : /[^\x21-\x7e]/.test(apiKey) ? UNUSABLE_KEY_MESSAGE : null;
  if (!problem) return runBridge({ apiKey, serverUrl });

  // A person at a terminal reads stderr, and nothing would ever arrive on stdin to answer.
  if (process.stdin.isTTY) fail(problem);
  console.error(`Error: ${problem}`);
  return runWithoutKey(problem);
}

start().catch((err: unknown) => {
  console.error(`Failed to start the Unilytics MCP bridge: ${err instanceof Error ? err.name : "unknown error"}`);
  process.exit(1);
});
