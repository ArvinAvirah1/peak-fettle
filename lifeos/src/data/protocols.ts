/**
 * Protocol persistence + acceptance (TICKET-107).
 *
 * The engine proposes; the user accepts/edits/dismisses (Q28). Accepting
 * instantiates real habits/stacks/goals — blocker suggestions become DRAFT
 * focus configs (the user must still run the system app picker themselves;
 * we never pre-select apps).
 */

import { genId, localDb } from '../db/localDb';
import type { DomainProtocol, SurveyAnswers } from '../engine/directionTypes';
import { generateProtocols, MODEL_VERSION } from '../engine/directionModel.v1';
import { createHabit, createStack } from './habits';
import { addMilestone, createGoal, linkHabit } from './goals';
import { createFocusConfig } from './focus';

export interface ProtocolRow {
  id: string;
  domain: string;
  model_version: string;
  generated_at: string;
  status: 'proposed' | 'active' | 'dismissed' | 'superseded';
  accepted_at: string | null;
  payload_json: string;
}

// --- survey persistence ----------------------------------------------------------

export async function saveSurvey(answers: SurveyAnswers): Promise<void> {
  await localDb.execute(
    `INSERT INTO lo_survey_responses (id, survey_version, kind, ts, answers_json)
     VALUES (?, ?, ?, ?, ?)`,
    [genId(), answers.surveyVersion, answers.kind, new Date().toISOString(), JSON.stringify(answers)]
  );
}

export async function latestSurvey(): Promise<SurveyAnswers | null> {
  const row = await localDb.getFirst<{ answers_json: string }>(
    `SELECT answers_json FROM lo_survey_responses ORDER BY ts DESC LIMIT 1`
  );
  return row ? (JSON.parse(row.answers_json) as SurveyAnswers) : null;
}

// --- generation ---------------------------------------------------------------------

/**
 * Run the engine and persist proposals. A 'full' survey supersedes all prior
 * non-dismissed protocols first (Q26 quarterly re-survey semantics).
 */
export async function generateAndStoreProtocols(answers: SurveyAnswers): Promise<ProtocolRow[]> {
  if (answers.kind === 'full' || answers.kind === 'onboarding') {
    await localDb.execute(
      `UPDATE lo_protocols SET status = 'superseded' WHERE status IN ('proposed','active')`
    );
  }
  const protocols = generateProtocols(answers);
  const now = new Date().toISOString();
  for (const p of protocols) {
    await localDb.execute(
      `INSERT INTO lo_protocols (id, domain, model_version, generated_at, payload_json)
       VALUES (?, ?, ?, ?, ?)`,
      [genId(), p.domain, MODEL_VERSION, now, JSON.stringify(p)]
    );
  }
  return listProtocols('proposed');
}

export async function listProtocols(status?: ProtocolRow['status']): Promise<ProtocolRow[]> {
  if (status) {
    return localDb.getAll<ProtocolRow>(
      `SELECT * FROM lo_protocols WHERE status = ? ORDER BY generated_at DESC, domain ASC`,
      [status]
    );
  }
  return localDb.getAll<ProtocolRow>(`SELECT * FROM lo_protocols ORDER BY generated_at DESC`);
}

export async function dismissProtocol(id: string): Promise<void> {
  await localDb.execute(`UPDATE lo_protocols SET status = 'dismissed' WHERE id = ?`, [id]);
}

// --- acceptance -----------------------------------------------------------------------

/**
 * Instantiate an accepted protocol. Returns ids of what was created so the
 * UI can deep-link. Blocker suggestions become a DISABLED draft config —
 * enabling requires the user to pick apps via the system picker (TICKET-104).
 */
export async function acceptProtocol(row: ProtocolRow): Promise<{ goalId: string }> {
  const p = JSON.parse(row.payload_json) as DomainProtocol;

  // 1. Goal + milestones
  const goalId = await createGoal({
    domain: p.domain as never,
    title: p.goalTitle,
    sourceProtocolId: row.id,
  });
  for (const m of p.milestoneLadder) {
    await addMilestone(goalId, m);
  }

  // 2. Stacks + habits, linked to the goal
  for (const stack of p.stacks) {
    const stackId = await createStack({
      name: stack.name,
      anchorType: stack.anchorType,
      anchorValue: stack.anchorValue,
    });
    let position = 0;
    for (const step of stack.steps) {
      const habitId = await createHabit({
        name: step.name,
        icon: step.icon,
        stackId,
        stackPosition: position++,
        estDurationSec: step.estDurationSec ?? null,
        sourceProtocolId: row.id,
      });
      await linkHabit(goalId, habitId);
    }
  }

  // 3. Blocker suggestion → disabled draft (user finishes setup in Focus tab)
  if (p.blockerSuggestion) {
    const configId = await createFocusConfig({
      kind: p.blockerSuggestion.kind,
      name: p.blockerSuggestion.name,
      schedule: p.blockerSuggestion.schedule,
    });
    await localDb.execute(`UPDATE lo_focus_configs SET enabled = 0 WHERE id = ?`, [configId]);
  }

  await localDb.execute(
    `UPDATE lo_protocols SET status = 'active', accepted_at = ? WHERE id = ?`,
    [new Date().toISOString(), row.id]
  );

  return { goalId };
}
