// ---------------------------------------------------------------------------
// ExerciseLibrary.cpp
//
// Bundled static list of common exercises. Curated to cover:
//   * the major compound lifts every program needs,
//   * machine variants for users without barbell access,
//   * dumbbell + bodyweight variants for travel / home gyms,
//   * accessory work for each muscle group,
//   * cardio modalities + a small set of plyometrics and mobility drills
//     so non-lifters can also get started.
// ---------------------------------------------------------------------------

#include "ExerciseLibrary.h"

#include <QSet>
#include <algorithm>

static ExerciseLibrary *s_instance = nullptr;

ExerciseLibrary::ExerciseLibrary(QObject *parent)
    : QObject(parent)
{
    seed();
}

ExerciseLibrary *ExerciseLibrary::create(QQmlEngine *, QJSEngine *)
{
    if (!s_instance) s_instance = new ExerciseLibrary();
    return s_instance;
}

void ExerciseLibrary::addAll(const QString &category, const QStringList &names)
{
    if (!m_byCategory.contains(category)) {
        m_byCategory.insert(category, QStringList{});
    }
    QStringList &bucket = m_byCategory[category];
    for (const QString &n : names) {
        bucket.append(n);
        m_all.append(n);
        // Build the reverse map needed for alias lookups.
        m_canonicalByLower.insert(n.toLower(), n);
    }
}

void ExerciseLibrary::addAlias(const QString &alias, const QString &canonicalExact)
{
    // We look up canonical by lowercase so both maps use the same key space.
    m_aliasToName.insert(alias.toLower(), canonicalExact.toLower());
}

QStringList ExerciseLibrary::byCategory(const QString &category) const
{
    return m_byCategory.value(category);
}

QString ExerciseLibrary::categoryLabel(const QString &category) const
{
    return m_categoryLabels.value(category, category);
}

QStringList ExerciseLibrary::search(const QString &query, int limit) const
{
    const QString q = query.trimmed();
    if (q.isEmpty()) {
        QStringList head = m_all;
        if (limit > 0 && head.size() > limit) head = head.mid(0, limit);
        return head;
    }

    // Case-insensitive substring match, prioritizing prefix matches over
    // mid-string matches so "bench" surfaces "Bench Press" before
    // "Close-Grip Bench Press".
    QStringList prefix;
    QStringList mid;
    for (const QString &name : m_all) {
        const int idx = name.indexOf(q, 0, Qt::CaseInsensitive);
        if (idx == 0)      prefix.append(name);
        else if (idx > 0)  mid.append(name);
    }
    QStringList out = prefix + mid;
    if (limit > 0 && out.size() > limit) out = out.mid(0, limit);
    return out;
}

