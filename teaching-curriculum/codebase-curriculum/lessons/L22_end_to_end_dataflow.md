# Lesson L22 — End-to-end: one set's journey through the whole stack

> **Track:** 2 — Desktop frontend (synthesis rung) · **Status:** ⭐ Reference lesson (fully worked)  
> **Interactive app:** [`L22_end_to_end_dataflow.html`](L22_end_to_end_dataflow.html)  
> **Estimated time:** ~50 min · **Prerequisite rungs:** L01–L21 (full domain + QML + C++↔QML bridge)

## 0. Source of truth (read fresh before teaching — code drifts)

This is a *synthesis* lesson. Sources span the entire codebase:

- **UI layer:** `qml/SetTrackerPage.qml` (user input), `qml/HomePage.qml`, `qml/ProgressGraphPage.qml` (display).
- **C++ desktop layer:** `src/WorkoutTracker.cpp`, `src/Exercise.cpp`, `src/Set.cpp` (in-memory model).
- **C++ backend bridge:** `src/StrengthCurve.h` / `StrengthCurve.cpp` (percentile computation), `src/UserProfile.h` (user data).
- **Data flow:** logSet → Exercise.addSet → emit dataChanged → QML refresh → recentSets() → ListView redraw. Then, separately, progressSeries() → ProgressGraphPage chart. Then percentileForExercise() → PercentilesPage rank.

## 1. Learning outcomes (Bloom-tagged)

By the end, Arvin can:

- **(L1)** Map the major nodes (QML input, C++ model, in-memory store, UI redraw) and the signal/callback paths between them.
- **(L2)** Describe the path of a single bench-press set from "user types '80 kg' and taps Done" to "set appears in the recent list."
- **(L3)** Trace a bench-press set end-to-end: logSet → Exercise.addSet → Set created → dataChanged → HomePage refresh → recentSets → ListView delegate binding → "Bench × 5" rendered.
- **(L4)** Analyze the data-loss risks in the path: where could the set be silently dropped, corrupted, or rendered incorrectly?
- **(L5)** Identify the single highest-risk hop for data integrity and propose the one guardrail you'd add first to defend it. Evaluate trade-offs (cost, complexity, false positives).

## 2. Pre-lesson survey (M1) — ask LIVE via AskUserQuestion

- "Ever traced a bug through a full-stack app (web, mobile, backend)?"
- "Comfortable with the domain model, QML bindings, and C++↔QML bridge from L01–L21?"
- "Today: trace one happy path, or also explore error cases and rollback?"

> Calibrate: this is the capstone. Expect Arvin to be comfortable with all prior concepts. Focus on how they fit together and on the *risks* at each hop.

## 3. Spacing carry-over (M14)

Prior lesson (L21) closes with: "If progressSeries() had 10,000 points, would the DTO overhead matter?" → This lesson explores real data volumes and latency concerns.

## 4. The difficulty ladder for THIS lesson (M2)

1. The happy path: logSet → Exercise.addSet → Set created → signal → refresh → redraw.
2. Data shape transformations: C++ QVariantList → QML JavaScript array → delegate binding.
3. Side effects: emit dataChanged vs. emit setLogged; when each is appropriate.
4. Data-loss risk inventory: where sets can be dropped (validation, capacity, scope).
5. Ranking-pipeline integration: logSet → progressSeries → ProgressGraphPage; percentileForExercise.
6. Latency and batching: why percentile computation is batch-weekly, not real-time.
7. The highest-risk hop: identifying the bottleneck and proposing a guardrail.

## 5. Concept sequence

### Concept 1: The happy path — input to display in 5 hops

- **(M4) Generate first:** "User logs a bench press (80 kg × 5). You're watching Wireshark / a debugger. Draw 5 boxes showing the path from the TextField to the ListView updating."

- **The idea:** One set's journey has 5 major hops:
  1. **QML input** (SetTrackerPage) — user taps "Done"; onClick fires.
  2. **C++ model** (WorkoutTracker.logSet) — creates Set, adds to Exercise, emits signal.
  3. **C++ signal** (dataChanged) — propagates to QML.
  4. **QML handler** (Connections, refresh) — re-pulls recentSets(); updates `recent` property.
  5. **QML binding** (ListView delegate) — text binding re-evaluates; "Bench" appears in the list.

