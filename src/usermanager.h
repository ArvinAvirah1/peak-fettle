// ---------------------------------------------------------------------------
// UserManager - tiny in-memory account store for the sign-up flow.
//
// Real authentication (hashing, secure storage, OAuth, server-side accounts)
// is intentionally out of scope. This class exists so the QML sign-up page
// has something to talk to and so the "logged in" state is observable.
//
// IMPORTANT: do not ship this as-is - passwords are stored in plaintext in
// memory. Replace with proper auth before any production release.
// ---------------------------------------------------------------------------

#ifndef PEAKFETTLE_USERMANAGER_H
#define PEAKFETTLE_USERMANAGER_H

#include <QObject>
#include <QString>
#include <QHash>
#include <qqml.h>

class UserManager : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON

    Q_PROPERTY(bool    isSignedIn      READ isSignedIn      NOTIFY signedInChanged)
    Q_PROPERTY(QString currentUsername READ currentUsername NOTIFY signedInChanged)

public:
    explicit UserManager(QObject *parent = nullptr);

    bool    isSignedIn()      const { return !m_currentUser.isEmpty(); }
    QString currentUsername() const { return m_currentUser; }

    // Returns "" on success, or a human-readable error string on failure.
    Q_INVOKABLE QString signUp(const QString &username,
                               const QString &email,
                               const QString &password);

    Q_INVOKABLE QString signIn(const QString &username,
                               const QString &password);

    Q_INVOKABLE void signOut();

signals:
    void signedInChanged();

private:
    // username -> { email, password }. Plaintext: dev-only.
    struct Account { QString email; QString password; };
    QHash<QString, Account> m_accounts;
    QString m_currentUser;
};

#endif // PEAKFETTLE_USERMANAGER_H
