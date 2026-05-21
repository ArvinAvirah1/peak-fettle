/**
 * Post-registration onboarding screen — biological sex + primary discipline + theme + HealthKit.
 * TICKET-038 | ROADMAP item 1.6 | 2026-05-10
 * E-007 update (2026-05-17): added Step 3 — theme selection (spec §6.1).
 * P0-003 update (2026-05-17): added Step 4 — HealthKit permission (spec §6.1);
 *   updated OptionButton to tap-card style.
 *
 * This screen appears immediately after registration (or after login if the
 * user's profile is missing sex/discipline — see _layout.tsx gating logic).
 *
 * Design decisions (exec-percentile-decisions.md):
 *   • Sex question copy is exactly as specified: "What is your biological sex?"
 *     with three options: Male · Female · I'd rather not say.
 *   • Inline explanation beneath the question is required (CTO data-minimization
 *     note): "We use this to compare you fairly against athletes with similar
 *     physiology. It affects your percentile ranking only."
 *   • Sex is stored as MALE | FEMALE | UNDISCLOSED on the server.
 *     It is a ranking computation input ONLY — never returned on any profile
 *     endpoint or logged in analytics.
 *   • Discipline picker is Step 2, also skippable.
 *   • Theme selector is Step 3, also skippable (defaults to Deep Ocean).
 *   • HealthKit permission is Step 4, skippable via "Skip for now".
 *   • Screen is skippable in full — Skip stores no values; ranking will show
 *     the "pending profile" state until the user fills this in from settings.
 *
 * Steps:
 *   1. Biological sex
 *   2. Primary sport / discipline
 *   3. App theme (E-007)
 *   4. HealthKit permission (P0-003)
 *
 * Submits: PATCH /users/profile { sex, primary_discipline }
 * Theme is persisted via ThemeContext (AsyncStorage + Supabase) during selection.
 * On success or skip: router.replace('/(tabs)/')
 */

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../src/api/client';
import { useTheme } from '../src/theme/ThemeContext';
import { fontSize, fontWeight } from '../src/theme/tokens';
import { ThemeSelectorInline } from '../src/components/ThemeSelector';
import { ScreenLayout } from '../src/components/ui';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SexOption = 'MALE' | 'FEMALE' | 'UNDISCLOSED' | null;
type Discipline =
  | 'powerlifting'
  | 'weightlifting'
  | 'general_strength'
  | 'running'
  | 'cycling'
  | 'swimming'
  | 'other'
  | null;

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const SEX_OPTIONS: { label: string; value: SexOption }[] = [
  { label: 'Male',              value: 'MALE'        },
  { label: 'Female',            value: 'FEMALE'      },
  { label: "I'd rather not say", value: 'UNDISCLOSED' },
];

const DISCIPLINE_OPTIONS: { label: string; value: Discipline; subtitle?: string }[] = [
  { label: 'Powerlifting',      value: 'powerlifting'      },
  { label: 'Weightlifting',     value: 'weightlifting',     subtitle: 'Olympic lifting — snatch, clean & jerk' },
  { label: 'Gym / General Fitness', value: 'general_strength'  },
  { label: 'Running',           value: 'running'           },
  { label: 'Cycling',           value: 'cycling'           },
  { label: 'Swimming',          value: 'swimming'          },
  { label: 'Other / Mixed',     value: 'other'             },
];

// ---------------------------------------------------------------------------
// HealthKit stub (P0-003)
// expo-health is not installed — graceful stub records consent only.
// In a real build this would call HealthKit.requestAuthorization(...).
// ---------------------------------------------------------------------------

