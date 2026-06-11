/**
 * 1RM calculator — standalone tool (founder 2026-06-10).
 * Epley (the app's e1RM convention) + Brzycki, with a working-weight table.
 * Your tracked e1RM progression lives in Trends; this is a quick gym-floor tool.
 *
 * Route: /one-rm
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../src/theme/ThemeContext';
import { useAuth } from '../src/hooks/useAuth';
import { ScreenLayout } from '../src/components/ui';
import { fontSize, fontWeight, spacing, radius } from '../src/theme/tokens';
import { estimate1Rm, weightForReps, OneRmFormula } from '../src/lib/oneRm';

const TABLE_REPS = [1, 2, 3, 5, 8, 10, 12];

export default function OneRmScreen(): React.ReactElement {
  const { theme } = useTheme();
  const { user } = useAuth();
  const unitLabel = (user?.unit_pref ?? 'kg') === 'lbs' ? 'lb' : 'kg';

  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [formula, setFormula] = useState<OneRmFormula>('epley');

  const w = parseFloat(weight) || 0;
  const r = parseInt(reps, 10) || 0;
  const oneRm = useMemo(() => estimate1Rm(w, r, formula), [w, r, formula]);

  return (
    <ScreenLayout>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
          Enter your best recent set. Your tracked e1RM over time is in Trends.
        </Text>

        <View style={styles.inputRow}>
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.colors.textTertiary }]}>
              WEIGHT ({unitLabel.toUpperCase()})
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.colors.bgSecondary,
                  borderColor: theme.colors.borderDefault,
                  color: theme.colors.textPrimary,
                },
              ]}
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
              placeholder="—"
              placeholderTextColor={theme.colors.textTertiary}
              accessibilityLabel="Set weight"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.colors.textTertiary }]}>REPS</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.colors.bgSecondary,
                  borderColor: theme.colors.borderDefault,
                  color: theme.colors.textPrimary,
                },
              ]}
              value={reps}
              onChangeText={setReps}
              keyboardType="number-pad"
              placeholder="—"
              placeholderTextColor={theme.colors.textTertiary}
              accessibilityLabel="Reps performed"
            />
          </View>
        </View>

        <View style={styles.formulaRow}>
          {(['epley', 'brzycki'] as OneRmFormula[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[
                styles.formulaBtn,
                {
                  borderColor:
                    formula === f ? theme.colors.accentDefault : theme.colors.borderDefault,
                  backgroundColor: formula === f ? theme.colors.bgSecondary : 'transparent',
                },
              ]}
              onPress={() => setFormula(f)}
              accessibilityRole="radio"
              accessibilityState={{ checked: formula === f }}
            >
              <Text
                style={[
                  styles.formulaLabel,
                  { color: formula === f ? theme.colors.accentDefault : theme.colors.textSecondary },
                ]}
              >
                {f === 'epley' ? 'Epley (app default)' : 'Brzycki'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {oneRm > 0 ? (
          <>
            <View
              style={[
                styles.resultCard,
                { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
              ]}
            >
              <Text style={[styles.resultLabel, { color: theme.colors.textTertiary }]}>
                ESTIMATED 1RM
              </Text>
              <Text style={[styles.resultBig, { color: theme.colors.textPrimary }]}>
                {oneRm.toFixed(1)} {unitLabel}
              </Text>
            </View>

            <Text style={[styles.tableTitle, { color: theme.colors.textTertiary }]}>
              WORKING WEIGHTS
            </Text>
            {TABLE_REPS.map((tr) => (
              <View
                key={tr}
                style={[styles.tableRow, { borderBottomColor: theme.colors.borderDefault }]}
              >
                <Text style={[styles.tableReps, { color: theme.colors.textSecondary }]}>
                  {tr} rep{tr !== 1 ? 's' : ''}
                </Text>
                <Text style={[styles.tableWeight, { color: theme.colors.textPrimary }]}>
                  {weightForReps(oneRm, tr, formula).toFixed(1)} {unitLabel}
                </Text>
              </View>
            ))}
            <Text style={[styles.note, { color: theme.colors.textTertiary }]}>
              Estimates are least reliable above ~10 reps. The app logs e1RM with Epley.
            </Text>
          </>
        ) : (
          <Text style={[styles.note, { color: theme.colors.textTertiary }]}>
            Enter a weight and rep count to estimate your max.
          </Text>
        )}
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.s8 },
  sub: { fontSize: fontSize.bodySm, marginBottom: spacing.s4 },
  inputRow: { flexDirection: 'row', gap: spacing.s3, marginBottom: spacing.s3 },
  inputGroup: { flex: 1 },
  inputLabel: {
    fontSize: fontSize.micro,
    fontWeight: fontWeight.semibold,
    letterSpacing: 1,
    marginBottom: spacing.s1,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s3,
    fontSize: fontSize.bodyLg,
  },
  formulaRow: { flexDirection: 'row', gap: spacing.s2, marginBottom: spacing.s4 },
  formulaBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.s2,
    alignItems: 'center',
  },
  formulaLabel: { fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold },
  resultCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.s4,
    marginBottom: spacing.s4,
  },
  resultLabel: {
    fontSize: fontSize.micro,
    fontWeight: fontWeight.semibold,
    letterSpacing: 1.2,
    marginBottom: spacing.s1,
  },
  resultBig: { fontSize: fontSize.heading2, fontWeight: fontWeight.bold },
  tableTitle: {
    fontSize: fontSize.micro,
    fontWeight: fontWeight.semibold,
    letterSpacing: 1.2,
    marginBottom: spacing.s2,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.s2,
    borderBottomWidth: 1,
  },
  tableReps: { fontSize: fontSize.bodySm },
  tableWeight: { fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold },
  note: { fontSize: fontSize.caption, marginTop: spacing.s3 },
});
