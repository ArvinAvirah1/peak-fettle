# SPEC v2 — Exercise Qualifiers, Pulley Configuration & Custom Options

**Status:** APPROVED TO BUILD (founder sign-off 2026-08-05). Supersedes SPEC v1 (never committed).
**Scope:** forward-only. No historical data is rewritten.
**Date:** 2026-08-05

> v2 exists because three adversarial Fable reviews found **four independent silent-data-loss
> blockers** in v1, plus a percentile guarantee aimed at the wrong file. Every correction is marked
> **[R]** with the finding it answers. Do not revert to v1's design on any point marked [R].

---

## 0. Founder decisions (locked)

| # | Decision |
|---|---|
| D1 | Qualifiers recorded at **both** levels: routine slot = prescription, per-set = actual |
| D2 | Qualifiers split PR/history; percentile **normalizes or excludes — never penalizes** |
| D3 | ~~Collapse variants into base + qualifier~~ → **DEFERRED** [R]. Forward-only v1 |
| D4 | Pulley: store the typed value **and** the ratio-normalized felt load |
| D5 | Custom options: device-local per user, synced for Pro |
| D6 | Everything free — core logging fidelity, no tier branch |
| D7 | All 241 exercises researched (done; 12 agents, 3 reviews, corrections applied) |
| D8 | Graphics: hand-authored SVG (react-native-svg already a dep → OTA, no rebuild) |
| **D9** | **NEW: user-configurable tracking level in Settings → Advanced.** The user chooses how many axes they track |
| **D10** | **Vocabulary:** add `bar_position` axis; add `load_mode: weighted`; add `bar_type: landmine`; map `pulley_height: low` → `knee`; **reject** a cardio axis (use `CardioMetrics`) |
| **D11** | **`pulley_ratio: 1:2` is REAL and stays.** Add `4:1`. Purely additive — no user data touched |
| D12 | `low bar squat` / `high bar squat` keep counting toward squat percentile exactly as today |

---

## 1. Taxonomy — 13 axes, shipped as TypeScript, not a table

`mobile/src/constants/qualifiers.ts` — a plain TS constant. Revising the taxonomy (adding an
attachment, fixing a label, correcting a coefficient) is then a JS-only change shipping via
`eas update`: no migration, no rebuild. Only *user* data goes in SQLite.

Axes: `grip_width`, `grip_orientation`, `attachment`, `pulley_height`, `pulley_ratio`, `stance`,
`bench_angle`, `bar_type`, `body_position`, `load_mode`, `rom`, `laterality`, **`bar_position`**.

Per-exercise applicability in `mobile/src/constants/exerciseQualifierMap.ts`, generated from
`docs/archive/qualifiers/corrected.json` (the reviewed research output).

**[R] Axis lifecycle rule:** axis ids and value ids are **append/deprecate-only — never delete or
rename**. A user's `custom_qualifier_values` row and every historical `qualifiers_json` reference
these ids; removing one orphans data. Readers must render an unknown `(axis,value)` pair as an inert
label rather than crashing or silently dropping it.

**[R] i18n:** every label and `custom_hint` in the catalog is an **i18n key**, not a display string
(`qualifiers:axis.<id>.label`, `qualifiers:value.<axis>.<value>.label`). The repo routes all strings
through namespaced `t()`; a catalog of raw English would make this the one untranslatable island.

### 1.1 Pulley ratio — the load-affecting axis

| id | movable pulley | felt load | handle travel |
|---|---|---|---|
| `1_1` | none | = stack | = stack |
| `2_1` | on the **stack** | ½ stack | 2× |
| `4_1` | two, on the stack | ¼ stack | 4× |
| `1_2` | on the **handle** | **2× stack** | ½ |
| `unknown` | — | as typed | — |

`1_2` is a genuine mechanical-*dis*advantage arrangement (cable dead-ends on the frame, runs around a
movable pulley carrying the handle, over the fixed pulley, down to the stack: stack tension `T = W`,
user opposes `2T`). USPTO weight-machine patent language describes pulley advantage as "positive,
negative, or neutral". Retail sources omit it because "feels lighter" is the selling point — a
sampling bias, not evidence of absence.

---

## 2. Data model

### 2.1 Local SQLite — schema **v21** (current is v20)

```sql
ALTER TABLE sets ADD COLUMN qualifiers_json   TEXT;   -- {"attachment":"rope","grip_width":"close"}
ALTER TABLE sets ADD COLUMN qualifier_key     TEXT;   -- "attachment=rope|grip_width=close"
ALTER TABLE sets ADD COLUMN load_effective_kg REAL;   -- D4: weight_kg x pulley factor

CREATE INDEX IF NOT EXISTS idx_sets_ex_qualkey ON sets(exercise_id, qualifier_key);

CREATE TABLE IF NOT EXISTS custom_qualifier_values (
  id          TEXT PRIMARY KEY,
  axis_id     TEXT NOT NULL,
  exercise_id TEXT,                 -- NULL = offered on every exercise using this axis
  label       TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
```

