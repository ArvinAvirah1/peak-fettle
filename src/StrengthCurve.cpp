// ---------------------------------------------------------------------------
// StrengthCurve.cpp — implementation of the percentile model.
// Source-of-truth math: strength_curve_model.md §3 + §5.
// ---------------------------------------------------------------------------

#include "StrengthCurve.h"

#include <QHash>
#include <QString>
#include <algorithm>
#include <cmath>

namespace {

// ---- Model constants (defaults from strength_curve_model.md §2.2) ----
constexpr double kAgeYouthBoundary = 23.0;    // Aₚₗ
constexpr double kAgePeakUpper     = 35.0;    // Aₚₕ
constexpr double kGammaYouth       = 0.012;   // youth deficit per year
constexpr double kGammaDecline     = 0.010;   // post-peak decline per year
constexpr double kAgeFloor         = 0.40;    // never go below 40% of peak
constexpr double kTrainingFloor    = 0.55;    // f₀: novice fraction of asymptote
constexpr double kTrainingTau      = 3.0;     // τ in years
constexpr double kBwClampMaleHi    = 210.0;
constexpr double kBwClampFemaleHi  = 150.0;
constexpr double kBwClampLow       = 40.0;
constexpr double kAgeClampLow      = 14.0;
constexpr double kAgeClampHigh     = 90.0;

// ---- Lift vector table (model_version = 1) ----
//
// Mirror of lift_vectors_seed.sql. parentId == nullptr means a direct fit
// (mu, sigma, alpha, bwRef are the fitted values). When parentId is set,
// only `ratio` is used and the other fields are inherited from the parent
// at lookup time. This is the same scheme the SQL function uses.
//
// Only the lifts the bundled routines (PPL + Upper/Lower) actually contain
// are listed; anything else returns hasModel=false. Adding a new entry is
// a one-line append.
struct LiftRow {
    const char *liftId;
    char        sex;          // 'M' or 'F'
    const char *parentId;     // nullptr = direct fit
    double      mu;
    double      sigma;
    double      alpha;
    double      bwRef;        // kg
    double      ratio;        // only used when parentId != nullptr
};

constexpr LiftRow kLiftVectors[] = {
    // ---- Direct fits (the big 4 + barbell row) ----
    { "back_squat",      'M', nullptr, 4.7228, 0.3107, 0.667, 75.0, 0.0 },
    { "back_squat",      'F', nullptr, 4.1744, 0.2934, 0.667, 65.0, 0.0 },
    { "bench_press",     'M', nullptr, 4.3175, 0.2466, 0.667, 75.0, 0.0 },
    { "bench_press",     'F', nullptr, 3.8177, 0.2749, 0.667, 65.0, 0.0 },
    { "deadlift",        'M', nullptr, 4.8767, 0.2741, 0.667, 75.0, 0.0 },
    { "deadlift",        'F', nullptr, 4.4067, 0.2697, 0.667, 65.0, 0.0 },
    { "overhead_press",  'M', nullptr, 3.8849, 0.2913, 0.667, 75.0, 0.0 },
    { "overhead_press",  'F', nullptr, 3.3781, 0.3105, 0.667, 65.0, 0.0 },
    { "barbell_row",     'M', nullptr, 4.2049, 0.2466, 0.667, 75.0, 0.0 },
    { "barbell_row",     'F', nullptr, 3.7124, 0.2749, 0.667, 65.0, 0.0 },

    // ---- Inherited (squat family) ----
    { "front_squat",          'M', "back_squat",     0,0,0,0, 0.85 },
    { "front_squat",          'F', "back_squat",     0,0,0,0, 0.85 },
    { "low_bar_squat",        'M', "back_squat",     0,0,0,0, 1.05 },
    { "low_bar_squat",        'F', "back_squat",     0,0,0,0, 1.05 },
    { "high_bar_squat",       'M', "back_squat",     0,0,0,0, 0.95 },
    { "high_bar_squat",       'F', "back_squat",     0,0,0,0, 0.95 },
    { "leg_press_machine",    'M', "back_squat",     0,0,0,0, 2.50 },
    { "leg_press_machine",    'F', "back_squat",     0,0,0,0, 2.50 },
    { "bulgarian_split_squat",'M', "back_squat",     0,0,0,0, 0.40 },
    { "bulgarian_split_squat",'F', "back_squat",     0,0,0,0, 0.40 },
    { "goblet_squat",         'M', "back_squat",     0,0,0,0, 0.45 },
    { "goblet_squat",         'F', "back_squat",     0,0,0,0, 0.45 },

    // ---- Inherited (bench family) ----
    { "incline_bench_press",  'M', "bench_press",    0,0,0,0, 0.78 },
    { "incline_bench_press",  'F', "bench_press",    0,0,0,0, 0.78 },
    { "close_grip_bench",     'M', "bench_press",    0,0,0,0, 0.90 },
    { "close_grip_bench",     'F', "bench_press",    0,0,0,0, 0.90 },
    { "dumbbell_bench_press", 'M', "bench_press",    0,0,0,0, 0.42 },
    { "dumbbell_bench_press", 'F', "bench_press",    0,0,0,0, 0.42 },
    { "dumbbell_incline_press",'M',"bench_press",    0,0,0,0, 0.33 },
    { "dumbbell_incline_press",'F',"bench_press",    0,0,0,0, 0.33 },

    // ---- Inherited (deadlift family) ----
    { "romanian_deadlift",    'M', "deadlift",       0,0,0,0, 0.82 },
    { "romanian_deadlift",    'F', "deadlift",       0,0,0,0, 0.82 },
    { "stiff_leg_deadlift",   'M', "deadlift",       0,0,0,0, 0.78 },
    { "stiff_leg_deadlift",   'F', "deadlift",       0,0,0,0, 0.78 },
    { "trap_bar_deadlift",    'M', "deadlift",       0,0,0,0, 1.05 },
    { "trap_bar_deadlift",    'F', "deadlift",       0,0,0,0, 1.05 },

    // ---- Inherited (overhead family) ----
    { "push_press",           'M', "overhead_press", 0,0,0,0, 1.30 },
    { "push_press",           'F', "overhead_press", 0,0,0,0, 1.30 },
    { "seated_overhead_press",'M', "overhead_press", 0,0,0,0, 0.92 },
    { "seated_overhead_press",'F', "overhead_press", 0,0,0,0, 0.92 },
    { "dumbbell_shoulder_press",'M',"overhead_press",0,0,0,0, 0.42 },
    { "dumbbell_shoulder_press",'F',"overhead_press",0,0,0,0, 0.42 },

    // ---- Inherited (row family — using barbell_row as parent) ----
    { "seated_cable_row",     'M', "barbell_row",    0,0,0,0, 0.85 },
    { "seated_cable_row",     'F', "barbell_row",    0,0,0,0, 0.85 },
    { "pull_up",              'M', "barbell_row",    0,0,0,0, 0.75 },
    { "pull_up",              'F', "barbell_row",    0,0,0,0, 0.75 },
    { "weighted_pull_up",     'M', "barbell_row",    0,0,0,0, 0.95 },
    { "weighted_pull_up",     'F', "barbell_row",    0,0,0,0, 0.95 },
};

// ---- Standard normal CDF (Abramowitz & Stegun 26.2.17) ----
//
// We avoid pulling in <numbers> / std::erf complications by hand-rolling
// the Hart-style approximation. Accurate to ~7.5e-8 across the whole real
// line — overkill for a 0..100 percentile UI.
double phi(double z)
{
    return 0.5 * (1.0 + std::erf(z / std::sqrt(2.0)));
}

// Look up a row by (id, sex) in the static table. Returns nullptr on miss.
const LiftRow *findRow(const QString &liftId, char sex)
{
    for (const LiftRow &r : kLiftVectors) {
        if (r.sex == sex && liftId == QLatin1String(r.liftId))
            return &r;
    }
    return nullptr;
}

// Resolve a (possibly inherited) row down to its effective (mu, sigma,
// alpha, bwRef). Returns true on success.
bool resolveRow(const LiftRow *row, double &mu, double &sigma,
                double &alpha, double &bwRef)
{
    if (!row) return false;
    if (!row->parentId) {
        mu    = row->mu;
        sigma = row->sigma;
        alpha = row->alpha;
        bwRef = row->bwRef;
        return true;
    }
    const LiftRow *parent = findRow(QLatin1String(row->parentId), row->sex);
    if (!parent || parent->parentId) return false;   // no chained inheritance
    // Child mu = parent mu + log(ratio); sigma/alpha/bwRef inherited.
    mu    = parent->mu + std::log(row->ratio);
    sigma = parent->sigma;
    alpha = parent->alpha;
    bwRef = parent->bwRef;
    return true;
}

// ---- Exercise-name → lift_id mapping ----
//
// These names match WorkoutTracker::seedDefaultRoutines() and the canonical
// strings the ExerciseLibrary uses. Lower-case lookup is forgiving of user
// typos in capitalisation but not of free-text variation.
const QHash<QString, QString> &nameMap()
{
    static const QHash<QString, QString> kMap = {
        // Big 4
        { "barbell bench press",    "bench_press" },
        { "bench press",            "bench_press" },
        { "back squat",             "back_squat"  },
        { "squat",                  "back_squat"  },
        { "deadlift",               "deadlift"    },
        { "conventional deadlift",  "deadlift"    },
        { "overhead press",         "overhead_press" },
        { "ohp",                    "overhead_press" },
        // Row family
        { "barbell row",            "barbell_row" },
        { "bent over row",          "barbell_row" },
        { "seated cable row",       "seated_cable_row" },
        { "pull-up",                "pull_up"     },
        { "pullup",                 "pull_up"     },
        { "weighted pull-up",       "weighted_pull_up" },
        // Squat family
        { "front squat",            "front_squat" },
        { "low bar squat",          "low_bar_squat" },
        { "high bar squat",         "high_bar_squat" },
        { "leg press",              "leg_press_machine" },
        { "bulgarian split squat",  "bulgarian_split_squat" },
        { "goblet squat",           "goblet_squat" },
        // Bench family
        { "incline bench press",    "incline_bench_press" },
        { "close grip bench",       "close_grip_bench" },
        { "dumbbell bench press",   "dumbbell_bench_press" },
        { "incline dumbbell press", "dumbbell_incline_press" },
        // Deadlift family
        { "romanian deadlift",      "romanian_deadlift" },
        { "stiff leg deadlift",     "stiff_leg_deadlift" },
        { "trap bar deadlift",      "trap_bar_deadlift" },
        // Overhead family
        { "push press",             "push_press" },
        { "seated overhead press",  "seated_overhead_press" },
        { "dumbbell shoulder press","dumbbell_shoulder_press" },
    };
    return kMap;
}

} // namespace

