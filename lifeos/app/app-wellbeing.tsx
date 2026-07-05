/**
 * app-wellbeing.tsx — TICKET-122: App Wellbeing tagging screen.
 *
 * Gated by feature flag 'appWellbeingScoring' (default OFF).
 * On-device only: no network calls, no server imports.
 *
 * v1 design rationale (from spec + roadmap):
 *   iOS exposes only opaque ApplicationToken values from FamilyActivitySelection.
 *   Rendering a human-readable name from those tokens requires a native
 *   Label(ApplicationToken) bridge — a macOS/native task deferred to v2
 *   (see `notes` in StructuredOutput). v1 ships tagging at the CATEGORY level
 *   using the opaque selection_token strings stored in lo_focus_configs, so
 *   the user can immediately rate the apps they have already chosen to limit.
 *
 * Token label display:
 *   Until the native bridge lands, we show the raw token string truncated to
 *   24 chars — same behaviour as FamilyControls' own UI when a name is
 *   unavailable. A "v1 note" banner explains this to the user.
 *
 * Entry point: surfaced from the You tab via the Features card
 *   (see entryPoints in StructuredOutput), or any linkRow that pushes
 *   '/app-wellbeing'.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '../src/theme/ThemeContext';
import { useFeatureFlags } from '../src/hooks/useFeatureFlags';
import { Card, EmptyState, ScreenLayout, SectionTitle } from '../src/components/ui';
import { Ionicons } from '../src/components/Icon';
import { fontFamily, fontSize, HIT_TARGET, radius, spacing } from '../src/theme/tokens';
import { localDb } from '../src/db/localDb';
import {
  getAllRatings,
  setRating,
  type AppRating,
  type AppRatingRow,
} from '../src/features/appscore/appRatingsDb';
import { computeRatingOnlyScore, type WeeklyScore } from '../src/features/appscore/scoringEngine';
import { haptic } from '../src/lib/haptics';
import { safeWrite } from '../src/lib/feedback';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FocusConfigRow {
  id: string;
  name: string;
  selection_token: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shorten an opaque token string for display until a native bridge exists. */
function displayLabel(tokenLabel: string, name: string): string {
  if (name && name.length > 0) return name;
  if (tokenLabel.length <= 24) return tokenLabel;
  return tokenLabel.slice(0, 21) + '…';
}

