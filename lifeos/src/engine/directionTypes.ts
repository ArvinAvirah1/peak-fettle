/**
 * Shared types for the direction engine (TICKET-106/107).
 * The survey UI writes SurveyAnswers; directionModel.v1.ts consumes it.
 */

import type { Domain } from '../data/goals';
import type { FocusKind, FocusSchedule } from '../data/focus';
import type { AnchorType } from '../data/habits';

export const SURVEY_VERSION = 1;

export type Chronotype = 'morning' | 'evening' | 'mixed';

export interface DomainAssessment {
  /** Self-rated current state, 1 (struggling) – 10 (thriving). */
  current: number;
  /** Free-text "what's in the way" — stored, surfaced in review; never parsed. */
  blocker: string;
}

export interface SurveyAnswers {
  surveyVersion: number;
  kind: 'onboarding' | 'micro' | 'full';
  /** Domains the user chose to work on (1–6). */
  domains: Domain[];
  /** Per-domain self-assessment (only for selected domains). */
  selfAssessment: Partial<Record<Domain, DomainAssessment>>;
  /** Realistic discretionary hours per week for self-improvement. */
  hoursPerWeek: number;
  chronotype: Chronotype;
  /** Value keys ranked best-first (subset of VALUE_KEYS). */
  values: string[];
  /** Names of apps the user reports losing time to (informs blocker suggestion). */
  painApps: string[];
}

export const VALUE_KEYS = [
  'mastery',
  'connection',
  'health',
  'autonomy',
  'contribution',
  'stability',
  'adventure',
] as const;

export interface ProtocolStackStep {
  name: string;
  icon: string;
  estDurationSec?: number;
}

export interface ProtocolStack {
  name: string;
  anchorType: AnchorType;
  anchorValue: string;
  steps: ProtocolStackStep[];
}

export interface BlockerSuggestion {
  name: string;
  kind: FocusKind;
  schedule: FocusSchedule;
}

export interface DomainProtocol {
  domain: Domain;
  /** Key into PROTOCOL_RATIONALES — plain-English why + evidence note. */
  rationaleKey: string;
  stacks: ProtocolStack[];
  /** Milestone titles, ordered. Instantiated under a generated goal. */
  milestoneLadder: string[];
  goalTitle: string;
  blockerSuggestion: BlockerSuggestion | null;
  /** Exercise slugs from the seeded library. */
  exercises: string[];
  weeklyTimeBudgetMin: number;
  modelVersion: string;
}
