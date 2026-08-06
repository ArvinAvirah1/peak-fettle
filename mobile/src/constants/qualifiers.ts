/**
 * qualifiers.ts — the closed exercise-qualifier vocabulary.
 * =============================================================================
 * A "qualifier" is one (axis, value) pair describing HOW a set was performed:
 * grip width, cable attachment, pulley height/ratio, stance, and so on.
 *
 * WHY THIS IS A TS CONSTANT AND NOT A DB TABLE — the highest-leverage choice in
 * the whole feature. Revising the taxonomy (adding an attachment, fixing a
 * label, correcting a strength coefficient) is a JS-only change that ships via
 * `eas update`: no migration, no EAS rebuild, no store review. Only USER data
 * (their own custom options, and the qualifiers on their sets) lives in SQLite.
 *
 * THE VOCABULARY IS CLOSED. An open-ended tag system would make the strength
 * math, the settings gate and the picker UI all unbounded. Where users genuinely
 * need more (attachments above all — "flat bar, angled bar, straight bar, rope"
 * cannot be fully enumerated), the escape hatch is `allowsCustom`, NOT a new
 * axis. See data/customQualifiers.ts.
 *
 * AXIS LIFECYCLE — APPEND/DEPRECATE ONLY, NEVER DELETE OR RENAME.
 * Every id here is referenced by rows the user already owns: `sets.qualifiers_json`,
 * `sets.qualifier_key`, and `custom_qualifier_values.axis_id`. Removing or
 * renaming an id orphans that data silently. To retire something, stop offering
 * it (drop it from an exercise's applicable values) — the id itself must live
 * forever, and readers must render an unknown (axis, value) pair as an inert
 * label rather than crashing or dropping it.
 *
 * i18n: labels are KEYS, never display strings. The repo routes every user-facing
 * string through namespaced t(); a catalog of raw English here would make this
 * feature the one untranslatable island in the app.
 *
 * Source of truth for which axes apply to which exercise: exerciseQualifierMap.ts
 * (generated from the reviewed research in docs/archive/qualifiers/corrected.json).
 *
 * Spec: docs/archive/SPEC_2026-08-05_EXERCISE_QUALIFIERS.md
 * =============================================================================
 */

export type QualifierAxisId =
  | 'grip_width'
  | 'grip_orientation'
  | 'attachment'
  | 'pulley_height'
  | 'pulley_ratio'
  | 'stance'
  | 'bench_angle'
  | 'bar_type'
  | 'body_position'
  | 'load_mode'
  | 'rom'
  | 'laterality'
  | 'bar_position';

export interface QualifierAxis {
  id: QualifierAxisId;
  /** i18n key: short axis name shown on the chip when no value is set. */
  labelKey: string;
  /** i18n key: one line explaining what the axis means (the `?` explainer). */
  descKey: string;
  /** Ordered value ids. Order is the display order in the picker. */
  values: string[];
  /** May the user add their own options on this axis? */
  allowsCustom: boolean;
  /** i18n key for the "add your own" field placeholder. Null when !allowsCustom. */
  customHintKey: string | null;
  /** True when this axis changes the LOAD, not just the label (pulley_ratio). */
  affectsLoad?: boolean;
}

/** Display order — also the order chips appear in the logger. */
export const AXIS_ORDER: QualifierAxisId[] = [
  'attachment',
  'pulley_height',
  'pulley_ratio',
  'grip_width',
  'grip_orientation',
  'bench_angle',
  'bar_type',
  'bar_position',
  'stance',
  'body_position',
  'load_mode',
  'laterality',
  'rom',
];

function axis(
  id: QualifierAxisId,
  values: string[],
  allowsCustom: boolean,
  extra?: Partial<QualifierAxis>,
): QualifierAxis {
  return {
    id,
    labelKey: `qualifiers:axis.${id}.label`,
    descKey: `qualifiers:axis.${id}.desc`,
    values,
    allowsCustom,
    customHintKey: allowsCustom ? `qualifiers:axis.${id}.customHint` : null,
    ...extra,
  };
}

