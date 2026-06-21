/**
 * useAffirmations — reactive hook for the affirmations feature (TICKET-123).
 *
 * Wires seedAffirmationsIfEmpty + listAffirmations + pickTodayLine into a
 * single hook. Watches lo_affirmations for live-update on toggle / add.
 * Also reads the latest lo_survey_responses to extract the user's top values
 * for context-aware daily selection — no server call, all local.
 *
 * NOTE: This hook may only be used inside a component tree that is already
 * gated on isEnabled('affirmations'). The hook itself does no gating — that
 * responsibility lives in the caller (screen + Today-tab card).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { dayKey, localDb } from '../../db/localDb';
import {
  addUserLine,
  AffirmationRow,
  listAffirmations,
  pickTodayLine,
  seedAffirmationsIfEmpty,
  toggleAffirmation,
} from './affirmationsData';

// ---------------------------------------------------------------------------
// Survey values helper (local read, no server call)
// ---------------------------------------------------------------------------

/** Extract the most recent values[] from lo_survey_responses, or []. */
async function getTopValues(): Promise<string[]> {
  const row = await localDb.getFirst<{ answers_json: string }>(
    `SELECT answers_json FROM lo_survey_responses ORDER BY ts DESC LIMIT 1`
  );
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.answers_json) as { values?: string[] };
    return Array.isArray(parsed.values) ? parsed.values : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseAffirmations {
  rows: AffirmationRow[];
  todayLine: AffirmationRow | null;
  loading: boolean;
  toggle: (id: string, on: boolean) => Promise<void>;
  addLine: (text: string) => Promise<void>;
}

export function useAffirmations(): UseAffirmations {
  const [rows, setRows] = useState<AffirmationRow[]>([]);
  const [todayLine, setTodayLine] = useState<AffirmationRow | null>(null);
  const [loading, setLoading] = useState(true);
  // Hold topValues across re-renders without triggering extra loads.
  const topValuesRef = useRef<string[]>([]);

  const load = useCallback(async () => {
    await seedAffirmationsIfEmpty();
    const [all, topValues] = await Promise.all([listAffirmations(), getTopValues()]);
    topValuesRef.current = topValues;
    setRows(all);
    setTodayLine(pickTodayLine(dayKey(), topValues, all));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Reactive: re-run when lo_affirmations changes (toggle / add / external write).
  useEffect(() => {
    let cancelled = false;
    const watcher = localDb.watch('', [], {
      tables: new Set(['lo_affirmations', 'lo_survey_responses']),
    });
    (async () => {
      for await (const _ of watcher) {
        if (cancelled) break;
        await load();
      }
    })();
    return () => {
      cancelled = true;
      void watcher.return(undefined);
    };
  }, [load]);

  const toggle = useCallback(async (id: string, on: boolean): Promise<void> => {
    await toggleAffirmation(id, on);
    // Optimistic update while watcher fires.
    setRows((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, enabled: on ? 1 : 0 } : r));
      setTodayLine(pickTodayLine(dayKey(), topValuesRef.current, next));
      return next;
    });
  }, []);

  const addLine = useCallback(async (text: string): Promise<void> => {
    await addUserLine(text);
    // Watcher will fire and reload; no additional local patch needed.
  }, []);

  return { rows, todayLine, loading, toggle, addLine };
}