No `legacy_exercise_name` — that existed only for the deferred collapse.

**Why `load_effective_kg` is stored but strength coefficients are not:** the pulley ratio is a
physical property of the machine used that day and is unrecoverable later. Coefficients are our
editorial estimate and will be revised, so they apply at **read** time from the TS catalog — a
correction then reshapes all historical percentiles via `eas update` rather than a backfill.

### 2.2 [R] `qualifier_key` canonicalization — ONE shared function

`canonicalQualifierKey(map)` in `mobile/src/lib/qualifierKey.ts` is the single source of truth, used
by the writer, the readers, and every PR query. Rules:

1. Keys sorted lexicographically, joined `axis=value` with `|`.
2. **Values equal to the catalog default are OMITTED.**
3. Therefore `NULL` ≡ `''` ≡ all-defaults — one group.

Rule 2/3 exist because otherwise every base lift's PR history splits into pre-feature (`NULL`) and
post-feature (default-key) buckets. **Corollary, must be stated in code:** changing a catalog default
later re-buckets history, so defaults are semi-frozen and change only deliberately.

**[R] `qualifiers_json IS NULL` means "legacy / not recorded" and is treated as passthrough** by the
percentile filter. If NULL were treated as exclude, every pre-v21 set would drop out of the model.

### 2.3 [R] Backup registry — REQUIRED, not optional

`exportEngine.ts` `sanitizeRowColumns` **drops any column not in `COLUMN_ALLOWLIST`** (a DATA-01
anti-injection measure) and returns `{}` for unknown tables. Shipping v21 without editing that file
means every backup→restore cycle silently deletes all qualifier data. Required edits:

- add `qualifiers_json`, `qualifier_key`, `load_effective_kg` to the `sets` allowlist
- add `custom_qualifier_values` to `BACKUP_TABLES` **and** `COLUMN_ALLOWLIST`
- bump `BACKUP_SCHEMA_VERSION` 2 → 3 with an up-migration (existing pattern, lines ~236-256)

`app_settings` stays excluded (per-install config, existing convention) — so the D9 tracking level is
deliberately **not** backed up. State this in the settings copy.

### 2.4 Routine prescription (D1)

`RoutineExercise.qualifiers?: Record<string,string>`, allowlisted and bounds-checked in
`routineExerciseFields.ts` (same pattern as `substitutes`), with matching bounds in the server Zod
`ExerciseEntrySchema` so it round-trips unchanged and `canonicalRoutineKey` stays stable across the
Free→Pro upload.

### 2.5 Server (Pro sync)

```sql
ALTER TABLE sets ADD COLUMN IF NOT EXISTS qualifiers_json    TEXT;
ALTER TABLE sets ADD COLUMN IF NOT EXISTS load_effective_raw INTEGER;  -- kg x 8, existing convention
```
Guarded with `to_regclass`; routes catch `42703` and degrade. **The server has no `weight_kg`
column** — `weight_kg` is an API alias for `weight_raw/8.0`. Do not reference `s.weight_kg` in SQL.

**[R] Sequencing:** server migration deploys and is verified **before** the OTA that enables v21.
Because forward-only adds only nullable columns and never changes an `exercise_id`, there is no FK
risk and no outbox-wedge path — this is the main reason D3 was deferred.

---

## 3. [R] The percentile guarantee — corrected integration point

**v1 aimed this at `strengthModelV3.ts`. That was wrong.** `strengthModelV3` consumes pre-computed
e1RM inputs and has no set-level hook. The real filter point is **`mobile/src/data/localRankings.ts`**
(SQL over `sets` + the `classifyCompetitionLift` name allowlist).

**There is a second consumer:** `mobile/src/lib/shareCard/shareCardPercentile.ts`. Both must route
through **one shared filtered reader**, or the share card and the Rankings screen will disagree.

The model covers four lifts only — `LiftId = 'squat' | 'bench' | 'deadlift' | 'ohp'` — so only
qualifiers on those four can move a number.

### Treatments
- **`passthrough`** — load feeds the model unchanged.
- **`normalize`** — load divided by the coefficient. Only `high`/`medium` confidence.
- **`exclude`** — tracked for PRs, never enters the percentile input.

### [R] Four hard rules
1. **Missing coefficient ⇒ exclude.** Not passthrough. Absence of evidence must never silently feed a
   harder variant in at face value.
