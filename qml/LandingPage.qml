// ---------------------------------------------------------------------------
// LandingPage.qml - the app's opening / "first launch" screen.
//
// Shows the mountain logo, the Peak Fettle wordmark, the tagline, and two
// CTAs (Get Started -> sign-up, I already have an account -> home).
//
// Adaptive: stacks vertically on phone-narrow widths, centers a fixed-width
// hero column on desktop-wide widths.
// ---------------------------------------------------------------------------

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import PeakFettle 1.0
import "components"

Page {
    id: page
    background: Rectangle {
        // Subtle vertical gradient: black at top fading into deep navy.
        gradient: Gradient {
            GradientStop { position: 0.0; color: Theme.black }
            GradientStop { position: 1.0; color: Theme.navyDeep }
        }
    }

    // ----- Decorative ambient glow behind the logo -----
    Rectangle {
        id: glow
        width: Math.min(page.width, page.height) * 0.7
        height: width
        radius: width / 2
        anchors.horizontalCenter: parent.horizontalCenter
        y: heroColumn.y + heroColumn.height * 0.12 - height / 2
        opacity: 0.18
        gradient: Gradient {
            GradientStop { position: 0.0; color: Theme.turquoise }
            GradientStop { position: 1.0; color: "transparent" }
        }
    }

    // ----- Hero column -----
    ColumnLayout {
        id: heroColumn
        anchors.fill: parent
        anchors.leftMargin:  Theme.s5
        anchors.rightMargin: Theme.s5
        anchors.topMargin:   Theme.s7
        anchors.bottomMargin: Theme.s6
        spacing: Theme.s4

        // On wide windows, constrain the column to a comfortable reading width.
        readonly property bool wide: page.width >= 720

        Item { Layout.fillHeight: true }   // top spacer

        MountainLogo {
            Layout.alignment: Qt.AlignHCenter
            size: heroColumn.wide ? 168 : 140
        }

        Text {
            Layout.alignment: Qt.AlignHCenter
            text: "PEAK FETTLE"
            color: Theme.textPrimary
            font.pixelSize: heroColumn.wide ? 44 : 36
            font.letterSpacing: 4
            font.bold: true
        }

        Text {
            Layout.alignment: Qt.AlignHCenter
            Layout.maximumWidth: heroColumn.wide ? 520 : page.width - Theme.s5 * 2
            horizontalAlignment: Text.AlignHCenter
            text: "Track every set. See every trend.\nClimb your own personal best."
            color: Theme.textSecondary
            font.pixelSize: heroColumn.wide ? 18 : 16
            wrapMode: Text.Wrap
            lineHeight: 1.35
        }

        // ----- "Fettle" definition card -----
        // Dictionary-style block using the official brand definition.
        // Restrained styling — thin border, low-contrast surface, single
        // accent line — so it reads as a quiet promise rather than a slogan.
        Rectangle {
            Layout.alignment: Qt.AlignHCenter
            Layout.topMargin: Theme.s4
            Layout.maximumWidth: heroColumn.wide ? 520 : page.width - Theme.s5 * 2
            Layout.fillWidth: true
            color: Qt.rgba(0.176, 0.831, 0.749, 0.06)
            border.color: Qt.rgba(0.176, 0.831, 0.749, 0.35)
            border.width: 1
            radius: Theme.radiusLg
            implicitHeight: fettleCol.implicitHeight + Theme.s4 * 2

            ColumnLayout {
                id: fettleCol
                anchors.fill: parent
                anchors.margins: Theme.s4
                spacing: Theme.s2

                // Headword + pronunciation + part of speech (dictionary header).
                RowLayout {
                    Layout.fillWidth: true
                    spacing: Theme.s2

                    Text {
                        text: "fettle."
                        color: Theme.textPrimary
                        font.pixelSize: heroColumn.wide ? 22 : 20
                        font.bold: true
                        font.italic: true
                    }
                    Text {
                        text: "/ˈfɛt·əl/"
                        color: Theme.textSecondary
                        font.pixelSize: Theme.fontSmall
                        Layout.alignment: Qt.AlignBottom
                        bottomPadding: 3
                    }
                    Text {
                        text: "noun"
                        color: Theme.turquoise
                        font.pixelSize: Theme.fontSmall
                        font.italic: true
                        Layout.alignment: Qt.AlignBottom
                        bottomPadding: 3
                    }
                    Item { Layout.fillWidth: true }
                }

                // Two numbered definitions per the brand spec.
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: Theme.s2

                    Text {
                        Layout.fillWidth: true
                        wrapMode: Text.Wrap
                        text: "1.  condition or state, especially of physical and mental health"
                            + " — the form a person is in."
                        color: Theme.textPrimary
                        font.pixelSize: heroColumn.wide ? 15 : 13
                        lineHeight: 1.45
                    }
                    Text {
                        Layout.fillWidth: true
                        wrapMode: Text.Wrap
                        text: "2.  to fettle: to put oneself in good order; to prepare for what is ahead."
                        color: Theme.textPrimary
                        font.pixelSize: heroColumn.wide ? 15 : 13
                        lineHeight: 1.45
                    }
                }

                // Faint accent rule, then the brand tagline as a closing quote.
                Rectangle {
                    Layout.fillWidth: true
                    Layout.topMargin: Theme.s1
                    height: 1
                    color: Qt.rgba(0.176, 0.831, 0.749, 0.20)
                }

                Text {
                    Layout.fillWidth: true
                    wrapMode: Text.Wrap
                    text: "\"In fine fettle — ready, sharp, fully alive in the body.\""
                    color: Theme.textSecondary
                    font.pixelSize: Theme.fontSmall
                    font.italic: true
                    lineHeight: 1.4
                }
            }
        }

        Item { Layout.fillHeight: true }   // mid spacer pushes CTAs to bottom

        // ----- Feature pill row (preview of in-app capabilities) -----
        RowLayout {
            Layout.alignment: Qt.AlignHCenter
            spacing: Theme.s2
            visible: !heroColumn.wide || true   // keep visible on both layouts

            Repeater {
                model: [
                    { label: "Set tracking",  icon: "✓" },
                    { label: "Progress graphs", icon: "↗" },
                    { label: "Percentile rank",  icon: "★" }
                ]
                delegate: Rectangle {
                    radius: Theme.radiusLg
                    color: Qt.rgba(0.176, 0.831, 0.749, 0.10)
                    border.width: 1
                    border.color: Qt.rgba(0.176, 0.831, 0.749, 0.45)
                    implicitHeight: 32
                    implicitWidth: pillRow.implicitWidth + Theme.s4 * 2
                    Row {
                        id: pillRow
                        anchors.centerIn: parent
                        spacing: 6
                        Text { text: modelData.icon; color: Theme.turquoise;     font.pixelSize: 14; font.bold: true }
                        Text { text: modelData.label; color: Theme.textPrimary; font.pixelSize: 13 }
                    }
                }
            }
        }

        // ----- Call-to-action buttons -----
        ColumnLayout {
            Layout.alignment: Qt.AlignHCenter
            Layout.topMargin: Theme.s5
            Layout.maximumWidth: heroColumn.wide ? 360 : page.width - Theme.s5 * 2
            Layout.fillWidth: true
            spacing: Theme.s3

            PrimaryButton {
                Layout.fillWidth: true
                text: "Get Started"
                onClicked: window.goTo("signup")
            }

            SecondaryButton {
                Layout.fillWidth: true
                text: "I already have an account"
                onClicked: window.goTo("home")        // skip auth for now
            }
        }

        Text {
            Layout.alignment: Qt.AlignHCenter
            Layout.topMargin: Theme.s3
            text: "v" + Qt.application.version + "  ·  available on iOS · Android · Desktop"
            color: Theme.textSecondary
            opacity: 0.6
            font.pixelSize: Theme.fontSmall
        }
    }
}
