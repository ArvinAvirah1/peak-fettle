# Firecrawl (web scraping — the "pull the content" half)

**What it does:** Pulls clean, structured content from web pages — handles JavaScript and embedded resources, and strips the garbage (headers, footers, buttons) before it reaches Claude. Pairs with Exa (see `10-exa.md`): Exa *finds* the best resources, Firecrawl *extracts* their content.

**Maintainer:** Firecrawl (firecrawl.dev). **Requires a Firecrawl API key** (`fc-...`). Get one at https://www.firecrawl.dev/app/api-keys

## Install — Claude Code / Claude Desktop (MCP server)

Easiest path in Claude Code, run from a terminal:

```bash
claude mcp add firecrawl -e FIRECRAWL_API_KEY=fc-YOUR_API_KEY -- npx -y firecrawl-mcp
```

Or run the server directly:

```bash
env FIRECRAWL_API_KEY=fc-YOUR_API_KEY npx -y firecrawl-mcp
```

**Claude Desktop / Cowork** — add a custom connector or MCP entry. Manual config block:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": { "FIRECRAWL_API_KEY": "fc-YOUR_API_KEY" }
    }
  }
}
```

## Tools you get

`firecrawl_scrape`, `firecrawl_batch_scrape`, `firecrawl_map`, `firecrawl_search`, `firecrawl_crawl`, `firecrawl_extract`, plus an autonomous research `agent`.

**Source:** https://github.com/firecrawl/firecrawl-mcp-server · https://docs.firecrawl.dev/mcp
