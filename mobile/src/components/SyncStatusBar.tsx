/**
 * SyncStatusBar — a slim banner that surfaces the PowerSync connection state.
 *
 * States rendered:
 *   Syncing   — indigo background, spinner + "Syncing..." label
 *   Offline   — amber background, "⚠ Offline — changes saved locally"
 *   Synced    — renders nothing (success state is the absence of a banner)
 *
 * The "Synced" no-render policy keeps the UI clean during normal operation:
 * the bar only appears when there's something actionable to show the user.
 *
 * TICKET-027 — PowerSync offline sync integration.
 */

import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, spacing } from '../theme/tokens';
import { useTranslation } from 'react-i18next';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SyncStatusBar(): React.ReactElement | null {
  const { connected, syncing } = useSyncStatus();
  const { theme } = useTheme();
  const { t } = useTranslation();

  if (syncing) {
    return (
      <View style={[styles.syncing, { backgroundColor: theme.colors.accentSecondary }]}>
        <ActivityIndicator size="small" color={theme.colors.textPrimary} style={styles.spinner} />
        <Text style={[styles.syncingText, { color: theme.colors.textPrimary }]}>{t('components:syncStatusBar.syncing')}</Text>
      </View>
    );
  }

  if (!connected) {
    return (
      <View style={[styles.offline, { backgroundColor: theme.colors.statusWarning, borderBottomColor: theme.colors.borderDefault }]}>
        <Text style={[styles.offlineText, { color: theme.colors.textPrimary }]}>{t('components:syncStatusBar.offline')}</Text>
      </View>
    );
  }

  // Connected and idle — render nothing.
  return null;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  syncing: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: spacing.s4,
    gap: 8,
  },
  spinner: {
    // ActivityIndicator already uses the color prop — no extra style needed.
  },
  syncingText: {
    fontSize: fontSize.caption,  // E-003: was 12
    fontWeight: fontWeight.medium,  // E-003: was '500'
    letterSpacing: 0.3,
  },
  offline: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: spacing.s4,
    borderBottomWidth: 1,
  },
  offlineText: {
    fontSize: fontSize.caption,  // E-003: was 12
    fontWeight: fontWeight.medium,  // E-003: was '500'
    letterSpacing: 0.2,
  },
});
