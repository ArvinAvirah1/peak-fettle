# Peak Fettle — Code Iteration Feedback Report
**Run date:** 2026-05-05
**Scope:** Current codebase state following claimed Sprint 1–5 completions per DEV_ROADMAP_2026-05-05.md (v7). All backend files, Qt/C++ source, and marketing-site source files reviewed. Cross-checked against all prior open issues from pf-tester-feedback-2026-05-04.md.
**Methodology:** Static analysis of all source files. All issues from the 2026-05-04 run re-verified against current file state. Line counts and content tails used to confirm truncation status.
**Prior report status:** Issues from 2026-05-04 run reproduced below with updated OPEN / CLOSED / PARTIAL status.

---

## ⚠️ CRITICAL FINDING: DEV_ROADMAP_2026-05-05.md (v7) Contains Incorrect Completion Claims

The roadmap states "Sprint 1 ✅ COMPLETE — requireAuth.js, auth.js, sets.js, index.js all fully restored" and cites verification via file tooling. Direct inspection of all four files shows this is **false** — every file is byte-for-byte identical to its 2026-05-04 broken state. The roadmap's sprint completion was recorded incorrectly. This is the second consecutive sprint where the roadmap has diverged from code reality. The issue register in §9 of the roadmap, which marks all four as ✅, must be treated as unreliable until independently verified.

---

## SECTION 1 — STATUS OF PRIOR REPORT ISSUES

### X-series (critical file truncation issues)

| ID | Issue | Status |
|----|-------|--------|
| X-01 | `requireAuth.js` truncated — server cannot start | 🔴 OPEN — File is **still 12 lines**. Truncated at `const token = header.startsWith('Bearer ') ?` — no token extraction, no `jwt.verify()`, no `req.user`, no `next()`. Identical to 05-04 run. |
| X-02 | `auth.js` truncated — login/logout/refresh routes absent | 🔴 OPEN — File is **still 89 lines**, ending mid-login handler at `pool.quer`. No `/auth/refresh`, no `/auth/logout`. Identical to 05-04 run. |
| X-03 | `sets.js` GET route truncated — pagination not implemented | 🔴 OPEN — File is **still 75 lines**, ending mid-comment in the GET route description (`// return only rows logged_at < c`). No GET implementation, no `module.exports`. Identical to 05-04 run. |
| X-06 | HomePage streak counter capped at ~100 training days | ✅ CLOSED — `qml/HomePage.qml` line 53 confirms `allSets = WorkoutTracker.recentSets(2000)`. Fix is present and correct. |

### Y-series (issues from 2026-05-04 run)

| ID | Issue | Status |
|----|-------|--------|
| Y-01 | `index.js` truncated — no middleware, routes, or app.listen() | 🔴 OPEN — File is **still 29 lines** (was 30 in prior report — identical content). Still ends mid-comment after `// N-12: CORS — whitelist-based origin policy.` The `cors({...})` configuration, all `app.use(...)` middleware, all route registrations, and `app.listen()` are absent. Identical to 05-04 run. |
| Y-02 | `exercise.cpp` truncated — `estimatedOneRepMax()` has no body | 🔴 OPEN — File is **still 39 lines**, ending mid-comment inside `estimatedOneRepMax()`. No `for` loop, no conditional, no `return`, no closing brace. Build will fail to compile this translation unit. Identical to 05-04 run. |
| Y-03 | `exercise_prs` stale PR rows on set-delete or weight-edit-downward | 🔲 OPEN — No change. Carries into this sprint as Phase B item per roadmap. |
| Y-04 | `cosmetic_items` missing write-guard comment | 🔲 OPEN — No change. Carries into this sprint as Phase B doc-only fix. |

### T-series (carried from prior sprints)

| ID | Issue | Status |
|----|-------|--------|
| T-01 | JWT middleware accepts refresh tokens as access tokens | 🔴 OPEN — Blocked by X-01. requireAuth.js still truncated. |
| T-02 | No refresh token revocation / logout | 🔴 OPEN — Blocked by X-02. auth.js still truncated. |
| T-08 | GET /sets cursor pagination | 🔴 OPEN — Blocked by X-03. sets.js GET route still absent. |
| T-09 | Smooth scroll 12px offset (landing.html) | ✅ CLOSED — `landing.html` line 1734 confirms 76px scroll-margin-top comment and fix. Correct. |
| T-10 | Mobile menu missing aria-modal + focus trap (landing.html) | ✅ CLOSED — `landing.html` line 1011 confirms `role="dialog" aria-modal="true"`, focus trap at line 1526. Correct. |
| T-11 | Stat chip dead code (landing.html) | ✅ CLOSED — `landing.html` line 1087 confirms chips wired to `countUp()` (lines 1676–1703). Correct. |
| T-12 | Mobile menu display:none transition (landing.html) | ✅ CLOSED — `landing.html` line 163 confirms `visibility: hidden` + `opacity` transition replacing `display:none`. Correct. |

