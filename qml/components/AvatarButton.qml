// ---------------------------------------------------------------------------
// AvatarButton.qml — circular user avatar that replaces the ⚙ gear icon.
//
// Shows a colored circle with the user's initials (derived from
// UserProfile.displayName). Tapping it navigates to SettingsPage.
//
// Properties:
//   size          — diameter in logical pixels (default 36)
//
// Visual behaviour:
//   * Color comes from UserProfile.avatarColorIndex → avatarColors palette.
//   * Initials: first + last word initials when displayName has spaces;
//     first 2 characters when it is a single word; "?" when unset.
//   * A small red dot in the top-right corner when UserProfile.isComplete
//     is false — prompts the user to fill in their stats.
//   * Subtle opacity drop on hover.
//
// Navigation: calls window.goTo("settings") directly, matching the pattern
// used by every other nav button in the app. `window` is the ApplicationWindow
// root and is resolvable from any nested QML item.
//
// Author: dev-frontend
// Date: 2026-05-04
// ---------------------------------------------------------------------------

import QtQuick
import PeakFettle 1.0

Item {
    id: avatarBtn

    // ---- Public API ----
    property int size: 36

    implicitWidth:  size
    implicitHeight: size

    // ---- Avatar color palette (8 entries, index 0–7) ----
    // Designed to be legible against the dark navy theme.  Index 0 defaults
    // to the app's primary turquoise so a brand-new user looks intentional.
    readonly property var avatarColors: [
        "#2DD4BF",  // 0 — turquoise (default, matches app accent)
        "#6366F1",  // 1 — indigo
        "#F59E0B",  // 2 — amber
        "#EC4899",  // 3 — pink
        "#10B981",  // 4 — emerald
        "#3B82F6",  // 5 — blue
        "#F97316",  // 6 — orange
        "#A855F7"   // 7 — purple
    ]

    // Resolved avatar color — clamp index so a corrupt QSettings value
    // can never cause an out-of-bounds lookup.
    readonly property color avatarColor: {
        const idx = Math.max(0, Math.min(7, UserProfile.avatarColorIndex));
        return avatarColors[idx];
    }

    // Two-letter initials from the display name (or "?" when unset).
    readonly property string initials: {
        const name = (UserProfile.displayName || "").trim();
        if (name.length === 0) return "?";
        const words = name.split(/\s+/).filter(function(w) { return w.length > 0; });
        if (words.length >= 2) {
            return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
        }
        return name.substring(0, Math.min(2, name.length)).toUpperCase();
    }

    // ---- Circle background ----
    Rectangle {
        id: circle
        anchors.fill: parent
        radius:  width / 2
        color:   avatarBtn.avatarColor
        opacity: avatarMouse.containsMouse ? 0.78 : 1.0

        Behavior on opacity { NumberAnimation { duration: 130 } }

        // Initials label — font size scales with the circle so the component
        // works at any size (header default 36, potential large profile 72, etc.)
        Text {
            anchors.centerIn: parent
            text: avatarBtn.initials
            // textOnAccent is near-black (#06121A) — readable on every palette
            // color because all 8 were chosen for sufficient contrast.
            color: Theme.textOnAccent
            font.pixelSize: Math.max(10, Math.round(avatarBtn.size * 0.38))
            font.bold: true
        }

        // ---- Incomplete-profile indicator ----
        // Tiny red dot in the top-right corner when the user hasn't yet
        // filled in the percentile model inputs.  Disappears once isComplete.
        Rectangle {
            id: incompleteDot
            visible: !UserProfile.isComplete
            width:  10
            height: 10
            radius: 5
            color:  Theme.danger
            border.color: Theme.navyDeep   // matches any background the circle sits on
            border.width: 1.5

            // Anchor to the top-right edge of the circle, slightly inset so
            // the border doesn't clip on the smallest size.
            anchors.top:   parent.top
            anchors.right: parent.right
            anchors.topMargin:   -2
            anchors.rightMargin: -2
        }
    }

    // ---- Hit area + navigation ----
    MouseArea {
        id: avatarMouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape:  Qt.PointingHandCursor
        onClicked:    window.goTo("settings")
    }
}
