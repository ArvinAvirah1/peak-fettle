# Morph (Fast Apply / WarpGrep / Compact)

**What it does:** Speeds up the *mechanical* parts of Claude's work (not the reasoning): **Fast Apply** edits files faster and cheaper, **WarpGrep** searches a codebase faster, and **Compact** (Flash Compact) compresses session context in sub-2s so you lose less time on compaction. Net effect: faster builds, fewer tokens on mechanical work.

**Maintainer:** Morph (morphllm.com). **Requires a Morph API key.** Note Morph is a paid service.

> Important: the **plugin** provides Flash **Compact** only. **Fast Apply** and **WarpGrep** come from the **MCP** server. Morph recommends installing **both**.

## 1) Install the plugin (Compact)

In the Claude Code prompt:

```
/plugin marketplace add morphllm/morph-claude-code-plugin
/plugin install morph-compact@morph-claude-code-plugin
```

Then set up your key + compact instructions:

```
/morph-compact:install
```

This stores your Morph API key in `~/.claude/morph/.env` and adds compact instructions to your global `~/.claude/CLAUDE.md`. (Manual compaction: `/compact morph`.)

## 2) Install the MCP (Fast Apply + WarpGrep)

From a terminal:

```bash
claude mcp add morph -e MORPH_API_KEY=YOUR_KEY -- npx -y @morphllm/morphmcp
```

(Key can also be provided via the `MORPH_API_KEY` environment variable.)

## Tip

Ask Claude: "Based on everything I do in this project, is there anything I can convert to a script so I use code instead of AI to complete a repeated task?" Moving repetitive work to scripts saves time and tokens.

**Source:** https://github.com/morphllm/morph-claude-code-plugin · https://docs.morphllm.com/guides/claude-code
