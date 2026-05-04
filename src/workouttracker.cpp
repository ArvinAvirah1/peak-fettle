#include "workouttracker.h"

#include <QVariantMap>
#include <QMap>
#include <algorithm>
#include <cmath>

#include "StrengthCurve.h"
#include "UserProfile.h"

WorkoutTracker::WorkoutTracker(QObject *parent)
    : QObject(parent)
{
    // Bundle the industry-standard splits so the free tier is genuinely
    // usable from first launch (per INSTRUCTIONS.md "Free Tier" - "library
    // of static training templates that users can follow as a structured
    // starting point"). Pre-seed runs once during construction; templates
    // are also immune to clearAll() so the user can't accidentally wipe
    // the library while clearing their own data.
    seedDefaultRoutines();
}

int WorkoutTracker::totalSets() const {
    int n = 0;
    for (const Exercise *e : m_exercises) n += e->setCount();
    return n;
}

QStringList WorkoutTracker::exerciseNames() const {
    QStringList names = m_exercises.keys();
    std::sort(names.begin(), names.end(), [](const QString &a, const QString &b) {
        return a.compare(b, Qt::CaseInsensitive) < 0;
    });
    return names;
}

QStringList WorkoutTracker::routineNames() const {
    QStringList names = m_routines.keys();
    std::sort(names.begin(), names.end(), [](const QString &a, const QString &b) {
        return a.compare(b, Qt::CaseInsensitive) < 0;
    });
    return names;
}

Exercise *WorkoutTracker::findOrCreate(const QString &name) {
    auto it = m_exercises.find(name);
    if (it != m_exercises.end()) return it.value();

    auto *ex = new Exercise(name, this);
    m_exercises.insert(name, ex);
    return ex;
}

WorkoutTracker::SetLocation WorkoutTracker::findSet(qint64 setId) const {
    if (setId <= 0) return { nullptr, nullptr };
    for (Exercise *e : m_exercises) {
        for (Set *s : e->sets()) {
            if (s->id() == setId) return { e, s };
        }
    }
    return { nullptr, nullptr };
}

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
    const QString name = exerciseName.trimmed();
    // N-15: cap exercise names at 100 characters. Names longer than this are
    // almost certainly a paste error or a backend overflow risk. The Supabase
    // migration adds a matching CHECK (length(name) <= 100) constraint.
    if (name.isEmpty() || name.length() > 100 || reps <= 0) return 0;

    const QDateTime ts = timestamp.isValid()
                             ? timestamp
                             : QDateTime::currentDateTime();

    Exercise *ex = findOrCreate(name);
    auto *s = new Set(name, weightKg, reps, rir, ts);
    ex->addSet(s);

    emit setLogged(name);
    emit dataChanged();
    return s->id();
}

// ---- TICKET-010: Cardio logging implementation ----

qint64 WorkoutTracker::logCardioSet(const QString &exerciseName,
                                    int durationSec,
                                    double distanceM,
                                    double avgPaceSecPerKm)
{
    return logCardioSetAt(exerciseName, durationSec, distanceM, avgPaceSecPerKm,
                          QDateTime::currentDateTime());
}

qint64 WorkoutTracker::logCardioSetAt(const QString &exerciseName,
                                      int durationSec,
                                      double distanceM,
                                      double avgPaceSecPerKm,
                                      const QDateTime &timestamp)
{
    const QString name = exerciseName.trimmed();
    // durationSec == 0 or negative is meaningless for a cardio entry.
    if (name.isEmpty() || durationSec <= 0) return 0;

    const QDateTime ts = timestamp.isValid()
                             ? timestamp
                             : QDateTime::currentDateTime();

    // Auto-compute pace when distance is known but pace was not supplied.
    // distanceM is in metres; pace is sec per km, so: pace = durationSec / (distanceM / 1000).
    double pace = avgPaceSecPerKm;
    if (pace < 0.0 && distanceM > 0.0)
        pace = durationSec / (distanceM / 1000.0);

    Exercise *ex = findOrCreate(name);
    auto *s = Set::makeCardio(name, durationSec, distanceM, pace, ts, this);
    ex->addSet(s);

    emit setLogged(name);
    emit dataChanged();
    return s->id();
}

