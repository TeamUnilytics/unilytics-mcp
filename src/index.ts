#!/usr/bin/env node

/**
 * Unilytics MCP Server — stdio-to-HTTP bridge
 *
 * Thin proxy that connects Claude Desktop (stdio) to the Unilytics MCP
 * server (Streamable HTTP on AWS Lambda). All tool logic lives server-side.
 *
 * Usage:
 *   npx -y @unilytics/mcp-server
 *
 * Environment:
 *   UNILYTICS_API_KEY  — your API key from Settings → API Keys
 *
 * Claude Desktop config (claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "unilytics": {
 *         "command": "npx",
 *         "args": ["-y", "@unilytics/mcp-server"],
 *         "env": { "UNILYTICS_API_KEY": "ulk_live_xxx" }
 *       }
 *     }
 *   }
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_SERVER_URL =
  process.env.UNILYTICS_MCP_URL ||
  "https://r62ebubbnd5n7k6fet6gcbc7nq0snxbb.lambda-url.ap-south-1.on.aws/mcp/";

function getApiKey(): string {
  // Check CLI args: --api-key=ulk_live_xxx
  const apiKeyArg = process.argv.find((a) => a.startsWith("--api-key="));
  if (apiKeyArg) return apiKeyArg.split("=")[1];

  // Check env var
  const envKey = process.env.UNILYTICS_API_KEY;
  if (envKey) return envKey;

  console.error(
    "Error: API key required.\n" +
      "Set UNILYTICS_API_KEY env var or pass --api-key=ulk_live_xxx\n" +
      "Get your key at: https://app.unilytics.ai/settings/api-keys"
  );
  process.exit(1);
}

async function main() {
  const apiKey = getApiKey();

  // Stdio transport — reads JSON-RPC from stdin, writes to stdout
  const stdio = new StdioServerTransport();

  // HTTP transport — connects to Unilytics Lambda MCP endpoint
  const http = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  });

  // Wire stdio → HTTP → stdio
  await stdio.start();
  await http.start();

  stdio.onmessage = async (message) => {
    await http.send(message);
  };

  http.onmessage = async (message) => {
    await stdio.send(message);
  };

  stdio.onclose = async () => {
    await http.close();
    process.exit(0);
  };

  http.onclose = async () => {
    await stdio.close();
    process.exit(0);
  };

  // Handle process signals
  process.on("SIGINT", async () => {
    await http.close();
    await stdio.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Failed to start Unilytics MCP bridge:", err.message);
  process.exit(1);
});
