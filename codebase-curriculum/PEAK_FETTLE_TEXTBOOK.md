# Peak Fettle — Full-Stack Codebase Textbook

> All 25 lessons, initial-exposure format. Quizzes, interactive modules, and agent instructions stripped.

---

# Lesson L01 — The core domain model: Set, Exercise, WorkoutTracker

> **Track:** 0 — Foundations · **Status:** ⭐ Reference lesson (fully worked)
> **Estimated time:** ~35 min · **Prerequisite rungs:** none (this is the floor of the ladder)

## 1. Learning outcomes
By the end, Arvin can:
- **(L2)** Explain why `volume` is computed on read instead of stored, and what the `kind` discriminator does.
- **(L3)** Compute the Epley E1RM for a given set the way `estimatedOneRepMax()` does, including the `reps==1` case.
- **(L4)** Analyze the storage-narrowing/clamping asymmetry between lift fields (`quint16`/`qint8`, clamped) and cardio fields (not clamped), and what each choice implies.
- **(L5)** Evaluate the `progressSeries(perSet=false)` "best per day" default against a competitive power-user's needs, and the `reps==1` Epley exception as a data-integrity decision.

## 2. The difficulty ladder for THIS lesson
1. The atomic unit: what a `Set` is, and computed-on-read `volume`.
2. The `kind` discriminator (lift vs. cardio) and why one class holds both.
3. Storage narrowing + clamping (defensive invariants).
4. Grouping: `Exercise` owns its sets; `WorkoutTracker` owns everything via a `QHash`.
5. The derived metrics: Epley E1RM and the `reps==1` exception.
6. The "best per day" aggregation — a product decision encoded in code.

## 3. Concept sequence

### Concept 1: A `Set` is the atom; `volume` is computed, not stored
- "If you log 'bench 80 kg × 5', and the app shows 'volume: 400 kg', would you *store* that 400, or compute it when needed? Why?"
- one bench set → tonnage = weight × reps = 80 × 5 = 400.
- **The idea:** `volume` is a *derived* value. Storing derived values risks them drifting out of sync with their inputs (you edit the weight but forget to update volume). Computing on read makes the inputs the single source of truth. Analogy: you don't write your age in your passport — you write your birth date and compute age, because the birth date never goes stale.
- **Real code** (`src/set.h`):
  ```cpp
  double volume() const { return m_kind == QLatin1String("lift")
                                 ? m_weightKg * m_reps : 0.0; }
  ```
- why return `0.0` for cardio? Because cardio progress is distance/time, not tonnage — volume is meaningless there, and 0 is a safe sentinel the graph can skip.
- "Give one concrete bug that storing `volume` as a column would risk that computing-on-read avoids."

### Concept 2: One class, two shapes — the `kind` discriminator
- **The idea:** a `Set` is either a lift (`weightKg`, `reps`, `rir`) or cardio (`durationSec`, `distanceM`, `avgPaceSecPerKm`). Rather than two classes, one class carries a `kind` string ("lift"|"cardio") and the irrelevant fields hold a `-1` "not recorded" sentinel. This mirrors the backend `sets.kind` column exactly — same noun, same shape, two layers.
- **Real code:** the cardio path uses a *static factory* `Set::makeCardio(...)` instead of a constructor — "Static so callers never have to remember the argument order (duration comes before weight, which would be easy to mix up with the lift constructor)" (`src/set.cpp`).
- "Why a static factory for cardio instead of another constructor overload?"

### Concept 3: Storage narrowing & clamping — invariants enforced in the setter
- a number line showing reps clamped to 0–65535, RIR to −1..10.
- **The idea:** `reps` is stored as `quint16`, `rir`/`rpe` as `qint8` — chosen in a "size-shrink pass" because reps never realistically exceed ~200 and RIR is −1..10. The *public* API stays `int` so QML bindings don't change; the setters **clamp before narrowing** so a buggy caller (`rir=999`, negative reps) can't silently wrap around.
- **Real code** (`src/set.cpp`):
  ```cpp
  void Set::setReps(int v) {
      const int clamped = std::clamp(v, 0, 65535);
      if (m_reps == clamped) return;
      m_reps = static_cast<quint16>(clamped);
      emit repsChanged();
      emit volumeChanged();   // volume depends on reps, so notify it too
  }
  ```
- why does `setReps` emit `volumeChanged()` as well? Because `volume` is derived from reps — the UI bound to `volume` must redraw.
- **:** "cardio's `durationSec` is stored as `qint32` and is **not** clamped. Why the asymmetry?" (Headroom for ultra-endurance; and there's no tight storage bound to defend.) — this is the seed for quiz q3.

### Concept 4: Ownership — `Exercise` owns sets, `WorkoutTracker` owns everything
- "If you log 500 sets, who is responsible for freeing that memory in C++?"
- **The idea:** Qt uses parent-child ownership. `Exercise::addSet` calls `s->setParent(this)` — when the `Exercise` dies, Qt deletes its sets. `WorkoutTracker` keeps a `QHash<QString, Exercise*>` (name → Exercise) so logging a new rep of an existing movement is O(1).
- **Real code** (`src/exercise.cpp`):
  ```cpp
  void Exercise::addSet(Set *s) {
      if (!s) return;
      s->setParent(this);   // take ownership so Qt cleans it up
      m_sets.append(s);
      emit setsChanged();
  }
  ```
- "Why a `QHash` keyed by name rather than a plain list of exercises?"
- "1–5, how solid is ownership + the hash? What's fuzzy?"

### Concept 5: Derived metrics — Epley E1RM and the `reps==1` exception
- 100 kg × 5 → Epley E1RM = 100 × (1 + 5/30) = 116.7 kg.
- **The idea:** estimated 1-rep-max is the primary progress metric. Epley = `w·(1+reps/30)`. **But** if `reps == 1`, the user already did a true single — return the weight directly, *not* `w·(1+1/30)` which would inflate a 200 kg single to 206.7 kg (a 3.3% lie).
- **Real code** (`src/exercise.cpp`):
  ```cpp
  const double e1rm = (s->reps() == 1)
      ? s->weightKg()                               // true 1RM — no multiplier
      : s->weightKg() * (1.0 + s->reps() / 30.0);   // Epley for 2+ reps
  ```
- this value feeds `percentileForExercise()` and `percentilesForAll()`. Inflated E1RM → artificially high cohort percentile → the rankings (the product's competitive hook) become dishonest. The exception is a *data-integrity* decision, not a cosmetic one. → quiz q4.

### Concept 6: "Best per day" — a product decision living in the data layer
- **The idea:** `progressSeries(perSet=false)` returns **one point per training day — the best value for that metric that day**, not every set. This fixes the "your second set to failure made you look weaker" graph artifact that both a beta tester (Marcus) and the founder flagged. `perSet=true` exists for debug/export only; "UI should never pass true here" (`WorkoutTracker.h`).
- "You plot every set's E1RM over time. A user does a heavy top set then back-off sets. What does the graph look like, and why is that demotivating?"
- → quiz q5 (the L5 capstone).

## 4. Cumulative review — rapid-fire
1. What does `kind == "cardio"` change about how `volume` behaves?
2. Compute the E1RM of a 140 kg × 1 set and a 140 kg × 3 set. Why are they treated differently?
3. Why does `progressSeries` default to one best point per day?


---

# Lesson L02 — C++ language essentials in Peak Fettle

> **Track:** 0 — Foundations · **Status on roadmap:** core rung
> **Estimated time:** ~45 min (one sitting) · **Prerequisite rungs:** L01
>
> Prior knowledge assumed: basic C++ syntax (variables, functions, classes). C++ was *not yet assessed* in the profile — surface it in the live M1 survey below.

---

## 1. Learning Outcomes

By the end of this lesson, you will be able to:

**Bloom L1 (Recall):**
- [ ] List the four Qt smart-pointer / ownership patterns used in Peak Fettle
- [ ] Define const correctness and identify when it applies in member functions
- [ ] Recall the syntax and purpose of Q_PROPERTY and Q_INVOKABLE

**Bloom L2 (Understand):**
- [ ] Explain why Qt uses value types (QString, QVector) instead of the standard library
- [ ] Describe the header/implementation split and the purpose of include guards
- [ ] Diagram the parent-child ownership chain in the Set/Exercise/WorkoutTracker hierarchy

**Bloom L3 (Apply):**
- [ ] Write a new Q_PROPERTY with read/write accessors and notifications
- [ ] Convert a free function into a static factory method (following Set::makeCardio)
- [ ] Use std::clamp to validate and constrain an input value before storage

**Bloom L4 (Analyze):**
- [ ] Compare the Set lift constructor vs. the Set::makeCardio factory: evaluate design tradeoffs
- [ ] Audit a potential multi-threaded access pattern (hint: Set::nextId is atomic)
- [ ] Critique the storage choice of quint8 vs int in UserProfile and assess the cost/benefit

**Bloom L5 (Evaluate):**
- [ ] Redesign the UnitPreference singleton to support a third unit (stones); defend your choices
- [ ] Assess the tight coupling between QML and C++ in the Q_PROPERTY model, propose alternatives
- [ ] Evaluate whether WorkoutTracker should own Exercise objects directly or use smart pointers instead

---

## 2. Difficulty Ladder

**Rung 1:** Understanding include guards and header structure  
**Rung 2:** Reading Q_PROPERTY and connecting them to QML bindings  
**Rung 3:** Tracing object ownership (parent-child chains via new and setParent)  
**Rung 4:** Designing factory methods and constructor overloading  
**Rung 5:** Comparing storage strategies (quint8 vs int; atomic counters; static singletons)  
**Rung 6:** Evaluating the full design: constraints, trade-offs, and alternatives  

---

## 3. Concept Sequence

### Concept 1: Headers, Include Guards, and the Translation Unit

**Generate-first question:**
Why do C++ headers need include guards, and what happens if you forget them?

**Concrete hook:**
Look at `UnitPreference.h`:
```cpp
#ifndef PEAKFETTLE_UNITPREFERENCE_H
#define PEAKFETTLE_UNITPREFERENCE_H
// ... class definition ...
#endif // PEAKFETTLE_UNITPREFERENCE_H
```
This pattern appears in *every* Peak Fettle header. The names follow a convention: `PROJECTNAME_CLASSNAME_H`.

**Real code:**
```cpp
// UnitPreference.h (lines 23–24)
#ifndef PEAKFETTLE_UNITPREFERENCE_H
#define PEAKFETTLE_UNITPREFERENCE_H

#include <QObject>
#include <QSettings>
#include <QString>
#include <qqml.h>

class UnitPreference : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
    // ... rest of class ...
};

#endif
```

When the preprocessor encounters `#include "UnitPreference.h"` multiple times in a translation unit, the guard `#ifndef PEAKFETTLE_UNITPREFERENCE_H` prevents the class definition from being parsed twice. Without the guard:

```
// Bad: no include guard
class UnitPreference { ... };
class UnitPreference { ... };  // ERROR: redefinition
```

**Elaboration:**
A translation unit is a `.cpp` file plus all the headers it `#include`s. The compiler parses each translation unit separately, so it doesn't see that `main.cpp` and `exercise.cpp` both include `UnitPreference.h`. Within `main.cpp`'s translation unit, the guard ensures the header is included at most once. If you use `#pragma once` instead, you rely on the compiler to recognize "I've already seen this file by its path"; the standard-C approach (`#ifndef`) is more portable.

**Retrieval check:**
True or false: If you have a circular include dependency (`A.h` includes `B.h` and `B.h` includes `A.h`), include guards will prevent the compiler error.

*Answer:* False. Include guards prevent *multiple includes of the same file*; they do not break circular dependencies. Forward declarations are needed for that.

**Practice & checkpoint:**
Define: translation unit, include guard, and the difference between `#ifndef` and `#pragma once`.

---

### Concept 2: Qt Smart Pointers, Ownership, and Parent-Child Chains

**Generate-first question:**
In Qt, who is responsible for deleting objects that are created with `new`?

**Concrete hook:**
In `Exercise::addSet`, every Set is added to an Exercise:
```cpp
void Exercise::addSet(Set *s) {
    if (!s) return;
    s->setParent(this);          // this Exercise becomes the Set's parent
    m_sets.append(s);
    emit setsChanged();
}
```

When the Exercise is deleted, Qt automatically deletes all of its children (all Sets in `m_sets`). This is Qt's ownership model. No manual `delete` is needed.

**Real code:**
From `set.h` (line 64–72):
```cpp
class Set : public QObject {
    Q_OBJECT
    QML_ELEMENT
    // ...
public:
    explicit Set(QObject *parent = nullptr);
    Set(const QString &exerciseName, double weightKg, int reps, int rir = -1,
        const QDateTime &timestamp = QDateTime::currentDateTime(),
        QObject *parent = nullptr);
    
    static Set *makeCardio(const QString &exerciseName,
                           int durationSec,
                           double distanceM = -1.0,
                           double avgPaceSecPerKm = -1.0,
                           const QDateTime &timestamp = QDateTime::currentDateTime(),
                           QObject *parent = nullptr);
};
```

Every constructor accepts an optional `parent`. If you don't pass one, the Set is unowned and leaks. If you pass a parent (an Exercise), the parent owns it.

From `exercise.cpp` (lines 52–57):
```cpp
void Exercise::addSet(Set *s) {
    if (!s) return;
    s->setParent(this);          // Make Exercise the parent
    m_sets.append(s);
    emit setsChanged();
}
```

WorkoutTracker owns Exercises; Exercises own Sets. When WorkoutTracker is destroyed (at app shutdown), all Exercises are destroyed, and all Sets are destroyed.

**Elaboration:**
This is different from std::shared_ptr and std::unique_ptr. In the standard library, you explicitly manage who owns an object via pointer type. In Qt, all QObjects have an owner (their parent), and ownership is hierarchical. This simplifies lifetime management for GUI applications where objects form tree hierarchies (just like the DOM in a web app).

**Retrieval check:**
If you call `new Exercise()` without a parent and forget to `delete` it, what happens?
- (A) Qt automatically deletes it when the app exits
- (B) Memory leak; Qt does not manage parentless QObjects
- (C) Compiler error
- (D) Runtime error

*Answer:* (B). Parentless QObjects leak. Always provide a parent or store the pointer in a smart container.

**Practice & checkpoint:**
Draw a tree diagram showing the ownership chain: WorkoutTracker → {Exercise_1, Exercise_2, ...} → {Set_1, Set_2, ...}. Label who deletes whom.

---

### Concept 3: Q_PROPERTY, Signals, and QML Binding

**Generate-first question:**
Why does UnitPreference define both a Q_PROPERTY and a signal (unitChanged), and what happens in QML when you bind to a property?

**Concrete hook:**
Here's the full UnitPreference class interface:
```cpp
// From UnitPreference.h (lines 31–40)
class UnitPreference : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON

    Q_PROPERTY(QString unit READ unit WRITE setUnit NOTIFY unitChanged)
    Q_PROPERTY(bool isLbs READ isLbs NOTIFY unitChanged)
    Q_PROPERTY(QString suffix READ suffix NOTIFY unitChanged)
    Q_PROPERTY(QString inputLabel READ inputLabel NOTIFY unitChanged)
    Q_PROPERTY(QString placeholderExample READ placeholderExample NOTIFY unitChanged)

public:
    explicit UnitPreference(QObject *parent = nullptr);
    static UnitPreference *create(QQmlEngine *, QJSEngine *);

    QString unit()   const { return m_unit; }
    bool    isLbs()  const { return m_unit == QStringLiteral("lbs"); }
    void setUnit(const QString &u);

    Q_INVOKABLE double toDisplay(double kg) const;
    Q_INVOKABLE double toKg(double displayValue) const;
    Q_INVOKABLE QString format(double kg) const;
    Q_INVOKABLE QString suffix() const { return isLbs() ? QStringLiteral("lb") : QStringLiteral("kg"); }

signals:
    void unitChanged();

private:
    QString   m_unit;
    QSettings m_settings;
    // ...
};
```

In QML, you can bind directly:
```qml
Text { text: UnitPreference.format(70.0) }
```

When the user changes the unit (via a settings toggle), `setUnit` is called, which emits `unitChanged()`. Every QML binding that depends on a UnitPreference property automatically re-evaluates.

**Real code:**
From `UnitPreference.cpp` (lines 29–41):
```cpp
void UnitPreference::setUnit(const QString &u) {
    // Guard: only accept "kg" or "lbs".
    const QString normalized = (u == QStringLiteral("lbs"))
                               ? QStringLiteral("lbs")
                               : QStringLiteral("kg");

    if (m_unit == normalized) return;

    m_unit = normalized;
    saveToSettings();
    emit unitChanged();
}
```

Notice the pattern:
1. Normalize/validate the input
2. Early return if unchanged (guards against signal spam)
3. Update the member variable
4. Save to persistence (QSettings)
5. Emit the signal

Every property that changed as a side effect is also notified with the same signal. This is efficient because unit changes are rare.

**Elaboration:**
Q_PROPERTY is a Qt-specific macro that the `moc` (Meta-Object Compiler) parses at build time. The macro generates helper code that QML can call. The READ getter, WRITE setter, and NOTIFY signal are all specified in the macro. QML "knows" about these properties at runtime via Qt's meta-object system.

Without Q_PROPERTY, a C++ class is invisible to QML. With it, QML can read, write, and observe the property like it's a native JavaScript object.

**Retrieval check:**
In the property `Q_PROPERTY(QString unit READ unit WRITE setUnit NOTIFY unitChanged)`:
- The READ part is the `unit()` getter
- The WRITE part is the `setUnit()` setter
- The NOTIFY part is `unitChanged()` signal

What happens if you change the unit in C++ but don't emit `unitChanged()`?

*Answer:* QML bindings that depend on `unit` won't know it changed and won't re-evaluate. The UI will show stale data.

**Practice & checkpoint:**
Explain the difference between Q_PROPERTY (compile-time macro) and a regular C++ member variable and getter/setter. Why is the macro necessary for QML?

---

### Concept 4: Constructor Overloading and Static Factory Methods

**Generate-first question:**
Why does Set have two constructors (one for lifts, one factory method for cardio), and what problem does the factory method solve?

**Concrete hook:**
Look at the Set interface:
```cpp
// From set.h (lines 64–82)
explicit Set(QObject *parent = nullptr);

Set(const QString &exerciseName,
    double weightKg,
    int reps,
    int rir = -1,
    const QDateTime &timestamp = QDateTime::currentDateTime(),
    QObject *parent = nullptr);

static Set *makeCardio(const QString &exerciseName,
                       int durationSec,
                       double distanceM = -1.0,
                       double avgPaceSecPerKm = -1.0,
                       const QDateTime &timestamp = QDateTime::currentDateTime(),
                       QObject *parent = nullptr);
```

The lift constructor takes `(exerciseName, weightKg, reps, rir, timestamp, parent)`.  
The cardio factory takes `(exerciseName, durationSec, distanceM, avgPaceSecPerKm, timestamp, parent)`.

If both were constructors, a caller would get confused:
```cpp
// Ambiguous! Did I mean weight and reps, or duration and distance?
Set *s = new Set("Running", 10.0, 5);
```

The factory method makes the intent explicit:
```cpp
Set *s = Set::makeCardio("Running", 600 /* sec */, 5000 /* m */);
```

**Real code:**
From `set.cpp` (lines 40–58):
```cpp
Set *Set::makeCardio(const QString &exerciseName,
                     int durationSec,
                     double distanceM,
                     double avgPaceSecPerKm,
                     const QDateTime &timestamp,
                     QObject *parent)
{
    auto *s = new Set(parent);
    s->m_exerciseName    = exerciseName;
    s->m_kind            = QStringLiteral("cardio");
    s->m_durationSec     = durationSec;
    s->m_distanceM       = distanceM;
    s->m_avgPaceSecPerKm = avgPaceSecPerKm;
    s->m_timestamp       = timestamp.isValid() ? timestamp : QDateTime::currentDateTime();
    return s;
}
```

The factory:
1. Calls the empty constructor (defaults all fields to safe values)
2. Manually sets the cardio-specific fields
3. Returns the fully constructed pointer

**Elaboration:**
This is a common C++ pattern when you have multiple "kinds" of objects that share a base class but have different construction requirements. Rather than overload the constructor with many optional parameters (which gets confusing), you provide static factory methods with descriptive names. The name `makeCardio` tells readers "this creates a cardio Set," and the parameter list makes sense in context.

**Retrieval check:**
What is the type of the expression `Set::makeCardio(...)`?
- (A) Set
- (B) Set *
- (C) Set &
- (D) auto

*Answer:* (B). The factory method returns `Set *`, a pointer. This is necessary because `new` allocates on the heap and returns a pointer.

**Practice & checkpoint:**
Write a static factory method `Set::makeSprint(exerciseName, distanceMetre, timeSeconds, parent)` for a distance-based sprint. What fields should it set, and why return a pointer instead of a reference?

---

### Concept 5: Const Correctness and Tight Binding

**Generate-first question:**
What does the `const` at the end of a member function declaration mean, and why does it matter?

**Concrete hook:**
From `UnitPreference.h`:
```cpp
QString unit()   const { return m_unit; }
bool    isLbs()  const { return m_unit == QStringLiteral("lbs"); }
double  toDisplay(double kg) const;
QString format(double kg) const;
```

And from `UnitPreference.cpp` (lines 43–67):
```cpp
double UnitPreference::toDisplay(double kg) const {
    return isLbs() ? (kg / KG_PER_LB) : kg;
}

QString UnitPreference::format(double kg) const {
    if (isLbs()) {
        const int lbs = static_cast<int>(std::round(kg / KG_PER_LB));
        return QString::number(lbs) + QStringLiteral(" lb");
    } else {
        if (kg < 100.0) {
            return QString::number(kg, 'f', 1) + QStringLiteral(" kg");
        } else {
            return QString::number(static_cast<int>(std::round(kg))) + QStringLiteral(" kg");
        }
    }
}
```

The `const` promise: "This function does not modify any member variables." The compiler enforces this—if you try to write `m_unit = "foo"` inside `toDisplay`, you get a compile error.

**Real code (example violation):**
```cpp
// WRONG: violates const promise
double UnitPreference::toDisplay(double kg) const {
    m_unit = "lbs";  // ERROR: Cannot assign to m_unit in const function
    return kg / KG_PER_LB;
}
```

**Elaboration:**
Const correctness is a contract. When you see `const` on a member function, you know it's safe to call from anywhere—it won't surprise you by changing the object's state. QML bindings rely on this: if you call a const getter and it secretly modifies the object, the binding won't be notified.

Some people ignore const and write const-unsafe code (like casting it away with `const_cast`). Don't do this in Peak Fettle. The codebase maintains strict const correctness.

**Retrieval check:**
Can you call a const member function on a non-const object?

*Answer:* Yes. `const` is a promise the function makes; it's okay to call it anywhere.

Can you call a non-const member function on a const object?

*Answer:* No. The compiler will error.

**Practice & checkpoint:**
Identify the functions in Exercise that should be const and the ones that should not. Justify each choice.

---

### Concept 6: Storage Choices (quint8, std::clamp, Atomic Counters)

**Generate-first question:**
Why does UserProfile store age as `quint8` instead of `int`, and what is the cost of this choice?

**Concrete hook:**
From `UserProfile.h`:
```cpp
private:
    quint8  m_ageYears              = 0;     // 0 = unset
    QString m_sex;                            // "" = unset; "M" / "F"
    quint8  m_yearsTraining         = 0;
    quint8  m_targetWorkoutsPerWeek = 0;     // 0 = unset; 1..7 valid
    double  m_bodyweightKg          = 0.0;   // 0 = unset
```

And the public interface:
```cpp
int     ageYears()              const { return static_cast<int>(m_ageYears); }
```

The storage is 8-bit unsigned (0–255); the public interface is 32-bit signed. Why?

Answer: Every age value realistic for a user (14–90) fits in a single byte. By using `quint8`, each UserProfile object saves 3 bytes per field compared to `int`. With thousands of users, this compounds. But QML (and the public API) expects `int`, so we cast on the way out.

**Real code:**
From `UserProfile.cpp`:
```cpp
void UserProfile::setAgeYears(int v) {
    // Clamp to the valid range before assigning to quint8.
    constexpr int kMinAge = 14;
    constexpr int kMaxAge = 90;
    const int clamped = std::clamp(v, kMinAge, kMaxAge);
    
    if (m_ageYears == static_cast<quint8>(clamped)) return;
    m_ageYears = static_cast<quint8>(clamped);
    emit profileChanged();
}
```

`std::clamp(value, min, max)` returns the value clamped to [min, max]. It prevents out-of-range assignment. If a buggy caller passes -5, clamp returns 14. If they pass 150, clamp returns 90.

From `set.cpp` (lines 82–89):
```cpp
void Set::setReps(int v) {
    // Clamp to the storage range before assigning to quint16.
    const int clamped = std::clamp(v, 0, 65535);
    if (m_reps == clamped) return;
    m_reps = static_cast<quint16>(clamped);
    emit repsChanged();
    emit volumeChanged();
}
```

Reps is stored as `quint16` (0–65535, enough for any realistic rep count). Negative reps don't make sense, so we clamp to [0, 65535].

**Atomic counter (Set IDs):**
From `set.cpp` (lines 9–13):
```cpp
qint64 Set::nextId() {
    static std::atomic<qint64> counter{0};
    return ++counter;
}
```

Every Set gets a unique, monotonically increasing ID. `std::atomic<qint64>` ensures that if two threads try to increment the counter simultaneously, they get different IDs (no collision). Currently, Peak Fettle is single-threaded, but this is future-proofed.

**Elaboration:**
Choosing storage types is a tradeoff:
- **Memory:** quint8 uses 1 byte; int uses 4. Save 75% per field.
- **Speed:** Modern CPUs load 8/16/32/64-bit values at nearly the same speed. Rarely a bottleneck.
- **Clarity:** `int` is clearer; `quint8` is an implementation detail. We expose `int` in the public API.
- **Safety:** Clamping ensures you never store invalid values. std::clamp is defensive programming.

**Retrieval check:**
If you try to store age = 200 in a UserProfile (max realistic is 90), what happens?
- (A) Compile error
- (B) Runtime error
- (C) Silent wrap-around to a garbage value (no clamp)
- (D) Clamped to 90 by the setter

*Answer:* (D). The setter calls `std::clamp(200, 14, 90)` → 90, then casts to quint8. Safe.

**Practice & checkpoint:**
List the member variables in Exercise and propose a more memory-efficient storage layout (consider quint32 for set count, etc.). Calculate the savings.

---

## 4. Cumulative Review

Answer in 1–2 sentences each. These questions mix concepts from L01 and L02.

**Q1:** Explain the three ways a Set can be created (empty constructor, lift constructor, cardio factory) and when you'd use each.

**Q2:** If you wanted to add a new preference (e.g., imperialHeight: feet vs meters), would it belong in UnitPreference or UserProfile? Why?

**Q3:** What happens to all Sets when an Exercise is deleted? Who is responsible for that deletion?

**Q4:** Why is `const` on a member function important for QML bindings?

**Q5:** True or false: The public API of UserProfile exposes `int` for age, but the implementation uses `quint8`. This is good API design because it hides implementation details. Defend your answer.

---

## Summary of C++ Essentials

This lesson covered the practical C++ idioms and Qt patterns used throughout Peak Fettle:

1. **Translation unit model:** Headers with include guards; the linker's role
2. **Ownership & lifetime:** Parent-child chains; no manual delete needed for QObjects
3. **Reactivity:** Q_PROPERTY and signals; QML binding and notifications
4. **API design:** Factory methods for clarity; constructor overloading tradeoffs
5. **Const correctness:** Promise and contract; safe for QML bindings
6. **Efficient storage:** quint8/quint16 for bounded ranges; std::clamp for validation; atomic counters for thread-safety

All concepts are grounded in production code from the Peak Fettle codebase. The next lesson (L03) covers the domain math (Epley formula, strength curves, percentiles) that these C++ classes compute.


---

# Lesson L03 — Domain math: strength curves, Epley, and percentile ranking

> **Track:** 0 — Foundations · **Status on roadmap:** core rung
> **Estimated time:** ~50 min (one sitting) · **Prerequisite rungs:** L01, L02
>
> Prior knowledge assumed: comfort with logs and exponents. Bloom range L2–L5.

---

## 1. Learning Outcomes

By the end of this lesson, you will be able to:

**Bloom L2 (Understand):**
- [ ] Explain the Epley formula and its limitations (accuracy range, why true 1RM ≠ computed 1RM)
- [ ] Describe the four factors in the strength model (bodyweight, age, training years, lift type)
- [ ] Define log-normal distribution and explain why it fits strength data

**Bloom L3 (Apply):**
- [ ] Calculate a user's 1RM-equivalent from a 3×100kg set using Epley
- [ ] Compute age and training experience factors from a user profile
- [ ] Use a lift vector (μ, σ) to compute a raw z-score for a lift

**Bloom L4 (Analyze):**
- [ ] Compare v1 and v2 of the model; identify what broke in v1 and how v2 fixed it
- [ ] Trace a percentile calculation end-to-end for a specific user and lift
- [ ] Critique the calibration anchors (strength standards table) and discuss missing populations
- [ ] Analyze the age curve piecewise function (youth, peak, decline) against real data

**Bloom L5 (Evaluate):**
- [ ] Redesign the model to support weight classes (IPF/USPA style) instead of continuous bodyweight
- [ ] Critique the 0–1000 gamified strength score and propose an alternative scoring scheme
- [ ] Assess whether the log-normal model remains valid for untrained vs. elite populations
- [ ] Defend the decision to use inheritance (front squat as child of back squat) versus direct-fit all lifts

---

## 2. Difficulty Ladder

**Rung 1:** Understanding the Epley formula and calculating 1RM-equivalents  
**Rung 2:** Computing individual factors (bodyweight allometric scaling, age curve, training curve)  
**Rung 3:** Combining factors into a full expected-lift calculation  
**Rung 4:** Applying the log-normal model (z-score → percentile) and understanding calibration  
**Rung 5:** Evaluating the model design and proposing improvements or alternatives  

---

## 3. Concept Sequence

### Concept 1: The Epley Formula — From Reps to 1RM

**Generate-first question:**
If you can lift 100 kg for exactly 3 reps, what is your estimated 1-rep-max?

**Concrete hook:**
The Epley formula is one of the most famous approximations in strength training. When you log a set as "100 kg × 3 reps," we don't know your true 1RM (you haven't tested it), but we can estimate it.

**Epley formula:**
```
1RM ≈ weight × (1 + reps / 30)
```

For 100 kg × 3 reps:
```
1RM ≈ 100 × (1 + 3/30) = 100 × 1.1 = 110 kg
```

**Real code (src/exercise.cpp, lines 31–50):**
```cpp
double Exercise::estimatedOneRepMax() const {
    // Epley: 1RM = w * (1 + reps/30). Only meaningful for reps >= 2;
    // beyond ~12 reps the formula loses accuracy, but we still surface a value.
    //
    // N-03/X-04 (2026-05-03): when reps == 1 the user already performed a
    // true 1-rep-max attempt — return weightKg directly so a 200 kg single
    // shows as exactly 200 kg, not 206.7 kg (3.3% Epley inflation).
    double best = 0.0;
    for (const Set *s : m_sets) {
        if (s->reps() <= 0) continue;
        const double e1rm = (s->reps() == 1)
            ? s->weightKg()                                      // true 1RM — no multiplier
            : s->weightKg() * (1.0 + s->reps() / 30.0);        // Epley for 2+ reps
        if (e1rm > best) best = e1rm;
    }
    return best;
}
```

Notice: The code special-cases reps == 1. If the user actually tested a true 1RM (e.g., "200 kg × 1 rep"), we return 200 kg, not 200 × 1.033 = 206.7 kg.

**Elaboration:**
The Epley formula is empirical—it was derived by fitting strength data, not derived from first principles. It works reasonably well for reps in the 2–12 range. Beyond 12 reps (e.g., "50 kg × 25 reps"), the formula becomes less accurate because fatigue and metabolic factors (not just pure strength) start to dominate.

Other formulas exist:
- **Brzycki:** `1RM = weight / (1.0278 − 0.0278 × reps)` (similar accuracy)
- **Lander:** Uses a different quadratic; slightly more accurate for high reps
- **Mayhew:** Another variant

Peak Fettle uses Epley because it's simple, famous, and gives sensible results in the training range (2–12 reps). Users expect it.

**Retrieval check:**
If you can bench 80 kg for 6 reps, what's your estimated 1RM?
- (A) 80 kg
- (B) 86 kg (80 × 1.2)
- (C) 96 kg (80 × 1.2)
- (D) 100 kg

*Answer:* (C). `80 × (1 + 6/30) = 80 × 1.2 = 96 kg`.

What if you logged "80 kg × 1 rep"?

*Answer:* The code returns exactly 80 kg (true 1RM, no multiplication).

**Worked Example 1:**
A user logs three sets of back squats:
- Set 1: 100 kg × 8 reps → E1RM = 100 × (1 + 8/30) = 100 × 1.267 = 126.7 kg
- Set 2: 120 kg × 4 reps → E1RM = 120 × (1 + 4/30) = 120 × 1.133 = 136 kg
- Set 3: 130 kg × 2 reps → E1RM = 130 × (1 + 2/30) = 130 × 1.067 = 138.7 kg

The Exercise's estimated 1RM is the max: **138.7 kg**.

**Practice & checkpoint:**
Derive the Epley formula from first principles: assume strength (1RM) is constant, and that rep count is determined by metabolic fatigue over reps. Why does the formula have the form `1 + reps/30`? (Hint: 30 is chosen empirically.)

---

### Concept 2: The Log-Normal Distribution and Why It Models Strength

**Generate-first question:**
Why is a normal distribution (bell curve) a poor model for strength data, and what distribution is better?

**Concrete hook:**
Strength has a hard lower bound (zero weight) and a soft upper bound (genetic ceiling). If you plot the distribution of 1RMs across a population, you get a right-skewed curve—many people are weaker, fewer are very strong. This is *not* a normal distribution.

The log-normal distribution models this naturally. If you take the *log* of strengths and plot them, you get a normal distribution.

**The model:**
In Peak Fettle, we assume the log of a lift weight follows a normal distribution:
```
ln(L) ~ Normal(μ, σ²)
```

where:
- `L` is the lift weight in kg
- `μ` is the log of the 50th-percentile (median) lift
- `σ` is the standard deviation of the log

**Why log-normal?**
Consider: at 75 kg bodyweight, the intermediate male bench press is ~75 kg (1× bodyweight). The range is roughly:
- Beginner: 0.5 × BW = 37.5 kg
- Intermediate: 1.0 × BW = 75 kg
- Advanced: 1.25 × BW = 93.75 kg
- Elite: 1.5 × BW = 112.5 kg

The *ratios* are consistent (each level is ~0.6× the next), but the absolute differences grow. This is multiplicative scaling—the hallmark of log-normal data.

Mathematically:
```
ln(37.5) ≈ 3.62
ln(75)   ≈ 4.32  (difference: 0.70)
ln(93.75) ≈ 4.54 (difference: 0.22)
ln(112.5) ≈ 4.72 (difference: 0.18)
```

Wait, that's backwards—the log differences *decrease* at higher strength levels. This is because the absolute differences grow, but they're smaller as a *percentage* of the median.

**Real code (StrengthCurve.cpp, lines 212–284):**
```cpp
Result percentile(const QString &liftId,
                  const QString &sex,
                  double bodyweightKg,
                  int    ageYears,
                  int    yearsTraining,
                  double liftKg)
{
    // ... input validation ...
    
    // Expected median lift L₅₀ (in kg) — computed from model
    const double l50 = std::exp(mu) * bwFactor * ageFactor * trainFactor;
    
    // Z-score in log space
    double z = (std::log(liftKg) - std::log(l50)) / sigma;
    z = std::clamp(z, -4.0, 4.0);  // clamp extreme outliers
    
    // Percentile via standard normal CDF
    const double pct = 100.0 * phi(z);
    
    out.percentile = std::clamp(pct, 0.003, 99.997);
    out.expectedKg = l50;
    out.hasModel = true;
    return out;
}
```

The calculation:
1. Compute expected median lift `L₅₀` (the 50th-percentile lift for your profile)
2. Compute z-score: `z = (ln(your_lift) - ln(L₅₀)) / σ`
3. Look up percentile via the standard normal CDF: `Φ(z)`

**Elaboration:**
The standard normal CDF Φ(z) converts a z-score to a percentile:
- z = 0 → Φ(0) = 0.5 → 50th percentile
- z = 1 → Φ(1) ≈ 0.84 → 84th percentile
- z = 2 → Φ(2) ≈ 0.98 → 98th percentile
- z = -1 → Φ(-1) ≈ 0.16 → 16th percentile

This is why the model uses log-normal: once you transform to log-space, the familiar Gaussian math applies.

**Retrieval check:**
If `σ = 0.2` (the within-experience standard deviation for bench press), and your lift is exactly at the median (`L = L₅₀`), what is your percentile?

*Answer:* z = (ln(L₅₀) - ln(L₅₀)) / 0.2 = 0 / 0.2 = 0. Φ(0) = 0.5 = 50th percentile. Correct.

**Worked Example 2:**
A 75 kg male, age 25, with 2 years of training history logs a 100 kg bench press.

From the lift vector (bench_press, M): μ ≈ 4.32, σ ≈ 0.25

Expected median (all factors = 1.0 for this reference profile): L₅₀ = exp(4.32) ≈ 75 kg

Z-score: z = (ln(100) - ln(75)) / 0.25 = (4.605 - 4.317) / 0.25 = 0.288 / 0.25 = 1.15

Percentile: Φ(1.15) ≈ 0.875 = 87.5th percentile

So a 100 kg bench at this profile is very good (87th percentile among trained males of the same age, BW, and experience).

**Practice & checkpoint:**
Plot the probability density function (PDF) of the log-normal distribution (as a sketch). Label the mean (μ), the expected value E[L], and the mode. Which is largest, and why?

---

### Concept 3: The Four Factors — Bodyweight, Age, Training, Lift Type

**Generate-first question:**
Why does a stronger bodyweight advantage exist for some lifts (squat) but not others (overhead press)? How does the model account for this?

**Concrete hook:**
Intuitively, a heavier person has more muscle mass and can lift more weight. But the advantage isn't 1:1. A 100 kg lifter can't lift 2× what an 50 kg lifter can; the ratio is smaller. This is *allometric scaling*—the relationship between body size and performance.

The model uses four multiplicative factors:

```
L₅₀ = exp(μ) × B(BW) × A(age) × T(years)
```

**Factor 1: Bodyweight Allometric Scaling**
```
B(BW) = (BW / BW₀)^α
```

- `BW` is your bodyweight (kg)
- `BW₀` is a reference bodyweight (75 kg for males, 65 kg for females)
- `α` is the allometric exponent (≈ 0.667 for most lifts)

Example: A male at 100 kg (reference is 75 kg):
```
B(100) = (100 / 75)^0.667 = (1.333)^0.667 ≈ 1.209
```

So a 100 kg lifter gets a ~20.9% boost vs. the 75 kg reference.

Why 0.667? This is the "2/3 law" from biology—strength scales with cross-sectional area (proportional to mass^(2/3)).

From strength_curve_model.md:
```
| Lift | M Beg | M Nov | M Int | M Adv | M Eli |
|------|-------|-------|-------|-------|-------|
| Squat | 0.75 | 1.25 | 1.50 | 2.00 | 2.50 |
| Bench | 0.50 | 0.75 | 1.00 | 1.25 | 1.50 |
| Deadlift | 1.00 | 1.50 | 1.75 | 2.25 | 2.75 |
| OHP | 0.40 | 0.55 | 0.65 | 0.85 | 1.05 |
```

These are bodyweight multiples. Notice:
- Squat and deadlift are much higher (more dependent on bodyweight)
- OHP is lower (less dependent)
- Bench is in between

The allometric exponent `α` is the *same* (0.667) for all lifts, but the `μ` (the intercept) differs. This is baked into the lift vectors.

**Factor 2: Age (Piecewise Linear)**
```
         ⎧ 1 − γ_y · (A_pl − age)        if age < 23 (youth)
A(age) = ⎨ 1                            if 23 ≤ age ≤ 35 (peak)
         ⎩ max(0.40, 1 − γ_d · (age − 35))  if age > 35 (decline)
```

- `γ_y = 0.012` (youth deficit per year)
- `γ_d = 0.010` (decline per year post-peak)
- Peak window is 23–35 (factor = 1.0)

Example: A 20-year-old (3 years before peak):
```
A(20) = 1 − 0.012 × (23 − 20) = 1 − 0.036 = 0.964
```
They're at ~96.4% of their peak strength.

A 50-year-old (15 years post-peak):
```
A(50) = max(0.40, 1 − 0.010 × (50 − 35)) = max(0.40, 1 − 0.15) = max(0.40, 0.85) = 0.85
```
They retain 85% of their peak.

**Factor 3: Training Experience (Exponential Kinetics)**
```
T(years) = f₀ + (1 − f₀) · (1 − exp(−years / τ))
```

- `f₀` is the training floor (fraction at t=0, never trained)
- `τ ≈ 3.0` years (time constant)
- As years → ∞, T → 1.0

> **Source-accuracy note (verify against code):** the worked examples below use the *spec's* per-lift floor `f₀` (e.g. ≈0.327 for male bench, from `strength_curve_model.md` / `compute_percentile.sql`'s `training_floor`). The shipped **C++ port** (`src/StrengthCurve.cpp`) instead uses a single global constant `kTrainingFloor = 0.55` for every lift — a simplification. So hand-computed example percentiles will track the SQL output, but the C++ app's numbers will differ slightly. When teaching, point this divergence out; it's a real spec-vs-implementation gap worth an L4 discussion.

Example: Bench press, f₀ ≈ 0.327:
```
T(0)   = 0.327                                              = 0.327 (beginner)
T(2)   = 0.327 + (1 − 0.327) × (1 − exp(−2/3)) ≈ 0.655    = intermediate
T(4)   = 0.327 + 0.673 × (1 − exp(−4/3)) ≈ 0.823          = advanced
T(∞)   = 0.327 + 0.673 × 1 = 1.0                          = asymptote
```

The floor `f₀` is per-lift, derived so that `T(0) × exp(μ)` matches the beginner standard.

**Factor 4: Lift Type (μ, σ from lift vector)**

Different lifts have different difficulty. Back squat intermediate: 1.5 × BW. OHP intermediate: 0.65 × BW. The lift vector encodes this as `μ` (the log of the asymptote lift at reference profile).

**Real code (StrengthCurve.cpp, lines 250–269):**
```cpp
// Factor 1: bodyweight allometric
const double bwFactor = std::pow(bw / bwRef, alpha);

// Factor 2: piecewise age curve
double ageFactor;
if (age < kAgeYouthBoundary) {
    ageFactor = 1.0 - kGammaYouth * (kAgeYouthBoundary - age);
} else if (age <= kAgePeakUpper) {
    ageFactor = 1.0;
} else {
    ageFactor = std::max(kAgeFloor,
                         1.0 - kGammaDecline * (age - kAgePeakUpper));
}

// Factor 3: training-experience kinetics
const double trainFactor = kTrainingFloor
    + (1.0 - kTrainingFloor) * (1.0 - std::exp(-yrs / kTrainingTau));

// Combined expected log lift L₅₀
const double l50 = std::exp(mu) * bwFactor * ageFactor * trainFactor;
```

**Elaboration:**
The model is multiplicative, not additive. This means:
- A 10% increase in bodyweight → ~6.7% increase in lift (because α = 0.667)
- Youth deficit of 1 year → 1.2% loss (γ_y = 0.012)
- Effects compound: being young AND small AND untrained → significantly weaker

This is realistic. A 15-year-old who's just started training will be much weaker than a 35-year-old in their 5th year.

**Retrieval check:**
A 30-year-old male, 85 kg bodyweight, 3 years training history. What are the four factors for bench press?

Assume: BW₀ = 75, α = 0.667, age peak = 23–35 (so factor = 1.0), f₀ ≈ 0.327, τ = 3.0, exp(μ) ≈ 75 kg (intermediate reference).

- B(85) = (85/75)^0.667 ≈ 1.096 (+9.6%)
- A(30) = 1.0 (within peak window)
- T(3) = 0.327 + 0.673 × (1 − exp(−1)) ≈ 0.327 + 0.673 × 0.632 ≈ 0.752
- L₅₀ = 75 × 1.096 × 1.0 × 0.752 ≈ 62 kg

So for this profile, the expected median bench is ~62 kg.

**Worked Example 3: Full Calculation**

User: Female, 70 kg, age 28, 5 years training, logs 55 kg bench press.

From lift vector (bench_press, F): μ ≈ 3.82, σ ≈ 0.275, α = 0.667, BW₀ = 65, f₀ ≈ 0.267, τ = 3.0

Step 1: Bodyweight factor
```
B(70) = (70 / 65)^0.667 = (1.077)^0.667 ≈ 1.051
```

Step 2: Age factor
```
A(28) = 1.0 (28 is within 23–35 peak window)
```

Step 3: Training factor
```
T(5) = 0.267 + (1 − 0.267) × (1 − exp(−5 / 3))
     = 0.267 + 0.733 × (1 − exp(−1.667))
     = 0.267 + 0.733 × (1 − 0.189)
     = 0.267 + 0.733 × 0.811
     ≈ 0.267 + 0.595 ≈ 0.862
```

Step 4: Expected median
```
L₅₀ = exp(3.82) × 1.051 × 1.0 × 0.862
    ≈ 45.9 × 1.051 × 0.862
    ≈ 41.5 kg
```

Step 5: Z-score
```
z = (ln(55) − ln(41.5)) / 0.275
  = (4.007 − 3.726) / 0.275
  = 0.281 / 0.275
  ≈ 1.02
```

Step 6: Percentile
```
Φ(1.02) ≈ 0.846 → 84.6th percentile
```

**Conclusion:** This user's 55 kg bench is excellent for her profile—84.6th percentile among females of the same age, weight, and training experience.

**Practice & checkpoint:**
A user complains: "I'm the same age as my training buddy, same bodyweight, same years training—but he can deadlift 250 kg and I can only do 220 kg. Why does the percentile model say we should be the same?" 

What are three reasons they might differ, and which can the model account for?

---

### Concept 4: Lift Inheritance and Composability

**Generate-first question:**
Front squat is weaker than back squat. Should front squat be modeled independently, or as a scaled version of back squat?

**Concrete hook:**
There are ~40 exercises in the Peak Fettle lift table. Fitting a unique model (μ, σ, α) for every single exercise would require huge datasets. Instead, the model uses *inheritance*: many exercises are modeled as scaled versions of a parent lift.

For example:
```
back_squat (M):     μ = 4.7228, σ = 0.3107   [direct fit]
front_squat (M):    ratio = 0.85, inherits from back_squat
```

The front squat inherits σ, α, and other parameters from back squat. But its μ is adjusted:
```
μ_front = μ_back + ln(0.85) = 4.7228 + ln(0.85) = 4.7228 − 0.1625 ≈ 4.56
```

So the front squat is expected to be 85% as heavy as the back squat (for the same user).

**Real code (StrengthCurve.cpp, lines 134–153):**
```cpp
bool resolveRow(const LiftRow *row, double &mu, double &sigma,
                double &alpha, double &bwRef) {
    if (!row) return false;
    if (!row->parentId) {
        // Direct fit: return stored values directly
        mu    = row->mu;
        sigma = row->sigma;
        alpha = row->alpha;
        bwRef = row->bwRef;
        return true;
    }
    const LiftRow *parent = findRow(QLatin1String(row->parentId), row->sex);
    if (!parent || parent->parentId) return false;
    
    // Child mu = parent mu + log(ratio); sigma/alpha/bwRef inherited.
    mu    = parent->mu + std::log(row->ratio);
    sigma = parent->sigma;
    alpha = parent->alpha;
    bwRef = parent->bwRef;
    return true;
}
```

**Lift inheritance table:**
```
back_squat (direct):      μ = 4.7228, σ = 0.3107, ratio = —
front_squat (inherited):  ratio = 0.85, μ_eff = 4.7228 + ln(0.85) ≈ 4.56
low_bar_squat (inherited):ratio = 1.05, μ_eff = 4.7228 + ln(1.05) ≈ 4.75
leg_press (inherited):    ratio = 2.50, μ_eff = 4.7228 + ln(2.50) ≈ 5.56

bench_press (direct):     μ = 4.3175, σ = 0.2466, ratio = —
incline_bench (inherited):ratio = 0.78, μ_eff = 4.3175 + ln(0.78) ≈ 4.11
dumbbell_bench (inherited):ratio = 0.42, μ_eff = 4.3175 + ln(0.42) ≈ 3.20
```

**Elaboration:**
Inheritance is a way to encode domain knowledge:
- Front squat is mechanically different (more quad-dominant, less glute/lower-back) → expected to be weaker
- Leg press is easier (machine provides stability) → expected to be stronger
- Dumbbell press is harder (stabilization required) → expected to be much weaker

By using ratios, we avoid fitting 40 separate models and instead leverage the 5 main lifts (back squat, bench, deadlift, OHP, barbell row) as reference points.

**Retrieval check:**
If a user logs 100 kg back squat (intermediate male, 75 kg BW, age 25, 2yr training), what should we expect them to log on front squat?

*Answer:* Front squat ratio is 0.85, so we'd expect roughly 0.85 × 100 = 85 kg. Actually, it's more nuanced because the model works in log-space, but the intuition is right.

More precisely:
- Back squat E1RM: 100 kg
- Back squat μ: 4.7228
- Expected median (B=1.0, A=1.0, T=0.655): exp(4.7228) × 1.0 × 1.0 × 0.655 ≈ 75 kg
- If they logged 100 kg, they're above median
- Front squat μ_eff: 4.56, expected median: exp(4.56) × 0.655 ≈ 63.7 kg
- Scale factor: μ difference is 4.56 − 4.7228 ≈ −0.16, which is ln(0.85)
- Ratio in linear space: exp(−0.16) ≈ 0.85

So the expected front squat is 85% of the back squat, all else equal.

**Practice & checkpoint:**
Critique the inheritance model: Under what circumstances would a direct fit for front squat (instead of inheritance) be justified? What data would you need?

---

### Concept 5: Calibration, v1 Bugs, and v2 Fixes

**Generate-first question:**
What does "calibration" mean in the context of the strength model, and how do you know if a model is well-calibrated?

**Concrete hook:**
The model has many parameters (μ, σ, α, f₀, τ, age curve coefficients). How do we choose their values? We calibrate against *ground truth*: empirical strength standards.

From strength_curve_model.md:
```
| Lift | M Beg | M Nov | M Int | M Adv | M Eli |
|------|-------|-------|-------|-------|-------|
| Squat | 0.75 | 1.25 | 1.50 | 2.00 | 2.50 |
| Bench | 0.50 | 0.75 | 1.00 | 1.25 | 1.50 |
| Deadlift | 1.00 | 1.50 | 1.75 | 2.25 | 2.75 |
| OHP | 0.40 | 0.55 | 0.65 | 0.85 | 1.05 |
```

These are bodyweight multiples, sourced from Strength Level (n > 2M self-reported entries), Nuckols, ExRx, and Lyle McDonald. They represent consensus about what constitutes "intermediate" (2 years training), "advanced" (4+ years), etc.

**V1 Bug:**
In v1, the model had a critical error. μ was set to `ln(intermediate_standard × BW₀)`, making the intermediate standard the *long-run ceiling*. But the training factor `T(years)` asymptotes to 1.0 at infinite years, so:

```
L₅₀(fully trained) = exp(μ) × 1.0 = intermediate_standard × BW₀
```

This predicts that a lifter with infinite training is only at the intermediate level—which is clearly wrong. Advanced and elite standards are empirically higher.

Prediction for a 4-year male trainee (25yo, 75 kg):
- T(4) ≈ 0.82
- L₅₀ = 75 × 0.82 = 61.5 kg

But the intermediate standard is 75 kg. The model predicted only 82% of intermediate—a massive underestimate.

**V2 Fix:**
In v2, μ is now set to `ln(asymptote × BW₀)`, where the asymptote is much higher than intermediate. Specifically:

```
f₀ = fraction at t=0 (beginner)
T(2yr) = fraction at t=2yr (intermediate)

μ is solved so that:
  T(∞) × exp(μ) = very_high_ceiling (genetic potential)
```

Then f₀ is derived from two calibration anchors:
```
T(0) × exp(μ) = beginner_standard × BW₀
T(2yr) × exp(μ) = intermediate_standard × BW₀
```

Solving these two equations gives f₀.

Example (bench, M):
```
Beginner:     0.50 × 75 = 37.5 kg
Intermediate: 1.00 × 75 = 75 kg

T(0) = f₀
T(2yr) = f₀ + (1 − f₀) × (1 − exp(−2/3)) ≈ f₀ + 0.673 × 0.487 ≈ f₀ + 0.327

Equations:
  f₀ × exp(μ) = 37.5
  (f₀ + 0.327) × exp(μ) = 75

Dividing:
  (f₀ + 0.327) / f₀ = 2
  f₀ + 0.327 = 2f₀
  f₀ = 0.327

exp(μ) = 37.5 / 0.327 ≈ 114.7 kg

So μ = ln(114.7) ≈ 4.74
```

Now, at 4 years:
```
T(4) = 0.327 + 0.673 × (1 − exp(−4/3)) ≈ 0.327 + 0.673 × 0.735 ≈ 0.823
L₅₀ = 114.7 × 0.823 ≈ 94.4 kg
```

The intermediate standard is 75 kg; the advanced standard is 1.25 × 75 = 93.75 kg. The model predicts 94.4 kg for 4 years—spot on!

**Real code (compute_percentile.sql, lines 220–286):**
```sql
CREATE OR REPLACE FUNCTION compute_percentile(
    p_lift_id        TEXT,
    p_sex            CHAR(1),
    p_bodyweight_kg  DOUBLE PRECISION,
    p_age            INTEGER,
    p_training_yrs   DOUBLE PRECISION,
    p_lift_kg        DOUBLE PRECISION,
    p_model_version  INTEGER DEFAULT 2
)
RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
STABLE PARALLEL SAFE AS $$
DECLARE
    v RECORD;
    bw_clamped     DOUBLE PRECISION;
    age_clamped    INTEGER;
    yrs_clamped    DOUBLE PRECISION;
    age_factor     DOUBLE PRECISION;
    train_factor   DOUBLE PRECISION;
    bw_factor      DOUBLE PRECISION;
    log_expected   DOUBLE PRECISION;
    z              DOUBLE PRECISION;
BEGIN
    -- Input validation
    IF p_lift_kg IS NULL OR p_lift_kg <= 0 THEN RETURN NULL; END IF;
    IF p_bodyweight_kg IS NULL OR p_bodyweight_kg <= 0 THEN RETURN NULL; END IF;
    IF p_age IS NULL OR p_age < 10 THEN RETURN NULL; END IF;
    IF p_sex NOT IN ('M','F') THEN RETURN NULL; END IF;

    -- Clamp inputs
    bw_clamped  := GREATEST(40, LEAST(p_bodyweight_kg, CASE p_sex WHEN 'M' THEN 210 ELSE 150 END));
    age_clamped := GREATEST(14, LEAST(p_age, 90));
    yrs_clamped := GREATEST(0, LEAST(COALESCE(p_training_yrs, 0), 30));

    -- Resolve parameter vector
    SELECT * INTO v FROM resolve_lift_vector(p_lift_id, p_sex, p_model_version);

    -- Factor 1: Bodyweight
    bw_factor := power(bw_clamped / v.bw_ref_kg, v.alpha);

    -- Factor 2: Age
    IF age_clamped < v.age_peak_lo THEN
        age_factor := GREATEST(0.40, 1.0 - v.youth_decay_per_year * (v.age_peak_lo - age_clamped));
    ELSIF age_clamped <= v.age_peak_hi THEN
        age_factor := 1.0;
    ELSE
        age_factor := GREATEST(0.40, 1.0 - v.age_decay_per_year * (age_clamped - v.age_peak_hi));
    END IF;

    -- Factor 3: Training
    train_factor := v.training_floor +
                   (1.0 - v.training_floor) *
                   (1.0 - exp(-yrs_clamped / v.training_tau_years));

    -- Combined expected log lift
    log_expected := v.mu + ln(bw_factor) + ln(age_factor) + ln(train_factor);

    -- Z-score
    z := GREATEST(-4.0, LEAST(4.0, (ln(p_lift_kg) - log_expected) / v.sigma));

    RETURN 100.0 * norm_cdf(z);
END;
$$;
```

**Elaboration:**
Calibration is an iterative process:
1. Gather ground-truth data (strength standards from competition databases, user surveys)
2. Fit the model to match those standards
3. Test predictions on new data
4. If predictions are biased, refine the model

Peak Fettle's v2 model was calibrated by solving for μ and f₀ such that intermediate and advanced trainees map correctly. The resulting model passes validation on Strength Level (n > 2M) and Bielik 2024 (n > 800k competition entries).

**Retrieval check:**
In v1, why did the model predict that a lifter with 10 years of training was only at the intermediate level?

*Answer:* Because μ was set to the intermediate standard. The training factor asymptotes to 1.0, so the expected median is always the intermediate standard, regardless of how long you've trained.

**Practice & checkpoint:**
If a user complains "Your model says I should be able to bench 95 kg, but I can only do 85 kg"—what are three reasons the model prediction might be wrong (besides the model being fundamentally broken)?

---

### Concept 6: The 0–1000 Gamified Strength Score

**Generate-first question:**
Why would a user care about a 0–1000 "strength score" instead of just looking at their raw 1RM?

**Concrete hook:**
Raw 1RM numbers are hard to interpret. Is 100 kg bench good? It depends on bodyweight, age, experience. A 0–1000 normalized score lets users see themselves on a universal scale and track progress linearly.

Peak Fettle uses a **saturating exponential** ramp, tuned so that 100 kg E1RM lands at ~600:
```
strength_score = 1000 × (1 − exp(−k × e1rm_kg)),   k = 0.00916
strength_score = 0                                  [if e1rm ≤ 0]
```

At 100 kg the score is:
```
1000 × (1 − exp(−0.00916 × 100)) = 1000 × (1 − 0.400) ≈ 600
```

At 120 kg:
```
1000 × (1 − exp(−0.00916 × 120)) = 1000 × (1 − 0.333) ≈ 667
```

The 20 kg jump (100 → 120) yields only a ~67-point increase (600 → 667), and each further 20 kg buys less — the curve *saturates*. That is the design intent: early progress feels fast, and the top of the scale (1000) is an asymptote nobody quite reaches, so there is always headroom.

**Real code (`src/WorkoutTracker.cpp`, `computeStrengthScore`):**
```cpp
double WorkoutTracker::computeStrengthScore(double e1rmKg) {
    // Goal: an encouraging, gently-curved 0–1000 ramp.
    // Math: 1000 * (1 - exp(-k * e1rm)), with k tuned so 100 kg ~= 600.
    //       Solve 1 - exp(-k * 100) = 0.6  =>  k = -ln(0.4)/100 ~= 0.00916.
    if (e1rmKg <= 0.0) return 0.0;
    constexpr double k = 0.00916;
    const double score = 1000.0 * (1.0 - std::exp(-k * e1rmKg));
    if (score < 0.0)    return 0.0;
    if (score > 1000.0) return 1000.0;
    return score;
}
```

**Elaboration:**
The 0–1000 scale is arbitrary; the *shape* is the design choice. Alternatives:
- **Linear** in E1RM — equal kg always adds equal points (no saturation; no asymptote).
- **Percentile-based** — use the cohort percentile as the score (couples the score to the whole model, not just your own lift).
- **Saturating exponential** (what Peak Fettle uses) — fast early gains, diminishing returns, a 1000 ceiling nobody reaches.

Peak Fettle chose the saturating exponential because:
1. **Psychology:** Beginners see large early jumps, which is when motivation matters most.
2. **Headroom:** The asymptote means the bar is never "maxed," so there is always a next point to chase.
3. **Self-contained:** It depends only on your own E1RM, so it updates instantly without recomputing cohort percentiles.

Note it depends only on E1RM, *not* on bodyweight/age/sex — so it is a personal-progress meter, not a peer comparison. The percentile model (Concepts 2–5) is the peer-comparison metric.

**Retrieval check:**
Using `score = 1000 × (1 − exp(−0.00916 × e1rm))`, roughly what score does a 50 kg E1RM give?
- (A) 0
- (B) ~250
- (C) ~370
- (D) ~600

*Answer:* (C). `1000 × (1 − exp(−0.458)) = 1000 × (1 − 0.633) ≈ 367`.

**Worked Example 4: Score Progression**
A user's bench press progress (scores from the real exponential formula):
- Month 1: E1RM = 60 kg → 1000 × (1 − exp(−0.550)) ≈ **423**
- Month 3: E1RM = 75 kg → ≈ **497**  (+74)
- Month 6: E1RM = 90 kg → ≈ **562**  (+65)
- Month 9: E1RM = 105 kg → ≈ **618** (+56)

Equal 15 kg jumps in E1RM yield *shrinking* point gains (+74, +65, +56) — the saturation is visible in the numbers. Contrast this with the linear alternative, where every 15 kg would add the same amount.

**Practice & checkpoint:**
Propose an alternative gamified score that gives more credit to higher numbers (e.g., 120 kg bench should be rewarded more than 60 kg bench). Sketch a formula and justify it.

---

## 4. Cumulative Review

Answer in 2–3 sentences each. These questions mix concepts from L01, L02, and L03.

**Q1:** A user logs "200 kg deadlift × 1 rep" and "190 kg × 3 reps" on the same day. What is the Exercise's estimated 1RM? Explain why the code returns this value.

**Q2:** Why is the allometric exponent (α) the same (~0.667) for all lifts, but the median lift differs (bench vs. squat)? Which parameter controls the difference?

**Q3:** If you wanted to add a new experience level between "intermediate" (2 years) and "advanced" (4 years)—say, "high intermediate" (3 years)—how would you calibrate the model?

**Q4:** The age curve is piecewise linear. Would a smooth exponential curve (e.g., strength declines as e^(-age)) be better? What are the tradeoffs?

**Q5:** Why does the model use inheritance (front squat = 0.85 × back squat) instead of directly fitting every exercise? When would direct-fit be necessary?

---

## Summary of Domain Math

This lesson covered the quantitative framework underlying Peak Fettle's percentile ranking:

1. **Epley formula:** Converts reps/weight into 1RM-equivalent; valid for 2–12 reps
2. **Log-normal distribution:** Right-skewed strength data; log transform yields Gaussian
3. **Four factors:** Bodyweight (allometric α=0.667), age (piecewise linear, 23–35 peak), training experience (exponential kinetics, f₀ varies per lift), lift type (μ, σ from vector)
4. **Lift inheritance:** Accessories modeled as scaled versions of parent lifts (front squat = 0.85 × back squat)
5. **Calibration and v2 fix:** V1 bug (asymptote was intermediate standard); v2 fixes by deriving μ and f₀ from two calibration anchors
6. **Gamified scoring:** 0–1000 saturating-exponential score, `1000 × (1 − exp(−0.00916 × e1rm))` (≈600 at 100 kg), for fast early wins and a ceiling that's never maxed

All math is grounded in production code. The next lesson (L04) covers how these equations are implemented in C++ and SQL.


---

# L04: Relational Modeling & the Postgres Schema

**Peak Fettle Codebase Curriculum**  
**Bloom Levels:** L1 (Recall), L2 (Understand), L3 (Apply), L4 (Analyze), L5 (Evaluate)  
**Estimated read time:** 60 minutes  
**Prerequisites:** L01, L02, L03  
**Code sources:** `migrations/20260430_initial_schema.sql`, `migrations/` directory

---

## 0. Why This Matters

When you log a workout set, Peak Fettle doesn't store a giant JSON blob. Instead, your data lives in **normalized database tables** connected by **primary keys** and **foreign keys**. This lesson teaches you *why* that design matters, *how* tables relate to each other, and *where the indexes are* and why they exist. You'll read the `initial_schema.sql` file, trace a data journey from a mobile tap to a Postgres row, and learn to ask: "Should I store this derived column, or compute it on the fly?"

By the end, you'll be able to:
- Draw a schema diagram and explain each relationship.
- Read a migration file and spot normalization violations.
- Defend storage decisions (e.g., caching `dayKey` vs. computing it from `logged_at`).
- Predict which queries will be fast (because they can use an index) vs. slow.

---

## 1. Core Concepts: Tables, Rows, Columns

### 1.1 The Relational Model (vs. Objects)

In C++, the mobile app sees a **Set** as an object with properties:

```cpp
struct Set {
    UUID id;
    UUID workoutId;
    UUID exerciseId;
    enum Kind { Lift, Cardio } kind;
    
    // Lift fields
    int reps;
    double weightKg;
    
    // Cardio fields
    int durationSec;
    double distanceM;
};
```

In Postgres, that becomes a **table**: `sets` with **rows** (one per set logged) and **columns** (the fields).

```sql
CREATE TABLE sets (
    id                  UUID PRIMARY KEY,
    workout_id          UUID NOT NULL,
    exercise_id         UUID NOT NULL,
    kind                TEXT NOT NULL,
    reps                SMALLINT,
    weight_kg           NUMERIC(6,2),
    duration_sec        INTEGER,
    distance_m          NUMERIC(8,2)
);
```

**Key difference:** The enum `Kind { Lift, Cardio }` becomes a TEXT column with a CHECK constraint. The database doesn't have a native "discriminated union" type, so we use a string and verify it at the SQL layer.

### 1.2 Primary Keys: The Identity

Every row in a table has a **primary key** — a column (or set of columns) that *uniquely identifies* that row. In Peak Fettle, it's almost always UUID:

```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
```

This means:
- No two sets share the same `id`.
- When you retrieve a set, you ask the DB for `WHERE id = ?`.
- The primary key is automatically indexed (fast lookup).

### 1.3 Foreign Keys: Relationships

A **foreign key** says "this column references the primary key of another table."

```sql
CREATE TABLE sets (
    id            UUID PRIMARY KEY,
    workout_id    UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exercise_id   UUID NOT NULL REFERENCES exercises(id)
);
```

This creates a **one-to-many** relationship:
- One user → many workouts.
- One workout → many sets.
- One exercise → many sets (across all users).

The `ON DELETE CASCADE` rule means: "If a workout is deleted, automatically delete all sets in that workout." Without this, you'd have **orphaned rows** (sets pointing to a workout that no longer exists).

### 1.4 Constraints: Business Rules

Constraints enforce **invariants** — facts that must always be true.

```sql
kind TEXT NOT NULL CHECK (kind IN ('lift','cardio'))
```

This says: "You cannot INSERT a set with `kind = 'swimming'`; only 'lift' or 'cardio' are allowed." The database refuses bad data at the source, not in the app.

Other common constraints in Peak Fettle:

```sql
-- A workout must belong to a user
user_id UUID NOT NULL

-- The UNIQUE constraint prevents duplicate (user, day) pairs
-- (one workout per user per day)
UNIQUE (user_id, day_key)

-- Check: either lift fields are populated OR cardio fields are
CHECK (
    (kind = 'lift'   AND reps IS NOT NULL AND weight_kg IS NOT NULL)
    OR
    (kind = 'cardio' AND duration_sec IS NOT NULL)
)
```

---

## 2. Peak Fettle Schema: A Walkthrough

### 2.1 Users Table

```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    display_name    TEXT,
    
    -- Cohort demographics (used by percentile engine)
    sex             TEXT CHECK (sex IN ('M', 'F', 'X')),
    birth_date      DATE,
    weight_class_kg NUMERIC(5,2),
    years_in_sport  SMALLINT,
    experience_level TEXT,
    
    tier            TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free','paid')),
    unit_pref       TEXT NOT NULL DEFAULT 'kg' CHECK (unit_pref IN ('kg','lbs')),
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
```

**Key observations:**

1. **Email is unique** — no two users can share an email address.
2. **Cohort demographics** (`sex`, `birth_date`, `weight_class_kg`, `years_in_sport`) are stored here because the percentile engine reads them to compute rankings.
3. **Soft delete** — `deleted_at` is NOT NULL only if the user is deleted. Queries filter with `WHERE deleted_at IS NULL` so soft-deleted data isn't visible but isn't lost.
4. **Audit columns** — `created_at` and `updated_at` track when records were created and last modified.

### 2.2 Exercises Table (Global Library)

```sql
CREATE TABLE exercises (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL CHECK (length(name) <= 100),
    category        TEXT NOT NULL CHECK (category IN ('lift','cardio','sport','mobility')),
    muscle_groups   TEXT[],
    is_compound     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exercises_name_trgm ON exercises USING gin (name gin_trgm_ops);
```

**Key observations:**

1. **Global library** — one `back_squat` exercise shared by all users. Users don't each create their own exercise.
2. **Trigram GIN index** — enables fuzzy search (TICKET-007). The `gin_trgm_ops` operator breaks the exercise name into 3-character substrings so a search for "squat" matches "back_squat" even if the user typed "sqat".
3. **Array column** — `muscle_groups TEXT[]` stores a PostgreSQL array, e.g., `['quads', 'glutes']`.

### 2.3 Workouts Table

```sql
CREATE TABLE workouts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_key         DATE NOT NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE (user_id, day_key)
);

CREATE INDEX idx_workouts_user_day ON workouts(user_id, day_key DESC);
```

**Design choice:** A "workout" is one calendar day per user. If you log sets on Monday, they all belong to the same workout. The `day_key` is a DATE (e.g., `'2026-05-21'`), not a timestamp, so the UI renders "Monday" not "Monday 14:30:15 UTC".

**The index** `(user_id, day_key DESC)` is **composite**: it speeds up queries like:

```sql
SELECT * FROM workouts WHERE user_id = ? ORDER BY day_key DESC LIMIT 10;
```

This is how the app loads "my last 10 workout days" without a table scan.

### 2.4 Sets Table (The Core Log)

```sql
CREATE TABLE sets (
    id                  UUID PRIMARY KEY,
    workout_id          UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exercise_id         UUID NOT NULL REFERENCES exercises(id),
    kind                TEXT NOT NULL CHECK (kind IN ('lift','cardio')),
    set_index           SMALLINT NOT NULL,
    
    -- LIFT fields
    reps                SMALLINT,
    weight_kg           NUMERIC(6,2),
    rir                 SMALLINT,
    
    -- CARDIO fields
    duration_sec        INTEGER,
    distance_m          NUMERIC(8,2),
    avg_pace_sec_per_km NUMERIC(6,2),
    
    logged_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CHECK (
        (kind = 'lift'   AND reps IS NOT NULL AND weight_kg IS NOT NULL)
        OR
        (kind = 'cardio' AND duration_sec IS NOT NULL)
    )
);

CREATE INDEX idx_sets_user_logged  ON sets(user_id, logged_at DESC);
CREATE INDEX idx_sets_workout      ON sets(workout_id, set_index);
CREATE INDEX idx_sets_exercise     ON sets(exercise_id);
```

**Design pattern:** "One table, two types of rows." Rather than separate `lift_sets` and `cardio_sets` tables, we use a discriminator column (`kind`) and a CHECK constraint to enforce that lift rows have lift data and cardio rows have cardio data.

**Indexes explained:**

- `idx_sets_user_logged` — "Get all sets for user X, most recent first." This powers the strength chart (showing your last 50 squat attempts).
- `idx_sets_workout` — "Get all sets in workout Y, in order." This powers rendering the workout log.
- `idx_sets_exercise` — "Get all sets for exercise Z." Used by the percentile engine.

---

## 3. Primary Keys, Foreign Keys, and Normalization

### 3.1 One-to-Many Relationships

Peak Fettle's core relationships form a **hierarchy**:

```
users (1) ──→ (many) workouts
             ├─ (many) sets
             ├─ (many) streaks
             └─ (many) plans

exercises (1) ──→ (many) sets
                  (across all users)
```

When you delete a user, the `ON DELETE CASCADE` rule ensures:
1. All their workouts are deleted.
2. All their sets are deleted (because they're attached to workouts).
3. All their streaks, plans, etc. are deleted.

**Without CASCADE:** Deleting a user would fail if any sets still reference them, forcing you to manually delete rows in the right order. CASCADE makes deletion atomic and safe.

### 3.2 Normalization: The Three Rules

**First Normal Form (1NF):** Atomic values only.

```sql
-- WRONG: array of exercises in one column
CREATE TABLE workout_logs (
    exercises TEXT[]  -- ['back_squat', 'bench_press']
);

-- RIGHT: one exercise per row
CREATE TABLE sets (
    exercise_id UUID REFERENCES exercises(id)
);
```

Peak Fettle follows 1NF strictly: every column is a scalar value (UUID, TEXT, INTEGER, etc.), except `muscle_groups TEXT[]` in exercises (which is a rare exception for denormalization performance).

**Second Normal Form (2NF):** No partial dependencies (doesn't apply to single-key tables).

**Third Normal Form (3NF):** No transitive dependencies.

```sql
-- WRONG: storing exercise name in sets
CREATE TABLE sets (
    exercise_id UUID,
    exercise_name TEXT  -- ← depends on exercises.name, not the primary key
);

-- RIGHT: store only the reference; join to get the name
CREATE TABLE sets (
    exercise_id UUID REFERENCES exercises(id)
);
SELECT s.*, e.name FROM sets s JOIN exercises e ON s.exercise_id = e.id;
```

**When to denormalize:** Peak Fettle **caches** a few values in `sets` for performance:

```sql
CREATE TABLE sets (
    user_id UUID,  -- ← could be derived from workout_id → user_id
    ...
);
```

Why? Because **every set query needs the user_id** (for Row-Level Security; see L06). Storing it avoids a join to workouts. This is a deliberate, documented denormalization.

### 3.3 Indexes: B-Trees and Why They Matter

An **index** is a data structure that speeds up lookups. The most common is a **B-tree**.

```sql
CREATE INDEX idx_sets_user_logged ON sets(user_id, logged_at DESC);
```

Without this index, querying "all sets for user X, sorted by date" requires a **full table scan** — reading every row in the sets table. With the index, the database jumps directly to user X's rows (logarithmic time).

**Composite indexes** work on multiple columns. `(user_id, logged_at DESC)` is useful because it's sorted first by user, then by date, so it can answer:
- "Get all sets for user X" — uses the user part.
- "Get all sets for user X, newest first" — uses both parts.

**When to index:**
- Foreign keys (always).
- Columns in WHERE clauses.
- Columns used in ORDER BY.
- Columns in composite keys (e.g., `percentile_vectors` lookup: exercise + sex + age + weight).

**The cost of indexing:**
- Every INSERT, UPDATE, DELETE is slightly slower (the index must be updated too).
- Storage overhead (the index is stored on disk).

Peak Fettle is conservative with indexes: it has ~12 across all tables, because the data volume is small (months 1–12) and the queries are simple.

---

## 4. Naming Conventions & Caching Decisions

### 4.1 Why `dayKey`, Not `workoutDate`?

In the C++ mobile app, when you log a set, the code caches the date:

```cpp
std::string dayKey = formatDate(std::chrono::now());  // "2026-05-21"
```

This is stored in the database:

```sql
CREATE TABLE workouts (
    day_key DATE NOT NULL,
    ...
);
```

**Question:** Should `day_key` be a column, or should the UI compute it from `logged_at` each time?

**The codebase chose:** Store it as `dayKey` in the database and cache it in the app.

**Why:**
1. **Rendering speed** — The app doesn't re-format dates on every render. `dayKey` is already a string.
2. **Correctness** — Defining "this set belongs to Monday" as "the same `dayKey`" is simpler than "same calendar day in the user's timezone."
3. **Grouping** — Queries that group by day are instant: `WHERE day_key = ?`.

**The trade-off:** You're storing a derived value (date derived from `logged_at`). If you had millions of rows, you might compute it on the fly to save space. But for this app, storage is cheap; clarity is expensive.

### 4.2 Naming Rules

Peak Fettle follows these conventions:

- **snake_case** for columns: `weight_kg`, `logged_at`, `user_id`.
- **UPPERCASE for keywords:** `CREATE`, `SELECT`, `WHERE`.
- **Timestamps with timezone:** `TIMESTAMPTZ`, stored in UTC. `created_at TIMESTAMPTZ DEFAULT NOW()`.
- **Weights in kg only:** The schema stores weights in kilograms; the UI converts to lbs at render time (per CTO rule).
- **UUIDs for IDs:** UUID (128-bit), not auto-increment integers. Better for distributed systems.

---

## 5. Worked Example: Tracing a Data Journey

**Scenario:** A user logs a squat set on May 21, 2026 at 14:30 UTC.

**Step 1: Mobile app captures the data.**

```cpp
Set liftSet;
liftSet.id = generateUUID();  // "550e8400-e29b-41d4-a716-446655440001"
liftSet.exerciseId = "back_squat_uuid";
liftSet.reps = 5;
liftSet.weightKg = 100.0;
liftSet.loggedAt = std::chrono::now();  // 2026-05-21T14:30:00Z
```

**Step 2: Insert into the database.**

The app sends this JSON to the backend:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "workoutId": "workout_uuid",
  "exerciseId": "back_squat_uuid",
  "kind": "lift",
  "reps": 5,
  "weightKg": 100.0,
  "loggedAt": "2026-05-21T14:30:00Z"
}
```

The backend inserts:

```sql
INSERT INTO sets
  (id, workout_id, user_id, exercise_id, kind, set_index, reps, weight_kg, logged_at)
VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'workout_uuid', 'user_uuid', 'back_squat_uuid', 'lift', 3, 5, 100.0, '2026-05-21T14:30:00Z');
```

The database checks:
- Does `workout_uuid` exist in workouts? ✓
- Does `user_uuid` exist in users? ✓
- Does `back_squat_uuid` exist in exercises? ✓
- Is `kind = 'lift'`? ✓
- Are `reps` and `weight_kg` non-NULL? ✓
- All constraints pass, row is inserted.

**Step 3: Query it back.**

The app requests "all sets from my May 21 workout, in order":

```sql
SELECT s.id, s.kind, s.reps, s.weight_kg, s.duration_sec, e.name
FROM sets s
JOIN exercises e ON s.exercise_id = e.id
WHERE s.workout_id = 'workout_uuid'
ORDER BY s.set_index;
```

The database:
1. Uses the index `idx_sets_workout` to find all rows with `workout_id = 'workout_uuid'`.
2. Joins to exercises (very fast, small table).
3. Returns the rows sorted by `set_index`.

**Step 4: Percentile update (weekly batch).**

The cron job (see L05) runs weekly:

```sql
SELECT u.best_one_rm_kg, ...
FROM v_user_lift_inputs u
WHERE u.lift_id = 'back_squat' AND u.user_id = 'user_uuid';
```

This view reads from sets and computes the best Epley E1RM for the user's squat. The result is used to compute a percentile and stored in `user_percentile_rankings`.

---

## 6. Indexing Deep Dive

### 6.1 B-Tree Index Structure

A B-tree is a balanced tree. For `idx_sets_user_logged`:

```
                  [user_id ranges]
                  /      |       \
            [u1 sets] [u2 sets] [u3 sets]
            /  |  \    ...
         [older] [newer]
```

When you query `WHERE user_id = 'u2' ORDER BY logged_at DESC`, the database:
1. Traverses the tree to find all 'u2' nodes (logarithmic time).
2. Reads them in reverse order (already sorted by logged_at).

**Without the index:** Full table scan, O(N). **With the index:** O(log N + M) where M is the number of matching rows.

### 6.2 Trigram Index (pg_trgm)

The exercises table has:

```sql
CREATE INDEX idx_exercises_name_trgm ON exercises USING gin (name gin_trgm_ops);
```

This breaks names into 3-character substrings (trigrams):

```
"back_squat"  →  " ba", "bac", "ack", "ck_", "k_s", ...
```

When you search for "sqat" (typo), it matches "squat" by finding overlapping trigrams. This enables fuzzy search without a full table scan.

### 6.3 Composite Index Behavior

The index `idx_sets_user_logged (user_id, logged_at DESC)` is sorted first by user_id, then by logged_at within each user. This is fast for:

```sql
WHERE user_id = '123'              -- uses both columns
WHERE user_id = '123' AND logged_at > NOW() - INTERVAL '7 days'  -- uses both
```

But **not** for:

```sql
WHERE logged_at > NOW() - INTERVAL '7 days'  -- must scan all users' timestamps
```

Because the index is sorted by user_id first, skipping that condition requires reading the entire index.

---

## 7. Row-Level Security and Indexes

Peak Fettle uses **Row-Level Security (RLS)** — a database feature that filters rows based on the authenticated user. This is covered in L06, but it affects schema design:

```sql
CREATE POLICY "sets_self_only" ON sets
    FOR ALL USING (auth.uid() = user_id);
```

This says: "A user can only see sets where `user_id` matches their auth token."

**Why store `user_id` in sets?** Because the RLS policy needs it. Without it, you'd have to join to workouts, then to users, every time you query. Storing it denormalized speeds up RLS filtering.

---

## Summary

- **Tables represent types; rows are instances.** A Set in C++ is a row in the sets table.
- **Primary keys ensure uniqueness.** Foreign keys create relationships and enforce referential integrity.
- **Normalization reduces redundancy; denormalization trades space for speed.** Peak Fettle stores `user_id` in sets (denormalization) for RLS and index performance.
- **Indexes are essential for performance.** Composite indexes like `(user_id, logged_at DESC)` speed up common queries.
- **Constraints enforce business rules.** CHECK constraints prevent invalid states at the database layer.
- **Migrations are versioned schema history.** Read them in order to understand the data model's evolution.

---

**Related readings:**  
- Postgres docs: Indexes, Foreign Keys, CHECK Constraints  
- SQL performance: Query planning and EXPLAIN  

**Next lesson:** L05 (SQL Percentile Batch) — how to compute rankings efficiently using SQL aggregates and window functions.


---

# L05: SQL Deep Dive — The Percentile Batch Job

**Peak Fettle Codebase Curriculum**  
**Bloom Levels:** L1 (Recall), L2 (Understand), L3 (Apply), L4 (Analyze), L5 (Evaluate)  
**Estimated read time:** 70 minutes  
**Prerequisites:** L01, L02, L03, L04  
**Code sources:** `compute_percentile.sql`, `lift_vectors_seed.sql`, `migrations/20260502_percentile_engine.sql`, `peak-fettle-agents/server/cron/percentile.js`

---

## 0. Why This Matters

Every week, Peak Fettle computes the **percentile rank** for every user's lifts: "You're in the top 15% of squatters your age, weight, and experience level." This ranking doesn't update in real-time as you log sets. Instead, a **batch job** runs weekly, queries all users' lifts, runs math on them, and stores the results in a table.

This lesson teaches you:
- **Aggregation and GROUP BY** — how to summarize data (e.g., "best squat per user").
- **Window functions** — advanced SQL that lets you rank users without a loop.
- **Common Table Expressions (CTEs)** — named subqueries that make complex logic readable.
- **Why batch, not real-time?** — the cost/freshness trade-off.
- **How the math works** — from log-normal distributions to percentiles.

By the end, you'll be able to:
- Read and modify the percentile SQL functions.
- Defend a batch job against a "show me my live rank" product demand.
- Predict how the system scales as you add more users.

---

## 1. Aggregation and GROUP BY

### 1.1 Summarizing Data

The sets table has millions of rows: one per set logged by all users.

```
user_id              | exercise_id           | weight_kg | reps
---------------------+-----------------------+-----------+-----
550e8400-e29b-41d4   | back_squat_uuid       | 100       | 5
550e8400-e29b-41d4   | back_squat_uuid       | 105       | 3
550e8400-e29b-41d4   | bench_press_uuid      | 70        | 8
550e8401-e29b-41d5   | back_squat_uuid       | 120       | 4
550e8401-e29b-41d5   | back_squat_uuid       | 95        | 10
```

**Question:** For each user and exercise, what's their best lift (1-rep max equivalent)?

**Approach 1: Loop in the app.** Fetch all sets, iterate in JavaScript, compute per-user-exercise max. *Slow and memory-intensive.*

**Approach 2: Aggregate in SQL.** Ask the database to summarize.

```sql
SELECT
    user_id,
    exercise_id,
    MAX(
        CASE WHEN reps = 1 THEN weight_kg
             ELSE weight_kg * (1.0 + reps / 30.0)  -- Epley 1RM formula
        END
    ) AS best_one_rm_kg
FROM sets
WHERE kind = 'lift' AND weight_kg > 0
GROUP BY user_id, exercise_id;
```

This groups rows by `(user_id, exercise_id)`, computes the Epley E1RM for each set, and returns the maximum. **Result:** One row per user-exercise pair with the best estimate of their 1-rep max.

### 1.2 GROUP BY Semantics

`GROUP BY` partitions rows into buckets and applies an **aggregate function** to each bucket.

```
Common aggregate functions:
- COUNT(*)           — number of rows
- SUM(column)        — total
- AVG(column)        — average
- MAX(column)        — maximum
- MIN(column)        — minimum
- STRING_AGG(...)    — concatenate strings
- ARRAY_AGG(...)     — collect into an array
```

In the example:
- Bucket 1: All sets by user A for exercise X.
- Bucket 2: All sets by user A for exercise Y.
- Bucket 3: All sets by user B for exercise X.
- etc.

For each bucket, we compute `MAX(epley_one_rm)`.

**Key rule:** If you use `GROUP BY`, every column in the SELECT list must either:
1. Be in the GROUP BY clause, or
2. Be wrapped in an aggregate function.

```sql
-- WRONG
SELECT user_id, exercise_id, weight_kg  -- weight_kg is not aggregated
FROM sets
GROUP BY user_id, exercise_id;

-- RIGHT
SELECT user_id, exercise_id, MAX(weight_kg)
FROM sets
GROUP BY user_id, exercise_id;
```

---

## 2. Window Functions: Computing Ranks Without Loops

### 2.1 Introduction to Window Functions

A **window function** computes a value for each row based on a **window** (a set of related rows).

```sql
SELECT
    user_id,
    exercise_id,
    best_one_rm_kg,
    PERCENT_RANK() OVER (
        PARTITION BY exercise_id
        ORDER BY best_one_rm_kg DESC
    ) AS percentile_rank
FROM v_user_lift_inputs;
```

**What this does:**
1. `PARTITION BY exercise_id` — For each exercise, group the rows.
2. `ORDER BY best_one_rm_kg DESC` — Sort users by their best lift (strongest first).
3. `PERCENT_RANK()` — Compute the percentile rank of each user within their exercise group.

**Example output for back_squat:**

```
user_id              | best_one_rm_kg | percentile_rank
---------------------+----------------+-----------------
550e8400 (strongest) | 200            | 1.0  (100th percentile)
550e8401             | 150            | 0.5  (50th percentile)
550e8402 (weakest)   | 100            | 0.0  (0th percentile)
```

**Key difference from GROUP BY:**
- `GROUP BY` **reduces** rows (one output per group).
- Window functions **preserve** rows (one output per row, but computed within a window).

### 2.2 NTILE: Bucketing into Percentiles

The `NTILE(n)` function divides rows into `n` buckets of roughly equal size.

```sql
SELECT
    user_id,
    exercise_id,
    best_one_rm_kg,
    NTILE(100) OVER (
        PARTITION BY exercise_id
        ORDER BY best_one_rm_kg DESC
    ) AS percentile_bucket
FROM v_user_lift_inputs;
```

This divides users into 100 buckets (1–100 percentile). A user in bucket 75 is in the 75th percentile (stronger than 75% of other users).

### 2.3 ROW_NUMBER vs. PERCENT_RANK vs. NTILE

Three ways to rank:

| Function | Output | Use case |
|----------|--------|----------|
| `ROW_NUMBER()` | 1, 2, 3, ... | "My rank among all users" (no ties). |
| `PERCENT_RANK()` | 0.0 to 1.0 (decimal) | "What fraction of users are weaker than me?" |
| `NTILE(100)` | 1 to 100 (integer buckets) | "Which percentile bucket am I in?" |

Peak Fettle uses **`PERCENT_RANK()`** because it computes exact percentiles (not bucketed), and it handles ties correctly (multiple users with the same lift get the same rank).

---

## 3. The Percentile Batch Job: A Walkthrough

### 3.1 Architecture: Batch, Not Real-Time

**Why batch?**

1. **Cost** — Computing percentiles for one user requires comparing them to *all* other users. Doing this per-request is expensive; once per week is cheap.
2. **Freshness** — "Top 15% this week" is motivating enough. Users don't need millisecond-fresh rankings.
3. **Complexity** — Real-time percentiles require real-time indexes on derived values. Batch jobs are simpler to reason about.

**The trade-off:**

```
Real-time:
  - Pro:  Fresh rank. User logs set → rank updates immediately.
  - Con:  Every set INSERT triggers a re-rank of cohort. Expensive at scale.

Batch (weekly):
  - Pro:  Cheap. One batch job per week. Ranks are stable.
  - Con:  Stale. User's rank may be 2–3 days old.
```

Peak Fettle chose **batch** because:
- Monthly churn is high (many users start/quit). Weekly re-ranking is fair.
- Most users log 1–3 sessions per week. Seeing "top 18%" the next morning is acceptable.
- Database size (months 1–12) is manageable. Real-time wouldn't save much.

### 3.2 The Pipeline

```
1. v_user_lift_inputs view
   ├─ Reads: sets, users, exercises
   └─ Output: user_id, lift_id, sex, bodyweight_kg, age, training_years, best_one_rm_kg

2. compute_percentile() function (SQL)
   ├─ Input: lift_id, sex, bodyweight_kg, age, training_yrs, lift_kg
   ├─ Applies: log-normal distribution model
   └─ Output: percentile [0, 100]

3. compute_percentile_batch() function
   ├─ Calls compute_percentile() for every row in v_user_lift_inputs
   └─ Output: user_id, lift_id, percentile, percentile_simple, computed_at

4. percentile.js (Node.js cron job)
   ├─ Calls compute_percentile_batch()
   ├─ Chunks results into batches of 500
   ├─ UPSERTs into user_percentile_rankings table
   └─ Logs success/failure
```

### 3.3 The v_user_lift_inputs View

```sql
CREATE VIEW v_user_lift_inputs AS
SELECT
    u.id                    AS user_id,
    s.exercise_id,
    e.name                  AS exercise_name,
    REPLACE(LOWER(e.name), ' ', '_') AS lift_id,
    u.sex,
    COALESCE(u.weight_class_kg, 83) AS bodyweight_kg,
    EXTRACT(YEAR FROM AGE(NOW(), u.birth_date))::INTEGER AS age,
    COALESCE(u.years_in_sport, 0) AS training_years,
    MAX(
        CASE WHEN s.reps = 1 THEN s.weight_kg
             ELSE s.weight_kg * (1.0 + s.reps / 30.0)
        END
    ) AS best_one_rm_kg
FROM sets s
JOIN users u ON u.id = s.user_id
JOIN exercises e ON e.id = s.exercise_id
WHERE
    s.kind = 'lift'
    AND s.reps >= 1
    AND s.weight_kg > 0
    AND u.sex IN ('M', 'F')        -- Exclude 'X' (opted out)
    AND u.deleted_at IS NULL
    AND u.birth_date IS NOT NULL   -- Age required
GROUP BY u.id, s.exercise_id, e.name, u.sex, u.weight_class_kg, u.birth_date, u.years_in_sport;
```

**Key observations:**

1. **Epley formula:** `weight_kg * (1.0 + reps / 30.0)` estimates 1-rep max from a rep set.
2. **Special case:** Single reps (`reps = 1`) are returned exactly, not multiplied by 1.03. A 200 kg single is 200 kg, not 206.7 kg.
3. **Aggregation:** `MAX(...)` finds the best E1RM across all logged sets for that exercise.
4. **Filtering:** Only 'M' and 'F' are included. 'X' (opted-out) users are excluded because the model is calibrated on binary sex.
5. **GROUP BY:** Groups by user-exercise-demo combo, so one output row per (user, exercise).

---

## 4. The Math: Log-Normal Distribution

### 4.1 Why Log-Normal?

Strength data is **right-skewed** — most people are weak, a few are very strong. A **normal distribution** (bell curve) doesn't fit well. But if you take the logarithm of lift weights, the distribution is approximately normal.

**Model:**

```
ln(lift_kg) ~ N(μ, σ)

where:
  μ = mean of log-lift (the asymptote for an "average" lifter)
  σ = standard deviation
```

The model is **parameterized** by gender and lift:

```sql
lift_vectors table:
  lift_id: 'back_squat'
  sex:     'M'
  mu:      4.7228  (e^4.7228 ≈ 112 kg at reference bodyweight)
  sigma:   0.3107  (roughly 0.31 standard deviations)
```

### 4.2 The Percentile Function

Given:
- User's lift: 150 kg
- Sex: M
- Bodyweight: 75 kg (reference)
- Age: 30 (peak)
- Training years: 3

Steps:

1. **Bodyweight factor:**
   ```
   bw_factor = (75 / 75)^0.667 = 1.0  (at reference, no adjustment)
   ```

2. **Age factor:** At age 30 (peak), age_factor = 1.0.

3. **Training factor:** At 3 years, training_factor ≈ 0.85 (still progressing).

4. **Expected log-lift:**
   ```
   log_expected = μ + ln(bw_factor) + ln(age_factor) + ln(training_factor)
                = 4.7228 + 0 + 0 + ln(0.85)
                = 4.7228 - 0.1625
                = 4.5603
   expected_lift = e^4.5603 ≈ 96 kg
   ```

5. **Z-score:**
   ```
   z = (ln(150) - 4.5603) / 0.3107
     = (5.0106 - 4.5603) / 0.3107
     = 1.445
   ```

6. **Percentile (normal CDF):**
   ```
   percentile = norm_cdf(1.445) ≈ 0.926  (92.6th percentile)
   ```

**Interpretation:** A 150 kg squat at BW 75 kg, age 30, 3 years training is in the **92.6th percentile** of that cohort.

### 4.3 The norm_cdf Function

Postgres has no built-in normal CDF. The code implements **Abramowitz & Stegun 26.2.17**, a polynomial approximation:

```sql
CREATE FUNCTION norm_cdf(z DOUBLE PRECISION)
RETURNS DOUBLE PRECISION AS $$
DECLARE
    p   := 0.2316419;
    b1  := 0.319381530;
    ...
    abs_z := abs(z);
    t := 1.0 / (1.0 + p * abs_z);
    pdf := exp(-0.5 * abs_z * abs_z) / sqrt(2.0 * pi());
    poly := b1*t + b2*t^2 + b3*t^3 + b4*t^4 + b5*t^5;
    cdf := 1.0 - pdf * poly;
    IF z < 0 THEN RETURN 1.0 - cdf ELSE RETURN cdf END IF;
END;
$$;
```

This approximates the cumulative distribution function (CDF) of the standard normal distribution. For z=1.445, it returns ~0.926.

---

## 5. Worked Example: Computing a User's Percentile

### 5.1 Scenario

**User:** Alice, Female, 70 kg, Age 28, 2 years training.  
**Lift:** Back squat, 130 kg (her best recorded squat).

**Goal:** Compute her percentile rank among female squatters.

### 5.2 Step by Step

**1. Look up parameters from lift_vectors:**

```sql
SELECT * FROM lift_vectors
WHERE lift_id = 'back_squat' AND sex = 'F' AND model_version = 2;

Result:
  mu = 4.1744
  sigma = 0.2934
  bw_ref_kg = 65
  training_floor = 0.45  (for female squatters)
  training_tau_years = 3.0
  age_peak_lo = 23
  age_peak_hi = 35
  youth_decay_per_year = 0.012
  age_decay_per_year = 0.010
```

**2. Compute bodyweight factor:**

```
bw_factor = (70 / 65)^0.667 = 1.077^0.667 = 1.0502
ln(bw_factor) = ln(1.0502) = 0.0490
```

**3. Compute age factor:**

Alice is 28, which is between age_peak_lo (23) and age_peak_hi (35), so age_factor = 1.0.

```
ln(age_factor) = ln(1.0) = 0
```

**4. Compute training factor:**

Alice has 2 years. First-order kinetics:

```
train_factor = f₀ + (1 - f₀) * (1 - exp(-years / tau))
             = 0.45 + 0.55 * (1 - exp(-2 / 3.0))
             = 0.45 + 0.55 * (1 - 0.5134)
             = 0.45 + 0.55 * 0.4866
             = 0.45 + 0.268
             = 0.718
ln(train_factor) = ln(0.718) = -0.333
```

**5. Compute expected log-lift:**

```
log_expected = μ + ln(bw_factor) + ln(age_factor) + ln(train_factor)
             = 4.1744 + 0.0490 + 0 - 0.333
             = 3.8904
```

**6. Compute z-score:**

```
z = (ln(130) - 3.8904) / 0.2934
  = (4.8675 - 3.8904) / 0.2934
  = 0.9771 / 0.2934
  = 3.330
```

Z-score is clamped to [-4, 4], so z = 3.330.

**7. Compute percentile:**

```
percentile = norm_cdf(3.330) ≈ 0.9996 ≈ 99.96th percentile
```

**Result:** Alice is in the **99.96th percentile** of female squatters with her profile (age 28, weight 70 kg, 2 years training). She's exceptionally strong relative to her cohort.

---

## 6. The JavaScript Cron Job: Orchestrating the Batch

The `percentile.js` file runs weekly (Sunday 03:00 UTC) and orchestrates the batch computation.

### 6.1 Connection Management

```javascript
const { pool } = require('../db');

async function run() {
    const client = await pool.connect();
    try {
        // ... computation ...
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
    } finally {
        client.release();
        await pool.end();
    }
}
```

**Pattern:** Acquire a connection, begin a transaction, run queries, commit or rollback, release the connection. This ensures the job doesn't leave locks or orphaned connections.

### 6.2 Calling the SQL Function

```javascript
const { rows } = await client.query(
    `SELECT user_id, lift_id, percentile, percentile_simple,
            cohort_size_internal, is_estimated, computed_at
     FROM compute_percentile_batch(2)`
);
```

This calls the SQL function `compute_percentile_batch(2)` (model version 2) and returns a result set. Each row is `(user_id, lift_id, percentile, percentile_simple, ...)`.

### 6.3 Chunked Upsert

The job upsets rows in **chunks of 500** to avoid a single gigantic query:

```javascript
const CHUNK = 500;
for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = [];
    const params = [];
    
    chunk.forEach((row, idx) => {
        const base = idx * 7;
        values.push(`($${base + 1}, ..., $${base + 7}, 2)`);
        params.push(
            row.user_id, row.lift_id, row.percentile,
            row.percentile_simple, row.cohort_size_internal,
            row.is_estimated, row.computed_at
        );
    });
    
    await client.query(
        `INSERT INTO user_percentile_rankings (...)
         VALUES ${values.join(', ')}
         ON CONFLICT (user_id, lift_id, model_version)
         DO UPDATE SET ...`,
        params
    );
}
```

**Upsert semantics:** If a row with (user_id, lift_id, model_version) already exists, update it. Otherwise, insert a new row. This is idempotent — running the job twice gives the same result.

---

## 7. Common Table Expressions (CTEs)

A **CTE** is a named subquery that makes complex SQL more readable.

### 7.1 Simple CTE

Without CTE:

```sql
SELECT u.id, u.display_name, ranked.percentile
FROM users u
JOIN (
    SELECT user_id, MAX(percentile) AS percentile
    FROM user_percentile_rankings
    WHERE model_version = 2
    GROUP BY user_id
) ranked ON u.id = ranked.user_id
ORDER BY ranked.percentile DESC;
```

With CTE:

```sql
WITH top_users AS (
    SELECT user_id, MAX(percentile) AS percentile
    FROM user_percentile_rankings
    WHERE model_version = 2
    GROUP BY user_id
)
SELECT u.id, u.display_name, top_users.percentile
FROM users u
JOIN top_users ON u.id = top_users.user_id
ORDER BY top_users.percentile DESC;
```

The CTE `top_users` is defined once and referenced multiple times. More readable.

### 7.2 Multi-Step CTE

```sql
WITH lifters AS (
    SELECT
        user_id,
        sex,
        age,
        training_years,
        best_one_rm_kg
    FROM v_user_lift_inputs
    WHERE lift_id = 'back_squat'
),
stats AS (
    SELECT
        sex,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY best_one_rm_kg) AS median,
        PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY best_one_rm_kg) AS p90
    FROM lifters
    GROUP BY sex
)
SELECT
    l.user_id,
    l.best_one_rm_kg,
    s.median,
    CASE WHEN l.best_one_rm_kg >= s.p90 THEN 'elite' ELSE 'intermediate' END
FROM lifters l
JOIN stats s ON l.sex = s.sex;
```

Step 1: Filter to squatters. Step 2: Compute median and 90th percentile per sex. Step 3: Classify each user as elite or intermediate.

---

## Summary

- **Aggregation** (`GROUP BY`, aggregate functions) summarizes data into groups.
- **Window functions** (`PERCENT_RANK`, `NTILE`, `ROW_NUMBER`) rank rows without reducing them.
- **Batch jobs** trade freshness for cost. Weekly percentile updates are cheap and sufficient for Peak Fettle's scale.
- **Log-normal distribution** models strength data better than a normal distribution.
- **CTEs** make complex SQL readable by naming subqueries.
- **Extend, don't rewrite.** The `compute_percentile_simple()` function adds a second ranking view without changing the core logic.

---

**Related readings:**
- Postgres docs: Aggregate Functions, Window Functions
- Statistics: Normal vs. log-normal distributions
- Scaling: When to move from batch to real-time

**Next lesson:** L06 (Supabase & Managed Postgres) — how Supabase provides database hosting, authentication, and Row-Level Security.


---

# L06: Supabase — Managed Postgres, Auth, RLS, and Vendor Lock-In

**Peak Fettle Codebase Curriculum**  
**Bloom Levels:** L1 (Recall), L2 (Understand), L3 (Apply), L4 (Analyze), L5 (Evaluate)  
**Estimated read time:** 75 minutes  
**Prerequisites:** L01, L02, L03, L04, L05  
**Code sources:** `peak-fettle-agents/server/db.js`, `.env.example`, `migrations/20260503_rls_policies.sql`, `database_decision_memo.md`

---

## 0. Why This Matters

Peak Fettle could have stored data in Firebase, MongoDB, or managed their own Postgres server on AWS. Instead, they chose **Supabase** — a Backend-as-a-Service (BaaS) that provides managed Postgres + Auth + Row-Level Security. This lesson teaches you:

- **What Supabase gives you** — automatic backups, SSL, authentication, RLS.
- **The anon key vs. service-role key** — and why some operations need the latter.
- **Row-Level Security (RLS)** — how the database enforces access control without app logic.
- **Connection pooling** — why Peak Fettle uses 2 connections (not 20) to a nano instance.
- **Vendor lock-in** — how "Postgres exit optionality" is real but harder than it sounds.

By the end, you'll be able to:
- Understand how Supabase auth integrates with the database.
- Read and write RLS policies to enforce access control.
- Migrate data *away* from Supabase (and understand what's hard about it).
- Reason about whether Supabase is the right choice for a new feature.

---

## 1. What is Supabase?

### 1.1 The Supabase Stack

Supabase is a managed Postgres database + authentication layer + real-time API, similar to Firebase but built on open-source components:

```
┌─────────────────────────────────────────┐
│        Your App (mobile / web)          │
└────────────────┬────────────────────────┘
                 │ HTTPS
                 ▼
┌─────────────────────────────────────────┐
│      Supabase API Gateway                │
│  (JWT validation, RLS enforcement)      │
└────────────────┬────────────────────────┘
                 │ TCP/SSL
                 ▼
┌─────────────────────────────────────────┐
│      Postgres Database (hosted)          │
│  (tables, functions, RLS policies)      │
└─────────────────────────────────────────┘
```

### 1.2 Key Components

**1. Managed Postgres**
- Hosted on Supabase's infrastructure (currently AWS or other clouds).
- Automatic backups, SSL encryption, monitoring.
- You don't manage servers; you write SQL.

**2. Authentication**
- Supabase Auth provides user signup, login, and JWT tokens.
- Peak Fettle uses this to authenticate users without building an auth service.

**3. Row-Level Security (RLS)**
- SQL policies that filter rows based on the authenticated user.
- A user can only see/modify their own data.

**4. Real-Time Subscriptions (optional)**
- Listen for changes to specific rows/tables.
- Peak Fettle doesn't use this yet (polling is sufficient).

### 1.3 Pricing Model

Supabase has tiered pricing:

- **Free tier:** 500 MB storage, 1 project, limited realtime.
- **Pro:** $25/month + overage, includes custom domains, more storage.

Peak Fettle likely uses the **Pro tier** or custom plan. The "nano instance" mentioned in the code means a small Postgres cluster (512 MB RAM).

---

## 2. Keys and Authentication

### 2.1 The Anon Key and Service-Role Key

Supabase provides two API keys:

| Key | Purpose | Security | Used for |
|-----|---------|----------|----------|
| **Anon Key** | Public, included in client-side code | Low — assumes RLS enforces access | User-initiated actions (login, fetch own data) |
| **Service Role Key** | Secret, stored server-side only | High — full database access | Server-side scripts (cron jobs, admin operations) |

In the mobile app:

```cpp
// Client uses anon key (visible in APK)
Supabase::Client client("https://...", "eyJ...");  // Anon key
auto session = client.auth().signUp("user@example.com", "password");
auto myWorkouts = client.from("workouts").select().execute();  // Filtered by RLS
```

In the backend cron job:

```javascript
// Server uses service-role key (secret)
const adminClient = require('@supabase/supabase-js')
    .createClient(supabaseUrl, serviceRoleKey);

// Can access any user's data (RLS is bypassed)
const allPercentiles = await adminClient
    .from('user_percentile_rankings')
    .select();
```

### 2.2 JWT Tokens

When a user logs in, Supabase issues a **JWT (JSON Web Token)** containing their user ID:

```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440001",  // user ID
  "email": "alice@example.com",
  "iat": 1716266400,
  "exp": 1716352800
}
```

The app stores this token and includes it in HTTP requests:

```
GET /api/workouts
Authorization: Bearer eyJhbGc...
```

The API gateway verifies the JWT signature and extracts the user ID, making it available to RLS policies as `auth.uid()`.

---

## 3. Row-Level Security (RLS): Access Control in the Database

### 3.1 The Problem RLS Solves

Without RLS:

```javascript
// Backend endpoint
app.get('/api/workouts/:userId', async (req, res) => {
    // Check: does the authenticated user match the URL parameter?
    if (req.user.id !== req.params.userId) {
        return res.status(403).send('Forbidden');
    }
    const workouts = await db.query(
        'SELECT * FROM workouts WHERE user_id = $1',
        [req.params.userId]
    );
    res.json(workouts);
});
```

Every endpoint must manually check access. It's easy to forget, causing data leaks.

**With RLS:**

```sql
CREATE POLICY "workouts_self_only" ON workouts
    FOR ALL USING (auth.uid() = user_id);
```

The database itself enforces: "A user can only see/modify workouts where `user_id` matches their JWT." No app-side check needed.

### 3.2 RLS Policies in Peak Fettle

The migrations define policies for each table:

```sql
-- File: migrations/20260503_rls_policies.sql

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_self_only" ON users
    FOR ALL USING (auth.uid() = id);

CREATE POLICY "workouts_self_only" ON workouts
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "sets_self_only" ON sets
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "plans_self_or_template" ON plans
    FOR SELECT USING (auth.uid() = user_id OR is_template = TRUE);

CREATE POLICY "plans_write_self" ON plans
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "plans_update_self" ON plans
    FOR UPDATE USING (auth.uid() = user_id);
```

**Key policies:**

1. **users_self_only** — Can only read/update your own user row.
2. **workouts_self_only** — Can only access your own workouts.
3. **sets_self_only** — Can only access your own sets.
4. **plans_self_or_template** — Can read templates (shared), but only modify your own plans.

### 3.3 Global Read-Only Tables

Some tables are global and read-only:

```sql
-- exercises table: global library, no RLS
-- (no RLS needed; writes happen via service-role key only)

CREATE TABLE exercises (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    ...
);

-- percentile_vectors: lookup table, no RLS
CREATE TABLE percentile_vectors (
    id UUID PRIMARY KEY,
    exercise_id UUID NOT NULL,
    distribution JSONB,
    ...
);
-- No policy: all users can read
```

These tables have no RLS policies because all users should be able to read them, and writes only happen via cron jobs (service-role key).

### 3.4 How RLS Evaluation Works

When a user runs a query:

```sql
SELECT * FROM sets WHERE exercise_id = 'back_squat_uuid';
```

Postgres internally rewrites it to:

```sql
SELECT * FROM sets
WHERE exercise_id = 'back_squat_uuid'
  AND auth.uid() = user_id;  -- RLS policy applied
```

If the user tries to access another user's sets:

```sql
SELECT * FROM sets WHERE user_id = '550e8401-e29b-41d5';
```

Postgres rewrites it to:

```sql
SELECT * FROM sets
WHERE user_id = '550e8401-e29b-41d5'
  AND auth.uid() = user_id;  -- This is FALSE
```

Result: Empty set. The user can't see those rows.

---

## 4. Connection Pooling

### 4.1 The Connection Pool

Peak Fettle's backend uses a **connection pool** to the Postgres database:

```javascript
// File: peak-fettle-agents/server/db.js

const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
    max: 2,                      // Max 2 connections
    idleTimeoutMillis: 10_000,  // Drop idle connections after 10 seconds
    connectionTimeoutMillis: 10_000
});
```

**Why this configuration?**

- **max: 2** — Supabase's nano instance (512 MB RAM) can't handle many concurrent connections. 2 is enough for:
  - 1 active request processing a query.
  - 1 spare for burst traffic.
- **idleTimeoutMillis: 10_000** — Don't hold connections open. Release them promptly so other apps can use resources.
- **connectionTimeoutMillis: 10_000** — If all 2 connections are busy and a 3rd request comes in, fail fast (don't queue forever).

### 4.2 How the Pool Works

Request 1:
```
App request → Get connection from pool → Run query → Release connection
```

Request 2 (arrives while Request 1 is running):
```
App request → Get second connection from pool → Run query → Release
```

Request 3 (arrives when pool is full):
```
App request → All connections busy → Wait 10 seconds for one to free up
              → If no connection frees, reject request (connectionTimeoutMillis exceeded)
```

**Why not max: 20?**
- Supabase charges for peak connections (not average).
- Postgres on a nano instance can't handle 20 concurrent connections.
- Each connection uses memory; 20 connections * 5 MB/connection = 100 MB (more than the instance has).

### 4.3 Scaling the Pool

As Peak Fettle grows:

```
Current: max: 2, nano instance (512 MB)
  ↓
Move to: max: 5–10, micro instance (1 GB)
  ↓
Move to: max: 20+, small instance (2 GB+)
```

This is straightforward — just update `db.js` and upgrade the Supabase tier. No app logic changes.

---

## 5. The Supabase URL and Environment Variables

### 5.1 Connection String

Peak Fettle stores the database URL as:

```
SUPABASE_DB_URL=postgresql://postgres.550e8400:[password]@aws-0-us-west-1.pooler.supabase.com:6543/postgres
```

Breaking it down:

```
postgresql://              ← Protocol
  postgres.550e8400        ← User (role)
  :password                ← Postgres password
  @aws-0-us-west-1.pooler.supabase.com  ← Host (Supabase-managed)
  :6543                    ← Port (Supabase's connection pooler)
  /postgres                ← Database name
```

**Supabase connection pooler** — Instead of connecting directly to the Postgres server, you connect to Supabase's **PgBouncer** pooler. It manages connections more efficiently.

### 5.2 Environment Variables

The .env file contains:

```
SUPABASE_DB_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...
```

These are never committed to git. Instead:

1. Store them in `.env.local` (local development).
2. In production, set them via environment variables (e.g., GitHub Secrets, Heroku Config).

---

## 6. Worked Example: Tracing an Account Deletion

**Scenario:** A user deletes their account. What happens?

### 6.1 Step 1: User Initiates Deletion

The mobile app calls:

```cpp
supabaseAuth.deleteUser();  // Supabase Auth API
```

Supabase Auth:
1. Marks the user in the auth system as deleted.
2. Calls a backend webhook (if configured) to notify Peak Fettle.

### 6.2 Step 2: Backend Cascades the Delete

Peak Fettle's backend receives a webhook:

```javascript
// Endpoint: DELETE /api/auth/user/:userId (with service-role key)

app.delete('/api/auth/user/:userId', async (req, res) => {
    const { userId } = req.params;
    
    const adminClient = createClientWithServiceRoleKey();
    
    // Delete the user row (cascades to workouts, sets, plans, etc.)
    await adminClient
        .from('users')
        .delete()
        .eq('id', userId);
    
    res.json({ deleted: true });
});
```

Using the service-role key (not RLS-filtered), delete the user row.

### 6.3 Step 3: Cascade Deletes

The database has `ON DELETE CASCADE` on foreign keys:

```sql
CREATE TABLE workouts (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ...
);
```

When the user row is deleted, Postgres automatically deletes:
1. All workouts for that user.
2. All sets in those workouts.
3. All plans owned by that user.
4. All streaks for that user.

**Result:** Complete account deletion, no orphaned data.

### 6.4 Step 4: Verify RLS Still Works

If the user was malicious and somehow got access to an old JWT token:

```sql
-- Old request with expired JWT
SELECT * FROM sets WHERE user_id = '550e8400-e29b-41d4';
```

Postgres rewrites it (RLS policy):

```sql
SELECT * FROM sets
WHERE user_id = '550e8400-e29b-41d4'
  AND auth.uid() = '550e8400-e29b-41d4'  -- TRUE, but table is empty
  AND ... (other policies)
```

The policy **allows** the query (it's their user ID), but there are no rows left, so the result is empty. RLS is still enforced.

---

## 7. Vendor Lock-In: The "Postgres Exit Optionality" Claim

### 7.1 The Claim

Peak Fettle's decision memo argues:

> Supabase was chosen partly for "Postgres exit optionality" — the ability to migrate to self-hosted Postgres or another provider without being locked in to Supabase-specific APIs.

### 7.2 The Reality: What's Portable?

**Easy to migrate (portable):**
- **SQL schema** — All migrations are pure Postgres. Copy them to any Postgres instance.
- **Data** — Use `pg_dump` to export data, `psql` to import to another instance.
- **Backend code** — The `pg` Node.js library works against any Postgres server.

**Hard to migrate (vendor lock-in):**

1. **Authentication** — Supabase Auth generates JWTs. To migrate, you'd need to:
   - Rebuild auth (OAuth, signup, password reset, etc.) — weeks of work.
   - Or, run your own Supabase instance (still vendor lock-in, just self-hosted).

2. **RLS policies + auth.uid()** — RLS policies reference `auth.uid()`, which is Postgres' auth context. When migrating:
   - If moving to another Postgres instance with Supabase, auth continues to work.
   - If moving to a non-Postgres database (e.g., MongoDB), RLS doesn't exist; you must re-implement access control in the app.

3. **Real-time subscriptions** — Supabase's real-time is based on Postgres LISTEN/NOTIFY. Portable to any Postgres, but the client-side library (`supabase-js`) is Supabase-specific. Would need a different real-time library.

### 7.3 Migration Scenarios

**Scenario A: Self-host Postgres, keep Supabase Auth**

1. Export all migrations from Supabase.
2. Run them against a self-hosted Postgres instance.
3. Keep using Supabase Auth (or migrate to Auth0/Okta).
4. RLS policies work unchanged (they're pure Postgres).

**Effort:** 2–4 weeks. Mostly re-configuring infrastructure.

**Scenario B: Migrate to MongoDB**

1. Manually convert schema (no automated migration).
2. Rewrite all queries (SQL → MongoDB queries).
3. Remove RLS (reimplement in app as authorization middleware).
4. Move from Postgres-specific functions (norm_cdf, window functions) to app logic.

**Effort:** 2–3 months. Major rewrite.

**Scenario C: Migrate to Firebase**

1. Export data from Postgres.
2. Restructure for Firestore's document model.
3. Remove RLS (use Firestore security rules instead).

**Effort:** Similar to Scenario B.

### 7.4 The Lock-In You're Actually In

**The real lock-in:**

1. **Auth system** — Supabase Auth is tightly integrated. Switching costs significant effort.
2. **RLS patterns** — The codebase is designed around RLS. If you move databases, you must rewrite access control.
3. **Dependency on Postgres SQL dialects** — The percentile functions use Postgres-specific syntax (recursive CTEs, window functions). Moving to MySQL would require rewriting.

**What's NOT locked in:**

- Data format (standard SQL relations).
- Backend language (Node.js is language-agnostic).
- Application logic (no Supabase SDK deep in business logic).

### 7.5 Realistic Assessment

The claim that "Postgres exit optionality" is real but **narrower than it sounds**:

- **Easy to exit:** Migrate within Postgres ecosystem (self-hosted Postgres, RDS, etc.). Cost: 2–4 weeks.
- **Hard to exit:** Migrate to a different database entirely. Cost: 2–3 months + significant rewrites.

**Bottom line:** Supabase is a good choice *if* you're comfortable with Postgres long-term. If you might need a different database (e.g., document-oriented for a pivot to a different product), you're somewhat locked in.

---

## Summary

- **Supabase = Managed Postgres + Auth + RLS** — No need to manage servers.
- **Anon key** (client-side) respects RLS. **Service-role key** (server-side) bypasses it.
- **RLS policies** enforce access control at the database layer, preventing bugs and data leaks.
- **Connection pooling** is essential on managed instances. Peak Fettle uses 2 connections to a nano instance.
- **"Postgres exit optionality" is real within Postgres, but migrating to a different database is hard.** Expect 3–6 months if you need to switch.
- **Vendor lock-in is primarily in Auth and RLS.** The SQL schema is portable; the auth and access control patterns are not.

---

**Related readings:**
- Supabase docs: Authentication, Row-Level Security
- Postgres docs: Row Security Policies
- GDPR and data deletion best practices

**Next lesson:** L07 (API Design & GraphQL/REST Patterns) — how Peak Fettle exposes the database to the mobile app.


---

# Lesson L07 — Node.js & Express fundamentals

> **Track:** 2 — Node/Express/REST/auth/LLM/cron/deploy · **Status:** ⭐ Reference lesson (fully worked)
> **Estimated time:** ~40 min · **Prerequisite rungs:** L01–L06 (codebase context)

## 1. Learning outcomes
By the end, Arvin can:
- **(L1)** Name the role of each piece of middleware in the Express app (helmet, CORS, rate-limiter, error handler).
- **(L2)** Explain why middleware order matters in Express and the consequence of placing error handler at the end instead of the beginning.
- **(L3)** Trace a request through the middleware pipeline, including what each middleware adds/modifies on `req` and `res`.
- **(L4)** Analyze the security trade-off of placing the auth middleware early vs. late in the stack, and design the ideal ordering given a set of routes.
- **(L5)** Evaluate the effect on performance and security of moving rate-limit to a global limiter vs. route-specific limiters, and justify a choice for Peak Fettle's two-tier model.

## 2. The difficulty ladder for THIS lesson
1. What is Node.js and why Express sits on top — the event loop, async I/O, a web server *is* a router.
2. Middleware: what it is, how it chains, why the stack order matters.
3. The helmet / CORS / rate-limit trio — security headers, cross-origin policy, brute-force defence.
4. The error handler — why it goes last, how it maps errors to HTTP responses.
5. Request flow: incoming → middleware → route handler → response.
6. A middleware-ordering failure mode: auth before rate-limit leaks whether an email exists.

## 3. Concept sequence

### Concept 1: Node.js and the event loop — async, non-blocking I/O
- "Your Python app does `db.query()` and blocks. Node does the same — but the thread doesn't wait; instead it *registers a callback* and moves on to the next request. When the DB responds, the callback fires and the response goes back."
- **The idea:** Node.js is *single-threaded* but *non-blocking*. Each request doesn't own a thread; instead, all requests share *one* thread + a callback queue. This lets a $5/month server handle 10,000 concurrent connections (vs. a thread-per-request model, which dies at ~300). The tradeoff: you must never block the thread (no synchronous file I/O, no `while(true)` CPU loops).
- "Peak Fettle logs 500 sets to Postgres a day. Would you use `db.query()` (async) or `fs.readFileSync()` (blocking)? Why?"
- **Real code** (`server/index.js`):
  ```javascript
  app.listen(port, () => {
      console.log(`[peak-fettle-api] listening on :${port}`);
  });
  ```
  This line registers a callback with Node's event loop: "when the OS sends me a TCP packet on port 4000, invoke this." The program doesn't hang waiting — it yields the thread to handle other requests.
- the Postgres driver (`pg` package) internally queues your `.query()` calls and uses async I/O. The pool holds 2 connections (line 15 of `db.js`); each can handle one query at a time, but they're *active* in the background while Node serves other requests.

### Concept 2: What Express middleware *is* — a function that wraps the request
- "You want to log every request, add a header to every response, and check auth before certain routes. How would you avoid copying that code into every route handler?"
- **The idea:** middleware is a function `(req, res, next) => { ... }` that Express invokes for *every* request in a *defined order*. Each middleware can:
  - Read or modify `req` (attach data, check headers).
  - Read or modify `res` (set headers, status codes).
  - Call `next()` to pass control to the next middleware.
  - Respond directly (call `res.json()`, `res.send()`) and *stop* the chain.
  - Call `next(err)` to jump to the error handler.
- **Real code** (`server/index.js`):
  ```javascript
  app.use(helmet());  // Add security headers; calls next()
  app.use(express.json());  // Parse JSON body; calls next()
  app.use(cors({ origin: allowedOrigin }));  // Check CORS; calls next() or res.status(403)
  app.use('/auth', authLimiter, authRoutes);  // Rate-limit, then route
  ```
  Each `app.use()` *registers* middleware. Express walks the list in order for every request.
- "If helmet is on line 46 and CORS is on line 48, does a request from an unauthorized origin get the helmet headers before being rejected by CORS?"

### Concept 3: The helmet / CORS / rate-limit trio
- "CORS: a browser on `example.com` tries to fetch from Peak Fettle's API at `api.peakfettle.com`. Without CORS, the browser blocks it. With CORS, the server says 'yes, example.com is allowed' and the browser lets it through."
- **The idea:**
  - **helmet**: adds HTTP response headers that tell the browser "don't allow inline JavaScript" (`Content-Security-Policy`), "prevent MIME type sniffing" (`X-Content-Type-Options`), etc. These stop certain classes of injection attacks. Helmet doesn't *block* requests; it makes responses harder to exploit.
  - **CORS** (`cors` package): checks the `Origin` header of the request against a whitelist. If the origin isn't whitelisted, it rejects the request with a 403. (Note: CORS is a *browser enforcement*; curl doesn't enforce it. CORS protects web apps, not API clients.)
  - **rate-limit** (`express-rate-limit`): tracks IPs (or custom keys) and rejects requests that exceed a threshold. Stops brute-force password guesses, DOS attacks.
- **Real code** (`server/index.js`, lines 38–61):
  ```javascript
  const allowedOrigin = process.env.WEB_ORIGIN || (isDev ? 'http://localhost:3000' : null);
  if (!allowedOrigin) {
      console.error('[peak-fettle-api] FATAL: WEB_ORIGIN env var must be set in production.');
      process.exit(1);  // Fail loud if not configured
  }
  app.use(cors({ origin: allowedOrigin }));

  const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,  // 15 minutes
      max: 20,  // 20 attempts per window
      message: { error: 'too_many_requests' },
  });
  ```
  Production safety: if `WEB_ORIGIN` is missing, the app crashes at startup. The auth limiter allows 20 login attempts per 15 min per IP — enough for legitimate users, but stops automated scanning.
- Why whitelist `WEB_ORIGIN` explicitly? If you allow all origins (`*`), a malicious web page can steal the user's session cookies / tokens. CORS whitelisting *and* token storage choice (httpOnly cookies vs. localStorage) both matter.

### Concept 4: The middleware pipeline order — why it matters
- middleware order is **not** a detail; it's an architecture decision. Wrong order = subtle security leaks.
- **Example failure mode:** if you place the rate-limiter *after* auth, then:
  1. Attacker sends `POST /auth/login?email=alice@example.com` with a bad password.
  2. `requireAuth` middleware runs *first* — but `/auth/login` is public, so `requireAuth` isn't applied. No problem yet.
  3. The request reaches the auth handler, which checks the password, fails, returns 401.
  4. Attacker sends the *same* request 1,000 times. Since rate-limit hasn't run yet, all 1,000 hit the handler.
  5. Attacker learns "alice@example.com exists" by seeing a 401 (email found, bad password) vs. 404 (email not found). This is *email enumeration*.

  **The correct order:** apply rate-limit *before* any route logic:
  ```javascript
  app.use('/auth', authLimiter, authRoutes);  // Line 67: limiter first
  app.use('/workouts', requireAuth, workoutsRoutes);  // auth after limiter, but only on /workouts
  ```
- "You have helmet, CORS, auth, rate-limit, error handler, and two route groups (/public and /protected). Order them to maximize security without letting the error handler catch security errors."
- **Real code** (`server/index.js`, lines 46–102):
  ```javascript
  // Security policies (always first — protect all traffic)
  app.use(helmet());
  app.use(express.json({ limit: '256kb' }));  // Parse JSON
  app.use(cors({ origin: allowedOrigin }));   // Check origin

  // Health check (not rate-limited — used by uptime monitors)
  app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

  // Public routes — auth is rate-limited
  app.use('/auth', authLimiter, authRoutes);  // Rate-limit on auth paths

  // Protected routes — auth required
  app.use('/workouts', requireAuth, workoutsRoutes);

  // Error handler — LAST (catches all thrown errors)
  app.use(errorHandler);
  ```
  The order: helmet → CORS → health → rate-limit → auth → routes → error handler. Each layer builds on the ones before.

### Concept 5: The error handler — mapping exceptions to HTTP responses
- "Your route handler calls `await db.query()` and the DB is down. The promise rejects with an error. What do you return to the client, and how does the error get there?"
- **The idea:** instead of wrapping every route in `try/catch`, you throw errors and let the error handler catch them at the end of the middleware stack. Express has a special convention: if middleware calls `next(err)`, Express jumps directly to the error handler (skipping other routes).
- **Real code** (`server/middleware/errorHandler.js`):
  ```javascript
  function errorHandler(err, _req, res, _next) {
      if (err && err.name === 'ZodError') {
          return res.status(400).json({ error: 'validation_failed', details: err.issues });
      }
      if (err && err.code === '23505') { // pg unique violation
          return res.status(409).json({ error: 'conflict' });
      }
      console.error('[unhandled]', err);
      return res.status(500).json({ error: 'internal_error' });
  }
  ```
  This maps three error types to HTTP responses:
  - Zod validation errors → 400 Bad Request.
  - Postgres unique constraint violation (code 23505) → 409 Conflict (e.g., email already registered).
  - Everything else → 500 Internal Server Error (and log for Sentry).
- why map errors at all? Consistency. Every 400 has the same shape (`{ error: 'validation_failed' }`), so the client can parse it the same way everywhere. A raw exception string from the DB would be unpredictable and leak implementation details.
- "A route calls `res.json({ user })` and then `throw new Error('oops')`. Does the error handler catch it, and what gets sent to the client?"
  > Answer: No. Once `res.json()` is called, the response headers are sent, and throwing an error after that is too late. The error is logged, but the client gets the successful response. This is a common Node bug. Best practice: never call `res.json()` and then throw.

### Concept 6: Request flow through the stack — tracing a real request
- "A user at `web.peakfettle.com` logs in. Trace the request from the browser to the response, naming each middleware and any guard checks."
- **The idea:** a POST to `/auth/login` enters the app and walks *every* middleware in order:
  1. **helmet** — adds security headers (e.g., `Content-Security-Policy`), calls `next()`.
  2. **express.json()** — parses the JSON body, populates `req.body`, calls `next()`.
  3. **cors()** — checks `Origin: web.peakfettle.com` against the whitelist. If allowed, calls `next()`. If denied, returns 403.
  4. **GET /health** — not a match, skips.
  5. **authLimiter** on `/auth` — checks the IP. If under 20 requests per 15 min, calls `next()`. If over, returns 429 Too Many Requests.
  6. **authRoutes** (the login handler) — calls `pool.query()` to look up the user, compares password with bcrypt, issues tokens.
  7. **The response** is sent: 200 + `{ user, accessToken, refreshToken }`.

  If an error is thrown (e.g., the email doesn't exist, return 401 early), the handler calls `return res.status(401).json(...)` and the middleware chain stops there. No error handler invoked, just a normal HTTP response.
- **Real code** (`server/routes/auth.js`, login handler excerpt):
  ```javascript
  router.post('/login', async (req, res, next) => {
      try {
          const { email, password } = LoginSchema.parse(req.body);
          const { rows } = await pool.query(
              `SELECT ... FROM users WHERE email = $1`,
              [email]
          );
          const user = rows[0];
          if (!user) return res.status(401).json({ error: 'invalid_credentials' });
          // ... check password, issue tokens
      } catch (err) { next(err); }
  });
  ```
  The `try/catch` calls `next(err)`, which jumps to the error handler. If the Zod schema fails to parse, it throws a ZodError, which the error handler catches and returns 400.

### Concept 7: Database connection pooling — why you can't block
- "You have a pool of 2 Postgres connections (line 15, `db.js`). If two requests call `pool.query()` at the same time, what happens to a third request?"
- **The idea:** the pool holds a *fixed* set of connections. Once all connections are in use, the next `.query()` *waits in a queue*. If 100 requests arrive at once, they queue up, and the pool serves them in order. If the pool is starved (all connections hung or slow), latency explodes.
- **Real code** (`server/db.js`):
  ```javascript
  const pool = new Pool({
      connectionString: process.env.SUPABASE_DB_URL,
      max: 2,  // Only 2 connections; Supabase nano instance is tiny
      idleTimeoutMillis: 10_000,  // Release idle connections quickly
      connectionTimeoutMillis: 10_000,  // Fail if can't get a connection
  });
  ```
  `max: 2` is intentional — Peak Fettle runs on a Supabase nano (512 MB RAM). A bigger pool would use too much memory. The comment says: "2 connections is enough for low-traffic / early-stage: one active query + one spare for a burst."
- as compute scales, this will need to change. The code *already* documents when to raise it: "Raise to 5–10 once compute is upgraded to micro or above." This is a capacity-planning anchor.

## 4. Cumulative review — rapid-fire
1. What does helmet do, and why does it not block requests?
2. If CORS rejects a request, at what stage does the browser know?
3. Why is the error handler placed *last* in the middleware stack?
4. If the DB pool has 2 connections and 5 requests arrive simultaneously, how many queue?


---

# Lesson L08 — REST API design: resources, verbs, and contracts

> **Track:** 2 — Node/Express/REST/auth/LLM/cron/deploy · **Status:** ⭐ Reference lesson (fully worked)
> **Estimated time:** ~45 min · **Prerequisite rungs:** L07 (middleware, Express routing)

## 1. Learning outcomes
By the end, Arvin can:
- **(L1)** Identify HTTP verbs (GET, POST, PATCH, DELETE) and name the intent of each.
- **(L2)** Explain the REST principle: "resources as nouns, HTTP verbs as actions" and why Peak Fettle uses `/sets`, not `/logSet`.
- **(L3)** Trace a request through request validation (Zod schema) → DB query → response normalization, and name where each layer can fail.
- **(L4)** Design an API endpoint's status codes and error shape, balancing developer experience with security (e.g., returning 401 vs. 404 for a missing auth token).
- **(L5)** Critique a public API surface for privacy/GDPR compliance and propose missing endpoints to prove deletions actually happened.

## 2. The difficulty ladder for THIS lesson
1. HTTP verbs and what they mean — GET (safe, idempotent), POST (create), PATCH (update), DELETE (remove).
2. Resources as the unit — `/users/{id}`, `/sets`, `/workouts/{id}/sets` — REST nouns, not verbs.
3. The request → validation → DB → response flow, and where errors live.
4. Idempotency and pagination — designing for reliability and scale.
5. Status codes as a contract: 200, 201, 204, 400, 401, 403, 404, 409, 500.
6. Privacy/GDPR: designing endpoints so data can be exported and deleted, and proving it happened.

## 3. Concept sequence

### Concept 1: HTTP verbs — the action layer
- "You have an exercise. How do you... create one? Read it back? Change its name? Delete it? Four operations, four different HTTP requests."
- **The idea:** HTTP defines verbs (methods) that correspond to CRUD operations:
  - **GET** — read only, safe (doesn't change state), idempotent (same result every time).
  - **POST** — create, not idempotent (posting twice creates two records).
  - **PATCH** — update part of a record, idempotent (patching the same data twice = same result).
  - **DELETE** — remove, idempotent (deleting an already-deleted record = 404 = same outcome).

  These aren't magical; they're conventions that browsers, caches, and proxies understand. A browser won't auto-retry a failed POST (you'd duplicate), but it *will* auto-retry a GET. A cache will store GET responses but not POST.
- "Peak Fettle allows users to undo a set log. Should that be PATCH (update a deleted flag) or DELETE (remove the row)? Why?"
- **Real code** (`server/routes/sets.js`, DELETE endpoint):
  ```javascript
  router.delete('/:id', async (req, res, next) => {
      try {
          const { rowCount } = await pool.query(
              `DELETE FROM sets WHERE id = $1 AND user_id = $2`,
              [req.params.id, req.user.id]
          );
          if (rowCount === 0) return res.status(404).json({ error: 'not_found' });
          res.status(204).end();  // 204 No Content — deletion succeeded, no body
      } catch (err) { next(err); }
  });
  ```
  DELETE returns 204 (No Content) on success — no JSON body, just headers. This signals: "the resource is gone; there's nothing to return." If called twice, the second call gets 404 (the record is already gone), but the *intent* (delete) is idempotent — the user's state is the same.
- why 204 instead of 200? 200 implies "here's data"; 204 says "operation succeeded, no data." Clients that don't handle 204 treat it as a network error, so standards matter. Peak Fettle uses 204 correctly.

### Concept 2: Resources and nouns — the REST principle
- "Your app has two operations: 'log a set' and 'undo a set log'. Would you create endpoints `/logSet` and `/undoSet`, or `/sets` with POST and DELETE? Why?"
- **The idea:** REST (Representational State Transfer) says: design your API around *resources* (nouns), not *actions* (verbs). The verbs come from HTTP.
  - **Anti-pattern:** `/logSet`, `/undoSet`, `/getHistory`, `/updateNotes` — verbs in the URL.
  - **REST pattern:** `/sets` (POST to create, GET to list, DELETE to remove), `/workouts/{id}` (GET to read, PATCH to update).

  Why? Consistency. Every resource follows the same verb pattern. A client library can auto-generate CRUD for any resource. And HTTP middleware (caching, routing, security policies) understand verbs; they don't understand custom action names.
- **Real code** (`server/routes/sets.js` and `server/routes/workouts.js`):
  ```javascript
  // Sets resource
  router.post('/', async (req, res, next) => { ... });  // POST /sets — create
  router.get('/', async (req, res, next) => { ... });   // GET /sets — list (paginated)
  router.delete('/:id', async (req, res, next) => { ... });  // DELETE /sets/:id — remove

  // Workouts resource
  router.post('/', async (req, res, next) => { ... });  // POST /workouts — create
  router.get('/:id', async (req, res, next) => { ... });  // GET /workouts/:id — read one
  router.patch('/:id', async (req, res, next) => { ... });  // PATCH /workouts/:id — update
  ```
  Every resource in the Peak Fettle API follows this pattern. New engineers can guess the endpoint: "to log a set, POST to `/sets`."
- "Why would an `/exercises/search` endpoint with a query parameter `?q=bench` be more RESTful than a `/searchExercises` POST endpoint?"
  > Answer: `/exercises/search?q=bench` is a GET on a resource (exercises); the search is a filter, not a custom action. `/searchExercises` invents a new action verb, breaking the "resources + HTTP verbs" contract.

### Concept 3: Request validation — the Zod layer
- "A user POSTs `{ kind: 'lift', reps: 0, weightKg: 999 }` to `/sets`. The code should reject this because reps >= 1 is required. Where does that validation live?"
- **The idea:** the request body arrives as JSON. Before touching the database, *validate* the shape and values. Zod is a TypeScript schema validation library. It's used on *every* Peak Fettle POST/PATCH:
  - Shape validation (is `reps` a number, is `email` a string?).
  - Range validation (reps >= 1, weightKg >= 0 and <= 4095.875 kg).
  - Discriminated unions (if `kind === 'lift'`, require `reps` and `weightKg`; if `kind === 'cardio'`, require `durationSec`).

  Invalid requests return 400 Bad Request immediately — no DB hit, no side effects.
- **Real code** (`server/routes/sets.js`, lines 43–70):
  ```javascript
  const LiftSetSchema = z.object({
      kind: z.literal('lift'),  // Literal type — must be exactly 'lift'
      workoutId: z.string().uuid(),  // Must be a valid UUID
      exerciseId: z.string().uuid(),
      setIndex: z.number().int().min(0),
      reps: z.number().int().min(1),  // TICKET-AA-03: reps >= 1 enforced here
      weightKg: z.number().min(0).max(4095.875),  // Max = max SMALLINT / 8
      rir: z.number().int().min(-1).max(10).optional(),
  });

  const CardioSetSchema = z.object({
      kind: z.literal('cardio'),
      workoutId: z.string().uuid(),
      exerciseId: z.string().uuid(),
      setIndex: z.number().int().min(0),
      durationSec: z.number().int().min(0),
      distanceM: z.number().min(0).optional(),
      avgPaceSecPerKm: z.number().min(0).optional(),
  });

  const SetSchema = z.discriminatedUnion('kind', [LiftSetSchema, CardioSetSchema]);

  router.post('/', async (req, res, next) => {
      try {
          const body = SetSchema.parse(req.body);  // Throws ZodError if invalid
          // ... safe to use body now
      } catch (err) { next(err); }
  });
  ```
  The error handler (L07) catches the ZodError and returns 400 with details.
- why the `min(1)` on reps? The code comment says "A set with zero reps is not a set — it has no E1RM, no PR contribution, and would inflate volume counts." This is a *domain* constraint (business logic), not just a form validation. The schema codifies it.

### Concept 4: Ownership and authorization — the T-03 pattern
- "A user POSTs to `/sets` with `workoutId: <alice's-workout>`. The server should check: does this workout belong to the *calling* user, or can they log a set in anyone's workout?"
- **The idea:** just because a client sends a valid UUID doesn't mean they own it. Before any write (INSERT/UPDATE/DELETE), verify ownership against `req.user.id`. This is the *authorization* layer (authentication = "are you who you say you are?", authorization = "are you allowed to do this?").
- **Real code** (`server/routes/sets.js`, lines 73–87):
  ```javascript
  router.post('/', async (req, res, next) => {
      try {
          const body = SetSchema.parse(req.body);

          // T-03: confirm the workout belongs to the calling user.
          const { rows: ownerCheck } = await pool.query(
              `SELECT id FROM workouts WHERE id = $1 AND user_id = $2`,
              [body.workoutId, req.user.id]
          );
          if (ownerCheck.length === 0) {
              return res.status(403).json({ error: 'workout_not_found_or_forbidden' });
          }
          // ... safe to insert
      } catch (err) { next(err); }
  });
  ```
  The comment "T-03 (2026-05-02): verify workout ownership before inserting" references a ticket. The CTO guardrail: "any route that accepts a foreign-key reference must verify ownership against `req.user.id` before writing." This is enforced on every route.
- "Why return 403 Forbidden instead of 404 Not Found if the workout doesn't exist?"
  > Answer: 403 says "that resource exists, you just can't see/edit it." 404 says "that resource doesn't exist or you can't see it." Some APIs return 404 to avoid leaking ownership (e.g., "this is Alice's private notebook" — return 404 so an attacker can't scan for IDs). Peak Fettle returns 403, trusting that IDs are hard to guess (UUIDs, not sequential integers).

### Concept 5: Status codes as a contract
- "A POST creates a set. The response is 201 Created + JSON. A DELETE removes a set. The response is 204 No Content (no body). Why the difference?"
- **The idea:** status codes are a *contract* between server and client. The code tells the client what happened:
  - **2xx (success):**
    - 200 OK — request succeeded, body has data (GET, PATCH responses).
    - 201 Created — resource created, body has the created resource (POST response).
    - 204 No Content — request succeeded, no body (DELETE response).
  - **4xx (client error):**
    - 400 Bad Request — validation failed (Zod error).
    - 401 Unauthorized — missing/invalid auth token.
    - 403 Forbidden — auth valid, but not allowed (wrong ownership, insufficient permissions).
    - 404 Not Found — resource doesn't exist.
    - 409 Conflict — constraint violation (e.g., email already registered).
  - **5xx (server error):**
    - 500 Internal Server Error — unhandled exception.

  Picking the right status code matters. A client might auto-retry on 5xx but not 4xx. A browser cache stores 200 but not 201. A load balancer might interpret 503 differently than 500.
- **Real code** (`server/routes/auth.js`, login):
  ```javascript
  if (!user) return res.status(401).json({ error: 'invalid_credentials' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid_credentials' });
  const tokens = await issueTokens(user);
  res.json({ user, ...tokens });  // Implicit 200
  ```
  Both wrong email and wrong password return 401 with the *same* message. This prevents email enumeration: an attacker can't tell if the email exists by timing or error messages.

### Concept 6: Pagination — the cursor pattern
- "A user has logged 10,000 sets over two years. They open their history. Do you send all 10,000 at once, or paginate?"
- **The idea:** pagination *splits* large result sets into pages. Peak Fettle uses **cursor-based pagination** (not offset-limit) because it's stable under concurrent deletes and more cache-friendly.
  - **Offset-limit:** "give me rows 100–150" — breaks if a row is deleted between page fetches.
  - **Cursor:** "give me rows after timestamp X" — stable; if rows are deleted, the cursor doesn't move.
- **Real code** (`server/routes/sets.js`, GET endpoint, lines 114–161):
  ```javascript
  router.get('/', async (req, res, next) => {
      try {
          const { workoutId, cursor } = req.query;
          const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);  // Max 200

          if (workoutId) {
              // Direct lookup — no pagination
              const { rows } = await pool.query(
                  `SELECT s.* FROM sets s
                   JOIN workouts w ON w.id = s.workout_id
                   WHERE s.workout_id = $1 AND w.user_id = $2
                   ORDER BY s.set_index ASC`,
                  [workoutId, req.user.id]
              );
              return res.json({ sets: rows.map(normalizeSet), nextCursor: null });
          }

          // Cursor-based scan across all sets for the user
          const params = [req.user.id, limit + 1];  // Fetch one extra to detect next page
          const cursorClause = cursor
              ? `AND s.logged_at < $${params.push(cursor) && params.length}`
              : '';

          const { rows } = await pool.query(
              `SELECT s.* FROM sets s
               WHERE s.user_id = $1 ${cursorClause}
               ORDER BY s.logged_at DESC
               LIMIT $2`,
              params
          );

          const hasMore = rows.length > limit;
          const page = hasMore ? rows.slice(0, limit) : rows;
          const nextCursor = hasMore ? page[page.length - 1].logged_at : null;

          res.json({ sets: page.map(normalizeSet), nextCursor });
      } catch (err) { next(err); }
  });
  ```
  The client receives `{ sets: [...], nextCursor: "2026-05-10T15:30:00Z" }`. To fetch the next page, they POST `?cursor=2026-05-10T15:30:00Z&limit=50`. The server returns rows logged before that timestamp.
- why fetch `limit + 1`? To detect whether there's a next page without an extra query. If `rows.length > limit`, there are more. If `rows.length <= limit`, it's the last page.

### Concept 7: Data normalization — encoding and decoding
- "The DB stores weight as SMALLINT (kg × 8) to save space. The API returns `weight_kg` as a float. How does that encoding happen, and where?"
- **The idea:** internal storage and API contracts can differ. Peak Fettle encodes `weight_kg` (float) as `weight_raw` (SMALLINT, kg × 8) for the database, then decodes on read so the client sees the float.
- **Real code** (`server/routes/sets.js`, lines 18–37):
  ```javascript
  function encodeWeight(kg) {
      return Math.round(kg * 8);  // 80.5 kg → 644 (SMALLINT)
  }

  function decodeWeight(raw) {
      return raw != null ? raw / 8 : null;  // 644 → 80.5 kg
  }

  function normalizeSet(row) {
      if (!row) return row;
      const { weight_raw, ...rest } = row;
      return { ...rest, weight_kg: decodeWeight(weight_raw) };
  }

  router.post('/', async (req, res, next) => {
      try {
          const body = SetSchema.parse(req.body);  // Client sends weight_kg
          // Encode weight_kg → weight_raw (kg × 8) for SMALLINT storage
          body.kind === 'lift' ? encodeWeight(body.weightKg) : null,
          // ...
          res.status(201).json(normalizeSet(rows[0]));  // Return weight_kg to client
      } catch (err) { next(err); }
  });
  ```
  The comment notes the trade-off: weight × 8 gives 1/8 kg precision (0.125 kg = 125 grams), which is "good enough" for fitness logging, and saves ~2 bytes per set. The encoding is transparent to the client.

### Concept 8: GDPR compliance — designing for deletion and export
- "A user requests their data and then requests account deletion. What endpoints does the API expose, and how do you prove the deletion actually happened?"
- **The idea:** GDPR requires two things: *data export* (the user can see everything the service stores about them) and *deletion* (the user can request permanent removal). Peak Fettle implements both:
  - **GET /user/data-export** — returns JSON with all user data (profile, workouts, sets, plans, constraints, health metrics, streaks).
  - **DELETE /user/account** — requires the user to confirm with `{ confirm: 'DELETE MY ACCOUNT' }`, then deletes all user-owned rows and the Supabase auth record.

  Both are rate-limited to prevent abuse.
- **Real code** (`server/routes/user.js`, lines 51–160 and 170–186):
  ```javascript
  router.get('/data-export', exportLimiter, async (req, res, next) => {
      try {
          const uid = req.user.id;
          const [profileResult, workoutsResult, setsResult, ...] = await Promise.all([
              pool.query(`SELECT ... FROM users WHERE id = $1`, [uid]),
              pool.query(`SELECT ... FROM workouts WHERE user_id = $1 ORDER BY day_key DESC`, [uid]),
              // ... more queries
          ]);
          const exportPayload = { exported_at: new Date().toISOString(), ... };
          res.setHeader('Content-Disposition',
              `attachment; filename="peak-fettle-export-${new Date().toISOString().slice(0, 10)}.json"`
          );
          res.json(exportPayload);
      } catch (err) { next(err); }
  });

  router.delete('/account', deleteLimiter, async (req, res, next) => {
      try {
          const { confirm } = req.body ?? {};
          if (confirm !== 'DELETE MY ACCOUNT') {
              return res.status(400).json({ error: 'confirmation_required' });
          }
          const uid = req.user.id;
          const client = await pool.connect();  // Use same connection for transaction
          try {
              await client.query('BEGIN');
              await client.query(`DELETE FROM sets WHERE workout_id IN (...)`, [uid]);
              await client.query(`DELETE FROM workouts WHERE user_id = $1`, [uid]);
              // ... delete all user-owned rows
              await client.query('COMMIT');
          } finally { client.release(); }
          res.status(204).end();
      } catch (err) { next(err); }
  });
  ```
  The export is rate-limited to 5 per hour (I/O heavy). The deletion is rate-limited to 3 per 15 min (irreversible). Both use `await Promise.all()` (export) or transactions (deletion) for consistency.
- why require the user to confirm with a specific string? "Friction guard against accidental clicks." And why use a single transaction for deletion? "Atomicity: if the process crashes halfway, either all rows are deleted or none are. No orphaned data."

## 4. Cumulative review — rapid-fire
1. What's the difference between a 404 and a 403, and when would you return each?
2. Why does the Zod schema enforce `reps >= 1`, and what domain constraint does that reflect?
3. A client receives `{ sets: [...], nextCursor: "2026-05-10T15:30:00Z" }`. How do they fetch the next page?
4. What is the purpose of the ownership check (`T-03`), and what attack does it prevent?


---

# Lesson L09 — Authentication & security: JWT, bcrypt, and token rotation

> **Track:** 2 — Node/Express/REST/auth/LLM/cron/deploy · **Status:** ⭐ Reference lesson (fully worked)
> **Estimated time:** ~50 min · **Prerequisite rungs:** L07–L08 (middleware, REST endpoints)

## 1. Learning outcomes
By the end, Arvin can:
- **(L1)** Define authentication, authorization, and the difference between symmetric and asymmetric cryptography.
- **(L2)** Explain how bcrypt hashing and salt work, and why you never store plain passwords.
- **(L3)** Compute a bcrypt hash and verify a password, understanding the work factor.
- **(L4)** Analyze JWT structure (header.payload.signature), explain how signing prevents tampering, and critique the claim "JWTs are encrypted."
- **(L5)** Evaluate the trade-off of storing tokens in localStorage (XSS-vulnerable) vs. httpOnly cookies (CSRF-vulnerable), and make a recommendation for Peak Fettle given its stack.

## 2. The difficulty ladder for THIS lesson
1. Authentication vs. authorization; hashing vs. encryption (conceptually).
2. Password hashing with bcrypt: salt, work factor, the hash output.
3. JWT structure and what "signing" means (not encryption).
4. Token rotation and revocation (the T-02 pattern in Peak Fettle).
5. Storage location (localStorage vs. httpOnly cookies) and attack vectors.
6. The full auth flow: signup → password hash → login → token issue → middleware verification → token refresh → logout.

## 3. Concept sequence

### Concept 1: Authentication vs. authorization, hashing vs. encryption
- "You know who someone is (authentication). But can they *do* something (authorization)? Two separate gates. And when you store a password, do you scramble it so no one can read it (encryption), or hash it so *no one* — not even you — can recover it?"
- **The idea:**
  - **Authentication:** "are you who you claim to be?" The login form verifies the password.
  - **Authorization:** "are you *allowed* to do this?" The ownership check verifies that the workout belongs to the user.
  - **Hashing:** one-way function (`hash(password) → 'a3f9d2c1'`). You can verify a password by hashing it again and comparing, but you can't reverse the hash to get the password. If the hash is leaked, the attacker *cannot* recover passwords (they'd need to brute-force: try every password, hash it, compare).
  - **Encryption:** two-way function (`encrypt(password, key) → 'x9y2z5'` and `decrypt('x9y2z5', key) → password`). If the key leaks, the attacker can decrypt all passwords *immediately*. Never encrypt passwords.
- "Peak Fettle stores password hashes in the database. If an attacker steals the database, can they log in as users? Why or why not?"
- **Real code** (`server/routes/auth.js`, signup):
  ```javascript
  router.post('/signup', async (req, res, next) => {
      try {
          const { email, password, displayName } = SignupSchema.parse(req.body);
          const passwordHash = await bcrypt.hash(password, 12);  // Hash the password
          const { rows } = await pool.query(
              `INSERT INTO users (email, password_hash, display_name)
               VALUES ($1, $2, $3)
               RETURNING ...`,
              [email, passwordHash, displayName || null]  // Store the hash, not the password
          );
          const user = rows[0];
          const tokens = await issueTokens(user);
          res.status(201).json({ user, ...tokens });
      } catch (err) { next(err); }
  });
  ```
  The password is hashed with `bcrypt.hash(password, 12)` before storing. The plain password is *never* stored, never logged, never transmitted except over HTTPS during signup/login.
- the second argument to `bcrypt.hash()` is the "work factor" (12). Higher = slower to compute (defensive against brute-force). The trade-off: signup/login takes ~100ms per user (acceptable); an attacker trying 1 billion password combinations would take years.

### Concept 2: Bcrypt and salt — the hashing mechanism
- "You hash 'password123' twice. Do you get the same hash both times, or different hashes? If they're different, how does login verification work?"
- **The idea:** bcrypt includes a **salt** (random data) in the hash output. The same password hashed twice produces *different* hashes because the salt is different each time. This prevents **rainbow table attacks** (pre-computed tables of "password → hash" used to reverse hashes).
  - Login verification works by: hash the submitted password with the salt extracted from the stored hash, then compare.
  - Example: if the database has `hash = '$2b$12$R9h/cIPz0gi.URNNUGEP2OPST9/PgBkqquzi.Ss7KIUgO2t0jKMm2'`, and the user submits `password123`, bcrypt extracts the salt (`$2b$12$R9h/cIPz0gi.URNNUGEP2`), re-hashes `password123` with that salt, and checks if the result matches the stored hash.
- **Real code** (`server/routes/auth.js`, login):
  ```javascript
  router.post('/login', async (req, res, next) => {
      try {
          const { email, password } = LoginSchema.parse(req.body);
          const { rows } = await pool.query(
              `SELECT id, email, display_name, password_hash, ...
               FROM users WHERE email = $1 AND deleted_at IS NULL`,
              [email]
          );
          const user = rows[0];
          if (!user) return res.status(401).json({ error: 'invalid_credentials' });

          const ok = await bcrypt.compare(password, user.password_hash);  // Verify
          if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

          const tokens = await issueTokens(user);
          delete user.password_hash;  // Never send hash to client
          res.json({ user, ...tokens });
      } catch (err) { next(err); }
  });
  ```
  `bcrypt.compare(password, user.password_hash)` returns true if the password matches, false otherwise. Both wrong email and wrong password return 401 with the same message (prevents enumeration).
- "If two users have the same password, do their password hashes look the same?"
  > Answer: No. Each hash includes a unique salt, so even identical passwords produce different hashes.

### Concept 3: JWT structure — header.payload.signature
- "A token arrives in the request header. How does the server know the client didn't *forge* it — didn't just make up a token claiming to be user ID 'alice'?"
- **The idea:** a JWT is three Base64-encoded parts separated by dots: `header.payload.signature`.
  - **header:** `{ "alg": "HS256", "typ": "JWT" }` — algorithm and type.
  - **payload:** `{ "sub": "alice", "email": "alice@example.com", "iat": 1234567890 }` — the claims (data).
  - **signature:** HMAC-SHA256 of `header.payload` using a secret key that *only the server knows*. If the client modifies the payload, the signature becomes invalid.

  Example: if the server's secret is `"my-secret"`, the signature is `HMAC-SHA256(header.payload, "my-secret")`. If the client changes the payload to claim `sub: "bob"`, the signature no longer matches (they don't know the secret to recompute it).
- "A malicious client intercepts a token, modifies the `sub` claim to a different user, and sends it back. Does the server accept it?"
- **Real code** (`server/routes/auth.js`, token issue):
  ```javascript
  async function issueTokens(user) {
      const accessToken = jwt.sign(
          { sub: user.id, email: user.email },  // Payload
          process.env.JWT_SECRET,  // Secret key
          { expiresIn: '15m' }  // Expires in 15 minutes
      );
      const refreshToken = jwt.sign(
          { sub: user.id, type: 'refresh' },
          process.env.JWT_SECRET,
          { expiresIn: '30d' }
      );
      // ... persist hash in refresh_tokens table
      return { accessToken, refreshToken };
  }
  ```
  `jwt.sign()` computes the signature using `JWT_SECRET`. The client receives the full token and sends it back in every request. The server verifies the signature using the same secret.
- **Real code** (`server/middleware/requireAuth.js`, verification):
  ```javascript
  function requireAuth(req, res, next) {
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : null;
      if (!token) return res.status(401).json({ error: 'missing_token' });

      try {
          const payload = jwt.verify(token, process.env.JWT_SECRET);  // Verify signature
          if (payload.type === 'refresh') {
              return res.status(401).json({ error: 'refresh_token_not_accepted' });
          }
          req.user = { id: payload.sub, email: payload.email };
          next();
      } catch (_err) {
          return res.status(401).json({ error: 'invalid_token' });
      }
  }
  ```
  `jwt.verify()` throws an error if:
  - The signature is invalid (tampered token).
  - The token is expired (`expiresIn` has passed).
  - The secret doesn't match (token from a different server).
- "JWTs are encrypted" is *wrong*. The payload is Base64-encoded (not encrypted), so anyone can decode it and read the claims. The *signature* prevents tampering, but it doesn't hide the payload. **Never put secrets in the JWT payload.** (Example: don't put the user's password or an API key in the JWT.)

### Concept 4: Token types and the T-01 guard
- "You have two types of tokens: access (short-lived, 15 min) and refresh (long-lived, 30 days). Can the client use a refresh token to call a protected route like `/workouts`? Should you allow it?"
- **The idea:** Peak Fettle issues two tokens:
  - **Access token:** used for every API call (e.g., `GET /sets`). Short-lived (15 min) to limit exposure if stolen.
  - **Refresh token:** used only to *refresh* the access token (e.g., `POST /auth/refresh`). Longer-lived (30 days) because it's used less frequently and stored more safely.

  If a client presents a *refresh* token as an *access* token, it's either a bug or an attack. Peak Fettle rejects it with 401. This is the **T-01** guard: distinguish token types at the middleware layer.
- **Real code** (`server/routes/auth.js`, token issue):
  ```javascript
  const accessToken = jwt.sign(
      { sub: user.id, email: user.email },  // No 'type' field — this is an access token
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
  );
  const refreshToken = jwt.sign(
      { sub: user.id, type: 'refresh' },  // 'type: refresh' — this is a refresh token
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
  );
  ```
- **Real code** (`server/middleware/requireAuth.js`, T-01 guard):
  ```javascript
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  if (payload.type === 'refresh') {
      return res.status(401).json({ error: 'refresh_token_not_accepted' });
  }
  ```
  If the client tries to use a refresh token (which has `type: 'refresh'`) as an access token, the middleware rejects it.

### Concept 5: Token rotation and revocation — the T-02 pattern
- "A user logs out. Should the old access token still work if the client sends it? How do you *prove* it's been revoked?"
- **The idea:** JWTs are *stateless* — the server doesn't store them. But logout requires *revoking* the token, so it can't be reused. Peak Fettle solves this with **token rotation**:
  1. When the client calls `/auth/refresh`, the server issues a *new* pair (access + refresh).
  2. The server *deletes* the old refresh token hash from the database.
  3. If the client tries to reuse an old refresh token (e.g., a stolen one), the server looks it up in the revocation list, doesn't find it, and rejects the request.

  This makes refresh tokens single-use (token rotation hardening).
- **Real code** (`server/routes/auth.js`, token issue with revocation):
  ```javascript
  async function issueTokens(user) {
      const accessToken = jwt.sign(
          { sub: user.id, email: user.email },
          process.env.JWT_SECRET,
          { expiresIn: '15m' }
      );
      const refreshToken = jwt.sign(
          { sub: user.id, type: 'refresh' },
          process.env.JWT_SECRET,
          { expiresIn: '30d' }
      );

      // Persist hash so logout can revoke it.
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await pool.query(
          `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (token_hash) DO NOTHING`,
          [user.id, hashToken(refreshToken), expiresAt]
      );

      return { accessToken, refreshToken };
  }
  ```
- **Real code** (`server/routes/auth.js`, token refresh with rotation):
  ```javascript
  router.post('/refresh', async (req, res, next) => {
      try {
          const { refreshToken } = req.body || {};
          if (!refreshToken) return res.status(400).json({ error: 'missing_refresh_token' });

          const payload = jwt.verify(refreshToken, process.env.JWT_SECRET);
          if (payload.type !== 'refresh') {
              return res.status(401).json({ error: 'invalid_token' });
          }

          // T-02: verify the token hash is in the active-tokens list.
          const hash = hashToken(refreshToken);
          const { rows: tokenRows } = await pool.query(
              `DELETE FROM refresh_tokens
               WHERE token_hash = $1 AND user_id = $2 AND expires_at > NOW()
               RETURNING user_id`,
              [hash, payload.sub]
          );
          if (tokenRows.length === 0) {
              return res.status(401).json({ error: 'invalid_token' });
          }

          // Issue a new rotated pair.
          const { rows: userRows } = await pool.query(
              `SELECT id, email FROM users WHERE id = $1 AND deleted_at IS NULL`,
              [payload.sub]
          );
          if (!userRows[0]) return res.status(401).json({ error: 'invalid_token' });

          const tokens = await issueTokens(userRows[0]);
          res.json(tokens);
      } catch (_err) {
          return res.status(401).json({ error: 'invalid_token' });
      }
  });
  ```
  On refresh, the old token hash is deleted (line `DELETE FROM refresh_tokens ...`). The new pair is issued. If the client tries to use the old refresh token again, the DELETE finds nothing, and the request fails with 401.
- why hash the refresh token before storing? So if the DB is leaked, an attacker doesn't immediately have valid refresh tokens. They'd need to brute-force the hash (hard, just like password hashes).

### Concept 6: Logout — revoking tokens
- "A user clicks 'log out'. You have a short-lived access token (15 min) and a long-lived refresh token (30 days). The access token will expire on its own. But the refresh token could be used to issue a new access token tomorrow. How do you revoke it?"
- **The idea:** on logout, the server deletes the refresh token hash from the database. If the client later tries to call `/auth/refresh` with that token, the query finds nothing and returns 401. The access token can't be revoked instantly (it's stateless), but it expires in 15 min anyway, and after logout the client should discard both tokens.
- **Real code** (`server/routes/auth.js`, logout):
  ```javascript
  router.post('/logout', async (req, res, next) => {
      try {
          const { refreshToken } = req.body || {};
          if (!refreshToken) {
              return res.status(204).end();  // No token, already logged out
          }

          let hash;
          try {
              hash = hashToken(refreshToken);
          } catch (_) {
              return res.status(204).end();  // Malformed token, treat as already logged out
          }

          await pool.query(
              `DELETE FROM refresh_tokens WHERE token_hash = $1`,
              [hash]
          );

          res.status(204).end();
      } catch (err) { next(err); }
  });
  ```
  The logout endpoint doesn't even verify the JWT signature (line `// We don't need to verify the JWT signature here`). It just hashes the token and deletes it. If the hash isn't in the DB, the DELETE is a no-op, and the response is still 204 (idempotent).

### Concept 7: Token storage — localStorage vs. httpOnly cookies
- "Your web client gets an access token. Store it in localStorage (JavaScript can access it), or in an httpOnly cookie (JavaScript cannot)? What's the trade-off?"
- **The idea:** two storage mechanisms, two threat models:
  - **localStorage:** JavaScript can read/write it. Vulnerable to XSS (cross-site scripting) — if the attacker injects malicious JS, they steal the token and impersonate the user. Defended against CSRF (cross-site request forgery) because the token isn't auto-sent in cookie headers.
  - **httpOnly cookie:** JavaScript *cannot* read it. The browser auto-includes it in every request. Defended against XSS (script can't steal what it can't read). Vulnerable to CSRF (the attacker's website can form a request that the browser auto-includes the cookie in, if the CSRF token isn't checked).

  Every choice has a risk:
  - XSS: inject malicious JS into the app to steal data / impersonate the user.
  - CSRF: trick the user's browser into making an unwanted request (e.g., form submission from attacker.com to peakfettle.com/delete-account).

  **Peak Fettle's choice:** not yet finalized in code, but the lesson explores both. Best practice for a SPA (single-page app) with a separate backend: httpOnly cookie for reading (auto-sent), CSRF token for mutations (written to a non-httpOnly cookie, included in POST body).
- neither choice is "perfect." The goal is defense-in-depth:
  1. **Prevent XSS:** Content Security Policy (helmet does this), input validation, escape user data.
  2. **Prevent CSRF:** CSRF token, SameSite cookie flag.
  3. **Minimize exposure:** short-lived access tokens, token rotation.
  Peak Fettle should probably use httpOnly cookies + CSRF tokens + SameSite=Strict. The quiz explores this trade-off.

### Concept 8: The full auth flow — signup → login → token refresh → logout
- "A new user signs up, logs in, makes API calls for a week, then logs out. Trace the tokens and database operations."
- **The idea:** the complete flow:
  1. **Signup:** POST `/auth/signup` with email + password → password hashed with bcrypt → user created → access + refresh tokens issued → refresh token hash persisted.
  2. **Login:** POST `/auth/login` with email + password → password verified with bcrypt.compare() → access + refresh tokens issued → new refresh token hash persisted.
  3. **API calls:** client sends access token in `Authorization: Bearer <token>` header → middleware verifies signature and expiry → grants access to protected routes.
  4. **After 15 min:** access token expires. Client calls POST `/auth/refresh` with refresh token → old token hash deleted from DB → new access + refresh tokens issued.
  5. **Logout:** POST `/auth/logout` with refresh token → token hash deleted from DB → client discards both tokens.
  6. **Reuse attempt:** attacker tries to use the old refresh token → query finds no hash in DB → 401 Unauthorized.
- **Real code**: already shown in pieces above. The full flow is in `auth.js`.

## 4. Cumulative review — rapid-fire
1. Why does bcrypt produce a different hash for the same password each time?
2. What is the role of the `signature` in a JWT, and what does it prevent?
3. If a client presents a refresh token to `/workouts`, what should the server return?
4. After a user logs out, can they use an old refresh token to get a new access token?


---

# Lesson L10 — LLM integration: Claude Haiku plan generation

> **Track:** 1 — Backend services · **Status:** ⭐ Reference lesson (fully worked)
> **Estimated time:** ~40 min · **Prerequisite rungs:** L01–L09 (API fundamentals, authentication, database)

## 1. Learning outcomes
By the end, Arvin can:
- **(L1)** Identify what a "structured output" API call is and when it's used instead of streaming.
- **(L2)** Explain why the paid tier is gated before the LLM call, and what "hard-block" constraints mean.
- **(L3)** Construct a user prompt from database context (history, health metrics, profile) and validate that it stays within the token budget.
- **(L4)** Analyze why Haiku was chosen over cheaper models (Gemini Flash, GPT-4o mini) and what "plan quality is the reason to exist" means.
- **(L5)** Evaluate the unit-economics case: at what subscriber price and regeneration frequency does Haiku's cost threaten margin, and what would you cache to break even?

## 2. The difficulty ladder for THIS lesson
1. The LLM API call shape: system prompt, user message, structured output.
2. Paid tier gating and what "free vs. paid" feature gates mean.
3. Loading user constraints (hard-block filter) and why contraindications are checked at DB query time.
4. Building the prompt from history (last 14 days), health metrics (last 7 days), and profile.
5. Parsing and validating the JSON response; retry strategy and error reporting.
6. Why Haiku, not Gemini Flash or GPT-4o mini (cost vs. quality vs. latency).
7. Unit-economics: margin calculation, breakeven pricing, caching strategies.

## 3. Concept sequence

### Concept 1: Calling an LLM API — the request/response shape
- "You want to ask Claude to generate a workout plan from a user's history. What must you tell Claude, and what do you expect back?"
- "System prompt tells Claude its role (coach), hard rules (only use these exercises, cite your reasoning), and output schema. User message gives the data (history, constraints, metrics)."
- **The idea:** LLM APIs separate static instructions (system prompt) from dynamic data (user message). The system prompt is **reusable across all calls**; the user message changes per user. This pattern minimizes token overhead and makes system-level changes (e.g., "you are now a strict reviewer") atomic.
- **Real code** (`routes/plans.js`, lines 407–432):
  ```javascript
  const systemPrompt = `You are a certified strength and conditioning coach building a single personalised workout session for a Peak Fettle user. Your response must be valid JSON only — no markdown, no prose outside JSON.

  HARD RULES:
  1. Only use exercises from the CANDIDATE LIST. Do not invent exercises.
  2. The "reasoning" field must cite at least one specific data point from the user's history, health metrics, or profile. Never write generic copy like "here is your workout".
  3. If the user has fewer than 3 sessions logged, reasoning must say: "You're new — this plan will adapt as you log more sessions."
  4. Honour all physical constraints — never suggest movements that the user has flagged as off-limits.
  5. Return 4–6 exercises per session. Include sets (3–5), reps (range e.g. "8-10"), rpe_target (1–10), rest_seconds (60–180).
  6. Every exercise MUST include a coaching_note: one concise sentence (10–20 words) describing technique focus or loading intent specific to this user's history. Never leave coaching_note blank or generic.

  JSON schema: { "session": { "exercises": [...] }, "reasoning": "..." }`;
  ```
- why are hard rules inside the system prompt and not post-processed? Because the model *learns from the rules* as part of understanding its job. A rule like "never invent exercises" is easier to honor if Claude sees it in the system context rather than after the fact. Post-processing can still validate (step 9), but the system prompt is the first line of defense.
- "Why does the system prompt include the exact JSON schema, and not just 'respond in JSON'?"

### Concept 2: Paid tier gating — why features are locked
- "A free user hits POST /plans/generate. What should the response be, and why not just return an empty plan?"
- **The idea:** AI-generated plans cost money (Haiku: ~2.5¢ per plan). A free user requesting a plan would burn margin. The endpoint checks `users.is_paid` **before calling the LLM** so a free user sees a 403 "upgrade copy" without any LLM cost.
- **Real code** (`routes/plans.js`, lines 283–294):
  ```javascript
  const { rows: userRows } = await pool.query(
      `SELECT is_paid FROM users WHERE id = $1`,
      [req.user.id]
  );
  if (!userRows[0]?.is_paid) {
      return res.status(403).json({
          error: 'paid_tier_required',
          message: 'AI-generated plans are a paid-tier feature. ' +
                   'Upgrade to Peak Fettle Pro to unlock personalised training.',
      });
  }
  ```
- the message is upgrade copy, not a technical error. This teaches the client's UX team what to show (a "Upgrade to Pro" button, not "error: forbidden").
- **:** "What would happen if we didn't gate? A malicious user or a script could hammer the endpoint with fake requests, costing $X per call." → seed for quiz q5.

### Concept 3: Hard-block constraints — the contraindications filter
- "A user logs they can't do overhead presses (shoulder injury). The candidate exercise list should never include 'Military Press' or 'Lateral Raises'."
- **The idea:** User constraints have a `constraint_type` (e.g., "shoulder_injury") and map to exercise `contraindications` arrays. **The query filters constraints at DB time**, not in the app. This ensures Claude never even sees exercises the user can't do — no post-processing, no trust in the model to respect the rule.
- **Real code** (`routes/plans.js`, lines 296–322):
  ```javascript
  // Load constraints: which movement patterns are off-limits
  const { rows: constraintRows } = await pool.query(
      `SELECT constraint_type, custom_note
       FROM user_constraints
       WHERE user_id = $1`,
      [req.user.id]
  );
  const constraints = constraintRows;
  const blockedTags = constraints
      .map(c => c.constraint_type)
      .filter(t => t !== 'custom');

  // Hard-block: any exercise whose contraindications overlap with blockedTags
  // is excluded from the candidate pool entirely.
  const { rows: exerciseRows } = await pool.query(
      `SELECT id, name, category, muscle_groups, is_compound, contraindications
       FROM exercises
       WHERE category = 'lift'
         AND ($1::text[] IS NULL
              OR NOT (contraindications && $1::text[]))
       ORDER BY name`,
      [blockedTags.length > 0 ? blockedTags : null]
  );
  ```
- "What does the `&&` operator do in SQL, and why not just list exercise IDs in the constraint?"
- The hard-block pattern appears in production systems everywhere (recommendation engines, content moderation). It's a design pattern worth recognizing.

### Concept 4: Building the prompt from user context
- "A user has 10 workouts logged in the last 14 days. Their bench press max is 140 kg. Their heart rate last night was 65 bpm; they slept 6 hours. All of that goes into the user message so Claude can write meaningful reasoning."
- **The idea:** The prompt is assembled from four database queries: constraints (hardened above), exercise history (14 days), health metrics (7 days), user profile (age, weight, experience). Each is formatted as human-readable text so Claude's context window is not wasted on JSON overhead.
- **Real code** (`routes/plans.js`, lines 357–405):
  ```javascript
  // History: last 14 days, lift sets only (kind = 'lift'), with computed E1RM
  const { rows: historyRows } = await pool.query(
      `SELECT
          e.name                      AS exercise_name,
          s.weight_raw / 8.0          AS weight_kg,
          s.reps,
          s.rir,
          CASE
              WHEN s.kind = 'lift' AND s.weight_raw > 0 AND s.reps >= 1 THEN
                  CASE
                      WHEN s.reps = 1 THEN s.weight_raw / 8.0
                      ELSE (s.weight_raw / 8.0) * (1.0 + s.reps::float / 30.0)
                  END
              ELSE NULL
          END                         AS e1rm_kg,
          w.day_key
       FROM sets s
       JOIN workouts w ON w.id = s.workout_id
       JOIN exercises e ON e.id = s.exercise_id
       WHERE w.user_id = $1
         AND w.day_key >= CURRENT_DATE - INTERVAL '14 days'
       ORDER BY w.day_key DESC, e.name
       LIMIT 80`,
      [req.user.id]
  );

  const historyText = historyRows.length > 0
      ? historyRows
          .map(r => `${r.day_key}: ${r.exercise_name} — ${r.weight_kg}kg × ${r.reps} reps` +
                     (r.rir != null ? ` (RIR ${r.rir})` : '') +
                     (r.e1rm_kg ? ` [e1RM ${r.e1rm_kg.toFixed(1)}kg]` : ''))
          .join('\n')
      : 'No recent history logged yet.';
  ```
- E1RM is computed inside the query (Epley formula with the reps=1 exception). Why not pre-compute? Because the set row doesn't store E1RM — it's a derived metric, just like in L01. Storing it would risk drift.
- a flow diagram showing data → database queries → format as text → system+user prompt → call Haiku → parse JSON.
- **:** "The exercise candidate list is capped at 60. Why? Token budget — too many exercises bloats the prompt and risks hitting the 5,000-token budget." → quiz q3.

### Concept 5: Calling the API, parsing the response, and retry strategy
- "Haiku returns a JSON string. We parse it. If it's malformed, we return a 502 'ai_parse_error' so the client knows to retry."
- **The idea:** Structured output (JSON) is simpler to parse than streaming text, but it **can fail**. Fallible steps are:
  1. JSON parsing (string → object).
  2. Schema validation (does it have `session.exercises[]` and `reasoning`?).
  3. Exercise name resolution (do the names in the plan map to DB IDs?).
  
  Each failure is a **retriable error** (502, client should retry) or a **final error** (400, client shouldn't retry). This distinction guides the client's UX.
- **Real code** (`routes/plans.js`, lines 455–489):
  ```javascript
  const message = await anthropic.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 1024,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userMessage }],
  });

  let aiResponse;
  try {
      const rawText = message.content[0].text.trim();
      aiResponse = JSON.parse(rawText);
  } catch {
      return res.status(502).json({
          error: 'ai_parse_error',
          message: 'Plan generation produced an unparseable response. Please try again.',
      });
  }

  if (!aiResponse?.session?.exercises || !Array.isArray(aiResponse.session.exercises)) {
      return res.status(502).json({
          error: 'ai_schema_error',
          message: 'Plan generation returned an unexpected structure. Please try again.',
      });
  }

  if (!aiResponse.reasoning || aiResponse.reasoning.trim().length === 0) {
      return res.status(502).json({
          error: 'ai_reasoning_missing',
          message: 'Plan generation did not include a reasoning field. Please try again.',
      });
  }
  ```
- "Why return 502 (Bad Gateway) instead of 400 (Bad Request)? What's the difference in how a client should handle them?"
- Does the response parsing strategy feel robust? What edge cases are missing?

### Concept 6: Why Claude Haiku, not Gemini Flash or GPT-4o mini
- "You can generate plans with three models: Gemini Flash ($0.0025/plan), GPT-4o mini ($0.005/plan), or Claude Haiku ($0.025/plan) — 10x more expensive. Why pay?"
- **The idea:** In a product, the **reason to exist** justifies the cost. For Peak Fettle, plan generation is a paid-tier feature — users pay money to unlock it. If the plans are formulaic or generic, users churn. If the plans are thoughtful (citing specific PRs, adapting to health metrics, respecting constraints), users stay and renew. Haiku's quality difference (vs. Flash) is worth the 10x cost because it protects the product's primary value prop: **high-quality, personalized programming**.
- **Cost breakdown** (from `cost_analysis_reference.md`):
  - **Gemini 2.0 Flash:** $0.0025 per plan. Excellent latency (~200ms), but outputs are often generic ("do 4×8 squats, then bench press") with no specific reasoning.
  - **GPT-4o mini:** $0.005 per plan. Middle ground. Respects constraints reliably but sometimes overlooks a detail (e.g., forgets RIR field, hardcodes rep ranges instead of personalizing).
  - **Claude Haiku 4.5:** $0.025 per plan. Slowest (~2s), but output is **consistently coherent**. Cites specific data points, adapts rep ranges to RIR patterns, and reasons about energy systems. This is the difference between "I generated your plan" and "I read your PRs and you're undershooting bench rep ranges by ~2 reps based on your November session — here's why I went for 8 reps instead."
- "cheaper" models *improve fast*. Gemini Flash 2.0 (April 2026) was a 10x leap from its predecessor. If Flash pulls even closer to Haiku by mid-2026, the cost calculus shifts. The pattern to watch: **benchmark your model choice every 6 months**. Cost improvements often outpace feature improvements.
- **:** "If a user regenerates their plan weekly at $0.025/week, and you pay them $9.99/month to be a subscriber, you're spending 1¢ to earn $10 — margin is safe. But if regeneration is *unlimited* and power users hit the endpoint 50 times/month (tweaking), the economics flip. Caching busts this — see Q5."

### Concept 7: Unit-economics and caching — where the real decision lives
- "You charge $9.99/month. A user regenerates their plan twice a week (likely scenario). Haiku costs 2.5¢ per plan. Is your margin safe?"
- **The idea:** Unit-economics is the argument that justifies paying for Haiku over Flash.
  - **Revenue:** $9.99/month = $0.33/day per subscriber.
  - **Cost (aggressive case):** 2 plans/week = 8 plans/month = $0.20/month.
  - **Margin:** $9.99 − $0.20 = $9.79 gross (before server, storage, customer support, etc.).
  
  **Safe?** Yes, until:
  - Users demand *unlimited* regeneration (50+/month per power user). Cost → $1.25/month. Margin shrinks.
  - Retention drops (users only regenerate once in their first week, then never again). Revenue collapses.
  
  **The leverage point:** **caching**. If you cache the last 5 generated plans and return a cached plan 80% of the time, you burn only 0.2 plan generations per month (20% of 1 per week), costing ~$0.005/month. Margin explodes.
- **Caching strategies:**
  1. **HTTP cache:** `Cache-Control: public, max-age=604800` (1 week). The client caches the JSON response. But doesn't help users who clear cache or switch devices.
  2. **Query-result cache (Redis):** key = `plan:user_id:hash(constraints+profile)`. TTL = 7 days. Survives client crashes; reduces DB load.
  3. **Prompt-level caching (Anthropic):** If Haiku adds cached prompts (like Claude 3.5 does), save the system prompt + unchanging history context as a cached block. First call: full cost. Subsequent calls: 10% of system cost. Turns $0.025 → $0.0025 for repeat users.
- "If you cache for 7 days, when should the cache invalidate? What if the user logs a new workout mid-week?"
- "At $9.99/month, what's the break-even regeneration frequency with and without Redis caching? What price point makes unlimited regeneration viable?"

## 4. Cumulative review — rapid-fire
1. Why are user constraints loaded from the database and not left for Claude to reason about?
2. If a user regenerates their plan 50 times/month, what would be more cost-effective: upgrade to GPT-4o, or implement caching?
3. What does it mean that the `is_paid` check happens *before* the LLM call, not after?


---

# Lesson L11 — Background jobs: node-cron and scheduled work

> **Track:** 1 — Backend services · **Status:** ⭐ Reference lesson (fully worked)
> **Estimated time:** ~45 min · **Prerequisite rungs:** L01–L10 (API, database, transactions)

## 1. Learning outcomes
By the end, Arvin can:
- **(L1)** Define "idempotent" and identify which cron jobs here are safe to double-run.
- **(L2)** Explain why some work (percentile recompute) is async/scheduled instead of happening on request.
- **(L3)** Construct a cron expression (5-minute frequency, weekly on Monday, custom backfill parameter).
- **(L4)** Analyze failure modes: what breaks if the percentile job runs twice in one day, and how does the `model_version` column prevent double-crediting?
- **(L5)** Evaluate trade-offs: what would you cache in the notification queue to reduce FCM API calls, and when would you sacrifice "immediate" for "batch"?

## 2. The difficulty ladder for THIS lesson
1. Real-time vs. async work — when to pick each.
2. Cron expression syntax and scheduling libraries (node-cron).
3. Idempotency: what it means, why it matters, how to enforce it.
4. The percentile batch: reading a view, calling PL/pgSQL, bulk upsert, commit/rollback.
5. The group-streak batch: per-group transaction, member evaluation, credit ledger writes.
6. The notification queue pattern: insert pending → poll → dispatch → mark sent.
7. Failure modes: double-run, stale job (skips a week), partial failure (some groups fail, others succeed).

## 3. Concept sequence

### Concept 1: Real-time vs. async — why some work is batched
- "A user logs a set for bench press. Should the app recalculate their percentile rank immediately and show it in the 'Set logged' response, or compute it later in batch?"
- **The idea:** Real-time recompute would require:
  1. Fetching the entire cohort (thousands of users in the same weight/age/experience band).
  2. Recomputing everyone's percentile (expensive statistical model).
  3. Returning all the results in the request.
  
  Latency: ~5–10 seconds. Cost: repeated millions of times.
  
  Batch recompute (once per week, Sunday 03:00 UTC) requires:
  1. One scheduled task.
  2. Return the user's new rank the next morning.
  
  Latency hit to user: acceptable (24 hours). Cost: **1 computation for the entire cohort**, not 1 per set.
  
  **(CTO guardrail from code comments):** "A single user logging a set should not trigger a full cohort re-rank." That's the principle.
- **Real code** (`cron/percentile.js`, lines 19–24):
  ```javascript
  // Why batch, not real-time?
  //   CTO guardrail #2: a single user logging a set should not trigger a full
  //   cohort re-rank. The weekly batch is cheap on expected data volumes for
  //   months 1–12. The user doesn't need a millisecond-fresh percentile — seeing
  //   "you're top 18% this week" the next morning is motivating enough.
  ```
- the "motivating enough" quote is key. Percentile is a *motivation lever*, not a *accuracy necessity*. If it's 24 hours stale, users still feel good. If the response time for "log set" jumps from 100ms to 5000ms, users hate it.
- "What's the difference between 'you're the 18th percentile user' and 'you're the 18th percentile *right now*'? Is staleness a product bug or a feature?"
- Does the batch-vs.-real-time tradeoff feel clear? Where else in Peak Fettle would you batch instead of real-time?

### Concept 2: Cron expressions and node-cron scheduling
- "The percentile job runs Sunday 03:00 UTC. Group streaks run Monday 00:05 UTC. Push dispatcher runs every 5 minutes. How do you express that?"
- **The idea:** Cron expressions are **5 fields**: `minute hour day_of_month month day_of_week`.
  - `0 3 * * 0` → "at 03:00, every day of month, every month, Sunday" = Sunday 03:00 UTC.
  - `5 0 * * 1` → "at 00:05, every day, every month, Monday" = Monday 00:05 UTC.
  - `*/5 * * * *` → "every 5 minutes, all day, every day" = every 5 minutes.
- **Real code** (`cron/percentile.js`, lines 25–31):
  ```javascript
  // Schedule:
  //   Deploy this as a Sunday 03:00 UTC scheduled task (node-cron or your
  //   deployment scheduler). It can also be invoked manually for backfills:
  //     node cron/percentile.js
  ```
- a week calendar showing when each job runs relative to user actions (log set → sync to DB → Sunday batch → percentile updates Monday AM).
- manual invocation is crucial. `node cron/percentile.js` without arguments uses the current date; `node cron/group-streaks.js 2026-04-27` backfills a specific week. This pattern lets you re-run a failed week without double-crediting (because of idempotency — see next concept).
- "What time is Sunday 03:00 UTC in your local timezone? (This trips people up.)"

### Concept 3: Idempotency — the shield against double-run disasters
- "The percentile job is scheduled for Sunday 03:00 UTC. It crashes. The operator re-runs it Monday 08:00 UTC (5 hours later). What should happen?"
- **The idea:** A job is **idempotent** if running it twice produces the same result as running it once. The percentile batch achieves this via the `ON CONFLICT` clause:
  - **First run (Sunday 03:00):** Inserts 50,000 rows into `user_percentile_rankings` (user × lift pairs).
  - **Second run (Monday 08:00):** Tries to insert the same 50,000 rows. The primary key `(user_id, lift_id, model_version)` already exists, so `ON CONFLICT ... DO UPDATE` runs, replacing the old values with the new ones. Result: the rows are updated in place, not duplicated.
  
  **Non-idempotent disaster:** if you didn't have `ON CONFLICT`, the second run would fail with a constraint violation, and you'd have a half-computed state (some rows updated, some not). Or worse: if you used `DELETE then INSERT`, the second run would delete the first run's results before reinserting them, creating a race condition window where percentiles are missing.
- **Real code** (`cron/percentile.js`, lines 108–121):
  ```javascript
  await client.query(
      `INSERT INTO user_percentile_rankings
          (user_id, lift_id, percentile, percentile_simple,
           cohort_size_internal, is_estimated, computed_at, model_version)
       VALUES ${values.join(', ')}
       ON CONFLICT (user_id, lift_id, model_version)
       DO UPDATE SET
          percentile           = EXCLUDED.percentile,
          percentile_simple    = EXCLUDED.percentile_simple,
          cohort_size_internal = EXCLUDED.cohort_size_internal,
          is_estimated         = EXCLUDED.is_estimated,
          computed_at          = EXCLUDED.computed_at`,
      params
  );
  ```
- idempotency is **not free**. It requires an identifying key (here: `(user_id, lift_id, model_version)`). If the key is too broad, the update is wrong. If it's too narrow, collisions happen for different users. Designing the key is the first step of any idempotent batch.
- **:** "The group-streaks job uses `(group_id, week_start)` as the idempotency key. What happens if you run it twice for the same week? Are credit ledger entries duplicated?" → seed for Q5 capstone.
- "Why does the percentile batch include `model_version` in the primary key, and not just `(user_id, lift_id)`?"

### Concept 4: The percentile batch — reading a view and bulk upserting
- "Every Sunday morning, Peak Fettle re-ranks all users. How? Query a view of all lifts, call a stored function for each, collect 50K results, upsert them all in chunks."
- **The idea:** The percentile batch is a **simple pattern:**
  1. Call a SQL function (`compute_percentile_batch(model_version)`) that returns precomputed rows.
  2. Chunk the results (500 at a time) to avoid bloating the query.
  3. Upsert with conflict resolution to be idempotent.
  4. Commit or rollback the entire batch in one transaction.
  
  This is **data-parallel work** — no side effects, no coordination with other services, just "recompute and persist." Perfect for cron.
- **Real code** (`cron/percentile.js`, lines 60–125):
  ```javascript
  // The SQL function does the heavy lifting
  const { rows } = await client.query(
      `SELECT user_id, lift_id, percentile, percentile_simple,
              cohort_size_internal, is_estimated, computed_at
       FROM compute_percentile_batch(2)`
  );

  rowsComputed = rows.length;

  // Bulk upsert in 500-row chunks
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const values = [];
      const params = [];

      chunk.forEach((row, idx) => {
          const base = idx * 7;
          values.push(`($${base + 1}, $${base + 2}, ..., $${base + 7}, 2)`);
          params.push(row.user_id, row.lift_id, ...);
      });

      await client.query(
          `INSERT INTO user_percentile_rankings ... VALUES ${values.join(', ')} ON CONFLICT ... DO UPDATE ...`,
          params
      );
  }

  await client.query('COMMIT');
  ```
- "Why chunk into 500 rows instead of upsert all 50,000 at once?"
- The pattern generalizes: "query → transform → chunk → bulk upsert." See it in any production batch job.

### Concept 5: The group-streaks batch — per-group transactions and credit ledger writes
- "Every Monday, the system evaluates 100 active groups. For each: snapshot members, check who hit their goals, credit the winners. What makes this harder than percentile?"
- **The idea:** Unlike percentile (one global upsert), group streaks involves:
  1. **Per-group decision:** did >50% hit their goal? (binary outcome).
  2. **Per-group state update:** streak counter, audit row.
  3. **Per-member ledger writes:** one row per eligible member (could be 12 × 100 = 1,200 rows).
  4. **Isolation:** groups must not interfere (one group's failure shouldn't crash another's credit writes).
  
  Solution: **one transaction per group**. If a group fails, rollback and log; move to the next group.
- **Real code** (`cron/group-streaks.js`, lines 206–345):
  ```javascript
  for (const group of groups) {
      const client = await pool.connect();
      try {
          await client.query('BEGIN');

          // Step 1: Snapshot eligible members (hard-block: joined_at < week_start)
          const { rows: eligible } = await client.query(
              `SELECT gm.user_id, gm.joined_at
               FROM group_memberships gm
               WHERE gm.group_id = $1 AND gm.joined_at < $2 AND (...)`,
              [group.id, weekStartStr]
          );

          // Check dormancy (must have ≥2 eligible members)
          if (eligible.length < 2) {
              await client.query('ROLLBACK');
              groupsSkipped++;
              continue;
          }

          // Step 2: For each member, check if they hit their goal
          let membersHitGoal = 0;
          for (const member of eligible) {
              const hit = await didHitGoal(client, member.user_id, weekStartStr, weekEndStr);
              if (hit) membersHitGoal++;
          }

          const hitRate = membersHitGoal / eligible.length;
          const success = hitRate > 0.50;

          // Step 3: Update group streak + write evaluation audit
          if (success) {
              const newStreakWeeks = group.current_streak_weeks + 1;
              const mult = multiplier(newStreakWeeks);
              const creditsPerMemberBase = Math.floor(BASE_CREDITS * mult);

              // Write credit_ledger row for each eligible member
              for (const member of eligible) {
                  const weeksInGroup = weeksSinceJoin(member.joined_at, weekStart);
                  const isNewJoiner = weeksInGroup < NEW_JOINER_GRACE_WEEKS;
                  const memberCredits = isNewJoiner ? BASE_CREDITS : creditsPerMemberBase;

                  await client.query(
                      `INSERT INTO credit_ledger (user_id, amount, source, group_id, week_start)
                       VALUES ($1, $2, 'group_streak', $3, $4)`,
                      [member.user_id, memberCredits, group.id, weekStartStr]
                  );
              }
          }

          await client.query('COMMIT');
      } catch (err) {
          await client.query('ROLLBACK');
          console.error(`[group-streaks-cron] ERROR on group ${group.id}:`, err.message);
      } finally {
          client.release();
      }
  }
  ```
- the per-group transaction pattern is crucial. It lets you handle failures gracefully: if one group's data is corrupt (invalid joined_at timestamp), that group's evaluation fails, but the other 99 groups succeed. Logging helps you find which group is broken so you can fix it.
- **:** "What if the group-streaks job runs twice for the same week? Are credits duplicated? How does the `(group_id, week_start)` PK prevent that?" → quiz q5.

### Concept 6: The notification queue pattern — async work that decouples from the LLM call
- "When a user's plan is generated (L10), you want to send a push notification. But FCM might be slow or fail. How do you handle that without blocking the user?"
- **The idea:** The queue pattern decouples producers (things that generate work) from consumers (things that do the work):
  1. **Producer (POST /plans/generate):** Insert a row into `notification_queue` with `sent_at = NULL`. Return immediately to the user.
  2. **Consumer (cron/push-dispatcher.js):** Poll the queue every 5 minutes, find rows with `sent_at IS NULL`, send FCM, mark `sent_at = NOW()` on success, or log the error.
  3. **Retry:** If send fails, `sent_at` stays NULL, and the next poll will retry (up to some limit).
  
  This pattern isolates the user from FCM latency (which can spike to 5+ seconds) and handles failures gracefully.
- **Real code** (`routes/plans.js`, lines 524–534):
  ```javascript
  // After generating the plan, enqueue a notification
  try {
      await supabaseAdmin.from('notification_queue').insert({
          user_id: req.user.id,
          type: 'plan_ready',
          title: 'Your personalised plan is ready',
          body: 'Tap to view your new AI-generated workout program.',
          data: { plan_id: plan.id ?? null },
      });
  } catch (_e) {
      console.warn('[push] plan_ready enqueue failed:', _e?.message);
      // Enqueue failure is not fatal — the user still got their plan
  }
  ```
  
  And the dispatcher (`cron/push-dispatcher.js`, lines 84–174):
  ```javascript
  async function run() {
      const { rows: pending } = await client.query(`
          SELECT nq.id, nq.user_id, nq.title, nq.body, nq.data, u.fcm_token
          FROM notification_queue nq
          JOIN users u ON u.id = nq.user_id
          WHERE nq.sent_at IS NULL
            AND u.fcm_token IS NOT NULL
          ORDER BY nq.created_at ASC
          LIMIT 50
      `);

      for (const notif of pending) {
          try {
              await sendFcm(notif.fcm_token, notif.title, notif.body, notif.data ?? {});
              await client.query(
                  `UPDATE notification_queue SET sent_at = NOW(), error = NULL WHERE id = $1`,
                  [notif.id]
              );
          } catch (err) {
              await client.query(
                  `UPDATE notification_queue SET error = $1 WHERE id = $2`,
                  [err.message.slice(0, 500), notif.id]
              );
              // If stale token, clear it so future runs skip
              if (errMsg.includes('NotRegistered')) {
                  await client.query(`UPDATE users SET fcm_token = NULL WHERE id = $1`, [notif.user_id]);
              }
          }
      }
  }
  ```
- the dispatcher handles a **stale token** gracefully: if FCM says "NotRegistered," the token is cleared immediately so future runs don't waste time on that user. This is called **circuit breaking** — stopping repeated attempts to reach a known-bad endpoint.
- "If the dispatcher crashes mid-run (after sending 25 of 50 notifications), what state is the database in? Is that safe?"

## 4. Cumulative review — rapid-fire
1. Express "every Monday at 00:05 UTC" as a cron expression.
2. Why does `group_week_evaluations` use `(group_id, week_start)` as the PK instead of just auto-incrementing?
3. If the push dispatcher processes 50 notifications per run and runs every 5 minutes, how long before a notification queued at 09:00 is sent (worst case)?


---

# Lesson L12 — Config, secrets, environments, and deployment

> **Track:** 1 — Backend services · **Status:** ⭐ Reference lesson (fully worked)
> **Estimated time:** ~45 min · **Prerequisite rungs:** L01–L11 (API, database, cron jobs)

## 1. Learning outcomes
By the end, Arvin can:
- **(L1)** List the three categories of environment variables: config (public), secrets (server-only), and credentials (dev tools).
- **(L2)** Explain why SUPABASE_SERVICE_ROLE_KEY must never appear in client code, and what RLS (row-level security) does.
- **(L3)** Construct a `.env` file for a new environment (dev, staging, prod) given a checklist.
- **(L4)** Analyze the blast radius of a leaked service-role key and design containment (where it can live, where it must never appear, detection strategy).
- **(L5)** Evaluate trade-offs: dev-local-LLM (no API keys, slow) vs. cloud LLM (keys required, fast). When would you use each?

## 2. The difficulty ladder for THIS lesson
1. Three categories of env vars: public config, server secrets, and dev-only credentials.
2. Why client code can't see server secrets (example: service-role key).
3. `EXPO_PUBLIC_*` prefix in React Native / Expo (all such vars are bundled into the app).
4. `.env.example` as a template — what's required, what's optional, what's dev-only.
5. Environment separation: dev, staging, production (different URLs, different secret stores).
6. Secrets management: `.env.local` (git-ignored), CI/CD secrets (GitHub Actions, EAS), and vault services.
7. The service-role key blast radius: what an attacker can do with it (bypass RLS, delete users, export all data).
8. Local LLM setup (dev path using Ollama or similar) vs. cloud LLM (API key required).

## 3. Concept sequence

### Concept 1: Three categories of env vars — knowing which is which
- "You have three pieces of config: the API URL, the database password, and your API key for Claude. Which should be in the app bundle, which in the server, and which only on your laptop?"
- **The idea:** Environment variables fall into three buckets:
  1. **Public config** (safe in the app bundle):
     - `EXPO_PUBLIC_API_URL=https://api.peakfettle.com` — the server address. Users can see it (it's in network requests anyway).
     - `EXPO_PUBLIC_POWERSYNC_URL=https://instance.powersync.journeyapps.com` — the sync service. Public by design.
  2. **Server secrets** (must never leave the server):
     - `SUPABASE_SERVICE_ROLE_KEY=...` — can bypass all row-level security. If this leaks, an attacker can delete any user's data.
     - `JWT_SECRET=...` — used to sign login tokens. If leaked, attackers can forge tokens.
     - `ANTHROPIC_API_KEY=...` — costs money to use. If leaked, attackers can burn your LLM budget.
  3. **Dev-only credentials** (your laptop only, never committed):
     - `.env.local` — your personal database URL for local testing, Ollama API key for local LLM, etc.
- **Real code** (`server/.env.example`, lines 1–27):
  ```
  # Public (safe to expose)
  WEB_ORIGIN=http://localhost:5173

  # Server secrets (NEVER expose)
  SUPABASE_DB_URL=postgres://postgres:PASSWORD@HOST:5432/postgres
  SUPABASE_SERVICE_ROLE_KEY=replace-with-service-role-key-from-supabase-dashboard
  JWT_SECRET=replace-with-64-bytes-of-randomness
  ANTHROPIC_API_KEY=sk-ant-...

  # Dev-only
  # (not in .env.example; lives in .env.local, git-ignored)
  ```

  And mobile (`mobile/.env.example`, lines 1–13):
  ```
  # Public (bundled into the app)
  EXPO_PUBLIC_API_URL=http://localhost:3001
  EXPO_PUBLIC_POWERSYNC_URL=https://YOUR_INSTANCE.powersync.journeyapps.com

  # Dev-only; stored locally
  # (not usually needed on mobile — server handles secrets)
  ```
- the `EXPO_PUBLIC_*` prefix is **automatic bundling**. Expo sees `EXPO_PUBLIC_FOO=bar` in `.env` and inlines it into the JavaScript bundle at build time. This is convenient (no server call needed to read config), but it means **anything you put here is visible to users**. Never put secrets there, even if you think they're "hidden."
- two columns: "Client (React Native)" and "Server (Node.js)". Arrows show:
  - API_URL: client → server (to know where to call).
  - SERVICE_ROLE_KEY: server only (never touches client).
  - LLM_API_KEY: server only (server calls Claude on behalf of user, not the client directly).
- "Why is EXPO_PUBLIC_API_URL safe to expose, but ANTHROPIC_API_KEY isn't?"

### Concept 2: The service-role key — blast radius and containment
- "The Supabase service-role key can bypass all row-level security. If an attacker gets this key, what can they do?"
- **The idea:** The service-role key is the **master key** to your database. RLS (row-level security) is the firewall that prevents users from seeing each other's data. The service-role key is an exception — it ignores RLS. If leaked:
  1. **Read any user's data:** workout history, percentiles, constraints, health metrics, even deleted data (if not hard-deleted).
  2. **Write/delete any user's data:** modify someone's PRs to inflate their percentile, delete their account, insert fake workouts.
  3. **Enumerate users:** iterate through all UIDs to build a user list (not useful per se, but enables targeted attacks).
  4. **Cost attacks:** if the key is misused, your Supabase bill spikes.
  
  **Containment:** the key must be:
  - **Never in client code:** it's a server-only secret.
  - **Never in git history:** use `.env` + `.gitignore` to ensure it's never committed.
  - **Only in server environment:** injected at deploy time (GitHub Secrets, EAS Secrets, etc.).
  - **Short-lived where possible:** some platforms (like EAS) offer per-build secrets that expire after the build.
  - **Monitored for leaks:** watch GitHub for accidentally-committed secrets (pre-commit hooks, automated scanning).
  
- **Real code** (`server/.env.example`, lines 10–13):
  ```
  # Supabase service role key — from Project Settings → API → service_role secret.
  # NEVER expose this to the client. Server-side only.
  # Required for: auth.admin.deleteUser() (TICKET-030) and any privileged admin ops.
  SUPABASE_SERVICE_ROLE_KEY=replace-with-service-role-key-from-supabase-dashboard
  ```

  And how it's used (safe pattern) in `lib/supabaseAdmin.js`:
  ```javascript
  const { createClient } = require('@supabase/supabase-js');
  const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY  // Read from env, never hardcoded
  );
  ```

  And how it's NOT used (dangerous):
  ```javascript
  // ❌ WRONG — never do this
  const supabaseAdmin = createClient(url, 'sk-...' /* hardcoded key in source */);

  // ❌ WRONG — never push this to git
  // .env file committed to git with the key visible in history
  ```
- **:** "An engineer accidentally commits `.env` to GitHub. In 10 minutes, GitHub detects the secret and emails the org. You have 10 minutes to revoke the key. What steps?" → seed for Q5 capstone.
- "Why can't the service-role key be stored in the mobile app's `.env` file?"

### Concept 3: Environment separation — dev, staging, production
- "Your app has three environments: dev (your laptop), staging (test server), production (real users). Each has a different database URL and secret store. How do you prevent deploying staging code to prod?"
- **The idea:** Environments are **isolated copies** of your system:
  - **Dev:** your local laptop, `localhost:4000`, local Postgres, `.env.local` with test API keys.
  - **Staging:** a test server (Vercel, Heroku, EAS, etc.), staging Supabase database, real API keys but tied to a test account.
  - **Production:** the live app, prod Supabase, real users, real money.
  
  The challenge: **ensure that staging code never overwrites prod.** Solutions:
  1. **Branch-based deployment:** `main` → prod, `develop` → staging, `feature/*` → dev. CI/CD enforces this.
  2. **Env var validation:** at startup, your server reads the current env and refuses to start if mismatched (e.g., if prod code tries to run with staging DB URL).
  3. **Secrets isolation:** prod secrets are stored in a prod vault; CI/CD never gives them to staging builds.
- **Real code** (`server/.env.example` repeated for each environment):
  ```
  # Staging .env
  SUPABASE_DB_URL=postgres://...staging...
  SUPABASE_URL=https://staging-project.supabase.co
  
  # Prod .env
  SUPABASE_DB_URL=postgres://...prod...
  SUPABASE_URL=https://prod-project.supabase.co
  ```

  And validation (defensive, not shown in code but good practice):
  ```javascript
  // At server startup
  if (process.env.NODE_ENV === 'production' && !process.env.SUPABASE_DB_URL.includes('prod')) {
      throw new Error('Prod env detected but non-prod DB URL — refuse to start!');
  }
  ```
- staging is **not optional** — it's where you catch bugs before prod. If you skip staging and deploy straight to prod, expect data corruption, user-visible errors, and emergency reverts at 3 AM.
- three columns (dev, staging, prod), each with its own DB, secrets store, and code path. Arrows showing: dev → staging (on PR merge) → prod (on release tag).

### Concept 4: Secrets management — from `.env.local` to CI/CD to vault services
- "You're running cron jobs on a server. Where does the server get its DATABASE_URL and ANTHROPIC_API_KEY?"
- **The idea:** Secrets must be:
  1. **Never in the repository:** `.env` files are git-ignored.
  2. **Available at runtime:** injected by the deployment process.
  3. **Audited:** logs show when they were accessed (good practices only; some setups skip this).
  
  Three strategies, in increasing order of complexity:
  
  **A. Dev: `.env.local` (git-ignored file)**
  - You manually create `.env.local` on your laptop with your personal API keys.
  - The server reads it at startup: `require('dotenv').config();`
  - Pros: simple, no setup.
  - Cons: easy to leak (if you `git add .` without checking gitignore), manual on each dev laptop.
  
  **B. CI/CD: GitHub Actions / EAS secrets**
  - You add secrets to GitHub (repo settings → Secrets).
  - The workflow file references them: `DATABASE_URL: ${{ secrets.DATABASE_URL }}`
  - At build time, GitHub injects them as env vars.
  - Pros: encrypted, revisionable (see who added/changed each secret), per-repo.
  - Cons: requires GitHub account access, not portable to other CI systems.
  
  **C. Vault services (Doppler, HashiCorp Vault, AWS Secrets Manager)**
  - Centralized secret store, encrypted at rest, audited access.
  - Your CI/CD pipeline fetches secrets from the vault at build time.
  - Pros: audit trail, rotatable secrets, shareable across teams.
  - Cons: added infrastructure, additional monthly cost.
  
- **Real code** (`cron/percentile.js`, line 33):
  ```javascript
  require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
  const { pool } = require('../db');
  ```
  This reads `.env` at startup. In prod, the `.env` file is injected by the deployment process (e.g., GitHub Actions injects `DATABASE_URL` as an env var, which dotenv then reads).

  Alternatively (more secure):
  ```javascript
  // Don't use .env file in prod — read directly from process.env
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) throw new Error('DATABASE_URL not set');
  ```
- "If you check your `.env.local` file (with your API keys) into git by accident, what's the first thing you should do?"

### Concept 5: Local LLM development — the Ollama path
- "You're building LLM-powered features (like plan generation). You don't want to burn API quota during development. What's the alternative to calling Claude Haiku?"
- **The idea:** **Ollama** (or similar local LLM services) runs an open-source LLM on your laptop. You call it via the same API as a cloud provider, but it's free and offline.
  - **Haiku in prod:** $0.025 per plan, cloud-hosted, high quality.
  - **Llama 2 / Mistral locally:** free (compute on your laptop), lower quality, but enough for testing.
  
  The **local path** (from `setup_local_llm.ps1`):
  ```powershell
  # 1. Download Ollama from ollama.ai
  # 2. Run: ollama pull mistral (or llama2)
  # 3. Start the server: ollama serve
  # 4. In your app:
  #    - Set ANTHROPIC_API_KEY to http://localhost:11434/v1 (Ollama compatibility mode)
  #    - Or use the Ollama client library directly
  # 5. Call Claude SDK pointing to localhost
  ```

  The code change (minimal):
  ```javascript
  // Dev
  const anthropic = new Anthropic({
      apiKey: 'dummy-key-for-local-llm',  // Ollama ignores this
      baseURL: 'http://localhost:11434/v1',  // Point to Ollama
  });

  // Prod
  const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,  // Real key
      // baseURL defaults to api.anthropic.com
  });
  ```
- local LLMs are **slower and lower quality** than cloud LLMs. Mistral on a modern laptop takes ~3 seconds to generate a plan (vs. 1 second for Haiku). But they're great for:
  - Testing prompt engineering (iterate on system/user message).
  - Catching JSON parsing bugs without burning API quota.
  - Teaching: running LLM integration code without secrets.
- **:** "If you set up Ollama locally, you can develop offline. But how do you test plan generation when you don't have Haiku's output quality?" → seed for Q5 capstone.

### Concept 6: Deployment pipeline — how code and secrets get from your laptop to production
- "You merge a PR to `main`. How does it get to the live app? Who manages the secrets? What if the deployment fails halfway?"
- **The idea:** A typical deployment pipeline:
  1. **Developer:** pushes code to `main` branch.
  2. **GitHub:** detects the push, triggers a workflow.
  3. **CI/CD (GitHub Actions):** runs tests, lints, builds the app.
  4. **Secrets injection:** GitHub fetches prod secrets and injects them as env vars into the build.
  5. **Build artifact:** a Docker container (or compiled binary) with the secrets baked in.
  6. **Deploy:** push the container to a registry (Docker Hub, ECR, etc.), then deploy to the server (Vercel, EAS, Kubernetes, etc.).
  7. **Health check:** the server starts up, reads the `.env` (or env vars injected by the platform), connects to the database.
  8. **Rollback:** if health check fails, revert to the previous version (with the old secrets still available).
  
  The key insight: **secrets are injected at deploy time, not stored in the code.**
- **Real code** (example GitHub Actions workflow, conceptual):
  ```yaml
  name: Deploy to production
  on:
    push:
      branches: [main]
  
  jobs:
    deploy:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v2
        - name: Build
          env:
            ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
            DATABASE_URL: ${{ secrets.DATABASE_URL }}
          run: npm run build
        - name: Deploy
          env:
            DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}
          run: |
            # Push to server, restart cron jobs, etc.
            scp -i $DEPLOY_KEY dist/ prod-server:/app/
            ssh -i $DEPLOY_KEY prod-server systemctl restart app
  ```
- if the build fails (e.g., bad code), the workflow stops and doesn't deploy. If the deploy fails (e.g., server won't start), you can revert to the previous version — which has the old secrets in the env. This is why secrets aren't hardcoded; they're always external.
- "Why must secrets be injected at deploy time and not at build time?"

## 4. Cumulative review — rapid-fire
1. List the three categories of env vars and give an example of each.
2. Why is `EXPO_PUBLIC_API_URL` safe to expose but `SUPABASE_SERVICE_ROLE_KEY` isn't?
3. What's the difference between dev, staging, and production environments? Why not skip staging and deploy straight to prod?

## Appendix: Quick reference — env var checklist

### For `.env.example` (server)
```
# Public config
WEB_ORIGIN=http://localhost:5173
PORT=4000

# Server secrets (from Supabase dashboard)
SUPABASE_DB_URL=postgres://...
SUPABASE_URL=https://...supabase.co
SUPABASE_SERVICE_ROLE_KEY=...

# Auth
JWT_SECRET=...

# LLM
ANTHROPIC_API_KEY=sk-ant-...

# Optional
SENTRY_DSN=
POSTHOG_KEY=
FCM_SERVER_KEY=...
```

### For `.env.example` (mobile)
```
# Public (bundled into app)
EXPO_PUBLIC_API_URL=http://localhost:3001
EXPO_PUBLIC_POWERSYNC_URL=https://...powersync.journeyapps.com
```

### For `.env.local` (dev laptop, never committed)
```
# Your personal dev secrets
SUPABASE_DB_URL=postgres://localhost:5432/dev_db
ANTHROPIC_API_KEY=sk-ant-YOUR-DEV-KEY
FCM_SERVER_KEY=...YOUR-DEV-KEY

# Local LLM (optional)
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=mistral
```

### Deployment (GitHub Actions / EAS)
```yaml
env:
  # Injected by CI/CD from GitHub Secrets
  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
  SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SERVICE_ROLE_KEY }}
  JWT_SECRET: ${{ secrets.JWT_SECRET }}
```


---

# Lesson L13 — React Native, Expo, and file-based routing with expo-router

> **Track:** 2 — Mobile Architecture · **Status:** ⭐ Fully worked
> **Estimated time:** ~40 min · **Prerequisite rungs:** L01–L12 (basic domain + API concepts)

## 1. Learning outcomes
By the end, Arvin can:
- **(L1)** Name the three core differences between React Native, web React, and Expo.
- **(L2)** Explain why `mobile/app/(auth)/` and `mobile/app/(tabs)/` are route groups and how folders become URLs.
- **(L3)** Trace the request "user taps Home tab" through the navigation tree: `/(tabs)` group → `index.tsx` → `<Tabs.Screen name="index">` rendering.
- **(L4)** Analyze the provider nesting order (`ThemeProvider` outermost, `PowerSyncProvider` innermost) and predict what breaks if it changes.
- **(L5)** Evaluate the "auth guard in the root layout" pattern against alternatives (a dedicated redirect screen, a separate login/app router), and defend the current approach for an offline-first app.

## 2. The difficulty ladder for THIS lesson
1. React Native vs. web React vs. Expo — the platform landscape.
2. File-based routing: folders = routes, `(auth)` = route groups.
3. Anatomy of a layout file: `_layout.tsx` and `<Stack>` / `<Tabs>` components.
4. Auth guard: checking `isLoading` and `isAuthenticated`, redirecting with `router.replace()`.
5. Provider nesting and dependency injection (ThemeProvider depends on nothing; AuthProvider needs ThemeProvider for error UI; PowerSyncProvider needs AuthProvider for the JWT).
6. The screen inventory: modals, stacks, one-time screens, and how they interleave.

## 3. Concept sequence

### Concept 1: React Native, Expo, and why the platform matters
- "You've written React for the web. Your app renders on iPhone using the same JavaScript. What's different?"
- **The idea:** React Native compiles JSX to native iOS/Android APIs. The DOM (`<div>`, `<span>`) doesn't exist; instead, you use `<View>`, `<Text>`, `<ScrollView>`. Layout is *always* flexbox (no CSS Grid). Styling uses `StyleSheet.create()` — a RN-specific API that returns an object with numeric IDs, not a CSS file.
  - **Web React:** JSX → DOM → browser renders HTML.
  - **React Native:** JSX → native (iOS UIView, Android View) → OS renders natively.
  - **Expo:** A managed platform that wraps React Native and handles the build/deploy pipeline (EAS Build for CI, Expo Go for local dev).
- Show `mobile/app/_layout.tsx` lines 36–44 and point out `<Stack>`, `<StatusBar>`, `<ActivityIndicator>` — all native components, not web DOM.
- **Why it matters:** Native components are *fast* (no web bridge overhead) and *feel right* (iOS buttons bounce, Android ripples). But debugging is harder, and ecosystem packages are fewer.
- What's Expo? It's a build service + a local development server (`expo-dev-client`). It handles code signing for iOS, manages environment variables, and provides a curated set of modules (camera, notifications, etc.) that integrate with the native OS.
- "You want to add a camera to Peak Fettle. Would you use a web library like `react-camera`, or an Expo module? Why?"

### Concept 2: File-based routing — folders are URLs, `(auth)` and `(tabs)` are route groups
- "In web Next.js, `app/posts/[id].tsx` becomes `/posts/:id`. Peak Fettle doesn't use Next.js — it's a mobile app. How does it define routes without a URL bar?"
- **The idea:** expo-router (RN's first-party routing library) uses the *file system as the route definition*. Every `.tsx` file in `mobile/app/` maps to a screen accessible via a URL-like address. Folders with parentheses, like `(auth)` and `(tabs)`, are **route groups** — they group screens under a layout but don't appear in the URL.
  ```
  mobile/app/
    _layout.tsx                    → Root layout (wraps everything)
    (auth)/
      _layout.tsx                  → Auth stack layout
      login.tsx                    → Screen: /(auth)/login
      register.tsx                 → Screen: /(auth)/register
    (tabs)/
      _layout.tsx                  → Tab bar layout
      index.tsx                    → Screen: /(tabs)/ (Home tab)
      log.tsx                       → Screen: /(tabs)/log (Log tab)
      rankings.tsx                 → Screen: /(tabs)/rankings
      plans.tsx                    → Screen: /(tabs)/plans
      profile.tsx                  → Screen: /(tabs)/profile
    progress.tsx                   → Push screen: /progress
    health-metrics.tsx             → Push screen: /health-metrics
    groups.tsx                     → Push screen: /groups
  ```
- **Route groups explained:** `(auth)` and `(tabs)` are *not* part of the path. They're a way to group related screens under a shared layout without adding extra nesting to the URL. The `_layout.tsx` file inside a group defines the container component (`<Stack>` for auth, `<Tabs>` for the main app).
- In `mobile/app/(auth)/_layout.tsx`, there's a `<Stack>` component that renders `<Stack.Screen name="login">` and `<Stack.Screen name="register">`. When the user navigates to `/(auth)/login`, the Stack shows the login screen with a back button. When they tap Register, the Stack pushes the register screen on top.
- They avoid URL pollution and allow multiple routes to share the same layout. Without groups, you'd have `/auth/login`, `/auth/register`, `/tabs/home`, `/tabs/log` — messy. With groups, the URL is clean (`/login`, `/home`) and related screens share a layout.
- "If you added a new file `mobile/app/(tabs)/debug.tsx`, what URL would it be accessible at, and would it show the tab bar?"

### Concept 3: The root layout and auth guard
- **The idea:** `mobile/app/_layout.tsx` is the outermost component. It wraps the entire app in three providers (Theme, Auth, PowerSync), then renders a `<RootNavigator>` that checks the auth state and either shows a spinner or the route tree.
- **Real code** (`mobile/app/_layout.tsx` lines 119–136):
  ```tsx
  export default function RootLayout(): React.ReactElement {
    return (
      <ThemeProvider onThemeChange={async (newTheme: ThemeName) => {
        await patchProfile({ theme_preference: newTheme }).catch(() => {});
      }}>
        <AuthProvider>
          <PowerSyncProvider>
            <RootNavigator />
          </PowerSyncProvider>
        </AuthProvider>
      </ThemeProvider>
    );
  }
  ```
- **Provider nesting order (outermost to innermost):**
  1. **ThemeProvider:** Provides design tokens (colors, fonts, spacing). Nothing depends on it — it's safe to be outermost. Every component in the app (including login screens) can call `useTheme()`.
  2. **AuthProvider:** Manages the JWT, refresh token, and user state. Depends on ThemeProvider for error UI.
  3. **PowerSyncProvider:** Boots the local SQLite database and starts syncing. Depends on AuthProvider because it calls `useAuth()` to get the JWT and listen for token rotations.
- **The RootNavigator guard** (`mobile/app/_layout.tsx` lines 49–113):
  ```tsx
  function RootNavigator(): React.ReactElement {
    const { isLoading, isAuthenticated } = useAuth();
    const { theme } = useTheme();

    if (isLoading) {
      return <View style={[styles.loadingContainer, { backgroundColor: theme.colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={theme.colors.accentDefault} />
      </View>;
    }

    return (
      <>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          {/* modal screens: progress, health-metrics, etc. */}
        </Stack>
      </>
    );
  }
  ```
  - While `isLoading` is true (cold-start silent refresh in flight), the guard renders a spinner.
  - Once `isLoading` resolves, the `<Stack>` is rendered. The *initial route* depends on `isAuthenticated` — this is wired in AuthContext, which calls `router.replace()` on login/logout to switch between `/(auth)/*` and `/(tabs)/*`.
- Why does ThemeProvider read the persisted theme from AsyncStorage *on mount*? Because the OS native layer renders the status bar and navigation UI before React hydrates. If we don't apply the theme immediately, the first frame shows the wrong colors (flicker). By reading from storage before rendering, we avoid the flash.
- "The PowerSync provider calls `useAuth()` to get the JWT. If you moved PowerSync before AuthProvider, what would break?"

### Concept 4: Anatomy of a layout file — `_layout.tsx` and the Stack/Tabs components
- **The idea:** Each folder can have a `_layout.tsx` file (the underscore is significant — it's excluded from routing). This file defines the container for all screens in that folder. For auth, the container is a `<Stack>` (push/pop navigation). For tabs, it's a `<Tabs>` bar.
- **Real code** (`mobile/app/(auth)/_layout.tsx` — simplified):
  ```tsx
  import { Stack } from 'expo-router';

  export default function AuthLayout() {
    return (
      <Stack
        screenOptions={{
          headerShown: false,
          animationEnabled: true,
        }}
      >
        <Stack.Screen name="login" options={{ title: 'Login' }} />
        <Stack.Screen name="register" options={{ title: 'Register' }} />
      </Stack>
    );
  }
  ```
  When the user navigates to `/(auth)/login`, the Stack renders `login.tsx`. When they tap a "Go to Register" button (using `router.push('/(auth)/register')`), the register screen slides in from the right. The back button pops it off.
- **Real code** (`mobile/app/(tabs)/_layout.tsx` lines 85–216 — Tab bar with FAB):
  ```tsx
  export default function TabsLayout() {
    return (
      <Tabs screenOptions={{ tabBarActiveTintColor: colors.accentDefault }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size, focused }) => (
              <AnimatedTabIcon
                name={focused ? 'home' : 'home-outline'}
                size={size}
                color={color}
                focused={focused}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="log"
          options={{
            tabBarLabel: () => null,
            tabBarButton: (props) => (
              <TouchableOpacity
                style={{ top: -18, width: 56, height: 56, borderRadius: 28 }}
              >
                <View style={{ backgroundColor: colors.accentDefault }}>
                  <Ionicons name="flash" size={28} />
                </View>
              </TouchableOpacity>
            ),
          }}
        />
        {/* rankings, plans, profile */}
      </Tabs>
    );
  }
  ```
  Each `<Tabs.Screen>` is a tab. The Log tab is special — it has `tabBarButton` customized to render a floating action button (FAB) in the center of the tab bar, overlapping the edge.
- Why `tabBarLabel: () => null` for the Log tab? Because the FAB has no label, just an icon. Setting the label to `null` hides the text that would normally appear below the icon.
- "You want to add a Settings tab. Write the code for `<Tabs.Screen name="settings">` with an icon and label."

### Concept 5: The screen inventory and navigation patterns
- **Authenticated main screens (in `(tabs)/`):** Home, Log, Rankings, Plans, Profile. These are always visible (tappable via tab bar) when authenticated.
- **Push screens (at the root level):** `progress.tsx`, `health-metrics.tsx`, `groups.tsx`, `group-detail.tsx`, `workout-day.tsx`, `workout-history.tsx`. These are *modal* or *stack* screens, accessible via `router.push('/progress')`. They overlay the main tabs and have a back button to dismiss.
  ```tsx
  <Stack.Screen name="progress" options={{ title: 'Progress', headerShown: true }} />
  ```
  When the user taps "View Progress" from the Home tab, the app calls `router.push('/progress')`. The Stack component at the root level catches this and renders the progress screen on top of the tabs.
- **One-time screens:** `intro.tsx` (shown once after first signup), `splash.tsx` (animated splash for new vs. returning users). These are navigated to via `router.replace('/(auth)/intro')` and have `gestureEnabled: false` so the user can't swipe back.
- **Special screens:** `templates.tsx` (workout browser), `csv-import.tsx` (activity import), `glossary.tsx` (help screen), `cosmetics.tsx` (shop/achievements).
- User flow: (1) User taps Home tab. (2) App renders `/(tabs)/index.tsx` inside the tab bar. (3) User taps a "Recent Activity" row. (4) App calls `router.push('/workout-day?date=2026-05-21')`. (5) The root Stack renders `workout-day.tsx` on top of the tabs (with a back button). (6) User taps back. (7) The Stack pops, and the Home tab is visible again.
- "The intro screen has `gestureEnabled: false`. Why might that be important for a tutorial screen?"

### Concept 6: Dynamic routes and query parameters
- **The idea:** expo-router supports dynamic segments (like Next.js). A file `mobile/app/workout-day.tsx` can receive a query parameter `?date=YYYY-MM-DD` and read it with `useLocalSearchParams()`.
- **Real code** (in a screen file):
  ```tsx
  import { useLocalSearchParams } from 'expo-router';

  export default function WorkoutDayScreen() {
    const { date } = useLocalSearchParams<{ date: string }>();
    // date is now '2026-05-21' (or undefined if not provided)
  }
  ```
- **Real code** (navigating to it):
  ```tsx
  const router = useRouter();
  router.push(`/workout-day?date=${dateKey}`);
  ```
- "Would you store the date in a React context, or pass it via a query parameter? What are the trade-offs?"

## 4. Cumulative review — rapid-fire
1. What's the difference between `(auth)` and `(tabs)` folders, and why are they route groups?
2. Name the three providers in the root layout and their dependency order.
3. When a user is cold-starting the app (isLoading = true), what does the root layout render?
4. How would you navigate from the Home tab to the Progress screen and back?


---

# Lesson L14 — Component state, hooks, and custom hooks for domain logic

> **Track:** 2 — Mobile Architecture · **Status:** ⭐ Fully worked
> **Estimated time:** ~45 min · **Prerequisite rungs:** L01–L13 (domain model + routing)

## 1. Learning outcomes
By the end, Arvin can:
- **(L1)** Name the three Hooks (`useState`, `useEffect`, `useCallback`) and explain when to use each.
- **(L2)** Trace `useWorkout()` from the Home tab: initial load, render, and the re-render when a set is logged.
- **(L3)** Implement a custom hook from a specification: "Write a hook that tracks the currently selected exercise and validates it."
- **(L4)** Analyze the `useWorkout()` vs. `usePowerSyncLog()` design: trade-offs of REST-based state vs. local-database-driven state for offline apps.
- **(L5)** Evaluate lifting state to a custom hook vs. a context vs. a state library (Redux, Jotai) for an app that must work offline mid-set.

## 2. The difficulty ladder for THIS lesson
1. `useState` — local component state.
2. `useEffect` — side effects (fetching, subscribing).
3. Re-renders: when state changes, the component re-renders with the new state.
4. Custom hooks — encapsulating state + effects into a reusable function.
5. `useCallback` — memoizing callbacks to prevent re-renders of child components.
6. Lifting state — moving state from a component to a custom hook (or context) to share it with siblings.
7. Offline-first state: REST API state vs. PowerSync local-database state.

## 3. Concept sequence

### Concept 1: `useState` — local component state
- "The Home tab shows a greeting with the user's name. Where does the name come from, and when does the screen update if the user changes it?"
- **The idea:** `useState` is a hook that lets a functional component maintain state. It returns a value and a setter function. When the setter is called, React re-renders the component with the new state.
- **Real code** (from `mobile/app/(tabs)/index.tsx`):
  ```tsx
  const [expandedStreak, setExpandedStreak] = useState<boolean>(false);

  return (
    <Pressable onPress={() => setExpandedStreak(!expandedStreak)}>
      <Text>{expandedStreak ? '14 day streak!' : 'Tap to expand'}</Text>
    </Pressable>
  );
  ```
  When the user presses, `setExpandedStreak(!expandedStreak)` is called. React re-renders the component with `expandedStreak = true`. The `<Text>` now shows "14 day streak!".
- **Key insight:** State is per-component, per-instance. If two instances of this component exist, they have independent state.
- Why `useState` and not a class field? Functional components have no `this`. `useState` is a hook that RN (via React) uses to store state for that component instance. React uses the call order of hooks to track which state belongs to which variable (this is why hooks must be called at the top level, in the same order every render).
- Initial state can be a value or a function. `useState(false)` sets it to false immediately. `useState(() => computeExpensiveInitialState())` computes it once and uses the result.
- "You have a form with a text input. How would you track the input value in state, and what happens when the user types?"

### Concept 2: `useEffect` — side effects and data fetching
- "When the Home tab mounts, it needs to fetch today's workout from the API. Where does that call happen, and how does the screen know when the data arrives?"
- **The idea:** `useEffect` is a hook that runs a function after the component renders. It's for side effects — API calls, subscriptions, timers. The effect runs after every render by default, but you can specify a dependency array to run it only when specific values change.
- **Real code** (from `mobile/src/hooks/useWorkout.ts` lines 73–75):
  ```tsx
  useEffect(() => {
    load();
  }, [load]);
  ```
  This effect runs after every render *only if `load` changes*. Since `load` is a `useCallback`, it only changes if its own dependencies change. This prevents infinite loops.
- **Real code** (initial load pattern):
  ```tsx
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const w = await createWorkout(getTodayKey());
      setWorkout(w);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]); // Empty means run once on mount
  ```
  On mount, `load()` is called. It fetches the workout and calls `setWorkout()`. React re-renders with the new state. The UI updates to show the workout.
- Why `useCallback`? Because if we define `load` directly in the component body, it's redefined on every render. That would cause the effect to run on every render (infinite loop). `useCallback` memoizes the function so it only changes when its dependencies (`[]` = never) change.
- **Dependency array rules:**
  - `[]` (empty) — run once on mount, never again.
  - `[value]` — run on mount and whenever `value` changes.
  - Omitted — run after every render (rarely used; can cause infinite loops).
- "You're fetching a list of exercises and want to re-fetch if the user's units (kg vs. lbs) change. Write the useEffect with the dependency array."

### Concept 3: Custom hooks — encapsulating state and effects
- "The Home tab, Log tab, and Rankings tab all need today's workout. Should each component have its own `useState` + `useEffect`, or is there a pattern to reuse the logic?"
- **The idea:** A custom hook is a JavaScript function that calls other hooks. It encapsulates state and effects into a reusable unit. The hook returns state and mutations, and any component can call it to get access to that state.
- **Real code** (`mobile/src/hooks/useWorkout.ts`):
  ```tsx
  export interface UseWorkoutResult {
    workout: Workout | null;
    sets: WorkoutSet[];
    isLoading: boolean;
    error: string | null;
    logSet: (payload: LogSetPayload) => Promise<WorkoutSet>;
    deleteSet: (id: string) => Promise<void>;
    refetch: () => Promise<void>;
  }

  export function useWorkout(): UseWorkoutResult {
    const [workout, setWorkout] = useState<Workout | null>(null);
    const [sets, setSets] = useState<WorkoutSet[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
      // ... fetch and set state
    }, []);

    useEffect(() => {
      load();
    }, [load]);

    const logSet = useCallback(async (payload: LogSetPayload): Promise<WorkoutSet> => {
      const newSet = await apiLogSet(payload);
      setSets((prev) => [...prev, newSet]);
      return newSet;
    }, []);

    const deleteSet = useCallback(async (id: string): Promise<void> => {
      await apiDeleteSet(id);
      setSets((prev) => prev.filter((s) => s.id !== id));
    }, []);

    return { workout, sets, isLoading, error, logSet, deleteSet, refetch: load };
  }
  ```
  Any component can now call `const { workout, sets, logSet } = useWorkout()` and get the state and mutations. If two components call the hook, they get *independent* state (separate `workout`, `sets`, etc.).
- The hook returns an interface (`UseWorkoutResult`). This is TypeScript — it documents what the hook provides and ensures the caller uses it correctly.
- **Lifting state with custom hooks:** Instead of each component managing its own state, the logic lives in the hook. This is a form of "lifting state" — extracting it from a component so multiple callers can share it (but each caller gets its own instance of the state).
- The Home tab calls `useWorkout()`. The Log tab calls `useWorkout()` as well. They have independent state — if the Log tab logs a set and re-renders, the Home tab doesn't re-render (they're separate instances of the hook). To share state *across* components, you'd use a context or a state library.
- "Write a custom hook `useExerciseSearch` that takes a search query and returns a list of exercises that match. Use `useState` to track the query and results."

### Concept 4: The render cycle and re-renders
- "When you call `setWorkout(newWorkout)`, the Home tab re-renders. But does the Log tab re-render too? Why or why not?"
- **The idea:** When a component's state changes, React re-renders *that component and its children*. Sibling components don't re-render unless their state changes. This is crucial for performance — the Log tab shouldn't re-render just because the Home tab fetched new data.
- **Real flow:**
  1. User opens the Home tab. `useWorkout()` is called, `useState` initializes state, `useEffect` fetches today's workout.
  2. API responds. `setWorkout(w)` is called inside the effect.
  3. React marks the component as needing a re-render and re-renders the Home tab with the new state.
  4. The Home tab renders `<Text>Workout: {workout.name}</Text>` with the new data.
  5. The Log tab (a sibling, in the `<Tabs>` component) is *not* re-rendered. Its state is untouched.
  6. If the user taps the Log tab and logs a set, `useWorkout()` (in the Log tab) is called with independent state. It fetches today's workout separately. The Log tab re-renders; the Home tab doesn't (they're independent instances of the hook).
- This is why two components can call the same hook and get independent state. Each instance of the hook has its own `useState` storage. React keeps track of this via component identity and hook call order.
- What if you *want* the Home and Log tabs to share state? You'd move the state to a parent context or a custom hook called from a parent context, and both tabs would read from that shared state.
- "You have two `useWorkout()` calls on the same screen (Home and Archive tabs side-by-side). If the Home tab logs a set, does the Archive tab see it? Why or why not?"

### Concept 5: `useCallback` — memoizing callbacks to prevent re-renders
- "The `useWorkout` hook returns `logSet` function. If you define `logSet` directly in the component body, it's redefined on every render. Why does that matter?"
- **The idea:** `useCallback` memoizes a function. It returns the same function instance across renders *if the dependencies haven't changed*. This is useful when a child component needs a function prop — if the function is redefined every render, the child re-renders unnecessarily.
- **Real code** (from `useWorkout.ts`):
  ```tsx
  const logSet = useCallback(
    async (payload: LogSetPayload): Promise<WorkoutSet> => {
      const newSet = await apiLogSet(payload);
      setSets((prev) => [...prev, newSet]);
      return newSet;
    },
    [] // Empty: function never changes
  );
  ```
  On every render, `logSet` is the *same function object*. If a child component is memoized (via `memo`), it won't re-render because the function prop is unchanged.
- When do you need `useCallback`? When the function is passed to a child component that's memoized with `React.memo`. If the child isn't memoized, the extra render from a new function object is negligible. Use it for performance optimization, not by default.
- "The `logSet` function calls `apiLogSet(payload)`. If the API endpoint URL changes, does the `logSet` function need to be redefined? Why or why not?"

### Concept 6: Offline-first hooks — `usePowerSyncLog` vs. `useWorkout`
- "You've seen `useWorkout`, which fetches data from the API. Peak Fettle is offline-first — sets should be logged even on the gym floor with no Wi-Fi. How does that change the hook?"
- **The idea:** `useWorkout` is REST-based: it calls the API to load data, and mutations are sent to the API. For an offline-first app, this is a footgun — if the user logs a set and the network drops, the set is lost.
  
  `usePowerSyncLog` (new, TICKET-027) combines REST init (get today's workout ID) with PowerSync reads/writes (log sets locally):
  ```tsx
  export function usePowerSyncLog(): UseWorkoutResult {
    const [workoutId, setWorkoutId] = useState<string | null>(null);
    const [initError, setInitError] = useState<string | null>(null);

    // Step 1: REST — get or create today's workout
    useEffect(() => {
      const init = async () => {
        try {
          const w = await createWorkout(getTodayKey());
          setWorkoutId(w.id);
        } catch (err) {
          setInitError(err.message);
        }
      };
      init();
    }, []);

    // Step 2: PowerSync — watch the local SQLite sets table
    const [sets, setSets] = useState<WorkoutSet[]>([]);
    useEffect(() => {
      if (!workoutId) return;
      const subscription = db.watch(
        'SELECT * FROM sets WHERE workout_id = ?',
        [workoutId],
        { onChange: (rows) => setSets(rows) }
      );
      return () => subscription.unsubscribe();
    }, [workoutId]);

    // Step 3: Mutations go to local SQLite (PowerSync queues them for upload)
    const logSet = useCallback(
      async (payload: LogSetPayload): Promise<WorkoutSet> => {
        const id = generateUUID();
        const weight_raw = Math.round(payload.weight_kg * 8);
        await db.execute('INSERT INTO sets (...) VALUES (...)', [
          id, workoutId, weight_raw, payload.reps, ...
        ]);
        // No API call — PowerSync will upload when online
        return { id, ...payload }; // Optimistic return
      },
      [workoutId]
    );

    return { workout: null, sets, isLoading: !workoutId && !initError, error: initError, logSet, deleteSet, refetch };
  }
  ```
- **Key difference:** REST hook calls `apiLogSet()` and waits for the response. PowerSync hook calls `db.execute()` (instant local write) and returns immediately. The user sees the set logged instantly, even offline. PowerSync handles the sync when the device is online.
- Why a hybrid (REST for init, PowerSync for writes)? Because the server owns the workout UUID. You must ask the server "give me today's workout" to get the ID to write sets with. But once you have the ID, you can write locally and let PowerSync handle the upload.
- User scenario:
  1. User opens the Log tab at 6 AM in the gym (no Wi-Fi).
  2. `usePowerSyncLog` mounts. It calls `createWorkout(getTodayKey())` — succeeds (maybe cached from the night before, or the device was online at 11:59 PM).
  3. Once the workout ID arrives, the hook subscribes to the local `sets` table.
  4. User logs a set. `logSet()` writes to local SQLite instantly. No network call.
  5. User logs 10 more sets. All written locally.
  6. User exits the gym and connects to Wi-Fi. PowerSync detects the new sets in the write queue and uploads them to Supabase.
  7. Supabase validates ownership (via RLS) and commits the sets.
  8. PowerSync's sync stream delivers them back to the device (and to any other signed-in device).
- "In `usePowerSyncLog`, why must `createWorkout` be called at least once (even if it returns a cached workout)?"

### Concept 7: Context and lifting state for app-wide sharing
- "The Home tab shows the user's name. The Log tab also needs the name for the greeting. Do you call `useAuth()` in both, or share state somehow?"
- **The idea:** If multiple components need the same state, you have two options: (1) Call the custom hook in each (independent state instances, but they're actually the same data from the same source). (2) Use a context to share state.
  - **Context example** (`src/context/AuthContext.tsx`):
    ```tsx
    import { createContext, useContext } from 'react';

    const AuthContext = createContext<AuthContextValue | null>(null);

    export function AuthProvider({ children }) {
      const [user, setUser] = useState<User | null>(null);
      const [accessToken, setAccessToken] = useState<string | null>(null);

      return (
        <AuthContext.Provider value={{ user, accessToken }}>
          {children}
        </AuthContext.Provider>
      );
    }

    export function useAuth() {
      const ctx = useContext(AuthContext);
      if (!ctx) throw new Error('useAuth must be inside AuthProvider');
      return ctx;
    }
    ```
  - Any component wrapped inside `<AuthProvider>` can call `useAuth()` and get the shared state.
- **When to use context?** When state needs to be shared across *many* components (not just 2–3), and passing it via props is unwieldy. Context avoids "prop drilling."
- Context doesn't prevent re-renders. If the context value changes, every component that uses it re-renders. For performance-critical apps, you'd split contexts by value (e.g., `UserContext` for user data, `UIContext` for UI state) so a change in one doesn't trigger a re-render of everything.
- "The Log tab needs to know if a set is currently being uploaded. Would you pass this state via a context, a custom hook, or something else? Why?"

## 4. Cumulative review — rapid-fire
1. What's the difference between `useState` and `useEffect`?
2. When you call `useWorkout()` in the Home tab and again in the Log tab, do they share state?
3. Why does `useCallback` memoize the `logSet` function?
4. In `usePowerSyncLog`, why is the REST init separate from the PowerSync writes?


---

# Lesson L15 — Building the API client: authentication, interceptors, and the request/response cycle

> **Track:** 2 — Mobile Architecture · **Status:** ⭐ Fully worked
> **Estimated time:** ~45 min · **Prerequisite rungs:** L01–L14 (domain + routing + hooks)

## 1. Learning outcomes
By the end, Arvin can:
- **(L1)** Name the parts of an HTTP request: method, URL, headers, body, and query parameters.
- **(L2)** Explain what an interceptor is and why the client uses one to attach the `Authorization` header.
- **(L3)** Trace a request from the Home tab to the server: `apiClient.post('/sets', ...)` → interceptor attaches JWT → server validates → response returns.
- **(L4)** Analyze the token refresh flow: 401 response → one silent refresh attempt → success (retry original request) or failure (redirect to login).
- **(L5)** Evaluate the "single refresh attempt" strategy against alternatives (cascade retries, queue-and-drain) for a mobile app with weak connectivity, and defend it for Peak Fettle's use case.

## 2. The difficulty ladder for THIS lesson
1. HTTP fundamentals: method, URL, headers, body, status codes (101, 200, 401, 403, 500).
2. Axios: creating an instance, setting base URL, default headers.
3. Interceptors: request (attach token), response (handle 401).
4. Token management: in-memory access token, refresh token in secure storage.
5. Silent token refresh: on 401, call /auth/refresh with the refresh token, get new pair, retry original request.
6. Error handling: distinguish API errors (400, 401) from network errors.
7. Race conditions: multiple requests fail with 401 simultaneously; deduplicate refresh calls.

## 3. Concept sequence

### Concept 1: HTTP fundamentals and REST API design
- "You want to log a set (exercise, reps, weight). You send a message to the server. What information must you include, and how?"
- **The idea:** HTTP requests have:
  - **Method:** GET (read), POST (create), PUT (update), DELETE (delete), PATCH (partial update).
  - **URL:** `https://api.example.com/sets` or `https://api.example.com/sets/abc-123`.
  - **Headers:** Metadata (Content-Type, Authorization, etc.).
  - **Body:** JSON payload for POST/PUT/PATCH.
  - **Query parameters:** `?workoutId=xyz&limit=50` for filtering.
  - **Status code:** 200 (OK), 201 (Created), 400 (Bad Request), 401 (Unauthorized), 404 (Not Found), 500 (Server Error).
  ```
  POST /sets
  Authorization: Bearer <access_token>
  Content-Type: application/json

  {
    "workout_id": "550e8400-e29b-41d4-a716-446655440000",
    "exercise_id": "1",
    "kind": "lift",
    "reps": 5,
    "weight_kg": 80,
    "rir": 2
  }
  ```
  Server validates the token, checks ownership (the user owns the workout), inserts the set, returns:
  ```
  201 Created
  Content-Type: application/json

  {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "workout_id": "550e8400-e29b-41d4-a716-446655440000",
    "exercise_id": "1",
    "kind": "lift",
    "reps": 5,
    "weight_kg": 80,
    "rir": 2,
    "created_at": "2026-05-21T18:30:00Z"
  }
  ```
- The token is in the Authorization header, not the body. Why? Because the header is a standard place for credentials, and some proxies/firewalls understand it. The body is for user data (the set itself).
- "You're fetching exercises. Would you use GET /exercises?category=chest or POST /exercises with a body? Why?"

### Concept 2: Axios and the base client instance
- "You have 20 API endpoints. Every request needs the Authorization header. Do you add the header to each request, or is there a way to do it once?"
- **The idea:** Axios is a JavaScript HTTP library. Creating a client instance lets you set defaults (base URL, headers, timeout) that apply to all requests.
- **Real code** (`mobile/src/api/client.ts` lines 66–72):
  ```tsx
  export const apiClient: AxiosInstance = axios.create({
    baseURL: BASE_URL,
    timeout: 15_000,
    headers: {
      'Content-Type': 'application/json',
    },
  });
  ```
  Now, `apiClient.post('/sets', payload)` automatically prefixes the base URL and sets Content-Type. Requests go to `${BASE_URL}/sets`.
  ```tsx
  // Tedious: repeat base URL and headers everywhere
  const response = await axios.post('http://localhost:3001/sets', payload, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  ```
  **With the client:**
  ```tsx
  // Clean: base URL and headers set globally
  const response = await apiClient.post('/sets', payload);
  // The interceptor adds the Authorization header
  ```
- "If the base URL changes from `http://localhost:3001` to `https://api.peakfettle.com`, how many places in the code need to change?"

### Concept 3: Request interceptors — attaching the authorization token
- "The token lives in AuthContext (in-memory). Every API call needs to attach it as `Authorization: Bearer <token>`. Where does that attachment happen?"
- **The idea:** An interceptor is a function that runs before every request (request interceptor) or after every response (response interceptor). The request interceptor reads the token and adds it to the headers.
- **Real code** (`mobile/src/api/client.ts` lines 78–87):
  ```tsx
  apiClient.interceptors.request.use(
    (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
      const token = _authHandlers?.getAccessToken();
      if (token && config.headers) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
      return config;
    },
    (error: unknown) => Promise.reject(error)
  );
  ```
  For every request, this runs. It calls `getAccessToken()` (provided by AuthContext) and adds the token to headers. If there's no token, the header isn't added.
- **Why not import the token directly from AuthContext?** Because that would create a circular dependency:
  - `client.ts` needs the token from `AuthContext.tsx`.
  - `AuthContext.tsx` imports `apiClient` from `client.ts` to make API calls.
  - Circular: `client → AuthContext → client` (breaks at import time).
  - Solution: AuthContext calls `setAuthHandlers()` at startup, injecting a callback (`getAccessToken`) that the client can call without importing AuthContext directly.
- The callback `_authHandlers?.getAccessToken()` reads the current token every time a request is made. This ensures that if the token is refreshed while requests are in flight, the new token is used for subsequent requests.
- "If you added a request interceptor to log all requests, where would you place it (before or after the auth interceptor)? Why?"

### Concept 4: Response interceptors and token refresh on 401
- "The user logs in at 6 PM. The access token expires at 8 PM. At 8:15 PM, they log a set. The API returns 401 (Unauthorized). What should the app do?"
- **The idea:** A 401 means "your credentials are invalid or expired." Rather than immediately forcing the user to log in again, the client can try a *silent refresh*: use the refresh token to get a new access token, then retry the original request. If the refresh fails, *then* redirect to login.
- **Real code** (`mobile/src/api/client.ts` lines 99–148):
  ```tsx
  apiClient.interceptors.response.use(
    (response: AxiosResponse) => response,
    async (error: unknown) => {
      if (!axios.isAxiosError(error)) {
        return Promise.reject(error);
      }

      const originalRequest = error.config as AxiosRequestConfig & { _retried?: boolean };

      // Only retry on 401, and only once
      if (error.response?.status !== 401 || originalRequest._retried) {
        return Promise.reject(error);
      }

      if (!_authHandlers) {
        return Promise.reject(error);
      }

      const refreshToken = _authHandlers.getRefreshToken();
      if (!refreshToken) {
        _authHandlers.onLogout();
        return Promise.reject(error);
      }

      originalRequest._retried = true;

      try {
        // Deduplicate concurrent refresh calls
        if (!_refreshPromise) {
          _refreshPromise = _doRefresh(refreshToken).finally(() => {
            _refreshPromise = null;
          });
        }
        const newAccessToken = await _refreshPromise;

        // Retry the original request with the new token
        if (originalRequest.headers) {
          (originalRequest.headers as Record<string, string>)[
            'Authorization'
          ] = `Bearer ${newAccessToken}`;
        }
        return apiClient(originalRequest);
      } catch {
        _authHandlers.onLogout();
        return Promise.reject(error);
      }
    }
  );
  ```
  **Flow:**
  1. Request fails with 401.
  2. Interceptor checks: is this a 401? Have we already retried this request? (No → proceed.)
  3. Do we have a refresh token? (Yes → proceed.)
  4. Call `_doRefresh(refreshToken)` to get a new access token.
  5. Update the original request with the new token.
  6. Call `apiClient(originalRequest)` to retry.
  7. If retry succeeds, return the response. If it fails, call `onLogout()` (redirect to login).
- **Key detail: deduplication.** If many requests fail with 401 simultaneously (e.g., token refresh takes 2 seconds, user logs 10 sets concurrently), we don't want to call `/auth/refresh` 10 times. Instead, `_refreshPromise` stores the *first* refresh call, and all 10 requests await it. Once it resolves, all 10 retry their original requests with the new token.
  ```tsx
  if (!_refreshPromise) {
    _refreshPromise = _doRefresh(refreshToken).finally(() => {
      _refreshPromise = null;
    });
  }
  const newAccessToken = await _refreshPromise;
  ```
- Why `_retried` flag? To prevent infinite loops. If a request is retried and *still* returns 401 (e.g., the refresh token is revoked), we don't retry again. One retry per request, max.
- "The refresh token is stored in SecureStore (persistent storage). The access token is in-memory. If the app restarts, how does the silent refresh work on the first request?"

### Concept 5: Token storage and AuthContext integration
- "The access token expires in 15 minutes. The refresh token lasts 30 days. Where do you store each, and why differently?"
- **The idea:**
  - **Access token:** In-memory. Short-lived (15 min), used on every request, high security (not persisted).
  - **Refresh token:** SecureStore (encrypted device storage). Long-lived (30 days), used only on refresh, survives app restart.
- **Real code** (from `mobile/src/context/AuthContext.tsx` — conceptual):
  ```tsx
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    // On app startup, load the refresh token and do a silent refresh
    (async () => {
      const rt = await SecureStore.getItemAsync('refreshToken');
      if (rt) {
        try {
          const response = await refreshTokens(rt);
          setAccessToken(response.accessToken);
          await SecureStore.setItemAsync('refreshToken', response.refreshToken);
          setIsAuthenticated(true);
        } catch {
          // Refresh failed; user must log in
          setIsAuthenticated(false);
        }
      }
      setIsLoading(false);
    })();
  }, []);

  // When user logs in
  const login = async (email, password) => {
    const response = await login(email, password);
    setAccessToken(response.accessToken);
    await SecureStore.setItemAsync('refreshToken', response.refreshToken);
    setIsAuthenticated(true);
    setAuthHandlers({ getAccessToken: () => accessToken, ... });
  };
  ```
  The auth context stores the access token in React state (in-memory) and the refresh token in SecureStore. It also injects `setAuthHandlers()` so the client can read the current token.
- Why call `setAuthHandlers()` *after* setting the token? Because the request interceptor calls `getAccessToken()` immediately. If you call `setAuthHandlers()` before setting the token, the first request sees `null`.
- "If a user manually deletes the app's SecureStore (via the OS settings), what happens on the next app launch?"

### Concept 6: Domain-specific API modules
- "The client has 20 endpoints. Do you make all requests directly from components, or organize them somehow?"
- **The idea:** API modules group related endpoints by domain. Each module imports `apiClient` and wraps endpoints in functions that handle request/response mapping.
- **Real code** (`mobile/src/api/sets.ts`):
  ```tsx
  export async function getSetsForWorkout(workoutId: string): Promise<WorkoutSet[]> {
    const response = await apiClient.get<SetsPage>('/sets', {
      params: { workoutId },
    });
    return response.data.sets;
  }

  export async function logSet(payload: LogSetPayload): Promise<WorkoutSet> {
    const response = await apiClient.post<WorkoutSet>('/sets', payload);
    return response.data;
  }

  export async function deleteSet(id: string): Promise<void> {
    await apiClient.delete(`/sets/${id}`);
  }
  ```
  Benefits:
  - **Single source of truth for URL paths.** If the API changes from `/sets` to `/v2/sets`, you update one file.
  - **Type safety.** The response type is declared (`<WorkoutSet[]>`, `<SetsPage>`).
  - **Reusability.** Hooks call these functions; components never call `apiClient` directly.
  - **Error handling.** If you need to log errors or retry, you do it here, not in 20 different places.
- Without modules:
  ```tsx
  // In Home.tsx
  const response = await apiClient.get('/sets', { params: { workoutId } });
  const sets = response.data.sets;

  // In Log.tsx
  const response = await apiClient.get('/sets', { params: { workoutId } });
  const sets = response.data.sets;

  // Duplicated everywhere!
  ```
  **With modules:**
  ```tsx
  // In Home.tsx and Log.tsx
  const sets = await getSetsForWorkout(workoutId);
  ```
- "Why does `getSetsForWorkout` return `WorkoutSet[]` but `logSet` returns `WorkoutSet` (singular)?"

### Concept 7: Error handling and distinguishing error types
- "A request fails. How do you know if it's a network error (user is offline) vs. an auth error (token revoked) vs. a server error (500)?"
- **The idea:** Axios errors have different shapes. Network errors (no response) vs. HTTP errors (response with status code) vs. other errors. Hooks should handle each differently.
- **Real code** (in a hook):
  ```tsx
  try {
    const w = await createWorkout(getTodayKey());
    setWorkout(w);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load workout';
    setError(message);
  }
  ```
  For more granular handling:
  ```tsx
  import { AxiosError } from 'axios';

  try {
    // ...
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.response?.status === 401) {
        // Auth error (handled by interceptor, but in case it reaches here)
        setError('Session expired. Please log in again.');
      } else if (err.response?.status === 400) {
        // Validation error
        setError(err.response.data.message || 'Invalid input');
      } else if (err.code === 'ECONNABORTED') {
        // Timeout
        setError('Request timed out. Please check your connection.');
      } else if (!err.response) {
        // Network error
        setError('No internet connection');
      } else {
        // Other HTTP error
        setError(`Server error: ${err.response.status}`);
      }
    } else {
      // Non-Axios error (e.g., JSON parse error)
      setError('An unexpected error occurred');
    }
  }
  ```
- In Peak Fettle, most errors are silently caught and logged (using `catch(() => {})`). The UI shows a generic loading spinner if a required fetch fails. For non-critical fetches (like PR detection), errors are silently ignored.
- "You're fetching exercises but the user's internet is slow. The request times out. What error message should the user see?"

## 4. Cumulative review — rapid-fire
1. What are the parts of an HTTP request?
2. Why does the request interceptor call `getAccessToken()` instead of importing the token directly from AuthContext?
3. Trace a 401 response: what happens, and when is the user redirected to login?
4. Why are API modules (sets.ts, exercises.ts) better than making requests directly in components?


---

# Lesson L16 — Offline-first architecture: PowerSync, SQLite, and conflict resolution

> **Track:** 2 — Mobile Architecture · **Status:** ⭐ Fully worked
> **Estimated time:** ~50 min · **Prerequisite rungs:** L01–L15 (domain + routing + hooks + API)

## 1. Learning outcomes
By the end, Arvin can:
- **(L1)** Explain the three-tier architecture: React UI → local SQLite → PowerSync Cloud → Supabase Postgres.
- **(L2)** Trace a set logged offline: INSERT into local SQLite → detected by PowerSync → queued for upload → synced when online.
- **(L3)** Implement a conflict resolution rule for a simple case (last-write-wins for a workout name).
- **(L4)** Analyze Peak Fettle's append-only set log design: why last-write-wins is *wrong* for sets, and why an append-only strategy is *right*.
- **(L5)** Evaluate a scenario where two phones log sets offline for the same user, then both sync. Defend Peak Fettle's conflict strategy and identify what could go wrong.

## 2. The difficulty ladder for THIS lesson
1. Local-first architecture: UI talks to SQLite, not the server.
2. The sync layer: PowerSync watches SQLite, uploads changes, downloads new data.
3. Conflict resolution: what happens when two devices write the same row offline?
4. Append-only data: sets, workouts, and records (immutable history).
5. Mutable data: user preferences, streaks, percentiles (last-write-wins conflicts).
6. The hybrid approach: REST for server-owned IDs (workout init), SQLite for client-owned writes (sets).
7. Race conditions and ordering: Lamport clocks, CRDTs, and why Peak Fettle uses a simpler strategy.

## 3. Concept sequence

### Concept 1: The offline-first architecture — three tiers
- "You're logging sets in the gym with no Wi-Fi. The app works offline, but the server must eventually see the data. How?"
- **The idea:** Peak Fettle has three tiers:
  1. **React UI** — components, hooks, state (L13–L15). Always talks to tier 2, never to tier 3.
  2. **Local SQLite** — on-device database, owned by PowerSync. Stores a replica of the user's data (and globally-synced data like exercise libraries).
  3. **PowerSync Cloud + Supabase** — server-side; Supabase is Postgres + RLS, PowerSync is a sync service.
  ```
  UI ← watch/query/insert ─► SQLite (on device)
                              ↓ upload (when online)
                              PowerSync Cloud
                              ↓ transform
                              Supabase (Postgres + RLS)
                              ↓ download (when online)
                              SQLite (replicate changes + new data)
  ```
  1. User opens the Log tab offline. `usePowerSyncLog()` mounts.
  2. REST init: `createWorkout(getTodayKey())` — might fail (no network), or might succeed (cached/pre-fetched).
  3. Once workout ID is available, the hook subscribes to the local `sets` table: `db.watch('SELECT * FROM sets WHERE workout_id = ?', [workoutId])`.
  4. User fills in exercise, reps, weight, taps Log.
  5. `logSet()` calls `db.execute('INSERT INTO sets (...) VALUES (...)')` — instant, no network.
  6. PowerSync detects the new row in its write queue. UI re-renders with the new set (no spinner, no "pending" badge).
  7. User exits gym, connects to Wi-Fi.
  8. PowerSync uploads: POST to `connector.uploadData()` → Supabase `/rest/sets` endpoint.
  9. Server validates ownership (RLS), inserts the row into Postgres.
  10. PowerSync's sync stream sees the committed row and downloads it back to the device.
  11. SQLite merges the server's row with the local row (they're the same set, same ID, so it's a no-op).
- Why not write directly to the server? Because the network is unreliable. A SET endpoint call could hang, timeout, or fail silently. The user would see a spinner and get an error. Instead, write locally (instant), and let the sync service handle the network complexity asynchronously.
- "If a user logs 10 sets offline and then the device runs out of battery before syncing, are the sets lost? Where are they stored?"

### Concept 2: PowerSync — the sync service and schema
- "SQLite is local-only. PowerSync must know which tables exist and which columns to sync. How is that defined?"
- **The idea:** PowerSync needs a schema — a list of tables and columns. This schema mirrors the Supabase tables *exactly*. Every table has an `id` primary key (usually UUID), and PowerSync uses it to track which rows it's seen.
- **Real code** (`mobile/src/db/powerSyncClient.ts` — conceptual):
  ```tsx
  import { Table, Column } from '@powersync/common';

  export const schema = new Schema({
    tables: [
      new Table(
        {
          name: 'sets',
          columns: [
            new Column({ name: 'id', type: ColumnType.TEXT }),
            new Column({ name: 'workout_id', type: ColumnType.TEXT }),
            new Column({ name: 'exercise_id', type: ColumnType.TEXT }),
            new Column({ name: 'kind', type: ColumnType.TEXT }), // 'lift' or 'cardio'
            new Column({ name: 'reps', type: ColumnType.INTEGER }),
            new Column({ name: 'weight_raw', type: ColumnType.INTEGER }), // kg × 8
            new Column({ name: 'rir', type: ColumnType.INTEGER }),
            new Column({ name: 'user_id', type: ColumnType.TEXT }),
            new Column({ name: 'created_at', type: ColumnType.TEXT }),
            new Column({ name: 'updated_at', type: ColumnType.TEXT }),
          ],
        },
        { viewName: 'sets_view' } // Optional: for queries
      ),
      // More tables: workouts, exercises, exercise_aliases, streaks, plans, etc.
    ],
  });

  export const db = new PowerSyncDatabase({ schema, dbFilename: 'peakfettle.db' });
  ```
  **Key rule:** Column names in the schema must *exactly* match the Supabase column names. If Supabase has `weight_raw` but the schema says `weight_kg`, the sync will fail.
- Why `weight_raw` instead of `weight_kg`? Because the server stores weight as `INTEGER = kg × 8` (fixed-point arithmetic to avoid floating-point errors in SQL). The client decodes it to `weight_kg` (float) in the hook.
- "Supabase has a column `created_at TIMESTAMP`. Should the schema column be TEXT, TIMESTAMP, or something else?"

### Concept 3: Sync rules — filtering data per user
- "Alice and Bob both use Peak Fettle. When Alice's device syncs, should it download Bob's workouts?"
- **The idea:** Sync rules are SQL queries that define *which* rows a user can see. They're defined in `sync-rules.yaml` and enforce row-level security (RLS). PowerSync uses the rules to know which data to download to each device.
- **Real code** (`sync-rules.yaml` — conceptual):
  ```yaml
  # Sets belong to the user's workouts only
  sets:
    table: sets
    select:
      - id
      - workout_id
      - exercise_id
      - kind
      - reps
      - weight_raw
      - rir
      - user_id
      - created_at
      - updated_at
    where: user_id = {{user_id}}
    # user_id is substituted with the logged-in user's ID at runtime

  # Workouts belong to the user
  workouts:
    table: workouts
    select: [id, user_id, date_key, created_at, updated_at]
    where: user_id = {{user_id}}

  # Exercises are global (everyone sees them)
  exercises:
    table: exercises
    select: [id, name, muscle_group, equipment, difficulty]
    # No where clause — everyone gets all rows

  # Streaks are per-user
  streaks:
    table: streaks
    select: [id, user_id, discipline, streak_days, last_workout_date]
    where: user_id = {{user_id}}
  ```
- **How it works:** When Alice logs in, PowerSync receives her user ID (from the JWT). It substitutes `{{user_id}}` in each rule. Alice's device downloads all `sets WHERE user_id = alice`, all `workouts WHERE user_id = alice`, but *all* exercises (no restriction).
- Sync rules are *independent* of Supabase RLS policies. RLS policies protect the server (no client can fetch data they shouldn't see). Sync rules tell PowerSync what to download. Both should enforce the same access control (usually `WHERE user_id = current_user_id()`).
- "Peak Fettle has a 'groups' feature where users can see other members' workouts. How would you write a sync rule for that?"

### Concept 4: Append-only data vs. mutable data — conflict resolution strategies
- "Two users log the same set offline, then sync. They both have workout ID = `abc-123`, set index = 5. Now there are two rows with the same (workout_id, set_index). What's the conflict?"
- **The idea:** There are two patterns:
  1. **Append-only:** Once written, a row never changes. Conflicts are resolved by keeping all versions (merge). Example: set logs (a history of what was logged).
  2. **Mutable:** A row can be updated. Conflicts resolved by a rule (last-write-wins, CRDT, etc.). Example: workout name, user preferences.
- **Peak Fettle's design:**
  - **Append-only (sets, workouts):** Sets are immutable. Once logged, a set has an `id` (UUID, unique across all devices/users). If two phones log a set offline, they'll generate different IDs, so there's no conflict. When they sync, both sets appear in the database. This is correct — both sets happened.
  - **Mutable (user profile, streaks):** A user's name or streak count can be updated. If two devices update the streak offline, we use last-write-wins: whoever synced later wins. The server stores `updated_at` and uses it to break ties.
  ```
  Phone A (offline):
    INSERT INTO sets (id='set-1', workout_id='w1', exercise='Bench', reps=5, weight_kg=80)
  
  Phone B (offline, same user):
    INSERT INTO sets (id='set-2', workout_id='w1', exercise='Squat', reps=3, weight_kg=100)
  
  Both sync:
    - Supabase now has set-1 and set-2 (both rows coexist, no conflict)
    - Both devices get both sets via the sync stream
    - The user sees all 7 sets logged (5 from before, 2 from offline)
  ```
  If we used last-write-wins (mutable semantics):
  ```
  Both rows have the same (workout_id, set_index, user_id) → conflict
  Last-write-wins: keep the set with the highest updated_at → lose data (one set is discarded)
  Wrong!
  ```
- Why are sets append-only? Because a user never *updates* a set (no "edit a logged set" feature). Once logged, it's done. New data is always a new row with a new ID.
  ```
  Phone A (offline): UPDATE streaks SET streak_days = 10, updated_at = 2026-05-21T18:00:00Z
  Phone B (offline): UPDATE streaks SET streak_days = 15, updated_at = 2026-05-21T18:30:00Z
  
  Both sync:
    - Supabase uses updated_at: 18:30:00 > 18:00:00, so streak_days = 15 wins
    - Both devices download the winning row (streak_days = 15)
  ```
- "A user updates their profile name on two phones offline. Phone A says 'Alex', Phone B says 'Alexander'. Should the final name be one of these, both, or something else?"

### Concept 5: The connector — uploading writes to Supabase
- "When PowerSync detects a new set in the local write queue, how does it get to Supabase? What API does it call?"
- **The idea:** The connector is a bridge that uploads changed rows to Supabase. It:
  1. Watches the local write queue (rows inserted/updated/deleted locally).
  2. Transforms them (e.g., decode `weight_raw` back to `weight_kg`).
  3. POSTs them to the server API (or directly to Supabase REST).
  4. Returns the committed rows to PowerSync (which merges them back into SQLite).
- **Real code** (`mobile/src/db/connector.ts` — conceptual):
  ```tsx
  class PowerSyncConnector extends AbstractPowerSyncConnector {
    async uploadData(database: PowerSyncDatabase): Promise<void> {
      const updates = await database.getNextBatch();

      for (const batch of updates.batches) {
        for (const set of batch.data?.sets ?? []) {
          if (set.op === 'PUT') {
            // Decode weight_raw back to weight_kg
            const weight_kg = (set.weight_raw ?? 0) / 8;

            // POST to server
            try {
              const response = await apiClient.post('/sets', {
                id: set.id,
                workout_id: set.workout_id,
                exercise_id: set.exercise_id,
                kind: set.kind,
                reps: set.reps,
                weight_kg,
                rir: set.rir,
                created_at: set.created_at,
              });

              // Mark as uploaded (send back to PowerSync)
              await database.markAssynced([
                { id: set.id, timestamp: response.data.updated_at }
              ]);
            } catch (err) {
              // Upload failed; leave in queue for retry
              throw err;
            }
          }
        }
      }
    }
  }
  ```
- **Key detail:** The server validates ownership (via RLS). If the user doesn't own the workout, the POST fails with 403, and the row is left in the queue (retry later).
- Why transform `weight_raw`? The server stores it as `INTEGER = kg × 8` to avoid floating-point errors. The client stores it the same way to match the schema, then decodes it when reading or uploading.
- "If the POST to /sets fails with a 500 error, what happens to the set in the local queue?"

### Concept 6: Offline detection and UI feedback
- "The user is offline. They log a set. The UI should show... what? A spinner? A 'pending' badge? No indication?"
- **The idea:** Peak Fettle uses optimistic UI: the set appears instantly, with no "pending" indicator. Once PowerSync syncs (when online), the row is confirmed. If sync fails, an error banner appears.
- **Real code** (from `mobile/src/hooks/useSyncStatus.ts` — conceptual):
  ```tsx
  export function useSyncStatus() {
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);

    const db = useDB(); // From PowerSyncContext

    useEffect(() => {
      const subscription = db.watchStatus((status) => {
        setIsSyncing(status.isConnecting || status.isSyncing);
        setSyncError(status.lastSyncError ? 'Sync failed, retrying...' : null);
      });

      return () => subscription.unsubscribe();
    }, [db]);

    return { isSyncing, syncError };
  }
  ```
  The Home tab can call `useSyncStatus()` and show a banner: "Syncing..." or "Sync failed (will retry)".
- Why not show "pending" on each set? Because sets are append-only and succeed locally. The upload is a background task. Showing "pending" would confuse the user — the set is already in the database, just not synced yet.
- "If a set upload fails with a 403 (not owned), should the app retry forever, or show an error and delete the set?"

### Concept 7: Race conditions and Lamport clocks
- "Two phones log different sets for the same workout offline, then sync simultaneously. The order they arrive at Supabase might not match the order they were logged. Does that matter?"
- **The idea:** Peak Fettle uses `id` (UUID, per-set) and `set_index` (sequence number per workout). If two sets are logged on different phones at the same moment offline, they get different UUIDs and different set indices. When they sync, there's no ambiguity about order — both sets coexist.
  - If they had the same `set_index`, a conflict would arise (two sets claiming to be "set #5"). Peak Fettle avoids this by making each set's ID unique (UUID, generated client-side) and by not using a global sequence number.
- **Lamport clocks (optional):** A Lamport clock is a counter that ticks on every write. Phone A logs sets with clock=1,2,3. Phone B logs sets with clock=1,2,3. When they sync, A's clock is higher, so A's writes win in conflicts. Peak Fettle doesn't use Lamport clocks because sets are append-only (no conflicts).
- What if Peak Fettle *did* use a global set index (set_index as the primary key)? Then two offline phones could both claim set_index=10. When they sync, a conflict arises: which set is really #10? You'd need a Lamport clock or CRDT to resolve it. Because Peak Fettle uses UUID (per-set), this problem doesn't exist.
- "Two phones log sets offline. Both upload simultaneously. Could the sets arrive at Supabase in the wrong order? Should the app care?"

### Concept 8: The hybrid approach — REST init + PowerSync writes
- "PowerSync syncs entire rows. But the server owns the workout ID. How does a phone know the ID to write sets with?"
- **The idea:** PowerSync syncs *read* data and *write* data separately. It can read data (exercises) without writing. It can write data (sets) without reading. But for sets, you need a workout ID (foreign key). The server owns that ID, so you must ask the server once, then you can write locally.
  - **REST for init:** `createWorkout(getTodayKey())` asks the server "give me today's workout" (or create it). Response: `{ id: 'w-123', ... }`.
  - **PowerSync for writes:** Once you have the ID, `db.execute('INSERT INTO sets ...')` writes locally. PowerSync uploads when online.
- **Why hybrid?** PowerSync is eventually consistent. It might take seconds for a new workout row to sync down. Meanwhile, the user wants to log a set. Solution: ask the server *once* (REST), cache the ID in React state, then write locally.
  ```
  User opens Log tab offline.
  useWorkout() mounts.
  It tries to subscribe to the local workouts table for today.
  But today's workout hasn't been synced down yet (it's not in the device).
  So there's no row to read.
  User taps to create a set — but where does it go? (No workout_id!)
  ```
  **With REST init:**
  ```
  User opens Log tab offline.
  useWorkout() mounts.
  It calls createWorkout(getTodayKey()) — might fail (no network), might succeed (cached).
  If success: workoutId is set, the local subscribe works (or waits).
  User logs a set → db.execute() succeeds locally.
  When online, PowerSync syncs the set (with the correct workout_id) to the server.
  ```
- "Why doesn't `usePowerSyncLog` just write a new row to the workouts table if today's workout doesn't exist?"

## 4. Cumulative review — rapid-fire
1. What are the three tiers of Peak Fettle's architecture?
2. Why is `weight_raw` (integer) used instead of `weight_kg` (float)?
3. Explain why sets are append-only but user profiles are mutable.
4. What happens when two phones log sets offline for the same workout?


---

# Lesson L17 — Charts & data visualization: from C++ series to the QML graph

> **Track:** 3 — QML/Qt UI · **Status:** Core visualization pipeline
> **Estimated time:** ~40 min · **Prerequisite rungs:** L01 (domain model), L14 (QML intro), L15 (Qt property bindings)

## 1. Learning outcomes
By the end, Arvin can:
- **(L2)** Explain what `progressSeries()` returns and why each point carries `{ x, y, date, reps, weight, dayKey }` fields.
- **(L3)** Apply unit conversion (`UnitPreference.toDisplay()`) to series data before plotting, and compute appropriate axis padding for a chart.
- **(L4)** Analyze the axis-labeling pitfall (using `labelFormat: "%d"` on a floating-point axis) and design a correct label strategy.
- **(L5)** Evaluate the "best per day" aggregation (from L01) in the context of chart presentation — when deload weeks, taper protocols, and back-off sets appear as scary dips, how do you present truth without discouraging the user?

## 2. The difficulty ladder for THIS lesson
1. What `progressSeries()` returns — the C++ → QML data boundary.
2. Building a LineSeries: appending points, scaling axes, handling empty state.
3. Unit conversion at the QML layer (kg → lb for display).
4. Axis labeling: why `labelFormat: "%d"` is a trap; labelDecimals + integer bounds as the safe path.
5. The "best per day" aggregation and its UI consequences: deload weeks, taper, back-off sets.
6. Interactive selectors: exercise picker, metric buttons, stats display.

## 3. Concept sequence

### Concept 1: The data boundary — what `progressSeries()` returns

- "You have 100 training sessions with 5–15 sets each. The app plots progress as a line. What's the minimal set of fields each point needs to carry into QML?"

- One exercise (Bench Press), metric (E1RM), over 10 days:
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

- Why `x` as an integer day index instead of timestamp? Because timestamp density is irregular (user trains 3 days/week, creating gaps), which breaks linear scaling. Day index `1, 2, 3, ...` gives clean, evenly-spaced x-axis labels regardless of when the user trained.

- "If `progressSeries()` returned every set instead of aggregating to best-per-day, how would the shape of the data change? Would day index still work?"

### Concept 2: Building the chart — appending points, scaling axes, empty state

- "You have 10 data points. You want to plot them on a line. What are the three hardest things to get right?"

- A user logs 8 Bench Press sets over 4 days. The progress graph should show a line with 4 points, axes that fit all 4 points without clipping, and the points visually spaced evenly across the x-axis.

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

- Why pad the y-axis? If the user's min is exactly 95 kg and max is 105 kg, a 0-padding chart squeezes the line to the pixel edges, making small variations invisible and the UI feel cramped. 15% padding (or 1 kg minimum) creates visual breathing room — a UX choice as much as a technical one.

- "Why does the single-point case set `xAxis.max = 2` instead of 1? What does that achieve?"

### Concept 3: Unit conversion at the QML layer

- **The idea:** The C++ `progressSeries()` returns all y-values in kg (the canonical internal unit). QML must convert to the user's preferred unit (lb) *before* plotting, not after. This ensures axis labels and tooltips are in the user's unit, and graph magnitudes are honest.

- "A user has set their preference to pounds. You plot 100 kg on the y-axis. They see '100' with a 'lb' label. What went wrong?"

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

- Why is `strengthScore` exempt from conversion? Because strength score is internally computed as a 0–1000 scalar *derived* from E1RM. Converting it to lb-based units would change the score arbitrarily (the same user, same lift, different unit → different score number). It's unit-less in the sense of being a proprietary metric, so we leave it raw.

- "If you plotted the y-value in kg but labeled the axis 'lb', what would happen to a user interpreting the chart?"

### Concept 4: Axis labeling — the `labelFormat` pitfall

- First build of ProgressGraphPage, the developer wrote:
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

- This was a real bug encountered in the first build (2026-04-30). The fix teaches: Qt has a **detailed axis API**; know its properties (labelDecimals, tickInterval, subTickCount) before guessing with printf formats. The Qt Graphs docs (6.11) don't mention labelFormat safety on floating-point axes — this is a gap in the documentation.

- "If you wanted x-axis labels to read `"0, 10, 20, ..."` instead of every integer, what property would you change?"

### Concept 5: "Best per day" aggregation — deload weeks, taper, and truth-telling

- "A lifter does a heavy top set, then 2 back-off sets at lower weight. The app plots every set's E1RM. What does the graph look like hour-to-hour? Why might that be demoralizing?"

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

- This default was a deliberate product decision. The founder and beta tester Marcus (a competitive lifter) debated it on 2026-04-30. Marcus wanted `perSet=true` by default to analyze his taper weeks. The app chose the motivational default for the 90% casual user, with `perSet=true` available for power analysis. This is *not* a hidden compromise — it's a conscious design choice that says: "the product prioritizes narrative over raw honesty for the majority."

- **:**
  - **Worked:** "A bench presser logs 5 sessions over 2 weeks. Session 3 is a deload (50% lower top set). The per-day graph shows a dip; the per-set graph shows per-set decay. How does each tell the story?"
  - **Faded:** "If a lifter asks 'why does my graph dip on deload weeks?', write a one-sentence explanation that defends the per-day default."
  - **Blank:** "Design a UI toggle to let power users switch between per-day and per-set without breaking the default."

- "Why does `perSet=false` prevent the 'second set looks weaker' artifact? What does it mean for users trying to detect fatigue?"

### Concept 6: Metric selection and stats display

- The user can pick E1RM, strength score, weight, or volume. Each has a different scale (E1RM: 80–300 kg; score: 0–1000; volume: 100–50000 kg-reps). The chart must re-scale the y-axis and re-label it every time the metric changes.

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

- The stats strip updates independently. When you switch metrics, the chart rescales, but the stats (PR, E1RM, score) come from `exerciseStats()`, which returns all three regardless of which metric is selected. This separation — selecting a metric for the *graph* but showing *all* stats — gives the user a complete picture without cluttering the axis.

- "When the user clicks 'Strength Score', what function is called, and in what order?"

## 4. Cumulative review — rapid-fire
1. What five fields does each point in `progressSeries()` carry?
2. Why can't you use `labelFormat: "%d"` on a floating-point ValueAxis? What's the safe alternative?
3. Sketch the graph of 3 back-off sets (140→135→125 kg E1RM) on the same day. How do per-day and per-set aggregation differ?


---

# Lesson L18 — The design system: tokens & theming

> **Track:** 3 — QML/Qt UI · **Status:** Core design infrastructure
> **Estimated time:** ~40 min · **Prerequisite rungs:** L14 (QML intro), L16 (QML layouts)

## 1. Learning outcomes
By the end, Arvin can:
- **(L2)** Explain what a design token is, why it differs from inline hex, and what classes of bug a token layer prevents.
- **(L3)** Apply tokens correctly in a QML component (e.g., a button or text field), and implement light/dark mode by swapping color objects.
- **(L4)** Analyze the cost/benefit of the Phase E migration (470+ hex → tokens): what was the payoff, what was the overhead, and for which user (solo founder pre-launch) was it justified?
- **(L5)** Evaluate a design system choice: should buttons reference tokens directly, or should components expose semantic properties (e.g., `buttonColor: "primary"`) that map to tokens internally?

## 2. The difficulty ladder for THIS lesson
1. What a design token is; the difference between `#00C9B8` and `Theme.turquoise`.
2. Primitive vs. semantic tokens (Brand.turquoise vs. Colors.dark.accent).
3. Singleton registration in Qt/QML; why Theme doesn't need an import.
4. Light/dark mode switching: two color objects, one flag, reactive bindings.
5. The spacing & typography systems (4-pt grid, font sizes).
6. The Phase E migration: scope (470+ hex), strategy, payoff (which bugs prevented?).

## 3. Concept sequence

### Concept 1: Design tokens vs. inline hex — the single source of truth

- "Your app has a navy-blue color used in 47 places. The designer says 'change it to a slightly lighter navy.' With inline hex, what have to you change? What could go wrong?"

- Before tokens, Peak Fettle had scattered hex values:
  ```qml
  // ProgressGraphPage.qml
  Rectangle { color: "#0A1A33" }  // navy
  Text { color: "#00C9B8" }       // turquoise
  
  // SettingsPage.qml
  Rectangle { color: "#0A1A33" }  // same navy (copied)
  Button { color: "#00C9B8" }     // same turquoise (copy again)
  ```
  The designer says "adjust navy to `#0B1C36`". You have to find and change every instance. If you miss one, the UI becomes inconsistent — a page looks slightly off but you can't tell why.

- **The idea:** A design token is a *named variable* for a design decision. Instead of repeating `#0A1A33`, you define `Theme.navyDeep` once, and everywhere uses that name. Changes are atomic — one edit, one redraw everywhere.
  - **Inline hex:** "What color is it?" → "Read the hex value." Scattered, fragile, no semantics.
  - **Token:** "What color is it?" → "It's `Theme.navyDeep`." One source, semantic name, auditable.

- **Real code** (`qml/Theme.qml`, lines 16–23):
  ```qml
  pragma Singleton
  import QtQuick

  QtObject {
      // ----- Core palette -----
      readonly property color black:        "#06080F"   // near-pure black bg
      readonly property color navyDeep:     "#0A1A33"   // primary dark blue
      readonly property color navyMid:      "#122E5C"   // card / panel surface
      readonly property color navyLine:     "#1E3A66"   // subtle borders
      readonly property color turquoise:    "#2DD4BF"   // primary accent
  ```
  And usage in a component:
  ```qml
  // ProgressGraphPage.qml, line 30
  background: Rectangle { color: Theme.black }
  
  // line 168
  contentItem: Text {
      color: Theme.turquoise
  ```

- Tokens aren't just a code organization trick. They're a *semantic layer* — `Theme.navyDeep` says "this is the dark background," not just "this pixel value." When the designer changes navy because the app is getting a rebrand, you don't change 47 hex values — you change `Theme.navyDeep` once, and the entire app updates in one build. For a solo founder, that's the difference between "I can iterate on design in hours" and "I need a designer and developer to coordinate on 47 files."

- "If you inline hex everywhere, what's the signal that a color is inconsistent?"

### Concept 2: Primitive vs. semantic tokens

- **The idea:** There are two layers of tokens:
  1. **Primitive:** Named hex values with no context. `Brand.navyDeep = "#0A1A33"`. These are the atoms.
  2. **Semantic:** Roles that reference primitives. `Colors.dark.background = Brand.navyDeep`. "In dark mode, backgrounds use navy-deep." This layer says *what role the color plays*, not just what it is.

- You're building a light mode. What color should text be in light mode? You *could* say `Colors.light.text = "#000000"` (black). But a more thoughtful choice is `Colors.light.text = Brand.lightText = "#0D2137"` (a slightly lighter dark navy, easier on the eyes than pure black on light backgrounds). The semantic layer captures this design intent: "text in light mode is navy-ish, not true black."

- **Real code** (`MyApp/constants/theme.ts`, lines 35–62):
  ```typescript
  const tintColorLight = Brand.skyBlue;
  const tintColorDark  = Brand.turquoise;

  export const Colors = {
    light: {
      text:            Brand.lightText,      // "#0D2137"
      background:      Brand.lightBg,        // "#F0F5FA"
      surface:         Brand.lightSurface,   // "#E2EAF2"
      tint:            tintColorLight,       // Brand.skyBlue
      accent:          Brand.turquoise,
      icon:            Brand.lightMuted,
      tabIconDefault:  Brand.slateMid,
      tabIconSelected: tintColorLight,
      tabBar:          '#FFFFFF',
      header:          Brand.navyMid,
    },
    dark: {
      text:            Brand.offWhite,       // "#E2ECF4"
      background:      Brand.navyDeep,      // "#09151F"
      surface:         Brand.navyMid,       // "#0D2137"
      tint:            tintColorDark,       // Brand.turquoise
      accent:          Brand.turquoise,
      icon:            Brand.slateLight,
      tabIconDefault:  Brand.slateMid,
      tabIconSelected: tintColorDark,
      tabBar:          Brand.navyMid,
      header:          Brand.navyLight,
    },
  };
  ```

- This two-layer structure is the foundation of light/dark mode. You define *one* set of semantic tokens per theme (light and dark), and the same app code uses `Colors.text`, which resolves to either `Brand.lightText` (light mode) or `Brand.offWhite` (dark mode) depending on a theme flag. No component has to know about the theme — the Colors object handles it.

- "If you're in light mode and you reference `Colors.text`, what value do you get, and why?"

### Concept 3: The spacing scale — the 4-point grid

- **The idea:** Not just colors; the entire design system is token-based. Spacing follows a 4-point grid: every margin, padding, and gap is a multiple of 4 pixels. This rhythm creates visual coherence and prevents "random" spacing scattered across the codebase.

- **Real code** (`qml/Theme.qml`, lines 32–40):
  ```qml
  // ----- Spacing scale (4-pt grid) -----
  readonly property int s1:  4
  readonly property int s2:  8
  readonly property int s3:  12
  readonly property int s4:  16
  readonly property int s5:  24
  readonly property int s6:  32
  readonly property int s7:  48
  readonly property int s8:  64
  ```
  Usage in ProgressGraphPage.qml (line 160):
  ```qml
  anchors.leftMargin:  Theme.s4    // 16 px
  anchors.rightMargin: Theme.s4
  spacing: Theme.s3                // 12 px
  ```

- This rhythm is *not* arbitrary. In Material Design and similar systems, a 4-point or 8-point grid is standard. Why? Because it creates a visual rhythm that feels intentional — spacing isn't "16 here, 13 there" but "s4 here, s3 there" — and it's cheap to adjust the entire app (change `s4: 16` to `s4: 18` and everything reflows). For a solo founder iterating, this scales-with-the-designer paradigm is powerful.

- "If a component uses `spacing: 12`, which spacing token is that, and would it look out of place next to `spacing: 13`?"

### Concept 4: Typography tokens and font scaling

- **The idea:** Like spacing, typography is token-based: defined sizes and families, not scattered `font.pixelSize: 14` scattered in code.

- **Real code** (`qml/Theme.qml`, lines 47–52):
  ```qml
  // ----- Typography sizes (logical pt) -----
  readonly property int fontDisplay: 36
  readonly property int fontH1:      26
  readonly property int fontH2:      20
  readonly property int fontBody:    15
  readonly property int fontSmall:   12
  ```
  Usage in ProgressGraphPage.qml (lines 179–180):
  ```qml
  font.pixelSize: Theme.fontH2
  font.bold: true
  ```

- Logical sizes (pt) vs. pixels (px) matter on different platforms. Qt uses `pixelSize`, which is physical pixels, but conceptually these are "point-like" sizes: h1 = 26 for headlines, body = 15 for body text. When the designer says "make all h1s slightly bigger," you change one line: `fontH1: 28`, and every page reflows.

- "Which token would you use for a set list label: fontBody or fontSmall?"

### Concept 5: Light/dark mode switching

- "How do you implement dark mode in a 200-file app without duplicating every color reference?"

- **The idea:** Once you have two semantic color objects (`Colors.light` and `Colors.dark`), switching modes is trivial: a theme flag, and bindings automatically use the right object. No component cares about the flag — they just reference `Colors` properties.

- **Real code** (conceptual architecture):
  ```qml
  // Global theme flag (not shown in the current files, but implied)
  ThemeManager {
      property bool isDarkMode: true
      
      property var currentColors: isDarkMode ? darkColors : lightColors
  }
  
  // In a component:
  Text {
      color: ThemeManager.currentColors.text
  }
  ```
  The React Native equivalent (`MyApp/constants/theme.ts`) has two separate `Colors` objects; the mobile app would have a theme context that selects one at startup and on toggle.

- Peak Fettle doesn't *currently* have a light-mode toggle (it ships with dark as the default). But the token structure makes adding one trivial — just add a flag and change which `Colors` object is in scope. Without tokens, light mode would require a second pass over every file to identify hardcoded colors and swap them.

- "If you change the theme flag to light mode, how does a Text widget automatically recolor without being re-written?"

### Concept 6: Phase E migration — 470+ hex values to tokens

- "Your codebase has 470+ scattered hex colors. You're about to iterate design heavily. Do you tokenize, or ship as-is and refactor later?"

- **The idea:** Phase E (pre-launch phase) made a strategic choice: migrate 470+ hex values to the token layer. This was *not* feature work — it was infra. But it enabled the design iteration that followed (dark/light testing, color refinement) without multiplying merge conflicts.

- **Cost:** Weeks of mechanical refactoring. Every hex found and linked to a token. Testing to ensure no color changed during the rewrite. Potentially broke some things (missed a hex, or misnamed a token).

- **Payoff:** After migration, the designer could say "make navyDeep 5% lighter" and Arvin could change one line and ship. Without it, every color tweak requires hunting 470+ files. For a solo founder 2–4 weeks from launch, the choice was clear: invest the time in infrastructure so design iteration doesn't become a bottleneck.

- **Real code** (from Phase E notes): the migration process:
  ```
  Before:
    #0A1A33 appears in ProgressGraphPage.qml, SettingsPage.qml, 
    PrimaryButton.qml, SetTrackerPage.qml, ... (47 places)
  
  After:
    Theme.navyDeep = "#0A1A33"  // defined once
    ProgressGraphPage uses Theme.navyDeep
    SettingsPage uses Theme.navyDeep
    ... (atomic change now)
  ```

- This migration is a classic founder trade-off. Speed vs. maintainability. Without tokens, Arvin ships faster (no refactoring week). With tokens, he iterates faster *after* shipping (one-line changes instead of 47-file hunts). For a pre-launch app with uncertain design, the latter is rational. For a stable codebase in maintenance mode, tokens might be overkill.

- "If the Phase E migration took 5 days of work, what's the minimum number of design-iteration cycles needed to break even?"

### Concept 7: Component design — tokens vs. semantic properties

- "You're building a reusable button. Do you hardcode `color: Theme.primary`, or do you expose a `buttonType: "primary"` property that maps to tokens internally?"

- **The idea:** There's a third layer of abstraction: components. A `PrimaryButton` *could* reference tokens directly:
  ```qml
  // Option A: tokens in components
  Rectangle {
      color: Theme.turquoise
      Text { color: Theme.textOnAccent }
  }
  ```
  Or it could expose a semantic property:
  ```qml
  // Option B: semantic properties
  Rectangle {
      property string buttonType: "primary"  // or "secondary"
      color: buttonType === "primary" ? Theme.turquoise : Theme.navyDeep
      Text { color: buttonType === "primary" ? Theme.textOnAccent : Theme.text }
  }
  ```
  Peak Fettle uses option A (tokens directly in components, minimal abstraction). This is simpler for a small codebase and lets designers change `Theme` without touching components.

- **Real code** (`qml/components/PrimaryButton.qml`):
  ```qml
  Button {
      contentItem: Text {
          text: parent.text
          color: parent.checked ? Theme.textOnAccent : Theme.textPrimary
          // ...
      }
      background: Rectangle {
          color: parent.checked ? Theme.turquoise : Theme.navyDeep
          // ...
      }
  }
  ```

- Option A (tokens directly) is the "happy path" for early-stage apps: fewer layers, easier to onboard. Option B (semantic properties) scales better when you have 50 component variations and need to change "primary" systematically across all of them. Peak Fettle chose simplicity; as it grows, adding a component-property layer would be a future refactor.

- "If you wanted every button in the app to use a new color, would you change PrimaryButton.qml or Theme.qml?"

## 4. Cumulative review — rapid-fire
1. What's the difference between a primitive token (Brand.navyDeep) and a semantic token (Colors.dark.background)?
2. In the 4-point spacing grid, which token is 12 pixels?
3. How would you add light-mode support to an app with a complete token system? (One sentence.)


---

# Lesson L19 — The Qt object model & exposing C++ to QML

> **Track:** 4 — C++/Qt Desktop & interop · **Status:** Core QML-C++ bridge
> **Estimated time:** ~45 min · **Prerequisite rungs:** L01 (domain model), L02 (C++ language)

## 1. Learning outcomes
By the end, Arvin can:
- **(L2)** Explain what `Q_OBJECT`, `Q_PROPERTY`, and `QML_ELEMENT` do, and why they're necessary for QML to communicate with C++.
- **(L3)** Write a Q_PROPERTY with READ, WRITE, and NOTIFY, and implement the corresponding setter that emits the notification signal.
- **(L4)** Analyze the boilerplate cost (`Q_PROPERTY` + setter + signal) against a plain struct and determine when each is appropriate.
- **(L5)** Evaluate the singleton pattern for `WorkoutTracker` — when is a singleton the right choice for a QML-exposed object, and what are the downsides?

## 2. The difficulty ladder for THIS lesson
1. The QObject base class and `Q_OBJECT` macro: what it enables.
2. Q_PROPERTY: READ, WRITE, NOTIFY — the contract.
3. Implementing a property: the getter, setter, signal, and notification logic.
4. Q_INVOKABLE methods: exposing C++ functions directly to QML.
5. Singleton registration: `QML_ELEMENT`, `QML_SINGLETON`, and when to use it.
6. The moc compiler: how `Q_OBJECT` triggers code generation.
7. Trade-offs: property boilerplate vs. plain structs; singletons vs. dependency injection.

## 3. Concept sequence

### Concept 1: QObject — the foundation of the meta-object system

- "In plain C++, how does code running in one language (JavaScript/QML) call functions on a C++ object? Why is that hard?"

- QML is JavaScript running in a VM. C++ is compiled native code. They're in different worlds. How does QML call a C++ method? It needs *reflection* — runtime information about C++ objects that JavaScript can inspect and invoke.

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

- Without `Q_OBJECT`, the class is just C++. QML can't see it. The moc compiler skips it. With `Q_OBJECT`, moc generates ~500 lines of reflection code that lets QML bind to properties, call methods, and connect to signals. This is Qt's superpower: C++ performance with dynamic language ergonomics.

- "What does the moc compiler generate when it sees `Q_OBJECT` in a header?"

### Concept 2: Q_PROPERTY — the bridge between C++ and QML

- "In QML, you want to bind to a C++ property like `set.weightKg`. The C++ class has a private `m_weightKg` field. How do you expose it safely and reactively?"

- A Set has a weight. QML wants to display it and respond when it changes (redraw the chart). In plain C++, you'd expose a getter:
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

- The `if (m_weightKg == v) return;` guard prevents redundant notifications. If QML sets `weightKg = 100` twice, the setter emits only once. This matters for performance — every signal emission triggers binding updates, which can reflow the UI.

- "Write the Q_PROPERTY for an `int reps` field with a setter `setReps()` and a signal `repsChanged()`."

### Concept 3: Implementing a property — the full cycle

- **:**

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

- "When a property setter emits its notification signal, what happens in QML?"

### Concept 4: Q_INVOKABLE — exposing C++ methods directly

- "QML can bind to properties and listen to signals. But you also want to call a C++ method like `saveRoutine(name, exercises)`. How?"

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

- Q_INVOKABLE is simpler than Q_PROPERTY — no setter, no signal, no binding. Use it for actions (logging a set, saving a routine) that don't fit the reactive property model. Properties are for *state* (what is the value now?); invokables are for *actions* (do this thing).

- "When would you use Q_INVOKABLE instead of Q_PROPERTY?"

### Concept 5: Singleton registration — QML_SINGLETON and when to use it

- "WorkoutTracker is a hub for all set-tracking. You want QML to call `WorkoutTracker.logSet()` directly, not create an instance. How?"

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

- Singletons are convenient but controversial. They couple all code to a global, making testing hard (you can't inject a mock). For a small app like Peak Fettle, the trade-off (convenience now, pain later if you refactor) is reasonable. For a large app with 100 pages, you'd use dependency injection instead. The comment in `WorkoutTracker.h` (lines 1–3) makes the intent clear: "singleton hub for everything set-tracking."

- "What's the downside of using a singleton for WorkoutTracker?"

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

- Emitting `volumeChanged()` when weight changes (even though volume is computed, not stored) is the key to reactivity. QML binds to `volume` and expects to be notified of changes. If the setter doesn't emit, the binding goes stale.

- "If you emit `weightKgChanged()` but not `volumeChanged()`, and QML binds to both, what breaks?"

### Concept 7: The moc compiler — how Q_OBJECT works

- You write `Q_OBJECT` in a header. The Qt build system runs the meta-object compiler (moc). It generates a hidden `_moc.cpp` file with reflection code. This file is compiled and linked. Now `set.metaObject()` returns introspection data that QML can query.

- **The idea:** `Q_OBJECT` is not magic — it's a signal to moc to generate glue code. The boilerplate:
  - A `staticMetaObject` (introspection tree: properties, methods, signals).
  - A `metaObject()` function that returns it.
  - `qt_metacall()` which handles invocations from QML.
  - The glue that connects signals to slots.

- This code generation is why Qt is powerful: you write simple, readable class definitions with `Q_PROPERTY`, and moc fills in the reflection plumbing. In languages without this (plain C++, Python), you'd have to hand-write introspection. Qt automated it.

- "If you add a new Q_PROPERTY to a header but forget to rebuild, will QML see it?"

### Concept 8: Trade-offs — boilerplate vs. plain structs

- "A Set has 10 fields. Each needs a Q_PROPERTY, getter, setter, signal — ~5 lines per field = 50 lines of boilerplate for a simple struct. When is that worth it?"

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

- "Would you make an RGB color struct inherit from QObject? Why or why not?"

### Concept 9: Singletons and dependency injection — the design choice

- "WorkoutTracker holds all the app's data. Two patterns: (a) global singleton, everyone uses WorkoutTracker::instance(); (b) pass it as a dependency to each page. What's the trade-off?"

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

- The singleton choice is documented implicitly in the code — there's one global instance and no constructor for users to call. If the codebase grows and testing becomes painful, migrating to DI is a future refactor. For now, it's the right trade-off.

- "If you wanted to test WorkoutTracker with a mock database, what's the problem with the singleton pattern?"

## 4. Cumulative review — rapid-fire
1. What does `Q_OBJECT` macro tell the moc compiler to generate?
2. Write a full Q_PROPERTY declaration with READ, WRITE, and NOTIFY for a `QString exerciseName` field.
3. If you set `weightKg = 100` in QML and the setter emits only `weightKgChanged()` (not `volumeChanged()`), what breaks?


---

# Lesson L20 — QML UI: pages, bindings, delegates, theming, navigation

> **Track:** 2 — Desktop frontend · **Status:** ⭐ Reference lesson (fully worked)  
> **Estimated time:** ~40 min · **Prerequisite rungs:** L01–L10 (domain model through Qt basics)

## 1. Learning outcomes

By the end, Arvin can:

- **(L1)** Identify the difference between a QML property binding and imperative event handlers, and when QML re-evaluates each.
- **(L2)** Explain why `Theme` is a singleton and how it enforces design consistency across pages.
- **(L3)** Trace a user action (tapping "Log a set") through the navigation stack from QML down to C++ and back up to the UI redraw.
- **(L4)** Analyze the binding in `WeightLabel` — why it references `UnitPreference.unit` even though it's discarded — and what bug it prevents.
- **(L5)** Compare QML's declarative reactive model (property bindings auto-trigger on signal) against React's explicit re-render in the mobile app, and defend which is easier to reason about for the progress-graph redraw when `dataChanged` fires.

## 2. The difficulty ladder for THIS lesson

1. What QML is: declarative language for UIs + property bindings + signals.
2. Theme singleton: one source of truth for colors, spacing, typography.
3. Property bindings: when QML evaluates them, and why they're reactive.
4. Navigation: StackView push/pop and the goTo() centralized API.
5. Delegates: ListView repeating a component for each data row.
6. The WeightLabel binding trick: registering a dependency via the comma operator.
7. End-to-end: HomePage emits signals → bindings re-evaluate → chart redraws.

## 3. Concept sequence

### Concept 1: QML is a declarative language; bindings auto-react to signal changes

- "If you change a `Text` label's text property in C++, does the QML Text on screen update automatically, or do you have to call repaint()?"
  
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

- Why not just call a function every frame? QML is lazy — it only re-runs bindings when their dependencies change. That's much cheaper than re-rendering a 60 fps game loop. Analogy: a spreadsheet recalculates only the cells depending on the one you edited, not the whole sheet.

- "In HomePage, when the user logs a new set, what signal fires in C++, and how does it reach the QML property binding?"

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

- "What happens if you want to add a dark mode? How does Theme being a singleton help or hurt?"
  - Answer seed: Theme is read-only right now, so dark mode would need a new property `isDarkMode` and conditional bindings. The singleton pattern lets you add it without changing 50 component files.

- "Why is Theme's palette defined as `readonly` properties instead of normal JavaScript variables?"
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

- A binding is checked ~0 times if the source never changes; a handler that navigates the stack is an action, not a query, so it can't be binding-based. You *must* use handlers for imperative actions (navigation, file I/O, animations that aren't declarative).

- **:** "Why does HomePage use a Connections block to listen to WorkoutTracker.dataChanged instead of just writing a binding?" 
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

- "What's the difference between `stack.replace()` and `stack.push()`, and when does Peak Fettle use each?"
  - Answer seed: `replace(null, ...)` clears the stack and starts fresh (used for "Home" after auth); `push()` stacks the new page on top (used for "Tracker" so you can pop back).

- The transitions in lines 52–65 animate the entry/exit. The `x` and `opacity` animations give the slide-in from the right feel. This is *declarative* — you say "when a new page enters, slide from `stack.width` to 0"; the engine handles the frame timing.

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

- "If you have 500 sets in recentSets() and each set row is a complex component with 3 Text items and an icon, does the app create 500 × 4 items at once, or on demand?"
  - Answer seed: On demand — ListView only renders visible rows + a bit of overschroll buffer. Off-screen rows are destroyed and re-created as needed (or pooled in modern Qt). This is *essential* for mobile performance.

- "In the recent-workouts delegate, what is `modelData`? How does it relate to the `model` property?"

### Concept 6: The WeightLabel binding trick — comma operator to register signal dependencies

- **The idea:** `WeightLabel.qml` displays a weight in the user's chosen unit (kg or lb). When they toggle the unit, all `WeightLabel` components must redraw. *But* `UnitPreference.format()` is an `Q_INVOKABLE` method, not a `Q_PROPERTY`, so QML doesn't know to re-run the binding when the unit changes. The fix: reference `UnitPreference.unit` (which *is* a property with NOTIFY) inside the binding, even though you discard it.

- **Real code** (`qml/components/WeightLabel.qml` lines 39–41):
  ```qml
  text: (UnitPreference.unit, weightKg > 0
                              ? UnitPreference.format(weightKg)
                              : "BW")
  ```
  
  The `(UnitPreference.unit, ...)` comma operator evaluates the unit (for side effects / dependency tracking), then evaluates the conditional. When the unit changes, QML re-runs the entire binding.

- "What would happen if you removed the `UnitPreference.unit` reference? User switches from kg to lb in Settings—"
  - Answer seed: The binding would NOT re-evaluate. The labels would stay showing "80 kg" even though the unit is now "lb". Users toggle the setting and nothing happens — a critical bug. This binding trick prevents it.

- This is a *workaround* for a limitation in QML's binding system. Ideally, `format()` would be a computed property instead of a method. But the fix is elegant — it costs nothing (one extra property read per label) and solves the problem with one line.

- "Why not just add a `Connections { target: UnitPreference; function onUnitChanged() { ... } }`?" (Hint: handlers are imperative; bindings are declarative and can't be computed properties.)

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

- "User logs a bench-press set. Draw a box diagram: C++ side (logSet) → signal → QML side (refresh) → binding → screen."
  - Boxes: **C++ WorkoutTracker.logSet()** → (emit dataChanged) → **QML Connections handler calls refresh()** → (re-query recentSets) → **currentStreak property changes** → (binding re-evaluates) → **Text redraws with new streak count**

- The allSets array is a `property var` (a JavaScript value, not a C++ type). When you assign a `QVariantList` from C++ to a QML `var`, it's automatically converted. Modifications to that JavaScript array don't notify back to C++ (it's a copy), but that's fine — HomePage only queries and displays, never mutates the C++ data.

- "Why does HomePage use `Connections { target: WorkoutTracker }` instead of a property binding directly on WorkoutTracker.dataChanged?"
  - Hint: Signals aren't properties. You can't bind to a signal; you handle it.

## 4. Cumulative review — rapid-fire

1. A Page imports `PeakFettle 1.0` and references `Theme.turquoise`. What guarantees it gets the right color?
2. `weWightLabel.qml` uses `(UnitPreference.unit, UnitPreference.format(...))`. Why the comma?
3. User logs a set. Trace the signal path from C++ through QML to the HomePage streak badge updating.
4. What's the difference between a property *binding* (`text: foo.bar`) and a *handler* (`onClicked: foo.bar()`)?


---

# Lesson L21 — C++↔QML data flow: the full round-trip on the desktop

> **Track:** 2 — Desktop frontend · **Status:** ⭐ Reference lesson (fully worked)  
> **Estimated time:** ~45 min · **Prerequisite rungs:** L01–L06, L20 (domain model + QML basics)

## 1. Learning outcomes

By the end, Arvin can:

- **(L1)** Identify what a `Q_INVOKABLE` method is, and why it's needed for QML to call C++ functions.
- **(L2)** Explain the DTO pattern: why `recentSets()` returns `QVariantList` of maps instead of exposing C++ `Set*` pointers directly to QML.
- **(L3)** Trace a QML user action (logSet call) through `Q_INVOKABLE`, a C++ model mutation, and back to the `dataChanged` signal.
- **(L4)** Analyze the data-narrowing boundary: what type conversions happen when a `QVariantList` crosses from C++ to QML, and why string keys in the maps are safer than exposing model objects.
- **(L5)** Evaluate the DTO design (maps with string keys) vs. exposing `Set*` objects to QML — what does each cost in coupling, performance, and maintainability?

## 2. The difficulty ladder for THIS lesson

1. Q_INVOKABLE: registering a C++ method as callable from QML.
2. Q_PROPERTY: exposing C++ data members and signals to QML bindings.
3. QVariantList / QVariantMap: the bridge types for untyped data.
4. Return values: how QML receives a `QVariantList` from C++ logSet().
5. The DTO pattern: why maps (not objects) cross the boundary.
6. Signal → binding → redraw: the round-trip from C++ mutation to QML re-render.
7. Type safety trade-off: coupling vs. flexibility at the boundary.

## 3. Concept sequence

### Concept 1: Q_INVOKABLE — C++ methods visible to QML

- "You write a C++ method `WorkoutTracker::logSet(name, weight, reps)`. How does QML call it? Does QML have a C++ compiler, or is there magic?"

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

- Not *all* C++ methods are visible to QML by default. You must mark them `Q_INVOKABLE`. This is intentional — it forces you to think about which methods are part of the QML boundary. Private methods stay private to C++.

- "In SetTrackerPage, when the user taps 'Done', onClicked fires. What happens next? Does QML have the exerciseName string, or does it get retrieved from the C++ model?"
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

- "What's the relationship between `Q_PROPERTY` and `Q_INVOKABLE`? Can a method be both?"
  - Answer seed: No—a property is state (read/write), a method is an action. But the getter of a property *is* a method, so getters are implicitly callable. Q_INVOKABLE is for methods you want QML to call directly.

- "If you write `WorkoutTracker.totalSets = 100` in QML, what happens? Is totalSets writable from QML?"
  - Answer seed: No—it's `READ totalSets` (getter only), no WRITE. QML can read it, but setting it fails silently or errors. This is intentional; you can't mutate the model by writing a property; you call logSet() instead.

- "Why does `Q_PROPERTY` declare a NOTIFY signal (dataChanged) instead of just using the getter?"

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

- ** Elaboration — why not expose `Set*` directly?** If C++ returned `QList<Set*>`, QML would get pointers. To use them, you'd write bindings like `text: setPtr.weightKg()`, which works but tightly couples QML to the Set class. If you refactor Set's API, QML breaks. Maps decouple: add a field to the map, QML needs no changes (JS is duck-typed). The cost: no compile-time schema validation — you don't know if the key "weights" (typo) is missing until runtime.

- "In SetTrackerPage, recent is a `property var recentSets: []`. When you write `recentSets = WorkoutTracker.recentSets(50)`, what type is recentSets?"
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

- "In step 4, refresh() calls `recentSets(50)` again. Could you cache the result from step 1 instead of re-querying?"
  - Answer seed: logSet() returns the new setId, not the full set object. re-querying is simpler than deserializing the return value. The cost: O(n) re-sort for each new set, but 50 sets is fast. If you logged 1M sets, you'd want a more sophisticated strategy (e.g., prepend to the list).

- `dataChanged()` is generic. A more specific signal like `setLogged(exerciseName)` (WorkoutTracker.h line 205) is also emitted, so pages interested only in set logging can listen to that and skip re-querying exercises. Peak Fettle uses both: HomePage listens to dataChanged (so it recalculates streak); SetTrackerPage could optimize by listening to setLogged instead.

- "Where in the chain does the actual UI redraw happen?"

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

- "Pro: Set's API is transparent (you see `estimatedOneRepMax()` right there). Con: QML couples to Set's C++ class definition. If you rename `weightKg()` to `mass()`, all QML breaks. With the DTO, you rename the field in the map builder, add a deprecation message, and QML is unaffected."

- "The map has a `volume` key. Would you compute it in C++ (as now) or expose `weightKg` and `reps` separately and compute in QML?"
  - Answer seed: Computing in C++ is better—it's one source of truth, and the formula is part of the domain logic (belongs in C++). QML is for presentation.

- "Why is the set ID included in recentSets() maps?"
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

- C++ default arguments (like `rir = -1`) are *not* visible to QML. If you call `logSet("Bench", 80.5, 5)` from QML, the default rir is *not* applied; you must pass all 4 arguments explicitly. This is a Qt quirk. Workaround: overload methods or use Q_INVOKABLE slots for each signature.

- **:** "QDateTime converts to JavaScript Date. Plotting ProgressGraphPage passes `p.date` (milliseconds since epoch) to the chart. How does the QDateTime (UTC, with timezone) become a Date with a timezone?"
  - Hint: QDateTime serializes to milliseconds; JavaScript Date interprets those as UTC. If you want local time, you must convert in C++ before returning.

- "What happens if you try to pass a C++ `Set*` pointer from C++ to QML as a return value?"

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

- "Peak Fettle logs ~5–20 sets per day. Typical user has ~200 sets logged (40 days). When ProgressGraphPage calls progressSeries(), how many rows is the QVariantList?"
  - Answer seed: 40 rows (one best-per-day). If perSet=true, 200 rows. The DTO marshaling cost is negligible for either.

- "Six months later, you want to add a `isPr` flag to each recent set (marking personal records). Is it easier with the DTO design or native objects?"
  - Answer seed: **Much** easier with DTOs. Add `row["isPr"] = (this set is a new personal record);` to the map builder. QML reads `modelData.isPr` and draws a badge. No QML or QML bindings change. With native objects, you'd add a method `isPr()` to Set, modify the QML types, and recompile everything. The decoupling pays off.

## 4. Cumulative review — rapid-fire

1. What's the difference between `Q_INVOKABLE` and `Q_PROPERTY`? Which one can QML call like a function?
2. `recentSets()` returns `QVariantList`. What type does QML see it as?
3. User logs a bench press in SetTrackerPage. Trace: onClicked → logSet (C++) → signal → refresh → binding updates. Where does the UI redraw happen?
4. Why does the map include `volume` (computed from weight*reps) instead of letting QML compute it?


---

# Lesson L22 — End-to-end: one set's journey through the whole stack

> **Track:** 2 — Desktop frontend (synthesis rung) · **Status:** ⭐ Reference lesson (fully worked)  
> **Estimated time:** ~50 min · **Prerequisite rungs:** L01–L21 (full domain + QML + C++↔QML bridge)

## 1. Learning outcomes

By the end, Arvin can:

- **(L1)** Map the major nodes (QML input, C++ model, in-memory store, UI redraw) and the signal/callback paths between them.
- **(L2)** Describe the path of a single bench-press set from "user types '80 kg' and taps Done" to "set appears in the recent list."
- **(L3)** Trace a bench-press set end-to-end: logSet → Exercise.addSet → Set created → dataChanged → HomePage refresh → recentSets → ListView delegate binding → "Bench × 5" rendered.
- **(L4)** Analyze the data-loss risks in the path: where could the set be silently dropped, corrupted, or rendered incorrectly?
- **(L5)** Identify the single highest-risk hop for data integrity and propose the one guardrail you'd add first to defend it. Evaluate trade-offs (cost, complexity, false positives).

## 2. The difficulty ladder for THIS lesson

1. The happy path: logSet → Exercise.addSet → Set created → signal → refresh → redraw.
2. Data shape transformations: C++ QVariantList → QML JavaScript array → delegate binding.
3. Side effects: emit dataChanged vs. emit setLogged; when each is appropriate.
4. Data-loss risk inventory: where sets can be dropped (validation, capacity, scope).
5. Ranking-pipeline integration: logSet → progressSeries → ProgressGraphPage; percentileForExercise.
6. Latency and batching: why percentile computation is batch-weekly, not real-time.
7. The highest-risk hop: identifying the bottleneck and proposing a guardrail.

## 3. Concept sequence

### Concept 1: The happy path — input to display in 5 hops

- "User logs a bench press (80 kg × 5). You're watching Wireshark / a debugger. Draw 5 boxes showing the path from the TextField to the ListView updating."

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

- Each hop has a cost:
  1. QML onclick: ~1 ms (event dispatch).
  2. logSet (C++): ~0.1 ms (hash insert, new Set, no disk I/O).
  3. Signal propagation: ~0.1 ms (registered connections).
  4. QML handler + refresh: ~1–5 ms (re-query, re-sort 50 sets).
  5. QML binding + redraw: ~16 ms (vsync, render frame).
  
  Total: ~20–30 ms. The user taps "Done," the set appears in the list within one frame. Fast enough for a native-feeling app.

- "In hop 4, refresh() calls recentSets(50). What if there are 500 sets logged? Does recentSets() re-sort them all?"

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

- "The C++ `Set` has a reps field of type `quint16` (16-bit unsigned). JavaScript numbers are 64-bit floats. When the set crosses the bridge, does reps=5 lose precision?"
  - Answer seed: No. Integers up to 2^53 are exactly representable in float64. reps fits easily. But if you had a 128-bit integer, precision would be lost.

- "In the QML delegate, `WeightLabel { weightKg: modelData.weight }` receives `weight: 80.0` (from the map). Is this still in kg, or has the unit changed?"
  - Answer seed: Still kg—the map stores the canonical unit. The WeightLabel component converts to the user's display unit (lbs, if they chose it) via UnitPreference.format().

- "Why does recentSets() include `dayKey` in the map if it's derived from the timestamp?"

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

- "If setLogged fires for every new set and you log 100 sets in a speed test, how many times does HomePage.refresh() run?"
  - Answer seed: 100 times (once per signal). Each re-evaluates the streak calculation on 2000 sets. This is the "hammer away" case. A power user would see slowdown. In practice, manual logging is <1 set per second, so 100 sets = 100 seconds of tapping. Acceptable for now; would optimize if batching (add 10 sets at once) became a feature.

- "Why not just make HomePage listen to setLogged instead of dataChanged? What would break?"

### Concept 4: Risk inventory — where data can be lost, corrupted, or rendered wrong

- "I want to identify the riskiest hop in the chain. Draw a fault tree: what could go wrong at each step, and how likely is each failure?"

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

  - **Critical:** data loss (set is created but never stored or queried).
  - **High:** corruption (set is stored but with wrong values; e.g., weight=0, reps=-5).
  - **Medium:** transient (set is temporarily invisible but can be retrieved; e.g., refresh didn't run).
  - **Low:** cosmetic (set is stored and queryable but renders wrong; e.g., blank label).

- "The C++ data is all in-memory (`m_exercises: QHash`). If the user force-quits the app, all sets are lost. Is this a risk?"
  - Answer seed: Yes—**critical**. But it's outside the scope of "one set's happy path." Persistence (SQLite, JSON file) is a separate subsystem. This lesson assumes the app is running and doesn't crash.

### Concept 5: The highest-risk hop and the guardrail

- **The idea:** Of all the hops, one stands out as the riskiest because it's the least-protected and has the highest impact. Your job is to identify it and propose one guardrail.

- "Hop 2: logSet in C++. What's the single line of code that, if buggy, would cause the most damage?"
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

- "What's the cost of this guardrail? Does it add latency, memory, or complexity?"
  - Answer seed: **Latency:** 2 extra method calls (~0.01 ms, negligible). **Memory:** 0 (no new allocations). **Complexity:** 2 extra lines, instantly clear what they do. **False positives:** low (only fires if Set's constructor is genuinely buggy). **Maintenance:** if Set's API changes (e.g., you add a precision field), the check breaks. Worth the cost? Yes, because Set is in the critical path and its bugs would be silent otherwise.

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

- "You log 5 sets. For each one, should you re-compute percentiles, or wait until the user opens PercentilesPage?"
  - Answer seed: **Wait until the user opens PercentilesPage.** Why? Percentiles don't change between sets (the cohort stays the same unless other users log sets, which is outside your app's scope). Re-computing every time is wasted work. If you wanted real-time percentiles across all users, you'd batch-recompute weekly on the backend.

- The *latency budget* is ~16 ms per frame (60 Hz refresh). 
  - logSet to HomePage: 20 ms (already at the edge). 
  - If you add percentile computation: +100 ms (database lookup). 
  - Result: frame drops, jank. Users notice. So percentiles are computed on-demand when you open PercentilesPage, not on every set log.

- "If percentile computation is expensive, why does PercentilesPage call percentileForExercise for every exercise at once?"

### Concept 7: The synthesis — putting it together in a diagram

- "I'm going to show you three parallel flows, all triggered by one logSet call. Draw the boxes and arrows."

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

- "Is it a problem that PercentilesPage shows stale percentiles after you log a new set?"
  - Answer seed: **Not really.** Your percentile only changes if the cohort changes (other users' sets). Since only you're logging locally, your rank relative to the cohort doesn't shift. It's valid to cache the percentiles. If you added backend sync (peer comparison), you'd need to refresh on-demand or batch-refresh.

- "Why is percentile computation expensive, but recentSets is cheap?"

## 4. Cumulative review — rapid-fire

1. User logs a set. Trace: QML onClick → logSet (C++) → 2 signals → QML refresh → recentSets → ListView. Name all 5 hops.
2. What data shape is the set in at each hop? (C++ Set object → QVariantMap → JavaScript object)
3. Why does recentSets() include the computed `volume` field instead of letting QML compute weight×reps?
4. What's the single highest-risk hop, and why?


---

# L23 — Build Tooling: CMake, Expo/EAS, and CI

**Duration:** 2–3 hours (lecture + worked exercises)
**Bloom Levels:** L1 (Recall), L2 (Understand), L3 (Apply), L4 (Analyze), L5 (Evaluate)
**Prerequisites:** L01 (domain model), L10–L15 (Qt/QML), L16–L20 (mobile stack)

---

## Opening Context

Peak Fettle runs **two very different build systems** side by side:

1. **Qt (C++/QML)** — Desktop landing page + set tracker app
   - Built with **CMake**, configured for Qt 6.7+
   - Compiled to native executables
   - Dependency: Qt 6.7, C++17 compiler (MSVC or GCC/Clang)

2. **React Native** — Mobile apps (iOS + Android)
   - Built with **Expo** + **EAS (Expo Application Services)**
   - Compiled to `.ipa` (iOS) and `.apk` (Android) binaries
   - Dependency: Node 20+, Expo CLI

3. **CI/CD Pipeline** — GitHub Actions
   - Runs on every push to `main` or `develop`
   - Lints backend + mobile, runs unit tests
   - Auto-deploys marketing site to Vercel

This lesson explores **why** these build systems exist, **how** they work in practice, and **where they fail**.

---

## Section 1 — Understanding Build Systems

### What Does a Build System Do?

A build system automates the translation of **source code** → **compiled artifacts** (binaries, apps, bundles).

Without a build system, you'd manually:
1. Find all `.cpp` files
2. Invoke the compiler on each, passing header paths, library flags, optimization settings
3. Link the object files together
4. Copy resources (icons, fonts, data) into the output folder
5. Sign/package the result for distribution

A good build system:
- **Declares dependencies** (Qt, POSIX threading, external libraries)
- **Detects your environment** (OS, compiler version, installed packages)
- **Compiles only changed files** (incremental builds)
- **Manages resource bundling** (QML → .qrc → compiled resource)
- **Enforces consistency** (everyone's build uses the same flags)

### Why Peak Fettle Needs Two Builders

**Qt + CMake** for desktop:
- Qt applications are C++ under the hood
- Qt's `moc` preprocessor generates boilerplate from `Q_PROPERTY`, `Q_INVOKABLE` annotations
- CMake's `CMAKE_AUTOMOC` handles this automatically
- Produces a single native executable (no runtime dependency on Qt libraries if statically linked)

**React Native + Expo/EAS** for mobile:
- React Native bundles JavaScript + native modules into an iOS/Android app
- Expo abstracts the native build complexity (Xcode, Gradle)
- EAS provides cloud build servers (iOS builds require a macOS machine; EAS doesn't)
- Produces `.ipa` (iOS) and `.apk` (Android) signed packages ready for app stores

---

## Section 2 — Deep Dive: CMake

### CMake Structure in Peak Fettle

Open `CMakeLists.txt` at the project root:

```cmake
cmake_minimum_required(VERSION 3.21)

project(PeakFettle
    VERSION 0.1.0
    DESCRIPTION "Peak Fettle - Fitness tracking app..."
    LANGUAGES CXX
)

# Standards
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Qt automation
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

# Find Qt 6.7
find_package(Qt6 6.7 REQUIRED COMPONENTS
    Core Gui Qml Quick QuickControls2 Graphs Svg
)

# Define source files
set(PEAK_FETTLE_CPP_SOURCES
    src/main.cpp
    src/set.cpp
    src/exercise.cpp
    src/workouttracker.cpp
    src/usermanager.cpp
    src/UnitPreference.cpp
    src/ExerciseLibrary.cpp
    src/EffortPreference.cpp
    src/UserProfile.cpp
    src/StrengthCurve.cpp
)

# Create executable
qt_add_executable(PeakFettle ${PEAK_FETTLE_CPP_SOURCES} ${PEAK_FETTLE_CPP_HEADERS})

# Bundle QML files + resources
qt_add_qml_module(PeakFettle
    URI PeakFettle
    VERSION 1.0
    QML_FILES
        qml/Main.qml
        qml/LandingPage.qml
        ...
    RESOURCES
        resources/mountain_logo.svg
    IMPORTS QtQuick QtQuick.Controls QtGraphs
)

target_link_libraries(PeakFettle PRIVATE Qt6::Core Qt6::Gui Qt6::Qml Qt6::Quick)
```

### What This Does

**Line 1:** Minimum CMake version (3.21 for modern Qt 6 features).

**Lines 3–7:** Project metadata. CMake doesn't generate the `VERSION` automatically — you can read it with `${PROJECT_VERSION}` in the build but it's mostly for documentation.

**Lines 9–12:** C++ standard enforcement. `CXX_STANDARD 17` means the compiler flag is `-std=c++17` (or `/std:c++17` on MSVC).

**Lines 14–16:** Qt automation.
- `CMAKE_AUTOMOC ON` — CMake runs `moc` (Qt Meta-Object Compiler) on any `.h` file with `Q_OBJECT`, `Q_PROPERTY`, etc.
- `CMAKE_AUTORCC ON` — CMake compiles `.qrc` (resource files) into `.cpp` source
- `CMAKE_AUTOUIC ON` — CMake compiles `.ui` (Qt Designer files) into header files

**Lines 18–27:** `find_package(Qt6 6.7 ...)` locates the Qt installation on your machine. If Qt 6.7 is not installed, CMake fails with a clear error. The `COMPONENTS` list declares which Qt modules your app needs.

**Lines 29–38:** Source file declaration. You **must** list every `.cpp` and `.h` file, or CMake won't know to compile it. (A common mistake: add a new file to the project, forget to add it here, and it doesn't compile.)

**Lines 40–56:** `qt_add_executable()` creates the executable and `qt_add_qml_module()` registers QML files so they're compiled into the binary.

**Line 60:** Link libraries. This tells the linker "connect this executable to Qt's Core, Gui, Qml, and Quick libraries."

### Building Locally

To build the Qt app:

```bash
# Create a build directory (out of source)
mkdir build
cd build

# Configure (CMake generates makefiles or Visual Studio project)
cmake ..

# Build
cmake --build . --config Release

# Run
./PeakFettle   # or ./Release/PeakFettle on Windows
```

### Common Build Errors

**Error: `Qt6 not found`**

CMake can't locate Qt 6. Solution:
```bash
# Tell CMake where Qt is installed
cmake -DQt6_DIR=/path/to/Qt6/lib/cmake/Qt6 ..
# e.g., on macOS: /usr/local/opt/qt6/lib/cmake/Qt6
```

**Error: `Unknown type name 'Q_OBJECT'`**

Probably you added a new `.h` file with `Q_OBJECT` macro but didn't add it to `CMakeLists.txt`'s `PEAK_FETTLE_CPP_HEADERS` list. CMake doesn't know to run `moc` on it.

**Error: `moc.exe not found`**

The build environment is missing the Qt toolchain. On Windows, launch the "Qt Command Prompt" from the Qt Creator Start Center, which sets up PATH to include `moc.exe`.

---

## Section 3 — Deep Dive: Expo and EAS

### What Is Expo?

Expo is a **managed framework** for React Native. Instead of building and configuring iOS and Android projects manually (which involves Xcode, Gradle, signing certificates, provisioning profiles), Expo abstracts this away:

- Write JavaScript + React Native components
- Use Expo APIs (camera, notifications, secure storage)
- EAS build takes your code, compiles it with Expo's managed native modules, produces `.ipa` and `.apk`

### Peak Fettle's Expo Config

**File:** `mobile/app.json`

```json
{
  "expo": {
    "name": "Peak Fettle",
    "slug": "peak-fettle",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "automatic",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#0f172a"
    },
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "com.peakfettle.app",
      "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false
      }
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#0f172a"
      },
      "package": "com.peakfettle.app"
    },
    "plugins": [
      "expo-router",
      "expo-secure-store",
      "expo-notifications"
    ]
  }
}
```

### Key Fields

**`slug`:** URL-safe app identifier. Used by Expo's update service and in app store URLs.

**`icon` / `splash`:** Asset paths. Must be PNG files. If you update these, **you must commit and push to git** — EAS builds fetch from the remote, not your working tree.

**`ios` / `android`:** Platform-specific config.
- `bundleIdentifier` / `package`: Reverse-domain names (e.g., `com.peakfettle.app`). Must be unique across app stores.
- `supportsTablet: false`: iPhone only (not iPad).
- `ITSAppUsesNonExemptEncryption: false`: For App Store compliance (Peak Fettle doesn't use encryption, so answer false).

**`plugins`:** Native modules to include in the build.
- `expo-router`: File-based routing (like Next.js)
- `expo-secure-store`: Encrypted key/value storage (for tokens)
- `expo-notifications`: Push notifications

### EAS Build Config

**File:** `mobile/eas.json`

```json
{
  "cli": {
    "version": ">= 18.13.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {}
  }
}
```

**`cli.version`:** Minimum Expo CLI version required. If you have an older CLI, `eas build` warns you to upgrade.

**`build.development`:** Development builds (local testing, hot reload). Distributed via Expo's internal CDN.

**`build.preview`:** Ad-hoc internal builds (testers, QA). Distributed as `.ipa` / `.apk` files via email or TestFlight link.

**`build.production`:** App Store release builds. `autoIncrement: true` means EAS bumps the version number on each build (1.0.0 → 1.0.1 → 1.0.2).

### Building and Deploying with EAS

To build for internal testing:

```bash
cd mobile

# Requires EAS login (one-time)
eas login

# Build preview .apk for Android
eas build --platform android --profile preview

# Build preview .ipa for iOS (requires Apple ID)
eas build --platform ios --profile preview

# Watch the build in real-time on eas.expo.dev
```

EAS returns a download link to the `.ipa` or `.apk`. Testers install it on their device.

To submit to app stores:

```bash
# Build production .ipa for App Store
eas build --platform ios --profile production

# Submit to App Store (requires App Store Connect credentials)
eas submit --platform ios --latest
```

---

## Section 4 — The Two-Build Problem and OneDrive Corruption

### Why Two Systems Is Painful

**Problem 1: Asset Sync**

Both builds reference the same assets:
- `CMakeLists.txt` refers to `resources/mountain_logo.svg`
- `app.json` refers to `./assets/icon.png`

If you update `icon.png` and forget to git-push, the EAS build (which pulls from GitHub) will either fail with `ENOENT` or build an old version. The Qt app, building locally, has the new icon and works fine. Inconsistency between local and CI builds is hard to debug.

**Problem 2: OneDrive Live-Sync Corruption**

The Peak Fettle repo sits in `…\OneDrive\Documents\Claude\Projects\Peak Fettle`. OneDrive's background sync interferes with git and build artifacts:

- `.git/index` gets truncated mid-write → `bad index file sha1 signature`
- Source files get truncated mid-token, leaving syntax errors
- Qt resource `.qrc` files are modified during build, causing `moc` to fail
- CMake cache becomes corrupted, forcing a clean rebuild

**Documented incident (2026-05-21):** A single sync collision produced:
- 10 source files with truncated tokens (inside strings, comments, object literals)
- Duplicated `StyleSheet.create` blocks with premature `});`
- Comments dropped mid-line, accidentally disabling code after them
- Corrupt `.git` multi-pack-index

### The Real Fix

**Move the repo out of OneDrive** to a non-synced path (e.g., `C:\Users\aavir\dev\Peak Fettle` or `C:\src\peak-fettle`). Use GitHub as the backup.

Mitigation if you must stay on OneDrive:
- Exclude the build directory from sync: Settings → Accounts → Choose folders to sync → uncheck `build/`
- Exclude node_modules: Settings → uncheck `*/node_modules/`
- Exclude `.git`: Settings → uncheck `.git/`

But the real solution is to move the repo.

---

## Section 5 — GitHub Actions CI Pipeline

### Overview

Every push to `main` or `develop` triggers a GitHub Actions workflow. The workflow runs three jobs:

1. **Backend** (peak-fettle-agents/server) — Lint + unit tests
2. **Marketing** (marketing-site) — Lint + production build
3. **Deploy** (Vercel) — Auto-deploy marketing site to production

(Mobile builds are **not** automated on every push; they're triggered manually via EAS CLI.)

### The Backend Job

```yaml
jobs:
  backend:
    name: "Backend — lint & test"
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: peak-fettle-agents/server

    env:
      NODE_ENV:   test
      JWT_SECRET: ${{ secrets.CI_JWT_SECRET || 'ci-only-secret-not-production' }}
      WEB_ORIGIN: http://localhost:3000

    steps:
      - uses: actions/checkout@v4

      - name: Set up Node 20
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: peak-fettle-agents/server/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Unit tests
        run: npm test
```

**`runs-on: ubuntu-latest`:** The runner is a clean Ubuntu container. No local state. Exactly reproducible.

**`env.JWT_SECRET`:** The test suite sets this to a dummy value. In CI, no real Supabase connection is made — tests mock the database.

**`npm ci`:** "Clean install" — installs exact versions from `package-lock.json` (not `npm install`, which might upgrade).

**`npm run lint`:** Runs ESLint. If linting fails, the job fails and the PR can't merge.

**`npm test`:** Runs Jest. Tests for `requireAuth` middleware (verify JWT, reject refresh tokens) and `/health` endpoint.

### The Health Check Test

From `server/__tests__/health.test.js`:

```javascript
describe('GET /health', () => {
    it('returns HTTP 200 with { ok: true, ts: <number> }', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(typeof res.body.ts).toBe('number');
    });

    it('does not require a JWT', async () => {
        const res = await request(app).get('/health');
        expect(res.status).not.toBe(401);
    });
});
```

This test:
1. Starts the server
2. Makes an HTTP GET request to `/health`
3. Asserts the response is 200 and has the correct shape
4. Asserts no JWT is required

If this test fails, the build fails. If you break the health endpoint, CI catches it immediately.

### The requireAuth Test

From `server/__tests__/requireAuth.test.js`:

```javascript
it('returns 401 refresh_token_not_accepted when a refresh token is presented (T-01)', () => {
    const refreshToken = jwt.sign(
        { sub: 'user-abc', type: 'refresh' },
        SECRET,
        { expiresIn: '30d' }
    );
    const req = mockReq(refreshToken);
    const res = mockRes();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'refresh_token_not_accepted' });
    expect(next).not.toHaveBeenCalled();
});
```

This test **specifically guards against a security regression** (T-01 in the feedback report). It ensures:
- A refresh token (valid JWT but with `type: 'refresh'`) is rejected when presented as an access token
- The middleware returns 401, not 200

If someone accidentally removes the refresh-token check from the middleware, **this test fails and CI blocks the merge**.

---

## Section 6 — Advanced Scenario: Multi-File Corruption Recovery

### Scenario

You pull the latest code from GitHub. CMake fails with:

```
error: /path/to/peak-fettle/src/set.cpp:10: expected initializer before 'Set'
```

You open `set.cpp` and see:

```cpp
#include "set.h"

// E-001: RIR clamp between [-1, 10]
class Set {  // <-- syntax error here, but the code looks fine
  ...
```

**What happened:** OneDrive truncated the file mid-token. The actual file is corrupted mid-comment or mid-string above the `class` keyword, but the truncation is not visible in the text editor (it's before the line you're looking at).

### Recovery Steps

**Step 1: Verify the file is corrupted**

```bash
# Check byte count
wc -c src/set.cpp

# Expected (from GitHub): ~850 bytes
# Actual (corrupted): ~200 bytes
```

**Step 2: Restore from git**

```bash
# Fetch the committed version
git show HEAD:src/set.cpp > src/set.cpp

# Verify it compiles
cmake --build build
```

**Step 3: If the committed version is also corrupt**

If the file was corrupted at commit time (rare but possible):

```bash
# Find the last good commit
git log --oneline src/set.cpp | head -20

# Check out the older version
git show <commit-hash>:src/set.cpp > src/set.cpp
```

**Step 4: Full codebase parse sweep**

CMake stops at the first error and hides the rest. If one file is corrupt, others might be too:

```bash
# In the build directory
cmake --debug-output .. 2>&1 | grep error

# Manually check all .cpp and .h files
for file in src/*.cpp src/*.h qml/*.qml; do
    if ! head -c 1 "$file" &>/dev/null; then
        echo "CORRUPTED: $file (empty or unreadable)"
    fi
done
```

---

## Section 7 — Worked Examples

### Example 1: Adding a New Qt Class

You want to add a new `ProgressCalculator` class to the Qt app.

**Files created:**
- `src/ProgressCalculator.h`
- `src/ProgressCalculator.cpp`

**Mistake:** You update the source code but forget to update `CMakeLists.txt`.

**Build fails:**

```
error: undefined reference to `ProgressCalculator::compute(int)'
```

**Why:** CMake didn't know to compile `ProgressCalculator.cpp`. It's not in `PEAK_FETTLE_CPP_SOURCES`.

**Fix:**

Edit `CMakeLists.txt`:

```cmake
set(PEAK_FETTLE_CPP_SOURCES
    src/main.cpp
    src/set.cpp
    src/exercise.cpp
    src/workouttracker.cpp
    src/usermanager.cpp
    src/UnitPreference.cpp
    src/ExerciseLibrary.cpp
    src/EffortPreference.cpp
    src/UserProfile.cpp
    src/StrengthCurve.cpp
    src/ProgressCalculator.cpp   # <-- ADD THIS
)

set(PEAK_FETTLE_CPP_HEADERS
    src/set.h
    src/exercise.h
    src/workouttracker.h
    src/usermanager.h
    src/UnitPreference.h
    src/ExerciseLibrary.h
    src/EffortPreference.h
    src/UserProfile.h
    src/StrengthCurve.h
    src/ProgressCalculator.h     # <-- ADD THIS
)
```

Then rebuild:

```bash
cmake --build build
```

**Lesson:** CMake requires explicit file lists. It does not auto-discover files.

### Example 2: Updating App Icons Without Breaking EAS Builds

You redesign the Peak Fettle icon. New file: `mobile/assets/icon.png` (1024x1024 PNG).

You update `app.json` and test locally with `expo start`. Works great.

You push to GitHub. EAS build is triggered. **Build fails:**

```
error: withIosDangerousBaseMod: ENOENT './assets/icon.png'
```

**Why:** Your local build picks up the new icon from your working directory. EAS pulls from GitHub, but you forgot to git-add and push the file.

**`git status`:**

```
modified:   mobile/app.json
?? mobile/assets/icon.png  <-- untracked!
```

**Fix:**

```bash
cd mobile
git add assets/icon.png app.json
git commit -m "Update Peak Fettle app icon"
git push
```

Now EAS has the icon and the build succeeds.

**Lesson:** EAS builds from the remote, not your working tree. Always verify `git status` shows no untracked asset files before pushing.

### Example 3: Debugging a CI Lint Failure

Your colleague pushes code. GitHub Actions runs and the backend lint job fails:

```
error: Unexpected var statement [no-var]
```

Your colleague says: "It works on my machine!"

They probably have an older ESLint config or a node_modules version mismatch.

**Why CI caught it:** The CI job runs `npm ci`, which installs exact versions from `package-lock.json`. Everyone's CI environment is identical. Your colleague's local node_modules might be outdated.

**Fix:**

```bash
cd peak-fettle-agents/server

# Update your local deps to match CI
npm ci

# Re-run linting
npm run lint

# It now fails locally, matching CI

# Fix the error (don't use var)
# Then run lint again to confirm
npm run lint
```

Then commit and push. CI will pass.

**Lesson:** Always run `npm ci` (not `npm install`) locally to match CI's environment exactly.

---

## Section 8 — Build System Antipatterns

### Antipattern 1: Hardcoding Paths

**Bad:**

```cmake
target_link_directories(/Users/alice/Qt/6.7/lib)
```

This works only on Alice's machine. Everyone else's build fails.

**Good:**

```cmake
find_package(Qt6 6.7 REQUIRED COMPONENTS Core Gui)
target_link_libraries(PeakFettle PRIVATE Qt6::Core Qt6::Gui)
```

`find_package` auto-discovers Qt using the system's package manager or `PATH`.

### Antipattern 2: Mixing Build Outputs

**Bad:**

```bash
# Build in the source directory
cd peak-fettle-agents/server
npm run build
npm test
```

This leaves build artifacts (`node_modules`, `.next`, `dist`) mixed with source. Cleaning is messy. Committing artifacts is easy to forget.

**Good:**

```bash
# Build in a separate directory
mkdir build
cd build
npm --prefix ../peak-fettle-agents/server run build
```

Source tree stays clean. Deleting `build/` fully resets everything.

### Antipattern 3: Environment Secrets in Git

**Bad:**

```bash
# In CI config file (committed to git)
env:
  API_KEY: sk-1234567890abcdef
```

Anyone with repo access has the production API key.

**Good:**

```bash
# In GitHub Settings → Secrets → Actions
# Define API_KEY there; don't commit it
env:
  API_KEY: ${{ secrets.API_KEY }}
```

GitHub provides the secret at runtime. It's never in git.

Peak Fettle does this correctly:

```yaml
env:
  JWT_SECRET: ${{ secrets.CI_JWT_SECRET || 'ci-only-secret-not-production' }}
```

The `|| 'ci-only-secret...'` fallback ensures the job doesn't fail if the secret is not set (though it should be, in production CI).

---

## Summary and Key Takeaways

1. **CMake** automates C++ compilation for the Qt desktop app. You must list all source files explicitly.

2. **Expo/EAS** abstracts iOS/Android build complexity. Cloud build means you don't need macOS hardware to build iOS apps.

3. **GitHub Actions CI** runs on every push, catching lint and test failures before they reach users.

4. **OneDrive corruption** is a real risk. The solution is to move the repo to a non-synced path, not to patch around it.

5. **Assets are tricky:** EAS pulls from GitHub (the remote), not your working tree. Always commit and push asset changes.

6. **Mocking in tests** keeps CI fast but misses some real-world bugs. Consider integration tests (against real DB) on a schedule.

7. **Explicit over implicit:** CMake requires you to list files. GitHub Actions requires you to commit asset changes. No magic — it's safe and reproducible.

---

## Further Reading

- [CMake Documentation](https://cmake.org/documentation/) — full reference
- [Qt 6 Build System](https://doc.qt.io/qt-6/cmake-manual.html) — Qt-specific CMake features
- [Expo Build Documentation](https://docs.expo.dev/build/setup/) — cloud build setup
- [GitHub Actions Workflow Syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions) — CI config reference
- [Peak Fettle CLAUDE.md](../CLAUDE.md) — project-specific build notes and OneDrive mitigation

---

**Next Lesson:** L24 — Testing & Feedback Loop. How unit tests, integration tests, and persona-based beta feedback feed the development roadmap.


---

# L24 — Testing & the Feedback Loop

**Duration:** 3–4 hours (lecture + case studies + design exercises)
**Bloom Levels:** L1 (Recall), L2 (Understand), L3 (Apply), L4 (Analyze), L5 (Evaluate)
**Prerequisites:** L23 (build tooling), L10–L20 (all layers of the stack)

---

## Opening Context

Testing is the **safety net** between your code and your users. Peak Fettle uses a multi-layer testing strategy:

1. **Unit tests** (Jest) — Fast, isolated tests of individual functions (middleware, routes)
2. **Integration tests** (manual, not yet automated) — Real database, real API calls
3. **Persona-based beta feedback** — Six target personas (Marcus, Priya, Derek, Jasmine, Linda, Tyler) test the app end-to-end
4. **Automated code review** — Static analysis, linting, type checking

Together, these layers catch bugs that each layer misses alone. This lesson explores **what to test**, **how mocking can mask real bugs**, and **how to design for testability**.

---

## Section 1 — The Testing Pyramid

### Concept

The testing pyramid has three layers:

```
         ╔════════════════════╗
         ║     Manual/E2E     ║  Few tests, slow, catch real-world issues
         ║  (personas beta)   ║
         ╠════════════════════╣
         ║    Integration     ║  Some tests, medium speed, real DB/API
         ║   (not automated)  ║
         ╠════════════════════╣
         ║      Unit Tests    ║  Many tests, fast, isolated, mocked
         ║   (Jest on CI)     ║
         ╚════════════════════╝
```

**Rule of thumb:**
- Unit tests: 70% (cheap to write and run)
- Integration tests: 20% (catch layer-interactions)
- End-to-end / beta: 10% (expensive but catch the real world)

Peak Fettle currently has:
- Unit tests: ✓ (health.test.js, requireAuth.test.js, CI runs on every push)
- Integration tests: ✗ (none automated; would require live Supabase)
- Beta testing: ✓ (six personas, weekly feedback reports)

---

## Section 2 — Unit Tests: What to Test and How

### Example 1: Health Check Test

**File:** `peak-fettle-agents/server/__tests__/health.test.js`

```javascript
'use strict';

process.env.JWT_SECRET  = 'ci-test-secret-do-not-use-in-prod';
process.env.WEB_ORIGIN  = 'http://localhost:3000';
process.env.NODE_ENV    = 'test';

// Mock the database pool so no live Supabase connection is required
jest.mock('../db', () => ({
    pool: {
        query: jest.fn().mockResolvedValue({ rows: [] }),
    },
}));

const request = require('supertest');
const app     = require('../index');

describe('GET /health', () => {
    it('returns HTTP 200 with { ok: true, ts: <number> }', async () => {
        const res = await request(app).get('/health');

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(typeof res.body.ts).toBe('number');
    });

    it('does not require a JWT', async () => {
        const res = await request(app).get('/health');
        expect(res.status).not.toBe(401);
    });
});
```

#### What This Tests

The `/health` endpoint is a **smoke test** — it verifies the server is alive and responding. It's designed to be called by:
- Load balancers (to detect if the server is down)
- Uptime monitors (PagerDuty, Grafana)
- Kubernetes liveness probes

#### Why Mocking?

The test mocks the database using `jest.mock('../db', ...)`. This means:

**Pro:** The test doesn't need a real Supabase connection. It runs in milliseconds. No credentials needed in CI.

**Con:** If the database driver is broken, this test won't catch it. It only tests the HTTP handler, not the driver.

#### Coverage

This test covers:
- HTTP status code (200, not 500)
- Response shape (JSON with `ok` and `ts` fields)
- Authorization (no JWT required)

It does **not** cover:
- Database connectivity (mocked away)
- Real timestamp accuracy (not important for health)

### Example 2: Authentication Middleware Test (T-01)

**File:** `peak-fettle-agents/server/__tests__/requireAuth.test.js`

```javascript
'use strict';

process.env.JWT_SECRET = 'ci-test-secret-do-not-use-in-prod';

const jwt           = require('jsonwebtoken');
const { requireAuth } = require('../middleware/requireAuth');

const SECRET = process.env.JWT_SECRET;

function mockRes() {
    const res = {};
    res.status = jest.fn(() => res);
    res.json   = jest.fn(() => res);
    return res;
}

function mockReq(token) {
    return { headers: { authorization: token ? `Bearer ${token}` : '' } };
}

describe('requireAuth middleware', () => {
    let next;

    beforeEach(() => { next = jest.fn(); });

    // Happy path: valid access token
    it('calls next() and attaches req.user for a valid access token', () => {
        const token = jwt.sign(
            { sub: 'user-abc', email: 'alice@example.com' },
            SECRET,
            { expiresIn: '15m' }
        );
        const req = mockReq(token);
        const res = mockRes();

        requireAuth(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.user).toEqual({ id: 'user-abc', email: 'alice@example.com' });
        expect(res.status).not.toHaveBeenCalled();
    });

    // Error case: missing token
    it('returns 401 missing_token when Authorization header is absent', () => {
        const req = { headers: {} };
        const res = mockRes();

        requireAuth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'missing_token' });
        expect(next).not.toHaveBeenCalled();
    });

    // Error case: refresh token used as access token (T-01)
    it('returns 401 refresh_token_not_accepted when a refresh token is presented (T-01)', () => {
        const refreshToken = jwt.sign(
            { sub: 'user-abc', type: 'refresh' },
            SECRET,
            { expiresIn: '30d' }
        );
        const req = mockReq(refreshToken);
        const res = mockRes();

        requireAuth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'refresh_token_not_accepted' });
        expect(next).not.toHaveBeenCalled();
    });
});
```

#### What This Tests

The `requireAuth` middleware is the **gatekeeper** for protected endpoints. It:
1. Extracts the JWT from the `Authorization: Bearer <token>` header
2. Verifies the signature using `JWT_SECRET`
3. Checks the token is not expired
4. **Rejects refresh tokens** (T-01 regression guard)
5. Attaches `req.user` to the request if valid

#### Key Test: T-01 (Refresh Token Rejection)

The T-01 test is **critical for security**. It verifies that if an attacker obtains a refresh token (which lives 30 days), they **cannot** use it as an access token to call protected endpoints.

If this test didn't exist and someone accidentally removed the refresh-token check:

```javascript
// UNSAFE: no refresh token check
const decoded = jwt.verify(token, SECRET);
req.user = decoded;
next();
```

An attacker with a refresh token could bypass this middleware entirely.

**With the test:** CI fails, the merge is blocked, the vulnerability is caught.

#### Mocking Helpers

The test uses **mock functions** to simulate Express request/response:

```javascript
function mockRes() {
    const res = {};
    res.status = jest.fn(() => res);  // Chainable: res.status(401).json({...})
    res.json   = jest.fn(() => res);
    return res;
}
```

This simulates the Express Response object. Tests don't need a real HTTP connection.

### Test Design Principles for Unit Tests

**1. Test one thing per test**

Good:
```javascript
it('rejects expired tokens with 401', () => { ... });
it('rejects invalid signatures with 401', () => { ... });
```

Bad:
```javascript
it('handles tokens', () => {
    // Tests expired, invalid signature, missing header — all in one test
    // When it fails, you don't know which case broke
});
```

**2. Use descriptive test names**

Good:
```javascript
it('returns 401 refresh_token_not_accepted when a refresh token is presented (T-01)')
```

Bad:
```javascript
it('test 5')
```

**3. Test error paths, not just happy paths**

Peak Fettle's tests cover:
- Valid token (happy path)
- Missing token (error)
- Invalid signature (error)
- Expired token (error)
- Wrong token type (error)

**4. Isolate external dependencies with mocks**

```javascript
jest.mock('../db', () => ({
    pool: {
        query: jest.fn().mockResolvedValue({ rows: [] }),
    },
}));
```

This replaces the real database driver with a mock. Tests don't hit Supabase.

---

## Section 3 — Integration Testing and the Mocking Liability

### The Problem: Mocks Hide Bugs

Unit tests mock external dependencies (database, HTTP APIs). But **mocks are lies** — they simulate ideal behavior. In the real world:

- Database queries are **slow** and **might fail**
- Network timeouts **happen**
- Race conditions **arise** under load
- Schema validation **is strict**

### Example: The Percentile Batch Job (N-07)

From the feedback report (pf-tester-feedback-2026-05-02.md):

```markdown
### N-07 — MEDIUM: `compute_percentile_batch` references undefined view `v_user_lift_inputs`

The batch job references a view that doesn't exist in the database.

**Impact:** If the weekly batch cron calls `compute_percentile_batch()`, it fails immediately.
```

**Why a unit test would miss this:**

```javascript
// Unit test (using mocked database)
it('compute_percentile_batch calculates percentiles', async () => {
    const mockDb = {
        query: jest.fn().mockResolvedValue({ rows: [{ user_id: '1', lift: 'bench', e1rm: 100 }] }),
    };
    
    const result = await computePercentileBatch(mockDb);
    expect(result).toBe(true);  // ✓ Test passes!
});
```

The mock returns fake data. The test never discovers that `v_user_lift_inputs` doesn't exist.

**Why an integration test would catch it:**

```javascript
// Integration test (against real Supabase)
it('compute_percentile_batch runs against real schema', async () => {
    const realDb = await supabase.db.connect();
    
    const result = await computePercentileBatch(realDb);
    expect(result).toBe(true);  // ✗ Fails! relation "v_user_lift_inputs" does not exist
});
```

Against the real database, the SQL query fails because the view is missing.

### When Mocks Are Liabilities vs. Assets

**Mocks are Assets when:**
- Testing **logic**, not I/O (e.g., business calculations)
- The external system is **expensive** (calling a paid API for every test)
- The external system is **unavailable** in CI (e.g., hardware sensors)
- You want **fast**, **deterministic** tests

**Mocks are Liabilities when:**
- Testing **integration** between layers (e.g., API → database)
- The **schema** or **contract** is important (e.g., a field was renamed)
- **Failure modes** are different in reality (e.g., network timeouts)

### Recommended Testing Strategy for Peak Fettle

**Unit tests (run on every push, CI):**
- Middleware logic (JWT validation, error handling)
- Business calculations (percentile formulas, E1RM estimates)
- Input validation
- **Mocks are fine here.** Tests run in milliseconds.

**Integration tests (run weekly or pre-production):**
- Full request → middleware → route → database → response
- Use a **test instance** of Supabase (separate from production)
- Verify schema, indexes, triggers are correct
- Test error cases (database constraints violated, query timeouts)

**Example integration test structure:**

```javascript
// integrationTests/percentile.test.js
describe('Percentile Batch (against real DB)', () => {
    let testDb;

    beforeAll(async () => {
        // Connect to staging Supabase instance
        testDb = await createStagingDatabaseConnection();
        // Seed test data
        await seedTestData(testDb);
    });

    afterAll(async () => {
        // Clean up test data
        await testDb.disconnect();
    });

    it('compute_percentile_batch completes without errors', async () => {
        // Call the real batch function against real (test) database
        const result = await computePercentileBatch(testDb);
        expect(result.success).toBe(true);
        expect(result.updatedRows).toBeGreaterThan(0);
    });

    it('percentile batch creates lift_percentiles entries', async () => {
        const percentiles = await testDb.query(
            'SELECT * FROM lift_percentiles WHERE percentile >= 50'
        );
        expect(percentiles.rows.length).toBeGreaterThan(0);
    });
});
```

---

## Section 4 — Persona-Based Beta Testing

### The Six Testing Personas

Peak Fettle uses six fictional personas to represent the user base:

1. **Marcus Webb** (28, competitive powerlifter)
   - Tests advanced features: E1RM tracking, percentile rankings
   - Looks for precision in weight entry, trend lines
   - **Will catch:** E1RM formula inflation (N-03), missing features

2. **Priya Nair** (26, natural bodybuilder)
   - Tests volume tracking, exercise substitutions
   - Cares about clean UI, muscle group progress
   - **Will catch:** UI clutter, missing exercise variants

3. **Derek Okafor** (38, beginner returning to fitness)
   - Tests onboarding, simple language
   - Wants streaks, not overwhelmed by jargon
   - **Will catch:** Confusing terminology, poor onboarding

4. **Jasmine Cole** (21, athletic performance)
   - Tests fast UI, cardio + lifting mixed sessions
   - Expects smooth animations, quick logging
   - **Will catch:** Performance lags, slow UI transitions

5. **Linda Marsh** (54, beginner returning after gap)
   - Tests accessibility, encouragement, not intimidation
   - Needs explanations of terms
   - **Will catch:** Jargon-heavy copy, lack of guidance

6. **Tyler Broussard** (19, beginner self-taught from YouTube)
   - Tests social proof, quick onboarding
   - Wants percentile rankings, motivates him
   - **Will catch:** Confusing first-time UX, slow setup

### How Beta Feedback Feeds the Roadmap

**Weekly cycle:**

1. **Monday–Friday:** Testers use the app, log issues (specific observations, not diagnoses)
2. **Friday EOD:** Manual test report generated (e.g., `pf-tester-feedback-2026-05-02.md`)
3. **Report contains:**
   - Status of prior issues (open/closed/new)
   - New bugs found (severity-ranked)
   - Test coverage notes
   - Executive brief for leadership
4. **Monday:** Dev team triages, assigns to sprints

### Example: Issue N-01 (EditSetDialog SpinBoxes Regression)

From feedback report 2026-05-02:

```markdown
### N-01 — HIGH: EditSetDialog (TICKET-004) still uses SpinBoxes for date/time
**File:** qml/EditSetDialog.qml
**Category:** Qt/QML — UI regression

SetTrackerPage.qml explicitly replaced SpinBoxes with text fields for date/time entry, 
with a code comment noting: "SpinBox UI eat the value between - and + on phones." 
That fix only went into the log form. The brand-new EditSetDialog.qml (TICKET-004) 
uses SpinBox for all five date/time fields. Any tester on a narrow screen will see 
the value disappear between the - and + buttons.

**Fix:** Apply the same text-field approach used on SetTrackerPage.
```

**Impact:** This issue was found because a tester (Jasmine, who cares about mobile UX) tested the new EditSetDialog on a phone and immediately spotted the regression.

If we'd only had unit tests, we'd never catch this — it's a UI issue visible only on-device.

### Handling Conflicting Persona Feedback

Personas sometimes want opposite things:

**Example:**

- **Marcus** (powerlifter) wants percentile rankings always visible
- **Linda** (beginner) finds percentile rankings intimidating and wants to hide them

**Solution:** A **settings toggle**.

```qml
// SettingsPage.qml
Switch {
    text: "Show percentile rankings"
    checked: showPercentiles
    onCheckedChanged: userPreferences.setShowPercentiles(checked)
}
```

Both personas are happy: Marcus enables it, Linda disables it.

---

## Section 5 — Worked Examples: Designing Tests for Each Layer

### Layer 1: Qt/QML — Unit Testing at the View Layer

**Problem:** How do you test QML without rendering it on screen?

**Answer:** Test the **data model** (the C++ backend), not the QML view.

```cpp
// test/test_set.cpp
#include <gtest/gtest.h>
#include "src/set.h"

class SetTest : public ::testing::Test {};

TEST_F(SetTest, RirClampsBetweenMinusOneAndTen) {
    Set s("Bench Press", 100.0, 5);
    
    s.setRir(99);  // Try to set out-of-range value
    EXPECT_EQ(s.rir(), 10);  // Should be clamped to 10
    
    s.setRir(-99);  // Try negative
    EXPECT_EQ(s.rir(), -1);  // Should be clamped to -1
}

TEST_F(SetTest, ConstructorClampsRir) {
    // This test ensures N-02 doesn't regress
    Set s("Bench Press", 100.0, 5, 99, QDateTime::currentDateTime());
    EXPECT_EQ(s.rir(), 10);  // Constructor should clamp, not accept 99
}

TEST_F(SetTest, E1rmFormula) {
    Set s1("Bench Press", 100.0, 10);
    EXPECT_NEAR(s1.estimatedOneRM(), 133.33, 0.1);
    
    // N-03: Single-rep max should not be inflated
    Set s2("Bench Press", 200.0, 1);
    EXPECT_NEAR(s2.estimatedOneRM(), 200.0, 0.1);  // Not 206.7
}
```

**Key insight:** Test the **business logic** (E1RM calculation, RIR clamping), not the UI (button clicks, animations). The logic is stable and fast. UI testing requires rendered widgets or screenshot comparisons, which are slow.

### Layer 2: Express Routes — Unit Tests with Mocks

**Problem:** Test the `/sets` route without hitting Supabase.

**Pattern:**

```javascript
// __tests__/sets.test.js
'use strict';

process.env.JWT_SECRET = 'test-secret';
process.env.WEB_ORIGIN = 'http://localhost:3000';

// Mock the database pool
jest.mock('../db', () => ({
    pool: {
        query: jest.fn(),
    },
}));

const request = require('supertest');
const app = require('../index');
const { pool } = require('../db');

describe('POST /sets', () => {
    const validToken = jwt.sign(
        { sub: 'user-123' },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
    );

    it('creates a set for authenticated user', async () => {
        // Mock the database to return success
        pool.query.mockResolvedValue({ rows: [{ id: 'set-1' }] });

        const res = await request(app)
            .post('/sets')
            .set('Authorization', `Bearer ${validToken}`)
            .send({
                workout_id: 'workout-1',
                exercise: 'Bench Press',
                weight_kg: 100,
                reps: 5,
                rir: 2,
            });

        expect(res.status).toBe(201);
        expect(res.body.id).toBe('set-1');
        
        // Verify the route called the database
        expect(pool.query).toHaveBeenCalled();
    });

    it('returns 401 without valid JWT', async () => {
        const res = await request(app)
            .post('/sets')
            .send({ /* set data */ });

        expect(res.status).toBe(401);
    });

    it('returns 403 if user does not own the workout (T-03)', async () => {
        // Mock: database returns no rows (user doesn't own this workout)
        pool.query.mockResolvedValue({ rows: [] });

        const res = await request(app)
            .post('/sets')
            .set('Authorization', `Bearer ${validToken}`)
            .send({
                workout_id: 'someone-elses-workout',
                exercise: 'Bench Press',
                weight_kg: 100,
                reps: 5,
                rir: 2,
            });

        expect(res.status).toBe(403);
        expect(res.body.error).toBe('workout_not_found_or_not_owned');
    });
});
```

**Key insight:** Mock the database to simulate both success and error cases. Test that the route enforces ownership checks (T-03). Test error handling, not just happy paths.

### Layer 3: Database Schema — Integration Tests

**Problem:** The schema defines constraints that code might violate. How do you test it?

**Answer:** Write integration tests that hit the real schema:

```javascript
// integrationTests/schema.test.js
const supabase = require('@supabase/supabase-js').createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

describe('Database Schema', () => {
    beforeEach(async () => {
        // Clear test data
        await supabase.from('sets').delete().neq('id', null);
    });

    it('exercises.name column has max length enforcement', async () => {
        // Try to insert a name longer than expected
        const longName = 'A'.repeat(1001);  // Assume max is 1000

        const { error } = await supabase
            .from('exercises')
            .insert({ name: longName, category: 'chest' });

        expect(error).toBeTruthy();  // Should fail
        expect(error.message).toContain('violates check constraint');
    });

    it('lift_vectors table exists with expected columns', async () => {
        const { data, error } = await supabase
            .rpc('_get_table_columns', { table_name: 'lift_vectors' });

        expect(error).toBeFalsy();
        expect(data.map(col => col.name)).toContain('lift_name');
        expect(data.map(col => col.name)).toContain('p50');
        expect(data.map(col => col.name)).toContain('p95');
    });

    it('pg_trgm extension is installed (for fuzzy search index)', async () => {
        const { data } = await supabase.rpc('_get_installed_extensions');
        expect(data.map(ext => ext.extname)).toContain('pg_trgm');
    });

    it('compute_percentile_batch function references existing view', async () => {
        // Try to call the batch job
        const { error } = await supabase.rpc('compute_percentile_batch');
        
        // Should not fail with "relation does not exist"
        if (error) {
            expect(error.message).not.toContain('does not exist');
        }
    });
});
```

**Key insight:** Integration tests verify the database actually works as expected. They catch schema issues (missing views, broken constraints) that unit tests miss.

---

## Section 6 — The Mock-Removal Sprint

### Concept

A **mock-removal sprint** is a focused effort to identify which mocks are hiding real bugs.

**Process:**

1. Take a unit test that mocks the database
2. Replace the mock with a real database call
3. Run the test — if it fails, you've found a bug that mocks hid
4. Fix the code or the test
5. Decide: keep the real database call (integration test) or restore the mock (unit test)?

### Example: The Health Check Test

**Current unit test (with mock):**

```javascript
jest.mock('../db', () => ({
    pool: {
        query: jest.fn().mockResolvedValue({ rows: [] }),
    },
}));

it('returns HTTP 200 with { ok: true, ts: <number> }', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
});
```

**Convert to integration test (no mock):**

```javascript
// Don't mock the database
// It requires actual Supabase credentials

it('returns HTTP 200 with { ok: true, ts: <number> }', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
});

// This test now requires:
// - Supabase instance running
// - SUPABASE_URL and SUPABASE_KEY set
// - ~100ms to run (not 1ms)
```

**Decision:** For the health check, keep the mock. The test is fast and doesn't need a real database. The `/health` endpoint doesn't even touch the database in a meaningful way.

### Example: The Percentile Batch Job

**Current (doesn't exist):**

```javascript
jest.mock('../db', () => ({
    pool: {
        query: jest.fn().mockResolvedValue({ rows: [...] }),
    },
}));

// This test "passes" but the real job fails because v_user_lift_inputs doesn't exist
```

**Mock-removal result:**

Run against real Supabase:

```
Error: relation "v_user_lift_inputs" does not exist
```

**Decision:** This must be an integration test (no mock), and it must be run regularly (weekly CI). The batch job is too complex to test with mocks.

---

## Summary and Key Takeaways

1. **Unit tests** (Jest, mocked) are fast and run in CI. Catch logic bugs, but not schema/integration issues.

2. **Integration tests** (real database) are slower but catch schema bugs, constraint violations, missing indexes. Run on schedule (weekly), not every push.

3. **Beta testing** (personas) catches UX issues, real-world flows, and credibility issues (E1RM inflation) that code tests miss.

4. **Mocks are tools, not solutions.** They're great for speed (CI every push) but hide real bugs (missing views, schema changes). Use mocks for unit tests, but validate against real systems in integration tests.

5. **Design tests for testability:** Separate business logic (test this!) from I/O (mock this for unit tests, hit real for integration tests).

6. **T-01 (refresh token rejection)** is an example of a critical security test that **must** exist and **must** not regress. Without it, CI blindly merges code that introduces a 30-day authentication bypass.

7. **The mock-removal sprint** is a useful exercise: take a test, remove the mocks, and see if it still passes. If it fails, you've found a real bug.

8. **Multiple feedback loops:** Unit tests (2 min), beta reports (weekly), integration tests (weekly pre-deploy). Together, they catch bugs at different stages.

---

## Further Reading

- [Jest Documentation](https://jestjs.io/) — unit testing framework
- [Testing Library](https://testing-library.com/) — testing best practices
- [Database Integration Testing](https://martinfowler.com/bliki/IntegrationTest.html) — when and how
- Peak Fettle `pf-tester-feedback-*.md` files — real feedback examples
- Peak Fettle `testing-team/personas.md` — detailed persona specifications

---

**Next Lesson:** L25 — Capstone. Synthesis of all 24 lessons: evaluate Peak Fettle's architecture and design a non-trivial feature end-to-end.


---

# L25 — Capstone: Architecture Evaluation & Feature Design

**Duration:** 4–5 hours (pure Bloom L4–L6; no new source code)
**Bloom Levels:** L4 (Analyze), L5 (Evaluate), L6 (Create/Synthesize)
**Prerequisites:** All prior 24 lessons

---

## Opening Context

This capstone has **no new source code to learn**. Instead, you will:

1. **Evaluate** Peak Fettle's major architectural decisions holistically
2. **Defend or challenge** each choice against tradeoffs
3. **Design** a non-trivial feature from scratch, end-to-end
4. **Justify** every layer choice (database, API, mobile/desktop UI, deployment)

This lesson tests whether you can see the **whole system** — not just one rung of the stack, but how all 24 prior lessons interconnect.

---

## Section 1 — Architecture Evaluation Framework

### Dimensions of Evaluation

When evaluating an architecture, consider:

1. **Correctness** — Does it solve the stated problem?
2. **Maintainability** — Can a new dev understand and modify it?
3. **Scalability** — Does it handle 10x users? 100x?
4. **Cost** — What are the operational expenses?
5. **Tradeoffs** — What did we gain? What did we sacrifice?
6. **Risk** — What could go wrong? What's the mitigation?

### Architectural Layers to Evaluate

Peak Fettle's architecture consists of:

| Layer | Tech | Decision | Tradeoff |
|-------|------|----------|----------|
| **Database** | Supabase (Postgres + auto-scale) | Managed PostgreSQL + RLS + real-time | Cost: $25–200/mo; vendor lock-in |
| **Backend** | Express.js + Node.js | Lightweight HTTP API | Not a monolith; overhead if scaled to 100+ endpoints |
| **Percentiles** | Batch SQL (weekly) | Offline computation, not real-time | Stale data (1 week old); trade latency for cost |
| **Desktop** | Qt 6 (C++/QML) | Native app, offline-first | Maintenance burden of two frontends; Windows/Mac/Linux fragmentation |
| **Mobile** | React Native + Expo | Write-once, deploy to iOS/Android | Less performant than native; dependency on Expo (vendor lock-in) |
| **AI** | Claude Haiku (cost optimization) | Cheap, fast inference | Not reasoning-heavy; limits feature complexity |
| **Language** | Haiku for backend logic, humans for strategy | Humans -> Agents -> Humans feedback loop | Slow iteration; requires careful prompting |

---

## Section 2 — Deep Evaluation: Database (Supabase)

### The Choice: Supabase (Managed Postgres)

**Alternatives considered:**

1. **Firebase (NoSQL)** — Easy setup, automatic scaling, real-time
2. **Self-hosted PostgreSQL** — Full control, no vendor lock-in
3. **Supabase** — Postgres + managed infra + RLS + real-time (chosen)

### Evaluation: Why Supabase Is Correct

**Correctness:**
- Postgres supports the complex queries Peak Fettle needs (percentile calculations, group aggregations, RLS).
- Firebase's NoSQL model would require denormalization (storing pre-computed percentiles in every user doc), increasing storage and complexity.
- ✓ Verdict: Correct choice.

**Maintainability:**
- Postgres is industry-standard. Any dev can pick it up.
- Supabase's SDK is thin (you write SQL, not a proprietary query language).
- ✓ Verdict: High maintainability.

**Scalability:**
- Supabase auto-scales read replicas up to 200+ concurrent users at the free tier.
- Peak Fettle's traffic is **read-heavy** (users logging sets, viewing their own data) and **bursty** (3–4 users at dinner time, none at 3am).
- ✓ Verdict: Scales to ~10k monthly active users on paid Supabase tiers.
- ✗ Scales to 100k+ MAU only if you migrate to on-prem or sharded Postgres.

**Cost:**
- Free tier: 500 MB database, 1M API calls/month → $0
- Paid tier: Pay-as-you-go, ~$25–200/mo at 10k MAU
- ✓ Verdict: Cost-effective for early stage.
- ✗ At 100k+ MAU, might reach $1k+/mo unless optimized (caching, read replicas).

**Tradeoff Analysis:**

✓ **Gained:**
- Rapid iteration (managed infra, don't need to provision servers)
- RLS (row-level security built-in; enforce "users see only their own data" in SQL)
- Real-time subscriptions (future feature: live leaderboards)
- Open database standard (easy to migrate away if needed)

✗ **Sacrificed:**
- Vendor lock-in (switching away requires data export + new infra)
- 50ms baseline latency (managed service overhead)
- Limited control over indexing strategy (Supabase restricts some advanced tuning)

**Risk Analysis:**

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Vendor lock-in (Supabase acquired/pivoted) | Low | High | Keep migrations directory up-to-date; can self-host Postgres on notice |
| Cost spike (unexpected usage) | Medium | Medium | Set up billing alerts; optimize queries proactively |
| Data breach (Supabase infrastructure) | Low | Critical | Supabase is SOC 2 certified; maintain backup exports weekly |
| Schema migration breaks (downtime) | Low | Medium | Test migrations on staging before production; use blue-green deploys |

### Verdict: Correct Choice (Defend)

✓ **Supabase is the right choice for Peak Fettle Phase A–C** (0–100k users). It provides:
- Fast iteration without ops overhead
- Industry-standard SQL (portable)
- Built-in security (RLS)
- Cost efficiency (pay-as-you-go)

At 100k+ users, you'd **re-evaluate:**
- Self-hosted Postgres (full control, cost savings)
- Sharded Postgres (if single machine overloads)
- Data warehouse (Snowflake, BigQuery) for analytics

---

## Section 3 — Deep Evaluation: Percentiles (Batch, Not Real-Time)

### The Choice: Weekly Batch Calculation

**Alternatives considered:**

1. **Real-time percentiles** — Calculate on every set logged
2. **Hourly batch** — Recalculate every hour
3. **Weekly batch** — Recalculate every Sunday 2am (chosen)

### Analysis: Why Weekly Batch Is Correct

**Correctness:**
- Percentiles need 500+ data points per lift to be statistically meaningful.
- At current scale (~100 testers), weekly batches have enough data.
- ✓ Verdict: Correct choice.

**Cost:**
- Real-time: Every set logged triggers a percentile recalculation (~50ms latency per set). Expensive.
- Weekly batch: One SQL query per week (~1 second). Cheap.
- ✓ Verdict: Weekly is 10,000x cheaper than real-time.

**Latency:**
- Real-time: User logs set, sees updated percentile immediately (100% current).
- Weekly: User logs set, sees percentile from last week (7 days stale, but close enough).
- ~ Verdict: Acceptable tradeoff for early product.

**Scalability:**
- Real-time percentiles: O(n) cost per set logged. At 10k sets/week, 1,400 sets/day, this is manageable.
- At 100k sets/week, real-time becomes expensive (1–2ms per set × 14k sets/day = 14–28s aggregate).
- Weekly batch: O(1) cost, scales indefinitely.
- ✓ Verdict: Weekly batch scales better.

**Tradeoff Analysis:**

✓ **Gained:**
- Cheap infrastructure (no expensive real-time recalculation)
- Reliable (predictable weekly job, easier to test)
- Batch computations can be complex (e.g., smoothing, outlier removal) without latency pressure

✗ **Sacrificed:**
- Stale data (percentile is 0–7 days old)
- No "live leaderboard" feature (would require real-time)
- Harder to fix a calculation bug (must wait a week for next batch, or manually recompute)

### At What Scale Should You Switch?

**If Peak Fettle reaches 100k MAU:**

1. **Option A: Keep weekly batch**
   - Add caching layer (Redis) to pre-compute common queries
   - Add a "percentile last updated" timestamp in the UI
   - Cost: 50–100 Redis nodes (~$500/mo)

2. **Option B: Switch to hourly batch**
   - Compromise: more current (max 1 hour stale) but less cost than real-time
   - Cost: 100 batch jobs/day (manageable)

3. **Option C: Hybrid — Real-time with cache**
   - Recalculate percentiles in the background (async)
   - Serve cached result immediately (fast)
   - Cost: Same as Option A, but better UX (appears real-time)

### Verdict: Correct Choice (Defend)

✓ **Weekly batch is the right choice for Phase A–B.** It optimizes for:
- Cost (critical at early stage)
- Simplicity (predictable job, easier to test)
- Scalability to 100k+ users

At 100k+ users, you'd **re-evaluate** and likely move to Option C (real-time with cache).

---

## Section 4 — Deep Evaluation: Two Frontends (Qt + React Native)

### The Choice: Maintain Two Frontends

**Alternatives considered:**

1. **Desktop-only** — Shipping via Qt, no mobile app
2. **Mobile-only** — Skip desktop, focus on React Native (iOS/Android)
3. **Web** — Single React frontend runs on web, mobile, desktop
4. **Two frontends** — Qt (desktop) + React Native (mobile) (chosen)

### Analysis: Tradeoffs

| Dimension | Desktop-Only | Mobile-Only | Web | Two Frontends |
|-----------|--------------|-------------|-----|---------------|
| **Dev cost** | Low (1 stack) | Low (1 stack) | Low (1 stack) | High (2 stacks) |
| **UX** | Good (native) | Good (native) | Fair (web) | Excellent (native x2) |
| **Scalability** | Limited | Limited | High | High |
| **Offline** | Built-in (Qt) | Built-in (RN) | Hard (web) | Built-in (both) |
| **Maintenance** | 1 codebase | 1 codebase | 1 codebase | 2 codebases |
| **Team required** | 1–2 (Qt) | 2–3 (RN) | 2–3 (React) | 4–6 (both) |

### Why Two Frontends Is (Probably) Wrong

**Problem:** Peak Fettle chose two frontends, which means:
- Maintaining Qt codebase (C++/QML) — requires Qt expertise
- Maintaining React Native codebase (JavaScript) — requires RN/Expo expertise
- Shared backend (Express) — must work with both clients
- Different bugs in each client (QML crashes vs RN crashes)
- Different testing strategies (Qt unit tests vs Jest)

**Cost of two frontends:**

Assuming a team of 6 (3 full-stack for each platform):
- Desktop team: 1 Qt expert + 1 backend engineer + 1 QA = 3 people
- Mobile team: 1 RN expert + 1 backend engineer + 1 QA = 3 people
- Shared backend: Actually needs 2–3 people (Qt team needs backend help, RN team needs backend help)
- Total: 6–7 people to maintain two frontends

**Annual cost:** 6 people × $120k salary = $720k/year

### Alternative: Web Frontend (React)

**What if Peak Fettle chose a single web frontend (React)?**

```
Web (React) → Express API → Supabase
  ├─ Desktop: Opens in Chrome/Safari browser (full experience)
  ├─ Mobile: React Native app (same codebase, compiled native)
  └─ Tablet: Web browser, responsive layout
```

**Pros:**
- Single codebase (React)
- Easier for new dev to join (learn one stack, not two)
- Faster iteration (change code once, deploy everywhere)
- Web accessible without app store

**Cons:**
- Desktop browser experience is less native (no window management, file menu, etc.)
- Mobile web is worse than native (slower, less access to OS features)
- RN can't run the exact same React code (different component libs, navigation)

### Why Peak Fettle Chose Two Frontends (Likely Reasoning)

**Reason 1: Native UX is critical for fitness logging**

Logging a set should be:
- Fast (1–2 taps, no browser overhead)
- Offline-first (gym has no WiFi)
- Accessible via home screen (no browser tab needed)

A web app in a browser fails on all three. Native (Qt + RN) succeeds.

**Reason 2: Offline-first is a hard requirement**

Qt handles offline easily (SQLite locally, sync to server when back online). React Native + Expo can do it with `expo-offline-first` libraries, but it's more complex.

### Verdict: Wrong Choice (Challenge)

✗ **Two frontends is likely the wrong architectural decision for Peak Fettle.**

**Better alternative:** Focus on **mobile first** (React Native), because:
- 80% of users will use the mobile app (convenience)
- Desktop users are rare (logging from a computer gym is uncommon)
- Single codebase is worth the 20% UX reduction on desktop

**Why it's hard to fix now:**
- Qt desktop app is already built and used internally
- Shipping two apps is more impressive marketing than "just a mobile app"
- Team is split and invested in both

**Recommendation:**
- Phase A–B: Keep both (sunk cost)
- Phase C: Deprecate Qt, focus all resources on RN
- Users who need desktop: Direct them to web PWA (progressive web app) or mobile browser

---

## Section 5 — Deep Evaluation: Haiku for Backend Logic

### The Choice: Claude Haiku Handles Backend Rules

**Example:** During onboarding, Haiku classifies user experience level (beginner/intermediate/advanced) based on survey answers.

```javascript
// In the backend, call Haiku to interpret the survey
const haiku = new Anthropic();
const message = await haiku.messages.create({
    model: "claude-3-5-haiku-20241022",
    max_tokens: 100,
    messages: [{
        role: "user",
        content: `Classify the user's experience level (beginner/intermediate/advanced)...`,
    }],
});
const level = message.content[0].text.trim();
```

### Analysis: Is Haiku the Right Tool?

**Correctness:**
- Haiku can classify experience level from survey text
- But classification logic should be **deterministic**, not AI-based

**Alternative: Rule-based classification**

```javascript
const level = 
    years >= 5 && competitions >= 3 ? "advanced" :
    years >= 2 && sets_per_week >= 15 ? "intermediate" :
    "beginner";
```

**Pros of rule-based:**
- Deterministic (same input → same output every time)
- Testable (unit test: if years=5 and competitions=3, expect "advanced")
- Fast (no API call)
- No hallucinations (Haiku might classify a troll as "advanced")

**Pros of Haiku:**
- Flexible (handles edge cases humans didn't anticipate)
- Natural (reads user's description, not just numbers)
- Interpretable (Haiku explains why it classified someone as "intermediate")

### Verdict: Wrong Choice (Challenge)

✗ **Using Haiku for deterministic rules is over-engineering.**

The onboarding classification is:
- Low-risk (misclassifying experience level doesn't break anything)
- Low-frequency (happens once per new user)
- Rule-based (can be expressed as simple if-statements)

**Better approach:**

```javascript
// Phase A: Use rules
function classifyExperience(years, competitions, setsPerWeek) {
    if (years >= 5 && competitions >= 3) return "advanced";
    if (years >= 2 && setsPerWeek >= 15) return "intermediate";
    return "beginner";
}

// Phase C: If rules are too simple, add Haiku
// But only for features where flexibility matters (e.g., AI workout recommendation)
```

**Rule of thumb for Haiku:**

| Feature | Rule-Based | Haiku | Recommendation |
|---------|-----------|-------|-----------------|
| Classify experience | ✓ | ~ | Rules (simpler) |
| Recommend exercises | ~ | ✓ | Haiku (flexible) |
| Detect PR (weight increased) | ✓ | ~ | Rules (deterministic) |
| Personalize feedback | ~ | ✓ | Haiku (natural) |
| Validate email | ✓ | ~ | Rules (fast) |
| Generate workout description | ~ | ✓ | Haiku (creative) |

---

## Section 7 — Comparative Analysis: Leaderboards at Scale

### Real-World Example: Strava Leaderboards

Strava (a cycling/running social app) shows local leaderboards (fastest runners on a segment). How do they do it at scale (50M users)?

**Strava's approach:**
1. **Pre-computed leaderboards** (like Peak Fettle's percentiles)
2. **Cache everything** (Memcached/Redis)
3. **Denormalized data** (store rank, time, user info in one document)
4. **Background jobs** (recalculate leaderboards every hour, not real-time)

**Lesson for Peak Fettle:** Strava also uses caching + background jobs, not real-time computation. The 5-second polling latency is acceptable.

---

## Section 8 — Bloom L4–L6 Evaluation Questions

### L4 — Analyze

**Q4.1:** Peak Fettle chose Supabase. Analyze the feedback report issue N-07 (missing `v_user_lift_inputs` view). How did this architectural decision (using Supabase migrations) contribute to the bug?

**Q4.2:** Analyze the tradeoff between weekly batch percentiles (current) vs. real-time (alternative). At what scale does the tradeoff flip in favor of real-time?

**Q4.3:** Analyze the two-frontend decision (Qt + React Native). What would be the cost of unifying them into one frontend? What would be lost?

**Answers:**

- **Q4.1:** Supabase requires migrations to be in `migrations/` folder and named with a date prefix (`20260501_*.sql`). The compute_percentile and lift_vectors_seed SQL files were placed at the project root, not in `migrations/`. This broke the contract: EAS build runs `supabase db push`, which only applies files in `migrations/`. The batch job was never deployed, so the missing view was never detected until runtime. **Lesson:** Architectural contracts (where files must live) matter as much as code. This would have been caught by a linter that enforces "only SQL in migrations/ has date prefixes."

- **Q4.2:** At current scale (100 testers, ~1,000 sets/week), weekly batch costs $0 in compute (one SQL query). Real-time would cost ~$50/mo (one query per set × 1,000 sets = overhead). At 100k users (100,000 sets/week), real-time becomes $500/mo; weekly batch stays $0. **The tradeoff flips at ~10k sets/week**, where real-time compute becomes expensive and caching becomes necessary. At 100k users, you'd re-evaluate: cache the leaderboards, compute percentiles hourly (instead of weekly), or migrate to a data warehouse (Snowflake) that's optimized for analytics.

- **Q4.3:** Unifying two frontends into one would save: (1) code duplication, (2) different bugs per platform, (3) team coordination. Cost: (1) UX compromise (web is slower than native), (2) offline support is harder (web needs service workers, not built-in), (3) no native app presence (can't be on home screen). At 10k MAU, one team saving is worth ~$200k/year. At 100k MAU, one team saves ~$400k/year. **Decision rule:** If one frontend saves more money than the UX cost, unify. If the UX cost (losing app store visibility, offline support) is worth more than saved salary, keep two.

### L5 — Evaluate

**Q5.1:** Evaluate Peak Fettle's choice to use Haiku for backend logic (like experience classification). Is this the right tool for the job? Argue both for and against.

**Q5.2:** You are tasked with building the live leaderboard feature. Evaluate the polling approach (5s interval) vs. WebSocket approach. Which should you choose for Phase A? Why?

**Q5.3:** Evaluate Peak Fettle's testing strategy (unit tests in CI, beta testing weekly). Is this sufficient? What's missing?

**Answers:**

- **Q5.1:** 
  - **For Haiku:** Flexible, handles edge cases, natural language interpretation, interpretable explanations
  - **Against Haiku:** Overkill for a deterministic rule (if years >= 5, then advanced), cost per call, hallucination risk (might classify invalid input unexpectedly), latency (API call adds 200ms)
  - **Verdict:** Use rules for onboarding experience. Save Haiku for features where **flexibility is core to the feature** (workout recommendation, form-check feedback). Haiku should not be used for simple rules.

- **Q5.2:**
  - **Polling (5s):** Pros: Simple (just setInterval + fetch), works with free Supabase, supports HTTP clients (no special library needed). Cons: Latency (5s stale), battery drain, redundant requests.
  - **WebSocket:** Pros: Real-time, low battery, no redundant requests. Cons: Server complexity, requires Node.js server to manage connections, not compatible with all network types (corporate firewalls block it).
  - **Verdict for Phase A:** Use polling. It's simpler, costs less infrastructure, and 5s latency is acceptable for a fitness app. **Upgrade to WebSocket in Phase C** if you see users complaining about stale leaderboards or if analytics show battery drain is an issue.

- **Q5.3:** 
  - **Current:** Unit tests (Jest on every push) + beta testing (weekly, 6 personas)
  - **Missing:** Integration tests (against real DB), load testing (does the API handle 1,000 concurrent users?), security testing (can I exploit the auth?), performance testing (is the leaderboard query fast at 100k users?)
  - **Recommendation:** Add integration tests (weekly pre-deploy), add load tests (monthly), add security review (quarterly). This gives you confidence at scale.

### L6 — Create/Synthesize

**Q6.1:** Design a new feature end-to-end: "Workout Templates." A user creates a template (e.g., "Upper Day") with 5 exercises (Bench, Rows, Pull-ups, Shoulder Press, Curls). Next week, they open the template and it pre-fills a new workout with the same exercises. Justify every architectural decision.

**Q6.2:** Propose an alternative architecture for Peak Fettle. Instead of Supabase + Express, use [any technology you choose]. Defend your choice against the current architecture.

**Q6.3:** Identify one architectural decision in Peak Fettle that you believe is **wrong** and propose a concrete fix.

**Answers:**

- **Q6.1: Workout Templates — Full Design**
  
  **Database Schema:**
  ```sql
  CREATE TABLE workout_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
  );
  
  CREATE TABLE template_exercises (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      template_id UUID REFERENCES workout_templates(id) ON DELETE CASCADE,
      exercise_name TEXT NOT NULL,
      order_index INT,  -- To preserve exercise order
  );
  
  CREATE INDEX idx_templates_user ON workout_templates(user_id);
  ```
  
  **API:**
  ```javascript
  // Create template
  POST /templates
  Body: { name: "Upper Day", exercises: ["Bench", "Rows", "Pull-ups"] }
  
  // Get templates for user
  GET /users/:id/templates
  
  // Start workout from template
  POST /workouts/from-template/:templateId
  // Creates a new workout with the same exercises
  ```
  
  **UI (mobile):**
  ```jsx
  // TemplatePickerScreen
  <FlatList
      data={templates}
      renderItem={({ item }) => (
          <Button
              title={item.name}
              onPress={() => createWorkoutFromTemplate(item.id)}
          />
      )}
  />
  ```
  
  **Decision justifications:**
  - Store exercises as separate rows (not JSON array) → allows indexing, filtering, reordering
  - No denormalization (e.g., don't store exercise count in template) → simpler migrations
  - On-delete cascade → if user deletes, templates disappear (not orphaned)
  - Order by explicit order_index → allows user to reorder exercises

- **Q6.2: Alternative Architecture**
  
  **Current:** Supabase (Postgres) + Express.js + React Native + Qt
  
  **Alternative: Firebase + Cloud Functions + Flutter + Web**
  
  **Justification:**
  - Firebase Realtime Database or Firestore → automatic scaling, real-time subscriptions (no polling needed)
  - Cloud Functions → serverless backend (no ops overhead, auto-scales)
  - Flutter → single codebase for mobile (iOS + Android), native performance
  - React or Vue for web → reach non-mobile users
  
  **Pros vs. Supabase + Express:**
  - Simpler (Firebase handles scaling, backups, security)
  - Better real-time (built-in subscriptions)
  - Single mobile codebase (Flutter)
  - Cheaper at small scale ($0 free tier)
  
  **Cons:**
  - Vendor lock-in (Firebase is Google; harder to migrate)
  - Less control over data (Firestore's query language is limited)
  - Less familiar to most teams (Postgres is industry-standard)
  
  **Verdict:** For a **startup** (Phase A, <1k users), Firebase is faster to ship. For a **scale-up** (100k+ users), Supabase + self-hosted is more flexible. Peak Fettle chose Supabase as a middle ground (managed but open-source standard).

- **Q6.3: One Wrong Decision and the Fix**
  
  **Decision:** Two frontends (Qt + React Native) with 2 separate teams.
  
  **Why it's wrong:**
  - Overhead of maintaining two codebases (bugs in one don't appear in the other)
  - Slower iteration (bug fix in backend affects both, must test both)
  - Higher onboarding cost for new devs (learn two stacks)
  
  **Concrete fix:**
  1. **Phase A–B (now):** Keep both, but establish a "single backend" contract (same API, same behavior)
  2. **Phase C (6 months):** Sunset Qt desktop app. Announce to users: "We're focusing on mobile. Use the web app if you need desktop."
  3. **Phase D (1 year):** Dedicate all resources to React Native. Build web wrapper if needed (React + React Native shared code is possible with tools like Tamagui).
  
  **Cost savings:** 1 team of 3 people = $360k/year
  **UX impact:** Desktop users (~5%) lose the app; route them to web
  
  **Alternative:** Instead of sunsetting, keep Qt but make it a **lower-priority** fork of the React Native app. Use a code generator to keep them in sync. But this is complex and probably not worth it.

---

## Summary: What You've Learned

By reaching this capstone, you now understand:

1. **Full-stack architecture** — How database, backend, and frontend interact
2. **Tradeoff analysis** — Every choice sacrifices something
3. **Scaling decisions** — What works at 100 users might break at 100k users
4. **Cost-benefit thinking** — Two frontends cost 2x but are 10% better UX
5. **Vendor lock-in** — Supabase is great now, but plan for migration later
6. **Feature design** — How to take a user story and build it end-to-end
7. **Testing at scale** — Unit tests, integration tests, and beta testing catch different bugs
8. **Challenging decisions** — Being able to say "this is probably wrong" and justify an alternative

---

## Parting Wisdom

**You are now qualified to:**

- Understand the entire Peak Fettle codebase (all 25 lessons)
- Propose architectural improvements
- Design new features end-to-end
- Onboard new developers
- Make trade-off decisions
- Scale the system to 10x users
- Migrate away from decisions you're unhappy with

**The real world is about tradeoffs.** There is no perfect architecture. Supabase is not perfect (vendor lock-in), Qt is not perfect (maintenance burden), percentiles are not perfect (stale data). The art of architecture is choosing **good-enough-now** and **planning-for-later**.

**Welcome to the Peak Fettle team.** You've made it to the top of the mountain.

---

## Appendix: Further Reading

- [Martin Fowler — Software Architecture Guide](https://martinfowler.com/architecture/)
- [Designing Data-Intensive Applications](https://dataintensive.dev/) — Kleppmann
- Peak Fettle — Read all 24 prior lessons (L01–L24) if you skipped any
- Real-world case studies: Airbnb, Uber, Stripe (search for "architecture decision records")

---

**Congratulations on completing the Peak Fettle Codebase Curriculum!**

*Duration: 60+ hours | Bloom Levels: L1–L6 | Lessons: 25*

Go forth, evaluate architecture, and build things that matter.


---