bool WorkoutTracker::editSet(qint64 setId,
                             const QString &exerciseName,
                             double weightKg,
                             int reps,
                             int rir,
                             const QDateTime &timestamp)
{
    if (reps <= 0) return false;

    SetLocation loc = findSet(setId);
    if (!loc.set) return false;

    const QString newName = exerciseName.trimmed();

    // If the exercise name changed, move the Set to the new Exercise's
    // bucket. We do NOT collapse the old bucket if it becomes empty -
    // the user may want to re-add to it later, and the empty group is
    // harmless except for an extra entry in exerciseNames.
    if (!newName.isEmpty() && newName != loc.exercise->name()) {
        // Remove from old exercise (Exercise has no removeSet helper, so
        // we mutate the underlying vector by re-parenting elsewhere).
        // To avoid a deeper refactor we instead delete-and-recreate the
        // set under the new exercise; ids are not preserved across this
        // path because the dialog passes back the same fields anyway.
        const QDateTime ts = timestamp.isValid()
                                 ? timestamp
                                 : QDateTime::currentDateTime();
        // Update old set's content, then move it.
        // QVector lacks an O(1) remove-by-pointer, but the typical recent
        // list is small (months of training). Linear scan is fine.
        QVector<Set *> &oldSets = const_cast<QVector<Set *> &>(loc.exercise->sets());
        const int idx = oldSets.indexOf(loc.set);
        if (idx >= 0) oldSets.removeAt(idx);

        // N-06: if the old exercise bucket is now empty, purge it from the
        // exercises map so it doesn't ghost-appear in exerciseNames() and the
        // progress graph exercise selector. deleteLater() is safe here because
        // we've already detached all references to the exercise pointer.
        if (loc.exercise->setCount() == 0) {
            const QString oldName = loc.exercise->name();
            m_exercises.remove(oldName);
            loc.exercise->deleteLater();
        }

        Exercise *newEx = findOrCreate(newName);
        loc.set->setExerciseName(newName);
        loc.set->setWeightKg(weightKg);
        loc.set->setReps(reps);
        loc.set->setRir(rir);
        loc.set->setTimestamp(ts);
        // Re-attach: addSet handles the parenting + setsChanged emission.
        newEx->addSet(loc.set);

        // Notify both old and new exercise listeners that their counts shifted.
        emit dataChanged();
        return true;
    }

    // In-place update path (no exercise change).
    loc.set->setWeightKg(weightKg);
    loc.set->setReps(reps);
    loc.set->setRir(rir);
    if (timestamp.isValid()) loc.set->setTimestamp(timestamp);

    emit dataChanged();
    return true;
}

bool WorkoutTracker::retimeSet(qint64 setId, const QDateTime &timestamp)
{
    SetLocation loc = findSet(setId);
    if (!loc.set || !timestamp.isValid()) return false;
    loc.set->setTimestamp(timestamp);
    emit dataChanged();
    return true;
}

bool WorkoutTracker::deleteSet(qint64 setId)
{
    SetLocation loc = findSet(setId);
    if (!loc.set) return false;

    QVector<Set *> &v = const_cast<QVector<Set *> &>(loc.exercise->sets());
    const int idx = v.indexOf(loc.set);
    if (idx >= 0) v.removeAt(idx);

    loc.set->deleteLater();
    emit dataChanged();
    return true;
}

