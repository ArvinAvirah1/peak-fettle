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
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
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
import { fontSize, fontWeight, spacing, radius } from '../src/theme/tokens';
import ReadinessCard from '../src/components/ReadinessCard';
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

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function InsightsScreen(): React.ReactElement {
  const { theme, spacing: sp, fontSize: fs, radius: r } = useTheme();
  const { colors } = theme;
  const router = useRouter();
  const { user } = useAuth();

  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [recovery, setRecovery] = useState<RecoveryResponse | null>(null);
  const [deload, setDeload] = useState<DeloadResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deloadAcking, setDeloadAcking] = useState(false);

  const load = useCallback(async () => {
    const [r, rec, d] = await Promise.all([
      getReadiness(),
      getRecovery(),
      getDeload(),
    ]);
    setReadiness(r);
    setRecovery(rec);
    setDeload(d);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
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
    // Navigate to exercise library filtered by the muscle — Agent C owns that route.
    // Pass muscle as a query param for future integration.
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
        <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm, marginBottom: sp.s5 }}>
          Evidence-based signals from your logged training and health metrics.
        </Text>

        {/* ── Deload banner ──────────────────────────────────────────────── */}
        {deload?.recommended && (
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
                },
              ]}
            >
              <Text style={{ color: '#fff', fontSize: fs.bodyMd, fontWeight: fontWeight.semibold, textAlign: 'center' }}>
                {deloadAcking ? 'Saving…' : 'Start deload week'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Readiness card ─────────────────────────────────────────────── */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary, fontSize: fs.bodyMd, fontWeight: fontWeight.semibold, marginBottom: sp.s3 }]}>
          Today's readiness
        </Text>
        <ReadinessCard data={readiness} loading={loading} />

        {/* ── Muscle heatmap ─────────────────────────────────────────────── */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary, fontSize: fs.bodyMd, fontWeight: fontWeight.semibold, marginTop: sp.s6, marginBottom: sp.s3 }]}>
          Muscle recovery
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm, marginBottom: sp.s3 }}>
          Tap a muscle to see recovery detail and suggest alternatives.
        </Text>
        {loading ? null : (
          <MuscleHeatmap
            muscles={muscles}
            loading={loading}
            onSuggestSubstitutes={handleSuggestSubstitutes}
          />
        )}

        {/* Recovery rule trace */}
        {recovery?.rule_trace && recovery.rule_trace.length > 0 && (
          <View style={[styles.recoverTrace, { backgroundColor: colors.bgSecondary, borderRadius: r.md, padding: sp.s3, marginTop: sp.s3 }]}>
            {recovery.rule_trace.map((line, i) => (
              <Text key={i} style={{ color: colors.textTertiary, fontSize: fs.micro, lineHeight: 16 }}>
                {line}
              </Text>
            ))}
          </View>
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
    paddingTop: 16,
  },
  pageTitle: {},
  sectionTitle: {},
  deloadBanner: {
    borderWidth: 1,
  },
  deloadCta: {
    paddingVertical: 12,
  },
  recoverTrace: {},
});
