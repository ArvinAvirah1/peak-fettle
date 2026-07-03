/**
 * "How we handle your data" (TICKET-100 #3) — plain-English, factual,
 * no absolute promises (CONTENT_SAFETY.md §5). Mirrors the legal addendum.
 *
 * Deviation #4 (2026-07-02): wires the E2E-encrypted backup envelope +
 * restore UX that LIFEOS_BUILD_STATUS deferred to v2. "Back up now" and
 * "Restore from backup" call src/data/backup/backupManager.ts, which reuses
 * the same /user/backup-blob route mobile's proven 094B engine calls — the
 * envelope format and server contract are unchanged, only the crypto/DB glue
 * is Life-OS-native (src/data/backup.ts + src/data/backup/*).
 *
 * Restore is destructive (wipes + replaces on-device tables) — the confirm
 * copy says so plainly (CONTENT_SAFETY.md §5: describe the mechanism, no
 * absolute promises). Because FamilyActivitySelection tokens and app labels
 * are device-scoped and do not survive a backup/restore round trip
 * (src/data/backup.ts header), a successful restore always ends with a
 * "re-pick your blocked apps" prompt, plus a "re-tag your apps" prompt when
 * the appWellbeingScoring feature flag is on.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme/ThemeContext';
import { Card, PFButton, PFInput, ScreenLayout, SectionTitle } from '../src/components/ui';
import { Ionicons } from '../src/components/Icon';
import { fontFamily, fontSize, spacing } from '../src/theme/tokens';
import { PRODUCT_NAME } from '../src/config/product';
import { useFeatureFlags } from '../src/hooks/useFeatureFlags';
import {
  backupNow,
  consumePendingRecoveryCode,
  getStatus,
  restoreFromServer,
  type BackupStatus,
} from '../src/data/backup/backupManager';

function Body({ children }: { children: string }): React.ReactElement {
  const { theme } = useTheme();
  return (
    <Text
      style={{
        color: theme.colors.textSecondary,
        fontFamily: fontFamily.regular,
        fontSize: fontSize.bodyMd,
        lineHeight: 24,
      }}
    >
      {children}
    </Text>
  );
}

/** Human-readable relative-ish timestamp for "last backed up …". Plain and factual (CONTENT_SAFETY §5). */
function formatBackupTimestamp(iso: string | null): string {
  if (!iso) return 'Never backed up on this device.';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Never backed up on this device.';
  return `Last backed up ${d.toLocaleString()}.`;
}

type RestoreStage = 'idle' | 'confirm-code' | 'done';

