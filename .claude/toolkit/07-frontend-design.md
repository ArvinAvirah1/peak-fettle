# Front-End Design (Anthropic, official)

**What it does:** Makes anything Claude designs (landing pages, UIs, slide decks) look far less "AI-generated." A favorite workflow: generate several conversion-optimized variants of a page and click through to pick the components you like.

**Maintainer:** Anthropic — official directory (`claude-plugins-official`).

## Install

The official marketplace is built in. In the Claude Code prompt:

```
/plugin install frontend-design@claude-plugins-official
```

Recommended: install **globally** (user scope) so it's on for all your design work.

## Use

```
/frontend-design make six variants of my landing page optimized for conversion
```

## Notes

- This capability is also baked into Anthropic's Claude Design product — but if you bring that project back into Claude Code, use this skill.
- In your current Cowork session you also have a related styling skill, `theme-factory`, for theming artifacts/slides/docs.

**Source:** https://github.com/anthropics/claude-plugins-official (plugin: `frontend-design`)
