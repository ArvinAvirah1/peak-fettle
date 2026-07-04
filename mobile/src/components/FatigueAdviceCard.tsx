/**
 * FatigueAdviceCard — TICKET-142: surfaces a fatigue-aware plan-adjustment
 * proposal on the Insights screen.
 * =============================================================================
 * Wraps the DONE + TESTED engine module (lib/trainingEngine/v2/fatigue.ts,
 * FT-D1/FT-V1, 31 passing tests) with the local readiness series
 * (data/readinessSeries.ts) and the DONE dismissal persistence
 * (data/appSettings.ts). This file only assembles inputs, renders the card,
 * and wires Accept/Dismiss — it never touches the rule math or the backoff
 * arithmetic.
 *
 * VISIBILITY RULE (ticket acceptance criterion 2): the card renders ONLY when
 *   (a) an active engine plan exists (loadActivePlan) — without a plan there
 *       is nothing to adjust, AND
 *   (b) suggestPlanAdjustment(...) returns a non-null proposal.
 * Otherwise this component renders null so it costs nothing on screens/tiers
 * where it doesn't apply.
 *
 * LOCAL ON BOTH TIERS / ZERO NETWORK: every input (readiness series, active
 * plan, last_deload_at, dismissal state) is read from on-device SQLite; there
 * is no REST import here (grep-verified — see the ticket's final report).
 *
 * BOOT-PATH SAFETY: the whole evaluation (series build + plan load + rule
 * call) runs inside InteractionManager.runAfterInteractions from the host
 * screen effect (see insights.tsx), so it never competes with first paint or
 * the app-boot critical path. Nothing here runs on mount of _layout.tsx.
 *
 * THE CLOCK: `now` is read ONCE at the call site (screen-level, this
 * component's own effect) and threaded into suggestPlanAdjustment / the
 * dismissal helpers — never read inside pure logic. No literal
 * Date.now()/Math.random() appears anywhere in this file.
 *
 * The word "AI" never appears in any string in this file (founder rule).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { InteractionManager } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';
import { engineBecause } from '../i18n/engine';
import { fontWeight } from '../theme/tokens';
import {
  getFatigueAdviceDismissal,
  setFatigueAdviceDismissal,
} from '../data/appSettings';
import { buildReadinessSeries } from '../data/readinessSeries';
import { loadActivePlan } from '../planGen/planStore';
import { localDb } from '../db/localDb';
import {
  suggestPlanAdjustment,
  nextDismissalState,
  acceptedDismissalState,
  type FatigueAdvice,
} from '../lib/trainingEngine/v2/fatigue';
import type { PlanAdjustPrefillParams } from './fatigueAdviceMapping';
import { buildPlanAdjustPrefillParams } from './fatigueAdviceMapping';

// ---------------------------------------------------------------------------
// Local read: last_deload_at (on-device user_profile, id='active')
// ---------------------------------------------------------------------------

/**
 * Best-effort read of profile.last_deload_at from the local `user_profile`
 * row. Never throws — a missing table/column resolves to null, which
 * suggestPlanAdjustment already treats as "no deload on record" (FT-D1 still
 * requires a long enough history span in that case, so this degrades safely).
 */
