/**
 * Groups screen — lists the user's streak-credit groups, shows their credit
 * balance, and lets them create a new group or join one via invite code.
 *
 * Push screen (not a tab). Navigated to from the home tab's "Groups" row.
 * Navigate to a group's detail screen via router.push('/group-detail?id=<id>').
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────┐
 *   │  ← Groups                                       │  custom header
 *   ├─────────────────────────────────────────────────┤
 *   │  💎 Credit Balance                              │  balance banner
 *   │      1,240 credits  (4,800 earned all-time)     │
 *   ├─────────────────────────────────────────────────┤
 *   │  Your Groups                                    │
 *   │  ┌──────────────────────────────────────────┐  │
 *   │  │ 🔥 7-week streak   [Group name]           │  │  GroupRow
 *   │  │    4 / 6 members hit goal last week  ✅   │  │
 *   │  └──────────────────────────────────────────┘  │
 *   │  ... more groups                                │
 *   ├─────────────────────────────────────────────────┤
 *   │  [ + Create Group ]   [ Join via invite ]       │  CTAs (≤2 groups)
 *   └─────────────────────────────────────────────────┘
 *
 * Constraints displayed in Create/Join modals:
 *   - Max 3 concurrent groups (spec §8)
 *   - Account gate: 30 days + ≥10 logged sessions (enforced server-side)
 *   - Groups: 2–12 members
 *
 * P2-005: Root View wrapped in ScreenLayout for consistent safe area + spacing.
 * P2-006: TextInput in CreateGroupModal and JoinGroupModal replaced with PFInput.
 * P2-007: Reanimated spring slide-up entry on CreateGroupModal and JoinGroupModal.
 */

import React, { useState, useCallback, useEffect } from 'react';
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useGroups } from '../src/hooks/useGroups';
import { Group, WeeklyGoal, UpdateMemberGoalPayload } from '../src/types/api';
import { useTheme } from '../src/theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../src/theme/tokens';
import { ScreenLayout } from '../src/components/ui';
import { PFInput } from '../src/components/ui';
import { useReduceMotion } from '../src/hooks/useReduceMotion';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function multiplierLabel(streakWeeks: number): string {
  const m = Math.min(1 + 0.1 * streakWeeks, 3.0);
  return `${m.toFixed(1)}×`;
}

function streakLabel(weeks: number): string {
  if (weeks === 0) return 'No streak';
  if (weeks === 1) return '1 week';
  return `${weeks} weeks`;
}

// ---------------------------------------------------------------------------
// BalanceBanner
// ---------------------------------------------------------------------------

interface BalanceBannerProps {
  balance: number;
  totalEarned: number;
}

