// ---------------------------------------------------------------------------
// EffortPreference.cpp
// ---------------------------------------------------------------------------

#include "EffortPreference.h"

// Static singleton instance held by the QML engine.
static EffortPreference *s_instance = nullptr;

EffortPreference::EffortPreference(QObject *parent)
    : QObject(parent)
    , m_settings(QStringLiteral("PeakFettle"), QStringLiteral("PeakFettle"))
{
    loadFromSettings();
}

EffortPreference *EffortPreference::create(QQmlEngine *, QJSEngine *)
{
    // The QML engine owns the object; create exactly once.
    if (!s_instance) {
        s_instance = new EffortPreference();
    }
    return s_instance;
}

void EffortPreference::setMode(const QString &m)
{
    // Guard: only accept "rir" or "off". Anything else collapses to "rir"
    // so that a corrupted settings value never leaves the field invisible
    // by surprise.
    const QString normalized = (m == QStringLiteral("off"))
                               ? QStringLiteral("off")
                               : QStringLiteral("rir");

    if (m_mode == normalized) return;

    m_mode = normalized;
    saveToSettings();
    emit modeChanged();
}

void EffortPreference::loadFromSettings()
{
    const QString saved = m_settings.value(
        QStringLiteral("effortPreference/mode"),
        QStringLiteral("rir")          // default - matches existing UX
    ).toString();

    m_mode = (saved == QStringLiteral("off"))
             ? QStringLiteral("off")
             : QStringLiteral("rir");
}

void EffortPreference::saveToSettings()
{
    m_settings.setValue(QStringLiteral("effortPreference/mode"), m_mode);
}