### N-series (from 2026-05-02/03 tester runs)

| ID | Issue | Status |
|----|-------|--------|
| N-06 | Ghost exercise buckets after rename | 🔴 OPEN — No `editSet()` pruning logic found in `ExerciseLibrary.cpp`. A full search of the 472-line file for `editSet`, `removeExercise`, `pruneEmpty`, `detach`, and `setCount` returned no results. The seen-set deduplication at lines 138–178 is the N-04 fix (duplicate exercises in browse mode) and does not address ghost buckets from rename. Status unchanged from 05-04 run. |
| N-11 | No rate limiting on auth routes | 🔴 OPEN — Blocked by Y-01. `express-rate-limit` is imported in `index.js` (line 9) but the file is truncated before any `rateLimit({...})` configuration. |
| N-12 | CORS defaults to `*` if WEB_ORIGIN unset | 🔴 OPEN — Blocked by Y-01. `cors` is imported (line 8) and the N-12 comment block begins at line 28, but `index.js` ends mid-comment. The `cors({...})` call is absent. |
| N-13 | No DELETE endpoints for sets or workouts | 🔴 OPEN — `sets.js` is truncated before any GET route (let alone DELETE). `workouts.js` is truncated after the POST route (see new issue Z-01 below). No DELETE routes found anywhere in the backend. Roadmap v7 claims N-13 is DONE; code does not support this claim. |
| N-14 | Backdated form silent multi-set backdating | ✅ CLOSED — `SetTrackerPage.qml` confirms `property bool logUseNow: true` (line 178) and `page.logUseNow = true` reset at line 186 after log. Fix is structurally present. |

---

## SECTION 2 — NEW ISSUES FOUND IN THIS ITERATION

---

### Z-01 — CRITICAL: `workouts.js` GET route is truncated — only POST endpoint present, no module.exports

**File:** `peak-fettle-agents/server/routes/workouts.js`
**Category:** Backend — fifth truncated file
**Line count:** 43 lines

`workouts.js` ends at line 43:

```javascript
router.get('/', async (req, res, next) => {
    try {
        const { from, to } = req.query;
       
```

The file ends here. **Everything after this line is absent:**
- The date range query and `pool.query(...)` call
- The JSON response
- `router.delete(...)` for DELETE /workouts/:id (N-13)
- `module.exports = router`

**Impact:** This is the fifth truncated backend file. The `require('./routes/workouts')` call in `index.js` will load a module with no exports (`undefined`), causing a runtime TypeError when the server attempts to register the route. Even if `index.js` were restored, this route file would silently fail. The POST route for creating workouts works in isolation but the GET (required for loading the workout history screen) and DELETE (N-13) are entirely absent.

**Note:** This file was not flagged as truncated in the 05-04 run. It was either truncated in the interim or was missed in the prior review scope. The POST route was present in the 05-04 session and the file's header appeared complete, but the truncation occurs mid-function body in the GET handler.

**Fix:** Restore the complete `workouts.js` including the GET route with date range filtering, GET /workouts/:id for single-workout retrieval, and DELETE /workouts/:id (resolving N-13 for workouts).

---

### Z-02 — HIGH: `WaitlistForm.tsx` is truncated — error state JSX never closes

**File:** `marketing-site/src/components/WaitlistForm.tsx`
**Category:** Marketing site — truncated component
**Line count:** 103 lines

`WaitlistForm.tsx` ends at line 103:

```tsx
                    {state === 'error' && (
```

The file ends here. The JSX expression opened by `{state === 'error' && (` is never closed. The `<div className={styles.errorMsg}>` child element, the error message text, and the closing `)}` are absent. This also means the enclosing `<form>` element and the outer conditional wrapper are never closed.

**Impact:** **This component will fail TypeScript compilation.** `next build` and `next lint` will both error. The marketing site cannot be deployed to Vercel in this state — the CI pipeline's `marketing` job (which runs `next lint` + `next build`) will fail at the marketing-site build step.