async function requestHealthKitPermissions(): Promise<void> {
  try {
    await AsyncStorage.setItem('@peak_fettle/healthkit_consent', 'true');
    await apiClient.patch('/health-metrics/consent', { consent: true }).catch(() => {});
  } catch (e) {
    // silent — HealthKit may not be available on Android or simulator
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function OptionButton<T>({
  label,
  subtitle,
  value,
  selected,
  onPress,
}: {
  label: string;
  subtitle?: string;
  value: T;
  selected: boolean;
  onPress: (v: T) => void;
}): React.ReactElement {
  const { theme, fontWeight: fw } = useTheme();
  const isSelected = selected;
  return (
    <TouchableOpacity
      style={[
        styles.option,
        {
          backgroundColor: isSelected
            ? (theme.colors.accentDefault + '1A')
            : theme.colors.bgElevated,
          borderColor: isSelected
            ? theme.colors.accentDefault
            : theme.colors.borderDefault,
          borderWidth: isSelected ? 1.5 : 1,
        },
      ]}
      onPress={() => onPress(value)}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <View style={styles.optionLabelGroup}>
        <Text style={[styles.optionLabel, { color: theme.colors.textPrimary }]}>
          {label}
        </Text>
        {subtitle ? (
          <Text style={[styles.optionSubtitle, { color: theme.colors.textTertiary }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {isSelected ? (
        <Text style={[styles.optionCheckmark, { color: theme.colors.accentDefault }]}>
          {'✓'}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function OnboardingScreen(): React.ReactElement {
  const router = useRouter();
  const { theme } = useTheme();

  // P0-003: 4 steps — sex, discipline, theme, HealthKit
  const [step, setStep]         = useState<1 | 2 | 3 | 4>(1);
  const [sex, setSex]           = useState<SexOption>(null);
  const [discipline, setDiscipline] = useState<Discipline>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Submit whatever has been collected and navigate to the main app.
  // Theme is already persisted by ThemeContext on selection — no extra call needed.
  const submit = useCallback(
    async (skipAll = false) => {
      setIsSubmitting(true);
      try {
        if (!skipAll && (sex !== null || discipline !== null)) {
          await apiClient.patch('/users/profile', {
            ...(sex        !== null ? { sex }              : {}),
            ...(discipline !== null ? { primary_discipline: discipline } : {}),
          });
        }
      } catch (err) {
        // Non-fatal: profile can be filled in from settings later.
        console.warn('[onboarding] profile patch failed:', err);
      } finally {
        setIsSubmitting(false);
        router.replace('/(tabs)/');
      }
    },
    [sex, discipline, router]
  );

  // Step 4 primary CTA: request HealthKit then navigate
  const handleConnectHealthKit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await requestHealthKitPermissions();
    } finally {
      setIsSubmitting(false);
      router.replace('/(tabs)/');
    }
  }, [router]);

  const handleNextOrSubmit = useCallback(() => {
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      setStep(3);  // E-007: proceed to theme step
    } else if (step === 3) {
      setStep(4);  // P0-003: proceed to HealthKit step
    } else {
      // Step 4 primary CTA — connect HealthKit then finish
      handleConnectHealthKit();
    }
  }, [step, handleConnectHealthKit]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <ScreenLayout horizontalPadding={false}>
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      {/* Progress dots — 4 steps (P0-003 added Step 4: HealthKit) */}
      <View style={styles.progressRow}>
        <View style={[
          styles.dot,
          { backgroundColor: theme.colors.borderDefault },
          step === 1 && { backgroundColor: theme.colors.accentDefault, width: 24 },
        ]} />
        <View style={[
          styles.dot,
          { backgroundColor: theme.colors.borderDefault },
          step === 2 && { backgroundColor: theme.colors.accentDefault, width: 24 },
        ]} />
        <View style={[
          styles.dot,
          { backgroundColor: theme.colors.borderDefault },
          step === 3 && { backgroundColor: theme.colors.accentDefault, width: 24 },
        ]} />
        <View style={[
          styles.dot,
          { backgroundColor: theme.colors.borderDefault },
          step === 4 && { backgroundColor: theme.colors.accentDefault, width: 24 },
        ]} />
      </View>

      {step === 1 ? (
        /* ------------------------------------------------------------------ */
        /* Step 1 — Biological sex                                             */
        /* ------------------------------------------------------------------ */
        <>
          <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>What is your biological sex?</Text>

          {/* Required inline explanation — exec spec */}
          <Text style={[styles.explanation, { color: theme.colors.textSecondary }]}>
            We use this to compare you fairly against athletes with similar
            physiology. It affects your percentile ranking only.
          </Text>

          <View style={styles.optionGroup}>
            {SEX_OPTIONS.map((opt) => (
              <OptionButton<SexOption>
                key={opt.value}
                label={opt.label}
                value={opt.value}
                selected={sex === opt.value}
                onPress={setSex}
              />
            ))}
          </View>

          {/* UX-005: streak philosophy note */}
          <View style={[styles.streakNote, { backgroundColor: theme.colors.bgElevated }]}>
            <Text style={[styles.streakNoteText, { color: theme.colors.textSecondary }]}>
              Even a 5-minute session counts. Rest days don't break your streak — only missing sessions in a row does.
            </Text>
          </View>
        </>
      ) : step === 2 ? (
        /* ------------------------------------------------------------------ */
        /* Step 2 — Primary discipline                                         */
        /* ------------------------------------------------------------------ */
        <>
          <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>{"What's your primary sport?"}</Text>
          <Text style={[styles.explanation, { color: theme.colors.textSecondary }]}>
            We use this to rank you against athletes in the same discipline.
          </Text>

          <View style={styles.optionGroup}>
            {DISCIPLINE_OPTIONS.map((opt) => (
              <OptionButton<Discipline>
                key={opt.value}
                label={opt.label}
                subtitle={opt.subtitle}
                value={opt.value}
                selected={discipline === opt.value}
                onPress={setDiscipline}
              />
            ))}
          </View>
        </>
      ) : step === 3 ? (
        /* ------------------------------------------------------------------ */
        /* Step 3 — App theme (E-007)                                          */
        /* ------------------------------------------------------------------ */
        <>
          <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>Choose your theme</Text>
          <Text style={[styles.explanation, { color: theme.colors.textSecondary }]}>
            Pick the look that feels right. You can change it any time in
            Settings → Appearance.
          </Text>
          {/* ThemeSelectorInline: selecting a swatch calls setTheme(), which
              persists to AsyncStorage + Supabase immediately — no extra submit
              step required. */}
          <View style={styles.themeStep}>
            <ThemeSelectorInline />
          </View>
        </>
      ) : (
        /* ------------------------------------------------------------------ */
        /* Step 4 — HealthKit permission (P0-003)                              */
        /* ------------------------------------------------------------------ */
        <>
          <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>Connect Apple Health</Text>
          <Text style={[styles.explanation, { color: theme.colors.textSecondary }]}>
            Allow Peak Fettle to read your activity and health data for smarter
            plan recommendations and automatic workout import.
          </Text>
        </>
      )}

      {/* CTA — Step 4 has its own dedicated button layout */}
      {step < 4 ? (
        <>
          <TouchableOpacity
            style={[
              styles.button,
              { backgroundColor: theme.colors.accentDefault },
              isSubmitting && styles.buttonDisabled,
            ]}
            onPress={handleNextOrSubmit}
            disabled={isSubmitting}
            accessibilityRole="button"
          >
            {isSubmitting ? (
              <ActivityIndicator color={theme.components.buttonPrimaryText} />
            ) : (
              <Text style={[styles.buttonText, { color: theme.components.buttonPrimaryText }]}>
                {step < 3 ? 'Next' : 'Next'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Skip */}
          <TouchableOpacity
            style={styles.skipButton}
            accessibilityRole="button"
            accessibilityLabel="Skip"
            onPress={() => {
              if (step === 1) {
                submit(true);  // skip all — no profile data saved
              } else if (step === 2) {
                setStep(3);    // skip discipline, continue to theme step
              } else {
                setStep(4);    // skip theme — theme already persisted if swatch was tapped
              }
            }}
            disabled={isSubmitting}
          >
            <Text style={[styles.skipText, { color: theme.colors.textTertiary }]}>
              {step === 1 ? 'Skip for now' : 'Skip this step'}
            </Text>
          </TouchableOpacity>

          {/* Privacy note — only shown on sex/discipline steps */}
          {step < 3 ? (
            <Text style={[styles.privacyNote, { color: theme.colors.borderDefault }]}>
              Your selections are used only to calculate your percentile rank.
              You can update these any time in Settings.
            </Text>
          ) : null}
        </>
      ) : (
        /* Step 4 buttons: primary Connect + ghost Skip */
        <>
          <TouchableOpacity
            style={[
              styles.button,
              { backgroundColor: theme.colors.accentDefault },
              isSubmitting && styles.buttonDisabled,
            ]}
            onPress={handleConnectHealthKit}
            disabled={isSubmitting}
            accessibilityRole="button"
          >
            {isSubmitting ? (
              <ActivityIndicator color={theme.components.buttonPrimaryText} />
            ) : (
              <Text style={[styles.buttonText, { color: theme.components.buttonPrimaryText }]}>
                Connect Apple Health
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.skipButton, styles.ghostButton, { borderColor: theme.colors.borderDefault }]}
            onPress={() => router.replace('/(tabs)/')}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel="Skip for now"
          >
            <Text style={[styles.skipText, { color: theme.colors.textTertiary }]}>
              Skip for now
            </Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
    </ScreenLayout>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24, // safe area handled by ScreenLayout; retain comfortable top breathing room
    paddingBottom: 48,
    gap: 20,
  },

  // Progress dots
  progressRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
    alignItems: 'center',
  },
  dot: {
    height: 8,
    width: 8,
    borderRadius: 4,
  },

  // Heading / explanation
  heading: {
    fontSize: fontSize.heading2,   // E-003
    fontWeight: fontWeight.bold,   // E-003
    lineHeight: 32,
  },
  explanation: {
    fontSize: fontSize.bodySm,     // E-003
    lineHeight: 20,
    marginTop: -8,
  },

  // Option list — tap-card style (P0-003)
  optionGroup: {
    gap: 10,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 12,           // radius.md
    paddingHorizontal: 16,
    paddingVertical: 14,
    // borderWidth and borderColor set inline via isSelected logic
  },
  optionLabelGroup: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    fontSize: fontSize.bodyMd,     // E-003
    // color always textPrimary — selection communicated by border + bg
  },
  optionSubtitle: {
    fontSize: fontSize.caption,    // E-003 — smaller clarifying text
    lineHeight: 16,
  },
  optionCheckmark: {
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.bold,
  },

  // Streak philosophy note (UX-005)
  streakNote: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 4,
  },
  streakNoteText: {
    fontSize: fontSize.bodySm,     // E-003
    lineHeight: 20,
  },

  // Theme step container
  themeStep: {
    marginTop: 8,
  },

  // CTA button
  button: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: fontSize.bodyMd,     // E-003
    fontWeight: fontWeight.semibold, // E-003
  },

  // Skip link / ghost button
  skipButton: {
    alignItems: 'center',
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  ghostButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
  },
  skipText: {
    fontSize: fontSize.bodySm,     // E-003
  },

  // Privacy note
  privacyNote: {
    fontSize: fontSize.caption,    // E-003
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
});
