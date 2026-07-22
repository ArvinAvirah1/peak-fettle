# Peak Fettle — Development Roadmap (v3)
**Date:** 2026-05-02
**From:** Executive Team — exec-ceo, exec-cto, exec-product-manager
**To:** Dev Team — App Department + Web Department (relayed via Workflow Coordinator)
**Status:** APPROVED — supersedes `DEV_ROADMAP_2026-05-01.md`
**Anchor document:** `INSTRUCTIONS.md` (product spec)
**Beta source:** `pf-beta-feedback-2026-05-01.md`

---

## 1. Why this revision exists

The v2 roadmap (2026-05-01) was written before the Beta Round 2 report landed. That report surfaced three critical security vulnerabilities and a broad set of UX, backend, and content gaps across the landing page and API. This v3 roadmap folds those findings in, assigns them to the appropriate phases and departments, and restates the phase gates with the updated scope. Nothing from v2 is removed; this is an additive revision.

**The single most important change:** Three security items (T-01, T-02, T-03) are now P0 — they must close before any public-facing build is shared with any external user. The Phase B gate is updated to reflect this.

---

## 2. State of the program (audit, 2026-05-02)

### Carried over from v2 as completed

- ✅ TICKET-001 — kg/lbs toggle (shipped)
- ✅ TICKET-002 — RIR field UX (in code; change-log entry still owed from dev-lead)
- ✅ Phase B first tasks — migrations, Express skeleton, JWT auth, workouts + sets endpoints

### New findings from Beta Round 2 (2026-05-01 report)

| ID | Area | Issue | Severity |
|----|------|-------|----------|
| T-01 | Security | `requireAuth` does not check `payload.type` — refresh tokens accepted as access tokens | 🔴 P0 |
| T-02 | Security | No refresh token revocation or logout endpoint — stolen token valid for 30 days | 🔴 P0 |
| T-03 | Security | `POST /sets` does not verify workout ownership — horizontal privilege escalation | 🔴 P0 |
| — | Acquisition | All CTAs ("Start Free", "Find your fettle") loop to `#top` / `#features` — zero signup or download path | 🔴 HIGH |
| T-07 | Backend | No `/exercises` endpoint — sets API is non-functional without known exercise UUIDs | 🟠 HIGH |
| T-06 | Content | Free tier shows 2 templates in copy, 3 in the SVG illustration (copy vs. INSTRUCTIONS: 2 correct) | 🟠 MEDIUM |
| T-05 | Frontend | Notify form email validation accepts "test@" — garbage will enter waitlist | 🟠 MEDIUM |
| T-04 | Backend | `POST /workouts` returns 201 on upsert update — breaks client cache/optimistic UI logic | 🟠 MEDIUM |
| T-08 | Backend | `GET /sets` hardcoded `LIMIT 1000` — serious users hit ceiling in ~10 weeks, no pagination | 🟠 MEDIUM |
| — | UX/Copy | 8 jargon terms (1RM, Wilks, DOTS, RPE, PPL, progressive overload, etc.) unexplained for beginners | 🟡 MEDIUM |
| — | UX/Copy | No cardio-specific value prop on landing — runners have no reason to try the product over Strava | 🟡 MEDIUM |
| T-09 | Frontend | Smooth scroll offset coded as 60px; nav is 72px — first line of every section hides under navbar | 🟡 LOW |
| T-12 | Frontend | Mobile menu has no fade — `display:none` blocks the `opacity` transition entirely | 🟡 LOW |
| T-10 | Accessibility | Mobile menu `role="dialog"` missing `aria-modal="true"` and focus trap — WCAG 2.1 failure | 🟡 LOW |
| T-11 | Frontend | `.chip` / `.stat-chips` CSS and `countUp()` JS fully defined but no HTML elements exist | 🟡 LOW |

---

## 3. Phased plan (v3)

### Phase A — Qt reference sprint (App Dept, ~2 weeks remaining) — scope unchanged

Security items T-01/T-02/T-03 live in the backend (Phase B); they are not Qt-layer work. Phase A scope is unchanged from v2.

