/**
 * insights.tsx — Readiness & Recovery screen.
 *
 * Route: /insights  (navigated from profile.tsx → "Readiness & recovery")
 *
 * Sections:
 *   1. ReadinessCard — score dial, band, component breakdown, rule trace
 *   2. MuscleHeatmap — front/back SVG coloured by recovery freshness
 *   3. Deload banner — shown when GET /insights/deload recommends it
 *      CTA: "Start deload week" → POST /insights/deload/ack
 *
 * Data from mobile/src/api/insights.ts (new).
 * No raw 'bold' — fontWeight token only. All colors via useTheme().
 *
 * Agent K polish (2026-06-11):
 *   - Staggered entrance: each section fades + rises in with 60ms delay steps
 *   - Section headers use micro/uppercase/letterSpacing pattern from house style
 *   - Deload CTA uses theme token instead of hardcoded '#fff'
 *   - Empty state when no muscle data (delegated to MuscleHeatmap)
 *   - Loading state for heatmap section shows skeleton hint
 *   - Reduce Motion: all FadeInDown entering props become undefined
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme/ThemeContext';
import { useAuth } from '../src/hooks/useAuth';
import { ScreenLayout } from '../src/components/ui';
import { fontWeight } from '../src/theme/tokens';
import ReadinessCard from '../src/components/ReadinessCard';
import FatigueAdviceCard from '../src/components/FatigueAdviceCard';
import MuscleHeatmap from '../src/components/MuscleHeatmap';
import {
  getReadiness,
  getRecovery,
  getDeload,
  ackDeload,
  ReadinessResponse,
  RecoveryResponse,
  DeloadResponse,
  MuscleRecovery,
} from '../src/api/insights';
import { useReduceMotion } from '../src/hooks/useReduceMotion';

// ---------------------------------------------------------------------------
// Stagger helper
// ---------------------------------------------------------------------------

function useStaggerFade(count: number, enabled: boolean): Animated.Value[] {
  const anims = useRef(
    Array.from({ length: count }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    if (!enabled) {
      anims.forEach((a) => a.setValue(1));
      return;
    }
    const animations = anims.map((a, i) =>
      Animated.timing(a, {
        toValue: 1,
        duration: 240,
        delay: i * 60,
        useNativeDriver: true,
      })
    );
    Animated.stagger(60, animations).start();
  }, [enabled, anims]);

  return anims;
}

// Translate-Y for a staggered "fade-rise" card entrance
function staggerStyle(anim: Animated.Value): object {
  return {
    opacity: anim,
    transform: [
      {
        translateY: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [12, 0],
        }),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Section header — matches house micro/uppercase/letterSpacing pattern
// ---------------------------------------------------------------------------

function SectionHeader({ label }: { label: string }): React.ReactElement {
  const { theme, fontSize: fs, fontWeight: fw } = useTheme();
  return (
    <Text
      style={{
        fontSize: fs.micro,
        fontWeight: fw.semibold,
        color: theme.colors.textTertiary,
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        marginBottom: 12,
      }}
      accessibilityRole="header"
    >
      {label}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function InsightsScreen(): React.ReactElement {
  const { theme, spacing: sp, fontSize: fs, radius: r } = useTheme();
  const { colors } = theme;
  const router = useRouter();
  const { user } = useAuth();
  const reduceMotion = useReduceMotion();

  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [recovery, setRecovery] = useState<RecoveryResponse | null>(null);
  const [deload, setDeload] = useState<DeloadResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deloadAcking, setDeloadAcking] = useState(false);

  // Tracks whether the screen is still mounted. The data fetch (`load`) and the
  // deload-ack Alert callback both setState AFTER an `await`; on a slow Pro
  // network the user can leave the screen first, so every post-await setState
  // must be gated on this to avoid the React "setState on unmounted component"
  // warning + a wasted render. (S3-01 / unmount-guard.)
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // 4 stagger slots: deload banner (conditional), readiness, heatmap, trace
  const staggerAnims = useStaggerFade(4, !reduceMotion);

  const load = useCallback(async () => {
    // Readiness/recovery/deload are server-computed Pro signals. Free/local-first
    // users have no server-side training data, so the old unconditional 3-call
    // fetch just hung (15s each) and then showed empty cards. Skip it for them —
    // the screen renders a Pro upsell instead.
    if (!user?.is_paid) {
      if (!mountedRef.current) return;
      setReadiness(null);
      setRecovery(null);
      setDeload(null);
      return;
    }
    const [rd, rec, dl] = await Promise.all([
      getReadiness(),
      getRecovery(),
      getDeload(),
    ]);
    // Guard against setState-after-unmount and against a stale concurrent
    // load() (pull-to-refresh during an in-flight initial load) clobbering
    // fresher state once it finally settles.
    if (!mountedRef.current) return;
    setReadiness(rd);
    setRecovery(rec);
    setDeload(dl);
  }, [user?.is_paid]);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    load().finally(() => {
      if (!ignore && mountedRef.current) setLoading(false);
    });
    return () => { ignore = true; };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    if (mountedRef.current) setRefreshing(false);
  }, [load]);

  const handleAckDeload = useCallback(async () => {
    Alert.alert(
      'Start deload week',
      'This will mark today as the start of a deload and update your training schedule for the next 7 days.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start deload',
          onPress: async () => {
            setDeloadAcking(true);
            const ok = await ackDeload();
            // The Alert can outlive the screen (user backgrounds / navigates
            // while the ack POST is in flight). Gate every post-await setState
            // on the mounted ref. (S3-01 / unmount-guard.)
            if (!mountedRef.current) return;
            if (ok) {
              setDeload((prev) => (prev ? { ...prev, recommended: false } : prev));
            }
            setDeloadAcking(false);
          },
        },
      ],
    );
  }, []);

  const handleSuggestSubstitutes = useCallback((muscleName: string) => {
    router.push({ pathname: '/exercise-library', params: { muscle: muscleName } });
  }, [router]);

  const muscles: MuscleRecovery[] = recovery?.muscles ?? [];

  return (
    <ScreenLayout scrollable={false}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: sp.s5, paddingBottom: sp.s8 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accentDefault}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Page title */}
        <Text
          style={[styles.pageTitle, { color: colors.textPrimary, fontSize: fs.heading2, fontWeight: fontWeight.bold, marginBottom: sp.s2 }]}
          accessibilityRole="header"
        >
          Readiness & Recovery
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm, marginBottom: sp.s6, lineHeight: 20 }}>
          Evidence-based signals from your logged training and health metrics.
        </Text>

        {/* ── Free-tier upsell (no REST fetch happens for free users) ─────── */}
        {!user?.is_paid ? (
          <View
            style={[
              styles.deloadBanner,
              {
                backgroundColor: colors.accentSecondary,
                borderColor: colors.accentDefault,
                borderRadius: r.lg,
                padding: sp.s4,
                marginBottom: sp.s5,
              },
            ]}
          >
            <Text style={{ color: colors.textPrimary, fontSize: fs.bodyLg, fontWeight: fontWeight.bold, marginBottom: sp.s2 }}>
              Insights is a Pro feature
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm, marginBottom: sp.s3, lineHeight: 20 }}>
              Readiness, muscle-recovery and deload guidance are computed from your training on Peak Fettle Pro.
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/plans')}
              accessibilityRole="button"
              accessibilityLabel="See Pro plans"
              style={{ backgroundColor: colors.accentDefault, borderRadius: r.md, paddingVertical: sp.s3, alignItems: 'center', minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={{ color: theme.components.buttonPrimaryText, fontSize: fs.bodyMd, fontWeight: fontWeight.semibold }}>
                See Plans
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── Deload banner ──────────────────────────────────────────────── */}
        {deload?.recommended && (
          <Animated.View style={reduceMotion ? undefined : staggerStyle(staggerAnims[0])}>
            <View
              style={[
                styles.deloadBanner,
                {
                  backgroundColor: colors.statusWarning + '22',
                  borderColor: colors.statusWarning,
                  borderRadius: r.lg,
                  padding: sp.s4,
                  marginBottom: sp.s5,
                },
              ]}
              accessibilityRole="alert"
            >
              <Text style={{ color: colors.statusWarning, fontSize: fs.bodyMd, fontWeight: fontWeight.semibold, marginBottom: sp.s1 }}>
                Deload recommended
              </Text>
              {deload.triggers.length > 0 && (
                <View style={{ marginBottom: sp.s2 }}>
                  {deload.triggers.map((t, i) => (
                    <Text key={i} style={{ color: colors.textSecondary, fontSize: fs.bodySm }}>
                      • {t}
                    </Text>
                  ))}
                </View>
              )}
              <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm, marginBottom: sp.s3 }}>
                {deload.prescription}
              </Text>
              <TouchableOpacity
                onPress={handleAckDeload}
                disabled={deloadAcking}
                accessibilityRole="button"
                accessibilityLabel="Start deload week"
                style={[
                  styles.deloadCta,
                  {
                    backgroundColor: colors.statusWarning,
                    borderRadius: r.md,
                    opacity: deloadAcking ? 0.6 : 1,
                    minHeight: 44,
                    justifyContent: 'center',
                  },
                ]}
              >
                <Text style={{ color: theme.colors.bgPrimary, fontSize: fs.bodyMd, fontWeight: fontWeight.semibold, textAlign: 'center' }}>
                  {deloadAcking ? 'Saving…' : 'Start deload week'}
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* ── Fatigue-aware plan-adjustment advice (TICKET-142) ──────────── */}
        {/* Local on both tiers; renders null internally unless an active plan */}
        {/* exists AND the engine rule fires — no tier gate needed here. */}
        <View style={{ marginBottom: sp.s5 }}>
          <FatigueAdviceCard />
        </View>

        {/* ── Readiness card (Pro only) ──────────────────────────────────── */}
        {user?.is_paid ? (
          <Animated.View style={reduceMotion ? undefined : staggerStyle(staggerAnims[1])}>
            <SectionHeader label="Today's Readiness" />
            <ReadinessCard data={readiness} loading={loading} />
          </Animated.View>
        ) : null}

        {/* ── Muscle heatmap (Pro only) ──────────────────────────────────── */}
        {user?.is_paid ? (
          <Animated.View style={[reduceMotion ? undefined : staggerStyle(staggerAnims[2]), { marginTop: sp.s6 }]}>
            <SectionHeader label="Muscle Recovery" />
            <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm, marginBottom: sp.s3, lineHeight: 20 }}>
              Tap a muscle to see recovery detail and suggest alternatives.
            </Text>
            <MuscleHeatmap
              muscles={muscles}
              loading={loading}
              onSuggestSubstitutes={handleSuggestSubstitutes}
            />
          </Animated.View>
        ) : null}

        {/* Recovery rule trace */}
        {recovery?.rule_trace && recovery.rule_trace.length > 0 && (
          <Animated.View style={reduceMotion ? undefined : staggerStyle(staggerAnims[3])}>
            <View style={[styles.recoverTrace, { backgroundColor: colors.bgSecondary, borderRadius: r.md, padding: sp.s3, marginTop: sp.s3 }]}>
              {recovery.rule_trace.map((line, i) => (
                <Text key={i} style={{ color: colors.textTertiary, fontSize: fs.micro, lineHeight: 16 }}>
                  {line}
                </Text>
              ))}
            </View>
          </Animated.View>
        )}
      </ScrollView>
    </ScreenLayout>
  );
}

// ---------------------------------------------------------------------------
// Static styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  content: {
    paddingTop: 24,
  },
  pageTitle: {},
  deloadBanner: {
    borderWidth: 1,
  },
  deloadCta: {
    paddingVertical: 12,
  },
  recoverTrace: {},
});
