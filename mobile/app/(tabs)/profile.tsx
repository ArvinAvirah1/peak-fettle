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

import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  Linking,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { Ionicons } from '../../src/components/Icon';
import { useAuth } from '../../src/hooks/useAuth';
import { useLocalStreak } from '../../src/hooks/useStreak';
import { getWholePersonStreak } from '../../src/api/lifeos';
import {
  getConstraints,
  addConstraint,
  deleteConstraint,
  UserConstraint,
} from '../../src/api/constraints';
import { fetchDataExport, deleteAccount } from '../../src/api/user';
import { isLocalFirst } from '../../src/data/backup/tierPolicy';
import { localDb, genId } from '../../src/db/localDb';
import { saveProfile } from '../../src/data/profile';
import { clearAllLocalPersonalData } from '../../src/data/localReset';
import { useTheme } from '../../src/theme/ThemeContext';
import { ThemeSelectorModal } from '../../src/components/ThemeSelector';
import { fontSize, fontWeight, spacing, radius } from '../../src/theme/tokens';
import { haptics } from '../../src/utils/haptics';
import { ScreenLayout, PFInput } from '../../src/components/ui';
import { defaultUnitForLocale } from '../../src/constants/locale';
import { useReduceMotion } from '../../src/hooks/useReduceMotion';
import { useTour } from '../../src/components/tour/WelcomeTour'; // TICKET-095
import PeakAvatar from '../../src/components/avatar/PeakAvatar'; // TICKET-096
import AvatarCustomizer from '../../src/components/avatar/AvatarCustomizer';
import { loadAvatar, saveAvatar } from '../../src/data/avatar';
import { AvatarConfig } from '../../src/components/avatar/peakAvatarOptions';
import {
  getRestTimerDefaultSec,
  setRestTimerDefaultSec,
  getEffortDisplay,
  getAutoregSuggestionsEnabled,
  setAutoregSuggestionsEnabled,
  setEffortDisplay,
  EffortDisplay,
  getGroupRestMode,
  setGroupRestMode,
  GroupRestMode,
} from '../../src/data/appSettings';
import { BADGE_DEFS, BadgeDef } from '../../src/data/badges/badgeDefs'; // TICKET-143
import { localDb as badgeLocalDb } from '../../src/db/localDb'; // TICKET-143 (badges_earned reads)
import { useTranslation } from 'react-i18next';
import { setAppLanguageAndApply } from '../../src/i18n';
import { getAppLanguage, AppLanguage } from '../../src/data/appSettings';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Built-in constraint types shown as quick-pick chips.
const PRESET_CONSTRAINTS = [
  { type: 'lower_back', labelKey: 'settings:profile.constraintLowerBack' },
  { type: 'knees', labelKey: 'settings:profile.constraintKnees' },
  { type: 'shoulders', labelKey: 'settings:profile.constraintShoulders' },
  { type: 'wrists', labelKey: 'settings:profile.constraintWrists' },
  { type: 'ankles', labelKey: 'settings:profile.constraintAnkles' },
  { type: 'neck', labelKey: 'settings:profile.constraintNeck' },
  { type: 'hip', labelKey: 'settings:profile.constraintHip' },
  { type: 'upper_back', labelKey: 'settings:profile.constraintUpperBack' },
  { type: 'elbows', labelKey: 'settings:profile.constraintElbows' },
  { type: 'no_barbells', labelKey: 'settings:profile.constraintNoBarbells' },
  { type: 'no_machines', labelKey: 'settings:profile.constraintNoMachines' },
  { type: 'no_cables', labelKey: 'settings:profile.constraintNoCables' },
  { type: 'bodyweight_only', labelKey: 'settings:profile.constraintBodyweightOnly' },
];

// ---------------------------------------------------------------------------
// TICKET-125: LifeOS companion card constants
// ---------------------------------------------------------------------------

/**
 * PLACEHOLDER — founder must replace with the real App Store ID once the
 * LifeOS app is published. Do NOT invent a real id.
 */
const LIFEOS_APPSTORE_URL = 'https://apps.apple.com/app/idPLACEHOLDER';

/** Deep-link scheme registered by the LifeOS companion app. */
const LIFEOS_DEEP_LINK = 'lifeos://';

// ---------------------------------------------------------------------------
// TICKET-125: LifeOS companion card
// ---------------------------------------------------------------------------

/**
 * LifeOSCard — surfaces the LifeOS companion app from the fitness app's
 * profile tab (Q32 option a).
 *
 * LOCAL-FIRST INVARIANT:
 *   - FREE users: streak shown from on-device SQLite (useLocalStreak), NO
 *     network call on mount.
 *   - PRO users: streak starts from local value, then updates non-blocking
 *     once GET /lifeos/whole-person-streak resolves (or stays local on error).
 */