QVariantList WorkoutTracker::recentSets(int limit) const {
    // Flatten every set across every exercise, sort by time desc, then trim.
    // Also build a per-exercise PR table so each row can carry an isPr flag
    // for TICKET-008: the badge shows on the set that matches the current best
    // weight for that exercise (bodyweight sets are excluded — weight == 0).
    QVector<const Set *> all;

    // Pre-compute each exercise's peak weight so the output loop is O(1) per set.
    QHash<QString, double> prWeight;   // exerciseName -> peak weightKg
    QHash<QString, double> prE1rm;     // exerciseName -> peak Epley E1RM
    for (const Exercise *e : m_exercises) {
        prWeight.insert(e->name(), e->personalRecordWeight());
        prE1rm.insert(e->name(), e->estimatedOneRepMax());
        for (const Set *s : e->sets())
            all.append(s);
    }

    std::sort(all.begin(), all.end(), [](const Set *a, const Set *b) {
        return a->timestamp() > b->timestamp();
    });

    if (limit > 0 && all.size() > limit) all.resize(limit);

    QVariantList out;
    out.reserve(all.size());
    for (const Set *s : all) {
        // E1RM for this set via Epley.
        // N-03: reps <= 1 is already a 1-rep-max attempt — return weightKg
        // directly so a 200 kg single shows as exactly 200 kg, not 206.7 kg.
        // Epley is only meaningful for 2+ reps.
        const double e1rmThis = (s->reps() > 1)
            ? s->weightKg() * (1.0 + s->reps() / 30.0)
            : s->weightKg();

        // Mark as a PR if this set's E1RM equals the exercise's current best
        // (ties count — the badge shows on the day the bar moved furthest).
        // Skip bodyweight sets (weightKg == 0) — there's no meaningful "heaviest".
        const double bestE1rm = prE1rm.value(s->exerciseName(), 0.0);
        const bool   isPr = s->weightKg() > 0.0 && bestE1rm > 0.0
                            && std::abs(e1rmThis - bestE1rm) < 0.01;

        QVariantMap m;
        m.insert("id",              static_cast<qulonglong>(s->id()));
        m.insert("exercise",        s->exerciseName());
        m.insert("kind",            s->kind());           // "lift" | "cardio"

        // ---- Lift fields ----
        m.insert("weight",          s->weightKg());
        m.insert("reps",            s->reps());
        m.insert("rir",             s->rir());
        m.insert("rpe",             s->rpe());            // legacy passthrough
        m.insert("volume",          s->volume());
        m.insert("isPr",            isPr);                // TICKET-008: PR badge signal

        // ---- Cardio fields (TICKET-010) ----
        // All three are -1 for lift sets (never touched); QML checks kind first.
        m.insert("durationSec",     s->durationSec());
        m.insert("distanceM",       s->distanceM());
        m.insert("avgPaceSecPerKm", s->avgPaceSecPerKm());

        m.insert("timestamp",       s->timestamp());
        m.insert("dayKey",          s->dayKey());
        out.append(m);
    }
    return out;
}

double WorkoutTracker::computeStrengthScore(double e1rmKg) {
    // Goal: an encouraging, gently-curved 0-1000 ramp.
    // Math: 1000 * (1 - exp(-k * e1rm)),  with k tuned so 100 kg ~= 600.
    //       Solve for k: 1 - exp(-k * 100) = 0.6   =>   k = -ln(0.4)/100 ~= 0.00916.
    if (e1rmKg <= 0.0) return 0.0;
    constexpr double k = 0.00916;
    const double score = 1000.0 * (1.0 - std::exp(-k * e1rmKg));
    if (score < 0.0)    return 0.0;
    if (score > 1000.0) return 1000.0;
    return score;
}

