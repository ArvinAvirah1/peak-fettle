# Lesson L21 — C++↔QML data flow: the full round-trip on the desktop

> **Track:** 2 — Desktop frontend · **Status:** ⭐ Reference lesson (fully worked)  
> **Interactive app:** [`L21_cpp_qml_dataflow.html`](L21_cpp_qml_dataflow.html)  
> **Estimated time:** ~45 min · **Prerequisite rungs:** L01–L06, L20 (domain model + QML basics)

## 0. Source of truth (read fresh before teaching — code drifts)

- `src/WorkoutTracker.h` + `src/WorkoutTracker.cpp` — Q_INVOKABLE logging methods, Q_PROPERTY for totalSets + exerciseNames, `recentSets()` / `progressSeries()` returning `QVariantList`.
- `src/Exercise.h` + `src/Exercise.cpp` — public model; owned by WorkoutTracker.
- `src/Set.h` + `src/Set.cpp` — atomic unit; owned by Exercise.
- `qml/SetTrackerPage.qml` — calls `WorkoutTracker.logSet()`, updates `recent` property binding.
- `qml/ProgressGraphPage.qml` — calls `WorkoutTracker.progressSeries()`, converts result to chart points.
- `qml/components/WeightLabel.qml` — binds to C++ weight values via `UnitPreference.format()`.

## 1. Learning outcomes (Bloom-tagged)

By the end, Arvin can:

- **(L1)** Identify what a `Q_INVOKABLE` method is, and why it's needed for QML to call C++ functions.
- **(L2)** Explain the DTO pattern: why `recentSets()` returns `QVariantList` of maps instead of exposing C++ `Set*` pointers directly to QML.
- **(L3)** Trace a QML user action (logSet call) through `Q_INVOKABLE`, a C++ model mutation, and back to the `dataChanged` signal.
- **(L4)** Analyze the data-narrowing boundary: what type conversions happen when a `QVariantList` crosses from C++ to QML, and why string keys in the maps are safer than exposing model objects.
- **(L5)** Evaluate the DTO design (maps with string keys) vs. exposing `Set*` objects to QML — what does each cost in coupling, performance, and maintainability?

## 2. Pre-lesson survey (M1) — ask LIVE via AskUserQuestion

- "Familiar with Qt's meta-object system (Q_PROPERTY, signals, slots)?"
- "Worked with other C++/script bridges (ctypes, CFFI, JNI, WebAssembly)?"
- "Today: focus on the QML-side calls or also dive into C++ method resolution?"

> Calibrate: this is the first lesson where C++ and QML are in the same codebase. Surface how different it is from the mobile app (REST API boundary).

## 3. Spacing carry-over (M14)

Prior lesson (L20) closes with: "If a page doesn't have a Connections block to WorkoutTracker, can it still see the data?" → Yes, because `Q_PROPERTY` bindings are automatic; this lesson dives into how.

## 4. The difficulty ladder for THIS lesson (M2)

1. Q_INVOKABLE: registering a C++ method as callable from QML.
2. Q_PROPERTY: exposing C++ data members and signals to QML bindings.
3. QVariantList / QVariantMap: the bridge types for untyped data.
4. Return values: how QML receives a `QVariantList` from C++ logSet().
5. The DTO pattern: why maps (not objects) cross the boundary.
6. Signal → binding → redraw: the round-trip from C++ mutation to QML re-render.
7. Type safety trade-off: coupling vs. flexibility at the boundary.

## 5. Concept sequence

### Concept 1: Q_INVOKABLE — C++ methods visible to QML

- **(M4) Generate first:** "You write a C++ method `WorkoutTracker::logSet(name, weight, reps)`. How does QML call it? Does QML have a C++ compiler, or is there magic?"

- **The idea:** Qt's meta-object compiler (`moc`) scans `Q_INVOKABLE` macros and generates code that registers the method in a lookup table. When QML calls `WorkoutTracker.logSet(...)`, the QML engine looks up the method in that table and invokes it. No magic — it's a cross-language method-dispatch system.

- **Real code** (`src/WorkoutTracker.h` lines 58–61):
  ```cpp
  class WorkoutTracker : public QObject {
      Q_INVOKABLE qint64 logSet(const QString &exerciseName,
                                double weightKg,
                                int reps,
                                int rir = -1);
  ```
  
  Called from QML (`qml/SetTrackerPage.qml`, approx. line 500+ in full file):
  ```qml
  ToolButton {
      onClicked: WorkoutTracker.logSet(exerciseName.text, weight.text, reps.text)
  }
  ```

