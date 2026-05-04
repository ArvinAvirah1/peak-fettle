// ---------------------------------------------------------------------------
// ExerciseLibrary.h - QML singleton, hundreds of bundled common exercises.
//
// Free tier offers progress tracking + percentile rankings (see
// INSTRUCTIONS.md "Free Tier"). For new users to log a set without
// hand-typing every exercise name, the app ships a static library of
// common movements grouped by primary muscle / movement family.
//
// The library is read-only and immutable. WorkoutTracker.exerciseNames
// remains the user's *history* of trained exercises; the LIBRARY is
// what they can pick FROM. The exercise picker on SetTrackerPage merges
// the two so a user's recent lifts surface first, with the full library
// available behind a search.
//
// Categories the UI groups by:
//   chest, back, shoulders, biceps, triceps, forearms, core,
//   quads, hamstrings, glutes, calves, full_body, cardio,
//   olympic, plyometrics, mobility
//
// Exposed API:
//   - allExercises    : QStringList of every name
//   - categories      : QStringList of category labels (display order)
//   - byCategory(cat) : QStringList of names in that category
//   - search(query)   : Filter by case-insensitive substring across the
//                       library (used by the searchable picker)
//
// Author: dev-frontend (TICKET-003)
// Date: 2026-05-01
// ---------------------------------------------------------------------------

#ifndef PEAKFETTLE_EXERCISELIBRARY_H
#define PEAKFETTLE_EXERCISELIBRARY_H

#include <QObject>
#include <QString>
#include <QStringList>
#include <QVariantList>
#include <QHash>
#include <qqml.h>

class ExerciseLibrary : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON

    Q_PROPERTY(QStringList allExercises READ allExercises CONSTANT)
    Q_PROPERTY(QStringList categories   READ categories   CONSTANT)

public:
    explicit ExerciseLibrary(QObject *parent = nullptr);

    static ExerciseLibrary *create(QQmlEngine *, QJSEngine *);

    QStringList allExercises() const { return m_all; }
    QStringList categories()   const { return m_categoryOrder; }

    // Returns all exercise names in the given category (UI display order).
    Q_INVOKABLE QStringList byCategory(const QString &category) const;

    // Display label for a category - "Chest" rather than "chest".
    Q_INVOKABLE QString categoryLabel(const QString &category) const;

    // Case-insensitive substring search across the whole library.
    // Used by the searchable picker on SetTrackerPage.
    Q_INVOKABLE QStringList search(const QString &query, int limit = 50) const;

    // TICKET-007: Alias-aware search.
    // Returns a QVariantList of { name: QString, hint: QString } maps.
    // `hint` is the alias that triggered the match (e.g. "OHP"), empty
    // string when the match was on the canonical name. The UI uses `hint`
    // to show a small "via: OHP" subtitle so the user understands why
    // "Overhead Press" appeared.
    // Ordering: canonical-name prefix > canonical-name mid > alias-exact >
    //           alias-prefix > alias-mid, with deduplication.
    Q_INVOKABLE QVariantList searchDetailed(const QString &query, int limit = 50) const;

    // Returns groups suitable for a sectioned ListView:
    //   [ { category: "chest", label: "Chest", exercises: [...] }, ... ]
    Q_INVOKABLE QVariantList grouped() const;

private:
    void seed();
    void addAll(const QString &category, const QStringList &names);
    // Register alias -> canonical name for TICKET-007 alias search.
    // Both alias and canonical are stored lowercased in m_aliasToName for
    // fast case-insensitive lookup; canonical is re-mapped to original case
    // via m_canonicalByLower.
    void addAlias(const QString &alias, const QString &canonicalExact);

    QStringList                     m_categoryOrder;     // display order
    QHash<QString, QString>         m_categoryLabels;    // key -> nice label
    QHash<QString, QStringList>     m_byCategory;
    QStringList                     m_all;

    // TICKET-007: alias -> canonical name (both keys/values lowercased).
    // e.g. "ohp" -> "overhead press"
    QHash<QString, QString>         m_aliasToName;
    // canonical lowercased -> original-case name (needed to return proper
    // display names from an alias hit).
    QHash<QString, QString>         m_canonicalByLower;
};

#endif // PEAKFETTLE_EXERCISELIBRARY_H
