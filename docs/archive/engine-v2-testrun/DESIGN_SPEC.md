# Peak Fettle Engine v2 — Parametric Design Spec

**Date:** 2026-06-30 · **Status:** PROTOTYPE FOR FOUNDER REVIEW (not wired into the app). Evidence base: `engine-v2-testrun/RESEARCH.md`. Reference implementation: the `.mjs` files in this folder; sample output in `TEST_RUN.md`.

**What changes vs v1.** v1 (`mobile/src/lib/trainingEngine/`) selects a **fixed template** keyed by discipline×tier×goal (`templates.ts`), then scales it down, sequences it, fills exercises, and applies Epley loading. There is **no** per-muscle volume model, **no** experience-calibrated RIR, **no** mesocycle volume ramp, **no** powerlifting peaking or team-sport phasing, and **no** user-tunable knobs. v2 **generates** the split, per-muscle weekly volume, per-session set allocation, rep ranges, %1RM/RIR, progression, deloads, and (where relevant) a peaking or sport-phase overlay **from parameters**. The output shape is a **superset** of v1's, so the eventual port is mechanical (§ E).

**Design invariants (non-negotiable, from `CLAUDE.md`).** Pure, deterministic, on-device functions; **zero network calls**; free users never hit this (Pro-only feature); everything derived from the survey profile + on-device history/PBs/constraints. Weight is exact kg. Determinism via a seeded PRNG (`userId + weekISO`), reused from v1.

---

## A. Input schema — the deep survey → a typed `ProfileV2`

### A.1 The `ProfileV2` object (engine input)

```
ProfileV2 = {
  // ── Identity / recovery tuning ──
  experienceLevel: 'beginner'|'novice'|'intermediate'|'advanced'|'elite',  // 5-level, reused from strengthModelV3
  trainingAgeYears?: number,          // optional override; else derived from experienceLevel (beginner1/novice2/intermediate4/advanced6/elite9)
  sex?: 'M'|'F'|null,
  ageYears?: number|null,             // from birth_date; tunes recovery + deload floor
  bodyweightKg?: number|null,

  // ── Goal ──
  goal: 'hypertrophy'|'strength_powerlifting'|'general_fitness'|'athletic_power'|'team_sport',
  //   general_fitness covers fat-loss/recomp (a fatLoss sub-flag tweaks conditioning + calorie note)
  fatLossEmphasis?: boolean,          // adds conditioning, keeps lifting volume ~maintenance-to-MEV

  // ── Schedule ──
  daysPerWeek: 1..7,
  sessionMinutes: 15|30|45|60|75|90|120,
  trainingDays?: number[]|null,       // JS getDay() 0..6, optional (maps sessions to real weekdays)

  // ── Equipment ──
  equipment: string[],                // closed vocabulary (v1 EquipmentItem set)

  // ── Muscle priorities ──
  musclePriorities?: string[]|null,   // canonical muscle labels; bumps target volume + exercise bias

  // ── Injuries / contraindications ──
  injuries?: string[]|null,           // region tokens: lower_back, knees, shoulders, wrists, elbows, ankles, neck, hip, upper_back

  // ── Per-lift strength (for %1RM loading) ──
  lifts?: { squat?: number, bench?: number, deadlift?: number, ohp?: number, [name:string]: number },  // est. 1RM kg

  // ── Powerlifting branch (goal === 'strength_powerlifting') ──
  meet?: {
    weeksToMeet: number,              // drives the peaking backward-layout
    target1RM?: { squat?: number, bench?: number, deadlift?: number },  // goal 3rd attempts (kg); else from lifts
  } | null,

  // ── Team-sport branch (goal === 'team_sport') ──
  sport?: 'soccer'|'basketball'|'football'|'rugby'|'volleyball'|'handball'|'hockey'|'other',
  seasonPhase?: 'off_season'|'pre_season'|'in_season',
  gameDay?: number|null,              // JS getDay() 0..6 of the weekly game → anchors MD± microcycle

  // ── Athletic-power branch (goal === 'athletic_power') ──
  // (no extra required fields; uses power/plyo blocks + strength support)

  // ── CONFIGURABLE KNOBS (safe-bounded; §D) ──
  knobs?: {
    failureProximity?: 'cautious'|'balanced'|'aggressive',   // → RIR floor + target band
    progressionSpeed?: 'conservative'|'balanced'|'aggressive',
    deloadFrequency?: 'infrequent'|'standard'|'frequent',
  },

  // ── Mesocycle length to generate ──
  weeksToGenerate?: number,           // default: one full mesocycle incl. deload (4–6 wk); PL branch = weeksToMeet
}
```

