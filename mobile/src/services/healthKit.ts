/**
 * HealthKit integration service — TICKET-136 RE-ENABLE (2026-07-03).
 *
 * ── History ──────────────────────────────────────────────────────────────
 * Stubbed 2026-05-28 after a native crash on launch under iOS 26.5 BETA
 * (Hermes EXC_BAD_ACCESS inside a TurboModule NSException conversion, almost
 * certainly thrown by `react-native-health`'s ObjC bridge). Per the ticket,
 * `react-native-health` is NOT restored — this re-enable swaps to the
 * maintained Swift-based `@kingstinct/react-native-healthkit`, which does not
 * share that bridge and is actively maintained for current iOS majors.
 *
 * ── Availability / load discipline ──────────────────────────────────────
 * `@kingstinct/react-native-healthkit` is NOT installed in this working tree
 * (native module — arrives only after the founder's `npm install` + an EAS
 * rebuild). It is loaded via a guarded dynamic `require(...)` exactly like
 * `react-native-view-shot` in `mobile/src/lib/shareCard/exportShareCard.ts`,
 * so this file parses/builds/runs (Metro bundles, `tsc`, the parse-sweep) with
 * the package absent, and `isHealthKitAvailable` simply resolves to `false`
 * until the package + native build are both present.
 *
 * ── Boot-path discipline (CLAUDE.md §5) ─────────────────────────────────
 * Nothing in this file runs on cold start. The module performs NO import-time
 * side effects beyond the guarded `require`; the authorization prompt is
 * fired ONLY from `requestHealthKitPermissions()`, which the health-metrics
 * screen calls from a user-triggered "Sync Now" button press (see
 * mobile/app/health-metrics.tsx) — never on mount. Every native call below is
 * wrapped with a timeout so a slow/hung HealthKit query can never hang the
 * screen indefinitely.
 *
 * ── Adapter seam (UNCHANGED — this is the whole point of the ticket) ────
 * `fetchHealthKitData(days)` and `importCardioMetrics(range)` keep their exact
 * signatures and return shapes from the stub. `useHealthMetrics` and
 * `api/healthMetrics` need ZERO changes — they already speak these shapes.
 *
 * ── Reads v1 ─────────────────────────────────────────────────────────────
 *   • Daily summary: resting HR, HRV, sleep, active energy (existing shape).
 *   • Bodyweight: `readLatestBodyWeightKg()` — new export, feeds the weekly
 *     `bodyweight` table (mobile/src/data/bodyweight.ts) and the on-device
 *     percentile model. Not called from this file (no boot-path network/DB
 *     writes here) — the health-metrics screen or a settings action wires it
 *     to `logWeeklyBodyweight`, user-triggered, same as the existing sync flow.
 *   • Cardio: `importCardioMetrics(range)` reads HKWorkout samples and maps
 *     each into the canonical `CardioMetrics` shape (HR avg/max, active
 *     energy → calories; cadence/elevation/splits are left undefined where
 *     the HealthKit workout-samples API doesn't expose them directly — v2
 *     can enrich via per-workout route/quantity series).
 *
 * ── Writes v1 ────────────────────────────────────────────────────────────
 *   `writeWorkoutToHealthKit(session)` — writes a finished workout as an
 *   HKWorkout (best-effort, never throws to the caller). Gated behind the
 *   `health_write_enabled` app-setting (default ON for iOS, mirroring the
 *   ticket's "default on for iOS parity"); toggle lives in appSettings.ts
 *   (getHealthWriteEnabled/setHealthWriteEnabled, exported from this file for
 *   convenience but backed by the shared KV store). The actual call site
 *   (wherever a workout session is finalized) is NOT in this file's ownership
 *   — see the PATCH SNIPPET in the agent report for the one-line hook.
 *
 * ── Android ──────────────────────────────────────────────────────────────
 * Android is Health Connect, a different SDK/permission model entirely, so it
 * lives in the sibling adapter `mobile/src/services/healthConnect.ts` (same
 * guarded-require pattern, `react-native-health-connect`). This file re-
 * exports a platform-merged surface: on iOS it drives HealthKit, on Android it
 * delegates to healthConnect.ts, and on any other platform (web, etc.) it is
 * inert. Consumers only ever import from `services/healthKit`.
 *
 * Restore-to-stub path (if `@kingstinct` also proves crashy on iOS 26 — see
 * ticket acceptance criterion 6): re-apply the STUB body (git history, this
 * file pre-2026-07-03) so every export resolves to its safe empty/false value
 * again; no consumer changes needed either way.
 */