function BalanceBanner({ balance, totalEarned }: BalanceBannerProps) {
  const { theme } = useTheme();
  return (
    <View style={[
      styles.balanceBanner,
      { backgroundColor: theme.colors.accentSecondary, borderColor: theme.colors.accentDefault + '60' },
    ]}>
      <Text style={styles.balanceGem}>💎</Text>
      <View style={styles.balanceTextBlock}>
        <Text style={[styles.balanceAmount, { color: theme.colors.accentHover }]}>
          {balance.toLocaleString()} credits
        </Text>
        <Text style={[styles.balanceSubtitle, { color: theme.colors.textTertiary }]}>
          {totalEarned.toLocaleString()} earned all-time
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// GroupRow
// ---------------------------------------------------------------------------

interface GroupRowProps {
  group: Group;
  onPress: () => void;
}

function GroupRow({ group, onPress }: GroupRowProps) {
  const { theme } = useTheme();
  const streakActive = group.current_streak_weeks > 0;

  return (
    <TouchableOpacity
      style={[
        styles.groupRow,
        { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      activeOpacity={0.7}
    >
      <View style={styles.groupRowLeft}>
        <View style={styles.groupRowHeader}>
          {streakActive && <Text style={styles.fireEmoji}>🔥</Text>}
          <Text style={[styles.groupName, { color: theme.colors.textPrimary }]} numberOfLines={1}>
            {group.name}
          </Text>
        </View>
        <Text style={[styles.groupMeta, { color: theme.colors.textSecondary }]}>
          {group.active_count} member{group.active_count !== 1 ? 's' : ''}
          {' · '}
          {streakLabel(group.current_streak_weeks)}
          {streakActive
            ? ` · ${multiplierLabel(group.current_streak_weeks)} multiplier`
            : ''}
        </Text>
        {group.active_count < 2 && (
          <Text style={[styles.dormantBadge, { color: theme.colors.statusWarning }]}>⏸ Dormant (needs ≥2 members)</Text>
        )}
      </View>
      <Text style={[styles.chevron, { color: theme.colors.textTertiary }]}>›</Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// GoalPicker — reusable inside create / join modals
// ---------------------------------------------------------------------------

interface GoalPickerProps {
  value: WeeklyGoal;
  onChange: (goal: WeeklyGoal) => void;
}

const GOAL_OPTIONS: { value: WeeklyGoal; label: string; modifier: string }[] = [
  { value: 1, label: '1 workout / week', modifier: '0.5× credits' },
  { value: 2, label: '2 workouts / week', modifier: '0.75× credits' },
  { value: 3, label: '3+ workouts / week', modifier: '1.0× credits' },
];

function GoalPicker({ value, onChange }: GoalPickerProps) {
  const { theme } = useTheme();
  return (
    <View style={styles.goalPicker}>
      <Text style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>Your weekly goal</Text>
      {GOAL_OPTIONS.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          style={[
            styles.goalOption,
            { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
            value === opt.value && {
              borderColor: theme.colors.accentDefault,
              backgroundColor: theme.colors.accentSecondary,
            },
          ]}
          onPress={() => onChange(opt.value)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={opt.label}
        >
          <Text
            style={[
              styles.goalOptionLabel,
              { color: theme.colors.textSecondary },
              value === opt.value && { color: theme.colors.textPrimary },
            ]}
          >
            {opt.label}
          </Text>
          <Text
            style={[
              styles.goalOptionModifier,
              { color: theme.colors.textTertiary },
              value === opt.value && { color: theme.colors.accentHover },
            ]}
          >
            {opt.modifier}
          </Text>
        </TouchableOpacity>
      ))}
      <Text style={[styles.goalNote, { color: theme.colors.textTertiary }]}>
        A harder goal earns more credits. You can change this once per week.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// CreateGroupModal
// P2-006: TextInput → PFInput
// P2-007: Reanimated spring slide-up on open
// ---------------------------------------------------------------------------

interface CreateGroupModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (name: string, goal: WeeklyGoal) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

function CreateGroupModal({
  visible,
  onClose,
  onSubmit,
  isLoading,
  error,
}: CreateGroupModalProps) {
  const { theme } = useTheme();
  const reduceMotion = useReduceMotion();
  const [name, setName] = useState('');
  const [goal, setGoal] = useState<WeeklyGoal>(3);

  // P2-007: spring slide-up animation
  const translateY = useSharedValue(400);

  useEffect(() => {
    if (visible) {
      translateY.value = 400;
      translateY.value = reduceMotion
        ? 0
        : withSpring(0, { damping: 22, stiffness: 220 });
    }
  }, [visible, reduceMotion]);

  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Group name required', 'Please enter a name for your group.');
      return;
    }
    if (trimmed.length > 40) {
      Alert.alert('Name too long', 'Group name must be 40 characters or less.');
      return;
    }
    await onSubmit(trimmed, goal);
  };

  return (
    <Modal visible={visible} animationType="none" presentationStyle="pageSheet">
      {/* P2-007: Animated.View wraps the entire sheet for spring entry */}
      <Animated.View style={[{ flex: 1 }, sheetAnimStyle]}>
       <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.colors.bgPrimary }]} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalHandle, { backgroundColor: theme.colors.borderDefault }]} />
          <View style={[styles.modalHeader, { borderBottomColor: theme.colors.bgSecondary }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>Create a Group</Text>
            <TouchableOpacity onPress={onClose} disabled={isLoading} accessibilityRole="button" accessibilityLabel="Cancel">
              <Text style={[styles.modalCancel, { color: theme.colors.accentDefault }]}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            {/* P2-006: PFInput replaces raw TextInput */}
            <PFInput
              label="Group name"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Morning Lifters"
              maxLength={40}
              autoFocus
            />

            <GoalPicker value={goal} onChange={setGoal} />

            <Text style={[styles.sectionNote, { color: theme.colors.textTertiary }]}>
              After creating, share your invite code with up to 11 others.
              Groups need ≥2 members to start earning credits.
            </Text>

            {error && <Text style={[styles.errorText, { color: theme.colors.statusError }]}>{error}</Text>}
          </ScrollView>

          <View style={[styles.modalFooter, { borderTopColor: theme.colors.bgSecondary }]}>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: theme.colors.accentDefault },
                isLoading && styles.buttonDisabled,
              ]}
              accessibilityRole="button"
              onPress={handleSubmit}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color={theme.components.buttonPrimaryText} />
              ) : (
                <Text style={[styles.primaryButtonText, { color: theme.components.buttonPrimaryText }]}>Create Group</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
       </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// JoinGroupModal
// P2-006: TextInput → PFInput
// P2-007: Reanimated spring slide-up on open
// ---------------------------------------------------------------------------

interface JoinGroupModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (inviteCode: string, goal: WeeklyGoal) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

function JoinGroupModal({
  visible,
  onClose,
  onSubmit,
  isLoading,
  error,
}: JoinGroupModalProps) {
  const { theme } = useTheme();
  const reduceMotion = useReduceMotion();
  const [inviteCode, setInviteCode] = useState('');
  const [goal, setGoal] = useState<WeeklyGoal>(3);

  // P2-007: spring slide-up animation
  const translateY = useSharedValue(400);

  useEffect(() => {
    if (visible) {
      translateY.value = 400;
      translateY.value = reduceMotion
        ? 0
        : withSpring(0, { damping: 22, stiffness: 220 });
    }
  }, [visible, reduceMotion]);

  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const handleSubmit = async () => {
    const trimmed = inviteCode.trim().toUpperCase();
    if (!trimmed) {
      Alert.alert('Invite code required', 'Please paste the invite code.');
      return;
    }
    await onSubmit(trimmed, goal);
  };

  return (
    <Modal visible={visible} animationType="none" presentationStyle="pageSheet">
      {/* P2-007: Animated.View wraps the entire sheet for spring entry */}
      <Animated.View style={[{ flex: 1 }, sheetAnimStyle]}>
       <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.colors.bgPrimary }]} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalHandle, { backgroundColor: theme.colors.borderDefault }]} />
          <View style={[styles.modalHeader, { borderBottomColor: theme.colors.bgSecondary }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>Join a Group</Text>
            <TouchableOpacity onPress={onClose} disabled={isLoading} accessibilityRole="button" accessibilityLabel="Cancel">
              <Text style={[styles.modalCancel, { color: theme.colors.accentDefault }]}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            {/* P2-006: PFInput replaces raw TextInput */}
            <PFInput
              label="Invite code"
              value={inviteCode}
              onChangeText={setInviteCode}
              placeholder="Paste code here"
              autoCapitalize="characters"
              autoFocus
            />

            <GoalPicker value={goal} onChange={setGoal} />

            <Text style={[styles.sectionNote, { color: theme.colors.textTertiary }]}>
              If you join mid-week, your first counted week starts next Monday.
              Your first 2 weeks earn credits at 1.0× regardless of the group's
              current streak.
            </Text>

            {error && <Text style={[styles.errorText, { color: theme.colors.statusError }]}>{error}</Text>}
          </ScrollView>

          <View style={[styles.modalFooter, { borderTopColor: theme.colors.bgSecondary }]}>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: theme.colors.accentDefault },
                isLoading && styles.buttonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={isLoading}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Join group"
            >
              {isLoading ? (
                <ActivityIndicator color={theme.components.buttonPrimaryText} />
              ) : (
                <Text style={[styles.primaryButtonText, { color: theme.components.buttonPrimaryText }]}>Join Group</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
       </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Screen
// P2-005: Wrapped with ScreenLayout (noPadding=false — groups uses 20pt padding
//          on the scroll content, which ScreenLayout provides via horizontalPadding)
// ---------------------------------------------------------------------------

export default function GroupsScreen() {
  const { theme } = useTheme();
  const {
    groups,
    creditBalance,
    isLoading,
    error,
    refetch,
    createGroup,
    isCreating,
    createError,
    clearCreateError,
    joinGroup,
    isJoining,
    joinError,
    clearJoinError,
  } = useGroups();

  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  const atGroupCap = groups.length >= 3;

  const handleGroupPress = useCallback((group: Group) => {
    router.push(`/group-detail?id=${group.id}`);
  }, []);

  const handleCreateSubmit = useCallback(
    async (name: string, _goal: WeeklyGoal) => {
      try {
        // sizeCap defaults to the hard cap (12). The weekly workout goal is
        // a separate per-user setting managed via PUT /goals/weekly.
        await createGroup({ name, sizeCap: 12 });
        setShowCreate(false);
      } catch {
        // error shown inside modal
      }
    },
    [createGroup]
  );

  const handleJoinSubmit = useCallback(
    async (inviteCode: string, _goal: WeeklyGoal) => {
      try {
        // Server accepts { token: uuid } — the invite code is the group's
        // invite_token UUID. Goal is a separate per-user setting.
        await joinGroup({ token: inviteCode });
        setShowJoin(false);
      } catch {
        // error shown inside modal
      }
    },
    [joinGroup]
  );

  return (
    // P2-005: ScreenLayout handles SafeAreaView + bgPrimary background.
    // horizontalPadding={false} because the custom header + scrollContent
    // manage their own horizontal padding internally.
    <ScreenLayout horizontalPadding={false}>
      {/* Custom header — back chevron + title */}
      <View style={[
        styles.header,
        { backgroundColor: theme.colors.bgPrimary, borderBottomColor: theme.colors.bgSecondary },
      ]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={[styles.backChevron, { color: theme.colors.accentDefault }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>Groups</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            tintColor={theme.colors.accentDefault}
          />
        }
      >
        {/* Credit balance */}
        {creditBalance && (
          <BalanceBanner
            balance={creditBalance.balance}
            totalEarned={creditBalance.total_earned}
          />
        )}

        {/* Error state */}
        {error && (
          <View style={[
            styles.errorCard,
            { backgroundColor: theme.colors.statusError + '18', borderColor: theme.colors.statusError + '60' },
          ]}>
            <Text style={[styles.errorText, { color: theme.colors.statusError }]}>{error}</Text>
            <TouchableOpacity onPress={refetch} style={styles.retryBtn} accessibilityRole="button" accessibilityLabel="Retry">
              <Text style={[styles.retryText, { color: theme.colors.accentDefault }]}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Loading skeleton */}
        {isLoading && groups.length === 0 && (
          <View style={styles.skeletonList}>
            {[0, 1].map((i) => (
              <View key={i} style={[styles.skeletonRow, { backgroundColor: theme.colors.bgSecondary }]} />
            ))}
          </View>
        )}

        {/* Groups list */}
        {groups.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textTertiary }]}>Your Groups</Text>
            {groups.map((g) => (
              <GroupRow key={g.id} group={g} onPress={() => handleGroupPress(g)} />
            ))}
          </View>
        )}

        {/* Empty state */}
        {!isLoading && groups.length === 0 && !error && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>👥</Text>
            <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>No groups yet</Text>
            <Text style={[styles.emptySubtitle, { color: theme.colors.textTertiary }]}>
              Create a group or join one with an invite code to start earning
              streak credits with friends.
            </Text>
          </View>
        )}

        {/* CTAs */}
        <View style={styles.ctaRow}>
          <TouchableOpacity
            style={[
              styles.ctaButton,
              { backgroundColor: theme.colors.accentDefault },
              atGroupCap && { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault, borderWidth: 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Create a group"
            onPress={() => {
              if (atGroupCap) {
                Alert.alert(
                  'Group limit reached',
                  'You can be in up to 3 groups at once. Leave a group to create or join another.'
                );
                return;
              }
              clearCreateError();
              setShowCreate(true);
            }}
            activeOpacity={0.8}
          >
            <Text style={[
              styles.ctaText,
              { color: theme.components.buttonPrimaryText },
              atGroupCap && { color: theme.colors.textTertiary },
            ]}>
              + Create Group
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.ctaButton,
              styles.ctaButtonSecondary,
              { borderColor: theme.colors.accentDefault },
              atGroupCap && { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Join a group"
            onPress={() => {
              if (atGroupCap) {
                Alert.alert(
                  'Group limit reached',
                  'You can be in up to 3 groups at once. Leave a group to create or join another.'
                );
                return;
              }
              clearJoinError();
              setShowJoin(true);
            }}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.ctaText,
                { color: theme.colors.accentDefault },
                atGroupCap && { color: theme.colors.textTertiary },
              ]}
            >
              Join via invite
            </Text>
          </TouchableOpacity>
        </View>

        {atGroupCap && (
          <Text style={[styles.capNote, { color: theme.colors.textTertiary }]}>
            You're in 3 groups (the maximum). Leave one to create or join another.
          </Text>
        )}
      </ScrollView>

      {/* Modals */}
      <CreateGroupModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreateSubmit}
        isLoading={isCreating}
        error={createError}
      />
      <JoinGroupModal
        visible={showJoin}
        onClose={() => setShowJoin(false)}
        onSubmit={handleJoinSubmit}
        isLoading={isJoining}
        error={joinError}
      />
    </ScreenLayout>
  );
}

// ---------------------------------------------------------------------------
// Styles — layout only, no color values
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 12,
    paddingHorizontal: spacing.s5,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36,
    alignItems: 'flex-start',
  },
  backChevron: {
    fontSize: fontSize.heading1,  // E-003: was 28
    lineHeight: 32,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.bodyMd,  // E-003: was 17
    fontWeight: fontWeight.semibold,  // E-003: was '600'
  },
  headerSpacer: { width: 36 },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { padding: 20, gap: 16, paddingBottom: 40 },

  // Balance banner
  balanceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    padding: 16,
    gap: 14,
    borderWidth: 1,
  },
  balanceGem: { fontSize: fontSize.heading1 },  // E-003: was 28
  balanceTextBlock: { flex: 1 },
  balanceAmount: {
    fontSize: fontSize.heading3,  // E-003: was 22
    fontWeight: fontWeight.bold,  // E-003: was '700'
  },
  balanceSubtitle: {
    fontSize: fontSize.bodySm,  // E-003: was 13
    marginTop: 2,
  },

  // Section
  section: { gap: 10 },
  sectionTitle: {
    fontSize: fontSize.bodySm,  // E-003: was 13
    fontWeight: fontWeight.semibold,  // E-003: was '600'
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },

  // Group row
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    padding: 14,
    borderWidth: 1,
  },
  groupRowLeft: { flex: 1 },
  groupRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  fireEmoji: { fontSize: fontSize.bodyMd },  // E-003: was 16
  groupName: {
    fontSize: fontSize.bodyMd,  // E-003: was 16
    fontWeight: fontWeight.semibold,  // E-003: was '600'
    flex: 1,
  },
  groupMeta: {
    fontSize: fontSize.bodySm,  // E-003: was 13
  },
  dormantBadge: {
    fontSize: fontSize.caption,  // E-003: was 12
    marginTop: 4,
  },
  chevron: {
    fontSize: fontSize.heading3,  // E-003: was 22
    marginLeft: 8,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  emptyEmoji: { fontSize: fontSize.display },  // E-003: was 44 (nearest token: display=40)
  emptyTitle: {
    fontSize: fontSize.bodyLg,  // E-003: was 18
    fontWeight: fontWeight.semibold,  // E-003: was '600'
  },
  emptySubtitle: {
    fontSize: fontSize.bodySm,  // E-003: was 14
    textAlign: 'center',
    maxWidth: 280,
  },

  // CTAs
  ctaRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  ctaButton: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  ctaButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  ctaText: {
    fontSize: fontSize.bodyMd,  // E-003: was 16
    fontWeight: fontWeight.semibold,  // E-003: was '600'
  },
  capNote: {
    fontSize: fontSize.caption,  // E-003: was 12
    textAlign: 'center',
    marginTop: 4,
  },

  // Error card
  errorCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  errorText: {
    fontSize: fontSize.bodySm,  // E-003: was 14
    flex: 1,
  },
  retryBtn: {
    alignSelf: 'flex-start',
  },
  retryText: {
    fontSize: fontSize.bodySm,  // E-003: was 14
    fontWeight: fontWeight.semibold,  // E-003: was '600'
  },

  // Skeleton
  skeletonList: { gap: 10 },
  skeletonRow: {
    height: 72,
    borderRadius: radius.md,
    opacity: 0.5,
  },

  // Modal shared layout
  modalContainer: {
    flex: 1,
  },
  // P2-007: drag handle visual cue at top of modal sheet
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
    fontSize: fontSize.bodyLg,  // E-003: was 18
    fontWeight: fontWeight.semibold,  // E-003: was '600'
  },
  modalCancel: {
    fontSize: fontSize.bodyMd,  // E-003: was 16
    fontWeight: fontWeight.medium,  // E-003: was '500'
  },
  modalBody: {
    flex: 1,
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s4,
  },
  modalFooter: {
    padding: spacing.s5,
    borderTopWidth: 1,
  },

  // Primary action button (modal footer)
  primaryButton: {
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonText: {
    fontSize: fontSize.bodyMd,  // E-003: was 16
    fontWeight: fontWeight.semibold,  // E-003: was '600'
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  // Goal picker (inside modals)
  goalPicker: {
    gap: 8,
    marginTop: spacing.s4,
  },
  goalOption: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    gap: 2,
  },
  goalOptionLabel: {
    fontSize: fontSize.bodyMd,  // E-003: was 15
    fontWeight: fontWeight.medium,  // E-003: was '500'
  },
  goalOptionModifier: {
    fontSize: fontSize.caption,  // E-003: was 12
  },
  goalNote: {
    fontSize: fontSize.caption,  // E-003: was 12
    lineHeight: 18,
    marginTop: 4,
  },

  // Shared label above inputs
  inputLabel: {
    fontSize: fontSize.bodySm,  // E-003: was 14
    fontWeight: fontWeight.medium,  // E-003: was '500'
    marginBottom: spacing.s2,
  },

  // Section note (helper text in modals)
  sectionNote: {
    fontSize: fontSize.bodySm,  // E-003: was 13
    lineHeight: 20,
    marginTop: spacing.s4,
  },
});
