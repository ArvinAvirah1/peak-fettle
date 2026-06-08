# Lesson L20 — QML UI: pages, bindings, delegates, theming, navigation

> **Track:** 2 — Desktop frontend · **Status:** ⭐ Reference lesson (fully worked)  
> **Interactive app:** [`L20_qml_ui.html`](L20_qml_ui.html)  
> **Estimated time:** ~40 min · **Prerequisite rungs:** L01–L10 (domain model through Qt basics)

## 0. Source of truth (read fresh before teaching — code drifts)

- `qml/Theme.qml` — singleton palette (colors, spacing, typography, adaptive helpers).
- `qml/Main.qml` — root ApplicationWindow + StackView navigation stack.
- `qml/HomePage.qml` — post-auth dashboard; reactive properties bound to `WorkoutTracker` signals.
- `qml/SetTrackerPage.qml` — core logging UX; ListView over `recentSets()`; routines picker.
- `qml/ProgressGraphPage.qml` — line chart plotting `progressSeries()` data.
- `qml/components/` — reusable pieces: `PrimaryButton.qml`, `WeightLabel.qml`, `ThemedTextField.qml`, `MountainLogo.qml`, `AvatarButton.qml`.

## 1. Learning outcomes (Bloom-tagged)

By the end, Arvin can:

- **(L1)** Identify the difference between a QML property binding and imperative event handlers, and when QML re-evaluates each.
- **(L2)** Explain why `Theme` is a singleton and how it enforces design consistency across pages.
- **(L3)** Trace a user action (tapping "Log a set") through the navigation stack from QML down to C++ and back up to the UI redraw.
- **(L4)** Analyze the binding in `WeightLabel` — why it references `UnitPreference.unit` even though it's discarded — and what bug it prevents.
- **(L5)** Compare QML's declarative reactive model (property bindings auto-trigger on signal) against React's explicit re-render in the mobile app, and defend which is easier to reason about for the progress-graph redraw when `dataChanged` fires.

## 2. Pre-lesson survey (M1) — ask LIVE via AskUserQuestion

- "Have you worked with reactive / declarative UI frameworks (Vue, React, SwiftUI)?"
- "Familiar with Qt's signal-slot mechanism from L01–L05?"
- "Today: focus on the QML reactive pattern or also dive into desktop C++-QML bridge?"

> Calibrate: depending on prior Cowork onboarding, Arvin may have React familiarity (mobile) — surface it as a bridge to understand bindings differently.

## 3. Spacing carry-over (M14)

Prior lesson (L19) closes with: "What does `Theme.turquoise` map to in hex, and why is it stored in the singleton rather than in each component?" → Seed this lesson's opening concept.

## 4. The difficulty ladder for THIS lesson (M2)

1. What QML is: declarative language for UIs + property bindings + signals.
2. Theme singleton: one source of truth for colors, spacing, typography.
3. Property bindings: when QML evaluates them, and why they're reactive.
4. Navigation: StackView push/pop and the goTo() centralized API.
5. Delegates: ListView repeating a component for each data row.
6. The WeightLabel binding trick: registering a dependency via the comma operator.
7. End-to-end: HomePage emits signals → bindings re-evaluate → chart redraws.

## 5. Concept sequence

### Concept 1: QML is a declarative language; bindings auto-react to signal changes

- **(M4) Generate first:** "If you change a `Text` label's text property in C++, does the QML Text on screen update automatically, or do you have to call repaint()?"
  
- **The idea:** QML uses *property bindings*. When you write `text: someObject.property`, QML tracks which signals might change `property`, and re-evaluates the binding (just the right side of the `:`) when those signals fire. No explicit refresh needed — the UI is *reactive* by design.

- **Real code** (`qml/HomePage.qml` line 209–211):
  ```qml
  Text {
      text: WorkoutTracker.totalSets > 0
            ? WorkoutTracker.totalSets + " sets logged"
            : "ready when you are"
  }
  ```
  When `WorkoutTracker` emits `dataChanged()`, this binding re-evaluates and the `Text` updates. QML saw the reference to `.totalSets` and registered a dependency on it.

- **(M6) Elaboration:** Why not just call a function every frame? QML is lazy — it only re-runs bindings when their dependencies change. That's much cheaper than re-rendering a 60 fps game loop. Analogy: a spreadsheet recalculates only the cells depending on the one you edited, not the whole sheet.

- **(M3) Retrieval check:** "In HomePage, when the user logs a new set, what signal fires in C++, and how does it reach the QML property binding?"

### Concept 2: Theme is a QML singleton — one palette for the entire app

- **The idea:** `Theme.qml` is registered as `pragma Singleton` and exposed via CMake's `set_source_files_properties`. Every QML file imports `PeakFettle 1.0` and reads colors/spacing from `Theme.turquoise`, `Theme.s4`, etc. One edit to Theme.qml changes the whole app's look — no searching 50 files.

