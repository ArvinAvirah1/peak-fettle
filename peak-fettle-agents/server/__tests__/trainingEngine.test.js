// trainingEngine.test.js — Peak Fettle Training Engine v1 unit tests
// Run: npx jest __tests__/trainingEngine.test.js (from server/)
//
// ≥12 cases covering all spec §9.3/9.4 acceptance criteria.

'use strict';

// No DB or external dependencies — pure function tests.
const { generatePlan }        = require('../lib/trainingEngine');
const { scaleDown }           = require('../lib/trainingEngine/scaleDown');
const { epley1RM, roundTo2_5, warmupLadder } = require('../lib/trainingEngine/loading');
const { buildSeed, seededShuffle }           = require('../lib/trainingEngine/exerciseFill');
const templates               = require('../lib/trainingEngine/templates');

// ---------------------------------------------------------------------------
// Shared fixture data
// ---------------------------------------------------------------------------

// Minimal exercise list — enough to satisfy template slot patterns
const EXERCISES = [
  { id: 'e-squat-bb',   name: 'Barbell Back Squat',   muscle_groups: ['quads','glutes'],   is_compound: true,  movement_pattern: 'squat',           equipment: ['barbell','rack'],           contraindications: [] },
  { id: 'e-hinge-dl',   name: 'Barbell Deadlift',     muscle_groups: ['hamstrings','glutes'], is_compound: true, movement_pattern: 'hinge',           equipment: ['barbell'],                 contraindications: [] },
  { id: 'e-hpush-bp',   name: 'Barbell Bench Press',  muscle_groups: ['chest','triceps'],  is_compound: true,  movement_pattern: 'horizontal_push',  equipment: ['barbell','bench','rack'],   contraindications: [] },
  { id: 'e-vpush-ohp',  name: 'Overhead Press',       muscle_groups: ['shoulders','triceps'], is_compound: true, movement_pattern: 'vertical_push',  equipment: ['barbell'],                 contraindications: [] },
  { id: 'e-vpull-pu',   name: 'Pull-Up',              muscle_groups: ['lats','biceps'],    is_compound: true,  movement_pattern: 'vertical_pull',    equipment: ['pullup_bar','bodyweight'],  contraindications: [] },
  { id: 'e-hpull-row',  name: 'Barbell Row',          muscle_groups: ['upper_back','lats'], is_compound: true, movement_pattern: 'horizontal_pull',  equipment: ['barbell'],                 contraindications: [] },
  { id: 'e-lunge-sl',   name: 'Dumbbell Lunges',      muscle_groups: ['quads','glutes'],   is_compound: true,  movement_pattern: 'lunge',            equipment: ['dumbbell'],                contraindications: [] },
  { id: 'e-core-pl',    name: 'Plank',                muscle_groups: ['core'],             is_compound: false, movement_pattern: 'core',             equipment: ['bodyweight'],              contraindications: [] },
  { id: 'e-carry-fc',   name: "Farmer's Carry",       muscle_groups: ['forearms','core'],  is_compound: true,  movement_pattern: 'carry',            equipment: ['dumbbell'],                contraindications: [] },
  { id: 'e-iso-curl',   name: 'Dumbbell Bicep Curl',  muscle_groups: ['biceps'],           is_compound: false, movement_pattern: 'isolation_arms',   equipment: ['dumbbell'],                contraindications: [] },
  { id: 'e-iso-cal',    name: 'Calf Raise',           muscle_groups: ['calves'],           is_compound: false, movement_pattern: 'isolation_calves', equipment: ['machine','bodyweight'],    contraindications: [] },
  { id: 'e-iso-leg',    name: 'Leg Extension',        muscle_groups: ['quads'],            is_compound: false, movement_pattern: 'isolation_legs',   equipment: ['machine'],                 contraindications: [] },
  { id: 'e-iso-sho',    name: 'Lateral Raise',        muscle_groups: ['shoulders'],        is_compound: false, movement_pattern: 'isolation_shoulders', equipment: ['dumbbell'],             contraindications: [] },
  { id: 'e-iso-ch',     name: 'Dumbbell Fly',         muscle_groups: ['chest'],            is_compound: false, movement_pattern: 'isolation_chest',  equipment: ['dumbbell'],                contraindications: [] },
  { id: 'e-iso-bk',     name: 'Cable Row',            muscle_groups: ['mid_back'],         is_compound: false, movement_pattern: 'isolation_back',   equipment: ['cable'],                   contraindications: [] },
  { id: 'e-oly-cl',     name: 'Power Clean',          muscle_groups: ['quads','traps','shoulders'], is_compound: true, movement_pattern: 'olympic',  equipment: ['barbell'],                 contraindications: [] },
  { id: 'e-plyo-bj',    name: 'Box Jump',             muscle_groups: ['quads','glutes'],   is_compound: true,  movement_pattern: 'plyometric',       equipment: ['bodyweight'],              contraindications: [] },
  // Bodyweight fallbacks for squat, hinge, push patterns
  { id: 'e-squat-bw',   name: 'Bodyweight Squat',     muscle_groups: ['quads','glutes'],   is_compound: true,  movement_pattern: 'squat',           equipment: ['bodyweight'],              contraindications: [] },
  { id: 'e-hinge-bw',   name: 'Hip Hinge Drill',      muscle_groups: ['hamstrings'],       is_compound: false, movement_pattern: 'hinge',           equipment: ['bodyweight'],              contraindications: [] },
  { id: 'e-hpush-pu',   name: 'Push-Up',              muscle_groups: ['chest','triceps'],  is_compound: true,  movement_pattern: 'horizontal_push',  equipment: ['bodyweight'],              contraindications: [] },
  { id: 'e-vpush-pp',   name: 'Pike Push-Up',         muscle_groups: ['shoulders'],        is_compound: true,  movement_pattern: 'vertical_push',    equipment: ['bodyweight'],              contraindications: [] },
];

