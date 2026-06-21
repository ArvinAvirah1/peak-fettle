/**
 * appRatingsDb — TICKET-122: App Wellbeing Scoring data module.
 *
 * Wraps lo_app_ratings (schema v2, TICKET-119):
 *   token_label TEXT PRIMARY KEY   — opaque FamilyActivity token string
 *   rating      TEXT NOT NULL CHECK (rating IN ('energizing','neutral','draining'))
 *   updated_at  TEXT NOT NULL      — ISO-8601
 *
 * IMPORTANT: lo_app_ratings is device-scoped (token labels are OS-assigned
 * and non-portable). It is intentionally excluded from BACKUP_TABLES.
 * No network calls are made here — this is on-device only.
 */

import { localDb } from '../../db/localDb';

export type AppRating = 'energizing' | 'neutral' | 'draining';

export interface AppRatingRow {
  token_label: string;
  rating: AppRating;
  updated_at: string;
}

/** Fetch the rating for a single token label, or null if unrated. */
export async function getRating(tokenLabel: string): Promise<AppRatingRow | null> {
  return localDb.getFirst<AppRatingRow>(
    `SELECT token_label, rating, updated_at
       FROM lo_app_ratings
      WHERE token_label = ?`,
    [tokenLabel]
  );
}

/** Fetch all stored ratings ordered by most-recently updated. */
export async function getAllRatings(): Promise<AppRatingRow[]> {
  return localDb.getAll<AppRatingRow>(
    `SELECT token_label, rating, updated_at
       FROM lo_app_ratings
      ORDER BY updated_at DESC`
  );
}

/**
 * Upsert a rating for a token label.
 * Passing null/undefined clears the row (removes the rating).
 */
export async function setRating(tokenLabel: string, rating: AppRating | null): Promise<void> {
  if (rating === null || rating === undefined) {
    await localDb.execute(
      `DELETE FROM lo_app_ratings WHERE token_label = ?`,
      [tokenLabel],
      { tables: ['lo_app_ratings'] }
    );
    return;
  }
  const now = new Date().toISOString();
  await localDb.execute(
    `INSERT OR REPLACE INTO lo_app_ratings (token_label, rating, updated_at)
          VALUES (?, ?, ?)`,
    [tokenLabel, rating, now],
    { tables: ['lo_app_ratings'] }
  );
}