import { Platform } from 'react-native';
import type { CardioMetrics } from '../data/cardioMetrics';
import {
  isHealthConnectAvailable,
  requestHealthConnectPermissions,
  fetchHealthConnectData,
  importHealthConnectCardioMetrics,
  writeWorkoutToHealthConnect,
  type HealthConnectWorkoutSession,
} from './healthConnect';

// ---------------------------------------------------------------------------
// Types (kept identical to the stub so call sites still typecheck)
// ---------------------------------------------------------------------------

export interface DailyHealthKitSample {
  date: string;          // YYYY-MM-DD
  restingHrBpm: number | null;
  hrvMs: number | null;
  sleepHours: number | null;
  activeKcal: number | null;
}

/**
 * One imported cardio effort from a watch / HealthKit workout export.
 *
 * `metrics` is exactly the on-device `CardioMetrics` shape (so it slots
 * straight into cardioMetrics.setSetMetrics with no remapping); the surrounding
 * fields are the workout envelope (when it happened, what it was, and the
 * fixed duration/distance/pace that live in the dedicated `sets` columns).
 */
export interface ImportedCardioMetrics {
  /** ISO timestamp the effort started (UTC). */
  startedAt: string;
  /** Activity label as reported by the source (e.g. "Outdoor Run"), if any. */
  activityType?: string;
  /** Total moving time, seconds. */
  durationSec?: number;
  /** Total distance, metres. */
  distanceM?: number;
  /** Average pace, seconds per km (derived by the source when distance known). */
  avgPaceSecPerKm?: number;
  /** Rich metrics in the canonical on-device shape (HR / calories / splits…). */
  metrics: CardioMetrics;
}

/**
 * A half-open time range for an import pull. Both bounds are ISO date or
 * datetime strings; `from` is inclusive, `to` exclusive. Either may be omitted
 * (the adapter then applies a sensible default window).
 */
export interface CardioImportRange {
  from?: string;
  to?: string;
}

/** A finished workout session in the shape needed to write an HKWorkout. */
export interface FinishedWorkoutForHealth {
  /** Local `workouts.id` — used as the HealthKit metadata correlation key. */
  workoutId: string;
  /** ISO datetime the session started. */
  startedAt: string;
  /** ISO datetime the session ended (defaults to "now" if omitted by caller). */
  endedAt: string;
  /** Total active calories for the session, if known. */
  activeKcal?: number;
  /** Human label, e.g. routine name — used as the HKWorkout's display name on platforms that support it. */
  label?: string;
}

// ---------------------------------------------------------------------------
// Timeout helper — every native call is bounded so a hung HealthKit query
// can never block the calling screen (CLAUDE.md §5 discipline).
// ---------------------------------------------------------------------------

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
// Guarded dynamic require — @kingstinct/react-native-healthkit
//
// Mirrors the pattern in mobile/src/lib/shareCard/exportShareCard.ts: resolve
// the native module lazily, inside a try/catch, so the app parses/builds/runs
// when the package is absent (it is not installed on this mount and only
// exists after the founder's `npm install` + an EAS dev-client rebuild).
// ---------------------------------------------------------------------------

/**
 * Minimal shape of the `@kingstinct/react-native-healthkit` module surface
 * this file uses. Kept narrow (only what we call) so the adapter compiles
 * whether or not the real package's types are present in node_modules.
 */
interface KingstinctHealthKitModule {
  isHealthDataAvailable: () => Promise<boolean>;
  requestAuthorization: (
    write: string[],
    read: string[],
  ) => Promise<boolean>;
  queryQuantitySamples: (
    identifier: string,
    options: { from?: Date; to?: Date; limit?: number },
  ) => Promise<Array<{ quantity: number; startDate: string; endDate: string }>>;
  queryCategorySamples: (
    identifier: string,
    options: { from?: Date; to?: Date; limit?: number },
  ) => Promise<Array<{ value: number; startDate: string; endDate: string }>>;
  queryWorkoutSamples: (
    options: { from?: Date; to?: Date; limit?: number },
  ) => Promise<Array<{
    workoutActivityType?: string;
    startDate: string;
    endDate: string;
    duration?: number;
    totalDistance?: { quantity: number; unit: string } | null;
    totalEnergyBurned?: { quantity: number; unit: string } | null;
    metadata?: Record<string, unknown>;
  }>>;
  saveWorkoutSample?: (workout: {
    workoutActivityType: string;
    startDate: Date;
    endDate: Date;
    totalEnergyBurned?: number;
    metadata?: Record<string, unknown>;
  }) => Promise<unknown>;
}

