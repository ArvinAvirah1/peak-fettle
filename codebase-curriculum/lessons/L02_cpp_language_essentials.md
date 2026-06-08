# Lesson L02 — C++ language essentials in Peak Fettle

> **Track:** 0 — Foundations · **Status on roadmap:** core rung
> **Interactive app:** [`L02_cpp_language_essentials.html`](L02_cpp_language_essentials.html)
> **Estimated time:** ~45 min (one sitting) · **Prerequisite rungs:** L01
>
> Prior knowledge assumed: basic C++ syntax (variables, functions, classes). C++ was *not yet assessed* in the profile — surface it in the live M1 survey below.

---

## 0. Source of Truth

The following files are the canonical implementation reference for this lesson:

| File | Role |
|------|------|
| `src/UnitPreference.h` / `.cpp` | Singleton pattern; QML bindings; unit conversion |
| `src/EffortPreference.h` / `.cpp` | Preference storage; Q_PROPERTY signals |
| `src/UserProfile.h` / `.cpp` | Multi-type storage (quint8 vs int); QSettings persistence |
| `src/Set.h` / `.cpp` | Constructor overloading; static factory (cardio); atomic IDs |
| `src/Exercise.h` / `.cpp` | Ownership via QVector; aggregate functions |
| `src/WorkoutTracker.h` | Complex singleton; QHash maps; Q_INVOKABLE methods |
| `src/main.cpp` | Application lifecycle; QML engine setup |

All code is production; no pseudocode or simplified versions are used.

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

## 2. Pre-lesson survey (M1) — ask LIVE via AskUserQuestion; don't pre-answer here

> Agent: pose these as live calibration questions before teaching, each with an "I'm not sure" option so admitting a gap is cheap. Use the answers to skip what Arvin already knows. The three probes below are diagnostics — surface them live, then teach to the gaps.

**Q2.1:** What does this code do, and why is it written this way?
```cpp
static UnitPreference *s_instance = nullptr;
UnitPreference *UnitPreference::create(QQmlEngine *, QJSEngine *) {
    if (!s_instance) {
        s_instance = new UnitPreference();
    }
    return s_instance;
}
```
*Confidence: ___/5*

**Q2.2:** Which of these statements is correct?
- (A) const in `double toDisplay(double kg) const` means the parameter kg is const
- (B) const in `double toDisplay(double kg) const` means the member data cannot be modified
- (C) const in `double toDisplay(double kg) const` means the return value is const
- (D) There is no const in this signature

*Confidence: ___/5*

**Q2.3:** Why does Exercise::addSet take a pointer `Set *s` instead of a reference `Set &s`?
- (A) Pointers are always better than references
- (B) Because Exercise will call setParent, which takes a pointer, and then store it in a QVector
- (C) References cannot be stored in containers
- (D) For const-correctness

*Confidence: ___/5*

---

## 3. Spacing Carry-Over (M14)

**From L01, you learned:**
- The domain model (Exercise, Set, Workout hierarchy)
- How Epley formula converts reps/weight into 1RM-equivalent
- The separation of model (in-memory), view (QML), and controller (WorkoutTracker)

**In this lesson, we build on those concepts:**
- L01 showed *what* the model stores; L02 shows *how* C++ expresses it
- L01 covered Epley as math; L02 covers how the code implements constraints around it
- L01 introduced singletons abstractly; L02 shows the idiom in detail

