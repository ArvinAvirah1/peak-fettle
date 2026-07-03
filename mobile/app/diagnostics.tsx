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
import { ScrollView, Share, Text, TouchableOpacity, View } from 'react-native';
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
  const c = theme.colors;
  const [report, setReport] = useState<PerfReport>(() => getPerfReport());

  const refresh = useCallback(() => setReport(getPerfReport()), []);

  const share = useCallback(async () => {
    try {
      await Share.share({
        title: 'Peak Fettle diagnostics',
        message: JSON.stringify(getPerfReport(), null, 2),
      });
    } catch {
      // user cancelled — fine
    }
  }, []);

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

  const t = report.totals;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bgPrimary }}
      contentContainerStyle={{ padding: spacing.s4, paddingBottom: 48 }}
    >
      {/* Actions */}
      <View style={{ flexDirection: 'row', marginBottom: spacing.s3 }}>
        {btn('Refresh', refresh)}
        {btn('Share report', share, true)}
        {btn('Clear', clear)}
      </View>

      {/* Summary */}
      {sectionTitle('SUMMARY')}
      <View
        style={{
          backgroundColor: c.bgSecondary,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: c.borderDefault,
          padding: spacing.s3,
        }}
      >
        {row('up', 'Session uptime', `${Math.round(report.uptimeMs / 1000)} s`, false)}
        {row('st', 'JS stalls (>250 ms)', String(t.stalls), t.stalls > 0)}
        {row('ws', 'Worst stall', `${t.worstStallMs} ms`, t.worstStallMs > 1000)}
        {row('db', 'DB ops (slow / total)', `${t.slowDbOps} / ${t.dbOps}`, t.slowDbOps > 5)}
        {row('wd', 'Worst DB op', `${t.worstDbMs} ms`, t.worstDbMs > 500)}
        {row('nt', 'Network requests', String(t.netRequests), false)}
      </View>

      {/* Stalls */}
      {sectionTitle(`JS STALLS — TAPS FEEL DEAD WHILE THESE HAPPEN (${report.stalls.length})`)}
      {report.stalls.length === 0 ? (
        <Text style={{ color: c.textTertiary, fontSize: fontSize.bodySm }}>None recorded.</Text>
      ) : (
        report.stalls
          .slice(0, 25)
          .map((s, i) => row(`s${i}`, fmtClock(s.at), `${s.ms} ms`, s.ms > 1000))
      )}

      {/* Slow DB */}
      {sectionTitle(`SLOW DB OPS ≥30 ms (${report.slowDb.length})`)}
      {report.slowDb.length === 0 ? (
        <Text style={{ color: c.textTertiary, fontSize: fontSize.bodySm }}>None recorded.</Text>
      ) : (
        report.slowDb
          .slice(0, 25)
          .map((d, i) => row(`d${i}`, `${fmtClock(d.at)}  ${d.sql}`, `${d.ms} ms`, d.ms > 500))
      )}

      {/* Network */}
      {sectionTitle(`NETWORK — EVERY REQUEST, NEWEST FIRST (${report.net.length})`)}
      {report.net.length === 0 ? (
        <Text style={{ color: c.textTertiary, fontSize: fontSize.bodySm }}>
          No requests — as expected for a free-tier session.
        </Text>
      ) : (
        report.net
          .slice(0, 40)
          .map((n, i) =>
            row(
              `n${i}`,
              `${fmtClock(n.at)}  ${n.method} ${n.url}`,
              `${n.ms} ms · ${n.status}`,
              typeof n.status !== 'number' || n.status >= 400 || n.ms > 3000,
            ),
          )
      )}
    </ScrollView>
  );
}
