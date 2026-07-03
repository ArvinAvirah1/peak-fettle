// engine.ts — Engine v2 generator: generatePlanV2(inputs, options) → parametric mesocycle.
// Pure, DETERMINISTIC (seeded), no network, no clock/random inside logic. Pipeline per
// DESIGN_SPEC.md §B. Output shape is a superset of v1's (§E): rpe = 10 − rirTarget.
//
// Refinements applied over the prototype (TEST_RUN.md):
//   (a) squat-pattern variant cap — ≤2/week novices, ≤3 otherwise (params.squatPatternCap).
//   (b) strict role tagging — one primary per muscle-per-session; extras become
//       secondary/accessory so role-based rep-range/RIR differentiation is visible.
// Determinism fix over the prototype: the .mjs used Array.sort(() => rng()-0.5)
// (engine-dependent + biased). This port uses a seeded Fisher-Yates shuffle so output
// is byte-identical across JS engines.

import { CATALOG_V2 } from './catalog';
import {
  clamp,
  deriveParams,
  landmarkFor,
  pctForReps,
  round2_5,
  SMALL_MUSCLES,
} from './params';
import type {
  AttemptSet,
  CardioPrescription,
  CatalogExerciseV2,
  DerivedParamsV2,
  EngineInputsV2,
  MesocycleReport,
  MovementPattern,
  PeakingReport,
  PerMuscleVolume,
  PlanSessionV2,
  PlanSlotV2,
  PlanV2,
  PlanWeekV2,
  SlotRole,
  VolumeReport,
} from './types';

// ── deterministic PRNG (mulberry32) seeded by userId + week ──
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedFrom(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h >>> 0;
}
// Deterministic Fisher-Yates shuffle (stable across engines — unlike sort(()=>rng()-0.5)).
function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i] as T;
    a[i] = a[j] as T;
    a[j] = tmp;
  }
  return a;
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── internal working types ──
interface SplitSession {
  name: string;
  focus: string;
  mainLift?: 'squat' | 'bench' | 'deadlift';
  power?: boolean;
  muscles: string[];
}
interface WorkingSlot {
  muscle: string;
  role: SlotRole;
  sets: number;
  exposureIndex: number;
  exposures: number;
  mainLift?: 'squat' | 'bench' | 'deadlift';
  // filled by fillExercises:
  exercise_id?: string;
  name?: string;
  pattern?: MovementPattern;
  is_compound?: boolean;
  muscles?: string[];
  plyo?: boolean;
  power?: boolean;
  mainLiftKey?: 'squat' | 'bench' | 'deadlift';
  dropped?: boolean;
  // filled by assignLoading:
  reps?: string;
  rirTarget?: number;
  rpe?: number;
  pct1rm?: number | null;
  weight_kg?: number | null;
  rest_seconds?: number;
  priority?: number;
  loadNote?: string;
  week_intent?: string;
  peakNote?: string | null;
}
interface BuiltSession {
  name: string;
  focus: string;
  mainLift: 'squat' | 'bench' | 'deadlift' | null;
  power: boolean;
  slots: WorkingSlot[];
  cardio: CardioPrescription[];
  warmup?: string | null;
  mdOffset?: string | null;
  day_label?: string;
}

