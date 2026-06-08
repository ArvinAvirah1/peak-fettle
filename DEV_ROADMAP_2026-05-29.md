# Peak Fettle — Development Roadmap (v26)

*Opened 2026-05-29. Founder directive: "revise the whole codebase in its entirety; take the learnings of the inefficiencies and mistakes; ask me about vision when unclear; and formulate + pitch a companion mental-health app before any work begins."*

> v25 (TICKET-051…063) remains the product backlog. **v26 opens the Revision & Hardening phase (TICKET-064…070), a standing vision protocol (TICKET-071), and a gated companion-app discovery (TICKET-072).** Numbering continues from TICKET-063.

---

## Why this phase exists
Two videos' worth of dev tooling is now wired into the repo (`.claude/AGENT_TOOLKIT.md`), and we have a hard-won `dev_learnings.md` (L-001…L-026 + CORRUPT-001). Rather than pile new features onto an unverified base, v26 audits the **entire** codebase, fixes the worst-rotted areas with targeted rewrites, and mechanizes the parse-sweep so "reviewed manually" can never again mask a broken commit (L-014, CORRUPT-001).

**Founder decisions (2026-05-29):** revision scope = *audit everything + targeted rewrites*. Companion app = *standalone app, shared backend, bundled into the paid tier, light evidence-based (CBT/mindfulness)*.

---

## Ticket index — Revision & Hardening (Phase R)

| Ticket | Title | Area | Owner lane | Priority | Key learnings |
|--------|-------|------|------------|----------|---------------|
| TICKET-064 | Full-codebase audit + findings register | All | Opus + Sonnet | 🔴 P0 (gates the rest) | L-001…026, CORRUPT-001 |
| TICKET-065 | Rewrite push / notification pipeline | Mobile + Server | Opus + dev | 🔴 P0 | L-013, PUSH-001/002 |
| TICKET-066 | Consolidate percentile / scoring math | Data + Backend | Opus + data-analyst | 🟠 P1 | L-014, L-024 |
| TICKET-067 | Eradicate all mock/stub fallbacks | All | Sonnet + dev | 🟠 P1 | L-003,010,016,021,022 |
| TICKET-068 | Data-layer & migration integrity audit | DB + Backend | Opus + data-analyst | 🟠 P1 | L-009,017,024,025 |
| TICKET-069 | Error-handling & resilience pass | Mobile + Server | Sonnet + dev | 🟡 P2 | L-004,008,011,012,018,019 |
| TICKET-070 | Adopt toolkit + CI parse-sweep gate | DevEx / CI | Sonnet | 🟡 P2 | L-014, CORRUPT-001 |
| TICKET-071 | Founder vision reconciliation protocol | Process | All | 🟠 P1 (cross-cutting) | — |
| TICKET-072 | Companion mental-health app — discovery & approval gate | New product | Coordinator + founder | ⏸ gated | — |

Run order: **064 first** (it gates 065–070). Then 065 (push, P0) and 066/068 (correctness) in parallel where lanes allow; 067/069 alongside; 070 once the verify skill is exercised. 071 is always-open. 072 does **not** start until the founder approves the pitch.

---

## ⚙️ Model routing (continues the v25 strategy)
- **Opus** — correctness/architecture-critical: TICKET-064 (lead), 065, 066, 068; **plus the final integration + full-repo verification pass.** Always pair with `/ultra-review`.
- **Sonnet** — default workhorse: TICKET-064 module sweeps, 067, 069, 070. superpowers + `/review` + `peak-fettle-verify` every ticket.
- **Haiku** — **not** in this plan. If run anyway: mechanical chores only (CI YAML scaffolding for 070, doc formatting). Never the audit judgment, push, math, or migration work.

## ✅ Definition of done (every ticket, every lane)
1. `superpowers` plan-first; `GSD` for multi-module fan-out so no module is silently skipped.
2. `/review` on every change; `/ultra-review` + `/codex:review` to gate push (065), math (066), and migrations (068).
3. **`peak-fettle-verify`** parse-sweep + `node --check` over `mobile/app`, `mobile/src`, `peak-fettle-agents/server` — green is the DOD, not a prose claim (L-014).
4. Commit via **`peak-fettle-commit`**; flag for founder `git push` (EAS won't see fixes until pushed).
5. Ambiguous product intent → `OPEN_QUESTIONS_FOR_FOUNDER.md` (TICKET-071), never a guess.
6. Capture new lessons back into `dev_learnings.md` (compounding memory).

## Sequencing vs. v25 launch backlog
The v24/v25 launch stack still governs launch. The Revision phase should run **before** the companion app and ideally interleaved with closing v25's P0s — but TICKET-064's audit may reprioritize v25 items if it finds regressions. The companion app (TICKET-072) is intentionally last and gated.
