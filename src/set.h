// ---------------------------------------------------------------------------
// Set - a single completed work set (e.g. "Bench press, 80kg x 5 reps").
//
// This is the atomic unit of progress in Peak Fettle. Each Set knows:
//   * which exercise it belongs to
//   * weight used (kg, double for plate fractions)
//   * reps completed
//   * RIR (reps in reserve, 0-5+, optional). RIR is the default effort
//     notation per beta tester feedback (round 1, 2026-04-30) - users
//     across all experience levels found "how many reps did I have left?"
//     more intuitive than "rate this set 1-10". RPE is retained as a legacy
//     read-only field for users who already logged with it.
//   * timestamp of completion
//   * dayKey  - canonical YYYY-MM-DD string of when the set was logged.
//     Cached so progress aggregations ("best E1RM per day") don't have to
//     re-format dates on every render.
//
// Exposed to QML so individual sets can be displayed/edited from .qml files.
// ---------------------------------------------------------------------------

#ifndef PEAKFETTLE_SET_H
#define PEAKFETTLE_SET_H

#include <QObject>
#include <QDateTime>
#include <QString>
#include <qqml.h>

class Set : public QObject {
    Q_OBJECT
    QML_ELEMENT

    // Stable per-process id assigned at construction. Used by the QML edit
    // dialog to refer back to a specific Set even after re-sorts. Persists
    // for the lifetime of the in-memory model; once we wire the Supabase
    // backend this will be replaced by the row's primary key.
    Q_PROPERTY(qint64  id           READ id                                  CONSTANT)
    Q_PROPERTY(QString exerciseName READ exerciseName WRITE setExerciseName NOTIFY exerciseNameChanged)

    // "lift" or "cardio" — canonical values mirror the backend sets.kind column.
    // Default is "lift" for all existing data (backward-compatible).
    Q_PROPERTY(QString kind         READ kind         WRITE setKind         NOTIFY kindChanged)

    // ---- Lift fields (non-null when kind == "lift") ----
    Q_PROPERTY(double  weightKg     READ weightKg     WRITE setWeightKg     NOTIFY weightKgChanged)
    Q_PROPERTY(int     reps         READ reps         WRITE setReps         NOTIFY repsChanged)
    Q_PROPERTY(int     rir          READ rir          WRITE setRir          NOTIFY rirChanged)
    Q_PROPERTY(int     rpe          READ rpe          WRITE setRpe          NOTIFY rpeChanged)

    // ---- Cardio fields (non-null when kind == "cardio") ----
    // durationSec: -1 = not recorded; must be > 0 for a valid cardio set.
    Q_PROPERTY(int     durationSec  READ durationSec  WRITE setDurationSec  NOTIFY durationSecChanged)
    // distanceM: -1 = not recorded (optional for timed activities like HIIT).
    Q_PROPERTY(double  distanceM    READ distanceM    WRITE setDistanceM    NOTIFY distanceMChanged)
    // avgPaceSecPerKm: -1 = not recorded. Derived from distance/duration but
    // stored explicitly so the server can store it without recomputing.
    Q_PROPERTY(double  avgPaceSecPerKm READ avgPaceSecPerKm WRITE setAvgPaceSecPerKm NOTIFY avgPaceSecPerKmChanged)

    Q_PROPERTY(QDateTime timestamp  READ timestamp    WRITE setTimestamp    NOTIFY timestampChanged)
    Q_PROPERTY(double  volume       READ volume                              NOTIFY volumeChanged)
    Q_PROPERTY(QString dayKey       READ dayKey                              NOTIFY timestampChanged)

public:
    explicit Set(QObject *parent = nullptr);

    // Lift constructor (backward-compatible default).
    Set(const QString &exerciseName,
        double weightKg,
        int reps,
        int rir = -1,
        const QDateTime &timestamp = QDateTime::currentDateTime(),
        QObject *parent = nullptr);