namespace StrengthCurve {

QString liftIdForExerciseName(const QString &exerciseName)
{
    return nameMap().value(exerciseName.trimmed().toLower(), QString());
}

Result percentile(const QString &liftId,
                  const QString &sex,
                  double bodyweightKg,
                  int    ageYears,
                  int    yearsTraining,
                  double liftKg)
{
    Result out;
    out.liftId = liftId;

    // ---- Input validation ----
    if (liftKg <= 0.0)         return out;
    if (bodyweightKg <= 0.0)   return out;
    if (sex != QStringLiteral("M") && sex != QStringLiteral("F")) return out;

    const char sx = (sex == QStringLiteral("M")) ? 'M' : 'F';
    const LiftRow *row = findRow(liftId, sx);
    if (!row) return out;            // unknown lift → hasModel stays false

    double mu, sigma, alpha, bwRef;
    if (!resolveRow(row, mu, sigma, alpha, bwRef)) return out;
    if (sigma <= 0.0) return out;    // defensive — bad seed data

    // ---- Boundary handling (strength_curve_model.md §5) ----
    bool extrapolated = false;
    const double bwHi = (sx == 'M') ? kBwClampMaleHi : kBwClampFemaleHi;
    double bw = bodyweightKg;
    if (bw < kBwClampLow || bw > bwHi) {
        extrapolated = true;
        bw = std::clamp(bw, kBwClampLow, bwHi);
    }
    double age = static_cast<double>(ageYears);
    if (age < kAgeClampLow || age > kAgeClampHigh) {
        extrapolated = true;
        age = std::clamp(age, kAgeClampLow, kAgeClampHigh);
    }
    const double yrs = std::clamp(static_cast<double>(yearsTraining), 0.0, 30.0);

    // ---- Factor 1: bodyweight allometric ----
    const double bwFactor = std::pow(bw / bwRef, alpha);

    // ---- Factor 2: piecewise age curve ----
    double ageFactor;
    if (age < kAgeYouthBoundary) {
        ageFactor = 1.0 - kGammaYouth * (kAgeYouthBoundary - age);
    } else if (age <= kAgePeakUpper) {
        ageFactor = 1.0;
    } else {
        ageFactor = std::max(kAgeFloor,
                             1.0 - kGammaDecline * (age - kAgePeakUpper));
    }

    // ---- Factor 3: training-experience kinetics ----
    const double trainFactor = kTrainingFloor
        + (1.0 - kTrainingFloor) * (1.0 - std::exp(-yrs / kTrainingTau));

    // ---- Expected median lift L₅₀ ----
    const double l50 = std::exp(mu) * bwFactor * ageFactor * trainFactor;
    if (l50 <= 0.0) return out;

    // ---- z-score and percentile ----
    double z = (std::log(liftKg) - std::log(l50)) / sigma;
    z = std::clamp(z, -4.0, 4.0);
    const double pct = 100.0 * phi(z);

    out.percentile   = std::clamp(pct, 0.003, 99.997);
    out.expectedKg   = l50;
    out.hasModel     = true;
    out.extrapolated = extrapolated;
    return out;
}

} // namespace StrengthCurve
