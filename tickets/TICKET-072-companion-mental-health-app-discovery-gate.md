# TICKET-072 — Companion Mental-Health App: Discovery & Approval Gate
**Owner:** Coordinator + founder (approval); build agents AFTER sign-off only
**Date opened:** 2026-05-29
**Phase:** N — New Product (gated; does NOT start until the Revision phase is healthy AND the founder approves the pitch)
**Source:** Founder directive 2026-05-29 ("a new companion app must be formulated as a mental health application … pitched to me prior to the work beginning").

---

## Goal
Stand up the **companion mental-health app** as a pitched, approved plan — **not** as code. A full proposal has been written (`COMPANION_APP_PITCH_2026-05-29.md`). This ticket tracks the decision gate and, only after approval, the breakdown into build tickets.

## Founder decisions already captured (2026-05-29)
- **Architecture:** standalone app, **shared Peak Fettle backend** (reuses auth/DB/subscriptions).
- **Access:** **bundled into the existing paid tier** (paid subscribers get it free).
- **Positioning:** **light evidence-based** (CBT / mindfulness) — non-clinical, but requires disclaimers + crisis resources.
- **Core scope:** screen-time awareness, habit tracking & streaks, mood check-ins, guided exercises/journaling.

## Acceptance criteria (this gate ticket)
1. `COMPANION_APP_PITCH_2026-05-29.md` is reviewed by the founder; outstanding choices in its "Open questions" section are answered (logged in `OPEN_QUESTIONS_FOR_FOUNDER.md`).
2. **No app code, schema, or infra is created until the founder explicitly approves the pitch.** (Hard gate — restated per the directive.)
3. On approval, the pitch's phased plan is expanded into build tickets (proposed TICKET-073…0xx) with the same house format, each carrying the safety requirements below.
4. **Safety is a first-class, non-negotiable requirement** of every downstream build ticket: visible crisis resources (e.g. 988 Suicide & Crisis Lifeline in the US, with locale-aware equivalents), a clear "not a substitute for professional care" disclaimer, no features that could reinforce self-harm, and sensitive-data privacy handling reviewed via the `legal` + `security-guidance` tools.
5. Entitlement: a shared-backend flag grants companion access to current paid subscribers; spec'd, not yet built.

## Implementation plan (post-approval only)
- Expand pitch → tickets; reuse Peak Fettle auth + the (now-hardened, TICKET-065) push pipeline.
- `frontend-design` for UI, `legal` for disclaimers/policy, `security-guidance` + `/security-review` for the sensitive data path.

## Test plan
- Gate check: confirm no companion code exists in the repo before approval is recorded here.
- Post-approval tickets carry their own test plans.

## Notes
- Sequencing: the Revision phase (TICKET-064…070) should be healthy before net-new product work begins, so we build the companion app on a sound base rather than compounding existing debt.
