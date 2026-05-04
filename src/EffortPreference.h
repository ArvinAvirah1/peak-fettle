// ---------------------------------------------------------------------------
// EffortPreference.h - QML singleton for effort-notation display preference.
//
// Beta Round 1 finding: 5 of 6 testers were confused or anxious about the
// effort field. Linda explicitly said it made her feel she was "doing the
// app wrong" by skipping it. The data contract for RIR is already canonical
// (see CTO guardrail #7: rir == -1 means "not recorded", rir == 0 means
// "taken to failure", legacy rpe is read-only). What was missing was the
// UI-side ability for a user to opt out of the field entirely.
//
// This singleton stores a single string preference:
//   "rir"  -> RIR field is shown (default; matches existing behaviour)
//   "off"  -> RIR field is hidden in both the log card and the edit dialog
//
// "rpe" is intentionally NOT a supported value: per CTO guardrail RPE is
// deprecated. Existing RPE values on legacy sets remain read-only in the
// recent-sets list.
//
// Persistence: QSettings key "effortPreference/mode".
// Will be superseded by users.effort_pref column once Phase B backend lands.
//
// Author: dev-frontend (TICKET-002)
// Date: 2026-05-01
// ---------------------------------------------------------------------------

#ifndef PEAKFETTLE_EFFORTPREFERENCE_H
#define PEAKFETTLE_EFFORTPREFERENCE_H

#include <QObject>
#include <QSettings>
#include <QString>
#include <qqml.h>

class EffortPreference : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON

    // "rir" or "off" - the only two allowed values. Default is "rir".
    Q_PROPERTY(QString mode READ mode WRITE setMode NOTIFY modeChanged)

    // Convenience read-only flag for QML bindings that branch on the mode.
    // Bind UI elements that should disappear when the user opts out via:
    //     visible: EffortPreference.showRir
    Q_PROPERTY(bool showRir READ showRir NOTIFY modeChanged)

public:
    explicit EffortPreference(QObject *parent = nullptr);

    // Singleton factory called by the QML engine.
    static EffortPreference *create(QQmlEngine *, QJSEngine *);

    QString mode()    const { return m_mode; }
    bool    showRir() const { return m_mode == QStringLiteral("rir"); }

    void setMode(const QString &m);

signals:
    void modeChanged();

private:
    QString   m_mode;
    QSettings m_settings;

    void loadFromSettings();
    void saveToSettings();
};

#endif // PEAKFETTLE_EFFORTPREFERENCE_H