QVariantList WorkoutTracker::progressSeries(const QString &exerciseName,
                                            const QString &metric,
                                            bool perSet) const
{
    QVariantList out;
    auto it = m_exercises.constFind(exerciseName);
    if (it == m_exercises.constEnd()) return out;

    // ---- Stage 1: compute per-set y values (in chronological order) ----
    QVector<const Set *> sets;
    sets.reserve(it.value()->sets().size());
    for (const Set *s : it.value()->sets()) sets.append(s);

    std::sort(sets.begin(), sets.end(), [](const Set *a, const Set *b) {
        return a->timestamp() < b->timestamp();
    });

    auto valueFor = [&metric](const Set *s) -> double {
        if (metric == QLatin1String("weight"))         return s->weightKg();
        if (metric == QLatin1String("volume"))         return s->volume();
        // e1rm and strengthScore both rely on Epley first.
        // N-03: apply Epley only for 2+ reps; a single is already a 1RM.
        const double e1rm = (s->reps() > 1)
            ? s->weightKg() * (1.0 + s->reps() / 30.0)
            : s->weightKg();
        if (metric == QLatin1String("strengthScore"))
            return computeStrengthScore(e1rm);
        return e1rm;                                   // default: e1rm
    };

    if (perSet) {
        // ---- Per-set mode (debug / data export) ----
        out.reserve(sets.size());
        for (int i = 0; i < sets.size(); ++i) {
            const Set *s = sets[i];
            QVariantMap p;
            p.insert("x",      i + 1);                   // integer set index
            p.insert("date",   static_cast<qreal>(s->timestamp().toMSecsSinceEpoch()));
            p.insert("y",      valueFor(s));
            p.insert("reps",   s->reps());
            p.insert("weight", s->weightKg());
            p.insert("dayKey", s->dayKey());
            out.append(p);
        }
        return out;
    }

    // ---- Stage 2: aggregate to one BEST point per calendar day ----
    //
    // Why best-per-day? Beta tester Marcus on 2026-04-30 noticed that his
    // E1RM graph trended DOWN across a single training day - because his
    // second set was a back-off taken to failure. Plotting every set
    // confuses progress with intraworkout fatigue. The day's true progress
    // signal is the strongest set of the day.
    //
    // Volume is special: "best volume" naturally sums the whole day.
    QMap<QString, QVariantMap> bestByDay;     // QMap so iteration is sorted by dayKey
    for (const Set *s : sets) {
        const QString day = s->dayKey();
        const double y = valueFor(s);
        auto it2 = bestByDay.find(day);
        if (it2 == bestByDay.end()) {
            QVariantMap p;
            p.insert("y",      y);
            p.insert("reps",   s->reps());
            p.insert("weight", s->weightKg());
            p.insert("dayKey", day);
            p.insert("date",   static_cast<qreal>(s->timestamp().toMSecsSinceEpoch()));
            bestByDay.insert(day, p);
        } else {
            QVariantMap &p = it2.value();
            if (metric == QLatin1String("volume")) {
                // Sum tonnage across the day - that's what "daily volume" means.
                p["y"] = p["y"].toDouble() + y;
            } else if (y > p["y"].toDouble()) {
                p["y"]      = y;
                p["reps"]   = s->reps();
                p["weight"] = s->weightKg();
                p["date"]   = static_cast<qreal>(s->timestamp().toMSecsSinceEpoch());
            }
        }
    }

    // ---- Stage 3: emit, with a 1-based day index for the chart x-axis ----
    out.reserve(bestByDay.size());
    int idx = 1;
    for (auto it2 = bestByDay.constBegin(); it2 != bestByDay.constEnd(); ++it2, ++idx) {
        QVariantMap p = it2.value();
        p.insert("x", idx);                              // clean integer index
        out.append(p);
    }
    return out;
}

QVariantMap WorkoutTracker::exerciseStats(const QString &exerciseName) const {
    QVariantMap m;
    auto it = m_exercises.constFind(exerciseName);
    if (it == m_exercises.constEnd()) {
        m.insert("setCount",      0);
        m.insert("totalVolume",   0.0);
        m.insert("prWeight",      0.0);
        m.insert("e1rm",          0.0);
        m.insert("strengthScore", 0.0);
        return m;
    }
    Exercise *ex = it.value();
    const double e1rm = ex->estimatedOneRepMax();
    m.insert("setCount",      ex->setCount());
    m.insert("totalVolume",   ex->totalVolume());
    m.insert("prWeight",      ex->personalRecordWeight());
    m.insert("e1rm",          e1rm);
    m.insert("strengthScore", computeStrengthScore(e1rm));
    return m;
}

