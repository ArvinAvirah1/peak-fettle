/**
 * Reminders screen — TICKET-124.
 *
 * Configure local notification reminders (all local, no server calls).
 * All types default OFF. Max 2/day enforced by the scheduler.
 * Affirmation rows gated by the 'affirmations' feature flag.
 *
 * Time entry: @react-native-community/datetimepicker is NOT a project dep,
 * so we use inline preset time chips (07:00 / 09:00 / 12:00 / 18:00 / 21:00)
 * — no new native dependency added.
 *
 * T169 (this pass): every custom control (time chips, weekday chips, toggle
 * switches) now carries an explicit accessibilityRole + label + state; the
 * ≤2/day + quiet-hours rule is legible as inline caption text both at the top
 * of the screen AND right above the Daily reminders section, where the
 * toggles that can trigger the cap live. Saving is implicit (every change
 * calls saveReminderConfig + rescheduleAll) so a small inline "Saving…" /
 * "Saved" indicator now tracks that in-flight write, which is wrapped in
 * `safeWrite` with a success toast. haptic.selection() fires on every
 * toggle/chip/segment change. Permission-request timing is UNCHANGED — still
 * requested lazily the first time any reminder is enabled, never on mount.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, Switch, Text, View } from 'react-native';
import { Card, ScreenLayout, SectionTitle } from '../src/components/ui';
import { Ionicons } from '../src/components/Icon';
import { useTheme } from '../src/theme/ThemeContext';
import { fontFamily, fontSize, HIT_TARGET, radius, spacing } from '../src/theme/tokens';
import { useFeatureFlags } from '../src/hooks/useFeatureFlags';
import { haptic } from '../src/lib/haptics';
import { safeWrite, showToast } from '../src/lib/feedback';
import {
  configureNotificationHandler,
  DEFAULT_REMINDER_CONFIG,
  loadReminderConfig,
  ReminderConfig,
  requestPermission,
  rescheduleAll,
  saveReminderConfig,
  summarizeSchedule,
} from '../src/services/notifications';

// ---------------------------------------------------------------------------
// Preset time options (no datetimepicker dep)
// ---------------------------------------------------------------------------

const TIME_PRESETS = ['06:00', '07:00', '08:00', '09:00', '12:00', '15:00', '18:00', '20:00', '21:00'];
const QUIET_PRESETS_START = ['20:00', '21:00', '22:00', '23:00'];
const QUIET_PRESETS_END = ['05:00', '06:00', '07:00', '08:00'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TimeChips({
  value,
  options,
  onChange,
  accessibilityLabel,
}: {
  value: string;
  options: string[];
  onChange: (t: string) => void;
  accessibilityLabel: string;
}): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s1 }}
    >
      {options.map((t) => {
        const selected = t === value;
        return (
          <Pressable
            key={t}
            accessibilityRole="radio"
            accessibilityLabel={`${accessibilityLabel} ${t}`}
            accessibilityState={{ selected, checked: selected }}
            onPress={() => {
              haptic.selection();
              onChange(t);
            }}
            style={({ pressed }) => ({
              paddingHorizontal: spacing.s3,
              paddingVertical: spacing.s1,
              borderRadius: radius.full,
              borderWidth: 1,
              borderColor: selected ? c.accentDefault : c.borderDefault,
              backgroundColor: selected ? c.accentMuted : 'transparent',
              opacity: pressed ? 0.75 : 1,
              minHeight: HIT_TARGET - 12,
              justifyContent: 'center',
            })}
          >
            <Text
              style={{
                color: selected ? c.accentDefault : c.textSecondary,
                fontFamily: fontFamily.medium,
                fontSize: fontSize.caption,
                fontVariant: ['tabular-nums'],
              }}
            >
              {t}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function WeekdayPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (day: number) => void;
}): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Day of the week"
      style={{ flexDirection: 'row', gap: spacing.s1, marginTop: spacing.s2 }}
    >
      {WEEKDAYS.map((label, idx) => {
        const selected = idx === value;
        return (
          <Pressable
            key={idx}
            accessibilityRole="radio"
            accessibilityLabel={`${WEEKDAY_FULL[idx]}`}
            accessibilityState={{ selected, checked: selected }}
            onPress={() => {
              haptic.selection();
              onChange(idx);
            }}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: HIT_TARGET - 4,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.sm,
              borderWidth: 1,
              borderColor: selected ? c.accentDefault : c.borderDefault,
              backgroundColor: selected ? c.accentMuted : 'transparent',
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Text
              style={{
                color: selected ? c.accentDefault : c.textSecondary,
                fontFamily: fontFamily.medium,
                fontSize: fontSize.caption,
              }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ReminderRow({
  label,
  subLabel,
  enabled,
  onToggle,
  time,
  onTimeChange,
  timeOptions,
  children,
}: {
  label: string;
  subLabel?: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  time: string;
  onTimeChange: (t: string) => void;
  timeOptions?: string[];
  children?: React.ReactNode;
}): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const opts = timeOptions ?? TIME_PRESETS;
  return (
    <View style={{ paddingVertical: spacing.s2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: HIT_TARGET }}>
        <View style={{ flex: 1, paddingRight: spacing.s3 }}>
          <Text style={{ color: c.textPrimary, fontFamily: fontFamily.medium, fontSize: fontSize.bodyMd }}>
            {label}
          </Text>
          {subLabel ? (
            <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: 17, marginTop: 2 }}>
              {subLabel}
            </Text>
          ) : null}
        </View>
        <Switch
          value={enabled}
          onValueChange={(v) => {
            haptic.selection();
            onToggle(v);
          }}
          trackColor={{ true: c.accentDefault, false: c.borderDefault }}
          ios_backgroundColor={c.borderDefault}
          accessibilityRole="switch"
          accessibilityLabel={`Toggle ${label}`}
          accessibilityState={{ checked: enabled }}
        />
      </View>
      {enabled ? (
        <View style={{ marginTop: spacing.s2 }}>
          <TimeChips
            value={time}
            options={opts}
            onChange={onTimeChange}
            accessibilityLabel={`${label} time`}
          />
          {children}
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function RemindersScreen(): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const { isEnabled: featureEnabled } = useFeatureFlags();
  const affirmationsOn = featureEnabled('affirmations');

  const [cfg, setCfg] = useState<ReminderConfig>(DEFAULT_REMINDER_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [permAsked, setPermAsked] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load config on mount, configure handler.
  useEffect(() => {
    configureNotificationHandler();
    void loadReminderConfig().then((c) => {
      setCfg(c);
      setLoaded(true);
    });
  }, []);

  // Persist + reschedule on every config change after initial load. Wrapped in
  // safeWrite so a thrown error surfaces a toast instead of failing silently;
  // a small inline "Saving…" indicator tracks the in-flight write.
  const applyConfig = useCallback(
    async (next: ReminderConfig) => {
      setCfg(next);
      setSaving(true);
      try {
        const saved = await safeWrite(() => saveReminderConfig(next), {
          errorMessage: "That didn't save. Please try again.",
          context: 'reminders.saveReminderConfig',
        });
        if (saved === undefined) return;
        // Request permission the first time the user enables any reminder.
        // Timing unchanged: lazy, on first enable, never on mount.
        if (!permAsked) {
          const anyEnabled =
            next.dailyHabit?.enabled ||
            next.moodPrompt?.enabled ||
            next.weeklyReview?.enabled ||
            next.affirmationMorning?.enabled ||
            next.affirmationEvening?.enabled;
          if (anyEnabled) {
            setPermAsked(true);
            await requestPermission();
          }
        }
        await rescheduleAll(next);
        showToast({ kind: 'success', message: 'Reminders updated.' });
      } finally {
        setSaving(false);
      }
    },
    [permAsked]
  );

  // Helper: update a top-level sub-object and trigger applyConfig.
  const update = useCallback(
    <K extends keyof ReminderConfig>(key: K, value: ReminderConfig[K]) => {
      const next: ReminderConfig = { ...cfg, [key]: value };
      void applyConfig(next);
    },
    [cfg, applyConfig]
  );

  const summary = loaded ? summarizeSchedule(cfg) : '';

  // Divider
  const Divider = (): React.ReactElement => (
    <View style={{ height: 1, backgroundColor: c.borderDefault, marginVertical: spacing.s1 }} />
  );

  return (
    <ScreenLayout>
      {/* Rule caption */}
      <Text
        style={{
          color: c.textTertiary,
          fontFamily: fontFamily.regular,
          fontSize: fontSize.caption,
          lineHeight: 18,
          marginTop: spacing.s3,
          marginBottom: spacing.s2,
        }}
      >
        At most 2 reminders a day, never during quiet hours. All opt-in — nothing schedules until you turn it on.
      </Text>

      {/* Live schedule summary + saving indicator */}
      {loaded ? (
        <View
          accessible
          accessibilityLabel={saving ? `${summary}. Saving.` : summary}
          style={{
            backgroundColor: c.bgElevated,
            borderRadius: radius.md,
            padding: spacing.s3,
            marginBottom: spacing.s4,
            flexDirection: 'row',
            alignItems: 'flex-start',
          }}
        >
          <Ionicons name="notifications-outline" size={16} color={c.accentDefault} style={{ marginTop: 2, marginRight: spacing.s2 }} />
          <Text
            style={{
              flex: 1,
              color: c.textSecondary,
              fontFamily: fontFamily.regular,
              fontSize: fontSize.bodySm,
              lineHeight: 20,
            }}
          >
            {summary}
          </Text>
          {saving ? (
            <Text
              style={{
                color: c.textTertiary,
                fontFamily: fontFamily.medium,
                fontSize: fontSize.caption,
                marginLeft: spacing.s2,
              }}
            >
              Saving…
            </Text>
          ) : null}
        </View>
      ) : null}

      <SectionTitle>Daily reminders</SectionTitle>
      <Text
        style={{
          color: c.textTertiary,
          fontFamily: fontFamily.regular,
          fontSize: fontSize.caption,
          lineHeight: 17,
          marginBottom: spacing.s2,
        }}
      >
        Up to 2 of these can fire on any one day — the rest quietly sit out once the cap is reached.
      </Text>
      <Card>
        <ReminderRow
          label="Habit check-in"
          subLabel="A gentle nudge to open your habit stacks"
          enabled={cfg.dailyHabit?.enabled ?? false}
          onToggle={(v) => update('dailyHabit', { ...(cfg.dailyHabit ?? { time: '08:00' }), enabled: v })}
          time={cfg.dailyHabit?.time ?? '08:00'}
          onTimeChange={(t) => update('dailyHabit', { enabled: cfg.dailyHabit?.enabled ?? false, time: t })}
        />
        <Divider />
        <ReminderRow
          label="Mood check-in"
          subLabel="A moment to notice where you are"
          enabled={cfg.moodPrompt?.enabled ?? false}
          onToggle={(v) => update('moodPrompt', { ...(cfg.moodPrompt ?? { time: '12:00' }), enabled: v })}
          time={cfg.moodPrompt?.time ?? '12:00'}
          onTimeChange={(t) => update('moodPrompt', { enabled: cfg.moodPrompt?.enabled ?? false, time: t })}
        />
      </Card>

      <SectionTitle>Weekly review</SectionTitle>
      <Card>
        <ReminderRow
          label="Weekly reflection"
          subLabel="A few minutes to see what worked"
          enabled={cfg.weeklyReview?.enabled ?? false}
          onToggle={(v) =>
            update('weeklyReview', {
              ...(cfg.weeklyReview ?? { weekday: 0, time: '18:00' }),
              enabled: v,
            })
          }
          time={cfg.weeklyReview?.time ?? '18:00'}
          onTimeChange={(t) =>
            update('weeklyReview', {
              weekday: cfg.weeklyReview?.weekday ?? 0,
              enabled: cfg.weeklyReview?.enabled ?? false,
              time: t,
            })
          }
        >
          {cfg.weeklyReview?.enabled ? (
            <View style={{ marginTop: spacing.s2 }}>
              <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption, marginBottom: spacing.s1 }}>
                Day of the week
              </Text>
              <WeekdayPicker
                value={cfg.weeklyReview?.weekday ?? 0}
                onChange={(d) =>
                  update('weeklyReview', {
                    enabled: cfg.weeklyReview?.enabled ?? false,
                    time: cfg.weeklyReview?.time ?? '18:00',
                    weekday: d,
                  })
                }
              />
            </View>
          ) : null}
        </ReminderRow>
      </Card>

      <SectionTitle>Identity affirmations</SectionTitle>
      {affirmationsOn ? (
        <Card>
          <ReminderRow
            label="Morning affirmation"
            subLabel="A grounding reminder to start the day"
            enabled={cfg.affirmationMorning?.enabled ?? false}
            onToggle={(v) =>
              update('affirmationMorning', {
                ...(cfg.affirmationMorning ?? { time: '07:30' }),
                enabled: v,
              })
            }
            time={cfg.affirmationMorning?.time ?? '07:30'}
            onTimeChange={(t) =>
              update('affirmationMorning', {
                enabled: cfg.affirmationMorning?.enabled ?? false,
                time: t,
              })
            }
          />
          <Divider />
          <ReminderRow
            label="Evening affirmation"
            subLabel="A moment to acknowledge what moved you forward"
            enabled={cfg.affirmationEvening?.enabled ?? false}
            onToggle={(v) =>
              update('affirmationEvening', {
                ...(cfg.affirmationEvening ?? { time: '21:00' }),
                enabled: v,
              })
            }
            time={cfg.affirmationEvening?.time ?? '21:00'}
            onTimeChange={(t) =>
              update('affirmationEvening', {
                enabled: cfg.affirmationEvening?.enabled ?? false,
                time: t,
              })
            }
          />
        </Card>
      ) : (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.s2 }}>
            <Ionicons name="information-circle-outline" size={18} color={c.textTertiary} />
            <Text
              style={{
                flex: 1,
                color: c.textTertiary,
                fontFamily: fontFamily.regular,
                fontSize: fontSize.bodySm,
                lineHeight: 20,
                marginLeft: spacing.s2,
              }}
            >
              Turn on Identity affirmations in You › Features to enable these reminders.
            </Text>
          </View>
        </Card>
      )}

      <SectionTitle>Quiet hours</SectionTitle>
      <Text
        style={{
          color: c.textTertiary,
          fontFamily: fontFamily.regular,
          fontSize: fontSize.caption,
          lineHeight: 17,
          marginBottom: spacing.s2,
        }}
      >
        No reminders will fire during this window.
      </Text>
      <Card>
        <View style={{ paddingVertical: spacing.s2 }}>
          <Text style={{ color: c.textSecondary, fontFamily: fontFamily.medium, fontSize: fontSize.bodySm, marginBottom: spacing.s2 }}>
            Start quiet hours
          </Text>
          <TimeChips
            value={cfg.quietStart}
            options={QUIET_PRESETS_START}
            onChange={(t) => update('quietStart', t)}
            accessibilityLabel="Quiet hours start"
          />
        </View>
        <View style={{ height: 1, backgroundColor: c.borderDefault, marginVertical: spacing.s1 }} />
        <View style={{ paddingVertical: spacing.s2 }}>
          <Text style={{ color: c.textSecondary, fontFamily: fontFamily.medium, fontSize: fontSize.bodySm, marginBottom: spacing.s2 }}>
            End quiet hours
          </Text>
          <TimeChips
            value={cfg.quietEnd}
            options={QUIET_PRESETS_END}
            onChange={(t) => update('quietEnd', t)}
            accessibilityLabel="Quiet hours end"
          />
        </View>
      </Card>

      {Platform.OS !== 'ios' ? (
        <Text
          style={{
            color: c.textTertiary,
            fontFamily: fontFamily.regular,
            fontSize: fontSize.caption,
            lineHeight: 17,
            marginTop: spacing.s3,
            textAlign: 'center',
          }}
        >
          Local reminders are iOS-only in this version.
        </Text>
      ) : null}
    </ScreenLayout>
  );
}
