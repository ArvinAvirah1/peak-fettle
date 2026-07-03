// index.ts — Engine v2 public API (Pro-only, deterministic, on-device, no network).
// =============================================================================
// PUBLIC API
//   generatePlanV2(inputs: EngineInputsV2, options?: { now?: Date }): PlanV2
//   generateTrialSequence(inputs: EngineInputsV2, options?: { now?: Date }): TrialSequenceV2
//   + all public types re-exported (see ./types).
//
// DETERMINISM: no Date.now() / Math.random() anywhere in engine logic. The ONLY
// clock is options.now (defaults to a FIXED epoch, never a live read) → the ISO
// week seed. Identical inputs + identical options.now ⇒ byte-identical output.
//
// =============================================================================
// OUTPUT → APP STORAGE MAPPING (DESIGN_SPEC §E — the port is mechanical)
// -----------------------------------------------------------------------------
// PlanV2 is a SUPERSET of v1's GeneratePlanResult. Each PlanSlotV2 carries the
// v1-identical fields the app's plan storage + logger already consume, so no
// screen change is required:
//
//   v2 PlanSlotV2 field   →  v1 consumer field / meaning
//   ─────────────────────────────────────────────────────────────────
//   exercise_id           →  exercise_id            (unchanged)
//   name                  →  name                   (unchanged)
//   muscles[]             →  muscle_groups          (unchanged)
//   is_compound           →  is_compound            (unchanged)
//   pattern               →  pattern                (unchanged)
//   priority (1/2/3)      →  priority               (unchanged; 1=primary)
//   sets                  →  sets                   (unchanged)
//   reps ("6-8")          →  reps (string range)    (unchanged)
//   rpe (= 10 − rir)      →  rpe_target             (RIR mapped onto v1's rpe cue)
//   rest_seconds          →  rest_seconds           (unchanged)
//   weight_kg (exact kg)  →  weight_kg              (unchanged; exact kg per CLAUDE.md #2)
//   load_note             →  coaching_note          (load prescription text)
//
// v2-ADDITIVE (optional, ignored by v1 consumers; rendered by the richer Pro UI):
//   role, rir_target, pct_1rm, week_intent, peak_note, main_lift_key   (slot-level)
//   mdOffset, warmup, cardio[]                                          (session-level)
//   mesocycle, peaking, sportPlan, volumeReport, splitPreference        (plan-level)
//
// The cardio[] channel carries conditioning/plyometric prescriptions, same shape
// as v1. When the app maps a PlanV2 week onto its schedule/plan tables it reads
// the v1-identical fields; the additive fields hydrate the Pro-only detail views.
// =============================================================================

import { buildTrialBlockWeeks, generatePlanV2Internal } from './engine';
import type {
  EngineInputsV2,
  EngineOptionsV2,
  PlanV2,
  SplitPreference,
  TrialBlockV2,
  TrialSequenceV2,
} from './types';

// Re-export all public types (DESIGN_SPEC deliverable requirement).
export * from './types';
export { CATALOG_V2, getCatalogV2 } from './catalog';
export { LANDMARKS, GOALS, EXPERIENCE, deriveParams, pctForReps, round2_5, clamp } from './params';

// Fixed reference epoch so a missing options.now is still DETERMINISTIC (never a
// live clock read). Chosen as an arbitrary stable Monday; only used for the seed.
const FIXED_EPOCH = new Date('2026-01-05T00:00:00.000Z'); // Monday

// Derive a stable ISO-week-ish seed string from an injected Date. Pure: same Date
// in → same string out. No Date.now(); the input Date is the only time source.
function isoWeekSeed(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // ISO week number (Mon-based).
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function resolveWeekSeed(inputs: EngineInputsV2, options?: EngineOptionsV2): string {
  if (inputs.weekISO) return inputs.weekISO; // explicit override wins (fully deterministic)
  const now = options?.now ?? FIXED_EPOCH;
  return isoWeekSeed(now);
}

/**
 * generatePlanV2 — produce a full parametric mesocycle for the given survey profile.
 * Honours the split preference for general strength goals; powerlifting/athletic/
 * team-sport keep their specialised splits. Deterministic given (inputs, options.now).
 */
export function generatePlanV2(inputs: EngineInputsV2, options?: EngineOptionsV2): PlanV2 {
  const seed = resolveWeekSeed(inputs, options);
  // 'unsure' with no explicit adoption → default to PPL for the single-plan path so a
  // concrete plan still generates; the trial sequence is the intended 'unsure' UX.
  const forced =
    inputs.splitPreference === 'ppl' || inputs.splitPreference === 'upper_lower' || inputs.splitPreference === 'body_part'
      ? inputs.splitPreference
      : undefined;
  return generatePlanV2Internal(inputs, seed, forced);
}

// Fixed comparison order (addendum §2): PPL → Upper/Lower → Body-part.
const TRIAL_ORDER: Array<Exclude<SplitPreference, 'unsure'>> = ['ppl', 'upper_lower', 'body_part'];
const TRIAL_LABEL: Record<Exclude<SplitPreference, 'unsure'>, string> = {
  ppl: 'Push / Pull / Legs',
  upper_lower: 'Upper / Lower',
  body_part: 'Body-part split',
};

/**
 * generateTrialSequence — the "I don't know" split flow (addendum §2). Produces three
 * sequential 3-week trial blocks (PPL → Upper/Lower → Body-part), each scaled to the
 * user's days/week + session length, so the user can pick the split that suits them.
 * Deterministic given (inputs, options.now).
 */
export function generateTrialSequence(inputs: EngineInputsV2, options?: EngineOptionsV2): TrialSequenceV2 {
  const baseSeed = resolveWeekSeed(inputs, options);
  const blocks: TrialBlockV2[] = TRIAL_ORDER.map((split, i) => {
    // Distinct per-block seed so the three blocks vary their exercise selection.
    const blockSeed = `${baseSeed}#trial${i}:${split}`;
    const { weeks, reasoning, rule_trace, volumeReport } = buildTrialBlockWeeks(inputs, split, blockSeed);
    const block: TrialBlockV2 = {
      blockIndex: i,
      splitPreference: split,
      splitLabel: TRIAL_LABEL[split],
      weeks,
      reasoning: `Trial block ${i + 1} of 3 — ${TRIAL_LABEL[split]}. ${reasoning}`,
      rule_trace,
      volumeReport,
    };
    return block;
  });

  return {
    engine: 'pf-engine-v2-trial',
    blockOrder: TRIAL_ORDER,
    blocks,
    reasoning:
      'You chose "I\'m not sure" — so we\'ll trial three splits back-to-back, three weeks each ' +
      '(Push/Pull/Legs, then Upper/Lower, then a body-part split), all built from your survey. ' +
      'At the end of any block you can make that split your main plan; otherwise compare all three and pick.',
  };
}
