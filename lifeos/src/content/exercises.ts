/**
 * Seeded exercise library (TICKET-108) — human-written, no runtime AI (Q25).
 * Carried forward from the M-078 list. Steps are newline-separated; the
 * player renders one step per screen with the step's share of duration_sec.
 *
 * Content rules (lifeos/CONTENT_SAFETY.md): skills framing only, no clinical
 * claims, every exercise skippable, skipping never penalised.
 */

import type { localDb as LocalDbType } from '../db/localDb';
import { genId } from '../db/localDb';

export interface ExerciseSeed {
  slug: string;
  type: 'breathing' | 'grounding' | 'cbt' | 'gratitude' | 'mindfulness' | 'reflection';
  pack: string | null;
  title: string;
  durationSec: number;
  body: string;
}

export const EXERCISE_SEEDS: ExerciseSeed[] = [
  {
    slug: 'breathing-4-7-8',
    type: 'breathing',
    pack: null,
    title: '4-7-8 Breathing',
    durationSec: 180,
    body: [
      'Sit comfortably and let your shoulders drop.',
      'Breathe in quietly through your nose for a count of 4.',
      'Hold the breath for a count of 7.',
      'Exhale slowly through your mouth for a count of 8.',
      'Repeat for four full cycles, letting each exhale get a little softer.',
    ].join('\n'),
  },
  {
    slug: 'breathing-box',
    type: 'breathing',
    pack: null,
    title: 'Box Breathing',
    durationSec: 240,
    body: [
      'Breathe in through your nose for 4 counts.',
      'Hold for 4 counts.',
      'Breathe out for 4 counts.',
      'Hold empty for 4 counts.',
      'Repeat the box, tracing the four sides in your mind as you go.',
    ].join('\n'),
  },
  {
    slug: 'grounding-54321',
    type: 'grounding',
    pack: null,
    title: '5-4-3-2-1 Grounding',
    durationSec: 300,
    body: [
      'Name 5 things you can see around you.',
      'Name 4 things you can physically feel.',
      'Name 3 things you can hear.',
      'Name 2 things you can smell.',
      'Name 1 thing you can taste.',
      'Take one slow breath and notice how present you feel now.',
    ].join('\n'),
  },
  {
    slug: 'reframing-thought-record',
    type: 'cbt',
    pack: null,
    title: 'Thought Record',
    durationSec: 480,
    body: [
      'Bring to mind a situation that bothered you recently.',
      'Write the automatic thought that came with it, word for word.',
      'How strongly do you believe it, 0–100%?',
      'What evidence supports the thought? Be honest.',
      'What evidence does not fit the thought?',
      'Write a more balanced thought that accounts for both lists.',
      'Re-rate your belief in the original thought now.',
    ].join('\n'),
  },
  {
    slug: 'gratitude-three-good',
    type: 'gratitude',
    pack: null,
    title: 'Three Good Things',
    durationSec: 180,
    body: [
      'Think of three things that went well today, however small.',
      'For each one, note what made it possible.',
      'Notice your own part in at least one of them — what did you do?',
    ].join('\n'),
  },
  {
    slug: 'body-scan',
    type: 'mindfulness',
    pack: null,
    title: 'Body Scan',
    durationSec: 420,
    body: [
      'Lie down or sit back. Close your eyes if comfortable.',
      'Bring attention to your feet. Notice any sensation without changing it.',
      'Move slowly up: calves, knees, thighs.',
      'Notice your belly rising and falling.',
      'Move through chest, shoulders, arms, hands.',
      'Finish with your neck, jaw, and forehead — let each soften.',
      'Take one full breath for the whole body before opening your eyes.',
    ].join('\n'),
  },
  {
    slug: 'values-reflection',
    type: 'reflection',
    pack: null,
    title: 'What Matters Most',
    durationSec: 300,
    body: [
      'Ask yourself: what did I do this week that felt genuinely worthwhile?',
      'What does that say about what you value?',
      'Name one small action tomorrow that lines up with that value.',
    ].join('\n'),
  },
  {
    slug: 'breathing-calming',
    type: 'breathing',
    pack: 'high-stress',
    title: 'Calming Breath',
    durationSec: 120,
    body: [
      'Breathe in for 4 counts.',
      'Breathe out for 6 counts — longer out than in.',
      'Repeat for two minutes. The long exhale does the work.',
    ].join('\n'),
  },
  {
    slug: 'reframing-perspective',
    type: 'cbt',
    pack: 'high-stress',
    title: 'Zoom Out',
    durationSec: 300,
    body: [
      'Name the thing that feels overwhelming right now.',
      'How much will this matter in one week?',
      'In one month?',
      'In one year?',
      'What would you tell a friend facing exactly this?',
      'Write one next step that is actually within your control today.',
    ].join('\n'),
  },
  {
    slug: 'visualisation-performance',
    type: 'mindfulness',
    pack: 'competition-prep',
    title: 'Performance Visualisation',
    durationSec: 360,
    body: [
      'Close your eyes and picture the moment just before you perform.',
      'Walk through your routine step by step, in real time.',
      'Include the hard part — see yourself handling it steadily.',
      'Notice the feeling of finishing well. Hold it for three breaths.',
    ].join('\n'),
  },
  {
    slug: 'grounding-pre-lift',
    type: 'grounding',
    pack: 'competition-prep',
    title: 'Pre-Lift Grounding',
    durationSec: 120,
    body: [
      'Feel your feet flat on the floor. Press down slightly.',
      'One slow breath in through the nose.',
      'Sharp exhale. Shoulders down.',
      'Say your cue word. Go.',
    ].join('\n'),
  },
];

/** Idempotent seed — runs at every DB open, inserts only missing slugs. */
export async function seedExercisesIfEmpty(db: typeof LocalDbType): Promise<void> {
  for (const seed of EXERCISE_SEEDS) {
    await db.execute(
      `INSERT OR IGNORE INTO lo_exercises (id, slug, type, pack, title, body, duration_sec)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [genId(), seed.slug, seed.type, seed.pack, seed.title, seed.body, seed.durationSec],
      { tables: ['lo_exercises'] }
    );
  }
}
