/**
 * You tab — profile header + weekly recap + correlations (TICKET-109),
 * re-survey entry (TICKET-107 cadence), features, theme, data handling, the
 * permanent "Need help?" crisis link (TICKET-100), sign out (spatially
 * separated, destructive styling per nav rules).
 *
 * TICKET-168 "You-hub redesign": regrouped into Profile header / Features /
 * Data & Privacy / Support sections. Existing data calls (buildWeeklyRecap,
 * moodHabitCorrelation) and the OPTIONAL_FEATURES flag wiring are unchanged.
 */

import React, { useCallback, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeContext';
import { Card, PFButton, ScreenLayout, SectionTitle } from '../../src/components/ui';
import { Ionicons } from '../../src/components/Icon';
import { fontFamily, fontSize, HIT_TARGET, spacing } from '../../src/theme/tokens';
import { useAuth } from '../../src/auth/AuthContext';
import { buildWeeklyRecap, CorrelationInsight, moodHabitCorrelation, WeeklyRecap } from '../../src/data/insights';
import { PRODUCT_NAME } from '../../src/config/product';
import { OPTIONAL_FEATURES, type OptionalFeature } from '../../src/config/features';
import { useFeatureFlags } from '../../src/hooks/useFeatureFlags';
import { WeeklyScoreCard } from '../../src/features/appscore/WeeklyScoreCard';
import { haptic, isHapticsEnabled, setHapticsEnabled } from '../../src/lib/haptics';

export default function YouScreen(): React.ReactElement {
  const { theme, mode, setMode } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const { profile, logout } = useAuth();
  const { flags, setFlag } = useFeatureFlags();

  const [recap, setRecap] = useState<WeeklyRecap | null>(null);
  const [correlation, setCorrelation] = useState<CorrelationInsight | null>(null);
  const [correlationDismissed, setCorrelationDismissed] = useState(false);
  const [hapticsOn, setHapticsOn] = useState(isHapticsEnabled());

  useFocusEffect(
    useCallback(() => {
      void buildWeeklyRecap().then(setRecap);
      void moodHabitCorrelation().then(setCorrelation);
    }, [])
  );

  const linkRow = (icon: string, label: string, onPress: () => void, destructive = false): React.ReactElement => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: HIT_TARGET + 4,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={20} color={destructive ? c.statusError : c.accentDefault} />
      <Text
        style={{
          flex: 1,
          color: destructive ? c.statusError : c.textPrimary,
          fontFamily: fontFamily.medium,
          fontSize: fontSize.bodyMd,
          marginLeft: spacing.s3,
        }}
      >
        {label}
      </Text>
      <Ionicons name="chevron-forward-outline" size={16} color={c.textTertiary} />
    </Pressable>
  );

  const featureRow = (f: OptionalFeature): React.ReactElement => (
    <View
      key={f.key}
      style={{ flexDirection: 'row', alignItems: 'center', minHeight: HIT_TARGET, paddingVertical: spacing.s2 }}
    >
      <View style={{ flex: 1, paddingRight: spacing.s3 }}>
        <Text style={{ color: c.textPrimary, fontFamily: fontFamily.medium, fontSize: fontSize.bodyMd }}>{f.label}</Text>
        <Text
          style={{
            color: c.textTertiary,
            fontFamily: fontFamily.regular,
            fontSize: fontSize.caption,
            lineHeight: 17,
            marginTop: 2,
          }}
        >
          {f.description}
        </Text>
      </View>
      <Switch
        value={flags[f.key]}
        onValueChange={(on) => void setFlag(f.key, on)}
        trackColor={{ true: c.accentDefault, false: c.borderDefault }}
        ios_backgroundColor={c.borderDefault}
        accessibilityLabel={f.label}
        accessibilityState={{ checked: flags[f.key] }}
      />
    </View>
  );

  return (
    <ScreenLayout>
      {/* --- Profile header ---------------------------------------------- */}
      <Card variant="elevated" style={{ marginTop: spacing.s3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="person-circle-outline" size={40} color={c.accentDefault} />
          <View style={{ flex: 1, marginLeft: spacing.s3 }}>
            <Text style={{ color: c.textPrimary, fontFamily: fontFamily.semibold, fontSize: fontSize.bodyMd }}>
              {profile?.email ?? ''}
            </Text>
            <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption, marginTop: 2 }}>
              {PRODUCT_NAME}
            </Text>
          </View>
        </View>

        {recap ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.s4 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.textPrimary, fontFamily: fontFamily.bold, fontSize: fontSize.heading3, fontVariant: ['tabular-nums'] }}>
                {recap.habitsDone}
              </Text>
              <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption }}>habits done</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.textPrimary, fontFamily: fontFamily.bold, fontSize: fontSize.heading3, fontVariant: ['tabular-nums'] }}>
                {recap.avgMoodThisWeek != null ? recap.avgMoodThisWeek.toFixed(1) : '—'}
              </Text>
              <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption }}>avg mood</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.textPrimary, fontFamily: fontFamily.bold, fontSize: fontSize.heading3, fontVariant: ['tabular-nums'] }}>
                {recap.blocksHeld}
              </Text>
              <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption }}>blocks held</Text>
            </View>
          </View>
        ) : null}

        {recap?.brightSpot ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.s4 }}>
            <Ionicons name="sparkles-outline" size={16} color={c.accentDefault} />
            <Text style={{ flex: 1, color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodySm, marginLeft: spacing.s2 }}>
              {recap.brightSpot}
            </Text>
          </View>
        ) : null}
      </Card>

      {correlation && !correlationDismissed ? (
        <Card>
          <View style={{ flexDirection: 'row' }}>
            <Ionicons name="analytics-outline" size={18} color={c.accentDefault} />
            <Text style={{ flex: 1, color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodySm, lineHeight: 21, marginLeft: spacing.s2 }}>
              {correlation.text}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss insight"
              onPress={() => setCorrelationDismissed(true)}
              style={{ width: HIT_TARGET, alignItems: 'center' }}
            >
              <Ionicons name="close-outline" size={18} color={c.textTertiary} />
            </Pressable>
          </View>
        </Card>
      ) : null}

      {/* App wellbeing weekly score — self-guards on the flag + on having ratings. */}
      <WeeklyScoreCard />

      {/* --- Features ------------------------------------------------------ */}
      <SectionTitle>Features</SectionTitle>
      <Card>
        {linkRow('refresh-outline', 'Re-run the survey', () => router.push('/onboarding/survey'))}
        {linkRow('trail-sign-outline', 'Review plan proposals', () => router.push('/onboarding/plan-reveal'))}
        {linkRow('calendar-outline', 'Weekly review', () => router.push('/weekly-review'))}
        {linkRow('bar-chart-outline', 'Mood history', () => router.push('/mood-history'))}
        {linkRow('notifications-outline', 'Reminders', () => router.push('/reminders'))}
      </Card>

      <Text
        style={{
          color: c.textTertiary,
          fontFamily: fontFamily.regular,
          fontSize: fontSize.caption,
          lineHeight: 17,
          marginBottom: spacing.s2,
        }}
      >
        Optional extras — all off until you turn them on.
      </Text>
      <Card>{OPTIONAL_FEATURES.map(featureRow)}</Card>

      {flags.accountabilityPartner ? (
        <Card>{linkRow('people-outline', 'Accountability partner', () => router.push('/partner'))}</Card>
      ) : null}
      {flags.appWellbeingScoring ? (
        <Card>{linkRow('apps-outline', 'Tag your apps', () => router.push('/app-wellbeing'))}</Card>
      ) : null}
      {flags.affirmations ? (
        <Card>{linkRow('sparkles-outline', 'Affirmations', () => router.push('/affirmations'))}</Card>
      ) : null}

      {/* --- Data & Privacy ------------------------------------------------ */}
      <SectionTitle>Data & Privacy</SectionTitle>
      <Card>
        {linkRow('shield-checkmark-outline', 'How we handle your data', () => router.push('/data-handling'))}
      </Card>
      <Text
        style={{
          color: c.textTertiary,
          fontFamily: fontFamily.regular,
          fontSize: fontSize.caption,
          lineHeight: 17,
          marginTop: spacing.s1,
          marginBottom: spacing.s2,
        }}
      >
        Everything you track lives on this device.
      </Text>

      <Card>
        <Text style={{ color: c.textSecondary, fontFamily: fontFamily.medium, fontSize: fontSize.bodySm, marginBottom: spacing.s2 }}>
          Appearance
        </Text>
        <View style={{ flexDirection: 'row' }}>
          {(['system', 'dark', 'light'] as const).map((m) => (
            <Pressable
              key={m}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === m }}
              accessibilityLabel={`Theme ${m}`}
              onPress={() => {
                haptic.selection();
                setMode(m);
              }}
              style={{
                flex: 1,
                minHeight: HIT_TARGET,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: mode === m ? c.accentDefault : c.borderDefault,
                backgroundColor: mode === m ? c.accentMuted : 'transparent',
                borderRadius: 8,
                marginRight: m !== 'light' ? spacing.s2 : 0,
              }}
            >
              <Text style={{ color: c.textPrimary, fontFamily: fontFamily.medium, fontSize: fontSize.bodySm, textTransform: 'capitalize' }}>
                {m}
              </Text>
            </Pressable>
          ))}
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: HIT_TARGET,
            marginTop: spacing.s4,
            paddingTop: spacing.s3,
            borderTopWidth: 1,
            borderTopColor: c.borderDefault,
          }}
        >
          <View style={{ flex: 1, paddingRight: spacing.s3 }}>
            <Text style={{ color: c.textPrimary, fontFamily: fontFamily.medium, fontSize: fontSize.bodyMd }}>Haptics</Text>
            <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption, marginTop: 2 }}>
              Subtle vibration feedback on taps and completions.
            </Text>
          </View>
          <Switch
            value={hapticsOn}
            onValueChange={(on) => {
              setHapticsEnabled(on);
              setHapticsOn(on);
              if (on) haptic.selection();
            }}
            trackColor={{ true: c.accentDefault, false: c.borderDefault }}
            ios_backgroundColor={c.borderDefault}
            accessibilityLabel="Haptics"
            accessibilityState={{ checked: hapticsOn }}
          />
        </View>
      </Card>

      {/* --- Support -------------------------------------------------------- */}
      <SectionTitle>Support</SectionTitle>
      <Card>
        {linkRow('heart-outline', 'Need help?', () => router.push('/crisis-help'))}
      </Card>

      <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption, marginTop: spacing.s4 }}>
        {PRODUCT_NAME} · a tool for focus, habits, and direction — not a substitute for professional care.
      </Text>

      <View style={{ marginTop: spacing.s8, marginBottom: spacing.s8 }}>
        <PFButton label="Sign out" variant="destructive" onPress={() => void logout()} />
      </View>
    </ScreenLayout>
  );
}
