/**
 * SyncStatusIndicator — compact pill showing the PowerSync sync state.
 *
 * E-001 update: migrated all hardcoded hex values to semantic tokens via useTheme().
 *
 * States:
 *   synced   — connected, nothing in flight       → green dot  + "Synced"
 *   syncing  — downloading or uploading           → accent dot + "Syncing…" (pulsing)
 *   offline  — not connected to sync service      → error dot  + "Offline"
 *
 * Usage:
 *   <SyncStatusIndicator />
 *
 * Implemented as part of TICKET-027 (PowerSync offline sync integration).
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
// DEV STUB: @powersync/react-native requires a native build — not available in Expo Go / web.
// Replace with real import once running a development build.
// import { usePowerSyncStatus } from '@powersync/react-native';
function usePowerSyncStatus() {
  return { connected: false, downloading: false, uploading: false };
}

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
  const { theme } = useTheme();
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

  // Colours and label per state — all via semantic tokens
  const dotColor =
    syncState === 'synced'
      ? theme.colors.statusSuccess
      : syncState === 'syncing'
      ? theme.colors.accentDefault
      : theme.colors.statusError;

  const labelColor =
    syncState === 'offline'
      ? theme.colors.statusError
      : syncState === 'syncing'
      ? theme.colors.accentHover
      : theme.colors.textSecondary;

  const label =
    syncState === 'synced'
      ? 'Synced'
      : syncState === 'syncing'
      ? 'Syncing…'
      : 'Offline';

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: theme.colors.bgTertiary,
          borderColor: theme.colors.borderDefault,
        },
      ]}
    >
      <Animated.View
        style={[styles.dot, { backgroundColor: dotColor, opacity: pulseAnim }]}
      />
      <Text style={[styles.label, { color: labelColor }]}>
        {label}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles — no hardcoded hex (E-001)
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