// ---------------------------------------------------------------------------
// Percentile API (2026-05-03)
//
// We construct a temporary UserProfile rather than holding a permanent
// reference. Reasons:
//   1. UserProfile is a QML singleton owned by the engine; threading the
//      pointer through every callsite means an extra constructor parameter.
//   2. Reading QSettings on the rare percentile call is cheap (microseconds).
// If percentile becomes hot (it won't — it's rendered on a single page) we
// can swap to a cached singleton lookup later.
// ---------------------------------------------------------------------------

QVariantMap WorkoutTracker::percentileForExercise(const QString &exerciseName) const
{
    QVariantMap out;
    out.insert("exercise",     exerciseName);
    out.insert("hasModel",     false);
    out.insert("percentile",   0.0);
    out.insert("e1rmKg",       0.0);
    out.insert("expectedKg",   0.0);
    out.insert("extrapolated", false);
    out.insert("liftId",       QString());
    out.insert("reason",       QString());

    // ---- Resolve the lift id first; cheap and helps the empty-state UI. ----
    const QString liftId = StrengthCurve::liftIdForExerciseName(exerciseName);
    out["liftId"] = liftId;
    if (liftId.isEmpty()) {
        out["reason"] = QStringLiteral("Not in v1 ranking model");
        return out;
    }

    // ---- Need at least one logged set to have an E1RM to score. ----
    auto it = m_exercises.constFind(exerciseName);
    if (it == m_exercises.constEnd() || it.value()->setCount() == 0) {
        out["reason"] = QStringLiteral("No sets yet");
        return out;
    }
    const double e1rm = it.value()->estimatedOneRepMax();
    out["e1rmKg"] = e1rm;
    if (e1rm <= 0.0) {
        out["reason"] = QStringLiteral("No sets yet");
        return out;
    }

    // ---- Need a complete profile (age + sex + years + bodyweight). ----
    UserProfile profile;     // loads from QSettings in its ctor
    if (!profile.isComplete()) {
        out["reason"] = QStringLiteral("Complete your profile to see ranking");
        return out;
    }

    StrengthCurve::Result r = StrengthCurve::percentile(
        liftId,
        profile.sex(),
        profile.bodyweightKg(),
        profile.ageYears(),
        profile.yearsTraining(),
        e1rm);

    if (!r.hasModel) {
        // Lift dropped out at the StrengthCurve layer (unknown sex etc.).
        out["reason"] = QStringLiteral("Insufficient profile data");
        return out;
    }

    out["hasModel"]     = true;
    out["percentile"]   = r.percentile;
    out["expectedKg"]   = r.expectedKg;
    out["extrapolated"] = r.extrapolated;
    return out;
}

QVariantList WorkoutTracker::percentilesForAll() const
{
    QVariantList rows;
    rows.reserve(m_exercises.size());
    for (const QString &name : exerciseNames()) {
        rows.append(percentileForExercise(name));
    }

    // Sort: ranked rows first (by percentile descending), then unranked
    // rows (alphabetically). This matches the wireframe — the lifts the
    // user is best at sit at the top, with "no model yet" rows tucked
    // below as a soft prompt to complete the profile or pick a known lift.
    std::sort(rows.begin(), rows.end(),
              [](const QVariant &a, const QVariant &b) {
                  const QVariantMap ma = a.toMap();
                  const QVariantMap mb = b.toMap();
                  const bool ha = ma.value("hasModel").toBool();
                  const bool hb = mb.value("hasModel").toBool();
                  if (ha != hb) return ha;          // ranked first
                  if (ha) return ma.value("percentile").toDouble()
                              >  mb.value("percentile").toDouble();
                  return ma.value("exercise").toString()
                       .compare(mb.value("exercise").toString(),
                                Qt::CaseInsensitive) < 0;
              });
    return rows;
}

