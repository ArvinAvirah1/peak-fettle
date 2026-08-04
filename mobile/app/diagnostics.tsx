/**
 * Diagnostics screen (2026-07-02) — surfaces the perfMonitor report so the
 * free-tier responsiveness bug can be diagnosed ON DEVICE without a Mac.
 *
 * Reached from Profile → Diagnostics. Reproduce the lag, open this screen,
 * tap Share, and send the JSON. The three sections map to the three failure
 * theories:
 *   • JS stalls   → the JS thread was blocked (dead taps) — when + how long
 *   • Slow DB ops → SQLite queries > 30 ms (screens hung on local data)
 *   • Network     → EVERY request this session (free tier should be ~empty;
 *                   hot loops or 15 s timeouts show up immediately)
 */

import React, { useCallback, useState } from 'react';
import { Share, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ScreenLayout } from '../src/components/ui';
import { useTheme } from '../src/theme/ThemeContext';
import { fontSize, spacing, radius } from '../src/theme/tokens';
import {
  getPerfReport,
  clearPerfReport,
  PerfReport,
} from '../src/diagnostics/perfMonitor';

function fmtClock(epochMs: number): string {
  const d = new Date(epochMs);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export default function DiagnosticsScreen(): React.ReactElement {
  const { theme, fontWeight } = useTheme();
  const { t } = useTranslation();
  const c = theme.colors;
  const [report, setReport] = useState<PerfReport>(() => getPerfReport());

  const refresh = useCallback(() => setReport(getPerfReport()), []);

  const share = useCallback(async () => {
    try {
      await Share.share({
        title: t('screens2:diagnostics.shareTitle'),
        message: JSON.stringify(getPerfReport(), null, 2),
      });
    } catch {
      // user cancelled — fine
    }
  }, [t]);

  const clear = useCallback(() => {
    clearPerfReport();
    setReport(getPerfReport());
  }, []);

  const sectionTitle = (label: string): React.ReactElement => (
    <Text
      style={{
        color: c.textTertiary,
        fontSize: fontSize.caption,
        fontWeight: fontWeight.semibold as '600',
        marginTop: spacing.s4,
        marginBottom: spacing.s2,
        letterSpacing: 1,
      }}
    >
      {label}
    </Text>
  );

  const row = (key: string, left: string, right: string, bad: boolean): React.ReactElement => (
    <View
      key={key}
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: c.borderDefault,
      }}
    >
      <Text style={{ color: c.textSecondary, fontSize: fontSize.bodySm, flex: 1 }} numberOfLines={2}>
        {left}
      </Text>
      <Text
        style={{
          color: bad ? c.statusError : c.textPrimary,
          fontSize: fontSize.bodySm,
          fontWeight: fontWeight.semibold as '600',
          marginLeft: spacing.s3,
        }}
      >
        {right}
      </Text>
    </View>
  );

  const btn = (label: string, onPress: () => void, primary?: boolean): React.ReactElement => (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flex: 1,
        height: 44,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: primary ? c.accentDefault : c.bgSecondary,
        borderWidth: primary ? 0 : 1,
        borderColor: c.borderDefault,
        marginHorizontal: 4,
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text
        style={{
          color: primary ? c.bgPrimary : c.textPrimary,
          fontSize: fontSize.bodyMd,
          fontWeight: fontWeight.semibold as '600',
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const totals = report.totals;

  return (
    // NEW-02: ScreenLayout (scrollable, bottom edge) replaces the bare
    // ScrollView so the content clears the home indicator — same pattern as
    // measurements.tsx.
    <ScreenLayout scrollable edges={['bottom']} horizontalPadding={false} contentStyle={{ padding: spacing.s4, paddingBottom: spacing.s12 }}>
      {/* Actions */}
      <View style={{ flexDirection: 'row', marginBottom: spacing.s3 }}>
        {btn(t('screens2:diagnostics.refresh'), refresh)}
        {btn(t('screens2:diagnostics.shareReport'), share, true)}
        {btn(t('screens2:diagnostics.clear'), clear)}
      </View>

      {/* Summary */}
      {sectionTitle(t('screens2:diagnostics.summary'))}
      <View
        style={{
          backgroundColor: c.bgSecondary,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: c.borderDefault,
          padding: spacing.s3,
        }}
      >
        {row('up', t('screens2:diagnostics.sessionUptime'), t('screens2:diagnostics.secondsValue', { seconds: Math.round(report.uptimeMs / 1000) }), false)}
        {row('st', t('screens2:diagnostics.jsStalls'), String(totals.stalls), totals.stalls > 0)}
        {row('ws', t('screens2:diagnostics.worstStall'), t('screens2:diagnostics.msValue', { ms: totals.worstStallMs }), totals.worstStallMs > 1000)}
        {row('db', t('screens2:diagnostics.dbOps'), `${totals.slowDbOps} / ${totals.dbOps}`, totals.slowDbOps > 5)}
        {row('wd', t('screens2:diagnostics.worstDbOp'), t('screens2:diagnostics.msValue', { ms: totals.worstDbMs }), totals.worstDbMs > 500)}
        {row('nt', t('screens2:diagnostics.networkRequests'), String(totals.netRequests), false)}
      </View>

      {/* Stalls */}
      {sectionTitle(t('screens2:diagnostics.stallsSection', { count: report.stalls.length }))}
      {report.stalls.length === 0 ? (
        <Text style={{ color: c.textTertiary, fontSize: fontSize.bodySm }}>{t('screens2:diagnostics.noneRecorded')}</Text>
      ) : (
        report.stalls
          .slice(0, 25)
          .map((s, i) => row(`s${i}`, fmtClock(s.at), t('screens2:diagnostics.msValue', { ms: s.ms }), s.ms > 1000))
      )}

      {/* Slow DB */}
      {sectionTitle(t('screens2:diagnostics.slowDbSection', { count: report.slowDb.length }))}
      {report.slowDb.length === 0 ? (
        <Text style={{ color: c.textTertiary, fontSize: fontSize.bodySm }}>{t('screens2:diagnostics.noneRecorded')}</Text>
      ) : (
        report.slowDb
          .slice(0, 25)
          .map((d, i) => row(`d${i}`, `${fmtClock(d.at)}  ${d.sql}`, t('screens2:diagnostics.msValue', { ms: d.ms }), d.ms > 500))
      )}

      {/* Network */}
      {sectionTitle(t('screens2:diagnostics.networkSection', { count: report.net.length }))}
      {report.net.length === 0 ? (
        <Text style={{ color: c.textTertiary, fontSize: fontSize.bodySm }}>
          {t('screens2:diagnostics.noRequests')}
        </Text>
      ) : (
        report.net
          .slice(0, 40)
          .map((n, i) =>
            row(
              `n${i}`,
              `${fmtClock(n.at)}  ${n.method} ${n.url}`,
              t('screens2:diagnostics.netValue', { ms: n.ms, status: String(n.status) }),
              typeof n.status !== 'number' || n.status >= 400 || n.ms > 3000,
            ),
          )
      )}
    </ScreenLayout>
  );
}