- **(M6) Elaboration:** Not *all* C++ methods are visible to QML by default. You must mark them `Q_INVOKABLE`. This is intentional — it forces you to think about which methods are part of the QML boundary. Private methods stay private to C++.

- **(M3) Retrieval check:** "In SetTrackerPage, when the user taps 'Done', onClicked fires. What happens next? Does QML have the exerciseName string, or does it get retrieved from the C++ model?"
  - Answer seed: The QML TextField holds the exerciseName text locally. onClicked passes it as an argument to logSet(). C++ receives the QString and creates the Set. One direction at a time (request-response), not streaming.

### Concept 2: Q_PROPERTY — reactive data exposure from C++ to QML

- **The idea:** A `Q_PROPERTY` is a C++ member + getter + setter + optional signal. QML can bind to it: `text: tracker.totalSets`. When the C++ property changes, the signal fires, and QML re-evaluates the binding. No explicit refresh needed.

- **Real code** (`src/WorkoutTracker.h` lines 40–41):
  ```cpp
  Q_PROPERTY(int totalSets READ totalSets NOTIFY dataChanged)
  Q_PROPERTY(QStringList exerciseNames READ exerciseNames NOTIFY dataChanged)
  ```
  
  Then in QML:
  ```qml
  Text {
      text: WorkoutTracker.totalSets + " sets logged"
  }
  ```
  
  When logSet() completes, WorkoutTracker emits `dataChanged()`, and this binding re-evaluates automatically.

- **(M5) Generate second:** "What's the relationship between `Q_PROPERTY` and `Q_INVOKABLE`? Can a method be both?"
  - Answer seed: No—a property is state (read/write), a method is an action. But the getter of a property *is* a method, so getters are implicitly callable. Q_INVOKABLE is for methods you want QML to call directly.

- **(M4) Generate first — the read/write asymmetry:** "If you write `WorkoutTracker.totalSets = 100` in QML, what happens? Is totalSets writable from QML?"
  - Answer seed: No—it's `READ totalSets` (getter only), no WRITE. QML can read it, but setting it fails silently or errors. This is intentional; you can't mutate the model by writing a property; you call logSet() instead.

- **(M3) Retrieval check:** "Why does `Q_PROPERTY` declare a NOTIFY signal (dataChanged) instead of just using the getter?"

### Concept 3: QVariantList and QVariantMap — untyped bridge data

- **The idea:** QML is dynamically typed. C++ is statically typed. `QVariant` is a tagged union that holds any C++ type: int, QString, QList, etc. `QVariantList` is a QList<QVariant>; `QVariantMap` is a QHash<QString, QVariant>. They cross the boundary with zero compile-time type checking — the cost of flexibility.

- **Real code** (`src/WorkoutTracker.h` lines 106–111):
  ```cpp
  // Returns recent sets as an untyped list of maps
  Q_INVOKABLE QVariantList recentSets(int limit = 25) const;
  
  // Returns one set's data: { exercise, weight, reps, timestamp, dayKey, volume }
  // Each value is a QVariant, so QML sees a JavaScript object
  ```
  
  C++ implementation (workouttracker.cpp, simplified):
  ```cpp
  QVariantList WorkoutTracker::recentSets(int limit) const {
      QVariantList result;
      for (const Set *s : allSets) {
          QVariantMap row;
          row["exercise"]  = s->exerciseName();
          row["weight"]    = s->weightKg();
          row["reps"]      = s->reps();
          row["timestamp"] = s->timestamp();
          result.append(row);
      }
      return result;
  }
  ```
  
  QML receives it as JavaScript array of objects:
  ```qml
  property var recentSets: []
  Component.onCompleted: {
      recentSets = WorkoutTracker.recentSets(50);
      // recentSets is now [{exercise:"Bench", weight:80, reps:5, ...}, ...]
  }
  ```

- **(M6) Elaboration — why not expose `Set*` directly?** If C++ returned `QList<Set*>`, QML would get pointers. To use them, you'd write bindings like `text: setPtr.weightKg()`, which works but tightly couples QML to the Set class. If you refactor Set's API, QML breaks. Maps decouple: add a field to the map, QML needs no changes (JS is duck-typed). The cost: no compile-time schema validation — you don't know if the key "weights" (typo) is missing until runtime.

- **(M3) Retrieval check:** "In SetTrackerPage, recent is a `property var recentSets: []`. When you write `recentSets = WorkoutTracker.recentSets(50)`, what type is recentSets?"
  - Answer seed: It's a JavaScript Array of plain JavaScript Objects (converted from QVariantList of QVariantMaps). The array can grow/shrink freely in QML.

