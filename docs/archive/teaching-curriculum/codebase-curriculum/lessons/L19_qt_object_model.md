# Lesson L19 — The Qt object model & exposing C++ to QML

> **Track:** 4 — C++/Qt Desktop & interop · **Status:** Core QML-C++ bridge
> **Interactive app:** [`L19_qt_object_model.html`](L19_qt_object_model.html)
> **Estimated time:** ~45 min · **Prerequisite rungs:** L01 (domain model), L02 (C++ language)

## 0. Source of truth (read fresh before teaching — code drifts)
- `src/set.h` — class `Set(QObject)`, `Q_OBJECT` macro, `Q_PROPERTY` declarations (lines 29–62), `Q_INVOKABLE` methods, signals (lines 122–134).
- `src/exercise.h` — class `Exercise(QObject)`, properties and signals.
- `src/WorkoutTracker.h` — singleton `WorkoutTracker : public QObject`, `QML_ELEMENT`, `QML_SINGLETON`, `Q_INVOKABLE` logging methods (lines 58–85), `Q_PROPERTY` examples (lines 41–43).
- `src/main.cpp` — how objects are registered for QML (`QML_ELEMENT`, `QML_SINGLETON`), instantiation.
- Qt 6.11 documentation on QObject, Q_PROPERTY, Q_INVOKABLE, signals/slots, QML type registration.
- The meta-object compiler (moc) — how `Q_OBJECT` enables the magic.

## 1. Learning outcomes (Bloom-tagged)
By the end, Arvin can:
- **(L2)** Explain what `Q_OBJECT`, `Q_PROPERTY`, and `QML_ELEMENT` do, and why they're necessary for QML to communicate with C++.
- **(L3)** Write a Q_PROPERTY with READ, WRITE, and NOTIFY, and implement the corresponding setter that emits the notification signal.
- **(L4)** Analyze the boilerplate cost (`Q_PROPERTY` + setter + signal) against a plain struct and determine when each is appropriate.
- **(L5)** Evaluate the singleton pattern for `WorkoutTracker` — when is a singleton the right choice for a QML-exposed object, and what are the downsides?

## 2. Pre-lesson survey (M1) — ask LIVE
- "Experience with Qt's meta-object system: none / used Q_OBJECT / wrote Q_PROPERTY / built a custom moc plugin?"
- "Have you used singletons in C++? What was the context?"
- "Today: dive deep on the property system and signal emissions, or also explore moc internals?"
> Calibrate on Qt familiarity.

## 3. Spacing carry-over (M14)
From L01 (domain model):
- "Why is `volume` computed on read in the `Set` class?"
- "What does a signal emit do in the context of property changes?"

## 4. The difficulty ladder for THIS lesson
1. The QObject base class and `Q_OBJECT` macro: what it enables.
2. Q_PROPERTY: READ, WRITE, NOTIFY — the contract.
3. Implementing a property: the getter, setter, signal, and notification logic.
4. Q_INVOKABLE methods: exposing C++ functions directly to QML.
5. Singleton registration: `QML_ELEMENT`, `QML_SINGLETON`, and when to use it.
6. The moc compiler: how `Q_OBJECT` triggers code generation.
7. Trade-offs: property boilerplate vs. plain structs; singletons vs. dependency injection.

## 5. Concept sequence

### Concept 1: QObject — the foundation of the meta-object system

- **(M4) Generate first:** "In plain C++, how does code running in one language (JavaScript/QML) call functions on a C++ object? Why is that hard?"

- **(M7) Concrete hook:** QML is JavaScript running in a VM. C++ is compiled native code. They're in different worlds. How does QML call a C++ method? It needs *reflection* — runtime information about C++ objects that JavaScript can inspect and invoke.

- **The idea:** `QObject` is the base class for any C++ class that needs to be introspectable at runtime. When you write:
  ```cpp
  class Set : public QObject {
      Q_OBJECT
  ```
  you're saying: "this class participates in Qt's meta-object system." The `Q_OBJECT` macro triggers the meta-object compiler (moc) to generate reflection code (a `Set_moc.cpp` file, hidden) that lets QML inspect Set's properties, methods, and signals at runtime.

- **Real code** (`src/set.h`, lines 29–31):
  ```cpp
  class Set : public QObject {
      Q_OBJECT
      QML_ELEMENT
  ```
  The `Q_OBJECT` macro expands to boilerplate that moc uses to generate a `metaObject()` function. `QML_ELEMENT` registers the class with QML so QML files can instantiate it directly (e.g., `import PeakFettle 1.0; Set { ... }`).

