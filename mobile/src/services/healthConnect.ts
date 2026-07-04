/**
 * Health Connect integration service — TICKET-136 (Android leg).
 *
 * Sibling adapter to `mobile/src/services/healthKit.ts` (which owns the
 * platform-merged public surface consumers import). This file is Android-
 * only and is never imported directly by screens/hooks — `healthKit.ts`
 * delegates to it on `Platform.OS === 'android'`.
 *
 * ── Load discipline ──────────────────────────────────────────────────────
 * `react-native-health-connect` is NOT installed in this working tree (native
 * module — arrives only after the founder's `npm install` + an EAS rebuild).
 * Loaded via the same guarded dynamic `require(...)` pattern as
 * `react-native-view-shot` in `mobile/src/lib/shareCard/exportShareCard.ts`
 * and as `@kingstinct/react-native-healthkit` in healthKit.ts, so this file
 * parses/builds/runs with the package absent and `isHealthConnectAvailable`
 * simply resolves to `false` until both the package and a Health-Connect-
 * capable Android build are present.
 *
 * ── Boot-path discipline (CLAUDE.md §5) ─────────────────────────────────
 * No import-time side effects beyond the guarded require. The permission
 * request only fires when `requestHealthConnectPermissions()` is called,
 * which only happens from the user-triggered "Sync Now" action in
 * healthKit.ts → the health-metrics screen. Every native call is bounded by
 * the same 8s timeout pattern used in healthKit.ts (duplicated locally so
 * this file has no import-cycle dependency back on healthKit.ts).
 */

import { Platform } from 'react-native';
import type { CardioMetrics } from '../data/cardioMetrics';
import type { DailyHealthKitSample, ImportedCardioMetrics, CardioImportRange } from './healthKit';

const NATIVE_CALL_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, fallback: T, ms = NATIVE_CALL_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(fallback);
      }
    }, ms);
    promise.then(
      (value) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }
      },
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(fallback);
        }
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Guarded dynamic require — react-native-health-connect
// ---------------------------------------------------------------------------

interface HealthConnectRecord {
  startTime: string;
  endTime?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

interface HealthConnectModule {
  initialize: () => Promise<boolean>;
  getSdkStatus: () => Promise<number>;
  requestPermission: (
    permissions: Array<{ accessType: 'read' | 'write'; recordType: string }>,
  ) => Promise<Array<{ accessType: string; recordType: string }>>;
  readRecords: (
    recordType: string,
    options: { timeRangeFilter: { operator: 'between'; startTime: string; endTime: string } },
  ) => Promise<{ records: HealthConnectRecord[] }>;
  insertRecords: (records: Array<Record<string, unknown>>) => Promise<string[]>;
}

let hc: HealthConnectModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  hc = Platform.OS === 'android' ? (require('react-native-health-connect') as HealthConnectModule) : null;
} catch {
  hc = null;
}

/** SDK_AVAILABLE per the react-native-health-connect / Health Connect API contract. */
const SDK_AVAILABLE_STATUS = 3;

export const isHealthConnectAvailable: boolean = Platform.OS === 'android' && hc != null;

// ---------------------------------------------------------------------------
// Permissions — user-triggered only
// ---------------------------------------------------------------------------

