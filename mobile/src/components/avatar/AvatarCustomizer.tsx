/**
 * AvatarCustomizer — TICKET-096 Phase 2 + cosmetic-unlock expansion (P3b).
 *
 * Live preview + per-category pickers + Randomize + Save. Shape categories show a
 * mini PeakAvatar per option (so you see the result); color categories show
 * swatches. Saving persists the CONFIG locally (avatar table) — never an image.
 *
 * UNLOCK GATING: every option is checked against cosmeticUnlocks.isUnlocked using
 * the live { streak, isPaid } context. Locked options render a lock badge + the
 * unlock requirement (e.g. "30-day streak" / "Pro") and CANNOT be equipped —
 * tapping one shows the requirement instead of selecting it. streak comes from
 * useLocalStreak (on-device for free users) and isPaid from the auth user.
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
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '../Icon';
import { useTheme } from '../../theme/ThemeContext';
import { fontSize, spacing, radius } from '../../theme/tokens';
import { useAuth } from '../../hooks/useAuth';
import { useLocalStreak } from '../../hooks/useStreak';
import { isUnlocked, unlockLabel } from '../../data/cosmeticUnlocks';
import PeakAvatar from './PeakAvatar';
import {
  AvatarConfig,
  AVATAR_CATEGORIES,
  AvatarCategory,
  DEFAULT_AVATAR,
  tierKeyForId,
  normalizeAvatar,
  randomizeAvatar,
} from './peakAvatarOptions';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

/**
 * peakAvatarOptions.ts is a pure module (AvatarCategory.label is plain English) —
 * per the render-site rule this component (the render site) translates the
 * category label rather than the pure module. Keyed by `category.key`.
 */
