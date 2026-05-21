/**
 * Shared DB utilities
 */

/**
 * Generate a UUID v4 string — used as the local primary key for new rows.
 * PowerSync's conflict resolution uses these IDs to deduplicate across devices.
 */
export function generateId(): string {
  // React Native doesn't have crypto.randomUUID on all RN versions;
  // use this polyfill-safe implementation instead.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Convert kg to lbs and back — stored always in kg, displayed per preference. */
export const kgToLbs = (kg: number) => Math.round(kg * 2.20462 * 10) / 10;
export const lbsToKg = (lbs: number) => Math.round((lbs / 2.20462) * 100) / 100;

/** Epley 1RM estimate. */
export function estimateOneRepMax(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

/** Format seconds as mm:ss for rest timers. */
export function formatRestTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
