# Peak Fettle — Development Roadmap (v12)
**Date:** 2026-05-16
**From:** Workflow Coordinator (exec synthesis)
**Status:** ACTIVE — supersedes v11 (`DEV_ROADMAP_2026-05-14.md`)
**Source inputs:**
- `DEV_ROADMAP_2026-05-14.md` (v11) — carried forward
- `pf-tester-feedback-2026-05-16.md` — Mock-Removal + Type/Filter sprint findings
- `dev-context.md` — Phase E kickoff entries (E-001, E-001b, E-002 complete)
- Exec decisions captured 2026-05-16 (parallel E-004/E-005, P2 bundled into Phase E, Phase 1 ticketing begins)

---

## Executive Summary

The Hotfix, Pre-Launch Data Integrity, and Mock-Removal sprints are all complete. Every P0 and P1 bug from the v11 roadmap is closed. Phase D is complete except for TICKET-028 (Apple Watch) and TICKET-029 (Garmin), both hard-blocked on Apple/Garmin dev account provisioning — these are independent of all other work.

Phase E (Mobile Visual Design & Experience Overhaul) kicked off today. The design token system (E-001/E-001b) and theme switcher (E-002) are live. The remaining seven tickets (E-003 through E-009) are the primary dev focus. **Key exec decision:** E-004 (component library) and E-005 (screen layout) will run in parallel across two frontend devs. The four queued P2 bugs are bundled into Phase E rather than a separate sprint. Phase 1 product items are to be ticketed and built in parallel where they don't touch the mobile frontend.

EAS Build setup remains the outstanding infrastructure blocker — TICKET-025 human verification and TICKET-027 PowerSync sign-off cannot proceed without a working EAS dev build.

---

## 1. Phases A–C — CLOSED ✅
No changes.

---

## 2. Phase D — CLOSED (except dev-account-blocked tickets)

| Ticket | Description | Status |
|--------|-------------|--------|
| TICKET-016–027 | All RN app tickets | ✅ COMPLETE |
| TICKET-030–042 | 1RM confirmation, percentile v2, experience graduation | ✅ COMPLETE |
| TICKET-028 | SwiftUI Apple Watch companion | 🔲 BLOCKED — Apple dev account |
| TICKET-029 | Garmin Connect IQ integration | 🔲 BLOCKED — Garmin dev account |

TICKET-028 and TICKET-029 can proceed the moment dev accounts are provisioned. They are on the critical path to nothing else.

---

## 3. Sprints — CLOSED ✅

| Sprint | Status |
|--------|--------|
| Hotfix Sprint (BUG-001, BUG-002, BUG-003) | ✅ COMPLETE (2026-05-15) |
| Pre-Launch Data Integrity Sprint (BUG-004, BUG-005, BUG-006) | ✅ COMPLETE (2026-05-15) |
| Phase D Quick-Fix Sprint (AA-01, AA-02, AA-03, Z-04, Z-05) | ✅ COMPLETE (2026-05-11) |
| Mock-Removal + Type/Filter Hotfix Sprint (MOCK-001, MOCK-002, TYPE-001, EPLEY-001) | ✅ COMPLETE (2026-05-16) |

---

## 4. Phase E — Mobile Visual Design & Experience Overhaul (IN PROGRESS)

