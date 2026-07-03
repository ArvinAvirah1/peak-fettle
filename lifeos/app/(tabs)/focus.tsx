/**
 * Focus tab (TICKET-104) — reclaimed-time header, one-tap focus-now, config
 * list with enable toggles + app picker, authorization flow. When blocking
 * is unavailable (flag off / Android / entitlement pending) the tab shows an
 * honest teaser instead of broken controls (Q18a).
 */

import React, { useCallback, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeContext';
import { Card, EmptyState, PFButton, ScreenLayout, SectionTitle } from '../../src/components/ui';
import { Ionicons } from '../../src/components/Icon';
import { fontFamily, fontSize, HIT_TARGET, spacing } from '../../src/theme/tokens';
import { blocking, isBlockingAvailable } from '../../src/native/blocking';
import {
  computeSessionEndsAt,
  endFocusSession,
  FocusConfigRow,
  focusEventsSince,
  listFocusConfigs,
  setFocusEnabled,
  setSelectionToken,
  snoozesUsedToday,
  startFocusSession,
} from '../../src/data/focus';
import { dayKey } from '../../src/db/localDb';
import { FRICTION_DEFAULTS, PRODUCT_SHORT } from '../../src/config/product';

export default function FocusScreen(): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();

  const available = isBlockingAvailable();
  const [authorized, setAuthorized] = useState(false);
  const [configs, setConfigs] = useState<FocusConfigRow[]>([]);
  const [blocksHeld, setBlocksHeld] = useState(0);
  const [snoozesLeft, setSnoozesLeft] = useState<number>(FRICTION_DEFAULTS.snoozeBudget);

  const load = useCallback(async () => {
    setConfigs(await listFocusConfigs());
    const events = await focusEventsSince(`${dayKey()}T00:00:00`);
    setBlocksHeld(events.filter((e) => e.kind === 'unlock_abandoned').length);
    setSnoozesLeft(Math.max(0, FRICTION_DEFAULTS.snoozeBudget - (await snoozesUsedToday())));
    if (available) setAuthorized(await blocking.isAuthorized());
  }, [available]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const toggle = async (cfg: FocusConfigRow, enabled: boolean): Promise<void> => {
    if (enabled && !cfg.selection_token && available) {
      // Must pick apps first — system picker, the user's choice only.
      const token = await blocking.pickApps(null);
      if (!token) return;
      await setSelectionToken(cfg.id, token);
      await blocking.scheduleActivity(cfg.id, cfg.schedule_json, token);
    } else if (enabled && cfg.selection_token && available) {
      await blocking.scheduleActivity(cfg.id, cfg.schedule_json, cfg.selection_token);
    } else if (!enabled && available) {
      await blocking.cancelActivity(cfg.id);
    }
    await setFocusEnabled(cfg.id, enabled);

    // TICKET-118: a timed session drives the Live Activity + Focus-status widget.
    // Start on enable when it has a fixed end (focus_now / scheduled window); end
    // on disable. lo_meta.active_focus keeps the widget right even with no native LA.
    if (enabled) {
      const endsAt = computeSessionEndsAt(cfg);
      if (endsAt) await startFocusSession(cfg.name, endsAt, c.accentDefault);
    } else {
      await endFocusSession();
    }

    await load();
  };

  const describeSchedule = (cfg: FocusConfigRow): string => {
    try {
      const s = JSON.parse(cfg.schedule_json) as Record<string, unknown>;
      if (s.dailyLimitMin != null) return `${s.dailyLimitMin} min/day, then blocked`;
      if (s.startHHMM != null) return `${s.startHHMM}–${s.endHHMM}, scheduled days`;
      if (s.durationMin != null) return `${s.durationMin} min on demand`;
    } catch {
      // fall through
    }
    return cfg.kind;
  };

  if (!available) {
    return (
      <ScreenLayout>
        <EmptyState
          icon="shield-half-outline"
          title="App blocking is almost here"
          body={`${PRODUCT_SHORT} uses Apple's Screen Time framework to block apps with real friction. It needs a build with the FamilyControls entitlement — this build doesn't have it yet, so the Focus tools are paused. Your habits, goals, and plan all work fully in the meantime.`}
        />
      </ScreenLayout>
    );
  }

  if (!authorized) {
    return (
      <ScreenLayout>
        <EmptyState
          icon="shield-checkmark-outline"
          title="Allow Screen Time access"
          body="Blocking runs entirely on this device through Apple's Screen Time framework. We never see which apps you use — the OS doesn't allow it, by design."
          cta="Allow access"
          onPress={() => {
            void blocking.requestAuthorization().then((ok) => setAuthorized(ok));
          }}
        />
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout>
      {/* today's wins */}
      <View style={{ flexDirection: 'row', marginTop: spacing.s3 }}>
        <Card style={{ flex: 1, marginRight: spacing.s2 }}>
          <Text style={{ color: c.textPrimary, fontFamily: fontFamily.bold, fontSize: fontSize.heading2, fontVariant: ['tabular-nums'] }}>
            {blocksHeld}
          </Text>
          <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption }}>blocks held today</Text>
        </Card>
        <Card style={{ flex: 1 }}>
          <Text style={{ color: c.textPrimary, fontFamily: fontFamily.bold, fontSize: fontSize.heading2, fontVariant: ['tabular-nums'] }}>
            {snoozesLeft}
          </Text>
          <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption }}>snoozes left today</Text>
        </Card>
      </View>

      <PFButton
        label="Start a focus session now"
        icon="flash-outline"
        onPress={() => router.push({ pathname: '/focus-editor', params: { kind: 'focus_now' } })}
      />

      <SectionTitle>Rules</SectionTitle>
      {configs.length === 0 ? (
        <EmptyState
          icon="shield-half-outline"
          title="No rules yet"
          body="A rule blocks chosen apps on a schedule or after a daily limit. Unlocking always works — it just takes a moment, on purpose."
        />
      ) : (
        configs.map((cfg) => (
          <Card key={cfg.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons
                name={cfg.kind === 'limit' ? 'hourglass-outline' : cfg.kind === 'session' ? 'time-outline' : 'flash-outline'}
                size={22}
                color={cfg.enabled ? c.accentDefault : c.textTertiary}
              />
              <View style={{ flex: 1, marginLeft: spacing.s3 }}>
                <Text style={{ color: c.textPrimary, fontFamily: fontFamily.semibold, fontSize: fontSize.bodyMd }}>{cfg.name}</Text>
                <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption, marginTop: 2 }}>
                  {describeSchedule(cfg)}
                  {!cfg.selection_token ? ' · apps not chosen yet' : ''}
                </Text>
              </View>
              <Switch
                accessibilityLabel={`${cfg.name} ${cfg.enabled ? 'on' : 'off'}`}
                value={cfg.enabled === 1}
                onValueChange={(v) => void toggle(cfg, v)}
                trackColor={{ true: c.accentDefault, false: c.borderDefault }}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Choose apps for ${cfg.name}`}
              onPress={() => {
                void (async () => {
                  const token = await blocking.pickApps(cfg.selection_token);
                  if (token) {
                    await setSelectionToken(cfg.id, token);
                    if (cfg.enabled === 1) await blocking.scheduleActivity(cfg.id, cfg.schedule_json, token);
                    await load();
                  }
                })();
              }}
              style={{ minHeight: HIT_TARGET, justifyContent: 'center', marginTop: spacing.s1 }}
            >
              <Text style={{ color: c.accentDefault, fontFamily: fontFamily.medium, fontSize: fontSize.bodySm }}>
                {cfg.selection_token ? 'Change apps' : 'Choose apps'}
              </Text>
            </Pressable>
          </Card>
        ))
      )}

      <PFButton
        label="New rule"
        variant="secondary"
        icon="add-outline"
        onPress={() => router.push({ pathname: '/focus-editor', params: { kind: 'session' } })}
        style={{ marginTop: spacing.s2 }}
      />
    </ScreenLayout>
  );
}
