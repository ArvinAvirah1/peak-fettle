/**
 * paywall.tsx — Peak Fettle Pro subscription paywall (RevenueCat, 2026-08-01).
 *
 * Route: /paywall (native-stack header "Peak Fettle Pro" — registered in
 * app/_layout.tsx; ScreenLayout edges={['bottom']} per the new-arch
 * double-inset rule). Navigated from the profile tab's "Upgrade to Pro".
 *
 * Shows the "default" offering's monthly ($rc_monthly → pf_pro_monthly) and
 * annual ($rc_annual → pf_pro_yearly) packages with LOCALIZED price strings
 * from StoreKit — prices are NEVER hardcoded. The offering also contains a
 * product-less $rc_weekly package; RevenueCat omits it from availablePackages
 * on iOS and usePurchases filters defensively, so the package count is never
 * assumed.
 *
 * On a successful purchase or restore the screen finalizes through
 * AuthContext.completeProPurchase (upload-first safe order → server tier sync
 * via POST /purchases/sync → in-session is_paid flip → PowerSync start).
 *
 * Local-first invariant: NO value-import from src/api/* here — all network
 * work goes through the RevenueCat SDK (usePurchases) and AuthContext.
 * Includes the Apple-required Restore Purchases button and links to the
 * Terms of Service / Privacy Policy.
 */

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ScreenLayout } from '../src/components/ui';
import { Ionicons } from '../src/components/Icon';
import { useTheme } from '../src/theme/ThemeContext';
import { fontWeight } from '../src/theme/tokens';
import { useAuth } from '../src/hooks/useAuth';
import { usePurchases } from '../src/hooks/usePurchases';
import type { RCPackage } from '../src/services/purchases';
import { haptics } from '../src/utils/haptics';

const TERMS_URL = 'https://peakfettle.app/terms';
const PRIVACY_URL = 'https://peakfettle.app/privacy';

type PlanKey = 'monthly' | 'annual';

