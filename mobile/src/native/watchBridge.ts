/**
 * watchBridge -- TICKET-140 Stage A bridge facade for the paired Apple Watch
 * (WatchConnectivity host-side session).
 *
 * Design rules (EXACT pattern of src/native/liveActivity.ts -- the proven
 * facade for an optional native module in this codebase):
 *   - Everything degrades gracefully: when the native module is absent
 *     (Android, iOS simulator without a paired Watch, Expo Go, or a JS-only
 *     test run) every call is a harmless no-op and `isWatchAvailable()` is
 *     false. useWatchMirror.ts MUST keep working with zero native side.
 *   - Zero network: every call here only touches on-device WatchConnectivity
 *     state. No REST, no auth -- safe on the free tier.
 *   - The watch NEVER talks REST and never computes anything -- this facade
 *     only ships an already-built JSON payload (applicationContext) and
 *     relays inbound watch messages (sendMessage) back to JS as events. All
 *     policy (what to push, when) lives in useWatchMirror.ts, not here and
 *     not in Swift.
 *
 * Transport map (per the architecture doc -- Stage A uses only the first):
 *   - applicationContext: phone -> watch, latest-state, survives
 *     offline/killed watch app. Used here via updateWatchContext().
 *   - sendMessage: watch -> phone, reachable request/reply. Stage A only
 *     handles the watch's `{type:'refresh'}` handshake-on-activate message,
 *     relayed here as an onWatchMessage event. Stage B adds outbound
 *     sendMessage for optimistic set-log delivery.
 *   - transferUserInfo: Stage B's offline queued delivery -- not used yet.
 *
 * Native side (a local Expo module, mobile/modules/watch-connectivity, Swift
 * WCSessionDelegate) expected to expose:
 *   isSupported() -> Promise<boolean>          // WCSession.isSupported()
 *   isPaired() -> Promise<boolean>              // session.isPaired
 *   isWatchAppInstalled() -> Promise<boolean>   // session.isWatchAppInstalled
 *   updateApplicationContext(json: string) -> Promise<void>
 *   addMessageListener / removeMessageListeners // Expo Modules event emitter,
 *     event name "onWatchMessage", payload { json: string } -- the module
 *     itself does NOT interpret the message; policy lives in JS.
 */

import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Inbound message from the watch. Stage A only defines 'refresh'; Stage B
 *  will extend this union with the set-log actions. */
export type WatchMessage = { type: 'refresh' } | { type: string; [key: string]: unknown };

type MessageListener = (message: WatchMessage) => void;

interface WatchConnectivityNativeModule {
  isSupported(): Promise<boolean>;
  isPaired(): Promise<boolean>;
  isWatchAppInstalled(): Promise<boolean>;
  updateApplicationContext(payloadJson: string): Promise<void>;
  addMessageListener(listener: (event: { json: string }) => void): { remove: () => void };
}

// ---------------------------------------------------------------------------
// Guarded load -- NEVER throw at import time. iOS-only; absent everywhere
// else (Android, Expo Go, JS test runs, or an iOS build without the module
// compiled in get a full no-op).
// ---------------------------------------------------------------------------

let native: WatchConnectivityNativeModule | null = null;
let loadAttempted = false;

function getNative(): WatchConnectivityNativeModule | null {
  if (Platform.OS !== 'ios') return null;
  if (loadAttempted) return native;
  loadAttempted = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-modules-core') as {
      requireOptionalNativeModule: <T>(name: string) => T | null;
    };
    native =
      mod.requireOptionalNativeModule<WatchConnectivityNativeModule>('WatchConnectivityModule') ?? null;
  } catch {
    native = null;
  }
  return native;
}

/** True only on iOS with the WatchConnectivityModule compiled in (EAS build). Does NOT imply a Watch is paired -- see isWatchPaired(). */
export function isWatchAvailable(): boolean {
  return Platform.OS === 'ios' && getNative() != null;
}

// ---------------------------------------------------------------------------
// Pairing / installation status (best-effort -- never throws)
// ---------------------------------------------------------------------------

/** True if this iPhone supports WatchConnectivity at all (device capability, not pairing state). */
export async function isWatchSupported(): Promise<boolean> {
  const mod = getNative();
  if (!mod) return false;
  try {
    return await mod.isSupported();
  } catch {
    return false;
  }
}

/** True if a Watch is currently paired with this iPhone. */
export async function isWatchPaired(): Promise<boolean> {
  const mod = getNative();
  if (!mod) return false;
  try {
    return await mod.isPaired();
  } catch {
    return false;
  }
}

/** True if the Peak Fettle watch app is installed on the paired Watch. */
export async function isWatchAppInstalled(): Promise<boolean> {
  const mod = getNative();
  if (!mod) return false;
  try {
    return await mod.isWatchAppInstalled();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Outbound -- applicationContext (latest-state mirror payload)
// ---------------------------------------------------------------------------

/**
 * Pushes the given JSON-serializable payload as the current applicationContext.
 * Survives an offline or killed watch app -- the watch reads it back on its
 * next WCSession activation. Never throws.
 */
export async function updateWatchContext(payload: Record<string, unknown>): Promise<void> {
  const mod = getNative();
  if (!mod) return;
  try {
    await mod.updateApplicationContext(JSON.stringify(payload));
  } catch {
    // best-effort -- a failed push just means the watch shows stale data
    // until the next successful applicationContext update.
  }
}

// ---------------------------------------------------------------------------
// Inbound -- watch messages (sendMessage from the watch, e.g. the on-activate
// {type:'refresh'} handshake). Policy (what to do about it) lives entirely in
// the subscriber (useWatchMirror.ts) -- this facade only parses + fans out.
// ---------------------------------------------------------------------------

let subscribed = false;
let listeners: MessageListener[] = [];
let nativeSub: { remove: () => void } | null = null;

function parseMessage(raw: string): WatchMessage | null {
  try {
    const obj = JSON.parse(raw) as { type?: string };
    if (!obj || typeof obj.type !== 'string') return null;
    return obj as WatchMessage;
  } catch {
    return null;
  }
}

function fanOut(message: WatchMessage): void {
  for (const l of listeners) {
    try {
      l(message);
    } catch {
      // a listener throwing must never break the others
    }
  }
}

/**
 * Subscribes to inbound watch messages. Safe to call repeatedly (idempotent)
 * -- the native event subscription happens once per app lifetime. Returns an
 * unsubscribe for this specific listener.
 */
export function subscribeToWatchMessages(listener: MessageListener): () => void {
  listeners.push(listener);

  if (!subscribed) {
    subscribed = true;
    const mod = getNative();
    if (mod) {
      nativeSub = mod.addMessageListener((event) => {
        const message = parseMessage(event.json);
        if (message) fanOut(message);
      });
    }
  }

  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}
