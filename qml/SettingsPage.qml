// ---------------------------------------------------------------------------
// SettingsPage.qml - user preferences.
//
// Accessible from the tracker page header gear icon. Cards stack vertically
// in card-per-preference order so the page can scale to additional settings
// (score preference, notification cadence, etc.) without re-architecting.
//
// Sections:
//   - Weight units (TICKET-001) - kg / lbs toggle
//   - Effort tracking (TICKET-002) - show or hide the RIR field on log /
//     edit. Beta tester Linda explicitly opted out of RIR; this control
//     gives that opt-out a discoverable home and removes the "doing the
//     app wrong" anxiety several testers reported.
//
// Authors: dev-frontend
// ---------------------------------------------------------------------------

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import PeakFettle 1.0
import "components"

Page {
    id: page
    background: Rectangle { color: Theme.black }

    // ----- Header -----
    header: Rectangle {
        height: 56
        color: Theme.navyDeep
        RowLayout {
            anchors.fill: parent
            anchors.leftMargin:  Theme.s4
            anchors.rightMargin: Theme.s4
            spacing: Theme.s3

            ToolButton {
                text: "<"
                onClicked: window.goTo("back")
                contentItem: Text {
                    text: parent.text
                    color: Theme.turquoise
                    font.pixelSize: 22
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                }
                background: Rectangle { color: "transparent" }
            }

            Text {
                Layout.fillWidth: true
                text: "Settings"
                color: Theme.textPrimary
                font.pixelSize: Theme.fontH2
                font.bold: true
            }
        }
    }

    // ----- Body -----
    // Wrapped in a Flickable so additional preference cards don't push
    // content off-screen on phone-narrow heights.
    Flickable {
        id: bodyFlick
        anchors.fill: parent
        contentWidth: width
        contentHeight: settingsCol.implicitHeight + Theme.s4 * 2
        clip: true

        ColumnLayout {
            id: settingsCol
            x: Theme.s4
            y: Theme.s4
            width: bodyFlick.width - Theme.s4 * 2
            spacing: Theme.s3

            // ---- Weight Units ----
            Rectangle {
                Layout.fillWidth: true
                color: Theme.navyDeep
                radius: Theme.radiusLg
                border.width: 1
                border.color: Theme.navyLine
                implicitHeight: unitsCol.implicitHeight + Theme.s5 * 2

                ColumnLayout {
                    id: unitsCol
                    anchors.fill: parent
                    anchors.margins: Theme.s5
                    spacing: Theme.s4

                    Text {
                        text: "Weight units"
                        color: Theme.textPrimary
                        font.pixelSize: Theme.fontH2
                        font.bold: true
                    }

                    // Toggle row: two buttons acting as a segmented control.
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: Theme.s2

                        Repeater {
                            model: [
                                { label: "kg",  value: "kg"  },
                                { label: "lbs", value: "lbs" }
                            ]
                            delegate: Button {
                                Layout.fillWidth: true
                                checkable: true
                                checked: UnitPreference.unit === modelData.value
                                text: modelData.label
                                onClicked: UnitPreference.unit = modelData.value
                                contentItem: Text {
                                    text: parent.text
                                    color: parent.checked ? Theme.textOnAccent : Theme.textPrimary
                                    horizontalAlignment: Text.AlignHCenter
                                    verticalAlignment: Text.AlignVCenter
                                    font.pixelSize: Theme.fontBody
                                    font.bold: true
                                }
                                background: Rectangle {
                                    radius: Theme.radiusMd
                                    color: parent.checked ? Theme.turquoise : Theme.navyMid
                                    border.width: 1
                                    border.color: parent.checked ? Theme.turquoise : Theme.navyLine
                                }
                            }
                        }
                    }

                    Text {
                        Layout.fillWidth: true
                        wrapMode: Text.Wrap
                        text: "Weights are always stored in kilograms. This setting only affects how they are displayed throughout the app."
                        color: Theme.textSecondary
                        font.pixelSize: Theme.fontSmall
                    }
                }
            }

            // ---- Effort tracking (TICKET-002) ----
            // Two-state segmented control: "RIR" shows the optional Reps in
            // Reserve field on the log card and edit dialog; "Off" hides
            // the field entirely so users who don't track effort never see
            // the prompt. RPE is intentionally not offered - the canonical
            // data column is RIR per CTO guardrail #7.
            Rectangle {
                Layout.fillWidth: true
                color: Theme.navyDeep
                radius: Theme.radiusLg
                border.width: 1
                border.color: Theme.navyLine
                implicitHeight: effortCol.implicitHeight + Theme.s5 * 2

                ColumnLayout {
                    id: effortCol
                    anchors.fill: parent
                    anchors.margins: Theme.s5
                    spacing: Theme.s4

                    Text {
                        text: "Effort tracking"
                        color: Theme.textPrimary
                        font.pixelSize: Theme.fontH2
                        font.bold: true
                    }

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: Theme.s2

                        Repeater {
                            model: [
                                { label: "RIR", value: "rir" },
                                { label: "Off", value: "off" }
                            ]
                            delegate: Button {
                                Layout.fillWidth: true
                                checkable: true
                                checked: EffortPreference.mode === modelData.value
                                text: modelData.label
                                onClicked: EffortPreference.mode = modelData.value
                                contentItem: Text {
                                    text: parent.text
                                    color: parent.checked ? Theme.textOnAccent : Theme.textPrimary
                                    horizontalAlignment: Text.AlignHCenter
                                    verticalAlignment: Text.AlignVCenter
                                    font.pixelSize: Theme.fontBody
                                    font.bold: true
                                }
                                background: Rectangle {
                                    radius: Theme.radiusMd
                                    color: parent.checked ? Theme.turquoise : Theme.navyMid
                                    border.width: 1
                                    border.color: parent.checked ? Theme.turquoise : Theme.navyLine
                                }
                            }
                        }
                    }

                    Text {
                        Layout.fillWidth: true
                        wrapMode: Text.Wrap
                        text: "RIR (Reps in Reserve) is optional. If you don't want to track effort, set this to Off and the field disappears from the log and edit screens."
                        color: Theme.textSecondary
                        font.pixelSize: Theme.fontSmall
                    }
                }
            }

            // ---- Avatar (2026-05-04) ----
            // Shows current avatar + inline name/color editors so the user
            // doesn't have to re-enter the full profile survey just to tweak
            // their display name or color.
            Rectangle {
                Layout.fillWidth: true
                color: Theme.navyDeep
                radius: Theme.radiusLg
                border.width: 1
                border.color: Theme.navyLine
                implicitHeight: avatarSettingsCol.implicitHeight + Theme.s5 * 2

                ColumnLayout {
                    id: avatarSettingsCol
                    anchors.fill: parent
                    anchors.margins: Theme.s5
                    spacing: Theme.s4

                    Text {
                        text: "Avatar"
                        color: Theme.textPrimary
                        font.pixelSize: Theme.fontH2
                        font.bold: true
                    }

                    // Avatar preview row
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: Theme.s4

                        // Live preview circle
                        Rectangle {
                            width: 52; height: 52
                            radius: 26

                            readonly property var avatarColors: [
                                "#2DD4BF","#6366F1","#F59E0B","#EC4899",
                                "#10B981","#3B82F6","#F97316","#A855F7"
                            ]

                            color: avatarColors[Math.max(0, Math.min(7, UserProfile.avatarColorIndex))]
                            Layout.alignment: Qt.AlignVCenter

                            Text {
                                anchors.centerIn: parent
                                text: {
                                    const name = (UserProfile.displayName || "").trim();
                                    if (name.length === 0) return "?";
                                    const words = name.split(/\s+/).filter(
                                        function(w) { return w.length > 0; });
                                    if (words.length >= 2)
                                        return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
                                    return name.substring(0, Math.min(2, name.length)).toUpperCase();
                                }
                                color: Theme.textOnAccent
                                font.pixelSize: 18
                                font.bold: true
                            }
                        }

                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: Theme.s1

                            Text {
                                text: UserProfile.displayName.length > 0
                                      ? UserProfile.displayName
                                      : "No display name set"
                                color: UserProfile.displayName.length > 0
                                       ? Theme.textPrimary : Theme.textSecondary
                                font.pixelSize: Theme.fontBody
                                font.bold: UserProfile.displayName.length > 0
                            }
                            Text {
                                text: "Tap \"Edit avatar\" to change name or color"
                                color: Theme.textSecondary
                                font.pixelSize: Theme.fontSmall
                            }
                        }
                    }

                    SecondaryButton {
                        Layout.fillWidth: true
                        text: "Edit avatar"
                        onClicked: window.goTo("profileSurvey")
                    }
                }
            }

            // ---- Profile / quick stats (2026-05-03) ----
            // Surfaces the survey here so existing users can fill or edit
            // the percentile-model inputs after the fact. The actual fields
            // live in ProfileSurveyPage; this card just shows the current
            // values + an "Edit" button. Card border turns turquoise when
            // the profile is incomplete to gently nudge the user.
            Rectangle {
                Layout.fillWidth: true
                color: Theme.navyDeep
                radius: Theme.radiusLg
                border.width: 1
                border.color: UserProfile.isComplete ? Theme.navyLine : Theme.turquoise
                implicitHeight: profileCol.implicitHeight + Theme.s5 * 2

                ColumnLayout {
                    id: profileCol
                    anchors.fill: parent
                    anchors.margins: Theme.s5
                    spacing: Theme.s3

                    Text {
                        text: "Your profile"
                        color: Theme.textPrimary
                        font.pixelSize: Theme.fontH2
                        font.bold: true
                    }

                    Text {
                        Layout.fillWidth: true
                        wrapMode: Text.Wrap
                        visible: !UserProfile.isComplete
                        text: "Add your sex, age, bodyweight, and training years to unlock per-exercise percentile ranking."
                        color: Theme.textSecondary
                        font.pixelSize: Theme.fontSmall
                    }

                    GridLayout {
                        Layout.fillWidth: true
                        visible: UserProfile.isComplete
                        columns: 2
                        columnSpacing: Theme.s3
                        rowSpacing: Theme.s2

                        Text { text: "Sex"; color: Theme.textSecondary; font.pixelSize: Theme.fontSmall }
                        Text {
                            text: UserProfile.sex === "M" ? "Male"
                                  : (UserProfile.sex === "F" ? "Female" : "—")
                            color: Theme.textPrimary; font.pixelSize: Theme.fontBody
                        }

                        Text { text: "Age"; color: Theme.textSecondary; font.pixelSize: Theme.fontSmall }
                        Text {
                            text: UserProfile.ageYears + " years"
                            color: Theme.textPrimary; font.pixelSize: Theme.fontBody
                        }

                        Text { text: "Bodyweight"; color: Theme.textSecondary; font.pixelSize: Theme.fontSmall }
                        Text {
                            text: UnitPreference.format(UserProfile.bodyweightKg)
                            color: Theme.textPrimary; font.pixelSize: Theme.fontBody
                        }

                        Text { text: "Training"; color: Theme.textSecondary; font.pixelSize: Theme.fontSmall }
                        Text {
                            text: UserProfile.yearsTraining >= 30
                                  ? "30+ years"
                                  : UserProfile.yearsTraining + " year"
                                    + (UserProfile.yearsTraining === 1 ? "" : "s")
                            color: Theme.textPrimary; font.pixelSize: Theme.fontBody
                        }

                        Text { text: "Target"; color: Theme.textSecondary; font.pixelSize: Theme.fontSmall }
                        Text {
                            text: UserProfile.targetWorkoutsPerWeek + " workouts/week"
                            color: Theme.textPrimary; font.pixelSize: Theme.fontBody
                        }
                    }

                    PrimaryButton {
                        Layout.fillWidth: true
                        Layout.topMargin: Theme.s2
                        text: UserProfile.isComplete ? "Edit profile" : "Add my stats"
                        onClicked: window.goTo("profileSurvey")
                    }
                }
            }

            // Spacer - pushes content to top.
            Item { Layout.fillHeight: true; Layout.preferredHeight: Theme.s4 }
        }
    }
}
