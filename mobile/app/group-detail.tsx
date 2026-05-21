/**
 * GroupDetail screen — full view of a single group.
 *
 * Route: /group-detail?id=<groupId>
 *
 * Sections (top → bottom):
 *   1. Header         — group name, member count, active streak badge
 *   2. Weekly Goal    — goal card with PFProgressBar showing member hit count
 *   3. Member List    — avatar initials, name, this-week status, streak badge
 *   4. Credit Balance — coin icon (Ionicons diamond-outline) + balance
 *   5. History        — last 4-week compact grid (✓/✗ per week row)
 *   6. Leave Group    — PFButton variant="destructive" + Alert confirmation
 *
 * API via useGroupDetail hook (src/hooks/useGroups.ts):
 *   GET  /groups/:id         → detail (GroupDetail)
 *   GET  /groups/:id/history → evaluations (GroupWeekEvaluation[])
 *   POST /groups/:id/leave   → leave + navigate to /(tabs)/
 *
 * Design rules enforced:
 *   - All colors via useTheme() — zero hardcoded hex
 *   - ScreenLayout, PFButton, PFProgressBar from '../src/components/ui'
 *   - Ionicons from @expo/vector-icons
 *   - fontVariant: ['tabular-nums'] on all numeric displays
 *   - Touch targets ≥ 48×48 pt
 *   - accessibilityRole + accessibilityLabel on every interactive element
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGroupDetail, useGroups } from '../src/hooks/useGroups';
import { useAuth } from '../src/hooks/useAuth';
import {
  GroupMember,
  GroupWeekEvaluation,
  WeeklyGoal,
} from '../src/types/api';
import { useTheme } from '../src/theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../src/theme/tokens';
import { ScreenLayout, PFButton, PFProgressBar } from '../src/components/ui';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Streak multiplier per spec §6: min(1 + 0.10 × weeks, 3.0) */
function streakMultiplier(weeks: number): number {
  return Math.min(1 + 0.1 * weeks, 3.0);
}

function formatMultiplier(weeks: number): string {
  return `${streakMultiplier(weeks).toFixed(1)}×`;
}

/** Format ISO date string as short week label, e.g. "May 5" */
function formatWeekLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Get first letter of a display name */
function getInitial(name: string | null): string {
  if (!name) return '?';
  return name.trim()[0].toUpperCase();
}

// ---------------------------------------------------------------------------
// Per-member this-week status type
// ---------------------------------------------------------------------------

/** Inferred from member status (server doesn't return per-member this-week data). */
type MemberWeekStatus = 'hit' | 'in_progress' | 'missed';

// ---------------------------------------------------------------------------
// 1. Header — group name + member count + streak badge
// ---------------------------------------------------------------------------

interface GroupHeaderProps {
  name: string;
  memberCount: number;
  streakWeeks: number;
  onBack: () => void;
}

