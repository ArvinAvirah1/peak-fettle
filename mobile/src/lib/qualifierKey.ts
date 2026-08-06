/**
 * qualifierKey — canonical serialization of a set's qualifiers.
 * =============================================================================
 * THE SINGLE SOURCE OF TRUTH for `sets.qualifier_key`. The writer, every reader,
 * the PR queries and the history grouping must all call THIS function. One
 * inconsistent writer (different separator, different sort, defaults included)
 * silently splits a user's PR history in two, with no error anywhere.
 *
 * Canonical form: `axis=value` pairs, keys sorted lexicographically, joined `|`.
 *
 *     { grip_width: 'close', attachment: 'rope' }  ->  "attachment=rope|grip_width=close"
 *
 * DEFAULTS ARE OMITTED. This is the rule that matters most:
 *
 *     NULL  ===  ''  ===  "all values are this exercise's defaults"   -> ONE group
 *
 * Without it, every lift's PR history would split into a pre-feature bucket
 * (qualifier_key NULL, everything logged before v21) and a post-feature bucket
 * (`grip_width=medium|...` written by the chip UI even when the user touched
 * nothing). The user would see their PRs "reset" the day the feature shipped.
 *
 * COROLLARY — DEFAULTS ARE SEMI-FROZEN. Because the default is what gets
 * omitted, changing an exercise's default value in exerciseQualifierMap.ts
 * re-buckets its historical sets. That is occasionally the right call, but it is
 * never a cosmetic one: treat a default change like a data migration.
 *
 * PURE MODULE — no React, no RN, no SQLite, no i18n. Unit-tested in node by
 * lib/__tests__/qualifierKey.test.js.
 *
 * Spec: docs/archive/SPEC_2026-08-05_EXERCISE_QUALIFIERS.md §2.2
 * =============================================================================
 */

import { PULLEY_FACTORS } from '../constants/qualifiers';

/** A set's qualifiers: axis id -> value id. Values may be custom (`custom:<id>`). */
export type QualifierMap = Record<string, string>;

/** Per-exercise default values, from exerciseQualifierMap.ts. */
export type QualifierDefaults = Record<string, string>;

/** Prefix marking a user-authored value (custom_qualifier_values.id). */
export const CUSTOM_VALUE_PREFIX = 'custom:';

export function isCustomValue(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(CUSTOM_VALUE_PREFIX);
}

export function customValueId(value: string): string | null {
  return isCustomValue(value) ? value.slice(CUSTOM_VALUE_PREFIX.length) : null;
}

/**
 * Canonical grouping key for a set.
 *
 * Returns '' when every value equals its default (or there are no qualifiers) —
 * the same group as a legacy set whose qualifier_key is NULL.
 */
export function canonicalQualifierKey(
  qualifiers: QualifierMap | null | undefined,
  defaults?: QualifierDefaults | null,
): string {
  if (!qualifiers) return '';
  const d = defaults || {};
  const parts: string[] = [];

  for (const axisId of Object.keys(qualifiers).sort()) {
    const value = qualifiers[axisId];
    // Drop empties defensively — an empty string must never become "axis=".
    if (typeof value !== 'string' || value.length === 0) continue;
    // THE omission rule. Do not "simplify" this away.
    if (d[axisId] === value) continue;
    parts.push(`${axisId}=${value}`);
  }

  return parts.join('|');
}

/**
 * Stable JSON for `sets.qualifiers_json`.
 *
 * Unlike the key, this keeps DEFAULTS: the JSON records what the set actually
 * was, so history detail can show "medium grip" rather than an ambiguous blank,
 * and so a later change to an exercise's default cannot retroactively rewrite
 * what a past set claims to have been. Keys are sorted purely for determinism
 * (byte-identical exports — same rationale as exportEngine's stableStringify).
 *
 * Returns null for an empty map so the column stays NULL rather than '{}'.
 */
export function serializeQualifiers(qualifiers: QualifierMap | null | undefined): string | null {
  if (!qualifiers) return null;
  const out: QualifierMap = {};
  for (const k of Object.keys(qualifiers).sort()) {
    const v = qualifiers[k];
    if (typeof v === 'string' && v.length > 0) out[k] = v;
  }
  if (Object.keys(out).length === 0) return null;
  return JSON.stringify(out);
}

/**
 * Parse `sets.qualifiers_json`. Total: any malformed value yields {}.
 *
 * A corrupt or hand-edited column must never break a history screen — the same
 * best-effort posture the rest of the local data layer takes.
 */
export function parseQualifiers(json: string | null | undefined): QualifierMap {
  if (!json) return {};
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: QualifierMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof k === 'string' && typeof v === 'string' && k.length > 0 && v.length > 0) {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Felt load in kg after the pulley ratio, for `sets.load_effective_kg`.
 *
 * The typed weight is NEVER rewritten (the v18 exact-entry invariant): this is a
 * SECOND, derived column. You always type what the machine's pin says; this is
 * what your body actually opposed.
 *
 * Stored rather than computed at read time — unlike the strength coefficients —
 * because the pulley ratio is a physical property of the machine used that day
 * and is unrecoverable afterwards. Coefficients are our editorial estimate and
 * stay revisable, so they apply on read.
 *
 * Returns null when there is nothing meaningful to record (no weight, or no
 * ratio selected), so the column stays NULL rather than duplicating weight_kg.
 */
export function effectiveLoadKg(
  weightKg: number | null | undefined,
  qualifiers: QualifierMap | null | undefined,
): number | null {
  if (typeof weightKg !== 'number' || !Number.isFinite(weightKg) || weightKg <= 0) return null;
  const ratio = qualifiers ? qualifiers.pulley_ratio : null;
  if (!ratio) return null;
  const factor = PULLEY_FACTORS[ratio];
  if (typeof factor !== 'number' || !Number.isFinite(factor) || factor <= 0) return null;
  return Math.round(weightKg * factor * 100) / 100;
}

/**
 * Merge a prescription with actuals, actuals winning.
 *
 * Used by the logger's prefill chain:
 *   routine prescription -> previous set this session -> last session -> defaults
 * Later (more specific) sources are passed later.
 */
export function mergeQualifiers(...sources: (QualifierMap | null | undefined)[]): QualifierMap {
  const out: QualifierMap = {};
  for (const src of sources) {
    if (!src) continue;
    for (const [k, v] of Object.entries(src)) {
      if (typeof v === 'string' && v.length > 0) out[k] = v;
    }
  }
  return out;
}

/**
 * Restrict a qualifier map to a set of enabled axes (the Settings gate).
 *
 * DISPLAY-ONLY, and deliberately NOT applied on write: a set records what it
 * actually was, regardless of which chips the user has chosen to see. Turning an
 * axis off hides it; it never deletes anything, and it must never change what
 * reaches the strength model (see SPEC §4 gate invariants).
 */
export function visibleQualifiers(
  qualifiers: QualifierMap | null | undefined,
  enabledAxes: readonly string[] | null | undefined,
): QualifierMap {
  if (!qualifiers) return {};
  if (!enabledAxes) return { ...qualifiers };
  const allowed = new Set(enabledAxes);
  const out: QualifierMap = {};
  for (const [k, v] of Object.entries(qualifiers)) {
    if (allowed.has(k)) out[k] = v;
  }
  return out;
}
