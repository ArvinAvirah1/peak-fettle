# Skill Creator (Anthropic, official)

**What it does:** Builds, tests, and packages new Claude Code skills from a plain-English description. The "factory" that produces every other skill you'll sell. Four modes: Create, Eval, Improve, Benchmark.

**Maintainer:** Anthropic — part of the official plugin directory (`claude-plugins-official`), so it stays maintained.

## Install

The official marketplace is built into Claude Code, so no `marketplace add` is needed. In the Claude Code prompt:

```
/plugin install skill-creator@claude-plugins-official
```

Or browse interactively: `/plugin` → **Discover** → Skill Creator → Install.

## Install globally (recommended)

Install it once at the user scope so it's available in every project automatically; you won't have to think about invoking it. If you'd rather scope it per-project, install it from inside that project.

## Use

- Invoke with `/skill-creator` and pick a mode, or just say "create a skill that …"
- Drop in an SOP / process doc and ask it to turn that into a reusable skill.

## Notes

- This is already available as a skill in your current Cowork session (`skill-creator`) — you can try it right now without installing the Claude Code plugin.

**Source:** https://github.com/anthropics/claude-plugins-official · https://claude.com/plugins/skill-creator
