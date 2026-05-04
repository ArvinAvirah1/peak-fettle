// ---------------------------------------------------------------------------
// Exercise - groups together every Set ever logged for a named movement.
//
// Lightweight container. The heavy lifting (model interface, persistence,
// indexing by name, etc.) lives in WorkoutTracker.
// ---------------------------------------------------------------------------

#ifndef PEAKFETTLE_EXERCISE_H
#define PEAKFETTLE_EXERCISE_H

#include <QObject>
#include <QString>
#include <QVector>
#include <qqml.h>

#include "set.h"

class Exercise : public QObject {
    Q_OBJECT
    QML_ELEMENT

    Q_PROPERTY(QString name READ name WRITE setName NOTIFY nameChanged)
    Q_PROPERTY(int setCount READ setCount NOTIFY setsChanged)
    Q_PROPERTY(double totalVolume READ totalVolume NOTIFY setsChanged)

public:
    explicit Exercise(QObject *parent = nullptr);
    explicit Exercise(const QString &name, QObject *parent = nullptr);

    QString name() const { return m_name; }
    void setName(const QString &v);

    int setCount() const { return static_cast<int>(m_sets.size()); }

    // Total tonnage across the lifetime of this exercise.
    double totalVolume() const;

    // Heaviest single set ever recorded (max weight, irrespective of reps).
    Q_INVOKABLE double personalRecordWeight() const;

    // Best estimated 1RM using the Epley formula (w * (1 + reps/30)).
    // Used as the primary "progress" metric for the graph.
    Q_INVOKABLE double estimatedOneRepMax() const;

    void addSet(Set *s);

    const QVector<Set *> &sets() const { return m_sets; }

signals:
    void nameChanged();
    void setsChanged();

private:
    QString        m_name;
    QVector<Set *> m_sets;
};

#endif // PEAKFETTLE_EXERCISE_H