// ── B.2 selectSplit: days + goal + priorities + splitPreference → session archetypes ──
function selectSplit(
  profile: EngineInputsV2,
  params: DerivedParamsV2,
  trace: string[],
  forcedSplit?: 'ppl' | 'upper_lower' | 'body_part'
): { sessions: SplitSession[]; muscleDays: Record<string, number[]>; days: number } {
  const days = clamp(profile.daysPerWeek || 3, 1, 7);
  const goal = params.goal;

  const PUSH = ['chest', 'shoulders', 'triceps'];
  const PULL = ['back', 'rear_delts', 'biceps'];
  const LEGS = ['quads', 'hamstrings', 'glutes', 'calves'];
  const UPPER = [...PUSH, ...PULL, 'side_delts'];
  const LOWER = [...LEGS, 'abs'];
  const FULL = ['quads', 'hamstrings', 'glutes', 'chest', 'back', 'shoulders', 'biceps', 'triceps', 'abs'];

  let sessions: SplitSession[];

  // A forced split (trial-sequence / explicit split preference) overrides the goal-driven
  // default for the general strength goals. Powerlifting / athletic / team-sport keep their
  // specialised splits (a "bro split" makes no sense for a meet peak).
  const generalGoal = goal === 'hypertrophy' || goal === 'general_fitness';
  const effectiveSplit =
    forcedSplit ??
    (generalGoal && profile.splitPreference && profile.splitPreference !== 'unsure'
      ? profile.splitPreference
      : undefined);

  if (goal === 'strength_powerlifting') {
    const S: SplitSession = { name: 'Squat Focus', focus: 'squat', mainLift: 'squat', muscles: ['quads', 'glutes', 'hamstrings', 'abs'] };
    const B: SplitSession = { name: 'Bench Focus', focus: 'bench', mainLift: 'bench', muscles: ['chest', 'triceps', 'shoulders', 'back'] };
    const D: SplitSession = { name: 'Deadlift Focus', focus: 'deadlift', mainLift: 'deadlift', muscles: ['hamstrings', 'back', 'glutes', 'traps'] };
    const A: SplitSession = { name: 'Upper Accessory', focus: 'accessory', muscles: ['back', 'chest', 'biceps', 'triceps', 'rear_delts'] };
    const table: Record<number, SplitSession[]> = {
      1: [{ name: 'Full Power', focus: 'squat', mainLift: 'squat', muscles: FULL }],
      2: [S, B],
      3: [S, B, D],
      4: [S, B, D, A],
      5: [S, B, D, { name: 'Squat + Bench Volume', focus: 'squat', mainLift: 'squat', muscles: ['quads', 'chest', 'triceps'] }, A],
      6: [S, B, D, { name: 'Squat + Bench Volume', focus: 'squat', mainLift: 'squat', muscles: ['quads', 'chest'] }, A, { name: 'Deadlift + Back Volume', focus: 'deadlift', mainLift: 'deadlift', muscles: ['hamstrings', 'back', 'biceps'] }],
    };
    sessions = table[Math.min(days, 6)] ?? table[3]!;
  } else if (goal === 'athletic_power') {
    const LP: SplitSession = { name: 'Lower Power', focus: 'power', power: true, muscles: ['quads', 'glutes', 'hamstrings'] };
    const US: SplitSession = { name: 'Upper Strength', focus: 'strength', muscles: [...PUSH, ...PULL] };
    const TP: SplitSession = { name: 'Total-Body Power', focus: 'power', power: true, muscles: ['full_body', 'quads', 'back'] };
    const LS: SplitSession = { name: 'Lower Strength', focus: 'strength', muscles: ['quads', 'hamstrings', 'glutes', 'calves'] };
    const table: Record<number, SplitSession[]> = {
      1: [TP],
      2: [LP, US],
      3: [LP, US, LS],
      4: [LP, US, LS, TP],
      5: [LP, US, LS, TP, { name: 'Accessory + Core', focus: 'accessory', muscles: ['biceps', 'triceps', 'abs', 'calves'] }],
      6: [LP, US, LS, TP, { name: 'Upper Power', focus: 'power', power: true, muscles: ['chest', 'back', 'shoulders'] }, { name: 'Accessory + Core', focus: 'accessory', muscles: ['biceps', 'triceps', 'abs'] }],
    };
    sessions = table[Math.min(days, 6)] ?? table[3]!;
  } else if (goal === 'team_sport') {
    const inSeason = profile.seasonPhase === 'in_season';
    const FS: SplitSession = { name: 'Full-Body Strength', focus: 'strength', muscles: ['quads', 'glutes', 'chest', 'back', 'abs'] };
    const PWR: SplitSession = { name: 'Power + Plyometrics', focus: 'power', power: true, muscles: ['quads', 'glutes', 'full_body'] };
    const LU: SplitSession = { name: 'Lower + Posterior', focus: 'strength', muscles: ['hamstrings', 'glutes', 'quads', 'calves'] };
    const UP: SplitSession = { name: 'Upper + Trunk', focus: 'strength', muscles: [...PUSH, ...PULL, 'abs'] };
    if (inSeason) {
      sessions = days >= 2 ? [PWR, FS] : [FS];
      trace.push('In-season team sport: capped to 1-2 short maintenance sessions to spare the legs for matches (Ronnestad 2011).');
    } else {
      const table: Record<number, SplitSession[]> = {
        1: [FS], 2: [LU, UP], 3: [PWR, LU, UP], 4: [PWR, LU, UP, FS],
        5: [PWR, LU, UP, FS, { name: 'Speed + Conditioning', focus: 'power', power: true, muscles: ['full_body'] }],
      };
      sessions = table[Math.min(days, 5)] ?? table[3]!;
    }
  } else {
    // hypertrophy / general_fitness — honour the split preference (addendum §1) when set.
    const FB = (n: number): SplitSession => ({ name: `Full Body ${String.fromCharCode(64 + n)}`, focus: 'general', muscles: FULL });
    const U = (n: number): SplitSession => ({ name: `Upper ${n}`, focus: 'general', muscles: UPPER });
    const L = (n: number): SplitSession => ({ name: `Lower ${n}`, focus: 'general', muscles: LOWER });
    const P: SplitSession = { name: 'Push', focus: 'general', muscles: PUSH.concat('side_delts') };
    const PLs: SplitSession = { name: 'Pull', focus: 'general', muscles: PULL };
    const LG: SplitSession = { name: 'Legs', focus: 'general', muscles: LEGS.concat('abs') };
    const CHEST: SplitSession = { name: 'Chest Day', focus: 'general', muscles: ['chest', 'front_delts', 'triceps'] };
    const BACKD: SplitSession = { name: 'Back Day', focus: 'general', muscles: ['back', 'rear_delts', 'biceps', 'traps'] };
    const SHOULD: SplitSession = { name: 'Shoulders Day', focus: 'general', muscles: ['shoulders', 'side_delts', 'rear_delts'] };
    const ARMS: SplitSession = { name: 'Arms Day', focus: 'general', muscles: ['biceps', 'triceps', 'forearms'] };
    const LEGD: SplitSession = { name: 'Legs Day', focus: 'general', muscles: LEGS.concat('abs') };
    const lowerExp = params.experienceLevel === 'beginner' || params.experienceLevel === 'novice';

    if (effectiveSplit === 'ppl') {
      // Push / Pull / Legs, scaled to days (repeat the cycle for ≥4 days).
      const cycle: SplitSession[] = [P, PLs, LG];
      sessions = [];
      for (let i = 0; i < days; i++) {
        const base = cycle[i % 3]!;
        const rep = Math.floor(i / 3);
        sessions.push(rep === 0 ? base : { ...base, name: `${base.name} ${rep + 1}` });
      }
    } else if (effectiveSplit === 'upper_lower') {
      // Upper / Lower alternating, scaled to days.
      sessions = [];
      let uCount = 0;
      let lCount = 0;
      for (let i = 0; i < days; i++) {
        if (i % 2 === 0) sessions.push(U(++uCount));
        else sessions.push(L(++lCount));
      }
    } else if (effectiveSplit === 'body_part') {
      // Body-part split ("bro split"): chest/back/shoulders/arms/legs, scaled to days.
      const cycle: SplitSession[] = [CHEST, BACKD, SHOULD, ARMS, LEGD];
      sessions = [];
      for (let i = 0; i < days; i++) {
        const base = cycle[i % cycle.length]!;
        const rep = Math.floor(i / cycle.length);
        sessions.push(rep === 0 ? base : { ...base, name: `${base.name} ${rep + 1}` });
      }
    } else {
      // No preference / 'unsure' with no forced split → the evidence-default split.
      if (days <= 1) sessions = [FB(1)];
      else if (days === 2) sessions = [U(1), L(1)];
      else if (days === 3) sessions = lowerExp || goal === 'general_fitness' ? [FB(1), FB(2), FB(3)] : [P, PLs, LG];
      else if (days === 4) sessions = [U(1), L(1), U(2), L(2)];
      else if (days === 5) sessions = [U(1), L(1), P, PLs, LG];
      else sessions = [P, PLs, LG, { name: 'Push 2', focus: 'general', muscles: PUSH.concat('side_delts') }, { name: 'Pull 2', focus: 'general', muscles: PULL }, { name: 'Legs 2', focus: 'general', muscles: LEGS.concat('abs') }];
      if (days === 7) {
        sessions.push({ name: 'Weak-Point / Rest', focus: 'accessory', muscles: profile.musclePriorities && profile.musclePriorities.length ? mapPriorities(profile.musclePriorities) : ['abs', 'calves'] });
      }
    }
  }

  // Build muscle → [session indices] map (how many times/week each muscle is trained).
  const muscleDays: Record<string, number[]> = {};
  sessions.forEach((s, i) =>
    s.muscles.forEach((m) => {
      (muscleDays[m] ||= []).push(i);
    })
  );
  trace.push(`Split for ${days} day(s): ${sessions.map((s) => s.name).join(' · ')}.`);
  return { sessions, muscleDays, days };
}

