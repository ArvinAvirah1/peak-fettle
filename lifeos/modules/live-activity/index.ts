/**
 * Live Activity bridge (TICKET-118, + TICKET-172 snooze/relock polish) — thin
 * RN wrapper over the iOS ActivityKit module that drives the focus-session
 * Dynamic Island / lock-screen countdown (LifeOSFocusAttributes /
 * LifeOSFocusLiveActivity in targets/widget/index.swift).
 *
 * ActivityKit cannot be started from a widget extension — it must run in the app
 * process, hence this module. iOS 16.2+; a safe no-op on older iOS, Android, web,
 * and Expo Go (native module absent). Every call is guarded so focus sessions
 * keep working even when the Live Activity can't show.
 *
 * TICKET-172 additions (all ADDITIVE — every existing call site is unchanged):
 *   • start()/update() take an optional `isSnooze` flag. true renders the
 *     snooze presentation: lock-open icon, accent-tinted countdown, and a
 *     one-tap "Relock now" button (App Intent) on iOS 17+.
 *   • consumePendingRelock() reads + clears the App Group `pending_relock`
 *     marker that RelockFocusIntent writes when the user taps "Relock now".
 *     NOT wired anywhere yet — see its doc comment for the Wave-4 mount point.
 */

import { Platform } from 'react-native';

const APP_GROUP = 'group.com.peakfettle.lifeos';
/** App-Group key the iOS 17 RelockFocusIntent writes (value = ISO timestamp of the tap). */
export const PENDING_RELOCK_KEY = 'pending_relock';

interface LiveActivityNative {
  startFocusActivity(name: string, endsAtISO: string, accentHex: string, isSnooze: boolean | null): void;
  updateFocusActivity(blocksHeld: number, endsAtISO: string | null, isSnooze: boolean | null): void;
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
  /**
   * Start (or restart) the focus Live Activity. accentHex defaults to the
   * Summit amber. Pass isSnooze=true for a snooze/grant-window countdown
   * (TICKET-172) — the island/lock screen then offer one-tap relock on iOS 17+.
   * Takeover is graceful: the native side ends any prior activity cleanly.
   */
  start(name: string, endsAtISO: string, accentHex = '#F2A93B', isSnooze = false): void {
    try {
      getNative()?.startFocusActivity(name, endsAtISO, accentHex, isSnooze);
    } catch {
      /* never break a focus session */
    }
  },
  /**
   * Update the running activity's blocks-held count, and optionally a new end
   * time and/or snooze mode. null (the default) keeps the current value —
   * existing 1/2-argument call sites behave exactly as before.
   */
  update(blocksHeld: number, endsAtISO: string | null = null, isSnooze: boolean | null = null): void {
    try {
      getNative()?.updateFocusActivity(blocksHeld, endsAtISO, isSnooze);
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

// ---------------------------------------------------------------------------
// pending_relock consumption (TICKET-172)
// ---------------------------------------------------------------------------

type StorageInstance = {
  set: (key: string, value: string) => void;
  get: (key: string) => string | null;
};
type ExtensionStorageModule = {
  ExtensionStorage: new (group: string) => StorageInstance;
};

let relockStorage: StorageInstance | null = null;
let storageUnavailable = false;

function getStorage(): StorageInstance | null {
  if (Platform.OS !== 'ios' || storageUnavailable) return null;
  if (relockStorage) return relockStorage;
  try {
    // Lazy require — absent in Expo Go (same guard pattern as widgetBridge.ts).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@bacons/apple-targets') as ExtensionStorageModule;
    relockStorage = new mod.ExtensionStorage(APP_GROUP);
    return relockStorage;
  } catch {
    storageUnavailable = true;
    return null;
  }
}

/**
 * Read + clear the `pending_relock` marker the island's "Relock now" intent
 * writes (RelockFocusIntent, iOS 17+). Returns the ISO timestamp of the tap,
 * or null when there is nothing pending. Never throws.
 *
 * ⚠️ NOT wired anywhere yet — the root layout is Wave-4-owned. Mount point:
 * app/_layout.tsx › PendingUnlockWatcher.check() (the existing on-foreground
 * consumer, next to blocking.consumePendingUnlock()). When non-null, end the
 * snooze window early app-side: re-apply the enabled shields (each enabled
 * lo_focus_configs row has selection_token → blocking.applyShield(id, token))
 * and log a focus event if desired. The Live Activity itself is already ended
 * optimistically by the intent, so no liveActivity.end() call is needed.
 */
export function consumePendingRelock(): string | null {
  try {
    const storage = getStorage();
    if (!storage) return null;
    const raw = storage.get(PENDING_RELOCK_KEY);
    if (!raw) return null;
    // ExtensionStorage has no delete — clear by writing an empty string (the
    // falsy check above treats '' as "nothing pending").
    storage.set(PENDING_RELOCK_KEY, '');
    return raw;
  } catch {
    return null;
  }
}
