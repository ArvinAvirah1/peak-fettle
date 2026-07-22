---
title: Group Streak Credits — Feature Spec
status: Draft v2 — 9/10 decisions ratified 2026-05-04; Decision 3 deferred pending cosmetic price list
owner: Arvin
last_updated: 2026-05-04
---

# Group Streak Credits — Feature Spec

## TL;DR

Users form small groups and earn cosmetic credits by hitting their personal weekly fitness goals together. The longer the group sustains week-over-week consistency, the more credits each member earns per successful week (compounding multiplier). When more than half the group misses their personal goal in a given week, the multiplier resets to base — credits already banked are kept; no clawback.

This document specifies behavior, data model, the weekly batch job, and economy. The cosmetic catalog itself is out of scope.

---

## 1. Locked decisions

These four were decided at spec time and should not be re-litigated without explicit owner approval:

- **Consistency = each user's own personal weekly goal.** Members do not need to share a workout target. The group is judged on what fraction of members hit their own goals.
- **Tick cadence = weekly.** Evaluation happens once per ISO week.
- **Failure rule = reset future earning only.** When >50% of active members miss their goal, the streak counter resets to 0 and the multiplier returns to base. Banked credits remain in the user's wallet. No clawback.
- **Group size = configurable by creator, hard-capped.** Creator picks any size from 2 up to a global cap (proposed 12 — see §10).

---

## 2. User experience

### Creating a group

The creator picks a name, a size cap (≤ global hard cap), and invites members by username or share-link. The creator becomes the group **admin**: they can kick members, update the name, and transfer the admin role. The group becomes **active** the moment a second member joins.

### Setting a personal goal

Each member sets a personal weekly goal (e.g., "4 workouts/week", "3 logged lifts/week"). The goal lives on the user, not the group — Peak Fettle already has per-user goals, so this spec reuses that subsystem rather than redefining it. Goals can be edited only at week boundaries (see §7).

### The weekly tick

At the end of each ISO week, the system evaluates whether each active member hit their personal goal. If more than 50% of active members hit their goal, the streak increments by 1 week and every member earns `base_credits × multiplier(streak_weeks)` credits in their wallet. If 50% or fewer hit, the streak resets to 0 and no credits are awarded that week.

### Spending credits

Credits live in a per-user wallet, not a group-pooled wallet. Members spend their own credits in the cosmetic shop. Wallet balances are derived from an append-only ledger (§4).

---

## 3. Decisions still open (flagged for product call)

The following were open at draft time. All have now been ratified except Decision 3, which is deferred pending the cosmetic price list. Calibration on §6 must happen against that price list before launch.

1. ~~Hard cap on group size~~ — **Ratified: 12 members.**
2. ~~Multiplier shape and ceiling~~ — **Ratified: `1 + 0.10 × streak_weeks`, cap 3.0× at 20 weeks.**
3. Base credit rate per successful week — proposed 50. **Deferred — must be calibrated against the cosmetic price list before launch.**
4. ~~Do members who personally missed their goal in a successful week still earn credits?~~ — **Ratified: yes, all active members earn on a successful week regardless of individual goal hit.**
5. ~~Concurrent group cap per user~~ — **Ratified: 3 groups.**
6. ~~Account-age and activity gate~~ — **Ratified: 30 days, ≥10 logged sessions.**
7. ~~Personal goal floor~~ — **Ratified: 1 workout/week minimum, with a goal-difficulty payout modifier (see §6).**
8. ~~Grace weeks for holidays/illness~~ — **Ratified: none in v1.**
9. ~~New-joiner multiplier~~ — **Ratified: first 2 weeks at 1.0× regardless of group streak state.**
10. ~~Group return-from-dormancy rule~~ — **Ratified: streak resets to 0 unless ≥2 prior active members re-engage in the same week.**

---

## 4. Data model (Supabase)

```sql
-- Group definition.
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  size_cap INT NOT NULL CHECK (size_cap BETWEEN 2 AND 12),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_streak_weeks INT NOT NULL DEFAULT 0,
  last_evaluated_week DATE  -- ISO week start (Monday) of most recent eval
);

-- Membership. One user may be in multiple groups (cap in §10).
CREATE TABLE group_memberships (
  group_id  UUID REFERENCES groups(id) ON DELETE CASCADE,
  user_id   UUID REFERENCES auth.users(id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at   TIMESTAMPTZ,
  status    TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'left' | 'kicked'
  PRIMARY KEY (group_id, user_id)
);

-- Per-week evaluation record. Idempotent audit row.
CREATE TABLE group_week_evaluations (
  group_id            UUID REFERENCES groups(id) ON DELETE CASCADE,
  week_start          DATE NOT NULL,
  eligible_members    INT  NOT NULL,
  members_hit_goal    INT  NOT NULL,
  streak_weeks_after  INT  NOT NULL,
  credits_per_member  INT  NOT NULL,  -- 0 on failure
  evaluated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, week_start)
);

-- Append-only credit ledger. Wallet balance is the sum.
CREATE TABLE credit_ledger (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id),
  amount      INT  NOT NULL,           -- + earned, - spent
  source      TEXT NOT NULL,           -- 'group_streak' | 'cosmetic_purchase' | ...
  group_id    UUID REFERENCES groups(id),
  week_start  DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE VIEW user_credit_balance AS
  SELECT user_id, COALESCE(SUM(amount), 0) AS balance
  FROM credit_ledger
  GROUP BY user_id;
```

