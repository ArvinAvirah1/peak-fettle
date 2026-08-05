/**
 * useDailyWeight — reactive daily weight check-in state (founder 2026-08-04).
 *
 * Backs the Home card, the Health card and the rankings card's derived state.
 * Reacts to localDb writes on BOTH `bodyweight_daily` (a new reading) and
 * `bodyweight` (the derived weekly median that a reading cascades into), so a
 * save on one screen updates the others without a refetch.
 *
 * `healthPrefill` is a CONVENIENCE ONLY: it is the most recent Apple Health /
 * Health Connect body-mass sample from the last 24h, offered as the input's
 * starting value. Nothing is ever written from it without the user tapping
 * save — matching the existing user-triggered sync pattern (founder decision,
 * 2026-08-04). The read is fire-and-forget and fully guarded; on a device with
 * no Health integration it simply stays null.
 */

import { useCallback, useEffect, useState } from 'react';
import { localDb } from '../db/localDb';
import { isoWeekKey } from '../utils/dateHelpers';
import { UnitSystem } from '../constants/units';
import {
  DailyWeightEntry,
  DERIVED_MIN_SAMPLES,
  countCurrentWeekReadings,
  getDailyWeightForDay,
  getDailyWeightHistory,
  getWeekDailyWeights,
  logDailyWeight,
} from '../data/bodyweightDaily';
import { BodyweightEntry, getLatestBodyweight } from '../data/bodyweight';
import { readLatestBodyWeightKg } from '../services/healthKit';

export interface UseDailyWeightResult {
  /** Today's reading, or null if not weighed in yet today. */
  today: DailyWeightEntry | null;
  /** This ISO week's readings, oldest day first. */
  weekEntries: DailyWeightEntry[];
  /** How many days of the current ISO week have a reading (0–7). */
  weekCount: number;
  /** True once the week has enough readings to derive its median. */
  isDerivable: boolean;
  /** Daily history, oldest first (sparkline). */
  history: DailyWeightEntry[];
  /** Latest weekly-median row — derived or manually typed. */
  weekly: BodyweightEntry | null;
  /** Latest Health body-mass sample (kg) from the last 24h, or null. */
  healthPrefill: number | null;
  isLoading: boolean;
  /** Save today's (or a given day's) weight from a typed display value. */
  log: (displayValue: number, unit: UnitSystem, when?: Date) => Promise<void>;
}

export interface UseDailyWeightOptions {
  /**
   * Read the latest Apple Health / Health Connect body-mass sample to offer as
   * an input prefill. Set false on surfaces that only need the week's reading
   * COUNT (e.g. the rankings card deciding whether the median is derivable) —
   * a HealthKit query per mount is pure waste there.
   */
  withHealthPrefill?: boolean;
}

export function useDailyWeight(options: UseDailyWeightOptions = {}): UseDailyWeightResult {
  const { withHealthPrefill = true } = options;
  const [today, setToday] = useState<DailyWeightEntry | null>(null);
  const [weekEntries, setWeekEntries] = useState<DailyWeightEntry[]>([]);
  const [history, setHistory] = useState<DailyWeightEntry[]>([]);
  const [weekly, setWeekly] = useState<BodyweightEntry | null>(null);
  const [weekCount, setWeekCount] = useState(0);
  const [healthPrefill, setHealthPrefill] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const week = isoWeekKey(new Date());
      const [t, entries, n, h, w] = await Promise.all([
        getDailyWeightForDay(),
        getWeekDailyWeights(week),
        countCurrentWeekReadings(),
        getDailyWeightHistory(),
        getLatestBodyweight(),
      ]);
      setToday(t);
      setWeekEntries(entries);
      setWeekCount(n);
      setHistory(h);
      setWeekly(w);
    } catch {
      // localDb unavailable (first run before init) — keep defaults.
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    const unsubscribe = localDb.subscribe((tables) => {
      if (tables.has('bodyweight_daily') || tables.has('bodyweight')) reload();
    });
    return unsubscribe;
  }, [reload]);

  // Health prefill — one guarded read on mount, never written automatically.
  // A 1-day look-back approximates "a sample from today"; readLatestBodyWeightKg
  // returns null on any platform/permission/timeout problem.
  useEffect(() => {
    if (!withHealthPrefill) return;
    let cancelled = false;
    readLatestBodyWeightKg(1)
      .then((kg) => {
        if (!cancelled && kg != null && kg > 0) setHealthPrefill(kg);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [withHealthPrefill]);

  const log = useCallback(
    async (displayValue: number, unit: UnitSystem, when: Date = new Date()) => {
      await logDailyWeight(displayValue, unit, when, 'manual');
    },
    [],
  );

  return {
    today,
    weekEntries,
    weekCount,
    isDerivable: weekCount >= DERIVED_MIN_SAMPLES,
    history,
    weekly,
    healthPrefill,
    isLoading,
    log,
  };
}
