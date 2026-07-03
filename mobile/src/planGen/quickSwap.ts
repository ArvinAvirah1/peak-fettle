/**
 * quickSwap.ts — pure, deterministic "machine busy? quick-swap" candidate engine.
 * =============================================================================
 * REQUIREMENTS_ADDENDUM_2026-07-02 §4 (quick-swap) + §5 (region taxonomy), Stage 3.
 *
 * Given the exercise a Pro user is mid-set on, produce a RANKED list of
 * alternatives that hit the SAME specific region (see MuscleRegion) so the swap
 * is not counterproductive — an incline press subs an incline press, never a
 * generic "chest" downgrade when a regional option exists. Filtered by the user's
 * equipment profile and injury constraints; the source exercise + anything already
 * in today's session is excluded.
 *
 * PURITY / LOCAL-FIRST / DETERMINISM (CLAUDE.md invariants):
 *   • Reads only the on-device CATALOG_V2 — NO network, NO REST, NO db. This is
 *     the local-first sibling of the server `/alternatives` endpoint; the Pro
 *     quick-swap runs fully on-device (generation + swap are local per addendum §6).
 *   • No Date.now() / Math.random(): ranking is a stable sort keyed on the catalog's
 *     fixed order, so identical inputs → identical output (tested).
 *   • Injury exclusion reuses the SAME contraindication tokens the engine uses
 *     (CatalogExerciseV2.contraindications ∩ user injuries), so a lift the engine
 *     would never prescribe is never offered as a swap either.
 * =============================================================================
 */

import { CATALOG_V2 } from '../lib/trainingEngine/v2/catalog';
import { REGION_ADJACENCY } from '../lib/trainingEngine/v2/types';
import type {
  CatalogExerciseV2,
  MovementPattern,
  MuscleRegion,
} from '../lib/trainingEngine/v2/types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * The exercise the user wants to swap AWAY from. Mid-workout an exercise may only
 * carry a name (template/off-routine sessions store an empty id), so resolution
 * is: exact catalog id → normalized catalog name → a name heuristic that recovers
 * a region + pattern (e.g. "Incline Barbell Press" → upper_chest / incline press),
 * → an explicit region/pattern the caller passes. When nothing resolves, callers
 * get an empty list with a `reason` (see SwapResult).
 */
export interface ExerciseRef {
  id?: string | null;
  name?: string | null;
  /** Optional explicit hints (win over name inference when supplied). */
  region?: MuscleRegion | null;
  movementPattern?: MovementPattern | null;
}

/** Everything that FILTERS the candidate pool. All fields optional. */
export interface QuickSwapContext {
  /**
   * The user's equipment profile (closed-vocab tokens, e.g. 'dumbbell','machine').
   * When absent OR empty, NO equipment filter is applied (a candidate needing any
   * equipment still qualifies) — a missing profile must never hide every option.
   */
  equipment?: string[] | null;
  /** Injury region tokens (e.g. 'knees','shoulders'). Contraindicated lifts are dropped. */
  injuries?: string[] | null;
  /** Exercise ids to exclude (e.g. everything already in today's session). */
  excludeIds?: string[] | null;
  /** Exercise names to exclude (name-keyed sessions have no ids). */
  excludeNames?: string[] | null;
  /** Cap on how many candidates to return (default 8). */
  limit?: number;
}

/** One ranked alternative. `why` is a short human label for the sheet. */
export interface SwapCandidate {
  id: string;
  name: string;
  region: MuscleRegion | null;
  movementPattern: MovementPattern;
  equipment: string[];
  isCompound: boolean;
  /** 0 best … higher = looser match (region/pattern tier; see rankTier). */
  tier: number;
  /** e.g. "Upper chest · incline press · dumbbell". */
  why: string;
}

export interface SwapResult {
  candidates: SwapCandidate[];
  /** Resolved source region/pattern (null when unresolvable). */
  resolvedRegion: MuscleRegion | null;
  resolvedPattern: MovementPattern | null;
  /** Populated when candidates is empty, explaining why (for UI copy / tests). */
  reason?: string;
}

