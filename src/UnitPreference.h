// ---------------------------------------------------------------------------
// UnitPreference.h — QML singleton for kg / lbs display toggle.
//
// Responsibility: single source of truth for the user's weight-unit preference.
// All weights are STORED in kg (see dev-lead.md §Units). This class handles
// display-time conversion only. Nothing in the model or persistence layer
// should ever call into this; it is purely a render-time concern.
//
// Usage from QML:
//   import PeakFettle 1.0
//   Text { text: UnitPreference.format(set.weightKg) }   // "70.3 kg" or "155 lb"
//
//   // Convert user-entered display value back to kg before logSet:
//   WorkoutTracker.logSet(name, UnitPreference.toKg(enteredValue), reps, rir)
//
// Persistence: QSettings key "unitPreference/unit" ("kg" or "lbs").
// Will be superseded by users.unit_pref column once the Phase B backend is wired.
//
// Author: dev-frontend (TICKET-001)
// Date: 2026-05-01
// ---------------------------------------------------------------------------

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

    // "kg" or "lbs" — the only two allowed values.
    Q_PROPERTY(QString unit READ unit WRITE setUnit NOTIFY unitChanged)

    // Convenience read-only flag for QML bindings that branch on the unit.
    Q_PROPERTY(bool isLbs READ isLbs NOTIFY unitChanged)

    // Reactive properties so QML bindings refresh on unitChanged.
    // Previously these were exposed only as Q_INVOKABLE methods, which
    // QML cannot track for re-evaluation - the result was that the
    // "Weight (kg)" label and the WeightLabel display did not update
    // when the user toggled the unit in Settings (TICKET-002).
    Q_PROPERTY(QString suffix     READ suffix     NOTIFY unitChanged)
    Q_PROPERTY(QString inputLabel READ inputLabel NOTIFY unitChanged)
    Q_PROPERTY(QString placeholderExample
                       READ placeholderExample
                       NOTIFY unitChanged)

public:
    explicit UnitPreference(QObject *parent = nullptr);

    // Singleton factory called by the QML engine.
    static UnitPreference *create(QQmlEngine *, QJSEngine *);

    QString unit()   const { return m_unit; }
    bool    isLbs()  const { return m_unit == QStringLiteral("lbs"); }

    void setUnit(const QString &u);

    // ---------------------------------------------------------------------------
    // Conversion helpers — all Q_INVOKABLE so they can be called from QML.
    //
    // Conversion constant: NIST exact definition of the international pound.
    //   1 lb = 0.45359237 kg  (exact)
    // ---------------------------------------------------------------------------

    // Convert kg → current display unit (returns same value if unit == "kg").
    Q_INVOKABLE double toDisplay(double kg) const;

    // Convert a value entered in the current display unit back to kg.
    // This is the inverse of toDisplay; used before calling WorkoutTracker::logSet.
    Q_INVOKABLE double toKg(double displayValue) const;

    // Return a fully-formatted display string for a weight stored in kg.
    // Examples:
    //   unit == "kg": 70.3 → "70.3 kg",  105.0 → "105 kg"
    //   unit == "lbs": 70.307... → "155 lb"
    Q_INVOKABLE QString format(double kg) const;

    // Return just the suffix ("kg" or "lb") for axis labels.
    Q_INVOKABLE QString suffix() const { return isLbs() ? QStringLiteral("lb") : QStringLiteral("kg"); }

    // Return the display-unit label for input field headers ("Weight (kg)" / "Weight (lb)").
    Q_INVOKABLE QString inputLabel() const;

    // A unit-correct example weight for placeholder text in the input field.
    // Previously the placeholder was hard-coded ("e.g. 175" / "e.g. 80") in
    // QML; centralising it here means a single source of truth and it's
    // exposed as a reactive Q_PROPERTY for the binding.
    Q_INVOKABLE QString placeholderExample() const;

signals:
    void unitChanged();

private:
    static constexpr double KG_PER_LB = 0.45359237; // NIST exact value

    QString   m_unit;
    QSettings m_settings;

    void loadFromSettings();
    void saveToSettings();
};

#endif // PEAKFETTLE_UNITPREFERENCE_H
