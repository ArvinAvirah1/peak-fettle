/**
 * Accountability partner screen — TICKET-121 (Q33 option a).
 *
 * Lets the user pair ONE partner who can see a gentle DAILY SUMMARY (counts +
 * streak status) — never raw habits, mood notes, or blocked-app lists. The exact
 * string is shown BEFORE the first send (informed consent). Pairing generates a
 * 128-bit capability code shared via the OS share sheet; the partner views it at
 * <api>/partner/<code>. Pause/revoke any time (revoke clears the server row).
 *
 * Entirely gated on the 'accountabilityPartner' flag (default OFF): with the flag
 * off there is no UI and zero network activity.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Share, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme/ThemeContext';
import { Card, EmptyState, PFButton, PFInput, ScreenLayout, SectionTitle } from '../src/components/ui';
import { Ionicons } from '../src/components/Icon';
import { fontFamily, fontSize, HIT_TARGET, spacing } from '../src/theme/tokens';
import { useFeatureFlags } from '../src/hooks/useFeatureFlags';
import {
  clearPartner,
  composePartnerSummary,
  generateInviteCode,
  getPartner,
  setPartnerPaused,
  upsertPartner,
  type PartnerRow,
} from '../src/features/partner/partnerData';
import { deletePartnerSummary, postPartnerSummary } from '../src/api/lifeos';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? '';
const partnerLink = (code: string): string => `${API_BASE}/partner/${code}`;

export default function PartnerScreen(): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const { isEnabled } = useFeatureFlags();
  const enabled = isEnabled('accountabilityPartner');

  const [partner, setPartner] = useState<PartnerRow | null>(null);
  const [label, setLabel] = useState('');
  const [preview, setPreview] = useState<string>('…');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [p, s] = await Promise.all([getPartner(), composePartnerSummary()]);
    setPartner(p);
    setPreview(s.text);
  }, []);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  const muted = { color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodySm, lineHeight: 21 };

  if (!enabled) {
    return (
      <ScreenLayout>
        <EmptyState
          icon="people-outline"
          title="Accountability partner is off"
          body="Turn it on in You › Features to share a gentle daily summary — counts and streak only — with one person you choose."
          cta="Open Features"
          onPress={() => router.push('/(tabs)/you')}
        />
      </ScreenLayout>
    );
  }

  const pair = async (): Promise<void> => {
    setError(null);
    const name = label.trim();
    if (!name) {
      setError('Add a name for your partner first.');
      return;
    }
    setBusy(true);
    try {
      const { text } = await composePartnerSummary();
      const code = await generateInviteCode();
      await postPartnerSummary(code, text); // server stores the opaque summary
      await upsertPartner({ partnerLabel: name, inviteCode: code });
      await refresh();
      await Share.share({
        message: `Follow my progress on Peak Fettle LifeOS — a daily check-in summary (no personal detail): ${partnerLink(code)}`,
      });
    } catch {
      setError('Could not set up sharing right now. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const sendNow = async (): Promise<void> => {
    if (!partner?.invite_code) return;
    setError(null);
    setBusy(true);
    try {
      const { text } = await composePartnerSummary();
      await postPartnerSummary(partner.invite_code, text);
      setPreview(text);
    } catch {
      setError('Could not send today’s summary. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const togglePause = async (paused: boolean): Promise<void> => {
    await setPartnerPaused(paused);
    await refresh();
  };

  const revoke = async (): Promise<void> => {
    setBusy(true);
    try {
      await deletePartnerSummary();
    } catch {
      // even if the server call fails, clear locally so the user is in control
    }
    await clearPartner();
    setPartner(null);
    setLabel('');
    setBusy(false);
  };

  const shareAgain = async (): Promise<void> => {
    if (!partner?.invite_code) return;
    await Share.share({
      message: `Follow my progress on Peak Fettle LifeOS — a daily check-in summary (no personal detail): ${partnerLink(partner.invite_code)}`,
    });
  };

  return (
    <ScreenLayout>
      <SectionTitle top={spacing.s4}>What they see</SectionTitle>
      <Card>
        <Text style={muted}>Your partner only ever sees this one line — counts and streak, refreshed when you send it:</Text>
        <Text
          style={{ color: c.textPrimary, fontFamily: fontFamily.semibold, fontSize: fontSize.bodyMd, marginTop: spacing.s3 }}
        >
          “{preview}”
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.s3 }}>
          <Ionicons name="lock-closed-outline" size={14} color={c.textTertiary} />
          <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption, marginLeft: spacing.s2, flex: 1 }}>
            Never your habit names, mood notes, or which apps you limit.
          </Text>
        </View>
      </Card>

      {error ? (
        <Text accessibilityRole="alert" style={{ color: c.statusError, fontFamily: fontFamily.regular, fontSize: fontSize.bodySm, marginBottom: spacing.s2 }}>
          {error}
        </Text>
      ) : null}

      {partner ? (
        <>
          <SectionTitle>Your partner</SectionTitle>
          <Card>
            <Text style={{ color: c.textPrimary, fontFamily: fontFamily.semibold, fontSize: fontSize.bodyLg }}>
              {partner.partner_label}
            </Text>
            <Text style={[muted, { marginTop: spacing.s1 }]}>
              {partner.paused ? 'Paused — nothing new is shared.' : 'Active — they can see your latest summary.'}
            </Text>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: HIT_TARGET, marginTop: spacing.s2 }}
            >
              <Text style={{ color: c.textPrimary, fontFamily: fontFamily.medium, fontSize: fontSize.bodyMd }}>Pause sharing</Text>
              <Switch
                value={partner.paused === 1}
                onValueChange={(v) => void togglePause(v)}
                trackColor={{ true: c.accentDefault, false: c.borderDefault }}
                ios_backgroundColor={c.borderDefault}
                accessibilityLabel="Pause sharing"
                accessibilityState={{ checked: partner.paused === 1 }}
              />
            </View>
          </Card>

          <PFButton
            label="Send today’s summary"
            icon="paper-plane-outline"
            onPress={() => void sendNow()}
            loading={busy}
            disabled={partner.paused === 1}
            style={{ marginTop: spacing.s2 }}
          />
          <PFButton label="Share the link again" variant="secondary" icon="share-outline" onPress={() => void shareAgain()} style={{ marginTop: spacing.s3 }} />
          <View style={{ marginTop: spacing.s8 }}>
            <PFButton label="Stop sharing & revoke" variant="destructive" onPress={() => void revoke()} disabled={busy} />
          </View>
        </>
      ) : (
        <>
          <SectionTitle>Invite one person</SectionTitle>
          <Card>
            <PFInput
              label="Their name"
              value={label}
              onChangeText={setLabel}
              placeholder="e.g. Sam"
              autoCapitalize="words"
              helper="Just a label for you — it never leaves your device."
            />
            <Text style={muted}>
              We’ll create a private link you can send them. They’ll see the one line above, and nothing else. You can pause or revoke any time.
            </Text>
          </Card>
          <PFButton label="Create link & invite" icon="person-add-outline" onPress={() => void pair()} loading={busy} />
        </>
      )}
    </ScreenLayout>
  );
}