// ---------------------------------------------------------------------------
// Name normalization + heuristic resolution (for name-only refs)
// ---------------------------------------------------------------------------

/** Lowercase, strip punctuation/extra spaces so "Incline  DB-Press!" matches. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Precomputed name → catalog entry (normalized) for O(1) name resolution.
const BY_NORM_NAME: Map<string, CatalogExerciseV2> = (() => {
  const m = new Map<string, CatalogExerciseV2>();
  for (const ex of CATALOG_V2) m.set(normalizeName(ex.name), ex);
  return m;
})();

const BY_ID: Map<string, CatalogExerciseV2> = (() => {
  const m = new Map<string, CatalogExerciseV2>();
  for (const ex of CATALOG_V2) m.set(ex.id, ex);
  return m;
})();

/**
 * Recover a region + movement pattern from a free-text exercise NAME the catalog
 * doesn't contain (e.g. an incline press when the catalog only has flat presses).
 * Deterministic keyword matching, most-specific first. Returns nulls when nothing
 * is recognised. This lets the quick-swap still offer sensible regional options
 * (via the adjacency tier) for an exercise it has never seen.
 */
export function inferFromName(
  name: string,
): { region: MuscleRegion | null; pattern: MovementPattern | null } {
  const n = ' ' + normalizeName(name) + ' ';
  const has = (kw: string): boolean => n.indexOf(' ' + kw + ' ') >= 0 || n.indexOf(kw) >= 0;

  let region: MuscleRegion | null = null;
  let pattern: MovementPattern | null = null;

  // ── chest press sub-region ──
  if (has('incline')) {
    if (has('press') || has('bench') || has('push')) { region = 'upper_chest'; pattern = 'horizontal_push'; }
    else if (has('curl')) { region = 'biceps'; pattern = 'isolation_arms'; }
    else if (has('fly')) { region = 'upper_chest'; pattern = 'isolation_chest'; }
  } else if (has('decline') && (has('press') || has('bench') || has('dip'))) {
    region = 'lower_chest'; pattern = 'horizontal_push';
  } else if (has('dip')) {
    region = 'lower_chest'; pattern = 'horizontal_push';
  }

  if (region) return { region, pattern };

  // ── other presses ──
  if ((has('bench') || has('chest press') || has('push up') || has('pushup')) && !has('row')) {
    region = 'mid_chest'; pattern = 'horizontal_push'; return { region, pattern };
  }
  if (has('overhead') || has('shoulder press') || has('ohp') || has('military')) {
    region = 'front_delt'; pattern = 'vertical_push'; return { region, pattern };
  }
  // ── pulls ──
  if (has('pulldown') || has('pull up') || has('pullup') || has('chin')) {
    region = 'lats'; pattern = 'vertical_pull'; return { region, pattern };
  }
  if (has('row')) { region = 'mid_back'; pattern = 'horizontal_pull'; return { region, pattern }; }
  // ── legs ──
  if (has('squat')) { region = 'quads'; pattern = 'squat'; return { region, pattern }; }
  if (has('deadlift') || has('rdl') || has('hinge')) { region = 'hamstrings'; pattern = 'hinge'; return { region, pattern }; }
  if (has('lunge') || has('split squat') || has('step up')) { region = 'quads'; pattern = 'lunge'; return { region, pattern }; }
  if (has('leg curl') || has('hamstring curl')) { region = 'hamstrings'; pattern = 'isolation_legs'; return { region, pattern }; }
  if (has('leg extension')) { region = 'quads'; pattern = 'isolation_legs'; return { region, pattern }; }
  if (has('calf') || has('calves')) { region = 'calves'; pattern = 'isolation_calves'; return { region, pattern }; }
  if (has('hip thrust') || has('glute')) { region = 'glutes'; pattern = 'hinge'; return { region, pattern }; }
  // ── arms / delts ──
  if (has('lateral raise') || has('side raise')) { region = 'side_delt'; pattern = 'isolation_shoulders'; return { region, pattern }; }
  if (has('rear delt') || has('face pull') || has('reverse fly')) { region = 'rear_delt'; pattern = 'isolation_shoulders'; return { region, pattern }; }
  if (has('curl')) { region = 'biceps'; pattern = 'isolation_arms'; return { region, pattern }; }
  if (has('tricep') || has('pushdown') || has('extension')) { region = 'triceps'; pattern = 'isolation_arms'; return { region, pattern }; }

  return { region: null, pattern: null };
}

