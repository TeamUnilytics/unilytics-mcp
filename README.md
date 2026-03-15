# @unilytics/mcp-server

Marketing analytics tools for [Claude Desktop](https://claude.ai/desktop) and [Claude Code](https://claude.com/claude-code) via MCP.

**21 tools** covering SEO, keyword research, backlinks, competitors, content audits, page speed, your own Google Search Console data, and more.

## Quick Start

1. Get your API key at [app.unilytics.ai/settings/api-keys](https://app.unilytics.ai/settings/api-keys)

2. Add to your Claude Desktop config:

**Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "unilytics": {
      "command": "npx",
      "args": ["-y", "@unilytics/mcp-server"],
      "env": {
        "UNILYTICS_API_KEY": "ulk_live_your_key_here"
      }
    }
  }
}
```

3. Restart Claude Desktop

4. Set tool loading to **"Tools already loaded"** in Claude Desktop settings (click the ⚙️ icon → Tool access → select "Tools already loaded"). Without this, Claude may not load Unilytics tools and fall back to web search.

5. Ask Claude: *"Run a page speed audit on my website"*

## Available Tools

| Tool | Description |
|------|-------------|
| `seo_domain_overview` | Domain SEO metrics — traffic, keywords, visibility |
| `keyword_research` | Search volume, CPC, competition, difficulty |
| `keyword_rankings` | All keywords a domain ranks for |
| `backlink_analysis` | Backlink profile, domain authority, spam score |
| `competitor_analysis` | Organic search competitors and overlap |
| `page_speed_audit` | Core Web Vitals and performance score |
| `technical_seo_audit` | Technical SEO issues and schema markup |
| `serp_results` | Current Google search results for a keyword |
| `on_page_audit` | On-page SEO analysis via DataForSEO |
| `content_analysis` | Content quality, readability, keyword density |
| `faq_search` | FAQ and search questions for a keyword |
| `google_trends` | Google Trends data and correlations |
| `google_news` | Real-time Google News results |
| `domain_history` | Historical traffic and keyword trends |
| `social_media_metrics` | Social media presence analysis |
| `geo_dashboard` | Geographic performance dashboard |
| `list_skills` | Discover built-in marketing workflow recipes |
| `get_skill` | Load a step-by-step workflow guide |
| `list_projects` | List your Unilytics projects |
| `list_connections` | See connected data sources for a project |
| `search_console_data` | Query your Google Search Console data |

## Authentication

Get your API key from [Settings → API Keys](https://app.unilytics.ai/settings/api-keys).

Pass it via:
- `UNILYTICS_API_KEY` environment variable (recommended)
- `--api-key=ulk_live_xxx` CLI argument

## How It Works

This package is a thin stdio-to-HTTP bridge. Claude Desktop communicates with it via stdin/stdout, and it forwards requests to the Unilytics MCP server on AWS. All tool execution happens server-side.

## Links

- [Unilytics](https://unilytics.ai) — Marketing analytics platform
- [MCP Protocol](https://modelcontextprotocol.io) — Model Context Protocol
