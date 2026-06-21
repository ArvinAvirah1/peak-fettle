/**
 * Affirmations screen — TICKET-123.
 *
 * Shows the list of all affirmation lines with a per-line enable Switch,
 * plus a PFInput to add a custom line. Feature-gated: if the 'affirmations'
 * flag is OFF the screen shows an EmptyState explaining how to enable it
 * rather than silently blanking (LIFEOS_DESIGN_CONTRACT_V3 §2).
 *
 * Route: /affirmations  (pushed from the Today-tab card or the You-tab link).
 */

import React, { useState } from 'react';
import { ActivityIndicator, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme/ThemeContext';
import {
  Card,
  EmptyState,
  PFButton,
  PFInput,
  ScreenLayout,
  SectionTitle,
} from '../src/components/ui';
import { Ionicons } from '../src/components/Icon';
import { fontFamily, fontSize, HIT_TARGET, spacing } from '../src/theme/tokens';
import { useFeatureFlags } from '../src/hooks/useFeatureFlags';
import { useAffirmations } from '../src/features/affirmations/useAffirmations';

export default function AffirmationsScreen(): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();

  const { isEnabled } = useFeatureFlags();
  const flagOn = isEnabled('affirmations');

  const { rows, todayLine, loading, toggle, addLine } = useAffirmations();

  const [draftText, setDraftText] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Feature OFF state — explain and link back.
  if (!flagOn) {
    return (
      <ScreenLayout>
        <EmptyState
          icon="sparkles-outline"
          title="Affirmations are off"
          body="Turn on Identity affirmations in the You tab under Features to use this."
          cta="Go to You"
          onPress={() => router.push('/(tabs)/you')}
        />
      </ScreenLayout>
    );
  }

  // Initial load
  if (loading) {
    return (
      <ScreenLayout>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.s12 }}>
          <ActivityIndicator color={c.accentDefault} />
        </View>
      </ScreenLayout>
    );
  }

  const handleAdd = async (): Promise<void> => {
    const trimmed = draftText.trim();
    if (!trimmed) {
      setAddError('Please enter a line before adding.');
      return;
    }
    if (trimmed.length > 200) {
      setAddError('Keep it under 200 characters.');
      return;
    }
    setAdding(true);
    setAddError(null);
    await addLine(trimmed);
    setDraftText('');
    setAdding(false);
  };

  const seedRows = rows.filter((r) => r.source === 'seed');
  const userRows = rows.filter((r) => r.source === 'user');

  return (
    <ScreenLayout>
      {/* Today's line preview */}
      {todayLine ? (
        <>
          <SectionTitle>Today</SectionTitle>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <Ionicons
                name="sparkles-outline"
                size={18}
                color={c.accentDefault}
                style={{ marginTop: 2, marginRight: spacing.s3 }}
                accessibilityLabel=""
              />
              <Text
                style={{
                  flex: 1,
                  color: c.textPrimary,
                  fontFamily: fontFamily.regular,
                  fontSize: fontSize.bodyMd,
                  lineHeight: 24,
                }}
              >
                {todayLine.text}
              </Text>
            </View>
          </Card>
        </>
      ) : null}

      {/* Add your own */}
      <SectionTitle>Add your own</SectionTitle>
      <Card>
        <PFInput
          label="Your affirmation"
          placeholder='e.g. "I am someone who…"'
          value={draftText}
          onChangeText={(t) => {
            setDraftText(t);
            if (addError) setAddError(null);
          }}
          error={addError}
          helper="Keep it identity-anchored and forward-looking."
          returnKeyType="done"
          onSubmitEditing={() => void handleAdd()}
          maxLength={200}
          multiline={false}
        />
        <PFButton
          label="Add line"
          icon="add-outline"
          onPress={() => void handleAdd()}
          loading={adding}
          disabled={draftText.trim().length === 0}
        />
      </Card>

      {/* User lines */}
      {userRows.length > 0 ? (
        <>
          <SectionTitle>Your lines</SectionTitle>
          <Card>
            {userRows.map((row, idx) => (
              <View
                key={row.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  minHeight: HIT_TARGET,
                  paddingVertical: spacing.s2,
                  borderTopWidth: idx > 0 ? 1 : 0,
                  borderTopColor: c.borderDefault,
                }}
              >
                <Text
                  style={{
                    flex: 1,
                    color: row.enabled ? c.textPrimary : c.textTertiary,
                    fontFamily: fontFamily.regular,
                    fontSize: fontSize.bodyMd,
                    lineHeight: 22,
                    paddingRight: spacing.s3,
                  }}
                >
                  {row.text}
                </Text>
                <Switch
                  value={row.enabled === 1}
                  onValueChange={(on) => void toggle(row.id, on)}
                  trackColor={{ true: c.accentDefault, false: c.borderDefault }}
                  ios_backgroundColor={c.borderDefault}
                  accessibilityLabel={`Enable: ${row.text}`}
                  accessibilityState={{ checked: row.enabled === 1 }}
                />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {/* Seed lines */}
      <SectionTitle>Built-in lines</SectionTitle>
      <Text
        style={{
          color: c.textTertiary,
          fontFamily: fontFamily.regular,
          fontSize: fontSize.caption,
          lineHeight: 17,
          marginBottom: spacing.s2,
        }}
      >
        Toggle off any lines you don't want included in your daily rotation.
      </Text>
      <Card>
        {seedRows.map((row, idx) => (
          <View
            key={row.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              minHeight: HIT_TARGET,
              paddingVertical: spacing.s2,
              borderTopWidth: idx > 0 ? 1 : 0,
              borderTopColor: c.borderDefault,
            }}
          >
            <Text
              style={{
                flex: 1,
                color: row.enabled ? c.textPrimary : c.textTertiary,
                fontFamily: fontFamily.regular,
                fontSize: fontSize.bodyMd,
                lineHeight: 22,
                paddingRight: spacing.s3,
              }}
            >
              {row.text}
            </Text>
            <Switch
              value={row.enabled === 1}
              onValueChange={(on) => void toggle(row.id, on)}
              trackColor={{ true: c.accentDefault, false: c.borderDefault }}
              ios_backgroundColor={c.borderDefault}
              accessibilityLabel={`Enable: ${row.text}`}
              accessibilityState={{ checked: row.enabled === 1 }}
            />
          </View>
        ))}
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          icon="sparkles-outline"
          title="No affirmations yet"
          body="Add your own above, or wait a moment for the built-in lines to load."
        />
      ) : null}
    </ScreenLayout>
  );
}
