#!/usr/bin/env node
/**
 * gen-qualifier-map.js — generate mobile/src/constants/exerciseQualifierMap.ts
 * from the reviewed research at docs/archive/qualifiers/corrected.json.
 *
 *   node scripts/gen-qualifier-map.js
 *
 * The generated file is COMMITTED (the app must not read JSON from docs/ at
 * runtime, and a TS constant ships over the air). Re-run this after editing
 * corrected.json, then run the verification gate.
 *
 * This script also VALIDATES as it goes and refuses to emit a file that would
 * break the picker UI:
 *   • every axis id and value id must be in the closed vocabulary
 *   • every default_value must be one of that exercise's own applicable values
 *     (a default outside its own list renders a chip the user cannot select)
 *   • no duplicate normalized exercise names
 *
 * Spec: docs/archive/SPEC_2026-08-05_EXERCISE_QUALIFIERS.md
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const SRC = path.join(REPO, 'docs', 'archive', 'qualifiers', 'corrected.json');
const OUT = path.join(REPO, 'mobile', 'src', 'constants', 'exerciseQualifierMap.ts');

// Mirror of constants/qualifiers.ts. Duplicated on purpose: this is a build-time
// validator and must fail loudly if the two ever drift, rather than importing TS.
const VOCAB = {
  grip_width: ['close', 'shoulder', 'medium', 'wide', 'extra_wide'],
  grip_orientation: ['pronated', 'supinated', 'neutral', 'mixed', 'thumbless', 'hook'],
  attachment: ['straight_bar', 'ez_bar', 'rope', 'single_d', 'dual_d', 'v_bar', 'lat_bar_wide',
    'mag_grip', 'ankle_strap', 'head_harness', 'tricep_v_strap', 'stirrup', 'band', 'sled_strap'],
  pulley_height: ['floor', 'knee', 'hip', 'mid_chest', 'shoulder', 'high', 'overhead'],
  pulley_ratio: ['1_1', '2_1', '4_1', '1_2', 'unknown'],
  stance: ['narrow', 'shoulder', 'wide', 'sumo', 'staggered', 'split', 'feet_together',
    'high_platform', 'low_platform'],
  bench_angle: ['decline', 'flat', 'incline_15', 'incline_30', 'incline_45', 'incline_60', 'upright_90'],
  bar_type: ['straight_barbell', 'ez_bar', 'trap_bar', 'safety_squat_bar', 'swiss_bar', 'smith',
    'dumbbell', 'kettlebell', 'machine', 'landmine'],
  body_position: ['standing', 'seated', 'lying_supine', 'lying_prone', 'kneeling', 'half_kneeling',
    'bent_over', 'chest_supported', 'incline_supported'],
  load_mode: ['straight_weight', 'banded', 'chains', 'assisted', 'weighted', 'weighted_vest', 'bodyweight'],
  rom: ['full', 'partial_top', 'partial_bottom', 'lengthened_partial', 'paused', 'deficit', 'block'],
  laterality: ['bilateral', 'unilateral', 'alternating', 'contralateral', 'ipsilateral'],
  bar_position: ['high_bar', 'low_bar'],
};

/** Must match normalizeExerciseName() in the generated file. */
function normalizeName(s) {
  return String(s).trim().toLowerCase().replace(/[_\-–—]+/g, ' ').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
}

const records = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const errors = [];
const warnings = [];
const seen = new Map();
const entries = [];

const merges = [];

for (const rec of records) {
  const key = normalizeName(rec.name);
  // The library genuinely contains near-duplicate rows that normalize to the
  // same key — e.g. "Trap Bar Deadlift" and "Trap-Bar Deadlift". They are the
  // same exercise, so MERGE their specs (union the axes, first default wins)
  // rather than failing the build or silently dropping one. The underlying
  // library duplication is real and is parked with the collapse work; this keeps
  // the generated map correct in the meantime. Reported loudly, never silent.
  if (seen.has(key)) {
    merges.push(`"${seen.get(key)}" + "${rec.name}" -> ${key}`);
    const existing = entries.find((e) => e.key === key);
    if (existing) {
      for (const a of rec.axes || []) {
        if (!VOCAB[a.axis_id]) continue;
        if (existing.axes.some((x) => x.a === a.axis_id)) continue;
        const values = (a.applicable_values || []).filter((v) => VOCAB[a.axis_id].includes(v));
        if (values.length === 0) continue;
        let def = a.default_value;
        if (def == null || !values.includes(def)) def = values[0];
        existing.axes.push({ a: a.axis_id, v: values, d: def, c: a.allows_custom === true });
      }
    }
    continue;
  }
  seen.set(key, rec.name);

  const axes = [];
  for (const a of rec.axes || []) {
    const axisId = a.axis_id;
    if (!VOCAB[axisId]) {
      errors.push(`${rec.name}: unknown axis "${axisId}"`);
      continue;
    }
    const values = (a.applicable_values || []).filter((v) => {
      if (!VOCAB[axisId].includes(v)) {
        errors.push(`${rec.name}.${axisId}: value "${v}" not in vocabulary`);
        return false;
      }
      return true;
    });
    if (values.length === 0) continue;

    let def = a.default_value;
    if (def != null && !values.includes(def)) {
      // A default outside its own applicable list would render a chip the user
      // can never select. Fall back to the first value and say so loudly.
      warnings.push(`${rec.name}.${axisId}: default "${def}" not in applicable values -> "${values[0]}"`);
      def = values[0];
    }
    if (def == null) def = values[0];

    axes.push({ a: axisId, v: values, d: def, c: a.allows_custom === true });
  }

  const coeffs = [];
  for (const c of rec.strength_coefficients || []) {
    if (!c || !c.axis_id || !c.value_id) continue;
    const treat = c.percentile_treatment;
    // Anything not explicitly normalize/passthrough is exclude. Rule 1 of SPEC
    // §3: absence of evidence must never silently feed a variant in at face value.
    const t = treat === 'normalize' ? 'n' : treat === 'passthrough' ? 'p' : 'x';
    const entry = { a: c.axis_id, v: c.value_id, t };
    if (t === 'n' && typeof c.ratio === 'number' && c.ratio > 0) entry.r = c.ratio;
    // A "normalize" with no usable ratio is meaningless — demote to exclude.
    if (t === 'n' && entry.r == null) {
      entry.t = 'x';
      warnings.push(`${rec.name}.${c.axis_id}:${c.value_id}: normalize without a ratio -> exclude`);
    }
    coeffs.push(entry);
  }

  if (axes.length === 0 && coeffs.length === 0) continue; // genuinely nothing to record
  entries.push({ key, name: rec.name, axes, coeffs });
}