/**
 * resolveRef — turn an ExerciseRef into a catalog entry (when known) plus an
 * effective region + pattern to rank against. Explicit ref hints win; then the
 * catalog id; then the catalog name; then the name heuristic.
 */
export function resolveRef(ref: ExerciseRef): {
  source: CatalogExerciseV2 | null;
  region: MuscleRegion | null;
  pattern: MovementPattern | null;
} {
  let source: CatalogExerciseV2 | null = null;
  if (ref.id) source = BY_ID.get(ref.id) ?? null;
  if (!source && ref.name) source = BY_NORM_NAME.get(normalizeName(ref.name)) ?? null;

  let region: MuscleRegion | null = ref.region ?? null;
  let pattern: MovementPattern | null = ref.movementPattern ?? null;

  if (source) {
    if (!region) region = source.region ?? null;
    if (!pattern) pattern = source.movement_pattern;
  } else if (ref.name && (!region || !pattern)) {
    const inf = inferFromName(ref.name);
    if (!region) region = inf.region;
    if (!pattern) pattern = inf.pattern;
  }
  return { source, region, pattern };
}

// ---------------------------------------------------------------------------
// Region / label helpers
// ---------------------------------------------------------------------------

const REGION_LABEL: Record<MuscleRegion, string> = {
  upper_chest: 'Upper chest', mid_chest: 'Mid chest', lower_chest: 'Lower chest',
  lats: 'Lats', mid_back: 'Mid back', upper_traps: 'Upper traps',
  front_delt: 'Front delt', side_delt: 'Side delt', rear_delt: 'Rear delt',
  biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms',
  quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes', calves: 'Calves',
  adductors: 'Adductors', abs: 'Abs', obliques: 'Obliques',
  lower_back: 'Lower back', full_body: 'Full body',
};

const PATTERN_LABEL: Record<string, string> = {
  squat: 'squat', hinge: 'hinge', lunge: 'lunge',
  horizontal_push: 'horizontal press', vertical_push: 'overhead press',
  horizontal_pull: 'row', vertical_pull: 'pulldown',
  olympic: 'power', plyometric: 'plyometric', carry: 'carry', core: 'core',
  isolation_arms: 'arm isolation', isolation_shoulders: 'delt isolation',
  isolation_chest: 'chest isolation', isolation_back: 'back isolation',
  isolation_legs: 'leg isolation', isolation_calves: 'calf isolation',
};

function regionLabel(r: MuscleRegion | null | undefined): string {
  return r ? REGION_LABEL[r] : 'General';
}
function patternLabel(p: MovementPattern): string {
  return PATTERN_LABEL[p] ?? String(p).replace(/_/g, ' ');
}
/** Pick a single representative equipment token for the 'why' label. */
function primaryEquipment(equipment: string[]): string {
  const PREF = ['dumbbell', 'barbell', 'machine', 'cable', 'kettlebell', 'band', 'bands', 'bodyweight'];
  for (const p of PREF) if (equipment.includes(p)) return p === 'bands' ? 'band' : p;
  return equipment[0] ?? 'bodyweight';
}

function whyLabel(ex: CatalogExerciseV2): string {
  return `${regionLabel(ex.region ?? null)} · ${patternLabel(ex.movement_pattern)} · ${primaryEquipment(ex.equipment)}`;
}

function adjacentRegions(r: MuscleRegion): MuscleRegion[] {
  return REGION_ADJACENCY[r] ?? [];
}

// ---------------------------------------------------------------------------
// Core: alternativesFor
// ---------------------------------------------------------------------------

/**
 * alternativesFor — the main entry. Returns just the ranked candidate array (the
 * common case). Use `alternativesForDetailed` when you need the resolution reason.
 */
export function alternativesFor(ref: ExerciseRef, ctx: QuickSwapContext = {}): SwapCandidate[] {
  return alternativesForDetailed(ref, ctx).candidates;
}

