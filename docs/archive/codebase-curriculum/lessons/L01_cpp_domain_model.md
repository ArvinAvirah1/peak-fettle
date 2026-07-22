# Lesson L01 — The core domain model: Set, Exercise, WorkoutTracker

> **Track:** 0 — Foundations · **Status:** ⭐ Reference lesson (fully worked)
> **Interactive app:** [`L01_cpp_domain_model.html`](L01_cpp_domain_model.html)
> **Estimated time:** ~35 min · **Prerequisite rungs:** none (this is the floor of the ladder)

## 0. Source of truth (read fresh before teaching — code drifts)
- `src/set.h`, `src/set.cpp` — class `Set`: fields, `volume()`, `makeCardio()`, clamping, `dayKey`.
- `src/exercise.h`, `src/exercise.cpp` — class `Exercise`: `addSet()`/ownership, `totalVolume()`, `personalRecordWeight()`, `estimatedOneRepMax()` (Epley + the `reps==1` special case).
- `src/WorkoutTracker.h`, `src/WorkoutTracker.cpp` — the singleton hub: `m_exercises` (`QHash`), `logSet()`, `recentSets()`, `progressSeries()` (the "best per day" aggregation), `computeStrengthScore()`.

## 1. Learning outcomes (Bloom-tagged)
By the end, Arvin can:
- **(L2)** Explain why `volume` is computed on read instead of stored, and what the `kind` discriminator does.
- **(L3)** Compute the Epley E1RM for a given set the way `estimatedOneRepMax()` does, including the `reps==1` case.
- **(L4)** Analyze the storage-narrowing/clamping asymmetry between lift fields (`quint16`/`qint8`, clamped) and cardio fields (not clamped), and what each choice implies.
- **(L5)** Evaluate the `progressSeries(perSet=false)` "best per day" default against a competitive power-user's needs, and the `reps==1` Epley exception as a data-integrity decision.