function mapPriorities(prio: string[] | null | undefined): string[] {
  const out = new Set<string>();
  for (const p of prio || []) {
    const l = String(p).toLowerCase();
    if (l === 'arms') { out.add('biceps'); out.add('triceps'); }
    else if (l === 'legs') { out.add('quads'); out.add('hamstrings'); out.add('glutes'); }
    else if (l === 'shoulders') { out.add('shoulders'); out.add('side_delts'); }
    else out.add(l);
  }
  return [...out];
}

// ── B.3 allocateVolume: per-muscle weekly sets, ramped MEV→MAV for accumulation week w ──
function allocateVolume(
  muscleDays: Record<string, number[]>,
  params: DerivedParamsV2,
  priorities: string[] | null | undefined,
  week: number,
  isDeload: boolean,
  inSeasonMaintenance: boolean
): Record<string, number> {
  const prioritySet = new Set(mapPriorities(priorities || []));
  const out: Record<string, number> = {};
  for (const m of Object.keys(muscleDays)) {
    const lm = landmarkFor(m);
    let base = params.volumeStart;
    if (SMALL_MUSCLES.has(m)) base = Math.round(base * 0.6);
    if (prioritySet.has(m)) base += 3;
    base *= params.volumeMult;
    let sets: number;
    if (isDeload) {
      sets = Math.max(lm.mv, Math.round(base * 0.5));
    } else if (inSeasonMaintenance) {
      sets = clamp(Math.round(base / 3), Math.min(2, lm.mev), lm.mev);
    } else {
      const ramp = base + params.volumeStep * (week - 1);
      sets = clamp(Math.round(ramp), lm.mev, lm.mrv);
    }
    out[m] = sets;
  }
  return out;
}

// ── B.4 distributeToSessions: weekly sets → per-session exercise slots (capped) ──
// Refinement (b) — STRICT role tagging: only the FIRST exercise of a non-small muscle
// on its FIRST (heaviest) exposure is 'primary'; the second is 'secondary'; the rest
// 'accessory'. Small muscles never get 'primary'. This bounds primary-tag density so
// role-based rep/RIR differentiation is visible (the prototype tagged nearly all lifts
// primary on beginner full-body days).
function distributeToSessions(
  sessions: SplitSession[],
  muscleDays: Record<string, number[]>,
  weekVolume: Record<string, number>,
  params: DerivedParamsV2,
  trace: string[],
  week: number
): BuiltSession[] {
  const SETS_PER_EX = 3;
  const built: BuiltSession[] = sessions.map((s) => ({
    name: s.name,
    focus: s.focus,
    mainLift: s.mainLift ?? null,
    power: !!s.power,
    slots: [],
    cardio: [],
  }));

  for (const m of Object.keys(muscleDays)) {
    const dayIdxs = muscleDays[m]!;
    const freq = dayIdxs.length;
    let perSession = Math.ceil((weekVolume[m] ?? 0) / freq);
    if (perSession > params.perSessionCap) {
      perSession = params.perSessionCap;
      if (week === 1) {
        trace.push(`Per-session cap: ${m} weekly target trimmed to ${perSession}x${freq} sessions to stay <=${params.perSessionCap} sets/session (junk-volume ceiling, RESEARCH.md §4.2).`);
      }
    }
    if (perSession <= 0) continue;
    const nEx = Math.max(1, Math.round(perSession / SETS_PER_EX));
    const setsEach = Math.max(2, Math.round(perSession / nEx));
    dayIdxs.forEach((di, order) => {
      const target = built[di];
      if (!target) return;
      for (let e = 0; e < nEx; e++) {
        // Strict role tagging: primary only for the first exercise of a large muscle on
        // its first weekly exposure; secondary for the second exercise; else accessory.
        let role: SlotRole;
        if (SMALL_MUSCLES.has(m)) role = 'accessory';
        else if (e === 0 && order === 0) role = 'primary';
        else if (e === 0 && order > 0) role = 'secondary';
        else if (e === 1) role = 'secondary';
        else role = 'accessory';
        target.slots.push({ muscle: m, role, sets: setsEach, exposureIndex: order, exposures: freq });
      }
    });
  }

  // Powerlifting: pin the competition lift as THE primary of its session.
  const MAIN_MUSCLE: Record<'squat' | 'bench' | 'deadlift', string> = { squat: 'quads', bench: 'chest', deadlift: 'hamstrings' };
  for (const s of built) {
    if (!s.mainLift) continue;
    const muscle = MAIN_MUSCLE[s.mainLift];
    s.slots.forEach((sl) => { if (sl.muscle === muscle && sl.role === 'primary') sl.role = 'secondary'; });
    const primarySets = Math.max(3, Math.round(params.perSessionCap * 0.6));
    s.slots.unshift({ muscle, role: 'primary', mainLift: s.mainLift, sets: Math.min(5, primarySets), exposureIndex: 0, exposures: 1 });
  }
  return built;
}

