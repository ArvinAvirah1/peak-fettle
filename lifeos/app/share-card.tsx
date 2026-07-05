/**
 * share-card — TICKET-120. Renders the ShareCard off-screen, captures it with
 * react-native-view-shot, and shares via expo-sharing. No upload; no in-app
 * feed. Flag-gated: when 'shareCards' is OFF, redirects back immediately.
 *
 * T170 (this pass): fires the shared `Celebration` overlay once on mount when
 * the incoming streak/milestone pair is a genuine SHARE_MILESTONES crossing.
 * Celebration is an absolutely-positioned, pointerEvents="none" overlay — it
 * never blocks taps on the buttons underneath, and it self-handles reduce-
 * motion (fires onDone immediately, no particles). Because motion can be off
 * for a user, the milestone label + numeral are ALSO always visible as plain
 * text in the card content (via ShareCard's own badge), so no information is
 * motion-only.
 *
 * Route params:
 *   streakCount  string (number)
 *   milestone    string (7 | 30 | 66 | 100 | 365)
 *
 * Stack: /share-card  (registered in _layout.tsx by the orchestrator)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { ScreenLayout, PFButton, SectionTitle } from '../src/components/ui';
import { Ionicons } from '../src/components/Icon';
import { useTheme } from '../src/theme/ThemeContext';
import { fontFamily, fontSize, spacing } from '../src/theme/tokens';
import { useFeatureFlags } from '../src/hooks/useFeatureFlags';
import { haptic } from '../src/lib/haptics';
import { showToast } from '../src/lib/feedback';
import { Celebration } from '../src/components/motion';
import { ShareCard } from '../src/features/share/ShareCard';
import { logMilestoneShareEvent } from '../src/features/share/shareEvents';
import type { ShareMilestone } from '../src/features/share/milestones';
import { SHARE_MILESTONES, MILESTONE_LABELS } from '../src/features/share/milestones';
import { localDb } from '../src/db/localDb';
import { mergedDailyLogs } from '../src/data/habits';

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
  const [celebrate, setCelebrate] = useState(false);

  // Redirect if flag is off.
  useEffect(() => {
    if (!isEnabled('shareCards')) {
      router.replace('/(tabs)');
    }
  }, [isEnabled, router]);

  // Fire the celebration overlay once shortly after mount, only for a real
  // milestone crossing. It is a non-blocking overlay — buttons stay tappable
  // throughout and after. Reduce-motion is handled entirely inside
  // Celebration (no particles, immediate onDone); the static badge in
  // ShareCard's own content covers the reduce-motion case.
  useEffect(() => {
    if (!isEnabled('shareCards')) return;
    if (!isShareMilestone(milestoneRaw)) return;
    const t = setTimeout(() => setCelebrate(true), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEnabled, milestoneRaw]);

  // Load habit names and heat snippet from localDb.
  useEffect(() => {
    (async () => {
      // Habit names: active habits ordered by creation.
      const rows = await localDb.getAll<{ name: string }>(
        `SELECT name FROM lo_habits WHERE archived_at IS NULL ORDER BY created_at LIMIT 5`
      );
      setHabitNames(rows.map((r) => r.name));

      // Heat snippet: last 14 days of merged daily status.
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
        showToast({ kind: 'error', message: 'Sharing is not supported on this device.' });
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: `${MILESTONE_LABELS[milestone]} milestone`,
      });
      // Log the share event after the system sheet dismisses.
      await logMilestoneShareEvent(streakCount);
      haptic.success();
    } catch {
      showToast({ kind: 'error', message: 'Could not share this card. Please try again.' });
    } finally {
      setCapturing(false);
    }
  }, [milestone, streakCount]);

  if (!isEnabled('shareCards')) return <View />;

  return (
    <ScreenLayout>
      {/* Non-blocking celebration overlay — pointerEvents="none" inside
          Celebration itself, so it never intercepts taps. Clears its own
          run flag via onDone so it fires exactly once. */}
      <Celebration run={celebrate} onDone={() => setCelebrate(false)} particleCount={140} />

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

      {/* Off-screen capturable card: rendered in the tree but clipped.
          The milestone label + streak numeral are part of ShareCard's own
          content (not motion-only), so this stays fully informative even
          with reduce-motion on and the Celebration overlay suppressed. */}
      <View
        style={{ overflow: 'hidden', borderRadius: 0, marginBottom: spacing.s4 }}
        accessible
        accessibilityLabel={`${MILESTONE_LABELS[milestone]} milestone card, streak ${streakCount}`}
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