if (errors.length) {
  console.error('REFUSING TO GENERATE — ' + errors.length + ' error(s):');
  for (const e of errors.slice(0, 40)) console.error('  ' + e);
  process.exit(1);
}
for (const m of merges) console.warn('merged duplicate library rows: ' + m);
for (const w of warnings) console.warn('warn: ' + w);

entries.sort((x, y) => x.key.localeCompare(y.key));

const lines = [];
lines.push(`/**
 * exerciseQualifierMap.ts — GENERATED FILE, DO NOT EDIT BY HAND.
 *
 *   Regenerate:  node scripts/gen-qualifier-map.js
 *   Source:      docs/archive/qualifiers/corrected.json
 *
 * Which qualifier axes apply to which exercise, with each axis's applicable
 * values and this exercise's default. Produced by researching all 241 library
 * exercises and corrected after three adversarial reviews (a fabricated
 * coefficient and a misattributed study were removed — see the spec).
 *
 * Keyed by NORMALIZED EXERCISE NAME, not id: local sets store server-assigned
 * UUIDs that differ per environment, and the research is name-based. This is the
 * same convention muscleGroupsForExercise / classifyCompetitionLift already use.
 *
 * DEFAULTS ARE SEMI-FROZEN. The default is what canonicalQualifierKey OMITS, so
 * changing one re-buckets that exercise's historical sets. Treat a default
 * change as a data migration, never a cosmetic tweak.
 *
 * Spec: docs/archive/SPEC_2026-08-05_EXERCISE_QUALIFIERS.md
 */

import type { QualifierAxisId } from './qualifiers';

/** Percentile treatment: 'n' normalize, 'p' passthrough, 'x' exclude. */
export type CoeffTreatment = 'n' | 'p' | 'x';

export interface ExerciseAxisSpec {
  /** Axis id. */
  a: QualifierAxisId;
  /** Applicable value ids, in display order. */
  v: string[];
  /** This exercise's default value (always a member of \`v\`). */
  d: string;
  /** May the user add their own options here? */
  c: boolean;
}

export interface ExerciseCoeffSpec {
  a: string;
  v: string;
  t: CoeffTreatment;
  /** Ratio (variant 1RM / reference 1RM). Present only when t === 'n'. */
  r?: number;
}

export interface ExerciseQualifierSpec {
  /** Canonical display name as it appears in the library. */
  name: string;
  axes: ExerciseAxisSpec[];
  coeffs: ExerciseCoeffSpec[];
}

/**
 * Normalize an exercise name for lookup. MUST stay in sync with the
 * normalizeName() in scripts/gen-qualifier-map.js.
 */
export function normalizeExerciseName(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[_\\-–—]+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\\s+/g, ' ');
}

export const EXERCISE_QUALIFIERS: Record<string, ExerciseQualifierSpec> = {`);

for (const e of entries) {
  const axes = e.axes
    .map((a) => `{a:'${a.a}',v:[${a.v.map((v) => `'${v}'`).join(',')}],d:'${a.d}',c:${a.c}}`)
    .join(',');
  const coeffs = e.coeffs
    .map((c) => `{a:'${c.a}',v:'${c.v}',t:'${c.t}'${c.r != null ? `,r:${c.r}` : ''}}`)
    .join(',');
  lines.push(
    `  ${JSON.stringify(e.key)}: {name:${JSON.stringify(e.name)},axes:[${axes}],coeffs:[${coeffs}]},`,
  );
}

lines.push(`};

/** Spec for an exercise by display name, or null when it has no qualifiers. */
export function qualifierSpecForExercise(
  name: string | null | undefined,
): ExerciseQualifierSpec | null {
  const key = normalizeExerciseName(name);
  if (!key) return null;
  return EXERCISE_QUALIFIERS[key] ?? null;
}

/** This exercise's default value per axis — the input to canonicalQualifierKey. */
export function defaultsForExercise(name: string | null | undefined): Record<string, string> {
  const spec = qualifierSpecForExercise(name);
  if (!spec) return {};
  const out: Record<string, string> = {};
  for (const a of spec.axes) out[a.a] = a.d;
  return out;
}
`);

fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
const axisCount = entries.reduce((n, e) => n + e.axes.length, 0);
const coeffCount = entries.reduce((n, e) => n + e.coeffs.length, 0);
console.log(
  `generated ${path.relative(REPO, OUT)}: ${entries.length} exercises, ${axisCount} axes, ${coeffCount} coefficients` +
    (warnings.length ? `, ${warnings.length} warning(s)` : ''),
);
