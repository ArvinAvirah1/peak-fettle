/**
 * HealthKit integration service — TEMPORARILY STUBBED (2026-05-28).
 *
 * ROOT CAUSE OF THE STUB:
 *   Native crash on launch under iOS 26.5 BETA — Hermes EXC_BAD_ACCESS at
 *   address 0x0e inside facebook::react::TurboModuleConvertUtils::
 *   convertNSExceptionToJSError. An ObjC TurboModule (most likely the
 *   react-native-health bridge) threw an NSException at app startup that
 *   RN could not safely convert into a JS error, segfaulting the process
 *   before any UI rendered. react-native-health is also the only third-
 *   party native module in the project most likely to break under an iOS
 *   beta (HealthKit auth/threading semantics change in every iOS major).
 *
 *   Removing the dep + plugin lets the rest of the app boot. The health-
 *   metrics screen will report "data unavailable" until react-native-health
 *   (or a replacement) is verified working on iOS 26.
 *
 * Restore path:
 *   1. Re-add 'react-native-health': '^1.19.0' to mobile/package.json deps.
 *   2. Re-add the react-native-health plugin block to mobile/app.json plugins.
 *   3. Replace this file with the previous implementation (preserved at
 *      git commit 234e0f7^:mobile/src/services/healthKit.ts) — or use
 *      git log to find the last revision before this stub.
 *   4. EAS rebuild and verify the launch crash does not return.
 *
 * ── WATCH-READY ADAPTER (P5, 2026-06-17) ──────────────────────────────────
 * `importCardioMetrics(range)` below is the clean adapter seam for pulling
 * rich cardio efforts (avg/max HR, calories, cadence, elevation, splits) off
 * a watch / HealthKit workout export. It returns the SAME `CardioMetrics`
 * shape we store per-set on-device (mobile/src/data/cardioMetrics.ts), so a
 * later native re-enable is a DROP-IN: only the body of `importCardioMetrics`
 * (and the daily `fetchHealthKitData`) change to read the real native module —
 * every consumer (useHealthMetrics, api/healthMetrics) already speaks this
 * shape and needs no edit. The native re-enable is DEFERRED until the iOS-26
 * TurboModule boot crash above is resolved; until then the adapter resolves to
 * an empty list (no native call, safe on every tier and on mount).
 */

import { Platform } from 'react-native';
import type { CardioMetrics } from '../data/cardioMetrics';

// ---------------------------------------------------------------------------
// Types (kept identical to the real module so call sites still typecheck)
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

// ---------------------------------------------------------------------------
// Platform guard — always false while the native module is removed
// ---------------------------------------------------------------------------

export const isHealthKitAvailable = false;

// ---------------------------------------------------------------------------
// Permission request — no-op stub
// ---------------------------------------------------------------------------

export async function requestHealthKitPermissions(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  // eslint-disable-next-line no-console
  console.warn('[HealthKit] STUB: react-native-health is removed pending iOS 26 compat.');
  return false;
}

// ---------------------------------------------------------------------------
// Daily summary fetch — returns empty array
//
// `days` is the look-back window (the hook calls fetchHealthKitData(7)). The
// param is accepted for signature stability so the native re-enable is a
// drop-in; the stub ignores it and returns [].
// ---------------------------------------------------------------------------

export async function fetchHealthKitData(
  _days?: number,
): Promise<DailyHealthKitSample[]> {
  return [];
}

// ---------------------------------------------------------------------------
// Watch-ready cardio adapter — STUBBED (native re-enable DEFERRED)
//
// Returns the on-device CardioMetrics shape so consumers never change when the
// native module comes back. While stubbed it makes NO native call and resolves
// to an empty list, so it is safe to call on any tier and on mount.
// ---------------------------------------------------------------------------

export async function importCardioMetrics(
  _range?: CardioImportRange,
): Promise<ImportedCardioMetrics[]> {
  // DEFERRED: when react-native-health is re-enabled (see header), this reads
  // HKWorkout samples in `_range` and maps each into ImportedCardioMetrics —
  // heart-rate avg/max, active energy → calories, step cadence, elevation
  // ascended, and per-km/-mile splits → CardioMetrics. No consumer changes.
  if (Platform.OS !== 'ios' || !isHealthKitAvailable) return [];
  return [];
}
