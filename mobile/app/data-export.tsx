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
import { localDb } from '../src/db/localDb';
import {
  buildBackupFromDb,
  restoreBackupToDb,
  parseImport,
  canonicalize,
} from '../src/data/backup/exportEngine';
import {
  backupNow,
  getStatus,
  restoreFromCloud,
  BackupStatus,
} from '../src/data/backup/backupManager';
import { useRouter } from 'expo-router';

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
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [cloudBackupLoading, setCloudBackupLoading] = useState(false);
  const [cloudRestoreLoading, setCloudRestoreLoading] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<BackupStatus | null>(null);
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('');
  const [showRecoveryInput, setShowRecoveryInput] = useState(false);
  const router = useRouter();

  const today = new Date().toISOString().slice(0, 10);

  // Load cloud backup status on mount
  React.useEffect(() => {
    getStatus().then(setCloudStatus).catch(() => {});
  }, []);

  // ── Cloud backup handlers ─────────────────────────────────────────────────

  const handleCloudBackup = async () => {
    setCloudBackupLoading(true);
    try {
      const result = await backupNow();
      if (!result.ok) {
        Alert.alert('Backup failed', result.error);
        return;
      }
      if ('needsRecoveryAck' in result && result.needsRecoveryAck) {
        // Navigate to recovery-code screen — pendingRecoveryCode is already stashed.
        router.push('/recovery-code');
        return;
      }
      // Refresh status after successful backup.
      getStatus().then(setCloudStatus).catch(() => {});
      Alert.alert('Backup complete', 'Your data has been encrypted and backed up.');
    } catch (err) {
      Alert.alert('Backup failed', err instanceof Error ? err.message : String(err));
    } finally {
      setCloudBackupLoading(false);
    }
  };

  const handleCloudRestore = async () => {
    // Check if we already have a keychain key; if not, show recovery code input.
    if (showRecoveryInput) {
      if (!recoveryCodeInput.trim()) {
        Alert.alert('Recovery code required', 'Enter your recovery code to restore from the cloud backup.');
        return;
      }
      Alert.alert(
        'Restore from cloud?',
        'This will replace all training data on this device with your cloud backup. This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Restore',
            style: 'destructive',
            onPress: async () => {
              setCloudRestoreLoading(true);
              try {
                const result = await restoreFromCloud({ recoveryCode: recoveryCodeInput.trim() });
                if (!result.ok) {
                  Alert.alert('Restore failed', result.error);
                } else {
                  setShowRecoveryInput(false);
                  setRecoveryCodeInput('');
                  getStatus().then(setCloudStatus).catch(() => {});
                  Alert.alert('Restore complete', `Your data has been restored (${result.restored} records).`);
                }
              } finally {
                setCloudRestoreLoading(false);
              }
            },
          },
        ],
      );
      return;
    }

    // Try keychain path first; show recovery input if no key exists.
    setCloudRestoreLoading(true);
    try {
      const result = await restoreFromCloud({});
      if (!result.ok) {
        if (result.error.includes('recovery code')) {
          // No keychain key — ask for recovery code.
          setCloudRestoreLoading(false);
          setShowRecoveryInput(true);
          return;
        }
        Alert.alert('Restore failed', result.error);
      } else {
        getStatus().then(setCloudStatus).catch(() => {});
        Alert.alert('Restore complete', `Your data has been restored (${result.restored} records).`);
      }
    } finally {
      setCloudRestoreLoading(false);
    }
  };

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

  // ── Device backup file (TICKET-094 manual transfer path) ─────────────────
  // Serializes the ON-DEVICE tables via the deterministic export engine.
  // This is the unencrypted manual slice; the automatic E2E-encrypted blob
  // backup wraps these same functions in the supervised TICKET-094 build.

  const handleExportBackup = async () => {
    setBackupLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const FileSystem = require('expo-file-system');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sharing = require('expo-sharing');
      await localDb.init();
      const doc = await buildBackupFromDb(localDb);
      const json = canonicalize(doc);
      const fileUri = `${FileSystem.cacheDirectory}peak-fettle-backup-${today}.json`;
      await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });
      const canShare: boolean = await Sharing.isAvailableAsync();
      if (!canShare) throw new Error('Sharing is not available on this device.');
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: 'Save your Peak Fettle backup',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('MODULE_NOT_FOUND') || msg.includes('Cannot find module')) {
        Alert.alert(
          'expo-file-system required',
          'Run: npx expo install expo-file-system expo-sharing\nthen rebuild the app.',
        );
      } else {
        Alert.alert('Backup failed', msg);
      }
    } finally {
      setBackupLoading(false);
    }
  };

  const handleImportBackup = async () => {
    setRestoreLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const DocumentPicker = require('expo-document-picker');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const FileSystem = require('expo-file-system');
      const picked = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.[0]?.uri) return;
      const raw = await FileSystem.readAsStringAsync(picked.assets[0].uri);
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw);
      } catch {
        Alert.alert('Restore failed', 'That file is not a valid Peak Fettle backup.');
        return;
      }
      const result = parseImport(parsedJson);
      if (!result.ok) {
        Alert.alert('Restore failed', result.error);
        return;
      }
      const rowCount = Object.values(result.tables).reduce((n, rows) => n + rows.length, 0);
      Alert.alert(
        'Restore backup?',
        `This replaces the training data on this device with the backup (${rowCount} records). This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Restore',
            style: 'destructive',
            onPress: async () => {
              try {
                await localDb.init();
                await restoreBackupToDb(localDb, result.tables);
                Alert.alert('Restore complete', 'Your training data has been restored on this device.');
              } catch (err) {
                Alert.alert('Restore failed', err instanceof Error ? err.message : String(err));
              }
            },
          },
        ],
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('MODULE_NOT_FOUND') || msg.includes('Cannot find module')) {
        Alert.alert(
          'Missing module',
          'Run: npx expo install expo-file-system expo-document-picker\nthen rebuild the app.',
        );
      } else {
        Alert.alert('Restore failed', msg);
      }
    } finally {
      setRestoreLoading(false);
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

        {/* ── Cloud backup card (TICKET-094 E2E encrypted) ─────────────────── */}
        <View
          style={[
            styles.ownershipCard,
            {
              backgroundColor: colors.bgSecondary,
              borderRadius: r.lg,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.borderDefault,
              padding: sp.s4,
              marginTop: sp.s6,
              marginBottom: sp.s4,
            },
          ]}
        >
          <Text style={{ color: colors.textPrimary, fontSize: fs.bodyMd, fontWeight: fontWeight.semibold, marginBottom: sp.s2 }}>
            Cloud backup
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm, lineHeight: 20, marginBottom: sp.s2 }}>
            Encrypted on your phone before upload — we can't read it.
          </Text>
          {/* Status line */}
          {cloudStatus && (
            <Text
              style={{
                color: cloudStatus.stale ? colors.statusWarning : colors.textTertiary,
                fontSize: fs.caption,
                marginBottom: sp.s3,
              }}
            >
              {cloudStatus.lastLocalAt
                ? (cloudStatus.stale
                  ? 'Last backed up: ' + new Date(cloudStatus.lastLocalAt).toLocaleDateString() + ' — backup is overdue'
                  : 'Last backed up: ' + new Date(cloudStatus.lastLocalAt).toLocaleDateString())
                : 'Never backed up'}
            </Text>
          )}
        </View>

        {/* Back up now */}
        <TouchableOpacity
          onPress={handleCloudBackup}
          disabled={cloudBackupLoading || cloudRestoreLoading}
          accessibilityRole="button"
          accessibilityLabel="Back up now to cloud"
          style={[
            styles.exportBtn,
            {
              backgroundColor: colors.accentDefault,
              borderRadius: r.lg,
              padding: sp.s4,
              marginBottom: sp.s3,
              opacity: cloudBackupLoading ? 0.7 : 1,
            },
          ]}
        >
          <View style={styles.btnContent}>
            <View>
              <Text style={{ color: theme.components.buttonPrimaryText, fontSize: fs.bodyMd, fontWeight: fontWeight.semibold }}>
                {cloudBackupLoading ? 'Backing up…' : 'Back up now'}
              </Text>
              <Text style={{ color: theme.components.buttonPrimaryText + 'CC', fontSize: fs.caption, marginTop: 2 }}>
                Encrypted backup sent to your account
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Restore from cloud */}
        {showRecoveryInput && (
          <View style={{ marginBottom: sp.s3 }}>
            {/* eslint-disable-next-line @typescript-eslint/no-require-imports */}
            {React.createElement(require('react-native').TextInput, {
              value: recoveryCodeInput,
              onChangeText: setRecoveryCodeInput,
              placeholder: 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX',
              placeholderTextColor: colors.textTertiary,
              autoCapitalize: 'characters' as const,
              autoCorrect: false,
              style: {
                fontFamily: 'Courier New',
                fontSize: fs.bodyMd,
                color: colors.textPrimary,
                backgroundColor: colors.bgTertiary ?? colors.bgSecondary,
                borderRadius: r.md,
                borderWidth: 1,
                borderColor: colors.borderDefault,
                padding: sp.s3,
                marginBottom: sp.s2,
              },
              accessibilityLabel: 'Enter recovery code',
            })}
            <Text style={{ color: colors.textTertiary, fontSize: fs.caption, lineHeight: 16 }}>
              Enter the recovery code you saved when you first backed up.
            </Text>
          </View>
        )}
        <TouchableOpacity
          onPress={handleCloudRestore}
          disabled={cloudBackupLoading || cloudRestoreLoading}
          accessibilityRole="button"
          accessibilityLabel="Restore from cloud backup"
          style={[
            styles.exportBtn,
            {
              backgroundColor: colors.bgSecondary,
              borderRadius: r.lg,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.statusDanger,
              padding: sp.s4,
              marginBottom: sp.s3,
              opacity: cloudRestoreLoading ? 0.7 : 1,
            },
          ]}
        >
          <View style={styles.btnContent}>
            <View>
              <Text style={{ color: colors.statusDanger, fontSize: fs.bodyMd, fontWeight: fontWeight.semibold }}>
                {cloudRestoreLoading ? 'Restoring…' : 'Restore from cloud'}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: fs.caption, marginTop: 2 }}>
                Replaces this device's data with your cloud backup
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Device backup + transfer (TICKET-094 manual path) */}
        <View
          style={[
            styles.ownershipCard,
            {
              backgroundColor: colors.bgSecondary,
              borderRadius: r.lg,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.borderDefault,
              padding: sp.s4,
              marginTop: sp.s6,
              marginBottom: sp.s4,
            },
          ]}
        >
          <Text style={{ color: colors.textPrimary, fontSize: fs.bodyMd, fontWeight: fontWeight.semibold, marginBottom: sp.s2 }}>
            Moving to a new phone?
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm, lineHeight: 20 }}>
            {'1. On this phone: tap "Save backup file" below and store it somewhere you can reach from the new phone (Files, Drive, email to yourself).\n2. On the new phone: install Peak Fettle and sign in to the same account.\n3. Open Profile → Export my data → "Restore from backup file" and pick the file.'}
          </Text>
          <Text style={{ color: colors.textTertiary, fontSize: fs.caption, marginTop: sp.s2, lineHeight: 18 }}>
            Pro members don’t need this — training data syncs to your account automatically. Automatic encrypted backups for all plans are in the works.
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleExportBackup}
          disabled={backupLoading || restoreLoading}
          accessibilityRole="button"
          accessibilityLabel="Save device backup file"
          style={[
            styles.exportBtn,
            {
              backgroundColor: colors.bgSecondary,
              borderRadius: r.lg,
              borderWidth: 1,
              borderColor: colors.accentDefault,
              padding: sp.s4,
              marginBottom: sp.s3,
              opacity: backupLoading ? 0.7 : 1,
            },
          ]}
        >
          <View style={styles.btnContent}>
            <View>
              <Text style={{ color: colors.accentDefault, fontSize: fs.bodyMd, fontWeight: fontWeight.semibold }}>
                {backupLoading ? 'Preparing…' : 'Save backup file'}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: fs.caption, marginTop: 2 }}>
                Everything stored on this device, one file
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleImportBackup}
          disabled={backupLoading || restoreLoading}
          accessibilityRole="button"
          accessibilityLabel="Restore from backup file"
          style={[
            styles.exportBtn,
            {
              backgroundColor: colors.bgSecondary,
              borderRadius: r.lg,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.borderDefault,
              padding: sp.s4,
              opacity: restoreLoading ? 0.7 : 1,
            },
          ]}
        >
          <View style={styles.btnContent}>
            <View>
              <Text style={{ color: colors.textPrimary, fontSize: fs.bodyMd, fontWeight: fontWeight.semibold }}>
                {restoreLoading ? 'Opening…' : 'Restore from backup file'}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: fs.caption, marginTop: 2 }}>
                Replaces this device’s data with a saved backup
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
