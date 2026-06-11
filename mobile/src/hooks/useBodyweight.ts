/**
 * useBodyweight — reactive weekly-median bodyweight state (founder 2026-06-10).
 *
 * Exposes the latest entry, whether THIS ISO week has one (drives the weekly
 * prompt), freshness for the tier gate, full history (Trends chart), and a
 * log function. Reacts to localDb writes on the 'bodyweight' table.
 */

import { useCallback, useEffect, useState } from 'react';
import { localDb } from '../db/localDb';
import {
  BodyweightEntry,
  getLatestBodyweight,
  getBodyweightHistory,
  hasCurrentWeekEntry,
  isFreshForTier,
  logWeeklyBodyweight,
} from '../data/bodyweight';

export interface UseBodyweightResult {
  latest: BodyweightEntry | null;
  history: BodyweightEntry[];
  hasThisWeek: boolean;
  /** Fresh enough for the tier ladder (≤ TIER_FRESHNESS_DAYS old). */
  freshForTier: boolean;
  isLoading: boolean;
  log: (weightKg: number) => Promise<void>;
}

export function useBodyweight(): UseBodyweightResult {
  const [latest, setLatest] = useState<BodyweightEntry | null>(null);
  const [history, setHistory] = useState<BodyweightEntry[]>([]);
  const [hasThisWeek, setHasThisWeek] = useState(true); // optimistic: no prompt flash
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [l, h, cur] = await Promise.all([
        getLatestBodyweight(),
        getBodyweightHistory(),
        hasCurrentWeekEntry(),
      ]);
      setLatest(l);
      setHistory(h);
      setHasThisWeek(cur);
    } catch {
      // localDb unavailable (e.g. first run before init) — keep defaults.
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    const unsubscribe = localDb.subscribe((tables) => {
      if (tables.has('bodyweight')) reload();
    });
    return unsubscribe;
  }, [reload]);

  const log = useCallback(async (weightKg: number) => {
    await logWeeklyBodyweight(weightKg);
  }, []);

  return {
    latest,
    history,
    hasThisWeek,
    freshForTier: isFreshForTier(latest),
    isLoading,
    log,
  };
}