### Concept 4: The round-trip — QML call → C++ mutation → signal → QML redraw

- **The idea:** When the user taps "Log a set", the following chain fires:
  1. QML onclick → calls `WorkoutTracker.logSet(...)` (Q_INVOKABLE).
  2. C++ creates new `Set`, adds it to `Exercise`, emits `dataChanged()`.
  3. QML's `Connections { target: WorkoutTracker; function onDataChanged() {} }` handler fires.
  4. Handler calls `refresh()`, which re-queries `recentSets()`.
  5. The `recent` property updates, and bindings re-evaluate → ListView updates.

- **Real code — the chain** (`SetTrackerPage.qml`, lines ~490–510, pseudocode):
  ```qml
  ToolButton {
      text: "Done"
      onClicked: {
          // Step 1: Call C++
          var setId = WorkoutTracker.logSet(
              exName.text, weight.text, reps.text, rir.text
          );
          if (setId > 0) {
              // Optional: animation / UX feedback
          }
      }
  }
  
  Connections {
      target: WorkoutTracker
      // Step 3: Catch the signal
      function onDataChanged() { page.refresh(); }
  }
  
  function refresh() {
      // Step 4: Re-query
      recent = WorkoutTracker.recentSets(50);
  }
  ```
  
  Delegate in the ListView (`SetTrackerPage.qml`, lines ~650+):
  ```qml
  delegate: Rectangle {
      Text {
          // Step 5: Binding re-evaluates
          text: modelData.exercise + " × " + modelData.reps
      }
  }
  ```

- **(M4) Generate first — the bottleneck:** "In step 4, refresh() calls `recentSets(50)` again. Could you cache the result from step 1 instead of re-querying?"
  - Answer seed: logSet() returns the new setId, not the full set object. re-querying is simpler than deserializing the return value. The cost: O(n) re-sort for each new set, but 50 sets is fast. If you logged 1M sets, you'd want a more sophisticated strategy (e.g., prepend to the list).

- **(M6) Elaboration — signal naming:** `dataChanged()` is generic. A more specific signal like `setLogged(exerciseName)` (WorkoutTracker.h line 205) is also emitted, so pages interested only in set logging can listen to that and skip re-querying exercises. Peak Fettle uses both: HomePage listens to dataChanged (so it recalculates streak); SetTrackerPage could optimize by listening to setLogged instead.

- **(M3) Retrieval check:** "Where in the chain does the actual UI redraw happen?"

### Concept 5: The DTO pattern — why maps, not objects

- **The idea:** Data Transfer Objects (DTOs) are simple, untyped structures for crossing boundaries. Peak Fettle uses `QVariantMap` (string key→QVariant value) instead of exposing C++ `Set*` objects. Benefits: QML is decoupled from Set's C++ interface; the map schema is flexible (add a field, QML doesn't break). Cost: no type safety; a typo like `modelData.weightt` silently returns `undefined` instead of erroring at compile time.

- **Real code — DTO shape** (`recentSets()` return):
  ```cpp
  // DTO: untyped { exercise, weight, reps, timestamp, dayKey, volume }
  QVariantMap row;
  row["exercise"]  = s->exerciseName();     // QString → QVariant
  row["weight"]    = s->weightKg();         // double → QVariant
  row["reps"]      = s->reps();             // int → QVariant
  row["timestamp"] = s->timestamp();        // QDateTime → QVariant
  row["dayKey"]    = s->dayKey();           // QString → QVariant
  row["volume"]    = s->volume();           // double → QVariant (computed)
  return result;
  ```

- **Alternative — expose Set* directly:**
  ```cpp
  // Hypothetical: return native Set* objects
  Q_INVOKABLE QList<Set*> recentSets(int limit) const;
  ```
  
  QML would then write:
  ```qml
  Text { text: modelData.weightKg() }   // Direct method call to Set
  Text { text: modelData.volume() }     // Computed on-read in C++
  ```

- **(M5) Generate second — the trade-off:** "Pro: Set's API is transparent (you see `estimatedOneRepMax()` right there). Con: QML couples to Set's C++ class definition. If you rename `weightKg()` to `mass()`, all QML breaks. With the DTO, you rename the field in the map builder, add a deprecation message, and QML is unaffected."

- **(M4) Generate first:** "The map has a `volume` key. Would you compute it in C++ (as now) or expose `weightKg` and `reps` separately and compute in QML?"
  - Answer seed: Computing in C++ is better—it's one source of truth, and the formula is part of the domain logic (belongs in C++). QML is for presentation.

- **(M3) Retrieval check:** "Why is the set ID included in recentSets() maps?"
  - Answer seed: So QML can refer back to a specific set (e.g., to edit or delete it). The id is the stable key across mutations.