function LifeOSCard(): React.ReactElement {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const isPro = !!user?.is_paid;

  // Local streak — reads on-device SQLite for free users (no REST on mount).
  // For Pro we pass 0/false as placeholders; the hook returns them unchanged
  // while we separately fetch the whole-person streak below.
  const { streak: localStreak, isLoading: streakLoading } = useLocalStreak(0, false);

  // For Pro users: non-blocking fetch of the whole-person streak.
  // Starts at the local value and updates when the server responds.
  const [displayStreak, setDisplayStreak] = useState<number>(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Mirror localStreak into displayStreak once it resolves.
  useEffect(() => {
    if (!streakLoading) {
      setDisplayStreak(localStreak);
    }
  }, [localStreak, streakLoading]);

  // Pro-only: try to upgrade displayStreak with the server whole-person value.
  // FREE users: this branch is never entered — no network call on mount.
  useEffect(() => {
    if (!isPro) return;
    let cancelled = false;
    (async () => {
      const serverStreak = await getWholePersonStreak();
      if (!cancelled && mountedRef.current && serverStreak !== null) {
        setDisplayStreak(serverStreak);
      }
    })();
    return () => { cancelled = true; };
  }, [isPro]);

  // Detect whether LifeOS is installed; fall back to App Store if not.
  const [lifeosInstalled, setLifeosInstalled] = useState<boolean>(false);
  useEffect(() => {
    Linking.canOpenURL(LIFEOS_DEEP_LINK)
      .then((can) => { setLifeosInstalled(can); })
      .catch(() => { setLifeosInstalled(false); });
  }, []);

  const handleCTA = useCallback(async () => {
    try {
      if (lifeosInstalled) {
        await Linking.openURL(LIFEOS_DEEP_LINK);
      } else {
        await Linking.openURL(LIFEOS_APPSTORE_URL);
      }
    } catch {
      // If both fail gracefully do nothing — don't crash.
    }
  }, [lifeosInstalled]);

  const ctaLabel = lifeosInstalled
    ? t('settings:profile.lifeosOpen')
    : t('settings:profile.lifeosGet');

  return (
    <View style={[
      lifeosCardStyles.card,
      { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
    ]}>
      {/* Header row */}
      <View style={lifeosCardStyles.headerRow}>
        <Text style={[lifeosCardStyles.title, { color: theme.colors.textPrimary }]}>
          {t('settings:profile.lifeosTitle')}
        </Text>
        <View style={[lifeosCardStyles.badge, { backgroundColor: theme.colors.accentSecondary }]}>
          <Text style={[lifeosCardStyles.badgeText, { color: theme.colors.accentHover }]}>
            {t('settings:profile.lifeosCompanionBadge')}
          </Text>
        </View>
      </View>

      {/* Streak line */}
      <Text style={[lifeosCardStyles.streakLine, { color: theme.colors.textSecondary }]}>
        {streakLoading
          ? t('settings:profile.lifeosStreakLoading')
          : t('settings:profile.lifeosStreakLine', { count: displayStreak })}
      </Text>

      {/* CTA button */}
      <TouchableOpacity
        style={[
          lifeosCardStyles.ctaButton,
          { backgroundColor: theme.colors.accentDefault },
        ]}
        onPress={handleCTA}
        accessibilityRole="button"
        accessibilityLabel={ctaLabel}
        activeOpacity={0.82}
      >
        <Text style={[lifeosCardStyles.ctaText, { color: theme.components.buttonPrimaryText }]}>
          {ctaLabel}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Section header component
// ---------------------------------------------------------------------------

function SectionHeader({ label }: { label: string }): React.ReactElement {
  const { theme, themeName } = useTheme();
  return <Text style={[styles.sectionHeader, { color: theme.colors.textTertiary }]}>{label}</Text>;
}

// ---------------------------------------------------------------------------
// Badge case — TICKET-143: earned vs locked, "locked show their rule" (no
// mystery-box badges). No server, no sharing in v1 (share-card integration is
// a later ticket). Reads badges_earned (schema v14) directly — a tiny,
// indexed-by-primary-key SELECT, cheap enough for a profile-tab mount.
// ---------------------------------------------------------------------------

function BadgeCard({ def, earned }: { def: BadgeDef; earned: boolean }): React.ReactElement {
  const { theme } = useTheme();
  const { t } = useTranslation();
  // TICKET-146 (B6 handoff wiring): badge names/rules translate through
  // misc:badges.<id> keys; badgeDefs.ts stays pure English data (fallback).
  const badgeName = t(`misc:badges.${def.id}.name` as never, { defaultValue: def.name }) as string;
  const badgeRule = t(`misc:badges.${def.id}.description` as never, { defaultValue: def.rule }) as string;
  return (
    <View
      style={[
        badgeCaseStyles.card,
        {
          backgroundColor: earned ? theme.colors.accentDefault + '14' : theme.colors.bgPrimary,
          borderColor: earned ? theme.colors.accentDefault : theme.colors.borderDefault,
        },
      ]}
      accessible
      accessibilityLabel={
        earned ? t('settings:profile.badgeEarnedLabel', { name: badgeName }) : t('settings:profile.badgeLockedLabel', { name: badgeName, rule: badgeRule })
      }
    >
      <Ionicons
        name={earned ? 'trophy' : 'lock-closed-outline'}
        size={22}
        color={earned ? theme.colors.accentDefault : theme.colors.textTertiary}
      />
      <Text
        style={[
          badgeCaseStyles.name,
          { color: earned ? theme.colors.textPrimary : theme.colors.textSecondary },
        ]}
        numberOfLines={1}
      >
        {badgeName}
      </Text>
      <Text style={[badgeCaseStyles.rule, { color: theme.colors.textTertiary }]} numberOfLines={2}>
        {badgeRule}
      </Text>
    </View>
  );
}

function BadgeCaseSection(): React.ReactElement {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [earnedIds, setEarnedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await badgeLocalDb.init();
        const rows = await badgeLocalDb.getAll<{ badge_id: string }>(
          'SELECT badge_id FROM badges_earned',
        );
        if (!cancelled) setEarnedIds(new Set(rows.map((r) => r.badge_id)));
      } catch {
        if (!cancelled) setEarnedIds(new Set());
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const earnedCount = BADGE_DEFS.filter((d) => earnedIds.has(d.id)).length;

  return (
    <View style={styles.section}>
      <SectionHeader label={t('settings:profile.achievementsSectionHeader')} />
      <Text style={[styles.sectionNote, { color: theme.colors.textTertiary }]}>
        {loading ? t('settings:profile.loadingBadgeCase') : t('settings:profile.earnedOfTotal', { earned: earnedCount, total: BADGE_DEFS.length })}
      </Text>
      {loading ? (
        <ActivityIndicator color={theme.colors.textTertiary} style={{ marginVertical: spacing.s4 }} />
      ) : (
        <View style={badgeCaseStyles.grid}>
          {BADGE_DEFS.map((def) => (
            <BadgeCard key={def.id} def={def} earned={earnedIds.has(def.id)} />
          ))}
        </View>
      )}
    </View>
  );
}

const badgeCaseStyles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s2,
  },
  card: {
    width: '31%',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s2,
    alignItems: 'center',
    minHeight: 96,
    justifyContent: 'center',
  },
  name: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
    marginTop: spacing.s1,
  },
  rule: {
    fontSize: fontSize.micro,
    textAlign: 'center',
    marginTop: 2,
  },
});

// ---------------------------------------------------------------------------
// A. User info card
// ---------------------------------------------------------------------------

function UserInfoCard({ avatar, onEditAvatar }: { avatar: AvatarConfig | null; onEditAvatar: () => void }): React.ReactElement {
  const { user, updateUser, upgradeToPro, downgradeToFree } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();

  const isPro = !!user?.is_paid;

  // P3a: inline display-name editor. Tap the pencil to edit; Save persists via
  // the tier-branched saveProfile (free → on-device user_profile.display_name,
  // Pro → best-effort PATCH). An inline editor (not a Modal) keeps this a single
  // tap and sidesteps the in-Modal safe-area inset caveat entirely.
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);

  const beginEditName = useCallback(() => {
    setNameDraft(user?.display_name ?? '');
    setEditingName(true);
  }, [user?.display_name]);

  const cancelEditName = useCallback(() => {
    setEditingName(false);
    setNameDraft('');
  }, []);

  const saveName = useCallback(async () => {
    const trimmed = nameDraft.trim();
    // No-op on an empty or unchanged value — just close the editor.
    if (trimmed.length === 0 || trimmed === (user?.display_name ?? '')) {
      cancelEditName();
      return;
    }
    setSavingName(true);
    try {
      await saveProfile(user, { display_name: trimmed }, updateUser);
      setEditingName(false);
      setNameDraft('');
    } catch (err) {
      // Surface a real failure (D-3) — never silently swallow the write.
      Alert.alert(
        t('settings:profile.couldNotSaveNameTitle'),
        err instanceof Error ? err.message : t('settings:profile.couldNotSaveDisplayName')
      );
    } finally {
      setSavingName(false);
    }
  }, [nameDraft, user, updateUser, cancelEditName]);

  // ── Pro toggle ───────────────────────────────────────────────────────────
  // "Pro for now": NO real payment flow (founder decision). Enabling Pro just
  // runs the Free→Pro data migration (auth.upgradeToPro uploads the on-device
  // SQLite rows to the server, then flips is_paid LAST so a partial failure
  // leaves the user safely still-free). Disabling reverts to local-first.
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [upgradeProgress, setUpgradeProgress] = useState<{ done: number; total: number } | null>(null);

  const handleUpgrade = useCallback(async () => {
    if (isUpgrading || isPro) return;
    haptics.medium();
    setIsUpgrading(true);
    setUpgradeProgress({ done: 0, total: 0 });
    try {
      const outcome = await upgradeToPro((done, total) => {
        setUpgradeProgress({ done, total });
      });
      // Success — upgradeToPro has already flipped is_paid in-session, so the UI
      // reflects Pro automatically. Surface the migration tally so the user knows
      // what synced. (revert-on-failure is handled in catch; nothing to undo here.)
      haptics.success();
      const parts = [t('settings:profile.uploadedItemsBackedUp', { count: outcome.uploaded })];
      if (outcome.skipped > 0) {
        parts.push(t('settings:profile.skippedItemsStayedOnDevice', { count: outcome.skipped }));
      }
      Alert.alert(t('settings:profile.youreProNowTitle'), parts.join('\n\n'));
    } catch (err) {
      // Transient (network/5xx) failure. upgradeToPro flips is_paid LAST, so the
      // user is still Free and the local data is untouched — the UI reverts on
      // its own (is_paid never changed). Offer a resume (the upload is resumable
      // + idempotent via the migration ledger, so re-running finishes the rest).
      haptics.error();
      Alert.alert(
        t('settings:profile.upgradeIncompleteTitle'),
        (err instanceof Error ? err.message : t('settings:profile.couldNotBackUpToCloud')) +
          t('settings:profile.dataSafeTryAgain'),
        [
          { text: t('settings:profile.notNow'), style: 'cancel' },
          { text: t('settings:profile.tryAgain'), onPress: () => { void handleUpgrade(); } },
        ]
      );
    } finally {
      setIsUpgrading(false);
      setUpgradeProgress(null);
    }
  }, [isUpgrading, isPro, upgradeToPro]);

  const handleDowngrade = useCallback(() => {
    if (isUpgrading || !isPro) return;
    Alert.alert(
      t('settings:profile.switchToFreeTitle'),
      t('settings:profile.switchToFreeMessage'),
      [
        { text: t('settings:profile.stayOnPro'), style: 'cancel' },
        {
          text: t('settings:profile.switchToFree'),
          style: 'destructive',
          onPress: async () => {
            haptics.warning();
            try {
              await downgradeToFree();
            } catch (err) {
              Alert.alert(
                t('settings:profile.couldNotSwitchToFreeTitle'),
                err instanceof Error ? err.message : t('settings:profile.pleaseTryAgain')
              );
            }
          },
        },
      ]
    );
  }, [isUpgrading, isPro, downgradeToFree]);

  return (
    <View style={[
      styles.card,
      { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
    ]}>
      {/* TICKET-096: customizable Peak Pals avatar — tap to edit. */}
      <Pressable
        onPress={onEditAvatar}
        accessibilityRole="button"
        accessibilityLabel={t('settings:profile.editAvatar')}
        style={{ marginBottom: spacing.s3 }}
      >
        <PeakAvatar config={avatar} size={84} ring={theme.colors.borderDefault} />
        <View style={{ position: 'absolute', right: -2, bottom: 0, backgroundColor: theme.colors.accentDefault, borderColor: theme.colors.bgSecondary, borderWidth: 2, borderRadius: 999, width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="pencil" size={11} color={theme.components.buttonPrimaryText} />
        </View>
      </Pressable>

      {/* P3a: editable display name */}
      {editingName ? (
        <View style={styles.nameEditRow}>
          <View style={styles.nameEditInput}>
            <PFInput
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder={t('settings:profile.yourNamePlaceholder')}
              autoFocus
              maxLength={40}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={saveName}
              editable={!savingName}
              accessibilityLabel={t('settings:profile.editDisplayName')}
            />
          </View>
          <TouchableOpacity
            onPress={saveName}
            disabled={savingName}
            style={[styles.nameEditBtn, { backgroundColor: theme.colors.accentDefault }]}
            accessibilityRole="button"
            accessibilityLabel={t('settings:profile.saveName')}
          >
            {savingName ? (
              <ActivityIndicator size="small" color={theme.components.buttonPrimaryText} />
            ) : (
              <Ionicons name="checkmark" size={18} color={theme.components.buttonPrimaryText} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={cancelEditName}
            disabled={savingName}
            style={[styles.nameEditBtn, { borderColor: theme.colors.borderDefault, borderWidth: 1 }]}
            accessibilityRole="button"
            accessibilityLabel={t('settings:profile.cancelEditingName')}
          >
            <Ionicons name="close" size={18} color={theme.colors.textTertiary} />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          onPress={beginEditName}
          style={styles.nameDisplayRow}
          accessibilityRole="button"
          accessibilityLabel={user?.display_name ? t('settings:profile.editNameCurrently', { name: user.display_name }) : t('settings:profile.addYourName')}
        >
          <Text style={[styles.displayName, { color: user?.display_name ? theme.colors.textPrimary : theme.colors.textTertiary }]}>
            {user?.display_name || t('settings:profile.addYourName')}
          </Text>
          <Ionicons name="pencil" size={14} color={theme.colors.textTertiary} style={styles.nameEditPencil} />
        </TouchableOpacity>
      )}

      <Text style={[styles.email, { color: theme.colors.textSecondary }]}>{user?.email ?? '—'}</Text>

      {/* Tier badge */}
      <View style={[
        styles.tierBadge,
        isPro
          ? { backgroundColor: theme.colors.accentSecondary }
          : { backgroundColor: theme.colors.bgPrimary, borderWidth: 1, borderColor: theme.colors.borderDefault },
      ]}>
        <Text style={[
          styles.tierText,
          isPro
            ? { color: theme.colors.accentHover }
            : { color: theme.colors.textTertiary },
        ]}>
          {isPro ? t('settings:profile.proTag') : t('settings:profile.freeTag')}
        </Text>
      </View>

      {/* Phase 6 — Pro toggle. Tier-aware storage copy + an upgrade/downgrade
          action. "Pro for now" — there is intentionally NO payment flow. */}
      <Text style={[styles.tierStorageCopy, { color: theme.colors.textTertiary }]}>
        {isPro
          ? t('settings:profile.syncedAcrossDevices')
          : t('settings:profile.storedOnThisDevice')}
      </Text>

      {isUpgrading ? (
        <View
          style={styles.tierUpgradingBox}
          accessibilityRole="progressbar"
          accessibilityLabel={t('settings:profile.backingUpToCloud')}
        >
          <ActivityIndicator color={theme.colors.accentDefault} />
          <Text style={[styles.tierUpgradingText, { color: theme.colors.textSecondary }]}>
            {t('settings:profile.backingUpToCloudEllipsis')}
          </Text>
          {upgradeProgress && upgradeProgress.total > 0 ? (
            <Text style={[styles.tierUpgradingMeta, { color: theme.colors.textTertiary }]}>
              {Math.min(upgradeProgress.done, upgradeProgress.total)} / {upgradeProgress.total}
            </Text>
          ) : null}
        </View>
      ) : isPro ? (
        <TouchableOpacity
          onPress={handleDowngrade}
          style={[styles.tierActionGhost, { borderColor: theme.colors.borderDefault }]}
          accessibilityRole="button"
          accessibilityLabel={t('settings:profile.switchToFreePlan')}
        >
          <Text style={[styles.tierActionGhostText, { color: theme.colors.textSecondary }]}>
            {t('settings:profile.switchToFree')}
          </Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={handleUpgrade}
          style={[styles.tierActionPrimary, { backgroundColor: theme.colors.accentDefault }]}
          accessibilityRole="button"
          accessibilityLabel={t('settings:profile.upgradeToProAndSync')}
        >
          <Ionicons name="cloud-upload-outline" size={16} color={theme.components.buttonPrimaryText} />
          <Text style={[styles.tierActionPrimaryText, { color: theme.components.buttonPrimaryText }]}>
            {t('settings:profile.upgradeToPro')}
          </Text>
        </TouchableOpacity>
      )}

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
  const { t } = useTranslation();
  const isLbs = currentPref === 'lbs';

  return (
    <View style={styles.settingRow}>
      <View style={styles.settingLabelGroup}>
        <Text style={[styles.settingLabel, { color: theme.colors.textPrimary }]}>{t('settings:profile.units')}</Text>
        <Text style={[styles.settingMeta, { color: theme.colors.textTertiary }]}>
          {isLbs ? t('settings:profile.poundsLbs') : t('settings:profile.kilogramsKg')}
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
            accessibilityLabel={t('settings:profile.switchToKg')}
          >
            <Text style={[
              styles.unitButtonText,
              { color: theme.colors.textTertiary },
              !isLbs && { color: theme.components.buttonPrimaryText },
            ]}>
              {t('settings:profile.kgShort')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.unitButton,
              isLbs && { backgroundColor: theme.colors.accentDefault },
            ]}
            onPress={() => onChange('lbs')}
            accessibilityRole="button"
            accessibilityLabel={t('settings:profile.switchToLbs')}
          >
            <Text style={[
              styles.unitButtonText,
              { color: theme.colors.textTertiary },
              isLbs && { color: theme.components.buttonPrimaryText },
            ]}>
              {t('settings:profile.lbsShort')}
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
  const { t } = useTranslation();
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
              <Text style={[addConstraintStyles.headerTitle, { color: theme.colors.textPrimary }]}>{t('settings:profile.addRestriction')}</Text>
              <TouchableOpacity
                style={addConstraintStyles.closeButton}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={t('settings:profile.close')}
              >
                <Text style={[addConstraintStyles.closeButtonText, { color: theme.colors.accentDefault }]}>{t('settings:profile.cancel')}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={addConstraintStyles.scrollContent} keyboardShouldPersistTaps="handled">
              <Text style={[addConstraintStyles.note, { color: theme.colors.textTertiary }]}>
                {t('settings:profile.constraintNote')}
              </Text>

              {/* Preset chips */}
              <Text style={[addConstraintStyles.chipSectionLabel, { color: theme.colors.textTertiary }]}>{t('settings:profile.quickAdd')}</Text>
              <View style={addConstraintStyles.chipsWrap}>
                {PRESET_CONSTRAINTS.map(({ type, labelKey }) => {
                  const alreadyAdded = existingTypes.has(type);
                  const label = t(labelKey as any);
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
                        alreadyAdded ? t('settings:profile.alreadyAdded', { label }) : t('settings:profile.addLabel', { label })
                      }
                    >
                      <Text
                        style={[
                          addConstraintStyles.chipText,
                          { color: theme.colors.textSecondary },
                          alreadyAdded && { color: theme.colors.accentHover },
                        ]}
                      >
                        {alreadyAdded ? t('settings:profile.alreadyAddedCheck', { label }) : label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* P2-006: PFInput replaces raw TextInput for custom restriction */}
              <Text style={[addConstraintStyles.chipSectionLabel, { color: theme.colors.textTertiary }]}>{t('settings:profile.customRestriction')}</Text>
              <PFInput
                placeholder={t('settings:profile.customRestrictionPlaceholder')}
                value={customNote}
                onChangeText={setCustomNote}
                multiline
                numberOfLines={3}
                returnKeyType="done"
                accessibilityLabel={t('settings:profile.customRestrictionNoteLabel')}
              />
              <TouchableOpacity
                style={[
                  addConstraintStyles.saveButton,
                  { backgroundColor: theme.colors.accentDefault },
                  (customNote.trim().length === 0 || isSaving) && addConstraintStyles.saveButtonDisabled,
                ]}
                onPress={handleCustom}
                accessibilityRole="button"
                accessibilityLabel={t('settings:profile.saveConstraint')}
                disabled={customNote.trim().length === 0 || isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color={theme.components.buttonPrimaryText} />
                ) : (
                  <Text style={[addConstraintStyles.saveButtonText, { color: theme.components.buttonPrimaryText }]}>{t('settings:profile.addCustomRestriction')}</Text>
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
  const { t } = useTranslation();
  const router = useRouter();
  const { startTour } = useTour(); // TICKET-095: replay welcome tour

  // Map camelCase theme keys to display names for the Appearance row
  const THEME_DISPLAY_NAMES: Record<string, string> = {
    deepOcean: 'Deep Ocean',
    ember: 'Ember',
    forest: 'Forest',
    midnight: 'Midnight',
    monochrome: 'Mono',
  };
  const activeThemeDisplayName = THEME_DISPLAY_NAMES[themeName] ?? 'Deep Ocean';

  // Default the toggle to the user's saved unit, else the locale default
  // (US → lbs, else kg). This only sets the INITIAL displayed value when no
  // explicit choice exists; tapping the toggle persists an explicit choice that
  // always wins thereafter.
  const [unitPref, setUnitPref] = useState<'kg' | 'lbs'>(user?.unit_pref ?? defaultUnitForLocale());
  const [isUpdatingUnit, setIsUpdatingUnit] = useState(false);

  // Option C — 1RM confirmation preference (TICKET-041)
  const [use1rmConfirmation, setUse1rmConfirmation] = useState(
    user?.use_1rm_confirmation ?? false
  );
  const [isUpdating1rm, setIsUpdating1rm] = useState(false);

  // Default rest timer setting (seconds)
  const REST_TIMER_PRESETS = [60, 90, 120, 150, 180, 240] as const;
  const [restTimerDefault, setRestTimerDefault] = useState<number>(120);
  const [isUpdatingRestTimer, setIsUpdatingRestTimer] = useState(false);
  useEffect(() => {
    getRestTimerDefaultSec().then(setRestTimerDefault).catch(() => {});
  }, []);

  // TICKET-128: effort display (RIR ⇄ RPE) — local-only, zero-network, no
  // schema. Defaults to 'rir' (unchanged behavior) until the on-device
  // setting loads.
  const [effortDisplayPref, setEffortDisplayPref] = useState<EffortDisplay>('rir');
  const [isUpdatingEffortDisplay, setIsUpdatingEffortDisplay] = useState(false);
  useEffect(() => {
    getEffortDisplay().then(setEffortDisplayPref).catch(() => {});
  }, []);

  // TICKET-144 acceptance criterion 2: grouped-set (superset/circuit) rest
  // mode — fire the rest timer after a full round (default) or after every
  // exercise transition within the group. Local-only KV read/write, zero
  // network, same shape as effortDisplayPref above.
  const [groupRestModePref, setGroupRestModePref] = useState<GroupRestMode>('after_round');
  const [isUpdatingGroupRestMode, setIsUpdatingGroupRestMode] = useState(false);
  useEffect(() => {
    getGroupRestMode().then(setGroupRestModePref).catch(() => {});
  }, []);

  // TICKET-141: on-device next-load suggestions — off by default (ships dark;
  // flips to default-on only after the founder's self-test week).
  const [autoregEnabled, setAutoregEnabled] = useState(false);
  useEffect(() => {
    getAutoregSuggestionsEnabled().then(setAutoregEnabled).catch(() => {});
  }, []);

  // TICKET-146: app language override — same optimistic-update / local-only
  // pattern as effortDisplayPref / groupRestModePref above. 'system' default;
  // 'pseudo' only ever offered in __DEV__ builds (see the chips row below).
  const [languagePref, setLanguagePref] = useState<AppLanguage>('system');
  const [isUpdatingLanguage, setIsUpdatingLanguage] = useState(false);
  useEffect(() => {
    getAppLanguage().then(setLanguagePref).catch(() => {});
  }, []);

  const handleLanguageChange = useCallback(
    async (lang: AppLanguage) => {
      const prev = languagePref;
      if (lang === prev) return;
      setLanguagePref(lang); // optimistic
      setIsUpdatingLanguage(true);
      try {
        await setAppLanguageAndApply(lang);
      } catch (err) {
        setLanguagePref(prev);
        Alert.alert(
          t('settings:profile.couldNotSavePreferenceTitle'),
          err instanceof Error ? err.message : t('settings:profile.couldNotSaveYourSetting')
        );
      } finally {
        setIsUpdatingLanguage(false);
      }
    },
    [languagePref, t]
  );

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

  // BUGFIX 2026-06-30 (Bug 3, FIX-LIFECYCLE pattern): guard post-await setState on
  // the sign-out / delete-account paths. logout() unmounts this screen (redirect
  // to /(auth)/login), so a setState that resolves after the await would fire on
  // an unmounted component — the "glitchy" flicker. Gate those setStates on this.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  // TICKET-096: avatar config + customizer.
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig | null>(null);
  const [avatarEditorVisible, setAvatarEditorVisible] = useState(false);
  useEffect(() => { loadAvatar().then(setAvatarConfig).catch(() => {}); }, []);
  const handleAvatarSaved = useCallback((cfg: AvatarConfig) => {
    setAvatarConfig(cfg);
    setAvatarEditorVisible(false);
    saveAvatar(cfg).catch(() => {});
  }, []);

  // S3-14: reload on mount AND whenever the user (login / tier switch) changes,
  // not only once on mount. (Effect precedes the loadConstraints useCallback, so
  // we key on `user` — its sole dependency — rather than the callback identity.)
  useEffect(() => {
    loadConstraints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadConstraints = useCallback(async () => {
    setConstraintsLoading(true);
    setConstraintsError(null);
    try {
      if (isLocalFirst(user)) {
        // Free / local-first: read from on-device user_constraints table.
        const rows = await localDb.getAll<{
          constraint_id: string;
          user_id: string;
          constraint_type: string;
          custom_note: string | null;
          created_at: string;
        }>('SELECT * FROM user_constraints WHERE user_id = ? OR user_id = \'local\' ORDER BY created_at ASC', [user?.id ?? 'local']);
        setConstraints(
          rows.map((r) => ({
            id: r.constraint_id,
            user_id: r.user_id,
            constraint_type: r.constraint_type,
            custom_note: r.custom_note,
            created_at: r.created_at,
          }))
        );
      } else {
        const data = await getConstraints();
        setConstraints(data);
      }
    } catch (err) {
      setConstraintsError(
        err instanceof Error ? err.message : t('settings:profile.failedToLoadRestrictions')
      );
    } finally {
      setConstraintsLoading(false);
    }
  }, [user]);

  // ── B. Units toggle ──────────────────────────────────────────────────────

  const handleUnitChange = useCallback(
    async (pref: 'kg' | 'lbs') => {
      const prev = unitPref;
      if (pref === prev) return;
      setUnitPref(pref); // optimistic
      setIsUpdatingUnit(true);
      try {
        // Tier-branched: free → local user_profile, Pro → PATCH /user/profile.
        await saveProfile(user, { unit_pref: pref }, updateUser);
      } catch (err) {
        // Revert optimistic update and tell the user what went wrong (D-3).
        setUnitPref(prev);
        const msg =
          err != null && typeof err === 'object' && 'response' in err
            ? ((err as { response?: { data?: { message?: string; error?: string } } }).response?.data?.message ??
               (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
               t('settings:profile.couldNotSaveUnitPreference'))
            : err instanceof Error
            ? err.message
            : t('settings:profile.couldNotSaveUnitPreference');
        Alert.alert(t('settings:profile.couldNotSavePreferenceTitle'), msg);
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
        await saveProfile(user, { use_1rm_confirmation: value }, updateUser);
      } catch (err) {
        // Revert on failure and surface a real error (D-3).
        setUse1rmConfirmation(!value);
        Alert.alert(
          t('settings:profile.couldNotSavePreferenceTitle'),
          err instanceof Error ? err.message : t('settings:profile.couldNotSaveYourSetting')
        );
      } finally {
        setIsUpdating1rm(false);
      }
    },
    [user, updateUser]
  );

  // ── B3. Notification toggles ─────────────────────────────────────────────

  const handleStreakNotifToggle = useCallback(
    async (value: boolean) => {
      setStreakNotifEnabled(value); // optimistic
      try {
        await saveProfile(user, { streak_notifications_enabled: value }, updateUser);
      } catch (err) {
        // Revert + surface failure (D-3) — never leave a toggle looking saved.
        setStreakNotifEnabled(!value);
        Alert.alert(
          t('settings:profile.couldNotSavePreferenceTitle'),
          err instanceof Error ? err.message : t('settings:profile.couldNotSaveNotificationSetting')
        );
      }
    },
    [user, updateUser]
  );

  const handlePlanNotifToggle = useCallback(
    async (value: boolean) => {
      setPlanNotifEnabled(value); // optimistic
      try {
        await saveProfile(user, { plan_notifications_enabled: value }, updateUser);
      } catch (err) {
        setPlanNotifEnabled(!value);
        Alert.alert(
          t('settings:profile.couldNotSavePreferenceTitle'),
          err instanceof Error ? err.message : t('settings:profile.couldNotSaveNotificationSetting')
        );
      }
    },
    [user, updateUser]
  );

  // ── B4. Default rest timer ───────────────────────────────────────────────

  const handleRestTimerPreset = useCallback(
    async (sec: number) => {
      const prev = restTimerDefault;
      if (sec === prev) return;
      setRestTimerDefault(sec); // optimistic
      setIsUpdatingRestTimer(true);
      try {
        await setRestTimerDefaultSec(sec);
      } catch (err) {
        setRestTimerDefault(prev);
        Alert.alert(
          t('settings:profile.couldNotSavePreferenceTitle'),
          err instanceof Error ? err.message : t('settings:profile.couldNotSaveRestTimerSetting')
        );
      } finally {
        setIsUpdatingRestTimer(false);
      }
    },
    [restTimerDefault]
  );

  // ── B5. Effort display — RIR ⇄ RPE (TICKET-128) ──────────────────────────
  // Display-only: sets.rir is ALWAYS what gets stored (see loggerLogic.ts's
  // rirToRpe/rpeToRir/formatEffort) — this toggle just relabels the same value.

  const handleEffortDisplayToggle = useCallback(
    async (value: boolean) => {
      const next: EffortDisplay = value ? 'rpe' : 'rir';
      const prev = effortDisplayPref;
      if (next === prev) return;
      setEffortDisplayPref(next); // optimistic
      setIsUpdatingEffortDisplay(true);
      try {
        await setEffortDisplay(next);
      } catch (err) {
        setEffortDisplayPref(prev);
        Alert.alert(
          t('settings:profile.couldNotSavePreferenceTitle'),
          err instanceof Error ? err.message : t('settings:profile.couldNotSaveEffortDisplaySetting')
        );
      } finally {
        setIsUpdatingEffortDisplay(false);
      }
    },
    [effortDisplayPref]
  );

  // ── B6. Grouped-set (superset/circuit) rest mode (TICKET-144) ───────────
  // 'after_round' (default) — rest fires only once the whole round is done.
  // 'after_exercise' — rest also fires on every exercise transition WITHIN
  // the group (mid-round). Non-grouped exercises are unaffected either way
  // (loggerLogic.ts's restAfterSet only branches on this mode for grouped
  // exercises).

  const handleGroupRestModeChange = useCallback(
    async (mode: GroupRestMode) => {
      const prev = groupRestModePref;
      if (mode === prev) return;
      setGroupRestModePref(mode); // optimistic
      setIsUpdatingGroupRestMode(true);
      try {
        await setGroupRestMode(mode);
      } catch (err) {
        setGroupRestModePref(prev);
        Alert.alert(
          t('settings:profile.couldNotSavePreferenceTitle'),
          err instanceof Error ? err.message : t('settings:profile.couldNotSaveSupersetRestSetting')
        );
      } finally {
        setIsUpdatingGroupRestMode(false);
      }
    },
    [groupRestModePref]
  );

  // ── C. Constraints ───────────────────────────────────────────────────────

  const handleAddConstraint = useCallback(
    async (constraintType: string, customNote?: string) => {
      if (isLocalFirst(user)) {
        // Free / local-first: insert into on-device user_constraints table.
        const id = genId();
        const now = new Date().toISOString();
        const userId = user?.id ?? 'local';
        await localDb.execute(
          `INSERT OR IGNORE INTO user_constraints (constraint_id, user_id, constraint_type, custom_note, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [id, userId, constraintType, customNote ?? null, now],
          { tables: ['user_constraints'] }
        );
        setConstraints((prev) => [
          ...prev,
          {
            id,
            user_id: userId,
            constraint_type: constraintType,
            custom_note: customNote ?? null,
            created_at: now,
          },
        ]);
      } else {
        const added = await addConstraint({
          constraintType,
          ...(customNote ? { customNote } : {}),
        });
        setConstraints((prev) => [...prev, added]);
      }
    },
    [user]
  );

  const handleDeleteConstraint = useCallback((constraint: UserConstraint) => {
    Alert.alert(
      t('settings:profile.removeRestrictionTitle'),
      t('settings:profile.removeRestrictionMessage', { name: constraint.custom_note ?? constraint.constraint_type.replace(/_/g, ' ') }),
      [
        { text: t('settings:profile.cancel'), style: 'cancel' },
        {
          text: t('settings:profile.remove'),
          style: 'destructive',
          onPress: async () => {
            try {
              if (isLocalFirst(user)) {
                // Free / local-first: delete from on-device table.
                await localDb.execute(
                  'DELETE FROM user_constraints WHERE constraint_id = ?',
                  [constraint.id],
                  { tables: ['user_constraints'] }
                );
              } else {
                await deleteConstraint(constraint.id);
              }
              setConstraints((prev) => prev.filter((c) => c.id !== constraint.id));
            } catch (err) {
              Alert.alert(
                t('settings:profile.errorTitle'),
                err instanceof Error ? err.message : t('settings:profile.failedToRemoveRestriction')
              );
            }
          },
        },
      ]
    );
  }, [user]);

  // ── D. Data export ───────────────────────────────────────────────────────

  const handleDataExport = useCallback(async () => {
    setIsExportingData(true);
    try {
      let json: string;
      if (isLocalFirst(user)) {
        // Free / local-first: build the export directly from on-device SQLite.
        const workouts = await localDb.getAll<Record<string, unknown>>(
          'SELECT * FROM workouts ORDER BY day_key DESC'
        );
        const sets = await localDb.getAll<Record<string, unknown>>(
          'SELECT * FROM sets ORDER BY logged_at DESC'
        );
        const constraints = await localDb.getAll<Record<string, unknown>>(
          'SELECT * FROM user_constraints ORDER BY created_at ASC'
        );
        json = JSON.stringify({ workouts, sets, constraints, exported_at: new Date().toISOString() }, null, 2);
      } else {
        json = await fetchDataExport();
      }
      await Share.share(
        {
          title: 'Peak Fettle data export',
          message: json,
        },
        { dialogTitle: 'Save or share your Peak Fettle data' }
      );
    } catch (err) {
      Alert.alert(
        t('settings:profile.exportFailedTitle'),
        err instanceof Error ? err.message : t('settings:profile.couldNotExportData')
      );
    } finally {
      setIsExportingData(false);
    }
  }, [user, t]);

  // ── D. Account deletion ──────────────────────────────────────────────────

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      t('settings:profile.deleteAccountConfirmTitle'),
      t('settings:profile.deleteAccountConfirmMessage'),
      [
        { text: t('settings:profile.cancel'), style: 'cancel' },
        {
          text: t('settings:profile.deleteMyAccount'),
          style: 'destructive',
          onPress: () => {
            haptics.warning(); // E-006: destructive confirmation
            // Second confirmation — belt-and-suspenders
            Alert.alert(
              t('settings:profile.areYouSureTitle'),
              t('settings:profile.areYouSureMessage'),
              [
                { text: t('settings:profile.noKeepMyAccount'), style: 'cancel' },
                {
                  text: t('settings:profile.yesDeleteEverything'),
                  style: 'destructive',
                  onPress: async () => {
                    setIsDeletingAccount(true);
                    try {
                      if (isLocalFirst(user)) {
                        // Free / local-first: there is NO server account to delete.
                        // Wipe all on-device personal data (+ session bookkeeping
                        // + onboarding flags), then sign out — never a REST call.
                        // BUGFIX 2026-06-30 (Bug 3): use the shared teardown so the
                        // outbox / migration_state ledger / onboarding flags are
                        // cleared too, not only BACKUP_TABLES. (logout() below runs
                        // it as well, but doing it here first guarantees the wipe
                        // even if the redirect races.) Best-effort + never throws.
                        await clearAllLocalPersonalData();
                      } else {
                        await deleteAccount('DELETE MY ACCOUNT');
                      }
                      // logout() clears auth state, runs the full local teardown,
                      // and redirects to login.
                      await logout();
                    } catch (err) {
                      if (mountedRef.current) setIsDeletingAccount(false);
                      Alert.alert(
                        t('settings:profile.deletionFailedTitle'),
                        err instanceof Error ? err.message : t('settings:profile.couldNotDeleteAccount')
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
  }, [logout, user, t]);

  // ── E. Sign out ──────────────────────────────────────────────────────────

  const handleSignOut = useCallback(() => {
    Alert.alert(t('settings:profile.signOutTitle'), t('settings:profile.signOutMessage'), [
      { text: t('settings:profile.cancel'), style: 'cancel' },
      {
        text: t('settings:profile.signOutLabel'),
        style: 'destructive',
        onPress: async () => {
          haptics.warning(); // E-006: destructive confirmation
          setIsSigningOut(true);
          try {
            await logout();
          } finally {
            // logout() redirects to /(auth)/login and unmounts this screen —
            // only touch state if we're somehow still mounted (avoids the
            // setState-after-unmount "glitchy" flicker). BUGFIX 2026-06-30 Bug 3.
            if (mountedRef.current) setIsSigningOut(false);
          }
        },
      },
    ]);
  }, [logout, t]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    // P2-005: ScreenLayout replaces bare ScrollView root — provides SafeAreaView
    // and bgPrimary background. horizontalPadding={false}: scrollContent manages
    // its own 20pt padding so list items fill edge-to-edge.
    <ScreenLayout scrollable horizontalPadding={false} contentStyle={styles.scrollContent}>
      {/* ── A. User info card ── */}
      <UserInfoCard avatar={avatarConfig} onEditAvatar={() => setAvatarEditorVisible(true)} />

      {/* ── TICKET-125: LifeOS companion card ── */}
      <LifeOSCard />

      {/* ── B. Settings ── */}
      <View style={styles.section}>
        <SectionHeader label={t('settings:profile.settingsSectionHeader')} />
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
              <Text style={[styles.settingLabel, { color: theme.colors.textPrimary }]}>{t('settings:profile.confirmEstimatedMaxes')}</Text>
              <Text style={[styles.settingMeta, { color: theme.colors.textTertiary }]}>
                {t('settings:profile.confirmEstimatedMaxesMeta')}
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
                accessibilityLabel={t('settings:profile.confirmEstimatedMaxes')}
              />
            )}
          </View>

          {/* Default rest timer preset row */}
          <View style={[
            styles.settingRow,
            styles.settingRowTop,
            styles.restTimerRow,
            { borderTopColor: theme.colors.borderDefault },
          ]}>
            <View style={styles.settingLabelGroup}>
              <Text style={[styles.settingLabel, { color: theme.colors.textPrimary }]}>{t('settings:profile.defaultRestTimer')}</Text>
              <Text style={[styles.settingMeta, { color: theme.colors.textTertiary }]}>
                {t('settings:profile.secondsBetweenSets', { sec: restTimerDefault })}
              </Text>
            </View>
            {isUpdatingRestTimer ? (
              <ActivityIndicator color={theme.colors.accentDefault} style={styles.toggleSpinner} />
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.restTimerPresetsContent}
                style={styles.restTimerPresets}
              >
                {REST_TIMER_PRESETS.map((sec) => {
                  const selected = restTimerDefault === sec;
                  return (
                    <TouchableOpacity
                      key={sec}
                      style={[
                        styles.restTimerChip,
                        { borderColor: theme.colors.borderDefault },
                        selected && { backgroundColor: theme.colors.accentDefault, borderColor: theme.colors.accentDefault },
                      ]}
                      onPress={() => handleRestTimerPreset(sec)}
                      accessibilityRole="button"
                      accessibilityLabel={t('settings:profile.setRestTimerTo', { sec })}
                      accessibilityState={{ selected }}
                    >
                      <Text style={[
                        styles.restTimerChipText,
                        { color: theme.colors.textTertiary },
                        selected && { color: theme.components.buttonPrimaryText },
                      ]}>
                        {(sec % 60 === 0) ? t('settings:profile.restTimerMinutesShort', { min: sec / 60 }) : t('settings:profile.restTimerSecondsShort', { sec })}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* Effort display: RIR ⇄ RPE (TICKET-128) — sets.rir is always what
              gets stored; this only changes how it's labeled/entered. */}
          <View style={[
            styles.settingRow,
            styles.settingRowTop,
            { borderTopColor: theme.colors.borderDefault },
          ]}>
            <View style={styles.settingLabelGroup}>
              <Text style={[styles.settingLabel, { color: theme.colors.textPrimary }]}>
                {t('settings:profile.showEffortAsRpe')}
              </Text>
              <Text style={[styles.settingMeta, { color: theme.colors.textTertiary }]}>
                {t('settings:profile.effortDisplayMeta')}
              </Text>
            </View>
            {isUpdatingEffortDisplay ? (
              <ActivityIndicator color={theme.colors.accentDefault} style={styles.toggleSpinner} />
            ) : (
              <Switch
                value={effortDisplayPref === 'rpe'}
                onValueChange={handleEffortDisplayToggle}
                trackColor={{ false: theme.colors.borderDefault, true: theme.colors.accentDefault }}
                thumbColor={effortDisplayPref === 'rpe' ? theme.colors.accentDefault : theme.colors.textTertiary}
                accessibilityLabel={t('settings:profile.showEffortAsRpeLabel')}
              />
            )}
          </View>

          {/* TICKET-144: grouped-set (superset/circuit) rest mode — same chip-row
              pattern as the rest-timer presets above (two choices, no Switch,
              since neither option is an on/off "default"). */}
          <View style={[
            styles.settingRow,
            styles.settingRowTop,
            styles.restTimerRow,
            { borderTopColor: theme.colors.borderDefault },
          ]}>
            <View style={styles.settingLabelGroup}>
              <Text style={[styles.settingLabel, { color: theme.colors.textPrimary }]}>{t('settings:profile.supersetRest')}</Text>
              <Text style={[styles.settingMeta, { color: theme.colors.textTertiary }]}>
                {groupRestModePref === 'after_exercise'
                  ? t('settings:profile.restAfterEveryExercise')
                  : t('settings:profile.restAfterEachRound')}
              </Text>
            </View>
            {isUpdatingGroupRestMode ? (
              <ActivityIndicator color={theme.colors.accentDefault} style={styles.toggleSpinner} />
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.restTimerPresetsContent}
                style={styles.restTimerPresets}
              >
                {([
                  { mode: 'after_round' as GroupRestMode, labelKey: 'settings:profile.afterEachRound' },
                  { mode: 'after_exercise' as GroupRestMode, labelKey: 'settings:profile.afterEveryExercise' },
                ]).map(({ mode, labelKey }) => {
                  const selected = groupRestModePref === mode;
                  const label = t(labelKey as any);
                  return (
                    <TouchableOpacity
                      key={mode}
                      style={[
                        styles.restTimerChip,
                        { borderColor: theme.colors.borderDefault },
                        selected && { backgroundColor: theme.colors.accentDefault, borderColor: theme.colors.accentDefault },
                      ]}
                      onPress={() => handleGroupRestModeChange(mode)}
                      accessibilityRole="button"
                      accessibilityLabel={t('settings:profile.supersetRestLabel', { label })}
                      accessibilityState={{ selected }}
                    >
                      <Text style={[
                        styles.restTimerChipText,
                        { color: theme.colors.textTertiary },
                        selected && { color: theme.components.buttonPrimaryText },
                      ]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* TICKET-141: suggested next loads (engine rules, zero network). */}
          <View style={[
            styles.settingRow,
            styles.settingRowTop,
            { borderTopColor: theme.colors.borderDefault },
          ]}>
            <View style={styles.settingLabelGroup}>
              <Text style={[styles.settingLabel, { color: theme.colors.textPrimary }]}>
                {t('settings:profile.suggestedNextLoads')}
              </Text>
              <Text style={[styles.settingMeta, { color: theme.colors.textTertiary }]}>
                {t('settings:profile.suggestedNextLoadsMeta')}
              </Text>
            </View>
            <Switch
              value={autoregEnabled}
              onValueChange={async (v) => {
                setAutoregEnabled(v);
                try { await setAutoregSuggestionsEnabled(v); } catch { setAutoregEnabled(!v); }
              }}
              trackColor={{ false: theme.colors.borderDefault, true: theme.colors.accentDefault }}
              thumbColor={autoregEnabled ? theme.colors.accentDefault : theme.colors.textTertiary}
              accessibilityLabel={t('settings:profile.enableSuggestedNextLoads')}
            />
          </View>

          {/* TICKET-146: language override row — same chip-row pattern as
              "Superset rest" above (two-plus discrete choices, no Switch). */}
          <View style={[
            styles.settingRow,
            styles.settingRowTop,
            { borderTopColor: theme.colors.borderDefault },
          ]}>
            <View style={styles.settingLabelGroup}>
              <Text style={[styles.settingLabel, { color: theme.colors.textPrimary }]}>
                {t('settings:language.label')}
              </Text>
              <Text style={[styles.settingMeta, { color: theme.colors.textTertiary }]}>
                {t('settings:language.meta')}
              </Text>
            </View>
            {isUpdatingLanguage ? (
              <ActivityIndicator color={theme.colors.accentDefault} style={styles.toggleSpinner} />
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.restTimerPresetsContent}
                style={styles.restTimerPresets}
              >
                {([
                  { lang: 'system' as AppLanguage, labelKey: 'settings:language.system' },
                  { lang: 'en' as AppLanguage, labelKey: 'settings:language.english' },
                  ...(__DEV__ ? [{ lang: 'pseudo' as AppLanguage, labelKey: 'settings:language.pseudo' }] : []),
                ]).map(({ lang, labelKey }) => {
                  const selected = languagePref === lang;
                  const label = t(labelKey as any);
                  return (
                    <TouchableOpacity
                      key={lang}
                      style={[
                        styles.restTimerChip,
                        { borderColor: theme.colors.borderDefault },
                        selected && { backgroundColor: theme.colors.accentDefault, borderColor: theme.colors.accentDefault },
                      ]}
                      onPress={() => handleLanguageChange(lang)}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                      accessibilityState={{ selected }}
                    >
                      <Text style={[
                        styles.restTimerChipText,
                        { color: theme.colors.textTertiary },
                        selected && { color: theme.components.buttonPrimaryText },
                      ]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </View>


      {/* ── Training ── */}
      <View style={styles.section}>
        <SectionHeader label={t('settings:profile.trainingSectionHeader')} />
        <View style={[
          styles.settingsCard,
          { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
        ]}>
          {/* Training profile — survey for Training Engine */}
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => router.push('/training-survey')}
            accessibilityRole="button"
            accessibilityLabel={t('settings:profile.editTrainingProfile')}
          >
            <View style={styles.settingLabelGroup}>
              <Text style={[styles.settingLabel, { color: theme.colors.textPrimary }]}>{t('settings:profile.trainingProfile')}</Text>
              <Text style={[styles.settingMeta, { color: theme.colors.textTertiary }]}>
                {t('settings:profile.trainingProfileMeta')}
              </Text>
            </View>
            <Text style={[styles.settingChevron, { color: theme.colors.textTertiary }]}>›</Text>
          </TouchableOpacity>

          {/* Readiness & recovery — Agent D screen */}
          <TouchableOpacity
            style={[styles.settingRow, styles.settingRowBordered, styles.settingRowTop,
              { borderTopColor: theme.colors.borderDefault, borderBottomColor: theme.colors.borderDefault }]}
            onPress={() => router.push('/insights')}
            accessibilityRole="button"
            accessibilityLabel={t('settings:profile.viewReadinessAndRecovery')}
          >
            <View style={styles.settingLabelGroup}>
              <Text style={[styles.settingLabel, { color: theme.colors.textPrimary }]}>{t('settings:profile.readinessAndRecovery')}</Text>
              <Text style={[styles.settingMeta, { color: theme.colors.textTertiary }]}>
                {t('settings:profile.readinessAndRecoveryMeta')}
              </Text>
            </View>
            <Text style={[styles.settingChevron, { color: theme.colors.textTertiary }]}>›</Text>
          </TouchableOpacity>

          {/* Export my data — Agent D screen */}
          <TouchableOpacity
            style={[styles.settingRow, styles.settingRowBordered, styles.settingRowTop,
              { borderTopColor: theme.colors.borderDefault, borderBottomColor: theme.colors.borderDefault }]}
            onPress={() => router.push('/data-export')}
            accessibilityRole="button"
            accessibilityLabel={t('settings:profile.exportMyData')}
          >
            <View style={styles.settingLabelGroup}>
              <Text style={[styles.settingLabel, { color: theme.colors.textPrimary }]}>{t('settings:profile.exportMyDataLabel')}</Text>
              <Text style={[styles.settingMeta, { color: theme.colors.textTertiary }]}>
                {t('settings:profile.exportMyDataMeta')}
              </Text>
            </View>
            <Text style={[styles.settingChevron, { color: theme.colors.textTertiary }]}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Appearance ── */}
      <View style={styles.section}>
        <SectionHeader label={t('settings:profile.appearanceSectionHeader')} />
        <View style={[
          styles.settingsCard,
          { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
        ]}>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => setShowThemePicker(true)}
            accessibilityRole="button"
            accessibilityLabel={t('settings:profile.changeTheme')}
          >
            <Text style={[styles.settingLabel, { color: theme.colors.textPrimary }]}>{t('settings:profile.theme')}</Text>
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
        <SectionHeader label={t('settings:profile.physicalRestrictionsSectionHeader')} />
        <Text style={[styles.sectionNote, { color: theme.colors.textTertiary }]}>
          {t('settings:profile.physicalRestrictionsNote')}
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
            <TouchableOpacity onPress={loadConstraints} accessibilityRole="button" accessibilityLabel={t('settings:profile.retryLoadingConstraints')}>
              <Text style={[styles.retryLink, { color: theme.colors.accentDefault }]}>{t('settings:profile.retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[
            styles.constraintsCard,
            { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
          ]}>
            {constraints.length === 0 ? (
              <Text style={[styles.noConstraints, { color: theme.colors.textTertiary }]}>{t('settings:profile.noRestrictionsAdded')}</Text>
            ) : (
              constraints.map((c) => (
                <View key={c.id} style={[
                  styles.constraintRow,
                  { borderBottomColor: theme.colors.borderDefault },
                ]}>
                  <View style={styles.constraintLabelGroup}>
                    <Text style={[styles.constraintType, { color: theme.colors.textPrimary }]}>
                      {c.constraint_type === 'custom'
                        ? t('settings:profile.customType')
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
                    accessibilityLabel={t('settings:profile.removeRestriction')}
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
              accessibilityLabel={t('settings:profile.addPhysicalRestriction')}
            >
              <Text style={[styles.addConstraintText, { color: theme.colors.accentDefault }]}>{t('settings:profile.addRestrictionPlus')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* TICKET-143: badge case — earned vs locked, "locked show their rule" */}
      <BadgeCaseSection />

      {/* ── Notifications ── */}
      <View style={styles.section}>
        <SectionHeader label={t('settings:profile.notificationsSectionHeader')} />
        <View style={[
          styles.settingsCard,
          { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
        ]}>
          {/* Streak milestones */}
          <View style={[styles.settingRow, { justifyContent: 'space-between' }]}>
            <View style={styles.settingLabelGroup}>
              <Text style={[styles.settingLabel, { color: theme.colors.textPrimary }]}>{t('settings:profile.streakMilestones')}</Text>
              <Text style={[styles.settingMeta, { color: theme.colors.textTertiary }]}>
                {t('settings:profile.streakMilestonesMeta')}
              </Text>
            </View>
            <Switch
              value={streakNotifEnabled}
              onValueChange={handleStreakNotifToggle}
              trackColor={{ false: theme.colors.borderDefault, true: theme.colors.accentDefault }}
              thumbColor={streakNotifEnabled ? theme.colors.accentDefault : theme.colors.textTertiary}
              accessibilityLabel={t('settings:profile.streakMilestoneNotifLabel')}
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
              <Text style={[styles.settingLabel, { color: theme.colors.textPrimary }]}>{t('settings:profile.planNotifications')}</Text>
              <Text style={[styles.settingMeta, { color: theme.colors.textTertiary }]}>
                {t('settings:profile.planNotificationsMeta')}
              </Text>
            </View>
            <Switch
              value={planNotifEnabled}
              onValueChange={handlePlanNotifToggle}
              trackColor={{ false: theme.colors.borderDefault, true: theme.colors.accentDefault }}
              thumbColor={planNotifEnabled ? theme.colors.accentDefault : theme.colors.textTertiary}
              accessibilityLabel={t('settings:profile.planReadyNotifLabel')}
            />
          </View>

          {/* Siri phrase suggestions (TICKET-145) — iOS only. App Intents are
              Siri-discoverable automatically once the widget extension ships;
              this row surfaces the phrases + jumps into the Shortcuts app. */}
          {Platform.OS === 'ios' && (
            <View style={[
              styles.settingRow,
              styles.settingRowBordered,
              styles.settingRowTop,
              { borderTopColor: theme.colors.borderDefault, borderBottomColor: theme.colors.borderDefault },
            ]}>
              <View style={styles.settingLabelGroup}>
                <Text style={[styles.settingLabel, { color: theme.colors.textPrimary }]}>
                  {t('settings:profile.siriAndShortcuts')}
                </Text>
                <Text style={[styles.settingMeta, { color: theme.colors.textTertiary }]}>
                  {t('settings:profile.siriAndShortcutsMeta')}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => Linking.openURL('shortcuts://').catch(() => {})}
                accessibilityRole="button"
                accessibilityLabel={t('settings:profile.openShortcutsApp')}
                style={styles.toggleSpinner}
              >
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* ── D. Data & privacy ── */}
      <View style={styles.section}>
        <SectionHeader label={t('settings:profile.dataAndPrivacySectionHeader')} />
        <View style={[
          styles.settingsCard,
          { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
        ]}>
          {/* Health metrics */}
          <TouchableOpacity
            style={[styles.settingRow, styles.settingRowBordered, { borderBottomColor: theme.colors.borderDefault }]}
            onPress={() => router.push('/health-metrics')}
            accessibilityRole="button"
            accessibilityLabel={t('settings:profile.viewHealthMetrics')}
          >
            <View style={styles.settingLabelGroup}>
              <Text style={[styles.settingLabel, { color: theme.colors.textPrimary }]}>{t('settings:profile.healthMetrics')}</Text>
              <Text style={[styles.settingMeta, { color: theme.colors.textTertiary }]}>
                {Platform.OS === 'ios' ? t('settings:profile.healthMetricsMetaIos') : t('settings:profile.healthMetricsMetaOther')}
              </Text>
            </View>
            <Text style={[styles.settingChevron, { color: theme.colors.textTertiary }]}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Your Data — data category table */}
        <View style={[
          styles.settingsCard,
          { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault, marginBottom: spacing.s4 },
        ]}>
          <Text style={[styles.sectionLabel, { color: theme.colors.textTertiary }]}>{t('settings:profile.yourDataSectionHeader')}</Text>

          {/* Data category rows */}
          {[
            { label: t('settings:profile.categoryWorkouts'), description: t('settings:profile.categoryWorkoutsDesc') },
            { label: t('settings:profile.categoryPlans'), description: t('settings:profile.categoryPlansDesc') },
            { label: t('settings:profile.categoryHealthMetrics'), description: t('settings:profile.categoryHealthMetricsDesc') },
            { label: t('settings:profile.categoryProfile'), description: t('settings:profile.categoryProfileDesc') },
          ].map((category, i) => (
            <View key={category.label} style={[styles.settingRow, i > 0 && { borderTopWidth: 1, borderTopColor: theme.colors.borderDefault }]}>
              <View style={styles.settingLabelGroup}>
                <Text style={[styles.settingLabel, { color: theme.colors.textPrimary }]}>{category.label}</Text>
                <Text style={{ color: theme.colors.textTertiary, fontSize: fontSize.caption }}>{category.description}</Text>
              </View>
            </View>
          ))}

          {/* Progress & Trends entry (TICKET-087) */}
          <Pressable
            onPress={() => router.push('/trends')}
            style={[styles.settingRow, { borderTopWidth: 1, borderColor: theme.colors.borderDefault }]}
            accessibilityRole="button"
            accessibilityLabel={t('settings:profile.viewProgressAndTrends')}
          >
            <Ionicons name="trending-up-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={[styles.settingLabel, { color: theme.colors.textPrimary, marginLeft: spacing.s3, flex: 1 }]}>
              {t('settings:profile.progressAndTrends')}
            </Text>
            <Ionicons name="chevron-forward-outline" size={16} color={theme.colors.textTertiary} />
          </Pressable>

          {/* P2-002: Exercise Library nav entry */}
          <Pressable
            onPress={() => router.push('/exercise-library')}
            style={[styles.settingRow, { borderTopWidth: 1, borderColor: theme.colors.borderDefault }]}
            accessibilityRole="button"
            accessibilityLabel={t('settings:profile.browseExerciseLibrary')}
          >
            <Ionicons name="barbell-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={[styles.settingLabel, { color: theme.colors.textPrimary, marginLeft: spacing.s3, flex: 1 }]}>
              {t('settings:profile.exerciseLibrary')}
            </Text>
            <Ionicons name="chevron-forward-outline" size={16} color={theme.colors.textTertiary} />
          </Pressable>

          {/* Achievements & cosmetics shop */}
          <Pressable
            onPress={() => router.push('/cosmetics')}
            style={[styles.settingRow, { borderTopWidth: 1, borderColor: theme.colors.borderDefault }]}
            accessibilityRole="button"
            accessibilityLabel={t('settings:profile.viewAchievementsAndShop')}
          >
            <Ionicons name="trophy-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={[styles.settingLabel, { color: theme.colors.textPrimary, marginLeft: spacing.s3, flex: 1 }]}>
              {t('settings:profile.achievementsAndShop')}
            </Text>
            <Ionicons name="chevron-forward-outline" size={16} color={theme.colors.textTertiary} />
          </Pressable>

          {/* TICKET-095: Replay the interactive welcome tour */}
          <Pressable
            onPress={() => startTour()}
            style={[styles.settingRow, { borderTopWidth: 1, borderColor: theme.colors.borderDefault }]}
            accessibilityRole="button"
            accessibilityLabel={t('settings:profile.replayWelcomeTour')}
          >
            <Ionicons name="help-circle-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={[styles.settingLabel, { color: theme.colors.textPrimary, marginLeft: spacing.s3, flex: 1 }]}>
              {t('settings:profile.replayWelcomeTour')}
            </Text>
            <Ionicons name="chevron-forward-outline" size={16} color={theme.colors.textTertiary} />
          </Pressable>

          {/* PL-2: Import Activity Data nav entry */}
          <Pressable
            onPress={() => router.push('/csv-import')}
            style={[styles.settingRow, { borderTopWidth: 1, borderColor: theme.colors.borderDefault }]}
            accessibilityRole="button"
            accessibilityLabel={t('settings:profile.importActivityData')}
          >
            <Ionicons name="cloud-upload-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={[styles.settingLabel, { color: theme.colors.textPrimary, marginLeft: spacing.s3, flex: 1 }]}>
              {t('settings:profile.importActivityDataLabel')}
            </Text>
            <Ionicons name="chevron-forward-outline" size={16} color={theme.colors.textTertiary} />
          </Pressable>

          {/* Export button */}
          <TouchableOpacity
            onPress={handleDataExport}
            style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: theme.colors.borderDefault }]}
            accessibilityRole="button"
            accessibilityLabel={t('settings:profile.exportAllMyData')}
          >
            <Text style={{ color: theme.colors.accentDefault, fontSize: fontSize.bodyMd, fontWeight: fontWeight.medium }}>
              {t('settings:profile.exportAllMyDataLabel')}
            </Text>
            <Ionicons name="download-outline" size={18} color={theme.colors.accentDefault} />
          </TouchableOpacity>

          {/* Diagnostics (2026-07-02) — perf report for the responsiveness bug.
              Reproduce the lag, open this, tap Share, send the JSON. */}
          <TouchableOpacity
            onPress={() => router.push('/diagnostics')}
            style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: theme.colors.borderDefault }]}
            accessibilityRole="button"
            accessibilityLabel={t('settings:profile.diagnostics')}
          >
            <Text style={[styles.settingLabel, { color: theme.colors.textPrimary }]}>{t('settings:profile.diagnostics')}</Text>
            <Ionicons name="pulse-outline" size={18} color={theme.colors.textTertiary} />
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
            accessibilityLabel={t('settings:profile.deleteAccount')}
          >
            <View style={styles.settingLabelGroup}>
              <Text style={[styles.settingLabel, { color: theme.colors.statusError }]}>
                {t('settings:profile.deleteAccountLabel')}
              </Text>
              <Text style={[styles.settingMeta, { color: theme.colors.textTertiary }]}>{t('settings:profile.deleteAccountMeta')}</Text>
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
        accessibilityLabel={t('settings:profile.signOut')}
      >
        {isSigningOut ? (
          <ActivityIndicator color={theme.colors.statusError} />
        ) : (
          <Text style={[styles.signOutText, { color: theme.colors.statusError }]}>{t('settings:profile.signOutLabel')}</Text>
        )}
      </TouchableOpacity>

      {/* App version note */}
      <Text style={[styles.appVersion, { color: theme.colors.borderDefault }]}>{t('settings:profile.appVersionNote')}</Text>

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

      {/* ── TICKET-096: Avatar customizer ── */}
      <AvatarCustomizer
        visible={avatarEditorVisible}
        initial={avatarConfig}
        onClose={() => setAvatarEditorVisible(false)}
        onSaved={handleAvatarSaved}
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
  // P3a: display-name display + inline edit affordances
  nameDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    minHeight: 32,
  },
  nameEditPencil: {
    opacity: 0.8,
  },
  nameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    alignSelf: 'stretch',
  },
  nameEditInput: {
    flex: 1,
  },
  nameEditBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
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

  // Tier / Pro toggle (Phase 6)
  tierStorageCopy: {
    fontSize: fontSize.caption,
    textAlign: 'center',
    marginTop: 2,
  },
  tierActionPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s2,
    borderRadius: radius.full,
    paddingHorizontal: spacing.s4,
    paddingVertical: 10,
    marginTop: spacing.s2,
    minHeight: 44,
  },
  tierActionPrimaryText: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.semibold,
  },
  tierActionGhost: {
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.s4,
    paddingVertical: 10,
    marginTop: spacing.s2,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierActionGhostText: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.medium,
  },
  tierUpgradingBox: {
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.s2,
    paddingVertical: spacing.s2,
  },
  tierUpgradingText: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.medium,
    textAlign: 'center',
  },
  tierUpgradingMeta: {
    fontSize: fontSize.caption,
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
  restTimerRow: {
    flexWrap: 'wrap',
    minHeight: 72,
    alignItems: 'flex-start',
    paddingTop: spacing.s4,
    paddingBottom: spacing.s3,
  },
  restTimerPresets: {
    // flex-shrink so it doesn't overflow when the label is wide
    flexShrink: 1,
  },
  restTimerPresetsContent: {
    gap: 6,
    paddingVertical: 2,
    alignItems: 'center',
  },
  restTimerChip: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.s3,
    paddingVertical: 7,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restTimerChipText: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.semibold,
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

  // Sign ou  // Sign out button
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
// Styles — LifeOSCard (TICKET-125)
// ---------------------------------------------------------------------------

const lifeosCardStyles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.s4,
    gap: spacing.s3,
    marginTop: spacing.s3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  title: {
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.semibold,
  },
  badge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.4,
  },
  streakLine: {
    fontSize: fontSize.bodySm,
    lineHeight: 20,
  },
  ctaButton: {
    borderRadius: radius.md,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44, // WCAG 2.5.5: 44pt touch target
  },
  ctaText: {
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.semibold,
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
