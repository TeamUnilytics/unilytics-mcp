# Unilytics MCP

Connects [Claude Desktop](https://claude.ai/download) and other MCP clients to your [Unilytics](https://unilytics.ai) account: your saved skills, your clients' context and Knowledge Base, and the SEO, content and AEO research tools.

## Connect Claude Desktop (recommended)

You don't need to install Node, edit a config file or keep your key in a text file.

1. Create an API key in the Unilytics app: [Settings → API Keys](https://app.unilytics.ai/settings/api-keys).
2. Download **[unilytics.mcpb](https://github.com/TeamUnilytics/unilytics-mcp/releases/latest/download/unilytics.mcpb)** and double-click it. Claude Desktop opens the install screen.
3. Click **Install**, paste your API key when Claude asks for it, and make sure the extension is switched on.
4. In the chat box, click the settings icon → **Tool access** → **Load tools when needed**. Unilytics has many tools, and with "Tools already loaded" Claude leaves them out of the chat.
5. Start a new chat and ask: *"List my projects on Unilytics."*

Full guide: [Install the Unilytics extension for Claude Desktop](https://github.com/TeamUnilytics/unilytics-mcp/blob/main/docs/user/claude-desktop-extension.md).

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

The tools are served by Unilytics, so new and changed tools reach you without updating anything here. Your AI lists every tool when it connects. Some use credits from your account. These are the groups, with a few tools from each:

| Group | What it's for | For example |
|---|---|---|
| Skills | Find, read and write your saved playbooks | `find_skill`, `list_skills`, `get_skill`, `create_skill`, `update_skill` |
| Client context | Each client's Brand Kit, Context records and settings | `list_projects`, `get_project_context`, `propose_context_record`, `propose_brand_kit`, `list_context_gaps` |
| Knowledge Base and files | Store and search each client's documents, pages and files | `kb_search`, `kb_write_text`, `kb_add_urls`, `upload_file_to_project`, `create_upload_link` |
| SEO research | Keywords, search results, on-page checks and page speed | `keyword_research`, `serp_results`, `on_page_audit`, `page_speed_audit`, `google_trends` |
| AEO and AI search | Prompts to track, and how AI answers mention and cite a brand | `aeo_generate_prompts`, `aeo_prompt_volume`, `brand_visibility`, `ai_citation_check` |
| Web pages | Read, crawl and screenshot websites | `content_scrape`, `js_scrape`, `site_crawl`, `site_map`, `page_screenshot` |
| Competitors and ads | Watch competitor pages for changes and see the ads they run; browse ad audiences for your own campaigns | `watch_competitor`, `get_competitor_changes`, `google_ads_transparency`, `audience_segments` |
| Account | Your credit balance, and which accounts are linked to a project in the app (it doesn't read their data) | `get_credit_balance`, `list_connections` |

Competitor watches (`watch_competitor`) run on a schedule, and each run uses credits.

### What isn't included

- **Google Search Console and GA4 data.** Unilytics doesn't serve your first-party analytics. Connect your AI to them with your own connector (for example a Search Console or GA4 MCP server), and the skills use it.
- **Backlinks, ranking keywords, top pages and traffic history.** Use your own Semrush or Ahrefs connection.

## How it works

A thin stdio-to-HTTP bridge. Your MCP client talks to it over stdin/stdout, and it forwards each message to `https://mcp.unilytics.ai/mcp` with your key. Everything runs server-side; the bridge stores nothing.

If a request fails, your AI gets an error saying what to do. A failed tool call is never retried automatically, because the first attempt may have finished and used credits.

## Versions and updates

The version in `package.json` is the only version number: the manifest is stamped from it at build time, and `src/version.ts` is pinned to it by a test.

- **Releasing.** Merging a new `version` to `main` publishes `unilytics.mcpb` as GitHub release `v<version>` (`.github/workflows/release.yml`), after the tests pass on the packed file on Linux, macOS and Windows. Published releases are immutable (a repository setting). If a run fails, re-run it from the Actions tab (Release → Run workflow). npm is a separate, manual `npm publish` from the same commit.
- **Download URLs.** `releases/latest/download/unilytics.mcpb` always serves the newest release. Every version keeps its own URL (`releases/download/v1.1.0/unilytics.mcpb`) for rollback.
- **Verify a download.** `gh attestation verify unilytics.mcpb --repo TeamUnilytics/unilytics-mcp`
- **No auto-update.** Claude Desktop doesn't update extensions installed from a file. New and changed tools arrive from the server with no reinstall. A bridge release is for a bug or security fix in the bridge itself, and users get it by double-clicking the new file, which replaces the old version.
- **Keep old bridges working.** Installed copies stay in use indefinitely, so the server must keep speaking MCP over Streamable HTTP at `https://mcp.unilytics.ai/mcp`, **answering each POST with a JSON response, not an SSE stream**, and tool changes reach them as ordinary `tools/list` changes. The bridge can only report a failed reply when the POST itself fails. If a stream dropped, a request would wait until the client's own timeout. `npm run test:live` checks this against the live endpoint. The `User-Agent` (`unilytics-mcp-bridge/<version>`) shows which versions are still in use. Before retiring a version or shipping a security fix, tell users through the app and the changelog.
- **Never rename.** `name` and `author.name` in `mcpb/manifest.json` form the extension's id. Changing either makes Claude Desktop treat an update as a different extension, with a second copy and a lost key. The default URL can't change either: the bridge refuses cross-origin redirects, because the key travels with every request.

## Development

```bash
npm ci
npm test                # bridge tests
npm run build:mcpb      # dist-mcpb/unilytics.mcpb
npm run test:mcpb       # unpacks it outside the repo and runs the same tests on it
npm run test:live       # the live endpoint still answers with JSON (no key needed, uses a made-up one)
npm run test:docs       # every tool this README and the manifest name is still served (also weekly in CI)
```

Only the packages allowed in `scripts/build-mcpb.mjs` may enter the bundle. The build stops if a dependency update brings in another one.

## Links

- [Unilytics](https://unilytics.ai)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [MCP Bundles (.mcpb)](https://github.com/anthropics/mcpb)