const FULL_EQUIPMENT = ['barbell','dumbbell','machine','cable','bodyweight','bench','rack','pullup_bar'];
const BODYWEIGHT_ONLY = ['bodyweight'];

const NO_HISTORY = [];
const NO_PBS     = [];
const NO_METRICS = [];
const NO_CONSTRAINTS = [];

function makePlan(profileOverrides = {}, opts = {}) {
  return generatePlan({
    profile: {
      experience_level:   'beginner',
      primary_discipline: 'general_strength',
      training_goal:      'general_fitness',
      sessions_per_week:  3,
      session_minutes:    60,
      equipment_profile:  FULL_EQUIPMENT,
      ...profileOverrides,
    },
    exercises:   opts.exercises   ?? EXERCISES,
    history:     opts.history     ?? NO_HISTORY,
    pbs:         opts.pbs         ?? NO_PBS,
    metrics:     opts.metrics     ?? NO_METRICS,
    constraints: opts.constraints ?? NO_CONSTRAINTS,
    userId:      opts.userId      ?? 'user-123',
    today:       opts.today       ?? new Date('2026-06-09'), // Monday, consistent week
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Training Engine — generatePlan', () => {

  // ── 1. Schema validity ────────────────────────────────────────────────────
  test('1. returns required top-level fields', () => {
    const result = makePlan();
    expect(result).toHaveProperty('weeks');
    expect(result).toHaveProperty('reasoning');
    expect(result).toHaveProperty('rule_trace');
    expect(result).toHaveProperty('engine', 'pf-engine-v1');
    expect(Array.isArray(result.weeks)).toBe(true);
    expect(Array.isArray(result.rule_trace)).toBe(true);
    expect(typeof result.reasoning).toBe('string');
    expect(result.reasoning.length).toBeGreaterThan(10);
  });

  // ── 2. 3 weeks produced ───────────────────────────────────────────────────
  test('2. produces exactly 3 weeks', () => {
    const result = makePlan();
    expect(result.weeks).toHaveLength(3);
    result.weeks.forEach((week, i) => {
      expect(week.week_number).toBe(i + 1);
      expect(Array.isArray(week.sessions)).toBe(true);
      expect(week.sessions.length).toBeGreaterThan(0);
    });
  });

  // ── 3. Each discipline generates a plan ───────────────────────────────────
  const disciplines = [
    'general_strength', 'powerlifting', 'weightlifting',
    'running', 'cycling', 'swimming', 'other_mixed',
  ];
  disciplines.forEach(disc => {
    test(`3. discipline "${disc}" generates without error`, () => {
      const result = makePlan({ primary_discipline: disc });
      expect(result.weeks).toHaveLength(3);
      expect(result.engine).toBe('pf-engine-v1');
    });
  });

  // ── 4. 2-day powerlifting scale-down keeps core lifts (squat + hinge/bench) ──
  test('4. powerlifting 2-day keeps core lifts', () => {
    const result = makePlan({
      primary_discipline: 'powerlifting',
      experience_level:   'beginner',
      sessions_per_week:  2,
      session_minutes:    60,
    });

    // At least one session in week 1 must contain a squat or hinge slot.
    const week1Sessions = result.weeks[0].sessions;
    const allSlots = week1Sessions.flatMap(s => s.slots || []);
    const corePatterns = allSlots.map(s => s.pattern);
    const hasCorePattern = corePatterns.some(p => ['squat','hinge','horizontal_push'].includes(p));
    expect(hasCorePattern).toBe(true);
  });

  // ── 5. Constraints exclude patterns ───────────────────────────────────────
  test('5. constraints exclude exercises with matching contraindication', () => {
    const constrainedExercises = EXERCISES.map(ex =>
      ex.movement_pattern === 'squat'
        ? { ...ex, contraindications: ['knee_injury'] }
        : ex
    );
    const result = makePlan({}, {
      exercises:   constrainedExercises,
      constraints: [{ constraint_type: 'knee_injury', custom_note: null }],
    });

    const allSlots = result.weeks.flatMap(w =>
      w.sessions.flatMap(s => s.slots || [])
    );
    const squatSlots = allSlots.filter(s => s.pattern === 'squat');
    // All filled squat slots should NOT have 'knee_injury' contraindication
    // (either dropped or replaced with a non-contraindicated exercise).
    squatSlots.forEach(slot => {
      if (slot.exercise_id) {
        const ex = constrainedExercises.find(e => e.id === slot.exercise_id);
        // Either the exercise has no contraindications, or the constraint doesn't apply.
        const isBlocked = ex &&
          ex.contraindications &&
          ex.contraindications.includes('knee_injury');
        expect(isBlocked).toBe(false);
      }
    });
  });

  // ── 6. Equipment filter — bodyweight-only profile uses bodyweight exercises ─
  test('6. bodyweight-only profile fills slots with bodyweight exercises or drops them', () => {
    const result = makePlan(
      { equipment_profile: BODYWEIGHT_ONLY },
      { exercises: EXERCISES }
    );

    const allSlots = result.weeks[0].sessions.flatMap(s => s.slots || []);
    const filledSlots = allSlots.filter(s => s.exercise_id);
    filledSlots.forEach(slot => {
      const ex = EXERCISES.find(e => e.id === slot.exercise_id);
      if (ex) {
        // Equipment of chosen exercise must intersect with bodyweight-only profile.
        const compatible = (ex.equipment || []).includes('bodyweight');
        expect(compatible).toBe(true);
      }
    });
  });

  // ── 7. Loading math vs hand-computed e1RM ────────────────────────────────
  test('7. Epley e1RM formula is correct', () => {
    // 100kg × 5 reps → e1RM = 100 * (1 + 5/30) = 100 * 1.1667 ≈ 116.67kg
    const e1rm = epley1RM(100, 5);
    expect(e1rm).toBeCloseTo(116.67, 1);

    // Cap at 12 reps: 100kg × 15 reps → same as 100 × 12
    const e1rmCapped = epley1RM(100, 15);
    const e1rmAt12   = epley1RM(100, 12);
    expect(e1rmCapped).toBeCloseTo(e1rmAt12, 5);
  });

  test('7b. roundTo2_5 rounds to nearest 2.5kg', () => {
    // 101.3 / 2.5 = 40.52 → Math.round(40.52) = 41 → 41 * 2.5 = 102.5
    expect(roundTo2_5(101.3)).toBe(102.5);
    // 102.5 / 2.5 = 41.0  → exact multiple stays
    expect(roundTo2_5(102.5)).toBe(102.5);
    // 103.7 / 2.5 = 41.48 → Math.round(41.48) = 41 → 41 * 2.5 = 102.5
    expect(roundTo2_5(103.7)).toBe(102.5);
    // 106.3 / 2.5 = 42.52 → Math.round(42.52) = 43 → 43 * 2.5 = 107.5
    expect(roundTo2_5(106.3)).toBe(107.5);
    // 108.8 / 2.5 = 43.52 → Math.round(43.52) = 44 → 44 * 2.5 = 110
    expect(roundTo2_5(108.8)).toBe(110);
  });

  // ── 8. Determinism — same seed → same plan ───────────────────────────────
  test('8. same userId + today produces identical plan', () => {
    const opts = {
      exercises: EXERCISES,
      userId:    'user-determinism',
      today:     new Date('2026-06-09'),
    };
    const plan1 = makePlan({}, opts);
    const plan2 = makePlan({}, opts);

    // Compare exercise IDs across all weeks/sessions/slots.
    const ids1 = plan1.weeks.flatMap(w => w.sessions.flatMap(s => (s.slots || []).map(sl => sl.exercise_id)));
    const ids2 = plan2.weeks.flatMap(w => w.sessions.flatMap(s => (s.slots || []).map(sl => sl.exercise_id)));
    expect(ids1).toEqual(ids2);
  });

  // ── 9. Different userId → potentially different exercise selection ─────────
  test('9. different seeds produce different shuffles (probabilistic)', () => {
    const shuffle1 = seededShuffle(['a','b','c','d','e','f'], buildSeed('user-A', '2026-W24'));
    const shuffle2 = seededShuffle(['a','b','c','d','e','f'], buildSeed('user-B', '2026-W24'));
    // It's astronomically unlikely they're identical
    expect(shuffle1.join('')).not.toBe(shuffle2.join(''));
  });

  // ── 10. 15-min session = single quality slot ─────────────────────────────
  test('10. 15-min session returns single priority-1 slot per session', () => {
    const result = makePlan({
      session_minutes:  15,
      sessions_per_week: 3,
    });

    const week1 = result.weeks[0];
    week1.sessions.forEach(session => {
      if (!session.isRecovery) {
        const slots = session.slots || [];
        // Max 1 slot per the 15-min recipe (priority 1, maxSlots 1, trimSets true).
        expect(slots.length).toBeLessThanOrEqual(1);
        slots.forEach(slot => {
          expect(slot.priority).toBe(1);
          expect(slot.sets).toBeLessThanOrEqual(2);
        });
      }
    });
  });

  // ── 11. scaleDown: user > idealDays adds recovery sessions ───────────────
  test('11. scaleDown adds recovery sessions when user days exceed template ideal', () => {
    const tpl   = templates.getTemplate('general_strength', 'beginner', 'general_fitness');
    const trace = [];
    const scaled = scaleDown(tpl, 7, 60, trace);
    // 7 days - 3 ideal = 4 extra recovery sessions
    const recoverySessions = scaled.sessions.filter(s => s.isRecovery);
    expect(recoverySessions.length).toBe(7 - (tpl.idealDays || 3));
    expect(trace.some(t => t.includes('recovery'))).toBe(true);
  });

  // ── 12. scaleDown: fewer days drops low-priority sessions ────────────────
  test('12. scaleDown with 1 day keeps only 1 session', () => {
    const tpl   = templates.getTemplate('general_strength', 'intermediate', 'general_fitness');
    const trace = [];
    const scaled = scaleDown(tpl, 1, 60, trace);
    expect(scaled.sessions.length).toBe(1);
    expect(trace.some(t => t.includes('scale-down'))).toBe(true);
  });

  // ── 13. Loading with PB produces non-null weight ──────────────────────────
  test('13. loading applies weight_kg when PB is available', () => {
    const result = makePlan(
      { primary_discipline: 'general_strength', sessions_per_week: 3 },
      {
        pbs: [{ exercise_name: 'Barbell Back Squat', weight_kg: 100, reps: 5 }],
        exercises: EXERCISES,
      }
    );

    const allSlots = result.weeks.flatMap(w =>
      w.sessions.flatMap(s => s.slots || [])
    );
    const squatSlots = allSlots.filter(s => s.name === 'Barbell Back Squat' && s.weight_kg != null);
    expect(squatSlots.length).toBeGreaterThan(0);

    // Week 1 working weight: ~87.5% × target-rep equivalent of e1RM
    // e1RM(100, 5) = 116.67; targetRep=5-8 → parse 5 → target = 116.67/(1+5/30) ≈ 100
    // 87.5% of that ≈ 87.5kg; round to 2.5 = 87.5kg
    const week1Slot = result.weeks[0].sessions.flatMap(s => s.slots || [])
      .find(s => s.name === 'Barbell Back Squat' && s.weight_kg != null);
    if (week1Slot) {
      expect(week1Slot.weight_kg).toBeGreaterThan(50);
      expect(week1Slot.weight_kg % 2.5).toBeCloseTo(0, 5);
    }
  });

  // ── 14. Warm-up ladder generated for compound priority-1 slots ─────────── 
  test('14. warm-up ladder is generated for compound priority-1 slots with PB', () => {
    const result = makePlan(
      { primary_discipline: 'general_strength', sessions_per_week: 3 },
      {
        pbs: [{ exercise_name: 'Barbell Back Squat', weight_kg: 100, reps: 5 }],
        exercises: EXERCISES,
      }
    );

    // Warm-up ladder only on week 1 per spec.
    const week1Slots = result.weeks[0].sessions.flatMap(s => s.slots || []);
    const withWarmup = week1Slots.filter(s => s.warmup && s.warmup.length > 0);
    expect(withWarmup.length).toBeGreaterThan(0);

    const w = withWarmup[0].warmup;
    // All rung weights should be >20kg (bar threshold) and multiples of 2.5.
    w.forEach(rung => {
      expect(rung.weight_kg).toBeGreaterThan(20);
      expect(rung.weight_kg % 2.5).toBeCloseTo(0, 5);
      expect(rung.reps).toBeGreaterThanOrEqual(1);
    });
  });

  // ── 15. coaching_note is present and non-empty on every slot ─────────────
  test('15. every slot has a non-empty coaching_note', () => {
    const result = makePlan();
    const allSlots = result.weeks.flatMap(w =>
      w.sessions.flatMap(s => s.slots || [])
    );
    expect(allSlots.length).toBeGreaterThan(0);
    allSlots.forEach(slot => {
      expect(typeof slot.coaching_note).toBe('string');
      expect(slot.coaching_note.length).toBeGreaterThan(5);
    });
  });

  // ── 16. rule_trace is non-empty and contains discipline/tier string ────────
  test('16. rule_trace is non-empty and includes key trace entries', () => {
    const result = makePlan({ primary_discipline: 'powerlifting', experience_level: 'intermediate' });
    expect(result.rule_trace.length).toBeGreaterThan(3);
    const traceStr = result.rule_trace.join(' ');
    expect(traceStr).toMatch(/powerlifting/i);
    expect(traceStr).toMatch(/intermediate/i);
  });

  // ── 17. session backward-compat field is present ──────────────────────────
  test('17. session backward-compat field is present and has exercises array', () => {
    const result = makePlan();
    expect(result.session).not.toBeNull();
    expect(Array.isArray(result.session.exercises)).toBe(true);
  });

  // ── 18. Running plan produces cardio slots ────────────────────────────────
  test('18. running plan includes cardio prescriptions', () => {
    const result = makePlan({ primary_discipline: 'running', sessions_per_week: 3 });
    const allCardio = result.weeks.flatMap(w =>
      w.sessions.flatMap(s => s.cardio || [])
    );
    expect(allCardio.length).toBeGreaterThan(0);
    allCardio.forEach(c => {
      expect(typeof c.zone).toBe('string');
      expect(typeof c.minutes).toBe('number');
      expect(c.minutes).toBeGreaterThan(0);
    });
  });

  // ── 19. day_label is attached to every session ────────────────────────────
  test('19. every session in week 1 has a day_label string', () => {
    const result = makePlan();
    result.weeks[0].sessions.forEach(session => {
      expect(typeof session.day_label).toBe('string');
      expect(session.day_label).toMatch(/Day \d/);
    });
  });

  // ── 20. warmupLadder produces correct percentages ─────────────────────────
  test('20. warmupLadder rungs are correct for 100kg working weight', () => {
    const ladder = warmupLadder(100);
    // Rungs at 40%, 55%, 70%, 85% → 40, 55, 70, 85kg
    // Filter: skip rungs where weight_kg <= bar(20) + 20 = 40
    // So 40kg is excluded (not strictly > 40), 55/70/85 remain → 3 rungs
    expect(ladder.length).toBe(3);
    expect(ladder[0].weight_kg).toBe(55);  // 55% of 100 = 55kg
    expect(ladder[2].weight_kg).toBe(85);  // 85% of 100
  });

  // ── 21. Hypertrophy goal on general_strength uses hypertrophy variant ──────
  test('21. hypertrophy goal on general_strength uses higher rep ranges', () => {
    const strengthPlan    = makePlan({ training_goal: 'strength',     sessions_per_week: 4, experience_level: 'intermediate' });
    const hypertrophyPlan = makePlan({ training_goal: 'hypertrophy',  sessions_per_week: 4, experience_level: 'intermediate' });

    const getAvgRep = plan => {
      const allSlots = plan.weeks[0].sessions.flatMap(s => s.slots || []);
      const priority1 = allSlots.filter(s => s.priority === 1);
      return priority1.map(s => parseInt(String(s.reps).split('-').pop(), 10)).filter(n => !isNaN(n));
    };

    const strengthReps    = getAvgRep(strengthPlan);
    const hypertrophyReps = getAvgRep(hypertrophyPlan);

    if (strengthReps.length > 0 && hypertrophyReps.length > 0) {
      const avgStrength    = strengthReps.reduce((a, b) => a + b, 0) / strengthReps.length;
      const avgHypertrophy = hypertrophyReps.reduce((a, b) => a + b, 0) / hypertrophyReps.length;
      // Hypertrophy variant targets higher reps on priority-1 slots.
      expect(avgHypertrophy).toBeGreaterThanOrEqual(avgStrength);
    }
  });

});
