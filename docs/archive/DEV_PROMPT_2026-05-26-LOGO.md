# Dev prompt — TICKET-063: insert the Peak Fettle brand logo

You are a dev agent working in the Peak Fettle repo. Your task is **TICKET-063 — Insert the Peak Fettle brand logo (scatter + trendline lockup)**.

## Before you write any code
1. Read `CLAUDE.md` first (it governs this repo: OneDrive corruption hazards, the committing-via-temp-index workaround, the EAS "must push to origin/main" rule, and your model lane).
2. Read **TICKET-063** in full in `DEV_ROADMAP_2026-05-25-LATE.md` (it's at the end of the doc), plus the **MODEL ROUTING** section near the top. TICKET-063 is in the **Sonnet** lane and must land **after TICKET-057** (the Outfit font must already be bundled and exposed as a `theme/tokens.ts` token — reuse it, don't re-bundle Outfit).

## What to do
Adopt the founder-approved brand logo. It is the vertical lockup at `mobile/assets/brand/peak-fettle-logo.svg`: a scatter plot whose least-squares trendline rises to a highlighted summit, with **"Peak Fettle" in Outfit 700** centered beneath. Brand colors: slate `#13415C`, teal `#0F9D8E`.

Work to the acceptance criteria and the "Definition of done" exactly as written in TICKET-063. Two things that will bite you if you skip them:
- **`react-native-svg` does NOT honor the SVG's embedded `@font-face`.** The wordmark will silently fall back to a system font unless you render it as an RN `<Text>` in the Outfit token (option a) or ship a rasterized PNG (option b). **Verify Outfit actually renders on a real device build**, not just in a browser preview.
- **New assets must be committed AND pushed to `origin/main`** or the EAS build fails prebuild with `ENOENT … ./assets/...` (see CLAUDE.md). Pushing happens from the founder's machine — flag clearly when a push is required.

Close with the model-independent Definition of done: the `@babel/parser` parse-sweep over `mobile/app` + `mobile/src` and `node --check` on server `.js`, **run against the committed HEAD blobs, not just your working tree** (this is what caught PUSH-002 / CORRUPT-001).

## IMPORTANT — ask before you assume
TICKET-063 has four **open questions** (placement surfaces, whether to also replace the OS app icon, dark-mode treatment, and whether a horizontal variant is also wanted). **Do not guess these.** Before implementing, **ask the founder/me your clarifying questions** and wait for answers — and ask any *other* questions that come up as you go (ambiguous file locations, token names from TICKET-057, whether a mark-only icon export is in scope, etc.). It is better to ask than to build the wrong placement. List your questions up front, then proceed once they're answered.