- **(M6) Elaboration:** Without `Q_OBJECT`, the class is just C++. QML can't see it. The moc compiler skips it. With `Q_OBJECT`, moc generates ~500 lines of reflection code that lets QML bind to properties, call methods, and connect to signals. This is Qt's superpower: C++ performance with dynamic language ergonomics.

- **(M3) Retrieval check:** "What does the moc compiler generate when it sees `Q_OBJECT` in a header?"

### Concept 2: Q_PROPERTY — the bridge between C++ and QML

- **(M4) Generate first:** "In QML, you want to bind to a C++ property like `set.weightKg`. The C++ class has a private `m_weightKg` field. How do you expose it safely and reactively?"

- **(M7) Concrete hook:** A Set has a weight. QML wants to display it and respond when it changes (redraw the chart). In plain C++, you'd expose a getter:
  ```cpp
  double getWeightKg() { return m_weightKg; }
  ```
  But QML would see this as a *method*, not a property — you'd have to write `set.getWeightKg()` in QML. And there's no way to react to changes.

- **The idea:** `Q_PROPERTY` declares a C++ field as a property that QML can read, write, and watch for changes. The syntax is:
  ```cpp
  Q_PROPERTY(double weightKg READ weightKg WRITE setWeightKg NOTIFY weightKgChanged)
  ```
  This says:
  - **READ:** the getter function is `weightKg()`.
  - **WRITE:** the setter is `setWeightKg(double)`.
  - **NOTIFY:** when the value changes, emit the `weightKgChanged()` signal.
  - QML then binds like: `weight.text: set.weightKg` (reads via READ), `set.weightKg = 100` (calls WRITE), and `onWeightKgChanged: { ... }` (listens to NOTIFY).

- **Real code** (`src/set.h`, lines 45, 111–113):
  ```cpp
  Q_PROPERTY(double  weightKg  READ weightKg  WRITE setWeightKg  NOTIFY weightKgChanged)
  
  public:
      double weightKg() const { return m_weightKg; }
      void setWeightKg(double v);
  ```
  And in `src/set.cpp`, the setter that does the real work:
  ```cpp
  void Set::setWeightKg(double v) {
      if (m_weightKg == v) return;  // no-op if unchanged
      m_weightKg = v;
      emit weightKgChanged();         // notify QML that it changed
      emit volumeChanged();           // volume depends on weight, so notify it too
  }
  ```

- **(M6) Elaboration:** The `if (m_weightKg == v) return;` guard prevents redundant notifications. If QML sets `weightKg = 100` twice, the setter emits only once. This matters for performance — every signal emission triggers binding updates, which can reflow the UI.

- **(M3) Retrieval check:** "Write the Q_PROPERTY for an `int reps` field with a setter `setReps()` and a signal `repsChanged()`."

### Concept 3: Implementing a property — the full cycle

- **(M9 Worked → Faded → Blank):**

  **Worked example:** Let's add a new property `QString notes` to Set.
  1. **Header** (`src/set.h`):
     ```cpp
     Q_PROPERTY(QString notes  READ notes  WRITE setNotes  NOTIFY notesChanged)
     
     public:
         QString notes() const { return m_notes; }
         void setNotes(const QString &v);
     
     signals:
         void notesChanged();
     
     private:
         QString m_notes;
     ```
  2. **Implementation** (`src/set.cpp`):
     ```cpp
     void Set::setNotes(const QString &v) {
         if (m_notes == v) return;
         m_notes = v;
         emit notesChanged();
     }
     ```
  3. **QML usage**:
     ```qml
     Text { text: set.notes }                    // read
     TextField { text: set.notes; onEditingFinished: set.notes = text }  // write
     Connections { target: set; function onNotesChanged() { console.log("notes changed") } }
     ```

  **Faded example:** Add an `int reps` property to Set. The getter is trivial (`return m_reps`), but what does the setter emit when reps change?
  ```cpp
  void Set::setReps(int v) {
      const int clamped = std::clamp(v, 0, 65535);
      if (m_reps == clamped) return;
      m_reps = static_cast<quint16>(clamped);
      emit repsChanged();
      emit ???();  // what else changed because reps changed?
  }
  ```
  > Hint: volume depends on reps. See L01, Concept 1.

  **Blank example:** You're adding a `bool isPublic` property to Exercise. Write the full chain: Q_PROPERTY declaration, getter, setter, header field, and signal. What other signals might you emit?