// ── session-length cap: trim total exercises/session by sessionMinutes ──
function maxExercisesForDuration(minutes: number): number {
  if (minutes <= 15) return 3;
  if (minutes <= 30) return 5;
  if (minutes <= 45) return 7;
  if (minutes <= 60) return 9;
  if (minutes <= 75) return 11;
  if (minutes <= 90) return 13;
  return 16;
}
function capByDuration(built: BuiltSession[], minutes: number, trace: string[], week: number): BuiltSession[] {
  const cap = maxExercisesForDuration(minutes);
  for (const s of built) {
    if (s.slots.length <= cap) continue;
    const before = s.slots.length;
    const ranked = s.slots
      .map((sl, i) => ({ sl, i, r: sl.role === 'primary' ? 0 : sl.role === 'secondary' ? 1 : 2 }))
      .sort((a, b) => a.r - b.r || a.i - b.i);
    s.slots = ranked.slice(0, cap).sort((a, b) => a.i - b.i).map((x) => x.sl);
    if (week === 1) {
      trace.push(`Session-length recipe (${minutes} min): "${s.name}" trimmed ${before}->${cap} exercises (kept the highest-priority lifts).`);
    }
  }
  return built;
}

// ── B.5 fillExercises: pick a concrete exercise per slot ──
// Refinement (a) — squat-pattern cap: per session, allow at most params.squatPatternCap
// DISTINCT squat-pattern (movement_pattern === 'squat') lifts; overflow squat slots are
// filled from lunge/hinge alternatives or dropped, so novices aren't stacked with 3+ squats.
function fillExercises(
  built: BuiltSession[],
  profile: EngineInputsV2,
  params: DerivedParamsV2,
  weekISO: string,
  trace: string[]
): BuiltSession[] {
  const equip = new Set(
    profile.equipment && profile.equipment.length
      ? profile.equipment
      : ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'bench', 'rack', 'pullup_bar', 'bands', 'kettlebell']
  );
  const injuries = new Set((profile.injuries || []).map((x) => String(x).toLowerCase()));
  // Stage-2 meta-change: user-disliked exercise ids to keep out of selection.
  // Absent by default, so pre-Stage-2 inputs are byte-identical (determinism).
  const excluded = new Set((profile.excludeExerciseIds || []).map((x) => String(x)));
  const equipOk = (ex: CatalogExerciseV2) => ex.equipment.some((eq) => equip.has(eq));
  const contra = (ex: CatalogExerciseV2) => ex.contraindications.some((c) => injuries.has(c));
  const notExcluded = (ex: CatalogExerciseV2) => !excluded.has(ex.id);
  const MAIN_LIFT_NAME: Record<'squat' | 'bench' | 'deadlift', string> = { squat: 'Back Squat', bench: 'Bench Press', deadlift: 'Conventional Deadlift' };

  built.forEach((session, sIdx) => {
    const seed = seedFrom(String(profile.userId || 'anon') + weekISO + ':' + sIdx);
    const rng = mulberry32(seed);
    const shuffled = shuffle(CATALOG_V2, rng);
    const used = new Set<string>();
    let squatPatternCount = 0; // refinement (a) — count of squat-pattern lifts used this session

    const filled: WorkingSlot[] = session.slots.map((slot): WorkingSlot => {
      // Powerlifting main-lift slot → pin the exact competition lift.
      if (slot.mainLift) {
        const want = MAIN_LIFT_NAME[slot.mainLift];
        const exact = CATALOG_V2.find((ex) => ex.name === want && equipOk(ex) && !contra(ex));
        const chosen =
          exact ||
          shuffled.find(
            (ex) =>
              equipOk(ex) &&
              !contra(ex) &&
              !used.has(ex.id) &&
              ((slot.mainLift === 'squat' && ex.movement_pattern === 'squat' && ex.is_compound) ||
                (slot.mainLift === 'bench' && ex.movement_pattern === 'horizontal_push' && ex.is_compound) ||
                (slot.mainLift === 'deadlift' && ex.movement_pattern === 'hinge' && ex.is_compound))
          );
        if (chosen) {
          used.add(chosen.id);
          if (chosen.movement_pattern === 'squat') squatPatternCount++;
          if (!exact && injuries.size) trace.push(`Injury swap in "${session.name}": ${chosen.name} in place of ${want} (competition lift contraindicated for your injury).`);
          return { ...slot, exercise_id: chosen.id, name: chosen.name, pattern: chosen.movement_pattern, is_compound: true, muscles: chosen.muscles, mainLiftKey: slot.mainLift };
        }
      }

      const wantCompound = slot.role === 'primary';
      const strengthOnly = !session.power;
      // Refinement (a): once the squat-pattern cap is hit, exclude further squat-pattern lifts.
      const squatCapReached = squatPatternCount >= params.squatPatternCap;
      let pool = shuffled.filter(
        (ex) =>
          (ex.primaryMuscle === slot.muscle || ex.muscles.includes(slot.muscle)) &&
          equipOk(ex) &&
          !used.has(ex.id) &&
          (wantCompound ? ex.is_compound : true) &&
          (strengthOnly ? !(ex.plyo || ex.power) : true) &&
          (squatCapReached ? ex.movement_pattern !== 'squat' : true)
      );
      // Stage-2 exclusion: drop disliked exercises, but never empty a slot — if
      // the exclusion would leave nothing, keep the un-excluded pool.
      if (excluded.size) {
        const kept = pool.filter(notExcluded);
        if (kept.length) pool = kept;
      }

      if (session.power && slot.role === 'primary') {
        const p = pool.filter((ex) => ex.power || ex.plyo);
        if (p.length) pool = p;
      }

      // Injury-aware safer-swap (RESEARCH.md §9 / DESIGN_SPEC §B.5).
      let safeSwap = false;
      let swapNote = '';
      const safePool = pool.filter((ex) => !contra(ex));
      if (safePool.length) {
        if (injuries.size) {
          const preferred = safePool.filter((ex) => ex.safeFor.some((r) => injuries.has(r)));
          if (preferred.length) {
            pool = preferred;
            safeSwap = true;
            const first = preferred[0]!;
            const region = [...injuries].find((r) => first.safeFor.includes(r));
            swapNote = ` (safer choice for ${region ?? 'your injury'})`;
          } else pool = safePool;
        } else pool = safePool;
      } else if (pool.length) {
        const swap = shuffled.find(
          (ex) =>
            (ex.primaryMuscle === slot.muscle || ex.muscles.includes(slot.muscle)) &&
            equipOk(ex) &&
            !contra(ex) &&
            !used.has(ex.id) &&
            (squatCapReached ? ex.movement_pattern !== 'squat' : true)
        );
        if (swap) { pool = [swap]; safeSwap = true; swapNote = ' (substituted - original pattern contraindicated for your injury)'; }
        else pool = [];
      }

      const chosen = pool[0];
      if (!chosen) return { ...slot, dropped: true };
      used.add(chosen.id);
      if (chosen.movement_pattern === 'squat') squatPatternCount++;
      if (safeSwap) trace.push(`Injury swap in "${session.name}": ${chosen.name} for the ${slot.muscle} slot${swapNote}.`);
      return { ...slot, exercise_id: chosen.id, name: chosen.name, pattern: chosen.movement_pattern, is_compound: chosen.is_compound, muscles: chosen.muscles, plyo: chosen.plyo, power: chosen.power };
    });

    session.slots = filled.filter((s) => !s.dropped);
  });
  return built;
}

