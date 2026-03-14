# @unilytics/mcp-server

Marketing analytics tools for [Claude Desktop](https://claude.ai/desktop) and [Claude Code](https://claude.com/claude-code) via MCP.

**16 tools** covering SEO, keyword research, backlinks, competitors, content audits, page speed, and more.

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

4. Ask Claude: *"Run a page speed audit on my website"*

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
