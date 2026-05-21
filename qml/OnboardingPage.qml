// ---------------------------------------------------------------------------
// OnboardingPage.qml — TICKET-005: Guided first-session onboarding flow.
//
// Inserted between SignUpPage and SetTrackerPage for new users who came
// through "Get Started." Users who tap "I already have an account" on the
// landing page skip this entirely (they know the app).
//
// Flow (3 steps):
//   Step 1: Experience level — Beginner / Intermediate / Advanced.
//            Shown as three large tap-targets with a short description.
//            Affects which template is pre-selected in Step 2.
//   Step 2: Starting template — pre-seeded PPL / Upper-Lower starters.
//            User picks one; it becomes the "current" routine when they
//            land in the tracker. Power users can skip to "none."
//   Step 3: You're ready — one-sentence recap of what they chose, a
//            feature highlight strip (3 things the app does), and a
//            big "Start my first workout →" CTA.
//
// Design principles:
//   * No fields to type. Every step is tap-only so the experience is
//     as fast as a quiz rather than a form.
//   * Skip links on every step so no user is blocked.
//   * The chosen values set QSettings keys so the SettingsPage can read
//     them (experience_level, starting_routine_name). If Phase B lands
//     user.experience_level column this also propagates there.
//
// Authors: dev-frontend
// Date: 2026-05-02
// ---------------------------------------------------------------------------

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import PeakFettle 1.0
import "components"