// ── B.6 assignLoadingPerSlot: rep range + %1RM + RIR by goal × week × role ──
function assignLoading(
  built: BuiltSession[],
  profile: EngineInputsV2,
  params: DerivedParamsV2,
  week: number,
  accumulationWeeks: number,
  isDeload: boolean
): BuiltSession[] {
  const lifts = profile.lifts || {};

  const e1rmFor = (slot: WorkingSlot): { e1rm: number; factor: number; label: string } | undefined => {
    const n = (slot.name || '').toLowerCase();
    if ((slot.mainLiftKey === 'squat' || n === 'back squat') && lifts.squat) return { e1rm: lifts.squat, factor: 1, label: 'squat' };
    if ((slot.mainLiftKey === 'bench' || n === 'bench press') && lifts.bench) return { e1rm: lifts.bench, factor: 1, label: 'bench' };
    if ((slot.mainLiftKey === 'deadlift' || n === 'conventional deadlift') && lifts.deadlift) return { e1rm: lifts.deadlift, factor: 1, label: 'deadlift' };
    if (n === 'overhead press' && lifts.ohp) return { e1rm: lifts.ohp, factor: 1, label: 'OHP' };
    if (n === 'front squat' && lifts.squat) return { e1rm: lifts.squat, factor: 0.85, label: 'squat (front-squat ~85%)' };
    if ((n === 'close-grip bench press' || n === 'floor press') && lifts.bench) return { e1rm: lifts.bench, factor: 0.9, label: 'bench (variant ~90%)' };
    if (n === 'romanian deadlift' && lifts.deadlift) return { e1rm: lifts.deadlift, factor: 0.75, label: 'deadlift (RDL ~75%)' };
    if (n === 'trap-bar deadlift' && lifts.deadlift) return { e1rm: lifts.deadlift, factor: 1.05, label: 'deadlift (trap-bar ~105%)' };
    return undefined;
  };

  const bw = profile.bodyweightKg || null;
  const blockPos = isDeload ? 0 : clamp((week - 1) / Math.max(1, accumulationWeeks - 1), 0, 1);
  const weekAdj = isDeload ? +2 : Math.round((1 - blockPos) * 1);

  for (const session of built) {
    session.slots.forEach((slot) => {
      const zone = params.repZones[slot.role] ?? params.repZones.accessory;
      let repLo = zone[0];
      let repHi = zone[1];
      let pct = zone[2];

      if ((params.model === 'dup' || params.model === 'undulating') && slot.exposures > 1) {
        if (slot.exposureIndex % 2 === 1) {
          repLo = Math.round(repLo * 1.5);
          repHi = Math.round(repHi * 1.4);
          pct = Math.max(0.6, pct - 0.1);
        }
      }
      if (session.power && slot.role === 'primary') { repLo = 2; repHi = 5; }

      const bandLo = params.rirBand[0];
      const bandHi = params.rirBand[1];
      const bandCenter = (bandLo + bandHi) / 2;
      const floor = slot.is_compound ? params.rirFloor.compound : params.rirFloor.isolation;
      const shift = params.noviceRirAdj + weekAdj + params.rirShift;
      let rir = clamp(bandCenter + shift, floor, bandHi + 1);
      if (isDeload) rir = clamp(bandHi + 1, floor, 5);
      if (session.power && slot.role === 'primary') rir = Math.max(rir, 4);
      rir = Math.round(rir);
      const rpe = clamp(10 - rir, 4, 10);

      const e1meta = e1rmFor(slot);
      const e1 = e1meta ? e1meta.e1rm * e1meta.factor : 0;
      let weightKg: number | null = null;
      let pct1rm: number | null = null;
      let loadNote = '';
      if (e1 && e1 > 0) {
        pct1rm = pctForReps(repHi);
        const rirDiscount = 1 - 0.033 * Math.max(0, rir - 1);
        weightKg = round2_5(e1 * pct1rm * rirDiscount);
        const shownPct = Math.round(pct1rm * rirDiscount * 100);
        loadNote = e1meta!.factor === 1 ? `~${shownPct}%1RM @ RIR ${rir}` : `~${shownPct}% of ${e1meta!.label}`;
      } else if (bw && (slot.name || '').toLowerCase().includes('push-up')) {
        loadNote = 'bodyweight';
      } else {
        loadNote = `RPE ${rpe} (no logged 1RM - find your working weight over the first sessions)`;
      }

      slot.reps = repLo === repHi ? `${repLo}` : `${repLo}-${repHi}`;
      slot.rirTarget = rir;
      slot.rpe = rpe;
      slot.pct1rm = pct1rm;
      slot.weight_kg = weightKg;
      slot.rest_seconds = slot.is_compound ? (repLo <= 5 ? 210 : 150) : 75;
      slot.priority = slot.role === 'primary' ? 1 : slot.role === 'secondary' ? 2 : 3;
      slot.loadNote = loadNote;
      slot.week_intent = isDeload ? 'deload' : `${params.model} accumulation wk${week}`;
    });
  }
  return built;
}

