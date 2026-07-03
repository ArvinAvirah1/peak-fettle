/**
 * planStore.ts — persistence for the active engine-v2 generated plan (Stage 2).
 * =============================================================================
 * REQUIREMENTS_ADDENDUM_2026-07-02 section 2/3/6. Stores the SINGLE active plan
 * or trial sequence the Pro deep plan-builder produced, TOGETHER with the
 * SurveyAnswers that produced it (needed to regenerate on adoption / a
 * meta-change) and the trial-block lifecycle state.
 *
 * PERSISTENCE DESIGN (justified):
 *   - A NEW on-device table `generated_plans` (schema v9, one active row
 *     id='active') rather than the existing local `plans` table. `plans` mirrors
 *     the SERVER plans shape (Pro server sync) and is consumed by the Pro server
 *     path; it has no columns for the SurveyAnswers blob or the trial lifecycle,
 *     and conflating two lifecycles there would be dishonest. A dedicated
 *     single-active-row table (like `schedule`/`avatar`) is cleaner and leaves
 *     the server `plans` contract untouched.
 *   - LOCAL SQLite for BOTH tiers in Stage 2: generation is fully on-device, so
 *     the honest Stage-2 store is local for everyone. Additive server sync for
 *     Pro can layer on later without a schema change. This module makes NO REST
 *     call and NO free-tier network call (local-first invariant preserved).
 *
 * The store is deliberately CLOCK-FREE except for `created_at`/`updated_at`
 * stamps taken at the write call site (never inside plan/trial logic). Trial
 * day-key stamps come from the caller (a UI screen) and are stored verbatim.
 * =============================================================================
 */

import { localDb } from '../db/localDb';
import type { TierUser } from '../data/backup/tierPolicy';
import type { PlanV2, TrialSequenceV2, SplitPreference } from '../lib/trainingEngine/v2/types';
import type { SurveyAnswers } from './surveyTypes';
import type { PlanLifecycleStatus } from './trialLifecycle';

const ROW_ID = 'active';

/** In-memory shape of the active generated plan (parsed from the DB row). */
export interface StoredGeneratedPlan {
  id: string;
  userId: string | null;
  kind: 'plan' | 'trial';
  status: PlanLifecycleStatus;
  /** The generated PlanV2 (kind==='plan') — null for a trial sequence. */
  plan: PlanV2 | null;
  /** The generated TrialSequenceV2 (kind==='trial') — null for a single plan. */
  sequence: TrialSequenceV2 | null;
  /** The SurveyAnswers that produced this (for regeneration). */
  survey: SurveyAnswers;
  /** The split of the current/adopted plan (null while a trial is mid-flight). */
  split: SplitPreference | null;
  /** Trial only: index (0..2) of the active block. */
  activeBlock: number | null;
  /** Trial only: day-key the sequence started (block 1, day 1). */
  blockStartDayKey: string | null;
  /** The split adopted out of the trial flow (null until adoption). */
  adoptedSplit: Exclude<SplitPreference, 'unsure'> | null;
  createdAt: string;
  updatedAt: string;
}

/** Fields the caller supplies when saving a single generated plan. */
export interface SavePlanInput {
  userId: string | null;
  plan: PlanV2;
  survey: SurveyAnswers;
  /** 'plan_saved' (not yet on the calendar) or 'plan_adopted'. */
  status: Extract<PlanLifecycleStatus, 'plan_saved' | 'plan_adopted'>;
}

/** Fields the caller supplies when starting a trial sequence. */
export interface SaveTrialInput {
  userId: string | null;
  sequence: TrialSequenceV2;
  survey: SurveyAnswers;
  /** Day-key the sequence starts (block 1, day 1) — from a real clock at the UI. */
  startDayKey: string;
}

// ---------------------------------------------------------------------------
// Row <-> object
// ---------------------------------------------------------------------------

interface GeneratedPlanRow {
  id: string;
  user_id: string | null;
  kind: string;
  status: string;
  payload: string;
  survey: string;
  split: string | null;
  active_block: number | null;
  block_start_day_key: string | null;
  adopted_split: string | null;
  created_at: string | null;
  updated_at: string | null;
}