**Spec source:** `peak_fettle_design_spec.docx` (UI/UX Overhaul Design Spec v1.0)
**Theme:** Dark navy (#0A0E1A) × turquoise (#00D4C8). 5 switchable themes.
**Token architecture:** 3-tier: Primitive → Semantic → Component. Only Primitive changes between themes.

**Exec decisions locked (2026-05-16):**
- **E-OD-1 (Typeface):** System fonts (SF Pro / Roboto). No custom font.
- **E-OD-2 (Brand intro):** Keep existing 1.8s splash. No animated loop.
- **E-OD-3 (Charts):** Victory Native XL (Skia-based).
- **E-OD-4 (Light mode):** Dark-first only in Phase E. Light mode → Phase F.
- **E-OD-5 (E-004 / E-005 parallelism):** E-004 (component library) and E-005 (screen layout) run in parallel across two frontend devs. Dev A owns E-004; Dev B owns E-005. E-005 uses stub component contracts until E-004 lands; a one-day integration pass closes the gap.
- **E-OD-6 (P2 bugs):** BUG-007 through BUG-010 are bundled into Phase E rather than a separate sprint. BUG-010 (contrast) resolves naturally inside E-008.

### Phase E Ticket Status

| Ticket | Owner | Description | Status |
|--------|-------|-------------|--------|
| E-001 | Frontend | Design token system — TypeScript interfaces, 5 theme primitives, ThemeContext + useTheme() hook, AsyncStorage persistence. ThemeProvider wired in `_layout.tsx`. | ✅ COMPLETE (2026-05-16) |
| E-001b | Frontend | Color migration — 470+ hardcoded hex values replaced with semantic token references across all `.tsx` files. | ✅ COMPLETE (2026-05-16) |
| E-002 | Frontend + Backend | Theme switcher — `migrations/20260516_theme_preference.sql`, `PATCH /user/profile` extended, ThemeSelector component (inline + modal variants), Supabase persistence. | ✅ COMPLETE (2026-05-16) |
| E-003 | Frontend | **Typography system** — apply type scale from spec §3 to all screens. Remove all ad-hoc `fontSize` values. Define `fontWeight`/`lineHeight`/`letterSpacing` constants in `tokens.ts` (already scaffolded). | 🔲 open — **START HERE** |
| E-007 | Frontend | **Onboarding theme step** — wire ThemeSelectorInline as Step 3 of `onboarding.tsx`. `ThemeSelector.tsx` already built; this is a 1–2 hour wire-up. Cheapest remaining ticket. | 🔲 open — **START SECOND (quick win)** |
| E-004 | Frontend (Dev A) | **Component library rebuild** — buttons (5 variants), cards (4 types), inputs, progress indicators, Victory Native XL charts. Runs **parallel** to E-005. | 🔲 open |
| E-005 | Frontend (Dev B) | **Screen layout overhaul** — apply spec §6 to all 8 primary screens. Spacing grid, safe areas, responsive margins. Uses stub component contracts until E-004 integration pass. Runs **parallel** to E-004. | 🔲 open |
| BUG-007 | Frontend | Rankings copy: EmptyState says "every Monday", `COHORT_NOTE` says "Sunday 03:00 UTC". Align to "every Sunday night". Bundle into E-005 screen pass (Rankings screen). | 🔲 open — bundle into E-005 |
| BUG-008 | Frontend | Option C 1RM confirmation state disappears on restart. Fix: derive confirmed state from `ranking.confirmed_1rm_kg` API response instead of in-memory `useState`. Bundle into E-005 Rankings screen pass. | 🔲 open — bundle into E-005 |
| BUG-009 | Backend | JS `yearsBand()` uses `'3-5'`/`'5+'`; SQL uses `'3-7'`/`'7+'`. Fix helper + add unit test. Small, can run any time — assign to whoever is between tickets. | 🔲 open |
| BUG-010 | Frontend | Option B estimated-max banner: purple `#a78bfa` on brown `#1c1917` fails WCAG AA. Fix: change to `#f8fafc` or `#fef3c7`. **Resolves automatically inside E-008 contrast audit** — close BUG-010 when E-008 lands. | 🔲 open — close via E-008 |
| E-006 | Frontend | **Motion & haptics** — animation timings + haptic patterns per spec §7. Reduce Motion fallbacks required. | 🔲 open |
| E-008 | Frontend + QA | **Contrast & accessibility audit** — WCAG 2.1 AA across all 5 themes. 48×48 pt touch targets. VoiceOver + TalkBack labelling. Closes BUG-010. | 🔲 open |
| E-009 | Frontend + Design | **Design QA sprint** — 1-week cycle vs. `peak_fettle_design_spec.docx`. Close all P0 visual deltas. | 🔲 open |

### Phase E Key Files (Reference)

| File | Purpose |
|------|---------|
| `mobile/src/theme/types.ts` | PrimitiveTokens, SemanticTokens, ComponentTokens, Theme, ThemeName interfaces |
| `mobile/src/theme/tokens.ts` | 5 theme primitives + semantic/component builders + spacing/radius/fontSize/motion/a11y constants |
| `mobile/src/theme/ThemeContext.tsx` | React Context, useTheme() hook, AsyncStorage persistence, Supabase callback |
| `mobile/src/components/ThemeSelector.tsx` | 5-swatch picker — ThemeSelectorInline + ThemeSelectorModal; ready for E-007 wire-in |
| `migrations/20260516_theme_preference.sql` | Adds `users.theme_preference` with 5-value CHECK |

### Recommended Phase E Sequence

```
E-003 (typography — 1 dev, ~0.5 days)
  → E-007 (onboarding theme step — same dev, ~2 hrs)
  → [E-004 ∥ E-005] (component library + screen layouts — 2 devs in parallel)
      BUG-007 + BUG-008 bundle into E-005 (Rankings screen)
      BUG-009 anytime (backend, independent)
  → E-004/E-005 integration pass (1 day — Dev B retrofits E-004 components into E-005 screens)
  → E-006 (motion + haptics)
  → E-008 (contrast + a11y audit — closes BUG-010)
  → E-009 (design QA sprint)
```

---

## 5. EAS Build — BLOCKING (Infrastructure)

**Status:** ⚠️ NOT YET CONFIGURED. This is the single highest-priority infrastructure action.

| Dependency chain | Status |
|---|---|
| EAS Build configured | 🔲 **REQUIRED — user action** |
| TICKET-025 human staging verification | ⏳ AWAITING EAS BUILD |
| TICKET-027 PowerSync sign-off | 🔲 BLOCKED on TICKET-025 |

**Steps:**
```bash
npm install -g eas-cli
eas login
eas build --profile development --platform ios
```
Once the `.ipa` link is ready, send the TICKET-025 tester prompt.

**Note:** Expo Go is permanently not viable — PowerSync's native module is incompatible. EAS Build is the only path to device testing.

---

## 6. Phase 1 Product Items — NOW TICKETING (Parallel to Phase E)

Exec decision: these items are to be ticketed and built in parallel where they don't require the Phase E mobile frontend to be complete. Backend and product items can proceed immediately.

| Item | Description | Frontend dependency | Status |
|------|-------------|---------------------|--------|
| 1.1 | Jargon Glossary & Contextual Tooltips (covers UX-001, UX-002) | ⚠️ Depends on E-004 component library | 🔲 TICKET REQUIRED |
| 1.2 | Onboarding Survey Redesign (3-question fast track + optional deep-dive) | ⚠️ Depends on Phase E screens | 🔲 TICKET REQUIRED |
| 1.3 | Rest Day Designation (3-state streak: logged / rest / missed) | Backend can be built now; frontend waits on E-005 | 🔲 TICKET REQUIRED |
| 1.4 | Streak Messaging Overhaul (encouragement-first, proactive make-up window — also covers UX-005) | ⚠️ Frontend component; wait for E-004 | 🔲 TICKET REQUIRED |
| 1.5 | Free-to-Paid Value Demo (contextual upgrade prompt at session 5) | Backend paywall trigger can be built now | 🔲 TICKET REQUIRED |
| 1.6 | Percentile System Architecture (confirmed applied in TICKET-035) | ✅ Already done — close as complete | ✅ CLOSE |

**Build now (no Phase E frontend dependency):**
- 1.3 backend — streak DB schema for 3-state (logged / rest / missed), REST endpoint
- 1.5 backend — session-count trigger, paywall event logic

**Wait for Phase E frontend:**
- 1.1, 1.2, 1.4 — assign once E-004 component library is stable

---

## 7. P3 / Post-Launch Queue (Carry-Forward)

Not blocking launch. Address in the first post-launch sprint.

| ID | Area | Description |
|----|------|-------------|
| BUG-011 | Mobile | "Confirm estimated maxes" toggle not surfaced in Settings — verify `use_1rm_confirmation` exposed |
| BUG-012 | API | `GET /percentile/lift/:liftId` alias not implemented — add passthrough |
| BUG-013 | Mobile | ConfirmSheet auto-close 1.4s too fast — increase to 2000ms; add "Done" button |
| UX-001 | Mobile | "RIR" label unexplained — add first-use tooltip |
| UX-002 | Mobile | "Weightlifting" vs "General Strength" ambiguous — add subtitle; rename "General Strength" → "Gym / General Fitness" |
| UX-003 | Mobile | ConfidenceRing tooltip too technical for free-tier users — add casual variant |
| UX-004 | Mobile | Empty Rankings state lacks action prompt — add "Log 3 workouts to unlock your first ranking" |
| UX-005 | Mobile | Streak philosophy not surfaced in-app — add during onboarding or first streak display (covered by 1.4 streak messaging overhaul) |

---

## 8. Infrastructure

| Item | Status | Notes |
|------|--------|-------|
| GitHub repo (`ArvinAvirah1/peak-fettle`) | ✅ DONE | Private, branch `main` |
| GitHub Actions secrets | ✅ DONE | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` |
| `cleanup-orphaned-auth.yml` | ⚠️ PARTIAL | Failing — Supabase IPv6 DB connection issue. Check `status.supabase.com` before retry. |
| Supabase DB password reset | 🔲 BLOCKED | IPv6 issue affects Supabase dashboard. External blocker. |
| EAS Build | 🔲 **IMMEDIATE ACTION REQUIRED** | See §5 above. |

---

## 9. Open Issue Register — Unified (as of 2026-05-16)

| Rank | ID | Severity | Description | Status |
|------|----|----------|-------------|--------|
| 1 | EAS Build | 🔴 INFRA | Not configured — blocks all mobile testing | 🔲 USER ACTION |
| 2 | TICKET-025 | 🟠 | Human staging sign-off for Group Streak Credits | ⏳ AWAITING EAS BUILD |
| 3 | TICKET-027 | 🟠 | PowerSync human verification | 🔲 BLOCKED on TICKET-025 |
| 4 | E-003 | Phase E | Typography system | 🔲 START HERE |
| 5 | E-007 | Phase E | Onboarding theme step (quick win) | 🔲 NEXT AFTER E-003 |
| 6–7 | E-004 / E-005 | Phase E | Component library + screen layout (parallel) | 🔲 |
| 8 | BUG-007 | P2 🟡 | Rankings copy Monday vs Sunday UTC | 🔲 bundle into E-005 |
| 9 | BUG-008 | P2 🟡 | 1RM confirmed state resets on restart | 🔲 bundle into E-005 |
| 10 | BUG-009 | P2 🟡 | `yearsBand()` mismatch vs SQL bands | 🔲 any time |
| 11 | BUG-010 | P2 🟡 | Contrast failure on Option B banner | 🔲 closes via E-008 |
| 12 | E-006 | Phase E | Motion + haptics | 🔲 after E-004/E-005 |
| 13 | E-008 | Phase E | Contrast + a11y audit (closes BUG-010) | 🔲 |
| 14 | E-009 | Phase E | Design QA sprint | 🔲 |
| 15–20 | 1.1–1.5 | Phase 1 | Product items — ticket now | 🔲 |
| 21 | TICKET-028 | Phase D | Apple Watch companion | 🔲 BLOCKED dev account |
| 22 | TICKET-029 | Phase D | Garmin integration | 🔲 BLOCKED dev account |
| 23 | cleanup-orphaned-auth | Infra | GitHub Actions DB conn | ⏳ EXTERNAL (Supabase IPv6) |
| 24–31 | BUG-011–UX-005 | P3 | Post-launch polish (8 items) | 🔲 POST-LAUNCH |

---

## 10. Recommended Action Order — Next Session

1. **E-003: Typography system** — apply type scale from design spec §3 to all screens. One dev, ~half day. Prerequisite for E-004 and E-005.
2. **E-007: Onboarding theme step** — wire ThemeSelectorInline as Step 3 of `onboarding.tsx`. Two hours, same dev who did E-003.
3. **[Parallel] E-004 + E-005** — two devs. Dev A: component library. Dev B: screen layout overhaul. BUG-007 and BUG-008 close inside E-005 Rankings screen pass.
4. **BUG-009** — assign to whoever is between tickets. Backend-only, XS effort.
5. **EAS Build setup** (user action) — `npm install -g eas-cli` → `eas login` → `eas build --profile development --platform ios`. Unblocks all mobile testing.
6. **TICKET-025 tester prompt** — once EAS `.ipa` is ready.
7. **Phase 1 backend items** — ticket and begin 1.3 (rest day DB + endpoint) and 1.5 (session-count trigger). Independent of Phase E frontend.
8. **E-004/E-005 integration pass** — 1 day after both parallels land. Dev B retrofits E-004 components into E-005 screens.
9. **E-006** — motion + haptics.
10. **E-008** — contrast + a11y audit. Closes BUG-010.
11. **E-009** — design QA sprint vs. spec.

---

*Roadmap v12 generated by workflow-coordinator — 2026-05-16.*
*Supersedes `DEV_ROADMAP_2026-05-14.md` (v11).*
*Source: `pf-tester-feedback-2026-05-16.md`, `dev-context.md` Phase E, exec decisions 2026-05-16.*
*Next recommended run: after E-003/E-007 complete and E-004/E-005 parallel is underway.*
