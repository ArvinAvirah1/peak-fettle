/**
 * HealthKit integration service — iOS only.
 *
 * TICKET-022: This module provides a platform-safe abstraction over
 * Apple HealthKit. It returns graceful no-ops on Android.
 *
 * ── Installation requirement ──────────────────────────────────────────────
 * HealthKit access requires a development build (EAS build or bare workflow).
 * It cannot run in Expo Go.
 *
 * Install before use:
 *   npx expo install react-native-health
 *
 * Then configure in app.json plugins:
 *   {
 *     "plugins": [
 *       ["react-native-health", {
 *         "NSHealthShareUsageDescription": "Peak Fettle reads resting heart rate, HRV, and sleep data to personalise your training plans.",
 *         "NSHealthUpdateUsageDescription": "Peak Fettle does not write health data."
 *       }]
 *     ]
 *   }
 *
 * Note: NSHealth* plist keys are already in app.json (added in TICKET-016 scaffold).
 * ─────────────────────────────────────────────────────────────────────────
 *
 * TODO(HealthKit): Uncomment the react-native-health import and implementation
 *   once the EAS development build is set up. The function signatures and
 *   return types are stable — callers don't need to change.
 */

import { Platform } from 'react-native';
import { toDateKey } from '../utils/dateHelpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DailyHealthKitSample {
  date: string;          // YYYY-MM-DD
  restingHrBpm: number | null;
  hrvMs: number | null;
  sleepHours: number | null;
  activeKcal: number | null;
}

// ---------------------------------------------------------------------------
// Platform guard
// ---------------------------------------------------------------------------

export const isHealthKitAvailable = Platform.OS === 'ios';

// ---------------------------------------------------------------------------
// Permission request
// ---------------------------------------------------------------------------

/**
 * Request HealthKit read permissions for: resting HR, HRV, sleep analysis,
 * active energy burned.
 *
 * Returns true if permissions were granted (or already granted).
 * Returns false on Android or if the user denies.
 *
 * @throws if HealthKit is not available on the device (e.g. iPad without sensors).
 */
export async function requestHealthKitPermissions(): Promise<boolean> {
  if (!isHealthKitAvailable) return false;

  // TODO(HealthKit): replace stub with real implementation:
  //
  // import AppleHealthKit, { HealthKitPermissions } from 'react-native-health';
  //
  // return new Promise((resolve) => {
  //   const permissions: HealthKitPermissions = {
  //     permissions: {
  //       read: [
  //         AppleHealthKit.Constants.Permissions.HeartRate,
  //         AppleHealthKit.Constants.Permissions.HeartRateVariability,
  //         AppleHealthKit.Constants.Permissions.SleepAnalysis,
  //         AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
  //         AppleHealthKit.Constants.Permissions.RestingHeartRate,
  //       ],
  //       write: [],
  //     },
  //   };
  //   AppleHealthKit.initHealthKit(permissions, (error) => {
  //     resolve(!error);
  //   });
  // });

  console.warn('[HealthKit] stub: react-native-health not yet installed');
  return false;
}

// ---------------------------------------------------------------------------
// Data fetch
// ---------------------------------------------------------------------------

/**
 * Fetch HealthKit data for the last N days.
 * Returns one record per day. Missing data fields are null.
 *
 * On Android or when HealthKit is unavailable: returns [].
 */
export async function fetchHealthKitData(
  days: number = 7
): Promise<DailyHealthKitSample[]> {
  if (!isHealthKitAvailable) return [];

  // TODO(HealthKit): replace stub with real implementation.
  //
  // The implementation should:
  // 1. Build a date range: startDate = today - days, endDate = today
  // 2. Query each metric type via the AppleHealthKit API
  // 3. Aggregate to daily averages/sums
  // 4. Return one DailyHealthKitSample per day in the range
  //
  // Example for resting HR:
  //   AppleHealthKit.getRestingHeartRateSamples(
  //     { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
  //     (error, results) => { ... }
  //   );
  //
  // The field mapping to the server schema:
  //   restingHrBpm → resting_hr_bpm (from HeartRate or RestingHeartRate samples)
  //   hrvMs        → hrv_ms         (from HeartRateVariability samples)
  //   sleepHours   → sleep_hours    (from SleepAnalysis, sum of 'ASLEEP' minutes / 60)
  //   activeKcal   → active_kcal    (from ActiveEnergyBurned, sum per day)

  console.warn('[HealthKit] stub: react-native-health not yet installed');
  return [];
}
