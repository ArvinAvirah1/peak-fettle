/**
 * AvatarCustomizer — TICKET-096 Phase 2.
 *
 * Live preview + per-category pickers + Randomize + Save. Shape categories show a
 * mini PeakAvatar per option (so you see the result); color categories show
 * swatches. Saving persists the CONFIG locally (avatar table) — never an image.
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '../Icon';
import { useTheme } from '../../theme/ThemeContext';
import { fontSize, spacing, radius } from '../../theme/tokens';
import PeakAvatar from './PeakAvatar';
import {
  AvatarConfig,
  AVATAR_CATEGORIES,
  AvatarCategory,
  DEFAULT_AVATAR,
  normalizeAvatar,
  randomizeAvatar,
} from './peakAvatarOptions';

interface Props {
  visible: boolean;
  initial: AvatarConfig | null;
  onClose: () => void;
  onSaved: (cfg: AvatarConfig) => void;
}

function prettify(id: string): string {
  return id.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
}

export default function AvatarCustomizer({ visible, initial, onClose, onSaved }: Props): React.ReactElement {
  const { theme, fontWeight } = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();

  const [draft, setDraft] = useState<AvatarConfig>(() => normalizeAvatar(initial ?? DEFAULT_AVATAR));
  const [catKey, setCatKey] = useState<AvatarCategory['key']>('background');

  useEffect(() => {
    if (visible) setDraft(normalizeAvatar(initial ?? DEFAULT_AVATAR));
  }, [visible, initial]);

  const cat = useMemo<AvatarCategory>(
    () => AVATAR_CATEGORIES.find((x) => x.key === catKey) ?? (AVATAR_CATEGORIES[0] as AvatarCategory),
    [catKey],
  );

  const setField = useCallback((id: string) => {
    setDraft((d) => ({ ...d, [catKey]: id } as AvatarConfig));
  }, [catKey]);

  const onSave = useCallback(() => {
    onSaved(normalizeAvatar(draft));
  }, [draft, onSaved]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.root, { backgroundColor: c.bgPrimary }]} edges={['top', 'bottom']}>
        {/* Header: explicit top-inset padding so close/save clear the Dynamic
             Island / notch inside a RN Modal where SafeAreaView may not
             propagate the inset reliably. */}
        <View style={[styles.header, { borderBottomColor: c.borderDefault, paddingTop: Math.max(insets.top, 12) }]}>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close avatar editor">
            <Ionicons name="close" size={24} color={c.textSecondary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: c.textPrimary, fontWeight: fontWeight.bold }]}>Edit avatar</Text>
          <TouchableOpacity
            onPress={onSave}
            accessibilityRole="button"
            accessibilityLabel="Save avatar"
            style={[styles.saveBtn, { backgroundColor: c.accentDefault }]}
          >
            <Text style={{ color: theme.components.buttonPrimaryText, fontWeight: fontWeight.bold, fontSize: fontSize.bodySm }}>Save</Text>
          </TouchableOpacity>
        </View>

        {/* Live preview */}
        <View style={styles.previewWrap}>
          <PeakAvatar config={draft} size={140} ring={c.borderDefault} />
          <TouchableOpacity
            onPress={() => setDraft(randomizeAvatar())}
            style={[styles.randomBtn, { borderColor: c.accentDefault }]}
            accessibilityRole="button"
            accessibilityLabel="Randomize avatar"
          >
            <Ionicons name="shuffle" size={15} color={c.accentDefault} />
            <Text style={{ color: c.accentDefault, fontWeight: fontWeight.semibold, fontSize: fontSize.bodySm }}>  Randomize</Text>
          </TouchableOpacity>
        </View>

        {/* Category selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.s4, gap: spacing.s2, paddingVertical: spacing.s2 }}
          style={{ maxHeight: 46, flexGrow: 0 }}
        >
          {AVATAR_CATEGORIES.map((x) => {
            const active = x.key === catKey;
            return (
              <TouchableOpacity
                key={x.key}
                onPress={() => setCatKey(x.key)}
                style={[styles.catChip, { backgroundColor: active ? c.accentDefault : c.bgTertiary, borderColor: active ? c.accentDefault : c.borderDefault }]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={{ color: active ? theme.components.buttonPrimaryText : c.textSecondary, fontSize: fontSize.caption, fontWeight: fontWeight.semibold }}>
                  {x.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Options grid for the selected category */}
        <ScrollView contentContainerStyle={styles.grid}>
          {cat.ids.map((id) => {
            const selected = draft[cat.key] === id;
            if (cat.kind === 'color') {
              const hex = cat.colors?.[id] ?? '#ccc';
              return (
                <Pressable
                  key={id}
                  onPress={() => setField(id)}
                  style={[styles.swatchCell]}
                  accessibilityRole="button"
                  accessibilityLabel={`${cat.label}: ${prettify(id)}`}
                  accessibilityState={{ selected }}
                >
                  <View style={[styles.colorSwatch, { backgroundColor: hex, borderColor: selected ? c.accentDefault : c.borderDefault, borderWidth: selected ? 3 : 1 }]} />
                  <Text style={[styles.optLabel, { color: c.textTertiary }]} numberOfLines={1}>{prettify(id)}</Text>
                </Pressable>
              );
            }
            return (
              <Pressable
                key={id}
                onPress={() => setField(id)}
                style={[styles.swatchCell]}
                accessibilityRole="button"
                accessibilityLabel={`${cat.label}: ${prettify(id)}`}
                accessibilityState={{ selected }}
              >
                <View style={[styles.miniWrap, { borderColor: selected ? c.accentDefault : c.borderDefault, borderWidth: selected ? 3 : 1, backgroundColor: c.bgSecondary }]}>
                  <PeakAvatar config={{ ...draft, [cat.key]: id } as AvatarConfig} size={56} />
                </View>
                <Text style={[styles.optLabel, { color: c.textTertiary }]} numberOfLines={1}>{prettify(id)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    borderBottomWidth: 1,
  },
  title: { fontSize: fontSize.bodyLg },
  saveBtn: { borderRadius: radius.full, paddingHorizontal: spacing.s4, paddingVertical: spacing.s2, minWidth: 64, alignItems: 'center' },
  previewWrap: { alignItems: 'center', paddingVertical: spacing.s4, gap: spacing.s3 },
  randomBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing.s4, paddingVertical: spacing.s2 },
  catChip: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing.s3, paddingVertical: spacing.s1 + 2, alignSelf: 'flex-start' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s3, padding: spacing.s4, justifyContent: 'flex-start' },
  swatchCell: { width: 72, alignItems: 'center', gap: 4 },
  colorSwatch: { width: 56, height: 56, borderRadius: 28 },
  miniWrap: { width: 64, height: 64, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  optLabel: { fontSize: 11, textAlign: 'center', width: 72 },
});
