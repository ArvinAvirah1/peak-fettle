# DEV PROMPT — 2026-07-03 — FEATURE-GAP RUN KICKOFF (TICKET-128…146)
**Paste everything below the line into a fresh Claude (Fable 5) session opened in the repo root.**

---

You are **Claude Fable 5, orchestrating** the implementation of the feature-gap backlog **TICKET-128…146** in this repo (Peak Fettle). You do not hand-write most of the code — you plan, spawn, verify, merge, and commit. **All execution subagents are spawned with `model: sonnet`** (limit-friendly, per CLAUDE.md §7). The only exceptions: you personally write the math-critical engine rule modules in TICKET-141/142 (they were Opus-lane work; you outrank Opus) and you personally do every verification pass.

## 0 · Read before anything else
1. `CLAUDE.md` — all of it. The local-first invariant (§1), exact-kg weight rule (§2), safe-area-in-Modal rule (§3), drift-tolerant DB rules (§4), auth cold-start rule (§5), verification gate (§6), multi-agent workflow rules (§7), and push/EAS pipeline (§8) are binding on every ticket.
2. `DEV_ROADMAP_2026-07-03-FEATURE-GAPS.md` — the 19 tickets you are implementing, with acceptance criteria, sizes, and dependency edges. Treat acceptance criteria as the spec; do not re-scope.
3. Skim `audits/feature-gap-analysis-2026-07-03.html` §2 ("false blind spots") so no agent rebuilds something that already exists.

## 1 · Ground rules (non-negotiable)
- **Disjoint file ownership.** No two concurrently running agents may edit the same file. The wave plan below assigns ownership; enforce it in every spawn prompt. Shared config files (`mobile/app.json`, `mobile/package.json`, `db/schema.sql`, `mobile/src/db/migrations.ts`) are **orchestrator-owned**: agents report the exact additions they need in their final message; you apply and reconcile them at wave merge.
- **The verification gate is yours, personally, after every wave.** Sonnet self-reports are not verification. Run: (a) `@babel/parser` parse-sweep (plugins `jsx`+`typescript`) over every `.ts/.tsx` in `mobile/app` + `mobile/src` → 0 failures; (b) `node --check` every server `.js`; (c) `node mobile/src/db/__tests__/migrations.test.js`; (d) `tsc --noEmit` delta vs the ~85-error baseline → must not increase. Also grep changed screens for raw `from '../api/` personal-data imports → each needs an `isLocalFirst` branch.
- **Agents that die mid-run often already wrote files.** After any agent failure or session-limit death, inspect the working tree before re-spawning; resume only what is actually missing.
- **Workflow lint:** never put literal clock/random calls (the Date-dot-now / Math-dot-random forms) inside spawn prompt strings — reword them ("pass the current time in as a parameter").
- **Weight/length I/O only via `mobile/src/constants/units.ts`.** Any agent touching numeric input/display must state in its report which units helpers it used.
- **Schema bumps are strictly sequential and pre-assigned:** v4 = TICKET-129, v5 = 130, v6 = 133, v7 = 143. They run inside single-owner "schema track" agents (below) so `localSchema.ts`/`migrations.ts`/`exportEngine.ts`/`migrateToPro.ts` never have two writers.
- **Commit at each wave merge** (message: `feat: wave N — TICKET-xxx,yyy,zzz`), using plain git (the repo is on a normal path now). **I (the founder) do the pushing and EAS builds** — flag me at every checkpoint marked 🔔 and stop that track until I confirm.
- Unclear product intent at any point → **stop and ask me. Never guess vision** (TICKET-071 rule).

## 2 · Wave plan
Run waves in order; within a wave, spawn all agents **in parallel, in one message**. Ticket specs live in the roadmap file — spawn prompts should point the agent at its ticket section + CLAUDE.md, restate its file-ownership list, and demand a per-ticket DoD self-check (which you then re-verify).