- **Real code** (`qml/Theme.qml` lines 15–57):
  ```qml
  pragma Singleton
  import QtQuick
  QtObject {
      readonly property color turquoise:    "#2DD4BF"
      readonly property int s4:  16
      readonly property int fontBody: 15
  }
  ```
  
  Then in any QML file:
  ```qml
  import PeakFettle 1.0
  Rectangle {
      color: Theme.navyDeep
      width: Theme.s4 * 10
  }
  ```

- **(M5) Generate second:** "What happens if you want to add a dark mode? How does Theme being a singleton help or hurt?"
  - Answer seed: Theme is read-only right now, so dark mode would need a new property `isDarkMode` and conditional bindings. The singleton pattern lets you add it without changing 50 component files.

- **(M3) Retrieval check:** "Why is Theme's palette defined as `readonly` properties instead of normal JavaScript variables?"
  - Answer seed: `readonly` prevents accidental mutation; Qt's property system gives you NOTIFY signals automatically so bindings can react.

### Concept 3: Property bindings are re-evaluated when signals fire; event handlers are imperative

- **The idea:** A binding like `text: foo.bar` is *declarative* — it says "keep this text synchronized with foo.bar." An event handler like `onClicked: window.goTo("tracker")` is *imperative* — it says "when clicked, do this action." Bindings are lazy (recompute only on signal). Handlers always run.

- **Real code** — binding vs. handler (`qml/HomePage.qml` lines 404–414):
  ```qml
  Text {
      // BINDING: re-evaluated when WorkoutTracker.totalSets changes.
      text: WorkoutTracker.totalSets.toString()
  }
  MouseArea {
      // HANDLER: runs immediately when clicked, always.
      onClicked: window.goTo("tracker")
  }
  ```

- **(M6) Elaboration — the cost difference:** A binding is checked ~0 times if the source never changes; a handler that navigates the stack is an action, not a query, so it can't be binding-based. You *must* use handlers for imperative actions (navigation, file I/O, animations that aren't declarative).

- **(M4/M9 faded):** "Why does HomePage use a Connections block to listen to WorkoutTracker.dataChanged instead of just writing a binding?" 
  - Hint: A binding can't call JavaScript functions. A Connections handler can, so it calls page.refresh(), which recomputes the derived streak.

### Concept 4: StackView navigation — push/pop and the centralized goTo() API

- **The idea:** QML's `StackView` is a stack of screens. `push()` adds a new page on top; `pop()` removes the current one. Peak Fettle centralizes this in `Main.qml`'s `goTo()` function so pages call `window.goTo("tracker")` instead of managing the StackView directly. One place to change navigation logic.

- **Real code** (`qml/Main.qml` lines 85–98):
  ```qml
  function goTo(name) {
      switch (name) {
      case "home":        stack.replace(null, homeComponent);     break;
      case "tracker":     stack.push(trackerComponent);           break;
      case "graph":       stack.push(graphComponent);             break;
      case "back":        stack.pop();                            break;
      }
  }
  ```

  Pages call: `onClicked: window.goTo("tracker")`

- **(M3) Retrieval check:** "What's the difference between `stack.replace()` and `stack.push()`, and when does Peak Fettle use each?"
  - Answer seed: `replace(null, ...)` clears the stack and starts fresh (used for "Home" after auth); `push()` stacks the new page on top (used for "Tracker" so you can pop back).

- **(M6) Elaboration:** The transitions in lines 52–65 animate the entry/exit. The `x` and `opacity` animations give the slide-in from the right feel. This is *declarative* — you say "when a new page enters, slide from `stack.width` to 0"; the engine handles the frame timing.

### Concept 5: ListView delegates — repeating a component for each data row

- **The idea:** A ListView is a scrollable list. Each row is a delegate — a component repeated for each item in the model. QML creates/destroys delegates as the user scrolls (pooling), not upfront, so a list of 10,000 sets stays fast.

- **Real code** (`qml/HomePage.qml` lines 540–632, "Recent Workouts"):
  ```qml
  Repeater {
      model: page.recentDays   // JavaScript array of {dayKey, label, setCount, ...}
      
      delegate: Rectangle {
          Layout.fillWidth: true
          implicitHeight: dayRow.implicitHeight + Theme.s2 * 2
          color: dayMouse.containsMouse
                 ? Qt.rgba(0.176, 0.831, 0.749, 0.10)
                 : "transparent"
          
          Text {
              text: modelData.label   // "Today", "Yesterday", "Mon Apr 28"
          }
          MouseArea {
              anchors.fill: parent
              onClicked: window.goTo("tracker")
          }
      }
  }
  ```

  Each delegate gets a `modelData` (the array element) and an `index`. QML renders one delegate per row. When you scroll, QML reuses delegates for new rows.

