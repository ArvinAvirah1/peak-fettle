/**
 * qualifierSettings — how much exercise detail the user wants to track.
 * =============================================================================
 * Founder decision D9 (2026-08-05): "gate all of this in user settings under an
 * advanced toggle where the user can select how many of these they want to keep
 * track of."
 *
 * WHY THE GATE EXISTS. A cable exercise can legitimately carry six applicable
 * axes (attachment, pulley height, pulley ratio, grip width, grip orientation,
 * laterality). Rendering all of them turns the logger — whose job is to let you
 * record a set in two taps between working sets — into a form. Most people want
 * two or three; some want everything. So the answer is a knob, not a compromise.
 *
 * THE GATE IS DISPLAY-ONLY. This is the invariant that matters, and it is
 * enforced by tests (see __tests__/qualifierSettings.test.js):
 *
 *   1. It never changes what is STORED. A set records what it actually was.
 *   2. It never changes a percentile treatment. Two users with identical
 *      training and different settings get identical rankings — a display
 *      preference must not be able to move your standing against other people.
 *   3. Disabling an axis never deletes anything. Values persist, still show in
 *      history detail, and reappear intact if the axis is re-enabled.
 *   4. 'off' short-circuits before any qualifier work happens at all — the same
 *      posture as autoreg_suggestions_enabled gating the autoregulation module.
 *
 * Storage: `app_settings` (device-local, no sync, no network — local-first by
 * construction and safe to read on mount). Deliberately NOT in the backup
 * registry: it is per-install config, not user data, consistent with every other
 * app_settings key. A restore onto a new device gets the default, not a stale
 * preference from an old phone.
 *
 * Spec: docs/archive/SPEC_2026-08-05_EXERCISE_QUALIFIERS.md §4
 * =============================================================================
 */

import { getSetting, setSetting } from './appSettings';
import { AXIS_ORDER, isKnownAxis, type QualifierAxisId } from '../constants/qualifiers';

export type QualifierTrackingLevel = 'off' | 'essential' | 'detailed' | 'everything' | 'custom';

const LEVEL_KEY = 'qualifier_tracking_level';
const CUSTOM_AXES_KEY = 'qualifier_axes_enabled';

/**
 * DEFAULT: 'essential'.
 *
 * Not 'off'. The feature was explicitly requested, so shipping it dark would
 * hide the thing that was asked for — and unlike autoregulation (a suggestion
 * engine that acts on you), qualifiers only record what you already did.
 *
 * The four essential axes are exactly the founder's stated use cases:
 * attachments ("tricep pushdowns can only be so specific"), pulley
 * configuration ("in case u use a different cable pulley on diff days"), and
 * grip width ("close grip mid grip wide grip").
 */
export const DEFAULT_LEVEL: QualifierTrackingLevel = 'essential';

const ESSENTIAL_AXES: QualifierAxisId[] = [
  'attachment',
  'pulley_height',
  'pulley_ratio',
  'grip_width',
];

const DETAILED_EXTRA: QualifierAxisId[] = [
  'grip_orientation',
  'bench_angle',
  'bar_type',
  'stance',
  'bar_position',
];

/** Axes per preset level. 'custom' is resolved from stored user choices instead. */
export const LEVEL_AXES: Record<Exclude<QualifierTrackingLevel, 'custom'>, QualifierAxisId[]> = {
  off: [],
  essential: ESSENTIAL_AXES,
  detailed: [...ESSENTIAL_AXES, ...DETAILED_EXTRA],
  everything: [...AXIS_ORDER],
};

function isLevel(v: unknown): v is QualifierTrackingLevel {
  return v === 'off' || v === 'essential' || v === 'detailed' || v === 'everything' || v === 'custom';
}

// ---------------------------------------------------------------------------
// Pure resolution (unit-tested without SQLite)
// ---------------------------------------------------------------------------

/**
 * The enabled axis list for a level, in canonical display order.
 *
 * Total by construction: an unrecognised level falls back to the default rather
 * than throwing, and custom axis ids that are no longer in the vocabulary are
 * dropped. That matters because axis ids are append/deprecate-only — a user who
 * ticked an axis that a later release stopped offering must not end up with a
 * broken settings screen.
 */
export function resolveEnabledAxes(
  level: QualifierTrackingLevel,
  customAxes?: readonly string[] | null,
): QualifierAxisId[] {
  if (level === 'custom') {
    const picked = new Set((customAxes ?? []).filter(isKnownAxis));
    return AXIS_ORDER.filter((a) => picked.has(a));
  }
  const preset = LEVEL_AXES[level as Exclude<QualifierTrackingLevel, 'custom'>];
  if (!preset) return LEVEL_AXES[DEFAULT_LEVEL as Exclude<QualifierTrackingLevel, 'custom'>];
  // Re-project through AXIS_ORDER so every caller sees the same order.
  const set = new Set<QualifierAxisId>(preset);
  return AXIS_ORDER.filter((a) => set.has(a));
}

/**
 * Which axes to SHOW for one exercise: enabled ∩ applicable.
 *
 * `applicableAxisIds` comes from exerciseQualifierMap. An exercise never shows
 * an axis that does not apply to it (a treadmill has no grip width), and never
 * shows one the user has switched off.
 */
export function visibleAxesForExercise(
  applicableAxisIds: readonly string[],
  enabledAxes: readonly QualifierAxisId[],
): QualifierAxisId[] {
  const applicable = new Set(applicableAxisIds);
  return enabledAxes.filter((a) => applicable.has(a));
}

/** True when the feature should do no work at all. Callers short-circuit on this. */
export function isTrackingOff(level: QualifierTrackingLevel): boolean {
  return level === 'off';
}

// ---------------------------------------------------------------------------
// Persistence (best-effort: a settings read must never block or break a screen)
// ---------------------------------------------------------------------------

export async function getQualifierTrackingLevel(): Promise<QualifierTrackingLevel> {
  const raw = await getSetting(LEVEL_KEY);
  return isLevel(raw) ? raw : DEFAULT_LEVEL;
}

export async function setQualifierTrackingLevel(level: QualifierTrackingLevel): Promise<void> {
  await setSetting(LEVEL_KEY, isLevel(level) ? level : DEFAULT_LEVEL);
}

/** The user's ticked axes (only meaningful when the level is 'custom'). */
export async function getCustomEnabledAxes(): Promise<QualifierAxisId[]> {
  const raw = await getSetting(CUSTOM_AXES_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const picked = new Set(parsed.filter((v): v is string => typeof v === 'string').filter(isKnownAxis));
    return AXIS_ORDER.filter((a) => picked.has(a));
  } catch {
    return [];
  }
}

export async function setCustomEnabledAxes(axes: readonly string[]): Promise<void> {
  const picked = new Set(axes.filter(isKnownAxis));
  const ordered = AXIS_ORDER.filter((a) => picked.has(a));
  await setSetting(CUSTOM_AXES_KEY, JSON.stringify(ordered));
}

/**
 * The resolved enabled-axis list. This is what the logger and the routine editor
 * call; they should not reason about levels themselves.
 *
 * Returns [] when tracking is off, which callers treat as "render nothing and
 * compute nothing".
 */
export async function getEnabledQualifierAxes(): Promise<QualifierAxisId[]> {
  const level = await getQualifierTrackingLevel();
  if (level === 'off') return [];
  if (level === 'custom') return resolveEnabledAxes('custom', await getCustomEnabledAxes());
  return resolveEnabledAxes(level);
}
