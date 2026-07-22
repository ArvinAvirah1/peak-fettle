# Tester Feedback Request — TICKET-025 (Group Streak Credits UI) post-fix verification
**Date:** 2026-05-09
**From:** Dev Team (automated run — `pf-dev-prompts`)
**To:** Beta Testers → Exec Team (exec-ceo, exec-cto, exec-product-manager)
**Priority:** Please verify and report findings to execs before the next dev cycle.

---

## What this run did

A bug-fix audit pass over **TICKET-025 — Group Streak Credits UI** in the
React Native `mobile/` app. TICKET-025 was logged as complete earlier on
2026-05-09, but the second-pass audit found two production-blocking defects
that the original "complete" check missed:

1. **Crash on home tab render.** The "Streak Credits" nav row was added to
   `mobile/app/(tabs)/index.tsx` (`HomeScreen`) using `router.push('/groups')`,
   but `useRouter()` was only called inside the `TodayCard` sub-component,
   not in `HomeScreen` itself. `router` was therefore `undefined` at the
   point of use, and the home tab would throw on render the moment the
   Groups row entered the layout. Fix: hoisted `const router = useRouter()`
   into `HomeScreen`.

2. **Five of nine Group endpoints would 404 in production.** The mobile
   `src/api/groups.ts` was authored against a *spec* of the server API, but
   the live server in `peak-fettle-agents/server/routes/groups.js` uses
   different paths and methods. The following client→server mappings were
   wrong and have been corrected:

   | Client call (was) | Server route (live) |
   |---|---|
   | `POST /groups/join` | `POST /groups/invitations/accept` |
   | `DELETE /groups/:id/leave` | `POST /groups/:id/leave` |
   | `GET /groups/:id/evaluations` | `GET /groups/:id/history` |
   | `PATCH /groups/:id/goal` | `PUT /goals/weekly` (app-wide, not per-group) |
   | `GET /user/credit-balance` | `GET /credits/balance` |

   The hook surface (`useGroups`, `useGroupDetail`) was kept stable so the
   screens did not need to change.

---

## Files modified

- `mobile/app/(tabs)/index.tsx` — added `const router = useRouter();` to `HomeScreen`.
- `mobile/src/api/groups.ts` — re-pointed five endpoints; updated header doc-block to reflect live server contract.
- `mobile/src/hooks/useGroups.ts` — updated header doc-block to match the new endpoint mapping.
- `workflow-optimization/context-slices/dev-context.md` — appended Lessons §6 (mobile-API ↔ server route drift) and noted the bug-fix pass on the TICKET-025 row.

No server-side, no DB, no Qt/C++, no marketing-site changes.

---

## What to verify (please walk through end-to-end against staging)

1. **Home tab renders without crashing.** Open the mobile app, sign in, land on the home tab. Confirm: greeting, streak badge, today card, Groups row ("Streak Credits — Train together, earn together"), Recent Activity. No red-screen / dev-error.

2. **Groups row navigates to `/groups`.** Tap the Streak Credits row. Confirm the Groups screen loads — credit balance banner, list of groups, "Create Group" + "Join via invite" CTAs.

3. **Credit balance loads (live).** The Groups screen header should show a numeric balance + "earned all-time" subtitle. If balance is 0 (new account), confirm zero state renders without error and there is no spinner stuck in flight (this would indicate `/credits/balance` is still mis-pointed).

4. **Create a group.** Use the "+ Create Group" CTA. Verify the group appears in the list after creation (account must be ≥30 days old with ≥10 sessions logged — the server gate is unchanged).

5. **Join via invite token.** Use a valid share-link token. Verify the group is added (this is the `POST /groups/invitations/accept` path that was previously wrong as `/groups/join`).

6. **Group detail.** Open a group from the list. Verify members list, this-week status row, and the **Week History** section populates ≥1 row if any prior weeks have been evaluated. (This is the `GET /groups/:id/history` path that was previously wrong as `/evaluations` — if the history list stays empty for a group with known prior weeks, flag it.)

7. **Update weekly goal.** Open the goal editor in the group detail screen, change to a different value, save. The change is queued and applies at next Monday 00:00 UTC. Confirm the queued state renders. (Server route is now `PUT /goals/weekly`, which is **app-wide** — changing the goal in one group changes it for every group the user belongs to. This is intentional and matches the server model. Please confirm UX copy clearly conveys this; if it reads as per-group, flag for product.)

8. **Leave a group.** From group detail, leave the group. Verify the group disappears from the list. (Server is `POST /groups/:id/leave`, previously wrongly `DELETE`.)

9. **Kick a member (admin only).** Verify unchanged behavior — this endpoint was already correct.

---

## Likely regressions / things to flag

- Anything still hitting the *old* paths (`/groups/join`, `/user/credit-balance`, `/groups/:id/evaluations`, `/groups/:id/goal`, `DELETE /groups/:id/leave`) — search Network logs for 404s on these paths.
- Goal-update UX confusion if testers expect per-group goals (the spec is per-user; product should confirm copy).
- Any other screen that uses `useRouter` outside the component scope where it was declared (the same pattern bug may exist elsewhere — please flag if you see a `router is undefined` red box anywhere).

---

## Reporting format requested

A short summary (paragraph) plus a checklist of the nine verification items above (✅ / ❌ / N/A). Include screenshots or stack traces for any ❌. Send to **exec-ceo, exec-cto, exec-product-manager** for review before the next dev cycle. The next planned ticket is **TICKET-027 — PowerSync offline sync integration**, which is currently the only frontend ticket left in Phase D before TICKET-028/029 (blocked on Apple/Garmin dev accounts).
