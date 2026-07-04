/**
 * ExerciseSwitcherSheet — TICKET-060
 * Bottom sheet listing all exercises in the current routine session.
 * Done exercises show a checkmark + set count; the current one is accent-
 * highlighted. "Browse full library →" escapes to the exercise picker.
 *
 * UI matches set-logging-stepper-flow.html §1b.
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Ionicons } from './Icon';
import { stepperPalette, fontFamily, spacing, radius, fontSize } from '../theme/tokens';
import { RoutineSession } from './RoutineStrip';
import { useTranslation } from 'react-i18next';

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  routineSession: RoutineSession;
  /** User tapped a routine exercise row → jump to that index */
  onSelectIndex: (index: number) => void;
  /** User tapped "Browse full library" → open exercise picker */
  onBrowseLibrary: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ExerciseSwitcherSheet({
  visible,
  onClose,
  routineSession,
  onSelectIndex,
  onBrowseLibrary,
}: Props): React.ReactElement | null {
  const { t } = useTranslation();
  if (!visible) return null;

  const { exercises, currentIndex } = routineSession;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        {/* Drag handle */}
        <View style={styles.handle} />

        <Text style={styles.sectionLabel}>{t('logger:exerciseSwitcher.inThisRoutine')}</Text>

        <ScrollView
          style={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {exercises.map((ex, idx) => {
            const isCurrent = idx === currentIndex;
            const isDone = ex.done;

            return (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.row,
                  isCurrent && styles.rowCurrent,
                ]}
                onPress={() => {
                  onSelectIndex(idx);
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityLabel={`${ex.name}${isDone ? t('logger:exerciseSwitcher.a11yDoneSuffix') : ''}`}
                accessibilityState={{ selected: isCurrent }}
              >
                {/* Check circle */}
                <View style={[styles.checkCircle, isDone && styles.checkCircleDone]}>
                  {isDone && (
                    <Ionicons name="checkmark" size={11} color={stepperPalette.accent} />
                  )}
                </View>

                {/* Exercise name */}
                <Text
                  style={[
                    styles.exName,
                    isCurrent && styles.exNameCurrent,
                    isDone && styles.exNameDone,
                  ]}
                  numberOfLines={1}
                >
                  {ex.name}
                </Text>

                {/* Set count / status label */}
                <Text style={styles.setCount}>
                  {isCurrent
                    ? t('logger:exerciseSwitcher.current')
                    : isDone
                    ? t('logger:exerciseSwitcher.setCount', { count: ex.loggedSetCount })
                    : t('logger:exerciseSwitcher.notStarted')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Browse library shortcut — dashed accent box (§1b mock) */}
        <TouchableOpacity
          style={styles.browseBox}
          onPress={() => {
            onClose();
            onBrowseLibrary();
          }}
          accessibilityRole="button"
          accessibilityLabel={t('logger:exerciseSwitcher.browseLibraryA11y')}
        >
          <Ionicons name="search" size={14} color={stepperPalette.accent} />
          <Text style={styles.browseText}>{t('logger:exerciseSwitcher.browseLibrary')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: stepperPalette.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: stepperPalette.accentLine,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s8,
    maxHeight: '70%',
  },
  handle: {
    width: 34,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: stepperPalette.line,
    alignSelf: 'center',
    marginBottom: spacing.s4,
  },
  sectionLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.caption,
    color: stepperPalette.muted,
    letterSpacing: 0.5,
    marginBottom: spacing.s3,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    backgroundColor: stepperPalette.bg,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s3,
    marginBottom: spacing.s2,
  },
  rowCurrent: {
    borderColor: stepperPalette.accentLine,
    backgroundColor: stepperPalette.accentSurface,
  },
  checkCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: stepperPalette.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleDone: {
    borderColor: stepperPalette.accentLine,
    backgroundColor: stepperPalette.accentSurface,
  },
  exName: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodySm,
    color: stepperPalette.text,
  },
  exNameCurrent: {
    color: stepperPalette.accent,
    fontFamily: fontFamily.bold,
  },
  exNameDone: {
    opacity: 0.7,
  },
  setCount: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    color: stepperPalette.muted,
  },
  /* TICKET-081 §1b: dashed accent-bordered box matching `.browse` in mock */
  browseBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s2,
    marginTop: spacing.s3,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s3,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: stepperPalette.accentLine,
    borderRadius: radius.md,
    minHeight: 44,
  },
  browseText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodySm,
    color: stepperPalette.accent,
  },
});