- **(M4) Generate first:** "If you have 500 sets in recentSets() and each set row is a complex component with 3 Text items and an icon, does the app create 500 × 4 items at once, or on demand?"
  - Answer seed: On demand — ListView only renders visible rows + a bit of overschroll buffer. Off-screen rows are destroyed and re-created as needed (or pooled in modern Qt). This is *essential* for mobile performance.

- **(M3) Retrieval check:** "In the recent-workouts delegate, what is `modelData`? How does it relate to the `model` property?"

### Concept 6: The WeightLabel binding trick — comma operator to register signal dependencies

- **The idea:** `WeightLabel.qml` displays a weight in the user's chosen unit (kg or lb). When they toggle the unit, all `WeightLabel` components must redraw. *But* `UnitPreference.format()` is an `Q_INVOKABLE` method, not a `Q_PROPERTY`, so QML doesn't know to re-run the binding when the unit changes. The fix: reference `UnitPreference.unit` (which *is* a property with NOTIFY) inside the binding, even though you discard it.

- **Real code** (`qml/components/WeightLabel.qml` lines 39–41):
  ```qml
  text: (UnitPreference.unit, weightKg > 0
                              ? UnitPreference.format(weightKg)
                              : "BW")
  ```
  
  The `(UnitPreference.unit, ...)` comma operator evaluates the unit (for side effects / dependency tracking), then evaluates the conditional. When the unit changes, QML re-runs the entire binding.

- **(M5) Generate second:** "What would happen if you removed the `UnitPreference.unit` reference? User switches from kg to lb in Settings—"
  - Answer seed: The binding would NOT re-evaluate. The labels would stay showing "80 kg" even though the unit is now "lb". Users toggle the setting and nothing happens — a critical bug. This binding trick prevents it.

- **(M6) Elaboration:** This is a *workaround* for a limitation in QML's binding system. Ideally, `format()` would be a computed property instead of a method. But the fix is elegant — it costs nothing (one extra property read per label) and solves the problem with one line.

