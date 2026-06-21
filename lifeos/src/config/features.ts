/**
 * Optional-feature registry — TICKET-119.
 *
 * Founder decision (2026-06-20): every NET-NEW companion feature is
 * user-toggleable ("user can choose which to use and which to disable"). This
 * module is the single source of truth for those switches. Screens read the
 * resolved flags via the useFeatureFlags() hook (see src/hooks/useFeatureFlags.ts,
 * TICKET-119); NEVER hardcode a feature on/off in a screen.
 *
 * Persistence: a JSON map under lo_meta key 'feature_flags' (local-first; rides
 * the encrypted backup with the rest of lo_meta). Absent key => DEFAULT_FLAGS.
 *
 * Pure + dependency-free so it parses in the @babel sweep and unit-tests cleanly.
 */

export type FeatureKey =
  | 'shareCards'
  | 'accountabilityPartner'
  | 'appWellbeingScoring'
  | 'affirmations';

export interface OptionalFeature {
  key: FeatureKey;
  /** Short label for the You > Features settings list. */
  label: string;
  /** One-line plain-English description shown under the toggle. */
  description: string;
  /** Ships OFF by default — these are additive, opt-in extras. */
  default: boolean;
  /** Ticket that implements the feature (traceability). */
  ticket: string;
}

export const OPTIONAL_FEATURES: readonly OptionalFeature[] = [
  {
    key: 'shareCards',
    label: 'Shareable milestone cards',
    description: 'Generate a styled image at streak milestones (7, 30, 66, 100, 365 days) to share if you want.',
    default: false,
    ticket: 'TICKET-120',
  },
  {
    key: 'accountabilityPartner',
    label: 'Accountability partner',
    description: 'Let one person you choose see a daily summary of your check-ins (never your raw data).',
    default: false,
    ticket: 'TICKET-121',
  },
  {
    key: 'appWellbeingScoring',
    label: 'App wellbeing scoring',
    description: 'Tag the apps you limit as Energizing, Neutral, or Draining and watch a weekly quality score.',
    default: false,
    ticket: 'TICKET-122',
  },
  {
    key: 'affirmations',
    label: 'Identity affirmations',
    description: 'Optional gentle morning/evening affirmations tied to the identity you are building.',
    default: false,
    ticket: 'TICKET-123',
  },
] as const;

export type FeatureFlags = Record<FeatureKey, boolean>;

export const DEFAULT_FLAGS: FeatureFlags = OPTIONAL_FEATURES.reduce((acc, f) => {
  acc[f.key] = f.default;
  return acc;
}, {} as FeatureFlags);

/** Merge a stored partial map over the defaults (forward/backward compatible). */
export function resolveFlags(stored: Partial<FeatureFlags> | null | undefined): FeatureFlags {
  return { ...DEFAULT_FLAGS, ...(stored ?? {}) };
}

/** lo_meta key under which the JSON flag map is persisted. */
export const FEATURE_FLAGS_META_KEY = 'feature_flags';
