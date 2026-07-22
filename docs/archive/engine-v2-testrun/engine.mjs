// engine.mjs — Engine v2 prototype: generatePlanV2(profile) → parametric mesocycle.
// Pure, deterministic (seeded), no network. Pipeline per DESIGN_SPEC.md §B.
// Output shape is a superset of v1's (DESIGN_SPEC.md §E): rpe = 10 − rirTarget.

import { CATALOG } from './catalog.mjs';
import {
  LANDMARKS, SMALL_MUSCLES, deriveParams, pctForReps, prilepinRepsPerSet,
  round2_5, clamp,
} from './params.mjs';

// ── deterministic PRNG (mulberry32) seeded by userId + week — reused from v1 concept ──
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedFrom(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0; return h >>> 0; }

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── B.2 selectSplit: days + goal + priorities → session archetypes + muscle→session map ──
// Each archetype lists the muscle buckets it trains. Buckets align with LANDMARKS keys.
function selectSplit(profile, params, trace) {
  const days = clamp(profile.daysPerWeek || 3, 1, 7);
  const goal = params.goal;
  const beginner = params.experienceLevel === 'beginner';

  // Muscle buckets we program for a general lifter.
  const PUSH = ['chest', 'shoulders', 'triceps'];
  const PULL = ['back', 'rear_delts', 'biceps'];
  const LEGS = ['quads', 'hamstrings', 'glutes', 'calves'];
  const UPPER = [...PUSH, ...PULL, 'side_delts'];
  const LOWER = [...LEGS, 'abs'];
  const FULL = ['quads', 'hamstrings', 'glutes', 'chest', 'back', 'shoulders', 'biceps', 'triceps', 'abs'];

  let sessions;
  if (goal === 'strength_powerlifting') {
    // SBD-centric (RESEARCH.md §5.2/§6). Each comp lift ≥2× where days allow.
    // mainLift pins the actual competition lift as a mandatory primary slot.
    const S = { name: 'Squat Focus', focus: 'squat', mainLift: 'squat', muscles: ['quads', 'glutes', 'hamstrings', 'abs'] };
    const B = { name: 'Bench Focus', focus: 'bench', mainLift: 'bench', muscles: ['chest', 'triceps', 'shoulders', 'back'] };
    const D = { name: 'Deadlift Focus', focus: 'deadlift', mainLift: 'deadlift', muscles: ['hamstrings', 'back', 'glutes', 'traps'] };
    const A = { name: 'Upper Accessory', focus: 'accessory', muscles: ['back', 'chest', 'biceps', 'triceps', 'rear_delts'] };
    const table = {
      1: [{ name: 'Full Power', focus: 'squat', mainLift: 'squat', muscles: FULL }],
      2: [S, B], 3: [S, B, D], 4: [S, B, D, A],
      5: [S, B, D, { name: 'Squat + Bench Volume', focus: 'squat', mainLift: 'squat', muscles: ['quads', 'chest', 'triceps'] }, A],
      6: [S, B, D, { name: 'Squat + Bench Volume', focus: 'squat', mainLift: 'squat', muscles: ['quads', 'chest'] }, A, { name: 'Deadlift + Back Volume', focus: 'deadlift', mainLift: 'deadlift', muscles: ['hamstrings', 'back', 'biceps'] }],
    };
    sessions = table[Math.min(days, 6)] || table[3];
  } else if (goal === 'athletic_power') {
    // Power/plyo + strength support (RESEARCH.md §7.3)
    const LP = { name: 'Lower Power', focus: 'power', power: true, muscles: ['quads', 'glutes', 'hamstrings'] };
    const US = { name: 'Upper Strength', focus: 'strength', muscles: [...PUSH, ...PULL] };
    const TP = { name: 'Total-Body Power', focus: 'power', power: true, muscles: ['full_body', 'quads', 'back'] };
    const LS = { name: 'Lower Strength', focus: 'strength', muscles: ['quads', 'hamstrings', 'glutes', 'calves'] };
    const table = {
      1: [TP], 2: [LP, US], 3: [LP, US, LS], 4: [LP, US, LS, TP],
      5: [LP, US, LS, TP, { name: 'Accessory + Core', focus: 'accessory', muscles: ['biceps', 'triceps', 'abs', 'calves'] }],
      6: [LP, US, LS, TP, { name: 'Upper Power', focus: 'power', power: true, muscles: ['chest', 'back', 'shoulders'] }, { name: 'Accessory + Core', focus: 'accessory', muscles: ['biceps', 'triceps', 'abs'] }],
    };
    sessions = table[Math.min(days, 6)] || table[3];
  } else if (goal === 'team_sport') {
    // Strength + power/plyo; count constrained by season phase in the overlay (RESEARCH.md §7).
    const inSeason = profile.seasonPhase === 'in_season';
    const FS = { name: 'Full-Body Strength', focus: 'strength', muscles: ['quads', 'glutes', 'chest', 'back', 'abs'] };
    const PWR = { name: 'Power + Plyometrics', focus: 'power', power: true, muscles: ['quads', 'glutes', 'full_body'] };
    const LU = { name: 'Lower + Posterior', focus: 'strength', muscles: ['hamstrings', 'glutes', 'quads', 'calves'] };
    const UP = { name: 'Upper + Trunk', focus: 'strength', muscles: [...PUSH, ...PULL, 'abs'] };
    if (inSeason) {
      // In-season: 1–2 maintenance sessions regardless of requested days (RESEARCH.md §7.2)
      sessions = days >= 2 ? [PWR, FS] : [FS];
      trace.push('In-season team sport: capped to 1–2 short maintenance sessions to spare the legs for matches (Rønnestad 2011).');
    } else {
      const table = { 1: [FS], 2: [LU, UP], 3: [PWR, LU, UP], 4: [PWR, LU, UP, FS], 5: [PWR, LU, UP, FS, { name: 'Speed + Conditioning', focus: 'power', power: true, muscles: ['full_body'] }] };
      sessions = table[Math.min(days, 5)] || table[3];
    }
  } else {
    // hypertrophy / general_fitness: FB×N for beginners; UL / PPL for the rest.
    const FB = (n) => ({ name: `Full Body ${String.fromCharCode(64 + n)}`, focus: 'general', muscles: FULL });
    const U = (n) => ({ name: `Upper ${n}`, focus: 'general', muscles: UPPER });
    const L = (n) => ({ name: `Lower ${n}`, focus: 'general', muscles: LOWER });
    const P = { name: 'Push', focus: 'general', muscles: PUSH.concat('side_delts') };
    const PL = { name: 'Pull', focus: 'general', muscles: PULL };
    const LG = { name: 'Legs', focus: 'general', muscles: LEGS.concat('abs') };
    // Full Body ×3 for beginners AND novices (and any 3-day general-fitness plan) so
    // every muscle is hit ~3×/week — the ≥2×/wk frequency principle (RESEARCH.md §4.1);
    // PPL (1×/muscle) is reserved for intermediate+ hypertrophy where high per-muscle
    // volume needs the split to keep each session under the per-session ceiling.
    const lowerExp = params.experienceLevel === 'beginner' || params.experienceLevel === 'novice';
    if (days <= 1) sessions = [FB(1)];
    else if (days === 2) sessions = [U(1), L(1)];
    else if (days === 3) sessions = (lowerExp || goal === 'general_fitness') ? [FB(1), FB(2), FB(3)] : [P, PL, LG];
    else if (days === 4) sessions = [U(1), L(1), U(2), L(2)];
    else if (days === 5) sessions = [U(1), L(1), P, PL, LG];
    else sessions = [P, PL, LG, { name: 'Push 2', focus: 'general', muscles: PUSH.concat('side_delts') }, { name: 'Pull 2', focus: 'general', muscles: PULL }, { name: 'Legs 2', focus: 'general', muscles: LEGS.concat('abs') }];
    if (days === 7) sessions.push({ name: 'Weak-Point / Rest', focus: 'accessory', muscles: (profile.musclePriorities && profile.musclePriorities.length ? mapPriorities(profile.musclePriorities) : ['abs', 'calves']) });
  }

  // Build muscle → [session indices] map (how many times/week each muscle is trained).
  const muscleDays = {};
  sessions.forEach((s, i) => s.muscles.forEach((m) => { (muscleDays[m] ||= []).push(i); }));
  trace.push(`Split for ${days} day(s): ${sessions.map((s) => s.name).join(' · ')}.`);
  return { sessions, muscleDays, days };
}

