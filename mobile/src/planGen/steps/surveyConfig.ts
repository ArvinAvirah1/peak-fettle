/**
 * surveyConfig.ts — copy + option vocabularies for the plan-builder wizard.
 * =============================================================================
 * All labels/subtitles live here so the deep survey can be refined without
 * touching render/logic (mirrors app/training-survey.tsx's SURVEY_CONFIG). The
 * option `value`s are the engine's closed vocabularies (v2/types + catalog).
 * =============================================================================
 */

import type {
  SurveyGoal,
  ExperienceLevel,
  SplitPreference,
  SessionMinutes,
  SportV2,
  SeasonPhase,
  FailureProximity,
  ProgressionSpeed,
  DeloadFrequency,
} from '../surveyTypes';

export interface Opt<T> {
  label: string;
  value: T;
  subtitle?: string;
}

export const GOAL_OPTIONS: Opt<SurveyGoal>[] = [
  { label: 'Hypertrophy', value: 'hypertrophy', subtitle: 'Build muscle size — full MEV→MRV volume ramp' },
  { label: 'Max strength & powerlifting', value: 'strength_powerlifting', subtitle: 'Heavy, low-rep; optional meet peaking' },
  { label: 'General fitness / fat loss', value: 'general_fitness', subtitle: 'Health, recomp & consistency' },
  { label: 'Athletic power', value: 'athletic_power', subtitle: 'Explosive strength + plyometrics' },
  { label: 'Team sport', value: 'team_sport', subtitle: 'Season-phased strength around your games' },
];

export const EXPERIENCE_OPTIONS: Opt<ExperienceLevel>[] = [
  { label: 'Beginner', value: 'beginner', subtitle: 'New, or < 6 months consistent' },
  { label: 'Novice', value: 'novice', subtitle: '6 months – 2 years' },
  { label: 'Intermediate', value: 'intermediate', subtitle: '2 – 4 years; linear gains slowing' },
  { label: 'Advanced', value: 'advanced', subtitle: '4 – 8 years; needs periodisation' },
  { label: 'Elite', value: 'elite', subtitle: '8+ years, competitive' },
];

export const SPLIT_OPTIONS: Opt<SplitPreference>[] = [
  { label: 'Push / Pull / Legs', value: 'ppl', subtitle: 'Rotate push, pull and leg days' },
  { label: 'Upper / Lower', value: 'upper_lower', subtitle: 'Alternate upper- and lower-body days' },
  { label: 'Body-part split', value: 'body_part', subtitle: 'Chest day, back day, arms day… ("bro split")' },
  {
    label: "I don't know",
    value: 'unsure',
    subtitle: 'Trial all three, 3 weeks each, and pick what suits you',
  },
];

export const SPLIT_EXPLAINER =
  'Split choice is individual — push days front-load compounds and suit some ' +
  'lifters, while others accumulate too much fatigue to perform later in the ' +
  'session. Not sure? We build three sequential 3-week trial blocks ' +
  '(Push/Pull/Legs → Upper/Lower → Body-part) so you can feel the difference ' +
  'and adopt whichever fits best.';

export const SESSION_MINUTE_OPTIONS: Opt<SessionMinutes>[] = [
  { label: '30 min', value: 30, subtitle: 'Short' },
  { label: '45 min', value: 45, subtitle: 'Standard' },
  { label: '60 min', value: 60, subtitle: 'Full session' },
  { label: '75 min', value: 75, subtitle: 'Extended' },
  { label: '90 min', value: 90, subtitle: 'Long' },
];

export const DAY_OPTIONS: Opt<number>[] = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 0 },
];

// Equipment vocabulary matches the v2 catalog's `equipment` tags.
export const EQUIPMENT_OPTIONS: Opt<string>[] = [
  { label: 'Barbell', value: 'barbell' },
  { label: 'Dumbbell', value: 'dumbbell' },
  { label: 'Kettlebell', value: 'kettlebell' },
  { label: 'Machine', value: 'machine' },
  { label: 'Cable', value: 'cable' },
  { label: 'Bodyweight', value: 'bodyweight' },
  { label: 'Bands', value: 'bands' },
  { label: 'Bench', value: 'bench' },
  { label: 'Rack', value: 'rack' },
  { label: 'Pull-up bar', value: 'pullup_bar' },
];

// Canonical muscle-priority labels (align with the catalog's muscle tagging).
export const PRIORITY_OPTIONS: Opt<string>[] = [
  { label: 'Chest', value: 'chest' },
  { label: 'Back', value: 'back' },
  { label: 'Shoulders', value: 'shoulders' },
  { label: 'Arms', value: 'biceps' },
  { label: 'Legs', value: 'quads' },
  { label: 'Glutes', value: 'glutes' },
  { label: 'Core', value: 'abs' },
  { label: 'Calves', value: 'calves' },
];

// Injury region tokens (closed set; match engine contraindication vocabulary).
export const INJURY_OPTIONS: Opt<string>[] = [
  { label: 'Lower back', value: 'lower_back' },
  { label: 'Knees', value: 'knees' },
  { label: 'Shoulders', value: 'shoulders' },
  { label: 'Wrists', value: 'wrists' },
  { label: 'Elbows', value: 'elbows' },
  { label: 'Ankles', value: 'ankles' },
  { label: 'Neck', value: 'neck' },
  { label: 'Hip', value: 'hip' },
  { label: 'Upper back', value: 'upper_back' },
];

export const SPORT_OPTIONS: Opt<SportV2>[] = [
  { label: 'Soccer', value: 'soccer' },
  { label: 'Basketball', value: 'basketball' },
  { label: 'Football', value: 'football' },
  { label: 'Rugby', value: 'rugby' },
  { label: 'Volleyball', value: 'volleyball' },
  { label: 'Handball', value: 'handball' },
  { label: 'Hockey', value: 'hockey' },
  { label: 'Other', value: 'other' },
];

export const SEASON_OPTIONS: Opt<SeasonPhase>[] = [
  { label: 'Off-season', value: 'off_season', subtitle: 'Build strength & size base' },
  { label: 'Pre-season', value: 'pre_season', subtitle: 'Convert to power & speed' },
  { label: 'In-season', value: 'in_season', subtitle: 'Maintain — low volume, high intensity' },
];

export const FAILURE_OPTIONS: Opt<FailureProximity>[] = [
  { label: 'Cautious', value: 'cautious', subtitle: 'Leave more reps in reserve' },
  { label: 'Balanced', value: 'balanced', subtitle: 'Recommended default' },
  { label: 'Aggressive', value: 'aggressive', subtitle: 'Closer to failure (still safe-capped)' },
];

export const PROGRESSION_OPTIONS: Opt<ProgressionSpeed>[] = [
  { label: 'Conservative', value: 'conservative', subtitle: 'Slower, steadier load increases' },
  { label: 'Balanced', value: 'balanced', subtitle: 'Recommended default' },
  { label: 'Aggressive', value: 'aggressive', subtitle: 'Faster increases (capped ≤5%/session)' },
];

export const DELOAD_OPTIONS: Opt<DeloadFrequency>[] = [
  { label: 'Less often', value: 'infrequent', subtitle: 'Every 6–8 weeks' },
  { label: 'Standard', value: 'standard', subtitle: 'Every 5–6 weeks' },
  { label: 'More often', value: 'frequent', subtitle: 'Every 3–4 weeks' },
];

export const KNOB_SAFETY_NOTE =
  "Whatever you choose, we never push a beginner past 2 reps-in-reserve on the " +
  'big lifts — the safe floor always wins.';