- **Real code — hop 1** (`qml/SetTrackerPage.qml`, pseudocode):
  ```qml
  ToolButton {
      text: "Done"
      onClicked: {
          WorkoutTracker.logSet(
              exName.text,      // "Bench"
              weight.text,      // "80"
              reps.text,        // "5"
              rir.text          // "-1"
          );
      }
  }
  ```

- **Real code — hop 2** (`src/WorkoutTracker.cpp`, lines 65–97):
  ```cpp
  qint64 WorkoutTracker::logSet(const QString &exerciseName,
                                double weightKg,
                                int reps,
                                int rir)
  {
      return logSetAt(exerciseName, weightKg, reps, rir,
                      QDateTime::currentDateTime());
  }
  
  qint64 WorkoutTracker::logSetAt(const QString &exerciseName,
                                  double weightKg,
                                  int reps,
                                  int rir,
                                  const QDateTime &timestamp)
  {
      if (name.isEmpty() || name.length() > 100 || reps <= 0) return 0;
      
      Exercise *ex = findOrCreate(exerciseName);
      auto *s = new Set(exerciseName, weightKg, reps, rir, timestamp);
      ex->addSet(s);
      
      emit setLogged(exerciseName);
      emit dataChanged();
      return s->id();
  }
  ```
  
  Key points:
  - Validation: name length (100 char cap), reps > 0. If rejected, returns 0.
  - findOrCreate: O(1) hash lookup; creates Exercise if new.
  - ex->addSet: transfers ownership (Set::setParent(this)).
  - **Two signals:** setLogged (specific), dataChanged (generic).

- **Real code — hop 3** (signal emission):
  The emit in hop 2 fires the `dataChanged()` signal.

- **Real code — hop 4** (`qml/SetTrackerPage.qml`, lines 155–159):
  ```qml
  Connections {
      target: WorkoutTracker
      function onDataChanged() { page.refresh(); }
  }
  
  function refresh() {
      recent = WorkoutTracker.recentSets(50);
      routineRows = WorkoutTracker.routineList();
      // ... split into userRoutines / templateRows
  }
  ```
  
  The handler calls refresh(), which re-queries recentSets(). This returns a fresh QVariantList (newest first).

- **Real code — hop 5** (`qml/SetTrackerPage.qml`, lines ~650, delegate):
  ```qml
  Repeater {
      model: filteredRecent()   // filtered view of `recent`
      
      delegate: Rectangle {
          RowLayout {
              Text { text: modelData.exercise }
              Text { text: modelData.reps + "×" }
              WeightLabel { weightKg: modelData.weight }
          }
      }
  }
  ```
  
  When `recent` updates (hop 4), the Repeater re-evaluates its model, and QML re-creates/updates delegates. The binding on `text: modelData.exercise` fires, and the new set's exercise name appears on screen.

- **(M6) Elaboration — latency:** Each hop has a cost:
  1. QML onclick: ~1 ms (event dispatch).
  2. logSet (C++): ~0.1 ms (hash insert, new Set, no disk I/O).
  3. Signal propagation: ~0.1 ms (registered connections).
  4. QML handler + refresh: ~1–5 ms (re-query, re-sort 50 sets).
  5. QML binding + redraw: ~16 ms (vsync, render frame).
  
  Total: ~20–30 ms. The user taps "Done," the set appears in the list within one frame. Fast enough for a native-feeling app.

- **(M3) Retrieval check:** "In hop 4, refresh() calls recentSets(50). What if there are 500 sets logged? Does recentSets() re-sort them all?"

### Concept 2: Data shape transformations — C++ types → JavaScript

- **The idea:** As the set crosses the boundary, its representation changes:
  - **C++ side** (hop 2): `Set` object with typed members (`m_weightKg: double`, `m_reps: quint16`).
  - **Bridge** (recentSets): `QVariantMap` — untyped dictionary (`{"weight": 80.0, "reps": 5}`).
  - **QML side** (hop 4–5): JavaScript object — duck-typed properties (`modelData.weight`, `modelData.reps`).

