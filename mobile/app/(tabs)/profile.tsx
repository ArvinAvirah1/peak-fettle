/**
 * Profile tab — user settings and account management.
 *
 * TICKET-021: full implementation (merged with planned TICKET-023/026 scope).
 * TICKET-041: added 1RM confirmation toggle (Option C opt-in).
 *
 * Sections:
 *   A. User info card        — avatar, display name, email, tier badge
 *   B. Settings              — kg/lbs toggle; 1RM confirmation toggle (TICKET-041)
 *   C. Physical constraints  — injury/equipment restrictions (GET/POST/DELETE /constraints)
 *   D. Data & privacy        — download data (GET /user/data-export), delete account
 *   E. Sign out
 *
 * Server-side endpoints:
 *   GET    /constraints         — list user constraints
 *   POST   /constraints         — add a constraint
 *   DELETE /constraints/:id     — remove a constraint
 *   GET    /user/data-export    — JSON attachment
 *   DELETE /user/account        — requires { confirm: "DELETE MY ACCOUNT" } body
 *   PATCH  /user/profile        — unit_pref, use_1rm_confirmation (now implemented, TICKET-041)
 *
 * P2-005: Root ScrollView wrapped in ScreenLayout for consistent safe area.
 * P2-006: TextInput in AddConstraintModal replaced with PFInput.
 * P2-007: Reanimated spring slide-up on AddConstraintModal open.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  Share,
  Modal,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { Ionicons } from '../../src/components/Icon';
import { useAuth } from '../../src/hooks/useAuth';
import {
  getConstraints,
  addConstraint,
  deleteConstraint,
  UserConstraint,
} from '../../src/api/constraints';
import { fetchDataExport, deleteAccount, patchProfile } from '../../src/api/user';
import { useTheme } from '../../src/theme/ThemeContext';
import { ThemeSelectorModal } from '../../src/components/ThemeSelector';
import { fontSize, fontWeight, spacing, radius } from '../../src/theme/tokens';
import { haptics } from '../../src/utils/haptics';
import { ScreenLayout, PFInput } from '../../src/components/ui';
import { useReduceMotion } from '../../src/hooks/useReduceMotion';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Built-in constraint types shown as quick-pick chips.
const PRESET_CONSTRAINTS = [
  { type: 'lower_back', label: 'Lower Back' },
  { type: 'knees', label: 'Knees' },
  { type: 'shoulders', label: 'Shoulders' },
  { type: 'wrists', label: 'Wrists' },
  { type: 'ankles', label: 'Ankles' },
  { type: 'neck', label: 'Neck' },
  { type: 'hip', label: 'Hip' },
  { type: 'upper_back', label: 'Upper Back' },
  { type: 'elbows', label: 'Elbows' },
  { type: 'no_barbells', label: 'No Barbells' },
  { type: 'no_machines', label: 'No Machines' },
  { type: 'no_cables', label: 'No Cables' },
  { type: 'bodyweight_only', label: 'Bodyweight Only' },
];

// ---------------------------------------------------------------------------
// Section header component
// ---------------------------------------------------------------------------

function SectionHeader({ label }: { label: string }): React.ReactElement {
  const { theme, themeName } = useTheme();
  return <Text style={[styles.sectionHeader, { color: theme.colors.textTertiary }]}>{label}</Text>;
}

// ---------------------------------------------------------------------------
// A. User info card
// ---------------------------------------------------------------------------

function UserInfoCard(): React.ReactElement {
  const { user } = useAuth();
  const { theme } = useTheme();
  const initial = user?.display_name
    ? user.display_name.charAt(0).toUpperCase()
    : (user?.email?.charAt(0).toUpperCase() ?? '?');

  return (
    <View style={[
      styles.card,
      { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
    ]}>
      <View style={[styles.avatar, { backgroundColor: theme.colors.accentDefault }]}>
        <Text style={[styles.avatarText, { color: theme.components.buttonPrimaryText }]}>{initial}</Text>
      </View>
      {user?.display_name ? (
        <Text style={[styles.displayName, { color: theme.colors.textPrimary }]}>{user.display_name}</Text>
      ) : null}
      <Text style={[styles.email, { color: theme.colors.textSecondary }]}>{user?.email ?? '—'}</Text>
      <View style={[
        styles.tierBadge,
        user?.is_paid
          ? { backgroundColor: theme.colors.accentSecondary }
          : { backgroundColor: theme.colors.bgSecondary },
      ]}>
        <Text style={[
          styles.tierText,
          user?.is_paid
            ? { color: theme.colors.accentHover }
            : { color: theme.colors.textTertiary },
        ]}>
          {user?.is_paid ? '⭐ Pro' : 'Free tier'}
        </Text>
      </View>
      {user?.experience_level ? (
        <Text style={[styles.experienceLabel, { color: theme.colors.textTertiary }]}>{user.experience_level}</Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// B. Units toggle
// ---------------------------------------------------------------------------

interface UnitToggleRowProps {
  currentPref: 'kg' | 'lbs';
  onChange: (pref: 'kg' | 'lbs') => void;
  isUpdating: boolean;
}

function UnitToggleRow({
  currentPref,
  onChange,
  isUpdating,
}: UnitToggleRowProps): React.ReactElement {
  const { theme } = useTheme();
  const isLbs = currentPref === 'lbs';

  return (
    <View style={styles.settingRow}>
      <View style={styles.settingLabelGroup}>
        <Text style={[styles.settingLabel, { color: theme.colors.textPrimary }]}>Units</Text>
        <Text style={[styles.settingMeta, { color: theme.colors.textTertiary }]}>
          {isLbs ? 'Pounds (lbs)' : 'Kilograms (kg)'}
        </Text>
      </View>
      {isUpdating ? (
        <ActivityIndicator color={theme.colors.accentDefault} />
      ) : (
        <View style={[
          styles.unitToggle,
          { backgroundColor: theme.colors.bgPrimary, borderColor: theme.colors.borderDefault },
        ]}>
          <TouchableOpacity
            style={[
              styles.unitButton,
              !isLbs && { backgroundColor: theme.colors.accentDefault },
            ]}
            onPress={() => onChange('kg')}
            accessibilityRole="button"
            accessibilityLabel="Switch to kg"
          >
            <Text style={[
              styles.unitButtonText,
              { color: theme.colors.textTertiary },
              !isLbs && { color: theme.components.buttonPrimaryText },
            ]}>
              kg
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.unitButton,
              isLbs && { backgroundColor: theme.colors.accentDefault },
            ]}
            onPress={() => onChange('lbs')}
            accessibilityRole="button"
            accessibilityLabel="Switch to lbs"
          >
            <Text style={[
              styles.unitButtonText,
              { color: theme.colors.textTertiary },
              isLbs && { color: theme.components.buttonPrimaryText },
            ]}>
              lbs
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// C. Physical constraints
// ---------------------------------------------------------------------------

interface AddConstraintModalProps {
  visible: boolean;
  existing: UserConstraint[];
  onAdd: (type: string, note?: string) => Promise<void>;
  onClose: () => void;
}

function AddConstraintModal({
  visible,
  existing,
  onAdd,
  onClose,
}: AddConstraintModalProps): React.ReactElement {
  const { theme } = useTheme();
  const reduceMotion = useReduceMotion();
  const [customNote, setCustomNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // P2-007: spring slide-up animation
  const translateY = useSharedValue(500);

  useEffect(() => {
    if (visible) {
      translateY.value = 500;
      translateY.value = reduceMotion
        ? 0
        : withSpring(0, { damping: 22, stiffness: 220 });
    }
  }, [visible, reduceMotion]);

  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const existingTypes = new Set(existing.map((c) => c.constraint_type));

  const handlePreset = useCallback(
    async (type: string) => {
      setIsSaving(true);
      try {
        await onAdd(type);
        onClose();
      } finally {
        setIsSaving(false);
      }
    },
    [onAdd, onClose]
  );

  const handleCustom = useCallback(async () => {
    const note = customNote.trim();
    if (note.length === 0) return;
    setIsSaving(true);
    try {
      await onAdd('custom', note);
      setCustomNote('');
      onClose();
    } finally {
      setIsSaving(false);
    }
  }, [customNote, onAdd, onClose]);

  return (
    <Modal
      visible={visible}
      animationType="none"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* P2-007: Animated.View provides the spring slide-up entry */}
      <Animated.View style={[{ flex: 1 }, sheetAnimStyle]}>
        <SafeAreaView style={[addConstraintStyles.container, { backgroundColor: theme.colors.bgPrimary }]}>
          <KeyboardAvoidingView
            style={addConstraintStyles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            {/* Drag handle */}
            <View style={[addConstraintStyles.handle, { backgroundColor: theme.colors.borderDefault }]} />

            {/* Header */}
            <View style={[addConstraintStyles.header, { borderBottomColor: theme.colors.bgSecondary }]}>
              <Text style={[addConstraintStyles.headerTitle, { color: theme.colors.textPrimary }]}>Add Restriction</Text>
              <TouchableOpacity
                style={addConstraintStyles.closeButton}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text style={[addConstraintStyles.closeButtonText, { color: theme.colors.accentDefault }]}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={addConstraintStyles.scrollContent} keyboardShouldPersistTaps="handled">
              <Text style={[addConstraintStyles.note, { color: theme.colors.textTertiary }]}>
                These restrictions are used by the AI planner to avoid exercises
                that could aggravate your conditions.
              </Text>

              {/* Preset chips */}
              <Text style={[addConstraintStyles.chipSectionLabel, { color: theme.colors.textTertiary }]}>QUICK ADD</Text>
              <View style={addConstraintStyles.chipsWrap}>
                {PRESET_CONSTRAINTS.map(({ type, label }) => {
                  const alreadyAdded = existingTypes.has(type);
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[
                        addConstraintStyles.chip,
                        { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
                        alreadyAdded && { backgroundColor: theme.colors.accentSecondary, borderColor: theme.colors.accentDefault },
                      ]}
                      onPress={() => !alreadyAdded && !isSaving && handlePreset(type)}
                      disabled={alreadyAdded || isSaving}
                      accessibilityRole="button"
                      accessibilityLabel={
                        alreadyAdded ? `${label} — already added` : `Add ${label}`
                      }
                    >
                      <Text
                        style={[
                          addConstraintStyles.chipText,
                          { color: theme.colors.textSecondary },
                          alreadyAdded && { color: theme.colors.accentHover },
                        ]}
                      >
                        {alreadyAdded ? `✓ ${label}` : label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* P2-006: PFInput replaces raw TextInput for custom restriction */}
              <Text style={[addConstraintStyles.chipSectionLabel, { color: theme.colors.textTertiary }]}>CUSTOM RESTRICTION</Text>
              <PFInput
                placeholder="e.g. avoid overhead pressing due to AC joint"
                value={customNote}
                onChangeText={setCustomNote}
                multiline
                numberOfLines={3}
                returnKeyType="done"
                accessibilityLabel="Custom restriction note"
              />
              <TouchableOpacity
                style={[
                  addConstraintStyles.saveButton,
                  { backgroundColor: theme.colors.accentDefault },
                  (customNote.trim().length === 0 || isSaving) && addConstraintStyles.saveButtonDisabled,
                ]}
                onPress={handleCustom}
                accessibilityRole="button"
                accessibilityLabel="Save constraint"
                disabled={customNote.trim().length === 0 || isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color={theme.components.buttonPrimaryText} />
                ) : (
                  <Text style={[addConstraintStyles.saveButtonText, { color: theme.components.buttonPrimaryText }]}>Add Custom Restriction</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function ProfileScreen(): React.ReactElement {
  const { user, logout, updateUser } = useAuth();
  const { theme, themeName } = useTheme();
  const router = useRouter();

  // Map camelCase theme keys to display names for the Appearance row
  const THEME_DISPLAY_NAMES: Record<string, string> = {
    deepOcean: 'Deep Ocean',
    ember: 'Ember',
    forest: 'Forest',
    midnight: 'Midnight',
    monochrome: 'Mono',
  };
  const activeThemeDisplayName = THEME_DISPLAY_NAMES[themeName] ?? 'Deep Ocean';

  const [unitPref, setUnitPref] = useState<'kg' | 'lbs'>(user?.unit_pref ?? 'kg');
  const [isUpdatingUnit, setIsUpdatingUnit] = useState(false);

  // Option C — 1RM confirmation preference (TICKET-041)
  const [use1rmConfirmation, setUse1rmConfirmation] = useState(
    user?.use_1rm_confirmation ?? false
  );
  const [isUpdating1rm, setIsUpdating1rm] = useState(false);

  // Notification preferences
  const [streakNotifEnabled, setStreakNotifEnabled] = useState(
    user?.streak_notifications_enabled !== false // default true
  );
  const [planNotifEnabled, setPlanNotifEnabled] = useState(
    user?.plan_notifications_enabled !== false // default true
  );

  const [constraints, setConstraints] = useState<UserConstraint[]>([]);
  const [constraintsLoading, setConstraintsLoading] = useState(true);
  const [constraintsError, setConstraintsError] = useState<string | null>(null);
  const [showAddConstraint, setShowAddConstraint] = useState(false);

  const [isExportingData, setIsExportingData] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);

  // Load constraints on mount
  useEffect(() => {
    loadConstraints();
  }, []);

  const loadConstraints = useCallback(async () => {
    setConstraintsLoading(true);
    setConstraintsError(null);
    try {
      const data = await getConstraints();
      setConstraints(data);
    } catch (err) {
      setConstraintsError(
        err instanceof Error ? err.message : 'Failed to load restrictions'
      );
    } finally {
      setConstraintsLoading(false);
    }
  }, []);

  // ── B. Units toggle ──────────────────────────────────────────────────────

  const handleUnitChange = useCallback(
    async (pref: 'kg' | 'lbs') => {
      if (pref === unitPref) return;
      setUnitPref(pref); // optimistic
      setIsUpdatingUnit(true);
      try {
        await patchProfile({ unit_pref: pref });
        updateUser?.({ unit_pref: pref });
      } catch (err) {
        // Revert optimistic update and tell the user what went wrong.
        setUnitPref(user?.unit_pref ?? 'kg');
        const msg =
          err != null && typeof err === 'object' && 'response' in err
            ? ((err as { response?: { data?: { message?: string; error?: string } } }).response?.data?.message ??
               (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
               'Server error — could not save unit preference')
            : err instanceof Error
            ? err.message
            : 'Could not save unit preference';
        Alert.alert('Could not save preference', msg);
      } finally {
        setIsUpdatingUnit(false);
      }
    },
    [unitPref, user, updateUser]
  );

  // ── B2. 1RM confirmation toggle (Option C — TICKET-041) ─────────────────

  const handle1rmConfirmationToggle = useCallback(
    async (value: boolean) => {
      setUse1rmConfirmation(value); // optimistic
      setIsUpdating1rm(true);
      try {
        await patchProfile({ use_1rm_confirmation: value });
        updateUser?.({ use_1rm_confirmation: value });
      } catch {
        // Revert on failure
        setUse1rmConfirmation(!value);
      } finally {
        setIsUpdating1rm(false);
      }
    },
    [updateUser]
  );

  // ── C. Constraints ───────────────────────────────────────────────────────

  const handleAddConstraint = useCallback(
    async (constraintType: string, customNote?: string) => {
      const added = await addConstraint({
        constraintType,
        ...(customNote ? { customNote } : {}),
      });
      setConstraints((prev) => [...prev, added]);
    },
    []
  );

  const handleDeleteConstraint = useCallback((constraint: UserConstraint) => {
    Alert.alert(
      'Remove Restriction',
      `Remove "${
        constraint.custom_note ?? constraint.constraint_type.replace(/_/g, ' ')
      }" from your restrictions?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteConstraint(constraint.id);
              setConstraints((prev) => prev.filter((c) => c.id !== constraint.id));
            } catch (err) {
              Alert.alert(
                'Error',
                err instanceof Error ? err.message : 'Failed to remove restriction'
              );
            }
          },
        },
      ]
    );
  }, []);

  // ── D. Data export ───────────────────────────────────────────────────────

  const handleDataExport = useCallback(async () => {
    setIsExportingData(true);
    try {
      const json = await fetchDataExport();
      await Share.share(
        {
          title: 'Peak Fettle data export',
          message: json,
        },
        { dialogTitle: 'Save or share your Peak Fettle data' }
      );
    } catch (err) {
      Alert.alert(
        'Export failed',
        err instanceof Error ? err.message : 'Could not export data'
      );
    } finally {
      setIsExportingData(false);
    }
  }, []);

  // ── D. Account deletion ──────────────────────────────────────────────────

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all associated data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Account',
          style: 'destructive',
          onPress: () => {
            haptics.warning(); // E-006: destructive confirmation
            // Second confirmation — belt-and-suspenders
            Alert.alert(
              'Are you sure?',
              'All your workouts, sets, plans and health data will be deleted permanently.',
              [
                { text: 'No, keep my account', style: 'cancel' },
                {
                  text: 'Yes, delete everything',
                  style: 'destructive',
                  onPress: async () => {
                    setIsDeletingAccount(true);
                    try {
                      await deleteAccount('DELETE MY ACCOUNT');
                      // logout() clears auth state and redirects to login
                      await logout();
                    } catch (err) {
                      setIsDeletingAccount(false);
                      Alert.alert(
                        'Deletion failed',
                        err instanceof Error ? err.message : 'Could not delete account'
                      );
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }, [logout]);

  // ── E. Sign out ──────────────────────────────────────────────────────────

  const handleSignOut = useCallback(() => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          haptics.warning(); // E-006: destructive confirmation
          setIsSigningOut(true);
          try {
            await logout();
          } finally {
            setIsSigningOut(false);
          }
        },
      },
    ]);
  }, [logout]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    // P2-005: ScreenLayout replaces bare ScrollView root — provides SafeAreaView
    // and bgPrimary background. horizontalPadding={false}: scrollContent manages
    // its own 20pt padding so list items fill edge-to-edge.
    <ScreenLayout scrollable horizontalPadding={false} contentStyle={styles.scrollContent}>
      {/* ── A. User info card ── */}
      <UserInfoCard />

      {/* ── B. Settings ── */}
      <View style={styles.section}>
        <SectionHeader label="SETTINGS" />
        <View style={[
          styles.settingsCard,
          { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
        ]}>
          <UnitToggleRow
            currentPref={unitPref}
            onChange={handleUnitChange}
            isUpdating={isUpdatingUnit}
          />

          {/* 1RM confirmation toggle — Option C (TICKET-041) */}
          <View style={[
            styles.settingRow,
            styles.settingRowBordered,
            styles.settingRowTop,
            { borderBottomColor: theme.colors.borderDefault, borderTopColor: theme.colors.borderDefault },
          ]}>
            <View style={styles.settingLabelGroup}>
              <Text style={[styles.settingLabel, { color: theme.colors.textPrimary }]}>Confirm estimated maxes</Text>
              <Text style={[styles.settingMeta, { color: theme.colors.textTertiary }]}>
                When on, you'll confirm each estimated 1RM before it affects your ranking.
                Off by default — rankings use estimates automatically.
              </Text>
            </View>
            {isUpdating1rm ? (
              <ActivityIndicator color={theme.colors.accentDefault} style={styles.toggleSpinner} />
            ) : (
              <Switch
                value={use1rmConfirmation}
                onValueChange={handle1rmConfirmationToggle}
                trackColor={{ false: theme.colors.borderDefault, true: theme.colors.accentDefault }}
                thumbColor={use1rmConfirmation ? theme.colors.accentDefault : theme.colors.textTertiary}
                accessibilityLabel="Confirm estimated maxes"
              />
            )}
          </View>
        </View>
      </View>

      {/* ── Appearance ── */}
      <View style={styles.section}>
        <SectionHeader label="APPEARANCE" />
        <View style={[
          styles.settingsCard,
          { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
        ]}>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => setShowThemePicker(true)}
            accessibilityRole="button"
            accessibilityLabel="Change theme"
          >
            <Text style={[styles.settingLabel, { color: theme.colors.textPrimary }]}>Theme</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.s2 }}>
              <Text style={[styles.settingMeta, { color: theme.colors.textTertiary }]}>
                {activeThemeDisplayName}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── C. Physical constraints ── */}
      <View style={styles.section}>
        <SectionHeader label="PHYSICAL RESTRICTIONS" />
        <Text style={[styles.sectionNote, { color: theme.colors.textTertiary }]}>
          These constraints are shared with the AI planner to avoid incompatible exercises.
        </Text>

        {constraintsLoading ? (
          <View style={styles.constraintsLoading}>
            <ActivityIndicator color={theme.colors.textTertiary} />
          </View>
        ) : constraintsError ? (
          <View style={[
            styles.constraintsError,
            { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
          ]}>
            <Text style={[styles.constraintsErrorText, { color: theme.colors.statusError }]}>{constraintsError}</Text>
            <TouchableOpacity onPress={loadConstraints} accessibilityRole="button" accessibilityLabel="Retry loading constraints">
              <Text style={[styles.retryLink, { color: theme.colors.accentDefault }]}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[
            styles.constraintsCard,
            { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
          ]}>
            {constraints.length === 0 ? (
              <Text style={[styles.noConstraints, { color: theme.colors.textTertiary }]}>No restrictions added</Text>
            ) : (
              constraints.map((c) => (
                <View key={c.id} style={[
                  styles.constraintRow,
                  { borderBottomColor: theme.colors.borderDefault },
                ]}>
                  <View style={styles.constraintLabelGroup}>
                    <Text style={[styles.constraintType, { color: theme.colors.textPrimary }]}>
                      {c.constraint_type === 'custom'
                        ? 'Custom'
                        : c.constraint_type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                    </Text>
                    {c.custom_note ? (
                      <Text style={[styles.constraintNote, { color: theme.colors.textTertiary }]}>{c.custom_note}</Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    style={styles.removeConstraintButton}
                    onPress={() => handleDeleteConstraint(c)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Remove restriction"
                  >
                    <Text style={[styles.removeConstraintIcon, { color: theme.colors.textTertiary }]}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}

            {/* Add restriction row */}
            <TouchableOpacity
              style={styles.addConstraintRow}
              onPress={() => setShowAddConstraint(true)}
              accessibilityRole="button"
              accessibilityLabel="Add a physical restriction"
            >
              <Text style={[styles.addConstraintText, { color: theme.colors.accentDefault }]}>+ Add Restriction</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Notifications ── */}
      <View style={styles.section}>
        <SectionHeader label="NOTIFICATIONS" />
        <View style={[
          styles.settingsCard,
          { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
        ]}>
          {/* Streak milestones */}
          <View style={[styles.settingRow, { justifyContent: 'space-between' }]}>
            <View style={styles.settingLabelGroup}>
              <Text style={[styles.settingLabel, { color: theme.colors.textPrimary }]}>Streak milestones</Text>
              <Text style={[styles.settingMeta, { color: theme.colors.textTertiary }]}>
                Celebrate 7, 30, and 100-day streaks
              </Text>
            </View>
            <Switch
              value={streakNotifEnabled}
              onValueChange={(val) => {
                setStreakNotifEnabled(val);
                patchProfile({ streak_notifications_enabled: val }).catch(() => {});
              }}
              trackColor={{ false: theme.colors.borderDefault, true: theme.colors.accentDefault }}
              thumbColor={streakNotifEnabled ? theme.colors.accentDefault : theme.colors.textTertiary}
              accessibilityLabel="Streak milestone notifications"
            />
          </View>

          {/* Plan ready */}
          <View style={[
            styles.settingRow,
            styles.settingRowBordered,
            styles.settingRowTop,
            { justifyContent: 'space-between', borderTopColor: theme.colors.borderDefault, borderBottomColor: theme.colors.borderDefault },
          ]}>
            <View style={styles.settingLabelGroup}>
              <Text style={[styles.settingLabel, { color: theme.colors.textPrimary }]}>Plan notifications</Text>
              <Text style={[styles.settingMeta, { color: theme.colors.textTertiary }]}>
                Notify when your AI plan is ready
              </Text>
            </View>
            <Switch
              value={planNotifEnabled}
              onValueChange={(val) => {
                setPlanNotifEnabled(val);
                patchProfile({ plan_notifications_enabled: val }).catch(() => {});
              }}
              trackColor={{ false: theme.colors.borderDefault, true: theme.colors.accentDefault }}
              thumbColor={planNotifEnabled ? theme.colors.accentDefault : theme.colors.textTertiary}
              accessibilityLabel="Plan ready notifications"
            />
          </View>
        </View>
      </View>

      {/* ── D. Data & privacy ── */}
      <View style={styles.section}>
        <SectionHeader label="DATA & PRIVACY" />
        <View style={[
          styles.settingsCard,
          { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
        ]}>
          {/* Health metrics */}
          <TouchableOpacity
            style={[styles.settingRow, styles.settingRowBordered, { borderBottomColor: theme.colors.borderDefault }]}
            onPress={() => router.push('/health-metrics')}
            accessibilityRole="button"
            accessibilityLabel="View health metrics"
          >
            <View style={styles.settingLabelGroup}>
              <Text style={[styles.settingLabel, { color: theme.colors.textPrimary }]}>Health Metrics</Text>
              <Text style={[styles.settingMeta, { color: theme.colors.textTertiary }]}>
                {Platform.OS === 'ios' ? 'Sync from Apple Health · HR, HRV, sleep' : 'HR, HRV, sleep data'}
              </Text>
            </View>
            <Text style={[styles.settingChevron, { color: theme.colors.textTertiary }]}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Your Data — data category table */}
        <View style={[styles.card, { backgroundColor: theme.colors.bgSecondary, marginBottom: spacing.s4 }]}>
          <Text style={[styles.sectionLabel, { color: theme.colors.textTertiary }]}>YOUR DATA</Text>

          {/* Data category rows */}
          {[
            { label: 'Workouts', description: 'Session logs, sets, reps, weights' },
            { label: 'Plans', description: 'AI-generated training plans' },
            { label: 'Health Metrics', description: 'HealthKit data and manual entries' },
            { label: 'Profile', description: 'Account info and preferences' },
          ].map((category, i) => (
            <View key={category.label} style={[styles.settingRow, i > 0 && { borderTopWidth: 1, borderTopColor: theme.colors.borderDefault }]}>
              <View>
                <Text style={[styles.settingLabel, { color: theme.colors.textPrimary }]}>{category.label}</Text>
                <Text style={{ color: theme.colors.textTertiary, fontSize: fontSize.caption }}>{category.description}</Text>
              </View>
            </View>
          ))}

          {/* P2-002: Exercise Library nav entry */}
          <Pressable
            onPress={() => router.push('/exercise-library')}
            style={[styles.settingRow, { borderTopWidth: 1, borderColor: theme.colors.borderDefault }]}
            accessibilityRole="button"
            accessibilityLabel="Browse exercise library"
          >
            <Ionicons name="barbell-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={[styles.settingLabel, { color: theme.colors.textPrimary, marginLeft: spacing.s3, flex: 1 }]}>
              Exercise Library
            </Text>
            <Ionicons name="chevron-forward-outline" size={16} color={theme.colors.textTertiary} />
          </Pressable>

          {/* Achievements & cosmetics shop */}
          <Pressable
            onPress={() => router.push('/cosmetics')}
            style={[styles.settingRow, { borderTopWidth: 1, borderColor: theme.colors.borderDefault }]}
            accessibilityRole="button"
            accessibilityLabel="View achievements and cosmetics shop"
          >
            <Ionicons name="trophy-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={[styles.settingLabel, { color: theme.colors.textPrimary, marginLeft: spacing.s3, flex: 1 }]}>
              Achievements &amp; Shop
            </Text>
            <Ionicons name="chevron-forward-outline" size={16} color={theme.colors.textTertiary} />
          </Pressable>

          {/* PL-2: Import Activity Data nav entry */}
          <Pressable
            onPress={() => router.push('/csv-import')}
            style={[styles.settingRow, { borderTopWidth: 1, borderColor: theme.colors.borderDefault }]}
            accessibilityRole="button"
            accessibilityLabel="Import activity data from Garmin or Strava"
          >
            <Ionicons name="cloud-upload-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={[styles.settingLabel, { color: theme.colors.textPrimary, marginLeft: spacing.s3, flex: 1 }]}>
              Import Activity Data
            </Text>
            <Ionicons name="chevron-forward-outline" size={16} color={theme.colors.textTertiary} />
          </Pressable>

          {/* Export button */}
          <TouchableOpacity
            onPress={handleDataExport}
            style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: theme.colors.borderDefault }]}
            accessibilityRole="button"
            accessibilityLabel="Export all my data"
          >
            <Text style={{ color: theme.colors.accentDefault, fontSize: fontSize.bodyMd, fontWeight: fontWeight.medium }}>
              Export All My Data
            </Text>
            <Ionicons name="download-outline" size={18} color={theme.colors.accentDefault} />
          </TouchableOpacity>
        </View>

        {/* Delete account */}
        <View style={[
          styles.settingsCard,
          { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
        ]}>
          <TouchableOpacity
            style={[styles.settingRow, styles.settingRowDestructive]}
            onPress={handleDeleteAccount}
            disabled={isDeletingAccount}
            accessibilityRole="button"
            accessibilityLabel="Delete account"
          >
            <View style={styles.settingLabelGroup}>
              <Text style={[styles.settingLabel, { color: theme.colors.statusError }]}>
                Delete Account
              </Text>
              <Text style={[styles.settingMeta, { color: theme.colors.textTertiary }]}>Permanently removes all your data</Text>
            </View>
            {isDeletingAccount ? (
              <ActivityIndicator color={theme.colors.statusError} />
            ) : (
              <Text style={[styles.settingChevron, { color: theme.colors.statusError }]}>›</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── E. Sign out ── */}
      <TouchableOpacity
        style={[
          styles.signOutButton,
          { borderColor: theme.colors.statusError },
          isSigningOut && styles.buttonDisabled,
        ]}
        onPress={handleSignOut}
        disabled={isSigningOut}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        {isSigningOut ? (
          <ActivityIndicator color={theme.colors.statusError} />
        ) : (
          <Text style={[styles.signOutText, { color: theme.colors.statusError }]}>Sign Out</Text>
        )}
      </TouchableOpacity>

      {/* App version note */}
      <Text style={[styles.appVersion, { color: theme.colors.borderDefault }]}>Peak Fettle · Claude Haiku 4.5</Text>

      <View style={styles.bottomPad} />

      {/* ── Theme selector modal ── */}
      <ThemeSelectorModal
        visible={showThemePicker}
        onClose={() => setShowThemePicker(false)}
      />

      {/* ── Add constraint modal ── */}
      <AddConstraintModal
        visible={showAddConstraint}
        existing={constraints}
        onAdd={handleAddConstraint}
        onClose={() => setShowAddConstraint(false)}
      />
    </ScreenLayout>
  );
}

// ---------------------------------------------------------------------------
// Styles — main screen — layout only, no color values
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 6,
    paddingBottom: 40,
  },

  // Section
  section: {
    gap: 8,
    marginTop: 16,
  },
  sectionHeader: {
    fontSize: fontSize.caption,  // E-003: was 12
    fontWeight: fontWeight.bold,  // E-003: was '700'
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  sectionNote: {
    fontSize: fontSize.bodySm,  // E-003: was 13
    lineHeight: 20,
  },

  // User info card
  card: {
    borderRadius: radius.lg,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarText: {
    fontSize: fontSize.heading1,  // E-003: was 28
    fontWeight: fontWeight.bold,  // E-003: was '700'
  },
  displayName: {
    fontSize: fontSize.heading3,  // E-003: was 20
    fontWeight: fontWeight.bold,  // E-003: was '700'
  },
  email: {
    fontSize: fontSize.bodySm,  // E-003: was 14
  },
  tierBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.s3,
    paddingVertical: 4,
    marginTop: 4,
  },
  tierText: {
    fontSize: fontSize.bodySm,  // E-003: was 13
    fontWeight: fontWeight.semibold,  // E-003: was '600'
  },
  experienceLabel: {
    fontSize: fontSize.bodySm,  // E-003: was 13
    textTransform: 'capitalize',
  },

  // Settings card
  settingsCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s4,
    minHeight: 64,
  },
  settingRowBordered: {
    borderBottomWidth: 1,
  },
  settingRowTop: {
    borderTopWidth: 1,
  },
  toggleSpinner: {
    marginLeft: 10,
  },
  settingRowDestructive: {
    // No extra border needed — last row in the card
  },
  settingLabelGroup: {
    flex: 1,
    gap: 3,
  },
  settingLabel: {
    fontSize: fontSize.bodyMd,  // E-003: was 16
    fontWeight: fontWeight.medium,  // E-003: was '500'
  },
  settingMeta: {
    fontSize: fontSize.bodySm,  // E-003: was 13
  },
  settingChevron: {
    fontSize: fontSize.heading3,  // E-003: was 22
    marginLeft: 10,
  },

  // Units toggle
  unitToggle: {
    flexDirection: 'row',
    borderRadius: radius.sm,
    borderWidth: 1,
    overflow: 'hidden',
  },
  unitButton: {
    paddingHorizontal: spacing.s4,
    paddingVertical: 8,
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitButtonText: {
    fontSize: fontSize.bodySm,  // E-003: was 14
    fontWeight: fontWeight.semibold,  // E-003: was '600'
  },

  // Constraints
  constraintsLoading: {
    paddingVertical: spacing.s4,
    alignItems: 'center',
  },
  constraintsError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  constraintsErrorText: {
    flex: 1,
    fontSize: fontSize.bodySm,  // E-003: was 14
  },
  retryLink: {
    fontSize: fontSize.bodySm,  // E-003: was 14
    fontWeight: fontWeight.semibold,  // E-003: was '600'
  },
  constraintsCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  noConstraints: {
    fontSize: fontSize.bodySm,  // E-003: was 14
    padding: 16,
  },
  constraintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s4,
    borderBottomWidth: 1,
    minHeight: 56,
  },
  constraintLabelGroup: {
    flex: 1,
    gap: 3,
  },
  constraintType: {
    fontSize: fontSize.bodyMd,  // E-003: was 15
    fontWeight: fontWeight.medium,  // E-003: was '500'
  },
  constraintNote: {
    fontSize: fontSize.bodySm,  // E-003: was 13
  },
  removeConstraintButton: {
    padding: 4,
  },
  removeConstraintIcon: {
    fontSize: fontSize.bodyMd,  // E-003: was 16
  },
  addConstraintRow: {
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s4,
    minHeight: 48,
    justifyContent: 'center',
  },
  addConstraintText: {
    fontSize: fontSize.bodyMd,  // E-003: was 15
    fontWeight: fontWeight.medium,  // E-003: was '500'
  },

  // Section label (used in Your Data card)
  sectionLabel: {
    fontSize: fontSize.caption,  // E-003: was 12
    fontWeight: fontWeight.bold,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
  },

  // Sign out button
  signOutButton: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 52,
  },
  signOutText: {
    fontSize: fontSize.bodyMd,  // E-003: was 16
    fontWeight: fontWeight.semibold,  // E-003: was '600'
  },

  // Footer
  appVersion: {
    fontSize: fontSize.caption,  // E-003: was 12
    textAlign: 'center',
    marginTop: 16,
  },
  bottomPad: {
    height: 24,
  },

  // Shared disabled state
  buttonDisabled: {
    opacity: 0.6,
  },
});

// ---------------------------------------------------------------------------
// Styles — AddConstraintModal
// ---------------------------------------------------------------------------

const addConstraintStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  // P2-007: visual drag handle at top of the sheet
  handle: {
    width: 40,
    height: 4,
    borderRadius: radius.full,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s4,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: fontSize.heading3,   // E-003: was 18
    fontWeight: fontWeight.semibold, // E-003: was '600'
  },
  closeButton: {
    padding: 4,
    minHeight: 44,
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: fontSize.bodyMd,     // E-003: was 16
    fontWeight: fontWeight.medium, // E-003: was '500'
  },
  scrollContent: {
    padding: spacing.s4,
    gap: 12,
    paddingBottom: 48,
  },
  note: {
    fontSize: fontSize.bodySm,     // E-003: was 14
    lineHeight: 20,
  },
  chipSectionLabel: {
    fontSize: fontSize.caption,    // E-003: was 12
    fontWeight: fontWeight.bold,   // E-003: was '700'
    letterSpacing: 1.0,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: {
    fontSize: fontSize.bodySm,     // E-003: was 14
    fontWeight: fontWeight.medium, // E-003: was '500'
  },
  // P2-006: customInput removed — replaced by PFInput component
  saveButton: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  saveButtonDisabled: {
    opacity: 0.45,
  },
  saveButtonText: {
    fontSize: fontSize.bodyMd,     // E-003: was 16
    fontWeight: fontWeight.semibold, // E-003: was '600'
  },
});
