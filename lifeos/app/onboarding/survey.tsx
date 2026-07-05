/**
 * Onboarding survey (TICKET-107, Q26) — 5–7 minutes, 6 steps, back-navigable,
 * progress bar, autosaves nothing server-side (answers live in local DB only).
 *
 * Output: SurveyAnswers → saveSurvey() → generateAndStoreProtocols() →
 * plan-reveal. The obstacle question per domain encodes WOOP-style mental
 * contrasting (derivation R16).
 *
 * TICKET-166: adds a visible "Step X of Y" caption alongside the progress
 * bar, and a per-step Skip for non-essential steps (hours, chronotype, pain
 * apps) so users can move through faster without losing the required steps
 * (domains, assessment, values). No permission is requested anywhere in this
 * screen — notification priming happens later, contextually, on plan-reveal.
 */

import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeContext';
import { PFButton, PFInput, ScreenLayout, SectionTitle } from '../../src/components/ui';
import { Ionicons } from '../../src/components/Icon';
import { fontFamily, fontSize, HIT_TARGET, radius, spacing } from '../../src/theme/tokens';
import { DOMAINS, Domain } from '../../src/data/goals';
import { Chronotype, SURVEY_VERSION, SurveyAnswers, VALUE_KEYS } from '../../src/engine/directionTypes';
import { generateAndStoreProtocols, saveSurvey } from '../../src/data/protocols';
import { haptic } from '../../src/lib/haptics';
import { safeWrite } from '../../src/lib/feedback';

const HOUR_CHOICES = [2, 4, 6, 8, 12, 16];
const DEFAULT_HOURS = 4;
const DEFAULT_CHRONOTYPE: Chronotype = 'mixed';
const VALUE_LABELS: Record<string, string> = {
  mastery: 'Mastery',
  connection: 'Connection',
  health: 'Health',
  autonomy: 'Autonomy',
  contribution: 'Contribution',
  stability: 'Stability',
  adventure: 'Adventure',
};

