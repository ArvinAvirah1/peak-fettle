// templates.js — Training Engine v1
// 7 disciplines × 3 tiers — data transcribed from workout_research/*.md
// Pure data; no DB access.  Imported by index.js and selectTemplate().
//
// Structure per template:
//   idealDays        — int, optimal sessions/week for this tier
//   deloadEvery      — int, weeks between deloads
//   progression      — { model: 'linear'|'dup'|'block', weeklyRule }
//   sessions[]       — array of session archetypes
//     archetype      — string label
//     slots[]        — exercise slots
//       pattern      — movement_pattern enum value (must match DB taxonomy)
//       sets         — int
//       reps         — string, e.g. "5" or "8-12"
//       rpe          — number
//       rest_seconds — int
//       priority     — 1=core, 2=secondary, 3=accessory
//     cardio[]?      — optional cardio prescriptions
//       zone         — string label
//       minutes      — int
//       description  — string

'use strict';

// ---------------------------------------------------------------------------
// GENERAL STRENGTH
// ---------------------------------------------------------------------------
const generalStrength = {
  beginner: {
    idealDays: 3,
    deloadEvery: 6,
    progression: { model: 'linear', weeklyRule: 'Add 2.5kg/session on compounds while reps hold; move to DUP when LP stalls.' },
    sessions: [
      {
        archetype: 'Full Body A',
        slots: [
          { pattern: 'squat',            sets: 3, reps: '8-12', rpe: 7, rest_seconds: 120, priority: 1 },
          { pattern: 'horizontal_push',  sets: 3, reps: '8-12', rpe: 7, rest_seconds: 120, priority: 1 },
          { pattern: 'vertical_pull',    sets: 3, reps: '8-12', rpe: 7, rest_seconds: 120, priority: 2 },
          { pattern: 'hinge',            sets: 2, reps: '8-10', rpe: 7, rest_seconds: 120, priority: 2 },
          { pattern: 'core',             sets: 2, reps: '10-15', rpe: 6, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Full Body B',
        slots: [
          { pattern: 'hinge',            sets: 3, reps: '5-8',  rpe: 7, rest_seconds: 150, priority: 1 },
          { pattern: 'vertical_push',    sets: 3, reps: '8-12', rpe: 7, rest_seconds: 120, priority: 1 },
          { pattern: 'horizontal_pull',  sets: 3, reps: '8-12', rpe: 7, rest_seconds: 120, priority: 2 },
          { pattern: 'lunge',            sets: 2, reps: '10-12', rpe: 6, rest_seconds: 90, priority: 3 },
          { pattern: 'isolation_arms',   sets: 2, reps: '12-15', rpe: 6, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Full Body C',
        slots: [
          { pattern: 'squat',            sets: 3, reps: '8-12', rpe: 7, rest_seconds: 120, priority: 1 },
          { pattern: 'horizontal_push',  sets: 3, reps: '8-12', rpe: 7, rest_seconds: 120, priority: 1 },
          { pattern: 'vertical_pull',    sets: 3, reps: '8-12', rpe: 7, rest_seconds: 120, priority: 2 },
          { pattern: 'carry',            sets: 2, reps: '30-40m', rpe: 7, rest_seconds: 90, priority: 3 },
          { pattern: 'core',             sets: 2, reps: '10-15', rpe: 6, rest_seconds: 60, priority: 3 },
        ],
      },
    ],
  },

  intermediate: {
    idealDays: 4,
    deloadEvery: 5,
    progression: { model: 'dup', weeklyRule: 'Heavy day (3-5 reps, RPE 8-9) + volume day (8-12 reps, RPE 7-8) per muscle group; raise loads when RPE target met.' },
    sessions: [
      {
        archetype: 'Upper — Heavy',
        slots: [
          { pattern: 'horizontal_push',  sets: 4, reps: '3-5',  rpe: 8, rest_seconds: 180, priority: 1 },
          { pattern: 'vertical_pull',    sets: 4, reps: '4-6',  rpe: 8, rest_seconds: 180, priority: 1 },
          { pattern: 'vertical_push',    sets: 3, reps: '5-8',  rpe: 8, rest_seconds: 150, priority: 2 },
          { pattern: 'horizontal_pull',  sets: 3, reps: '5-8',  rpe: 8, rest_seconds: 150, priority: 2 },
          { pattern: 'isolation_arms',   sets: 3, reps: '10-12', rpe: 7, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Lower — Heavy',
        slots: [
          { pattern: 'squat',            sets: 4, reps: '4-6',  rpe: 8, rest_seconds: 180, priority: 1 },
          { pattern: 'hinge',            sets: 4, reps: '4-6',  rpe: 8, rest_seconds: 180, priority: 1 },
          { pattern: 'lunge',            sets: 3, reps: '8-10', rpe: 7, rest_seconds: 90,  priority: 2 },
          { pattern: 'isolation_legs',   sets: 2, reps: '10-15', rpe: 7, rest_seconds: 60, priority: 3 },
          { pattern: 'isolation_calves', sets: 2, reps: '12-15', rpe: 7, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Upper — Volume',
        slots: [
          { pattern: 'horizontal_push',  sets: 4, reps: '8-12', rpe: 8, rest_seconds: 120, priority: 1 },
          { pattern: 'vertical_pull',    sets: 4, reps: '8-12', rpe: 8, rest_seconds: 120, priority: 1 },
          { pattern: 'isolation_chest',  sets: 3, reps: '12-15', rpe: 8, rest_seconds: 60, priority: 2 },
          { pattern: 'isolation_back',   sets: 3, reps: '12-15', rpe: 7, rest_seconds: 60, priority: 2 },
          { pattern: 'isolation_shoulders', sets: 3, reps: '12-15', rpe: 7, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Lower — Volume',
        slots: [
          { pattern: 'squat',            sets: 4, reps: '8-12', rpe: 8, rest_seconds: 120, priority: 1 },
          { pattern: 'hinge',            sets: 3, reps: '8-10', rpe: 8, rest_seconds: 120, priority: 1 },
          { pattern: 'lunge',            sets: 3, reps: '12-15', rpe: 7, rest_seconds: 90, priority: 2 },
          { pattern: 'isolation_legs',   sets: 3, reps: '12-15', rpe: 7, rest_seconds: 60, priority: 3 },
          { pattern: 'core',             sets: 3, reps: '12-15', rpe: 7, rest_seconds: 60, priority: 3 },
        ],
      },
    ],
  },

  advanced: {
    idealDays: 5,
    deloadEvery: 4,
    progression: { model: 'block', weeklyRule: 'Accumulation (high volume, 65-75% 1RM) → Intensification (lower volume, 80-90% 1RM) → Peak; deload between blocks.' },
    sessions: [
      {
        archetype: 'Push — Heavy',
        slots: [
          { pattern: 'horizontal_push',  sets: 5, reps: '3-5',  rpe: 9, rest_seconds: 240, priority: 1 },
          { pattern: 'vertical_push',    sets: 4, reps: '4-6',  rpe: 8, rest_seconds: 180, priority: 1 },
          { pattern: 'isolation_chest',  sets: 3, reps: '8-12', rpe: 8, rest_seconds: 90,  priority: 2 },
          { pattern: 'isolation_shoulders', sets: 3, reps: '10-15', rpe: 8, rest_seconds: 60, priority: 3 },
          { pattern: 'isolation_arms',   sets: 3, reps: '10-15', rpe: 7, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Pull — Heavy',
        slots: [
          { pattern: 'vertical_pull',    sets: 5, reps: '3-5',  rpe: 9, rest_seconds: 240, priority: 1 },
          { pattern: 'horizontal_pull',  sets: 4, reps: '4-6',  rpe: 8, rest_seconds: 180, priority: 1 },
          { pattern: 'isolation_back',   sets: 3, reps: '8-12', rpe: 8, rest_seconds: 90,  priority: 2 },
          { pattern: 'isolation_arms',   sets: 3, reps: '10-15', rpe: 7, rest_seconds: 60, priority: 3 },
          { pattern: 'core',             sets: 3, reps: '10-15', rpe: 7, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Legs — Squat Dominant',
        slots: [
          { pattern: 'squat',            sets: 5, reps: '4-6',  rpe: 9, rest_seconds: 240, priority: 1 },
          { pattern: 'lunge',            sets: 4, reps: '8-10', rpe: 8, rest_seconds: 120, priority: 2 },
          { pattern: 'isolation_legs',   sets: 4, reps: '10-15', rpe: 8, rest_seconds: 90, priority: 2 },
          { pattern: 'isolation_calves', sets: 3, reps: '12-20', rpe: 8, rest_seconds: 60, priority: 3 },
          { pattern: 'core',             sets: 3, reps: '12-15', rpe: 7, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Push — Volume',
        slots: [
          { pattern: 'horizontal_push',  sets: 4, reps: '8-12', rpe: 8, rest_seconds: 120, priority: 1 },
          { pattern: 'vertical_push',    sets: 4, reps: '8-12', rpe: 8, rest_seconds: 90,  priority: 2 },
          { pattern: 'isolation_chest',  sets: 4, reps: '12-15', rpe: 8, rest_seconds: 60, priority: 2 },
          { pattern: 'isolation_shoulders', sets: 3, reps: '15-20', rpe: 8, rest_seconds: 60, priority: 3 },
          { pattern: 'isolation_arms',   sets: 3, reps: '12-15', rpe: 7, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Legs — Hinge Dominant',
        slots: [
          { pattern: 'hinge',            sets: 5, reps: '3-5',  rpe: 9, rest_seconds: 240, priority: 1 },
          { pattern: 'squat',            sets: 3, reps: '8-10', rpe: 7, rest_seconds: 120, priority: 2 },
          { pattern: 'lunge',            sets: 3, reps: '10-12', rpe: 7, rest_seconds: 90, priority: 2 },
          { pattern: 'isolation_legs',   sets: 3, reps: '12-15', rpe: 7, rest_seconds: 60, priority: 3 },
          { pattern: 'isolation_calves', sets: 3, reps: '15-20', rpe: 7, rest_seconds: 60, priority: 3 },
        ],
      },
    ],
  },
};

// Hypertrophy (bodybuilding goal) variant — higher volume, more isolation
const generalStrengthHypertrophy = {
  beginner: {
    ...generalStrength.beginner,
    sessions: generalStrength.beginner.sessions.map(s => ({
      ...s,
      slots: s.slots.map(slot => ({
        ...slot,
        reps: slot.priority === 1 ? '10-15' : slot.reps,
        sets: slot.priority === 1 ? slot.sets + 1 : slot.sets,
      })),
    })),
  },
  intermediate: {
    ...generalStrength.intermediate,
    idealDays: 4,
    sessions: generalStrength.intermediate.sessions.map(s => ({
      ...s,
      slots: s.slots.map(slot => ({
        ...slot,
        reps: slot.priority === 1 ? '10-15' : (slot.priority === 2 ? '12-15' : '15-20'),
        sets: Math.min(slot.sets + 1, 5),
      })),
    })),
  },
  advanced: generalStrength.advanced,
};

// ---------------------------------------------------------------------------
// POWERLIFTING
// ---------------------------------------------------------------------------
const powerlifting = {
  beginner: {
    idealDays: 3,
    deloadEvery: 8,
    progression: { model: 'linear', weeklyRule: 'Add load every session (squat/DL 5kg, bench 2.5kg) while form holds; reactive deload on triple stall.' },
    sessions: [
      {
        archetype: 'Full Body — Squat Focus',
        slots: [
          { pattern: 'squat',            sets: 3, reps: '5',   rpe: 7, rest_seconds: 180, priority: 1 },
          { pattern: 'horizontal_push',  sets: 3, reps: '5',   rpe: 7, rest_seconds: 150, priority: 1 },
          { pattern: 'vertical_pull',    sets: 3, reps: '5-8', rpe: 7, rest_seconds: 120, priority: 2 },
          { pattern: 'core',             sets: 2, reps: '10-15', rpe: 6, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Full Body — Bench Focus',
        slots: [
          { pattern: 'horizontal_push',  sets: 3, reps: '5',   rpe: 7, rest_seconds: 180, priority: 1 },
          { pattern: 'squat',            sets: 3, reps: '5',   rpe: 7, rest_seconds: 150, priority: 1 },
          { pattern: 'horizontal_pull',  sets: 3, reps: '5-8', rpe: 7, rest_seconds: 120, priority: 2 },
          { pattern: 'isolation_arms',   sets: 2, reps: '10-12', rpe: 6, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Full Body — Deadlift Focus',
        slots: [
          { pattern: 'hinge',            sets: 1, reps: '5',   rpe: 8, rest_seconds: 240, priority: 1 },
          { pattern: 'horizontal_push',  sets: 3, reps: '5',   rpe: 7, rest_seconds: 150, priority: 1 },
          { pattern: 'squat',            sets: 2, reps: '5',   rpe: 7, rest_seconds: 150, priority: 2 },
          { pattern: 'core',             sets: 2, reps: '10-15', rpe: 6, rest_seconds: 60, priority: 3 },
        ],
      },
    ],
  },

  intermediate: {
    idealDays: 4,
    deloadEvery: 5,
    progression: { model: 'dup', weeklyRule: 'Volume day (RPE 6-8, 70-82% 1RM) + intensity day (RPE 8-9, 83-92% 1RM) per lift per week; raise TM 2.5-5% each mesocycle.' },
    sessions: [
      {
        archetype: 'Squat + Bench — Volume',
        slots: [
          { pattern: 'squat',            sets: 4, reps: '5-6',  rpe: 7, rest_seconds: 180, priority: 1 },
          { pattern: 'horizontal_push',  sets: 4, reps: '6-8',  rpe: 7, rest_seconds: 150, priority: 1 },
          { pattern: 'lunge',            sets: 3, reps: '8-10', rpe: 7, rest_seconds: 90,  priority: 2 },
          { pattern: 'isolation_arms',   sets: 3, reps: '10-12', rpe: 6, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Deadlift + Press',
        slots: [
          { pattern: 'hinge',            sets: 3, reps: '3-5',  rpe: 8, rest_seconds: 240, priority: 1 },
          { pattern: 'vertical_push',    sets: 3, reps: '5-8',  rpe: 7, rest_seconds: 150, priority: 2 },
          { pattern: 'vertical_pull',    sets: 4, reps: '5-8',  rpe: 7, rest_seconds: 150, priority: 2 },
          { pattern: 'core',             sets: 3, reps: '10-15', rpe: 6, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Squat + Bench — Intensity',
        slots: [
          { pattern: 'squat',            sets: 3, reps: '2-3',  rpe: 9, rest_seconds: 240, priority: 1 },
          { pattern: 'horizontal_push',  sets: 3, reps: '3-4',  rpe: 8, rest_seconds: 210, priority: 1 },
          { pattern: 'horizontal_pull',  sets: 4, reps: '5-8',  rpe: 7, rest_seconds: 120, priority: 2 },
          { pattern: 'isolation_arms',   sets: 2, reps: '10-12', rpe: 6, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Deadlift — Heavy',
        slots: [
          { pattern: 'hinge',            sets: 2, reps: '2-3',  rpe: 9, rest_seconds: 300, priority: 1 },
          { pattern: 'squat',            sets: 3, reps: '4-6',  rpe: 7, rest_seconds: 180, priority: 2 },
          { pattern: 'vertical_pull',    sets: 3, reps: '5-8',  rpe: 7, rest_seconds: 120, priority: 2 },
          { pattern: 'core',             sets: 3, reps: '10-15', rpe: 6, rest_seconds: 60, priority: 3 },
        ],
      },
    ],
  },

  advanced: {
    idealDays: 5,
    deloadEvery: 4,
    progression: { model: 'block', weeklyRule: 'Accumulation (70-80% 1RM, high sets) → Transmutation (80-90%) → Realization/Peak (90-100%); rotate variations to address sticking points.' },
    sessions: [
      {
        archetype: 'Squat — Max Effort',
        slots: [
          { pattern: 'squat',            sets: 5, reps: '1-3',  rpe: 9, rest_seconds: 300, priority: 1 },
          { pattern: 'lunge',            sets: 4, reps: '6-8',  rpe: 7, rest_seconds: 120, priority: 2 },
          { pattern: 'isolation_legs',   sets: 3, reps: '10-15', rpe: 7, rest_seconds: 90, priority: 3 },
          { pattern: 'core',             sets: 3, reps: '10-15', rpe: 7, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Bench — Max Effort',
        slots: [
          { pattern: 'horizontal_push',  sets: 5, reps: '1-3',  rpe: 9, rest_seconds: 300, priority: 1 },
          { pattern: 'vertical_push',    sets: 4, reps: '5-6',  rpe: 8, rest_seconds: 150, priority: 2 },
          { pattern: 'isolation_chest',  sets: 3, reps: '10-15', rpe: 8, rest_seconds: 60, priority: 3 },
          { pattern: 'isolation_arms',   sets: 3, reps: '10-15', rpe: 7, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Deadlift — Max Effort',
        slots: [
          { pattern: 'hinge',            sets: 4, reps: '1-3',  rpe: 9, rest_seconds: 360, priority: 1 },
          { pattern: 'squat',            sets: 3, reps: '4-6',  rpe: 7, rest_seconds: 180, priority: 2 },
          { pattern: 'horizontal_pull',  sets: 4, reps: '5-8',  rpe: 7, rest_seconds: 120, priority: 2 },
          { pattern: 'core',             sets: 3, reps: '10-15', rpe: 7, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Squat + Bench — Dynamic / Volume',
        slots: [
          { pattern: 'squat',            sets: 6, reps: '2-3',  rpe: 7, rest_seconds: 120, priority: 1 },
          { pattern: 'horizontal_push',  sets: 5, reps: '3-5',  rpe: 7, rest_seconds: 120, priority: 1 },
          { pattern: 'vertical_pull',    sets: 4, reps: '6-8',  rpe: 7, rest_seconds: 90,  priority: 2 },
          { pattern: 'isolation_arms',   sets: 3, reps: '12-15', rpe: 6, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Upper Accessories',
        slots: [
          { pattern: 'vertical_pull',    sets: 4, reps: '6-8',  rpe: 8, rest_seconds: 120, priority: 2 },
          { pattern: 'horizontal_pull',  sets: 4, reps: '8-10', rpe: 8, rest_seconds: 90,  priority: 2 },
          { pattern: 'isolation_back',   sets: 3, reps: '12-15', rpe: 7, rest_seconds: 60, priority: 3 },
          { pattern: 'isolation_shoulders', sets: 3, reps: '12-15', rpe: 7, rest_seconds: 60, priority: 3 },
          { pattern: 'core',             sets: 3, reps: '10-15', rpe: 7, rest_seconds: 60, priority: 3 },
        ],
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// WEIGHTLIFTING (Olympic)
// ---------------------------------------------------------------------------
const weightlifting = {
  beginner: {
    idealDays: 3,
    deloadEvery: 6,
    progression: { model: 'linear', weeklyRule: 'Add small load only when lift executed with sound technique; technique is the gating criterion, not the calendar.' },
    sessions: [
      {
        archetype: 'Snatch + Front Squat',
        slots: [
          { pattern: 'olympic',          sets: 4, reps: '2-3',  rpe: 6, rest_seconds: 180, priority: 1 },
          { pattern: 'squat',            sets: 4, reps: '3-5',  rpe: 7, rest_seconds: 180, priority: 1 },
          { pattern: 'vertical_push',    sets: 3, reps: '5-8',  rpe: 7, rest_seconds: 120, priority: 2 },
          { pattern: 'core',             sets: 2, reps: '10-15', rpe: 6, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Clean & Jerk + Back Squat',
        slots: [
          { pattern: 'olympic',          sets: 4, reps: '2-3',  rpe: 6, rest_seconds: 180, priority: 1 },
          { pattern: 'squat',            sets: 4, reps: '3-5',  rpe: 7, rest_seconds: 180, priority: 1 },
          { pattern: 'vertical_pull',    sets: 3, reps: '5-8',  rpe: 7, rest_seconds: 120, priority: 2 },
          { pattern: 'core',             sets: 2, reps: '10-15', rpe: 6, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Full Session + Pulls',
        slots: [
          { pattern: 'olympic',          sets: 5, reps: '2',    rpe: 7, rest_seconds: 180, priority: 1 },
          { pattern: 'hinge',            sets: 3, reps: '3-5',  rpe: 7, rest_seconds: 150, priority: 2 },
          { pattern: 'squat',            sets: 3, reps: '3-5',  rpe: 7, rest_seconds: 150, priority: 2 },
          { pattern: 'core',             sets: 2, reps: '10-15', rpe: 6, rest_seconds: 60, priority: 3 },
        ],
      },
    ],
  },

  intermediate: {
    idealDays: 4,
    deloadEvery: 4,
    progression: { model: 'block', weeklyRule: '3-week build + 1-week back-off per mesocycle; classical lifts 70-90% with periodic singles into 85-90%; re-test maxes between blocks.' },
    sessions: [
      {
        archetype: 'Snatch + Squat',
        slots: [
          { pattern: 'olympic',          sets: 5, reps: '2',    rpe: 8, rest_seconds: 180, priority: 1 },
          { pattern: 'squat',            sets: 4, reps: '3-4',  rpe: 8, rest_seconds: 180, priority: 1 },
          { pattern: 'hinge',            sets: 3, reps: '3-5',  rpe: 7, rest_seconds: 150, priority: 2 },
          { pattern: 'core',             sets: 2, reps: '10-15', rpe: 6, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Clean & Jerk + Press',
        slots: [
          { pattern: 'olympic',          sets: 5, reps: '2',    rpe: 8, rest_seconds: 180, priority: 1 },
          { pattern: 'vertical_push',    sets: 4, reps: '4-5',  rpe: 8, rest_seconds: 150, priority: 2 },
          { pattern: 'vertical_pull',    sets: 3, reps: '5-8',  rpe: 7, rest_seconds: 120, priority: 2 },
          { pattern: 'core',             sets: 2, reps: '10-15', rpe: 6, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Pulls + Back Squat',
        slots: [
          { pattern: 'hinge',            sets: 4, reps: '3',    rpe: 8, rest_seconds: 180, priority: 1 },
          { pattern: 'squat',            sets: 4, reps: '4-5',  rpe: 8, rest_seconds: 180, priority: 1 },
          { pattern: 'plyometric',       sets: 3, reps: '5',    rpe: 7, rest_seconds: 90,  priority: 2 },
          { pattern: 'core',             sets: 3, reps: '10-15', rpe: 6, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Snatch + Clean — Lighter Technical',
        slots: [
          { pattern: 'olympic',          sets: 6, reps: '1-2',  rpe: 7, rest_seconds: 150, priority: 1 },
          { pattern: 'squat',            sets: 3, reps: '3-5',  rpe: 7, rest_seconds: 150, priority: 2 },
          { pattern: 'horizontal_pull',  sets: 3, reps: '6-8',  rpe: 7, rest_seconds: 90,  priority: 3 },
          { pattern: 'core',             sets: 2, reps: '10-15', rpe: 6, rest_seconds: 60, priority: 3 },
        ],
      },
    ],
  },

  advanced: {
    idealDays: 6,
    deloadEvery: 3,
    progression: { model: 'block', weeklyRule: 'Block periodization: Accumulation → Transmutation → Realization/Peak; classical lifts 90-95% regularly; pulls 105-115%; competition taper 1-3 weeks.' },
    sessions: [
      {
        archetype: 'Snatch — Competition Priority',
        slots: [
          { pattern: 'olympic',          sets: 6, reps: '1',    rpe: 9, rest_seconds: 180, priority: 1 },
          { pattern: 'squat',            sets: 5, reps: '2-3',  rpe: 9, rest_seconds: 240, priority: 1 },
          { pattern: 'hinge',            sets: 3, reps: '2-3',  rpe: 8, rest_seconds: 180, priority: 2 },
          { pattern: 'core',             sets: 3, reps: '10-15', rpe: 7, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Clean & Jerk — Competition Priority',
        slots: [
          { pattern: 'olympic',          sets: 6, reps: '1',    rpe: 9, rest_seconds: 180, priority: 1 },
          { pattern: 'vertical_push',    sets: 4, reps: '3-4',  rpe: 9, rest_seconds: 180, priority: 2 },
          { pattern: 'vertical_pull',    sets: 4, reps: '4-5',  rpe: 8, rest_seconds: 120, priority: 2 },
          { pattern: 'core',             sets: 3, reps: '10-15', rpe: 7, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Squat + Pulls',
        slots: [
          { pattern: 'squat',            sets: 6, reps: '2-3',  rpe: 9, rest_seconds: 240, priority: 1 },
          { pattern: 'hinge',            sets: 5, reps: '2-3',  rpe: 9, rest_seconds: 240, priority: 1 },
          { pattern: 'core',             sets: 3, reps: '10-15', rpe: 7, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Technique + Volume Snatch',
        slots: [
          { pattern: 'olympic',          sets: 8, reps: '1-2',  rpe: 7, rest_seconds: 120, priority: 1 },
          { pattern: 'squat',            sets: 4, reps: '4-5',  rpe: 7, rest_seconds: 180, priority: 2 },
          { pattern: 'plyometric',       sets: 3, reps: '5',    rpe: 7, rest_seconds: 90,  priority: 3 },
          { pattern: 'core',             sets: 3, reps: '10-15', rpe: 7, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Clean Emphasis',
        slots: [
          { pattern: 'olympic',          sets: 6, reps: '2',    rpe: 8, rest_seconds: 180, priority: 1 },
          { pattern: 'squat',            sets: 4, reps: '3-4',  rpe: 8, rest_seconds: 180, priority: 1 },
          { pattern: 'horizontal_pull',  sets: 3, reps: '6-8',  rpe: 7, rest_seconds: 90,  priority: 2 },
          { pattern: 'core',             sets: 3, reps: '10-15', rpe: 7, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Recovery + Accessories',
        slots: [
          { pattern: 'olympic',          sets: 4, reps: '2',    rpe: 6, rest_seconds: 120, priority: 2 },
          { pattern: 'vertical_push',    sets: 3, reps: '6-8',  rpe: 6, rest_seconds: 90,  priority: 2 },
          { pattern: 'core',             sets: 4, reps: '10-15', rpe: 6, rest_seconds: 60, priority: 3 },
          { pattern: 'isolation_back',   sets: 3, reps: '12-15', rpe: 6, rest_seconds: 60, priority: 3 },
        ],
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// RUNNING
// ---------------------------------------------------------------------------
const running = {
  beginner: {
    idealDays: 3,
    deloadEvery: 4,
    progression: { model: 'linear', weeklyRule: '10% rule: increase weekly volume ≤10% per week; hold volume steady every 3rd-4th week.' },
    sessions: [
      {
        archetype: 'Easy Run',
        slots: [],
        cardio: [
          { zone: 'Easy (Zone 1)', minutes: 30, description: 'Conversational pace (65–75% HRmax). Run/walk intervals are fine; build to continuous 30 min.' },
        ],
      },
      {
        archetype: 'Easy Run + Strides',
        slots: [],
        cardio: [
          { zone: 'Easy (Zone 1)', minutes: 25, description: 'Conversational easy run, building aerobic base.' },
          { zone: 'Repetition (strides)', minutes: 5, description: '4×100m at comfortable fast pace, full recovery between. Builds economy without aerobic cost.' },
        ],
      },
      {
        archetype: 'Long Easy Run',
        slots: [
          { pattern: 'squat',            sets: 2, reps: '10-15', rpe: 7, rest_seconds: 60, priority: 3 },
          { pattern: 'hinge',            sets: 2, reps: '10-12', rpe: 7, rest_seconds: 60, priority: 3 },
          { pattern: 'lunge',            sets: 2, reps: '10-12', rpe: 7, rest_seconds: 60, priority: 3 },
        ],
        cardio: [
          { zone: 'Easy (Zone 1)', minutes: 40, description: 'Longest run of week — 20–30% of weekly volume. Easy, conversational throughout.' },
        ],
      },
    ],
  },

  intermediate: {
    idealDays: 4,
    deloadEvery: 4,
    progression: { model: 'linear', weeklyRule: '10% rule per week; 3:1 loading pattern (3 build : 1 recovery week); never two quality sessions back-to-back.' },
    sessions: [
      {
        archetype: 'Easy Run',
        slots: [],
        cardio: [
          { zone: 'Easy (Zone 1)', minutes: 45, description: 'Conversational aerobic base run (65–75% HRmax). Majority of weekly volume.' },
        ],
      },
      {
        archetype: 'Threshold / Tempo',
        slots: [],
        cardio: [
          { zone: 'Threshold (Zone 3)', minutes: 30, description: '20–30 min continuous at threshold pace (88–92% HRmax, "comfortably hard"), or 4–5×1 mile cruise intervals with 1 min jog recovery.' },
        ],
      },
      {
        archetype: 'VO2max Intervals',
        slots: [],
        cardio: [
          { zone: 'Interval (Zone 3)', minutes: 35, description: '5×1000m at 5K race effort (95–100% VO2max) with equal-duration jog recovery. Total interval volume ~5km.' },
        ],
      },
      {
        archetype: 'Long Run + Strength Support',
        slots: [
          { pattern: 'squat',            sets: 3, reps: '5-8',  rpe: 7, rest_seconds: 90, priority: 2 },
          { pattern: 'hinge',            sets: 3, reps: '5-8',  rpe: 7, rest_seconds: 90, priority: 2 },
          { pattern: 'lunge',            sets: 2, reps: '8-10', rpe: 7, rest_seconds: 60, priority: 3 },
          { pattern: 'plyometric',       sets: 2, reps: '8-10', rpe: 7, rest_seconds: 60, priority: 3 },
        ],
        cardio: [
          { zone: 'Easy (Zone 1)', minutes: 60, description: 'Long run — 20–30% of weekly volume at easy pace. Builds durability and fat oxidation. Optional: last 10 min at marathon pace.' },
        ],
      },
    ],
  },

  advanced: {
    idealDays: 6,
    deloadEvery: 4,
    progression: { model: 'block', weeklyRule: 'Base (aerobic volume + strides) → Build (threshold + VO2max) → Peak (race-specificity) → Taper (cut volume 40-60%). Monitor acute:chronic load.' },
    sessions: [
      {
        archetype: 'Easy Recovery Run',
        slots: [],
        cardio: [
          { zone: 'Easy (Zone 1)', minutes: 40, description: 'True recovery pace — 65–75% HRmax. Maximizes weekly volume without accumulating fatigue.' },
        ],
      },
      {
        archetype: 'Long Run',
        slots: [],
        cardio: [
          { zone: 'Easy (Zone 1)', minutes: 90, description: 'Weekly long run — 20–30% of volume, easy. Optional M-pace finish segment (last 20–30 min). Builds durability and glycogen storage.' },
        ],
      },
      {
        archetype: 'Tempo',
        slots: [],
        cardio: [
          { zone: 'Threshold (Zone 3)', minutes: 45, description: 'Continuous tempo 30–40 min at threshold pace, or 6×1 mile cruise intervals with 60s jog. Raises lactate threshold.' },
        ],
      },
      {
        archetype: 'VO2max Intervals',
        slots: [],
        cardio: [
          { zone: 'Interval (Zone 3)', minutes: 50, description: '6×800m or 5×1000m at 5K effort (near-maximal VO2max), equal-duration jog recovery. Lifts aerobic ceiling.' },
        ],
      },
      {
        archetype: 'Strides + Easy',
        slots: [],
        cardio: [
          { zone: 'Easy (Zone 1)', minutes: 30, description: 'Easy run with 8–10×100m strides at mile-pace effort, full recovery. Improves economy, leg stiffness, neuromuscular power.' },
        ],
      },
      {
        archetype: 'Strength Support',
        slots: [
          { pattern: 'squat',            sets: 3, reps: '3-5',  rpe: 8, rest_seconds: 120, priority: 1 },
          { pattern: 'hinge',            sets: 3, reps: '3-5',  rpe: 8, rest_seconds: 120, priority: 1 },
          { pattern: 'lunge',            sets: 3, reps: '6-8',  rpe: 7, rest_seconds: 90,  priority: 2 },
          { pattern: 'plyometric',       sets: 3, reps: '8-10', rpe: 7, rest_seconds: 90,  priority: 2 },
          { pattern: 'core',             sets: 3, reps: '10-15', rpe: 7, rest_seconds: 60, priority: 3 },
        ],
        cardio: [],
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// CYCLING
// ---------------------------------------------------------------------------
const cycling = {
  beginner: {
    idealDays: 3,
    deloadEvery: 4,
    progression: { model: 'linear', weeklyRule: 'Build duration before intensity; increase weekly volume gradually (cycling tolerates more than running 10% guideline, but respect soft cap).' },
    sessions: [
      {
        archetype: 'Zone 2 Endurance Ride',
        slots: [],
        cardio: [
          { zone: 'Zone 2 Endurance (56–75% FTP)', minutes: 45, description: 'Aerobic base ride at conversational effort. Drives mitochondrial adaptation and fat oxidation.' },
        ],
      },
      {
        archetype: 'Zone 2 Mid Ride',
        slots: [],
        cardio: [
          { zone: 'Zone 2 Endurance (56–75% FTP)', minutes: 60, description: 'Moderate-duration Zone 2 ride. Steady conversational effort throughout.' },
        ],
      },
      {
        archetype: 'Long Endurance Ride',
        slots: [],
        cardio: [
          { zone: 'Zone 2 Endurance (56–75% FTP)', minutes: 90, description: 'Longer easy ride — builds durability and aerobic volume. A few short up-tempo efforts optional to break it up.' },
        ],
      },
    ],
  },

  intermediate: {
    idealDays: 4,
    deloadEvery: 4,
    progression: { model: 'dup', weeklyRule: '3:1 loading (3 build : 1 recovery week). Sweet-spot intervals best in build phase, not pure base. Polarized in base (Zone 2 + hard intervals), pyramidal in build.' },
    sessions: [
      {
        archetype: 'Zone 2 Endurance',
        slots: [],
        cardio: [
          { zone: 'Zone 2 Endurance (56–75% FTP)', minutes: 60, description: 'Aerobic base ride — the majority of weekly volume. Easy conversational effort.' },
        ],
      },
      {
        archetype: 'Sweet-Spot Intervals',
        slots: [],
        cardio: [
          { zone: 'Sweet-Spot (88–95% FTP)', minutes: 50, description: '2×20 min at sweet-spot (88–95% FTP) with 5 min recovery between. Time-efficient FTP builder. Best used in build phase.' },
        ],
      },
      {
        archetype: 'VO2max Intervals',
        slots: [],
        cardio: [
          { zone: 'Zone 5 VO2max (106–120% FTP)', minutes: 45, description: '5×4 min at 106–120% FTP, 4 min recovery between. Lifts aerobic ceiling.' },
        ],
      },
      {
        archetype: 'Long Endurance + Strength',
        slots: [
          { pattern: 'squat',            sets: 3, reps: '4-6',  rpe: 8, rest_seconds: 120, priority: 1 },
          { pattern: 'hinge',            sets: 3, reps: '4-6',  rpe: 8, rest_seconds: 120, priority: 1 },
          { pattern: 'lunge',            sets: 2, reps: '8-10', rpe: 7, rest_seconds: 90,  priority: 3 },
          { pattern: 'core',             sets: 2, reps: '10-15', rpe: 7, rest_seconds: 60, priority: 3 },
        ],
        cardio: [
          { zone: 'Zone 2 Endurance (56–75% FTP)', minutes: 90, description: 'Long endurance ride — durability and aerobic volume. Keep it easy.' },
        ],
      },
    ],
  },

  advanced: {
    idealDays: 5,
    deloadEvery: 4,
    progression: { model: 'block', weeklyRule: '8 weeks pyramidal base/build → 8 weeks polarized pre-race. 2–3 quality sessions/week. Monitor with power CTL/ATL/TSB.' },
    sessions: [
      {
        archetype: 'Zone 2 Endurance',
        slots: [],
        cardio: [
          { zone: 'Zone 2 Endurance (56–75% FTP)', minutes: 90, description: 'High-volume aerobic base — mitochondrial density, fat oxidation, durability.' },
        ],
      },
      {
        archetype: 'Threshold Intervals',
        slots: [],
        cardio: [
          { zone: 'Zone 4 Threshold (91–105% FTP)', minutes: 60, description: '3×15 min at 91–105% FTP, 5 min recovery. Directly raises FTP — the money zone for road performance.' },
        ],
      },
      {
        archetype: 'VO2max Intervals',
        slots: [],
        cardio: [
          { zone: 'Zone 5 VO2max (106–120% FTP)', minutes: 60, description: '5–6×5 min at 106–120% FTP, near-equal recovery. Lifts aerobic ceiling.' },
        ],
      },
      {
        archetype: 'Long Ride',
        slots: [],
        cardio: [
          { zone: 'Zone 2 Endurance (56–75% FTP)', minutes: 180, description: 'Extended endurance — 3+ hr at Zone 2. Builds durability, fat oxidation, and race-day stamina.' },
        ],
      },
      {
        archetype: 'Strength Support',
        slots: [
          { pattern: 'squat',            sets: 4, reps: '4-6',  rpe: 8, rest_seconds: 120, priority: 1 },
          { pattern: 'hinge',            sets: 3, reps: '4-6',  rpe: 8, rest_seconds: 120, priority: 2 },
          { pattern: 'lunge',            sets: 3, reps: '6-8',  rpe: 7, rest_seconds: 90,  priority: 2 },
          { pattern: 'core',             sets: 3, reps: '10-15', rpe: 7, rest_seconds: 60, priority: 3 },
        ],
        cardio: [],
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// SWIMMING
// ---------------------------------------------------------------------------
const swimming = {
  beginner: {
    idealDays: 3,
    deloadEvery: 4,
    progression: { model: 'linear', weeklyRule: 'Add distance and reduce rest before adding intensity. Technique practice in every session — fatigue cements bad patterns.' },
    sessions: [
      {
        archetype: 'Technique + Easy Aerobic',
        slots: [],
        cardio: [
          { zone: 'Easy Aerobic (65–75% CSS)', minutes: 30, description: 'Drill sets dominate (6-kick/2-stroke, catch-up, single-arm). Short aerobic swims 10–20×25–50m with generous rest (15–30s). Quality over quantity.' },
        ],
      },
      {
        archetype: 'Aerobic Base',
        slots: [],
        cardio: [
          { zone: 'Easy Aerobic (65–75% CSS)', minutes: 35, description: 'Build 50s/100s at easy effort. Progressive rest reduction over weeks. Body position drill integration.' },
        ],
      },
      {
        archetype: 'Kick + Drills',
        slots: [
          { pattern: 'horizontal_pull',  sets: 3, reps: '8-12', rpe: 7, rest_seconds: 60, priority: 3 },
          { pattern: 'core',             sets: 3, reps: '10-15', rpe: 6, rest_seconds: 60, priority: 3 },
        ],
        cardio: [
          { zone: 'Easy Aerobic (65–75% CSS)', minutes: 25, description: 'Kick sets (streamline or kickboard), drill work. Develops leg kick, body position, rotation.' },
        ],
      },
    ],
  },

  intermediate: {
    idealDays: 4,
    deloadEvery: 4,
    progression: { model: 'linear', weeklyRule: 'CSS build: add one 100m to CSS set per week (e.g., 5 → 10 × 100m @ CSS). Never sacrifice technique to hit targets.' },
    sessions: [
      {
        archetype: 'Aerobic Base',
        slots: [],
        cardio: [
          { zone: 'Endurance (75–90% CSS)', minutes: 40, description: 'Continuous aerobic swim or build 50s/100s. Aerobic base development.' },
        ],
      },
      {
        archetype: 'Threshold / CSS',
        slots: [],
        cardio: [
          { zone: 'Threshold (90–100% CSS)', minutes: 45, description: '5–8×100m at CSS (Critical Swim Speed) with 15–20s rest. Primary FTP analog for swimming.' },
        ],
      },
      {
        archetype: 'Technique + Kick',
        slots: [],
        cardio: [
          { zone: 'Easy Aerobic (65–75% CSS)', minutes: 35, description: 'Technique drills (EV forearm catch, body rotation, breathing), kick sets. Maintain efficiency under light fatigue.' },
        ],
      },
      {
        archetype: 'Dryland Strength + Swim',
        slots: [
          { pattern: 'vertical_pull',    sets: 3, reps: '6-10', rpe: 8, rest_seconds: 90, priority: 1 },
          { pattern: 'horizontal_pull',  sets: 3, reps: '8-12', rpe: 7, rest_seconds: 90, priority: 1 },
          { pattern: 'hinge',            sets: 3, reps: '8-12', rpe: 7, rest_seconds: 90, priority: 2 },
          { pattern: 'core',             sets: 3, reps: '10-15', rpe: 7, rest_seconds: 60, priority: 3 },
          { pattern: 'plyometric',       sets: 2, reps: '6-8',  rpe: 7, rest_seconds: 90, priority: 3 },
        ],
        cardio: [
          { zone: 'Easy Aerobic (65–75% CSS)', minutes: 20, description: 'Short easy aerobic swim after dryland work.' },
        ],
      },
    ],
  },

  advanced: {
    idealDays: 5,
    deloadEvery: 3,
    progression: { model: 'block', weeklyRule: 'Block periodization: General → Specific → Taper. 2-week taper for championship (volume drops sharply, intensity maintained).' },
    sessions: [
      {
        archetype: 'Aerobic Base',
        slots: [],
        cardio: [
          { zone: 'Endurance (75–90% CSS)', minutes: 50, description: 'High aerobic volume (4000m+ session). Build 100s/200s. Foundation of performance.' },
        ],
      },
      {
        archetype: 'Threshold / CSS',
        slots: [],
        cardio: [
          { zone: 'Threshold (90–100% CSS)', minutes: 55, description: '8–10×100m at CSS or 3×500m CSS. 1–2× per week. Aerobic capacity without deep fatigue.' },
        ],
      },
      {
        archetype: 'VO2max / Sprint',
        slots: [],
        cardio: [
          { zone: 'VO2max (90–95% max)', minutes: 40, description: '10×50m at 90–95% max, 30s rest; or 3×300m hard, 4 min rest. Lifts aerobic ceiling and race-pace tolerance.' },
        ],
      },
      {
        archetype: 'Technique + Race Pace',
        slots: [],
        cardio: [
          { zone: 'Race Pace', minutes: 45, description: 'Technique drills + broken swims at race pace (e.g., 100+2×50 to simulate 200). Race-specific speed and lactate tolerance.' },
        ],
      },
      {
        archetype: 'Dryland Strength',
        slots: [
          { pattern: 'vertical_pull',    sets: 4, reps: '4-6',  rpe: 8, rest_seconds: 120, priority: 1 },
          { pattern: 'horizontal_pull',  sets: 4, reps: '6-8',  rpe: 8, rest_seconds: 90,  priority: 1 },
          { pattern: 'hinge',            sets: 3, reps: '5-8',  rpe: 8, rest_seconds: 90,  priority: 2 },
          { pattern: 'plyometric',       sets: 3, reps: '5-8',  rpe: 8, rest_seconds: 90,  priority: 2 },
          { pattern: 'core',             sets: 4, reps: '10-15', rpe: 8, rest_seconds: 60, priority: 3 },
        ],
        cardio: [],
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// OTHER / MIXED (Hybrid / Concurrent)
// ---------------------------------------------------------------------------
const otherMixed = {
  beginner: {
    idealDays: 4,
    deloadEvery: 6,
    progression: { model: 'linear', weeklyRule: 'Linear on lifts; progressive duration on conditioning. Keep strength and hard conditioning on different days.' },
    sessions: [
      {
        archetype: 'Full Body Strength',
        slots: [
          { pattern: 'squat',            sets: 3, reps: '8-12', rpe: 7, rest_seconds: 120, priority: 1 },
          { pattern: 'hinge',            sets: 3, reps: '8-12', rpe: 7, rest_seconds: 120, priority: 1 },
          { pattern: 'horizontal_push',  sets: 3, reps: '8-12', rpe: 7, rest_seconds: 120, priority: 2 },
          { pattern: 'vertical_pull',    sets: 3, reps: '8-12', rpe: 7, rest_seconds: 120, priority: 2 },
          { pattern: 'core',             sets: 2, reps: '10-15', rpe: 6, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Aerobic Conditioning',
        slots: [],
        cardio: [
          { zone: 'Zone 2 / Easy (65–75% HRmax)', minutes: 30, description: 'Moderate-intensity aerobic work (run, bike, row, or jump rope). Build to 150 min/week total moderate cardio.' },
        ],
      },
      {
        archetype: 'Full Body Strength B',
        slots: [
          { pattern: 'horizontal_push',  sets: 3, reps: '8-12', rpe: 7, rest_seconds: 120, priority: 1 },
          { pattern: 'vertical_pull',    sets: 3, reps: '8-12', rpe: 7, rest_seconds: 120, priority: 1 },
          { pattern: 'lunge',            sets: 2, reps: '10-12', rpe: 7, rest_seconds: 90, priority: 2 },
          { pattern: 'carry',            sets: 2, reps: '30-40m', rpe: 7, rest_seconds: 90, priority: 3 },
          { pattern: 'core',             sets: 2, reps: '10-15', rpe: 6, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Easy Conditioning',
        slots: [],
        cardio: [
          { zone: 'Zone 2 / Easy (65–75% HRmax)', minutes: 25, description: 'Easy aerobic conditioning. Minimal interference with strength days.' },
        ],
      },
    ],
  },

  intermediate: {
    idealDays: 5,
    deloadEvery: 5,
    progression: { model: 'dup', weeklyRule: '"Training see-saw" — when pushing strength hard, dial conditioning back to maintenance, and vice versa. High-Low model: cluster hard sessions, follow with recovery.' },
    sessions: [
      {
        archetype: 'Upper Strength',
        slots: [
          { pattern: 'horizontal_push',  sets: 4, reps: '4-8',  rpe: 8, rest_seconds: 180, priority: 1 },
          { pattern: 'vertical_pull',    sets: 4, reps: '5-8',  rpe: 8, rest_seconds: 150, priority: 1 },
          { pattern: 'vertical_push',    sets: 3, reps: '6-10', rpe: 7, rest_seconds: 120, priority: 2 },
          { pattern: 'horizontal_pull',  sets: 3, reps: '8-12', rpe: 7, rest_seconds: 90,  priority: 2 },
          { pattern: 'isolation_arms',   sets: 3, reps: '10-15', rpe: 7, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Lower Strength + HIIT',
        slots: [
          { pattern: 'squat',            sets: 4, reps: '4-8',  rpe: 8, rest_seconds: 180, priority: 1 },
          { pattern: 'hinge',            sets: 3, reps: '5-8',  rpe: 8, rest_seconds: 180, priority: 1 },
          { pattern: 'plyometric',       sets: 3, reps: '5-8',  rpe: 7, rest_seconds: 90,  priority: 2 },
          { pattern: 'carry',            sets: 2, reps: '30-40m', rpe: 7, rest_seconds: 90, priority: 3 },
        ],
        cardio: [
          { zone: 'Conditioning (HIIT/Metcon)', minutes: 15, description: 'Short hard conditioning finisher (≤30 min to limit interference). Row/bike intervals or bodyweight metcon after lifting.' },
        ],
      },
      {
        archetype: 'Zone 2 Conditioning',
        slots: [],
        cardio: [
          { zone: 'Zone 2 / Easy (65–75% HRmax)', minutes: 45, description: 'Low-intensity aerobic conditioning. Cycling/rowing preferred to minimize eccentric interference with strength.' },
        ],
      },
      {
        archetype: 'Full Body Power',
        slots: [
          { pattern: 'olympic',          sets: 4, reps: '3-5',  rpe: 7, rest_seconds: 150, priority: 1 },
          { pattern: 'squat',            sets: 3, reps: '6-8',  rpe: 8, rest_seconds: 150, priority: 2 },
          { pattern: 'horizontal_push',  sets: 3, reps: '8-10', rpe: 7, rest_seconds: 90,  priority: 2 },
          { pattern: 'core',             sets: 3, reps: '10-15', rpe: 7, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Interval Conditioning',
        slots: [],
        cardio: [
          { zone: 'High Intensity (>80% HRmax)', minutes: 30, description: '~80/20 polarized: hard intervals (bike/row/run) 20% of weekly cardio volume. Quality effort, full recovery between reps.' },
        ],
      },
    ],
  },

  advanced: {
    idealDays: 6,
    deloadEvery: 3,
    progression: { model: 'block', weeklyRule: 'Block emphasis shifts — strength emphasis block (conditioning at maintenance ≈2 short sessions) alternates with conditioning block (strength at maintenance ≈6 sets/muscle). Two-a-days for ≥6h session separation.' },
    sessions: [
      {
        archetype: 'Strength — Lower Power',
        slots: [
          { pattern: 'olympic',          sets: 5, reps: '2-3',  rpe: 8, rest_seconds: 180, priority: 1 },
          { pattern: 'squat',            sets: 5, reps: '3-5',  rpe: 9, rest_seconds: 240, priority: 1 },
          { pattern: 'hinge',            sets: 4, reps: '3-5',  rpe: 8, rest_seconds: 180, priority: 2 },
          { pattern: 'plyometric',       sets: 3, reps: '5',    rpe: 8, rest_seconds: 90,  priority: 2 },
          { pattern: 'core',             sets: 3, reps: '10-15', rpe: 7, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Zone 2 Endurance',
        slots: [],
        cardio: [
          { zone: 'Zone 2 / Easy (65–75% HRmax)', minutes: 50, description: 'Aerobic base. ~80% of weekly cardio volume at Zone 2. Cycling/rowing preferred when protecting strength block.' },
        ],
      },
      {
        archetype: 'Upper Strength',
        slots: [
          { pattern: 'horizontal_push',  sets: 5, reps: '3-5',  rpe: 9, rest_seconds: 240, priority: 1 },
          { pattern: 'vertical_pull',    sets: 5, reps: '4-6',  rpe: 9, rest_seconds: 180, priority: 1 },
          { pattern: 'vertical_push',    sets: 4, reps: '5-8',  rpe: 8, rest_seconds: 150, priority: 2 },
          { pattern: 'horizontal_pull',  sets: 4, reps: '6-8',  rpe: 8, rest_seconds: 120, priority: 2 },
          { pattern: 'isolation_arms',   sets: 3, reps: '10-15', rpe: 7, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Threshold Conditioning',
        slots: [],
        cardio: [
          { zone: 'High Intensity (>80% HRmax)', minutes: 40, description: 'Threshold intervals or metcon — ~20% of weekly cardio volume. Hard intervals (row/bike/run) or barbell/DB complex circuit.' },
        ],
      },
      {
        archetype: 'Full Body Maintenance',
        slots: [
          { pattern: 'squat',            sets: 3, reps: '4-6',  rpe: 7, rest_seconds: 150, priority: 2 },
          { pattern: 'hinge',            sets: 3, reps: '4-6',  rpe: 7, rest_seconds: 150, priority: 2 },
          { pattern: 'horizontal_push',  sets: 3, reps: '6-8',  rpe: 7, rest_seconds: 120, priority: 2 },
          { pattern: 'carry',            sets: 3, reps: '30-40m', rpe: 7, rest_seconds: 90, priority: 3 },
          { pattern: 'core',             sets: 3, reps: '10-15', rpe: 7, rest_seconds: 60, priority: 3 },
        ],
      },
      {
        archetype: 'Zone 2 Long Conditioning',
        slots: [],
        cardio: [
          { zone: 'Zone 2 / Easy (65–75% HRmax)', minutes: 60, description: 'Longer aerobic session — durability and aerobic volume. Preferred when in conditioning-emphasis block.' },
        ],
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// EXPORT MAP
// ---------------------------------------------------------------------------
// Keyed by primary_discipline (normalized to lowercase, spaces→underscore)
module.exports = {
  general_strength:         generalStrength,
  general_strength_hypertrophy: generalStrengthHypertrophy,
  powerlifting:             powerlifting,
  weightlifting:            weightlifting,
  running:                  running,
  cycling:                  cycling,
  swimming:                 swimming,
  other_mixed:              otherMixed,

  // Convenience helper
  getTemplate(discipline, tier, goal) {
    const normDisc = (discipline || 'general_strength')
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/-/g, '_');

    // Bodybuilding/hypertrophy goal on general strength → hypertrophy variant
    const useHypertrophy = (normDisc === 'general_strength') &&
                           (goal === 'hypertrophy');
    const disciplineTemplates = useHypertrophy
      ? generalStrengthHypertrophy
      : (module.exports[normDisc] || generalStrength);

    const normTier = (tier || 'beginner').toLowerCase();
    return disciplineTemplates[normTier] || disciplineTemplates['beginner'] || null;
  },
};