QString WorkoutTracker::saveRoutine(const QString &name,
                                    const QVariantList &exerciseList)
{
    const QString trimmed = name.trimmed();
    if (trimmed.isEmpty())
        return QStringLiteral("Routine name cannot be empty.");
    if (exerciseList.isEmpty())
        return QStringLiteral("Add at least one exercise to the routine.");

    Routine r;
    r.name = trimmed;
    r.exercises.reserve(exerciseList.size());
    for (const QVariant &v : exerciseList) {
        const QString ex = v.toString().trimmed();
        if (!ex.isEmpty()) r.exercises.append(ex);
    }
    if (r.exercises.isEmpty())
        return QStringLiteral("Routine must contain at least one named exercise.");
    r.isTemplate = false;

    m_routines.insert(trimmed, r);
    emit dataChanged();
    return QString();
}

QVariantMap WorkoutTracker::routine(const QString &name) const {
    QVariantMap out;
    auto it = m_routines.constFind(name);
    if (it == m_routines.constEnd()) return out;
    out.insert("name",        it.value().name);
    out.insert("exercises",   QVariant(it.value().exercises));
    out.insert("isTemplate",  it.value().isTemplate);
    out.insert("description", it.value().description);
    return out;
}

QVariantList WorkoutTracker::routineList() const {
    // Templates first (sorted), then custom routines (sorted). Lets the UI
    // show "Templates" and "Your routines" as visually distinct groups
    // without doing the partition itself.
    QVector<Routine> templates;
    QVector<Routine> custom;
    for (const Routine &r : m_routines) {
        if (r.isTemplate) templates.append(r);
        else              custom.append(r);
    }
    auto byName = [](const Routine &a, const Routine &b) {
        return a.name.compare(b.name, Qt::CaseInsensitive) < 0;
    };
    std::sort(templates.begin(), templates.end(), byName);
    std::sort(custom.begin(),    custom.end(),    byName);

    QVariantList out;
    out.reserve(templates.size() + custom.size());
    auto pack = [](const Routine &r) {
        QVariantMap m;
        m.insert("name",        r.name);
        m.insert("exercises",   QVariant(r.exercises));
        m.insert("isTemplate",  r.isTemplate);
        m.insert("description", r.description);
        return m;
    };
    for (const Routine &r : templates) out.append(pack(r));
    for (const Routine &r : custom)    out.append(pack(r));
    return out;
}

bool WorkoutTracker::deleteRoutine(const QString &name) {
    // Templates are read-only - the user can clone them by saving a custom
    // routine but cannot accidentally delete them and lose the library.
    auto it = m_routines.find(name);
    if (it == m_routines.end()) return false;
    if (it.value().isTemplate)  return false;
    m_routines.erase(it);
    emit dataChanged();
    return true;
}

void WorkoutTracker::clearAll() {
    qDeleteAll(m_exercises);
    m_exercises.clear();

    // Wipe only USER routines. Pre-seeded templates persist - they're the
    // free-tier baseline and clearing data shouldn't strand the user with
    // no starter splits. (See INSTRUCTIONS.md - "library of static training
    // templates that users can follow as a structured starting point".)
    QHash<QString, Routine> kept;
    for (auto it = m_routines.constBegin(); it != m_routines.constEnd(); ++it) {
        if (it.value().isTemplate) kept.insert(it.key(), it.value());
    }
    m_routines = kept;

    emit dataChanged();
}