### Concept 6: Type conversions at the boundary — QString, double, QDateTime

- **The idea:** C++ and QML types don't match 1:1. Qt's meta-object system auto-converts common types: `QString ↔ string`, `double ↔ number`, `QDateTime ↔ Date`, `QStringList ↔ array`. Other types (custom C++ classes) don't convert—they remain pointers (unsafe in QML) or require explicit marshaling.

- **Real code — conversions** (`WorkoutTracker.h` lines 58–69):
  ```cpp
  Q_INVOKABLE qint64 logSet(const QString &exerciseName,
                            double weightKg,
                            int reps,
                            int rir = -1);
  
  Q_INVOKABLE QVariantList recentSets(int limit = 25) const;
  Q_INVOKABLE QVariantList progressSeries(const QString &exerciseName,
                                          const QString &metric = "e1rm",
                                          bool perSet = false) const;
  ```
  
  QML calls:
  ```qml
  WorkoutTracker.logSet("Bench", 80.5, 5)     // JS string, number, number
                                               // auto-converts to QString, double, int
  ```

- **(M6) Elaboration — default arguments:** C++ default arguments (like `rir = -1`) are *not* visible to QML. If you call `logSet("Bench", 80.5, 5)` from QML, the default rir is *not* applied; you must pass all 4 arguments explicitly. This is a Qt quirk. Workaround: overload methods or use Q_INVOKABLE slots for each signature.

- **(M4/M9 faded):** "QDateTime converts to JavaScript Date. Plotting ProgressGraphPage passes `p.date` (milliseconds since epoch) to the chart. How does the QDateTime (UTC, with timezone) become a Date with a timezone?"
  - Hint: QDateTime serializes to milliseconds; JavaScript Date interprets those as UTC. If you want local time, you must convert in C++ before returning.

- **(M3) Retrieval check:** "What happens if you try to pass a C++ `Set*` pointer from C++ to QML as a return value?"

### Concept 7: Performance and coupling analysis — the DTO trade-off

- **The idea:** The DTO design (QVariantMap) trades type safety for flexibility. Performance-wise:
  - **DTO**: every field is string-keyed hash lookup (O(1) amortized). No memory overhead. JSON-serializable out of the box.
  - **Native objects**: direct member access (faster), but QML can't call C++ methods efficiently. Large objects replicate in QML's copy. Coupling is high.

- **Real scenario** (`ProgressGraphPage.qml` lines 81–106):
  ```qml
  // Receives seriesData as QVariantList of maps:
  // [{x: 1, y: 80.5, date: 1700000000000, reps: 5, weight: 80, dayKey: "2024-11-15"}, ...]
  for (let i = 0; i < seriesData.length; ++i) {
      const p = seriesData[i];
      const yDisp = page.yToDisplay(p.y);    // Lookup "y" in the map
      lineSeries.append(p.x, yDisp);
  }
  ```
  
  If instead C++ exposed `ProgressPoint*` objects with methods:
  ```qml
  // Hypothetical:
  lineSeries.append(p.x(), p.y());  // Method calls across the boundary
  ```
  
  The per-point method call overhead (moc dispatch, argument marshaling) would dominate for 500+ points. Maps are faster.

- **(M5) Generate second:** "Peak Fettle logs ~5–20 sets per day. Typical user has ~200 sets logged (40 days). When ProgressGraphPage calls progressSeries(), how many rows is the QVariantList?"
  - Answer seed: 40 rows (one best-per-day). If perSet=true, 200 rows. The DTO marshaling cost is negligible for either.

- **(M4) Generate first — maintenance cost:** "Six months later, you want to add a `isPr` flag to each recent set (marking personal records). Is it easier with the DTO design or native objects?"
  - Answer seed: **Much** easier with DTOs. Add `row["isPr"] = (this set is a new personal record);` to the map builder. QML reads `modelData.isPr` and draws a badge. No QML or QML bindings change. With native objects, you'd add a method `isPr()` to Set, modify the QML types, and recompile everything. The decoupling pays off.

## 6. Teach-back (M10)

"Explain to a C++ developer who's new to QML, in ~7 sentences: why you can't pass a `Set*` directly to QML, why recentSets() returns maps, and what happens when the user logs a set and ProgressGraphPage's chart updates."

## 7. Cumulative review (M13) — rapid-fire