// Map survey priority labels → landmark muscle buckets.
function mapPriorities(prio) {
  const out = new Set();
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
function allocateVolume(muscleDays, params, priorities, week, isDeload, inSeasonMaintenance) {
  const prioritySet = new Set(mapPriorities(priorities || []));
  const out = {};
  for (const m of Object.keys(muscleDays)) {
    const lm = LANDMARKS[m] || LANDMARKS.full_body;
    let base = params.volumeStart;
    if (SMALL_MUSCLES.has(m)) base = Math.round(base * 0.6);
    if (prioritySet.has(m)) base += 3;
    base *= params.volumeMult;
    let sets;
    if (isDeload) {
      sets = Math.max(lm.mv, Math.round(base * 0.5)); // ~50% / MV (RESEARCH.md §8.3)
    } else if (inSeasonMaintenance) {
      sets = clamp(Math.round(base / 3), Math.min(2, lm.mev), lm.mev); // ~1/3, maintenance (RESEARCH.md §1.5/§7.2)
    } else {
      const ramp = base + params.volumeStep * (week - 1);
      sets = clamp(Math.round(ramp), lm.mev, lm.mrv);
    }
    out[m] = sets;
  }
  return out;
}

// ── B.4 distributeToSessions: weekly sets → per-session exercise slots (capped) ──
function distributeToSessions(sessions, muscleDays, weekVolume, params, trace, week) {
  const SETS_PER_EX = 3;
  const built = sessions.map((s) => ({ name: s.name, focus: s.focus, mainLift: s.mainLift || null, power: !!s.power, slots: [], cardio: [] }));

  for (const m of Object.keys(muscleDays)) {
    const dayIdxs = muscleDays[m];
    const freq = dayIdxs.length;
    let perSession = Math.ceil(weekVolume[m] / freq);
    if (perSession > params.perSessionCap) {
      perSession = params.perSessionCap;
      if (week === 1) trace.push(`Per-session cap: ${m} weekly target trimmed to ${perSession}×${freq} sessions to stay ≤${params.perSessionCap} sets/session (junk-volume ceiling, RESEARCH.md §4.2).`);
    }
    if (perSession <= 0) continue;
    // exercises for this muscle in a session = round(perSession / setsPerEx), ≥1
    const nEx = Math.max(1, Math.round(perSession / SETS_PER_EX));
    const setsEach = Math.max(2, Math.round(perSession / nEx));
    dayIdxs.forEach((di, order) => {
      for (let e = 0; e < nEx; e++) {
        // role: first exercise of a muscle on its heaviest session = primary; else secondary/accessory
        const role = e === 0 ? (SMALL_MUSCLES.has(m) ? 'accessory' : 'primary') : (e === 1 ? 'secondary' : 'accessory');
        built[di].slots.push({ muscle: m, role, sets: setsEach, exposureIndex: order, exposures: freq });
      }
    });
  }

  // Powerlifting: pin the competition lift as THE primary of its session. Demote any
  // same-primary-muscle slot to secondary, and inject a mandatory main-lift slot at the
  // front so the squat/bench/deadlift is always trained first & specifically (RESEARCH.md §6).
  const MAIN_MUSCLE = { squat: 'quads', bench: 'chest', deadlift: 'hamstrings' };
  for (const s of built) {
    if (!s.mainLift) continue;
    const muscle = MAIN_MUSCLE[s.mainLift];
    // demote existing primaries of that muscle to secondary so we don't double up primaries
    s.slots.forEach((sl) => { if (sl.muscle === muscle && sl.role === 'primary') sl.role = 'secondary'; });
    const primarySets = params.repZones && params.repZones.primary ? Math.max(3, Math.round(params.perSessionCap * 0.6)) : 4;
    s.slots.unshift({ muscle, role: 'primary', mainLift: s.mainLift, sets: Math.min(5, primarySets), exposureIndex: 0, exposures: 1 });
  }
  return built;
}

// ── session-length cap: trim total exercises/session by sessionMinutes (v1 scaleDown §5) ──
// Keeps priority order (primary > secondary > accessory); drops the lowest-priority slots
// first so a short session stays focused on the big lifts. Maps duration → max exercises.
function maxExercisesForDuration(minutes) {
  if (minutes <= 15) return 3;
  if (minutes <= 30) return 5;
  if (minutes <= 45) return 7;
  if (minutes <= 60) return 9;
  if (minutes <= 75) return 11;
  if (minutes <= 90) return 13;
  return 16;
}
function capByDuration(built, minutes, trace, week) {
  const cap = maxExercisesForDuration(minutes);
  for (const s of built) {
    if (s.slots.length <= cap) continue;
    const before = s.slots.length;
    // rank: primary(0) < secondary(1) < accessory(2); stable within rank
    const ranked = s.slots.map((sl, i) => ({ sl, i, r: sl.role === 'primary' ? 0 : sl.role === 'secondary' ? 1 : 2 }))
      .sort((a, b) => (a.r - b.r) || (a.i - b.i));
    s.slots = ranked.slice(0, cap).sort((a, b) => a.i - b.i).map((x) => x.sl);
    if (week === 1) trace.push(`Session-length recipe (${minutes} min): "${s.name}" trimmed ${before}→${cap} exercises (kept the highest-priority lifts).`);
  }
  return built;
}

// ── B.5 fillExercises: pick a concrete exercise per slot (equipment/injury/priority) ──
function fillExercises(built, profile, params, trace) {
  const equip = new Set(profile.equipment && profile.equipment.length ? profile.equipment : ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'bench', 'rack', 'pullup_bar', 'bands', 'kettlebell']);
  const injuries = new Set((profile.injuries || []).map((x) => String(x).toLowerCase()));

  const equipOk = (ex) => ex.equipment.some((eq) => equip.has(eq));
  const contra = (ex) => ex.contraindications.some((c) => injuries.has(c));

  // The canonical competition lifts (exact names) for powerlifting main-lift slots.
  const MAIN_LIFT_NAME = { squat: 'Back Squat', bench: 'Bench Press', deadlift: 'Conventional Deadlift' };

  built.forEach((session, sIdx) => {
    // Seed per SESSION (userId + week + session index) so repeated archetypes across a
    // week pick DIFFERENT exercises — Full Body A/B/C vary instead of being identical.
    const seed = seedFrom(String(profile.userId || 'anon') + (profile.weekISO || 'w') + ':' + sIdx);
    const rng = mulberry32(seed);
    const shuffled = [...CATALOG].sort(() => rng() - 0.5);
    const used = new Set();
    session.slots = session.slots.map((slot) => {
      // Powerlifting main-lift slot → pin the exact competition lift (fall back to any
      // equipment-viable squat/bench/hinge if it's contraindicated/unavailable).
      if (slot.mainLift) {
        const want = MAIN_LIFT_NAME[slot.mainLift];
        const exact = CATALOG.find((ex) => ex.name === want && equipOk(ex) && !contra(ex));
        const chosen = exact || shuffled.find((ex) => equipOk(ex) && !contra(ex) && !used.has(ex.id) &&
          ((slot.mainLift === 'squat' && ex.movement_pattern === 'squat' && ex.is_compound) ||
           (slot.mainLift === 'bench' && ex.movement_pattern === 'horizontal_push' && ex.is_compound) ||
           (slot.mainLift === 'deadlift' && ex.movement_pattern === 'hinge' && ex.is_compound)));
        if (chosen) {
          used.add(chosen.id);
          if (!exact && injuries.size) trace.push(`Injury swap in "${session.name}": ${chosen.name} in place of ${want} (competition lift contraindicated for your injury).`);
          return { ...slot, exercise_id: chosen.id, name: chosen.name, pattern: chosen.movement_pattern, is_compound: true, muscles: chosen.muscles, mainLiftKey: slot.mainLift };
        }
      }
      // candidate patterns for this (muscle, role): primary→compound for that muscle; accessory→isolation
      const wantCompound = slot.role === 'primary';
      // Non-power sessions: keep plyometrics/olympic power moves OUT of strength slots
      // (e.g. a cautious novice's primary quad slot should be a squat, not a depth jump).
      const strengthOnly = !session.power;
      let pool = shuffled.filter((ex) =>
        (ex.primaryMuscle === slot.muscle || ex.muscles.includes(slot.muscle)) &&
        equipOk(ex) && !used.has(ex.id) &&
        (wantCompound ? ex.is_compound : true) &&
        (strengthOnly ? !(ex.plyo || ex.power) : true)
      );
      // For power sessions prefer power/plyo movements for the primary slot.
      if (session.power && slot.role === 'primary') {
        const p = pool.filter((ex) => ex.power || ex.plyo);
        if (p.length) pool = p;
      }
      // Injury-aware: drop contraindicated; if that empties the pool, take a SAFER SWAP
      // (same muscle, flagged safeFor the injured region) — RESEARCH.md §9 / DESIGN_SPEC §B.5.
      let safeSwap = false, swapNote = '';
      const safePool = pool.filter((ex) => !contra(ex));
      if (safePool.length) {
        // prefer an explicit safer-swap exercise when an injury is present
        if (injuries.size) {
          const preferred = safePool.filter((ex) => ex.safeFor.some((r) => injuries.has(r)));
          if (preferred.length) { pool = preferred; safeSwap = true; swapNote = ` (safer choice for ${[...injuries].filter((r)=>preferred[0].safeFor.includes(r))[0]})`; }
          else pool = safePool;
        } else pool = safePool;
      } else if (pool.length) {
        // everything matched is contraindicated → find ANY same-muscle safeFor swap in the full catalog
        const swap = shuffled.find((ex) => (ex.primaryMuscle === slot.muscle || ex.muscles.includes(slot.muscle)) && equipOk(ex) && !contra(ex) && !used.has(ex.id));
        if (swap) { pool = [swap]; safeSwap = true; swapNote = ` (substituted — original pattern contraindicated for your injury)`; }
        else pool = [];
      }

      const chosen = pool[0];
      if (!chosen) return { ...slot, dropped: true };
      used.add(chosen.id);
      if (safeSwap) trace.push(`Injury swap in "${session.name}": ${chosen.name} for the ${slot.muscle} slot${swapNote}.`);
      return { ...slot, exercise_id: chosen.id, name: chosen.name, pattern: chosen.movement_pattern, is_compound: chosen.is_compound, muscles: chosen.muscles, plyo: chosen.plyo, power: chosen.power };
    }).filter((s) => !s.dropped);
  });
  return built;
}