function Chip({
  label,
  selected,
  onPress,
  badge,
  onRemove,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  badge?: string;
  /** When set, renders a trailing close-outline icon (e.g. pain-app chips). */
  onRemove?: () => void;
}): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={onRemove ? `Remove ${label}` : label}
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      style={({ pressed }) => ({
        minHeight: HIT_TARGET,
        paddingHorizontal: spacing.s4,
        paddingVertical: spacing.s2,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: selected ? c.accentDefault : c.borderDefault,
        backgroundColor: selected ? c.accentMuted : c.bgSecondary,
        marginRight: spacing.s2,
        marginBottom: spacing.s2,
        flexDirection: 'row',
        alignItems: 'center',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {badge ? (
        <Text style={{ color: c.accentDefault, fontFamily: fontFamily.bold, fontSize: fontSize.bodySm, marginRight: spacing.s1 }}>
          {badge}
        </Text>
      ) : null}
      <Text
        style={{
          color: selected ? c.textPrimary : c.textSecondary,
          fontFamily: selected ? fontFamily.semibold : fontFamily.regular,
          fontSize: fontSize.bodyMd,
        }}
      >
        {label}
      </Text>
      {onRemove ? (
        <Ionicons name="close-outline" size={16} color={c.textSecondary} style={{ marginLeft: spacing.s1 }} />
      ) : null}
    </Pressable>
  );
}

export default function SurveyScreen(): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [assessment, setAssessment] = useState<Partial<Record<Domain, { current: number; blocker: string }>>>({});
  const [hours, setHours] = useState<number | null>(null);
  const [chronotype, setChronotype] = useState<Chronotype | null>(null);
  const [values, setValues] = useState<string[]>([]);
  const [painApps, setPainApps] = useState<string[]>([]);
  const [painInput, setPainInput] = useState('');
  const [generating, setGenerating] = useState(false);

  // Steps: 0 domains, 1 per-domain assessment, 2 hours, 3 chronotype, 4 values, 5 pain apps
  const TOTAL_STEPS = 6;
  // Non-essential steps: skipping falls back to a sane default and advances.
  const SKIPPABLE_STEPS = new Set([2, 3]);
  const isSkippable = SKIPPABLE_STEPS.has(step);

  const canNext = useMemo(() => {
    switch (step) {
      case 0:
        return domains.length > 0;
      case 1:
        return domains.every((d) => assessment[d]?.current != null);
      case 2:
        return hours != null;
      case 3:
        return chronotype != null;
      case 4:
        return values.length === 3;
      case 5:
        return true; // pain apps optional
      default:
        return false;
    }
  }, [step, domains, assessment, hours, chronotype, values]);

  const finish = async (answersOverride?: { hours?: number; chronotype?: Chronotype }): Promise<void> => {
    setGenerating(true);
    const answers: SurveyAnswers = {
      surveyVersion: SURVEY_VERSION,
      kind: 'onboarding',
      domains,
      selfAssessment: assessment,
      hoursPerWeek: answersOverride?.hours ?? hours ?? DEFAULT_HOURS,
      chronotype: answersOverride?.chronotype ?? chronotype ?? DEFAULT_CHRONOTYPE,
      values,
      painApps,
    };
    const ok = await safeWrite(async () => {
      await saveSurvey(answers);
      await generateAndStoreProtocols(answers);
      return true;
    }, {
      errorMessage: "Couldn't build your plan. Please try again.",
      context: 'survey.finish',
    });
    if (!ok) {
      setGenerating(false);
      return;
    }
    router.replace('/onboarding/plan-reveal');
  };

  const next = (): void => {
    haptic.impact('light');
    if (step < TOTAL_STEPS - 1) setStep(step + 1);
    else void finish();
  };

  const back = (): void => {
    haptic.impact('light');
    setStep(step - 1);
  };

  // Per-step skip: applies the non-essential step's default, then advances
  // exactly like Next would.
  const skip = (): void => {
    haptic.impact('light');
    if (step === 2) {
      setHours((prev) => prev ?? DEFAULT_HOURS);
      setStep(step + 1);
      return;
    }
    if (step === 3) {
      setChronotype((prev) => prev ?? DEFAULT_CHRONOTYPE);
      setStep(step + 1);
      return;
    }
  };

  const isLastStep = step === TOTAL_STEPS - 1;
  const finishLabel = painApps.length === 0 ? 'Skip & build my plan' : 'Build my plan';
  const nextLabel = isLastStep ? finishLabel : 'Next';

  return (
    <ScreenLayout>
      {/* progress bar + step caption */}
      <View style={{ marginTop: spacing.s3, marginBottom: spacing.s5 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.s2 }}>
          <Text
            style={{
              color: c.textSecondary,
              fontFamily: fontFamily.medium,
              fontSize: fontSize.caption,
              fontVariant: ['tabular-nums'],
            }}
          >
            {`Step ${step + 1} of ${TOTAL_STEPS}`}
          </Text>
          {isSkippable ? (
            <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption }}>
              Optional — you can skip this
            </Text>
          ) : null}
        </View>
        <View accessibilityLabel={`Step ${step + 1} of ${TOTAL_STEPS}`} style={{ flexDirection: 'row' }}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 4,
                borderRadius: radius.full,
                marginRight: i < TOTAL_STEPS - 1 ? spacing.s1 : 0,
                backgroundColor: i <= step ? c.accentDefault : c.borderDefault,
              }}
            />
          ))}
        </View>
      </View>

      {step === 0 && (
        <View>
          <SectionTitle top={0}>Where do you want direction?</SectionTitle>
          <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodyMd, marginBottom: spacing.s4 }}>
            Pick the areas you actually want to work on. You can change this any time.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {DOMAINS.map((d) => (
              <Chip
                key={d.key}
                label={d.label}
                selected={domains.includes(d.key)}
                onPress={() =>
                  setDomains((prev) =>
                    prev.includes(d.key) ? prev.filter((x) => x !== d.key) : [...prev, d.key]
                  )
                }
              />
            ))}
          </View>
        </View>
      )}

      {step === 1 && (
        <View>
          <SectionTitle top={0}>Where are you today?</SectionTitle>
          {domains.map((d) => {
            const a = assessment[d];
            return (
              <View key={d} style={{ marginBottom: spacing.s6 }}>
                <Text style={{ color: c.textPrimary, fontFamily: fontFamily.semibold, fontSize: fontSize.bodyLg, marginBottom: spacing.s2 }}>
                  {DOMAINS.find((x) => x.key === d)?.label}
                </Text>
                <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodySm, marginBottom: spacing.s2 }}>
                  1 = struggling · 10 = thriving
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {Array.from({ length: 10 }).map((_, i) => (
                    <Chip
                      key={i}
                      label={String(i + 1)}
                      selected={a?.current === i + 1}
                      onPress={() =>
                        setAssessment((prev) => ({ ...prev, [d]: { current: i + 1, blocker: prev[d]?.blocker ?? '' } }))
                      }
                    />
                  ))}
                </View>
                <PFInput
                  label="What's in the way? (optional)"
                  value={a?.blocker ?? ''}
                  onChangeText={(t) =>
                    setAssessment((prev) => ({ ...prev, [d]: { current: prev[d]?.current ?? 5, blocker: t } }))
                  }
                  placeholder="e.g. no time after work"
                />
              </View>
            );
          })}
        </View>
      )}

      {step === 2 && (
        <View>
          <SectionTitle top={0}>Hours per week, honestly</SectionTitle>
          <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodyMd, marginBottom: spacing.s4 }}>
            How much time can you realistically give this? Your plan will never ask for more.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {HOUR_CHOICES.map((h) => (
              <Chip key={h} label={`${h} h`} selected={hours === h} onPress={() => setHours(h)} />
            ))}
          </View>
        </View>
      )}

      {step === 3 && (
        <View>
          <SectionTitle top={0}>When are you at your best?</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.s3 }}>
            <Chip label="Mornings" selected={chronotype === 'morning'} onPress={() => setChronotype('morning')} />
            <Chip label="Evenings" selected={chronotype === 'evening'} onPress={() => setChronotype('evening')} />
            <Chip label="It varies" selected={chronotype === 'mixed'} onPress={() => setChronotype('mixed')} />
          </View>
        </View>
      )}

      {step === 4 && (
        <View>
          <SectionTitle top={0}>Pick your top 3 values, in order</SectionTitle>
          <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodyMd, marginBottom: spacing.s4 }}>
            Tap in order of importance. Tap again to remove.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {VALUE_KEYS.map((v) => {
              const idx = values.indexOf(v);
              return (
                <Chip
                  key={v}
                  label={VALUE_LABELS[v]}
                  badge={idx >= 0 ? String(idx + 1) : undefined}
                  selected={idx >= 0}
                  onPress={() =>
                    setValues((prev) =>
                      prev.includes(v) ? prev.filter((x) => x !== v) : prev.length < 3 ? [...prev, v] : prev
                    )
                  }
                />
              );
            })}
          </View>
        </View>
      )}

      {step === 5 && (
        <View>
          <SectionTitle top={0}>Which apps eat your time?</SectionTitle>
          <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodyMd, marginBottom: spacing.s4 }}>
            Just names — this only shapes suggestions. Blocking anything is always your call, made later
            with the system picker. Skip if you like.
          </Text>
          <PFInput
            label="Add an app"
            value={painInput}
            onChangeText={setPainInput}
            placeholder="e.g. Instagram"
            onSubmitEditing={() => {
              const v = painInput.trim();
              if (v && !painApps.includes(v)) setPainApps((prev) => [...prev, v]);
              setPainInput('');
            }}
            returnKeyType="done"
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {painApps.map((a) => (
              <Chip
                key={a}
                label={a}
                selected
                onRemove={() => setPainApps((prev) => prev.filter((x) => x !== a))}
                onPress={() => setPainApps((prev) => prev.filter((x) => x !== a))}
              />
            ))}
          </View>
        </View>
      )}

      <View style={{ flexDirection: 'row', marginTop: spacing.s8 }}>
        {step > 0 ? (
          <PFButton label="Back" variant="secondary" onPress={back} style={{ flex: 1, marginRight: spacing.s3 }} />
        ) : null}
        {isSkippable ? (
          <PFButton label="Skip" variant="ghost" onPress={skip} style={{ flex: 1, marginRight: spacing.s3 }} />
        ) : null}
        <PFButton
          label={nextLabel}
          onPress={next}
          disabled={!canNext}
          loading={generating}
          style={{ flex: 2 }}
        />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.s5 }}>
        <Ionicons name="lock-closed-outline" size={14} color={c.textTertiary} />
        <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption, marginLeft: spacing.s1 }}>
          Answers stay on this device.
        </Text>
      </View>
    </ScreenLayout>
  );
}