- **(M3) Retrieval check:** "Why not just add a `Connections { target: UnitPreference; function onUnitChanged() { ... } }`?" (Hint: handlers are imperative; bindings are declarative and can't be computed properties.)

### Concept 7: End-to-end data flow — HomePage refreshes when WorkoutTracker emits signals

- **The idea:** HomePage has reactive properties (`allSets`, `currentStreak`, `recentDays`) bound to a refresh function. The function queries `WorkoutTracker.recentSets()` and computes derived state (streak, PRs). When the user logs a set, `WorkoutTracker` emits `dataChanged()`, which triggers `refresh()`, which re-pulls the data, and the bindings re-render the UI.

- **Real code** (`qml/HomePage.qml` lines 49–64):
  ```qml
  property var  allSets: []
  property int  currentStreak: 0
  
  function refresh() {
      allSets       = WorkoutTracker.recentSets(2000);
      currentStreak = computeStreak();
  }
  
  Component.onCompleted: refresh()
  
  Connections {
      target: WorkoutTracker
      function onDataChanged() { page.refresh(); }
  }
  ```
  
  Streak display binding (line 330):
  ```qml
  text: page.currentStreak > 0
        ? page.currentStreak + "-day streak"
        : "Start your streak today"
  ```

- **(M4) Generate first:** "User logs a bench-press set. Draw a box diagram: C++ side (logSet) → signal → QML side (refresh) → binding → screen."
  - Boxes: **C++ WorkoutTracker.logSet()** → (emit dataChanged) → **QML Connections handler calls refresh()** → (re-query recentSets) → **currentStreak property changes** → (binding re-evaluates) → **Text redraws with new streak count**

- **(M6) Elaboration:** The allSets array is a `property var` (a JavaScript value, not a C++ type). When you assign a `QVariantList` from C++ to a QML `var`, it's automatically converted. Modifications to that JavaScript array don't notify back to C++ (it's a copy), but that's fine — HomePage only queries and displays, never mutates the C++ data.

- **(M3) Retrieval check:** "Why does HomePage use `Connections { target: WorkoutTracker }` instead of a property binding directly on WorkoutTracker.dataChanged?"
  - Hint: Signals aren't properties. You can't bind to a signal; you handle it.

## 6. Teach-back (M10)

"Explain to a Qt newcomer, in ~6 sentences: why QML is called 'declarative', how Theme makes the app consistent, and what happens when a user logs a set and the streak badge updates."

## 7. Cumulative review (M13) — rapid-fire

1. A Page imports `PeakFettle 1.0` and references `Theme.turquoise`. What guarantees it gets the right color?
2. `weWightLabel.qml` uses `(UnitPreference.unit, UnitPreference.format(...))`. Why the comma?
3. User logs a set. Trace the signal path from C++ through QML to the HomePage streak badge updating.
4. What's the difference between a property *binding* (`text: foo.bar`) and a *handler* (`onClicked: foo.bar()`)?

## 8. The graded quiz (Bloom L1–L5, AI-graded in the app)

| # | Bloom | Type | Prompt | Rubric | Model answer (reference) | Pts |
|---|-------|------|--------|--------|--------------------------|-----|
| q1 | L1 | mc | What does `pragma Singleton` do in Theme.qml? | Identifies that QML creates one instance and exposes it globally | Registers Theme as a singleton so every file gets the same palette instance | 8 |
| q2 | L2 | free | In your own words, what is a QML property binding, and when does QML re-evaluate it? | Restates: binding is "keep property X in sync with Y"; re-evaluates when Y's source signal fires | A binding (text: foo.bar) keeps the UI in sync with the data; QML re-evaluates it whenever a signal fires on the dependencies. | 12 |
| q3 | L3 | free | User taps "Log a set" on SetTrackerPage, logs a bench press, and taps Done. Draw a box diagram showing the path from the QML onClick through C++ logSet() back to HomePage's streak badge updating. | Traces: onClicked → window.goTo() → SetTrackerPage → WorkoutTracker.logSet() (C++ side) → emit dataChanged → Connections handler → refresh() → allSets/currentStreak property changes → binding re-evaluates → Text redraws | User taps Done → QML onClicked calls WorkoutTracker.logSet() → C++ creates new Set → emits dataChanged() → HomePage's Connections handler fires → refresh() re-queries recentSets() → currentStreak computed → binding (text: currentStreak > 0 ? ...) re-evaluates → Text renders "2-day streak" instead of "1-day" | 15 |
| q4 | L4 | free | WeightLabel.qml uses `(UnitPreference.unit, UnitPreference.format(weightKg))`. Why reference the unit property even though it's discarded? What bug does it prevent? | Names the dependency-tracking trick; identifies that format() is a method (not a property with NOTIFY); bug: without the unit reference, the binding wouldn't re-run when unit changes | format() is a Q_INVOKABLE method, not a property, so QML has no signal to watch. Referencing unit (which IS a property with NOTIFY) registers the dependency. Without it, switching kg→lb in Settings would leave all weights showing old units—this line prevents that. | 18 |
| q5 | L5 | free | Compare QML's property bindings (react auto on signal) vs. React's explicit re-render (setState triggers render). Which is easier to reason about for "progress graph redraw when WorkoutTracker.dataChanged fires"? Defend your choice and name a tradeoff. | Takes a position; explains the reactive model (bindings are automatic, declarative) vs. React's explicit triggers; identifies one advantage and one cost of each | QML bindings are easier to reason about here: you *declare* dependencies upfront (text: value), and they just work—no imperative setState needed. Cost: magic; understanding requires knowing which properties have NOTIFY signals. React forces you to write setState explicitly, which is verbose but all the re-renders are obvious in code. For the progress graph, QML's declarative approach means "add a binding, forget about it" — React requires a useEffect hook. | 21 |
| q6 | L5 | free | ProgressGraphPage has a Connections handler that calls refresh() when WorkoutTracker.dataChanged fires, which re-queries progressSeries(). An alternative design: make seriesData a Q_PROPERTY on WorkoutTracker that returns progressSeries(), so the binding is `seriesData: WorkoutTracker.seriesData` with auto re-compute. Evaluate this: what breaks, and is the current Connections design better? | Identifies the trade-off: direct property binding (simpler) vs. Connections + handler (more explicit but more control); surface: exerciseName parameter, metric choice on the QML side, side effects of calling refresh() (rebuildChart). Best answer leans on one side with a clear argument. | Direct Q_PROPERTY would require parameters (which exercise, which metric) to be C++ properties too, coupling the UI state to C++. The current design—exerciseName + currentMetric are QML-side state, refresh() queries C++ with those params—keeps the boundary clean. A binding can't take parameters. So the Connections + handler design is better: QML owns UI state, C++ owns data, refresh() is the bridge. | 21 |

## 9. Custom interactive widget

**Live Theme color picker** — sliders for RGB, shows a palette swatch, displays the hex code. Lets Arvin *feel* how Theme values propagate. When they drag the sliders, a Text element bound to the color updates in real time. Shows the difference between a bound property (reacts instantly) and a disconnected action (nothing changes).

## 10. End-of-session updates (agent)

- Grade quiz via the app's "Grade with Claude."
- Update `teacher_skill.md` PART 2: understanding of reactive bindings; whether the singleton pattern landed; any confusion on the signal→binding loop; binding trick clarity.
- Propose L21 scheduling (C++↔QML dataflow bridge) a few days out; queue carry-over questions: "What does UnitPreference.unit being a Q_PROPERTY with NOTIFY do?" and "If a page doesn't have a Connections block to WorkoutTracker, can it still see the data?"
