## Phase D Quick-Fix Sprint — 5 fixes, all verified

| ID | Severity | Fix |
|---|---|---|
| AA-01 | 🟠 MEDIUM | Added `cleanup-orphaned-auth.yml` GH Actions workflow (runs every 6h) — closes GDPR orphaned-auth gap left by failed `DELETE /user/account` calls |
| AA-03 | 🟡 LOW | `sets.js` Zod validation: reps min changed from 0 → 1, matching Qt client behavior |
| Z-04 | 🟡 LOW | `layout.tsx` deprecated `themeColor`/`viewport` fields moved to dedicated `export const viewport` — eliminates Next.js 14 build warnings |
| Z-05 | 🟡 LOW | Waitlist API: in-memory duplicate email guard added (10k LRU-style cap) — re-submitting the same address no longer triggers a second confirmation email |
| AA-02 | 🟡 LOW | `exercise_prs.sql` doc-block updated to document that on-disk storage is `weight_raw` (SMALLINT ÷ 8) and future triggers must use `(weight_raw / 8.0)` — documentation only, no behavioral change |

**Files changed:**
- `.github/workflows/cleanup-orphaned-auth.yml` *(new)*
- `peak-fettle-agents/server/routes/sets.js`
- `marketing-site/src/app/layout.tsx`
- `marketing-site/src/app/api/waitlist/route.ts`
- `migrations/20260503_exercise_prs.sql`

All five items sourced from `pf-tester-feedback-2026-05-10.md`. Zero open engineering issues after merge.
