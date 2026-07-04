/**
 * Progress photos — TICKET-133 (private, on-device).
 *
 * Reachable via router.push('/progress-photos') from the Progress tab (and
 * from Body Measurements). Registered in _layout.tsx as name="progress-photos".
 *
 * Sections:
 *   1. Gallery grid, grouped by date, with a pose-tag filter shelf
 *      (front/side/back/custom) — TICKET-133 AC3.
 *   2. Capture/import row (camera / library) — via expo-image-picker, guarded
 *      dynamic require (mobile/src/data/progressPhotos.ts); degrades to a
 *      clear "needs an app update" message when the native module isn't
 *      linked yet (pre-EAS-rebuild dev client).
 *   3. Two-up compare view: pick any two photos, drag a vertical divider to
 *      reveal more of one side or the other, with each photo's date labeled.
 *
 * PRIVACY: photos never touch the server on ANY tier — see progressPhotos.ts's
 * file header for the full tier-policy note. This screen only talks to
 * src/data/progressPhotos.ts (no raw api/* import — there is no photo API to
 * import from; that omission IS the point).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '../src/components/Icon';
import { useTheme } from '../src/theme/ThemeContext';
import { ScreenLayout, PFButton } from '../src/components/ui';
import { fontSize, fontWeight, spacing, radius } from '../src/theme/tokens';
import {
  ProgressPhoto,
  PhotoPose,
  PHOTO_POSE_DEFS,
  listProgressPhotos,
  captureProgressPhoto,
  importProgressPhoto,
  updateProgressPhoto,
  deleteProgressPhoto,
  photoFileUri,
  isImagePickerAvailable,
} from '../src/data/progressPhotos';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function poseLabel(pose: PhotoPose | null, t: TFunction): string {
  if (!pose) return t('screens2:progressPhotos.untagged');
  return PHOTO_POSE_DEFS.find((p) => p.key === pose)?.label ?? pose;
}

// ---------------------------------------------------------------------------
// Gallery grid tile
// ---------------------------------------------------------------------------

function PhotoTile({
  photo,
  onPress,
  selected,
}: {
  photo: ProgressPhoto;
  onPress: () => void;
  selected: boolean;
}): React.ReactElement {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const uri = photoFileUri(photo.file_name);
  return (
    <Pressable
      onPress={onPress}
      style={[
        tileStyles.tile,
        {
          borderColor: selected ? theme.colors.accentDefault : theme.colors.borderDefault,
          borderWidth: selected ? 2 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={t('screens2:progressPhotos.tileA11y', { pose: poseLabel(photo.pose, t), date: formatDate(photo.taken_at) })}
    >
      {uri ? (
        <Image source={{ uri }} style={tileStyles.image} resizeMode="cover" />
      ) : (
        <View style={[tileStyles.image, { backgroundColor: theme.colors.bgSecondary, alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name="image-outline" size={22} color={theme.colors.textTertiary} />
        </View>
      )}
      <View style={[tileStyles.caption, { backgroundColor: theme.colors.bgPrimary + 'CC' }]}>
        <Text style={{ fontSize: fontSize.micro, color: theme.colors.textSecondary }} numberOfLines={1}>
          {formatDate(photo.taken_at)}
        </Text>
      </View>
    </Pressable>
  );
}

const tileStyles = StyleSheet.create({
  tile: {
    width: '31.5%',
    aspectRatio: 3 / 4,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: spacing.s2,
  },
  image: { width: '100%', height: '100%' },
  caption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
});

// ---------------------------------------------------------------------------
// Compare view — two-up with a draggable vertical divider.
// ---------------------------------------------------------------------------

function CompareView({
  left,
  right,
  onClose,
}: {
  left: ProgressPhoto;
  right: ProgressPhoto;
  onClose: () => void;
}): React.ReactElement {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compareHeight = Math.round(width * 1.3);

  // Divider position as a fraction (0..1) of the container width. Starts at
  // the middle. PanResponder (already the pattern used by StepperLogger for
  // drag gestures in this repo) drives it directly — no gesture-handler
  // dependency needed for a single-axis drag.
  const [dividerX, setDividerX] = useState(width / 2);
  const dragStartRef = React.useRef(width / 2);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          dragStartRef.current = dividerX;
        },
        onPanResponderMove: (_evt, gesture) => {
          const next = Math.min(Math.max(dragStartRef.current + gesture.dx, 24), width - 24);
          setDividerX(next);
        },
      }),
    [dividerX, width],
  );

  const leftUri = photoFileUri(left.file_name);
  const rightUri = photoFileUri(right.file_name);

  return (
    // Safe-area-in-Modal rule (CLAUDE.md §3): apply paddingTop directly to the
    // header row rather than relying on SafeAreaView propagation inside a Modal.
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[compareStyles.container, { backgroundColor: theme.colors.bgPrimary }]}>
        <View style={[compareStyles.header, { paddingTop: Math.max(insets.top, 12), borderBottomColor: theme.colors.borderDefault }]}>
          <Text style={[compareStyles.headerTitle, { color: theme.colors.textPrimary }]}>{t('screens2:progressPhotos.compareTitle')}</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={t('screens2:progressPhotos.closeCompareA11y')}>
            <Ionicons name="close-circle-outline" size={26} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={[compareStyles.stage, { height: compareHeight }]} {...panResponder.panHandlers}>
          {/* Right (newer/second) photo fills the frame; the left photo is
              clipped to the divider position, revealing it left-to-right as
              the user drags — a standard before/after slider layout. */}
          {rightUri ? (
            <Image source={{ uri: rightUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : null}
          <View style={[StyleSheet.absoluteFill, { width: dividerX, overflow: 'hidden' }]}>
            {leftUri ? (
              <Image source={{ uri: leftUri }} style={[StyleSheet.absoluteFill, { width, height: compareHeight }]} resizeMode="cover" />
            ) : null}
          </View>

          {/* Divider handle */}
          <View
            style={[
              compareStyles.dividerLine,
              { left: dividerX - 1, backgroundColor: theme.colors.bgPrimary },
            ]}
          />
          <View
            style={[
              compareStyles.dividerHandle,
              { left: dividerX - 16, backgroundColor: theme.colors.accentDefault },
            ]}
          >
            <Ionicons name="git-compare-outline" size={18} color={theme.components.buttonPrimaryText} />
          </View>

          {/* Date labels */}
          <View style={[compareStyles.dateLabel, compareStyles.dateLabelLeft, { backgroundColor: theme.colors.bgPrimary + 'CC' }]}>
            <Text style={{ color: theme.colors.textPrimary, fontSize: fontSize.caption, fontWeight: fontWeight.semibold }}>
              {formatDate(left.taken_at)}
            </Text>
          </View>
          <View style={[compareStyles.dateLabel, compareStyles.dateLabelRight, { backgroundColor: theme.colors.bgPrimary + 'CC' }]}>
            <Text style={{ color: theme.colors.textPrimary, fontSize: fontSize.caption, fontWeight: fontWeight.semibold }}>
              {formatDate(right.taken_at)}
            </Text>
          </View>
        </View>

        <Text style={[compareStyles.hint, { color: theme.colors.textTertiary }]}>
          {t('screens2:progressPhotos.dragHint', { left: poseLabel(left.pose, t), right: poseLabel(right.pose, t) })}
        </Text>
      </View>
    </Modal>
  );
}

const compareStyles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingBottom: spacing.s3,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: fontSize.heading3, fontWeight: fontWeight.bold },
  stage: { width: '100%' },
  dividerLine: { position: 'absolute', top: 0, bottom: 0, width: 2 },
  dividerHandle: {
    position: 'absolute',
    top: '50%',
    marginTop: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateLabel: {
    position: 'absolute',
    bottom: spacing.s3,
    paddingHorizontal: spacing.s2,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  dateLabelLeft: { left: spacing.s3 },
  dateLabelRight: { right: spacing.s3 },
  hint: {
    textAlign: 'center',
    fontSize: fontSize.caption,
    paddingVertical: spacing.s3,
  },
});