**Specific consequences:**
- The error state (`setState('error')`) fires on invalid email input and on network failure, but the UI has no way to display the error message
- Users who mistype an email get no visible feedback — the form silently refuses submission
- `next build` will exit with a TypeScript compile error, blocking any Vercel deploy

**Fix:** Restore the missing error display block. Based on `WaitlistForm.module.css` (`.errorMsg` is defined), the missing content is:

```tsx
                    {state === 'error' && (
                        <p className={styles.errorMsg} role="alert">
                            {message}
                        </p>
                    )}
                    <p className={styles.privacy}>
                        No spam — one email when your beta spot is ready.
                    </p>
                </form>
            )}
        </div>
    );
}
```

---

### Z-03 — MEDIUM: `globals.css` is truncated — `.container` rule is incomplete

**File:** `marketing-site/src/app/globals.css`
**Category:** Marketing site — truncated stylesheet
**Line count:** 53 lines

`globals.css` ends at line 53:

```css
.container {
    width: 100%;
    max-width: var(--max);
    margin-inline: auto;
    padding-i
```

The file ends mid-property — `padding-i` is the beginning of `padding-inline`. The closing `}` for the `.container` rule is absent, and the actual padding value is absent.

**Impact:** **The stylesheet is invalid CSS.** The browser will ignore the entire `.container` rule and potentially discard rules that follow (depending on the parser). `.container` is used on every section in `page.tsx` — hero, features, waitlist, footer, and the nav bar. Without the `padding-inline` property and the rule closure, all sections will render edge-to-edge with no horizontal padding on any screen size. This is a layout-breaking regression visible at all viewport widths.

**Fix:** Restore the complete `.container` rule:

```css
.container {
    width: 100%;
    max-width: var(--max);
    margin-inline: auto;
    padding-inline: clamp(1rem, 5vw, 2.5rem);
}
```

---

### Z-04 — LOW: `layout.tsx` uses deprecated Next.js metadata fields — build warnings

**File:** `marketing-site/src/app/layout.tsx`
**Category:** Marketing site — deprecation warning
**Severity:** Low (warning, not error in current Next.js)

`layout.tsx` exports `themeColor` and `viewport` inside the `metadata` object:

```typescript
export const metadata: Metadata = {
    ...
    themeColor: '#06080F',
    viewport:   'width=device-width, initial-scale=1',
};
```

Since Next.js 13.4, `themeColor` and `viewport` must be exported from a separate `viewport` export, not embedded in `metadata`. The Metadata type still accepts them for backward compatibility but emits deprecation warnings during `next build`.

**Impact:** `next build` will succeed but emit warnings that will appear in CI logs and Vercel build output. These will be mistaken for errors by engineers reading logs casually, and they will escalate into actual build errors in a future Next.js major version.

**Fix:** Move both fields to a separate `viewport` export:

```typescript
import type { Metadata, Viewport } from 'next';

export const viewport: Viewport = {
    themeColor: '#06080F',
    width: 'device-width',
    initialScale: 1,
};

export const metadata: Metadata = {
    // ... (themeColor and viewport removed)
};
```

---

### Z-05 — LOW: Waitlist API has no duplicate email guard — same address can be added multiple times

**File:** `marketing-site/src/app/api/waitlist/route.ts`
**Category:** Marketing site — UX/data quality
**Severity:** Low

`POST /api/waitlist` validates the email format and sends two Resend emails but performs no deduplication check. A user who submits the form twice (e.g., after a network delay causes them to retry) will receive two confirmation emails and generate two founder-notification emails.

**Impact:** At small scale this is a minor annoyance. At medium beta-signup volume (100+ signups with retry behavior), the founder inbox will accumulate duplicate notifications and the subscriber list will be noisy. There is no Phase B database table for waitlist emails (roadmap notes this is Phase D work), so deduplication via DB is unavailable.

**Fix:** Short-term: add a simple in-memory Set or a Resend Audience upsert call. Long-term: add the `waitlist_emails` table as part of Phase D. Minimum viable fix is a 409 response with the same success message when the same email is re-submitted (to avoid revealing whether an address exists, use the same success copy regardless).

---

## SECTION 3 — WHAT SHIPPED CORRECTLY IN THIS ITERATION

The following changes since the 05-04 run are confirmed correct:

