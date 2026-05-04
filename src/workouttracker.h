// ---------------------------------------------------------------------------
// WorkoutTracker - the singleton hub for everything set-tracking.
//
// Responsibilities:
//   * Hold every Exercise (one per movement name) and every Set logged.
//   * Group sets into Workouts (one per calendar day) so the user can see
//     each gym day as a discrete unit and so progress graphs aggregate
//     "best of the day" rather than every single set.
//   * Provide Q_INVOKABLE methods QML can call to log a new set, list
//     unique exercise names, and pull series data for the progress graph.
//   * Hold the user's named splits (Push/Pull/Legs, "Tyler's Push A", etc.)
//     so workouts can be started from a saved template.
//   * Notify QML whenever the underlying data changes so charts/lists redraw.
//
// Data is held in memory for now; persistence (SQLite/JSON) is planned but
// outside the scope of "landing + sign-up + set tracking + graphing".
// ---------------------------------------------------------------------------

#ifndef PEAKFETTLE_WORKOUTTRACKER_H
#define PEAKFETTLE_WORKOUTTRACKER_H

#include <QObject>
#include <QHash>
#include <QString>
#include <QStringList>
#include <QVariantList>
#include <QVariantMap>
#include <QDateTime>
#include <qqml.h>

#include "exercise.h"
#include "set.h"

class WorkoutTracker : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON

    // Total number of sets logged across all exercises - drives the
    // "X sets logged" badge on the tracker page.
    Q_PROPERTY(int totalSets READ totalSets NOTIFY dataChanged)
    Q_PROPERTY(QStringList exerciseNames READ exerciseNames NOTIFY dataChanged)
    Q_PROPERTY(QStringList routineNames  READ routineNames  NOTIFY dataChanged)

