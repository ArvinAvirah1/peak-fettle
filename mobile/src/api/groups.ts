/**
 * Groups API module — group streak credits feature.
 *
 * Server endpoints (live in peak-fettle-agents/server/routes/groups.js,
 * mounted under three routers in server/index.js: /groups, /credits, /goals):
 *
 *   GET    /groups                       — list caller's groups
 *   POST   /groups                       — create a new group
 *   GET    /groups/:id                   — group detail + members
 *   POST   /groups/invitations/accept    — join via invite token
 *   POST   /groups/:id/leave             — leave a group (server uses POST, not DELETE)
 *   DELETE /groups/:id/members/:userId   — kick a member (admin only)
 *   GET    /groups/:id/history           — ISO-week evaluation history
 *   GET    /credits/balance              — caller's credit balance
 *   PUT    /goals/weekly                 — update caller's app-wide weekly goal
 *                                          (queued until next Monday 00:00 UTC)
 *
 * All endpoints require a valid Bearer accessToken.
 *
 * Schema notes (see group_streak_credits_spec.md):
 *   - Groups: 2–12 members. Max 3 concurrent groups per user.
 *   - Evaluation cadence: every Monday 00:00 UTC (ISO week boundary).
 *   - Multiplier: min(1 + 0.10 × streak_weeks, 3.0). Base credits: 50/member.
 *   - Goal modifier: 1 wk/wk → 0.5×, 2 wk/wk → 0.75×, 3+ wk/wk → 1.0×.
 *   - New members excluded from current week; first 2 weeks at 1.0× regardless
 *     of group streak state.
 *   - Weekly goal is per-user (app-wide), not per-group — server applies the
 *     same goal to every group the user belongs to. The `groupId` argument on
 *     `updateMemberGoal()` is kept for hook compatibility but is not sent.
 */

import { apiClient } from './client';
import {
  Group,
  GroupDetail,
  GroupsResponse,
  GroupWeekEvaluation,
  EvaluationsResponse,
  CreditBalance,
  CreateGroupPayload,
  JoinGroupPayload,
  UpdateMemberGoalPayload,
} from '../types/api';

// ---------------------------------------------------------------------------
// Group list
// ---------------------------------------------------------------------------

/**
 * Fetch all groups the authenticated user belongs to.
 * Returns at most 3 groups (concurrent group cap per spec §8).
 */
export async function getGroups(): Promise<Group[]> {
  const response = await apiClient.get<GroupsResponse>('/groups');
  return response.data.groups;
}

// ---------------------------------------------------------------------------
// Group creation
// ---------------------------------------------------------------------------

/**
 * Create a new group.
 * Server enforces:
 *   - name max 40 chars
 *   - caller must be ≥ 30 days old with ≥ 10 logged sessions (account gate)
 *   - caller must be in fewer than 3 groups already
 */
export async function createGroup(payload: CreateGroupPayload): Promise<Group> {
  const response = await apiClient.post<Group>('/groups', payload);
  return response.data;
}

// ---------------------------------------------------------------------------
// Group detail
// ---------------------------------------------------------------------------

/**
 * Fetch full group details including members, current streak, and the
 * most recently completed week evaluation.
 */
export async function getGroupDetail(groupId: string): Promise<GroupDetail> {
  const response = await apiClient.get<GroupDetail>(`/groups/${groupId}`);
  return response.data;
}

// ---------------------------------------------------------------------------
// Join / leave
// ---------------------------------------------------------------------------

/**
 * Join a group via invite code.
 * Server enforces account gate (30 days, ≥10 sessions) and concurrent cap (≤3).
 * Mid-week joins are recorded but excluded from the current ISO-week evaluation.
 */
export async function joinGroup(payload: JoinGroupPayload): Promise<Group> {
  const response = await apiClient.post<Group>(
    '/groups/invitations/accept',
    payload
  );
  return response.data;
}

/**
 * Leave a group voluntarily.
 * Caller is excluded from the next week's evaluation. Banked credits are retained.
 *
 * NOTE: server uses POST (not DELETE) so the route can return a 200 body
 * confirming the leave outcome — see groups.js line 564.
 */
export async function leaveGroup(groupId: string): Promise<void> {
  await apiClient.post(`/groups/${groupId}/leave`);
}

// ---------------------------------------------------------------------------
// Kick member (admin only)
// ---------------------------------------------------------------------------

/**
 * Kick a member from the group. Admin only.
 * Kicked member cannot rejoin for 4 weeks.
 * Kicks within 48h of a week boundary do not change the current week's
 * eligible-member set (the kicked member is still counted for that week).
 */
export async function kickMember(
  groupId: string,
  userId: string
): Promise<void> {
  await apiClient.delete(`/groups/${groupId}/members/${userId}`);
}

// ---------------------------------------------------------------------------
// Goal management
// ---------------------------------------------------------------------------

/**
 * Update the caller's personal weekly goal.
 * Changes are queued and applied at the next Monday 00:00 UTC boundary.
 * Floor: ≥1 workout/week. Rate-limited to one change per week boundary.
 *
 * NOTE: server-side the weekly goal is app-wide (one goal per user that
 * applies to every group they're in), exposed at PUT /goals/weekly.
 * `groupId` is accepted for hook compatibility but ignored.
 */
export async function updateMemberGoal(
  groupId: string,
  payload: UpdateMemberGoalPayload
): Promise<void> {
  // groupId intentionally unused — server scope is the user, not the group.
  void groupId;
  await apiClient.put('/goals/weekly', payload);
}

// ---------------------------------------------------------------------------
// Evaluation history
// ---------------------------------------------------------------------------

/**
 * Fetch ISO-week evaluation history for a group, newest first.
 * Each entry records whether the >50% threshold was met, per-member credits
 * (at the 3+/week goal tier), and the streak after that evaluation.
 *
 * @param groupId  The group UUID.
 * @param limit    Number of weeks to return (default 12 ≈ 3 months).
 */
export async function getGroupEvaluations(
  groupId: string,
  limit = 12
): Promise<GroupWeekEvaluation[]> {
  // Server route is /groups/:id/history (not /evaluations) — see groups.js line 589.
  const response = await apiClient.get<EvaluationsResponse>(
    `/groups/${groupId}/history`,
    { params: { limit } }
  );
  return response.data.evaluations;
}

// ---------------------------------------------------------------------------
// Credit balance
// ---------------------------------------------------------------------------

/**
 * Fetch the authenticated user's current credit balance.
 * `balance` is spendable credits; `total_earned` is the all-time gross (for display).
 */
export async function getCreditBalance(): Promise<CreditBalance> {
  // Live endpoint is /credits/balance (creditsRouter mounted at /credits).
  const response = await apiClient.get<CreditBalance>('/credits/balance');
  return response.data;
}
