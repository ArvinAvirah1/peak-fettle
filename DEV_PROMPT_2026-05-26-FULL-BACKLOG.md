# Dev prompt — complete the active backlog (TICKET-051 … 063)

You are a dev agent working in the Peak Fettle repo. Your job is to drive the **entire active feature backlog to done: TICKET-051 through TICKET-063**, as specified in `DEV_ROADMAP_2026-05-25-LATE.md` (v25). Do not invent scope — implement exactly what the tickets specify.

## Step 0 — orient before touching anything
1. Read **`CLAUDE.md`** first. It is authoritative and overrides defaults. Key hazards: this repo lives in OneDrive (files/`.git` get corrupted mid-write), `rm`/`mv` are blocked on the mount (overwrite-in-place only), the Write tool silently truncates files >~33 KB (write large files via bash), commits must go through the **temp-index plumbing sequence** (not plain `git commit`), pushing is done by the founder from their machine, and **EAS builds from `origin/main`** so unpushed asset/config changes fail prebuild.
2. Read `DEV_ROADMAP_2026-05-25-LATE.md` end to end — especially the **⚙️ MODEL ROUTING FOR AGENT RUNS** section near the top, the ticket index, and every ticket body (051–063, including the focus-stepper addendum 059–062 and the brand-logo ticket 063 at the end).

## Step 1 — find your lane by the model you are running
Per the founder's routing decision (do **only** your lane):

- **If you are Opus:** do **TICKET-052** (sex-only univariate percentile model) and **TICKET-053** (overall percentile + tier ladder) — the math/correctness-critical work — **then the final integration + verification pass** over everything merged. Nothing else.
- **If you are Sonnet:** do **everything else** — TICKET-051, 054, 055, 056, 057, 058, 059, 060, 061, 062, 063. This is the default workhorse lane.
- **If you are Haiku:** you should not be running this backlog. Restrict yourself to the mechanical chores called out in the routing table (Outfit token rollout, the `plan_ready` copy fix, the `session_type` SELECT add) and stop.

## Step 2 — work in dependency order (do not deadlock)
1. **051 first** (Sonnet) — the Rankings screen must open before the tier UI (053) can render on it.
2. **052** (Opus) can start in parallel — the model/SQL has no app dependency.
3. **053** (Opus) — only after 051 (screen opens) **and** 052 (the model) are done.
4. **Sonnet, any time:** 054, then the set-logging chain **055 → 056 → (059, 060 stepper) → 061 → 062**; **057** (theming/Outfit) and **058** (Haiku generator) run alongside; **063** (brand logo) lands **after 057** so it reuses the bundled Outfit font + token (don't re-bundle Outfit).
5. **Opus last:** the final integration + verification pass.

Tickets are:
051 Rankings crash · 052 Percentile model · 053 Tier ladder · 054 Rest-day/streak fix · 055 Routines on Log tab · 056 One-tap drill-in · 057 Theming + Outfit · 058 Haiku plan generator · 059 Focus Stepper core · 060 Switcher + placement prompt · 061 Routines page · 062 Non-routine stepper (tier-split) · 063 Brand logo.

## Step 3 — Definition of done (NON-NEGOTIABLE, every ticket, every model)
- Parse-sweep `mobile/app` + `mobile/src` with `@babel/parser` (jsx + typescript) **and** `node --check` every server `.js` — **against the committed HEAD blobs, not just the working tree** (CLAUDE.md / CORRUPT-001 / PUSH-002). "Looks done" is not done until the sweep is clean. This is also the core of the Opus final pass.
- Each ticket's own acceptance criteria and test plan pass.
- Anything that adds/changes an asset or `app.json` must be **committed and flagged for push to `origin/main`** or EAS won't see it.
- Commit using the temp-index plumbing sequence in CLAUDE.md; expect the `tmp_obj_*`/`HEAD.lock` warnings (they are not failures) and verify with `git log --oneline -1`.

## Step 4 — ASK, don't assume
Several tickets have explicit open questions and judgment calls in their **Notes** — most notably **TICKET-063** (logo placement, app-icon replacement, dark-mode treatment, horizontal variant), but also tier cutoffs/curve shape (053), Haiku scope/throttle (058), and any ambiguous schema/file locations you hit (051's schema audit especially).

**Before building anything ambiguous, list your clarifying questions to the founder/me and wait for answers.** Keep asking as new uncertainty comes up — it is always better to ask than to implement the wrong thing and have it masked by a green build. Start your run by posting the questions you already have from reading the tickets.

## Step 5 — report
When your lane is complete, report per ticket: what changed (files), how you verified it (which AC/tests + the parse-sweep result), and anything left needing a founder push or decision.
