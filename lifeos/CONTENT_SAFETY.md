# Life OS — Content Safety Rules (TICKET-100)

*Binding checklist for every content/UI PR in `lifeos/`. Extends the original
M-073 rules to the Life-OS scope (founder decisions Q15–Q31, 2026-06-11).
A PR that violates any rule here does not merge.*

## 1. Positioning (Q16)

- This is a **Life OS** — focus, habits, goals, direction. It is **never**
  described as a mental-health app, therapy, treatment, or diagnosis — not in
  copy, App Store listing, notifications, or marketing.
- The app may say it helps with *focus, consistency, direction, and screen-time
  habits*. It may not claim to treat, cure, or improve any clinical condition.

## 2. Crisis & disclaimer (non-negotiable)

- `CrisisResourcesBanner` renders automatically after any mood check-in ≤ 2/5
  and is permanently reachable from the You tab ("Need help?"). It is never
  gated, A/B-tested, or placed behind engagement mechanics.
- The onboarding disclaimer requires explicit acknowledgement before any other
  screen: a wellbeing/self-improvement tool, not a substitute for professional
  care.
- Crisis copy and numbers in `src/content/crisis.ts` are **PENDING FOUNDER
  REVIEW** (Q9). Founder sign-off recorded here before any store build:
  - [ ] Crisis copy + numbers reviewed and approved by founder — date: ______

## 3. No punishment mechanics (Q19, Q23)

- Forgiving streaks only: rest/skip days exist, a single miss never hard-resets,
  copy never shames ("Pick it back up today", never "You broke your streak").
- **No money stakes** anywhere in blocking or habits.
- Unlock friction must always have an escape route visible on the same screen
  ("Never mind, keep it blocked" — the user is never trapped in a wait).
  The only sanctioned exception is the opt-in Deep Focus strict mode
  (TICKET-112, v1.1), which gets its own informed-consent review.
- Blocking can always be disabled from inside the app's settings (non-strict).

## 4. Direction-engine output boundaries (Q27)

The deterministic protocol engine (`src/engine/directionModel.v1.ts`) may only
emit **behavioral protocols**: habit/stack templates, time allocations,
practice structures, milestone ladders, exercise/content matches, blocker
suggestions. Banned output classes — enforced by unit tests in
`__tests__/direction-model.test.js`:

1. Investment, trading, or financial-product advice of any kind. Finance
   protocols are behavioral only (automation cadence, tracking rituals,
   review habits).
2. Medical, diet, supplement, or training prescriptions (training direction
   belongs to the fitness app).
3. Relationship directives framed as therapy or couples counselling.
   Relationship protocols are behavioral only (connection rituals, response
   habits).
4. Anything that diagnoses, scores, or labels the user's mental state.
5. Any string not sourced from a reviewed template in `src/content/protocols/`
   — no free string assembly that could produce un-reviewed claims.

## 5. Data honesty (Q30)

- We state factually: data lives on-device; backups are end-to-end encrypted;
  the server stores auth, an entitlement flag, and unreadable blobs.
- No absolute promises ("no one can ever…") — describe the mechanism, not a
  guarantee.
- Screen-time data **cannot leave the device** (OS-enforced). Never imply we
  collect or analyze it server-side; never design a feature that needs to.

## 6. Notifications (Q19/TICKET-110)

- All opt-in, default off. Max 2/day across all Life OS types.
- Reminder copy is forward-looking, never references missed days.

## 7. Review log

| Date | Item | Reviewer | Status |
|------|------|----------|--------|
| 2026-06-11 | Initial rules committed | agent (Fable 5) | drafted |
| — | Crisis copy (src/content/crisis.ts) | FOUNDER | **PENDING** |
| — | Protocol templates (src/content/protocols/) | FOUNDER | **PENDING** |
| — | Exercise library copy (src/content/exercises.ts) | FOUNDER | **PENDING** |
