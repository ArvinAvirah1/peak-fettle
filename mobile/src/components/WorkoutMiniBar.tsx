/**
 * WorkoutMiniBar — persistent "minimized workout" bar.
 * =============================================================================
 * Founder fix #2: the logger's down-arrow now MINIMIZES the session instead of
 * terminating it. While minimized, this screen-wide, short bar sits at the
 * BOTTOM of the app (above the tab bar) so the user can roam the app without
 * losing progress. Tapping it restores the full logger exactly where they left
 * off. Ending a workout still only happens through the explicit finish/discard
 * action inside the stepper (with its existing confirm) — never this bar.
 *
 * Purely presentational: all session state stays in WorkoutLoggerHost, which
 * owns `minimized` visibility and passes progress + the live rest countdown down
 * as props. No RN <Modal> here (it must sit UNDER modals, above the tab bar), so
 * the standard safe-area inset applies normally — we add the tab-bar height +
 * bottom inset so the bar clears the tab bar rather than hiding behind it.
 * =============================================================================
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from './Icon';
import { useTheme } from '../theme/ThemeContext';
import { spacing, radius, fontSize, fontWeight } from '../theme/tokens';

// Height of the tab-bar content area (matches app/(tabs)/_layout.tsx: 56 + inset).
const TAB_BAR_CONTENT_HEIGHT = 56;

export interface WorkoutMiniBarProps {
  /** Show/hide the bar. */
  visible: boolean;
  /** Routine / session name, e.g. "Leg Day" or "Free session". */
  title: string;
  /** Progress line, e.g. "Exercise 3 / 6" or "8 sets logged". */
  progress: string;
  /**
   * Live rest countdown in whole seconds while a rest is running; null hides the
   * countdown chip. Derived by the host from the absolute rest deadline (fix #1),
   * so it's correct even though this bar re-renders independently of the stepper.
   */
  restSecondsLeft?: number | null;
  /** Restore the full logger (tap the bar). */
  onPress: () => void;
  /**
   * When true, the bar sits above a tab bar (host is on a tabbed screen) and
   * reserves the tab-bar height. When false (host on a non-tab screen) it only
   * clears the bottom safe-area inset. Defaults to true (Home is the primary host).
   */
  aboveTabBar?: boolean;
}

function fmtRest(sec: number): string {
  const s = Math.max(0, sec);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export function WorkoutMiniBar({
  visible,
  title,
  progress,
  restSecondsLeft,
  onPress,
  aboveTabBar = true,
}: WorkoutMiniBarProps): React.ReactElement | null {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  // Sit ABOVE the tab bar: the tab bar occupies (56 + insets.bottom); when the
  // host is on a non-tab screen we only clear the bottom inset. A small gap
  // lifts the bar off the tab-bar border.
  const bottomOffset =
    (aboveTabBar ? TAB_BAR_CONTENT_HEIGHT + insets.bottom : Math.max(insets.bottom, spacing.s3)) +
    spacing.s2;

  const showRest = restSecondsLeft != null && restSecondsLeft > 0;

  return (
    <View style={[styles.wrap, { bottom: bottomOffset }]} pointerEvents="box-none">
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Resume workout: ${title}, ${progress}${showRest ? `, resting ${fmtRest(restSecondsLeft as number)}` : ''}`}
        style={[
          styles.bar,
          {
            backgroundColor: theme.colors.bgElevated,
            borderColor: theme.colors.borderDefault,
            borderRadius: radius.md,
          },
        ]}
      >
        {/* Barbell glyph badge */}
        <View
          style={[
            styles.iconBadge,
            { backgroundColor: theme.colors.accentSecondary, borderRadius: radius.sm },
          ]}
        >
          <Ionicons name="barbell" size={18} color={theme.colors.accentDefault} />
        </View>

        {/* Title + progress */}
        <View style={styles.textCol}>
          <Text
            style={{ color: theme.colors.textPrimary, fontSize: fontSize.bodyMd, fontWeight: fontWeight.semibold }}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text
            style={{ color: theme.colors.textTertiary, fontSize: fontSize.caption }}
            numberOfLines={1}
          >
            {progress}
          </Text>
        </View>

        {/* Live rest countdown chip (only while resting) */}
        {showRest ? (
          <View
            style={[
              styles.restChip,
              { backgroundColor: theme.colors.accentSecondary, borderRadius: radius.sm },
            ]}
          >
            <Ionicons name="time-outline" size={13} color={theme.colors.accentDefault} />
            <Text
              style={{
                color: theme.colors.accentDefault,
                fontSize: fontSize.bodySm,
                fontWeight: fontWeight.bold,
                fontVariant: ['tabular-nums'],
                marginLeft: 4,
              }}
            >
              {fmtRest(restSecondsLeft as number)}
            </Text>
          </View>
        ) : null}

        {/* Resume affordance */}
        <Ionicons name="chevron-up" size={20} color={theme.colors.textTertiary} style={{ marginLeft: spacing.s2 }} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.s4,
    right: spacing.s4,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s3,
    minHeight: 56,
    // Subtle lift so it reads as floating above the tab bar.
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  iconBadge: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.s3,
  },
  textCol: {
    flex: 1,
    justifyContent: 'center',
  },
  restChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s2,
    paddingVertical: spacing.s1,
    marginLeft: spacing.s2,
  },
});

export default WorkoutMiniBar;