export const QUALIFIER_AXES: Record<QualifierAxisId, QualifierAxis> = {
  grip_width: axis('grip_width', ['close', 'shoulder', 'medium', 'wide', 'extra_wide'], false),

  grip_orientation: axis(
    'grip_orientation',
    ['pronated', 'supinated', 'neutral', 'mixed', 'thumbless', 'hook'],
    false,
  ),

  // The founder's motivating case: tricep-pushdown bars genuinely cannot be
  // enumerated. These 14 cover the overwhelming majority; the rest is custom.
  attachment: axis(
    'attachment',
    [
      'straight_bar',
      'ez_bar',
      'rope',
      'single_d',
      'dual_d',
      'v_bar',
      'lat_bar_wide',
      'mag_grip',
      'ankle_strap',
      'head_harness',
      'tricep_v_strap',
      'stirrup',
      'band',
      'sled_strap',
    ],
    true,
  ),

  pulley_height: axis(
    'pulley_height',
    ['floor', 'knee', 'hip', 'mid_chest', 'shoulder', 'high', 'overhead'],
    false,
  ),

  // The ONE axis that changes a number rather than a label. See PULLEY_FACTORS.
  pulley_ratio: axis('pulley_ratio', ['1_1', '2_1', '4_1', '1_2', 'unknown'], false, {
    affectsLoad: true,
  }),

  stance: axis(
    'stance',
    [
      'narrow',
      'shoulder',
      'wide',
      'sumo',
      'staggered',
      'split',
      'feet_together',
      'high_platform',
      'low_platform',
    ],
    false,
  ),

  bench_angle: axis(
    'bench_angle',
    ['decline', 'flat', 'incline_15', 'incline_30', 'incline_45', 'incline_60', 'upright_90'],
    false,
  ),

  // `landmine` added 2026-08-05 (D10): Landmine Press/Row and Meadows Row had no
  // way to express the implement at all.
  bar_type: axis(
    'bar_type',
    [
      'straight_barbell',
      'ez_bar',
      'trap_bar',
      'safety_squat_bar',
      'swiss_bar',
      'smith',
      'dumbbell',
      'kettlebell',
      'machine',
      'landmine',
    ],
    false,
  ),

  body_position: axis(
    'body_position',
    [
      'standing',
      'seated',
      'lying_supine',
      'lying_prone',
      'kneeling',
      'half_kneeling',
      'bent_over',
      'chest_supported',
      'incline_supported',
    ],
    false,
  ),

  // `weighted` added 2026-08-05 (D10): the vocabulary had `weighted_vest` but
  // nothing for a dip belt or an added plate, so weighted pull-ups/dips were
  // being mislabelled as vest work.
  load_mode: axis(
    'load_mode',
    ['straight_weight', 'banded', 'chains', 'assisted', 'weighted', 'weighted_vest', 'bodyweight'],
    true,
  ),

  rom: axis(
    'rom',
    ['full', 'partial_top', 'partial_bottom', 'lengthened_partial', 'paused', 'deficit', 'block'],
    true,
  ),

  laterality: axis(
    'laterality',
    ['bilateral', 'unilateral', 'alternating', 'contralateral', 'ipsilateral'],
    false,
  ),

  // Added 2026-08-05 (D10). Without it, Low-Bar Squat had NO way to be expressed
  // — research collapsed it into Back Squat carrying an EMPTY qualifier map,
  // silently destroying the distinction on the highest-traffic percentile lift.
  bar_position: axis('bar_position', ['high_bar', 'low_bar'], false),
};

// ---------------------------------------------------------------------------
// Pulley load math
// ---------------------------------------------------------------------------

/**
 * Felt load per kg of selected stack.
 *
 * Read this as "where is the movable pulley?": on the STACK the load is shared
 * between strands and you feel less (2:1, 4:1); on the HANDLE the stack hangs at
 * full tension while you oppose two strands, so you feel DOUBLE (1:2); neither
 * means direct (1:1).
 *
 * 1:2 is a genuine mechanical-DISadvantage arrangement — USPTO weight-machine
 * patent language describes pulley advantage as "positive, negative, or
 * neutral". Retail sources list only the reducing ratios because "feels lighter"
 * is the selling point, which is a sampling bias, not evidence of absence.
 *
 * `unknown` deliberately maps to 1: log exactly what the user typed and make no
 * claim. Such sets are kept out of cross-gym comparisons instead.
 */
export const PULLEY_FACTORS: Record<string, number> = {
  '1_1': 1,
  '2_1': 0.5,
  '4_1': 0.25,
  '1_2': 2,
  unknown: 1,
};

/**
 * Bridge to the pre-existing plate-calculator representation
 * (lib/plateMath.ts PULLEY_OPTIONS + exercise_prefs.pulley_id), which uses
 * colon ids. Two spellings exist because plateMath shipped first; this map is
 * the single place that knows about both. Do NOT introduce a third spelling.
 */
export const PULLEY_AXIS_TO_LEGACY_ID: Record<string, string> = {
  '1_1': '1:1',
  '2_1': '2:1',
  '4_1': '4:1',
  '1_2': '1:2',
};

export function legacyPulleyIdToAxisValue(id: string | null | undefined): string | null {
  if (!id) return null;
  const found = Object.keys(PULLEY_AXIS_TO_LEGACY_ID).find(
    (k) => PULLEY_AXIS_TO_LEGACY_ID[k] === id,
  );
  return found ?? null;
}

// ---------------------------------------------------------------------------
// Lookups (total, never throwing — an unknown id is data, not a crash)
// ---------------------------------------------------------------------------

export function isKnownAxis(id: string): id is QualifierAxisId {
  return Object.prototype.hasOwnProperty.call(QUALIFIER_AXES, id);
}

export function getAxis(id: string): QualifierAxis | null {
  return isKnownAxis(id) ? QUALIFIER_AXES[id] : null;
}

/** True when `value` is a SHIPPED value of `axisId`. Custom values return false. */
export function isKnownValue(axisId: string, value: string): boolean {
  const a = getAxis(axisId);
  return a ? a.values.includes(value) : false;
}

/** i18n key for a value label. Safe for unknown/custom ids (renders inertly). */
export function valueLabelKey(axisId: string, value: string): string {
  return `qualifiers:value.${axisId}.${value}.label`;
}

/** i18n key for a value's one-line explainer (the `?` overlay). */
export function valueDescKey(axisId: string, value: string): string {
  return `qualifiers:value.${axisId}.${value}.desc`;
}
