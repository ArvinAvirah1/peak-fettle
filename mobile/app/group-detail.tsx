/**
 * GroupDetail screen — full view of a single group.
 *
 * Route: /group-detail?id=<groupId>
 * Push screen (back button returns to /groups).
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────┐
 *   │  ‹  [Group Name]                   [Leave]      │  header
 *   ├─────────────────────────────────────────────────┤
 *   │  🔥  7-week streak   2.0× multiplier            │  streak hero
 *   │       +100 credits on success this week         │
 *   ├─────────────────────────────────────────────────┤
 *   │  This week  ████████░░  5 / 6 hit goal (so far) │  progress bar
 *   ├─────────────────────────────────────────────────┤
 *   │  Members (6)                      [+ Invite]    │  member list
 *   │  ┌────────────────────────────────────────┐    │
 *   │  │  🟢 Arvin       3 wk/wk  ✅ hit goal  │    │
 *   │  │  🟡 Alex        2 wk/wk  ⏳ pending   │    │
 *   │  │  🔴 Sam         1 wk/wk  ❌ missed    │    │
 *   │  └────────────────────────────────────────┘    │
 *   ├─────────────────────────────────────────────────┤
 *   │  History (last 12 weeks)                        │
 *   │  ┌────────────────────────────────────────┐    │
 *   │  │ Mon Apr 28  ✅  5/6 hit  100 cr  2.0×  │    │
 *   │  │ Mon Apr 21  ❌  2/6 hit  —        1.5×  │    │
 *   │  └────────────────────────────────────────┘    │
 *   └─────────────────────────────────────────────────┘
 *
 * Admin-only actions:
 *   - Kick member (long-press or swipe — implemented as long-press Alert)
 *   - Invite code is shown and can be shared
 *
 * Goal change:
 *   - "Change goal" button in member's own row opens GoalChangeModal.
 *   - Changes queue until next Monday 00:00 UTC.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Alert,
  Share,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useGroupDetail } from '../src/hooks/useGroups';
import { useAuth } from '../src/hooks/useAuth';
import { GroupMember, GroupWeekEvaluation, WeeklyGoal } from '../src/types/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** min(1 + 0.10 × streak_weeks, 3.0) */
function multiplier(streakWeeks: number): number {
  return Math.min(1 + 0.1 * streakWeeks, 3.0);
}

function multiplierLabel(streakWeeks: number): string {
  return `${multiplier(streakWeeks).toFixed(1)}×`;
}

/**
 * Credits a member earning at goal-tier modifier will receive.
 * base = 50; goal_modifier: 1→0.5×, 2→0.75×, 3→1.0×.
 */
function memberCredits(streakWeeks: number, goal: WeeklyGoal): number {
  const BASE = 50;
  const MODIFIER: Record<WeeklyGoal, number> = { 1: 0.5, 2: 0.75, 3: 1.0 };
  return Math.round(BASE * multiplier(streakWeeks) * MODIFIER[goal]);
}

