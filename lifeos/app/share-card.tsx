/**
 * share-card — TICKET-120. Renders the ShareCard off-screen, captures it with
 * react-native-view-shot, and shares via expo-sharing. No upload; no in-app
 * feed. Flag-gated: when 'shareCards' is OFF, redirects back immediately.
 *
 * Route params:
 *   streakCount  string (number)
 *   milestone    string (7 | 30 | 66 | 100 | 365)
 *
 * Stack: /share-card  (registered in _layout.tsx by the orchestrator)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { ScreenLayout, PFButton, SectionTitle } from '../src/components/ui';
import { Ionicons } from '../src/components/Icon';
import { useTheme } from '../src/theme/ThemeContext';
import { fontFamily, fontSize, spacing } from '../src/theme/tokens';
import { useFeatureFlags } from '../src/hooks/useFeatureFlags';
import { ShareCard } from '../src/features/share/ShareCard';
import { logMilestoneShareEvent } from '../src/features/share/shareEvents';
import type { ShareMilestone } from '../src/features/share/milestones';
import { SHARE_MILESTONES, MILESTONE_LABELS } from '../src/features/share/milestones';
import { dayKey, localDb } from '../src/db/localDb';
import { mergedDailyLogs } from '../src/data/habits';
import { computeStreak, LogStatus } from '../src/engine/streaks';

function isShareMilestone(n: number): n is ShareMilestone {
  return (SHARE_MILESTONES as readonly number[]).includes(n);
}

export default function ShareCardScreen(): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const { isEnabled } = useFeatureFlags();
  const params = useLocalSearchParams<{ streakCount: string; milestone: string }>();

  const streakCount = Number(params.streakCount ?? '0');
  const milestoneRaw = Number(params.milestone ?? '0');
  const milestone: ShareMilestone = isShareMilestone(milestoneRaw) ? milestoneRaw : 7;

  const cardRef = useRef<View>(null);
  const [habitNames, setHabitNames] = useState<string[]>([]);
  const [heatSnippet, setHeatSnippet] = useState<(string | null)[]>(Array(14).fill(null));
  const [capturing, setCapturing] = useState(false);

  // Redirect if flag is off.
  useEffect(() => {
    if (!isEnabled('shareCards')) {
      router.replace('/(tabs)');
    }
  }, [isEnabled, router]);

  // Load habit names and heat snippet from localDb.
  useEffect(() => {
    (async () => {
      // Habit names: active habits ordered by creation.
      const rows = await localDb.getAll<{ name: string }>(
        `SELECT name FROM lo_habits WHERE archived_at IS NULL ORDER BY created_at LIMIT 5`
      );
      setHabitNames(rows.map((r) => r.name));

      // Heat snippet: last 14 days of merged daily status.
      const today = dayKey();
      const merged = await mergedDailyLogs();
      const snippet: (string | null)[] = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const y = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        const dy = String(d.getDate()).padStart(2, '0');
        const dk = `${y}-${mo}-${dy}`;
        const status = merged.get(dk) ?? null;
        snippet.push(status);
      }
      setHeatSnippet(snippet);
    })();
  }, []);

  const handleCapture = useCallback(async () => {
    if (!cardRef.current) return;
    setCapturing(true);
    try {
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Sharing not available', 'Sharing is not supported on this device.');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: `${MILESTONE_LABELS[milestone]} milestone`,
      });
      // Log the share event after the system sheet dismisses.
      await logMilestoneShareEvent(streakCount);
    } catch {
      // Sharing cancelled or failed — non-fatal, no error toast.
    } finally {
      setCapturing(false);
    }
  }, [milestone, streakCount]);

  if (!isEnabled('shareCards')) return <View />;

  return (
    <ScreenLayout>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.s2 }}>
        <Ionicons name="share-social-outline" size={22} color={c.accentDefault} accessibilityLabel="" />
        <Text
          style={{
            color: c.textPrimary,
            fontFamily: fontFamily.semibold,
            fontSize: fontSize.heading3,
            marginLeft: spacing.s2,
          }}
        >
          Milestone card
        </Text>
      </View>

      <SectionTitle top={spacing.s5}>Preview</SectionTitle>

      {/* Off-screen capturable card: rendered in the tree but clipped */}
      <View
        style={{ overflow: 'hidden', borderRadius: 0, marginBottom: spacing.s4 }}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <ShareCard
          cardRef={cardRef}
          streakCount={streakCount}
          milestone={milestone}
          habitNames={habitNames}
          heatSnippet={heatSnippet}
        />
      </View>

      <Text
        style={{
          color: c.textSecondary,
          fontFamily: fontFamily.regular,
          fontSize: fontSize.bodySm,
          textAlign: 'center',
          marginBottom: spacing.s4,
          lineHeight: 20,
        }}
      >
        Tap "Share image" to save or send this card — your data stays on your device.
      </Text>

      <PFButton
        label="Share image"
        variant="primary"
        icon="share-outline"
        loading={capturing}
        onPress={handleCapture}
      />

      <PFButton
        label="Not now"
        variant="ghost"
        onPress={() => router.back()}
        style={{ marginTop: spacing.s2 }}
      />
    </ScreenLayout>
  );
}
