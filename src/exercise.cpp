#include "exercise.h"

Exercise::Exercise(QObject *parent)
    : QObject(parent)
{}

Exercise::Exercise(const QString &name, QObject *parent)
    : QObject(parent), m_name(name)
{}

void Exercise::setName(const QString &v) {
    if (m_name == v) return;
    m_name = v;
    emit nameChanged();
}

double Exercise::totalVolume() const {
    double sum = 0.0;
    for (const Set *s : m_sets)
        sum += s->volume();
    return sum;
}

double Exercise::personalRecordWeight() const {
    double pr = 0.0;
    for (const Set *s : m_sets)
        if (s->weightKg() > pr) pr = s->weightKg();
    return pr;
}

double Exercise::estimatedOneRepMax() const {
    // Epley: 1RM = w * (1 + reps/30). Only meaningful for reps >= 2;
    // beyond ~12 reps the formula loses accuracy, but we still surface a value.
    //
    // N-03/X-04 (2026-05-03): when reps == 1 the user already performed a
    // true 1-rep-max attempt — return weightKg directly so a 200 kg single
    // shows as exactly 200 kg, not 206.7 kg (3.3% Epley inflation).
    // This function feeds exerciseStats(), percentileForExercise(), and
    // percentilesForAll() — inflated inputs would push users to artificially
    // high cohort percentiles.
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

void Exercise::addSet(Set *s) {
    if (!s) return;
    s->setParent(this);          // take ownership so Qt cleans it up
    m_sets.append(s);
    emit setsChanged();
}
