#include "usermanager.h"

#include <QRegularExpression>

UserManager::UserManager(QObject *parent)
    : QObject(parent)
{}

QString UserManager::signUp(const QString &username,
                            const QString &email,
                            const QString &password)
{
    const QString u = username.trimmed();
    const QString e = email.trimmed();

    if (u.isEmpty())                return tr("Please choose a username.");
    if (u.size() < 3)               return tr("Username must be at least 3 characters.");
    if (m_accounts.contains(u))     return tr("That username is already taken.");

    // Lightweight email sanity check - good enough for the sign-up gate.
    static const QRegularExpression emailRe(
        QStringLiteral(R"(^[^@\s]+@[^@\s]+\.[^@\s]+$)"));
    if (!emailRe.match(e).hasMatch()) return tr("Please enter a valid email address.");

    if (password.size() < 8)        return tr("Password must be at least 8 characters.");

    m_accounts.insert(u, { e, password });
    m_currentUser = u;
    emit signedInChanged();
    return QString();   // success
}

QString UserManager::signIn(const QString &username, const QString &password) {
    const QString u = username.trimmed();
    auto it = m_accounts.constFind(u);
    if (it == m_accounts.constEnd())  return tr("No account found for that username.");
    if (it.value().password != password) return tr("Incorrect password.");

    m_currentUser = u;
    emit signedInChanged();
    return QString();
}

void UserManager::signOut() {
    if (m_currentUser.isEmpty()) return;
    m_currentUser.clear();
    emit signedInChanged();
}
