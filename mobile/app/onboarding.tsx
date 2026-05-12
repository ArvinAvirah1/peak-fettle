/**
 * Post-registration onboarding screen — biological sex + primary discipline.
 * TICKET-038 | ROADMAP item 1.6 | 2026-05-10
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
 *   • Screen is skippable in full — Skip stores no values; ranking will show
 *     the "pending profile" state until the user fills this in from settings.
 *
 * Submits: PATCH /users/profile { sex, primary_discipline }
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
import { apiClient } from '../src/api/client';

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

const DISCIPLINE_OPTIONS: { label: string; value: Discipline }[] = [
  { label: 'Powerlifting',      value: 'powerlifting'      },
  { label: 'Weightlifting',     value: 'weightlifting'     },
  { label: 'General Strength',  value: 'general_strength'  },
  { label: 'Running',           value: 'running'           },
  { label: 'Cycling',           value: 'cycling'           },
  { label: 'Swimming',          value: 'swimming'          },
  { label: 'Other / Mixed',     value: 'other'             },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function OptionButton<T>({
  label,
  value,
  selected,
  onPress,
}: {
  label: string;
  value: T;
  selected: boolean;
  onPress: (v: T) => void;
}): React.ReactElement {
  return (
    <TouchableOpacity
      style={[styles.option, selected && styles.optionSelected]}
      onPress={() => onPress(value)}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <View style={[styles.optionDot, selected && styles.optionDotSelected]} />
      <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function OnboardingScreen(): React.ReactElement {
  const router = useRouter();

  const [step, setStep]         = useState<1 | 2>(1);
  const [sex, setSex]           = useState<SexOption>(null);
  const [discipline, setDiscipline] = useState<Discipline>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Submit whatever has been collected and navigate to the main app.
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

  const handleNextOrSubmit = useCallback(() => {
    if (step === 1) {
      setStep(2);
    } else {
      submit(false);
    }
  }, [step, submit]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      {/* Progress dots */}
      <View style={styles.progressRow}>
        <View style={[styles.dot, step === 1 && styles.dotActive]} />
        <View style={[styles.dot, step === 2 && styles.dotActive]} />
      </View>

      {step === 1 ? (
        /* ------------------------------------------------------------------ */
        /* Step 1 — Biological sex                                             */
        /* ------------------------------------------------------------------ */
        <>
          <Text style={styles.heading}>What is your biological sex?</Text>

          {/* Required inline explanation — exec spec */}
          <Text style={styles.explanation}>
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
        </>
      ) : (
        /* ------------------------------------------------------------------ */
        /* Step 2 — Primary discipline                                         */
        /* ------------------------------------------------------------------ */
        <>
          <Text style={styles.heading}>{"What's your primary sport?"}</Text>
          <Text style={styles.explanation}>
            We use this to rank you against athletes in the same discipline.
          </Text>

          <View style={styles.optionGroup}>
            {DISCIPLINE_OPTIONS.map((opt) => (
              <OptionButton<Discipline>
                key={opt.value}
                label={opt.label}
                value={opt.value}
                selected={discipline === opt.value}
                onPress={setDiscipline}
              />
            ))}
          </View>
        </>
      )}

      {/* CTA */}
      <TouchableOpacity
        style={[styles.button, isSubmitting && styles.buttonDisabled]}
        onPress={handleNextOrSubmit}
        disabled={isSubmitting}
        accessibilityRole="button"
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>
            {step === 1 ? 'Next' : 'Finish'}
          </Text>
        )}
      </TouchableOpacity>

      {/* Skip */}
      <TouchableOpacity
        style={styles.skipButton}
        onPress={() => (step === 1 ? submit(true) : submit(false))}
        disabled={isSubmitting}
        accessibilityRole="button"
      >
        <Text style={styles.skipText}>
          {step === 1 ? 'Skip for now' : 'Skip this step'}
        </Text>
      </TouchableOpacity>

      {/* Privacy note */}
      <Text style={styles.privacyNote}>
        Your selections are used only to calculate your percentile rank.
        You can update them any time in Settings.
      </Text>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 48,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 40,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#334155',
  },
  dotActive: {
    backgroundColor: '#6366f1',
    width: 24,
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 12,
    lineHeight: 34,
  },
  explanation: {
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 22,
    marginBottom: 32,
  },
  optionGroup: {
    gap: 10,
    marginBottom: 40,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  optionSelected: {
    borderColor: '#6366f1',
    backgroundColor: '#1e1b4b',
  },
  optionDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#475569',
  },
  optionDotSelected: {
    borderColor: '#6366f1',
    backgroundColor: '#6366f1',
  },
  optionLabel: {
    fontSize: 16,
    color: '#94a3b8',
    fontWeight: '500',
  },
  optionLabelSelected: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 14,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 32,
  },
  skipText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '500',
  },
  privacyNote: {
    fontSize: 12,
    color: '#334155',
    textAlign: 'center',
    lineHeight: 18,
  },
});