- **X-06 (streak counter cap)** — `HomePage.qml` line 53 uses `recentSets(2000)`. The roadmap entry for this fix is the only Sprint 1–5 claim verified as accurate in code. Fix is correct.
- **T-09/T-10/T-11/T-12 (landing.html)** — All four landing page fixes confirmed present and correctly implemented in `landing.html`. These fixes are for the standalone marketing page, separate from the Next.js marketing-site.
- **N-14 (backdated form reset)** — `logUseNow` property and reset logic present in `SetTrackerPage.qml`. Structurally correct.
- **Prior confirmed closures** — N-01, N-04, N-05, N-09, N-15, X-05, BUG-01, FEAT-01 are all confirmed closed in code and remain closed.

---

## SECTION 4 — WORKFLOW COORDINATOR RANKING

*All open issues (prior + new) unified into a single ranked list for executive context.*

### Master Ranked Issue List — 2026-05-05

| Rank | ID | Category | Description | Severity | Change from 05-04 |
|------|----|----------|-------------|----------|--------------------|
| 1 | X-01 | Backend — BROKEN FILE | `requireAuth.js` still 12 lines — server cannot start | 🔴 P0 | CARRIED — NOT FIXED |
| 2 | Y-01 | Backend — BROKEN FILE | `index.js` still 29 lines — no routes, no middleware, no app.listen() | 🔴 P0 | CARRIED — NOT FIXED |
| 3 | X-02 | Backend — BROKEN FILE | `auth.js` still 89 lines — login truncated mid-handler, no refresh/logout | 🔴 P0 | CARRIED — NOT FIXED |
| 4 | X-03 | Backend — BROKEN FILE | `sets.js` still 75 lines — GET route absent, no module.exports | 🔴 P0 | CARRIED — NOT FIXED |
| 5 | Z-01 | Backend — BROKEN FILE | `workouts.js` newly confirmed 43 lines — GET route truncated, no module.exports | 🔴 P0 | NEW |
| 6 | T-01 | Security | JWT refresh-token rejection — blocked by X-01 | 🔴 P0 | CARRIED |
| 7 | T-02 | Security | No logout/refresh endpoint — blocked by X-02 | 🔴 P0 | CARRIED |
| 8 | Y-02 | Qt/C++ — BROKEN FILE | `exercise.cpp` still 39 lines — estimatedOneRepMax() has no body; build fails | 🔴 HIGH | CARRIED — NOT FIXED |
| 9 | Z-02 | Marketing site — BROKEN FILE | `WaitlistForm.tsx` truncated at 103 lines — error state JSX missing; next build fails; marketing deploy blocked | 🔴 HIGH | NEW |
| 10 | Z-03 | Marketing site — BROKEN FILE | `globals.css` truncated at 53 lines — .container rule incomplete; all page sections render without horizontal padding | 🔴 HIGH | NEW |
| 11 | N-11 | Security | Rate limiting on /auth — import present, configuration absent (index.js truncated) | 🔴 HIGH | CARRIED — WORSENED |
| 12 | N-12 | Backend | CORS fix described in comment only — index.js truncated | 🟠 HIGH | CARRIED — WORSENED |
| 13 | N-06 | Qt/C++ | Ghost exercise buckets after rename — no editSet() pruning in ExerciseLibrary.cpp | 🟠 HIGH | CARRIED — NOT FIXED |
| 14 | N-13 | Backend | No DELETE endpoints — sets.js and workouts.js both truncated before DELETE routes | 🟡 MEDIUM | CARRIED — WORSENED (second truncated file confirmed) |
| 15 | T-08 | Backend | GET /sets cursor pagination — blocked by X-03 | 🟡 MEDIUM | CARRIED |
| 16 | Y-03 | Database | exercise_prs stale PR rows on set-delete or weight-edit-downward | 🟠 MEDIUM | CARRIED |
| 17 | Z-04 | Marketing site — Deprecation | layout.tsx uses deprecated themeColor/viewport in metadata — build warnings | 🟡 LOW | NEW |
| 18 | Z-05 | Marketing site — UX | Waitlist API no duplicate email guard | 🟡 LOW | NEW |
| 19 | Y-04 | Database | cosmetic_items missing write-guard comment | 🟡 LOW | CARRIED |

**Closed since 05-04 (removed from list):** X-06, T-09, T-10, T-11, T-12, N-14.

---

## SECTION 5 — EXECUTIVE BRIEF

*Prepared for: CEO, CTO, Product Manager*
*Prepared by: Workflow Coordinator (automated run — pf-tester-prompts, 2026-05-05)*

---

### Overall Status: Five broken backend files. The marketing site cannot be deployed. The DEV_ROADMAP_2026-05-05 (v7) completion claims are inaccurate — Sprint 1 was NOT completed.