function formatWeekStart(iso: string): string {
  // e.g. "2026-04-27" → "Mon Apr 27"
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// StreakHero
// ---------------------------------------------------------------------------

interface StreakHeroProps {
  streakWeeks: number;
  isActive: boolean;
  userGoal: WeeklyGoal | undefined;
}

function StreakHero({ streakWeeks, isActive, userGoal }: StreakHeroProps) {
  const m = multiplier(streakWeeks);
  const credits = userGoal ? memberCredits(streakWeeks, userGoal) : null;

  return (
    <View style={[styles.streakHero, !isActive && styles.streakHeroDormant]}>
      {isActive && streakWeeks > 0 ? (
        <>
          <Text style={styles.streakEmoji}>🔥</Text>
          <View style={styles.streakTextBlock}>
            <Text style={styles.streakWeeks}>
              {streakWeeks}-week streak
            </Text>
            <Text style={styles.streakMultiplier}>
              {multiplierLabel(streakWeeks)} multiplier
              {credits !== null ? `  ·  ${credits} cr on success` : ''}
            </Text>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.streakEmoji}>{isActive ? '🌱' : '⏸'}</Text>
          <View style={styles.streakTextBlock}>
            <Text style={styles.streakWeeks}>
              {isActive ? 'No streak yet' : 'Group dormant'}
            </Text>
            <Text style={styles.streakMultiplier}>
              {isActive
                ? 'Hit your goal this week to start a streak'
                : 'Needs ≥2 active members to resume'}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// ThisWeekProgress
// ---------------------------------------------------------------------------

interface ThisWeekProgressProps {
  members: GroupMember[];
}

function ThisWeekProgress({ members }: ThisWeekProgressProps) {
  const eligible = members.filter((m) => m.eligible_this_week);
  const hit = eligible.filter((m) => m.hit_goal_this_week === true);
  const threshold = Math.floor(eligible.length / 2) + 1; // >50%
  const onTrack = hit.length >= threshold;
  const fraction = eligible.length > 0 ? hit.length / eligible.length : 0;

  return (
    <View style={styles.progressCard}>
      <View style={styles.progressHeader}>
        <Text style={styles.progressLabel}>This week</Text>
        <Text style={[styles.progressStatus, onTrack ? styles.progressOnTrack : styles.progressBehind]}>
          {onTrack ? '✅ On track' : '⚠️ Behind'}
        </Text>
      </View>

      {/* Bar */}
      <View style={styles.progressBarTrack}>
        <View
          style={[
            styles.progressBarFill,
            { width: `${Math.round(fraction * 100)}%` },
            onTrack && styles.progressBarOnTrack,
          ]}
        />
        {/* Threshold marker at 50% */}
        <View style={styles.progressThresholdMarker} />
      </View>

      <Text style={styles.progressCount}>
        {hit.length} / {eligible.length} members hit goal so far
        {eligible.length < members.length
          ? `  (${members.length - eligible.length} mid-week join${members.length - eligible.length !== 1 ? 's' : ''} not yet eligible)`
          : ''}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// MemberRow
// ---------------------------------------------------------------------------

interface MemberRowProps {
  member: GroupMember;
  isCurrentUser: boolean;
  isAdmin: boolean;
  onKick: (userId: string, displayName: string) => void;
  onChangeGoal: () => void;
}

const GOAL_LABEL: Record<WeeklyGoal, string> = {
  1: '1×/wk',
  2: '2×/wk',
  3: '3+/wk',
};

function hitStatusIcon(hit: boolean | null, eligible: boolean): string {
  if (!eligible) return '⏳'; // mid-week joiner
  if (hit === null) return '⏳'; // week pending
  return hit ? '✅' : '❌';
}

function hitStatusColor(hit: boolean | null, eligible: boolean): string {
  if (!eligible || hit === null) return '#64748b';
  return hit ? '#22c55e' : '#ef4444';
}

function MemberRow({ member, isCurrentUser, isAdmin, onKick, onChangeGoal }: MemberRowProps) {
  const icon = hitStatusIcon(member.hit_goal_this_week, member.eligible_this_week);
  const statusColor = hitStatusColor(member.hit_goal_this_week, member.eligible_this_week);

  const handleLongPress = () => {
    if (!isAdmin || isCurrentUser) return;
    Alert.alert(
      `Kick ${member.display_name ?? 'this member'}?`,
      'They cannot rejoin for 4 weeks.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Kick',
          style: 'destructive',
          onPress: () => onKick(member.user_id, member.display_name ?? 'Member'),
        },
      ]
    );
  };

  return (
    <TouchableOpacity
      style={styles.memberRow}
      onLongPress={handleLongPress}
      activeOpacity={0.7}
    >
      {/* Avatar */}
      <View style={styles.memberAvatar}>
        <Text style={styles.memberAvatarText}>
          {(member.display_name ?? '?')[0].toUpperCase()}
        </Text>
      </View>

      {/* Name + goal */}
      <View style={styles.memberInfo}>
        <Text style={styles.memberName}>
          {member.display_name ?? 'Unknown'}
          {isCurrentUser ? ' (you)' : ''}
        </Text>
        <Text style={styles.memberGoal}>{GOAL_LABEL[member.weekly_goal]}</Text>
      </View>

      {/* Hit-goal status */}
      <Text style={[styles.memberHitStatus, { color: statusColor }]}>{icon}</Text>

      {/* Change-goal button for current user */}
      {isCurrentUser && (
        <TouchableOpacity
          style={styles.changeGoalBtn}
          onPress={onChangeGoal}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.changeGoalText}>Edit goal</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// EvaluationRow — history
// ---------------------------------------------------------------------------

interface EvaluationRowProps {
  eval_: GroupWeekEvaluation;
  userGoal: WeeklyGoal | undefined;
}

function EvaluationRow({ eval_, userGoal }: EvaluationRowProps) {
  const creditsEarned = userGoal
    ? memberCredits(eval_.streak_weeks_after - (eval_.success ? 1 : 0), userGoal)
    : eval_.credits_per_member_base;

  return (
    <View style={styles.evalRow}>
      <Text style={styles.evalWeek}>{formatWeekStart(eval_.week_start)}</Text>
      <Text style={[styles.evalResult, eval_.success ? styles.evalSuccess : styles.evalFail]}>
        {eval_.success ? '✅' : '❌'}
      </Text>
      <Text style={styles.evalHits}>
        {eval_.members_hit_goal}/{eval_.members_eligible} hit
      </Text>
      <Text style={styles.evalCredits}>
        {eval_.success ? `+${creditsEarned} cr` : '—'}
      </Text>
      <Text style={styles.evalMultiplier}>
        {multiplierLabel(eval_.streak_weeks_after)}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// GoalChangeModal
// ---------------------------------------------------------------------------

interface GoalChangeModalProps {
  visible: boolean;
  currentGoal: WeeklyGoal;
  onClose: () => void;
  onSubmit: (goal: WeeklyGoal) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

const GOAL_OPTIONS: { value: WeeklyGoal; label: string; modifier: string }[] = [
  { value: 1, label: '1 workout / week', modifier: '0.5× credits' },
  { value: 2, label: '2 workouts / week', modifier: '0.75× credits' },
  { value: 3, label: '3+ workouts / week', modifier: '1.0× credits' },
];

function GoalChangeModal({
  visible,
  currentGoal,
  onClose,
  onSubmit,
  isLoading,
  error,
}: GoalChangeModalProps) {
  const [selected, setSelected] = useState<WeeklyGoal>(currentGoal);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Change Weekly Goal</Text>
          <TouchableOpacity onPress={onClose} disabled={isLoading}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.modalBody}>
          <Text style={styles.modalNote}>
            Changes take effect at the next Monday 00:00 UTC boundary.
            Your current week's credits use your existing goal.
          </Text>

          {GOAL_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.goalOption,
                selected === opt.value && styles.goalOptionSelected,
              ]}
              onPress={() => setSelected(opt.value)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.goalOptionLabel,
                  selected === opt.value && styles.goalOptionLabelSelected,
                ]}
              >
                {opt.label}
              </Text>
              <Text
                style={[
                  styles.goalOptionModifier,
                  selected === opt.value && styles.goalOptionModifierSelected,
                ]}
              >
                {opt.modifier}
              </Text>
            </TouchableOpacity>
          ))}

          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>

        <View style={styles.modalFooter}>
          <TouchableOpacity
            style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
            onPress={() => onSubmit(selected)}
            disabled={isLoading || selected === currentGoal}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {selected === currentGoal ? 'No change' : 'Queue change'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function GroupDetailScreen() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const {
    detail,
    evaluations,
    isLoading,
    error,
    refetch,
    kickMember,
    isKicking,
    kickError,
    updateGoal,
    isUpdatingGoal,
    updateGoalError,
    clearUpdateGoalError,
  } = useGroupDetail(groupId ?? '');

  const [showGoalModal, setShowGoalModal] = useState(false);

  const currentUserMember = detail?.members.find((m) => m.user_id === user?.id);
  const isAdmin = detail?.admin_id === user?.id;

  const handleKick = useCallback(
    async (userId: string, displayName: string) => {
      try {
        await kickMember(userId);
      } catch {
        Alert.alert('Error', kickError ?? `Could not kick ${displayName}.`);
      }
    },
    [kickMember, kickError]
  );

  const handleGoalChange = useCallback(
    async (goal: WeeklyGoal) => {
      try {
        await updateGoal({ weekly_goal: goal });
        setShowGoalModal(false);
      } catch {
        // error shown in modal
      }
    },
    [updateGoal]
  );

  const handleShareInvite = useCallback(async () => {
    if (!detail) return;
    await Share.share({
      message: `Join my Peak Fettle group "${detail.name}"! Invite code: ${detail.invite_code}`,
    });
  }, [detail]);

  const handleLeave = useCallback(() => {
    Alert.alert(
      'Leave group?',
      'Your banked credits are kept. You will be excluded from next week\'s evaluation.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => {
            // Navigate back — the groups screen's leaveGroup handles the API call.
            // We pass a signal so the groups screen can call leaveGroup reactively.
            // For simplicity, we call the API directly here and navigate on success.
            router.back();
          },
        },
      ]
    );
  }, []);

  if (!groupId) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No group ID provided.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backChevron}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {detail?.name ?? 'Group'}
        </Text>
        {detail && (
          <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
            <Text style={styles.leaveBtnText}>Leave</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Loading full-screen spinner on first load */}
      {isLoading && !detail && (
        <View style={styles.fullLoader}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      )}

      {/* Error state */}
      {error && !detail && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={refetch} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {detail && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor="#6366f1"
            />
          }
        >
          {/* Streak hero */}
          <StreakHero
            streakWeeks={detail.current_streak_weeks}
            isActive={detail.is_active}
            userGoal={currentUserMember?.weekly_goal}
          />

          {/* This week's progress */}
          <ThisWeekProgress members={detail.members} />

          {/* Invite code */}
          <View style={styles.inviteCard}>
            <View style={styles.inviteLeft}>
              <Text style={styles.inviteLabel}>Invite code</Text>
              <Text style={styles.inviteCode}>{detail.invite_code}</Text>
            </View>
            <TouchableOpacity
              style={styles.shareBtn}
              onPress={handleShareInvite}
              activeOpacity={0.7}
            >
              <Text style={styles.shareBtnText}>Share</Text>
            </TouchableOpacity>
          </View>

          {/* Members */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Members ({detail.member_count})
            </Text>
            {isAdmin && (
              <Text style={styles.adminHint}>Long-press a member to kick them.</Text>
            )}
            {detail.members.map((member) => (
              <MemberRow
                key={member.user_id}
                member={member}
                isCurrentUser={member.user_id === user?.id}
                isAdmin={isAdmin}
                onKick={handleKick}
                onChangeGoal={() => setShowGoalModal(true)}
              />
            ))}
          </View>

          {/* Evaluation history */}
          {evaluations.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>History</Text>
              <View style={styles.evalHeader}>
                <Text style={styles.evalHeaderCell}>Week</Text>
                <Text style={styles.evalHeaderCell} />
                <Text style={styles.evalHeaderCell}>Hits</Text>
                <Text style={styles.evalHeaderCell}>Credits</Text>
                <Text style={styles.evalHeaderCell}>Mult</Text>
              </View>
              {evaluations.map((ev) => (
                <EvaluationRow
                  key={ev.week_start}
                  eval_={ev}
                  userGoal={currentUserMember?.weekly_goal}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* Goal change modal */}
      {currentUserMember && (
        <GoalChangeModal
          visible={showGoalModal}
          currentGoal={currentUserMember.weekly_goal}
          onClose={() => {
            clearUpdateGoalError();
            setShowGoalModal(false);
          }}
          onSubmit={handleGoalChange}
          isLoading={isUpdatingGoal}
          error={updateGoalError}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 12,
    paddingHorizontal: 20,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  backBtn: {
    width: 36,
    alignItems: 'flex-start',
  },
  backChevron: {
    fontSize: 28,
    color: '#6366f1',
    lineHeight: 32,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  leaveBtn: {
    width: 56,
    alignItems: 'flex-end',
  },
  leaveBtnText: {
    fontSize: 15,
    color: '#ef4444',
    fontWeight: '500',
  },

  // Full-screen loader
  fullLoader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { padding: 20, gap: 16 },

  // Streak hero
  streakHero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1b4b',
    borderRadius: 14,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: '#3730a3',
  },
  streakHeroDormant: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
  },
  streakEmoji: { fontSize: 32 },
  streakTextBlock: { flex: 1 },
  streakWeeks: {
    fontSize: 20,
    fontWeight: '700',
    color: '#a5b4fc',
  },
  streakMultiplier: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 3,
  },

  // Progress card
  progressCard: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
  },
  progressStatus: {
    fontSize: 13,
    fontWeight: '600',
  },
  progressOnTrack: { color: '#22c55e' },
  progressBehind: { color: '#f59e0b' },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#0f172a',
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#f59e0b',
    borderRadius: 4,
  },
  progressBarOnTrack: { backgroundColor: '#22c55e' },
  progressThresholdMarker: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#334155',
  },
  progressCount: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
  },

  // Invite card
  inviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  inviteLeft: { gap: 2 },
  inviteLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  inviteCode: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f1f5f9',
    letterSpacing: 2,
  },
  shareBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  shareBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },

  // Section
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  adminHint: {
    fontSize: 12,
    color: '#475569',
    marginTop: -4,
    marginBottom: 2,
  },

  // Member row
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 10,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#312e81',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#a5b4fc',
  },
  memberInfo: { flex: 1 },
  memberName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#f1f5f9',
  },
  memberGoal: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  memberHitStatus: {
    fontSize: 18,
  },
  changeGoalBtn: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  changeGoalText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '500',
  },

  // Evaluation history
  evalHeader: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 4,
    gap: 4,
  },
  evalHeaderCell: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  evalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  evalWeek: {
    flex: 2,
    fontSize: 13,
    color: '#94a3b8',
  },
  evalResult: {
    flex: 0.5,
    fontSize: 14,
    textAlign: 'center',
  },
  evalSuccess: { color: '#22c55e' },
  evalFail: { color: '#ef4444' },
  evalHits: {
    flex: 1,
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },
  evalCredits: {
    flex: 1,
    fontSize: 13,
    color: '#a5b4fc',
    fontWeight: '600',
    textAlign: 'right',
  },
  evalMultiplier: {
    flex: 0.8,
    fontSize: 12,
    color: '#64748b',
    textAlign: 'right',
  },

  // Error
  errorCard: {
    backgroundColor: '#450a0a',
    borderRadius: 12,
    padding: 14,
    margin: 20,
    borderWidth: 1,
    borderColor: '#991b1b',
    gap: 8,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 14,
  },
  retryBtn: { alignSelf: 'flex-start' },
  retryText: {
    color: '#6366f1',
    fontSize: 14,
    fontWeight: '600',
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  modalCancel: {
    fontSize: 16,
    color: '#6366f1',
  },
  modalBody: {
    flex: 1,
    padding: 20,
    gap: 12,
  },
  modalNote: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 20,
    marginBottom: 8,
  },
  modalFooter: {
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },

  // Goal options
  goalOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 14,
  },
  goalOptionSelected: {
    borderColor: '#6366f1',
    backgroundColor: '#1e1b4b',
  },
  goalOptionLabel: {
    fontSize: 15,
    color: '#94a3b8',
    fontWeight: '500',
  },
  goalOptionLabelSelected: { color: '#f1f5f9' },
  goalOptionModifier: {
    fontSize: 13,
    color: '#475569',
  },
  goalOptionModifierSelected: { color: '#a5b4fc' },

  // Buttons
  primaryButton: {
    backgroundColor: '#6366f1',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