- **(M3) Retrieval check:** "When a property setter emits its notification signal, what happens in QML?"

### Concept 4: Q_INVOKABLE — exposing C++ methods directly

- **(M4) Generate first:** "QML can bind to properties and listen to signals. But you also want to call a C++ method like `saveRoutine(name, exercises)`. How?"

- **The idea:** Any public method with `Q_INVOKABLE` can be called from QML:
  ```cpp
  Q_INVOKABLE QString saveRoutine(const QString &name, const QVariantList &exerciseList);
  ```
  QML calls it like:
  ```qml
  WorkoutTracker.saveRoutine("Push A", ["Bench", "Row"])
  ```

- **Real code** (`src/WorkoutTracker.h`, lines 58–69):
  ```cpp
  // Logs a new set under the given exercise name.
  // Returns the assigned set id (0 on rejection).
  Q_INVOKABLE qint64 logSet(const QString &exerciseName,
                            double weightKg,
                            int reps,
                            int rir = -1);

  // Same as logSet but lets the caller backdate the entry.
  Q_INVOKABLE qint64 logSetAt(const QString &exerciseName,
                              double weightKg,
                              int reps,
                              int rir,
                              const QDateTime &timestamp);
  ```
  And QML calls it:
  ```qml
  // from EditSetDialog.qml or similar
  const setId = WorkoutTracker.logSet(exerciseName, 100, 5);
  if (setId > 0) {
      console.log("Set logged, id:", setId);
  }
  ```

- **(M6) Elaboration:** Q_INVOKABLE is simpler than Q_PROPERTY — no setter, no signal, no binding. Use it for actions (logging a set, saving a routine) that don't fit the reactive property model. Properties are for *state* (what is the value now?); invokables are for *actions* (do this thing).

- **(M3) Retrieval check:** "When would you use Q_INVOKABLE instead of Q_PROPERTY?"

### Concept 5: Singleton registration — QML_SINGLETON and when to use it

- **(M4) Generate first:** "WorkoutTracker is a hub for all set-tracking. You want QML to call `WorkoutTracker.logSet()` directly, not create an instance. How?"

- **The idea:** A singleton is a class with one global instance. Qt's `QML_ELEMENT` + `QML_SINGLETON` handles registration:
  ```cpp
  class WorkoutTracker : public QObject {
      Q_OBJECT
      QML_ELEMENT
      QML_SINGLETON
      // ...
  };
  ```
  Now QML can import and use it directly:
  ```qml
  import PeakFettle 1.0
  
  Page {
      onCompleted: {
          WorkoutTracker.logSet("Bench", 100, 5);
      }
  }
  ```
  No `new WorkoutTracker()` — it's a global.

- **Real code** (`src/WorkoutTracker.h`, lines 34–37):
  ```cpp
  class WorkoutTracker : public QObject {
      Q_OBJECT
      QML_ELEMENT
      QML_SINGLETON
      // ...
  };
  ```
  And `src/main.cpp` ensures it's instantiated and registered with QML.