| # | Ticket | Owner | Status |
|---|--------|-------|--------|
| 1 | TICKET-001 — kg/lbs toggle | dev-frontend + dev-backend | ✅ closed |
| 2 | TICKET-002 — RIR label UX | dev-frontend | ✅ in code; change-log entry owed |
| 3 | TICKET-003 — My Routines home section | dev-frontend | 🔲 open |
| 4 | TICKET-004 — Start Workout CTA prominence | dev-frontend | 🔲 open |
| 5 | TICKET-005 — Guided onboarding flow | dev-frontend | 🔲 open |
| 6 | TICKET-007 — Exercise search aliases (UI surface only for Phase A) | dev-frontend | 🔲 open |
| 7 | TICKET-008 — PR badges | dev-frontend + dev-backend | 🔲 open |
| 8 | TICKET-010 — Mixed lift+cardio session | dev-frontend + dev-backend | 🔲 open |

**Phase A gate (unchanged):** All 8 tickets merged on `main`; clean Qt 6.11 build; dev-lead.md "Recently completed" updated per ticket; casual gym-goer completes session end-to-end on desktop prototype without docs.

---

### Phase B — Production stack (parallel, ~3–4 weeks) — **scope updated**

Phase B now absorbs all P0 security items and the highest-priority backend + web gaps from Beta Round 2. No public build may be shared until T-01, T-02, and T-03 are closed.

#### B-0: Security (dev-backend) — **P0, must close first**

| Fix | File(s) | Action |
|-----|---------|--------|
| T-01 — JWT type check | `server/middleware/requireAuth.js` | Add `if (payload.type === 'refresh') return res.status(401).json(...)` — single line. Alternatively: use a separate secret for refresh tokens. |
| T-02 — Token revocation | `server/routes/auth.js` + new migration | Add `refresh_tokens` table (token hash, user_id, expires_at). Store hash on issue; DELETE on logout. Add `POST /auth/logout` endpoint. |
| T-03 — Workout ownership | `server/routes/sets.js` | Before inserting: `SELECT id FROM workouts WHERE id = $1 AND user_id = $2`. Return 403 if not found. |

These are the smallest diffs in the sprint and the highest risk if skipped. Treat as a prerequisite to merging any other Phase B work into a shared environment.

#### B-1: Backend gaps (dev-backend + dev-database)

| Task | Notes |
|------|-------|
| T-07 — `GET/POST /exercises` endpoint | Required for the sets API to function. Include name, category, muscle groups. Seed with ~150 lifts + cardio types. |
| T-04 — `POST /workouts` status code | Add `(xmax = 0) AS inserted` to RETURNING clause; return 200 on update, 201 on create. |
| T-08 — Pagination on `GET /sets` | Cursor-based via `logged_at`. Drop the hardcoded `LIMIT 1000`. Accept `?cursor=` and `?limit=` params (default 50). |
| `exercise_aliases` table | Required for TICKET-007. Add in migration; wire to `/exercises/search`. |
| `/plans` skeleton | CRUD only; no AI logic yet. |
| Percentile cron stub | No logic — just a scheduled placeholder. |

#### B-2: Web / landing page (Web Dept + dev-backend)

| Task | Notes |
|------|-------|
| Signup / waitlist CTA | Replace "Start Free" → "Join the waitlist" (or app-store link when available). CTA must route to a real form, not `#top`. This is the single biggest acquisition gap. |
| T-05 — Email validation | Use `input.checkValidity()` on the notify form. Reject partial addresses before they enter the waitlist. |
| T-06 — Template count fix | Remove "Full Body 3x" from the Free Tier SVG illustration, or add it to the pricing copy and INSTRUCTIONS.md. INSTRUCTIONS currently lists 2 templates — align to that. |
| T-09 — Scroll offset | Change `60` → `76` in the `getBoundingClientRect` scroll handler (nav is 72px + 4px breathing room), or read nav height dynamically. |
| T-12 — Mobile menu animation | Replace `display: none / flex` with `visibility: hidden` + `pointer-events: none`. The opacity transition will then fire correctly. |
| T-10 — Accessibility: focus trap | Add `aria-modal="true"` to `.mobile-menu`. Implement Tab/Shift+Tab trap within the menu while it's open. |
| T-11 — Stat chips | Either add `.chip[data-count]` elements to the hero (with real or placeholder metrics), or remove the dead `.stat-chips` CSS and `countUp()` JS. |
| Beginner entry point | Add a "New to fitness? Start here" path or secondary CTA that bypasses competitive framing. Add tooltip or inline definitions for 1RM, PPL, progressive overload on first use. |
| Runner value prop | Surface cohort percentiles explicitly in a running context on the landing page. Elevate the Garmin/wearable roadmap note from buried body text to a visible callout. |
| React marketing site scaffold | Separate repo; waitlist form wired to Resend; deployed to Vercel; Lighthouse ≥90. |

