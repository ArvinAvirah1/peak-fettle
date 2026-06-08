# Lesson L17 — Charts & data visualization: from C++ series to the QML graph

> **Track:** 3 — QML/Qt UI · **Status:** Core visualization pipeline
> **Interactive app:** [`L17_charts_viz.html`](L17_charts_viz.html)
> **Estimated time:** ~40 min · **Prerequisite rungs:** L01 (domain model), L14 (QML intro), L15 (Qt property bindings)

## 0. Source of truth (read fresh before teaching — code drifts)
- `src/WorkoutTracker.h`, `src/WorkoutTracker.cpp` — methods `progressSeries()` (lines 147–149), `exerciseStats()` (line 152), return shape: QVariantList with `{ x, date, y, reps, weight, dayKey }` per point.
- `qml/ProgressGraphPage.qml` — the full graph UI; `seriesData` property (line 36), `yToDisplay()` unit conversion (lines 73–79), `rebuildChart()` (lines 81–130), chart binding to `progressSeries()` output (line 59), stats display (lines 305–343), metric picker (lines 267–299).
- `qml/Theme.qml` — design tokens used in the graph: `Theme.turquoise`, `Theme.navyDeep`, color palette (lines 16–30).
- `MyApp/constants/theme.ts` — React Native equivalent for context (Brand primitives, color scheme).
- Qt Graphs 2D documentation (ValueAxis, LineSeries, GraphsView) — axis labeling, label formatting pitfalls.

## 1. Learning outcomes (Bloom-tagged)
By the end, Arvin can:
- **(L2)** Explain what `progressSeries()` returns and why each point carries `{ x, y, date, reps, weight, dayKey }` fields.
- **(L3)** Apply unit conversion (`UnitPreference.toDisplay()`) to series data before plotting, and compute appropriate axis padding for a chart.
- **(L4)** Analyze the axis-labeling pitfall (using `labelFormat: "%d"` on a floating-point axis) and design a correct label strategy.
- **(L5)** Evaluate the "best per day" aggregation (from L01) in the context of chart presentation — when deload weeks, taper protocols, and back-off sets appear as scary dips, how do you present truth without discouraging the user?

## 2. Pre-lesson survey (M1) — ask LIVE
- "Confidence with charting libraries (e.g., D3, Victory, Qt Graphs): none / used one / can customize one / can build one?"
- "Have you worked with unit conversion / display formatting in charts before?"
- "Graph design priority for you: analytical accuracy, motivational narrative, or both equally?"
> Calibrate on chart familiarity and preference for "honesty vs. narrative."

## 3. Spacing carry-over (M14)
From L15 (Qt property bindings):
- "How does a signal-slot connection (or Connections target) trigger a QML function?"
- "What's the difference between a Q_PROPERTY with NOTIFY and one without?"

## 4. The difficulty ladder for THIS lesson
1. What `progressSeries()` returns — the C++ → QML data boundary.
2. Building a LineSeries: appending points, scaling axes, handling empty state.
3. Unit conversion at the QML layer (kg → lb for display).
4. Axis labeling: why `labelFormat: "%d"` is a trap; labelDecimals + integer bounds as the safe path.
5. The "best per day" aggregation and its UI consequences: deload weeks, taper, back-off sets.
6. Interactive selectors: exercise picker, metric buttons, stats display.

## 5. Concept sequence

### Concept 1: The data boundary — what `progressSeries()` returns

- **(M4) Generate first:** "You have 100 training sessions with 5–15 sets each. The app plots progress as a line. What's the minimal set of fields each point needs to carry into QML?"

- **(M7) Concrete hook:** One exercise (Bench Press), metric (E1RM), over 10 days:
  - Day 1: 3 sets → best E1RM = 95 kg → point `{ x: 1, date: 1715558400000, y: 95.0, dayKey: "2026-05-13" }`
  - Day 2: 2 sets → best E1RM = 100 kg → point `{ x: 2, date: 1715644800000, y: 100.0, dayKey: "2026-05-14" }`
  - Each point is *one training day*, not every set.