// TICKET-007: Alias-aware search returning { name, hint } maps.
// Ordering: canonical prefix > canonical mid > alias exact > alias prefix > alias mid.
// Deduplication: a canonical name is included only once (first-hit wins).
QVariantList ExerciseLibrary::searchDetailed(const QString &query, int limit) const
{
    const QString q = query.trimmed().toLower();
    if (q.isEmpty()) {
        // Return the full library without hints (no alias context needed).
        QVariantList out;
        out.reserve(std::min(m_all.size(), limit > 0 ? limit : m_all.size()));
        for (const QString &name : m_all) {
            if (limit > 0 && out.size() >= limit) break;
            QVariantMap m;
            m.insert("name", name);
            m.insert("hint", QString());
            out.append(m);
        }
        return out;
    }

    // ---- Stage 1: canonical name matches (prefix then mid) ----
    QStringList namePrefix, nameMid;
    for (const QString &name : m_all) {
        const QString nl = name.toLower();
        const int idx = nl.indexOf(q);
        if      (idx == 0) namePrefix.append(name);
        else if (idx > 0)  nameMid.append(name);
    }

    // ---- Stage 2: alias matches (exact, prefix, mid) ----
    // Each alias bucket: the alias text (for display as hint) + canonical name.
    struct AliasHit { QString canonical; QString aliasText; };
    QVector<AliasHit> aliasExact, aliasPrefix, aliasMid;

    for (auto it = m_aliasToName.constBegin(); it != m_aliasToName.constEnd(); ++it) {
        const QString &aliasKey  = it.key();    // lowercased alias
        const QString &canonLow  = it.value();  // lowercased canonical

        // Reconstruct the display-case alias from the key (it IS the alias key).
        // We stored canonical display-case in m_canonicalByLower.
        const QString canonDisplay = m_canonicalByLower.value(canonLow, canonLow);
        // For the hint label, capitalize the first letter of the alias.
        const QString aliasDisplay = aliasKey.length() > 0
                                     ? aliasKey.at(0).toUpper() + aliasKey.mid(1)
                                     : aliasKey;

        const int idx = aliasKey.indexOf(q);
        if      (idx == 0 && aliasKey == q)  aliasExact.append({ canonDisplay, aliasDisplay });
        else if (idx == 0)                   aliasPrefix.append({ canonDisplay, aliasDisplay });
        else if (idx > 0)                    aliasMid.append({ canonDisplay, aliasDisplay });
    }

    // ---- Stage 3: merge with dedup ----
    QVariantList out;
    QSet<QString> seen;

    auto addName = [&](const QString &name, const QString &hint) {
        if (limit > 0 && out.size() >= limit) return;
        if (seen.contains(name)) return;
        seen.insert(name);
        QVariantMap m;
        m.insert("name", name);
        m.insert("hint", hint);
        out.append(m);
    };

    for (const QString &n : namePrefix) addName(n, QString());
    for (const QString &n : nameMid)    addName(n, QString());
    for (const AliasHit &h : aliasExact)  addName(h.canonical, h.aliasText);
    for (const AliasHit &h : aliasPrefix) addName(h.canonical, h.aliasText);
    for (const AliasHit &h : aliasMid)    addName(h.canonical, h.aliasText);

    return out;
}

QVariantList ExerciseLibrary::grouped() const
{
    // N-04: exercises that appear in more than one category (e.g., a pull
    // exercise seeded under both "Back" and "Arms") would show up twice in
    // browse mode, confusing the user. Deduplicate with a seen-set: an
    // exercise is only included in the first category it is encountered in.
    QVariantList out;
    QSet<QString> seen;
    out.reserve(m_categoryOrder.size());
    for (const QString &cat : m_categoryOrder) {
        QStringList unique;
        for (const QString &ex : m_byCategory.value(cat)) {
            if (!seen.contains(ex)) {
                seen.insert(ex);
                unique.append(ex);
            }
        }
        if (unique.isEmpty()) continue;   // skip empty groups after dedup
        QVariantMap m;
        m.insert("category",  cat);
        m.insert("label",     categoryLabel(cat));
        m.insert("exercises", QVariant(unique));
        out.append(m);
    }
    return out;
}

