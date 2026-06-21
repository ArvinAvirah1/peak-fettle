/**
 * /lifeos server calls (TICKET-111) — the entire network surface of the
 * cross-app loop. The ping carries a date and nothing else (Q30).
 */

import { apiClient } from './client';

export async function pingActivity(date: string): Promise<void> {
  await apiClient.post('/lifeos/activity-ping', { date });
}

export async function getWholePersonStreak(): Promise<number> {
  const res = await apiClient.get<{ whole_person_streak: number }>('/lifeos/whole-person-streak');
  return res.data.whole_person_streak;
}

// --- Accountability partner (TICKET-121, Q33 option a) -----------------------
// The ONLY content that leaves the device, and only when the user opts in: an
// OPAQUE, client-composed summary string keyed by a capability code the user
// shares with one partner. Never raw habit/mood/blocked-app data.

export async function postPartnerSummary(code: string, summaryText: string): Promise<void> {
  await apiClient.post('/lifeos/partner/summary', { code, summaryText });
}

export async function deletePartnerSummary(): Promise<void> {
  await apiClient.delete('/lifeos/partner/summary');
}