- **The idea:** `progressSeries()` bridges the C++ domain (domain, Exercise, Set, clamping, Epley math) to the QML view (a line on a chart). Each point carries:
  - `x`: integer day index (1, 2, 3, ...) — clean for integer-valued axes.
  - `y`: the metric value (E1RM, weight, volume, or strength score).
  - `date`: milliseconds since epoch — for the subtitle "Apr 12 - Apr 30".
  - `reps`, `weight`, `dayKey`: metadata for tooltips or stats displays (not all used by the line itself, but available).
  - **This shape is intentional.** The API returns a QVariantList so QML can iterate it; every point is a QVariantMap (key-value), not a C++ struct, so no custom QML type is needed.

- **Real code** (`src/WorkoutTracker.h`, lines 147–149):
  ```cpp
  // metric is "weight", "volume", "e1rm", or "strengthScore".
  // perSet=false (default) returns ONE point per training day - the BEST
  // value for that metric on that day.
  Q_INVOKABLE QVariantList progressSeries(const QString &exerciseName,
                                          const QString &metric = QStringLiteral("e1rm"),
                                          bool perSet = false) const;
  ```
  And in `src/WorkoutTracker.cpp`, the return shape (simplified):
  ```cpp
  // Each point is { x: dayIndex, date: ms-since-epoch, y: <metric>,
  //                 reps, weight, dayKey }
  QVariantMap point;
  point["x"] = dayIndex;
  point["date"] = timestamp.toMSecsSinceEpoch();
  point["y"] = e1rmValue;
  point["reps"] = set->reps();
  point["weight"] = set->weightKg();
  point["dayKey"] = set->dayKey();
  series.append(point);
  ```

- **(M6) Elaboration:** Why `x` as an integer day index instead of timestamp? Because timestamp density is irregular (user trains 3 days/week, creating gaps), which breaks linear scaling. Day index `1, 2, 3, ...` gives clean, evenly-spaced x-axis labels regardless of when the user trained.

- **(M3) Retrieval check:** "If `progressSeries()` returned every set instead of aggregating to best-per-day, how would the shape of the data change? Would day index still work?"

### Concept 2: Building the chart — appending points, scaling axes, empty state

- **(M4) Generate first:** "You have 10 data points. You want to plot them on a line. What are the three hardest things to get right?"

- **(M7) Concrete hook:** A user logs 8 Bench Press sets over 4 days. The progress graph should show a line with 4 points, axes that fit all 4 points without clipping, and the points visually spaced evenly across the x-axis.