const RATING_OPTIONS: Array<{ value: AppRating; label: string; icon: string }> = [
  { value: 'energizing', label: 'Energizing', icon: 'flash-outline' },
  { value: 'neutral', label: 'Neutral', icon: 'remove-outline' },
  { value: 'draining', label: 'Draining', icon: 'battery-dead-outline' },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SegmentedRatingProps {
  tokenLabel: string;
  currentRating: AppRating | null;
  onChange: (tokenLabel: string, rating: AppRating) => void;
}

function SegmentedRating({
  tokenLabel,
  currentRating,
  onChange,
}: SegmentedRatingProps): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <View style={{ flexDirection: 'row', gap: spacing.s1, marginTop: spacing.s2 }}>
      {RATING_OPTIONS.map((opt) => {
        const selected = currentRating === opt.value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="button"
            accessibilityLabel={`${opt.label} for this app`}
            accessibilityState={{ selected }}
            onPress={() => onChange(tokenLabel, opt.value)}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: HIT_TARGET,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: selected ? c.accentDefault : c.borderDefault,
              backgroundColor: selected ? c.accentMuted : 'transparent',
              borderRadius: radius.md,
              opacity: pressed ? 0.7 : 1,
              paddingVertical: spacing.s2,
            })}
          >
            <Ionicons
              name={opt.icon}
              size={16}
              color={selected ? c.accentDefault : c.textTertiary}
            />
            <Text
              style={{
                color: selected ? c.accentDefault : c.textTertiary,
                fontFamily: selected ? fontFamily.semibold : fontFamily.regular,
                fontSize: fontSize.caption,
                marginTop: 2,
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function AppWellbeingScreen(): React.ReactElement {
  const { isEnabled } = useFeatureFlags();
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();

  // All focus configs with a selection_token — these represent app/category
  // limits the user has set up. v1: one entry per config row.
  const [configs, setConfigs] = useState<FocusConfigRow[]>([]);
  // Current ratings keyed by token_label.
  const [ratingMap, setRatingMap] = useState<Map<string, AppRating>>(new Map());
  const [weeklyScore, setWeeklyScore] = useState<WeeklyScore | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const [cfgs, ratings] = await Promise.all([
      localDb.getAll<FocusConfigRow>(
        `SELECT id, name, selection_token FROM lo_focus_configs
          WHERE selection_token IS NOT NULL AND selection_token != ''
          ORDER BY name ASC`
      ),
      getAllRatings(),
    ]);
    setConfigs(cfgs);
    const map = new Map<string, AppRating>();
    for (const r of ratings) {
      map.set(r.token_label, r.rating);
    }
    setRatingMap(map);
    setWeeklyScore(computeRatingOnlyScore(ratings));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isEnabled('appWellbeingScoring')) return;
    setLoading(true);
    void loadData();
  }, [isEnabled, loadData]);

  const handleRatingChange = useCallback(
    async (tokenLabel: string, rating: AppRating) => {
      haptic.selection();
      // Optimistic update.
      setRatingMap((prev) => new Map(prev).set(tokenLabel, rating));
      const result = await safeWrite(() => setRating(tokenLabel, rating), {
        errorMessage: "That didn't save. Please try again.",
        context: 'app-wellbeing.setRating',
      });
      if (result === undefined) return;
      // Recompute score from DB so it reflects the persisted state.
      const allRatings = await getAllRatings();
      setWeeklyScore(computeRatingOnlyScore(allRatings));
    },
    []
  );

  // Guard: flag off.
  if (!isEnabled('appWellbeingScoring')) {
    return (
      <ScreenLayout>
        <Stack.Screen options={{ title: 'App Wellbeing' }} />
        <EmptyState
          icon="lock-closed-outline"
          title="Feature not enabled"
          body="Turn on App wellbeing scoring in You > Features to use this screen."
          cta="Go to Features"
          onPress={() => router.push('/(tabs)/you')}
        />
      </ScreenLayout>
    );
  }

  // Loading state — async config + rating fetch.
  if (loading) {
    return (
      <ScreenLayout>
        <Stack.Screen options={{ title: 'App Wellbeing' }} />
        <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.s12 }}>
          <ActivityIndicator color={c.accentDefault} accessibilityLabel="Loading app wellbeing data" />
        </View>
      </ScreenLayout>
    );
  }

  // No configs — user hasn't set up any app limits yet.
  const hasConfigs = configs.length > 0;

  return (
    <ScreenLayout>
      <Stack.Screen options={{ title: 'App Wellbeing' }} />

      {/* Weekly score summary — only shown once some apps are rated */}
      {weeklyScore && weeklyScore.totalRated > 0 ? (
        <>
          <SectionTitle>This week</SectionTitle>
          <Card accessibilityLabel={`Weekly app wellbeing index: ${weeklyScore.label}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="analytics-outline" size={24} color={c.accentDefault} />
              <View style={{ marginLeft: spacing.s3, flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <Text
                    style={{
                      color: c.textPrimary,
                      fontFamily: fontFamily.bold,
                      fontSize: fontSize.heading3,
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {weeklyScore.index > 0
                      ? `+${weeklyScore.index.toFixed(1)}`
                      : weeklyScore.index.toFixed(1)}
                  </Text>
                  <Text
                    style={{
                      color: c.textSecondary,
                      fontFamily: fontFamily.medium,
                      fontSize: fontSize.bodySm,
                      marginLeft: spacing.s2,
                    }}
                  >
                    {weeklyScore.label}
                  </Text>
                </View>
                <Text
                  style={{
                    color: c.textTertiary,
                    fontFamily: fontFamily.regular,
                    fontSize: fontSize.caption,
                    marginTop: 2,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {weeklyScore.energizingCount} energizing · {weeklyScore.drainingCount} draining
                </Text>
              </View>
            </View>
            {/* Correlation-not-causation framing — required by spec */}
            <View
              style={{
                marginTop: spacing.s3,
                paddingTop: spacing.s3,
                borderTopWidth: 1,
                borderTopColor: c.borderDefault,
                flexDirection: 'row',
                alignItems: 'flex-start',
              }}
            >
              <Ionicons
                name="information-circle-outline"
                size={14}
                color={c.textTertiary}
                style={{ marginTop: 1 }}
                accessibilityLabel="Note"
              />
              <Text
                style={{
                  flex: 1,
                  color: c.textTertiary,
                  fontFamily: fontFamily.regular,
                  fontSize: fontSize.caption,
                  lineHeight: 17,
                  marginLeft: spacing.s1,
                }}
              >
                Based on your own tags — observational only, not a measure of wellbeing.
              </Text>
            </View>
          </Card>
        </>
      ) : null}

      {/* v1 notice — opaque token limitation */}
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <Ionicons
            name="construct-outline"
            size={16}
            color={c.accentDefault}
            style={{ marginTop: 2 }}
            accessibilityLabel="v1 note"
          />
          <Text
            style={{
              flex: 1,
              color: c.textSecondary,
              fontFamily: fontFamily.regular,
              fontSize: fontSize.bodySm,
              lineHeight: 21,
              marginLeft: spacing.s2,
            }}
          >
            v1: app names are shown from your limit configurations. The system can't display per-app names from Screen Time yet — that requires a native bridge coming in a future update.
          </Text>
        </View>
      </Card>

      {/* Tag list */}
      <SectionTitle top={spacing.s4}>Tag your limited apps</SectionTitle>

      {!hasConfigs ? (
        <EmptyState
          icon="apps-outline"
          illustration="focus"
          title="No app limits set up yet"
          body="Head to the Focus tab to pick apps to limit first, then come back here to tag them as Energizing, Neutral, or Draining."
          cta="Go to Focus"
          onPress={() => router.push('/(tabs)/focus')}
        />
      ) : (
        configs.map((cfg) => {
          const tokenLabel = cfg.selection_token!;
          const currentRating = ratingMap.get(tokenLabel) ?? null;
          return (
            <Card key={cfg.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="grid-outline" size={18} color={c.textTertiary} />
                <Text
                  style={{
                    flex: 1,
                    color: c.textPrimary,
                    fontFamily: fontFamily.medium,
                    fontSize: fontSize.bodyMd,
                    marginLeft: spacing.s2,
                  }}
                  numberOfLines={1}
                >
                  {displayLabel(tokenLabel, cfg.name)}
                </Text>
                {currentRating ? (
                  <Text
                    style={{
                      color: c.textTertiary,
                      fontFamily: fontFamily.regular,
                      fontSize: fontSize.caption,
                      textTransform: 'capitalize',
                    }}
                  >
                    {currentRating}
                  </Text>
                ) : null}
              </View>
              <SegmentedRating
                tokenLabel={tokenLabel}
                currentRating={currentRating}
                onChange={(tl, r) => void handleRatingChange(tl, r)}
              />
            </Card>
          );
        })
      )}

      <Text
        style={{
          color: c.textTertiary,
          fontFamily: fontFamily.regular,
          fontSize: fontSize.caption,
          lineHeight: 17,
          marginTop: spacing.s4,
          marginBottom: spacing.s8,
          textAlign: 'center',
        }}
      >
        Your tags stay on this device and are never sent to a server.
      </Text>
    </ScreenLayout>
  );
}