---

### For the CTO — Five broken backend files; marketing site also non-deployable; roadmap verification failure

**The file-truncation count has grown to five.** `workouts.js` is newly confirmed truncated (GET route absent, no module.exports). The four files reported broken in the 05-04 run — `index.js`, `requireAuth.js`, `auth.js`, `sets.js` — are byte-for-byte identical to their broken 05-04 states. The overnight pf-1am-dev-ops session that the roadmap credits with restoring all four files does not appear to have written any changes to disk. The restoration either failed silently, was written to a wrong path, or was not executed.

**The roadmap verification process failed.** The v7 roadmap states "Verified by: reading all three files via file tooling; all functions present and correct." The actual file contents contradict this. The verification tooling or session produced a false positive. Before the next dev session, the team should understand why the tooling reported these files as restored when they were not.

**The marketing site cannot be deployed.** Two new truncations were found in the marketing-site source: `WaitlistForm.tsx` ends mid-JSX (TypeScript compile error; `next build` will fail) and `globals.css` ends mid-property (broken stylesheet; all page sections render without horizontal padding). The CI pipeline's `marketing` job will fail at build time. Vercel deployment is blocked until both are restored.

**Immediate restoration priority order:**

Backend (treat as single PR):
1. `index.js` — cors config, middleware, all route registrations, app.listen()
2. `requireAuth.js` — Bearer extraction, jwt.verify(), T-01 fix bundled
3. `auth.js` — complete login handler + /auth/refresh + /auth/logout (T-02 bundled)
4. `sets.js` — GET route with cursor pagination + DELETE /sets/:id (T-08 + N-13 bundled)
5. `workouts.js` — GET route with date range + DELETE /workouts/:id (N-13 bundled)

Marketing site (treat as single PR):
1. `WaitlistForm.tsx` — restore closing error state JSX (4–7 lines)
2. `globals.css` — restore padding-inline and closing brace on .container

Qt:
1. `exercise.cpp` — restore estimatedOneRepMax() function body (Y-02)

**N-06 (ghost exercise buckets after rename) remains the only unremedied Qt bug from the original high-priority list.** It has now persisted across four consecutive tester runs without being touched.

---

### For the CEO — No external progress is achievable until file truncations are resolved

The beta backend has been non-functional for three consecutive sprint cycles. The marketing site, previously identified as the fastest path to any external-facing progress, is now also broken and non-deployable due to two new truncations introduced this sprint. There is currently no user-facing surface in a shippable state.

The six items closed in this sprint (X-06, T-09 through T-12, N-14) represent real progress and the underlying feature work quality remains strong. The data model, migrations, and Qt feature implementations are well-built. The systemic issue is specifically file write truncation — a tooling or process problem, not an engineering competence problem.

The most actionable executive decision is to mandate a dedicated "restore only" session with no new feature work, followed by a mandatory smoke test (server starts, login returns tokens, GET /workouts returns data) before any further sprint work is logged as complete.

---

### For the PM — Roadmap v7 must be treated as unreliable; recommend a code-first verification protocol

The v7 roadmap's Sprint 1 completion claim is incorrect. The recommended process change: no sprint may be marked complete in the roadmap unless a tester run (this automated task) has independently verified the file contents *after* the dev session ends. The dev session should not self-verify its own completions — the 05-05 situation is a case study in why.

Recommended protocol going forward:
1. Dev session makes changes → commits
2. pf-tester-prompts runs automatically within the same session window
3. Roadmap updated by workflow coordinator only after tester confirms closure

For the Phase B deployment unblock: the two marketing-site files (WaitlistForm.tsx, globals.css) are small enough to fix in under 10 minutes. Prioritizing these alongside the backend restoration would unblock the Vercel deploy and give the company its first public-facing presence.

Phase C (TICKET-016–020, Group Streak Credits) remains correctly deferred. No Phase C work should begin until the server is confirmed running.

---

*Report generated automatically by the pf-tester-prompts scheduled task.*
*Run date: 2026-05-05.*
*Next recommended run: after dev team restores index.js, requireAuth.js, auth.js, sets.js, workouts.js (backend), WaitlistForm.tsx + globals.css (marketing site), and exercise.cpp (Qt).*
*Verification method: wc -l and tail on all restored files; confirm app.listen(), jwt.verify(), refresh/logout routes, GET /sets, GET /workouts, and complete WaitlistForm JSX tree are present in code.*