- **The idea:** Qt Graphs' `LineSeries.append(x, y)` is the low-level primitive. Building a usable chart means:
  1. **Clear and iterate:** `lineSeries.clear()` before redraw (don't accumulate old points).
  2. **Compute bounds:** track min/max y to scale the axis, and span x from 1 to data length.
  3. **Pad the view:** add headroom so the line doesn't touch the edges (users need breathing room).
  4. **Handle empty state:** if no data, show a friendly message instead of a broken chart.

- **Real code** (`qml/ProgressGraphPage.qml`, lines 81–130, the `rebuildChart()` function):
  ```qml
  function rebuildChart() {
      lineSeries.clear();
      if (seriesData.length === 0) {
          xAxis.min = 0; xAxis.max = 1;
          yAxis.min = 0; yAxis.max = 10;
          dateRangeLabel = "";
          return;   // empty state handled by the UI layout
      }

      let minY = Number.POSITIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      let minDate = Number.POSITIVE_INFINITY;
      let maxDate = Number.NEGATIVE_INFINITY;

      // Each point is one TRAINING DAY (best-of-day aggregation).
      for (let i = 0; i < seriesData.length; ++i) {
          const p = seriesData[i];
          const yDisp = page.yToDisplay(p.y);    // unit conversion
          lineSeries.append(p.x, yDisp);          // add to chart
          if (yDisp < minY) minY = yDisp;
          if (yDisp > maxY) maxY = yDisp;
          if (p.date < minDate) minDate = p.date;
          if (p.date > maxDate) maxDate = p.date;
      }

      // Pad y-range so the polyline doesn't touch the axes.
      const yPad = Math.max((maxY - minY) * 0.15, 1.0);
      yAxis.min = Math.max(0, minY - yPad);
      yAxis.max = maxY + yPad;

      // Integer bounds + tickInterval=1 keep labels clean.
      if (seriesData.length === 1) {
          xAxis.min = 0;
          xAxis.max = 2;   // symmetric padding for single point
      } else {
          xAxis.min = 1;
          xAxis.max = seriesData.length;
      }

      // Date range subtitle: "Apr 12 - Apr 30"
      const fmt = function(ms) {
          return Qt.formatDate(new Date(ms), "MMM d");
      };
      dateRangeLabel = (minDate === maxDate) ? fmt(minDate)
                                             : fmt(minDate) + "  -  " + fmt(maxDate);
  }
  ```

- **(M6) Elaboration:** Why pad the y-axis? If the user's min is exactly 95 kg and max is 105 kg, a 0-padding chart squeezes the line to the pixel edges, making small variations invisible and the UI feel cramped. 15% padding (or 1 kg minimum) creates visual breathing room — a UX choice as much as a technical one.

- **(M3) Retrieval check:** "Why does the single-point case set `xAxis.max = 2` instead of 1? What does that achieve?"

### Concept 3: Unit conversion at the QML layer

- **The idea:** The C++ `progressSeries()` returns all y-values in kg (the canonical internal unit). QML must convert to the user's preferred unit (lb) *before* plotting, not after. This ensures axis labels and tooltips are in the user's unit, and graph magnitudes are honest.

- **(M4) Generate first:** "A user has set their preference to pounds. You plot 100 kg on the y-axis. They see '100' with a 'lb' label. What went wrong?"

- **Real code** (`qml/ProgressGraphPage.qml`, lines 73–79):
  ```qml
  function yToDisplay(y) {
      if (page.currentMetric === "strengthScore") return y;
      // weight, e1rm, and volume are all kg-derived.
      // strengthScore is unitless (0..1000 internal) — don't convert it.
      return UnitPreference.toDisplay(y);
  }
  ```
  Then in `rebuildChart()` (line 100):
  ```qml
  const yDisp = page.yToDisplay(p.y);     // convert BEFORE appending
  lineSeries.append(p.x, yDisp);
  ```

- **(M6) Elaboration:** Why is `strengthScore` exempt from conversion? Because strength score is internally computed as a 0–1000 scalar *derived* from E1RM. Converting it to lb-based units would change the score arbitrarily (the same user, same lift, different unit → different score number). It's unit-less in the sense of being a proprietary metric, so we leave it raw.

- **(M3) Retrieval check:** "If you plotted the y-value in kg but labeled the axis 'lb', what would happen to a user interpreting the chart?"

### Concept 4: Axis labeling — the `labelFormat` pitfall

- **(M7) Concrete hook:** First build of ProgressGraphPage, the developer wrote:
  ```qml
  ValueAxis {
      labelFormat: "%d"    // printf-style
      // ...
  }
  ```
  The chart showed labels like `"858993459"` instead of `"1, 2, 3, ..."`. Why?

- **The idea:** Qt Graphs' `ValueAxis` stores bounds and step as floating-point numbers (it's a general-purpose axis). Using `labelFormat: "%d"` (an integer printf format) on a floating-point axis is *undefined behavior* in C++. The result is garbage — the bits of a double are interpreted as an int, producing large random numbers.

- **The fix:** Use `labelDecimals: 0` (a native QML property) instead. This tells the axis "print this many decimal places" and lets Qt format the number safely. Combined with integer-valued bounds and `tickInterval: 1`, you get clean `"1, 2, 3, ..."` labels.

- **Real code** (`qml/ProgressGraphPage.qml`, lines 400–415):
  ```qml
  axisX: ValueAxis {
      id: xAxis
      min: 1; max: 2
      // CRITICAL: do NOT use labelFormat: "%d"
      // %d on a double is undefined behaviour
      labelDecimals: 0
      tickInterval: 1
      subTickCount: 0
  }
  axisY: ValueAxis {
      id: yAxis
      min: 0; max: 10
      labelDecimals: 1
  }
  ```

- **(M6) Elaboration:** This was a real bug encountered in the first build (2026-04-30). The fix teaches: Qt has a **detailed axis API**; know its properties (labelDecimals, tickInterval, subTickCount) before guessing with printf formats. The Qt Graphs docs (6.11) don't mention labelFormat safety on floating-point axes — this is a gap in the documentation.

- **(M3) Retrieval check:** "If you wanted x-axis labels to read `"0, 10, 20, ..."` instead of every integer, what property would you change?"

### Concept 5: "Best per day" aggregation — deload weeks, taper, and truth-telling

- **(M4) Generate first:** "A lifter does a heavy top set, then 2 back-off sets at lower weight. The app plots every set's E1RM. What does the graph look like hour-to-hour? Why might that be demoralizing?"

