/**
 * ScheduleEditorSheet — TICKET-097 (Phase 1)
 *
 * Full-screen editor for a training split. Two modes:
 *   • Cycle  — an ordered, repeating sequence of slots. Add training days (each
 *              mapped to a DISTINCT routine, so Push A / Push B / Push C are just
 *              different routineIds) and rest days; reorder; remove.
 *   • Weekly — assign a routine (or rest) to each weekday.
 *
 * Persists to the on-device `schedule` table via src/data/schedule.ts (local-
 * first, backed up by TICKET-094). Widgets (Phase 2) read the same store.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from './Icon';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, spacing, radius } from '../theme/tokens';
import {
  Schedule,
  ScheduleMode,
  ScheduleSlot,
  emptySchedule,
  loadSchedule,
  saveSchedule,
} from '../data/schedule';

interface RoutineLite { id: string; name: string; }

interface Props {
  visible: boolean;
  routines: RoutineLite[];
  onClose: () => void;
  onSaved: (schedule: Schedule) => void;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type PickerTarget =
  | { kind: 'cycle'; index: number }
  | { kind: 'weekly'; weekday: number }
  | null;

export default function ScheduleEditorSheet({ visible, routines, onClose, onSaved }: Props): React.ReactElement {
  const { theme, fontWeight } = useTheme();
  const c = theme.colors;

  const [draft, setDraft] = useState<Schedule>(() => emptySchedule('cycle'));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<PickerTarget>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    loadSchedule()
      .then((s) => {
        if (cancelled) return;
        setDraft(s ?? emptySchedule('cycle'));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [visible]);

  const setMode = useCallback((mode: ScheduleMode) => {
    setDraft((d) => ({ ...d, mode }));
  }, []);

  // ── Cycle edits ────────────────────────────────────────────────────────────
  const addCycleSlot = useCallback((rest: boolean) => {
    setDraft((d) => {
      const newIndex = d.cycle.length;
      // A training day is added unassigned, then we immediately open the picker so
      // it doesn't masquerade as a rest day. A rest day stays as routineId: null.
      if (!rest) setTimeout(() => setPicker({ kind: 'cycle', index: newIndex }), 0);
      return { ...d, cycle: [...d.cycle, { routineId: null }] };
    });
  }, []);
  const removeCycleSlot = useCallback((index: number) => {
    setDraft((d) => {
      const cycle = d.cycle.filter((_, i) => i !== index);
      const position = cycle.length === 0 ? 0 : Math.min(d.position, cycle.length - 1);
      return { ...d, cycle, position };
    });
  }, []);
  const moveCycleSlot = useCallback((index: number, dir: -1 | 1) => {
    setDraft((d) => {
      const target = index + dir;
      if (target < 0 || target >= d.cycle.length) return d;
      const cycle = d.cycle.slice();
      const a = cycle[index];
      const b = cycle[target];
      if (!a || !b) return d;
      cycle[index] = b;
      cycle[target] = a;
      return { ...d, cycle };
    });
  }, []);

  // ── Picker apply ─────────────────────────────────────────────────────────────
  const applyPick = useCallback((slot: ScheduleSlot | null) => {
    setDraft((d) => {
      if (!picker) return d;
      if (picker.kind === 'cycle') {
        const cycle = d.cycle.slice();
        cycle[picker.index] = slot ?? { routineId: null };
        return { ...d, cycle };
      }
      const weekly = d.weekly.slice();
      weekly[picker.weekday] = slot;
      return { ...d, weekly };
    });
    setPicker(null);
  }, [picker]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await saveSchedule(draft);
      onSaved(draft);
      onClose();
    } finally {
      setSaving(false);
    }
  }, [draft, onSaved, onClose]);

  const slotLabel = (slot: ScheduleSlot | null): string => {
    if (!slot) return 'Tap to assign';
    if (!slot.routineId) return 'Rest day';
    return slot.routineName ?? 'Routine';
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: c.bgPrimary }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: c.borderDefault }]}>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close schedule editor">
            <Ionicons name="close" size={24} color={c.textSecondary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: c.textPrimary, fontWeight: fontWeight.bold }]}>Create schedule</Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Save schedule"
            style={[styles.saveBtn, { backgroundColor: c.accentDefault }]}
          >
            {saving
              ? <ActivityIndicator size="small" color={theme.components.buttonPrimaryText} />
              : <Text style={{ color: theme.components.buttonPrimaryText, fontWeight: fontWeight.bold, fontSize: fontSize.bodySm }}>Save</Text>}
          </TouchableOpacity>
        </View>

        {/* Mode toggle */}
        <View style={styles.modeRow}>
          {(['cycle', 'weekly'] as ScheduleMode[]).map((m) => {
            const active = draft.mode === m;
            return (
              <TouchableOpacity
                key={m}
                onPress={() => setMode(m)}
                style={[
                  styles.modeBtn,
                  { borderColor: active ? c.accentDefault : c.borderDefault, backgroundColor: active ? c.accentSecondary : 'transparent' },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={{ color: active ? c.accentDefault : c.textSecondary, fontWeight: fontWeight.semibold, fontSize: fontSize.bodySm }}>
                  {m === 'cycle' ? 'Repeating cycle' : 'Day of week'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.loading}><ActivityIndicator size="large" color={c.accentDefault} /></View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.s4, paddingBottom: spacing.s12 }}>
            <Text style={{ color: c.textTertiary, fontSize: fontSize.caption, marginBottom: spacing.s3 }}>
              {draft.mode === 'cycle'
                ? 'Build a repeating sequence. Same-type days (Push A / Push B) map to different routines. Rest days are allowed.'
                : 'Assign a routine or a rest day to each weekday.'}
            </Text>

            {draft.mode === 'cycle' ? (
              <>
                {draft.cycle.length === 0 ? (
                  <Text style={{ color: c.textTertiary, fontSize: fontSize.bodySm, marginBottom: spacing.s3 }}>
                    No days yet — add a training day or a rest day below.
                  </Text>
                ) : (
                  draft.cycle.map((slot, i) => (
                    <View key={i} style={[styles.slotRow, { backgroundColor: c.bgSecondary, borderColor: c.borderDefault }]}>
                      <Text style={{ color: c.textTertiary, fontSize: fontSize.caption, width: 54 }}>{`Day ${i + 1}`}</Text>
                      <Pressable
                        onPress={() => setPicker({ kind: 'cycle', index: i })}
                        style={styles.slotPick}
                        accessibilityRole="button"
                        accessibilityLabel={`Assign day ${i + 1}`}
                      >
                        <Text style={{ color: slot.routineId ? c.textPrimary : c.textSecondary, fontSize: fontSize.bodySm }} numberOfLines={1}>
                          {slotLabel(slot)}
                        </Text>
                      </Pressable>
                      <TouchableOpacity onPress={() => moveCycleSlot(i, -1)} accessibilityLabel="Move up" style={styles.iconBtn}>
                        <Ionicons name="chevron-up" size={16} color={c.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => moveCycleSlot(i, 1)} accessibilityLabel="Move down" style={styles.iconBtn}>
                        <Ionicons name="chevron-down" size={16} color={c.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => removeCycleSlot(i)} accessibilityLabel="Remove day" style={styles.iconBtn}>
                        <Ionicons name="trash-outline" size={16} color={c.statusError} />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
                <View style={styles.addRow}>
                  <TouchableOpacity onPress={() => addCycleSlot(false)} style={[styles.addBtn, { borderColor: c.accentDefault }]} accessibilityRole="button" accessibilityLabel="Add training day">
                    <Text style={{ color: c.accentDefault, fontWeight: fontWeight.semibold, fontSize: fontSize.bodySm }}>＋ Training day</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => addCycleSlot(true)} style={[styles.addBtn, { borderColor: c.borderDefault }]} accessibilityRole="button" accessibilityLabel="Add rest day">
                    <Text style={{ color: c.textSecondary, fontWeight: fontWeight.semibold, fontSize: fontSize.bodySm }}>＋ Rest day</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              WEEKDAYS.map((wd, i) => {
                const slot = draft.weekly[i] ?? null;
                return (
                  <View key={wd} style={[styles.slotRow, { backgroundColor: c.bgSecondary, borderColor: c.borderDefault }]}>
                    <Text style={{ color: c.textSecondary, fontSize: fontSize.bodySm, width: 92 }}>{wd}</Text>
                    <Pressable
                      onPress={() => setPicker({ kind: 'weekly', weekday: i })}
                      style={styles.slotPick}
                      accessibilityRole="button"
                      accessibilityLabel={`Assign ${wd}`}
                    >
                      <Text style={{ color: slot ? c.textPrimary : c.textTertiary, fontSize: fontSize.bodySm }} numberOfLines={1}>
                        {slotLabel(slot)}
                      </Text>
                    </Pressable>
                  </View>
                );
              })
            )}
          </ScrollView>
        )}

        {/* Routine picker */}
        <Modal visible={picker !== null} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
          <Pressable style={styles.pickerBackdrop} onPress={() => setPicker(null)} />
          <View style={[styles.pickerSheet, { backgroundColor: c.bgSecondary, borderColor: c.borderDefault }]}>
            <Text style={{ color: c.textPrimary, fontWeight: fontWeight.bold, fontSize: fontSize.bodyMd, marginBottom: spacing.s3 }}>
              Assign a routine
            </Text>
            <ScrollView style={{ maxHeight: 320 }}>
              <TouchableOpacity onPress={() => applyPick({ routineId: null })} style={[styles.pickerItem, { borderBottomColor: c.borderDefault }]}>
                <Text style={{ color: c.textSecondary, fontSize: fontSize.bodyMd }}>Rest day</Text>
              </TouchableOpacity>
              {routines.length === 0 ? (
                <Text style={{ color: c.textTertiary, fontSize: fontSize.bodySm, paddingVertical: spacing.s3 }}>
                  No routines yet — create one first, then assign it here.
                </Text>
              ) : (
                routines.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    onPress={() => applyPick({ routineId: r.id, routineName: r.name })}
                    style={[styles.pickerItem, { borderBottomColor: c.borderDefault }]}
                  >
                    <Text style={{ color: c.textPrimary, fontSize: fontSize.bodyMd }} numberOfLines={1}>{r.name}</Text>
                  </TouchableOpacity>
                ))
              )}
              {picker?.kind === 'weekly' ? (
                <TouchableOpacity onPress={() => applyPick(null)} style={styles.pickerItem}>
                  <Text style={{ color: c.textTertiary, fontSize: fontSize.bodySm }}>Clear (unset)</Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          </View>
        </Modal>
      </View>
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
  modeRow: { flexDirection: 'row', gap: spacing.s2, paddingHorizontal: spacing.s4, paddingVertical: spacing.s3 },
  modeBtn: { flex: 1, borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing.s2, alignItems: 'center' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    marginBottom: spacing.s2,
  },
  slotPick: { flex: 1, paddingVertical: spacing.s2 },
  iconBtn: { padding: spacing.s1 },
  addRow: { flexDirection: 'row', gap: spacing.s2, marginTop: spacing.s2 },
  addBtn: { flex: 1, borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing.s3, alignItems: 'center' },
  pickerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  pickerSheet: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: '20%',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.s4,
  },
  pickerItem: { paddingVertical: spacing.s3, borderBottomWidth: 1 },
});
