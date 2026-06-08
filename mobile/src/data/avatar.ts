/**
 * avatar — TICKET-096 Phase 2 persistence.
 *
 * Stores the avatar CONFIG (option-set) on-device (one row, id='active') so it
 * re-renders identically anywhere and ships in the TICKET-094 local-first backup.
 */

import { localDb } from '../db/localDb';
import { AvatarConfig, normalizeAvatar } from '../components/avatar/peakAvatarOptions';

const ROW_ID = 'active';

export async function loadAvatar(): Promise<AvatarConfig | null> {
  try {
    const row = await localDb.getFirst<{ data: string }>(
      'SELECT data FROM avatar WHERE id = ?',
      [ROW_ID],
    );
    if (!row?.data) return null;
    return normalizeAvatar(JSON.parse(row.data) as Partial<AvatarConfig>);
  } catch {
    return null;
  }
}

export async function saveAvatar(cfg: AvatarConfig): Promise<void> {
  const c = normalizeAvatar(cfg);
  await localDb.execute(
    `INSERT INTO avatar (id, data, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    [ROW_ID, JSON.stringify(c), new Date().toISOString()],
    { tables: ['avatar'] },
  );
}