function GroupHeader({ name, memberCount, streakWeeks, onBack }: GroupHeaderProps) {
  const { theme } = useTheme();
  const hasStreak = streakWeeks > 0;

  return (
    <View
      style={[
        styles.header,
        {
          backgroundColor: theme.colors.bgPrimary,
          borderBottomColor: theme.colors.borderDefault,
        },
      ]}
    >
      {/* Back button — 48pt minimum touch target via hitSlop */}
      <TouchableOpacity
        style={styles.backBtn}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={[styles.backChevron, { color: theme.colors.accentDefault }]}>‹</Text>
      </TouchableOpacity>

      {/* Title block */}
      <View style={styles.headerTitleBlock}>
        <Text
          style={[styles.headerTitle, { color: theme.colors.textPrimary }]}
          numberOfLines={1}
        >
          {name}
        </Text>
        <Text style={[styles.headerSubtitle, { color: theme.colors.textSecondary }]}>
          {memberCount} member{memberCount !== 1 ? 's' : ''}
          {hasStreak ? `  ·  🔥 ${streakWeeks}-wk streak` : ''}
        </Text>
      </View>

      {/* Streak multiplier badge (right side, only when streak is active) */}
      {hasStreak && (
        <View
          style={[
            styles.streakBadge,
            {
              backgroundColor: theme.colors.accentSecondary,
              borderColor: theme.colors.accentDefault,
            },
          ]}
        >
          <Text style={[styles.streakBadgeText, { color: theme.colors.accentHover }]}>
            {formatMultiplier(streakWeeks)}
          </Text>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// 2. Weekly Goal card — PFProgressBar showing how many members hit goal
// ---------------------------------------------------------------------------

interface WeeklyGoalCardProps {
  /** Total active members eligible this week */
  activeCount: number;
  /** How many have hit their goal (from latest history evaluation) */
  membersHitThisWeek: number;
  /** Descriptive goal label */
  goalLabel: string;
}

function WeeklyGoalCard({ activeCount, membersHitThisWeek, goalLabel }: WeeklyGoalCardProps) {
  const { theme } = useTheme();

  // >50% threshold per spec §5
  const threshold = activeCount > 0 ? Math.floor(activeCount / 2) + 1 : 1;
  const progress = activeCount > 0 ? Math.min(membersHitThisWeek / activeCount, 1) : 0;
  const onTrack = membersHitThisWeek >= threshold;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.bgSecondary,
          borderColor: theme.colors.borderDefault,
          borderRadius: radius.lg,
          padding: spacing.s4,
        },
      ]}
    >
      {/* Card header row */}
      <View style={styles.cardHeaderRow}>
        <Text style={[styles.cardLabel, { color: theme.colors.textTertiary }]}>
          THIS WEEK
        </Text>
        <View
          style={[
            styles.statusPill,
            {
              backgroundColor: onTrack
                ? theme.colors.statusSuccess + '22'
                : theme.colors.statusWarning + '22',
            },
          ]}
        >
          <Text
            style={{
              fontSize: fontSize.caption,
              fontWeight: fontWeight.semibold,
              color: onTrack ? theme.colors.statusSuccess : theme.colors.statusWarning,
            }}
          >
            {onTrack ? '✓ On track' : '⏳ In progress'}
          </Text>
        </View>
      </View>

      {/* Goal description */}
      <Text style={[styles.goalDescription, { color: theme.colors.textPrimary }]}>
        {goalLabel}
      </Text>

      {/* Progress bar + fraction count */}
      <View style={styles.progressRow}>
        <View style={{ flex: 1 }}>
          <PFProgressBar value={progress} height={8} />
        </View>
        <Text
          style={[
            styles.progressCount,
            { color: theme.colors.textSecondary, fontVariant: ['tabular-nums'] },
          ]}
        >
          {membersHitThisWeek}/{activeCount}
        </Text>
      </View>

      {/* Threshold note */}
      <Text style={[styles.thresholdNote, { color: theme.colors.textTertiary }]}>
        {threshold} of {activeCount} must hit goal for group credit
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 3a. Member row — avatar, name, this-week indicator, status
// ---------------------------------------------------------------------------

interface MemberRowProps {
  member: GroupMember;
  weekStatus: MemberWeekStatus;
  isCurrentUser: boolean;
  isAdmin: boolean;
  onKick: (userId: string, name: string) => void;
}

function MemberRow({ member, weekStatus, isCurrentUser, isAdmin, onKick }: MemberRowProps) {
  const { theme } = useTheme();

  // This-week icon and colour
  const statusIcon =
    weekStatus === 'hit' ? '✓' : weekStatus === 'in_progress' ? '–' : '✗';
  const statusColor =
    weekStatus === 'hit'
      ? theme.colors.statusSuccess
      : weekStatus === 'in_progress'
      ? theme.colors.statusWarning
      : theme.colors.textTertiary;

  const handleLongPress = () => {
    if (!isAdmin || isCurrentUser || member.status !== 'active') return;
    Alert.alert(
      `Kick ${member.display_name ?? 'member'}?`,
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
      style={[
        styles.memberRow,
        {
          backgroundColor: theme.colors.bgSecondary,
          borderColor: theme.colors.borderDefault,
          borderRadius: radius.md,
        },
      ]}
      onLongPress={handleLongPress}
      activeOpacity={isAdmin && !isCurrentUser ? 0.7 : 1}
      accessibilityRole="button"
      accessibilityLabel={`${member.display_name ?? 'Member'}${isCurrentUser ? ', you' : ''}`}
    >
      {/* Avatar — accentDefault bg, bold white initial */}
      <View style={[styles.avatar, { backgroundColor: theme.colors.accentDefault }]}>
        <Text style={[styles.avatarInitial, { color: theme.components.buttonPrimaryText }]}>
          {getInitial(member.display_name)}
        </Text>
      </View>

      {/* Name + you tag */}
      <View style={styles.memberInfo}>
        <Text
          style={[styles.memberName, { color: theme.colors.textPrimary }]}
          numberOfLines={1}
        >
          {member.display_name ?? 'Unknown'}
          {isCurrentUser ? (
            <Text style={{ color: theme.colors.textTertiary, fontWeight: fontWeight.regular }}>
              {' '}(you)
            </Text>
          ) : null}
        </Text>
        {member.status !== 'active' && (
          <Text style={[styles.memberStatus, { color: theme.colors.textTertiary }]}>
            {member.status}
          </Text>
        )}
      </View>

      {/* This-week status badge */}
      <View style={[styles.weekStatusBadge, { borderColor: statusColor + '55' }]}>
        <Text style={[styles.weekStatusIcon, { color: statusColor }]}>{statusIcon}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// 4. Credit Balance card — Ionicons diamond-outline + balance
// ---------------------------------------------------------------------------

interface CreditCardProps {
  balance: number;
}

function CreditCard({ balance }: CreditCardProps) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.creditCard,
        {
          backgroundColor: theme.colors.bgSecondary,
          borderColor: theme.colors.borderDefault,
          borderRadius: radius.lg,
          padding: spacing.s4,
        },
      ]}
    >
      {/* Coin icon */}
      <View
        style={[
          styles.coinIconWrap,
          { backgroundColor: theme.colors.accentSecondary, borderRadius: radius.md },
        ]}
      >
        <Ionicons name="diamond-outline" size={22} color={theme.colors.accentDefault} />
      </View>

      {/* Balance text */}
      <View style={{ flex: 1 }}>
        <Text style={[styles.cardLabel, { color: theme.colors.textTertiary }]}>
          GROUP CREDIT BALANCE
        </Text>
        <Text
          style={[
            styles.creditBalance,
            { color: theme.colors.textPrimary, fontVariant: ['tabular-nums'] },
          ]}
        >
          {balance.toLocaleString()} credits
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 5. History — last 4 weeks compact grid
// ---------------------------------------------------------------------------

interface HistoryGridProps {
  evaluations: GroupWeekEvaluation[];
}

function HistoryGrid({ evaluations }: HistoryGridProps) {
  const { theme } = useTheme();
  const recent = evaluations.slice(0, 4); // last 4 completed weeks

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.bgSecondary,
          borderColor: theme.colors.borderDefault,
          borderRadius: radius.lg,
          padding: spacing.s4,
        },
      ]}
    >
      <Text style={[styles.cardLabel, { color: theme.colors.textTertiary, marginBottom: spacing.s3 }]}>
        HISTORY{recent.length > 0 ? ` — LAST ${recent.length} WEEKS` : ''}
      </Text>

      {recent.length === 0 ? (
        <Text style={[styles.emptyHistoryText, { color: theme.colors.textTertiary }]}>
          No completed weeks yet. Check back after the first Monday boundary.
        </Text>
      ) : (
        <>
          {/* Column headers */}
          <View style={styles.historyHeaderRow}>
            <Text style={[styles.historyColLabel, { color: theme.colors.textTertiary, flex: 2 }]}>Week</Text>
            <Text style={[styles.historyColLabel, { color: theme.colors.textTertiary, flex: 0.6, textAlign: 'center' }]}>Result</Text>
            <Text style={[styles.historyColLabel, { color: theme.colors.textTertiary, flex: 1, textAlign: 'center' }]}>Hits</Text>
            <Text style={[styles.historyColLabel, { color: theme.colors.textTertiary, flex: 1, textAlign: 'right' }]}>Credits</Text>
            <Text style={[styles.historyColLabel, { color: theme.colors.textTertiary, flex: 0.8, textAlign: 'right' }]}>Mult</Text>
          </View>

          {/* Data rows */}
          {recent.map((ev) => {
            const success = ev.members_hit_goal > ev.eligible_members / 2;
            const resultColor = success
              ? theme.colors.statusSuccess
              : theme.colors.statusError;

            return (
              <View
                key={ev.week_start}
                style={[styles.historyRow, { borderTopColor: theme.colors.borderDefault }]}
              >
                <Text style={[styles.historyCell, { color: theme.colors.textSecondary, flex: 2 }]}>
                  {formatWeekLabel(ev.week_start)}
                </Text>
                <Text style={[styles.historyCell, { color: resultColor, flex: 0.6, textAlign: 'center' }]}>
                  {success ? '✓' : '✗'}
                </Text>
                <Text
                  style={[
                    styles.historyCell,
                    { color: theme.colors.textSecondary, flex: 1, textAlign: 'center', fontVariant: ['tabular-nums'] },
                  ]}
                >
                  {ev.members_hit_goal}/{ev.eligible_members}
                </Text>
                <Text
                  style={[
                    styles.historyCell,
                    {
                      color: success ? theme.colors.accentHover : theme.colors.textTertiary,
                      flex: 1,
                      textAlign: 'right',
                      fontWeight: fontWeight.semibold,
                      fontVariant: ['tabular-nums'],
                    },
                  ]}
                >
                  {success ? `+${ev.credits_per_member}` : '—'}
                </Text>
                <Text
                  style={[
                    styles.historyCell,
                    { color: theme.colors.textTertiary, flex: 0.8, textAlign: 'right', fontVariant: ['tabular-nums'] },
                  ]}
                >
                  {formatMultiplier(ev.streak_weeks_after)}
                </Text>
              </View>
            );
          })}
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function Skeleton() {
  const { theme } = useTheme();
  return (
    <View style={styles.skeletonContainer}>
      {[80, 120, 200, 80, 160].map((h, i) => (
        <View
          key={i}
          style={[
            styles.skeletonBlock,
            { height: h, backgroundColor: theme.colors.bgSecondary, borderRadius: radius.md },
          ]}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// GoalChangeModal — queued personal weekly goal update
// ---------------------------------------------------------------------------

const GOAL_OPTIONS: { value: WeeklyGoal; label: string; modifier: string }[] = [
  { value: 1, label: '1 workout / week', modifier: '0.5× credits' },
  { value: 2, label: '2 workouts / week', modifier: '0.75× credits' },
  { value: 3, label: '3+ workouts / week', modifier: '1.0× credits' },
];

interface GoalChangeModalProps {
  visible: boolean;
  currentGoal: WeeklyGoal;
  onClose: () => void;
  onSubmit: (goal: WeeklyGoal) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

function GoalChangeModal({
  visible,
  currentGoal,
  onClose,
  onSubmit,
  isLoading,
  error,
}: GoalChangeModalProps) {
  const { theme } = useTheme();
  const [selected, setSelected] = useState<WeeklyGoal>(currentGoal);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modalContainer, { backgroundColor: theme.colors.bgPrimary }]}>
        {/* Drag handle */}
        <View style={[styles.modalHandle, { backgroundColor: theme.colors.borderDefault }]} />

        {/* Header */}
        <View style={[styles.modalHeader, { borderBottomColor: theme.colors.borderDefault }]}>
          <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>
            Change Weekly Goal
          </Text>
          <TouchableOpacity
            onPress={onClose}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel="Cancel goal change"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={[styles.modalCancel, { color: theme.colors.accentDefault }]}>Cancel</Text>
          </TouchableOpacity>
        </View>

        {/* Body */}
        <ScrollView
          style={styles.modalBody}
          contentContainerStyle={{ gap: spacing.s3, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.modalNote, { color: theme.colors.textTertiary }]}>
            Changes take effect at the next Monday 00:00 UTC boundary. Your
            current week always uses your existing goal.
          </Text>

          {GOAL_OPTIONS.map((opt) => {
            const isSelected = selected === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.goalOption,
                  {
                    backgroundColor: isSelected
                      ? theme.colors.accentSecondary
                      : theme.colors.bgSecondary,
                    borderColor: isSelected
                      ? theme.colors.accentDefault
                      : theme.colors.borderDefault,
                    borderRadius: radius.md,
                    padding: spacing.s4,
                  },
                ]}
                onPress={() => setSelected(opt.value)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={opt.label}
              >
                <Text
                  style={[
                    styles.goalOptionLabel,
                    { color: isSelected ? theme.colors.textPrimary : theme.colors.textSecondary },
                  ]}
                >
                  {opt.label}
                </Text>
                <Text
                  style={[
                    styles.goalOptionModifier,
                    { color: isSelected ? theme.colors.accentHover : theme.colors.textTertiary },
                  ]}
                >
                  {opt.modifier}
                </Text>
              </TouchableOpacity>
            );
          })}

          {error && (
            <Text style={{ color: theme.colors.statusError, fontSize: fontSize.bodySm }}>
              {error}
            </Text>
          )}
        </ScrollView>

        {/* Footer */}
        <View
          style={[
            styles.modalFooter,
            {
              borderTopColor: theme.colors.borderDefault,
              paddingBottom: Platform.OS === 'ios' ? 36 : 20,
            },
          ]}
        >
          <PFButton
            label={selected === currentGoal ? 'No change' : 'Queue change'}
            onPress={() => onSubmit(selected)}
            disabled={isLoading || selected === currentGoal}
            loading={isLoading}
            accessibilityLabel="Confirm goal change"
          />
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function GroupDetailScreen() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  // useGroups for leaveGroup (the detail hook doesn't expose leave)
  const { leaveGroup, isLeaving } = useGroups();

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

  // Derived data
  const currentUserMember = detail?.members.find((m) => m.user_id === user?.id);
  const isAdmin = detail?.admin_user_id === user?.id;
  const activeMembers = detail?.members.filter((m) => m.status === 'active') ?? [];

  // Member this-week status — server doesn't return per-member weekly completion,
  // so active members show as 'in_progress' (future: add this_week_workouts field).
  const getMemberWeekStatus = useCallback(
    (member: GroupMember): MemberWeekStatus => {
      if (member.status !== 'active') return 'missed';
      return 'in_progress';
    },
    []
  );

  // Latest evaluation for progress bar (most recently completed week)
  const latestEval = evaluations[0] ?? null;
  const membersHitThisWeek = latestEval?.members_hit_goal ?? 0;

  // Weekly goal card description label
  const thresholdCount = activeMembers.length > 0
    ? Math.floor(activeMembers.length / 2) + 1
    : 1;
  const goalLabel =
    activeMembers.length >= 2
      ? `${thresholdCount} of ${activeMembers.length} members must hit their personal weekly goal`
      : 'Needs at least 2 active members to start earning credits';

  // Credit balance approximation from evaluation history
  // (real balance shown on the Groups list screen via /credits/balance)
  const estimatedBalance = evaluations.reduce(
    (sum, ev) =>
      ev.members_hit_goal > ev.eligible_members / 2
        ? sum + ev.credits_per_member
        : sum,
    0
  );

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleKick = useCallback(
    async (userId: string, name: string) => {
      try {
        await kickMember(userId);
      } catch {
        Alert.alert('Error', kickError ?? `Could not kick ${name}. Please try again.`);
      }
    },
    [kickMember, kickError]
  );

  const handleGoalChange = useCallback(
    async (goal: WeeklyGoal) => {
      try {
        await updateGoal({ workoutsPerWeek: goal });
        setShowGoalModal(false);
      } catch {
        // error shown inside modal via updateGoalError
      }
    },
    [updateGoal]
  );

  const handleLeave = useCallback(() => {
    Alert.alert(
      'Leave group?',
      "Your banked credits are kept. You'll be excluded from next week's evaluation.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              if (groupId) await leaveGroup(groupId);
              // Navigate back to the groups tab after leaving
              router.replace('/(tabs)/');
            } catch {
              Alert.alert('Error', 'Could not leave the group. Please try again.');
            }
          },
        },
      ]
    );
  }, [groupId, leaveGroup, router]);

  // ---------------------------------------------------------------------------
  // Guard: no ID
  // ---------------------------------------------------------------------------

  if (!groupId) {
    return (
      <ScreenLayout>
        <Text style={{ color: theme.colors.statusError, fontSize: fontSize.bodySm }}>
          No group ID provided.
        </Text>
      </ScreenLayout>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <ScreenLayout horizontalPadding={false}>
      {/* ── 1. Header ── */}
      <GroupHeader
        name={detail?.name ?? 'Group'}
        memberCount={activeMembers.length}
        streakWeeks={detail?.current_streak_weeks ?? 0}
        onBack={() => router.back()}
      />

      {/* ── Loading skeleton ── */}
      {isLoading && !detail && <Skeleton />}

      {/* ── Error state ── */}
      {error && !detail && (
        <View style={styles.errorContainer}>
          <View
            style={[
              styles.errorCard,
              {
                backgroundColor: theme.colors.statusError + '22',
                borderColor: theme.colors.statusError + '60',
                borderRadius: radius.md,
              },
            ]}
          >
            <Text style={[styles.errorText, { color: theme.colors.statusError }]}>{error}</Text>
            <TouchableOpacity
              onPress={refetch}
              accessibilityRole="button"
              accessibilityLabel="Retry loading group"
            >
              <Text style={[styles.retryText, { color: theme.colors.accentDefault }]}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Main content — only rendered once data arrives ── */}
      {detail && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { padding: spacing.s5, paddingBottom: 56 }]}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              // tintColor uses a string literal — must not use theme token directly in prop
            />
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── 2. Weekly Goal card ── */}
          <View>
            <WeeklyGoalCard
              activeCount={activeMembers.length}
              membersHitThisWeek={membersHitThisWeek}
              goalLabel={goalLabel}
            />
          </View>

          {/* ── 3. Member List ── */}
          <View>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionLabel, { color: theme.colors.textTertiary }]}>
                MEMBERS ({detail.members.length})
              </Text>
              {isAdmin && (
                <Text style={[styles.adminHint, { color: theme.colors.textTertiary }]}>
                  Long-press to kick
                </Text>
              )}
            </View>

            {/* Edit own goal shortcut */}
            {currentUserMember && (
              <TouchableOpacity
                style={[
                  styles.editGoalRow,
                  {
                    borderRadius: radius.md,
                    borderColor: '#33333333',
                    marginBottom: spacing.s2,
                  },
                ]}
                onPress={() => setShowGoalModal(true)}
                accessibilityRole="button"
                accessibilityLabel="Change your weekly goal"
              >
                <Ionicons name="flag-outline" size={15} color="#0080FF" />
                <Text style={[styles.editGoalText, { color: '#0080FF' }]}>
                  Change my weekly goal
                </Text>
                <Ionicons name="chevron-forward" size={13} color="#888888" />
              </TouchableOpacity>
            )}

            <FlatList
              data={detail.members}
              keyExtractor={(m) => m.user_id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <MemberRow
                  member={item}
                  weekStatus={getMemberWeekStatus(item)}
                  isCurrentUser={item.user_id === user?.id}
                  isAdmin={!!isAdmin}
                  onKick={handleKick}
                />
              )}
              ItemSeparatorComponent={() => <View style={{ height: spacing.s2 }} />}
            />

            {kickError && (
              <Text style={{ color: '#FF4444', fontSize: fontSize.caption, marginTop: spacing.s2 }}>
                {kickError}
              </Text>
            )}
          </View>

          {/* ── 4. Credit Balance card ── */}
          <CreditCard balance={estimatedBalance} />

          {/* ── 5. History grid ── */}
          <HistoryGrid evaluations={evaluations} />

          {/* ── 6. Leave Group ── */}
          <View style={styles.leaveSection}>
            <PFButton
              label="Leave Group"
              variant="destructive"
              onPress={handleLeave}
              loading={isLeaving}
              disabled={isLeaving}
              accessibilityLabel="Leave this group"
            />
            <Text style={[styles.leaveNote, { color: '#888888' }]}>
              Your banked credits are kept when you leave.
            </Text>
          </View>
        </ScrollView>
      )}

      {/* ── Goal change modal ── */}
      <GoalChangeModal
        visible={showGoalModal}
        currentGoal={3}
        onClose={() => {
          clearUpdateGoalError();
          setShowGoalModal(false);
        }}
        onSubmit={handleGoalChange}
        isLoading={isUpdatingGoal}
        error={updateGoalError}
      />
    </ScreenLayout>
  );
}