- **(M7) Concrete hook:** 
  - Set 1: 140 kg × 1 → E1RM = 140 kg
  - Set 2 (back-off): 120 kg × 5 → E1RM ≈ 135 kg (slightly lower, but same day)
  - Set 3 (back-off): 110 kg × 6 → E1RM ≈ 125 kg (trending down)
  - **If plotted as-is:** the graph shows a dip from 140 → 135 → 125, suggesting *weakness* on the same day. The user feels demotivated even though they hit a PR top set.

- **The idea:** `progressSeries(perSet=false)` defaults to one best point per training day. This solves the "second set looks like regression" artifact. But there's a trade-off:
  - **Aggregate (per-day best):** Motivational, narrative-friendly. "You had a great day" (best=140 kg). But power users analyzing fatigue or taper can't see the decay within the day.
  - **Per-set:** Analytically honest. "You did 140, then 135, then 125." But demoralizing for casual users who see the dip and assume they got weaker.

- **Real code** (`src/WorkoutTracker.h`, lines 143–149):
  ```cpp
  // Each point is { x: dayIndex (1, 2, 3, ...),
  //                 date: ms-since-epoch,
  //                 y: <metric value>,
  //                 reps, weight, dayKey }.
  Q_INVOKABLE QVariantList progressSeries(const QString &exerciseName,
                                          const QString &metric = QStringLiteral("e1rm"),
                                          bool perSet = false) const;
  ```
  And in the header comment (lines 127–141):
  ```cpp
  // If perSet=true the function returns every set instead, primarily for
  // debug / data export. UI should never pass true here.
  ```

- **(M6) Elaboration — the stakes:** This default was a deliberate product decision. The founder and beta tester Marcus (a competitive lifter) debated it on 2026-04-30. Marcus wanted `perSet=true` by default to analyze his taper weeks. The app chose the motivational default for the 90% casual user, with `perSet=true` available for power analysis. This is *not* a hidden compromise — it's a conscious design choice that says: "the product prioritizes narrative over raw honesty for the majority."

- **(M9 Worked → Faded → Blank):**
  - **Worked:** "A bench presser logs 5 sessions over 2 weeks. Session 3 is a deload (50% lower top set). The per-day graph shows a dip; the per-set graph shows per-set decay. How does each tell the story?"
  - **Faded:** "If a lifter asks 'why does my graph dip on deload weeks?', write a one-sentence explanation that defends the per-day default."
  - **Blank:** "Design a UI toggle to let power users switch between per-day and per-set without breaking the default."

- **(M3) Retrieval check:** "Why does `perSet=false` prevent the 'second set looks weaker' artifact? What does it mean for users trying to detect fatigue?"

### Concept 6: Metric selection and stats display

- **(M7) Concrete hook:** The user can pick E1RM, strength score, weight, or volume. Each has a different scale (E1RM: 80–300 kg; score: 0–1000; volume: 100–50000 kg-reps). The chart must re-scale the y-axis and re-label it every time the metric changes.

- **The idea:** Metric selection (lines 267–299) is a grid of buttons. Clicking one sets `page.currentMetric` and calls `refresh()`, which calls `progressSeries(currentExercise, currentMetric)` and `rebuildChart()`. The stats strip (lines 305–343) shows PR (personal record weight), E1RM, and score — derived from `exerciseStats()`.

- **Real code** (`qml/ProgressGraphPage.qml`, lines 267–299):
  ```qml
  Repeater {
      model: [
          { id: "e1rm",          label: "Est. 1RM"       },
          { id: "strengthScore", label: "Strength Score" },
          { id: "weight",        label: "Weight"         },
          { id: "volume",        label: "Volume"         }
      ]
      delegate: Button {
          Layout.fillWidth: true
          checkable: true
          checked: page.currentMetric === modelData.id
          text: modelData.label
          onClicked: {
              page.currentMetric = modelData.id;
              page.refresh();
          }
          // ...
      }
  }
  ```

- **(M6) Elaboration:** The stats strip updates independently. When you switch metrics, the chart rescales, but the stats (PR, E1RM, score) come from `exerciseStats()`, which returns all three regardless of which metric is selected. This separation — selecting a metric for the *graph* but showing *all* stats — gives the user a complete picture without cluttering the axis.

- **(M3) Retrieval check:** "When the user clicks 'Strength Score', what function is called, and in what order?"