// ── B.9 peakingOverlay: powerlifting phases + attempts, backward from meet ──
function peakingPlan(profile: EngineInputsV2): PeakingReport | null {
  const w = profile.meet && profile.meet.weeksToMeet;
  if (!w) return null;
  let phases: Array<[string, number]>;
  if (w >= 12) phases = [['Accumulation', Math.min(6, w - 6)], ['Strength', 4], ['Peak', 2]];
  else if (w >= 8) phases = [['Strength', w - 3], ['Peak', 3]];
  else if (w >= 6) phases = [['Strength', w - 3], ['Peak', 3]];
  else if (w >= 4) phases = [['Strength', w - 2], ['Peak', 2]];
  else phases = [['Peak/Taper', Math.max(1, w)]];

  const t = profile.meet?.target1RM || {};
  const src: Record<'squat' | 'bench' | 'deadlift', number | undefined> = {
    squat: t.squat ?? profile.lifts?.squat,
    bench: t.bench ?? profile.lifts?.bench,
    deadlift: t.deadlift ?? profile.lifts?.deadlift,
  };
  const attempts: Partial<Record<'squat' | 'bench' | 'deadlift', AttemptSet>> = {};
  for (const l of ['squat', 'bench', 'deadlift'] as const) {
    const v = src[l];
    if (v) attempts[l] = { opener: round2_5(0.91 * v), second: round2_5(0.96 * v), third: round2_5(v) };
  }
  return { weeksToMeet: w, phases, attempts };
}

function peakWeekPrescription(weeksOut: number): { pct: number; reps: string; rpe: number; note: string } {
  if (weeksOut >= 3) return { pct: 0.9, reps: '2', rpe: 8, note: 'Top double ~90% - volume cut sharply, intensity high.' };
  if (weeksOut === 2) return { pct: 0.95, reps: '1', rpe: 9, note: 'Heavy single ~95% (near opener/2nd) - very few sets.' };
  return { pct: 0.9, reps: '1', rpe: 7, note: 'Opener-simulation single ~90%, then light technical work; taper into the meet.' };
}

// ── B.10 sportPhaseOverlay ──
function applySportOverlay(built: BuiltSession[], profile: EngineInputsV2, params: DerivedParamsV2, trace: string[]): BuiltSession[] {
  const phase = profile.seasonPhase || 'off_season';
  const gameDay = typeof profile.gameDay === 'number' ? profile.gameDay : null;

  built.forEach((s) => {
    if (s.power) s.cardio.push({ kind: 'plyometrics', contacts: params.plyoContacts, description: `${params.plyoContacts} foot-contacts (box jumps / bounds / pogos), 48-72h from the next intense plyo session.` });
  });
  built.forEach((s) => { s.warmup = 'FIFA 11+ style neuromuscular warm-up (~15 min: running, strength, plyo, balance) - ~30-50% injury reduction.'; });

  if (gameDay != null) {
    const offsets = built.length >= 2 ? ['MD-3', 'MD-1'] : ['MD-3'];
    built.forEach((s, i) => { s.mdOffset = offsets[i] ?? `MD-${3 - i}`; });
    trace.push(`Game day = ${WEEKDAY[gameDay] ?? 'Sat'}: strength placed at MD-3 (far from match, CNS-loading), priming at MD-1; conditioning kept >=6h from heavy legs (concurrent-training guard, RESEARCH.md §7.4).`);
  }

  if (phase === 'in_season') trace.push('In-season phase: strength held at maintenance (lower volume, higher relative intensity, 3-6 reps); leg volume kept low to preserve match readiness.');
  else if (phase === 'pre_season') trace.push('Pre-season phase: converting base to power/speed - strength-speed lifts + intensive plyometrics + sprint/COD.');
  else trace.push('Off-season phase: highest lifting volume - hypertrophy + max-strength base + general conditioning.');
  return built;
}

