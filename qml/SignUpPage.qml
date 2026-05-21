// ---------------------------------------------------------------------------
// SignUpPage.qml
//
// Username + email + password form. Talks to the C++ UserManager singleton.
// On success, advances the user to the SetTrackerPage. On failure shows
// the error message returned by UserManager::signUp.
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

    // ----- Top bar (back + title) -----
    header: Rectangle {
        color: "transparent"
        height: 56
        RowLayout {
            anchors.fill: parent
            anchors.leftMargin:  Theme.s4
            anchors.rightMargin: Theme.s4
            spacing: Theme.s3

            ToolButton {
                text: "←"
                font.pixelSize: 22
                onClicked: window.goTo("back")
                contentItem: Text {
                    text: parent.text
                    color: Theme.turquoise
                    font: parent.font
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                }
                background: Rectangle { color: "transparent" }
            }

            Text {
                Layout.fillWidth: true
                text: "Create your account"
                color: Theme.textPrimary
                font.pixelSize: Theme.fontH2
                font.bold: true
            }
        }
    }

    // ----- Form -----
    Flickable {
        anchors.fill: parent
        contentHeight: form.implicitHeight + Theme.s7
        clip: true

        ColumnLayout {
            id: form
            width: Math.min(parent.width - Theme.s5 * 2, 440)
            anchors.horizontalCenter: parent.horizontalCenter
            spacing: Theme.s3
            anchors.top: parent.top
            anchors.topMargin: Theme.s4

            MountainLogo {
                Layout.alignment: Qt.AlignHCenter
                size: 72
            }

            Text {
                Layout.alignment: Qt.AlignHCenter
                Layout.topMargin: Theme.s2
                text: "Join Peak Fettle"
                color: Theme.textPrimary
                font.pixelSize: Theme.fontH1
                font.bold: true
            }

            Text {
                Layout.alignment: Qt.AlignHCenter
                Layout.maximumWidth: form.width
                horizontalAlignment: Text.AlignHCenter
                text: "Three fields and you're tracking sets in seconds."
                color: Theme.textSecondary
                font.pixelSize: Theme.fontBody
                wrapMode: Text.Wrap
            }

            // ---- Username ----
            ColumnLayout {
                Layout.fillWidth: true
                Layout.topMargin: Theme.s4
                spacing: Theme.s1
                Text { text: "Username"; color: Theme.textSecondary; font.pixelSize: Theme.fontSmall }
                ThemedTextField {
                    id: usernameField
                    Layout.fillWidth: true
                    placeholderText: "e.g. arvin_lifts"
                    selectByMouse: true
                }
            }

            // ---- Email ----
            ColumnLayout {
                Layout.fillWidth: true
                spacing: Theme.s1
                Text { text: "Email"; color: Theme.textSecondary; font.pixelSize: Theme.fontSmall }
                ThemedTextField {
                    id: emailField
                    Layout.fillWidth: true
                    placeholderText: "you@domain.com"
                    inputMethodHints: Qt.ImhEmailCharactersOnly | Qt.ImhNoAutoUppercase
                    selectByMouse: true
                }
            }

            // ---- Password ----
            ColumnLayout {
                Layout.fillWidth: true
                spacing: Theme.s1
                Text { text: "Password (8+ chars)"; color: Theme.textSecondary; font.pixelSize: Theme.fontSmall }
                ThemedTextField {
                    id: passwordField
                    Layout.fillWidth: true
                    placeholderText: "Strong password"
                    echoMode: TextInput.Password
                    selectByMouse: true
                }
            }

            // ---- Error message ----
            Text {
                id: errorLabel
                Layout.fillWidth: true
                Layout.topMargin: Theme.s2
                visible: text.length > 0
                wrapMode: Text.Wrap
                color: Theme.danger
                font.pixelSize: Theme.fontSmall
            }

            PrimaryButton {
                Layout.fillWidth: true
                Layout.topMargin: Theme.s3
                text: "Create account"
                onClicked: {
                    errorLabel.text = UserManager.signUp(
                        usernameField.text,
                        emailField.text,
                        passwordField.text
                    );
                    if (errorLabel.text.length === 0) {
                        // TICKET-005: new users go through onboarding before
                        // the tracker so they pick a template and understand
                        // the core features on their first session.
                        window.goTo("onboarding");
                    }
                }
            }

            SecondaryButton {
                Layout.fillWidth: true
                text: "Skip for now"
                onClicked: window.goTo("home")
            }

            Text {
                Layout.alignment: Qt.AlignHCenter
                Layout.topMargin: Theme.s4
                horizontalAlignment: Text.AlignHCenter
                text: "By creating an account you agree to our terms.\nNo data leaves your device in this preview build."
                color: Theme.textSecondary
                opacity: 0.6
                font.pixelSize: Theme.fontSmall
                wrapMode: Text.Wrap
            }
        }
    }
}
