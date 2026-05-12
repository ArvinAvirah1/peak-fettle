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
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useGroups } from '../src/hooks/useGroups';
import { Group, WeeklyGoal } from '../src/types/api';

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
  return (
    <View style={styles.balanceBanner}>
      <Text style={styles.balanceGem}>💎</Text>
      <View style={styles.balanceTextBlock}>
        <Text style={styles.balanceAmount}>
          {balance.toLocaleString()} credits
        </Text>
        <Text style={styles.balanceSubtitle}>
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
  const streakActive = group.current_streak_weeks > 0;

  return (
    <TouchableOpacity style={styles.groupRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.groupRowLeft}>
        <View style={styles.groupRowHeader}>
          {streakActive && <Text style={styles.fireEmoji}>🔥</Text>}
          <Text style={styles.groupName} numberOfLines={1}>
            {group.name}
          </Text>
        </View>
        <Text style={styles.groupMeta}>
          {group.member_count} member{group.member_count !== 1 ? 's' : ''}
          {' · '}
          {streakLabel(group.current_streak_weeks)}
          {streakActive
            ? ` · ${multiplierLabel(group.current_streak_weeks)} multiplier`
            : ''}
        </Text>
        {!group.is_active && (
          <Text style={styles.dormantBadge}>⏸ Dormant (needs ≥2 members)</Text>
        )}
      </View>
      <Text style={styles.chevron}>›</Text>
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
  return (
    <View style={styles.goalPicker}>
      <Text style={styles.inputLabel}>Your weekly goal</Text>
      {GOAL_OPTIONS.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          style={[
            styles.goalOption,
            value === opt.value && styles.goalOptionSelected,
          ]}
          onPress={() => onChange(opt.value)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.goalOptionLabel,
              value === opt.value && styles.goalOptionLabelSelected,
            ]}
          >
            {opt.label}
          </Text>
          <Text
            style={[
              styles.goalOptionModifier,
              value === opt.value && styles.goalOptionModifierSelected,
            ]}
          >
            {opt.modifier}
          </Text>
        </TouchableOpacity>
      ))}
      <Text style={styles.goalNote}>
        A harder goal earns more credits. You can change this once per week.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// CreateGroupModal
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
  const [name, setName] = useState('');
  const [goal, setGoal] = useState<WeeklyGoal>(3);

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
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        style={styles.modalContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Create a Group</Text>
          <TouchableOpacity onPress={onClose} disabled={isLoading}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
          <Text style={styles.inputLabel}>Group name</Text>
          <TextInput
            style={styles.textInput}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Morning Lifters"
            placeholderTextColor="#64748b"
            maxLength={40}
            autoFocus
          />

          <GoalPicker value={goal} onChange={setGoal} />

          <Text style={styles.sectionNote}>
            After creating, share your invite code with up to 11 others.
            Groups need ≥2 members to start earning credits.
          </Text>

          {error && <Text style={styles.errorText}>{error}</Text>}
        </ScrollView>

        <View style={styles.modalFooter}>
          <TouchableOpacity
            style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Create Group</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// JoinGroupModal
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
  const [inviteCode, setInviteCode] = useState('');
  const [goal, setGoal] = useState<WeeklyGoal>(3);

  const handleSubmit = async () => {
    const trimmed = inviteCode.trim().toUpperCase();
    if (!trimmed) {
      Alert.alert('Invite code required', 'Please paste the invite code.');
      return;
    }
    await onSubmit(trimmed, goal);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        style={styles.modalContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Join a Group</Text>
          <TouchableOpacity onPress={onClose} disabled={isLoading}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
          <Text style={styles.inputLabel}>Invite code</Text>
          <TextInput
            style={styles.textInput}
            value={inviteCode}
            onChangeText={setInviteCode}
            placeholder="Paste code here"
            placeholderTextColor="#64748b"
            autoCapitalize="characters"
            autoFocus
          />

          <GoalPicker value={goal} onChange={setGoal} />

          <Text style={styles.sectionNote}>
            If you join mid-week, your first counted week starts next Monday.
            Your first 2 weeks earn credits at 1.0× regardless of the group's
            current streak.
          </Text>

          {error && <Text style={styles.errorText}>{error}</Text>}
        </ScrollView>

        <View style={styles.modalFooter}>
          <TouchableOpacity
            style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Join Group</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function GroupsScreen() {
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
    async (name: string, goal: WeeklyGoal) => {
      try {
        await createGroup({ name, weekly_goal: goal });
        setShowCreate(false);
      } catch {
        // error shown inside modal
      }
    },
    [createGroup]
  );

  const handleJoinSubmit = useCallback(
    async (inviteCode: string, goal: WeeklyGoal) => {
      try {
        await joinGroup({ invite_code: inviteCode, weekly_goal: goal });
        setShowJoin(false);
      } catch {
        // error shown inside modal
      }
    },
    [joinGroup]
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backChevron}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Groups</Text>
        <View style={styles.headerSpacer} />
      </View>

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
        {/* Credit balance */}
        {creditBalance && (
          <BalanceBanner
            balance={creditBalance.balance}
            totalEarned={creditBalance.total_earned}
          />
        )}

        {/* Error state */}
        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={refetch} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Loading skeleton */}
        {isLoading && groups.length === 0 && (
          <View style={styles.skeletonList}>
            {[0, 1].map((i) => (
              <View key={i} style={styles.skeletonRow} />
            ))}
          </View>
        )}

        {/* Groups list */}
        {groups.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Groups</Text>
            {groups.map((g) => (
              <GroupRow key={g.id} group={g} onPress={() => handleGroupPress(g)} />
            ))}
          </View>
        )}

        {/* Empty state */}
        {!isLoading && groups.length === 0 && !error && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>👥</Text>
            <Text style={styles.emptyTitle}>No groups yet</Text>
            <Text style={styles.emptySubtitle}>
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
              atGroupCap && styles.ctaButtonDisabled,
            ]}
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
            <Text style={[styles.ctaText, atGroupCap && styles.ctaTextDisabled]}>
              + Create Group
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.ctaButton,
              styles.ctaButtonSecondary,
              atGroupCap && styles.ctaButtonDisabled,
            ]}
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
                styles.ctaTextSecondary,
                atGroupCap && styles.ctaTextDisabled,
              ]}
            >
              Join via invite
            </Text>
          </TouchableOpacity>
        </View>

        {atGroupCap && (
          <Text style={styles.capNote}>
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
  headerSpacer: { width: 36 },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { padding: 20, gap: 16 },

  // Balance banner
  balanceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1b4b',
    borderRadius: 14,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: '#3730a3',
  },
  balanceGem: { fontSize: 28 },
  balanceTextBlock: { flex: 1 },
  balanceAmount: {
    fontSize: 22,
    fontWeight: '700',
    color: '#a5b4fc',
  },
  balanceSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },

  // Section
  section: { gap: 10 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },

  // Group row
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  groupRowLeft: { flex: 1 },
  groupRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  fireEmoji: { fontSize: 16 },
  groupName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
    flex: 1,
  },
  groupMeta: {
    fontSize: 13,
    color: '#94a3b8',
  },
  dormantBadge: {
    fontSize: 12,
    color: '#f59e0b',
    marginTop: 4,
  },
  chevron: {
    fontSize: 22,
    color: '#475569',
    marginLeft: 8,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },

  // CTAs
  ctaRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  ctaButton: {
    flex: 1,
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#6366f1',
  },
  ctaButtonDisabled: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
  },
  ctaText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  ctaTextSecondary: { color: '#6366f1' },
  ctaTextDisabled: { color: '#475569' },
  capNote: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginTop: -8,
  },

  // Skeleton
  skeletonList: { gap: 10 },
  skeletonRow: {
    height: 72,
    backgroundColor: '#1e293b',
    borderRadius: 12,
  },

  // Error
  errorCard: {
    backgroundColor: '#450a0a',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#991b1b',
    gap: 8,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 14,
  },
  retryBtn: {
    alignSelf: 'flex-start',
  },
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
  },
  modalFooter: {
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },

  // Inputs
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  textInput: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    color: '#f1f5f9',
    fontSize: 16,
    padding: 14,
    marginBottom: 24,
  },

  // Goal picker
  goalPicker: { marginBottom: 20 },
  goalOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 14,
    marginBottom: 8,
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
  goalNote: {
    fontSize: 12,
    color: '#475569',
    marginTop: 4,
    lineHeight: 18,
  },

  // Misc
  sectionNote: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 20,
    marginTop: 8,
  },

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
