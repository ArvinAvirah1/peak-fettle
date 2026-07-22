# Dev prompt — SONNET lane (everything except 052/053)

You are a **Sonnet** dev agent in the Peak Fettle repo — the default workhorse lane per the model-routing decision in `DEV_ROADMAP_2026-05-25-LATE.md`. Your tickets are **TICKET-051, 054, 055, 056, 057, 058, 059, 060, 061, 062, 063**. Leave **052 and 053** (the percentile math + tier ladder) and the final verification pass to the Opus agent.

## Step 0 — orient
1. Read `CLAUDE.md` first (authoritative): OneDrive corruption hazards, `rm`/`mv` blocked (overwrite-in-place only), Write truncates files >~33 KB (write large files via bash), commits go through the **temp-index plumbing sequence** (not plain `git commit`), pushing is done by the founder, and **EAS builds from `origin/main`** so unpushed asset/config changes fail prebuild.
2. Read `DEV_ROADMAP_2026-05-25-LATE.md` end to end — every ticket body in your lane, including the focus-stepper addendum (059–062) and the brand-logo ticket (063) at the end.

## Your work, in order
1. **TICKET-051 FIRST** — fix the Rankings tab crash. This unblocks the Opus agent's 053 (the tier UI renders on this screen), so prioritize it. Follow the ticket's diagnosis-before-fix steps; do not guess the fix.
2. **TICKET-054** — fix rest-day logging so streaks stay valid (end-to-end).
3. **Set-logging chain:** **055** (routines + starter splits on the Log tab) → **056** (one-tap routine → exercise drill-in, keep PB-on-select) → **059** (Focus Stepper core) → **060** (switcher sheet + off-routine placement prompt) → **061** (dedicated Routines page) → **062** (non-routine stepper, tier-split free/paid). The drag-reorder list is shared between 060 and 061 — build it once.
4. **In parallel / any time:** **057** (set-logging polish + bundle **Outfit** as the global font token) and **058** (finish/extend the Haiku plan generator).
5. **TICKET-063 (brand logo) LAST in your lane, and only after 057** — it reuses the Outfit font + `theme/tokens.ts` token bundled in 057; do not re-bundle Outfit. Note `react-native-svg` ignores the SVG's embedded `@font-face`, so render the wordmark as an RN `<Text>` in the Outfit token (or ship a PNG) and verify on a real device.

## Definition of done (non-negotiable, every ticket)
- Parse-sweep `mobile/app` + `mobile/src` with `@babel/parser` (jsx + typescript) **and** `node --check` every server `.js` — **against the committed HEAD blobs, not just the working tree** (CLAUDE.md / CORRUPT-001 / PUSH-002). Clean sweep or it's not done.
- The ticket's own acceptance criteria + test plan pass.
- Any asset or `app.json` change is committed (temp-index sequence) and flagged for push to `origin/main` — EAS won't see it otherwise. Expect `tmp_obj_*`/`HEAD.lock` warnings (not failures); verify with `git log --oneline -1`.

## Ask, don't assume
Several tickets have open questions / judgment calls in their Notes — above all **TICKET-063** (logo placement surfaces, whether to replace the OS app icon, dark-mode treatment, horizontal variant), plus Haiku scope/throttle (058) and any ambiguous schema or file locations you hit (051's schema audit especially). **Post your clarifying questions to the founder and wait for answers before building anything ambiguous**, and keep asking as new uncertainty comes up. Start your run by listing the questions you already have.

## Report
Per ticket: files changed, how you verified (which AC/tests + parse-sweep result), and anything left needing a founder push or decision.