function safeParse<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function rowToStored(row: GeneratedPlanRow): StoredGeneratedPlan | null {
  const survey = safeParse<SurveyAnswers>(row.survey);
  if (!survey) return null; // a plan without its survey can't be regenerated — treat as absent
  const kind = row.kind === 'trial' ? 'trial' : 'plan';
  const plan = kind === 'plan' ? safeParse<PlanV2>(row.payload) : null;
  const sequence = kind === 'trial' ? safeParse<TrialSequenceV2>(row.payload) : null;
  if (kind === 'plan' && !plan) return null;
  if (kind === 'trial' && !sequence) return null;
  const now = new Date().toISOString();
  return {
    id: row.id,
    userId: row.user_id ?? null,
    kind,
    status: (row.status as PlanLifecycleStatus) ?? 'plan_saved',
    plan,
    sequence,
    survey,
    split: (row.split as SplitPreference | null) ?? null,
    activeBlock: typeof row.active_block === 'number' ? row.active_block : null,
    blockStartDayKey: row.block_start_day_key ?? null,
    adoptedSplit: (row.adopted_split as Exclude<SplitPreference, 'unsure'> | null) ?? null,
    createdAt: row.created_at ?? now,
    updatedAt: row.updated_at ?? now,
  };
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

/**
 * loadActivePlan — the single active generated plan/sequence, or null if none.
 * Local SQLite for both tiers (Stage 2). `_user` is accepted for a tier-aware
 * signature consistent with the other data layers and for a future Pro server
 * branch; today the store is on-device for everyone.
 */
export async function loadActivePlan(
  _user?: TierUser | null,
): Promise<StoredGeneratedPlan | null> {
  try {
    await localDb.init();
    const row = await localDb.getFirst<GeneratedPlanRow>(
      'SELECT * FROM generated_plans WHERE id = ?',
      [ROW_ID],
    );
    if (!row) return null;
    return rowToStored(row);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Write helpers
// ---------------------------------------------------------------------------

/** Upsert the single active row from a fully-formed StoredGeneratedPlan. */
async function upsert(row: {
  userId: string | null;
  kind: 'plan' | 'trial';
  status: PlanLifecycleStatus;
  payload: string;
  survey: string;
  split: string | null;
  activeBlock: number | null;
  blockStartDayKey: string | null;
  adoptedSplit: string | null;
  createdAt: string;
  updatedAt: string;
}): Promise<void> {
  await localDb.init();
  await localDb.execute(
    `INSERT INTO generated_plans
       (id, user_id, kind, status, payload, survey, split, active_block,
        block_start_day_key, adopted_split, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       user_id = excluded.user_id,
       kind = excluded.kind,
       status = excluded.status,
       payload = excluded.payload,
       survey = excluded.survey,
       split = excluded.split,
       active_block = excluded.active_block,
       block_start_day_key = excluded.block_start_day_key,
       adopted_split = excluded.adopted_split,
       updated_at = excluded.updated_at`,
    [
      ROW_ID,
      row.userId,
      row.kind,
      row.status,
      row.payload,
      row.survey,
      row.split,
      row.activeBlock,
      row.blockStartDayKey,
      row.adoptedSplit,
      row.createdAt,
      row.updatedAt,
    ],
    { tables: ['generated_plans'] },
  );
}

/** Preserve the existing created_at across a replace (else stamp a new one). */
async function existingCreatedAt(): Promise<string | null> {
  try {
    const row = await localDb.getFirst<{ created_at: string | null }>(
      'SELECT created_at FROM generated_plans WHERE id = ?',
      [ROW_ID],
    );
    return row?.created_at ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Save — single plan
// ---------------------------------------------------------------------------

/**
 * saveActivePlan — persist a single generated plan (replaces any active plan or
 * trial). `now` stamps created/updated; pass it at the call site — never inside
 * plan logic. Returns the stored object.
 */
export async function saveActivePlan(
  input: SavePlanInput,
  now: Date = new Date(),
): Promise<StoredGeneratedPlan> {
  await localDb.init();
  const iso = now.toISOString();
  const createdAt = (await existingCreatedAt()) ?? iso;
  await upsert({
    userId: input.userId,
    kind: 'plan',
    status: input.status,
    payload: JSON.stringify(input.plan),
    survey: JSON.stringify(input.survey),
    split: input.plan.splitPreference ?? null,
    activeBlock: null,
    blockStartDayKey: null,
    adoptedSplit: null,
    createdAt,
    updatedAt: iso,
  });
  const loaded = await loadActivePlan();
  if (!loaded) throw new Error('planStore: failed to reload saved plan');
  return loaded;
}

// ---------------------------------------------------------------------------
// Save — trial sequence
// ---------------------------------------------------------------------------

/**
 * saveActiveTrial — persist a trial sequence with block 1 active, stamped with
 * the caller-supplied start day-key. Replaces any active plan/trial.
 */
export async function saveActiveTrial(
  input: SaveTrialInput,
  now: Date = new Date(),
): Promise<StoredGeneratedPlan> {
  await localDb.init();
  const iso = now.toISOString();
  const createdAt = (await existingCreatedAt()) ?? iso;
  await upsert({
    userId: input.userId,
    kind: 'trial',
    status: 'trial_active',
    payload: JSON.stringify(input.sequence),
    survey: JSON.stringify(input.survey),
    split: null, // no split adopted while the sequence runs
    activeBlock: 0,
    blockStartDayKey: input.startDayKey,
    adoptedSplit: null,
    createdAt,
    updatedAt: iso,
  });
  const loaded = await loadActivePlan();
  if (!loaded) throw new Error('planStore: failed to reload saved trial');
  return loaded;
}

// ---------------------------------------------------------------------------
// Update — lifecycle transitions
// ---------------------------------------------------------------------------

/**
 * updateStatus — patch just the lifecycle status of the active row (e.g. mark a
 * saved plan adopted, or a trial sequence complete). No-op if there is no active
 * row. Returns the updated stored object (or null when absent).
 */
export async function updateStatus(
  status: PlanLifecycleStatus,
  now: Date = new Date(),
): Promise<StoredGeneratedPlan | null> {
  await localDb.init();
  const existing = await loadActivePlan();
  if (!existing) return null;
  await localDb.execute(
    `UPDATE generated_plans SET status = ?, updated_at = ? WHERE id = ?`,
    [status, now.toISOString(), ROW_ID],
    { tables: ['generated_plans'] },
  );
  return loadActivePlan();
}

/**
 * advanceTrialBlock — move a running trial sequence to its next block, or mark it
 * complete when the last block is finished (no early adoption). No-op if the
 * active row is not a running trial. Returns the updated stored object (or null).
 * The block index is bounded to the sequence length.
 */
export async function advanceTrialBlock(now: Date = new Date()): Promise<StoredGeneratedPlan | null> {
  await localDb.init();
  const existing = await loadActivePlan();
  if (!existing || existing.kind !== 'trial' || existing.status !== 'trial_active') return existing;
  const blockCount = existing.sequence?.blocks.length ?? 0;
  const cur = existing.activeBlock ?? 0;
  const nextBlock = cur + 1;
  const iso = now.toISOString();
  if (nextBlock >= blockCount) {
    // All blocks done without adoption → comparison-summary state.
    await localDb.execute(
      `UPDATE generated_plans SET status = 'trial_complete', updated_at = ? WHERE id = ?`,
      [iso, ROW_ID],
      { tables: ['generated_plans'] },
    );
  } else {
    await localDb.execute(
      `UPDATE generated_plans SET active_block = ?, updated_at = ? WHERE id = ?`,
      [nextBlock, iso, ROW_ID],
      { tables: ['generated_plans'] },
    );
  }
  return loadActivePlan();
}

/**
 * clearActivePlan — remove the active row entirely (e.g. the user discards the
 * plan). Idempotent.
 */
export async function clearActivePlan(): Promise<void> {
  try {
    await localDb.init();
    await localDb.execute('DELETE FROM generated_plans WHERE id = ?', [ROW_ID], {
      tables: ['generated_plans'],
    });
  } catch {
    // best-effort — never throw to the UI
  }
}