/**
 * alternativesForDetailed — full result incl. resolved region/pattern + a reason
 * when empty. Ranking (deterministic, documented):
 *   tier 0  same region + same movement pattern
 *   tier 1  same region, different pattern
 *   tier 2  adjacent region, same pattern
 *   tier 3  adjacent region, different pattern
 *   (no region resolved) → pattern-only fallback: tier 0 same pattern, else tier 3
 * Tie-break WITHIN a tier: compound before isolation, then stable catalog order.
 */
export function alternativesForDetailed(ref: ExerciseRef, ctx: QuickSwapContext = {}): SwapResult {
  const { source, region, pattern } = resolveRef(ref);
  const limit = ctx.limit != null && ctx.limit > 0 ? ctx.limit : 8;

  const equip = (ctx.equipment || []).filter(Boolean);
  const equipSet = new Set(equip);
  const useEquipFilter = equipSet.size > 0;
  const injuries = new Set((ctx.injuries || []).map((x) => String(x).toLowerCase()));
  const excludeIds = new Set((ctx.excludeIds || []).map(String));
  const excludeNames = new Set((ctx.excludeNames || []).map((x) => normalizeName(String(x))));

  const equipOk = (ex: CatalogExerciseV2): boolean =>
    !useEquipFilter || ex.equipment.some((e) => equipSet.has(e));
  const contra = (ex: CatalogExerciseV2): boolean =>
    ex.contraindications.some((c) => injuries.has(String(c).toLowerCase()));
  const isExcluded = (ex: CatalogExerciseV2): boolean =>
    (source ? ex.id === source.id : false) ||
    excludeIds.has(ex.id) ||
    excludeNames.has(normalizeName(ex.name)) ||
    // also exclude the source by name even when it didn't resolve to the catalog
    (!source && !!ref.name && normalizeName(ex.name) === normalizeName(ref.name));

  // Nothing to rank against at all.
  if (!region && !pattern) {
    return {
      candidates: [],
      resolvedRegion: null,
      resolvedPattern: null,
      reason: 'unresolved-exercise',
    };
  }

  const adj = region ? new Set(adjacentRegions(region)) : new Set<MuscleRegion>();

  // Tier assignment. Lower = better. Returns null → not a candidate.
  const tierOf = (ex: CatalogExerciseV2): number | null => {
    const exRegion = ex.region ?? null;
    const samePattern = pattern != null && ex.movement_pattern === pattern;
    if (region && exRegion === region) return samePattern ? 0 : 1;
    if (region && exRegion && adj.has(exRegion)) return samePattern ? 2 : 3;
    // Region unknown on the source → pattern-only matching.
    if (!region && samePattern) return 0;
    return null;
  };

  interface Scored { ex: CatalogExerciseV2; tier: number; order: number }
  const scored: Scored[] = [];
  CATALOG_V2.forEach((ex, order) => {
    if (isExcluded(ex)) return;
    if (!equipOk(ex)) return;
    if (contra(ex)) return;
    const tier = tierOf(ex);
    if (tier == null) return;
    scored.push({ ex, tier, order });
  });

  // Deterministic sort: tier asc, then compound-before-isolation, then catalog order.
  scored.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const ac = a.ex.is_compound ? 0 : 1;
    const bc = b.ex.is_compound ? 0 : 1;
    if (ac !== bc) return ac - bc;
    return a.order - b.order;
  });

  const candidates: SwapCandidate[] = scored.slice(0, limit).map((s) => ({
    id: s.ex.id,
    name: s.ex.name,
    region: s.ex.region ?? null,
    movementPattern: s.ex.movement_pattern,
    equipment: s.ex.equipment,
    isCompound: s.ex.is_compound,
    tier: s.tier,
    why: whyLabel(s.ex),
  }));

  const result: SwapResult = {
    candidates,
    resolvedRegion: region,
    resolvedPattern: pattern,
  };
  if (candidates.length === 0) {
    result.reason = useEquipFilter || injuries.size
      ? 'no-match-after-filters'
      : 'no-match';
  }
  return result;
}
