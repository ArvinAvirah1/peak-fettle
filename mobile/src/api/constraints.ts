/**
 * User constraints API module — manage injury/equipment restrictions.
 *
 * Server docs: peak-fettle-agents/server/routes/constraints.js
 *
 * Constraints are read by the AI plan generator (TICKET-012) to hard-block
 * exercises that use movement patterns the user cannot safely perform.
 *
 * Built-in constraint types (seeded in migrations):
 *   lower_back, knees, shoulders, wrists, ankles, neck, hip, upper_back,
 *   elbows, no_barbells, no_machines, no_cables, bodyweight_only
 *
 * Custom constraints use type = 'custom' with a free-text custom_note.
 */

import { apiClient } from './client';

export interface UserConstraint {
  id: string;
  user_id: string;
  constraint_type: string;
  custom_note: string | null;
  created_at: string;
}

export interface CreateConstraintPayload {
  constraintType: string;
  customNote?: string;
}

export interface ConstraintsResponse {
  constraints: UserConstraint[];
}

/**
 * Fetch all physical constraints for the authenticated user.
 */
export async function getConstraints(): Promise<UserConstraint[]> {
  const response = await apiClient.get<ConstraintsResponse>('/constraints');
  return response.data.constraints;
}

/**
 * Add a new physical constraint.
 */
export async function addConstraint(
  payload: CreateConstraintPayload
): Promise<UserConstraint> {
  const response = await apiClient.post<UserConstraint>('/constraints', payload);
  return response.data;
}

/**
 * Remove a constraint by ID.
 */
export async function deleteConstraint(id: string): Promise<void> {
  await apiClient.delete(`/constraints/${id}`);
}
