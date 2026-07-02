/**
 * useGroups — hook for the authenticated user's groups list + credit balance.
 * useGroupDetail — hook for a single group's full detail.
 *
 * Both hooks load on mount and expose a `refetch` callback for pull-to-refresh.
 *
 * Server endpoints referenced (see api/groups.ts header for full mapping):
 *   GET  /groups                      → useGroups.groups
 *   GET  /credits/balance             → useGroups.creditBalance
 *   POST /groups                      → useGroups.createGroup()
 *   POST /groups/invitations/accept   → useGroups.joinGroup()
 *   POST /groups/:id/leave            → useGroups.leaveGroup()
 *   GET  /groups/:id                  → useGroupDetail.detail
 *   GET  /groups/:id/history          → useGroupDetail.evaluations
 *   DELETE /groups/:id/members/:uid   → useGroupDetail.kickMember()
 *   PUT  /goals/weekly                → useGroupDetail.updateGoal()  (app-wide)
 */

import { useState, useEffect, useCallback } from 'react';
import { setActiveGroupIds } from '../data/groupSignals'; // 094-A weekly-signal registry
import {
  getGroups,
  getCreditBalance,
  createGroup,
  joinGroup,
  leaveGroup,
  kickMember,
  getGroupDetail,
  getGroupEvaluations,
  updateMemberGoal,
} from '../api/groups';
import {
  Group,
  GroupDetail,
  GroupWeekEvaluation,
  CreditBalance,
  CreateGroupPayload,
  JoinGroupPayload,
  UpdateMemberGoalPayload,
} from '../types/api';

// ---------------------------------------------------------------------------
// Hang-proofing (BUGFIX 2026-06-30, Bug 1)
//
// Groups is a genuinely server-backed feature (available on free AND pro), so
// these hooks legitimately call the network on mount. But the shared apiClient
// timeout is 15s, so on a slow/unreachable server the Groups screen would sit on
// an infinite-feeling spinner for up to 15s — the "laggy" symptom. Race the load
// against a short deadline so the UI resolves to an error state fast (the same
// hang-proofing pattern used by useLocalStreak / RoutineStrip). This never makes
// a NEW network call; it only bounds how long the existing one can pin isLoading.
// ---------------------------------------------------------------------------

const GROUPS_LOAD_DEADLINE_MS = 6000;

/** Reject with `timeout_deadline` after `ms` so a hung load can't pin the UI. */
function withDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('timeout_deadline')), ms),
    ),
  ]);
}

// ---------------------------------------------------------------------------
// useGroups — groups list + credit balance
// ---------------------------------------------------------------------------

export interface UseGroupsResult {
  groups: Group[];
  creditBalance: CreditBalance | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;

  /** Create a new group and reload the list. Returns the created Group. */
  createGroup: (payload: CreateGroupPayload) => Promise<Group>;
  isCreating: boolean;
  createError: string | null;
  clearCreateError: () => void;

  /** Join via invite code and reload the list. Returns the joined Group. */
  joinGroup: (payload: JoinGroupPayload) => Promise<Group>;
  isJoining: boolean;
  joinError: string | null;
  clearJoinError: () => void;

  /** Leave a group and reload the list. */
  leaveGroup: (groupId: string) => Promise<void>;
  isLeaving: boolean;
  leaveError: string | null;
  clearLeaveError: () => void;
}