**Key connections:**
- UnitPreference is a *view-layer* singleton (doesn't touch the model, only display)
- UserProfile is a *model-layer* singleton (stores required inputs for the percentile function in L03)
- Exercise and Set are *model* objects that own data; they are always owned by a parent

---

## 4. Difficulty Ladder (M2: Graduated Complexity)

**Rung 1:** Understanding include guards and header structure  
**Rung 2:** Reading Q_PROPERTY and connecting them to QML bindings  
**Rung 3:** Tracing object ownership (parent-child chains via new and setParent)  
**Rung 4:** Designing factory methods and constructor overloading  
**Rung 5:** Comparing storage strategies (quint8 vs int; atomic counters; static singletons)  
**Rung 6:** Evaluating the full design: constraints, trade-offs, and alternatives  

---

## 5. Concept Sequence

### Concept 1: Headers, Include Guards, and the Translation Unit

**Generate-first question (M4):**
Why do C++ headers need include guards, and what happens if you forget them?

**Concrete hook (M7):**
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

**Elaboration (M6):**
A translation unit is a `.cpp` file plus all the headers it `#include`s. The compiler parses each translation unit separately, so it doesn't see that `main.cpp` and `exercise.cpp` both include `UnitPreference.h`. Within `main.cpp`'s translation unit, the guard ensures the header is included at most once. If you use `#pragma once` instead, you rely on the compiler to recognize "I've already seen this file by its path"; the standard-C approach (`#ifndef`) is more portable.

**Retrieval check (M3):**
True or false: If you have a circular include dependency (`A.h` includes `B.h` and `B.h` includes `A.h`), include guards will prevent the compiler error.

*Answer:* False. Include guards prevent *multiple includes of the same file*; they do not break circular dependencies. Forward declarations are needed for that.

**Practice & checkpoint (M9 → M12):**
Define: translation unit, include guard, and the difference between `#ifndef` and `#pragma once`.

---

### Concept 2: Qt Smart Pointers, Ownership, and Parent-Child Chains

**Generate-first question (M4):**
In Qt, who is responsible for deleting objects that are created with `new`?

**Concrete hook (M7):**
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

**Elaboration (M6):**
This is different from std::shared_ptr and std::unique_ptr. In the standard library, you explicitly manage who owns an object via pointer type. In Qt, all QObjects have an owner (their parent), and ownership is hierarchical. This simplifies lifetime management for GUI applications where objects form tree hierarchies (just like the DOM in a web app).

**Retrieval check (M3):**
If you call `new Exercise()` without a parent and forget to `delete` it, what happens?
- (A) Qt automatically deletes it when the app exits
- (B) Memory leak; Qt does not manage parentless QObjects
- (C) Compiler error
- (D) Runtime error

*Answer:* (B). Parentless QObjects leak. Always provide a parent or store the pointer in a smart container.

**Practice & checkpoint (M9 → M12):**
Draw a tree diagram showing the ownership chain: WorkoutTracker → {Exercise_1, Exercise_2, ...} → {Set_1, Set_2, ...}. Label who deletes whom.

---

### Concept 3: Q_PROPERTY, Signals, and QML Binding

**Generate-first question (M4):**
Why does UnitPreference define both a Q_PROPERTY and a signal (unitChanged), and what happens in QML when you bind to a property?

**Concrete hook (M7):**
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

**Elaboration (M6):**
Q_PROPERTY is a Qt-specific macro that the `moc` (Meta-Object Compiler) parses at build time. The macro generates helper code that QML can call. The READ getter, WRITE setter, and NOTIFY signal are all specified in the macro. QML "knows" about these properties at runtime via Qt's meta-object system.

Without Q_PROPERTY, a C++ class is invisible to QML. With it, QML can read, write, and observe the property like it's a native JavaScript object.

**Retrieval check (M3):**
In the property `Q_PROPERTY(QString unit READ unit WRITE setUnit NOTIFY unitChanged)`:
- The READ part is the `unit()` getter
- The WRITE part is the `setUnit()` setter
- The NOTIFY part is `unitChanged()` signal

What happens if you change the unit in C++ but don't emit `unitChanged()`?

*Answer:* QML bindings that depend on `unit` won't know it changed and won't re-evaluate. The UI will show stale data.

**Practice & checkpoint (M9 → M12):**
Explain the difference between Q_PROPERTY (compile-time macro) and a regular C++ member variable and getter/setter. Why is the macro necessary for QML?

---

### Concept 4: Constructor Overloading and Static Factory Methods

**Generate-first question (M4):**
Why does Set have two constructors (one for lifts, one factory method for cardio), and what problem does the factory method solve?

**Concrete hook (M7):**
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

**Elaboration (M6):**
This is a common C++ pattern when you have multiple "kinds" of objects that share a base class but have different construction requirements. Rather than overload the constructor with many optional parameters (which gets confusing), you provide static factory methods with descriptive names. The name `makeCardio` tells readers "this creates a cardio Set," and the parameter list makes sense in context.

**Retrieval check (M3):**
What is the type of the expression `Set::makeCardio(...)`?
- (A) Set
- (B) Set *
- (C) Set &
- (D) auto

*Answer:* (B). The factory method returns `Set *`, a pointer. This is necessary because `new` allocates on the heap and returns a pointer.

**Practice & checkpoint (M9 → M12):**
Write a static factory method `Set::makeSprint(exerciseName, distanceMetre, timeSeconds, parent)` for a distance-based sprint. What fields should it set, and why return a pointer instead of a reference?

---

### Concept 5: Const Correctness and Tight Binding

**Generate-first question (M4):**
What does the `const` at the end of a member function declaration mean, and why does it matter?

**Concrete hook (M7):**
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

**Elaboration (M6):**
Const correctness is a contract. When you see `const` on a member function, you know it's safe to call from anywhere—it won't surprise you by changing the object's state. QML bindings rely on this: if you call a const getter and it secretly modifies the object, the binding won't be notified.

Some people ignore const and write const-unsafe code (like casting it away with `const_cast`). Don't do this in Peak Fettle. The codebase maintains strict const correctness.

**Retrieval check (M3):**
Can you call a const member function on a non-const object?

*Answer:* Yes. `const` is a promise the function makes; it's okay to call it anywhere.

Can you call a non-const member function on a const object?

*Answer:* No. The compiler will error.

**Practice & checkpoint (M9 → M12):**
Identify the functions in Exercise that should be const and the ones that should not. Justify each choice.

---

### Concept 6: Storage Choices (quint8, std::clamp, Atomic Counters)

**Generate-first question (M4):**
Why does UserProfile store age as `quint8` instead of `int`, and what is the cost of this choice?

**Concrete hook (M7):**
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

**Elaboration (M6):**
Choosing storage types is a tradeoff:
- **Memory:** quint8 uses 1 byte; int uses 4. Save 75% per field.
- **Speed:** Modern CPUs load 8/16/32/64-bit values at nearly the same speed. Rarely a bottleneck.
- **Clarity:** `int` is clearer; `quint8` is an implementation detail. We expose `int` in the public API.
- **Safety:** Clamping ensures you never store invalid values. std::clamp is defensive programming.

**Retrieval check (M3):**
If you try to store age = 200 in a UserProfile (max realistic is 90), what happens?
- (A) Compile error
- (B) Runtime error
- (C) Silent wrap-around to a garbage value (no clamp)
- (D) Clamped to 90 by the setter

*Answer:* (D). The setter calls `std::clamp(200, 14, 90)` → 90, then casts to quint8. Safe.

**Practice & checkpoint (M9 → M12):**
List the member variables in Exercise and propose a more memory-efficient storage layout (consider quint32 for set count, etc.). Calculate the savings.

---

## 6. Teach-Back Exercise (M10: Summarization)

Write a 5-sentence summary of this lesson in your own words, without looking at the text. Cover:
1. Why C++ headers use include guards
2. How Qt handles object ownership
3. The role of Q_PROPERTY in QML binding
4. When to use a factory method instead of a constructor
5. One storage choice (quint8 or const or atomic) and its rationale

Estimated time: 10 minutes. This forces you to synthesize the concepts.

---

## 7. Cumulative Review (M13: Rapid-Fire Questions)

Answer in 1–2 sentences each. These questions mix concepts from L01 and L02.

**Q1:** Explain the three ways a Set can be created (empty constructor, lift constructor, cardio factory) and when you'd use each.

**Q2:** If you wanted to add a new preference (e.g., imperialHeight: feet vs meters), would it belong in UnitPreference or UserProfile? Why?

**Q3:** What happens to all Sets when an Exercise is deleted? Who is responsible for that deletion?

**Q4:** Why is `const` on a member function important for QML bindings?

**Q5:** True or false: The public API of UserProfile exposes `int` for age, but the implementation uses `quint8`. This is good API design because it hides implementation details. Defend your answer.

---

## 8. Graded Quiz (M3/L1–L5 Assessment)

**Instructions:** Answer all six questions. Each has a point value and a rubric.

### Quiz Question 1 (L1: Recall) — 4 points

**Prompt:** What is an include guard, and what syntax does Peak Fettle use for its naming convention?

**Rubric:**
- (4 pts) Correct definition of include guard + correct naming pattern (`PEAKFETTLE_CLASSNAME_H`)
- (2 pts) Correct definition but incorrect or missing naming convention example
- (0 pts) No answer or wrong definition

**Model Answer:**
An include guard is a preprocessor pattern using `#ifndef`, `#define`, and `#endif` that prevents a header file from being included more than once in a single translation unit. Peak Fettle uses the naming convention `PEAKFETTLE_<CLASSNAME>_H` (e.g., `PEAKFETTLE_UNITPREFERENCE_H`). This prevents duplicate class definitions and linker errors.

---

### Quiz Question 2 (L2: Understand) — 5 points

**Prompt:** Explain the difference between Qt's parent-child ownership model and std::unique_ptr. When would you use each in Peak Fettle?

**Rubric:**
- (5 pts) Correctly explains parent-child deletion chain; notes that unique_ptr is explicit ownership; identifies Qt context (Exercise owns Sets) and explains why it's chosen
- (3 pts) Explains both concepts but misses or misstates context
- (1 pt) Defines one concept but not the other
- (0 pts) No answer or incorrect definition

**Model Answer:**
In Qt's parent-child model, when a parent QObject is deleted, all children are automatically deleted recursively. In std::unique_ptr, the pointer's scope determines lifetime—when the pointer goes out of scope, the object is deleted. Peak Fettle uses parent-child because Exercise objects form a logical hierarchy (many Sets per Exercise; many Exercises per WorkoutTracker), and this hierarchy matches the GUI tree structure. A unique_ptr would require explicit deletion or scope management, which is less natural for a tree of objects. Qt's model automatically cleans up when the app exits or when the user resets the tracker.

---

### Quiz Question 3 (L3: Apply) — 6 points

**Prompt:** Write a new Q_PROPERTY for UserProfile that stores the user's biological sex ("M", "F", or unset ""). Include:
- The Q_PROPERTY macro line
- A private member variable
- A read getter
- A write setter (with const correctness and validation)

**Rubric:**
- (6 pts) All components present, correct syntax, setter validates input ("M" or "F"), guard against unchanged value, emits signal
- (4 pts) All components present but missing one detail (no guard, no signal, no validation)
- (2 pts) Q_PROPERTY and getter present but setter incomplete or incorrect
- (0 pts) No answer or severely incorrect syntax

**Model Answer:**
```cpp
// In UserProfile.h (header)
class UserProfile : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString sex READ sex WRITE setSex NOTIFY profileChanged)
    
private:
    QString m_sex;  // "" = unset; "M" or "F"

public:
    QString sex() const { return m_sex; }
    void setSex(const QString &v);
    
signals:
    void profileChanged();
};

// In UserProfile.cpp (implementation)
void UserProfile::setSex(const QString &v) {
    const QString normalized = (v == QStringLiteral("M") || v == QStringLiteral("F"))
                                ? v
                                : QString();
    if (m_sex == normalized) return;
    m_sex = normalized;
    saveToSettings();
    emit profileChanged();
}
```

---

### Quiz Question 4 (L4: Analyze) — 7 points

**Prompt:** The Set class has two ways to create instances:
1. Lift constructor: `Set(exerciseName, weightKg, reps, rir, timestamp, parent)`
2. Cardio factory: `Set::makeCardio(exerciseName, durationSec, distanceM, avgPaceSecPerKm, timestamp, parent)`

Evaluate this design choice: Is the asymmetry good or bad? What are the trade-offs? Would you change it, and why or why not?

**Rubric:**
- (7 pts) Identifies asymmetry (one constructor, one factory); explains why factory was chosen (clarity of argument order, preventing confusion); acknowledges that both could be constructors but factory is better; defends the choice
- (5 pts) Identifies and explains the asymmetry but doesn't fully defend it
- (3 pts) Notes that they're different but lacks clear reasoning about the design choice
- (1 pt) Incomplete or superficial answer
- (0 pts) No answer

**Model Answer:**
The asymmetry is *intentional and good*. The lift constructor takes `(name, weight, reps, rir)` while the cardio factory takes `(name, duration, distance, avgPace)`. If both were constructors, a caller could confuse them: `Set("Running", 10.0, 5)` is ambiguous—is that 10.0 kg and 5 reps, or 10.0 m and 5 seconds? The factory method `Set::makeCardio("Running", 600, 5000)` is unambiguous: 600 seconds, 5000 meters.

**Trade-off:** The cost is that callers must remember which type to use. The benefit is readability and safety—the API is self-documenting.

**Would I change it?** No. The asymmetry is a feature, not a bug. It forces intentionality and reduces error.

---

### Quiz Question 5 (L5: Evaluate) — 8 points

**Prompt:** Redesign the UnitPreference singleton to support a third unit: "stone" (UK: 1 stone = 6.35029 kg). You must:
- Modify the enum/string representation
- Update the conversion functions (toDisplay, toKg, format)
- Decide: should "stone" have its own suffix/inputLabel, or should some be shared?
- Identify any breaking changes or migration needs

Provide pseudocode or a concrete implementation sketch.

**Rubric:**
- (8 pts) Adds stone to the unit representation, updates all three conversion functions correctly, specifies suffix/inputLabel strategy, discusses backward-compat implications
- (6 pts) Adds unit and converts functions but misses suffix/inputLabel or migration details
- (4 pts) Adds unit but conversion logic is incomplete or incorrect
- (2 pts) Incomplete attempt with some correct elements
- (0 pts) No answer or complete misunderstanding

**Model Answer:**
```cpp
// In UnitPreference.h: expand unit representation
// option 1 (string-based, current design):
// Q_PROPERTY(QString unit READ unit WRITE setUnit NOTIFY unitChanged)
// Valid values: "kg", "lbs", "stone"

// option 2 (enum-based, more type-safe):
// enum Unit { KG, LBS, STONE };
// Q_PROPERTY(int unit READ unit WRITE setUnit NOTIFY unitChanged)

// Assuming string-based (minimal changes):
double UnitPreference::toDisplay(double kg) const {
    if (unit() == QStringLiteral("lbs")) {
        return kg / 0.45359237;
    } else if (unit() == QStringLiteral("stone")) {
        return kg / 6.35029;
    } else {
        return kg;  // "kg" is default
    }
}

double UnitPreference::toKg(double displayValue) const {
    if (unit() == QStringLiteral("lbs")) {
        return displayValue * 0.45359237;
    } else if (unit() == QStringLiteral("stone")) {
        return displayValue * 6.35029;
    } else {
        return displayValue;
    }
}

QString UnitPreference::format(double kg) const {
    if (unit() == QStringLiteral("lbs")) {
        return QString::number(static_cast<int>(std::round(kg / 0.45359237))) + " lb";
    } else if (unit() == QStringLiteral("stone")) {
        double stones = kg / 6.35029;
        int wholestones = static_cast<int>(std::floor(stones));
        int lbs_remainder = static_cast<int>(std::round((stones - wholestones) * 14));  // 1 stone = 14 lbs
        return QString::number(wholestones) + "st " + QString::number(lbs_remainder) + "lb";
    } else {
        // kg: 1 decimal for <100, integer for ≥100
        return (kg < 100.0) 
            ? QString::number(kg, 'f', 1) + " kg"
            : QString::number(static_cast<int>(std::round(kg))) + " kg";
    }
}

QString UnitPreference::suffix() const {
    if (unit() == QStringLiteral("stone")) return QStringLiteral("st");
    return isLbs() ? QStringLiteral("lb") : QStringLiteral("kg");
}

QString UnitPreference::inputLabel() const {
    if (unit() == QStringLiteral("stone")) return QStringLiteral("Weight (stone)");
    return isLbs() ? QStringLiteral("Weight (lb)") : QStringLiteral("Weight (kg)");
}

// Backward-compat: QSettings will now have a third possible value.
// Existing "kg" and "lbs" settings load fine. New code can set "stone".
// No migration needed; just add the case to setUnit validation.

void UnitPreference::setUnit(const QString &u) {
    const QString normalized = [u]() {
        if (u == QStringLiteral("lbs")) return QStringLiteral("lbs");
        if (u == QStringLiteral("stone")) return QStringLiteral("stone");
        return QStringLiteral("kg");
    }();
    // ... rest same
}
```

---

### Quiz Question 6 (L5: Evaluate) — 8 points

**Prompt:** Consider the design tradeoff between tight coupling (Q_PROPERTY on C++ objects directly exposed to QML) versus loose coupling (QML queries a data service / model, and updates flow through signals). Peak Fettle uses tight coupling extensively. Evaluate:
- What are the pros and cons of this approach?
- How would a loose-coupling design work concretely (sketch a model)?
- Which would you recommend for Peak Fettle, and why?

**Rubric:**
- (8 pts) Identifies pros (simplicity, reactivity, direct binding) and cons (QML knows C++ internals, harder to test, tight version-lock); sketches a service-based alternative; defends the tight-coupling choice for this domain
- (6 pts) Discusses tradeoffs but doesn't fully flesh out the alternative or defend the choice
- (4 pts) Notes the tradeoff but lacks depth
- (2 pts) Vague or incomplete answer
- (0 pts) No answer

**Model Answer:**
**Tight coupling (current Peak Fettle design):**
- *Pros:* QML bindings directly update C++ objects via Q_PROPERTY, instant reactivity, minimal boilerplate, simple mental model (C++ and QML share a single model)
- *Cons:* QML must know the C++ class names and property names (brittle refactoring), harder to unit-test (requires QML engine), changes to C++ may break QML, tighter version-lock between frontend and backend

**Loose coupling (service-based):**
A DataService (singleton or injected) would manage state:
```
QML → DataService.updateUnit("lbs") → C++ backend → emits DataService.unitChanged()
QML listens to DataService.unitChanged and re-renders
```
The service acts as a buffer; QML doesn't know about UnitPreference directly.

*Pros:* QML is decoupled from C++ class structure, easier to mock for testing, clearer separation of concerns

*Cons:* More indirection, signal chains become complex, boilerplate increases

**My recommendation:** Tight coupling is correct for Peak Fettle because:
1. It's a single-team, single-codebase project (not an ecosystem of plugins)
2. The C++ model is stable and understood
3. QML and C++ are co-developed, not independent
4. Simplicity matters for a startup (avoid over-engineering)

A service layer makes sense if the app grows to support multiple frontends (web, CLI) or third-party integrations. For now, tight coupling is the right tradeoff.

---

## 9. Interactive Widget: Code Navigator

**Widget Description (HTML not included; concept only):**

This widget displays a live, clickable map of the Peak Fettle C++ codebase as it relates to this lesson. Features:

- **Class hierarchy tree:** Click to expand/collapse Exercise, Set, UserProfile, UnitPreference
- **Property inspector:** Click a class to see all Q_PROPERTY definitions; color-coded by type (string, int, double)
- **Ownership diagram:** Animated arrows showing parent→child relationships (Exercise → Set, WorkoutTracker → Exercise)
- **Constructor/factory methods:** Expandable list showing all ways to construct each class
- **Const correctness audit:** Red/green indicators showing which functions are const

Users can:
- Search by class name or property name
- Jump to specific code line in the codebase
- Toggle between "simplified" (L1–L2 difficulty) and "detailed" (L3–L5 difficulty) views
- Export a diagram as SVG

---

## 10. End-of-Session Updates (Agent Instructions)

**After the learner completes all sections above, the agent should:**

1. **Grade the quiz:** Use the rubrics above to assign points (0–38 total). Threshold for "competent": ≥28 points (74%).

2. **Update the LEARNER_PROFILE:**
   ```
   LEARNER_PROFILE — Arvin
   ───────────────────────────────────────────
   L02 Completion: [date]
   Quiz Score: [X]/38
   Weak Areas: [list any L4/L5 questions with <50% of points]
   Next Lesson: L03 (Domain Math)
   
   Notes from this session:
   - Strong in L1/L2 (quiz Q1–Q2: ___/9)
   - Struggled with [specific concept] (quiz Q4: ___/7) — revisit in next spacing interval
   - Excellent evaluation reasoning (quiz Q5/Q6: ___/16)
   ```

3. **Schedule spacing reviews (M14):**
   - If score ≥28: Schedule L02 review in 3 days (active recall of key concepts)
   - If score <28: Schedule L02 review in 1 day (re-read difficult sections), then test again in 3 days
   - Final L02 review scheduled 2 weeks after initial completion (before L04)

4. **Offer to schedule L03 (M5/M14 spacing):**
   - Suggest scheduling L03 (Domain Math) a few days out — spacing needs calendar distance, not back-to-back sessions.
   - Queue the two carry-over retrieval questions L03 should open with (see L03 §3).

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

