// ---------------------------------------------------------------------------
// UserProfile.h — QML singleton holding the user's demographic + training
// inputs that the percentile model and the streak target need.
//
// The four fields collected during the Quick-stats step of onboarding (and
// editable later from SettingsPage):
//
//   * ageYears               — required for Foster/McCulloch age scaling
//   * sex                    — "M" or "F"; required to pick the lift vector
//   * yearsTraining          — used in T(years) of the strength model
//   * targetWorkoutsPerWeek  — drives the streak/weekly-goal UI
//   * bodyweightKg           — required for the bodyweight allometric factor.
//                              Always stored in kg; UnitPreference handles
//                              display (matches the project-wide convention
//                              that all weights live in kg in the model).
//
// Storage strategy (per the change request to "use smaller-size shorts /
// unsigned vars"):
//
//   The members are stored as quint8 — every realistic value fits in 8 bits:
//     age       0..255        (we additionally clamp 14..90)
//     years     0..255        (we additionally clamp 0..30)
//     freq      0..7          (workouts per week)
//   The Q_PROPERTY surface stays `int` because:
//     1. QML's value-type bridge converts everything to int anyway
//        (using quint8 in Q_PROPERTY would just round-trip through int);
//     2. avoiding a typedef for the QML side keeps the blast radius small —
//        existing bindings don't have to change.
//
//   Bodyweight is double because plate-fraction precision matters and the
//   strength model multiplies by it inside a power expression.
//
// Persistence: QSettings under "userProfile/*". Will move to the
// users.* columns once the Phase B Supabase backend is wired.
//
// Authors: dev-frontend
// Date: 2026-05-03
// ---------------------------------------------------------------------------

#ifndef PEAKFETTLE_USERPROFILE_H
#define PEAKFETTLE_USERPROFILE_H

#include <QObject>
#include <QSettings>
#include <QString>
#include <QtGlobal>
#include <qqml.h>

class UserProfile : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON

    // QML surface — int values so existing bindings don't need a custom type.
    Q_PROPERTY(int     ageYears              READ ageYears              WRITE setAgeYears              NOTIFY profileChanged)
    Q_PROPERTY(QString sex                   READ sex                   WRITE setSex                   NOTIFY profileChanged)
    Q_PROPERTY(int     yearsTraining         READ yearsTraining         WRITE setYearsTraining         NOTIFY profileChanged)
    Q_PROPERTY(int     targetWorkoutsPerWeek READ targetWorkoutsPerWeek WRITE setTargetWorkoutsPerWeek NOTIFY profileChanged)
    Q_PROPERTY(double  bodyweightKg          READ bodyweightKg          WRITE setBodyweightKg          NOTIFY profileChanged)

    // Avatar fields — optional display name (≤32 chars) and a color index
    // (0–7) indexing into the QML palette in AvatarButton.qml.
    // Neither field gates isComplete() — they are cosmetic.
    Q_PROPERTY(QString displayName      READ displayName      WRITE setDisplayName      NOTIFY profileChanged)
    Q_PROPERTY(int     avatarColorIndex READ avatarColorIndex WRITE setAvatarColorIndex NOTIFY profileChanged)

    // Workout split (advisory — does not affect the percentile model).
    // workoutSplit: "" | "ppl" | "ul" | "other"
    // customSplitName: free-text name when split == "other" (max 48 chars)
    Q_PROPERTY(QString workoutSplit     READ workoutSplit     WRITE setWorkoutSplit     NOTIFY profileChanged)
    Q_PROPERTY(QString customSplitName  READ customSplitName  WRITE setCustomSplitName  NOTIFY profileChanged)

    // Convenience flag the survey/onboarding gate binds against. True once
    // the user has filled the four required fields (bodyweight + age + sex +
    // years; target frequency defaults to 3 if unset and is not strictly
    // required for the percentile path).
    Q_PROPERTY(bool    isComplete            READ isComplete            NOTIFY profileChanged)

public:
    explicit UserProfile(QObject *parent = nullptr);

    // Singleton factory called by the QML engine.
    static UserProfile *create(QQmlEngine *, QJSEngine *);

    int     ageYears()              const { return static_cast<int>(m_ageYears); }
    QString sex()                   const { return m_sex; }
    int     yearsTraining()         const { return static_cast<int>(m_yearsTraining); }
    int     targetWorkoutsPerWeek() const { return static_cast<int>(m_targetWorkoutsPerWeek); }
    double  bodyweightKg()          const { return m_bodyweightKg; }
    QString displayName()           const { return m_displayName; }
    int     avatarColorIndex()      const { return static_cast<int>(m_avatarColorIndex); }
    QString workoutSplit()          const { return m_workoutSplit; }
    QString customSplitName()       const { return m_customSplitName; }

    bool    isComplete()            const;

    void setAgeYears(int v);
    void setSex(const QString &v);
    void setYearsTraining(int v);
    void setTargetWorkoutsPerWeek(int v);
    void setBodyweightKg(double v);
    void setDisplayName(const QString &v);
    void setAvatarColorIndex(int v);
    void setWorkoutSplit(const QString &v);
    void setCustomSplitName(const QString &v);

    // Convenience: clear everything (used by SettingsPage "Reset profile").
    Q_INVOKABLE void reset();

signals:
    void profileChanged();

private:
    // 8-bit storage — see header note about size choice.
    quint8  m_ageYears              = 0;     // 0 = unset
    QString m_sex;                            // "" = unset; "M" / "F"
    quint8  m_yearsTraining         = 0;
    quint8  m_targetWorkoutsPerWeek = 0;     // 0 = unset; 1..7 valid
    double  m_bodyweightKg          = 0.0;   // 0 = unset

    // Avatar fields (cosmetic — do not affect isComplete()).
    QString m_displayName;                    // optional, max 32 chars
    quint8  m_avatarColorIndex      = 0;     // 0..7 into QML palette

    // Workout split (advisory).
    QString m_workoutSplit;                   // "" | "ppl" | "ul" | "other"
    QString m_customSplitName;               // user label when split == "other"

    QSettings m_settings;

    void loadFromSettings();
    void saveToSettings() const;
};

#endif // PEAKFETTLE_USERPROFILE_H