export async function requestHealthConnectPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android' || !hc) {
    // eslint-disable-next-line no-console
    console.warn('[HealthConnect] Native module unavailable — requires an EAS build with react-native-health-connect.');
    return false;
  }
  try {
    const initialized = await withTimeout(hc.initialize(), false);
    if (!initialized) return false;

    const status = await withTimeout(hc.getSdkStatus(), 0);
    if (status !== SDK_AVAILABLE_STATUS) return false;

    const granted = await withTimeout(
      hc.requestPermission([
        { accessType: 'read', recordType: 'RestingHeartRate' },
        { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
        { accessType: 'read', recordType: 'SleepSession' },
        { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
        { accessType: 'read', recordType: 'Weight' },
        { accessType: 'read', recordType: 'ExerciseSession' },
        { accessType: 'write', recordType: 'ExerciseSession' },
      ]),
      [],
    );
    return granted.length > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Daily summary fetch
// ---------------------------------------------------------------------------

export async function fetchHealthConnectData(days = 7): Promise<DailyHealthKitSample[]> {
  if (Platform.OS !== 'android' || !hc || !isHealthConnectAvailable) return [];
  try {
    return await withTimeout(fetchHealthConnectDataInner(hc, days), [] as DailyHealthKitSample[]);
  } catch {
    return [];
  }
}

async function fetchHealthConnectDataInner(
  mod: HealthConnectModule,
  days: number,
): Promise<DailyHealthKitSample[]> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const timeRangeFilter = {
    operator: 'between' as const,
    startTime: from.toISOString(),
    endTime: to.toISOString(),
  };

  const [restingHr, hrv, sleep, activeEnergy] = await Promise.all([
    mod.readRecords('RestingHeartRate', { timeRangeFilter }).then((r) => r.records).catch(() => []),
    mod.readRecords('HeartRateVariabilityRmssd', { timeRangeFilter }).then((r) => r.records).catch(() => []),
    mod.readRecords('SleepSession', { timeRangeFilter }).then((r) => r.records).catch(() => []),
    mod.readRecords('ActiveCaloriesBurned', { timeRangeFilter }).then((r) => r.records).catch(() => []),
  ]);

  const byDay = new Map<string, { hr: number[]; hrv: number[]; sleepMin: number[]; kcal: number[] }>();
  const bucket = (dateStr: string) => {
    const key = dateStr.slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, { hr: [], hrv: [], sleepMin: [], kcal: [] });
    return byDay.get(key)!;
  };

  for (const r of restingHr) {
    const bpm = (r as { beatsPerMinute?: number }).beatsPerMinute;
    if (typeof bpm === 'number') bucket(r.startTime).hr.push(bpm);
  }
  for (const r of hrv) {
    const ms = (r as { heartRateVariabilityMillis?: number }).heartRateVariabilityMillis;
    if (typeof ms === 'number') bucket(r.startTime).hrv.push(ms);
  }
  for (const r of activeEnergy) {
    const kcal = (r as { energy?: { inKilocalories?: number } }).energy?.inKilocalories;
    if (typeof kcal === 'number') bucket(r.startTime).kcal.push(kcal);
  }
  for (const r of sleep) {
    const startMs = Date.parse(r.startTime);
    const endMs = r.endTime ? Date.parse(r.endTime) : NaN;
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
      bucket(r.startTime).sleepMin.push((endMs - startMs) / 60000);
    }
  }

  const avg = (nums: number[]): number | null =>
    nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  const sum = (nums: number[]): number | null =>
    nums.length > 0 ? nums.reduce((a, b) => a + b, 0) : null;

  const out: DailyHealthKitSample[] = [];
  for (const [date, v] of byDay.entries()) {
    out.push({
      date,
      restingHrBpm: avg(v.hr),
      hrvMs: avg(v.hrv),
      sleepHours: v.sleepMin.length > 0 ? sum(v.sleepMin)! / 60 : null,
      activeKcal: sum(v.kcal),
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

// ---------------------------------------------------------------------------
// Bodyweight read
// ---------------------------------------------------------------------------

export async function readLatestWeightKg(daysBack = 21): Promise<number | null> {
  if (Platform.OS !== 'android' || !hc || !isHealthConnectAvailable) return null;
  try {
    return await withTimeout(readLatestWeightKgInner(hc, daysBack), null);
  } catch {
    return null;
  }
}

async function readLatestWeightKgInner(mod: HealthConnectModule, daysBack: number): Promise<number | null> {
  const to = new Date();
  const from = new Date(to.getTime() - daysBack * 86_400_000);
  const { records } = await mod.readRecords('Weight', {
    timeRangeFilter: { operator: 'between', startTime: from.toISOString(), endTime: to.toISOString() },
  });
  if (records.length === 0) return null;
  const latest = [...records].sort((a, b) => b.startTime.localeCompare(a.startTime))[0];
  // Health Connect Weight record: { weight: { inKilograms: number } }. Read the
  // exact kg value directly — no lb/kg conversion happens in this file
  // (CLAUDE.md §2: conversion only at the display layer via constants/units.ts).
  const kg = (latest as { weight?: { inKilograms?: number } }).weight?.inKilograms;
  return typeof kg === 'number' && Number.isFinite(kg) ? kg : null;
}

// ---------------------------------------------------------------------------
// Cardio import
// ---------------------------------------------------------------------------

export async function importHealthConnectCardioMetrics(
  range?: CardioImportRange,
): Promise<ImportedCardioMetrics[]> {
  if (Platform.OS !== 'android' || !hc || !isHealthConnectAvailable) return [];
  try {
    return await withTimeout(importHealthConnectCardioMetricsInner(hc, range), [] as ImportedCardioMetrics[]);
  } catch {
    return [];
  }
}

async function importHealthConnectCardioMetricsInner(
  mod: HealthConnectModule,
  range: CardioImportRange | undefined,
): Promise<ImportedCardioMetrics[]> {
  const to = range?.to ? new Date(range.to) : new Date();
  const from = range?.from ? new Date(range.from) : new Date(to.getTime() - 30 * 86_400_000);

  const { records } = await mod.readRecords('ExerciseSession', {
    timeRangeFilter: { operator: 'between', startTime: from.toISOString(), endTime: to.toISOString() },
  });
  if (records.length === 0) return [];

  return records.map((r) => {
    const startMs = Date.parse(r.startTime);
    const endMs = r.endTime ? Date.parse(r.endTime) : NaN;
    const durationSec = Number.isFinite(startMs) && Number.isFinite(endMs) ? (endMs - startMs) / 1000 : undefined;
    const activityType = (r as { exerciseType?: string }).exerciseType;

    const metrics: CardioMetrics = {
      // Health Connect exposes total calories via a separate ActiveCaloriesBurned
      // record aggregated over the session window — left undefined here (not
      // fabricated) until a v2 pass joins the two record types by time range.
    };

    return {
      startedAt: r.startTime,
      activityType,
      durationSec,
      metrics,
    } satisfies ImportedCardioMetrics;
  });
}

// ---------------------------------------------------------------------------
// Write path — finished workout → Health Connect ExerciseSession
// ---------------------------------------------------------------------------

/** Minimal finished-workout shape needed to write an ExerciseSession record. */
export interface HealthConnectWorkoutSession {
  workoutId: string;
  startedAt: string;
  endedAt: string;
  activeKcal?: number;
  label?: string;
}

export async function writeWorkoutToHealthConnect(
  session: HealthConnectWorkoutSession,
): Promise<boolean> {
  if (Platform.OS !== 'android' || !hc || !isHealthConnectAvailable) return false;
  try {
    return await withTimeout(writeWorkoutToHealthConnectInner(hc, session), false);
  } catch {
    return false;
  }
}

async function writeWorkoutToHealthConnectInner(
  mod: HealthConnectModule,
  session: HealthConnectWorkoutSession,
): Promise<boolean> {
  const startTime = new Date(session.startedAt);
  const endTime = new Date(session.endedAt);
  if (!(endTime.getTime() > startTime.getTime())) return false;

  const records: Array<Record<string, unknown>> = [
    {
      recordType: 'ExerciseSession',
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      // 56 = EXERCISE_TYPE_STRENGTH_TRAINING per the Health Connect exercise
      // type taxonomy (generic strength session; matches the iOS
      // traditionalStrengthTraining choice in healthKit.ts for parity).
      exerciseType: 56,
      title: session.label ?? 'Peak Fettle Workout',
      metadata: { peakFettleWorkoutId: session.workoutId },
    },
  ];
  if (session.activeKcal != null) {
    records.push({
      recordType: 'ActiveCaloriesBurned',
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      energy: { inKilocalories: session.activeKcal },
    });
  }

  const inserted = await mod.insertRecords(records);
  return inserted.length > 0;
}
