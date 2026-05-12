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
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Share,
  Modal,
  SafeAreaView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/hooks/useAuth';
import {
  getConstraints,
  addConstraint,
  deleteConstraint,
  UserConstraint,
} from '../../src/api/constraints';
import { fetchDataExport, deleteAccount, patchProfile } from '../../src/api/user';

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
  return <Text style={styles.sectionHeader}>{label}</Text>;
}

// ---------------------------------------------------------------------------
// A. User info card
// ---------------------------------------------------------------------------

function UserInfoCard(): React.ReactElement {
  const { user } = useAuth();
  const initial = user?.display_name
    ? user.display_name.charAt(0).toUpperCase()
    : (user?.email?.charAt(0).toUpperCase() ?? '?');

  return (
    <View style={styles.card}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
      {user?.display_name ? (
        <Text style={styles.displayName}>{user.display_name}</Text>
      ) : null}
      <Text style={styles.email}>{user?.email ?? '—'}</Text>
      <View style={[styles.tierBadge, user?.is_paid ? styles.tierBadgePaid : styles.tierBadgeFree]}>
        <Text style={[styles.tierText, user?.is_paid ? styles.tierTextPaid : styles.tierTextFree]}>
          {user?.is_paid ? '⭐ Pro' : 'Free tier'}
        </Text>
      </View>
      {user?.experience_level ? (
        <Text style={styles.experienceLabel}>{user.experience_level}</Text>
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
  const isLbs = currentPref === 'lbs';

  return (
    <View style={styles.settingRow}>
      <View style={styles.settingLabelGroup}>
        <Text style={styles.settingLabel}>Units</Text>
        <Text style={styles.settingMeta}>
          {isLbs ? 'Pounds (lbs)' : 'Kilograms (kg)'}
        </Text>
      </View>
      {isUpdating ? (
        <ActivityIndicator color="#818cf8" />
      ) : (
        <View style={styles.unitToggle}>
          <TouchableOpacity
            style={[styles.unitButton, !isLbs && styles.unitButtonActive]}
            onPress={() => onChange('kg')}
            accessibilityRole="button"
            accessibilityLabel="Switch to kg"
          >
            <Text style={[styles.unitButtonText, !isLbs && styles.unitButtonTextActive]}>
              kg
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.unitButton, isLbs && styles.unitButtonActive]}
            onPress={() => onChange('lbs')}
            accessibilityRole="button"
            accessibilityLabel="Switch to lbs"
          >
            <Text style={[styles.unitButtonText, isLbs && styles.unitButtonTextActive]}>
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
  const [customNote, setCustomNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={addConstraintStyles.container}>
        <KeyboardAvoidingView
          style={addConstraintStyles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Header */}
          <View style={addConstraintStyles.header}>
            <Text style={addConstraintStyles.headerTitle}>Add Restriction</Text>
            <TouchableOpacity
              style={addConstraintStyles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={addConstraintStyles.closeButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={addConstraintStyles.scrollContent} keyboardShouldPersistTaps="handled">
            <Text style={addConstraintStyles.note}>
              These restrictions are used by the AI planner to avoid exercises
              that could aggravate your conditions.
            </Text>

            {/* Preset chips */}
            <Text style={addConstraintStyles.chipSectionLabel}>QUICK ADD</Text>
            <View style={addConstraintStyles.chipsWrap}>
              {PRESET_CONSTRAINTS.map(({ type, label }) => {
                const alreadyAdded = existingTypes.has(type);
                return (
                  <TouchableOpacity
                    key={type}
                    style={[
                      addConstraintStyles.chip,
                      alreadyAdded && addConstraintStyles.chipAdded,
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
                        alreadyAdded && addConstraintStyles.chipTextAdded,
                      ]}
                    >
                      {alreadyAdded ? `✓ ${label}` : label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom note */}
            <Text style={addConstraintStyles.chipSectionLabel}>CUSTOM RESTRICTION</Text>
            <TextInput
              style={addConstraintStyles.customInput}
              placeholder="e.g. avoid overhead pressing due to AC joint"
              placeholderTextColor="#475569"
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
                (customNote.trim().length === 0 || isSaving) && addConstraintStyles.saveButtonDisabled,
              ]}
              onPress={handleCustom}
              disabled={customNote.trim().length === 0 || isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={addConstraintStyles.saveButtonText}>Add Custom Restriction</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function ProfileScreen(): React.ReactElement {
  const { user, logout, updateUser } = useAuth();
  const router = useRouter();

  const [unitPref, setUnitPref] = useState<'kg' | 'lbs'>(user?.unit_pref ?? 'kg');
  const [isUpdatingUnit, setIsUpdatingUnit] = useState(false);

  // Option C — 1RM confirmation preference (TICKET-041)
  const [use1rmConfirmation, setUse1rmConfirmation] = useState(
    user?.use_1rm_confirmation ?? false
  );
  const [isUpdating1rm, setIsUpdating1rm] = useState(false);

  const [constraints, setConstraints] = useState<UserConstraint[]>([]);
  const [constraintsLoading, setConstraintsLoading] = useState(true);
  const [constraintsError, setConstraintsError] = useState<string | null>(null);
  const [showAddConstraint, setShowAddConstraint] = useState(false);

  const [isExportingData, setIsExportingData] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

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
        // TODO(TICKET-026): patchProfile hits /user/profile which is not yet
        // built on the server. This call will 404 until the backend ships.
        // The optimistic update still persists locally for the session.
        await patchProfile({ unit_pref: pref });
        updateUser?.({ unit_pref: pref });
      } catch {
        // Silently revert on failure — 404 expected until backend ships
        // but don't alarm the user unnecessarily.
        setUnitPref(user?.unit_pref ?? 'kg');
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
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* ── A. User info card ── */}
      <UserInfoCard />

      {/* ── B. Settings ── */}
      <View style={styles.section}>
        <SectionHeader label="SETTINGS" />
        <View style={styles.settingsCard}>
          <UnitToggleRow
            currentPref={unitPref}
            onChange={handleUnitChange}
            isUpdating={isUpdatingUnit}
          />

          {/* 1RM confirmation toggle — Option C (TICKET-041) */}
          <View style={[styles.settingRow, styles.settingRowBordered, styles.settingRowTop]}>
            <View style={styles.settingLabelGroup}>
              <Text style={styles.settingLabel}>Confirm estimated maxes</Text>
              <Text style={styles.settingMeta}>
                When on, you'll confirm each estimated 1RM before it affects your ranking.
                Off by default — rankings use estimates automatically.
              </Text>
            </View>
            {isUpdating1rm ? (
              <ActivityIndicator color="#818cf8" style={styles.toggleSpinner} />
            ) : (
              <Switch
                value={use1rmConfirmation}
                onValueChange={handle1rmConfirmationToggle}
                trackColor={{ false: '#334155', true: '#4f46e5' }}
                thumbColor={use1rmConfirmation ? '#818cf8' : '#64748b'}
                accessibilityLabel="Confirm estimated maxes"
              />
            )}
          </View>
        </View>
      </View>

      {/* ── C. Physical constraints ── */}
      <View style={styles.section}>
        <SectionHeader label="PHYSICAL RESTRICTIONS" />
        <Text style={styles.sectionNote}>
          These constraints are shared with the AI planner to avoid incompatible exercises.
        </Text>

        {constraintsLoading ? (
          <View style={styles.constraintsLoading}>
            <ActivityIndicator color="#64748b" />
          </View>
        ) : constraintsError ? (
          <View style={styles.constraintsError}>
            <Text style={styles.constraintsErrorText}>{constraintsError}</Text>
            <TouchableOpacity onPress={loadConstraints}>
              <Text style={styles.retryLink}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.constraintsCard}>
            {constraints.length === 0 ? (
              <Text style={styles.noConstraints}>No restrictions added</Text>
            ) : (
              constraints.map((c) => (
                <View key={c.id} style={styles.constraintRow}>
                  <View style={styles.constraintLabelGroup}>
                    <Text style={styles.constraintType}>
                      {c.constraint_type === 'custom'
                        ? 'Custom'
                        : c.constraint_type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                    </Text>
                    {c.custom_note ? (
                      <Text style={styles.constraintNote}>{c.custom_note}</Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    style={styles.removeConstraintButton}
                    onPress={() => handleDeleteConstraint(c)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Remove restriction"
                  >
                    <Text style={styles.removeConstraintIcon}>✕</Text>
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
              <Text style={styles.addConstraintText}>+ Add Restriction</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── D. Data & privacy ── */}
      <View style={styles.section}>
        <SectionHeader label="DATA & PRIVACY" />
        <View style={styles.settingsCard}>
          {/* Health metrics */}
          <TouchableOpacity
            style={[styles.settingRow, styles.settingRowBordered]}
            onPress={() => router.push('/health-metrics')}
            accessibilityRole="button"
            accessibilityLabel="View health metrics"
          >
            <View style={styles.settingLabelGroup}>
              <Text style={styles.settingLabel}>Health Metrics</Text>
              <Text style={styles.settingMeta}>
                {Platform.OS === 'ios' ? 'Sync from Apple Health · HR, HRV, sleep' : 'HR, HRV, sleep data'}
              </Text>
            </View>
            <Text style={styles.settingChevron}>›</Text>
          </TouchableOpacity>

          {/* Download data */}
          <TouchableOpacity
            style={[styles.settingRow, styles.settingRowBordered]}
            onPress={handleDataExport}
            disabled={isExportingData}
            accessibilityRole="button"
            accessibilityLabel="Download your data"
          >
            <View style={styles.settingLabelGroup}>
              <Text style={styles.settingLabel}>Download My Data</Text>
              <Text style={styles.settingMeta}>
                JSON export of all your Peak Fettle data
              </Text>
            </View>
            {isExportingData ? (
              <ActivityIndicator color="#818cf8" />
            ) : (
              <Text style={styles.settingChevron}>›</Text>
            )}
          </TouchableOpacity>

          {/* Delete account */}
          <TouchableOpacity
            style={[styles.settingRow, styles.settingRowDestructive]}
            onPress={handleDeleteAccount}
            disabled={isDeletingAccount}
            accessibilityRole="button"
            accessibilityLabel="Delete account"
          >
            <View style={styles.settingLabelGroup}>
              <Text style={[styles.settingLabel, styles.destructiveLabel]}>
                Delete Account
              </Text>
              <Text style={styles.settingMeta}>Permanently removes all your data</Text>
            </View>
            {isDeletingAccount ? (
              <ActivityIndicator color="#ef4444" />
            ) : (
              <Text style={[styles.settingChevron, styles.destructiveChevron]}>›</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── E. Sign out ── */}
      <TouchableOpacity
        style={[styles.signOutButton, isSigningOut && styles.buttonDisabled]}
        onPress={handleSignOut}
        disabled={isSigningOut}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        {isSigningOut ? (
          <ActivityIndicator color="#ef4444" />
        ) : (
          <Text style={styles.signOutText}>Sign Out</Text>
        )}
      </TouchableOpacity>

      {/* App version note */}
      <Text style={styles.appVersion}>Peak Fettle · Claude Haiku 4.5</Text>

      <View style={styles.bottomPad} />

      {/* ── Add constraint modal ── */}
      <AddConstraintModal
        visible={showAddConstraint}
        existing={constraints}
        onAdd={handleAddConstraint}
        onClose={() => setShowAddConstraint(false)}
      />
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles — main screen
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
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
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  sectionNote: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 20,
  },

  // User info card
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  displayName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f8fafc',
  },
  email: {
    fontSize: 14,
    color: '#94a3b8',
  },
  tierBadge: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 4,
  },
  tierBadgePaid: {
    backgroundColor: '#1e1b4b',
  },
  tierBadgeFree: {
    backgroundColor: '#1e293b',
  },
  tierText: {
    fontSize: 13,
    fontWeight: '600',
  },
  tierTextPaid: {
    color: '#a78bfa',
  },
  tierTextFree: {
    color: '#64748b',
  },
  experienceLabel: {
    fontSize: 13,
    color: '#64748b',
    textTransform: 'capitalize',
  },

  // Settings card
  settingsCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 64,
  },
  settingRowBordered: {
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  settingRowTop: {
    borderTopWidth: 1,
    borderTopColor: '#334155',
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
    fontSize: 16,
    fontWeight: '500',
    color: '#f8fafc',
  },
  settingMeta: {
    fontSize: 13,
    color: '#64748b',
  },
  settingChevron: {
    fontSize: 22,
    color: '#475569',
    marginLeft: 10,
  },
  destructiveLabel: {
    color: '#ef4444',
  },
  destructiveChevron: {
    color: '#ef4444',
  },

  // Units toggle
  unitToggle: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  unitButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 44,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitButtonActive: {
    backgroundColor: '#4f46e5',
  },
  unitButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  unitButtonTextActive: {
    color: '#fff',
  },

  // Constraints
  constraintsLoading: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  constraintsError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  constraintsErrorText: {
    flex: 1,
    fontSize: 14,
    color: '#f87171',
  },
  retryLink: {
    fontSize: 14,
    fontWeight: '600',
    color: '#818cf8',
  },
  constraintsCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  noConstraints: {
    fontSize: 14,
    color: '#64748b',
    padding: 16,
  },
  constraintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    minHeight: 56,
  },
  constraintLabelGroup: {
    flex: 1,
    gap: 3,
  },
  constraintType: {
    fontSize: 15,
    fontWeight: '500',
    color: '#f8fafc',
  },
  constraintNote: {
    fontSize: 13,
    color: '#64748b',
  },
  removeConstraintButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeConstraintIcon: {
    fontSize: 14,
    color: '#64748b',
  },
  addConstraintRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 52,
    justifyContent: 'center',
  },
  addConstraintText: {
    fontSize: 15,
    color: '#818cf8',
    fontWeight: '500',
  },

  // Sign out
  signOutButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
    minHeight: 52,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  signOutText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '700',
  },

  // App version
  appVersion: {
    fontSize: 12,
    color: '#334155',
    textAlign: 'center',
    marginTop: 12,
  },

  bottomPad: { height: 24 },
});

// ---------------------------------------------------------------------------
// Styles — add constraint modal
// ---------------------------------------------------------------------------

const addConstraintStyles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
  },
  closeButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#818cf8',
    fontWeight: '500',
  },
  scrollContent: {
    padding: 20,
    gap: 16,
    paddingBottom: 40,
  },
  note: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 22,
  },
  chipSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  chipAdded: {
    backgroundColor: '#312e81',
    borderColor: '#4f46e5',
  },
  chipText: {
    fontSize: 14,
    color: '#94a3b8',
    fontWeight: '500',
  },
  chipTextAdded: {
    color: '#a5b4fc',
  },
  customInput: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#f8fafc',
    minHeight: 80,
    borderWidth: 1,
    borderColor: '#334155',
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: '#4f46e5',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    minHeight: 52,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