## 6. Teach-back (M10)
"Explain to a CS-101 student in ~5 sentences: What does `progressSeries()` return, why does the QML chart convert units before plotting, and how does the 'best per day' aggregation prevent a demotivating graph dip?"

## 7. Cumulative review (M13) — rapid-fire
1. What five fields does each point in `progressSeries()` carry?
2. Why can't you use `labelFormat: "%d"` on a floating-point ValueAxis? What's the safe alternative?
3. Sketch the graph of 3 back-off sets (140→135→125 kg E1RM) on the same day. How do per-day and per-set aggregation differ?

## 8. The graded quiz (Bloom L1–L5)

| # | Bloom | Type | Prompt | Rubric | Model answer | Pts |
|---|-------|------|--------|--------|--------------|-----|
| q1 | L1 | free | What does the `x` field in a `progressSeries()` point represent? | Identifies day index; explains why integer instead of timestamp | Day index (1, 2, 3, ...) — a counter rather than timestamp, so x-axis spacing is uniform even if training sessions are irregular. | 10 |
| q2 | L2 | free | Why must unit conversion (kg → lb) happen in QML *before* appending to `lineSeries`, not after the chart renders? | Restates: conversion before affects both y-values and axis scale; after would mismatch them | If converted after rendering, the chart shows kg-scale y-values with an 'lb' label — a 100 kg point appears as "100 lb" on the axis, which is dishonest. Convert before appending so chart and axis scale together. | 12 |
| q3 | L3 | free | Compute axis bounds for a series with min y = 90 kg, max y = 110 kg. Apply 15% padding. What are yAxis.min and yAxis.max? | Applies padding formula; shows calculation | Span = 110 - 90 = 20 kg. Padding = max(20 × 0.15, 1.0) = 3 kg. Min = max(0, 90 - 3) = 87 kg; max = 110 + 3 = 113 kg. | 12 |
| q4 | L4 | free | Explain why using `labelFormat: "%d"` on a floating-point `ValueAxis` produces garbage labels like "858993459" instead of "1, 2, 3, ...". What's the safe alternative? | Surfaces: %d interprets bits of double as int (UB); safe alternative is `labelDecimals`; shows understanding of Qt Graphs axis API | `%d` is an integer printf format applied to a floating-point axis — the double's bits are reinterpreted as an int, which is undefined behavior and produces garbage. Use `labelDecimals: 0` with integer bounds and `tickInterval: 1` instead. | 18 |
| q5 | L5 | free | A power user says: "I want every set plotted so I can see my fatigue decay within training sessions. But the app defaults to best-per-day, which hides that." Defend or refute the default. What's the failure mode each choice prevents? | Takes position; names both artifacts (back-off dip vs. fatigue blindness); identifies the user segments each serves; proposes reconciliation | Default prevents demotivation from back-off dips on the same day, serving the 90% casual user. Power users like this one need per-set visibility for fatigue analysis. Better: keep best-per-day default but expose a toggle or per-set mode so both audiences can choose. The current choice optimizes for narrative over analytical honesty — defensible but costly for power users. | 22 |
| q6 | L5 | free | A user on a deload week (planned 50% intensity drop) sees the graph dip sharply. They text: "Why am I getting weaker?" Design a tooltip or annotation that explains deload weeks without hiding the dip. | Proposes honest UI; educates user on purpose of deload; preserves data integrity; integrates with chart | On deload days, show a small label or icon ("Deload week") and a tooltip: "Intentional reduced intensity to recover. Progress resumes next week." This educates the user and prevents misinterpretation while keeping the dip visible — truth + narrative together, not a choice between them. | 22 |

## 9. Custom interactive widget
**Live chart simulator** — sliders for:
- Number of training days (1–20)
- Metric (e1rm / volume / score)
- Per-set toggle

Renders a LineSeries inline and shows how axis bounds, labels, and points change. Includes a pre-loaded "deload week" scenario (day 7 has a 50% dip) so Arvin can see the per-day vs. per-set difference in real-time.

## 10. End-of-session updates (agent)
- Grade quiz via the app's "Grade with Claude."
- Update `teacher_skill.md` PART 2: chart familiarity before/after; did the axis-labeling bug story land? Which Bloom levels held up? Did the deload-week scenario feel realistic?
- Offer to schedule L18 (design system / tokens) a few days out. Carry-over questions: "What's a design token?" and "Why migrate 470+ hex values?"
