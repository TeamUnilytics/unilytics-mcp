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

import { runBridge } from "./bridge.js";

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

function readApiKey(): string {
  const arg = process.argv.find((a) => a.startsWith("--api-key="));
  // Trimmed because a key is usually pasted, and a paste can carry a stray space or line break.
  const key = (arg ? arg.slice("--api-key=".length) : process.env.UNILYTICS_API_KEY ?? "").trim();
  if (!key) {
    fail(
      "API key required.\n" +
        "Set UNILYTICS_API_KEY or pass --api-key=ulk_live_xxx\n" +
        "Get your key at: https://app.unilytics.ai/settings/api-keys"
    );
  }
  // Format is the server's call. This only stops what can't travel in a header; the key is never echoed.
  if (/[^\x21-\x7e]/.test(key)) {
    fail("the API key contains a space or an unusual character. Copy it again from Settings → API Keys.");
  }
  return key;
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

runBridge({ apiKey: readApiKey(), serverUrl: readServerUrl() }).catch((err: unknown) => {
  console.error(`Failed to start the Unilytics MCP bridge: ${err instanceof Error ? err.name : "unknown error"}`);
  process.exit(1);
});