void WorkoutTracker::seedDefaultRoutines() {
    auto seed = [&](const QString &name,
                    const QString &description,
                    const QStringList &exercises) {
        Routine r;
        r.name        = name;
        r.exercises   = exercises;
        r.description = description;
        r.isTemplate  = true;
        m_routines.insert(name, r);
    };

    // ----- Push / Pull / Legs (PPL) -----
    //
    // Classic 3- or 6-day split. Each "day" trains a movement pattern
    // family rather than a body part. The exercise lists below are the
    // workhorse compounds + a couple of accessories per session - enough
    // to be a credible workout on day one without being so prescriptive
    // that every user runs the identical program.
    seed(QStringLiteral("Push Day (PPL)"),
         QStringLiteral("Chest, shoulders, triceps. Run on Mon/Thu in a 6-day PPL."),
         QStringList{
             QStringLiteral("Barbell Bench Press"),
             QStringLiteral("Overhead Press"),
             QStringLiteral("Incline Dumbbell Press"),
             QStringLiteral("Lateral Raise"),
             QStringLiteral("Triceps Pushdown"),
             QStringLiteral("Overhead Triceps Extension"),
         });

    seed(QStringLiteral("Pull Day (PPL)"),
         QStringLiteral("Back and biceps. Run on Tue/Fri in a 6-day PPL."),
         QStringList{
             QStringLiteral("Deadlift"),
             QStringLiteral("Pull-Up"),
             QStringLiteral("Barbell Row"),
             QStringLiteral("Seated Cable Row"),
             QStringLiteral("Face Pull"),
             QStringLiteral("Barbell Curl"),
             QStringLiteral("Hammer Curl"),
         });

    seed(QStringLiteral("Leg Day (PPL)"),
         QStringLiteral("Quads, hamstrings, glutes, calves. Run on Wed/Sat in a 6-day PPL."),
         QStringList{
             QStringLiteral("Back Squat"),
             QStringLiteral("Romanian Deadlift"),
             QStringLiteral("Leg Press"),
             QStringLiteral("Walking Lunge"),
             QStringLiteral("Leg Curl"),
             QStringLiteral("Standing Calf Raise"),
         });

    // ----- Upper / Lower (4-day) -----
    //
    // Friendlier than PPL for intermediates with limited time: two upper
    // sessions and two lower sessions per week, each balancing push+pull
    // or quad+hip patterns. Each day is heavy enough to drive progress
    // while keeping volume manageable.
    seed(QStringLiteral("Upper A (Upper/Lower)"),
         QStringLiteral("Heavy upper push focus + back support work."),
         QStringList{
             QStringLiteral("Barbell Bench Press"),
             QStringLiteral("Barbell Row"),
             QStringLiteral("Overhead Press"),
             QStringLiteral("Pull-Up"),
             QStringLiteral("Lateral Raise"),
             QStringLiteral("Barbell Curl"),
             QStringLiteral("Triceps Pushdown"),
         });

    seed(QStringLiteral("Lower A (Upper/Lower)"),
         QStringLiteral("Quad-dominant lower with posterior-chain support."),
         QStringList{
             QStringLiteral("Back Squat"),
             QStringLiteral("Romanian Deadlift"),
             QStringLiteral("Leg Press"),
             QStringLiteral("Leg Curl"),
             QStringLiteral("Standing Calf Raise"),
             QStringLiteral("Hanging Leg Raise"),
         });

    seed(QStringLiteral("Upper B (Upper/Lower)"),
         QStringLiteral("Pull-emphasis upper day with dumbbell/incline pressing."),
         QStringList{
             QStringLiteral("Weighted Pull-Up"),
             QStringLiteral("Incline Dumbbell Press"),
             QStringLiteral("Seated Cable Row"),
             QStringLiteral("Dumbbell Shoulder Press"),
             QStringLiteral("Face Pull"),
             QStringLiteral("Hammer Curl"),
             QStringLiteral("Overhead Triceps Extension"),
         });

    seed(QStringLiteral("Lower B (Upper/Lower)"),
         QStringLiteral("Hip-dominant lower with single-leg work."),
         QStringList{
             QStringLiteral("Deadlift"),
             QStringLiteral("Front Squat"),
             QStringLiteral("Walking Lunge"),
             QStringLiteral("Bulgarian Split Squat"),
             QStringLiteral("Seated Calf Raise"),
             QStringLiteral("Plank"),
         });
}
