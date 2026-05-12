/**
 * SyncStatusIndicator — compact pill showing the PowerSync sync state.
 *
 * States:
 *   synced   — connected, nothing in flight       → green dot  + "Synced"
 *   syncing  — downloading or uploading           → indigo dot  + "Syncing…" (pulsing)
 *   offline  — not connected to sync service      → red dot    + "Offline"
 *
 * Usage:
 *   <SyncStatusIndicator />
 *
 * The component uses usePowerSyncStatus() from @powersync/react-native, which
 * subscribes to the live PowerSyncDatabase status and re-renders on every change.
 * No props required — it reads directly from the shared db instance via context.
 *
 * Implemented as part of TICKET-027 (PowerSync offline sync integration).
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { usePowerSyncStatus } from '@powersync/react-native';

// ---------------------------------------------------------------------------
// Derived state
// ---------------------------------------------------------------------------

type SyncState = 'synced' | 'syncing' | 'offline';

interface StatusLike {
  connected: boolean;
  downloading: boolean;
  uploading: boolean;
}

function deriveSyncState(status: StatusLike): SyncState {
  if (!status.connected) return 'offline';
  if (status.downloading || status.uploading) return 'syncing';
  return 'synced';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SyncStatusIndicator(): React.ReactElement {
  const status = usePowerSyncStatus();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const syncState = deriveSyncState({
    connected: status.connected ?? false,
    downloading: status.downloading ?? false,
    uploading: status.uploading ?? false,
  });

  // Pulse the dot while syncing; snap back to full opacity otherwise.
  useEffect(() => {
    if (syncState === 'syncing') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.25,
            duration: 650,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 650,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [syncState, pulseAnim]);

  // Colours and label per state.
  const dotColor =
    syncState === 'synced'
      ? '#22c55e'   // green-500
      : syncState === 'syncing'
      ? '#818cf8'   // indigo-400
      : '#ef4444';  // red-500

  const label =
    syncState === 'synced'
      ? 'Synced'
      : syncState === 'syncing'
      ? 'Syncing…'  // "Syncing…"
      : 'Offline';

  return (
    <View style={styles.pill}>
      <Animated.View
        style={[styles.dot, { backgroundColor: dotColor, opacity: pulseAnim }]}
      />
      <Text
        style={[
          styles.label,
          syncState === 'offline' && styles.labelOffline,
          syncState === 'syncing' && styles.labelSyncing,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    // Subtle border so the pill reads against the dark header.
    borderWidth: 1,
    borderColor: '#334155',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',    // slate-400 default (synced)
    letterSpacing: 0.2,
  },
  labelSyncing: {
    color: '#a5b4fc',   // indigo-300
  },
  labelOffline: {
    color: '#f87171',   // red-400
  },
});
