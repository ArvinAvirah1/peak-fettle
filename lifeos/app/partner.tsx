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
 *
 * T169 (this pass): a single-CTA EmptyState ('generic') greets a first-time user
 * before a partner is paired — tapping it reveals the existing invite form (the
 * exact-summary-string preview Card stays visible above it either way, per the
 * design contract). Every async op (setup/send/pause/revoke) now drives a loading
 * state via PFButton's `loading` prop; local writes go through `safeWrite` with a
 * success toast; no network call was added or removed.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Share, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme/ThemeContext';
import { Card, EmptyState, PFButton, PFInput, ScreenLayout, SectionTitle } from '../src/components/ui';
import { Ionicons } from '../src/components/Icon';
import { fontFamily, fontSize, HIT_TARGET, spacing } from '../src/theme/tokens';
import { useFeatureFlags } from '../src/hooks/useFeatureFlags';
import { haptic } from '../src/lib/haptics';
import { safeWrite, showToast } from '../src/lib/feedback';
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
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadingPreview(true);
    try {
      const [p, s] = await Promise.all([getPartner(), composePartnerSummary()]);
      setPartner(p);
      setPreview(s.text);
    } finally {
      setLoadingPreview(false);
    }
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
      const saved = await safeWrite(() => upsertPartner({ partnerLabel: name, inviteCode: code }), {
        errorMessage: "That didn't save. Please try again.",
        context: 'partner.upsertPartner',
      });
      if (saved === undefined) return;
      await refresh();
      haptic.success();
      showToast({ kind: 'success', message: 'Partner invited.' });
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
      haptic.success();
      showToast({ kind: 'success', message: 'Summary sent.' });
    } catch {
      setError('Could not send today’s summary. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const togglePause = async (paused: boolean): Promise<void> => {
    setPausing(true);
    try {
      const saved = await safeWrite(() => setPartnerPaused(paused), {
        errorMessage: "That didn't save. Please try again.",
        context: 'partner.setPartnerPaused',
      });
      if (saved === undefined) return;
      await refresh();
      haptic.selection();
      showToast({ kind: 'success', message: paused ? 'Sharing paused.' : 'Sharing resumed.' });
    } finally {
      setPausing(false);
    }
  };

  const revoke = async (): Promise<void> => {
    setRevoking(true);
    try {
      try {
        await deletePartnerSummary();
      } catch {
        // even if the server call fails, clear locally so the user is in control
      }
      const saved = await safeWrite(() => clearPartner(), {
        errorMessage: "That didn't save. Please try again.",
        context: 'partner.clearPartner',
      });
      if (saved === undefined) return;
      setPartner(null);
      setLabel('');
      setShowInviteForm(false);
      haptic.warning();
      showToast({ kind: 'success', message: 'Sharing stopped and revoked.' });
    } finally {
      setRevoking(false);
    }
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
          accessibilityLabel={`Summary preview: ${preview}`}
          style={{ color: c.textPrimary, fontFamily: fontFamily.semibold, fontSize: fontSize.bodyMd, marginTop: spacing.s3 }}
        >
          {loadingPreview ? '…' : `“${preview}”`}
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
              {pausing ? (
                <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption }}>Saving…</Text>
              ) : (
                <Switch
                  value={partner.paused === 1}
                  onValueChange={(v) => void togglePause(v)}
                  disabled={pausing}
                  trackColor={{ true: c.accentDefault, false: c.borderDefault }}
                  ios_backgroundColor={c.borderDefault}
                  accessibilityLabel="Pause sharing"
                  accessibilityRole="switch"
                  accessibilityState={{ checked: partner.paused === 1, disabled: pausing }}
                />
              )}
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
          <PFButton
            label="Share the link again"
            variant="secondary"
            icon="share-outline"
            onPress={() => void shareAgain()}
            style={{ marginTop: spacing.s3 }}
          />
          <View style={{ marginTop: spacing.s8 }}>
            <PFButton
              label="Stop sharing & revoke"
              variant="destructive"
              onPress={() => void revoke()}
              loading={revoking}
              disabled={busy || pausing}
            />
          </View>
        </>
      ) : showInviteForm ? (
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
          <PFButton
            label="Cancel"
            variant="ghost"
            onPress={() => {
              setShowInviteForm(false);
              setError(null);
            }}
            disabled={busy}
            style={{ marginTop: spacing.s2 }}
          />
        </>
      ) : (
        <EmptyState
          illustration="generic"
          icon="person-add-outline"
          title="No partner yet"
          body="Invite one person to see a gentle daily summary — just counts and your streak, nothing more."
          cta="Invite a partner"
          onPress={() => setShowInviteForm(true)}
        />
      )}
    </ScreenLayout>
  );
}
