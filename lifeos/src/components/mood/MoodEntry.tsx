/**
 * MoodEntry.tsx — shared mood-checkin building blocks (TICKET-158 "Mood 2.0").
 *
 * Extracted from app/mood-checkin.tsx so the 2-tap check-in flow and any
 * future entry points (e.g. a quick-log widget) share one face picker and one
 * tag-chip row implementation. Token-driven styling only — no raw hex.
 */

import React from 'react';
import { Text, View, ViewStyle, StyleProp } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { fontFamily, fontSize, HIT_TARGET, radius, spacing } from '../../theme/tokens';
import { haptic } from '../../lib/haptics';
import { PressableScale } from '../motion';
import { Ionicons } from '../Icon';
import { MOOD_LEVELS, MOOD_LEVEL_META, MoodLevel } from './moodLevels';

/** Face-picker rows, derived from the shared mood-level source (moodLevels.ts). */
export const MOOD_FACES: { value: MoodLevel; icon: string; label: string }[] = MOOD_LEVELS.map(
  (value) => ({ value, ...MOOD_LEVEL_META[value] })
);

export function MoodFacePicker({
  value,
  onChange,
  style,
}: {
  value: 1 | 2 | 3 | 4 | 5 | null;
  onChange: (v: 1 | 2 | 3 | 4 | 5) => void;
  style?: StyleProp<ViewStyle>;
}): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <View style={[{ flexDirection: 'row', justifyContent: 'space-between' }, style]}>
      {MOOD_FACES.map((f) => {
        const selected = value === f.value;
        return (
          <PressableScale
            key={f.value}
            accessibilityRole="button"
            accessibilityLabel={`${f.label}, ${f.value} out of 5`}
            accessibilityState={{ selected }}
            onPress={() => {
              haptic.selection();
              onChange(f.value);
            }}
            style={{
              alignItems: 'center',
              minWidth: HIT_TARGET + 12,
              minHeight: HIT_TARGET + 16,
              justifyContent: 'center',
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: selected ? c.accentDefault : c.borderDefault,
              backgroundColor: selected ? c.accentMuted : 'transparent',
            }}
          >
            <Ionicons name={f.icon} size={26} color={selected ? c.accentDefault : c.textSecondary} />
            <Text
              style={{
                color: selected ? c.textPrimary : c.textTertiary,
                fontFamily: fontFamily.medium,
                fontSize: fontSize.caption,
                marginTop: spacing.s1,
              }}
            >
              {f.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

export function TagChipRow({
  options,
  selected,
  onToggle,
  style,
}: {
  options: { key: string; label: string }[];
  selected: string[];
  onToggle: (key: string) => void;
  style?: StyleProp<ViewStyle>;
}): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap' }, style]}>
      {options.map((opt) => {
        const isSelected = selected.includes(opt.key);
        return (
          <PressableScale
            key={opt.key}
            accessibilityRole="button"
            accessibilityLabel={opt.label}
            accessibilityState={{ selected: isSelected }}
            onPress={() => {
              haptic.selection();
              onToggle(opt.key);
            }}
            style={{
              minHeight: HIT_TARGET - 6,
              paddingHorizontal: spacing.s3,
              justifyContent: 'center',
              borderRadius: radius.full,
              borderWidth: 1,
              borderColor: isSelected ? c.accentDefault : c.borderDefault,
              backgroundColor: isSelected ? c.accentMuted : 'transparent',
              marginRight: spacing.s2,
              marginBottom: spacing.s2,
            }}
          >
            <Text
              style={{
                color: isSelected ? c.textPrimary : c.textSecondary,
                fontFamily: fontFamily.medium,
                fontSize: fontSize.bodySm,
              }}
            >
              {opt.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}