public:
    explicit WorkoutTracker(QObject *parent = nullptr);

    int totalSets() const;
    QStringList exerciseNames() const;
    QStringList routineNames()  const;

    // ----- Logging API (callable from QML) -----

    // Logs a new set under the given exercise name (created on first use).
    // weightKg may be 0 for bodyweight movements; reps must be > 0.
    // rir defaults to -1 ("not recorded"). RIR 0 means taken to failure.
    // Returns the assigned set id (0 on rejection).
    Q_INVOKABLE qint64 logSet(const QString &exerciseName,
                              double weightKg,
                              int reps,
                              int rir = -1);

    // Same as logSet but lets the caller backdate the entry.
    // Returns the assigned set id (0 on rejection).
    Q_INVOKABLE qint64 logSetAt(const QString &exerciseName,
                                double weightKg,
                                int reps,
                                int rir,
                                const QDateTime &timestamp);

    // ---- TICKET-010: Cardio logging ----
    // Log a cardio activity (run, row, bike, etc.) in the same session as
    // lift sets. distanceM and avgPaceSecPerKm may be passed as -1 when not
    // tracked (e.g. a timed HIIT session with no GPS).
    Q_INVOKABLE qint64 logCardioSet(const QString &exerciseName,
                                    int durationSec,
                                    double distanceM = -1.0,
                                    double avgPaceSecPerKm = -1.0);

    Q_INVOKABLE qint64 logCardioSetAt(const QString &exerciseName,
                                      int durationSec,
                                      double distanceM,
                                      double avgPaceSecPerKm,
                                      const QDateTime &timestamp);

    // ----- Editing / deletion -----
    //
    // These take the stable Set::id() returned by logSet/logSetAt and
    // surfaced in recentSets() so QML can refer back to a specific row.

    // Update an existing set in place. Returns true if found and updated.
    Q_INVOKABLE bool editSet(qint64 setId,
                             const QString &exerciseName,
                             double weightKg,
                             int reps,
                             int rir,
                             const QDateTime &timestamp);

    // Convenience: change just the timestamp of an existing set.
    Q_INVOKABLE bool retimeSet(qint64 setId, const QDateTime &timestamp);

    // Delete a set. Returns true if found.
    Q_INVOKABLE bool deleteSet(qint64 setId);

    // Returns recent sets (most recent first), capped at `limit`.
    // Each entry is a QVariantMap with keys: exercise, weight, reps, rir, rpe,
    // timestamp, dayKey, volume - convenient for QML ListView delegates.
    Q_INVOKABLE QVariantList recentSets(int limit = 25) const;

    // ----- Progress series -----
    //
    // Returns a chronologically-ordered series for graphing.
    //
    // metric is one of:
    //   "weight"         - heaviest set's load
    //   "volume"         - tonnage (weight * reps)
    //   "e1rm"           - Epley estimated 1RM     (DEFAULT)
    //   "strengthScore"  - gamified 0-1000 score derived from e1rm
    //
    // Aggregation: by default we return ONE point per training day - the
    // BEST value for that metric on that day. This avoids the "your second
    // set to failure made you look weaker" graph artifact that beta tester
    // Marcus and the founder both flagged on 2026-04-30.
    //
    // If perSet=true the function returns every set instead, primarily for
    // debug / data export. UI should never pass true here.
    //
    // Each point is { x: dayIndex (1, 2, 3, ...), date: ms-since-epoch,
    //                 y: <metric value>, reps, weight, dayKey }.
    Q_INVOKABLE QVariantList progressSeries(const QString &exerciseName,
                                            const QString &metric = QStringLiteral("e1rm"),
                                            bool perSet = false) const;

    // For convenience: stats for a specific exercise.
    Q_INVOKABLE QVariantMap exerciseStats(const QString &exerciseName) const;

    // ----- Percentile (2026-05-03) -----
    //
    // Compute the user's strength percentile for a single exercise. Reads
    // the user's age, sex, bodyweight, years_training from UserProfile;
    // takes the exercise's current Epley E1RM as the lift weight to score.
    //
    // QVariantMap keys returned:
    //   exercise       - name (echoed)
    //   liftId         - canonical id resolved by StrengthCurve, or ""
    //   hasModel       - true when both a lift vector and a complete profile
    //                    are present AND at least one set has been logged
    //   percentile     - 0..100 (only valid when hasModel is true)
    //   e1rmKg         - the Epley E1RM that was scored
    //   expectedKg     - the model's L_50 for the user's profile
    //   extrapolated   - true when BW/age fell outside the calibrated band
    //   reason         - short human string for the UI when hasModel is false
    Q_INVOKABLE QVariantMap percentileForExercise(const QString &exerciseName) const;

    // Convenience: percentiles for every tracked exercise, sorted by
    // percentile descending (with unranked exercises pushed to the end).
    // Drives PercentilesPage's list view.
    Q_INVOKABLE QVariantList percentilesForAll() const;

    // ----- Routines (custom splits) -----
    //
    // A routine is a saved, named workout template - e.g. "Push A",
    // "Tuesday Lower", "Marcus PPL Day 3". Users can build a routine from
    // any combination of exercises and reuse it on subsequent training days.

    // Save a new routine. Returns "" on success or an error string.
    // exerciseList is a JSON array of exercise names, e.g. ["Bench", "Row"].
    Q_INVOKABLE QString saveRoutine(const QString &name,
                                    const QVariantList &exerciseList);

    // Returns { name, exercises: [ ... ], isTemplate, description } for a
    // routine, or an empty map.
    Q_INVOKABLE QVariantMap routine(const QString &name) const;

    // List of every routine with its full metadata, suitable for a ListView.
    // Templates are listed first, then the user's custom routines, both
    // sorted alphabetically within each group.
    Q_INVOKABLE QVariantList routineList() const;

    // Delete a routine. Returns true if it existed.
    Q_INVOKABLE bool deleteRoutine(const QString &name);

    // Wipes all data - used by the "clear" button on the tracker page.
    Q_INVOKABLE void clearAll();

signals:
    void dataChanged();
    void setLogged(const QString &exerciseName);

private:
    Exercise *findOrCreate(const QString &name);

    // Locate a Set by its stable id. Returns {nullptr, nullptr} on miss.
    // The Exercise pointer is needed by deleteSet so it can detach the Set
    // from its parent's vector before deletion.
    struct SetLocation { Exercise *exercise; Set *set; };
    SetLocation findSet(qint64 setId) const;

    // Pre-seed the routines library with industry-standard splits the user
    // can adopt without configuration. See workouttracker.cpp for the
    // exercise lists and rationale.
    void seedDefaultRoutines();

    // Convenience: convert an Epley e1RM (kg) into a 0-1000 "strength score"
    // for the gamified chart view. Calibration target (intermediate male
    // bench): 100 kg e1rm -> ~600 score. The exact curve is intentionally
    // gentle so beginners see frequent small bumps.
    static double computeStrengthScore(double e1rmKg);

    // name -> Exercise. QHash so logSet is O(1) on every additional rep.
    QHash<QString, Exercise *> m_exercises;

    // Saved routines by name. `isTemplate` is true for the pre-seeded
    // PPL / Upper-Lower starters; the UI uses it to render those rows
    // distinctly (a small "Template" pill) so users can tell their custom
    // routines apart from the bundled ones.
    struct Routine {
        QString     name;
        QStringList exercises;
        bool        isTemplate = false;
        QString     description;       // shown as subtitle in the routine list
    };
    QHash<QString, Routine> m_routines;
};

#endif // PEAKFETTLE_WORKOUTTRACKER_H
