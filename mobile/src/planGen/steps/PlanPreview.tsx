/**
 * PlanPreview.tsx — read-only preview of a generated plan or trial sequence.
 * =============================================================================
 * Renders the final wizard step's output (Stage 1):
 *   • Single plan  → summary (split · weeks · progression/deload notes) + a
 *     week-1 per-day breakdown (exercise · sets×reps · RIR/RPE · rest).
 *   • Trial seq    → the three 3-week blocks with their date-free structure and
 *     an explainer of the trial flow (adoption itself is Stage 2).
 * Pure presentation — no engine call, no network. Theme tokens throughout.
 * =============================================================================
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../../theme/tokens';
import type {
  PlanV2,
  PlanWeekV2,
  PlanSessionV2,
  PlanSlotV2,
  TrialSequenceV2,
} from '../../lib/trainingEngine/v2/types';

function restLabel(seconds: number): string {
  if (!seconds || seconds < 60) return `${seconds || 0}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// ── One exercise slot row ─────────────────────────────────────────────────

function SlotRow({ slot }: { slot: PlanSlotV2 }): React.ReactElement {
  const { theme } = useTheme();
  const rir = slot.rir_target;
  const intensity =
    typeof rir === 'number' ? `${rir} RIR` : `RPE ${slot.rpe}`;
  return (
    <View
      style={[
        styles.slotRow,
        { backgroundColor: theme.colors.bgElevated, borderColor: theme.colors.borderDefault },
      ]}
    >
      <View style={styles.slotMain}>
        <Text style={[styles.slotName, { color: theme.colors.textPrimary }]} numberOfLines={2}>
          {slot.name}
        </Text>
        {slot.load_note ? (
          <Text style={[styles.slotNote, { color: theme.colors.textTertiary }]} numberOfLines={2}>
            {slot.load_note}
          </Text>
        ) : null}
      </View>
      <View style={styles.slotStats}>
        <Text style={[styles.slotSets, { color: theme.colors.textSecondary }]}>
          {slot.sets}×{slot.reps}
        </Text>
        <Text style={[styles.slotMeta, { color: theme.colors.textTertiary }]}>
          {intensity} · {restLabel(slot.rest_seconds)}
        </Text>
      </View>
    </View>
  );
}

// ── One training day ──────────────────────────────────────────────────────

function SessionBlock({ session }: { session: PlanSessionV2 }): React.ReactElement {
  const { theme } = useTheme();
  return (
    <View style={styles.session}>
      <Text style={[styles.sessionLabel, { color: theme.colors.accentHover }]}>
        {session.day_label}
        {session.mdOffset ? ` (${session.mdOffset})` : ''}
      </Text>
      {session.slots.length > 0 ? (
        session.slots.map((slot, i) => <SlotRow key={`${slot.exercise_id}-${i}`} slot={slot} />)
      ) : (
        <Text style={[styles.emptyDay, { color: theme.colors.textTertiary }]}>Rest / recovery day</Text>
      )}
      {session.cardio && session.cardio.length > 0 ? (
        <Text style={[styles.cardioNote, { color: theme.colors.textTertiary }]}>
          {'+ '}
          {session.cardio
            .map((c) => c.description || c.kind + (c.minutes ? ` ${c.minutes}m` : ''))
            .join(' · ')}
        </Text>
      ) : null}
    </View>
  );
}

// ── Plan summary line ─────────────────────────────────────────────────────

function summaryLine(plan: PlanV2): string {
  const meso = plan.mesocycle;
  const weeks = plan.weeks.length;
  const model = meso?.model ?? 'linear';
  const deloadWk = meso?.deloadWeek;
  const bits = [
    `${weeks} week${weeks === 1 ? '' : 's'}`,
    `${model} progression`,
  ];
  if (deloadWk) bits.push(`deload in week ${deloadWk}`);
  return bits.join(' · ');
}

// ── Single-plan preview ───────────────────────────────────────────────────

export function SinglePlanPreview({ plan }: { plan: PlanV2 }): React.ReactElement {
  const { theme } = useTheme();
  const week1: PlanWeekV2 | undefined = plan.weeks[0];
  const splitLabelMap: Record<string, string> = {
    ppl: 'Push / Pull / Legs',
    upper_lower: 'Upper / Lower',
    body_part: 'Body-part split',
    unsure: 'Auto-selected split',
  };

  return (
    <View style={styles.previewRoot}>
      <View
        style={[
          styles.summaryCard,
          { backgroundColor: theme.colors.bgSecondary, borderLeftColor: theme.colors.accentDefault },
        ]}
      >
        <Text style={[styles.summaryTitle, { color: theme.colors.accentHover }]}>
          {splitLabelMap[plan.splitPreference] ?? 'Your plan'}
        </Text>
        <Text style={[styles.summaryMeta, { color: theme.colors.textSecondary }]}>{summaryLine(plan)}</Text>
        {plan.reasoning ? (
          <Text style={[styles.summaryReasoning, { color: theme.colors.textTertiary }]}>{plan.reasoning}</Text>
        ) : null}
        {plan.peaking ? (
          <Text style={[styles.summaryReasoning, { color: theme.colors.textTertiary }]}>
            {`Peaking for a meet ${plan.peaking.weeksToMeet} weeks out.`}
          </Text>
        ) : null}
      </View>

      <Text style={[styles.weekHeader, { color: theme.colors.textTertiary }]}>
        WEEK 1 — {week1?.phase ?? 'Accumulation'}
        {week1?.isDeload ? ' (deload)' : ''}
      </Text>

      {(week1?.sessions ?? []).map((session, i) => (
        <SessionBlock key={`${session.day_label}-${i}`} session={session} />
      ))}
    </View>
  );
}

// ── Trial-sequence preview ────────────────────────────────────────────────

export function TrialSequencePreview({ sequence }: { sequence: TrialSequenceV2 }): React.ReactElement {
  const { theme } = useTheme();
  return (
    <View style={styles.previewRoot}>
      <View
        style={[
          styles.summaryCard,
          { backgroundColor: theme.colors.bgSecondary, borderLeftColor: theme.colors.accentDefault },
        ]}
      >
        <Text style={[styles.summaryTitle, { color: theme.colors.accentHover }]}>
          Trial splits — 3 blocks × 3 weeks
        </Text>
        <Text style={[styles.summaryReasoning, { color: theme.colors.textSecondary }]}>{sequence.reasoning}</Text>
      </View>

      {sequence.blocks.map((block) => {
        const week1 = block.weeks[0];
        const days = (week1?.sessions ?? []).map((s) => s.day_label).join(' · ');
        return (
          <View
            key={block.blockIndex}
            style={[
              styles.trialBlock,
              { backgroundColor: theme.colors.bgElevated, borderColor: theme.colors.borderDefault },
            ]}
          >
            <Text style={[styles.trialTitle, { color: theme.colors.textPrimary }]}>
              {`Block ${block.blockIndex + 1} — ${block.splitLabel}`}
            </Text>
            <Text style={[styles.trialMeta, { color: theme.colors.textTertiary }]}>
              {`${block.weeks.length} weeks · ${week1?.sessions.length ?? 0} days/week`}
            </Text>
            {days ? (
              <Text style={[styles.trialDays, { color: theme.colors.textSecondary }]}>{days}</Text>
            ) : null}
          </View>
        );
      })}

      <Text style={[styles.trialFooter, { color: theme.colors.textTertiary }]}>
        You'll run these back-to-back. At the end of any block you can make that split your main plan —
        setting up and adopting a block is coming next.
      </Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  previewRoot: { gap: spacing.s4 },

  summaryCard: {
    borderRadius: radius.md,
    padding: spacing.s4,
    gap: spacing.s2,
    borderLeftWidth: 3,
  },
  summaryTitle: { fontSize: fontSize.bodyMd, fontWeight: fontWeight.semibold },
  summaryMeta: { fontSize: fontSize.bodySm, fontWeight: fontWeight.medium },
  summaryReasoning: { fontSize: fontSize.bodySm, lineHeight: 20 },

  weekHeader: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },

  session: { gap: spacing.s2 },
  sessionLabel: { fontSize: fontSize.bodyMd, fontWeight: fontWeight.semibold },
  emptyDay: { fontSize: fontSize.bodySm, fontStyle: 'italic' },
  cardioNote: { fontSize: fontSize.caption, fontStyle: 'italic' },

  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    minHeight: 48,
  },
  slotMain: { flex: 1, gap: 2 },
  slotName: { fontSize: fontSize.bodySm, fontWeight: fontWeight.medium },
  slotNote: { fontSize: fontSize.micro, lineHeight: 14 },
  slotStats: { alignItems: 'flex-end', gap: 2 },
  slotSets: { fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold },
  slotMeta: { fontSize: fontSize.micro },

  trialBlock: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.s4,
    gap: spacing.s1,
  },
  trialTitle: { fontSize: fontSize.bodyMd, fontWeight: fontWeight.semibold },
  trialMeta: { fontSize: fontSize.caption },
  trialDays: { fontSize: fontSize.bodySm, marginTop: spacing.s1 },
  trialFooter: { fontSize: fontSize.bodySm, lineHeight: 20, fontStyle: 'italic' },
});
