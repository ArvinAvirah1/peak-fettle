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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SyncStatusBar(): React.ReactElement | null {
  const { connected, syncing } = useSyncStatus();

  if (syncing) {
    return (
      <View style={styles.syncing}>
        <ActivityIndicator size="small" color="#c7d2fe" style={styles.spinner} />
        <Text style={styles.syncingText}>Syncing…</Text>
      </View>
    );
  }

  if (!connected) {
    return (
      <View style={styles.offline}>
        <Text style={styles.offlineText}>⚠ Offline — changes saved locally</Text>
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
    backgroundColor: '#312e81',
    paddingVertical: 6,
    paddingHorizontal: 16,
    gap: 8,
  },
  spinner: {
    // ActivityIndicator already uses the color prop — no extra style needed.
  },
  syncingText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#c7d2fe',
    letterSpacing: 0.3,
  },
  offline: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#78350f',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#92400e',
  },
  offlineText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#fde68a',
    letterSpacing: 0.2,
  },
});
