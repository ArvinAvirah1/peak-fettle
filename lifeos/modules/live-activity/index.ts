/**
 * Live Activity bridge (TICKET-118) — thin RN wrapper over the iOS ActivityKit
 * module that drives the focus-session Dynamic Island / lock-screen countdown
 * (LifeOSFocusAttributes / LifeOSFocusLiveActivity in targets/widget/index.swift).
 *
 * ActivityKit cannot be started from a widget extension — it must run in the app
 * process, hence this module. iOS 16.2+; a safe no-op on older iOS, Android, web,
 * and Expo Go (native module absent). Every call is guarded so focus sessions
 * keep working even when the Live Activity can't show.
 */

import { Platform } from 'react-native';

interface LiveActivityNative {
  startFocusActivity(name: string, endsAtISO: string, accentHex: string): void;
  updateFocusActivity(blocksHeld: number, endsAtISO: string | null): void;
  endFocusActivity(): void;
}

let native: LiveActivityNative | null | undefined;

function getNative(): LiveActivityNative | null {
  if (native !== undefined) return native;
  if (Platform.OS !== 'ios') {
    native = null;
    return null;
  }
  try {
    // Expo local module, autolinked on a macOS prebuild. Absent in Expo Go.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireNativeModule } = require('expo-modules-core');
    native = requireNativeModule('LifeOSLiveActivity') as LiveActivityNative;
  } catch {
    native = null;
  }
  return native;
}

export const liveActivity = {
  /** Start (or restart) the focus Live Activity. accentHex defaults to the Summit amber. */
  start(name: string, endsAtISO: string, accentHex = '#F2A93B'): void {
    try {
      getNative()?.startFocusActivity(name, endsAtISO, accentHex);
    } catch {
      /* never break a focus session */
    }
  },
  /** Update the running activity's blocks-held count (and optionally a new end time). */
  update(blocksHeld: number, endsAtISO: string | null = null): void {
    try {
      getNative()?.updateFocusActivity(blocksHeld, endsAtISO);
    } catch {
      /* no-op */
    }
  },
  /** End the running activity. */
  end(): void {
    try {
      getNative()?.endFocusActivity();
    } catch {
      /* no-op */
    }
  },
};
