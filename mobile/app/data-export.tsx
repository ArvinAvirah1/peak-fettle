/**
 * data-export.tsx — Data ownership & export screen.
 *
 * Route: /data-export  (navigated from profile.tsx → "Export my data")
 *
 * Two buttons:
 *   • Export JSON — GET /user/export → share sheet
 *   • Export CSV  — GET /user/export.csv → share sheet
 *
 * Share sheet: expo-sharing (dynamically required like csv-import.tsx does
 * with expo-document-picker — graceful degradation if absent).
 * File written to expo FileSystem cache dir then shared.
 *
 * No AI strings. No paid gate (spec §4: "Free tier included").
 * No raw 'bold' — fontWeight token. All colors via useTheme().
 */

import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../src/theme/ThemeContext';
import { ScreenLayout } from '../src/components/ui';
import { PFCard } from '../src/components/ui';
import { fontSize, fontWeight, spacing, radius } from '../src/theme/tokens';
import { apiClient } from '../src/api/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function downloadAndShare(url: string, filename: string): Promise<void> {
  // Dynamic require — same pattern as csv-import.tsx for expo-document-picker.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FileSystem = require('expo-file-system');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Sharing = require('expo-sharing');

  const response = await apiClient.get<string>(url, { responseType: 'text' });
  const content = typeof response.data === 'string'
    ? response.data
    : JSON.stringify(response.data, null, 2);

  const fileUri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(fileUri, content, { encoding: FileSystem.EncodingType.UTF8 });

  const canShare: boolean = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(fileUri, {
    mimeType: filename.endsWith('.csv') ? 'text/csv' : 'application/json',
    dialogTitle: 'Save or share your data',
  });
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function DataExportScreen(): React.ReactElement {
  const { theme, spacing: sp, fontSize: fs, radius: r } = useTheme();
  const { colors } = theme;
  const [jsonLoading, setJsonLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const handleExportJson = async () => {
    setJsonLoading(true);
    try {
      await downloadAndShare('/user/export', `peak-fettle-export-${today}.json`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('MODULE_NOT_FOUND') || msg.includes("Cannot find module")) {
        Alert.alert(
          'expo-file-system required',
          'Run: npx expo install expo-file-system expo-sharing\nthen rebuild the app.',
        );
      } else {
        Alert.alert('Export failed', msg);
      }
    } finally {
      setJsonLoading(false);
    }
  };

  const handleExportCsv = async () => {
    setCsvLoading(true);
    try {
      await downloadAndShare('/user/export.csv', `peak-fettle-sets-${today}.csv`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('MODULE_NOT_FOUND') || msg.includes("Cannot find module")) {
        Alert.alert(
          'expo-file-system required',
          'Run: npx expo install expo-file-system expo-sharing\nthen rebuild the app.',
        );
      } else {
        Alert.alert('Export failed', msg);
      }
    } finally {
      setCsvLoading(false);
    }
  };

  return (
    <ScreenLayout scrollable={false}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: sp.s5, paddingBottom: sp.s8 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <Text
          style={[styles.title, { color: colors.textPrimary, fontSize: fs.heading2, fontWeight: fontWeight.bold, marginBottom: sp.s2 }]}
          accessibilityRole="header"
        >
          Export my data
        </Text>

        {/* Ownership copy */}
        <View
          style={[
            styles.ownershipCard,
            {
              backgroundColor: colors.bgSecondary,
              borderRadius: r.lg,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.borderDefault,
              padding: sp.s4,
              marginBottom: sp.s6,
            },
          ]}
        >
          <Text style={{ color: colors.textPrimary, fontSize: fs.bodyMd, fontWeight: fontWeight.semibold, marginBottom: sp.s2 }}>
            Your data, your property
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm, lineHeight: 20 }}>
            Everything you log in Peak Fettle belongs to you. Export a full copy at any time — workouts, sets, health metrics, plans, and personal bests — in an open format you can use anywhere.
          </Text>
          <Text style={{ color: colors.textTertiary, fontSize: fs.caption, marginTop: sp.s2 }}>
            Exports are available on all plans. No data is shared with third parties without your explicit consent.
          </Text>
        </View>

        {/* JSON export */}
        <TouchableOpacity
          onPress={handleExportJson}
          disabled={jsonLoading || csvLoading}
          accessibilityRole="button"
          accessibilityLabel="Export full data as JSON"
          style={[
            styles.exportBtn,
            {
              backgroundColor: colors.accentDefault,
              borderRadius: r.lg,
              padding: sp.s4,
              marginBottom: sp.s3,
              opacity: jsonLoading ? 0.7 : 1,
            },
          ]}
        >
          <View style={styles.btnContent}>
            <View>
              <Text style={{ color: theme.components.buttonPrimaryText, fontSize: fs.bodyMd, fontWeight: fontWeight.semibold }}>
                {jsonLoading ? 'Preparing…' : 'Export JSON'}
              </Text>
              <Text style={{ color: theme.components.buttonPrimaryText + 'CC', fontSize: fs.caption, marginTop: 2 }}>
                Full profile, all workouts, plans, health metrics
              </Text>
            </View>
            <Text style={{ color: theme.components.buttonPrimaryText, fontSize: 22 }}>{ }</Text>
          </View>
        </TouchableOpacity>

        {/* CSV export */}
        <TouchableOpacity
          onPress={handleExportCsv}
          disabled={jsonLoading || csvLoading}
          accessibilityRole="button"
          accessibilityLabel="Export sets as CSV"
          style={[
            styles.exportBtn,
            {
              backgroundColor: colors.bgSecondary,
              borderRadius: r.lg,
              borderWidth: 1,
              borderColor: colors.accentDefault,
              padding: sp.s4,
              opacity: csvLoading ? 0.7 : 1,
            },
          ]}
        >
          <View style={styles.btnContent}>
            <View>
              <Text style={{ color: colors.accentDefault, fontSize: fs.bodyMd, fontWeight: fontWeight.semibold }}>
                {csvLoading ? 'Preparing…' : 'Export CSV'}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: fs.caption, marginTop: 2 }}>
                Flat set log: date, exercise, weight, reps, RIR
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Note about dependencies */}
        <Text style={{ color: colors.textTertiary, fontSize: fs.micro, textAlign: 'center', marginTop: sp.s5, lineHeight: 16 }}>
          Requires expo-file-system and expo-sharing (included in EAS builds).
        </Text>
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
  title: {},
  ownershipCard: {},
  exportBtn: {},
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