    // Cardio constructor (TICKET-010).
    // distanceM and avgPaceSecPerKm may be -1 for activities where only
    // duration is relevant (e.g. HIIT bike, rowing by time).
    static Set *makeCardio(const QString &exerciseName,
                           int durationSec,
                           double distanceM = -1.0,
                           double avgPaceSecPerKm = -1.0,
                           const QDateTime &timestamp = QDateTime::currentDateTime(),
                           QObject *parent = nullptr);

    qint64    id()             const { return m_id; }
    QString   exerciseName()   const { return m_exerciseName; }
    QString   kind()           const { return m_kind; }

    // Lift fields
    double    weightKg()       const { return m_weightKg;     }
    int       reps()           const { return m_reps;         }
    int       rir()            const { return m_rir;          }
    // RPE is retained for backwards compatibility with sets logged before
    // 2026-04-30. New sets should use RIR. RPE/RIR rough mapping:
    //   RPE 10 ~ RIR 0,  RPE 9 ~ RIR 1,  RPE 8 ~ RIR 2,  RPE 7 ~ RIR 3.
    int       rpe()            const { return m_rpe;          }

    // Cardio fields (-1 == not recorded)
    int       durationSec()    const { return m_durationSec;      }
    double    distanceM()      const { return m_distanceM;        }
    double    avgPaceSecPerKm()const { return m_avgPaceSecPerKm;  }

    QDateTime timestamp()      const { return m_timestamp; }

    // Volume: tonnage for lift sets; 0 for cardio (progress is by distance/time).
    double    volume()         const { return m_kind == QLatin1String("lift")
                                              ? m_weightKg * m_reps : 0.0; }

    // Stable per-day grouping key.
    QString   dayKey()         const { return m_timestamp.date().toString(Qt::ISODate); }

    void setExerciseName(const QString &v);
    void setKind(const QString &v);
    void setWeightKg(double v);
    void setReps(int v);
    void setRir(int v);
    void setRpe(int v);
    void setDurationSec(int v);
    void setDistanceM(double v);
    void setAvgPaceSecPerKm(double v);
    void setTimestamp(const QDateTime &v);

signals:
    void exerciseNameChanged();
    void kindChanged();
    void weightKgChanged();
    void repsChanged();
    void rirChanged();
    void rpeChanged();
    void durationSecChanged();
    void distanceMChanged();
    void avgPaceSecPerKmChanged();
    void timestampChanged();
    void volumeChanged();

private:
    static qint64 nextId();              // monotonic, process-local

    qint64    m_id               = 0;
    QString   m_exerciseName;
    QString   m_kind             = QStringLiteral("lift");  // "lift"|"cardio"

    // Lift fields.
    //
    // Storage notes (per the 2026-05-03 size-shrink pass):
    //   * reps: realistic upper bound is ~200 (high-rep crossfit/walks).
    //     quint16 (0..65535) covers it with 16 bits instead of 32.
    //   * rir: range -1..15 (sentinel + 0..15). qint8 fits comfortably and
    //     keeps the "-1 = not recorded" sentinel cleanly representable.
    //   * rpe: legacy 0..10 + 0 sentinel — qint8 is plenty.
    // The Q_PROPERTY surface stays int so QML bindings don't change; the
    // public read accessors widen on the way out.
    double    m_weightKg         = 0.0;
    quint16   m_reps             = 0;
    qint8     m_rir              = -1;   // -1 = not recorded; 0 = to failure
    qint8     m_rpe              = 0;    // 0 = not recorded (legacy)

    // Cardio fields.
    //
    // durationSec capped at ~6.2 hours (22000s) by qint16 — too tight for
    // multi-day events. We keep durationSec as qint32 to leave headroom for
    // ultra-endurance entries; a 24h ride is 86400s.
    // distanceM stays double (treadmill 0.1m increments matter for pace).
    qint32    m_durationSec      = -1;   // -1 = not recorded
    double    m_distanceM        = -1.0; // -1 = not recorded
    double    m_avgPaceSecPerKm  = -1.0; // -1 = not recorded

    QDateTime m_timestamp;
};

#endif // PEAKFETTLE_SET_H
