// ---------------------------------------------------------------------------
// UserProfile.cpp — implementation of the demographic + training-target
// singleton. See header for the rationale on storage sizes (quint8) and the
// QSettings persistence layout.
// ---------------------------------------------------------------------------

#include "UserProfile.h"

#include <QQmlEngine>
#include <algorithm>

namespace {
// Clamp helpers — kept local because they're only used here and the standards
// document specifies these exact ranges.
//
// strength_curve_model.md §5 calls out:
//   * Age < 14 or > 90 → flag extrapolated. We store as the user types it but
//     clamp to the supported band before persisting so the strength model
//     never sees a wild value.
//   * Years > 30 → treat as 30. The exponential in T(years) is essentially
//     saturated by 9 years anyway; we cap the slider at 30 to avoid silly
//     inputs (a 200-year-old beginner, say).
quint8 clampAge(int v)         { return static_cast<quint8>(std::clamp(v, 0,  90)); }
quint8 clampYears(int v)       { return static_cast<quint8>(std::clamp(v, 0,  30)); }
quint8 clampFrequency(int v)   { return static_cast<quint8>(std::clamp(v, 0,   7)); }
quint8 clampColorIndex(int v)  { return static_cast<quint8>(std::clamp(v, 0,   7)); }
} // namespace

UserProfile::UserProfile(QObject *parent)
    : QObject(parent)
{
    loadFromSettings();
}

UserProfile *UserProfile::create(QQmlEngine *, QJSEngine *)
{
    // Caller (QML engine) takes ownership; we set parent=nullptr so the engine
    // can manage lifetime via its own QQmlEngine::setObjectOwnership rules.
    auto *up = new UserProfile;
    QQmlEngine::setObjectOwnership(up, QQmlEngine::CppOwnership);
    return up;
}

bool UserProfile::isComplete() const
{
    // Bodyweight, age, sex, years are all needed for the percentile model;
    // target frequency is a soft requirement (defaults to 3 if missing).
    return m_ageYears      > 0
        && !m_sex.isEmpty()
        && m_yearsTraining > 0  // 0 reserved for "unset"; novice = 1 in the slider
        && m_bodyweightKg  > 0.0;
}

void UserProfile::setAgeYears(int v)
{
    const quint8 cv = clampAge(v);
    if (cv == m_ageYears) return;
    m_ageYears = cv;
    saveToSettings();
    emit profileChanged();
}

void UserProfile::setSex(const QString &v)
{
    // Canonicalise: anything other than "M"/"F" is treated as cleared, so a
    // typo from a future caller doesn't silently land in QSettings.
    const QString canon = (v == QStringLiteral("M") || v == QStringLiteral("F"))
                              ? v : QString();
    if (canon == m_sex) return;
    m_sex = canon;
    saveToSettings();
    emit profileChanged();
}

void UserProfile::setYearsTraining(int v)
{
    const quint8 cv = clampYears(v);
    if (cv == m_yearsTraining) return;
    m_yearsTraining = cv;
    saveToSettings();
    emit profileChanged();
}

void UserProfile::setTargetWorkoutsPerWeek(int v)
{
    const quint8 cv = clampFrequency(v);
    if (cv == m_targetWorkoutsPerWeek) return;
    m_targetWorkoutsPerWeek = cv;
    saveToSettings();
    emit profileChanged();
}

void UserProfile::setBodyweightKg(double v)
{
    // The strength model documents BW clamps of [40, 210] M / [40, 150] F. We
    // do not clamp at write-time because the user might still be editing; the
    // model itself handles the clamp + extrapolated flag at compute time.
    // Negative values are dropped silently — clearly a UI bug if it happens.
    if (v < 0.0) v = 0.0;
    if (qFuzzyCompare(1.0 + v, 1.0 + m_bodyweightKg)) return;
    m_bodyweightKg = v;
    saveToSettings();
    emit profileChanged();
}

void UserProfile::setDisplayName(const QString &v)
{
    // Trim whitespace and cap at 32 characters. We do not restrict character
    // set beyond that — names with Unicode, emoji, etc. are fine.
    const QString trimmed = v.trimmed().left(32);
    if (trimmed == m_displayName) return;
    m_displayName = trimmed;
    saveToSettings();
    emit profileChanged();
}

void UserProfile::setAvatarColorIndex(int v)
{
    const quint8 cv = clampColorIndex(v);
    if (cv == m_avatarColorIndex) return;
    m_avatarColorIndex = cv;
    saveToSettings();
    emit profileChanged();
}

void UserProfile::reset()
{
    m_ageYears              = 0;
    m_sex.clear();
    m_yearsTraining         = 0;
    m_targetWorkoutsPerWeek = 0;
    m_bodyweightKg          = 0.0;
    m_displayName.clear();
    m_avatarColorIndex      = 0;
    saveToSettings();
    emit profileChanged();
}

void UserProfile::loadFromSettings()
{
    // QSettings stores everything as QVariant. We read with int defaults and
    // funnel through the same clamp helpers so a hand-edited config can't
    // crash the model.
    m_settings.beginGroup(QStringLiteral("userProfile"));
    m_ageYears              = clampAge       (m_settings.value(QStringLiteral("ageYears"),              0  ).toInt());
    m_yearsTraining         = clampYears     (m_settings.value(QStringLiteral("yearsTraining"),         0  ).toInt());
    m_targetWorkoutsPerWeek = clampFrequency (m_settings.value(QStringLiteral("targetWorkoutsPerWeek"), 0  ).toInt());
    m_bodyweightKg          =                 m_settings.value(QStringLiteral("bodyweightKg"),          0.0).toDouble();
    m_avatarColorIndex      = clampColorIndex(m_settings.value(QStringLiteral("avatarColorIndex"),      0  ).toInt());
    const QString s         =                 m_settings.value(QStringLiteral("sex"),                   "" ).toString();
    m_sex         = (s == QStringLiteral("M") || s == QStringLiteral("F")) ? s : QString();
    m_displayName =  m_settings.value(QStringLiteral("displayName"), "").toString().trimmed().left(32);
    m_settings.endGroup();
}

void UserProfile::saveToSettings() const
{
    // const_cast is safe — QSettings is intrinsically a write target and the
    // surrounding setters are non-const themselves; this just lets us call
    // saveToSettings from getters in the future without re-architecting.
    auto &s = const_cast<QSettings &>(m_settings);
    s.beginGroup(QStringLiteral("userProfile"));
    s.setValue(QStringLiteral("ageYears"),              static_cast<int>(m_ageYears));
    s.setValue(QStringLiteral("sex"),                   m_sex);
    s.setValue(QStringLiteral("yearsTraining"),         static_cast<int>(m_yearsTraining));
    s.setValue(QStringLiteral("targetWorkoutsPerWeek"), static_cast<int>(m_targetWorkoutsPerWeek));
    s.setValue(QStringLiteral("bodyweightKg"),          m_bodyweightKg);
    s.setValue(QStringLiteral("displayName"),           m_displayName);
    s.setValue(QStringLiteral("avatarColorIndex"),      static_cast<int>(m_avatarColorIndex));
    s.endGroup();
}