function categoryLabel(category: AvatarCategory, t: TFunction): string {
  return t(`components:avatarCustomizer.categoryLabel.${category.key}`, { defaultValue: category.label });
}

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
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // Live unlock context. useLocalStreak reads on-device workouts for free users
  // (timeout-guarded, never hangs); Pro users unlock via isPaid regardless, so
  // the streak args here are inert pass-throughs (0/false).
  const { streak } = useLocalStreak(0, false);
  const isPaid = !!user?.is_paid;
  const unlockCtx = useMemo(() => ({ streak, isPaid }), [streak, isPaid]);

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

  /**
   * Select an option only if it is unlocked. A locked option never changes the
   * draft; instead we surface the unlock requirement so the user knows how to
   * earn it.
   */
  const selectOption = useCallback((id: string, unlocked: boolean, label: string) => {
    if (unlocked) {
      setField(id);
      return;
    }
    const how = label === 'Pro'
      ? t('components:avatarCustomizer.unlockWithPro')
      : t('components:avatarCustomizer.unlockByReaching', { label });
    Alert.alert(t('components:avatarCustomizer.isLockedTitle', { name: prettify(id) }), how);
  }, [setField]);

  const onSave = useCallback(() => {
    // Defensive: never persist a locked option even if one slipped into the draft
    // (e.g. a previously-equipped item whose streak later lapsed). Fall back to the
    // category default for any now-locked field so the saved config is always legal.
    const safe = { ...draft };
    const safeRec = safe as unknown as Record<string, unknown>;
    const defaults = DEFAULT_AVATAR as unknown as Record<string, unknown>;
    for (const category of AVATAR_CATEGORIES) {
      const val = safeRec[category.key];
      if (typeof val !== 'string') continue;
      if (!isUnlocked(tierKeyForId(category.key, val), unlockCtx)) {
        safeRec[category.key] = defaults[category.key] ?? category.ids[0];
      }
    }
    onSaved(normalizeAvatar(safe));
  }, [draft, onSaved, unlockCtx]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.root, { backgroundColor: c.bgPrimary }]} edges={['top', 'bottom']}>
        {/* Header: explicit top-inset padding so close/save clear the Dynamic
             Island / notch inside a RN Modal where SafeAreaView may not
             propagate the inset reliably. */}
        <View style={[styles.header, { borderBottomColor: c.borderDefault, paddingTop: Math.max(insets.top, 12) }]}>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={t('components:avatarCustomizer.closeAccessibilityLabel')}>
            <Ionicons name="close" size={24} color={c.textSecondary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: c.textPrimary, fontWeight: fontWeight.bold }]}>{t('components:avatarCustomizer.editAvatar')}</Text>
          <TouchableOpacity
            onPress={onSave}
            accessibilityRole="button"
            accessibilityLabel={t('components:avatarCustomizer.saveAccessibilityLabel')}
            style={[styles.saveBtn, { backgroundColor: c.accentDefault }]}
          >
            <Text style={{ color: theme.components.buttonPrimaryText, fontWeight: fontWeight.bold, fontSize: fontSize.bodySm }}>{t('common:save')}</Text>
          </TouchableOpacity>
        </View>

        {/* Live preview */}
        <View style={styles.previewWrap}>
          <PeakAvatar config={draft} size={140} ring={c.borderDefault} />
          <TouchableOpacity
            onPress={() => setDraft(randomizeAvatar())}
            style={[styles.randomBtn, { borderColor: c.accentDefault }]}
            accessibilityRole="button"
            accessibilityLabel={t('components:avatarCustomizer.randomizeAccessibilityLabel')}
          >
            <Ionicons name="shuffle" size={15} color={c.accentDefault} />
            <Text style={{ color: c.accentDefault, fontWeight: fontWeight.semibold, fontSize: fontSize.bodySm }}>  {t('components:avatarCustomizer.randomize')}</Text>
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
                  {categoryLabel(x, t)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Options grid for the selected category */}
        <ScrollView contentContainerStyle={styles.grid}>
          {cat.ids.map((id) => {
            const selected = draft[cat.key] === id;
            const tierKey = tierKeyForId(cat.key, id);
            const unlocked = isUnlocked(tierKey, unlockCtx);
            const label = unlockLabel(tierKey);
            const isProLock = label === 'Pro';
            const catLabel = categoryLabel(cat, t);

            // Lock badge — Pro uses the warning/gold token, streak uses accent;
            // both theme-adaptive. Sits over the swatch/mini-avatar.
            const lockBadge = !unlocked ? (
              <View style={[styles.lockBadge, { backgroundColor: c.bgElevated, borderColor: c.borderDefault }]}>
                <Ionicons
                  name="lock-closed"
                  size={11}
                  color={isProLock ? c.statusWarning : c.accentDefault}
                />
              </View>
            ) : null;

            const lockCaption = !unlocked ? (
              <Text
                style={[styles.lockLabel, { color: isProLock ? c.statusWarning : c.accentDefault }]}
                numberOfLines={1}
              >
                {label}
              </Text>
            ) : null;

            if (cat.kind === 'color') {
              const hex = cat.colors?.[id] ?? '#ccc';
              return (
                <Pressable
                  key={id}
                  onPress={() => selectOption(id, unlocked, label)}
                  style={styles.swatchCell}
                  accessibilityRole="button"
                  accessibilityLabel={
                    unlocked
                      ? t('components:avatarCustomizer.optionAccessibilityLabel', { category: catLabel, name: prettify(id) })
                      : t('components:avatarCustomizer.optionLockedAccessibilityLabel', { category: catLabel, name: prettify(id), requirement: label })
                  }
                  accessibilityState={{ selected, disabled: !unlocked }}
                >
                  <View>
                    <View style={[
                      styles.colorSwatch,
                      { backgroundColor: hex, borderColor: selected ? c.accentDefault : c.borderDefault, borderWidth: selected ? 3 : 1 },
                      !unlocked && styles.lockedVisual,
                    ]} />
                    {lockBadge}
                  </View>
                  {lockCaption ?? (
                    <Text style={[styles.optLabel, { color: c.textTertiary }]} numberOfLines={1}>{prettify(id)}</Text>
                  )}
                </Pressable>
              );
            }
            return (
              <Pressable
                key={id}
                onPress={() => selectOption(id, unlocked, label)}
                style={styles.swatchCell}
                accessibilityRole="button"
                accessibilityLabel={
                  unlocked
                    ? t('components:avatarCustomizer.optionAccessibilityLabel', { category: catLabel, name: prettify(id) })
                    : t('components:avatarCustomizer.optionLockedAccessibilityLabel', { category: catLabel, name: prettify(id), requirement: label })
                }
                accessibilityState={{ selected, disabled: !unlocked }}
              >
                <View>
                  <View style={[
                    styles.miniWrap,
                    { borderColor: selected ? c.accentDefault : c.borderDefault, borderWidth: selected ? 3 : 1, backgroundColor: c.bgSecondary },
                    !unlocked && styles.lockedVisual,
                  ]}>
                    <PeakAvatar config={{ ...draft, [cat.key]: id } as AvatarConfig} size={56} />
                  </View>
                  {lockBadge}
                </View>
                {lockCaption ?? (
                  <Text style={[styles.optLabel, { color: c.textTertiary }]} numberOfLines={1}>{prettify(id)}</Text>
                )}
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
  // Locked-state visuals
  lockedVisual: { opacity: 0.4 },
  lockBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockLabel: { fontSize: 10, textAlign: 'center', width: 72, fontWeight: '600' },
});