// ── shared week-building loop (used by generatePlanV2 and the trial-sequence) ──
interface BuildContext {
  splitSessions: SplitSession[];
  muscleDays: Record<string, number[]>;
  days: number;
  params: DerivedParamsV2;
  profile: EngineInputsV2;
  peaking: PeakingReport | null;
  inSeasonMaintenance: boolean;
  totalWeeks: number;
  weekOffset: number; // number ISO offset so trial blocks vary exercise selection between blocks
  trace: string[]; // week-1 trace sink
}

function buildWeeks(bctx: BuildContext): PlanWeekV2[] {
  const { splitSessions, muscleDays, days, params, profile, peaking, inSeasonMaintenance, totalWeeks, weekOffset, trace } = bctx;
  const accum = params.accumulationWeeks;

  let plPhaseByWeek: string[] | null = null;
  if (peaking) {
    plPhaseByWeek = [];
    let wk = 1;
    for (const [name, len] of peaking.phases) {
      for (let i = 0; i < len && wk <= totalWeeks; i++) { plPhaseByWeek.push(name); wk++; }
    }
    while (plPhaseByWeek.length < totalWeeks) plPhaseByWeek.push('Peak/Taper');
  }

  const weeks: PlanWeekV2[] = [];
  for (let w = 1; w <= totalWeeks; w++) {
    let isDeload: boolean;
    let phaseLabel: string | null = null;
    if (peaking && plPhaseByWeek) {
      phaseLabel = plPhaseByWeek[w - 1] ?? 'Peak/Taper';
      isDeload = false;
    } else {
      isDeload = w === accum + 1 || (totalWeeks > accum + 1 && w % (accum + 1) === 0);
    }

    const accumWeek = peaking ? w : isDeload ? accum : ((w - 1) % (accum + 1)) + 1;
    const weekVolume = allocateVolume(muscleDays, params, profile.musclePriorities, accumWeek, isDeload, inSeasonMaintenance);

    const wkTrace = w === 1 ? trace : [];
    let built = distributeToSessions(splitSessions, muscleDays, weekVolume, params, wkTrace, accumWeek);
    built = capByDuration(built, profile.sessionMinutes || 60, wkTrace, w);
    built = fillExercises(built, profile, params, `w${w + weekOffset}`, wkTrace);
    built = assignLoading(built, profile, params, accumWeek, accum, isDeload);

    if (profile.goal === 'team_sport') built = applySportOverlay(built, profile, params, w === 1 ? trace : []);

    if (peaking && phaseLabel && /Peak/.test(phaseLabel)) {
      const weeksOut = totalWeeks - w + 1;
      const rx = peakWeekPrescription(weeksOut);
      built.forEach((s) =>
        s.slots.forEach((sl) => {
          const isMain = sl.mainLiftKey === 'squat' || sl.mainLiftKey === 'bench' || sl.mainLiftKey === 'deadlift';
          if (isMain && sl.role === 'primary') {
            sl.reps = rx.reps;
            sl.rpe = rx.rpe;
            sl.rirTarget = 10 - rx.rpe;
            const e1 = profile.lifts && sl.mainLiftKey ? profile.lifts[sl.mainLiftKey] : null;
            if (e1) { sl.pct1rm = rx.pct; sl.weight_kg = round2_5(e1 * rx.pct); sl.loadNote = `${Math.round(rx.pct * 100)}%1RM`; }
            sl.week_intent = `${phaseLabel} (${weeksOut}wk out)`;
            sl.peakNote = rx.note;
          }
        })
      );
    }

    const built2 = assignDayLabels(built, profile, days);
    weeks.push({
      week_number: w,
      phase: phaseLabel || (isDeload ? 'Deload' : `${params.model} accumulation`),
      isDeload,
      sessions: built2.map(fmtSession),
    });
  }
  return weeks;
}