Indexes: `(user_id, created_at)` on `credit_ledger`; `(status, group_id)` on `group_memberships`; `(last_evaluated_week)` on `groups` so the weekly job can scan candidates fast.

---

## 5. Weekly evaluation job

This is a batch job, in line with the project's existing pattern of batch-computed rankings. It runs once per week, Monday 00:05 UTC, evaluating the just-completed ISO week.

For each group with `current_streak_weeks IS NOT NULL` and at least 2 active members:

1. Snapshot the active membership (`status = 'active'` and `joined_at` ≤ Monday of the evaluated week — see §7 on the join rule).
2. For each member, query the existing personal-goal subsystem: did they hit their own weekly target for the evaluated ISO week?
3. Compute `members_hit_goal / eligible_members`. If > 0.50 → success; else → failure.
4. **On success:** increment `current_streak_weeks` by 1; compute the group-level factor `group_credits = base × multiplier(new_streak_weeks)`; then for each active member look up their personal weekly goal and apply the goal-difficulty modifier (see §6) to derive `member_credits = group_credits × goal_modifier(member_goal)`. Insert one `credit_ledger` row per active member at their individual `member_credits` amount. Insert a `group_week_evaluations` row — the `credits_per_member` field records the unmodified `group_credits` value (i.e., what a full-goal member would earn) as the canonical audit figure; per-member actuals are derivable from `credit_ledger`.
5. **On failure:** set `current_streak_weeks = 0`; insert `group_week_evaluations` row with `credits_per_member = 0`; no ledger writes.

The job is idempotent on `(group_id, week_start)` — replays don't double-credit because the evaluation row's primary key blocks a second insert.

---

## 6. Credit economy (proposed — calibrate before launch)

**Base rate:** 50 credits per member on a successful week.

**Multiplier:**

```
multiplier(streak_weeks) = min(1 + 0.10 × streak_weeks, 3.0)
```

| Streak weeks | Multiplier | Credits per member |
|---|---|---|
| 1 | 1.0× | 50 |
| 5 | 1.4× | 70 |
| 10 | 2.0× | 100 |
| 20+ | 3.0× | 150 (cap) |

**Why a cap:** unbounded compounding at any positive rate eventually trivializes cosmetic prices. A 20-week ceiling rewards a long, dedicated streak without producing runaway inflation.

**Calibration ask:** the right way to set the base rate, slope, and ceiling is to pick a target like *"10 weeks of streak ≈ one mid-tier cosmetic"* and back into the constants from the cosmetic price list. The numbers above are placeholders.

---

### Goal-difficulty modifier

Each member's credit payout on a successful week is further scaled by how ambitious their personal weekly goal is. This means setting a harder goal is always individually advantageous — there is no incentive to sandbagg.