// ---------------------------------------------------------------------------
// Capture / import sheet — pose picker + optional note before saving.
// ---------------------------------------------------------------------------

function CaptureSheet({
  visible,
  mode,
  onClose,
  onSaved,
}: {
  visible: boolean;
  mode: 'camera' | 'library' | null;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactElement {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [pose, setPose] = useState<PhotoPose>('front');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!mode) return;
    setSaving(true);
    try {
      const result = mode === 'camera'
        ? await captureProgressPhoto(pose, note.trim() || null)
        : await importProgressPhoto(pose, note.trim() || null);
      if (!result.ok) {
        Alert.alert(t('screens2:progressPhotos.saveFailedTitle'), result.error ?? t('screens2:progressPhotos.saveFailedBody'));
        return;
      }
      setNote('');
      onSaved();
    } finally {
      setSaving(false);
    }
  }, [mode, pose, note, onSaved]);

  if (!visible || !mode) return <></>;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={sheetStyles.backdrop}>
        <View
          style={[
            sheetStyles.sheet,
            { backgroundColor: theme.colors.bgPrimary, paddingTop: Math.max(insets.top, 12) },
          ]}
        >
          <View style={sheetStyles.handle} />
          <Text style={[sheetStyles.title, { color: theme.colors.textPrimary }]}>
            {mode === 'camera' ? t('screens2:progressPhotos.takePhoto') : t('screens2:progressPhotos.choosePhoto')}
          </Text>

          <Text style={[sheetStyles.label, { color: theme.colors.textTertiary }]}>{t('screens2:progressPhotos.poseLabel')}</Text>
          <View style={sheetStyles.poseRow}>
            {PHOTO_POSE_DEFS.map((p) => (
              <TouchableOpacity
                key={p.key}
                onPress={() => setPose(p.key as PhotoPose)}
                style={[
                  sheetStyles.poseChip,
                  {
                    borderColor: pose === p.key ? theme.colors.accentDefault : theme.colors.borderDefault,
                    backgroundColor: pose === p.key ? theme.colors.accentDefault + '1A' : 'transparent',
                  },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ checked: pose === p.key }}
              >
                <Text style={{ color: pose === p.key ? theme.colors.accentDefault : theme.colors.textSecondary, fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold }}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[sheetStyles.label, { color: theme.colors.textTertiary }]}>{t('screens2:progressPhotos.noteLabel')}</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={t('screens2:progressPhotos.notePlaceholder')}
            placeholderTextColor={theme.colors.textTertiary}
            style={[sheetStyles.noteInput, { borderColor: theme.colors.borderDefault, color: theme.colors.textPrimary }]}
            multiline
          />

          <View style={sheetStyles.actionsRow}>
            <PFButton variant="ghost" label={t('common:cancel')} onPress={onClose} disabled={saving} />
            <PFButton
              variant="primary"
              label={saving ? t('screens2:progressPhotos.savingPhoto') : t('screens2:progressPhotos.savePhoto')}
              onPress={handleSave}
              disabled={saving}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: spacing.s4, paddingBottom: spacing.s6 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#00000022', marginBottom: spacing.s3 },
  title: { fontSize: fontSize.heading3, fontWeight: fontWeight.bold, marginBottom: spacing.s3 },
  label: { fontSize: fontSize.micro, fontWeight: fontWeight.semibold, letterSpacing: 1, marginBottom: spacing.s2 },
  poseRow: { flexDirection: 'row', gap: spacing.s2, marginBottom: spacing.s4, flexWrap: 'wrap' },
  poseChip: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing.s3, paddingVertical: spacing.s2 },
  noteInput: { borderWidth: 1, borderRadius: radius.md, padding: spacing.s3, minHeight: 60, marginBottom: spacing.s4, fontSize: fontSize.bodySm },
  actionsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.s2 },
});

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ProgressPhotosScreen(): React.ReactElement {
  const { theme } = useTheme();
  const { t } = useTranslation();

  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [poseFilter, setPoseFilter] = useState<PhotoPose | 'all'>('all');
  const [captureMode, setCaptureMode] = useState<'camera' | 'library' | null>(null);

  // Compare-mode selection: up to 2 photo ids.
  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  const [comparePair, setComparePair] = useState<[ProgressPhoto, ProgressPhoto] | null>(null);

  const pickerAvailable = isImagePickerAvailable();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setPhotos(await listProgressPhotos());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const filtered = useMemo(() => {
    if (poseFilter === 'all') return photos;
    return photos.filter((p) => p.pose === poseFilter);
  }, [photos, poseFilter]);

  const handleTilePress = useCallback(
    (photo: ProgressPhoto) => {
      setCompareSelection((prev) => {
        if (prev.includes(photo.id)) return prev.filter((id) => id !== photo.id);
        if (prev.length >= 2) return [prev[1]!, photo.id];
        return [...prev, photo.id];
      });
    },
    [],
  );

  useEffect(() => {
    if (compareSelection.length === 2) {
      const [aId, bId] = compareSelection;
      const a = photos.find((p) => p.id === aId);
      const b = photos.find((p) => p.id === bId);
      if (a && b) {
        // Order left/right by date so the compare view always shows
        // older-on-left, newer-on-right regardless of tap order.
        const [older, newer] = new Date(a.taken_at) <= new Date(b.taken_at) ? [a, b] : [b, a];
        setComparePair([older, newer]);
      }
    }
  }, [compareSelection, photos]);

  const closeCompare = useCallback(() => {
    setComparePair(null);
    setCompareSelection([]);
  }, []);

  const handleDelete = useCallback(
    (photo: ProgressPhoto) => {
      Alert.alert(
        t('screens2:progressPhotos.deleteTitle'),
        t('screens2:progressPhotos.deleteBody', { pose: poseLabel(photo.pose, t), date: formatDate(photo.taken_at) }),
        [
          { text: t('common:cancel'), style: 'cancel' },
          {
            text: t('common:delete'),
            style: 'destructive',
            onPress: async () => {
              await deleteProgressPhoto(photo.id);
              await reload();
            },
          },
        ],
      );
    },
    [reload],
  );

  const selectedPhoto = photos.find((p) => compareSelection.length === 1 && p.id === compareSelection[0]) ?? null;

  return (
    <ScreenLayout scrollable={false} contentStyle={styles.content}>
      <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
        {t('screens2:progressPhotos.subtitle')}
      </Text>

      {!pickerAvailable ? (
        <View style={[styles.notice, { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault }]}>
          <Ionicons name="lock-closed-outline" size={16} color={theme.colors.textTertiary} />
          <Text style={{ color: theme.colors.textTertiary, fontSize: fontSize.caption, flex: 1 }}>
            {t('screens2:progressPhotos.pickerUnavailable')}
          </Text>
        </View>
      ) : null}

      <View style={styles.captureRow}>
        <PFButton
          variant="secondary"
          label={t('screens2:progressPhotos.cameraButton')}
          onPress={() => setCaptureMode('camera')}
          disabled={!pickerAvailable}
          style={{ flex: 1 }}
        />
        <PFButton
          variant="secondary"
          label={t('screens2:progressPhotos.libraryButton')}
          onPress={() => setCaptureMode('library')}
          disabled={!pickerAvailable}
          style={{ flex: 1 }}
        />
      </View>

      {/* Pose filter shelf */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterShelf} contentContainerStyle={{ gap: spacing.s2 }}>
        <TouchableOpacity
          onPress={() => setPoseFilter('all')}
          style={[
            styles.filterChip,
            { borderColor: poseFilter === 'all' ? theme.colors.accentDefault : theme.colors.borderDefault },
          ]}
        >
          <Text style={{ color: poseFilter === 'all' ? theme.colors.accentDefault : theme.colors.textSecondary, fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold }}>
            {t('screens2:progressPhotos.allFilter')}
          </Text>
        </TouchableOpacity>
        {PHOTO_POSE_DEFS.map((p) => (
          <TouchableOpacity
            key={p.key}
            onPress={() => setPoseFilter(p.key as PhotoPose)}
            style={[
              styles.filterChip,
              { borderColor: poseFilter === p.key ? theme.colors.accentDefault : theme.colors.borderDefault },
            ]}
          >
            <Text style={{ color: poseFilter === p.key ? theme.colors.accentDefault : theme.colors.textSecondary, fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold }}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {compareSelection.length > 0 ? (
        <View style={[styles.compareHint, { backgroundColor: theme.colors.accentDefault + '1A' }]}>
          <Text style={{ color: theme.colors.accentDefault, fontSize: fontSize.caption, fontWeight: fontWeight.semibold }}>
            {compareSelection.length === 1
              ? t('screens2:progressPhotos.tapSecondPhoto')
              : t('screens2:progressPhotos.openingCompare')}
          </Text>
          <TouchableOpacity onPress={() => setCompareSelection([])}>
            <Text style={{ color: theme.colors.accentDefault, fontSize: fontSize.caption }}>{t('common:cancel')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={theme.colors.accentDefault} style={{ marginTop: spacing.s6 }} />
      ) : filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="images-outline" size={36} color={theme.colors.textTertiary} />
          <Text style={{ color: theme.colors.textTertiary, fontSize: fontSize.bodyMd, textAlign: 'center', marginTop: spacing.s3 }}>
            {t('screens2:progressPhotos.emptyState')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          numColumns={3}
          columnWrapperStyle={{ justifyContent: 'space-between' }}
          contentContainerStyle={{ paddingBottom: spacing.s8 }}
          renderItem={({ item }) => (
            <PhotoTile
              photo={item}
              selected={compareSelection.includes(item.id)}
              onPress={() => handleTilePress(item)}
            />
          )}
          extraData={compareSelection}
        />
      )}

      {selectedPhoto ? (
        <TouchableOpacity
          onPress={() => handleDelete(selectedPhoto)}
          style={[styles.deleteFab, { backgroundColor: theme.colors.statusError }]}
          accessibilityRole="button"
accessibilityLabel={t('screens2:progressPhotos.deleteSelectedA11y')}
        >
          <Ionicons name="trash-outline" size={18} color="#fff" />
        </TouchableOpacity>
      ) : null}

      <CaptureSheet
        visible={captureMode !== null}
        mode={captureMode}
        onClose={() => setCaptureMode(null)}
        onSaved={async () => {
          setCaptureMode(null);
          await reload();
        }}
      />

      {comparePair ? (
        <CompareView left={comparePair[0]} right={comparePair[1]} onClose={closeCompare} />
      ) : null}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingBottom: 0 },
  sub: { fontSize: fontSize.bodySm, marginBottom: spacing.s3 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.s3,
    marginBottom: spacing.s3,
  },
  captureRow: { flexDirection: 'row', gap: spacing.s2, marginBottom: spacing.s3 },
  filterShelf: { marginBottom: spacing.s3 },
  filterChip: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing.s3, paddingVertical: spacing.s2 },
  compareHint: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    marginBottom: spacing.s3,
  },
  emptyState: { alignItems: 'center', paddingTop: spacing.s8 },
  deleteFab: {
    position: 'absolute',
    right: spacing.s4,
    bottom: spacing.s4,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