## 2. Pre-lesson survey (M1) — ask LIVE via AskUserQuestion
- "Confidence with C++ specifically (vs. higher-level languages): none / heard of it / can read it / can write it?"
- "Have you worked with class invariants / 'compute vs. store' decisions before?"
- "Today: go deep on these 3 classes, or also peek at how they map to the DB later?"
> Calibrate: profile says C++ was *not yet assessed* — surface it here. Concept-first, then code (Arvin's stated preference).

## 3. Spacing carry-over (M14)
First lesson, so nothing to carry. (Next lesson opens with: "what does `kind` discriminate, and why is `volume` computed on read?")

## 4. The difficulty ladder for THIS lesson (M2)
1. The atomic unit: what a `Set` is, and computed-on-read `volume`.
2. The `kind` discriminator (lift vs. cardio) and why one class holds both.
3. Storage narrowing + clamping (defensive invariants).
4. Grouping: `Exercise` owns its sets; `WorkoutTracker` owns everything via a `QHash`.
5. The derived metrics: Epley E1RM and the `reps==1` exception.
6. The "best per day" aggregation — a product decision encoded in code.

## 5. Concept sequence

### Concept 1: A `Set` is the atom; `volume` is computed, not stored
- **(M4) Generate first:** "If you log 'bench 80 kg × 5', and the app shows 'volume: 400 kg', would you *store* that 400, or compute it when needed? Why?"
- **(M7) Concrete hook:** one bench set → tonnage = weight × reps = 80 × 5 = 400.
- **The idea:** `volume` is a *derived* value. Storing derived values risks them drifting out of sync with their inputs (you edit the weight but forget to update volume). Computing on read makes the inputs the single source of truth. Analogy: you don't write your age in your passport — you write your birth date and compute age, because the birth date never goes stale.
- **Real code** (`src/set.h`):
  ```cpp
  double volume() const { return m_kind == QLatin1String("lift")
                                 ? m_weightKg * m_reps : 0.0; }
  ```
- **(M6) Elaboration:** why return `0.0` for cardio? Because cardio progress is distance/time, not tonnage — volume is meaningless there, and 0 is a safe sentinel the graph can skip.
- **(M3) Retrieval check:** "Give one concrete bug that storing `volume` as a column would risk that computing-on-read avoids."

### Concept 2: One class, two shapes — the `kind` discriminator
- **The idea:** a `Set` is either a lift (`weightKg`, `reps`, `rir`) or cardio (`durationSec`, `distanceM`, `avgPaceSecPerKm`). Rather than two classes, one class carries a `kind` string ("lift"|"cardio") and the irrelevant fields hold a `-1` "not recorded" sentinel. This mirrors the backend `sets.kind` column exactly — same noun, same shape, two layers.
- **Real code:** the cardio path uses a *static factory* `Set::makeCardio(...)` instead of a constructor — "Static so callers never have to remember the argument order (duration comes before weight, which would be easy to mix up with the lift constructor)" (`src/set.cpp`).
- **(M3) Retrieval check:** "Why a static factory for cardio instead of another constructor overload?"

### Concept 3: Storage narrowing & clamping — invariants enforced in the setter
- **(M8) Diagram (in app):** a number line showing reps clamped to 0–65535, RIR to −1..10.
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
- **(M6) Elaboration:** why does `setReps` emit `volumeChanged()` as well? Because `volume` is derived from reps — the UI bound to `volume` must redraw.
- **(M4/M9 faded):** "cardio's `durationSec` is stored as `qint32` and is **not** clamped. Why the asymmetry?" (Headroom for ultra-endurance; and there's no tight storage bound to defend.) — this is the seed for quiz q3.

### Concept 4: Ownership — `Exercise` owns sets, `WorkoutTracker` owns everything
- **(M4) Generate first:** "If you log 500 sets, who is responsible for freeing that memory in C++?"
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
- **(M3) Retrieval check:** "Why a `QHash` keyed by name rather than a plain list of exercises?"
- **(M12) Checkpoint:** "1–5, how solid is ownership + the hash? What's fuzzy?"

### Concept 5: Derived metrics — Epley E1RM and the `reps==1` exception
- **(M7) Concrete:** 100 kg × 5 → Epley E1RM = 100 × (1 + 5/30) = 116.7 kg.
- **The idea:** estimated 1-rep-max is the primary progress metric. Epley = `w·(1+reps/30)`. **But** if `reps == 1`, the user already did a true single — return the weight directly, *not* `w·(1+1/30)` which would inflate a 200 kg single to 206.7 kg (a 3.3% lie).
- **Real code** (`src/exercise.cpp`):
  ```cpp
  const double e1rm = (s->reps() == 1)
      ? s->weightKg()                               // true 1RM — no multiplier
      : s->weightKg() * (1.0 + s->reps() / 30.0);   // Epley for 2+ reps
  ```
- **(M6) Elaboration — the stakes:** this value feeds `percentileForExercise()` and `percentilesForAll()`. Inflated E1RM → artificially high cohort percentile → the rankings (the product's competitive hook) become dishonest. The exception is a *data-integrity* decision, not a cosmetic one. → quiz q4.

### Concept 6: "Best per day" — a product decision living in the data layer
- **The idea:** `progressSeries(perSet=false)` returns **one point per training day — the best value for that metric that day**, not every set. This fixes the "your second set to failure made you look weaker" graph artifact that both a beta tester (Marcus) and the founder flagged. `perSet=true` exists for debug/export only; "UI should never pass true here" (`WorkoutTracker.h`).
- **(M4) Generate first:** "You plot every set's E1RM over time. A user does a heavy top set then back-off sets. What does the graph look like, and why is that demotivating?"
- → quiz q5 (the L5 capstone).

## 6. Teach-back (M10)
"Explain to a CS-101 student, in ~5 sentences: what a `Set` is in Peak Fettle, why `volume` and `E1RM` are computed rather than stored, and how `WorkoutTracker` finds the right `Exercise` quickly."

## 7. Cumulative review (M13) — rapid-fire
1. What does `kind == "cardio"` change about how `volume` behaves?
2. Compute the E1RM of a 140 kg × 1 set and a 140 kg × 3 set. Why are they treated differently?
3. Why does `progressSeries` default to one best point per day?

## 8. The graded quiz (Bloom L1–L5, AI-graded in the app)

| # | Bloom | Type | Prompt | Rubric | Model answer (reference) | Pts |
|---|-------|------|--------|--------|--------------------------|-----|
| q1 | L1 | mc | What does `rir = -1` mean on a `Set`? | Identifies the sentinel | "Not recorded" (RIR 0 = taken to failure) | 8 |
| q2 | L2 | free | In your own words, why is `volume` computed on read instead of stored as a field? | Restates single-source-of-truth; names the drift risk | Stored derived values can drift out of sync with their inputs; computing keeps inputs authoritative. | 12 |
| q2b | L3 | free | A lifter logs 120 kg × 4 then 130 kg × 1 for one exercise. Compute each set's E1RM and say which becomes `estimatedOneRepMax()`. | Applies Epley to the 4-rep set (=136 kg); uses raw weight for the single (=130 kg); takes the max | 120×(1+4/30)=136 kg; 130×1→130 kg (no multiplier); max wins, so E1RM = 136 kg. | 12 |
| q3 | L4 | free | Lift `reps`/`rir` are clamped and narrowed (`quint16`/`qint8`); cardio `durationSec` is `qint32` and not clamped. Explain the asymmetry and what it says about each field's "threat model." | Surfaces: realistic bounds exist for reps/RIR so clamping defends an invariant; duration has no tight bound (ultra-endurance) so headroom matters and there's nothing to clamp to | Reps/RIR have known small ranges, so narrow storage + clamp catches garbage; duration legitimately spans seconds→24h+, so a wider type with no clamp is correct. | 18 |
| q4 | L5 | free | The `reps==1` Epley exception returns the raw weight instead of `w·(1+1/30)`. Evaluate this as a data-integrity decision: what breaks downstream without it, and is the special-case complexity justified? | Clear position; traces E1RM → percentile → rankings; names the 3.3% inflation; weighs special-case cost vs. honesty of the competitive metric | Without it, true singles inflate ~3.3%, propagating into percentiles and dishonestly inflating cohort rank — the product's core hook. The branch is cheap and the integrity payoff is high, so justified. Full marks engage the "more special cases = more bugs" counter-argument. | 21 |
| q5 | L5 | free | `progressSeries` defaults `perSet=false` (one best point/day). Marcus (competitive powerlifter) wants every set plotted by default. Defend or refute the default, name the failure mode it prevents, and say who each choice serves. | Takes a position; names the "second set to failure looks weaker" artifact; identifies who the default protects (motivation/casual narrative) vs. who perSet serves (power users analyzing fatigue); proposes a reconciliation | The default protects the progress *narrative* for the majority and prevents a demotivating sawtooth; perSet serves analytical power users. Best answer: keep best-per-day default, expose a per-set toggle for Marcus rather than changing the default. | 21 |
| q6 | L6 (opt) | free | Propose how you'd add a "tempo" field (eccentric seconds) to a `Set` without breaking existing QML bindings or stored data. Justify each choice. | Backward-compatible (sentinel default like `-1`); doesn't alter existing `Q_PROPERTY` surface; mirrors a backend column; notes migration | Add `tempoSec` defaulting to `-1` (not recorded), new `Q_PROPERTY` + NOTIFY, leave all existing properties untouched, add a nullable `sets.tempo_sec` column — additive everywhere, zero breakage. | 15 |

## 9. Custom interactive widget
**Live Epley E1RM calculator** — sliders for weight and reps; shows the computed E1RM and visibly switches to the raw-weight branch when reps hits 1. Lets Arvin *feel* the 3.3% inflation the exception removes. Implemented in the HTML's `custom-widget` hook and mounted into Concept 5's section.

## 10. End-of-session updates (agent)
- Grade quiz via the app's "Grade with Claude."
- Update `teacher_skill.md` PART 2: first real assessment of C++ ability; which Bloom levels held up; whether the "passport birth-date vs. age" analogy for compute-on-read landed; any clamping/ownership confusion.
- Offer to schedule L02 (C++ language essentials) a few days out; queue carry-over questions q-review #1 and #2 above.
