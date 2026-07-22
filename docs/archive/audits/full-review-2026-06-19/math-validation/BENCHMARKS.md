# Strength-math ground-truth benchmarks (from reputable sources)

## 1RM standards (kg), strengthlevel.com, age ~25-30 [50th / 95th pct]
MALE  60kg: squat 95/161  bench 72/123  DL 114/187  OHP 47/84
MALE  80kg: squat 130/205 bench 98/157  DL 151/235  OHP 64/106
MALE 100kg: squat 160/243 bench 122/187 DL 184/275  OHP 79/125
FEMALE 55kg: squat 65/122 bench 43/87   DL 78/140   OHP 30/58
FEMALE 70kg: squat 78/138 bench 53/101  DL 91/157   OHP 35/65
(user-entered est. 1RMs; biased slightly high; use as trained-population ref.)

## Bodyweight scaling: 1RM rises SUB-linearly with BW (allometric ~0.67).
Strength-to-BW peaks ~60kg M / ~50kg F. A fixed kg load => LOWER percentile as BW rises.
Curve-shape refs: DOTS = 500/poly4(BW); Wilks-2 = 500/poly5(BW). App percentile-vs-BW must be CONCAVE, not linear.

## Age coefficients — McCulloch masters (expected strength vs age-40 peak = 1/coeff):
age 40 -> 1.00 | 45 -> 0.94 | 50 -> 0.87 | 55 -> 0.80 | 60 -> 0.73 | 65 -> 0.65
Peak ~25-40 (flat). No correction needed 25-39; teens (Foster) ramp 1.23@14 -> 1.00@23.

## App AGE_MULT (after LIB-02 fix): 18-24=0.98, 25-34=1.00, 35-44=0.97, 45-54=0.93, 55+=0.86
FINDING: right direction, but UNDER-corrects masters. 55+ flat 0.86 vs McCulloch ~0.65 at 65 (~30% over-credit);
45-54=0.93 is ~13% too shallow at age 54 (should approach 0.80). 18-44 buckets are fine.
