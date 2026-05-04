// ---------------------------------------------------------------------------
// UnitPreference.cpp
// ---------------------------------------------------------------------------

#include "UnitPreference.h"

#include <QCoreApplication>
#include <cmath>

// Static singleton instance held by the QML engine.
static UnitPreference *s_instance = nullptr;

UnitPreference::UnitPreference(QObject *parent)
    : QObject(parent)
    , m_settings(QStringLiteral("PeakFettle"), QStringLiteral("PeakFettle"))
{
    loadFromSettings();
}

UnitPreference *UnitPreference::create(QQmlEngine *, QJSEngine *)
{
    // The QML engine owns the object; create exactly once.
    if (!s_instance) {
        s_instance = new UnitPreference();
    }
    return s_instance;
}

void UnitPreference::setUnit(const QString &u)
{
    // Guard: only accept "kg" or "lbs".
    const QString normalized = (u == QStringLiteral("lbs"))
                               ? QStringLiteral("lbs")
                               : QStringLiteral("kg");

    if (m_unit == normalized) return;

    m_unit = normalized;
    saveToSettings();
    emit unitChanged();
}

double UnitPreference::toDisplay(double kg) const
{
    return isLbs() ? (kg / KG_PER_LB) : kg;
}

double UnitPreference::toKg(double displayValue) const
{
    return isLbs() ? (displayValue * KG_PER_LB) : displayValue;
}

QString UnitPreference::format(double kg) const
{
    if (isLbs()) {
        // lbs → integer display; underlying kg retains full precision.
        const int lbs = static_cast<int>(std::round(kg / KG_PER_LB));
        return QString::number(lbs) + QStringLiteral(" lb");
    } else {
        // kg → 1 decimal for sub-100, integer for ≥100.
        if (kg < 100.0) {
            return QString::number(kg, 'f', 1) + QStringLiteral(" kg");
        } else {
            return QString::number(static_cast<int>(std::round(kg))) + QStringLiteral(" kg");
        }
    }
}

QString UnitPreference::inputLabel() const
{
    return isLbs() ? QStringLiteral("Weight (lb)") : QStringLiteral("Weight (kg)");
}

QString UnitPreference::placeholderExample() const
{
    // ~80 kg / ~175 lb is a common intermediate working weight; gives
    // beginners a sensible scale anchor when first looking at the field.
    return isLbs() ? QStringLiteral("e.g. 175") : QStringLiteral("e.g. 80");
}

void UnitPreference::loadFromSettings()
{
    const QString saved = m_settings.value(
        QStringLiteral("unitPreference/unit"),
        QStringLiteral("kg")          // default
    ).toString();

    m_unit = (saved == QStringLiteral("lbs"))
             ? QStringLiteral("lbs")
             : QStringLiteral("kg");
}

void UnitPreference::saveToSettings()
{
    m_settings.setValue(QStringLiteral("unitPreference/unit"), m_unit);
}
