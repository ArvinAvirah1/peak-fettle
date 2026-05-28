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
 */

import { Platform } from 'react-native';

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
// Data fetch — returns empty array
// ---------------------------------------------------------------------------

export async function fetchHealthKitData(
  _startDate?: Date,
  _endDate?: Date,
): Promise<DailyHealthKitSample[]> {
  return [];
}
