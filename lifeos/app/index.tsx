/**
 * Boot gate — routes by state: auth → entitlement → disclaimer → survey → tabs.
 * (Gating order: spec §6 TICKET-101/100/107.)
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../src/auth/AuthContext';
import { useTheme } from '../src/theme/ThemeContext';
import { localDb } from '../src/db/localDb';

export const DISCLAIMER_KEY = 'lifeos.disclaimerAccepted';

export default function BootGate(): React.ReactElement {
  const { isLoading, isAuthenticated, hasLifeOsAccess } = useAuth();
  const { theme } = useTheme();
  const [disclaimerAccepted, setDisclaimerAccepted] = useState<boolean | null>(null);
  const [hasSurvey, setHasSurvey] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(DISCLAIMER_KEY)
      .then((v) => setDisclaimerAccepted(v === 'true'))
      .catch(() => setDisclaimerAccepted(false));
    localDb
      .getFirst<{ n: number }>(`SELECT COUNT(*) AS n FROM lo_survey_responses WHERE kind = 'onboarding'`)
      .then((row) => setHasSurvey((row?.n ?? 0) > 0))
      .catch(() => setHasSurvey(false));
  }, []);

  if (isLoading || disclaimerAccepted === null || hasSurvey === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bgPrimary }}>
        <ActivityIndicator color={theme.colors.accentDefault} />
      </View>
    );
  }

  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  // Entitlement: explicit false ⇒ upsell. null (offline/unknown) falls through
  // — local-first app stays usable offline; server re-checks when reachable.
  if (hasLifeOsAccess === false) return <Redirect href="/upsell" />;
  if (!disclaimerAccepted) return <Redirect href="/onboarding/disclaimer" />;
  if (!hasSurvey) return <Redirect href="/onboarding/survey" />;
  return <Redirect href="/(tabs)" />;
}
