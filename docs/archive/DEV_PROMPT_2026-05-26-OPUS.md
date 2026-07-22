# Dev prompt — OPUS lane (TICKET-052, 053 + final pass)

You are an **Opus** dev agent in the Peak Fettle repo. Per the founder's model-routing decision in `DEV_ROADMAP_2026-05-25-LATE.md`, your lane is the math/correctness-critical work **only**: **TICKET-052**, **TICKET-053**, then the **final integration + verification pass**. Do not pick up any other ticket — those belong to the Sonnet agent.

## Step 0 — orient
1. Read `CLAUDE.md` first (authoritative): OneDrive corruption hazards, `rm`/`mv` blocked (overwrite-in-place only), Write truncates files >~33 KB (write large files via bash), commits go through the **temp-index plumbing sequence** (not plain `git commit`), pushing is done by the founder, EAS builds from `origin/main`.
2. Read `DEV_ROADMAP_2026-05-25-LATE.md`: the MODEL ROUTING section and the full bodies of **TICKET-052** (sex-only univariate percentile model) and **TICKET-053** (overall strength percentile + Bronze→Grand Champ tier ladder).

## Your work, in order
1. **TICKET-052** can start immediately — the model/SQL has no app dependency. Deliver the univariate (sex-only) percentile model and its SQL/migration artifacts exactly as the ticket specifies.
2. **TICKET-053** — start only once **051 is done by the Sonnet agent** (the Rankings screen must open for the tier UI to render) **and** 052 is complete (053 consumes the model). Implement the overall score (mean of per-lift percentiles) and the deliberately top-heavy tier ladder.
3. **Final integration + verification pass** — run LAST, after the Sonnet tickets (051, 054–063) have merged. Integrate everything and run the full-repo verification below.

## Definition of done (non-negotiable — applies to 052, 053, AND the final pass)
- Parse-sweep `mobile/app` + `mobile/src` with `@babel/parser` (jsx + typescript) **and** `node --check` every server `.js` — **against the committed HEAD blobs, not just the working tree** (CLAUDE.md / CORRUPT-001 / PUSH-002). The final pass IS this sweep across the whole merged tree; it must be clean.
- The ticket's own acceptance criteria + test plan pass; percentile math is verified numerically (don't eyeball it — check the cutoffs and the mean-of-percentiles against fixtures).
- New migrations/assets are committed (temp-index sequence) and flagged for push to `origin/main`. Expect `tmp_obj_*`/`HEAD.lock` warnings — not failures; verify with `git log --oneline -1`.

## Ask, don't assume
TICKET-053's tier **cutoffs and curve shape** are a judgment call (top-heavy ladder) and TICKET-052 has model-scope notes. Before locking numbers, **post your clarifying questions to the founder and wait** — confirm the tier boundaries, how ties/insufficient-cohort cases are handled, and the model version string. Keep asking as questions arise.

## Report
Per ticket: files changed, how the math was verified (fixtures/numbers + parse-sweep result), and — for the final pass — a clean-sweep confirmation plus anything still needing a founder push or decision.
