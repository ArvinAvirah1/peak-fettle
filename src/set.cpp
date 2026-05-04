#include "set.h"

#include <algorithm>
#include <atomic>

// Process-local monotonic id counter. Starts at 1 so 0 can serve as a
// "no id / not assigned" sentinel in QML maps. Atomic for safety in case
// future code logs sets from a worker thread (currently single-threaded).
qint64 Set::nextId()
{
    static std::atomic<qint64> counter{0};
    return ++counter;
}

Set::Set(QObject *parent)
    : QObject(parent),
      m_id(nextId()),
      m_timestamp(QDateTime::currentDateTime())
{}

Set::Set(const QString &exerciseName,
         double weightKg,
         int reps,
         int rir,
         const QDateTime &timestamp,
         QObject *parent)
    : QObject(parent),
      m_id(nextId()),
      m_exerciseName(exerciseName),
      m_kind(QStringLiteral("lift")),
      m_weightKg(weightKg),
      // Narrow the int-shaped UI inputs into our 16/8-bit storage. Clamp
      // before casting so a buggy caller (negative reps, RIR=999) cannot
      // wrap around silently. Cap reps at 65535 (more than any sane set).
      m_reps(static_cast<quint16>(std::clamp(reps,  0, 65535))),
      m_rir (static_cast<qint8 >(std::clamp(rir,    -1,    10))),
      m_timestamp(timestamp)
{}

// TICKET-010: cardio factory.
// Static so callers never have to remember the argument order (duration comes
// before weight, which would be easy to mix up with the lift constructor).
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

void Set::setExerciseName(const QString &v) {
    if (m_exerciseName == v) return;
    m_exerciseName = v;
    emit exerciseNameChanged();
}

void Set::setKind(const QString &v) {
    const QString canonical = (v == QLatin1String("cardio"))
                              ? QStringLiteral("cardio")
                              : QStringLiteral("lift");
    if (m_kind == canonical) return;
    m_kind = canonical;
    emit kindChanged();
}

void Set::setWeightKg(double v) {
    if (qFuzzyCompare(m_weightKg, v)) return;
    m_weightKg = v;
    emit weightKgChanged();
    emit volumeChanged();
}

void Set::setReps(int v) {
    // Clamp to the storage range before assigning to quint16.
    const int clamped = std::clamp(v, 0, 65535);
    if (m_reps == clamped) return;
    m_reps = static_cast<quint16>(clamped);
    emit repsChanged();
    emit volumeChanged();
}

void Set::setRir(int v) {
    // -1 means "not recorded". RIR 0 is meaningful (set taken to failure).
    // Cap at 10 to avoid garbage data; most sets in real training are 0-5.
    // qint8 fits the entire valid range comfortably.
    const int clamped = std::clamp(v, -1, 10);
    if (m_rir == clamped) return;
    m_rir = static_cast<qint8>(clamped);
    emit rirChanged();
}

void Set::setRpe(int v) {
    // Clamp to the canonical RPE 1-10 scale. 0 means "not recorded".
    const int clamped = std::clamp(v, 0, 10);
    if (m_rpe == clamped) return;
    m_rpe = static_cast<qint8>(clamped);
    emit rpeChanged();
}

void Set::setDurationSec(int v) {
    if (m_durationSec == v) return;
    m_durationSec = v;
    emit durationSecChanged();
}

void Set::setDistanceM(double v) {
    if (qFuzzyCompare(m_distanceM, v)) return;
    m_distanceM = v;
    emit distanceMChanged();
}

void Set::setAvgPaceSecPerKm(double v) {
    if (qFuzzyCompare(m_avgPaceSecPerKm, v)) return;
    m_avgPaceSecPerKm = v;
    emit avgPaceSecPerKmChanged();
}

void Set::setTimestamp(const QDateTime &v) {
    if (m_timestamp == v) return;
    m_timestamp = v;
    emit timestampChanged();
}
