# T1 — Strength-percentile math validation: sex & bodyweight at prime age

**Scope:** `mobile/src/lib/strengthModelV3.ts` — per-lift ranked percentile, Lens-1
experience/age percentile, and the DOTS overall composite. Validated against
strengthlevel.com standards (age ~25-30). Harness = faithful JS port of the pure
functions; **all 8 per-lift + both DOTS PROVENANCE constants reproduced to 5 d.p.**
(fit, σ, R², median all OK), so the port is high-fidelity and the findings are the
model's behavior, not a porting artifact.

## Ported formula (one-liner)
Per-lift percentile = `100·Φ( (ln(e1RM/ageMult) − [μ + α·ln(BW/BW_ref)]) / σ )`,
where (μ,σ) come from a least-squares lognormal fit of the **6-anchor `STANDARDS_XBW`
× ref-BW table** (BW_ref M=75/F=60), α≈0.64–0.67 per lift, ageMult=1.0 at 25-34.
Overall = same Φ on `ln(DOTS_total)` vs DOTS (μ,σ). Age 28 → band 25-34 → mult 1.0;
with reps=1 the entered load IS the 1RM, and Lens-1 with null experience == the pure
ranked function (confirmed identical).

## CHECK 1 — calibration (50th std → ~50th? 95th std → ~90-95th?): **SKEWED**

The median anchor is the problem. Feeding the real-world **50th-percentile** lift
returns 65th–92nd percentile, not ~50th. The 95th anchor is also inflated (→ 96.8–99.6).

| persona | 50th-std → app pct (err) worst lifts | 95th-std → app pct |
|---|---|---|
| M 60  | squat 64.8 (+14.8), **bench 80.2 (+30.2)**, DL 66.2 | 96.8 / 99.1 / 97.9 |
| M 80  | squat 76.3 (+26.3), **bench 88.4 (+38.4)**, DL 76.0 | 97.6 / 99.4 / 98.4 |
| M 100 | squat 81.0 (+31.0), **bench 92.1 (+42.1)**, DL 80.5 | 97.9 / 99.6 / 98.5 |
| F 55  | squat 79.1, bench 79.7, DL 77.7 (all ≈ +28-30) | 99.5 / 99.5 / 99.4 |
| F 70  | squat 80.7, **bench 83.3 (+33.3)**, DL 77.0 | 99.3 / 99.5 / 99.1 |

Overall composite at the 50th-pct SBD total: 71st–87th (should be ~50th); at the
95th total: 98.2–99.5 (should be ~92.5).

**Worst-case error: +42.1 percentile points** (M 100kg bench, 50th-pct lift 122kg → 92.1th).

**Root cause:** the model's medians sit well *below* strengthlevel's 50th-pct loads —
e.g. squat median 1.284×BW vs benchmark ratios 1.58–1.6×BW; bench median 0.82×BW vs
1.2×BW; the `STANDARDS_XBW` "intermediate"(0.60q) anchors are far lighter than the
external 50th, so any genuinely-50th lifter lands in the model's right tail. Female
medians are even softer (squat 0.861×BW) → women are inflated ~+28-33 across the board.
Skew is **systematic** (all 30 cells positive), **worse for the press lift** (bench),
and **worse as BW rises** (the convexity in Check 2).

## CHECK 2 — BW-scaling shape (fixed 140kg squat, M, BW 60→100): **monotone but WRONG CURVATURE**

Percentile falls correctly as BW rises (92.78 → 87.94 → 82.19 → 75.88 → 69.35), so the
*direction* and the lighter-ranks-higher property hold. BUT the curve is **convex
(super-linear), not concave** — per-10kg drop *grows*: |Δ| = 4.84, 5.75, 6.30, 6.53.
A sub-linear strength-vs-BW relationship requires the percentile penalty to *flatten*
at high BW; here it *steepens*. Same convex defect in the overall composite
(|Δ| 5.00, 5.37, 5.06, 4.45 — only flattens at the very top because DOTS poly rolls over).
This is structural: percentile = Φ(linear-in-ln(BW)/σ), and Φ of a falling linear
argument is convex on its lower half — the model **cannot** produce the concave shape
the spec asks for. Net effect: heavy lifters are over-penalized at the top of the BW
range relative to a true allometric curve (compounding Check-1's over-credit at the median).

## Verdict
- **Calibration (Check 1): SKEWED** — 50th-pct standards map to ~65th-92nd; worst error **+42 pts**.
- **BW shape (Check 2): direction REASONABLE, curvature SKEWED** — monotone-falling and
  lighter-ranks-higher both hold, but the curve is convex/super-linear where it must be
  concave/sub-linear.