2. **Custom values ⇒ always exclude.** By definition no coefficient exists.
3. **At most one non-1.0 ratio per set.** If two would apply, exclude the set. Do **not** multiply
   coefficients — v1's "coefficients multiply" rule would have deducted a single 3.9% study finding
   twice (1.04 × 1.04).
4. **[R] Inflation guard.** v1 protected only against penalizing. A normalized estimate feeds an
   *uncapped MAX* (`localRankings.ts:139-142`) and could beat the user's actual competition-lift PR.
   Rule: **a normalized value may only fill in when no `passthrough` (actual) set exists for that
   lift; it may never exceed the best actual e1RM.**

### The guarantee, as a test
`strengthModel.qualifiers.test.js`: if every one of a user's sets for a lift is `exclude`, that lift
contributes **nothing** — never a depressed value. UI says so plainly: *"Not ranked — you've only
logged close-grip variations."*

### [R] Day-one movement
Required before ship: a **before/after percentile diff on a populated fixture DB**, not just the
all-exclude unit test. D12 fixes the known regression (low-bar/high-bar squat keep counting).

---

## 4. [R] D9 — Settings gate: how much to track

Without this, a cable exercise shows up to 6 chips and the logger becomes unusable for someone who
just wants to log a set. **Settings → Advanced → Exercise detail.**

`app_settings` keys (device-local, no sync, no network — consistent with `appSettings.ts`):

| key | values |
|---|---|
| `qualifier_tracking_level` | `off` \| `essential` \| `detailed` \| `everything` \| `custom` |
| `qualifier_axes_enabled` | JSON array of axis ids (used when level = `custom`) |

| level | axes shown |
|---|---|
| `off` | none — feature invisible, zero chips, zero compute |
| `essential` **(default)** | `attachment`, `pulley_height`, `pulley_ratio`, `grip_width` |
| `detailed` | + `grip_orientation`, `bench_angle`, `bar_type`, `stance`, `bar_position` |
| `everything` | all 13 |
| `custom` | exactly what the user ticks |

Default is `essential` because the feature was explicitly requested; shipping it dark would hide the
thing that was asked for. The four essential axes are precisely the founder's stated use cases
(attachments, pulley configuration, grip width).

### [R] Gate invariants — these must be tests
1. **The gate never re-interprets recorded data.** It cannot change a `percentile_treatment`, and
   two sets carrying the same qualifiers always rank identically regardless of either user's
   settings.

   **Refined 2026-08-05 during step 6 — the original wording ("never changes what is stored") was
   imprecise and would have been wrong to implement literally.** Only *visible* axes are written.
   Recording a hidden axis's catalog default would fabricate a claim the user never made — asserting
   "medium grip" for someone who hid grip width and may have been close-gripping — which would
   pollute their own PR history and feed the strength model a guess dressed as a statement.

   So the honest rule is: the gate controls what gets **recorded** (you cannot record what you never
   saw), and never how recorded data is **read**. A hidden axis is simply absent, and absent reads as
   "legacy / not recorded" → passthrough, exactly as every pre-v21 set does.

   Accepted consequence, stated so nobody rediscovers it as a bug: two users doing genuinely
   identical training can rank differently if one records a percentile-excluded qualifier and the
   other has that axis switched off. That is not the gate distorting anything — the second user
   never told us what they did, and guessing on their behalf is the worse failure.
2. **Disabling an axis never deletes data.** Previously logged values persist and reappear if
   re-enabled; they still render in history detail (read-only) while the axis is off.
3. **An exercise only ever shows axes that are both enabled AND applicable to it.**
4. Turning the level `off` must short-circuit before any qualifier compute — same pattern as
   `autoreg_suggestions_enabled` gating the autoregulation module.

---

## 5. UI

**5.1 Logger chips.** A single-line chip row under the exercise name in `StepperLogger`, showing only
enabled∩applicable axes. Zero taps in the common case — prefill precedence:

`routine prescription → previous set this session (same exercise) → last session for this exercise → catalog default`

**[R]** "previous set this session" is **per-exercise**; after a mid-session swap the old exercise's
values must not leak onto the replacement. A chip differing from the routine prescription renders in
the accent colour.

**5.2 Picker sheet.** Option cards with SVG graphic, label, one-line description; "+ Add your own" for
axes with `allows_custom`. **Modal nesting is mandatory** (CLAUDE.md §3 + GL-1): opened from inside
the stepper's Modal, so it must be a **child** of that Modal, never a sibling. See §6.

**5.3 The `?` affordance.** A persistent `?` in the sheet header **and** a typed `?` in the
custom/search field, both opening the same full-screen explainer with every option drawn large.
Available on every axis, not only pulley configuration.

**5.4 Routine editor.** Same picker, writes the slot prescription.