The modifier is applied per member at batch-job time. It uses the goal value that was locked in at the start of the evaluated ISO week (i.e., mid-week goal changes do not affect the current week's modifier).

**Modifier tiers (proposed — calibrate alongside base rate):**

| Personal weekly goal | Goal modifier | Credits at base, 1.0× streak | Credits at base, 3.0× streak cap |
|---|---|---|---|
| 1 workout/week (floor) | 0.5× | 25 | 75 |
| 2 workouts/week | 0.75× | 37 | 112 |
| 3+ workouts/week | 1.0× | 50 | 150 |

**Full earnings formula:**

```
member_credits = base_credits × multiplier(streak_weeks) × goal_modifier(member_goal)
```

Where:
- `multiplier(streak_weeks) = min(1 + 0.10 × streak_weeks, 3.0)` (group-level, same for all)
- `goal_modifier(member_goal)` = tier value from the table above (member-level, varies)

**Design notes:**

- Members who miss their goal but whose group succeeds still earn credits (Decision 4), at their goal-tier rate — they benefit from the group but at the level they committed to.
- The 0.5× floor is not a punishment for setting a minimal goal; it is the natural payout for minimal commitment. Users who later raise their goal benefit from the higher modifier the following week.
- The tier boundaries (1 / 2 / 3+) and modifier values (0.5 / 0.75 / 1.0) are proposed defaults. The right values depend on the cosmetic price list and the target earnings curve per tier — calibrate alongside Decision 3 (base credit rate).
- **Schema note:** `group_week_evaluations.credits_per_member` stores the unmodified `base × multiplier` value (what a 3+/week member earns). Per-member actuals are fully derivable from `credit_ledger` — no schema change required.

---

## 7. Lifecycle rules

**Joining.** New members can only become eligible for evaluation at week boundaries. A mid-week join is recorded immediately but the member is excluded from the current week's evaluation; their first counted week is the following ISO week. This prevents joining a hot streak Friday night to harvest the multiplier.

**Leaving voluntarily.** A member can leave at any time. They are excluded from the next week's evaluation. Banked credits stay.

**Kick by admin.** Admin can kick any member at any time. Kicked members are excluded from the next week's evaluation and cannot rejoin the same group for 4 weeks. The cooldown blocks "kick the weak member each Sunday" gaming. To further harden this, kicks landing within the final 48 hours before a week boundary do not change that week's eligible set — the kicked member is still counted, hit-or-miss as actually observed.

**Disband / dormancy.** If active membership drops below 2, the group becomes inactive. The streak record is preserved for display but no evaluations run until the group has ≥2 active members again. A returning group resumes from `current_streak_weeks` only if at least 2 of its prior active members re-engage in the same week; otherwise the streak resets to 0 (open question — listed in §10).

**Goal changes.** Members can change their personal goal only at week boundaries. Mid-week edits queue and apply the following Monday. A floor of ≥1 workout/week prevents zero-goal trivial wins.

---

## 8. Anti-abuse

| Vector | Mitigation |
|---|---|
| Alt accounts forming farming groups | Account-age + activity gate to create or join (proposed: 30 days, ≥10 logged sessions). |
| Setting trivially easy personal goals | Goal floor (≥1 workout/week); rate-limit goal changes to once per week boundary. |
| Kick-rotation gaming | 4-week rejoin cooldown after kick; kicks within 48h of week boundary do not change that week's eligible set. |
| One "carrier" propping up passengers | The >50% rule structurally limits this — a single high-performer cannot save a 6-person group. Larger groups require more legitimate participation. |
| Late-week joining a hot streak | Week-boundary join rule; first 2 weeks at 1.0× regardless of group streak state. |
| Coordinated cross-group farming | Cap concurrent groups per user (proposed: 3). |

None of these is a complete defense — they raise the cost of abuse to the point where farming is less efficient than legitimate use. Anti-fraud is an ongoing concern, not a one-time bill.

---

## 9. Edge cases

**Time zones.** The week boundary is canonical UTC ISO week (Monday 00:00 UTC). Members in late time zones experience a slightly compressed Sunday. Acceptable for v1; revisit if user research surfaces complaints.

**Holidays and illness.** No grace period in v1. The >50% threshold already absorbs occasional individual misses without breaking the streak. If post-launch churn data shows a meaningful retention hit during holiday weeks, consider adding one "bye" week per quarter (open question 8).

**Inactive members.** A member who simply stops opening the app does not auto-leave. They count as not-hit-goal toward the >50% threshold, which is the right outcome — the group should feel the absence. Optional v2: auto-mark inactive after 4 consecutive weeks of no logins.

**Replays.** The job is idempotent on `(group_id, week_start)`. Re-running the job for a week already evaluated is a no-op.

**Spec drift between personal-goal subsystem and group eval.** This spec leans on the existing per-user goal subsystem to answer "did user X hit their goal in week W?". Any change to how goals are evaluated upstream (e.g., partial-credit goals, streaks-within-goals) should trigger a review here.

---

## 10. Open product decisions

**Status as of 2026-05-04:** 9 of 10 decisions ratified. One decision (base credit rate) is deferred pending the cosmetic price list.

| # | Decision | Status | Ratified value |
|---|---|---|---|
| 1 | Hard cap on group size | ✅ Ratified | 12 members |
| 2 | Multiplier shape and ceiling | ✅ Ratified | `1 + 0.10 × streak_weeks`, cap 3.0× at 20 weeks |
| 3 | Base credit rate | ⏳ Deferred | Proposed 50 — calibrate against cosmetic price list |
| 4 | Goal-missers earn on successful week? | ✅ Ratified | Yes — all active members earn |
| 5 | Concurrent group cap per user | ✅ Ratified | 3 groups |
| 6 | Account-age + activity gate | ✅ Ratified | 30 days, ≥10 sessions |
| 7 | Personal goal floor + payout modifier | ✅ Ratified | 1 workout/week floor; goal-difficulty modifier applied per member (see §6) |
| 8 | Grace weeks | ✅ Ratified | None in v1 |
| 9 | New-joiner multiplier carve-out | ✅ Ratified | First 2 weeks at 1.0× |
| 10 | Group return-from-dormancy rule | ✅ Ratified | Streak resets to 0 unless ≥2 prior active members re-engage in the same week |

**Remaining action:** Decision 3 (base credit rate) and the goal-difficulty modifier tier values (§6) must both be calibrated against the cosmetic price list before the batch job constants are finalised.

---

## 11. Out of scope

The cosmetic catalog itself — items, rarities, prices, the redemption flow — is a separate feature and a separate spec. This document only specifies the credit-earning mechanism. Group chat, group activity feeds, leaderboards, and any social features beyond membership are also out of scope.
