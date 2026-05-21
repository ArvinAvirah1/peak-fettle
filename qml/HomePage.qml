// ---------------------------------------------------------------------------
// HomePage.qml — post-login home dashboard.
//
// Shown after sign-up / onboarding (new users) and after "I already have
// an account" (returning users). Acts as the persistent root of the
// post-auth navigation stack so the tracker, graphs, and settings all
// have a sensible home to return to.
//
// Content sections:
//   1. Header       — mountain logo, title, Graph ↗ shortcut, gear icon
//   2. Greeting     — time-of-day message + today's date
//   3. Streak card  — consecutive training days (computed in JS from
//                     recentSets); shows flame if active, lightning if
//                     the user hasn't started one yet
//   4. Stats row    — total sets · workouts this week · PRs this week
//   5. Start CTA    — large primary button → SetTrackerPage
//   6. Recent workouts — last 5 unique training days, set count,
//                        exercises, and a PR badge count
//   7. Empty state  — shown until the first set is logged
//
// Streak algorithm:
//   Pull up to 500 recent sets (covers ~3+ months of daily training).
//   Build a set of unique dayKeys. Walk backwards from today; if today
//   has no sets, start the walk from yesterday (so the streak is not
//   broken at 9 am before the morning session). Count consecutive hits.
//
// Authors: dev-frontend
// Date: 2026-05-02
// ---------------------------------------------------------------------------

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import PeakFettle 1.0
import "components"
// AvatarButton replaces the ⚙ gear icon — see qml/components/AvatarButton.qml

