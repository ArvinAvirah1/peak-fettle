/**
 * Accountability partner — local data + summary composition (TICKET-121, Q33 a).
 *
 * The lo_partner row (id='self') holds the pairing: a partner label, the
 * capability `invite_code` the user shares, the share scope, and a paused flag.
 * The daily summary sent to the server is OPAQUE and CLIENT-COMPOSED from counts
 * only — never habit names, mood notes, or blocked-app identities. formatPartner-
 * Summary() is the single, pure place that string is built, so the "summary only,
 * never raw data" guarantee is auditable in one spot (and unit-tested).
 */

import * as Crypto from 'expo-crypto';
import { dayKey, localDb } from '../../db/localDb';
import { aggregateDailyStatus, computeStreak, type LogStatus } from '../../engine/streaks';

export interface PartnerRow {
  id: string;
  partner_label: string | null;
  invite_code: string | null;
  share_scope_json: string;
  paused: number;
  created_at: string;
}

/** Counts the summary is allowed to contain — NO raw data, ever. */
export interface SummaryFacts {
  habitsDoneToday: number;
  habitsTotalToday: number;
  streakDays: number;
}

/** Generate a 128-bit URL-safe capability code (hex; matches the server regex). */
export async function generateInviteCode(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(16); // 16 bytes = 128 bits
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(''); // 32 hex chars
}

export async function getPartner(): Promise<PartnerRow | null> {
  return localDb.getFirst<PartnerRow>(`SELECT * FROM lo_partner WHERE id = 'self'`);
}

/** Create or update the single partner pairing. */
export async function upsertPartner(input: {
  partnerLabel: string;
  inviteCode: string;
  shareScope?: Record<string, unknown>;
}): Promise<void> {
  await localDb.execute(
    `INSERT INTO lo_partner (id, partner_label, invite_code, share_scope_json, paused, created_at)
     VALUES ('self', ?, ?, ?, 0, ?)
     ON CONFLICT(id) DO UPDATE SET
       partner_label = excluded.partner_label,
       invite_code = excluded.invite_code,
       share_scope_json = excluded.share_scope_json`,
    [input.partnerLabel, input.inviteCode, JSON.stringify(input.shareScope ?? {}), new Date().toISOString()],
    { tables: ['lo_partner'] },
  );
}

export async function setPartnerPaused(paused: boolean): Promise<void> {
  await localDb.execute(`UPDATE lo_partner SET paused = ? WHERE id = 'self'`, [paused ? 1 : 0], {
    tables: ['lo_partner'],
  });
}

/** Revoke: clear the local pairing (the caller also deletes the server row). */
export async function clearPartner(): Promise<void> {
  await localDb.execute(`DELETE FROM lo_partner WHERE id = 'self'`, [], { tables: ['lo_partner'] });
}

/**
 * The ONLY place the shared string is built. Pure → unit-testable + auditable.
 * Forgiving, non-shaming, counts-only (CONTENT_SAFETY §6).
 */
export function formatPartnerSummary(f: SummaryFacts): string {
  const habits =
    f.habitsTotalToday > 0
      ? `${f.habitsDoneToday}/${f.habitsTotalToday} habits today`
      : 'no habits scheduled today';
  const streak = f.streakDays > 0 ? `streak going strong at ${f.streakDays} ${f.streakDays === 1 ? 'day' : 'days'}` : 'fresh start';
  return `${habits} · ${streak}`;
}

/** Gather today's counts + streak from LOCAL data, then format (no raw data leaves here). */
export async function composePartnerSummary(now: Date = new Date()): Promise<{ facts: SummaryFacts; text: string }> {
  const today = dayKey(now);
  const habitRows = await localDb.getAll<{ id: string }>(
    `SELECT id FROM lo_habits WHERE archived_at IS NULL AND cadence = 'daily'`,
  );
  const doneRows = await localDb.getAll<{ habit_id: string }>(
    `SELECT habit_id FROM lo_habit_logs WHERE date = ? AND status = 'done'`,
    [today],
  );
  const habitsTotalToday = habitRows.length;
  const doneSet = new Set(doneRows.map((r) => r.habit_id));
  const habitsDoneToday = habitRows.filter((h) => doneSet.has(h.id)).length;

  const logRows = await localDb.getAll<{ date: string; status: LogStatus }>(
    `SELECT l.date, l.status FROM lo_habit_logs l
       JOIN lo_habits h ON h.id = l.habit_id
       WHERE h.archived_at IS NULL AND l.date <= ?
       ORDER BY l.date ASC`,
    [today],
  );
  const streakDays = computeStreak(aggregateDailyStatus(logRows), today).current;

  const facts: SummaryFacts = { habitsDoneToday, habitsTotalToday, streakDays };
  return { facts, text: formatPartnerSummary(facts) };
}