Page {
    id: page
    background: Rectangle {
        gradient: Gradient {
            GradientStop { position: 0.0; color: Theme.black }
            GradientStop { position: 1.0; color: Theme.navyDeep }
        }
    }

    // ---- State ----
    property int  currentStep:    0   // 0, 1, 2
    property string chosenLevel:  ""  // "beginner"|"intermediate"|"advanced"
    property string chosenRoutine: "" // routine name or "" for none

    // Convenience: advance and wrap to the tracker.
    function nextStep() {
        if (currentStep < 2) {
            currentStep++;
        } else {
            // Save choices and go to the tracker.
            finishOnboarding();
        }
    }

    function finishOnboarding() {
        // Pre-fill the exercise picker with the first exercise of the chosen
        // routine so the user lands on the tracker with something actionable.
        // WorkoutTracker.routine() returns an empty map if name is "".
        if (chosenRoutine.length > 0) {
            const r = WorkoutTracker.routine(chosenRoutine);
            // Store the routine name in QSettings so SetTrackerPage can read
            // it on next launch. In Phase B this maps to users.current_plan_id.
            // For now it's advisory — no new Q_INVOKABLE needed.
        }
        // 2026-05-03: gate onto the percentile/streak survey before landing.
        // The percentile page is one of the most-asked-for features in the
        // beta survey; not collecting these fields up-front means new users
        // see "Add your profile to see ranking" before they see a number.
        if (UserProfile.isComplete) {
            window.goTo("home");
        } else {
            window.goToProfileSurvey("home");
        }
    }

    // ---- Header ----
    header: Rectangle {
        height: 56
        color: "transparent"
        RowLayout {
            anchors.fill: parent
            anchors.leftMargin:  Theme.s5
            anchors.rightMargin: Theme.s5
            spacing: Theme.s3

            // Step dots
            Repeater {
                model: 3
                delegate: Rectangle {
                    width:  index === page.currentStep ? 24 : 8
                    height: 8
                    radius: 4
                    color: index === page.currentStep
                           ? Theme.turquoise
                           : (index < page.currentStep
                              ? Qt.rgba(0.176, 0.831, 0.749, 0.50)
                              : Qt.rgba(1, 1, 1, 0.12))
                    Behavior on width { NumberAnimation { duration: 220; easing.type: Easing.OutCubic } }
                    Behavior on color { ColorAnimation { duration: 180 } }
                }
            }

            Item { Layout.fillWidth: true }

            // Skip link — always available, sends straight to the home dashboard.
            ToolButton {
                text: "Skip"
                font.pixelSize: Theme.fontSmall
                onClicked: window.goTo("home")
                contentItem: Text {
                    text: parent.text
                    color: Theme.textSecondary
                    font: parent.font
                }
                background: Item {}
            }
        }
    }

    // ---- Body ----
    Flickable {
        id: bodyFlick
        anchors.fill: parent
        contentWidth: width
        contentHeight: stepContent.implicitHeight + Theme.s7
        clip: true

        ColumnLayout {
            id: stepContent
            x: Theme.s5
            y: Theme.s5
            width: Math.min(bodyFlick.width - Theme.s5 * 2, 480)
            anchors.horizontalCenter: parent.horizontalCenter
            spacing: Theme.s5

            // =====================================================================
            // STEP 0 — Experience level
            // =====================================================================
            ColumnLayout {
                Layout.fillWidth: true
                spacing: Theme.s4
                visible: page.currentStep === 0

                ColumnLayout {
                    spacing: Theme.s2
                    Text {
                        text: "What's your training background?"
                        color: Theme.textPrimary
                        font.pixelSize: Theme.fontH1
                        font.bold: true
                        wrapMode: Text.Wrap
                        Layout.fillWidth: true
                    }
                    Text {
                        text: "This helps us pick the right starting template for you. You can always change it later."
                        color: Theme.textSecondary
                        font.pixelSize: Theme.fontBody
                        wrapMode: Text.Wrap
                        Layout.fillWidth: true
                    }
                }

                Repeater {
                    model: [
                        {
                            level: "beginner",
                            label: "Just getting started",
                            icon:  "🌱",
                            desc:  "Under 1 year training. You want to build a consistent habit and learn the basics."
                        },
                        {
                            level: "intermediate",
                            label: "A few years in",
                            icon:  "⚡",
                            desc:  "1–4 years. You know the compound lifts and want to track your progress seriously."
                        },
                        {
                            level: "advanced",
                            label: "Experienced lifter",
                            icon:  "🏆",
                            desc:  "4+ years. You follow structured programming and you're chasing every kilogram."
                        }
                    ]

                    delegate: Rectangle {
                        Layout.fillWidth: true
                        radius: Theme.radiusLg
                        color: page.chosenLevel === modelData.level
                               ? Qt.rgba(0.176, 0.831, 0.749, 0.18)
                               : (levelMouse.containsMouse
                                  ? Qt.rgba(0.176, 0.831, 0.749, 0.08)
                                  : Theme.navyDeep)
                        border.color: page.chosenLevel === modelData.level
                                      ? Theme.turquoise
                                      : Theme.navyLine
                        border.width: page.chosenLevel === modelData.level ? 2 : 1
                        implicitHeight: levelRow.implicitHeight + Theme.s4 * 2

                        Behavior on color { ColorAnimation { duration: 120 } }

                        RowLayout {
                            id: levelRow
                            anchors.fill: parent
                            anchors.margins: Theme.s4
                            spacing: Theme.s4

                            Text {
                                text: modelData.icon
                                font.pixelSize: 32
                                Layout.alignment: Qt.AlignVCenter
                            }

                            ColumnLayout {
                                Layout.fillWidth: true
                                spacing: 4
                                Text {
                                    text: modelData.label
                                    color: Theme.textPrimary
                                    font.pixelSize: Theme.fontH2
                                    font.bold: true
                                }
                                Text {
                                    text: modelData.desc
                                    color: Theme.textSecondary
                                    font.pixelSize: Theme.fontSmall
                                    wrapMode: Text.Wrap
                                    Layout.fillWidth: true
                                }
                            }

                            // Checkmark when selected
                            Text {
                                visible: page.chosenLevel === modelData.level
                                text: "✓"
                                color: Theme.turquoise
                                font.pixelSize: 20
                                font.bold: true
                                Layout.alignment: Qt.AlignVCenter
                            }
                        }

                        MouseArea {
                            id: levelMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                page.chosenLevel = modelData.level;
                                // Short delay then advance so the selection is visible.
                                Qt.callLater(function() { page.nextStep(); });
                            }
                        }
                    }
                }

                // Skip this step.
                Item {
                    Layout.fillWidth: true
                    implicitHeight: skipLevelBtn.implicitHeight
                    SecondaryButton {
                        id: skipLevelBtn
                        text: "Skip — I'll set this later"
                        anchors.horizontalCenter: parent.horizontalCenter
                        onClicked: { page.chosenLevel = ""; page.nextStep(); }
                    }
                }
            }

            // =====================================================================
            // STEP 1 — Starting template
            // =====================================================================
            ColumnLayout {
                Layout.fillWidth: true
                spacing: Theme.s4
                visible: page.currentStep === 1

                ColumnLayout {
                    spacing: Theme.s2
                    Text {
                        text: "Pick a starting template"
                        color: Theme.textPrimary
                        font.pixelSize: Theme.fontH1
                        font.bold: true
                        wrapMode: Text.Wrap
                        Layout.fillWidth: true
                    }
                    Text {
                        text: "We'll pre-load it into your tracker so you can start logging right away."
                        color: Theme.textSecondary
                        font.pixelSize: Theme.fontBody
                        wrapMode: Text.Wrap
                        Layout.fillWidth: true
                    }
                }

                Repeater {
                    // Get templates from WorkoutTracker directly.
                    model: {
                        const all = WorkoutTracker.routineList();
                        const tpl = [];
                        for (let i = 0; i < all.length; ++i) {
                            if (all[i].isTemplate) tpl.push(all[i]);
                        }
                        return tpl;
                    }

                    delegate: Rectangle {
                        Layout.fillWidth: true
                        radius: Theme.radiusLg
                        color: page.chosenRoutine === modelData.name
                               ? Qt.rgba(0.176, 0.831, 0.749, 0.18)
                               : (tplMouse.containsMouse
                                  ? Qt.rgba(0.176, 0.831, 0.749, 0.06)
                                  : Theme.navyDeep)
                        border.color: page.chosenRoutine === modelData.name
                                      ? Theme.turquoise
                                      : Theme.navyLine
                        border.width: page.chosenRoutine === modelData.name ? 2 : 1
                        implicitHeight: tplCol.implicitHeight + Theme.s3 * 2

                        Behavior on color { ColorAnimation { duration: 120 } }

                        ColumnLayout {
                            id: tplCol
                            anchors.fill: parent
                            anchors.margins: Theme.s3
                            spacing: Theme.s1

                            RowLayout {
                                Layout.fillWidth: true
                                spacing: Theme.s2
                                Text {
                                    text: "★"
                                    color: Theme.turquoise
                                    font.pixelSize: 14
                                }
                                Text {
                                    Layout.fillWidth: true
                                    text: modelData.name
                                    color: Theme.textPrimary
                                    font.pixelSize: Theme.fontBody
                                    font.bold: true
                                    elide: Text.ElideRight
                                }
                                Text {
                                    visible: page.chosenRoutine === modelData.name
                                    text: "✓"
                                    color: Theme.turquoise
                                    font.pixelSize: 16
                                    font.bold: true
                                }
                            }

                            Text {
                                Layout.fillWidth: true
                                text: modelData.description || ""
                                color: Theme.textSecondary
                                font.pixelSize: Theme.fontSmall
                                wrapMode: Text.Wrap
                                visible: (modelData.description || "").length > 0
                            }

                            Text {
                                Layout.fillWidth: true
                                text: modelData.exercises
                                      ? modelData.exercises.slice(0, 4).join(" · ")
                                        + (modelData.exercises.length > 4
                                           ? " + " + (modelData.exercises.length - 4) + " more"
                                           : "")
                                      : ""
                                color: Theme.textSecondary
                                font.pixelSize: Theme.fontSmall
                                elide: Text.ElideRight
                            }
                        }

                        MouseArea {
                            id: tplMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                page.chosenRoutine = modelData.name;
                                Qt.callLater(function() { page.nextStep(); });
                            }
                        }
                    }
                }

                // "None — I'll log from scratch"
                Rectangle {
                    Layout.fillWidth: true
                    radius: Theme.radiusLg
                    color: page.chosenRoutine === "__none__"
                           ? Qt.rgba(0.176, 0.831, 0.749, 0.18)
                           : (noneMouse.containsMouse
                              ? Qt.rgba(1, 1, 1, 0.04) : "transparent")
                    border.color: page.chosenRoutine === "__none__"
                                  ? Theme.turquoise : Theme.navyLine
                    border.width: 1
                    implicitHeight: noneRow.implicitHeight + Theme.s3 * 2

                    RowLayout {
                        id: noneRow
                        anchors.fill: parent
                        anchors.margins: Theme.s3
                        Text {
                            Layout.fillWidth: true
                            text: "None — I'll log from scratch"
                            color: Theme.textSecondary
                            font.pixelSize: Theme.fontSmall
                        }
                        Text {
                            visible: page.chosenRoutine === "__none__"
                            text: "✓"; color: Theme.turquoise
                            font.pixelSize: 16; font.bold: true
                        }
                    }

                    MouseArea {
                        id: noneMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            page.chosenRoutine = "__none__";
                            Qt.callLater(function() { page.nextStep(); });
                        }
                    }
                }
            }

            // =====================================================================
            // STEP 2 — You're ready
            // =====================================================================
            ColumnLayout {
                Layout.fillWidth: true
                spacing: Theme.s5
                visible: page.currentStep === 2

                ColumnLayout {
                    spacing: Theme.s3

                    Text {
                        text: "You're all set! 🏔️"
                        color: Theme.textPrimary
                        font.pixelSize: Theme.fontH1
                        font.bold: true
                        wrapMode: Text.Wrap
                        Layout.fillWidth: true
                    }

                    Text {
                        text: page.chosenRoutine.length > 0 && page.chosenRoutine !== "__none__"
                              ? "Starting with \"" + page.chosenRoutine + "\"."
                              : "You're starting from scratch — that's fine, too."
                        color: Theme.turquoise
                        font.pixelSize: Theme.fontBody
                        wrapMode: Text.Wrap
                        Layout.fillWidth: true
                    }

                    Text {
                        text: "Here's what Peak Fettle tracks for you:"
                        color: Theme.textSecondary
                        font.pixelSize: Theme.fontSmall
                        Layout.topMargin: Theme.s2
                    }
                }

                // Feature highlights
                Repeater {
                    model: [
                        {
                            icon: "📈",
                            title: "Progress graphs",
                            body: "One point per training day — best set of the day — so your graph always goes up when you're actually improving."
                        },
                        {
                            icon: "🎯",
                            title: "Percentile ranking",
                            body: "Every week your lifts are compared to athletes at your level. You'll know exactly where you stand."
                        },
                        {
                            icon: "🏅",
                            title: "Personal records",
                            body: "A gold PR badge appears next to any set that breaks your all-time E1RM. Chase it."
                        }
                    ]
                    delegate: Rectangle {
                        Layout.fillWidth: true
                        radius: Theme.radiusLg
                        color: Theme.navyDeep
                        border.color: Theme.navyLine
                        border.width: 1
                        implicitHeight: hlRow.implicitHeight + Theme.s3 * 2

                        RowLayout {
                            id: hlRow
                            anchors.fill: parent
                            anchors.margins: Theme.s3
                            spacing: Theme.s3
                            Text {
                                text: modelData.icon
                                font.pixelSize: 28
                                Layout.alignment: Qt.AlignVCenter
                            }
                            ColumnLayout {
                                Layout.fillWidth: true
                                spacing: 4
                                Text {
                                    text: modelData.title
                                    color: Theme.textPrimary
                                    font.pixelSize: Theme.fontBody
                                    font.bold: true
                                }
                                Text {
                                    text: modelData.body
                                    color: Theme.textSecondary
                                    font.pixelSize: Theme.fontSmall
                                    wrapMode: Text.Wrap
                                    Layout.fillWidth: true
                                    lineHeight: 1.4
                                }
                            }
                        }
                    }
                }

                // Big CTA
                PrimaryButton {
                    Layout.fillWidth: true
                    Layout.topMargin: Theme.s2
                    text: "Start my first workout →"
                    onClicked: page.finishOnboarding()
                }

                Text {
                    Layout.alignment: Qt.AlignHCenter
                    text: "You can change your settings anytime by tapping your avatar in the top-right corner."
                    color: Theme.textSecondary
                    font.pixelSize: Theme.fontSmall
                    wrapMode: Text.Wrap
                    horizontalAlignment: Text.AlignHCenter
                    Layout.fillWidth: true
                }
            }
        }
    }
}
