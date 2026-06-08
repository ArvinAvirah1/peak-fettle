# Higgsfield (media generation — images & video)

**What it does:** Fills Claude's biggest gap — it can't create media. Higgsfield's MCP server lets Claude generate images (up to 4K) and video (up to ~15s) directly, using 30+ models (Soul, Cinema Studio, Flux, Seedream, Kling, Veo, Sora, MiniMax Hailuo, etc.). Because it runs inside your project, it already has your brand guidelines, audience, and context — no repeating yourself. Enables the "content agency killer": static images for a landing page, UGC-style ad creative, or competitor-gap content, all from your existing project context.

**Maintainer:** Higgsfield (higgsfield.ai). **No API key needed** — you sign in to your Higgsfield account via OAuth.

## Install — Claude Desktop / Cowork (recommended)

1. Open **Settings → Connectors**.
2. Click **Add custom connector**.
3. Name it **Higgsfield**.
4. Paste the MCP server URL:

```
https://mcp.higgsfield.ai/mcp
```

5. Click **Connect** → sign in to Higgsfield and approve access. One-time setup; it stays connected.

## Install — Claude Code

From a terminal:

```bash
claude mcp add --transport http higgsfield https://mcp.higgsfield.ai/mcp
```

## Use

> Use Higgsfield to generate static images for my landing page, and a UGC-style video I can use as ad creative — based on this project.

**Source:** https://higgsfield.ai/mcp