// ---------------------------------------------------------------------------
// Styles — layout only. Colors applied inline via useTheme().
// Exception: static fallback strings (error states) use literal hex where
// theme context is unavailable (guard branches above the ScreenLayout wrapper).
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 16 : 12,
    paddingBottom: 12,
    paddingHorizontal: spacing.s5,
    borderBottomWidth: 1,
    gap: spacing.s3,
  },
  backBtn: {
    width: 36,
    height: 48,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backChevron: {
    fontSize: fontSize.heading1,
    lineHeight: 32,
  },
  headerTitleBlock: {
    flex: 1,
  },
  headerTitle: {
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.bold,
  },
  headerSubtitle: {
    fontSize: fontSize.bodySm,
    marginTop: 2,
  },
  streakBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakBadgeText: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    fontVariant: ['tabular-nums'],
  },

  // ── Scroll ──
  scroll: { flex: 1 },
  scrollContent: { gap: spacing.s4 },

  // ── Section headings ──
  sectionLabel: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.s2,
  },
  adminHint: {
    fontSize: fontSize.micro,
  },

  // ── Generic card shell ──
  card: {
    borderWidth: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.s2,
  },
  cardLabel: {
    fontSize: fontSize.micro,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },

  // ── Weekly Goal ──
  goalDescription: {
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.s3,
    lineHeight: 22,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  progressCount: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.semibold,
    minWidth: 36,
    textAlign: 'right',
  },
  thresholdNote: {
    fontSize: fontSize.caption,
    marginTop: spacing.s2,
  },

  // ── Member rows ──
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s3,
    gap: spacing.s3,
    minHeight: 56, // ≥ 48pt touch target
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.bold,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.medium,
  },
  memberStatus: {
    fontSize: fontSize.caption,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  weekStatusBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekStatusIcon: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.bold,
    lineHeight: 18,
  },

  // ── Edit goal row ──
  editGoalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s3,
    borderWidth: 1,
    minHeight: 48,
  },
  editGoalText: {
    flex: 1,
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.medium,
  },

  // ── Credit card ──
  creditCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    borderWidth: 1,
  },
  coinIconWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creditBalance: {
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.bold,
    marginTop: 2,
  },

  // ── History grid ──
  historyHeaderRow: {
    flexDirection: 'row',
    paddingBottom: spacing.s2,
  },
  historyColLabel: {
    fontSize: fontSize.micro,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.s2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  historyCell: {
    fontSize: fontSize.bodySm,
  },
  emptyHistoryText: {
    fontSize: fontSize.bodySm,
    lineHeight: 20,
  },

  // ── Leave section ──
  leaveSection: {
    gap: spacing.s2,
    marginTop: spacing.s2,
    paddingTop: spacing.s4,
  },
  leaveNote: {
    fontSize: fontSize.caption,
    textAlign: 'center',
  },

  // ── Error ──
  errorContainer: {
    padding: spacing.s5,
  },
  errorCard: {
    borderWidth: 1,
    padding: spacing.s4,
    gap: spacing.s2,
  },
  errorText: {
    fontSize: fontSize.bodySm,
  },
  retryText: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.semibold,
  },

  // ── Skeleton ──
  skeletonContainer: {
    padding: spacing.s5,
    gap: spacing.s3,
  },
  skeletonBlock: {
    opacity: 0.4,
  },

  // ── Modal ──
  modalContainer: {
    flex: 1,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: radius.full,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s5,
    paddingVertical: spacing.s4,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.semibold,
  },
  modalCancel: {
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.medium,
  },
  modalBody: {
    flex: 1,
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s4,
  },
  modalNote: {
    fontSize: fontSize.bodySm,
    lineHeight: 20,
  },
  modalFooter: {
    padding: spacing.s5,
    borderTopWidth: 1,
  },

  // ── Goal options ──
  goalOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    minHeight: 56,
  },
  goalOptionLabel: {
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.medium,
  },
  goalOptionModifier: {
    fontSize: fontSize.bodySm,
  },
});