- **(M6) Elaboration:** Singletons are convenient but controversial. They couple all code to a global, making testing hard (you can't inject a mock). For a small app like Peak Fettle, the trade-off (convenience now, pain later if you refactor) is reasonable. For a large app with 100 pages, you'd use dependency injection instead. The comment in `WorkoutTracker.h` (lines 1–3) makes the intent clear: "singleton hub for everything set-tracking."

- **(M3) Retrieval check:** "What's the downside of using a singleton for WorkoutTracker?"

### Concept 6: Signals and slots — the event system

- **The idea:** Qt's signal/slot system is how objects communicate. A signal is emitted when something happens (property changed, button clicked). A slot is a method that responds. QML's `onPropertyChanged` and `Connections` handlers are just syntactic sugar over slots.

- **Real code** (`src/set.h`, lines 122–133):
  ```cpp
  signals:
      void exerciseNameChanged();
      void weightKgChanged();
      void repsChanged();
      void volumeChanged();
      // ...
  ```
  And in `src/set.cpp`:
  ```cpp
  void Set::setWeightKg(double v) {
      if (m_weightKg == v) return;
      m_weightKg = v;
      emit weightKgChanged();         // emit the signal
      emit volumeChanged();           // side effect: volume changed too
  }
  ```
  QML listens:
  ```qml
  Connections {
      target: set
      function onWeightKgChanged() {
          chart.refresh();  // redraw the chart
      }
  }
  ```

- **(M6) Elaboration:** Emitting `volumeChanged()` when weight changes (even though volume is computed, not stored) is the key to reactivity. QML binds to `volume` and expects to be notified of changes. If the setter doesn't emit, the binding goes stale.

- **(M3) Retrieval check:** "If you emit `weightKgChanged()` but not `volumeChanged()`, and QML binds to both, what breaks?"

### Concept 7: The moc compiler — how Q_OBJECT works

- **(M7) Concrete hook:** You write `Q_OBJECT` in a header. The Qt build system runs the meta-object compiler (moc). It generates a hidden `_moc.cpp` file with reflection code. This file is compiled and linked. Now `set.metaObject()` returns introspection data that QML can query.

- **The idea:** `Q_OBJECT` is not magic — it's a signal to moc to generate glue code. The boilerplate:
  - A `staticMetaObject` (introspection tree: properties, methods, signals).
  - A `metaObject()` function that returns it.
  - `qt_metacall()` which handles invocations from QML.
  - The glue that connects signals to slots.

- **(M6) Elaboration:** This code generation is why Qt is powerful: you write simple, readable class definitions with `Q_PROPERTY`, and moc fills in the reflection plumbing. In languages without this (plain C++, Python), you'd have to hand-write introspection. Qt automated it.

- **(M3) Retrieval check:** "If you add a new Q_PROPERTY to a header but forget to rebuild, will QML see it?"

### Concept 8: Trade-offs — boilerplate vs. plain structs

- **(M4) Generate first:** "A Set has 10 fields. Each needs a Q_PROPERTY, getter, setter, signal — ~5 lines per field = 50 lines of boilerplate for a simple struct. When is that worth it?"

- **The idea:** `Q_PROPERTY` boilerplate (property + getter + setter + signal) is expensive. For a plain struct with no external communication, it's overkill. But for QML-exposed data, it's essential.
  - **Plain struct:** `struct Point { double x; double y; };` — no reflection, no reactivity, fast to write.
  - **QObject with properties:** `class Point : public QObject { Q_OBJECT; Q_PROPERTY(...) };` — reflection, reactivity, bindings, but 50+ lines per class.

- **When to use QObject:** 
  - You're exposing to QML (required).
  - You need change notifications (bindings, UI updates).
  - You're building a data model that multiple pages observe.

- **When to use plain struct:**
  - Pure C++, no QML involvement.
  - Simple value objects (Point, Color, Size).
  - Data structures passed by value, not reference.

- **Real code:** Set is a `QObject` because:
  - QML needs to display and edit it.
  - Changes (weight, reps) must trigger UI redraws.
  - WorkoutTracker holds a QVector<Set*> and emits signals when the collection changes.

- **(M3) Retrieval check:** "Would you make an RGB color struct inherit from QObject? Why or why not?"

### Concept 9: Singletons and dependency injection — the design choice

- **(M4) Generate first:** "WorkoutTracker holds all the app's data. Two patterns: (a) global singleton, everyone uses WorkoutTracker::instance(); (b) pass it as a dependency to each page. What's the trade-off?"

- **The idea:**
  - **Singleton:** Global access, no plumbing, but tight coupling. Testing is hard (you can't mock the global). If you want two instances (dev + test), it breaks.
  - **Dependency injection:** Pages receive WorkoutTracker in their constructor. Testable, loosely coupled, but more wiring code upfront.
  - Peak Fettle chose singleton: small codebase, one user, no need to mock. If it grows to 10 pages, the wiring cost of DI would be worth it.

- **Real code:** WorkoutTracker is a singleton (lines 36–37 in `src/WorkoutTracker.h`). Every page that needs it does:
  ```qml
  WorkoutTracker.logSet(...)
  ```
  Not:
  ```qml
  root.workoutTracker.logSet(...)  // would require dependency injection
  ```

- **(M6) Elaboration:** The singleton choice is documented implicitly in the code — there's one global instance and no constructor for users to call. If the codebase grows and testing becomes painful, migrating to DI is a future refactor. For now, it's the right trade-off.

- **(M3) Retrieval check:** "If you wanted to test WorkoutTracker with a mock database, what's the problem with the singleton pattern?"

## 6. Teach-back (M10)
"Explain to a C++ developer who's new to Qt in ~5 sentences: Why do you inherit from QObject, what does Q_PROPERTY do, how does QML call C++ code, and when would you use Q_INVOKABLE instead?"

## 7. Cumulative review (M13) — rapid-fire
1. What does `Q_OBJECT` macro tell the moc compiler to generate?
2. Write a full Q_PROPERTY declaration with READ, WRITE, and NOTIFY for a `QString exerciseName` field.
3. If you set `weightKg = 100` in QML and the setter emits only `weightKgChanged()` (not `volumeChanged()`), what breaks?

## 8. The graded quiz (Bloom L1–L5)

| # | Bloom | Type | Prompt | Rubric | Model answer | Pts |
|---|-------|------|--------|--------|--------------|-----|
| q1 | L1 | free | What does the `Q_OBJECT` macro do? | Identifies moc signal; explains that it enables reflection | The `Q_OBJECT` macro signals the meta-object compiler (moc) to generate reflection code that makes the class introspectable at runtime, so QML can inspect properties, invoke methods, and connect to signals. | 10 |
| q2 | L2 | free | Write a Q_PROPERTY declaration for a `double weightKg` with a getter `weightKg()`, setter `setWeightKg()`, and notification signal `weightKgChanged()`. | Correct syntax; all three clauses (READ, WRITE, NOTIFY) | Q_PROPERTY(double weightKg READ weightKg WRITE setWeightKg NOTIFY weightKgChanged) | 12 |
| q3 | L3 | free | Implement the setter `Set::setWeightKg(double v)`. It should clamp to 0–1000, check for no-op, emit the changed signal, and also emit volumeChanged (because volume depends on weight). | Applies clamping; guards no-op; emits both signals; shows understanding that derived properties notify | void Set::setWeightKg(double v) { const double clamped = std::clamp(v, 0.0, 1000.0); if (m_weightKg == clamped) return; m_weightKg = clamped; emit weightKgChanged(); emit volumeChanged(); } | 15 |
| q4 | L4 | free | Compare the property boilerplate cost (`Q_PROPERTY` + getter + setter + signal) to a plain struct with no reflection. When is the boilerplate justified, and when is a plain struct better? | Clear cost (lines of code, complexity); identifies when each is appropriate; shows trade-off reasoning | Boilerplate cost: ~50 lines per class. Justified when: QML needs to bind to it, or external code must react to changes. Plain struct is better for pure C++ value objects (Point, Color) with no QML involvement. For Set, QML needs binding and WorkoutTracker needs change notifications, so boilerplate is justified. | 18 |
| q5 | L5 | free | Evaluate the singleton pattern for WorkoutTracker: when is it the right choice, what are the downsides, and when would you refactor to dependency injection? | Takes position; weighs convenience vs. coupling; identifies the pain point (testing); contextualizes for codebase size | Right now (small app, one user, no need to mock): singleton is convenient, reduces plumbing. Downsides: tight coupling, hard to test with mocks, breaks if you need two instances. Refactor to DI when: pages grow to 10+, testing becomes painful, or you need multiple WorkoutTracker instances (e.g., multi-user). Current choice is sensible for pre-launch solo founder. | 22 |
| q6 | L5 | free | You want to add a progress reporting feature: `WorkoutTracker` emits `progressUpdated(int percentComplete)` when loading large datasets. QML connects with `onProgressUpdated`. But you forget to emit the signal in the loading code — now QML sees no updates. How would you diagnose this, and what's the root cause? | Proposes a debugging strategy (breakpoints, qDebug, signal inspection); identifies that emission is missing; names the root cause (forgotten emit or conditions prevent it) | Diagnose: Add qDebug() << "progressUpdated emitted" before the emit to verify it's called. Set breakpoints in the loading function. Use Qt's signal debugger if available. Root cause: the loading code paths don't emit, or a guard condition (e.g., if (changed)) prevents emission. Lesson: signals must be emitted explicitly — they don't auto-trigger. | 22 |

## 9. Custom interactive widget
**Property lifecycle explorer** — an interactive diagram showing:
- A C++ Set with `weightKg` property
- QML code reading and writing it
- Step-by-step walkthrough of: read (getter), write (setter checks and emits), signal emission, QML binding update
- Toggle to show clamping, the no-op guard, side-effect emissions (volume)
- Animated flow showing: "QML sets value" → "setter called" → "emit signal" → "QML binding updates"

Lets Arvin see the full cycle in real-time and understand what happens at each step.

## 10. End-of-session updates (agent)
- Grade quiz via the app's "Grade with Claude."
- Update `teacher_skill.md` PART 2: Qt familiarity before/after; understanding of Q_PROPERTY, signals, and meta-object system; singleton vs. DI choice for this codebase.
- Offer to schedule L20 (Build system & qmake) a few days out. Carry-over questions: "How does moc get run?" and "What's in a .pro file?"
