/**
 * fatigueAdviceMapping — TICKET-142: maps an accepted FatigueAdvice proposal
 * onto plan-adjust.tsx's EXISTING mechanisms.
 * =============================================================================
 * PURE, dependency-free (only fatigue.ts's type). No DB, no clock, no engine
 * concepts invented — this module's entire job is to answer "does an existing
 * MetaChangePatch field already do roughly what this proposal asks for?" and,
 * if so, pre-select it; if not, pass the advice text through as a plain
 * banner instead (the suggest-only rule: the user always confirms inside
 * plan-adjust.tsx, nothing is ever auto-applied here).
 *
 * MAPPING DECISIONS (documented per the ticket's requirement to record the
 * chosen mechanism):
 *
 *   FT-D1 pull_deload_forward → MetaChangePatch.deloadFrequency = 'frequent'.
 *     plan-adjust.tsx's "How often to deload?" picker (DELOAD_OPTIONS) already
 *     has exactly three cadences (infrequent/standard/frequent); 'frequent'
 *     ("every 3–4 weeks") is the closest existing lever to "bring the deload
 *     forward" — there is no separate "deload starts THIS week" mechanism in
 *     the engine, and inventing one would violate "no new progression
 *     concepts". Pre-selecting 'frequent' still requires the user to hit
 *     "Apply changes" themselves (suggest-only).
 *
 *   FT-V1 trim_accessory_volume → NO clean existing mechanism.
 *     MetaChangePatch has no field that reduces working/accessory volume by a
 *     percentage (musclePriorities only biases volume UP toward chosen
 *     muscles; progressionSpeed/failureProximity govern load and effort
 *     proximity, not set/rep volume). Per the ticket's explicit fallback
 *     ("If a proposal has no clean existing mechanism, pre-select nothing and
 *     surface the advice text at the top of plan-adjust instead"), this
 *     proposal pre-selects NOTHING — plan-adjust.tsx shows the advice banner
 *     (the "because" line + trim_pct) so the user can make the closest manual
 *     adjustment themselves (e.g. a lighter "session length" or muscle-
 *     emphasis change), rather than us inventing a volume-trim knob.
 */

import type { MetaChangePatch } from '../planGen/metaChanges';
import type { FatigueAdvice } from '../lib/trainingEngine/v2/fatigue';

/**
 * Router params passed to /plan-adjust when a proposal is accepted. All
 * string-typed (expo-router params are strings) — plan-adjust.tsx parses them
 * defensively (a malformed/missing param is simply ignored, never crashes).
 */
export interface PlanAdjustPrefillParams extends Record<string, string> {
  /** The engine rule id that fired ('FT-D1' | 'FT-V1'), for the banner. */
  fatigueRuleId: string;
  /** The verbatim "because" explanation from fatigue.ts. */
  fatigueBecause: string;
  /** JSON-encoded Partial<MetaChangePatch> to pre-seed the picker state with. */
  fatiguePatch: string;
}

/**
 * The subset of MetaChangePatch this mapping ever pre-selects. Kept narrow and
 * explicit — deliberately not "Partial<MetaChangePatch>" at the call site so a
 * future field addition to MetaChangePatch can't silently start being touched
 * here without a deliberate mapping decision above.
 */
export type FatiguePrefillPatch = Pick<MetaChangePatch, 'deloadFrequency'>;

/** The pre-selected patch for one proposal (empty object when no mechanism maps cleanly). */
export function mapAdviceToPatch(advice: FatigueAdvice): FatiguePrefillPatch {
  if (advice.action === 'pull_deload_forward') {
    return { deloadFrequency: 'frequent' };
  }
  // trim_accessory_volume: no existing mechanism — see file header. Pre-select nothing.
  return {};
}

/** Build the full router-params object for accepting `advice` into /plan-adjust. */
export function buildPlanAdjustPrefillParams(advice: FatigueAdvice): PlanAdjustPrefillParams {
  return {
    fatigueRuleId: advice.rule_id,
    fatigueBecause: advice.because,
    fatiguePatch: JSON.stringify(mapAdviceToPatch(advice)),
  };
}
