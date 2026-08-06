# Exercise Qualifier Research Brief — Peak Fettle (v1)

You are researching **exercise qualifiers**: the attachable, per-set choices that change how a
lift is executed (grip width, grip orientation, cable attachment, pulley height, pulley ratio,
stance, bench angle, bar type, body position, load mode, ROM, unilateral/bilateral).

Your output feeds a product decision document the founder signs off on, and then a database
migration. **Accuracy and honest confidence matter far more than completeness.** A `"confidence":
"low"` with a real source beats a confident guess.

---

## CLOSED AXIS VOCABULARY — do not invent new axis ids

Every qualifier you emit MUST use one of these 12 axis ids. If a real-world variation does not
fit any axis, put it in `unmapped_notes` — do NOT create a new axis.

| axis_id | meaning | canonical value ids |
|---|---|---|
| `grip_width` | hand spacing on a bar/handle | `close`, `shoulder`, `medium`, `wide`, `extra_wide` |
| `grip_orientation` | palm/forearm rotation | `pronated`, `supinated`, `neutral`, `mixed`, `thumbless`, `hook` |
| `attachment` | what is clipped to the cable/machine | `straight_bar`, `ez_bar`, `rope`, `single_d`, `dual_d`, `v_bar`, `lat_bar_wide`, `mag_grip`, `ankle_strap`, `head_harness`, `tricep_v_strap`, `stirrup`, `band`, `sled_strap` |
| `pulley_height` | vertical origin of the cable | `floor`, `knee`, `hip`, `mid_chest`, `shoulder`, `high`, `overhead` |
| `pulley_ratio` | mechanical advantage of the stack | `1_1`, `2_1`, `1_2`, `unknown` |
| `stance` | foot placement / platform position | `narrow`, `shoulder`, `wide`, `sumo`, `staggered`, `split`, `feet_together`, `high_platform`, `low_platform` |
| `bench_angle` | torso inclination | `decline`, `flat`, `incline_15`, `incline_30`, `incline_45`, `incline_60`, `upright_90` |
| `bar_type` | implement | `straight_barbell`, `ez_bar`, `trap_bar`, `safety_squat_bar`, `swiss_bar`, `smith`, `dumbbell`, `kettlebell`, `machine` |
| `body_position` | global posture | `standing`, `seated`, `lying_supine`, `lying_prone`, `kneeling`, `half_kneeling`, `bent_over`, `chest_supported`, `incline_supported` |
| `load_mode` | how resistance is applied | `straight_weight`, `banded`, `chains`, `assisted`, `weighted_vest`, `bodyweight` |
| `rom` | deliberate range restriction | `full`, `partial_top`, `partial_bottom`, `lengthened_partial`, `paused`, `deficit`, `block` |
| `laterality` | limbs worked at once | `bilateral`, `unilateral`, `alternating`, `contralateral`, `ipsilateral` |

Only emit an axis for an exercise if a **meaningful, commonly-practiced choice** exists there.
Cable Lateral Raise genuinely varies on `pulley_height`, `attachment`, `laterality`. A Treadmill
Run does not vary on any of these — emit `"axes": []`.

---

## STRENGTH COEFFICIENT (the hard part — founder's key constraint)

The founder's rule: **qualifiers split PR/history tracking, but must never penalize a user's
percentile.** Someone who only ever close-grip benches must not rank as a weak bencher.

So for every qualifier VALUE that materially changes the load a trainee can move, estimate a
`strength_coefficient`: the typical ratio of that variant's 1RM to the **base/reference variant's**
1RM, for the same trainee.

- Close-Grip Bench Press vs competition-style Bench Press → roughly `0.88` (report your researched
  figure, not this example).
- Wide-grip vs medium-grip pulldown → report what the literature/lifting community supports.
- If a variant does not meaningfully change achievable load (e.g. rope vs straight-bar pushdown at
  the same weight), use `1.0` with a note.

Fields:
- `ratio` — number, or `null` if you genuinely cannot support one.
- `confidence` — `high` (published EMG/1RM comparison studies or large-sample lifting datasets),
  `medium` (consistent coaching consensus across multiple reputable sources),
  `low` (scattered anecdote / single source), `none` (no defensible figure).