Page {
    id: page
    background: Rectangle { color: Theme.black }

    // ----- Reactive data -----
    property var  allSets:       []
    property int  currentStreak: 0
    property int  weekWorkouts:  0
    property int  weekPRs:       0
    property var  recentDays:    []   // [{dayKey, label, setCount, exercises, prCount}]

    function refresh() {
        // X-06: raised from 500 to 2000 so streak counter doesn't silently cap
        // at ~100 training days for dedicated daily users. 2000 sets covers
        // roughly 5-6 years of daily training at ~1 set/day minimum.
        allSets       = WorkoutTracker.recentSets(2000);
        currentStreak = computeStreak();
        weekWorkouts  = computeWeekWorkouts();
        weekPRs       = computeWeekPRs();
        recentDays    = computeRecentDays(5);
    }

    Component.onCompleted: refresh()
    Connections {
        target: WorkoutTracker
        function onDataChanged() { page.refresh(); }
    }

    // ----- Streak -----
    // Walk backwards from today (or yesterday when nothing is logged yet
    // today) and count consecutive days that have at least one set.
    function computeStreak() {
        if (allSets.length === 0) return 0;

        const dayKeys = {};
        for (let i = 0; i < allSets.length; i++) {
            dayKeys[allSets[i].dayKey] = true;
        }

        const today = Qt.formatDate(new Date(), "yyyy-MM-dd");
        const check = new Date();
        if (!dayKeys[today]) {
            check.setDate(check.getDate() - 1);   // nothing yet today — start from yesterday
        }

        let streak = 0;
        while (true) {
            const k = Qt.formatDate(check, "yyyy-MM-dd");
            if (dayKeys[k]) {
                streak++;
                check.setDate(check.getDate() - 1);
            } else {
                break;
            }
        }
        return streak;
    }

    // ----- Weekly stats -----
    function computeWeekWorkouts() {
        const dayKeys = {};
        const cutoff  = new Date();
        cutoff.setDate(cutoff.getDate() - 6);
        cutoff.setHours(0, 0, 0, 0);
        for (let i = 0; i < allSets.length; i++) {
            const ts = new Date(allSets[i].timestamp);
            if (ts >= cutoff) dayKeys[allSets[i].dayKey] = true;
        }
        return Object.keys(dayKeys).length;
    }

    function computeWeekPRs() {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 6);
        cutoff.setHours(0, 0, 0, 0);
        let count = 0;
        for (let i = 0; i < allSets.length; i++) {
            const ts = new Date(allSets[i].timestamp);
            if (ts >= cutoff && allSets[i].isPr) count++;
        }
        return count;
    }

    // ----- Recent days -----
    // Aggregate sets by calendar day, return the most-recent maxDays entries
    // with human-readable labels ("Today", "Yesterday", "Mon, Apr 28", …).
    function computeRecentDays(maxDays) {
        const dayMap = {};
        for (let i = 0; i < allSets.length; i++) {
            const s = allSets[i];
            if (!dayMap[s.dayKey]) {
                dayMap[s.dayKey] = {
                    dayKey:    s.dayKey,
                    setCount:  0,
                    exercises: [],
                    exSeen:    {},
                    prCount:   0
                };
            }
            dayMap[s.dayKey].setCount++;
            if (!dayMap[s.dayKey].exSeen[s.exercise]) {
                dayMap[s.dayKey].exSeen[s.exercise] = true;
                dayMap[s.dayKey].exercises.push(s.exercise);
            }
            if (s.isPr) dayMap[s.dayKey].prCount++;
        }

        const days = Object.values(dayMap)
            .sort(function(a, b) { return b.dayKey.localeCompare(a.dayKey); })
            .slice(0, maxDays);

        const today = Qt.formatDate(new Date(), "yyyy-MM-dd");
        const ydDate = new Date();
        ydDate.setDate(ydDate.getDate() - 1);
        const yesterday = Qt.formatDate(ydDate, "yyyy-MM-dd");

        for (let j = 0; j < days.length; j++) {
            if (days[j].dayKey === today) {
                days[j].label = "Today";
            } else if (days[j].dayKey === yesterday) {
                days[j].label = "Yesterday";
            } else {
                const parts = days[j].dayKey.split("-");
                const d = new Date(
                    parseInt(parts[0], 10),
                    parseInt(parts[1], 10) - 1,
                    parseInt(parts[2], 10)
                );
                days[j].label = Qt.formatDate(d, "ddd, MMM d");
            }
        }
        return days;
    }

    // ----- Helpers -----
    function greeting() {
        const h = new Date().getHours();
        if (h < 12) return "Good morning";
        if (h < 17) return "Good afternoon";
        return "Good evening";
    }

    // True when the first entry in recentDays is today (sets already logged).
    function hasTrainedToday() {
        return recentDays.length > 0
            && recentDays[0].dayKey === Qt.formatDate(new Date(), "yyyy-MM-dd");
    }

    // ----- Header -----
    header: Rectangle {
        height: 64
        color: Theme.navyDeep

        RowLayout {
            anchors.fill: parent
            anchors.leftMargin:  Theme.s4
            anchors.rightMargin: Theme.s4
            spacing: Theme.s3

            MountainLogo { size: 36 }

            ColumnLayout {
                Layout.fillWidth: true
                spacing: 0
                Text {
                    text: "Peak Fettle"
                    color: Theme.textPrimary
                    font.pixelSize: Theme.fontH2
                    font.bold: true
                }
                Text {
                    text: WorkoutTracker.totalSets > 0
                          ? WorkoutTracker.totalSets + " sets logged"
                          : "ready when you are"
                    color: Theme.turquoise
                    font.pixelSize: Theme.fontSmall
                }
            }

            ToolButton {
                text: "Graph ↗"
                font.pixelSize: Theme.fontBody
                font.bold: true
                enabled: WorkoutTracker.totalSets > 0
                onClicked: window.goTo("graph")
                contentItem: Text {
                    text: parent.text
                    color: parent.enabled ? Theme.turquoise : Theme.textSecondary
                    font: parent.font
                }
                background: Rectangle {
                    color: parent.hovered && parent.enabled
                        ? Qt.rgba(0.176, 0.831, 0.749, 0.10) : "transparent"
                    radius: Theme.radiusSm
                }
            }

            // 2026-05-03: shortcut to per-exercise percentile.
            // Always enabled — the page itself shows the right empty state
            // (no profile / no sets) so it can also serve as the gateway
            // for users who haven't filled the survey yet.
            ToolButton {
                text: "Rank ↗"
                font.pixelSize: Theme.fontBody
                font.bold: true
                onClicked: window.goTo("percentiles")
                contentItem: Text {
                    text: parent.text
                    color: Theme.turquoise
                    font: parent.font
                }
                background: Rectangle {
                    color: parent.hovered ? Qt.rgba(0.176, 0.831, 0.749, 0.10) : "transparent"
                    radius: Theme.radiusSm
                }
            }

            // Avatar replaces the ⚙ gear icon (2026-05-04).
            // Tapping it navigates to SettingsPage; a small red dot appears
            // when UserProfile.isComplete is false, nudging the user to
            // fill in their stats for percentile ranking.
            AvatarButton {
                size: 36
                Layout.alignment: Qt.AlignVCenter
            }
        }
    }

    // ----- Body -----
    Flickable {
        id: bodyFlick
        anchors.fill: parent
        contentWidth: width
        contentHeight: bodyCol.implicitHeight + Theme.s7
        clip: true

        ColumnLayout {
            id: bodyCol
            x: Theme.s4
            y: Theme.s5
            width: bodyFlick.width - Theme.s4 * 2
            spacing: Theme.s4

            // ---- Greeting ----
            ColumnLayout {
                Layout.fillWidth: true
                spacing: Theme.s1

                Text {
                    text: page.greeting() + "."
                    color: Theme.textSecondary
                    font.pixelSize: Theme.fontBody
                }
                Text {
                    text: Qt.formatDate(new Date(), "dddd, MMMM d")
                    color: Theme.textPrimary
                    font.pixelSize: Theme.fontH1
                    font.bold: true
                }
            }

            // ---- Streak card ----
            Rectangle {
                Layout.fillWidth: true
                radius: Theme.radiusLg
                border.width: 1
                border.color: page.currentStreak > 0
                              ? Qt.rgba(0.176, 0.831, 0.749, 0.60)
                              : Theme.navyLine
                color: page.currentStreak > 0
                       ? Qt.rgba(0.176, 0.831, 0.749, 0.10)
                       : Theme.navyDeep
                implicitHeight: streakRow.implicitHeight + Theme.s4 * 2

                RowLayout {
                    id: streakRow
                    anchors.fill: parent
                    anchors.margins: Theme.s4
                    spacing: Theme.s3

                    Text {
                        text: page.currentStreak > 0 ? "🔥" : "⚡"
                        font.pixelSize: 30
                        Layout.alignment: Qt.AlignVCenter
                    }

                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 3

                        Text {
                            text: page.currentStreak > 0
                                  ? page.currentStreak + "-day streak"
                                  : "Start your streak today"
                            color: Theme.textPrimary
                            font.pixelSize: Theme.fontH2
                            font.bold: true
                        }
                        Text {
                            text: page.currentStreak > 1
                                  ? "In fine fettle. Keep showing up."
                                  : (page.currentStreak === 1
                                     ? "Day 1. Keep the momentum going."
                                     : "Log a set every day to build your streak.")
                            color: Theme.textSecondary
                            font.pixelSize: Theme.fontSmall
                            wrapMode: Text.Wrap
                            Layout.fillWidth: true
                        }
                    }

                    // Streak number badge — visible only when streak is active.
                    Rectangle {
                        visible: page.currentStreak > 0
                        color: Qt.rgba(0.176, 0.831, 0.749, 0.22)
                        radius: Theme.radiusMd
                        implicitWidth:  streakNum.implicitWidth  + Theme.s3 * 2
                        implicitHeight: streakNum.implicitHeight + Theme.s2 * 2

                        Text {
                            id: streakNum
                            anchors.centerIn: parent
                            text: page.currentStreak
                            color: Theme.turquoise
                            font.pixelSize: Theme.fontH1
                            font.bold: true
                        }
                    }
                }
            }

            // ---- Stats row ----
            // Three equal-width tiles: total sets, workouts this week, PRs this week.
            RowLayout {
                Layout.fillWidth: true
                spacing: Theme.s3

                Repeater {
                    model: [
                        {
                            getValue: function() { return WorkoutTracker.totalSets.toString(); },
                            label: "total\nsets"
                        },
                        {
                            getValue: function() { return page.weekWorkouts.toString(); },
                            label: "workouts\nthis week"
                        },
                        {
                            getValue: function() { return page.weekPRs.toString(); },
                            label: "PRs\nthis week"
                        }
                    ]

                    delegate: Rectangle {
                        Layout.fillWidth: true
                        radius: Theme.radiusMd
                        color: Theme.navyDeep
                        border.color: Theme.navyLine
                        border.width: 1
                        implicitHeight: statCol.implicitHeight + Theme.s3 * 2

                        ColumnLayout {
                            id: statCol
                            anchors.fill: parent
                            anchors.margins: Theme.s3
                            spacing: 2

                            Text {
                                // Note: Repeater delegates can't call functions on modelData
                                // directly; index 0 = totalSets, 1 = weekWorkouts, 2 = weekPRs
                                text: index === 0 ? WorkoutTracker.totalSets.toString()
                                    : index === 1 ? page.weekWorkouts.toString()
                                                  : page.weekPRs.toString()
                                color: Theme.turquoise
                                font.pixelSize: Theme.fontH1
                                font.bold: true
                                Layout.alignment: Qt.AlignHCenter
                            }
                            Text {
                                text: modelData.label
                                color: Theme.textSecondary
                                font.pixelSize: Theme.fontSmall
                                horizontalAlignment: Text.AlignHCenter
                                wrapMode: Text.Wrap
                                Layout.alignment: Qt.AlignHCenter
                                Layout.fillWidth: true
                            }
                        }
                    }
                }
            }

            // ---- Start / Continue Today's Workout CTA ----
            // Full-width turquoise tile; label + subtitle toggle based on
            // whether the user has already logged anything today.
            Rectangle {
                Layout.fillWidth: true
                radius: Theme.radiusLg
                color: Theme.turquoise
                implicitHeight: ctaContent.implicitHeight + Theme.s4 * 2

                RowLayout {
                    id: ctaContent
                    anchors.fill: parent
                    anchors.margins: Theme.s4
                    spacing: Theme.s3

                    Text {
                        text: page.hasTrainedToday() ? "◉" : "▶"
                        color: Theme.textOnAccent
                        font.pixelSize: 22
                        font.bold: true
                        Layout.alignment: Qt.AlignVCenter
                    }

                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 3

                        Text {
                            text: page.hasTrainedToday()
                                  ? "Continue Today's Workout"
                                  : "Start Today's Workout"
                            color: Theme.textOnAccent
                            font.pixelSize: Theme.fontH2
                            font.bold: true
                        }
                        Text {
                            text: page.hasTrainedToday()
                                  ? page.recentDays[0].setCount + " set"
                                    + (page.recentDays[0].setCount === 1 ? "" : "s")
                                    + " · " + page.recentDays[0].exercises.length
                                    + " exercise"
                                    + (page.recentDays[0].exercises.length === 1 ? "" : "s")
                                    + " logged"
                                  : "Log your first set for today"
                            color: Qt.rgba(0, 0, 0, 0.60)
                            font.pixelSize: Theme.fontSmall
                        }
                    }

                    Text {
                        text: "→"
                        color: Theme.textOnAccent
                        font.pixelSize: 22
                        font.bold: true
                    }
                }

                MouseArea {
                    anchors.fill: parent
                    cursorShape: Qt.PointingHandCursor
                    onClicked: window.goTo("tracker")
                }
            }

            // ---- Recent Workouts ----
            // One row per unique training day, newest first.
            // Hidden entirely when no sets have been logged yet.
            Rectangle {
                id: recentCard
                Layout.fillWidth: true
                radius: Theme.radiusLg
                color: Theme.navyDeep
                border.color: Theme.navyLine
                border.width: 1
                implicitHeight: recentCol.implicitHeight + Theme.s4 * 2
                visible: page.recentDays.length > 0

                ColumnLayout {
                    id: recentCol
                    anchors.fill: parent
                    anchors.margins: Theme.s4
                    spacing: Theme.s2

                    // Card header
                    RowLayout {
                        Layout.fillWidth: true
                        Text {
                            Layout.fillWidth: true
                            text: "Recent Workouts"
                            color: Theme.textPrimary
                            font.pixelSize: Theme.fontH2
                            font.bold: true
                        }
                        ToolButton {
                            text: "Full history ↗"
                            font.pixelSize: Theme.fontSmall
                            enabled: WorkoutTracker.totalSets > 0
                            onClicked: window.goTo("graph")
                            contentItem: Text {
                                text: parent.text
                                color: parent.enabled ? Theme.turquoise : Theme.textSecondary
                                font: parent.font
                            }
                            background: Item {}
                        }
                    }

                    Rectangle { Layout.fillWidth: true; height: 1; color: Theme.navyLine }

                    // One row per recent training day.
                    Repeater {
                        model: page.recentDays

                        delegate: Rectangle {
                            Layout.fillWidth: true
                            implicitHeight: dayRow.implicitHeight + Theme.s2 * 2
                            radius: Theme.radiusMd
                            color: dayMouse.containsMouse
                                   ? Qt.rgba(0.176, 0.831, 0.749, 0.10)
                                   : "transparent"

                            RowLayout {
                                id: dayRow
                                anchors.fill: parent
                                anchors.leftMargin:  Theme.s2
                                anchors.rightMargin: Theme.s2
                                anchors.topMargin:   Theme.s2
                                anchors.bottomMargin: Theme.s2
                                spacing: Theme.s3

                                // Date + set count
                                ColumnLayout {
                                    spacing: 1
                                    Layout.preferredWidth: 72

                                    Text {
                                        text: modelData.label
                                        color: modelData.dayKey === Qt.formatDate(new Date(), "yyyy-MM-dd")
                                               ? Theme.turquoise : Theme.textPrimary
                                        font.pixelSize: Theme.fontSmall
                                        font.bold: true
                                    }
                                    Text {
                                        text: modelData.setCount + " set"
                                              + (modelData.setCount === 1 ? "" : "s")
                                        color: Theme.textSecondary
                                        font.pixelSize: Theme.fontSmall
                                    }
                                }

                                // Exercises (up to 3, then "+ N more")
                                Text {
                                    Layout.fillWidth: true
                                    text: {
                                        const ex = modelData.exercises;
                                        if (!ex || ex.length === 0) return "";
                                        const shown = ex.slice(0, 3).join(" · ");
                                        return ex.length > 3
                                            ? shown + " + " + (ex.length - 3) + " more"
                                            : shown;
                                    }
                                    color: Theme.textSecondary
                                    font.pixelSize: Theme.fontSmall
                                    elide: Text.ElideRight
                                }

                                // PR badge — only shown on days with at least one PR
                                Rectangle {
                                    visible: modelData.prCount > 0
                                    color: Qt.rgba(1.0, 0.84, 0.0, 0.18)
                                    border.color: Qt.rgba(1.0, 0.84, 0.0, 0.70)
                                    border.width: 1
                                    radius: 8
                                    implicitWidth:  prDayText.implicitWidth  + 12
                                    implicitHeight: 22

                                    Text {
                                        id: prDayText
                                        anchors.centerIn: parent
                                        text: modelData.prCount + " PR"
                                              + (modelData.prCount > 1 ? "s" : "")
                                        color: Qt.rgba(1.0, 0.80, 0.0, 1.0)
                                        font.pixelSize: Theme.fontSmall - 1
                                        font.bold: true
                                    }
                                }

                                Text {
                                    text: "›"
                                    color: Theme.textSecondary
                                    font.pixelSize: Theme.fontH2
                                }
                            }

                            MouseArea {
                                id: dayMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: window.goTo("tracker")
                            }
                        }
                    }
                }
            }

            // ---- Empty state ----
            // Shown until the first set is ever logged.
            ColumnLayout {
                Layout.fillWidth: true
                Layout.topMargin: Theme.s4
                spacing: Theme.s3
                visible: page.recentDays.length === 0

                Text {
                    Layout.alignment: Qt.AlignHCenter
                    text: "🏔️"
                    font.pixelSize: 52
                }
                Text {
                    Layout.fillWidth: true
                    Layout.alignment: Qt.AlignHCenter
                    horizontalAlignment: Text.AlignHCenter
                    wrapMode: Text.Wrap
                    text: "Your training history will appear here."
                    color: Theme.textSecondary
                    font.pixelSize: Theme.fontBody
                }
                Text {
                    Layout.fillWidth: true
                    Layout.alignment: Qt.AlignHCenter
                    horizontalAlignment: Text.AlignHCenter
                    wrapMode: Text.Wrap
                    text: "Tap the button above to log your first set and start climbing."
                    color: Theme.textSecondary
                    font.pixelSize: Theme.fontSmall
                    font.italic: true
                }
            }
        }
    }
}