**Phase B gate (updated):** T-01, T-02, T-03 all closed and reviewed; `supabase db push` runs cleanly; `signup → login → POST /workouts → POST /sets → GET /sets?cursor=` smoke test passes; `/exercises` endpoint returns seeded data; marketing site live at public URL with working, validating waitlist form; CI green on lint + tests.

---

### Phase C — React Native migration (~6–8 weeks) — unchanged

Port Qt reference to RN + PowerSync + Supabase offline-first. Scope strictly limited to parity with Phase A tracker. Android transition lag (TICKET-006) is a Phase C acceptance criterion — measure during the port.

**Phase C gate:** RN app on iOS + Android via TestFlight/internal track; airplane-mode logging syncs on reconnect; progress chart within ±2 px of Qt reference; Android transition lag < 100ms before animation begins.

---

### Phase D — MVP feature completion (~4–6 weeks) — unchanged with one pickup

Adds the remaining INSTRUCTIONS.md gaps. Items routed here from beta:

- Cardio tracking model + UI (full implementation, including `avgPaceSecPerMile` alongside the existing `avgPaceSecPerKm` for US users).
- Streak system with make-up window + emergency override flag.
- Free-tier templates (full PPL/Upper-Lower day variants seeded as plan rows).
- Cohort percentile batch job (weekly cron → `percentile_vectors`) + gauge UI; **runner-focused percentile display must be a first-class use case, not an afterthought** per beta feedback.
- TICKET-009 — "Progress vs. Self" view for opt-out / low-percentile users.
- TICKET-011 — Exercise swap without history loss.
- Opening survey + AI plan generation (Claude Haiku 4.5; cache by survey-input hash; ≤3¢/plan target).
- Body composition feasibility logic.
- Timezone normalization on `GET /sets?from=&to=` date filters (T-Priya issue: queries crossing GMT offset boundaries can silently drop records; normalize all timestamps to UTC at storage and document the contract).
- RPE vs. RIR documentation — add a decision record (either in INSTRUCTIONS.md or a new `docs/effort-notation.md`) clarifying that RIR is canonical in the schema, and why. Expose RPE as a display alias if the target market warrants it.

**Phase D gate (unchanged):** Every INSTRUCTIONS.md section has a v1 implementation; AI plan cost ≤3¢ measured; streak make-up + override tested across all 4 beta personas; cohort percentile batch job ran twice on real data without failures.

---

### Phase E — Beta + launch (~4 weeks) — unchanged

Closed beta with all four persona testers (the beta report personas — Jamie, Marcus, Priya, Derek — are good proxies for the four segments). Encryption + RLS audit; App Store + Play Store submission.

**Phase E gate:** v1.0 in both stores; PostHog dashboards live (DAU, weekly retention, North-Star cohort metric); Sentry crash-free sessions ≥99.5% over first launch week.

---

## 4. Department assignments (delta from v2)

### App Department — no change to scope

Phase A Qt tickets as listed. Phase C RN port.

### Web Department — expanded Phase B scope

Owns the full B-2 task list above. Landing page fixes (T-05, T-06, T-09, T-10, T-11, T-12, CTA, beginner entry point, runner value prop) are web-dept work this sprint alongside the React site scaffold. Priority order: CTA fix → email validation → template count → scroll offset → mobile animation + accessibility → stat chips / dead code.

### Backend / Database — expanded Phase B scope

Owns B-0 (security, P0) then B-1. Security items take absolute priority. Nothing in B-1 needs to block waiting for B-0 to merge, but B-0 must land before any shared environment is opened to external testers.

---

## 5. CTO technical guardrails — updated additions

Guardrails 1–8 from v2 are unchanged and carry forward. Two additions:

