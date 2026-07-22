/**
 * Crash reporting (Sentry) — DSN-gated, boot-deferred, PII-stripped.
 *
 * Why this exists (2026-07-21 honest-analysis): the app has shipped with ZERO
 * field telemetry — the iOS 26 TurboModule boot crash burned days because the
 * only signal was founder reproduction. This module fixes that without
 * touching the two constraints that matter here:
 *
 * 1. DSN-GATED: init is a hard no-op unless EXPO_PUBLIC_SENTRY_DSN is set at
 *    build/update time (eas.json env or .env). Until the founder creates a
 *    Sentry project and sets the DSN, nothing initializes and no data leaves
 *    the device. NOTE: the native module still ships in the binary, so ADDING
 *    this dep was a native change (full EAS rebuild, not OTA).
 *
 * 2. BOOT-DEFERRED: Sentry.init touches native TurboModules. This app has a
 *    documented iOS-26 crash class from boot-frame TurboModule calls
 *    (see app/_layout.tsx IOS-26-CRASH-FIX). Call initObservability() from a
 *    post-mount effect (InteractionManager.runAfterInteractions), never at
 *    bundle eval. Tradeoff: a crash in the first frames is not captured —
 *    acceptable vs. re-introducing the boot-frame hazard.
 *
 * PRIVACY: the free-tier brand promise is that personal data never leaves the
 * device. Crash reports carry stack traces + device model only: no user id,
 * no IP-derived PII (sendDefaultPii: false), and beforeSend strips any user
 * object that a future SDK default might attach.
 */

import * as Sentry from '@sentry/react-native';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

let started = false;

export function initObservability(): void {
  if (started || !DSN) return;
  started = true;
  try {
    Sentry.init({
      dsn: DSN,
      sendDefaultPii: false,
      // Errors/crashes only — no performance tracing spend until there are
      // real users whose slow paths are worth sampling.
      tracesSampleRate: 0,
      beforeSend(event) {
        if (event.user) delete event.user;
        return event;
      },
    });
  } catch {
    // Crash reporting must never itself crash the app.
  }
}

/**
 * Report a handled (non-fatal) error. Safe to call whether or not
 * initObservability ran — a no-op without a DSN.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (!started) return;
  try {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    // never throw from the reporter
  }
}
