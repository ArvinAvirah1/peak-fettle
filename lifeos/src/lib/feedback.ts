/**
 * feedback.ts — non-blocking toast dispatch + safeWrite guard.
 *
 * Plain TS module (no React) so it can be imported from data-layer code that
 * has no component tree of its own. `ToastProvider` (src/components/Toast.tsx)
 * is the sole consumer of `registerToastHandler` — it mounts once near the
 * root and forwards toasts into UI. Everything else should call `showToast`
 * or, for DB writes, wrap the call in `safeWrite` so failures never throw
 * silently (motivation: TICKET-148 — the repo had only 7 catch blocks and DB
 * writes were failing silently). This is a frozen contract for Wave 2 teams
 * to wrap every DB write in `safeWrite`.
 */

export type ToastKind = 'info' | 'success' | 'error';

export interface ToastOptions {
  message: string;
  kind?: ToastKind;
  durationMs?: number;
}

type ToastHandler = (opts: ToastOptions) => void;

let handler: ToastHandler | null = null;
// A single-slot pending buffer: if showToast fires before ToastProvider has
// registered (early startup), keep only the most recent toast and flush it
// once a handler shows up. Never grows unbounded.
let pending: ToastOptions | null = null;

/**
 * Show a toast. Forwards to the registered ToastProvider handler. If no
 * handler is registered yet (e.g. very early during app startup), the toast
 * is buffered (most-recent-wins, capacity 1) and flushed on the next
 * registerToastHandler call. Never throws.
 */
export function showToast(opts: ToastOptions): void {
  try {
    if (handler) {
      handler(opts);
    } else {
      pending = opts;
    }
  } catch {
    // showToast must never throw back into caller code.
  }
}

/**
 * Internal — ToastProvider registers itself here. Not for app code.
 * Passing null unregisters (e.g. on unmount).
 */
export function registerToastHandler(fn: ((opts: ToastOptions) => void) | null): void {
  handler = fn;
  if (fn && pending) {
    const flushed = pending;
    pending = null;
    try {
      fn(flushed);
    } catch {
      // Ignore — a broken handler shouldn't break registration.
    }
  }
}

/**
 * Await fn(). On success, returns its value untouched — zero behavior change
 * when writes succeed. On throw: logs via console.warn (tagged
 * `[lifeos.safeWrite]` + context + the error), shows a non-blocking error
 * toast, and resolves to `undefined` instead of rethrowing.
 */
export async function safeWrite<T>(
  fn: () => Promise<T>,
  opts?: { errorMessage?: string; context?: string },
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    const context = opts?.context ? ` (${opts.context})` : '';
    console.warn(`[lifeos.safeWrite]${context}`, err);
    showToast({
      kind: 'error',
      message: opts?.errorMessage ?? "That didn't save. Please try again.",
    });
    return undefined;
  }
}