- **Real code — the transformation** (`src/WorkoutTracker.cpp`, lines 230–260):
  ```cpp
  QVariantList WorkoutTracker::recentSets(int limit) const {
      QVector<const Set *> all;
      // ... build and sort
      
      QVariantList result;
      for (const Set *s : all) {
          QVariantMap row;
          row["id"]        = s->id();
          row["exercise"]  = s->exerciseName();
          row["weight"]    = s->weightKg();          // double → QVariant
          row["reps"]      = s->reps();              // quint16 → QVariant
          row["rir"]       = s->rir();               // qint8 → QVariant
          row["timestamp"] = s->timestamp();         // QDateTime → QVariant
          row["dayKey"]    = s->dayKey();
          row["volume"]    = s->volume();            // computed
          result.append(row);
      }
      return result;  // QVariantList → JavaScript array
  }
  ```

- **(M5) Generate second:** "The C++ `Set` has a reps field of type `quint16` (16-bit unsigned). JavaScript numbers are 64-bit floats. When the set crosses the bridge, does reps=5 lose precision?"
  - Answer seed: No. Integers up to 2^53 are exactly representable in float64. reps fits easily. But if you had a 128-bit integer, precision would be lost.

- **(M4) Generate first:** "In the QML delegate, `WeightLabel { weightKg: modelData.weight }` receives `weight: 80.0` (from the map). Is this still in kg, or has the unit changed?"
  - Answer seed: Still kg—the map stores the canonical unit. The WeightLabel component converts to the user's display unit (lbs, if they chose it) via UnitPreference.format().

- **(M3) Retrieval check:** "Why does recentSets() include `dayKey` in the map if it's derived from the timestamp?"

### Concept 3: Side effects — signals vs. handlers; when to use each

- **The idea:** The C++ side emits two signals:
  - `setLogged(exerciseName)` — specific: "a set for Bench was logged."
  - `dataChanged()` — generic: "the entire model may have changed."
  
  QML handlers choose which to listen to, based on what they need.

- **Real code** (`src/WorkoutTracker.cpp`, lines 94–95):
  ```cpp
  emit setLogged(exerciseName);  // Fine-grained: QML can optimize
  emit dataChanged();            // Coarse-grained: safe default
  ```

- **Real code — HomePage uses dataChanged** (`qml/HomePage.qml`, lines 156–159):
  ```qml
  Connections {
      target: WorkoutTracker
      function onDataChanged() { page.refresh(); }
  }
  ```
  
  HomePage's refresh() recomputes streak, week stats, and recent days. It's expensive (sorts 2000 sets). But it fires only when the model changes, not on every frame. Trade-off: correctness over latency. HomePage updates a few times per session; worth the CPU cost.

- **Alternative — SetTrackerPage could use setLogged** (pseudocode):
  ```qml
  Connections {
      target: WorkoutTracker
      function onSetLogged(name) {
          // Only refresh the recent-sets list, not routines
          recent = WorkoutTracker.recentSets(50);
      }
  }
  ```
  
  This is faster (doesn't recompute routineRows) but more fragile (if Exercise.deleteSet is called, this handler doesn't see it). Peak Fettle currently uses dataChanged for simplicity.

- **(M4) Generate first:** "If setLogged fires for every new set and you log 100 sets in a speed test, how many times does HomePage.refresh() run?"
  - Answer seed: 100 times (once per signal). Each re-evaluates the streak calculation on 2000 sets. This is the "hammer away" case. A power user would see slowdown. In practice, manual logging is <1 set per second, so 100 sets = 100 seconds of tapping. Acceptable for now; would optimize if batching (add 10 sets at once) became a feature.

- **(M3) Retrieval check:** "Why not just make HomePage listen to setLogged instead of dataChanged? What would break?"

### Concept 4: Risk inventory — where data can be lost, corrupted, or rendered wrong

- **(M4) Generate first:** "I want to identify the riskiest hop in the chain. Draw a fault tree: what could go wrong at each step, and how likely is each failure?"

- **Hop 1 (QML input):**
  - Risk: user types nonsense (weight = "abc", reps = "-5").
  - Current guard: textual validation on the TextFields (ranges, format).
  - Remaining risk: user bypasses validation (debugger, network API).
  - Severity: medium (bad data reaches C++).

