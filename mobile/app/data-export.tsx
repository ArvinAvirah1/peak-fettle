/**
 * data-export.tsx — Data ownership & export screen.
 *
 * Route: /data-export  (navigated from profile.tsx → "Export my data")
 *
 * Agent K polish (2026-06-11):
 *   - Staggered entrance: section cards fade-rise in sequence
 *   - Cloud status line shows skeleton pulse while cloudStatus is null
 *   - paddingTop bumped to 24 (s6) for consistent screen top spacing
 *   - Reduce Motion: stagger animations skipped (items appear instantly)
 *   - All button press targets already 44pt via paddingVertical s4
 *
 * Two buttons:
 *   Export JSON — GET /user/export → share sheet
 *   Export CSV  — GET /user/export.csv → share sheet
 *
 * No AI strings. No paid gate (spec §4: "Free tier included").
 * No raw 'bold' — fontWeight token. All colors via useTheme().
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../src/theme/ThemeContext';
import { ScreenLayout } from '../src/components/ui';
import { PFCard } from '../src/components/ui';
import { fontWeight } from '../src/theme/tokens';
import { apiClient } from '../src/api/client';
import { useAuth } from '../src/hooks/useAuth';
import { isLocalFirst } from '../src/data/backup/tierPolicy';
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
import { useReduceMotion } from '../src/hooks/useReduceMotion';
import { useTranslation } from 'react-i18next';
import i18n from '../src/i18n';

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
// Skeleton pulse for status line
// ---------------------------------------------------------------------------

function SkeletonStatusLine(): React.ReactElement {
  const { theme } = useTheme();
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={{
        width: '60%',
        height: 11,
        borderRadius: 6,
        backgroundColor: theme.colors.bgTertiary,
        opacity: pulse,
        marginBottom: 12,
      }}
      accessibilityLabel={i18n.t('screens:dataExport.loadingBackupStatus')}
    />
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function downloadAndShare(url: string, filename: string): Promise<void> {
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
    throw new Error(i18n.t('screens:dataExport.sharingUnavailable'));
  }
  await Sharing.shareAsync(fileUri, {
    mimeType: filename.endsWith('.csv') ? 'text/csv' : 'application/json',
    dialogTitle: i18n.t('screens:dataExport.saveOrShareDialogTitle'),
  });
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function DataExportScreen(): React.ReactElement {
  const { theme, spacing: sp, fontSize: fs, radius: r } = useTheme();
  const { colors } = theme;
  const { user } = useAuth();
  const localFirst = isLocalFirst(user);
  const reduceMotion = useReduceMotion();
  const { t } = useTranslation();
  const [jsonLoading, setJsonLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [cloudBackupLoading, setCloudBackupLoading] = useState(false);
  const [cloudRestoreLoading, setCloudRestoreLoading] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<BackupStatus | null>(null);
  const [cloudStatusLoading, setCloudStatusLoading] = useState(true);
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('');
  const [showRecoveryInput, setShowRecoveryInput] = useState(false);
  const router = useRouter();

  // 5 stagger slots: ownership card, export buttons, cloud card, cloud buttons, device card
  const staggerAnims = useStaggerFade(5, !reduceMotion);

  const today = new Date().toISOString().slice(0, 10);

  // Load cloud backup status on mount
  React.useEffect(() => {
    setCloudStatusLoading(true);
    getStatus()
      .then(setCloudStatus)
      .catch(() => {})
      .finally(() => setCloudStatusLoading(false));
  }, []);

  // ── Cloud backup handlers ─────────────────────────────────────────────────

  const handleCloudBackup = async () => {
    setCloudBackupLoading(true);
    try {
      const result = await backupNow();
      if (!result.ok) {
        Alert.alert(t('screens:dataExport.backupFailedTitle'), result.error);
        return;
      }
      if ('needsRecoveryAck' in result && result.needsRecoveryAck) {
        router.push('/recovery-code');
        return;
      }
      getStatus().then(setCloudStatus).catch(() => {});
      Alert.alert(t('screens:dataExport.backupCompleteTitle'), t('screens:dataExport.backupCompleteMessage'));
    } catch (err) {
      Alert.alert(t('screens:dataExport.backupFailedTitle'), err instanceof Error ? err.message : String(err));
    } finally {
      setCloudBackupLoading(false);
    }
  };

  const handleCloudRestore = async () => {
    if (showRecoveryInput) {
      if (!recoveryCodeInput.trim()) {
        Alert.alert(t('screens:dataExport.recoveryCodeRequiredTitle'), t('screens:dataExport.recoveryCodeRequiredMessage'));
        return;
      }
      Alert.alert(
        t('screens:dataExport.restoreFromCloudTitle'),
        t('screens:dataExport.restoreFromCloudMessage'),
        [
          { text: t('common:cancel'), style: 'cancel' },
          {
            text: t('screens:dataExport.restore'),
            style: 'destructive',
            onPress: async () => {
              setCloudRestoreLoading(true);
              try {
                const result = await restoreFromCloud({ recoveryCode: recoveryCodeInput.trim() });
                if (!result.ok) {
                  Alert.alert(t('screens:dataExport.restoreFailedTitle'), result.error);
                } else {
                  setShowRecoveryInput(false);
                  setRecoveryCodeInput('');
                  getStatus().then(setCloudStatus).catch(() => {});
                  Alert.alert(t('screens:dataExport.restoreCompleteTitle'), t('screens:dataExport.restoreCompleteMessage', { count: result.restored }));
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

    setCloudRestoreLoading(true);
    try {
      const result = await restoreFromCloud({});
      if (!result.ok) {
        if (result.error.includes('recovery code')) {
          setCloudRestoreLoading(false);
          setShowRecoveryInput(true);
          return;
        }
        Alert.alert(t('screens:dataExport.restoreFailedTitle'), result.error);
      } else {
        getStatus().then(setCloudStatus).catch(() => {});
        Alert.alert(t('screens:dataExport.restoreCompleteTitle'), t('screens:dataExport.restoreCompleteMessage', { count: result.restored }));
      }
    } finally {
      setCloudRestoreLoading(false);
    }
  };

  const handleExportJson = async () => {
    if (localFirst) {
      Alert.alert(
        t('screens:dataExport.useExportBackupTitle'),
        t('screens:dataExport.useExportBackupMessage'),
      );
      return;
    }
    setJsonLoading(true);
    try {
      await downloadAndShare('/user/export', `peak-fettle-export-${today}.json`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('MODULE_NOT_FOUND') || msg.includes("Cannot find module")) {
        Alert.alert(
          t('screens:dataExport.fileSystemRequiredTitle'),
          t('screens:dataExport.fileSystemSharingRunMessage'),
        );
      } else {
        Alert.alert(t('screens:dataExport.exportFailedTitle'), msg);
      }
    } finally {
      setJsonLoading(false);
    }
  };

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
      if (!canShare) throw new Error(t('screens:dataExport.sharingUnavailable'));
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: t('screens:dataExport.savePeakFettleBackupTitle'),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('MODULE_NOT_FOUND') || msg.includes('Cannot find module')) {
        Alert.alert(
          t('screens:dataExport.fileSystemRequiredTitle'),
          t('screens:dataExport.fileSystemSharingRunMessage'),
        );
      } else {
        Alert.alert(t('screens:dataExport.backupFailedTitle'), msg);
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
        Alert.alert(t('screens:dataExport.restoreFailedTitle'), t('screens:dataExport.notValidBackupMessage'));
        return;
      }
      const result = parseImport(parsedJson);
      if (!result.ok) {
        Alert.alert(t('screens:dataExport.restoreFailedTitle'), result.error);
        return;
      }
      const rowCount = Object.values(result.tables).reduce((n, rows) => n + rows.length, 0);
      Alert.alert(
        t('screens:dataExport.restoreBackupTitle'),
        t('screens:dataExport.restoreBackupMessage', { count: rowCount }),
        [
          { text: t('common:cancel'), style: 'cancel' },
          {
            text: t('screens:dataExport.restore'),
            style: 'destructive',
            onPress: async () => {
              try {
                await localDb.init();
                await restoreBackupToDb(localDb, result.tables);
                Alert.alert(t('screens:dataExport.restoreCompleteTitle'), t('screens:dataExport.restoreCompleteDeviceMessage'));
              } catch (err) {
                Alert.alert(t('screens:dataExport.restoreFailedTitle'), err instanceof Error ? err.message : String(err));
              }
            },
          },
        ],
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('MODULE_NOT_FOUND') || msg.includes('Cannot find module')) {
        Alert.alert(
          t('screens:dataExport.missingModuleTitle'),
          t('screens:dataExport.missingModuleMessage'),
        );
      } else {
        Alert.alert(t('screens:dataExport.restoreFailedTitle'), msg);
      }
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleExportCsv = async () => {
    if (localFirst) {
      Alert.alert(
        t('screens:dataExport.useExportBackupTitle'),
        t('screens:dataExport.useExportBackupCsvMessage'),
      );
      return;
    }
    setCsvLoading(true);
    try {
      await downloadAndShare('/user/export.csv', `peak-fettle-sets-${today}.csv`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('MODULE_NOT_FOUND') || msg.includes("Cannot find module")) {
        Alert.alert(
          t('screens:dataExport.fileSystemRequiredTitle'),
          t('screens:dataExport.fileSystemSharingRunMessage'),
        );
      } else {
        Alert.alert(t('screens:dataExport.exportFailedTitle'), msg);
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
          {t('screens:dataExport.title')}
        </Text>

        {/* ── Ownership card ── */}
        <Animated.View style={reduceMotion ? undefined : staggerStyle(staggerAnims[0])}>
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
              {t('screens:dataExport.ownershipTitle')}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm, lineHeight: 20 }}>
              {t('screens:dataExport.ownershipBody')}
            </Text>
            <Text style={{ color: colors.textTertiary, fontSize: fs.caption, marginTop: sp.s2 }}>
              {t('screens:dataExport.ownershipNote')}
            </Text>
          </View>
        </Animated.View>

        {/* ── Export buttons ── */}
        <Animated.View style={reduceMotion ? undefined : staggerStyle(staggerAnims[1])}>
          {/* JSON export */}
          <TouchableOpacity
            onPress={handleExportJson}
            disabled={jsonLoading || csvLoading}
            accessibilityRole="button"
            accessibilityLabel={t('screens:dataExport.exportJsonA11y')}
            style={[
              styles.exportBtn,
              {
                backgroundColor: colors.accentDefault,
                borderRadius: r.lg,
                padding: sp.s4,
                marginBottom: sp.s3,
                opacity: jsonLoading ? 0.7 : 1,
                minHeight: 60,
                justifyContent: 'center',
              },
            ]}
          >
            <View style={styles.btnContent}>
              <View>
                <Text style={{ color: theme.components.buttonPrimaryText, fontSize: fs.bodyMd, fontWeight: fontWeight.semibold }}>
                  {jsonLoading ? t('screens:dataExport.preparing') : t('screens:dataExport.exportJson')}
                </Text>
                <Text style={{ color: theme.components.buttonPrimaryText + 'CC', fontSize: fs.caption, marginTop: 2 }}>
                  {t('screens:dataExport.exportJsonSub')}
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* CSV export */}
          <TouchableOpacity
            onPress={handleExportCsv}
            disabled={jsonLoading || csvLoading}
            accessibilityRole="button"
            accessibilityLabel={t('screens:dataExport.exportCsvA11y')}
            style={[
              styles.exportBtn,
              {
                backgroundColor: colors.bgSecondary,
                borderRadius: r.lg,
                borderWidth: 1,
                borderColor: colors.accentDefault,
                padding: sp.s4,
                opacity: csvLoading ? 0.7 : 1,
                minHeight: 60,
                justifyContent: 'center',
              },
            ]}
          >
            <View style={styles.btnContent}>
              <View>
                <Text style={{ color: colors.accentDefault, fontSize: fs.bodyMd, fontWeight: fontWeight.semibold }}>
                  {csvLoading ? t('screens:dataExport.preparing') : t('screens:dataExport.exportCsv')}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: fs.caption, marginTop: 2 }}>
                  {t('screens:dataExport.exportCsvSub')}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Cloud backup card ── */}
        <Animated.View style={reduceMotion ? undefined : staggerStyle(staggerAnims[2])}>
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
              {t('screens:dataExport.cloudBackupTitle')}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm, lineHeight: 20, marginBottom: sp.s2 }}>
              {t('screens:dataExport.cloudBackupBody')}
            </Text>
            {/* Status line — skeleton while loading */}
            {cloudStatusLoading ? (
              <SkeletonStatusLine />
            ) : cloudStatus ? (
              <Text
                style={{
                  color: cloudStatus.stale ? colors.statusWarning : colors.textTertiary,
                  fontSize: fs.caption,
                  marginBottom: sp.s1,
                }}
              >
                {cloudStatus.lastLocalAt
                  ? (cloudStatus.stale
                    ? t('screens:dataExport.lastBackedUpOverdue', { date: new Date(cloudStatus.lastLocalAt).toLocaleDateString() })
                    : t('screens:dataExport.lastBackedUp', { date: new Date(cloudStatus.lastLocalAt).toLocaleDateString() }))
                  : t('screens:dataExport.neverBackedUp')}
              </Text>
            ) : null}
          </View>
        </Animated.View>

        {/* ── Cloud action buttons ── */}
        <Animated.View style={reduceMotion ? undefined : staggerStyle(staggerAnims[3])}>
          {/* Back up now */}
          <TouchableOpacity
            onPress={handleCloudBackup}
            disabled={cloudBackupLoading || cloudRestoreLoading}
            accessibilityRole="button"
            accessibilityLabel={t('screens:dataExport.backUpNowA11y')}
            style={[
              styles.exportBtn,
              {
                backgroundColor: colors.accentDefault,
                borderRadius: r.lg,
                padding: sp.s4,
                marginBottom: sp.s3,
                opacity: cloudBackupLoading ? 0.7 : 1,
                minHeight: 60,
                justifyContent: 'center',
              },
            ]}
          >
            <View style={styles.btnContent}>
              <View>
                <Text style={{ color: theme.components.buttonPrimaryText, fontSize: fs.bodyMd, fontWeight: fontWeight.semibold }}>
                  {cloudBackupLoading ? t('screens:dataExport.backingUp') : t('screens:dataExport.backUpNow')}
                </Text>
                <Text style={{ color: theme.components.buttonPrimaryText + 'CC', fontSize: fs.caption, marginTop: 2 }}>
                  {t('screens:dataExport.backUpNowSub')}
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
                  minHeight: 44,
                },
                accessibilityLabel: t('screens:dataExport.enterRecoveryCode'),
              })}
              <Text style={{ color: colors.textTertiary, fontSize: fs.caption, lineHeight: 16 }}>
                {t('screens:dataExport.recoveryCodeHint')}
              </Text>
            </View>
          )}

          <TouchableOpacity
            onPress={handleCloudRestore}
            disabled={cloudBackupLoading || cloudRestoreLoading}
            accessibilityRole="button"
            accessibilityLabel={t('screens:dataExport.restoreFromCloudA11y')}
            style={[
              styles.exportBtn,
              {
                backgroundColor: colors.bgSecondary,
                borderRadius: r.lg,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colors.statusError,
                padding: sp.s4,
                marginBottom: sp.s3,
                opacity: cloudRestoreLoading ? 0.7 : 1,
                minHeight: 60,
                justifyContent: 'center',
              },
            ]}
          >
            <View style={styles.btnContent}>
              <View>
                <Text style={{ color: colors.statusError, fontSize: fs.bodyMd, fontWeight: fontWeight.semibold }}>
                  {cloudRestoreLoading ? t('screens:dataExport.restoring') : t('screens:dataExport.restoreFromCloud')}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: fs.caption, marginTop: 2 }}>
                  {t('screens:dataExport.restoreFromCloudSub')}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Device backup card ── */}
        <Animated.View style={reduceMotion ? undefined : staggerStyle(staggerAnims[4])}>
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
              {t('screens:dataExport.movingToNewPhone')}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm, lineHeight: 20 }}>
              {t('screens:dataExport.movingToNewPhoneSteps')}
            </Text>
            <Text style={{ color: colors.textTertiary, fontSize: fs.caption, marginTop: sp.s2, lineHeight: 18 }}>
              {t('screens:dataExport.proMembersNote')}
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleExportBackup}
            disabled={backupLoading || restoreLoading}
            accessibilityRole="button"
            accessibilityLabel={t('screens:dataExport.saveDeviceBackupA11y')}
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
                minHeight: 60,
                justifyContent: 'center',
              },
            ]}
          >
            <View style={styles.btnContent}>
              <View>
                <Text style={{ color: colors.accentDefault, fontSize: fs.bodyMd, fontWeight: fontWeight.semibold }}>
                  {backupLoading ? t('screens:dataExport.preparing') : t('screens:dataExport.saveBackupFile')}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: fs.caption, marginTop: 2 }}>
                  {t('screens:dataExport.saveBackupFileSub')}
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleImportBackup}
            disabled={backupLoading || restoreLoading}
            accessibilityRole="button"
            accessibilityLabel={t('screens:dataExport.restoreFromBackupFileA11y')}
            style={[
              styles.exportBtn,
              {
                backgroundColor: colors.bgSecondary,
                borderRadius: r.lg,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colors.borderDefault,
                padding: sp.s4,
                opacity: restoreLoading ? 0.7 : 1,
                minHeight: 60,
                justifyContent: 'center',
              },
            ]}
          >
            <View style={styles.btnContent}>
              <View>
                <Text style={{ color: colors.textPrimary, fontSize: fs.bodyMd, fontWeight: fontWeight.semibold }}>
                  {restoreLoading ? t('screens:dataExport.opening') : t('screens:dataExport.restoreFromBackupFile')}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: fs.caption, marginTop: 2 }}>
                  {t('screens:dataExport.restoreFromBackupFileSub')}
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Note about dependencies */}
          <Text style={{ color: colors.textTertiary, fontSize: fs.micro, textAlign: 'center', marginTop: sp.s5, lineHeight: 16 }}>
            {t('screens:dataExport.requiresModulesNote')}
          </Text>
        </Animated.View>
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
  title: {},
  ownershipCard: {},
  exportBtn: {},
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