### Wave 1 — five parallel Sonnet agents (all Tier-1 blues, zero native work)
| Agent | Ticket | Owns (exclusive) |
|---|---|---|
| W1-A | 128 RPE toggle | `appSettings.ts`, `StepperLogger.tsx`, `loggerLogic.ts` + its tests, `glossary.tsx`, workout-day/history render helpers |
| W1-B | 131 share cards | new `ShareCardSheet.tsx` + new share/render util files ONLY — entry-point wiring into finish flow & workout-day is delivered as a patch snippet for you to apply at merge |
| W1-C | 132 program shelf | `templates.tsx`, new `mobile/src/data/programs/*` |
| W1-D | 134 exercise media v1 | `exerciseCatalog.ts`, new `ExerciseDetailSheet.tsx`, `ExercisePicker.tsx` |
| W1-E | 135 importers | `csv-import.tsx`, new parser + name-mapping modules + fixtures |
**Merge:** apply W1-B's wiring, reconcile deps, run the gate, commit. 🔔 If view-shot needs a native build, note it for the Wave-2 EAS batch.

### Wave 2 — four parallel agents
| Agent | Ticket(s) | Owns |
|---|---|---|
| W2-A schema track | **129 then 130, sequentially in one agent** | `localSchema.ts`, `migrations.ts`, `migrations.test.js`, `exportEngine.ts`, `migrateToPro.ts`, server sets route, new `data/measurements.ts`, `progress.tsx`, `units.ts` (length helpers), logger note-sheet UI (logger files are free now) — plus reports `db/schema.sql` additions to you |
| W2-B | 136 HealthKit re-enable | `services/healthKit.ts`; reports package/app.json plugin additions to you |
| W2-C | 137 Live Activities + Android notif | new apple-targets extension dir, new native bridge module, `useRestTimer` hooks, Android service; reports config additions to you |
| W2-D | 138 routine share links | new `server/routes/shareLinks.js`, `_layout.tsx` deep-link block, routine-sheet share action, `tierPolicy.ts` comment |
**Merge:** you apply all app.json/package.json/schema.sql changes yourself, gate, commit. 🔔 **EAS checkpoint #1:** I push, build, device-test — including the 136 cold-start ×20 regression check on iOS 26. Wave 3 may start while I test, but nothing in Wave 3 may touch W2 files until confirmed.

### Wave 3 — four parallel agents
| Agent | Ticket(s) | Owns |
|---|---|---|
| W3-A schema track | **133 then 143, sequentially** | migration files (v6, v7), photo storage + gallery/compare UI, badge defs + evaluator + profile badge case, cosmetics grant hook (respect the 2026-06-19 gating fix) |
| W3-B | 139 group leaderboards | server group aggregation, `group-detail.tsx`, weekly-signal payload |
| W3-C | 141 autoregulation | **You write the rule module + table-driven tests first**; then a Sonnet agent builds the logger suggestion strip against your module (`StepperLogger` is free again) |
| W3-D | 145 App Intents | intents extension + handler layer, `widgetBridge.ts` interactive buttons; config via you |
**Merge:** gate, commit. 🔔 **EAS checkpoint #2** (image-picker, intents). Founder review items: 134's cues, 132's program naming, 141's thresholds — batch them to me here.

### Wave 4 — two parallel + one gated track
| Agent | Ticket | Notes |
|---|---|---|
| W4-A | 142 fatigue-aware | You write trigger rules + tests; Sonnet does the plan-adjust card UI |
| W4-B | 144 circuits + timers | logger rotation (`loggerLogic.ts` free), group editor, timer sheet |
| W4-C | **140 Apple Watch — GATED** | 🔔 Ask me explicitly: "commit the 4–8 wk watch block now, or park it?" Only on GO: you do the sync-architecture review first, then sequential Sonnet agents per stage A→B→C, each stage EAS'd and device-tested before the next |

### Wave 5 — solo, only after every other ticket is merged
**146 localization.** It touches nearly every screen, so nothing else may run beside it. Batch extraction by directory across parallel Sonnet agents **with disjoint directory ownership**, you own the i18n scaffold + typed keys; parse-sweep after every batch (mass mechanical edits are exactly what has truncated files before).

## 3 · Definition of done for the whole run
1. All 19 tickets meet their roadmap acceptance criteria; full gate green; `tsc` delta ≤ baseline.
2. `db/schema.sql` reflects every server migration (fold-back rule); all new tables in `BACKUP_TABLES` + migrate-to-Pro.
3. Roadmap file updated: per-ticket status line (✅ done / ⏸ parked + reason).
4. `CLAUDE.md` active-backlog pointer repointed from TICKET-051…062 to this roadmap.
5. Final summary to me: what shipped, what is parked, exact founder to-do list (pushes, EAS builds, device tests, content reviews) in order.

Begin with Wave 1. Spawn all five agents in a single message.