function assignDayLabels(built: BuiltSession[], profile: EngineInputsV2, _days: number): BuiltSession[] {
  const td = (profile.trainingDays || []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
  return built.map((s, i) => {
    let label: string;
    if (td.length >= built.length) label = `${WEEKDAY[td[i]!] ?? 'Day'} - ${s.name}`;
    else label = `Day ${i + 1} - ${s.name}`;
    if (s.mdOffset) label += ` [${s.mdOffset}]`;
    return { ...s, day_label: label };
  });
}

function fmtSession(s: BuiltSession): PlanSessionV2 {
  return {
    day_label: s.day_label ?? s.name,
    mdOffset: s.mdOffset ?? null,
    warmup: s.warmup ?? null,
    slots: s.slots.map(
      (sl): PlanSlotV2 => ({
        exercise_id: sl.exercise_id ?? '',
        name: sl.name ?? '',
        muscle: sl.muscle,
        muscles: sl.muscles ?? [],
        pattern: (sl.pattern ?? 'core') as MovementPattern,
        is_compound: !!sl.is_compound,
        priority: sl.priority ?? 3,
        sets: sl.sets,
        reps: sl.reps ?? '',
        rpe: sl.rpe ?? 7,
        rest_seconds: sl.rest_seconds ?? 90,
        weight_kg: sl.weight_kg ?? null,
        load_note: sl.loadNote ?? '',
        role: sl.role,
        rir_target: sl.rirTarget ?? 2,
        pct_1rm: sl.pct1rm ?? null,
        week_intent: sl.week_intent ?? '',
        peak_note: sl.peakNote ?? null,
        main_lift_key: sl.mainLiftKey ?? null,
      })
    ),
    cardio: s.cardio,
  };
}

function buildVolumeReport(
  muscleDays: Record<string, number[]>,
  params: DerivedParamsV2,
  profile: EngineInputsV2,
  accum: number,
  inSeason: boolean
): VolumeReport {
  const wk1 = allocateVolume(muscleDays, params, profile.musclePriorities, 1, false, inSeason);
  const wkPeak = allocateVolume(muscleDays, params, profile.musclePriorities, accum, false, inSeason);
  const per: Record<string, PerMuscleVolume> = {};
  for (const m of Object.keys(muscleDays)) {
    const lm = landmarkFor(m);
    per[m] = { freqPerWeek: muscleDays[m]!.length, week1Sets: wk1[m] ?? 0, peakWeekSets: wkPeak[m] ?? 0, mev: lm.mev, mrv: lm.mrv };
  }
  return { perMuscleWeeklySets: per };
}

function buildReasoning(profile: EngineInputsV2, params: DerivedParamsV2, peaking: PeakingReport | null, inSeason: boolean): string {
  const bits: string[] = [];
  bits.push(`Built parametrically for a ${params.experienceLevel} lifter (~${params.trainingAgeYears}yr training age) chasing ${labelGoal(params.goal)}.`);
  if (peaking) bits.push(`Peaking backward from your meet in ${peaking.weeksToMeet} weeks: ${peaking.phases.map(([n, l]) => `${n} ${l}wk`).join(' -> ')}.`);
  else if (inSeason) bits.push('In-season maintenance: one to two short high-intensity sessions per week hold your strength and speed without draining your legs (Ronnestad 2011).');
  else bits.push(`Volume ramps from ~MEV toward MRV over ${params.accumulationWeeks} weeks, then a deload - ${params.model} progression, rep ranges vary by day and lift role, and RIR is calibrated to your experience.`);
  return bits.join(' ');
}
function labelGoal(g: string): string {
  const map: Record<string, string> = {
    hypertrophy: 'muscle growth',
    strength_powerlifting: 'maximal strength',
    general_fitness: 'general fitness / recomp',
    athletic_power: 'athletic power',
    team_sport: 'team-sport performance',
  };
  return map[g] ?? g;
}

// ── main entry: generatePlanV2 ──
export function generatePlanV2Internal(
  profile: EngineInputsV2,
  weekISOSeed: string,
  forcedSplit?: 'ppl' | 'upper_lower' | 'body_part'
): PlanV2 {
  const trace: string[] = [];
  const { params, trace: pTrace } = deriveParams(profile);
  trace.push(...pTrace);

  const inSeasonMaintenance = profile.goal === 'team_sport' && profile.seasonPhase === 'in_season';
  const { sessions: splitSessions, muscleDays, days } = selectSplit(profile, params, trace, forcedSplit);

  const peaking = profile.goal === 'strength_powerlifting' ? peakingPlan(profile) : null;
  const accum = params.accumulationWeeks;
  let totalWeeks: number;
  if (peaking && profile.meet) totalWeeks = Math.min(profile.meet.weeksToMeet, 12);
  else totalWeeks = profile.weeksToGenerate || accum + 1;

  const weeks = buildWeeks({
    splitSessions, muscleDays, days, params, profile, peaking, inSeasonMaintenance,
    totalWeeks, weekOffset: seedFrom(weekISOSeed) % 97, trace,
  });

  const reasoning = buildReasoning(profile, params, peaking, inSeasonMaintenance);
  const plan: PlanV2 = {
    engine: 'pf-engine-v2',
    reasoning,
    rule_trace: trace,
    splitPreference: profile.splitPreference,
    weeks,
    volumeReport: buildVolumeReport(muscleDays, params, profile, accum, inSeasonMaintenance),
  };
  if (!peaking) {
    const meso: MesocycleReport = { model: params.model, accumulationWeeks: accum, deloadWeek: accum + 1, totalWeeks };
    plan.mesocycle = meso;
  } else {
    plan.peaking = peaking;
  }
  if (profile.goal === 'team_sport') {
    plan.sportPlan = { sport: profile.sport, seasonPhase: profile.seasonPhase || 'off_season', gameDay: profile.gameDay ?? null };
  }
  return plan;
}

// Fixed 3-week trial block generator (addendum §2) — reused by index.generateTrialSequence.
export function buildTrialBlockWeeks(
  profile: EngineInputsV2,
  forcedSplit: 'ppl' | 'upper_lower' | 'body_part',
  weekISOSeed: string
): { weeks: PlanWeekV2[]; reasoning: string; rule_trace: string[]; volumeReport: VolumeReport } {
  const trace: string[] = [];
  const { params, trace: pTrace } = deriveParams(profile);
  trace.push(...pTrace);
  const inSeasonMaintenance = profile.goal === 'team_sport' && profile.seasonPhase === 'in_season';
  const { sessions: splitSessions, muscleDays, days } = selectSplit(profile, params, trace, forcedSplit);
  const accum = params.accumulationWeeks;

  const weeks = buildWeeks({
    splitSessions, muscleDays, days, params, profile, peaking: null, inSeasonMaintenance,
    totalWeeks: 3, weekOffset: seedFrom(weekISOSeed) % 97, trace,
  });
  const reasoning = buildReasoning(profile, params, null, inSeasonMaintenance);
  const volumeReport = buildVolumeReport(muscleDays, params, profile, accum, inSeasonMaintenance);
  return { weeks, reasoning, rule_trace: trace, volumeReport };
}