1. What's the difference between `Q_INVOKABLE` and `Q_PROPERTY`? Which one can QML call like a function?
2. `recentSets()` returns `QVariantList`. What type does QML see it as?
3. User logs a bench press in SetTrackerPage. Trace: onClicked → logSet (C++) → signal → refresh → binding updates. Where does the UI redraw happen?
4. Why does the map include `volume` (computed from weight*reps) instead of letting QML compute it?

## 8. The graded quiz (Bloom L1–L5, AI-graded in the app)

| # | Bloom | Type | Prompt | Rubric | Model answer (reference) | Pts |
|---|-------|------|--------|--------|--------------------------|-----|
| q1 | L1 | mc | What does `Q_INVOKABLE` do? | Identifies that it registers a C++ method as callable from QML | It tells Qt's meta-object compiler to generate code that lets QML call this C++ method by name at runtime. | 8 |
| q2 | L2 | free | `Q_PROPERTY(int totalSets READ totalSets NOTIFY dataChanged)` exposes totalSets to QML as a binding. Explain what READ and NOTIFY do. | Restates: READ is the getter; NOTIFY is the signal that fires when the value changes | READ totalSets specifies the getter function; QML can bind to it. NOTIFY dataChanged tells QML "when this property changes, emit this signal so bindings re-evaluate." | 12 |
| q3 | L3 | free | User taps "Done" after logging a bench press on SetTrackerPage. Draw the signal path: QML onClicked → C++ logSet() → signal → refresh() → binding. What re-evaluates? | Traces the full chain; names the binding that re-evaluates | onClicked calls WorkoutTracker.logSet() → C++ creates Set, emits dataChanged() → Connections handler calls refresh() → fresh copy of recentSets() → recent property updates → ListView delegate bindings (text: modelData.exercise) re-evaluate → the list re-renders with the new set. | 15 |
| q4 | L4 | free | logSet() returns a qint64 setId. But recentSets() returns QVariantList (maps with string keys, not Set* pointers). Why use maps instead of exposing Set* to QML? Name one benefit and one cost. | Identifies the DTO pattern; surface decoupling (vs. coupling); names a concrete example (e.g., adding fields, refactoring Set's API) | DTOs decouple QML from Set's C++ interface. Benefit: change Set's code (rename a method, add fields) and QML continues working—just update the map builder. Cost: no type safety; typos like modelData.weightt silently return undefined instead of erroring at compile time. | 18 |
| q5 | L5 | free | ProgressGraphPage calls progressSeries() and plots each point's y-value. Would it be faster (or cleaner) to have C++ return `ProgressPoint*` objects with methods like `y()`, so QML writes `p.y()` instead of `p["y"]`? Evaluate the trade-off: speed, coupling, maintainability. | Takes a position with reasoning; surfaces per-point method-call overhead, coupling cost, schema flexibility of maps | Maps are better here. Reason: progressSeries() returns ~40 points (best-per-day). Per-point method calls across the C++↔QML boundary have dispatch overhead that would dominate. Maps are O(1) hash lookup and already serializable. Coupling matters too—if you add a new field (isPr, rpe), the map just grows; native objects require QML type changes. Maps trade small type-safety cost for huge decoupling and serialization gains. | 21 |
| q6 | L5 | free | WorkoutTracker has a Q_PROPERTY totalSets (READ-only, no WRITE). Can you write `WorkoutTracker.totalSets = 0` from QML to clear the count? If not, why did the designer choose READ-only? | Identifies that you can't write to it (no WRITE clause); surface the design intent: you mutate the model via methods (logSet, deleteSet), not direct property writes | No—READ-only means the property is a getter only. This is intentional; totalSets is *derived* from the actual sets. You can't just write 0; you'd orphan the underlying data. Instead, you call deleteSet() or clearAll() to mutate the model. The property is a *view* of the state, not a control. This prevents accidental inconsistencies. | 21 |

## 9. Custom interactive widget

**Live C++↔QML call tracer** — shows QML code on the left (WorkoutTracker.logSet call), C++ code on the right (execution of logSet, emitting signal, re-querying), and arrows showing the data crossing the boundary. Highlights which types convert (QString↔string, double↔number) and which stay opaque. User steps through the trace with Next/Prev buttons.

## 10. End-of-session updates (agent)

- Grade quiz via the app's "Grade with Claude."
- Update `teacher_skill.md` PART 2: understanding of Q_INVOKABLE vs. Q_PROPERTY; clarity on the DTO boundary; whether the type-conversion magic felt intuitive or surprising.
- Propose L22 scheduling (end-to-end dataflow) in 1–2 days; this lesson sets up the final synthesis. Queue carry-over: "What's the lowest-risk place in the chain (QML→C++→QML) to add validation?" and "If progressSeries() had 10,000 points, would the DTO overhead matter?"
