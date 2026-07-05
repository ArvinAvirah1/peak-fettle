/**
 * moodLevels.ts — single source of truth for mood level (1–5) metadata
 * (TICKET-173 dedupe). The face picker (MoodEntry), the year-in-pixels grid +
 * legend (YearPixels), and the mood-history day detail all import from here.
 * Never redeclare these labels locally — copy drift between surfaces is how
 * "Okay" on one screen becomes "Meh" on another.
 */

export type MoodLevel = 1 | 2 | 3 | 4 | 5;

export const MOOD_LEVELS: readonly MoodLevel[] = [1, 2, 3, 4, 5];

/** Per-level icon (Ionicons name) + display word. */
export const MOOD_LEVEL_META: Record<MoodLevel, { icon: string; label: string }> = {
  1: { icon: 'rainy-outline', label: 'Heavy' },
  2: { icon: 'cloudy-outline', label: 'Low' },
  3: { icon: 'partly-sunny-outline', label: 'Okay' },
  4: { icon: 'sunny-outline', label: 'Good' },
  5: { icon: 'star-outline', label: 'Great' },
};

/** Level → display word (e.g. 3 → 'Okay'). */
export const MOOD_LEVEL_LABELS: Record<MoodLevel, string> = {
  1: MOOD_LEVEL_META[1].label,
  2: MOOD_LEVEL_META[2].label,
  3: MOOD_LEVEL_META[3].label,
  4: MOOD_LEVEL_META[4].label,
  5: MOOD_LEVEL_META[5].label,
};

/** Clamp + round an average mood (e.g. 3.4) onto a level for labeling. */
export function moodLevelFor(mood: number): MoodLevel {
  return Math.max(1, Math.min(5, Math.round(mood))) as MoodLevel;
}
