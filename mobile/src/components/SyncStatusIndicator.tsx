/**
 * SyncStatusIndicator — compact pill showing the offline-queue sync state.
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
import { useSyncStatus } from '../hooks/useSyncStatus';
import { useAuth } from '../hooks/useAuth';
import { isLocalFirst } from '../data/backup/tierPolicy';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const status = useSyncStatus();
  const { user } = useAuth();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Free/local-first users have no server sync — their data lives on-device with
  // an encrypted backup. "Synced" would be misleading (it implies multi-device
  // server sync, a Pro feature). Show a calm "On device" instead.
  const localFirst = isLocalFirst(user);

  // The offline-queue engine exposes a single in-flight signal (`syncing`);
  // map it onto the existing downloading/uploading inputs of deriveSyncState.
  const syncState = deriveSyncState({
    connected: status.connected,
    downloading: false,
    uploading: status.syncing,
  });

  // Pulse the dot while syncing; snap back to full opacity otherwise.
  // (Local-first users never pulse — they're never "syncing".)
  useEffect(() => {
    if (!localFirst && syncState === 'syncing') {
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
  const dotColor = localFirst
    ? theme.colors.statusSuccess
    : syncState === 'synced'
      ? theme.colors.statusSuccess
      : syncState === 'syncing'
      ? theme.colors.accentDefault
      : theme.colors.statusError;

  const labelColor = localFirst
    ? theme.colors.textSecondary
    : syncState === 'offline'
      ? theme.colors.statusError
      : syncState === 'syncing'
      ? theme.colors.accentHover
      : theme.colors.textSecondary;

  const label = localFirst
    ? t('components:syncStatusIndicator.onDevice')
    : syncState === 'synced'
      ? t('components:syncStatusIndicator.synced')
      : syncState === 'syncing'
      ? t('components:syncStatusIndicator.syncing')
      : t('components:syncStatusIndicator.offline');

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