export function useGroups(): UseGroupsResult {
  const [groups, setGroups] = useState<Group[]>([]);
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const [isLeaving, setIsLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  // Load both groups + credit balance in parallel.
  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [groupsData, balanceData] = await withDeadline(
        Promise.all([getGroups(), getCreditBalance()]),
        GROUPS_LOAD_DEADLINE_MS,
      );
      setGroups(groupsData);
      // 094-A: register group ids so the workout-save path can fire weekly signals.
      try { setActiveGroupIds(groupsData.map((g) => g.id)); } catch { /* non-fatal */ }
      setCreditBalance(balanceData);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load groups';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreateGroup = useCallback(
    async (payload: CreateGroupPayload): Promise<Group> => {
      setIsCreating(true);
      setCreateError(null);
      try {
        const group = await createGroup(payload);
        await load(); // reload list
        return group;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to create group';
        setCreateError(msg);
        throw e;
      } finally {
        setIsCreating(false);
      }
    },
    [load]
  );

  const handleJoinGroup = useCallback(
    async (payload: JoinGroupPayload): Promise<Group> => {
      setIsJoining(true);
      setJoinError(null);
      try {
        const group = await joinGroup(payload);
        await load();
        return group;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to join group';
        setJoinError(msg);
        throw e;
      } finally {
        setIsJoining(false);
      }
    },
    [load]
  );

  const handleLeaveGroup = useCallback(
    async (groupId: string): Promise<void> => {
      setIsLeaving(true);
      setLeaveError(null);
      try {
        await leaveGroup(groupId);
        await load();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to leave group';
        setLeaveError(msg);
        throw e;
      } finally {
        setIsLeaving(false);
      }
    },
    [load]
  );

  return {
    groups,
    creditBalance,
    isLoading,
    error,
    refetch: load,

    createGroup: handleCreateGroup,
    isCreating,
    createError,
    clearCreateError: () => setCreateError(null),

    joinGroup: handleJoinGroup,
    isJoining,
    joinError,
    clearJoinError: () => setJoinError(null),

    leaveGroup: handleLeaveGroup,
    isLeaving,
    leaveError,
    clearLeaveError: () => setLeaveError(null),
  };
}

// ---------------------------------------------------------------------------
// useGroupDetail — single group with members + evaluation history
// ---------------------------------------------------------------------------

export interface UseGroupDetailResult {
  detail: GroupDetail | null;
  evaluations: GroupWeekEvaluation[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;

  /** Kick a member (admin only). Reloads detail. */
  kickMember: (userId: string) => Promise<void>;
  isKicking: boolean;
  kickError: string | null;
  clearKickError: () => void;

  /**
   * Update the caller's weekly goal for this group.
   * Change is queued — effective at next Monday 00:00 UTC.
   */
  updateGoal: (payload: UpdateMemberGoalPayload) => Promise<void>;
  isUpdatingGoal: boolean;
  updateGoalError: string | null;
  clearUpdateGoalError: () => void;
}

export function useGroupDetail(groupId: string): UseGroupDetailResult {
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [evaluations, setEvaluations] = useState<GroupWeekEvaluation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isKicking, setIsKicking] = useState(false);
  const [kickError, setKickError] = useState<string | null>(null);

  const [isUpdatingGoal, setIsUpdatingGoal] = useState(false);
  const [updateGoalError, setUpdateGoalError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [detailData, evalData] = await withDeadline(
        Promise.all([getGroupDetail(groupId), getGroupEvaluations(groupId, 12)]),
        GROUPS_LOAD_DEADLINE_MS,
      );
      setDetail(detailData);
      setEvaluations(evalData);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load group';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [groupId]);

  useEffect(() => { load(); }, [load]);

  const handleKickMember = useCallback(
    async (userId: string): Promise<void> => {
      setIsKicking(true);
      setKickError(null);
      try {
        await kickMember(groupId, userId);
        await load();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to kick member';
        setKickError(msg);
        throw e;
      } finally {
        setIsKicking(false);
      }
    },
    [groupId, load]
  );

  const handleUpdateGoal = useCallback(
    async (payload: UpdateMemberGoalPayload): Promise<void> => {
      setIsUpdatingGoal(true);
      setUpdateGoalError(null);
      try {
        await updateMemberGoal(groupId, payload);
        await load();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to update goal';
        setUpdateGoalError(msg);
        throw e;
      } finally {
        setIsUpdatingGoal(false);
      }
    },
    [groupId, load]
  );

  return {
    detail,
    evaluations,
    isLoading,
    error,
    refetch: load,

    kickMember: handleKickMember,
    isKicking,
    kickError,
    clearKickError: () => setKickError(null),

    updateGoal: handleUpdateGoal,
    isUpdatingGoal,
    updateGoalError,
    clearUpdateGoalError: () => setUpdateGoalError(null),
  };
}