- `percentile_treatment` — this is what the app does with it:
  - `normalize` — divide the logged load by `ratio` before feeding the percentile model. Use when
    confidence is `high` or `medium`.
  - `exclude` — track the PR, but never feed these sets into the percentile calculation. Use when
    confidence is `low`/`none`, or when the variant is so different it isn't the same lift.
  - `passthrough` — feed unchanged (ratio 1.0).
- `sources` — array of URLs you actually retrieved. Do not fabricate URLs. An empty array with
  `confidence: "none"` is an acceptable, honest answer.

**Be conservative.** `exclude` is the safe default; it protects the user from an unfair percentile.
Only claim `normalize` when you have real evidence.

---

## VARIANT COLLAPSE

The library contains rows that are really a base lift plus a qualifier, e.g.
`Close-Grip Lat Pulldown` = `Lat Pulldown` + `grip_width: close`.

For each exercise, decide:
- `collapse_into` — the base exercise name it should merge into, or `null` if it IS a base.
- `collapse_qualifiers` — the axis/value pairs that reconstruct it, e.g. `{"grip_width":"close"}`.
- Old names must survive as **search aliases**, so also emit `aliases` (common gym names, plural
  forms, abbreviations users might search: "lat pull down", "pulldowns", "CGBP").

Do NOT collapse when the variant is a genuinely distinct motor pattern (Front Squat is not Back
Squat + a qualifier — it's its own lift). Use judgment and explain in `collapse_rationale`.

---

## CUSTOM OPTIONS

For each axis you emit, set `allows_custom: true` if users plausibly need options beyond the
enumerated list (attachments especially — the founder's example is tricep pushdown bars). Set
`false` where the list is genuinely exhaustive (`pulley_ratio` is).

Also emit `custom_hint`: a short placeholder string the app shows in the "add your own" field,
e.g. `"e.g. angled bar, revolving straight bar"`.

---

## OUTPUT FORMAT — strict

Return **only** a JSON array, one object per exercise assigned to you, no prose before or after:

```json
[
  {
    "name": "Close-Grip Lat Pulldown",
    "category": "lift",
    "collapse_into": "Lat Pulldown",
    "collapse_qualifiers": { "grip_width": "close" },
    "collapse_rationale": "Same machine, same motor pattern; grip spacing is the only difference.",
    "aliases": ["close grip pulldown", "narrow grip lat pulldown"],
    "axes": [
      {
        "axis_id": "grip_width",
        "applicable_values": ["close", "shoulder", "medium", "wide"],
        "default_value": "medium",
        "allows_custom": false,
        "custom_hint": null,
        "note": "Wide grip biases lats; close grip allows more elbow flexion and biceps contribution."
      },
      {
        "axis_id": "attachment",
        "applicable_values": ["lat_bar_wide", "straight_bar", "v_bar", "mag_grip", "single_d", "rope"],
        "default_value": "lat_bar_wide",
        "allows_custom": true,
        "custom_hint": "e.g. angled lat bar, revolving bar",
        "note": "..."
      }
    ],
    "strength_coefficients": [
      {
        "axis_id": "grip_width",
        "value_id": "close",
        "reference_value_id": "medium",
        "ratio": 1.03,
        "confidence": "low",
        "percentile_treatment": "exclude",
        "rationale": "Reported differences are small and inconsistent across sources.",
        "sources": ["https://..."]
      }
    ],
    "unmapped_notes": "Some lifters vary seat-pad tightness; no axis covers this.",
    "confidence_overall": "medium"
  }
]
```

## RULES

1. **Research before you answer.** Load `WebSearch` and `WebFetch` via `ToolSearch`
   (`select:WebSearch,WebFetch`) and actually search. Reputable sources: peer-reviewed strength
   research, Stronger By Science, Barbell Medicine, exrx.net, NSCA, established coaching sites.
   Avoid content-farm listicles and AI-generated slop.
2. **Never fabricate a URL or a study.** If you did not fetch it, do not cite it.
3. Every exercise assigned to you appears exactly once in your output, spelled **exactly** as given.
4. Cardio and mobility entries usually have `"axes": []` — that is a correct answer, not a failure.
   Do not pad them with irrelevant axes.
5. Your entire final message is the JSON array. It is parsed by a script.