**5.5 [R] Other write sites.** There are **five** `INSERT INTO sets` sites, not one: `useWorkout.ts`,
`intentBridge.ts` (Siri), `usePowerSyncLog.ts`, `importers/importEngine.ts` (CSV), `backdateWorkout.ts`.
NULL qualifiers are acceptable at most, but `setEditing.ts` (edit past sets) **must carry and edit**
qualifiers or edits silently null them.

---

## 6. The swap → library bug (ship first, independently)

**Root cause, verified:** `SubstituteSwapSheet.tsx:428` renders `<ExercisePicker>` as a **sibling** of
its own `<Modal>`. Its header comment claims it copies `RoutineEditorSheet`, but
`RoutineEditorSheet.tsx:890` nests its picker **inside** the editor's Modal (lines 741-950). A Modal
presented while another is presented is silently dropped on iOS. GL-1 nested the swap sheet into the
stepper but stopped one level too shallow.

**Fix:** move `<ExercisePicker>` inside the swap sheet's `<Modal>` children. **[R]** This fixes
*both* mounts — the routine editor's swap flow is broken the same way, not just the logger.

**[R] Dismissal race:** `handlePicked` closes the picker while the parent typically closes the sheet
in the same tick. Sequence the dismissals (picker first, sheet on the next frame) if it flickers —
`WorkoutLoggerHost.tsx:291,623` documents this pattern.

**Second, independent defect:** `ExercisePicker.tsx:124` calls `getExercises()` over the network
unconditionally on open, with an explicit no-mock-fallback policy — a spinner then an error when
offline. **[R] Correction to v1:** this is *not* a local-first invariant violation; `ExercisePicker`
is in `LOCAL_FIRST_AUDITED` deliberately because the library is global, non-personal data. It is a UX
defect, not a compliance breach. **[R]** Any bundled fallback must carry the **real server UUIDs**
(snapshot the prod library) — mock UUIDs cause an FK violation on `POST /sets` and break the Free→Pro
upload, exactly as that file's own comment warns.

---

## 7. Verification gate (non-negotiable)

1. `@babel/parser` parse-sweep of all `.ts/.tsx` under `mobile/app` + `mobile/src` → 0 failures
2. `node --check` on every server `.js`
3. `node peak-fettle-agents/server/scripts/invariant-sweep.js`
4. `node mobile/src/db/__tests__/migrations.test.js` — incl. **v20→v21 on a populated DB**, zero set loss
5. `tsc --noEmit` delta vs the ~85 baseline — must not increase
6. **New** `strengthModel.qualifiers.test.js` — §3 guarantee + all four hard rules
7. **New** `qualifierGate.test.js` — the four §4 gate invariants
8. **New** backup round-trip test — export→import preserves qualifiers + custom values (§2.3)
9. Before/after percentile diff on a populated fixture (§3)
10. **Device verification** of swap → library (§6). A self-report is not evidence.

## 8. Ship path

JS/TS only → **`eas update`, no EAS rebuild.** `react-native-svg@15.12.1` is already a dependency;
the v21 migration is JS running on device. Server migration → `git push` (Railway auto-deploys),
**deployed before the OTA**. No native config is touched.

## 9. Build order — ALL STEPS COMPLETE (2026-08-06)

Commits `d74bf5f`..`1aa2fcf`, all pushed to `origin/main`. Server migration applied to prod
(Supabase `pf-main`, branch main) 2026-08-06 and verified: `sets.qualifiers_json` text +
`sets.load_effective_raw` integer, both nullable.

**NOT yet verified on a device.** Everything below passed the static gate (parse-sweep,
invariant-sweep, 28 test suites, tsc at baseline), but no part of this has run on a real
iPhone. The swap→library fix in particular is a founder-reported bug whose failure mode is
invisible to static analysis, so it needs an `eas update` and a physical check.

1. ✅ **Swap→library modal fix** — small, independent, verifiable, ships alone
2. ✅ v21 migration + backup registry (§2.1, §2.3 together — never separately)
3. ✅ `qualifiers.ts` catalog + `qualifierKey.ts` + i18n keys
4. ✅ SVG graphic components
5. ✅ Settings gate (§4) — before the logger UI, so the UI is built gated from day one
6. ✅ Logger chips + picker sheet + `?` explainer
7. ✅ Routine prescription
8. ✅ Percentile filter (§3) via the one shared reader + tests

**Parked, not abandoned:** the collapse migration (56 variants) and its global reconciliation pass —
circular bases (`Bench Press` ⟷ `Barbell Bench Press`), 19 alias shadows, 9 phantom targets, 5 bases
missing axes their variants need. Research output is preserved at `docs/archive/qualifiers/`.