export default function PaywallScreen(): React.ReactElement {
  const { theme, spacing: sp, fontSize: fs, radius: r } = useTheme();
  const { colors } = theme;
  const { t } = useTranslation();
  const router = useRouter();

  const { user, completeProPurchase } = useAuth();
  const {
    available,
    loading,
    loadError,
    monthly,
    annual,
    purchase,
    restore,
    refresh,
  } = usePurchases();

  const isProAlready = !!user?.is_paid;

  const [selected, setSelected] = useState<PlanKey>('annual');
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeProgress, setFinalizeProgress] = useState<{ done: number; total: number } | null>(null);

  const busy = purchasing || restoring || finalizing;

  // ── Finalize (shared by purchase + restore) ───────────────────────────────
  // Runs the upload-first Pro transition. Resumable: a transient failure keeps
  // the user free in-session and offers "Try again" (ledger skips done rows).
  const finalize = useCallback(async () => {
    setFinalizing(true);
    setFinalizeProgress({ done: 0, total: 0 });
    try {
      const outcome = await completeProPurchase((done, total) => {
        setFinalizeProgress({ done, total });
      });
      haptics.success();
      const parts = [t('screens2:paywall.uploadedItems', { count: outcome.uploaded })];
      if (outcome.skipped > 0) {
        parts.push(t('screens2:paywall.skippedItems', { count: outcome.skipped }));
      }
      Alert.alert(t('screens2:paywall.youreProTitle'), parts.join('\n\n'), [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch {
      haptics.error();
      Alert.alert(
        t('screens2:paywall.finalizeIncompleteTitle'),
        t('screens2:paywall.finalizeIncompleteMessage'),
        [
          { text: t('screens2:paywall.notNow'), style: 'cancel' },
          { text: t('screens2:paywall.tryAgain'), onPress: () => { void finalize(); } },
        ],
      );
    } finally {
      setFinalizing(false);
      setFinalizeProgress(null);
    }
  }, [completeProPurchase, router, t]);

  // ── Purchase ──────────────────────────────────────────────────────────────
  const handlePurchase = useCallback(async () => {
    const pkg: RCPackage | null = selected === 'monthly' ? monthly : annual;
    if (!pkg || busy) return;
    haptics.medium();
    setPurchasing(true);
    try {
      const info = await purchase(pkg);
      if (!info) return; // user cancelled — no alert needed
      await finalize();
    } catch (err) {
      haptics.error();
      Alert.alert(
        t('screens2:paywall.purchaseFailedTitle'),
        err instanceof Error ? err.message : t('screens2:paywall.purchaseFailedMessage'),
      );
    } finally {
      setPurchasing(false);
    }
  }, [selected, monthly, annual, busy, purchase, finalize, t]);

  // ── Restore (Apple-required) ──────────────────────────────────────────────
  const handleRestore = useCallback(async () => {
    if (busy) return;
    haptics.light();
    setRestoring(true);
    try {
      const info = await restore();
      const entitled = info?.entitlements?.active
        && Object.keys(info.entitlements.active).length > 0;
      if (entitled) {
        await finalize();
      } else {
        Alert.alert(
          t('screens2:paywall.restoreNoneTitle'),
          t('screens2:paywall.restoreNoneMessage'),
        );
      }
    } catch (err) {
      Alert.alert(
        t('screens2:paywall.restoreFailedTitle'),
        err instanceof Error ? err.message : t('screens2:paywall.purchaseFailedMessage'),
      );
    } finally {
      setRestoring(false);
    }
  }, [busy, restore, finalize, t]);

  // ── Plan card renderer ────────────────────────────────────────────────────
  const renderPlan = (
    key: PlanKey,
    pkg: RCPackage | null,
    label: string,
    priceLine: (price: string) => string,
    termsLine: string,
    badge?: string,
  ): React.ReactElement | null => {
    if (!pkg) return null;
    const isSelected = selected === key;
    return (
      <TouchableOpacity
        key={key}
        onPress={() => { haptics.light(); setSelected(key); }}
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={t('screens2:paywall.selectPlanA11y', { plan: label })}
        style={[
          styles.planCard,
          {
            backgroundColor: colors.bgSecondary,
            borderRadius: r.lg,
            borderWidth: isSelected ? 2 : StyleSheet.hairlineWidth,
            borderColor: isSelected ? colors.accentDefault : colors.borderDefault,
            padding: sp.s4,
            marginBottom: sp.s3,
          },
        ]}
      >
        <View style={styles.planRow}>
          <View style={styles.planText}>
            <View style={styles.planLabelRow}>
              <Text style={{ color: colors.textPrimary, fontSize: fs.bodyMd, fontWeight: fontWeight.semibold }}>
                {label}
              </Text>
              {badge ? (
                <View style={[styles.badge, { backgroundColor: colors.accentDefault, borderRadius: r.sm, marginLeft: sp.s2 }]}>
                  <Text style={{ color: theme.components.buttonPrimaryText, fontSize: fs.micro, fontWeight: fontWeight.bold }}>
                    {badge}
                  </Text>
                </View>
              ) : null}
            </View>
            {/* Localized price straight from StoreKit — never hardcoded. */}
            <Text style={{ color: colors.textPrimary, fontSize: fs.heading3, fontWeight: fontWeight.bold, marginTop: 2 }}>
              {priceLine(pkg.product.priceString)}
            </Text>
            <Text style={{ color: colors.textTertiary, fontSize: fs.caption, marginTop: 2 }}>
              {termsLine}
            </Text>
          </View>
          <Ionicons
            name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
            size={22}
            color={isSelected ? colors.accentDefault : colors.textTertiary}
          />
        </View>
      </TouchableOpacity>
    );
  };

  // ── Body states ───────────────────────────────────────────────────────────
  let body: React.ReactNode;

  if (isProAlready) {
    body = (
      <View style={[styles.stateBox, { backgroundColor: colors.bgSecondary, borderRadius: r.lg, borderColor: colors.borderDefault, padding: sp.s5 }]}>
        <Ionicons name="checkmark-circle" size={36} color={colors.accentDefault} />
        <Text style={{ color: colors.textPrimary, fontSize: fs.bodyMd, fontWeight: fontWeight.semibold, marginTop: sp.s2 }}>
          {t('screens2:paywall.alreadyProTitle')}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm, textAlign: 'center', marginTop: sp.s1 }}>
          {t('screens2:paywall.alreadyProBody')}
        </Text>
      </View>
    );
  } else if (!available) {
    body = (
      <View style={[styles.stateBox, { backgroundColor: colors.bgSecondary, borderRadius: r.lg, borderColor: colors.borderDefault, padding: sp.s5 }]}>
        <Ionicons name="cart-outline" size={32} color={colors.textTertiary} />
        <Text style={{ color: colors.textPrimary, fontSize: fs.bodyMd, fontWeight: fontWeight.semibold, marginTop: sp.s2 }}>
          {t('screens2:paywall.unavailableTitle')}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm, textAlign: 'center', marginTop: sp.s1 }}>
          {t('screens2:paywall.unavailableBody')}
        </Text>
      </View>
    );
  } else if (loading) {
    body = (
      <View style={[styles.stateBox, { padding: sp.s6 }]}>
        <ActivityIndicator size="large" color={colors.accentDefault} />
      </View>
    );
  } else if (loadError || (!monthly && !annual)) {
    body = (
      <View style={[styles.stateBox, { backgroundColor: colors.bgSecondary, borderRadius: r.lg, borderColor: colors.borderDefault, padding: sp.s5 }]}>
        <Text style={{ color: colors.textPrimary, fontSize: fs.bodyMd, fontWeight: fontWeight.semibold }}>
          {t('screens2:paywall.loadErrorTitle')}
        </Text>
        {loadError ? (
          <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm, textAlign: 'center', marginTop: sp.s1 }}>
            {loadError}
          </Text>
        ) : null}
        <TouchableOpacity
          onPress={refresh}
          accessibilityRole="button"
          style={[styles.retryBtn, { borderColor: colors.accentDefault, borderRadius: r.md, paddingVertical: sp.s2, paddingHorizontal: sp.s4, marginTop: sp.s3 }]}
        >
          <Text style={{ color: colors.accentDefault, fontSize: fs.bodySm, fontWeight: fontWeight.semibold }}>
            {t('screens2:paywall.retry')}
          </Text>
        </TouchableOpacity>
      </View>
    );
  } else if (finalizing) {
    body = (
      <View
        style={[styles.stateBox, { backgroundColor: colors.bgSecondary, borderRadius: r.lg, borderColor: colors.borderDefault, padding: sp.s5 }]}
        accessibilityRole="progressbar"
        accessibilityLabel={t('screens2:paywall.settingUp')}
      >
        <ActivityIndicator size="large" color={colors.accentDefault} />
        <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm, marginTop: sp.s3 }}>
          {t('screens2:paywall.settingUp')}
        </Text>
        {finalizeProgress && finalizeProgress.total > 0 ? (
          <Text style={{ color: colors.textTertiary, fontSize: fs.caption, marginTop: sp.s1 }}>
            {t('screens2:paywall.settingUpProgress', {
              done: Math.min(finalizeProgress.done, finalizeProgress.total),
              total: finalizeProgress.total,
            })}
          </Text>
        ) : null}
      </View>
    );
  } else {
    body = (
      <>
        {renderPlan(
          'annual',
          annual,
          t('screens2:paywall.annualLabel'),
          (price) => t('screens2:paywall.annualPerYear', { price }),
          t('screens2:paywall.annualTerms'),
          t('screens2:paywall.bestValue'),
        )}
        {renderPlan(
          'monthly',
          monthly,
          t('screens2:paywall.monthlyLabel'),
          (price) => t('screens2:paywall.monthlyPerMonth', { price }),
          t('screens2:paywall.monthlyTerms'),
        )}

        {/* Primary CTA */}
        <TouchableOpacity
          onPress={handlePurchase}
          disabled={busy || (selected === 'monthly' ? !monthly : !annual)}
          accessibilityRole="button"
          accessibilityLabel={t('screens2:paywall.subscribeA11y')}
          style={[
            styles.cta,
            {
              backgroundColor: colors.accentDefault,
              borderRadius: r.lg,
              paddingVertical: sp.s4,
              marginTop: sp.s2,
              opacity: busy ? 0.7 : 1,
            },
          ]}
        >
          {purchasing ? (
            <ActivityIndicator color={theme.components.buttonPrimaryText} />
          ) : (
            <Text style={{ color: theme.components.buttonPrimaryText, fontSize: fs.bodyMd, fontWeight: fontWeight.bold }}>
              {t('screens2:paywall.subscribeCta')}
            </Text>
          )}
        </TouchableOpacity>

        {/* Restore Purchases — Apple-required */}
        <TouchableOpacity
          onPress={handleRestore}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={t('screens2:paywall.restoreA11y')}
          style={[styles.restoreBtn, { paddingVertical: sp.s3, marginTop: sp.s2 }]}
        >
          <Text style={{ color: colors.accentDefault, fontSize: fs.bodySm, fontWeight: fontWeight.semibold }}>
            {restoring ? t('screens2:paywall.restoring') : t('screens2:paywall.restorePurchases')}
          </Text>
        </TouchableOpacity>

        {/* Subscription terms */}
        <Text style={{ color: colors.textTertiary, fontSize: fs.micro, lineHeight: 16, marginTop: sp.s4 }}>
          {t('screens2:paywall.legalBlurb')}
        </Text>

        {/* Legal links */}
        <View style={[styles.legalRow, { marginTop: sp.s3 }]}>
          <TouchableOpacity
            onPress={() => { Linking.openURL(TERMS_URL).catch(() => {}); }}
            accessibilityRole="link"
          >
            <Text style={{ color: colors.textSecondary, fontSize: fs.caption, textDecorationLine: 'underline' }}>
              {t('screens2:paywall.termsOfService')}
            </Text>
          </TouchableOpacity>
          <Text style={{ color: colors.textTertiary, fontSize: fs.caption, marginHorizontal: sp.s2 }}>·</Text>
          <TouchableOpacity
            onPress={() => { Linking.openURL(PRIVACY_URL).catch(() => {}); }}
            accessibilityRole="link"
          >
            <Text style={{ color: colors.textSecondary, fontSize: fs.caption, textDecorationLine: 'underline' }}>
              {t('screens2:paywall.privacyPolicy')}
            </Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  return (
    <ScreenLayout scrollable={false} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: sp.s8 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero copy */}
        <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm, lineHeight: 20, marginBottom: sp.s5 }}>
          {t('screens2:paywall.subtitle')}
        </Text>

        {/* Feature list */}
        {!isProAlready ? (
          <View style={{ marginBottom: sp.s5 }}>
            {[
              ['sync-outline', t('screens2:paywall.featureSync'), t('screens2:paywall.featureSyncSub')],
              ['cloud-done-outline', t('screens2:paywall.featureCloud'), t('screens2:paywall.featureCloudSub')],
              ['sparkles-outline', t('screens2:paywall.featureEverything'), t('screens2:paywall.featureEverythingSub')],
            ].map(([icon, title, sub]) => (
              <View key={title as string} style={[styles.featureRow, { marginBottom: sp.s3 }]}>
                <Ionicons name={icon as never} size={20} color={colors.accentDefault} />
                <View style={{ marginLeft: sp.s3, flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: fs.bodySm, fontWeight: fontWeight.semibold }}>
                    {title}
                  </Text>
                  <Text style={{ color: colors.textTertiary, fontSize: fs.caption, marginTop: 1 }}>
                    {sub}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {body}
      </ScrollView>
    </ScreenLayout>
  );
}

// ---------------------------------------------------------------------------
// Static styles (colors/spacing come from useTheme at render time)
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  content: {
    paddingTop: 24,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  planCard: {},
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  planText: {
    flex: 1,
  },
  planLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  cta: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  restoreBtn: {
    alignItems: 'center',
  },
  retryBtn: {
    borderWidth: 1,
  },
  stateBox: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