Everything except `experienceLevel`, `goal`, `daysPerWeek`, `sessionMinutes` has a sane default (mirrors v1's NULL-defaults philosophy: 3 days / 60 min / general fitness / full-gym equipment / balanced knobs).

### A.2 Survey question flow (new), with options + branching

Ordered; `[branch]` steps appear conditionally. Bracketed notes are engine wiring.

1. **Goal** (single) — Hypertrophy · Max strength & powerlifting · General fitness / fat loss / recomp · Athletic power & conditioning · Team sport. `[sets goal; opens branch]`
2. **Experience** (single) — Beginner (<6 mo) · Novice (6 mo–2 yr) · Intermediate (2–4 yr) · Advanced (4–8 yr) · Elite (8 yr+, competitive). `[experienceLevel → trainingAgeYears, all experience-scaled params]`
3. `[branch: team_sport]` **Sport** — Soccer · Basketball · Football · Rugby · Volleyball · Handball · Hockey · Other. Then **Season phase** — Off-season · Pre-season · In-season. Then **Game day** (optional weekday). `[sport, seasonPhase, gameDay]`
4. **Days per week** (1–7 chips).
5. **Session length** (15/30/45/60/75/90/120).
6. **Training days** (optional multi weekday) — maps sessions to real days.
7. **Equipment** (multi, closed vocabulary).
8. **Muscle priorities** (optional multi) — chest, back, shoulders, arms, legs, glutes, core, calves. `[+2–4 sets to target volume, exercise-selection bias]`
9. **Injuries / limitations** (optional multi) — lower back, knees, shoulders, wrists, elbows, ankles, neck, hip, upper back. `[contraindication filter + safer-swap]`
10. **Per-lift bests** (optional numeric, kg or lb) — Squat / Bench / Deadlift / Overhead press 1RM (or best set → Epley e1RM). `[%1RM loading]`
11. `[branch: strength_powerlifting]` **Meet date?** (optional). If yes → weeks-to-meet (derived) + **target lifts** (goal squat/bench/deadlift, optional). `[meet → peaking overlay]`
12. **Body weight** (optional) and **Date of birth** (optional). `[bodyweight loading defaults; age → recovery/deload floor]`
13. **Configurable knobs** (three sliders, defaults = balanced):
    - *How close to failure do you want to train?* Cautious ↔ Balanced ↔ Aggressive. `[failureProximity]`
    - *How fast should we push your progression?* Conservative ↔ Balanced ↔ Aggressive. `[progressionSpeed]`
    - *How often do you want recovery/deload weeks?* Less often ↔ Standard ↔ More often. `[deloadFrequency]`
    - Copy under each explains the safe cap ("we never push a beginner past 2 reps-in-reserve on the big lifts, whatever you pick here").

The existing `training-survey.tsx` already collects items 1–2, 4–10, 12 (goal, experience, discipline, days, length, equipment, priorities, injuries, training days, bodyweight, DOB). v2 adds: goal taxonomy (5 goals), sport/season/game-day branch, per-lift 1RMs, meet branch, and the three knobs. The port is additive to that screen.

---

## B. The generation algorithm — stage by stage

Pipeline (all pure; each stage appends to `ruleTrace[]`):

```
resolveProfile → deriveParams (experience+goal+knobs → volume/RIR/prog/deload params)
  → selectSplit (days, priorities → session archetypes + muscle-day map)
  → allocateVolume (per-muscle weekly sets, ramped MEV→MAV across the meso)
  → distributeToSessions (weekly sets → per-session sets, capped; frequency ≥2×)
  → fillExercises (equipment + injuries + priorities + catalog)
  → assignLoadingPerSlot (rep range + %1RM/RIR by goal × week × lift role)
  → applyProgression (linear | dup | block across weeks)
  → insertDeloads (cadence + reactive)
  → [powerlifting] peakingOverlay(weeksToMeet)
  → [team_sport] sportPhaseOverlay(seasonPhase, gameDay)
  → reasoning + ruleTrace
```

### B.1 `deriveParams` — experience × goal × knobs → the numeric engine parameters

**(a) Experience → base recovery/volume tier.** From `RESEARCH.md §1.4`:

| experienceLevel | trainingAge (yr) | volumeStart (sets/muscle/wk, non-priority) | volumeStep (sets/muscle/wk added per accumulation week) | perSessionCap (sets/muscle) |
|---|---|---|---|---|
| beginner | 1 | 8 | 1 | 5 |
| novice | 2 | 10 | 1 | 6 |
| intermediate | 4 | 13 | 1–2 | 8 |
| advanced | 6 | 17 | 2 | 9 |
| elite | 9 | 19 | 2 | 10 |

Priority muscles get `volumeStart + 3` (capped at the muscle's MRV from the §1.2 table). Small muscles (biceps, triceps, rear delts, abs) use `round(0.6 × volumeStart)` because indirect work feeds them (`RESEARCH.md §1.2`).

**(b) Goal → volume/intensity emphasis & default RIR band.** From `RESEARCH.md §2.5, §3.1`:

| goal | volume multiplier | primary rep zones (role→reps@%1RM) | base RIR band |
|---|---|---|---|
| hypertrophy | ×1.0 (full MEV→MRV ramp) | primary 5–8 @ 80%, secondary 8–12 @ 72%, accessory 12–20 @ 65% | 1–3 (mostly 2) |
| strength_powerlifting | ×0.85 (bias intensity over volume) | primary 1–5 @ ≥85%, secondary 4–6 @ 82%, accessory 8–12 @ 70% | 1–3 (heavy top sets ≥1) |
| general_fitness | ×0.8 (MEV-to-mid-MAV; simpler) | primary 5–10 @ 75%, secondary 8–12 @ 70%, accessory 10–15 @ 65% | 2–3 |
| athletic_power | ×0.75 lifting + power/plyo | power 2–5 @ 30–60% (speed) or 3–5 @ 80% (strength-speed); strength 3–5 @ 85% | strength 2–3; power stops far from failure (3–5 RIR — quality/velocity) |
| team_sport | phase-dependent (§B.9) | off: strength 4–6 @ 82%; in-season: 3–5 @ 80% low-volume | 2–3 (in-season 2–3, never grind) |

`fatLossEmphasis` keeps lifting at ~maintenance→MEV (preserve muscle, `RESEARCH.md §1.5`) and adds conditioning; it does not raise RIR aggression.

**(c) Knobs → parameter shifts (safe-bounded; full detail in §D).**
- `failureProximity` shifts the **target RIR band** and sets the **RIR floor** — but the floor is `max(knobFloor, experienceFloor)`, so a novice on "aggressive" is still clamped to ≥2 RIR on compounds (`RESEARCH.md §2.5, §10.1`).
- `progressionSpeed` scales **load increments** and **volumeStep**, capped ≤~5%/session load and ≤2 sets/wk ramp (`RESEARCH.md §10.2`).
- `deloadFrequency` sets **accumulationWeeks** before a deload, bounded to [3,8] (`RESEARCH.md §10.3`).
- **Cross-knob safety:** if `failureProximity=aggressive` AND `progressionSpeed=aggressive`, force `deloadFrequency` at least one step toward "frequent" and enable the reactive-deload trigger (`RESEARCH.md §10.3 coupling`).

**(d) Periodization model** (`RESEARCH.md §5.4`), by experience × goal:

| | hypertrophy | strength_powerlifting | general_fitness | athletic_power | team_sport |
|---|---|---|---|---|---|
| beginner/novice | linear-volume | **linear** (add load/session) | **linear** | linear + power primers | phase (simple) |
| intermediate | **DUP / volume-progression** | **DUP** (or weekly) | undulating | DUP + power | phase (DUP base) |
| advanced/elite | undulating + volume-periodization | **block** (accum→intens→peak) | undulating | block (power realization) | phase (block base) |

### B.2 `selectSplit` — days/week + priorities → session archetypes

Choose a split family by `daysPerWeek`, then map each muscle group to the sessions that train it (target ≥2×/week per muscle, `RESEARCH.md §4.1`). This **replaces v1's fixed session list** with a generated one.

| days | default split (general) | notes |
|---|---|---|
| 1 | Full Body ×1 | maintenance-only; warn volume is sub-optimal |
| 2 | Upper / Lower | or Full Body ×2 |
| 3 | Full Body ×3 (beginner) **or** Push / Pull / Legs | FB×3 for beginners (freq + skill); PPL for int+ |
| 4 | Upper / Lower / Upper / Lower | each muscle 2×/wk |
| 5 | Upper / Lower / Push / Pull / Legs **or** PPL + UL | |
| 6 | Push / Pull / Legs ×2 (PPL×2) | each muscle 2×/wk, ~5–8 sets/session |
| 7 | PPL×2 + 1 accessory/weak-point or 1 rest | honor ≥1 rest/week if dense |

Goal overrides:
- **strength_powerlifting** → SBD-centric split (Squat-focus / Bench-focus / Deadlift-focus / accessory) scaled to days; each competition lift ≥2× exposure/week where days allow (`RESEARCH.md §5.2, §6`).
- **athletic_power** → Lower-power / Upper-strength / Total-power split with plyo/sprint days interleaved (`RESEARCH.md §7.3`).
- **team_sport** → strength sessions placed on MD-3/MD+2 with a plyo/speed component; count constrained by season phase (in-season ~1–2; `RESEARCH.md §7.2, §7.5`).

`splitMuscleDayMap`: e.g. PPL → {chest,shoulders(front),triceps}=Push days; {back,rear delts,biceps}=Pull days; {quads,hams,glutes,calves}=Legs days. Used by `distributeToSessions` to know which day each muscle's weekly sets land on.

### B.3 `allocateVolume` — per-muscle weekly sets, ramped MEV→MAV across the meso

For each trained muscle `m` and accumulation week `w` (1-indexed within the block):

```
base(m)     = volumeStart (×0.6 if small muscle) + (isPriority(m) ? 3 : 0)
base(m)    *= goalVolumeMultiplier
weekSets(m,w) = clamp( round( base(m) + volumeStep*(w-1) ),  MEV(m),  MRV(m) )
```

`MEV(m)`, `MRV(m)` from the `RESEARCH.md §1.2` table. This realizes the RP mesocycle ramp (`RESEARCH.md §1.6, §8.4`): week 1 ≈ MEV, add `volumeStep` sets/muscle/week toward MRV, then a deload week resets to **MV (≈6, or ⅓ of peak)**. In-season team sport clamps `weekSets` to maintenance (`~⅓ of base`, floor 2–6; `RESEARCH.md §1.5, §7.2`).

### B.4 `distributeToSessions` — weekly sets → per-session sets (capped)

For each muscle, spread `weekSets(m,w)` across the sessions that train it (from `splitMuscleDayMap`), each session getting `≤ perSessionCap` sets (`RESEARCH.md §4.2`):

```
sessionsForMuscle = number of days that train m (≥2 preferred)
perSession(m)     = ceil( weekSets(m,w) / sessionsForMuscle )
if perSession(m) > perSessionCap:  raise sessionsForMuscle if the split allows, else clamp
                                    (and note weekly target trimmed to fit the per-session ceiling)
```

Then each session's **slot list** is built: for each muscle assigned to that session, emit `round(perSession(m) / setsPerExercise)` exercise slots (setsPerExercise ≈ 3, so a 6-set muscle-day = 2 exercises × 3 sets), tagged with `movement_pattern`, `role` (primary/secondary/accessory by muscle importance for the session), and `is_compound`. This yields the same **slot shape v1 consumes** but *generated from the volume model* rather than transcribed from a template.

### B.5 `fillExercises` — equipment + injuries + priorities + catalog

Reuses v1's proven selection logic (`exerciseFill.ts`), unchanged in spirit:
`pattern match → equipment ⊆ profile → not contraindicated → stickiness (history/PB) → is_compound for role=primary → priority-muscle bias → seeded tiebreak`. **Injury handling is upgraded** from v1's hard-drop to **safer-swap** (`RESEARCH.md §9`): when the first-choice exercise is contraindicated for an active injury, prefer a same-pattern, same-muscle alternative flagged `safeFor[region]` (e.g. knee → box squat/leg press; low back → trap-bar DL/hip thrust; shoulder → neutral-grip/landmine press) before dropping the slot. The prototype catalog tags each exercise with `contraindications[]` and `safeFor[]`.

### B.6 `assignLoadingPerSlot` — rep range + %1RM/RIR by goal × week × lift role

Per slot, choose **rep range**, **%1RM** (if an e1RM exists for the lift), and **RIR target** — and **vary them** by goal, mesocycle week, and role (`RESEARCH.md §2.5, §3.1–3.3`). This is where the founder's three principles become visible.

**Rep range & %1RM** by (goal, role) from §B.1(b), with within-week undulation for DUP/hypertrophy: rotate role bands across a muscle's 2–3 weekly exposures so one session is heavier/lower-rep (top-set day) and another is lighter/higher-rep (back-off/volume day) — the top-set + back-off / DUP structure (`RESEARCH.md §3.3`). Example (hypertrophy chest, 2×/wk): Day A bench 4×6 @ 80%, Day B incline DB 4×12 @ ~68%.

**RIR target per set**, computed as:

```
rirBand      = base RIR band for (goal, role)                         // §B.1(b)
experienceAdj: novice +1 (train further from failure & +1-rep self-report calibration; RESEARCH.md §2.3, §2.5)
weekAdj      : RIR decreases across accumulation:  wk1 = high end of band … peak wk = low end   // RESEARCH.md §1.6
knobShift    : failureProximity cautious +1 / balanced 0 / aggressive −1                          // §D.1
rirTarget    = clamp( bandCenter + experienceAdj + weekAdj + knobShift,  RIR_FLOOR,  6 )
RIR_FLOOR    = max( experienceFloor(role), knobFloor(role) )           // novice≥2 compound, etc.
```

So RIR is **experience-calibrated** (novices further from failure), **undulates within the mesocycle** (higher RIR early, lower near the deload), and is **knob-adjustable but safe-clamped**. The %1RM ↔ reps mapping uses the NSCA table (`RESEARCH.md §3.2`); loads round to 2.5 kg.

**Load from e1RM** (reuses/extends v1 `loading.ts` Epley, but %1RM-aware instead of a flat 87.5%):
```
targetPct = pctForReps(repTargetLow) from NSCA table  (e.g. 5 reps → 87%, 8 → 80%, 12 → 70%)
workingKg = round2.5( e1RM × targetPct × rirDiscount )
rirDiscount = 1 − 0.033×(rirTarget)   // ~3.3%/RIR, i.e. leaving reps in reserve lowers the load a touch
```
No e1RM for the lift → RPE/RIR-only prescription (as v1), with the rep range and RIR target still shown.

### B.7 `applyProgression` — linear | dup | block across weeks

Per the model chosen in §B.1(d):
- **linear** (novice): +load each session/week — lower body `+2.5 kg`, upper `+1.25–2.5 kg` (scaled by `progressionSpeed`), reps/sets fixed; reactive reset on stall (`RESEARCH.md §5.1, §10.2`).
- **dup** (intermediate): rep ranges undulate within the week (already set in §B.6); week-to-week load creeps up as RIR targets fall; TM raised ~2.5–5%/meso (`RESEARCH.md §5.2`).
- **block** (advanced/elite strength): sequence blocks — **Accumulation** (high volume, 65–75%, 6–12 reps) → **Intensification/Transmutation** (lower volume, 80–90%, 3–6) → **Realization/Peak** (lowest volume, ≥90%, 1–3). Block lengths 2–4 wk each (`RESEARCH.md §5.3`). Hypertrophy at all levels can stay volume-progression (ramp sets to MRV, deload) rather than block.

### B.8 `insertDeloads` — cadence + reactive

- **Cadence** = `accumulationWeeks` from `deloadFrequency` × experience (`RESEARCH.md §8.2, §10.3`): novice 6–8, intermediate 5–6, advanced/older 3–4; bounded [3,8]. After `accumulationWeeks`, insert a **1-week deload**: same exercises, **~50% of sets** (or MV≈6/muscle), **~10% lighter** (or 60–70% of working weight), **+2–3 RIR**, full ROM (`RESEARCH.md §8.3`).
- **Reactive override** (when history is available at generation time, or flagged for the logger to trigger): insert a deload early if e1RM drops ≥2% across 3 sessions, reps fall session-over-session at the same load ×3, mean RIR <1 over 14 days, or logged joint pain (`RESEARCH.md §8.2`; reuses the v1 `/insights/deload` trigger logic conceptually). Age raises the deload floor (older → more frequent).

### B.9 `peakingOverlay` — powerlifting, parameterized by weeks-to-meet

When `goal=strength_powerlifting` and `meet.weeksToMeet` is set, lay phases **backward from the meet** (`RESEARCH.md §6.5`):

```
if weeksToMeet ≥ 12: accumulation(4–6) → strength(4–6) → peak(2–3) → taper(final 3–7 days folded in)
elif ≥ 8:            strength(5–7) → peak(2–3)
elif ≥ 6:            strength(4) → peak(2–3)
elif ≥ 4:            short-strength + peak(2–3)
else:               peak/taper only (~2 wk) + 2–7-day cessation
```

**Peak block** (final ~3 weeks) on the competition lifts (`RESEARCH.md §6.2–6.3`):
- wk −3: top single/double **~90%** (RPE 8–9), volume cut sharply.
- wk −2: top single **~95%** (RPE 9), few sets.
- wk −1/taper: opener-sim single **~90%**, then light technical; **volume −30–50%** vs strength block (avoid <25% / >70%); intensity held ≥85% then dropped last few days; last real session 5–7 days out.
- Taper length scales with level (novice ~2 wk / often just a deload; advanced ~3–4 wk, deadlift volume drops earliest).
- **Auto-attempt suggestion** from `target1RM` (or e1RM): **opener = round2.5(0.91×goal3rd)**, **2nd = round2.5(0.96×goal3rd)**, **3rd = goal3rd** (`RESEARCH.md §6.4`).

### B.10 `sportPhaseOverlay` — team sport, by season phase + game day

When `goal=team_sport` (`RESEARCH.md §7`):
- **off_season:** highest lifting volume (hypertrophy + max-strength base, 2–4 sessions/wk, up to ~80–90%), plus general conditioning + extensive plyos.
- **pre_season:** convert to power/speed — strength-speed lifts (3–5 @ ~80%), intensive plyos (contacts by level, `RESEARCH.md §7.3`), sprint/COD, sport conditioning ramps.
- **in_season:** **maintenance** — **1–2 short strength sessions/wk, lower volume (~⅓), higher relative intensity, 3–5 reps**, keep leg volume low; power/CNS-priming placed by MD±.
- **Game-day anchoring (MD±)** when `gameDay` set (`RESEARCH.md §7.5`): place the heavier strength session at **MD-3** (or MD+2), the priming/light session at **MD-1**, recovery **MD+1**. Sessions labeled with MD offsets.
- **Concurrent-training guard** (`RESEARCH.md §7.4`): never schedule a hard conditioning block and a heavy lower-body lift on the same day within 6 h; prefer cycling/rowing over running when protecting strength; cap endurance frequency in-season.
- **FIFA 11+ style neuromuscular warm-up** appended to sport sessions (injury reduction).

---

## C. Formula & default reference (consolidated)

- **Volume:** `weekSets = clamp(round((volumeStart[×0.6 small]+priority3)×goalMult + step×(w−1)), MEV, MRV)`. MEV/MRV per muscle: `RESEARCH.md §1.2`.
- **Per-session cap:** 5 (beginner) → 10 (elite) sets/muscle; add a session before exceeding it.
- **Frequency:** ≥2×/week per muscle (default split guarantees it for ≥3 days).
- **Rep zones (reps@%1RM):** strength 1–5@≥85 · hypertrophy-primary 5–8@80 · hypertrophy-secondary 8–12@72 · accessory 12–20@65 · endurance 15–30@<65. Undulate across a muscle's weekly exposures.
- **RIR:** `clamp(bandCenter + novice(+1) + weekAdj + knobShift, floor, 6)`, `floor = max(experienceFloor, knobFloor)`; novice compound floor 2, intermediate 1, advanced 1 (0 isolation only).
- **Load from e1RM:** `round2.5(e1RM × pctForReps(repLow) × (1 − 0.033×rir))`.
- **Load progression:** lower +2.5 kg, upper +1.25–2.5 kg (× progressionSpeed 0.5/1/1.5), capped ≤5%/session.
- **Deload:** cadence [3,8] wk by experience×knob; deload week = ~50% sets, ~10% lighter, +2–3 RIR, 1 week.
- **PL peaking:** phases backward from meet; peak singles 90→95→90%; taper volume −30–50%; attempts 91/96/100% of goal 3rd.
- **Team sport:** off/pre/in phasing; in-season 1–2×/wk maintenance; plyo 80–140 contacts by level, 48–72 h apart; MD-3/MD-1/MD+1 anchoring; concurrent guard ≥6 h.

---

## D. Configurable knobs → parameters, with SAFE bounds (`RESEARCH.md §10`)

### D.1 `failureProximity` → target RIR band + RIR floor

| setting | RIR band shift | floor (compound) | floor (isolation) |
|---|---|---|---|
| cautious | +1 (target 3–4) | 2 | 2 |
| balanced | 0 (target 1–3) | max(1, expFloor) | max(1, expFloor) |
| aggressive | −1 (target 0–2) | max(1, expFloor) | max(0, expFloor) |

`expFloor` = novice 2 / intermediate 1 / advanced 1 (compound), novice 2 / intermediate 1 / advanced 0 (isolation). Effective floor = `max(knobFloor, expFloor)` → **a novice on aggressive is still ≥2 RIR on compounds.**

### D.2 `progressionSpeed` → increments + ramp

| setting | load-increment scale | volume ramp | deload coupling |
|---|---|---|---|
| conservative | ×0.5 | +0–1 set/muscle/wk | more frequent deloads |
| balanced | ×1.0 | +1 | scheduled by experience |
| aggressive | ×1.5 (capped ≤5%/session) | +1–2 | reactive deload required |

Hard bounds: never max-load + max-volume same week; ramp capped so end-of-meso ≤ MRV; miss target → hold/reduce.

### D.3 `deloadFrequency` → accumulation length

| setting | cadence | typical for |
|---|---|---|
| infrequent | every 6–8 wk (+reactive) | novices |
| standard | every 5–6 wk | intermediates |
| frequent | every 3–4 wk | advanced / older / high-stress |

Bounded [3,8]; "never" not exposed; reactive override always on. **Cross-knob:** aggressive proximity + aggressive progression forces ≥1 step toward frequent.

---

## E. Mapping onto the existing engine output shape (so the port is mechanical)

v2 emits the **exact v1 output superset** (`mobile/src/lib/trainingEngine/index.ts` `GeneratePlanResult`, `loading.ts` `WeekOutput`, and the slot shape `sets/reps/rpe/rest_seconds/pattern/priority/is_compound` plus filled `exercise_id/name/weight_kg/warmup/coaching_note`). New fields are **additive** and optional, so existing consumers (`plans.tsx`, the logger) keep working:

```
GeneratePlanResultV2 = {
  weeks: [ { week_number, phase?, isDeload?, sessions: [ {
      day_label, mdOffset?,                       // mdOffset new (team sport)
      slots: [ {
        // ── v1-identical fields ──
        exercise_id, name, muscle_groups, is_compound, pattern, priority,
        sets, reps,                               // reps string, e.g. "6-8" (unchanged)
        rpe,                                       // rpe = 10 − rirTarget  ← maps RIR onto v1's rpe field
        rest_seconds, weight_kg, warmup?, coaching_note,
        // ── v2-additive (optional) ──
        rir_target?, pct_1rm?, role?, week_intent? // e.g. role:'primary', week_intent:'accumulation wk2'
      } ],
      cardio?: [...]                               // unchanged (conditioning/plyo prescriptions)
  } ] } ],
  reasoning, rule_trace, engine: 'pf-engine-v2',
  // ── v2-additive plan-level (optional) ──
  mesocycle?: { model, accumulationWeeks, deloadWeek, phases? },
  peaking?:   { weeksToMeet, phases, attempts?: {squat,bench,deadlift} },   // PL branch
  sportPlan?: { sport, seasonPhase, microcycle? },                         // team-sport branch
  volumeReport?: { perMuscleWeeklySets: {...} }                            // transparency
}
```

**Key mapping:** v2's `rirTarget` maps onto v1's `rpe` field as `rpe = 10 − rirTarget` (the app already treats `rpe_target` as the intensity cue), so **no consumer change is required** — the RIR is *also* surfaced in the optional `rir_target` for the richer UI. `reps` stays a string range. `weight_kg`, `warmup`, `coaching_note` are produced exactly as v1. The `cardio[]` channel carries conditioning/plyometric prescriptions (zone/minutes/description or contacts), same shape as v1.

**Port plan (post-approval, mechanical):** (1) drop v2 `.mjs` modules into `mobile/src/lib/trainingEngineV2/` as `.ts` (types already match); (2) extend `training-survey.tsx` with the 5-goal taxonomy + sport/meet/knob steps → `ProfileV2`; (3) `buildLocalPlanContext` (localContext.ts) maps the local profile → `ProfileV2` (most fields already exist); (4) `usePlans`/`plans.tsx` call `generatePlanV2` behind the Pro gate; (5) render the additive fields (RIR, phase, attempts) where present, else fall back to the v1 rendering. No server change (Pro path can compute on-device too; the local-first invariant is preserved).

---

## F. Explicit non-goals / assumptions for founder review

1. **Cardio/endurance disciplines** (pure running/cycling/swimming) are *not* re-derived here — v2 focuses on the five founder-locked goals. The team-sport branch covers concurrent conditioning; standalone endurance can stay on v1 or be a later v2 module. **Assumption to confirm.**
2. **Nutrition** is out of scope beyond a fat-loss calorie *note*; no macro/diet engine.
3. **Reactive deload / autoregulation** uses history when present at generation time; live in-session autoregulation (adjusting today's load from the last set's logged RIR) is a logger feature the engine emits hooks for, not a generation-time behavior.
4. **Medical safety:** injury handling is contraindication-avoidance + safer-swap, with a "train pain-free, see a clinician for acute/severe symptoms" guardrail. Not a medical device.
5. **Exercise catalog** in the prototype is a distilled ~40-exercise set (from v1's `exerciseCatalog.ts`) with added `safeFor[]` tags; production would use the full tagged catalog.