void ExerciseLibrary::seed()
{
    // ---- Category ordering and labels ----
    // Order is deliberate: most-used categories first so a casual user
    // sees the lifts they'll actually search for at the top of a sectioned
    // list.
    auto reg = [&](const QString &key, const QString &label) {
        m_categoryOrder.append(key);
        m_categoryLabels.insert(key, label);
    };
    reg(QStringLiteral("chest"),       QStringLiteral("Chest"));
    reg(QStringLiteral("back"),        QStringLiteral("Back"));
    reg(QStringLiteral("shoulders"),   QStringLiteral("Shoulders"));
    reg(QStringLiteral("biceps"),      QStringLiteral("Biceps"));
    reg(QStringLiteral("triceps"),     QStringLiteral("Triceps"));
    reg(QStringLiteral("forearms"),    QStringLiteral("Forearms & Grip"));
    reg(QStringLiteral("quads"),       QStringLiteral("Quads"));
    reg(QStringLiteral("hamstrings"),  QStringLiteral("Hamstrings"));
    reg(QStringLiteral("glutes"),      QStringLiteral("Glutes"));
    reg(QStringLiteral("calves"),      QStringLiteral("Calves"));
    reg(QStringLiteral("core"),        QStringLiteral("Core"));
    reg(QStringLiteral("full_body"),   QStringLiteral("Full Body"));
    reg(QStringLiteral("olympic"),     QStringLiteral("Olympic Lifts"));
    reg(QStringLiteral("plyometrics"), QStringLiteral("Plyometrics"));
    reg(QStringLiteral("cardio"),      QStringLiteral("Cardio"));
    reg(QStringLiteral("mobility"),    QStringLiteral("Mobility & Stretch"));

    // ---- Chest ----
    addAll(QStringLiteral("chest"), QStringList{
        QStringLiteral("Barbell Bench Press"),
        QStringLiteral("Incline Barbell Bench Press"),
        QStringLiteral("Decline Barbell Bench Press"),
        QStringLiteral("Close-Grip Bench Press"),
        QStringLiteral("Dumbbell Bench Press"),
        QStringLiteral("Incline Dumbbell Press"),
        QStringLiteral("Decline Dumbbell Press"),
        QStringLiteral("Flat Dumbbell Fly"),
        QStringLiteral("Incline Dumbbell Fly"),
        QStringLiteral("Cable Crossover"),
        QStringLiteral("Cable Fly (Low to High)"),
        QStringLiteral("Cable Fly (High to Low)"),
        QStringLiteral("Pec Deck"),
        QStringLiteral("Machine Chest Press"),
        QStringLiteral("Smith Machine Bench Press"),
        QStringLiteral("Push-Up"),
        QStringLiteral("Incline Push-Up"),
        QStringLiteral("Decline Push-Up"),
        QStringLiteral("Diamond Push-Up"),
        QStringLiteral("Wide-Grip Push-Up"),
        QStringLiteral("Archer Push-Up"),
        QStringLiteral("Plyometric Push-Up"),
        QStringLiteral("Dip (Chest-Focused)"),
        QStringLiteral("Weighted Dip"),
        QStringLiteral("Svend Press"),
        QStringLiteral("Floor Press"),
        QStringLiteral("Landmine Press"),
    });

    // ---- Back ----
    addAll(QStringLiteral("back"), QStringList{
        QStringLiteral("Deadlift"),
        QStringLiteral("Sumo Deadlift"),
        QStringLiteral("Trap Bar Deadlift"),
        QStringLiteral("Stiff-Leg Deadlift"),
        QStringLiteral("Rack Pull"),
        QStringLiteral("Pull-Up"),
        QStringLiteral("Chin-Up"),
        QStringLiteral("Wide-Grip Pull-Up"),
        QStringLiteral("Neutral-Grip Pull-Up"),
        QStringLiteral("Weighted Pull-Up"),
        QStringLiteral("Lat Pulldown"),
        QStringLiteral("Wide-Grip Lat Pulldown"),
        QStringLiteral("Reverse-Grip Lat Pulldown"),
        QStringLiteral("Straight-Arm Pulldown"),
        QStringLiteral("Barbell Row"),
        QStringLiteral("Pendlay Row"),
        QStringLiteral("Yates Row"),
        QStringLiteral("T-Bar Row"),
        QStringLiteral("Seated Cable Row"),
        QStringLiteral("Single-Arm Dumbbell Row"),
        QStringLiteral("Chest-Supported Dumbbell Row"),
        QStringLiteral("Meadows Row"),
        QStringLiteral("Inverted Row"),
        QStringLiteral("Machine Row"),
        QStringLiteral("Hyperextension"),
        QStringLiteral("Reverse Hyperextension"),
        QStringLiteral("Good Morning"),
        QStringLiteral("Shrug (Barbell)"),
        QStringLiteral("Shrug (Dumbbell)"),
        QStringLiteral("Farmer's Carry"),
    });

    // ---- Shoulders ----
    addAll(QStringLiteral("shoulders"), QStringList{
        QStringLiteral("Overhead Press"),
        QStringLiteral("Push Press"),
        QStringLiteral("Seated Barbell Press"),
        QStringLiteral("Dumbbell Shoulder Press"),
        QStringLiteral("Seated Dumbbell Press"),
        QStringLiteral("Arnold Press"),
        QStringLiteral("Machine Shoulder Press"),
        QStringLiteral("Smith Machine Overhead Press"),
        QStringLiteral("Lateral Raise"),
        QStringLiteral("Cable Lateral Raise"),
        QStringLiteral("Machine Lateral Raise"),
        QStringLiteral("Front Raise"),
        QStringLiteral("Cable Front Raise"),
        QStringLiteral("Plate Front Raise"),
        QStringLiteral("Bent-Over Reverse Fly"),
        QStringLiteral("Reverse Pec Deck"),
        QStringLiteral("Face Pull"),
        QStringLiteral("Cable Rear Delt Fly"),
        QStringLiteral("Upright Row"),
        QStringLiteral("Landmine Lateral Raise"),
        QStringLiteral("Y-Raise"),
        QStringLiteral("Pike Push-Up"),
        QStringLiteral("Handstand Push-Up"),
    });

    // ---- Biceps ----
    addAll(QStringLiteral("biceps"), QStringList{
        QStringLiteral("Barbell Curl"),
        QStringLiteral("EZ-Bar Curl"),
        QStringLiteral("Dumbbell Curl"),
        QStringLiteral("Alternating Dumbbell Curl"),
        QStringLiteral("Hammer Curl"),
        QStringLiteral("Cross-Body Hammer Curl"),
        QStringLiteral("Incline Dumbbell Curl"),
        QStringLiteral("Preacher Curl"),
        QStringLiteral("Spider Curl"),
        QStringLiteral("Concentration Curl"),
        QStringLiteral("Cable Curl"),
        QStringLiteral("Cable Rope Hammer Curl"),
        QStringLiteral("Reverse Curl"),
        QStringLiteral("Zottman Curl"),
        QStringLiteral("Bayesian Curl"),
        QStringLiteral("Drag Curl"),
        QStringLiteral("Machine Curl"),
        QStringLiteral("Chin-Up (Bicep-Focused)"),
    });

    // ---- Triceps ----
    addAll(QStringLiteral("triceps"), QStringList{
        QStringLiteral("Triceps Pushdown"),
        QStringLiteral("Rope Pushdown"),
        QStringLiteral("Reverse-Grip Pushdown"),
        QStringLiteral("Overhead Triceps Extension"),
        QStringLiteral("Skull Crusher"),
        QStringLiteral("EZ-Bar Skull Crusher"),
        QStringLiteral("Dumbbell Skull Crusher"),
        QStringLiteral("Cable Overhead Extension"),
        QStringLiteral("Triceps Kickback"),
        QStringLiteral("Cable Kickback"),
        QStringLiteral("Diamond Push-Up"),
        QStringLiteral("Bench Dip"),
        QStringLiteral("Parallel Bar Dip (Triceps-Focused)"),
        QStringLiteral("Close-Grip Push-Up"),
        QStringLiteral("JM Press"),
        QStringLiteral("Tate Press"),
        QStringLiteral("Machine Triceps Extension"),
    });

    // ---- Forearms / Grip ----
    addAll(QStringLiteral("forearms"), QStringList{
        QStringLiteral("Wrist Curl"),
        QStringLiteral("Reverse Wrist Curl"),
        QStringLiteral("Behind-the-Back Wrist Curl"),
        QStringLiteral("Plate Pinch Hold"),
        QStringLiteral("Dead Hang"),
        QStringLiteral("Towel Pull-Up"),
        QStringLiteral("Captain of Crush Gripper"),
        QStringLiteral("Wrist Roller"),
        QStringLiteral("Reverse Curl"),
        QStringLiteral("Hex Hold"),
        QStringLiteral("Farmer's Walk"),
    });

    // ---- Quads ----
    addAll(QStringLiteral("quads"), QStringList{
        QStringLiteral("Back Squat"),
        QStringLiteral("Front Squat"),
        QStringLiteral("High-Bar Squat"),
        QStringLiteral("Low-Bar Squat"),
        QStringLiteral("Pause Squat"),
        QStringLiteral("Box Squat"),
        QStringLiteral("Goblet Squat"),
        QStringLiteral("Zercher Squat"),
        QStringLiteral("Hack Squat"),
        QStringLiteral("Belt Squat"),
        QStringLiteral("Smith Machine Squat"),
        QStringLiteral("Leg Press"),
        QStringLiteral("Leg Extension"),
        QStringLiteral("Walking Lunge"),
        QStringLiteral("Reverse Lunge"),
        QStringLiteral("Bulgarian Split Squat"),
        QStringLiteral("Step-Up"),
        QStringLiteral("Sissy Squat"),
        QStringLiteral("Pistol Squat"),
        QStringLiteral("Bodyweight Squat"),
        QStringLiteral("Wall Sit"),
    });

    // ---- Hamstrings ----
    addAll(QStringLiteral("hamstrings"), QStringList{
        QStringLiteral("Romanian Deadlift"),
        QStringLiteral("Stiff-Leg Deadlift"),
        QStringLiteral("Single-Leg Romanian Deadlift"),
        QStringLiteral("Lying Leg Curl"),
        QStringLiteral("Seated Leg Curl"),
        QStringLiteral("Standing Leg Curl"),
        QStringLiteral("Nordic Curl"),
        QStringLiteral("Glute-Ham Raise"),
        QStringLiteral("Good Morning"),
        QStringLiteral("Cable Pull-Through"),
        QStringLiteral("Reverse Hyperextension"),
        QStringLiteral("Kettlebell Swing"),
    });

    // ---- Glutes ----
    addAll(QStringLiteral("glutes"), QStringList{
        QStringLiteral("Hip Thrust"),
        QStringLiteral("Barbell Hip Thrust"),
        QStringLiteral("Glute Bridge"),
        QStringLiteral("Single-Leg Hip Thrust"),
        QStringLiteral("Cable Pull-Through"),
        QStringLiteral("Cable Kickback"),
        QStringLiteral("Frog Pump"),
        QStringLiteral("Sumo Deadlift"),
        QStringLiteral("Curtsy Lunge"),
        QStringLiteral("Glute Kickback Machine"),
        QStringLiteral("Banded Side Walk"),
        QStringLiteral("Banded Clamshell"),
        QStringLiteral("Step-Up"),
        QStringLiteral("Bulgarian Split Squat"),
    });

    // ---- Calves ----
    addAll(QStringLiteral("calves"), QStringList{
        QStringLiteral("Standing Calf Raise"),
        QStringLiteral("Seated Calf Raise"),
        QStringLiteral("Donkey Calf Raise"),
        QStringLiteral("Leg Press Calf Raise"),
        QStringLiteral("Smith Machine Calf Raise"),
        QStringLiteral("Single-Leg Calf Raise"),
        QStringLiteral("Tibialis Raise"),
        QStringLiteral("Jump Rope"),
    });

    // ---- Core ----
    addAll(QStringLiteral("core"), QStringList{
        QStringLiteral("Plank"),
        QStringLiteral("Side Plank"),
        QStringLiteral("RKC Plank"),
        QStringLiteral("Hollow Hold"),
        QStringLiteral("Dead Bug"),
        QStringLiteral("Bird Dog"),
        QStringLiteral("Hanging Leg Raise"),
        QStringLiteral("Hanging Knee Raise"),
        QStringLiteral("Toes-to-Bar"),
        QStringLiteral("Captain's Chair Knee Raise"),
        QStringLiteral("Cable Crunch"),
        QStringLiteral("Crunch"),
        QStringLiteral("Sit-Up"),
        QStringLiteral("Bicycle Crunch"),
        QStringLiteral("V-Up"),
        QStringLiteral("Russian Twist"),
        QStringLiteral("Pallof Press"),
        QStringLiteral("Ab Wheel Rollout"),
        QStringLiteral("Mountain Climber"),
        QStringLiteral("L-Sit"),
        QStringLiteral("Dragon Flag"),
        QStringLiteral("Wood Chop (Cable)"),
    });

    // ---- Full Body / Compounds ----
    addAll(QStringLiteral("full_body"), QStringList{
        QStringLiteral("Burpee"),
        QStringLiteral("Thruster"),
        QStringLiteral("Clean and Press"),
        QStringLiteral("Turkish Get-Up"),
        QStringLiteral("Devil Press"),
        QStringLiteral("Man Maker"),
        QStringLiteral("Bear Crawl"),
        QStringLiteral("Sled Push"),
        QStringLiteral("Sled Pull"),
        QStringLiteral("Sandbag Carry"),
        QStringLiteral("Tire Flip"),
        QStringLiteral("Atlas Stone Lift"),
    });

    // ---- Olympic Lifts ----
    addAll(QStringLiteral("olympic"), QStringList{
        QStringLiteral("Snatch"),
        QStringLiteral("Power Snatch"),
        QStringLiteral("Hang Snatch"),
        QStringLiteral("Snatch Pull"),
        QStringLiteral("Overhead Squat"),
        QStringLiteral("Clean"),
        QStringLiteral("Power Clean"),
        QStringLiteral("Hang Clean"),
        QStringLiteral("Clean Pull"),
        QStringLiteral("Front Squat (Clean)"),
        QStringLiteral("Jerk"),
        QStringLiteral("Push Jerk"),
        QStringLiteral("Split Jerk"),
        QStringLiteral("Clean and Jerk"),
    });

    // ---- Plyometrics ----
    addAll(QStringLiteral("plyometrics"), QStringList{
        QStringLiteral("Box Jump"),
        QStringLiteral("Broad Jump"),
        QStringLiteral("Depth Jump"),
        QStringLiteral("Tuck Jump"),
        QStringLiteral("Jump Squat"),
        QStringLiteral("Lateral Bound"),
        QStringLiteral("Skater Jump"),
        QStringLiteral("Plyo Push-Up"),
        QStringLiteral("Medicine Ball Slam"),
        QStringLiteral("Medicine Ball Chest Pass"),
        QStringLiteral("Medicine Ball Rotational Throw"),
        QStringLiteral("Bounding"),
    });

    // ---- Cardio ----
    addAll(QStringLiteral("cardio"), QStringList{
        QStringLiteral("Running (Outdoor)"),
        QStringLiteral("Treadmill Run"),
        QStringLiteral("Treadmill Walk"),
        QStringLiteral("Incline Walk"),
        QStringLiteral("Sprint Intervals"),
        QStringLiteral("400m Repeats"),
        QStringLiteral("800m Repeats"),
        QStringLiteral("Mile Repeats"),
        QStringLiteral("5K Run"),
        QStringLiteral("10K Run"),
        QStringLiteral("Half Marathon"),
        QStringLiteral("Marathon"),
        QStringLiteral("Trail Run"),
        QStringLiteral("Hill Sprints"),
        QStringLiteral("Cycling (Outdoor)"),
        QStringLiteral("Stationary Bike"),
        QStringLiteral("Spin Class"),
        QStringLiteral("Assault Bike"),
        QStringLiteral("Rowing (Erg)"),
        QStringLiteral("Rowing (Water)"),
        QStringLiteral("Swimming (Freestyle)"),
        QStringLiteral("Swimming (Breaststroke)"),
        QStringLiteral("Swimming (Backstroke)"),
        QStringLiteral("Swimming (Butterfly)"),
        QStringLiteral("Stair Climber"),
        QStringLiteral("Elliptical"),
        QStringLiteral("Jump Rope"),
        QStringLiteral("Hike"),
        QStringLiteral("Ruck March"),
        QStringLiteral("Soccer Match"),
        QStringLiteral("Basketball Game"),
        QStringLiteral("Tennis Match"),
        QStringLiteral("Pickleball Match"),
        QStringLiteral("Climbing (Bouldering)"),
        QStringLiteral("Climbing (Top-Rope)"),
        QStringLiteral("Climbing (Lead)"),
    });

    // ---- Mobility & Stretch ----
    addAll(QStringLiteral("mobility"), QStringList{
        QStringLiteral("Couch Stretch"),
        QStringLiteral("90-90 Hip Stretch"),
        QStringLiteral("Pigeon Pose"),
        QStringLiteral("World's Greatest Stretch"),
        QStringLiteral("Cat-Cow"),
        QStringLiteral("Thoracic Spine Rotation"),
        QStringLiteral("Wall Slides"),
        QStringLiteral("Foam Roll Quads"),
        QStringLiteral("Foam Roll Back"),
        QStringLiteral("Foam Roll IT Band"),
        QStringLiteral("Banded Hip Flexor Stretch"),
        QStringLiteral("Hamstring Stretch"),
        QStringLiteral("Calf Stretch"),
        QStringLiteral("Shoulder Dislocates"),
    });

    // ---- TICKET-007: Aliases (colloquial → canonical) ----
    // These let users type gym-floor shorthand and find the canonical name.
    // Only add aliases for terms that are (a) genuinely common and
    // (b) ambiguous enough that a plain substring match would miss them.
    // Terms that already match via substring (e.g. "bench" matches
    // "Barbell Bench Press") still benefit from an alias that pushes them
    // to the TOP of results via the exact/prefix alias tier.

    // Chest
    addAlias("bench",           "Barbell Bench Press");
    addAlias("bench press",     "Barbell Bench Press");
    addAlias("flat bench",      "Barbell Bench Press");
    addAlias("chest press",     "Barbell Bench Press");
    addAlias("cgbp",            "Close-Grip Bench Press");
    addAlias("cg bench",        "Close-Grip Bench Press");
    addAlias("incline bench",   "Incline Barbell Bench Press");
    addAlias("db bench",        "Dumbbell Bench Press");
    addAlias("pec dec",         "Pec Deck");

    // Shoulders
    addAlias("ohp",             "Overhead Press");
    addAlias("military press",  "Overhead Press");
    addAlias("strict press",    "Overhead Press");
    addAlias("shoulder press",  "Overhead Press");
    addAlias("lateral raises",  "Lateral Raise");
    addAlias("side raises",     "Lateral Raise");
    addAlias("front raises",    "Front Raise");
    addAlias("face pulls",      "Face Pull");
    addAlias("rear delt fly",   "Bent-Over Reverse Fly");

    // Back
    addAlias("dl",              "Deadlift");
    addAlias("conventional",    "Deadlift");
    addAlias("conventional deadlift", "Deadlift");
    addAlias("pull ups",        "Pull-Up");
    addAlias("pullups",         "Pull-Up");
    addAlias("chin ups",        "Chin-Up");
    addAlias("chinups",         "Chin-Up");
    addAlias("lat pulldowns",   "Lat Pulldown");
    addAlias("cable rows",      "Seated Cable Row");
    addAlias("seated rows",     "Seated Cable Row");
    addAlias("t bar",           "T-Bar Row");
    addAlias("pendlay",         "Pendlay Row");
    addAlias("hyperextensions", "Hyperextension");
    addAlias("reverse hyper",   "Reverse Hyperextension");
    addAlias("shrugs",          "Shrug (Barbell)");
    addAlias("farmers carry",   "Farmer's Carry");
    addAlias("farmers walk",    "Farmer's Walk");

    // Biceps
    addAlias("bicep curl",      "Barbell Curl");
    addAlias("bicep curls",     "Barbell Curl");
    addAlias("hammer curls",    "Hammer Curl");
    addAlias("preacher curls",  "Preacher Curl");

    // Triceps
    addAlias("pushdowns",       "Triceps Pushdown");
    addAlias("rope pushdowns",  "Rope Pushdown");
    addAlias("skull crushers",  "Skull Crusher");
    addAlias("lying triceps extension", "Skull Crusher");
    addAlias("ez skull crusher","EZ-Bar Skull Crusher");

    // Quads / Legs
    addAlias("squat",           "Back Squat");
    addAlias("barbell squat",   "Back Squat");
    addAlias("lunge",           "Walking Lunge");
    addAlias("lunges",          "Walking Lunge");
    addAlias("bss",             "Bulgarian Split Squat");
    addAlias("split squat",     "Bulgarian Split Squat");
    addAlias("hack squats",     "Hack Squat");
    addAlias("goblet",          "Goblet Squat");
    addAlias("zercher",         "Zercher Squat");
    addAlias("leg curls",       "Lying Leg Curl");
    addAlias("leg extensions",  "Leg Extension");

    // Hamstrings
    addAlias("rdl",             "Romanian Deadlift");
    addAlias("romanian",        "Romanian Deadlift");
    addAlias("hip hinge",       "Romanian Deadlift");
    addAlias("sldl",            "Stiff-Leg Deadlift");
    addAlias("nordic hamstring","Nordic Curl");
    addAlias("nordic",          "Nordic Curl");
    addAlias("glute ham",       "Glute-Ham Raise");
    addAlias("ghr",             "Glute-Ham Raise");
    addAlias("kb swing",        "Kettlebell Swing");
    addAlias("kettlebell swings","Kettlebell Swing");

    // Glutes
    addAlias("hip thrusts",     "Barbell Hip Thrust");
    addAlias("banded clamshells","Banded Clamshell");

    // Calves
    addAlias("calf raises",     "Standing Calf Raise");
    addAlias("seated calves",   "Seated Calf Raise");

    // Core
    addAlias("ab rollout",      "Ab Wheel Rollout");
    addAlias("rollouts",        "Ab Wheel Rollout");
    addAlias("pallof",          "Pallof Press");
    addAlias("ttb",             "Toes-to-Bar");
    addAlias("toes to bar",     "Toes-to-Bar");
    addAlias("hollow body",     "Hollow Hold");
    addAlias("dead bugs",       "Dead Bug");
    addAlias("bird dogs",       "Bird Dog");
    addAlias("mountain climbers","Mountain Climber");

    // Olympic
    addAlias("c&j",             "Clean and Jerk");
    addAlias("power cleans",    "Power Clean");
    addAlias("hang power clean","Hang Clean");
    addAlias("tgu",             "Turkish Get-Up");
    addAlias("turkish getup",   "Turkish Get-Up");
    addAlias("get up",          "Turkish Get-Up");

    // Cardio
    addAlias("running",         "Running (Outdoor)");
    addAlias("run",             "Running (Outdoor)");
    addAlias("outdoor run",     "Running (Outdoor)");
    addAlias("treadmill",       "Treadmill Run");
    addAlias("bike",            "Stationary Bike");
    addAlias("cycling",         "Cycling (Outdoor)");
    addAlias("erg",             "Rowing (Erg)");
    addAlias("rowing machine",  "Rowing (Erg)");
    addAlias("erging",          "Rowing (Erg)");
    addAlias("swim",            "Swimming (Freestyle)");
    addAlias("swimming",        "Swimming (Freestyle)");
    addAlias("stairs",          "Stair Climber");
    addAlias("stair climber",   "Stair Climber");
    addAlias("jump rope",       "Jump Rope");
    addAlias("skipping",        "Jump Rope");
    addAlias("hike",            "Hike");
    addAlias("hiking",          "Hike");
    addAlias("assault bike",    "Assault Bike");

    // Full body
    addAlias("sled",            "Sled Push");
    addAlias("sandbag",         "Sandbag Carry");
    addAlias("tire",            "Tire Flip");

    // De-duplicate the master list (some exercises live in multiple
    // categories - e.g. Sumo Deadlift sits under Back AND Glutes - but
    // the global picker should only show each name once).
    QSet<QString> seen;
    QStringList unique;
    unique.reserve(m_all.size());
    for (const QString &n : std::as_const(m_all)) {
        if (!seen.contains(n)) {
            seen.insert(n);
            unique.append(n);
        }
    }
    std::sort(unique.begin(), unique.end(), [](const QString &a, const QString &b){
        return a.compare(b, Qt::CaseInsensitive) < 0;
    });
    m_all = unique;
}