// ── B.6 assignLoadingPerSlot: rep range + %1RM + RIR by goal × week × role, with undulation ──
function assignLoading(built, profile, params, week, accumulationWeeks, isDeload) {
  const lifts = profile.lifts || {};
  const bw = profile.bodyweightKg || null;
  // Map a slot to a known e1RM ONLY for the exact competition/main lift; assistance
  // variants get a discounted % of the parent lift (so an RDL isn't loaded at the
  // conventional-deadlift 1RM). Returns { e1rm, factor, label }.
  const e1rmFor = (slot) => {
    const n = (slot.name || '').toLowerCase();
    if (slot.mainLiftKey === 'squat' || n === 'back squat') return lifts.squat && { e1rm: lifts.squat, factor: 1, label: 'squat' };
    if (slot.mainLiftKey === 'bench' || n === 'bench press') return lifts.bench && { e1rm: lifts.bench, factor: 1, label: 'bench' };
    if (slot.mainLiftKey === 'deadlift' || n === 'conventional deadlift') return lifts.deadlift && { e1rm: lifts.deadlift, factor: 1, label: 'deadlift' };
    if (n === 'overhead press') return lifts.ohp && { e1rm: lifts.ohp, factor: 1, label: 'OHP' };
    // Common assistance variants → % of parent lift (approx transfer factors).
    if (n === 'front squat') return lifts.squat && { e1rm: lifts.squat, factor: 0.85, label: 'squat (front-squat ~85%)' };
    if (n === 'close-grip bench press' || n === 'floor press') return lifts.bench && { e1rm: lifts.bench, factor: 0.90, label: 'bench (variant ~90%)' };
    if (n === 'romanian deadlift') return lifts.deadlift && { e1rm: lifts.deadlift, factor: 0.75, label: 'deadlift (RDL ~75%)' };
    if (n === 'trap-bar deadlift') return lifts.deadlift && { e1rm: lifts.deadlift, factor: 1.05, label: 'deadlift (trap-bar ~105%)' };
    return undefined;
  };

  // week position within the accumulation block → RIR undulation (high early, low near deload)
  const blockPos = isDeload ? 0 : clamp((week - 1) / Math.max(1, accumulationWeeks - 1), 0, 1); // 0..1
  const weekAdj = isDeload ? +2 : Math.round((1 - blockPos) * 1); // +1 early → 0 late; deload +2

  for (const session of built) {
    session.slots.forEach((slot, i) => {
      const zone = params.repZones[slot.role] || params.repZones.accessory;
      let [repLo, repHi, pct] = zone;

      // Within-week undulation for DUP/hypertrophy top-set/back-off: alternate a muscle's
      // exposures heavy↔light (RESEARCH.md §3.3). exposureIndex 0 = heavier/lower reps.
      if ((params.model === 'dup' || params.model === 'undulating') && slot.exposures > 1) {
        if (slot.exposureIndex % 2 === 1) { repLo = Math.round(repLo * 1.5); repHi = Math.round(repHi * 1.4); pct = Math.max(0.6, pct - 0.1); }
      }
      // Power sessions: cap reps low & keep far from failure (velocity quality)
      if (session.power && (slot.role === 'primary')) { repLo = 2; repHi = 5; }

      // RIR target: start from the goal band, then apply experience/week/knob shifts —
      // but CAP the composed value so normal working sets never drift too easy. The
      // ceiling is bandHigh+1 (so a cautious novice sits ~1 RIR above the band, tapering
      // toward the band across the mesocycle), floored by the experience/knob RIR floor.
      const [bandLo, bandHi] = params.rirBand;
      const bandCenter = (bandLo + bandHi) / 2;
      const floor = slot.is_compound ? params.rirFloor.compound : params.rirFloor.isolation;
      const shift = params.noviceRirAdj + weekAdj + params.rirShift; // additive, then capped
      let rir = clamp(bandCenter + shift, floor, bandHi + 1);
      if (isDeload) rir = clamp(bandHi + 1, floor, 5); // deload: 1 above band high, capped 5
      if (session.power && slot.role === 'primary') rir = Math.max(rir, 4); // power stays fresh (velocity)
      rir = Math.round(rir);
      const rpe = clamp(10 - rir, 4, 10);

      // Load from e1RM if the lift is known (exact competition lift = factor 1; assistance discounted).
      const e1meta = e1rmFor(slot);
      const e1 = e1meta ? e1meta.e1rm * e1meta.factor : 0;
      let weightKg = null, pct1rm = null, loadNote = '';
      if (e1 && e1 > 0) {
        // %1RM tracks the ACHIEVABLE-reps end of the range (repHi), never the bottom —
        // loading a 5-rep set at 100%1RM (repLo=1) would be unsafe. RIR then discounts further.
        pct1rm = pctForReps(repHi);
        const rirDiscount = 1 - 0.033 * Math.max(0, rir - 1); // ~3.3%/RIR beyond 1 RIR (reps in reserve → lighter)
        weightKg = round2_5(e1 * pct1rm * rirDiscount);
        const shownPct = Math.round(pct1rm * rirDiscount * 100);
        loadNote = e1meta.factor === 1 ? `~${shownPct}%1RM @ RIR ${rir}` : `~${shownPct}% of ${e1meta.label}`;
      } else if (bw && slot.pattern && (slot.name || '').toLowerCase().includes('push-up')) {
        loadNote = 'bodyweight';
      } else {
        loadNote = `RPE ${rpe} (no logged 1RM — find your working weight over the first sessions)`;
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
function peakingPlan(profile, params) {
  const w = profile.meet && profile.meet.weeksToMeet;
  if (!w) return null;
  let phases;
  if (w >= 12) phases = [['Accumulation', Math.min(6, w - 6)], ['Strength', 4], ['Peak', 2]];
  else if (w >= 8) phases = [['Strength', w - 3], ['Peak', 3]];
  else if (w >= 6) phases = [['Strength', w - 3], ['Peak', 3]];
  else if (w >= 4) phases = [['Strength', w - 2], ['Peak', 2]];
  else phases = [['Peak/Taper', Math.max(1, w)]];

  // Attempt selection from target 1RM (or e1RM) — RESEARCH.md §6.4
  const t = (profile.meet.target1RM) || {};
  const src = { squat: t.squat ?? profile.lifts?.squat, bench: t.bench ?? profile.lifts?.bench, deadlift: t.deadlift ?? profile.lifts?.deadlift };
  const attempts = {};
  for (const l of ['squat', 'bench', 'deadlift']) {
    if (src[l]) attempts[l] = { opener: round2_5(0.91 * src[l]), second: round2_5(0.96 * src[l]), third: round2_5(src[l]) };
  }
  return { weeksToMeet: w, phases, attempts };
}

// Build the intensity schedule for the final peak weeks (RESEARCH.md §6.2)
function peakWeekPrescription(weeksOut) {
  if (weeksOut >= 3) return { pct: 0.90, reps: '2', rpe: 8, note: 'Top double ~90% — volume cut sharply, intensity high.' };
  if (weeksOut === 2) return { pct: 0.95, reps: '1', rpe: 9, note: 'Heavy single ~95% (near opener/2nd) — very few sets.' };
  return { pct: 0.90, reps: '1', rpe: 7, note: 'Opener-simulation single ~90%, then light technical work; taper into the meet.' };
}

// ── B.10 sportPhaseOverlay: label sessions with MD± + append plyo/conditioning ──
function applySportOverlay(built, profile, params, trace) {
  const phase = profile.seasonPhase || 'off_season';
  const gameDay = (typeof profile.gameDay === 'number') ? profile.gameDay : null;

  // plyometric prescription appended to power sessions (RESEARCH.md §7.3)
  built.forEach((s) => {
    if (s.power) s.cardio.push({ kind: 'plyometrics', contacts: params.plyoContacts, description: `${params.plyoContacts} foot-contacts (box jumps / bounds / pogos), 48–72h from the next intense plyo session.` });
  });

  // FIFA 11+ neuromuscular warm-up on sport sessions (RESEARCH.md §7.3)
  built.forEach((s) => s.warmup = 'FIFA 11+ style neuromuscular warm-up (~15 min: running, strength, plyo, balance) — ~30–50% injury reduction.');

  // MD± anchoring (RESEARCH.md §7.5): heavier strength at MD-3, priming at MD-1, recovery MD+1.
  if (gameDay != null) {
    // Assign session order to MD offsets: heaviest → MD-3, next → MD+2, priming → MD-1.
    const offsets = built.length >= 2 ? ['MD-3', 'MD-1'] : ['MD-3'];
    built.forEach((s, i) => { s.mdOffset = offsets[i] || `MD-${3 - i}`; });
    trace.push(`Game day = ${WEEKDAY[gameDay]}: strength placed at MD-3 (far from match, CNS-loading), priming at MD-1; conditioning kept ≥6h from heavy legs (concurrent-training guard, RESEARCH.md §7.4).`);
  }

  if (phase === 'in_season') trace.push('In-season phase: strength held at maintenance (lower volume, higher relative intensity, 3–6 reps); leg volume kept low to preserve match readiness.');
  else if (phase === 'pre_season') trace.push('Pre-season phase: converting base to power/speed — strength-speed lifts + intensive plyometrics + sprint/COD.');
  else trace.push('Off-season phase: highest lifting volume — hypertrophy + max-strength base + general conditioning.');
  return built;
}

// ── main entry ──────────────────────────────────────────────────────────────
export function generatePlanV2(profile) {
  const trace = [];
  const { params, trace: pTrace } = deriveParams(profile);
  trace.push(...pTrace);

  const inSeasonMaintenance = (profile.goal === 'team_sport' && profile.seasonPhase === 'in_season');
  const { sessions: splitSessions, muscleDays, days } = selectSplit(profile, params, trace);

  // Determine weeks to generate + deload placement.
  const peaking = (profile.goal === 'strength_powerlifting') ? peakingPlan(profile, params) : null;
  const accum = params.accumulationWeeks;
  let totalWeeks;
  if (peaking) totalWeeks = Math.min(profile.meet.weeksToMeet, 12);
  else totalWeeks = profile.weeksToGenerate || (accum + 1); // accumulation block + 1 deload

  // Precompute the PL phase timeline (which week is which phase) if peaking.
  let plPhaseByWeek = null;
  if (peaking) {
    plPhaseByWeek = [];
    let wk = 1;
    for (const [name, len] of peaking.phases) for (let i = 0; i < len && wk <= totalWeeks; i++) plPhaseByWeek.push(name), wk++;
    while (plPhaseByWeek.length < totalWeeks) plPhaseByWeek.push('Peak/Taper');
  }

  const weeks = [];
  for (let w = 1; w <= totalWeeks; w++) {
    let isDeload;
    let phaseLabel = null;
    if (peaking) {
      phaseLabel = plPhaseByWeek[w - 1];
      isDeload = false; // PL peak manages its own taper
    } else {
      isDeload = (w === accum + 1) || (totalWeeks > accum + 1 && w % (accum + 1) === 0);
    }

    // per-week set volume
    const accumWeek = peaking ? w : (isDeload ? accum : ((w - 1) % (accum + 1)) + 1);
    const weekVolume = allocateVolume(muscleDays, params, profile.musclePriorities, accumWeek, isDeload, inSeasonMaintenance);

    // build → cap by session length → fill → load
    let built = distributeToSessions(splitSessions, muscleDays, weekVolume, params, w === 1 ? trace : [], accumWeek);
    built = capByDuration(built, profile.sessionMinutes || 60, w === 1 ? trace : [], w);
    built = fillExercises(built, { ...profile, weekISO: `w${w}` }, params, w === 1 ? trace : []);
    built = assignLoading(built, profile, params, accumWeek, accum, isDeload);

    // team-sport overlay
    if (profile.goal === 'team_sport' && w === 1) built = applySportOverlay(built, profile, params, trace);
    else if (profile.goal === 'team_sport') built = applySportOverlay(built, profile, params, []);

    // powerlifting peak-week intensity note on the main lifts
    if (peaking && /Peak/.test(phaseLabel)) {
      const weeksOut = totalWeeks - w + 1;
      const rx = peakWeekPrescription(weeksOut);
      built.forEach((s) => s.slots.forEach((sl) => {
        const isMain = sl.mainLiftKey === 'squat' || sl.mainLiftKey === 'bench' || sl.mainLiftKey === 'deadlift';
        if (isMain && sl.role === 'primary') {
          sl.reps = rx.reps; sl.rpe = rx.rpe; sl.rirTarget = 10 - rx.rpe;
          const e1 = profile.lifts ? profile.lifts[sl.mainLiftKey] : null;
          if (e1) { sl.pct1rm = rx.pct; sl.weight_kg = round2_5(e1 * rx.pct); sl.loadNote = `${Math.round(rx.pct * 100)}%1RM`; }
          sl.week_intent = `${phaseLabel} (${weeksOut}wk out)`;
          sl.peakNote = rx.note;
        }
      }));
    }

    // assign day labels (map to real weekdays if provided)
    const built2 = assignDayLabels(built, profile, days);

    weeks.push({
      week_number: w,
      phase: phaseLabel || (isDeload ? 'Deload' : `${params.model} accumulation`),
      isDeload,
      sessions: built2.map(fmtSession),
    });
  }

  const reasoning = buildReasoning(profile, params, peaking, inSeasonMaintenance);
  return {
    engine: 'pf-engine-v2',
    reasoning,
    rule_trace: trace,
    mesocycle: peaking ? undefined : { model: params.model, accumulationWeeks: accum, deloadWeek: accum + 1, totalWeeks },
    peaking: peaking || undefined,
    sportPlan: profile.goal === 'team_sport' ? { sport: profile.sport, seasonPhase: profile.seasonPhase || 'off_season', gameDay: profile.gameDay ?? null } : undefined,
    volumeReport: buildVolumeReport(muscleDays, params, profile, accum, inSeasonMaintenance),
    weeks,
  };
}

function assignDayLabels(built, profile, days) {
  const td = (profile.trainingDays || []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
  return built.map((s, i) => {
    let label = s.name;
    if (td.length >= built.length) label = `${WEEKDAY[td[i]]} – ${s.name}`;
    else label = `Day ${i + 1} – ${s.name}`;
    if (s.mdOffset) label += ` [${s.mdOffset}]`;
    return { ...s, day_label: label };
  });
}

function fmtSession(s) {
  return {
    day_label: s.day_label,
    mdOffset: s.mdOffset,
    warmup: s.warmup,
    slots: s.slots.map((sl) => ({
      exercise_id: sl.exercise_id, name: sl.name, muscle: sl.muscle, muscles: sl.muscles,
      pattern: sl.pattern, is_compound: sl.is_compound, role: sl.role, priority: sl.priority,
      sets: sl.sets, reps: sl.reps, rpe: sl.rpe, rir_target: sl.rirTarget, pct_1rm: sl.pct1rm,
      weight_kg: sl.weight_kg, rest_seconds: sl.rest_seconds, load_note: sl.loadNote,
      week_intent: sl.week_intent, peak_note: sl.peakNote,
    })),
    cardio: s.cardio,
  };
}

function buildVolumeReport(muscleDays, params, profile, accum, inSeason) {
  const wk1 = allocateVolume(muscleDays, params, profile.musclePriorities, 1, false, inSeason);
  const wkPeak = allocateVolume(muscleDays, params, profile.musclePriorities, accum, false, inSeason);
  const per = {};
  for (const m of Object.keys(muscleDays)) per[m] = { freqPerWeek: muscleDays[m].length, week1Sets: wk1[m], peakWeekSets: wkPeak[m], mev: (LANDMARKS[m] || LANDMARKS.full_body).mev, mrv: (LANDMARKS[m] || LANDMARKS.full_body).mrv };
  return { perMuscleWeeklySets: per };
}

function buildReasoning(profile, params, peaking, inSeason) {
  const bits = [];
  bits.push(`Built parametrically for a ${params.experienceLevel} lifter (~${params.trainingAgeYears}yr training age) chasing ${labelGoal(params.goal)}.`);
  if (peaking) bits.push(`Peaking backward from your meet in ${peaking.weeksToMeet} weeks: ${peaking.phases.map(([n, l]) => `${n} ${l}wk`).join(' -> ')}.`);
  else if (inSeason) bits.push(`In-season maintenance: one to two short high-intensity sessions per week hold your strength and speed without draining your legs (Ronnestad 2011).`);
  else bits.push(`Volume ramps from ~MEV toward MRV over ${params.accumulationWeeks} weeks, then a deload - ${params.model} progression, rep ranges vary by day and lift role, and RIR is calibrated to your experience.`);
  return bits.join(' ');
}
function labelGoal(g) {
  return { hypertrophy: 'muscle growth', strength_powerlifting: 'maximal strength', general_fitness: 'general fitness / recomp', athletic_power: 'athletic power', team_sport: 'team-sport performance' }[g] || g;
}
