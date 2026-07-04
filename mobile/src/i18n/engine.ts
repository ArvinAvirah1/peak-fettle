/**
 * engine.ts — TICKET-146 bridge between the deterministic engine modules and
 * i18n. The engine rule modules (trainingEngine/v2/autoregulation.ts,
 * fatigue.ts) stay PURE and keep returning their canonical English `because`
 * line (their tests assert it), but they ALSO expose `because_key` +
 * `because_params`. UI surfaces render through THIS helper so the because
 * copy goes through translation keys from day one (roadmap criterion), with
 * the module's own English as a guaranteed fallback.
 */

import i18n from 'i18next';

export interface EngineBecause {
  because: string;
  because_key?: string;
  because_params?: Record<string, string | number>;
}

/** Translate an engine "because" line; falls back to the module's English. */
export function engineBecause(s: EngineBecause): string {
  if (s.because_key) {
    const key = `engine:because.${s.because_key}`;
    if (i18n.isInitialized && i18n.exists(key)) {
      return i18n.t(key as never, { ...(s.because_params ?? {}) } as never) as unknown as string;
    }
  }
  return s.because;
}
