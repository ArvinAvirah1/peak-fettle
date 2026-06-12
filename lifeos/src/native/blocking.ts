/**
 * Blocking bridge facade (TICKET-102/104) — the single TS entry point to the
 * iOS FamilyControls / ManagedSettings / DeviceActivity native module.
 *
 * Design rules:
 *   - Everything degrades gracefully: when the native module is absent
 *     (Android, simulator without entitlement, Expo Go) every call is a
 *     harmless no-op and `isBlockingAvailable()` is false. The app is fully
 *     shippable with blocking off (Q18a).
 *   - Friction state lives APP-SIDE (TICKET-113 security note): the shield's
 *     "Unlock" button only deep-links into the app; the native module grants
 *     a temporary exemption ONLY via `grantExemption()`, which the friction
 *     flow calls after the wait/breathing gate completes. A forged deep link
 *     gains nothing — it just opens the friction screen.
 *
 * Native side: lifeos/targets/* (Swift) + plugins/withFamilyControls.js.
 */

import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

interface LifeOsBlockingModule {
  /** True once the user has granted Screen Time authorization. */
  isAuthorized(): Promise<boolean>;
  /** Prompts the FamilyControls authorization sheet. */
  requestAuthorization(): Promise<boolean>;
  /** Presents the system FamilyActivityPicker; resolves to an opaque token (base64 plist) or null. */
  pickApps(existingToken: string | null): Promise<string | null>;
  /** Applies a shield for the selection token, tagged with our config id. */
  applyShield(configId: string, selectionToken: string): Promise<void>;
  /** Clears the shield for a config id. */
  clearShield(configId: string): Promise<void>;
  /** Schedules DeviceActivity monitoring for a session window or daily limit. */
  scheduleActivity(configId: string, scheduleJson: string, selectionToken: string): Promise<void>;
  cancelActivity(configId: string): Promise<void>;
  /** Temporarily lifts the shield (grantWindowMin), then auto-reshields. */
  grantExemption(configId: string, grantWindowMin: number): Promise<void>;
  /**
   * Reads + clears the App Group pending-unlock marker (shield handoff).
   * Returns a SENTINEL string ("from_shield"), NOT a configId — the shield
   * API can't identify which config fired; the friction flow resolves the
   * active config itself. Only nullness is meaningful here.
   */
  consumePendingUnlock(): Promise<string | null>;
}

const native: LifeOsBlockingModule | null =
  Platform.OS === 'ios' ? requireOptionalNativeModule<LifeOsBlockingModule>('LifeOsBlocking') : null;

/** Feature flag (Q18): true only on iOS with the native module compiled in. */
export function isBlockingAvailable(): boolean {
  return Platform.OS === 'ios' && native != null;
}

async function noop<T>(value: T): Promise<T> {
  return value;
}

export const blocking = {
  isAuthorized: (): Promise<boolean> => (native ? native.isAuthorized() : noop(false)),
  requestAuthorization: (): Promise<boolean> => (native ? native.requestAuthorization() : noop(false)),
  pickApps: (existingToken: string | null): Promise<string | null> =>
    native ? native.pickApps(existingToken) : noop(null),
  applyShield: (configId: string, token: string): Promise<void> =>
    native ? native.applyShield(configId, token) : noop(undefined),
  clearShield: (configId: string): Promise<void> =>
    native ? native.clearShield(configId) : noop(undefined),
  scheduleActivity: (configId: string, scheduleJson: string, token: string): Promise<void> =>
    native ? native.scheduleActivity(configId, scheduleJson, token) : noop(undefined),
  cancelActivity: (configId: string): Promise<void> =>
    native ? native.cancelActivity(configId) : noop(undefined),
  grantExemption: (configId: string, grantWindowMin: number): Promise<void> =>
    native ? native.grantExemption(configId, grantWindowMin) : noop(undefined),
  consumePendingUnlock: (): Promise<string | null> =>
    native ? native.consumePendingUnlock() : noop(null),
};