9. **JWT hygiene.** Access tokens and refresh tokens must be distinguishable at the middleware layer. If using a single signing secret, check `payload.type` and reject `'refresh'` in `requireAuth`. If using separate secrets, document both in the server README. No ambiguity permitted.

10. **Ownership checks on all writes.** Any route that accepts a foreign-key reference from the request body (workoutId, exerciseId, planId, etc.) must verify ownership against `req.user.id` before writing. This is a mandatory pattern, not optional for any new route.

---

## 6. Open exec decisions (carrying forward from v2)

These are not blockers for Phases A or B but must be resolved before Phase D health-suite UI work begins:

1. Habit frequency — daily-only at Phase 2, or weekly + custom from launch?
2. Meditation logging — manual entry only, or Apple Health / Google Fit auto-import?
3. Tab name — "Wellbeing" vs. "Recovery"?
4. **(New)** RPE vs. RIR user-facing label — given that competitive powerlifters (the Marcus persona, a likely paid-tier anchor) use RPE as the industry term, should the app expose RPE as the visible label while keeping RIR as the storage format? Recommend a decision before Phase C RN port locks the UI contract.

---

## 7. Risks (updated)

| Risk | Owner | Mitigation |
|------|-------|------------|
| T-01/T-02/T-03 exploited before patch ships | CTO | Treat as Day 1 sprint items; don't share API credentials or JWT secrets with external parties until fixed |
| Landing page collects unusable waitlist data (bad email validation) | PM / Web | T-05 fix is a single-line change — ship in same PR as CTA redesign |
| Cohort percentiles are too small at launch to be meaningful (Marcus concern) | CEO / PM | Set user expectation in UI ("your cohort grows as more athletes join") until 500+ users per segment |
| Strava or Hevy ships cohort percentiles first | CEO | Phase D gate prioritizes percentile UI even if other features slip |
| Beginner drop-off at landing page (Derek persona) | PM | "New to fitness?" entry point is a Phase B web task, not a Phase D task — pull it forward |
| AI plan quality below paid-tier expectation | PM + CTO | Side-by-side eval against published programs before paid launch |
| RN port regressions vs. Qt reference | CTO | Behavioral test fixtures from Qt; replay against RN |
| Schema debt from skipping Phase B | CTO | Hard rule: no Phase C work begins until Phase B gate passes |

---

## 8. What the execs need from the dev team (next 48h)

1. **dev-backend:** Open PRs for T-01, T-02, T-03. These are the smallest diffs in the sprint. Land them today.
2. **dev-lead:** Append TICKET-002 change-log entry to `dev-lead.md` "Recently completed (2026-05-01)."
3. **Workflow Coordinator:** Translate this v3 roadmap into per-discipline directives under `workflow-optimization/briefs/` and notify dev-lead. Format consistent with prior relay files.
4. **Web Dept:** Begin CTA redesign + email validation fix — can ship in a single PR against `landing.html`.
5. **Exec team:** Resolve the four open decisions in Section 6 this week, especially item 4 (RPE vs. RIR label) before Phase C begins.

---

## 9. Sign-off

- **CEO:** The security items (T-01–T-03) are non-negotiable pre-conditions for any external exposure. The landing page CTA gap is the most actionable acquisition fix in the backlog — it's a same-day change with potentially large impact on waitlist quality and size.
- **CTO:** The JWT type-check fix (T-01) is a single conditional. The privilege escalation fix (T-03) is one SELECT before an INSERT. These are afternoon tasks, not sprint tasks. The absence of a logout/revocation endpoint (T-02) is the only one with meaningful schema work — it still belongs in this sprint. Guardrail 10 (ownership checks on all writes) is now standing policy.
- **PM:** The beginner copy gap and the runner value prop gap are not v2 features — they are copy decisions that can ship with the Phase B web work. Pull them into this sprint rather than waiting for Phase D. The four persona testers from beta are the right cohort for the Phase E closed beta; flag this to the team now.

---

*Roadmap v3 generated by Workflow Coordinator automated task — 2026-05-02.*
*Source: `pf-beta-feedback-2026-05-01.md`. Supersedes `DEV_ROADMAP_2026-05-01.md`.*
