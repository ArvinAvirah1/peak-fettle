# TICKET-046 — Wilks/DOTS Formula Transparency Modal
**Owner:** dev-frontend
**Date opened:** 2026-05-22
**Phase:** 2 (Post-launch polish — first 60 days)
**Source:** DEV_NEXT_STEPS_2026-05-11.md Step 17; ROADMAP.md §2.3

---

## Goal

Anywhere Wilks or DOTS scores are displayed, add a "How is this calculated?" link that opens a modal with the formula, variable definitions, and a worked example using the user's own numbers. Satisfies ROADMAP §2.3 transparency requirement and addresses Marcus-persona feedback.

---

## Acceptance criteria

1. Every Wilks/DOTS score display in the app has a tappable "ⓘ" icon or "How is this calculated?" text link.
2. Tapping opens a bottom sheet modal with:
   - Formula name and equation (typeset clearly, not a LaTeX render — plain text is fine).
   - Variable definitions: what each term in the formula means.
   - A worked example populated with the user's own body weight and their best total (or best single lift if no total).
   - A note: "DOTS drives the percentile ranking in Peak Fettle. Your DOTS score is compared to your cohort."
3. Modal is dismissible with a swipe-down or "Got it" button.
4. Wilks formula is validated against three published reference calculators before this ticket ships (test values documented in this ticket — see Test plan).

---

## Implementation plan

### Component
Create `mobile/src/components/ScoreTransparencyModal.tsx`:
- Props: `scoreType: 'wilks' | 'dots'`, `bodyweightKg: number`, `liftKg: number`, `sex: 'MALE' | 'FEMALE' | 'UNDISCLOSED'`, `isOpen: boolean`, `onClose: () => void`
- Renders formula, definitions, worked example inline.
- Use `PFCard` for the worked-example block.

### Formula implementations (client-side, display only)
```typescript
// DOTS (2020 formula, IPF)
function computeDots(totalKg: number, bodyweightKg: number, sex: 'MALE' | 'FEMALE'): number {
  const c = sex === 'MALE'
    ? [-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093]
    : [-57.96288, 13.6175032, -0.1126655495, 0.0005158568, -0.0000010706];
  const denom = c[0] + c[1]*bodyweightKg + c[2]*bodyweightKg**2 + c[3]*bodyweightKg**3 + c[4]*bodyweightKg**4;
  return (500 / denom) * totalKg;
}

// Wilks (2020 revised formula)
function computeWilks(totalKg: number, bodyweightKg: number, sex: 'MALE' | 'FEMALE'): number {
  const c = sex === 'MALE'
    ? [47.46178854, 8.472061379, 0.07369410346, -0.001395833811, 7.07665973E-6, -1.20804336E-8]
    : [-125.4255398, 13.71219419, -0.03307250631, -0.001050400051, 9.38773881E-6, -2.3334613884E-8];
  const denom = c[0] + c[1]*bodyweightKg + c[2]*bodyweightKg**2 + c[3]*bodyweightKg**3 + c[4]*bodyweightKg**4 + c[5]*bodyweightKg**5;
  return (600 / denom) * totalKg;
}
```

### Integration points
- `mobile/app/(tabs)/rankings.tsx` — add "ⓘ" button next to DOTS/Wilks display. Wire `ScoreTransparencyModal`.
- `mobile/app/progress.tsx` — same if DOTS/Wilks appear there.

---

## Test plan

### Wilks validation (document results here before ship)
Use these reference values from Wilks2020 paper (male, raw):
| BW (kg) | Total (kg) | Expected Wilks |
|---------|------------|----------------|
| 83      | 600        | ~399.7         |
| 93      | 700        | ~436.2         |
| 74      | 500        | ~357.8         |

Verify `computeWilks()` matches to within ±0.5 on each row. Document actual output in a comment in the source file.

### DOTS validation
| BW (kg) | Total (kg) | Sex  | Expected DOTS |
|---------|------------|------|---------------|
| 83      | 600        | Male | ~385.9        |
| 93      | 700        | Male | ~421.3        |

Verify `computeDots()` matches to within ±0.5.

### UI tests
1. Tap "ⓘ" on Rankings screen — modal opens.
2. Modal shows formula with user's actual body weight in the worked example.
3. Modal closes on swipe-down and "Got it".
4. UNDISCLOSED sex: modal shows both male and female worked examples side-by-side, notes that the ranking uses a midpoint distribution.

---

## Notes
- This ticket is display-only. No server changes required.
- The Wilks score is already wired server-side (confirmed OD-2 verified in DEV_ROADMAP v17). This ticket adds the transparency UI layer.
