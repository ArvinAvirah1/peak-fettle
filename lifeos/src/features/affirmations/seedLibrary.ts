/**
 * Affirmations seed library — TICKET-123.
 *
 * ~18 short, human-written, identity-anchored lines ("I am someone who…").
 * Each line is tagged with one identity_tag that aligns to the direction
 * engine's VALUE_KEYS (mastery, connection, health, autonomy, contribution,
 * stability, adventure) plus a few domain-aligned tags (focused, calm,
 * present, disciplined) that bridge the habit + mind domains.
 *
 * Pure module — no React, no DB imports. Safe for the @babel sweep.
 */

export interface SeedAffirmation {
  id: string;
  text: string;
  identity_tag: string;
  enabled: number; // 1 = on, 0 = off  (matches lo_affirmations schema)
  source: 'seed';
}

export const SEED_AFFIRMATIONS: SeedAffirmation[] = [
  {
    id: 'seed-01',
    text: 'I am someone who shows up for myself, even in small ways.',
    identity_tag: 'disciplined',
    enabled: 1,
    source: 'seed',
  },
  {
    id: 'seed-02',
    text: 'I am someone who is building the life I actually want, one day at a time.',
    identity_tag: 'mastery',
    enabled: 1,
    source: 'seed',
  },
  {
    id: 'seed-03',
    text: 'I am someone who can handle difficulty with steadiness.',
    identity_tag: 'calm',
    enabled: 1,
    source: 'seed',
  },
  {
    id: 'seed-04',
    text: 'I am someone who takes care of my body because I value it.',
    identity_tag: 'health',
    enabled: 1,
    source: 'seed',
  },
  {
    id: 'seed-05',
    text: 'I am someone who keeps getting better at the things that matter to me.',
    identity_tag: 'mastery',
    enabled: 1,
    source: 'seed',
  },
  {
    id: 'seed-06',
    text: 'I am someone who brings real presence to the people I care about.',
    identity_tag: 'connection',
    enabled: 1,
    source: 'seed',
  },
  {
    id: 'seed-07',
    text: 'I am someone who chooses how I spend my attention.',
    identity_tag: 'autonomy',
    enabled: 1,
    source: 'seed',
  },
  {
    id: 'seed-08',
    text: 'I am someone who notices when I am distracted and gently returns.',
    identity_tag: 'focused',
    enabled: 1,
    source: 'seed',
  },
  {
    id: 'seed-09',
    text: 'I am someone who moves toward what I value, not just away from what is uncomfortable.',
    identity_tag: 'autonomy',
    enabled: 1,
    source: 'seed',
  },
  {
    id: 'seed-10',
    text: 'I am someone who contributes something worth contributing.',
    identity_tag: 'contribution',
    enabled: 1,
    source: 'seed',
  },
  {
    id: 'seed-11',
    text: 'I am someone who creates a sense of steadiness in my own life.',
    identity_tag: 'stability',
    enabled: 1,
    source: 'seed',
  },
  {
    id: 'seed-12',
    text: 'I am someone who is present in this moment, right now.',
    identity_tag: 'present',
    enabled: 1,
    source: 'seed',
  },
  {
    id: 'seed-13',
    text: 'I am someone who keeps going when things get hard.',
    identity_tag: 'disciplined',
    enabled: 1,
    source: 'seed',
  },
  {
    id: 'seed-14',
    text: 'I am someone who stays curious about the world and myself.',
    identity_tag: 'adventure',
    enabled: 1,
    source: 'seed',
  },
  {
    id: 'seed-15',
    text: 'I am someone who rests without guilt when rest is what I need.',
    identity_tag: 'health',
    enabled: 1,
    source: 'seed',
  },
  {
    id: 'seed-16',
    text: 'I am someone who is dependable — to others and to myself.',
    identity_tag: 'stability',
    enabled: 1,
    source: 'seed',
  },
  {
    id: 'seed-17',
    text: 'I am someone who can begin without needing to be ready.',
    identity_tag: 'focused',
    enabled: 1,
    source: 'seed',
  },
  {
    id: 'seed-18',
    text: 'I am someone who treats setbacks as information, not verdicts.',
    identity_tag: 'calm',
    enabled: 1,
    source: 'seed',
  },
];

/**
 * The general-purpose fallback affirmations — no strong value tag,
 * used when there is no survey data or when no enabled line matches
 * the user's top values.
 */
export const GENERAL_AFFIRMATION_IDS = ['seed-01', 'seed-12', 'seed-13', 'seed-17'];
