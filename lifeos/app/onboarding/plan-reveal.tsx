/**
 * Plan reveal (TICKET-107) — per-domain proposal cards with the why,
 * evidence note (expandable), and Accept / Not now (Q28: the engine
 * proposes, never auto-enrolls). Accepting instantiates habits/goals;
 * blocker suggestions become disabled drafts finished in the Focus tab.
 *
 * TICKET-166: haptics route through src/lib/haptics.ts (not expo-haptics
 * directly), accept/dismiss writes are wrapped in safeWrite, each proposal
 * card enters with a staggered FadeSlideIn, and the completion state mounts
 * the contextual notification "prime" card — this is the plan-reveal
 * completion moment, the intended contextual point for T166.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeContext';
import { Card, PFButton, ScreenLayout, SectionTitle } from '../../src/components/ui';
import { Ionicons } from '../../src/components/Icon';
import { fontFamily, fontSize, spacing } from '../../src/theme/tokens';
import { acceptProtocol, dismissProtocol, listProtocols, ProtocolRow } from '../../src/data/protocols';
import { PROTOCOL_RATIONALES } from '../../src/content/protocols/templates';
import type { DomainProtocol } from '../../src/engine/directionTypes';
import { domainLabel } from '../../src/data/goals';
import { haptic } from '../../src/lib/haptics';
import { safeWrite } from '../../src/lib/feedback';
import { FadeSlideIn } from '../../src/components/motion';
import { MaybeNotificationPrime } from '../../src/components/NotificationPrime';

export default function PlanRevealScreen(): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const [rows, setRows] = useState<ProtocolRow[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(await listProtocols('proposed'));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onAccept = async (row: ProtocolRow): Promise<void> => {
    setBusy(row.id);
    const ok = await safeWrite(async () => {
      await acceptProtocol(row);
      return true;
    }, {
      errorMessage: "That didn't save. Please try again.",
      context: 'plan-reveal.acceptProtocol',
    });
    if (ok) haptic.success();
    setBusy(null);
    await load();
  };

  const onDismiss = async (row: ProtocolRow): Promise<void> => {
    await safeWrite(() => dismissProtocol(row.id), {
      errorMessage: "That didn't save. Please try again.",
      context: 'plan-reveal.dismissProtocol',
    });
    await load();
  };

  return (
    <ScreenLayout>
      <SectionTitle top={spacing.s3}>Proposed — you decide</SectionTitle>
      {rows.length === 0 ? (
        <View style={{ paddingVertical: spacing.s8 }}>
          <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodyMd, lineHeight: 24 }}>
            All set. Everything you accepted now lives in Habits and Goals — and you can re-run the survey
            any time from the You tab.
          </Text>
          <MaybeNotificationPrime />
          <PFButton label="Go to Today" onPress={() => router.replace('/(tabs)')} style={{ marginTop: spacing.s5 }} />
        </View>
      ) : (
        rows.map((row, index) => {
          const p = JSON.parse(row.payload_json) as DomainProtocol;
          const rationale = PROTOCOL_RATIONALES[p.rationaleKey];
          const isOpen = expanded === row.id;
          return (
            <FadeSlideIn key={row.id} index={index}>
              <Card>
                <Text style={{ color: c.accentDefault, fontFamily: fontFamily.semibold, fontSize: fontSize.caption, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                  {domainLabel(p.domain)} · ~{p.weeklyTimeBudgetMin} min/week
                </Text>
                <Text style={{ color: c.textPrimary, fontFamily: fontFamily.semibold, fontSize: fontSize.heading3, marginTop: spacing.s1 }}>
                  {p.goalTitle}
                </Text>
                <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodySm, lineHeight: 21, marginTop: spacing.s2 }}>
                  {rationale?.headline}
                </Text>

                {p.stacks.map((s) => (
                  <View key={s.name} style={{ marginTop: spacing.s3 }}>
                    <Text style={{ color: c.textPrimary, fontFamily: fontFamily.medium, fontSize: fontSize.bodyMd }}>
                      {s.name} · {s.anchorType === 'time' ? s.anchorValue : 'after ' + s.anchorValue.replace(/_/g, ' ')}
                    </Text>
                    {s.steps.map((st) => (
                      <View key={st.name} style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.s1 }}>
                        <Ionicons name={st.icon} size={16} color={c.textTertiary} />
                        <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodySm, marginLeft: spacing.s2 }}>
                          {st.name}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}

                {p.blockerSuggestion ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.s3 }}>
                    <Ionicons name="shield-half-outline" size={16} color={c.textTertiary} />
                    <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodySm, marginLeft: spacing.s2, flexShrink: 1 }}>
                      Suggested: {p.blockerSuggestion.name} (finish setup in Focus — app choice is yours)
                    </Text>
                  </View>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Why this plan — evidence"
                  onPress={() => setExpanded(isOpen ? null : row.id)}
                  style={{ marginTop: spacing.s3, minHeight: 32, justifyContent: 'center' }}
                >
                  <Text style={{ color: c.accentDefault, fontFamily: fontFamily.medium, fontSize: fontSize.bodySm }}>
                    {isOpen ? 'Hide the evidence' : 'Why this plan?'}
                  </Text>
                </Pressable>
                {isOpen ? (
                  <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.bodySm, lineHeight: 20, marginTop: spacing.s1 }}>
                    {rationale?.evidence}
                  </Text>
                ) : null}

                <View style={{ flexDirection: 'row', marginTop: spacing.s4 }}>
                  <PFButton label="Not now" variant="secondary" onPress={() => void onDismiss(row)} style={{ flex: 1, marginRight: spacing.s3 }} />
                  <PFButton label="Accept" onPress={() => void onAccept(row)} loading={busy === row.id} style={{ flex: 2 }} />
                </View>
              </Card>
            </FadeSlideIn>
          );
        })
      )}
      {rows.length > 0 ? (
        <PFButton label="Done for now" variant="ghost" onPress={() => router.replace('/(tabs)')} style={{ marginTop: spacing.s2 }} />
      ) : null}
    </ScreenLayout>
  );
}
