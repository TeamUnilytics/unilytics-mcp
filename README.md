# Unilytics MCP

Connects [Claude Desktop](https://claude.ai/download) and other MCP clients to your [Unilytics](https://unilytics.ai) account: your saved skills, your clients' context and Knowledge Base, and the SEO, content and AEO research tools.

## Connect Claude Desktop (recommended)

You don't need to install Node, edit a config file or keep your key in a text file.

1. Create an API key in the Unilytics app: [Settings → API Keys](https://app.unilytics.ai/settings/api-keys).
2. Download **[unilytics.mcpb](https://github.com/TeamUnilytics/unilytics-mcp/releases/latest/download/unilytics.mcpb)** and double-click it. Claude Desktop opens the install screen.
3. Click **Install**, paste your API key when Claude asks for it, and make sure the extension is switched on.
4. In the chat box, click the settings icon → **Tool access** → **Load tools when needed**. Unilytics has many tools, and with "Tools already loaded" Claude leaves them out of the chat.
5. Start a new chat and ask: *"List my projects on Unilytics."*

Full guide: [docs/user/claude-desktop-extension.md](docs/user/claude-desktop-extension.md).

Prefer not to use a key? Claude can also connect with one link and your Google account: see [Connect Claude to Unilytics](https://unilytics.ai/docs/connect/).

## Other MCP clients (npm)

For Claude Code and other stdio clients. Needs Node 18 or newer.

```bash
claude mcp add unilytics --scope user --env UNILYTICS_API_KEY=ulk_live_your_key -- npx -y @unilytics/mcp-server
```

Any client with an `mcpServers` config:

```json
{
  "mcpServers": {
    "unilytics": {
      "command": "npx",
      "args": ["-y", "@unilytics/mcp-server"],
      "env": { "UNILYTICS_API_KEY": "ulk_live_your_key" }
    }
  }
}
```

On Windows, use `"command": "cmd"` and `"args": ["/c", "npx", "-y", "@unilytics/mcp-server"]`.

Pass the key with `UNILYTICS_API_KEY` (recommended) or `--api-key=ulk_live_xxx`.

## Tools

About 90 tools, served by Unilytics, so they stay current without updating anything here. Your AI lists them when it connects. Some use credits from your account.

## How it works

A thin stdio-to-HTTP bridge. Your MCP client talks to it over stdin/stdout, and it forwards each message to `https://mcp.unilytics.ai/mcp` with your key. Everything runs server-side; the bridge stores nothing.

If the connection fails, your AI gets an error saying what to do. A failed tool call is never retried automatically, because the first attempt may have finished and used credits.

## Versions and updates

The version in `package.json` is the only version number: the manifest is stamped from it at build time, and `src/version.ts` is pinned to it by a test.

- **Releasing.** Merging a new `version` to `main` publishes `unilytics.mcpb` as GitHub release `v<version>` (`.github/workflows/release.yml`), after the tests pass on the packed file. Published releases are immutable. npm is a separate, manual `npm publish` from the same commit.
- **Download URLs.** `releases/latest/download/unilytics.mcpb` always serves the newest release. Every version keeps its own URL (`releases/download/v1.1.0/unilytics.mcpb`) for rollback.
- **Verify a download.** `gh attestation verify unilytics.mcpb --repo TeamUnilytics/unilytics-mcp`
- **No auto-update.** Claude Desktop doesn't update extensions installed from a file. New and changed tools arrive from the server with no reinstall. A bridge release is for a bug or security fix in the bridge itself, and users get it by double-clicking the new file, which replaces the old version.
- **Keep old bridges working.** Installed copies stay in use indefinitely, so the server must keep speaking standard MCP over Streamable HTTP at `https://mcp.unilytics.ai/mcp`, and tool changes reach them as ordinary `tools/list` changes. The `User-Agent` (`unilytics-mcp-bridge/<version>`) shows which versions are still in use. Before retiring a version or shipping a security fix, tell users through the app and the changelog.
- **Never rename.** `name` and `author.name` in `mcpb/manifest.json` form the extension's id. Changing either makes Claude Desktop treat an update as a different extension, with a second copy and a lost key. The default URL can't change either: the bridge refuses cross-origin redirects, because the key travels with every request.

## Development

```bash
npm ci
npm test                # bridge tests
npm run build:mcpb      # dist-mcpb/unilytics.mcpb
npm run test:mcpb       # unpacks it outside the repo and runs the same tests on it
```

Only the packages allowed in `scripts/build-mcpb.mjs` may enter the bundle. The build stops if a dependency update brings in another one.

## Links

- [Unilytics](https://unilytics.ai)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [MCP Bundles (.mcpb)](https://github.com/anthropics/mcpb)
