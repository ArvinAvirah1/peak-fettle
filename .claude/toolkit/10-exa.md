# Exa (web search — the "find the best resources" half)

**What it does:** Semantic web search. Instead of keyword-matching (which surfaces SEO-optimized pages), Exa finds pages by *meaning* — so it discovers the best resources even when they use different words than your query. Pairs with Firecrawl (see `09-firecrawl.md`): Exa finds, Firecrawl extracts.

**Maintainer:** Exa (exa.ai). Hosted MCP; **API key** at https://dashboard.exa.ai/api-keys (the hosted endpoint also works for basic use).

## Install — Claude Code (hosted MCP, simplest)

From a terminal:

```bash
claude mcp add --transport http exa https://mcp.exa.ai/mcp
```

## Install — Claude Desktop / Cowork

Exa is a native connector. **Settings → Connectors → search "Exa" → Add (+).** No config files needed.

Manual config alternative (with your key):

```json
{
  "mcpServers": {
    "exa": {
      "command": "npx",
      "args": ["-y", "exa-mcp-server"],
      "env": { "EXA_API_KEY": "your_api_key" }
    }
  }
}
```

## Tools you get

`web_search_exa` and `web_fetch_exa` (on by default); `web_search_advanced_exa` (filters, domains, dates — enable via the `tools` query param).

**Stacking tip:** native Claude search for quick lookups → **Exa** to find the best sources → **Firecrawl** to pull their full content. Better inputs = better outputs.

**Source:** https://github.com/exa-labs/exa-mcp-server · https://docs.exa.ai/reference/exa-mcp
