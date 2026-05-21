// ---------------------------------------------------------------------------
// PercentilesPage.qml — your strength percentile per exercise.
//
// Lists every tracked exercise with:
//   * exercise name
//   * your current Epley E1RM (in your chosen unit)
//   * percentile (e.g. "72nd") + a horizontal bar
//
// Sorting: ranked rows first (by percentile desc), unranked rows last.
// Tapping a row opens that exercise's progress graph.
//
// Empty/incomplete states:
//   * No profile filled in → big "Complete your profile" CTA → ProfileSurveyPage
//   * No sets logged       → CTA back to the tracker
//
// Author: dev-frontend
// Date: 2026-05-03
// ---------------------------------------------------------------------------

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import PeakFettle 1.0
import "components"

Page {
    id: page
    background: Rectangle { color: Theme.black }

    // ---- Reactive data ----
    property var rows: []

    function refresh() {
        rows = WorkoutTracker.percentilesForAll();
    }

    Component.onCompleted: refresh()
    Connections {
        target: WorkoutTracker
        function onDataChanged() { page.refresh(); }
    }
    Connections {
        target: UserProfile
        function onProfileChanged() { page.refresh(); }
    }
    Connections {
        target: UnitPreference
        function onUnitChanged() { page.refresh(); }
    }

    // ---- Header ----
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
                text: "Strength percentile"
                color: Theme.textPrimary
                font.pixelSize: Theme.fontH2
                font.bold: true
            }
        }
    }

    // ---- Body ----
    Flickable {
        id: bodyFlick
        anchors.fill: parent
        contentWidth: width
        contentHeight: bodyCol.implicitHeight + Theme.s5
        clip: true

        ColumnLayout {
            id: bodyCol
            x: Theme.s4
            y: Theme.s4
            width: bodyFlick.width - Theme.s4 * 2
            spacing: Theme.s3

            // ---- Profile-incomplete prompt ----
            Rectangle {
                visible: !UserProfile.isComplete
                Layout.fillWidth: true
                radius: Theme.radiusLg
                color: Qt.rgba(0.176, 0.831, 0.749, 0.10)
                border.color: Theme.turquoise
                border.width: 1
                implicitHeight: profileBox.implicitHeight + Theme.s4 * 2

                ColumnLayout {
                    id: profileBox
                    anchors.fill: parent
                    anchors.margins: Theme.s4
                    spacing: Theme.s2

                    Text {
                        text: "Add your profile to see your ranking"
                        color: Theme.textPrimary
                        font.pixelSize: Theme.fontH2
                        font.bold: true
                        wrapMode: Text.Wrap
                        Layout.fillWidth: true
                    }
                    Text {
                        text: "We need your sex, age, bodyweight, and training years to compare your lifts to peers at your level."
                        color: Theme.textSecondary
                        font.pixelSize: Theme.fontSmall
                        wrapMode: Text.Wrap
                        Layout.fillWidth: true
                    }
                    PrimaryButton {
                        Layout.fillWidth: true
                        Layout.topMargin: Theme.s2
                        text: "Add my stats"
                        onClicked: window.goTo("profileSurvey")
                    }
                }
            }

            // ---- No exercises yet ----
            ColumnLayout {
                visible: WorkoutTracker.totalSets === 0
                Layout.fillWidth: true
                Layout.topMargin: Theme.s4
                spacing: Theme.s3
                MountainLogo { Layout.alignment: Qt.AlignHCenter; size: 80 }
                Text {
                    Layout.alignment: Qt.AlignHCenter
                    text: "No lifts to rank yet"
                    color: Theme.textPrimary
                    font.pixelSize: Theme.fontH2
                    font.bold: true
                }
                Text {
                    Layout.alignment: Qt.AlignHCenter
                    Layout.maximumWidth: 320
                    horizontalAlignment: Text.AlignHCenter
                    wrapMode: Text.Wrap
                    text: "Log a few sets — bench, squat, deadlift, OHP and their variants are scored automatically."
                    color: Theme.textSecondary
                    font.pixelSize: Theme.fontBody
                }
                PrimaryButton {
                    Layout.alignment: Qt.AlignHCenter
                    Layout.preferredWidth: 200
                    text: "Open tracker"
                    onClicked: window.goTo("tracker")
                }
            }

            // ---- Header row ----
            Text {
                visible: WorkoutTracker.totalSets > 0
                text: "Per-exercise ranking"
                color: Theme.textPrimary
                font.pixelSize: Theme.fontH2
                font.bold: true
                Layout.topMargin: Theme.s2
            }
            Text {
                visible: WorkoutTracker.totalSets > 0
                text: "Compared to lifters at your level. Your e1RM is computed via Epley."
                color: Theme.textSecondary
                font.pixelSize: Theme.fontSmall
                wrapMode: Text.Wrap
                Layout.fillWidth: true
            }

            // ---- The list ----
            Repeater {
                model: page.rows
                delegate: Rectangle {
                    Layout.fillWidth: true
                    radius: Theme.radiusLg
                    color: rowMouse.containsMouse
                           ? Qt.rgba(0.176, 0.831, 0.749, 0.08)
                           : Theme.navyDeep
                    border.color: Theme.navyLine
                    border.width: 1
                    implicitHeight: rowCol.implicitHeight + Theme.s3 * 2

                    ColumnLayout {
                        id: rowCol
                        anchors.fill: parent
                        anchors.margins: Theme.s3
                        spacing: Theme.s2

                        // Title row: exercise name + percentile chip
                        RowLayout {
                            Layout.fillWidth: true
                            spacing: Theme.s2

                            Text {
                                Layout.fillWidth: true
                                text: modelData.exercise
                                color: Theme.textPrimary
                                font.pixelSize: Theme.fontBody
                                font.bold: true
                                elide: Text.ElideRight
                            }

                            // Percentile chip — only when ranked
                            Rectangle {
                                visible: modelData.hasModel
                                color: Qt.rgba(0.176, 0.831, 0.749, 0.18)
                                border.color: Theme.turquoise
                                border.width: 1
                                radius: 10
                                implicitHeight: 22
                                implicitWidth: pctLabel.implicitWidth + 14
                                Text {
                                    id: pctLabel
                                    anchors.centerIn: parent
                                    text: page.formatPercentile(modelData.percentile)
                                    color: Theme.turquoise
                                    font.pixelSize: Theme.fontSmall
                                    font.bold: true
                                }
                            }
                        }

                        // Subtitle — e1RM in user's chosen unit, or the unranked reason
                        Text {
                            Layout.fillWidth: true
                            text: modelData.hasModel
                                  ? "e1RM " + UnitPreference.format(modelData.e1rmKg)
                                    + " · model expects " + UnitPreference.format(modelData.expectedKg)
                                    + (modelData.extrapolated ? " · extrapolated" : "")
                                  : (modelData.reason || "Not ranked")
                            color: modelData.hasModel ? Theme.textSecondary
                                                      : Qt.rgba(1, 1, 1, 0.45)
                            font.pixelSize: Theme.fontSmall
                            wrapMode: Text.Wrap
                        }

                        // Percentile bar — only when ranked
                        Rectangle {
                            visible: modelData.hasModel
                            Layout.fillWidth: true
                            implicitHeight: 8
                            radius: 4
                            color: Qt.rgba(1, 1, 1, 0.06)

                            Rectangle {
                                anchors.left: parent.left
                                anchors.top: parent.top
                                anchors.bottom: parent.bottom
                                radius: 4
                                color: Theme.turquoise
                                width: parent.width
                                       * Math.max(0.01, Math.min(1.0, modelData.percentile / 100.0))
                                Behavior on width { NumberAnimation { duration: 220; easing.type: Easing.OutCubic } }
                            }
                        }
                    }

                    MouseArea {
                        id: rowMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        // Tap → open this exercise's progress graph.
                        // ProgressGraphPage chooses the first exercise by default;
                        // a follow-up TICKET could pre-select via a setter.
                        onClicked: window.goTo("graph")
                    }
                }
            }

            Item { Layout.fillHeight: true; Layout.preferredHeight: Theme.s4 }
        }
    }

    // English-style ordinal: 1st, 2nd, 3rd, 4th. Rounds the percentile to the
    // nearest whole percent. (Internally the value is a real, but UI shows it
    // as an integer to avoid spurious precision — "73.4th" looks fake.)
    function formatPercentile(p) {
        const n = Math.round(p);
        const mod100 = n % 100;
        const mod10  = n % 10;
        let suffix = "th";
        if (mod100 < 11 || mod100 > 13) {
            if (mod10 === 1)      suffix = "st";
            else if (mod10 === 2) suffix = "nd";
            else if (mod10 === 3) suffix = "rd";
        }
        return n + suffix;
    }
}