async function loadLastDeloadAt(): Promise<string | null> {
  try {
    await localDb.init();
    const row = await localDb.getFirst<{ last_deload_at: string | null }>(
      `SELECT last_deload_at FROM user_profile WHERE id = 'active'`,
    );
    return row?.last_deload_at ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Copy (no "AI" anywhere)
// ---------------------------------------------------------------------------

/**
 * Action-title copy keys — rendered via t() in the component (this is a
 * plain lookup map keyed by the engine's action id, not a pure module used
 * elsewhere, so no render-site helper is needed here).
 */
const ACTION_TITLE_KEY: Record<FatigueAdvice['action'], string> = {
  pull_deload_forward: 'components:fatigueAdviceCard.actionTitle.pullDeloadForward',
  trim_accessory_volume: 'components:fatigueAdviceCard.actionTitle.trimAccessoryVolume',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FatigueAdviceCard(): React.ReactElement | null {
  const { theme, spacing: sp, fontSize: fs, radius: r } = useTheme();
  const { colors } = theme;
  const router = useRouter();
  const { t } = useTranslation();

  const [advice, setAdvice] = useState<FatigueAdvice | null>(null);
  const [hasPlan, setHasPlan] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Off the critical path: deferred via InteractionManager so this never
  // competes with the Insights screen's first paint / boot.
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      (async () => {
        const now = new Date(); // clock read lives HERE, at the screen-adjacent call site
        try {
          const [series, storedPlan, lastDeloadAt, dismissal] = await Promise.all([
            buildReadinessSeries(now),
            loadActivePlan(),
            loadLastDeloadAt(),
            getFatigueAdviceDismissal(),
          ]);
          if (!mountedRef.current) return;

          const activePlanExists = !!storedPlan && (storedPlan.kind === 'plan' || storedPlan.kind === 'trial');
          setHasPlan(activePlanExists);

          if (!activePlanExists) {
            setAdvice(null);
            setReady(true);
            return;
          }

          const proposal = suggestPlanAdjustment(series, {
            now,
            lastDeloadAt,
            dismissal,
          });
          setAdvice(proposal);
        } catch {
          // best-effort — the card simply doesn't render on any failure
          if (mountedRef.current) {
            setAdvice(null);
            setHasPlan(false);
          }
        } finally {
          if (mountedRef.current) setReady(true);
        }
      })();
    });
    return () => task.cancel();
  }, []);

  const handleDismiss = useCallback(async () => {
    setBusy(true);
    try {
      const now = new Date();
      const prev = await getFatigueAdviceDismissal();
      const next = nextDismissalState(prev, now.toISOString());
      await setFatigueAdviceDismissal(next);
    } finally {
      if (mountedRef.current) {
        setBusy(false);
        setAdvice(null); // hide immediately; backoff is now persisted
      }
    }
  }, []);

  const handleAccept = useCallback(async () => {
    if (!advice) return;
    setBusy(true);
    try {
      await setFatigueAdviceDismissal(acceptedDismissalState());
      const params: PlanAdjustPrefillParams = buildPlanAdjustPrefillParams(advice);
      router.push({ pathname: '/plan-adjust', params });
    } finally {
      if (mountedRef.current) {
        setBusy(false);
        setAdvice(null);
      }
    }
  }, [advice, router]);

  if (!ready || !hasPlan || !advice) return null;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.bgSecondary,
          borderRadius: r.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.accentDefault,
          padding: sp.s4,
        },
      ]}
      accessibilityRole="summary"
      accessibilityLabel={t('components:fatigueAdviceCard.cardAccessibilityLabel', { title: t(ACTION_TITLE_KEY[advice.action]) })}
    >
      <Text style={{ color: colors.accentHover, fontSize: fs.bodyMd, fontWeight: fontWeight.semibold, marginBottom: sp.s1 }}>
        {t(ACTION_TITLE_KEY[advice.action])}
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm, lineHeight: 20, marginBottom: sp.s3 }}>
        {engineBecause(advice)}
      </Text>

      <View style={styles.actionRow}>
        <TouchableOpacity
          onPress={handleDismiss}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={t('components:fatigueAdviceCard.dismissAccessibilityLabel')}
          style={[styles.dismissBtn, { opacity: busy ? 0.6 : 1 }]}
        >
          <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm, fontWeight: fontWeight.medium }}>
            {t('components:fatigueAdviceCard.dismiss')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleAccept}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={t('components:fatigueAdviceCard.reviewAccessibilityLabel')}
          style={[
            styles.acceptBtn,
            { backgroundColor: colors.accentDefault, opacity: busy ? 0.6 : 1 },
          ]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={theme.components.buttonPrimaryText} />
          ) : (
            <Text style={{ color: theme.components.buttonPrimaryText, fontSize: fs.bodySm, fontWeight: fontWeight.semibold }}>
              {t('components:fatigueAdviceCard.reviewChange')}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Static styles (colors/spacing come from theme tokens above)
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {},
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
  },
  dismissBtn: {
    minHeight: 44,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
