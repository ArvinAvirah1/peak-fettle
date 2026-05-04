// ---------------------------------------------------------------------------
// StrengthCurve.h — closed-form percentile calculator (model_version = 1).
//
// This is the C++ port of compute_percentile.sql + lift_vectors_seed.sql,
// boiled down to the subset Peak Fettle ships in v1. The math is fully
// specified in strength_curve_model.md; this header only documents the
// public API and the structure of the embedded vector table.
//
// Two big differences from the SQL implementation:
//
//   1. Vectors are baked into the binary (see StrengthCurve.cpp's
//      kLiftVectors[]) instead of read from a database row. We only need
//      ~30 entries for v1 and a static table is the lowest-friction way to
//      ship this without a backend.
//
//   2. Inheritance is resolved at lookup time the same way the SQL function
//      does — child mu = parent mu + log(ratio). Coefficient sigma/alpha
//      come from the parent.
//
// The exercise-name-to-lift-id mapping mirrors the canonical names used in
// WorkoutTracker::seedDefaultRoutines() and ExerciseLibrary, so a typical
// new user's tracked exercises will resolve out of the box. Names that
// don't map are reported as unranked rather than guessed at.
//
// Authors: dev-data + dev-frontend
// Date: 2026-05-03
// ---------------------------------------------------------------------------

#ifndef PEAKFETTLE_STRENGTHCURVE_H
#define PEAKFETTLE_STRENGTHCURVE_H

#include <QString>

namespace StrengthCurve {

// Percentile result. percentile is in [0, 100]. extrapolated is true when
// the user's bodyweight or age fell outside the model's calibrated band
// (the percentile is still returned, but the UI should soften it).
struct Result {
    double  percentile  = 0.0;   // 0..100
    double  expectedKg  = 0.0;   // L₅₀ for the user's profile
    bool    hasModel    = false; // false → exercise not in the lift table
    bool    extrapolated= false; // true → BW/age outside calibrated band
    QString liftId;              // resolved canonical id (e.g. "bench_press")
};

// Map a free-text exercise name to a canonical lift_id. Returns "" if no
// known mapping (caller should treat as unranked).
QString liftIdForExerciseName(const QString &exerciseName);

// Compute the percentile for a 1RM-equivalent weight under the model.
//
// Inputs:
//   liftId         — output of liftIdForExerciseName (or a hard-coded id)
//   sex            — "M" / "F" (other values → hasModel = false)
//   bodyweightKg   — user's bodyweight, kg
//   ageYears       — user's age, integer years
//   yearsTraining  — years of consistent strength training (0..30)
//   liftKg         — the lift weight to score, kg (already 1RM-converted)
//
// All inputs are validated. Out-of-band BW/age trigger `extrapolated=true`
// rather than rejection — beta tester Linda would not appreciate seeing
// "we can't rank you because you're 13" on her son's profile.
Result percentile(const QString &liftId,
                  const QString &sex,
                  double bodyweightKg,
                  int    ageYears,
                  int    yearsTraining,
                  double liftKg);

} // namespace StrengthCurve

#endif // PEAKFETTLE_STRENGTHCURVE_H