- **Hop 2 (C++ logSet):**
  - Risk: validation passed junk (reps = -5); Set created with bad state.
  - Current guard: C++ checks `reps > 0` (line 84); clamping in setters.
  - Risk: multiple validations happening (QML + C++); hard to sync.
  - Severity: low (validation is redundant, at least one layer always works).

- **Hop 2b (Exercise.addSet):**
  - Risk: Exercise pointer is nullptr (findOrCreate failed).
  - Current guard: findOrCreate always returns a valid Exercise (creates on-demand).
  - Risk: memory exhaustion (can't allocate new Exercise). Unlikely in desktop app.
  - Severity: very low.

- **Hop 2c (Set ownership):**
  - Risk: Set is created with `new`, attached to Exercise via `setParent()`. If Exercise is deleted before the Set is attached, memory leak.
  - Current guard: findOrCreate always succeeds; setParent called immediately (lines 91–92).
  - Risk: exception between new and setParent? (Unlikely in C++; no exceptions here.)
  - Severity: very low.

- **Hop 3 (Signal propagation):**
  - Risk: signal emission fails (no connected handlers).
  - Current guard: none; but this is safe (emitting to no listeners is a no-op).
  - Risk: QML handler not registered (e.g., page not fully loaded).
  - Severity: low (sets are still stored; next page refresh will fetch them).

- **Hop 4 (QML refresh + recentSets):**
  - Risk: recentSets() is called while logSet() is still running (race condition). This is impossible in the current single-threaded QML/Qt model.
  - Risk: recentSets() crashes (null dereference in Set members). Shouldn't happen if Exercise.addSet succeeded.
  - Risk: sort order is wrong; recentSets returns them out of order. Bug in the sort comparator.
  - Severity: low (sorts are deterministic; if order is wrong, it's a code bug, not a runtime failure).

- **Hop 5 (QML binding + delegate):**
  - Risk: modelData key is missing (e.g., a typo: `modelData.weightt`). QML returns undefined; text shows blank.
  - Current guard: keys are hardcoded in the map builder; typos are caught at build time (unlikely to change).
  - Risk: data type mismatch (weight is a string, not a number). QML coerces it to string for display; works but is ugly.
  - Severity: low (UI looks weird, but doesn't crash; data is safe in C++).

- **(M6) Elaboration — the risk scale:**
  - **Critical:** data loss (set is created but never stored or queried).
  - **High:** corruption (set is stored but with wrong values; e.g., weight=0, reps=-5).
  - **Medium:** transient (set is temporarily invisible but can be retrieved; e.g., refresh didn't run).
  - **Low:** cosmetic (set is stored and queryable but renders wrong; e.g., blank label).

- **(M5) Generate second:** "The C++ data is all in-memory (`m_exercises: QHash`). If the user force-quits the app, all sets are lost. Is this a risk?"
  - Answer seed: Yes—**critical**. But it's outside the scope of "one set's happy path." Persistence (SQLite, JSON file) is a separate subsystem. This lesson assumes the app is running and doesn't crash.

### Concept 5: The highest-risk hop and the guardrail

- **The idea:** Of all the hops, one stands out as the riskiest because it's the least-protected and has the highest impact. Your job is to identify it and propose one guardrail.

- **(M4) Generate first:** "Hop 2: logSet in C++. What's the single line of code that, if buggy, would cause the most damage?"
  - Candidates:
    - Line 80: `const QString name = exerciseName.trimmed();` — if this returns empty string for a valid name (e.g., bug in trimmed()), the set is rejected silently.
    - Line 84: `if (name.isEmpty() || name.length() > 100 || reps <= 0) return 0;` — if the check is wrong (e.g., `reps < 0` instead of `reps <= 0`), a 0-rep set sneaks through. Invalid in the domain.
    - Line 91: `auto *s = new Set(...);` — if Set's constructor has a silent bug (e.g., weightKg stored as 0 instead of the passed value), all new sets are corrupted. Hard to debug because the bug is in Set's code, not WorkoutTracker's.
  
  **Winner:** Line 91, Set constructor. Why? Because if Set's fields are initialized wrong, *every* set logged is silently corrupted. The C++ validation passes (reps > 0), the signal fires (looks like success), the QML refresh runs (looks like success), but the set's weight is 0 forever. Users don't realize until they graph it.

- **The guardrail:** Add an invariant check after Set creation:
  ```cpp
  auto *s = new Set(exerciseName, weightKg, reps, rir, ts);
  Q_ASSERT(s->weightKg() == weightKg);  // Catch silent constructor bugs
  Q_ASSERT(s->reps() == reps);
  ex->addSet(s);
  ```
  
  **Cost:** 2 extra method calls per logSet (negligible ~0.01 ms). **Benefit:** catches Set constructor corruption on the spot. **Drawback:** assertions are disabled in Release builds (by default); you'd want them always-on for this critical path.
  
  **Better guardrail:** Convert to explicit validation:
  ```cpp
  auto *s = new Set(exerciseName, weightKg, reps, rir, ts);
  if (s->weightKg() != weightKg || s->reps() != reps) {
      s->deleteLater();
      qWarning() << "Set constructor validation failed";
      return 0;  // Reject the set
  }
  ex->addSet(s);
  ```

- **(M5) Generate second:** "What's the cost of this guardrail? Does it add latency, memory, or complexity?"
  - Answer seed: **Latency:** 2 extra method calls (~0.01 ms, negligible). **Memory:** 0 (no new allocations). **Complexity:** 2 extra lines, instantly clear what they do. **False positives:** low (only fires if Set's constructor is genuinely buggy). **Maintenance:** if Set's API changes (e.g., you add a precision field), the check breaks. Worth the cost? Yes, because Set is in the critical path and its bugs would be silent otherwise.

- **(M4) Generate first — alternative guardrails:**
  1. **Fuzzing:** test logSet with random valid inputs (0–65535 reps, -1000–1000 kg) and verify recentSets returns them unchanged.
  2. **Logging:** every logSet call logs "Logged setId={id}, exercise={name}, weight={weight}, reps={reps}" at DEBUG level. Post-mortem, you can grep the log to check for corruption.
  3. **Unit tests:** `QTEST(logSet(Bench, 80, 5) → recentSets finds it with correct weight)`. Catches Set constructor bugs early.
  4. **Assertion:** the proposal above.

- **Best practice:** Use all four. In order of payoff: unit tests (catches bugs before code review), assertion (catches bugs at runtime), logging (post-mortem), fuzzing (catches weird edge cases).

### Concept 6: Latency, batching, and the percentile pipeline

- **The idea:** A single set's path from QML to HomePage is ~20 ms. But percentile computation is expensive: it queries StrengthCurve (database lookup), fetches the user's profile, and computes a rank. If done for every set, this would lag the UI. Solution: batch percentile computation weekly (background task), not real-time.

- **Real code** (`src/WorkoutTracker.cpp`, lines 154–175):
  ```cpp
  Q_INVOKABLE QVariantMap percentileForExercise(const QString &exerciseName) const;
  ```
  
  This method is called from PercentilesPage when the user navigates to the rankings. The comment in WorkoutTracker.h notes:
  ```
  // Compute the user's strength percentile for a single exercise.
  // Takes the exercise's current Epley E1RM as the lift weight to score.
  ```
  
  If this was called for every new set (in the dataChanged handler), PercentilesPage would re-compute all rankings, which calls StrengthCurve::lookupLiftVector (a database call). At 10 calls/second (in a speed test), that's 10 DB calls/second—too slow.

- **(M4) Generate first:** "You log 5 sets. For each one, should you re-compute percentiles, or wait until the user opens PercentilesPage?"
  - Answer seed: **Wait until the user opens PercentilesPage.** Why? Percentiles don't change between sets (the cohort stays the same unless other users log sets, which is outside your app's scope). Re-computing every time is wasted work. If you wanted real-time percentiles across all users, you'd batch-recompute weekly on the backend.

- **(M6) Elaboration:** The *latency budget* is ~16 ms per frame (60 Hz refresh). 
  - logSet to HomePage: 20 ms (already at the edge). 
  - If you add percentile computation: +100 ms (database lookup). 
  - Result: frame drops, jank. Users notice. So percentiles are computed on-demand when you open PercentilesPage, not on every set log.

- **(M3) Retrieval check:** "If percentile computation is expensive, why does PercentilesPage call percentileForExercise for every exercise at once?"

### Concept 7: The synthesis — putting it together in a diagram

- **(M4) Generate first:** "I'm going to show you three parallel flows, all triggered by one logSet call. Draw the boxes and arrows."

- **Flow 1: Immediate (the happy path we traced)**
  ```
  QML onClick → WorkoutTracker.logSet → Set created
    → emit dataChanged → HomePage Connections handler
    → refresh() → recentSets → recent property updates
    → ListView delegate binding → "Bench" visible in the list
  ```
  Duration: ~20 ms.

- **Flow 2: Chart redraw (if user is on ProgressGraphPage)**
  ```
  dataChanged → ProgressGraphPage Connections handler
    → refresh() → progressSeries(currentExercise)
    → seriesData property updates
    → Chart LineSeries binding → rebuildChart()
    → plot point → re-render chart
  ```
  Duration: ~10 ms (if ProgressGraphPage is active); if not, skipped.

- **Flow 3: Percentile update (if user is on PercentilesPage)**
  ```
  dataChanged → (PercentilesPage Connections handler would run)
    → percentilesForAll()
    → percentileForExercise(ex) for each exercise [EXPENSIVE]
    → StrengthCurve.lookupLiftVector (DB call)
    → result updates
    → ListView re-renders ranks
  ```
  
  **Reality:** PercentilesPage does *not* listen to dataChanged. Instead, it shows a stale snapshot until the user manually refreshes. This avoids the latency cost of percentile re-computation.

- **(M5) Generate second:** "Is it a problem that PercentilesPage shows stale percentiles after you log a new set?"
  - Answer seed: **Not really.** Your percentile only changes if the cohort changes (other users' sets). Since only you're logging locally, your rank relative to the cohort doesn't shift. It's valid to cache the percentiles. If you added backend sync (peer comparison), you'd need to refresh on-demand or batch-refresh.

- **(M3) Retrieval check:** "Why is percentile computation expensive, but recentSets is cheap?"

## 6. Teach-back (M10)

"Explain to a new team member, in ~8 sentences: what happens when a user logs a bench-press set from SetTrackerPage, and trace the path through C++, signals, QML handlers, and binding re-evaluation. Then name the riskiest hop in the chain and the guardrail you'd add."

## 7. Cumulative review (M13) — rapid-fire

1. User logs a set. Trace: QML onClick → logSet (C++) → 2 signals → QML refresh → recentSets → ListView. Name all 5 hops.
2. What data shape is the set in at each hop? (C++ Set object → QVariantMap → JavaScript object)
3. Why does recentSets() include the computed `volume` field instead of letting QML compute weight×reps?
4. What's the single highest-risk hop, and why?

## 8. The graded quiz (Bloom L1–L5, AI-graded in the app)

| # | Bloom | Type | Prompt | Rubric | Model answer (reference) | Pts |
|---|-------|------|--------|--------|--------------------------|-----|
| q1 | L1 | mc | When the user logs a bench-press set and taps "Done", which C++ method is called? | Identifies logSet or logSetAt | WorkoutTracker::logSet (or logSetAt, which logSet calls internally) | 8 |
| q2 | L2 | free | Describe the 5 hops from SetTrackerPage's "Done" button to "Bench × 5" appearing in the recent list. Name each hop and the data it passes. | Restates all 5; identifies data shape at each (QString/int → Set → QVariantMap → JS object) | 1. QML onClick fires. 2. WorkoutTracker.logSet(name, weight, reps) creates Set. 3. emit dataChanged signal. 4. HomePage/SetTrackerPage Connections handler calls refresh(), re-queries recentSets() → get QVariantList. 5. ListView delegate binding updates → text: modelData.exercise re-evaluates → "Bench" rendered. | 12 |
| q3 | L3 | free | Trace the data shape of the bench-press set (80 kg × 5) through all hops: C++ Set object → ? → ? → QML delegate. What type is it at each stage, and why does it change? | Identifies: Set (typed C++ object) → QVariantMap (DTO at bridge) → JS object (duck-typed in QML); surface the decoupling benefit | Set (C++ object with typed members: double weightKg, quint16 reps) → QVariantMap {weight: 80.0, reps: 5} (serializable DTO) → JS object (propertyData.weight, modelData.reps, duck-typed). Changes to decouple QML from Set's C++ interface. | 15 |
| q4 | L4 | free | The C++ side emits two signals: setLogged(exerciseName) and dataChanged(). HomePage listens to dataChanged. What if HomePage instead listened only to setLogged? What would break? | Identifies that setLogged is specific; some operations don't log a new set (deleteSet, editSet); edge cases would break | If HomePage only listens to setLogged, it misses exercise deletions, set edits, and clears. The streak would stop updating when you delete a set. dataChanged is safer because it's generic: "model changed, refresh your view." Trade-off: dataChanged is less granular (causes refreshes even when you don't need them), but it's more robust. | 18 |
| q5 | L5 | free | Name the single highest-risk hop in the logSet→refresh→redraw path. Why is it risky? Propose one guardrail and analyze its cost/benefit. | Takes a position on which hop is riskiest (e.g., Set constructor, Exercise.addSet, signal propagation); surface why (silent failures, cascading corruption); proposes guardrail (assertion, validation, logging, fuzzing); analyzes cost (latency, complexity, false positives) and benefit (catches specific failure mode) | Hop 2c: Set constructor. Risk: if Set's members are initialized wrong (e.g., weightKg stored as 0 instead of the passed value), every set logged is silently corrupted. No validation catches it; the signal still fires; the set looks valid in the UI. Guardrail: add explicit validation—after Set creation, check s->weightKg() == weightKg; if not, reject the set and return 0. Cost: 1 method call (~0.01 ms), 2 lines of code. Benefit: catches constructor bugs immediately, prevents cascading corruption. False positives: none (if the check fails, there's a real bug). Worth it. | 21 |
| q6 | L5 | free | ProgressGraphPage and PercentilesPage both depend on WorkoutTracker data. ProgressGraphPage re-draws every time dataChanged fires (Connections handler). PercentilesPage does NOT listen to dataChanged; it shows stale percentiles until manually refreshed. Evaluate: is this a bug in PercentilesPage, or a valid design trade-off? Justify. | Takes a position; surface the latency cost of percentile computation (StrengthCurve DB lookup); notes that cohort changes slowly (not per-set); proposes when immediate refresh is needed vs. when caching is OK | Valid trade-off. Percentiles depend on the cohort (other users' data), which doesn't change when you log a local set. Computing percentiles per-set would require a DB call to StrengthCurve; at 10 sets/sec (speed test), that's 10 DB calls/sec—lag. ProgressGraphPage is safe to refresh every time because it only re-sorts local data (fast). PercentilesPage caching is OK for now, but if you added backend sync (users comparing globally), you'd need a background refresh task. Best practice: provide a "Refresh percentiles" button so the user can update on demand. | 21 |

## 9. Custom interactive widget

**End-to-end data tracer** — user enters exercise, weight, reps in a form (mimicking SetTrackerPage input). On click, a diagram shows the path:
1. C++ logSet → Set created (show field values).
2. Signal emission (highlight "dataChanged").
3. QML refresh (show recentSets call + return).
4. Binding re-evaluation (show "text: modelData.exercise" triggering).
5. UI redraw (show list updated with new set).

Animated, step-by-step, with toggles to show/hide data values, type conversions, and latency numbers. Let Arvin *see* the journey.

## 10. End-of-session updates (agent)

- Grade quiz via the app's "Grade with Claude."
- Update `teacher_skill.md` PART 2: synthesis comprehension (did the full-stack picture land?); risk-assessment thinking; guardrail proposal creativity.
- Mark L20–L22 as complete. Suggest L23 (backend integration / Supabase) in 1–2 days if Arvin is ready; or L24 (testing & debugging) for deeper practice on this layer.
- Queue carry-over questions: "What would change if sets were synced to a backend database instead of in-memory?" and "If you had to add one feature to prevent data loss (besides persistence), what would it be?"