let hk: KingstinctHealthKitModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  hk = Platform.OS === 'ios' ? (require('@kingstinct/react-native-healthkit') as KingstinctHealthKitModule) : null;
} catch {
  hk = null;
}

// ---------------------------------------------------------------------------
// Platform guard
//
// True only on iOS with the native module resolvable, OR on Android with
// Health Connect resolvable. On any other platform (web, or a missing native
// module), this is false and every export below degrades to its safe no-op.
// ---------------------------------------------------------------------------

export const isHealthKitAvailable: boolean =
  (Platform.OS === 'ios' && hk != null) ||
  (Platform.OS === 'android' && isHealthConnectAvailable);

// ---------------------------------------------------------------------------
// Permission request — user-triggered ONLY (never called on mount/boot)
// ---------------------------------------------------------------------------

export async function requestHealthKitPermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    return requestHealthConnectPermissions();
  }
  if (Platform.OS !== 'ios' || !hk) {
    // eslint-disable-next-line no-console
    console.warn('[HealthKit] Native module unavailable — requires an EAS dev build with @kingstinct/react-native-healthkit.');
    return false;
  }
  try {
    const available = await withTimeout(hk.isHealthDataAvailable(), false);
    if (!available) return false;

    const readTypes = [
      'HKQuantityTypeIdentifierRestingHeartRate',
      'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
      'HKCategoryTypeIdentifierSleepAnalysis',
      'HKQuantityTypeIdentifierActiveEnergyBurned',
      'HKQuantityTypeIdentifierBodyMass',
      'HKWorkoutTypeIdentifier',
    ];
    const writeTypes = ['HKWorkoutTypeIdentifier'];

    return await withTimeout(hk.requestAuthorization(writeTypes, readTypes), false);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Daily summary fetch
//
// `days` is the look-back window (the hook calls fetchHealthKitData(7)).
// Returns [] on Android (delegates to Health Connect), on any error, or on
// timeout — never throws.
// ---------------------------------------------------------------------------

export async function fetchHealthKitData(days = 7): Promise<DailyHealthKitSample[]> {
  if (Platform.OS === 'android') {
    return fetchHealthConnectData(days);
  }
  if (Platform.OS !== 'ios' || !hk || !isHealthKitAvailable) return [];

  try {
    return await withTimeout(fetchHealthKitDataInner(hk, days), [] as DailyHealthKitSample[]);
  } catch {
    return [];
  }
}

async function fetchHealthKitDataInner(
  mod: KingstinctHealthKitModule,
  days: number,
): Promise<DailyHealthKitSample[]> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);

  const [restingHr, hrv, sleep, activeEnergy] = await Promise.all([
    mod.queryQuantitySamples('HKQuantityTypeIdentifierRestingHeartRate', { from, to }).catch(() => []),
    mod.queryQuantitySamples('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', { from, to }).catch(() => []),
    mod.queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', { from, to }).catch(() => []),
    mod.queryQuantitySamples('HKQuantityTypeIdentifierActiveEnergyBurned', { from, to }).catch(() => []),
  ]);

  // Bucket every sample by its UTC day (YYYY-MM-DD) and average per bucket.
  const byDay = new Map<string, { hr: number[]; hrv: number[]; sleepMin: number[]; kcal: number[] }>();
  const bucket = (dateStr: string) => {
    const key = dateStr.slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, { hr: [], hrv: [], sleepMin: [], kcal: [] });
    return byDay.get(key)!;
  };

  for (const s of restingHr) bucket(s.startDate).hr.push(s.quantity);
  for (const s of hrv) bucket(s.startDate).hrv.push(s.quantity);
  for (const s of activeEnergy) bucket(s.startDate).kcal.push(s.quantity);
  for (const s of sleep) {
    // HealthKit sleep category samples: duration in minutes between start/end.
    const startMs = Date.parse(s.startDate);
    const endMs = Date.parse(s.endDate);
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
      bucket(s.startDate).sleepMin.push((endMs - startMs) / 60000);
    }
  }

  const avg = (nums: number[]): number | null =>
    nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  const sum = (nums: number[]): number | null =>
    nums.length > 0 ? nums.reduce((a, b) => a + b, 0) : null;

  const out: DailyHealthKitSample[] = [];
  for (const [date, v] of byDay.entries()) {
    const sleepHours = v.sleepMin.length > 0 ? sum(v.sleepMin)! / 60 : null;
    out.push({
      date,
      restingHrBpm: avg(v.hr),
      hrvMs: avg(v.hrv),
      sleepHours,
      activeKcal: sum(v.kcal),
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

// ---------------------------------------------------------------------------
// Bodyweight read (v1 read target — feeds the weekly bodyweight table)
//
// Returns the most recent HKQuantityTypeIdentifierBodyMass sample within the
// look-back window, in EXACT kilograms (HealthKit's native quantity unit for
// body mass converts cleanly to kg via the module; we request kg directly so
// no lb/kg conversion happens in this file — CLAUDE.md §2: weight is exact kg,
// converted only via constants/units.ts at the DISPLAY layer, never here).
// Caller (a user-triggered screen action) feeds this into
// `logWeeklyBodyweight(weightKg)` — this file does not write to the
// bodyweight table itself, keeping this adapter a pure read.
// ---------------------------------------------------------------------------

export async function readLatestBodyWeightKg(daysBack = 21): Promise<number | null> {
  if (Platform.OS === 'android') {
    return fetchHealthConnectLatestWeightKg(daysBack);
  }
  if (Platform.OS !== 'ios' || !hk || !isHealthKitAvailable) return null;

  try {
    return await withTimeout(readLatestBodyWeightKgInner(hk, daysBack), null);
  } catch {
    return null;
  }
}

async function readLatestBodyWeightKgInner(
  mod: KingstinctHealthKitModule,
  daysBack: number,
): Promise<number | null> {
  const to = new Date();
  const from = new Date(to.getTime() - daysBack * 86_400_000);
  const samples = await mod
    .queryQuantitySamples('HKQuantityTypeIdentifierBodyMass', { from, to, limit: 1 })
    .catch(() => []);
  if (samples.length === 0) return null;
  // Most-recent-first isn't guaranteed by every implementation — sort defensively.
  const latest = [...samples].sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  return latest && Number.isFinite(latest.quantity) ? latest.quantity : null;
}

async function fetchHealthConnectLatestWeightKg(daysBack: number): Promise<number | null> {
  // Thin delegate kept in this file (rather than re-exported raw) so callers
  // never need to branch on platform — see healthConnect.ts for the real impl.
  const { readLatestWeightKg } = await import('./healthConnect');
  return readLatestWeightKg(daysBack).catch(() => null);
}

// ---------------------------------------------------------------------------
// Watch-ready cardio adapter — now backed by real HKWorkout samples on iOS,
// Health Connect ExerciseSession on Android.
//
// Returns the on-device CardioMetrics shape so consumers never change.
// ---------------------------------------------------------------------------

export async function importCardioMetrics(
  range?: CardioImportRange,
): Promise<ImportedCardioMetrics[]> {
  if (Platform.OS === 'android') {
    return importHealthConnectCardioMetrics(range);
  }
  if (Platform.OS !== 'ios' || !hk || !isHealthKitAvailable) return [];

  try {
    return await withTimeout(importCardioMetricsInner(hk, range), [] as ImportedCardioMetrics[]);
  } catch {
    return [];
  }
}

async function importCardioMetricsInner(
  mod: KingstinctHealthKitModule,
  range: CardioImportRange | undefined,
): Promise<ImportedCardioMetrics[]> {
  const to = range?.to ? new Date(range.to) : new Date();
  const from = range?.from ? new Date(range.from) : new Date(to.getTime() - 30 * 86_400_000);

  const workouts = await mod.queryWorkoutSamples({ from, to, limit: 100 }).catch(() => []);
  if (workouts.length === 0) return [];

  return workouts.map((w) => {
    const startMs = Date.parse(w.startDate);
    const endMs = Date.parse(w.endDate);
    const durationSec =
      typeof w.duration === 'number'
        ? w.duration
        : Number.isFinite(startMs) && Number.isFinite(endMs)
          ? (endMs - startMs) / 1000
          : undefined;
    const distanceM = w.totalDistance?.quantity;
    const avgPaceSecPerKm =
      durationSec && distanceM && distanceM > 0 ? (durationSec / (distanceM / 1000)) : undefined;

    const metrics: CardioMetrics = {
      calories:
        w.totalEnergyBurned?.quantity != null ? Math.round(w.totalEnergyBurned.quantity) : undefined,
      // avg/max HR, cadence, elevation, and splits are not exposed on the
      // workout-sample summary itself in the kingstinct API — they require a
      // second per-workout series query (HKWorkoutRoute / associated HR
      // samples). Deferred to a v2 enrichment pass; the field stays undefined
      // (never fabricated) rather than guessed.
    };

    return {
      startedAt: w.startDate,
      activityType: w.workoutActivityType,
      durationSec,
      distanceM,
      avgPaceSecPerKm,
      metrics,
    } satisfies ImportedCardioMetrics;
  });
}

// ---------------------------------------------------------------------------
// Write path v1 — finished workout → HKWorkout / Health Connect ExerciseSession
//
// Gated behind the health_write_enabled app-setting (see appSettings-style
// helpers below); best-effort — a write failure is swallowed (returns false)
// so it can never disrupt the workout-finish flow that calls it.
// ---------------------------------------------------------------------------

export async function writeWorkoutToHealthKit(
  session: FinishedWorkoutForHealth,
): Promise<boolean> {
  if (Platform.OS === 'android') {
    const hcSession: HealthConnectWorkoutSession = session;
    return writeWorkoutToHealthConnect(hcSession);
  }
  if (Platform.OS !== 'ios' || !hk || !isHealthKitAvailable || !hk.saveWorkoutSample) return false;

  try {
    return await withTimeout(writeWorkoutToHealthKitInner(hk, session), false);
  } catch {
    return false;
  }
}

async function writeWorkoutToHealthKitInner(
  mod: KingstinctHealthKitModule,
  session: FinishedWorkoutForHealth,
): Promise<boolean> {
  if (!mod.saveWorkoutSample) return false;
  const startDate = new Date(session.startedAt);
  const endDate = new Date(session.endedAt);
  if (!(endDate.getTime() > startDate.getTime())) return false;

  await mod.saveWorkoutSample({
    // HKWorkoutActivityType.traditionalStrengthTraining — generic "gym workout"
    // activity type; a future ticket can map cardio-only sessions to running/
    // cycling types once importCardioMetrics' reverse direction is needed.
    workoutActivityType: 'traditionalStrengthTraining',
    startDate,
    endDate,
    totalEnergyBurned: session.activeKcal,
    metadata: {
      peakFettleWorkoutId: session.workoutId,
      ...(session.label ? { peakFettleLabel: session.label } : {}),
    },
  });
  return true;
}

// ---------------------------------------------------------------------------
// Health-write toggle — thin typed convenience over the shared appSettings KV
// store (mobile/src/data/appSettings.ts), kept here so this service owns its
// own on/off switch without requiring an appSettings.ts edit (out of this
// ticket's file ownership). Default ON for iOS (ticket: "toggle, default on
// for iOS parity"), OFF for Android v1 (Health Connect write permissions are
// a heavier, more visible OS prompt — default-off is the safer v1 choice;
// revisit once Android soak feedback comes in).
// ---------------------------------------------------------------------------

const HEALTH_WRITE_ENABLED_KEY = 'health_write_enabled';

export async function getHealthWriteEnabled(): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getSetting } = require('../data/appSettings') as typeof import('../data/appSettings');
    const stored = await getSetting(HEALTH_WRITE_ENABLED_KEY);
    if (stored === '1') return true;
    if (stored === '0') return false;
    return Platform.OS === 'ios'; // default: on for iOS, off for Android/others
  } catch {
    return Platform.OS === 'ios';
  }
}

export async function setHealthWriteEnabled(enabled: boolean): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { setSetting } = require('../data/appSettings') as typeof import('../data/appSettings');
    await setSetting(HEALTH_WRITE_ENABLED_KEY, enabled ? '1' : '0');
  } catch {
    // best-effort — a failed toggle write just means the default applies next launch
  }
}