export default function DataHandlingScreen(): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const { isEnabled } = useFeatureFlags();
  const appWellbeingOn = isEnabled('appWellbeingScoring');

  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [restoreStage, setRestoreStage] = useState<RestoreStage>('idle');
  const [restoredCount, setRestoredCount] = useState<number | null>(null);

  const refreshStatus = useCallback(async () => {
    const s = await getStatus();
    setStatus(s);
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const handleBackupNow = async (): Promise<void> => {
    setError(null);
    setNotice(null);
    setBackingUp(true);
    try {
      const result = await backupNow();
      if (!result.ok) {
        setError('Backup could not reach the server right now. Your data is safe on this device — try again later.');
        return;
      }
      if (result.needsRecoveryAck) {
        const code = consumePendingRecoveryCode();
        if (code) {
          // Surface the recovery code once, plainly — it is never stored by us.
          Alert.alert(
            'Save your recovery code',
            `${code}\n\nThis code is the only way to restore your backup on a new device. We do not store it — write it down somewhere safe.`,
            [{ text: 'I saved it' }],
          );
        }
      }
      setNotice('Backup complete.');
      await refreshStatus();
    } finally {
      setBackingUp(false);
    }
  };

  const runRestore = async (code?: string): Promise<void> => {
    setError(null);
    setNotice(null);
    setRestoring(true);
    try {
      const result = await restoreFromServer(code ? { recoveryCode: code } : {});
      if (!result.ok) {
        // "No keychain key" is the expected signal to ask for the recovery code.
        if (!code && /recovery code/i.test(result.reason)) {
          setRestoreStage('confirm-code');
          return;
        }
        setError(`Restore failed: ${result.reason}`);
        return;
      }
      setRestoredCount(result.restored);
      setRestoreStage('done');
      await refreshStatus();
    } finally {
      setRestoring(false);
    }
  };

  const confirmAndRestore = (): void => {
    Alert.alert(
      'Restore from backup?',
      'This replaces everything on this device — habits, goals, mood check-ins, notes, and survey answers — with the contents of your last backup. Anything logged on this device since that backup is gone. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: () => {
            void runRestore();
          },
        },
      ],
    );
  };

  const submitRecoveryCode = (): void => {
    const code = recoveryCode.trim();
    if (!code) {
      setError('Enter your recovery code to continue.');
      return;
    }
    void runRestore(code);
  };

  // ---------------------------------------------------------------------------
  // Post-restore completion state — the two device-scoped re-setup prompts.
  // FamilyActivitySelection tokens and app labels don't survive a restore
  // (device-scoped, not portable — src/data/backup.ts header), so every
  // successful restore ends here regardless of which path got it there.
  // ---------------------------------------------------------------------------
  if (restoreStage === 'done') {
    return (
      <ScreenLayout>
        <SectionTitle top={spacing.s4}>Restore complete</SectionTitle>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.s3 }}>
            <Ionicons name="checkmark-circle" size={22} color={c.statusSuccess ?? c.accentDefault} style={{ marginRight: spacing.s2 }} />
            <Text style={{ color: c.textPrimary, fontFamily: fontFamily.semibold, fontSize: fontSize.bodyMd }}>
              Your data is back on this device
            </Text>
          </View>
          <Body>
            {restoredCount !== null
              ? `Restored ${restoredCount} item${restoredCount === 1 ? '' : 's'} across your habits, goals, mood check-ins, notes, and survey answers.`
              : 'Your habits, goals, mood check-ins, notes, and survey answers are back on this device.'}
          </Body>
        </Card>

        <SectionTitle>Two things need a fresh pick</SectionTitle>
        <Card>
          <Body>
            Apple keeps app-blocking selections tied to this specific device install — they don't travel with
            a backup. Re-pick the apps you want blocked, and (if you use it) re-tag them, and you're fully
            set up again.
          </Body>
          <PFButton
            label="Re-pick your blocked apps"
            icon="shield-outline"
            onPress={() => router.push('/focus-editor')}
            style={{ marginTop: spacing.s4 }}
          />
          {appWellbeingOn ? (
            <PFButton
              label="Re-tag your apps"
              icon="pricetags-outline"
              variant="secondary"
              onPress={() => router.push('/app-wellbeing')}
              style={{ marginTop: spacing.s3 }}
            />
          ) : null}
        </Card>

        <PFButton
          label="Done"
          variant="ghost"
          onPress={() => {
            setRestoreStage('idle');
            setRestoredCount(null);
          }}
          style={{ marginTop: spacing.s4 }}
        />
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout>
      <SectionTitle top={spacing.s4}>On this device</SectionTitle>
      <Card>
        <Body>
          {`Your habits, goals, mood check-ins, notes, survey answers, and focus rules live in a database on this phone. ${PRODUCT_NAME} works fully offline.`}
        </Body>
      </Card>

      <SectionTitle>Screen time</SectionTitle>
      <Card>
        <Body>
          App usage and blocking run through Apple's Screen Time framework, which keeps that data on the
          device. Apple does not allow apps to export it — so we never receive which apps you use or for
          how long, and no copy exists on our servers.
        </Body>
      </Card>

      <SectionTitle>On our servers</SectionTitle>
      <Card>
        <Body>
          Three things: your account sign-in, a flag saying your subscription includes this app, and — if
          you turn on backup — an encrypted backup file. The backup is encrypted on your device before
          upload; the key comes from your recovery code, which we never see, so we cannot read the
          contents.
        </Body>
      </Card>

      <SectionTitle>Backup</SectionTitle>
      <Card>
        <Body>{formatBackupTimestamp(status?.lastLocalAt ?? null)}</Body>

        {notice ? (
          <Text
            style={{
              color: c.statusSuccess ?? c.accentDefault,
              fontFamily: fontFamily.medium,
              fontSize: fontSize.bodySm,
              marginTop: spacing.s2,
            }}
          >
            {notice}
          </Text>
        ) : null}
        {error ? (
          <Text
            accessibilityRole="alert"
            style={{ color: c.statusError, fontFamily: fontFamily.regular, fontSize: fontSize.bodySm, marginTop: spacing.s2 }}
          >
            {error}
          </Text>
        ) : null}

        <PFButton
          label="Back up now"
          icon="cloud-upload-outline"
          onPress={() => void handleBackupNow()}
          loading={backingUp}
          disabled={restoring}
          style={{ marginTop: spacing.s4 }}
        />

        {restoreStage === 'confirm-code' ? (
          <View style={{ marginTop: spacing.s4 }}>
            <Body>
              We couldn't find a backup key on this device. Enter the recovery code you saved when you first
              turned on backup.
            </Body>
            <PFInput
              label="Recovery code"
              value={recoveryCode}
              onChangeText={setRecoveryCode}
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
              autoCapitalize="characters"
              autoCorrect={false}
              style={{ marginTop: spacing.s3 }}
            />
            <PFButton
              label="Restore with this code"
              onPress={submitRecoveryCode}
              loading={restoring}
              style={{ marginTop: spacing.s2 }}
            />
            <PFButton
              label="Never mind"
              variant="ghost"
              onPress={() => {
                setRestoreStage('idle');
                setRecoveryCode('');
                setError(null);
              }}
              style={{ marginTop: spacing.s2 }}
            />
          </View>
        ) : (
          <PFButton
            label="Restore from backup"
            icon="cloud-download-outline"
            variant="secondary"
            onPress={confirmAndRestore}
            loading={restoring}
            disabled={backingUp}
            style={{ marginTop: spacing.s3 }}
          />
        )}
      </Card>

      <SectionTitle>What we don't do</SectionTitle>
      <Card>
        <Body>
          We don't sell or share your data, and we don't use your notes, moods, goals, or surveys for
          advertising or for training models.
        </Body>
      </Card>

      <SectionTitle>Your controls</SectionTitle>
      <Card>
        <Body>
          You can export everything, delete your backups, or delete your whole account from your Peak
          Fettle profile. Signing out and uninstalling removes the local database from the phone.
        </Body>
      </Card>
    </ScreenLayout>
  );
}
