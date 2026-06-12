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
