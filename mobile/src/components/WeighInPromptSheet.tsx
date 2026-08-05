/**
 * WeighInPromptSheet — the in-logger daily weigh-in nudge (founder 2026-08-04).
 *
 * Fires when a session from a routine with the reminder enabled STARTS or ENDS
 * (whichever the user picked in the routine editor). This is the "remind me at
 * the gym" half of the feature: it appears exactly when the user is standing
 * next to a scale, with no notification permission involved.
 *
 * Deliberately a BOTTOM sheet: content is pinned to the bottom inset, so the
 * Dynamic-Island problem documented in CLAUDE.md §3 (safe-area insets not
 * propagating inside a React Native <Modal>) does not apply here — there is no
 * top-anchored header to push down. The bottom inset is applied explicitly for
 * the same reason.
 *
 * The input itself is the shared DailyWeightCard, so a weight saved here is the
 * identical write as Home/Health and immediately updates the week's reading
 * count and, at the threshold, the derived weekly median.
 */

import React from 'react';
import { Modal, View, Text, Pressable, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius, a11y } from '../theme/tokens';
import { DailyWeightCard } from './DailyWeightCard';
import { UnitSystem } from '../constants/units';

interface Props {
  visible: boolean;
  unitPref: UnitSystem;
  /** Called for BOTH "Not today" and a backdrop tap — the caller records the
   *  day-scoped dismissal so the prompt doesn't return after every session. */
  onDismiss: () => void;
  /** Called after a weight is saved. Distinct from onDismiss: saving is not a
   *  refusal, so the caller must NOT record a day-scoped dismissal for it. */
  onSaved?: () => void;
}

export function WeighInPromptSheet({
  visible,
  unitPref,
  onDismiss,
  onSaved,
}: Props): React.ReactElement | null {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  // Unmount entirely when hidden. A React Native <Modal> still MOUNTS its
  // children while visible={false}, which would run DailyWeightCard's
  // useDailyWeight — including its HealthKit query — on every logger mount, for
  // a sheet the user may never see.
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <View style={styles.kav}>
        <Pressable
          style={styles.backdrop}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={t('components:weighInReminder.promptDismiss')}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.bgPrimary,
              borderColor: theme.colors.borderDefault,
              paddingBottom: Math.max(insets.bottom, spacing.s4),
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.colors.borderDefault }]} />
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
            {t('components:weighInReminder.promptTitle')}
          </Text>
          <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
            {t('components:weighInReminder.promptSubtitle')}
          </Text>

          <DailyWeightCard unitPref={unitPref} onSaved={onSaved} />

          <TouchableOpacity
            onPress={onDismiss}
            style={styles.dismissBtn}
            accessibilityRole="button"
            accessibilityLabel={t('components:weighInReminder.promptDismiss')}
          >
            <Text style={[styles.dismissLabel, { color: theme.colors.textTertiary }]}>
              {t('components:weighInReminder.promptDismiss')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  kav: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    borderTopWidth: 1,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: radius.full,
    alignSelf: 'center',
    marginBottom: spacing.s3,
  },
  title: {
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.bold,
  },
  sub: {
    fontSize: fontSize.caption,
    marginTop: spacing.s1,
    marginBottom: spacing.s3,
  },
  dismissBtn: {
    minHeight: a11y.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissLabel: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.medium,
  },
});
