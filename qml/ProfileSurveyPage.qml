// ---------------------------------------------------------------------------
// ProfileSurveyPage.qml — quick-stats survey collected during onboarding
// (and re-enterable from SettingsPage).
//
// Collects the four inputs the percentile model + streak goal need:
//   * sex                        (M / F)
//   * age                        (14..90 — clamped to model band)
//   * bodyweight                 (entered in the user's chosen UnitPreference)
//   * years of consistent training (0..30 slider)
//   * target workouts per week    (1..7)
//
// Why these and not more:
//   * The strength_curve_model.md inputs are L, lift, sex, BW, age, years.
//     The lift identity comes from the exercise name; L from the logged set.
//     Everything else is the user's profile — which is what this page covers.
//   * Streak/goal logic only needs a target workouts-per-week integer.
//
// UX notes:
//   * No "Skip" affordance for the four required fields. The percentile page
//     is the second-most-popular feature in our beta-survey responses and we
//     do not want to ship a calc-it-half-blind experience.
//   * The user CAN dismiss via the back arrow; that just leaves the values at
//     their previous (or zero) defaults and the percentile page renders an
//     "Add your profile to see ranking" empty state.
//   * Bodyweight respects UnitPreference. We convert to kg before persisting.
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
    background: Rectangle {
        gradient: Gradient {
            GradientStop { position: 0.0; color: Theme.black }
            GradientStop { position: 1.0; color: Theme.navyDeep }
        }
    }

    // After-save destination. Set by Main.qml so the same page can be
    // reused from onboarding ("home" next) and from settings ("back").
    property string nextRoute: "home"

    // ---- Header ----
    header: Rectangle {
        height: 56
        color: "transparent"
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
                text: "Quick stats"
                color: Theme.textPrimary
                font.pixelSize: Theme.fontH2
                font.bold: true
            }
        }
    }

    // ---- Local state ----
    // Mirror UserProfile values into local properties so the user can edit
    // freely and we only commit on Save. ageDraft uses int; bodyweight is
    // shown in the active unit and converted on save.
    property string sexDraft:  UserProfile.sex
    property int    ageDraft:  UserProfile.ageYears > 0 ? UserProfile.ageYears : 28
    property int    yearsDraft: UserProfile.yearsTraining > 0 ? UserProfile.yearsTraining : 1
    property int    freqDraft: UserProfile.targetWorkoutsPerWeek > 0
                               ? UserProfile.targetWorkoutsPerWeek : 3
    // Bodyweight input is held in DISPLAY units. Convert to kg only on save.
    property double bwDisplayDraft: UserProfile.bodyweightKg > 0
                                    ? UnitPreference.toDisplay(UserProfile.bodyweightKg)
                                    : 0.0

    // ---- Workout split selection ----
    // "ppl"    — Push / Pull / Legs (3- or 6-day)
    // "ul"     — Upper / Lower (4-day)
    // "other"  — User-defined custom split
    // "" means not yet chosen (does not block valid() — split is advisory).
    property string splitDraft: UserProfile.workoutSplit
    property string customSplitDraft: UserProfile.customSplitName

    // Avatar drafts — optional, do not affect valid() gate.
    property string displayNameDraft:   UserProfile.displayName
    property int    avatarColorDraft:   UserProfile.avatarColorIndex

    // Avatar palette — must match AvatarButton.qml exactly.
    readonly property var avatarColors: [
        "#2DD4BF",  // 0 turquoise (default)
        "#6366F1",  // 1 indigo
        "#F59E0B",  // 2 amber
        "#EC4899",  // 3 pink
        "#10B981",  // 4 emerald
        "#3B82F6",  // 5 blue
        "#F97316",  // 6 orange
        "#A855F7"   // 7 purple
    ]

    function valid() {
        return sexDraft.length > 0
            && ageDraft  >= 14 && ageDraft  <= 90
            && bwDisplayDraft > 0
            && yearsDraft >= 0 && yearsDraft <= 30
            && freqDraft  >= 1 && freqDraft  <= 7;
    }

    function commit() {
        UserProfile.sex                   = sexDraft;
        UserProfile.ageYears              = ageDraft;
        // years of training: 0 means "novice / less than a year" — store as 1
        // so isComplete() recognises it as filled. The model treats years=0
        // and years=1 nearly identically (T(0)=0.55 vs T(1)=0.68).
        UserProfile.yearsTraining         = Math.max(1, yearsDraft);
        UserProfile.targetWorkoutsPerWeek = freqDraft;
        UserProfile.bodyweightKg          = UnitPreference.toKg(bwDisplayDraft);
        // Workout split (advisory — does not affect percentile model).
        UserProfile.workoutSplit          = splitDraft;
        UserProfile.customSplitName       = customSplitDraft.trim();
        // Avatar — optional, save whatever the user entered (may be empty).
        UserProfile.displayName      = displayNameDraft.trim();
        UserProfile.avatarColorIndex = avatarColorDraft;
        window.goTo(page.nextRoute);
    }

    // ---- Body ----
    Flickable {
        id: bodyFlick
        anchors.fill: parent
        contentWidth: width
        contentHeight: bodyCol.implicitHeight + Theme.s7
        clip: true

        ColumnLayout {
            id: bodyCol
            x: Theme.s5
            y: Theme.s4
            width: Math.min(bodyFlick.width - Theme.s5 * 2, 480)
            anchors.horizontalCenter: parent.horizontalCenter
            spacing: Theme.s4

            ColumnLayout {
                spacing: Theme.s2
                Text {
                    text: "Tell us about yourself"
                    color: Theme.textPrimary
                    font.pixelSize: Theme.fontH1
                    font.bold: true
                    wrapMode: Text.Wrap
                    Layout.fillWidth: true
                }
                Text {
                    text: "We use these to compute how your lifts compare to peers at your level. Stored on your device only."
                    color: Theme.textSecondary
                    font.pixelSize: Theme.fontBody
                    wrapMode: Text.Wrap
                    Layout.fillWidth: true
                }
            }

            // ---- Sex ----
            ColumnLayout {
                Layout.fillWidth: true
                spacing: Theme.s2
                Text {
                    text: "Sex"
                    color: Theme.textSecondary
                    font.pixelSize: Theme.fontSmall
                }
                RowLayout {
                    Layout.fillWidth: true
                    spacing: Theme.s2
                    Repeater {
                        model: [
                            { label: "Male",   value: "M" },
                            { label: "Female", value: "F" }
                        ]
                        delegate: Button {
                            Layout.fillWidth: true
                            checkable: true
                            checked: page.sexDraft === modelData.value
                            text: modelData.label
                            onClicked: page.sexDraft = modelData.value
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
                    text: "Required for the strength model — different reference distributions for M and F."
                    color: Theme.textSecondary
                    font.pixelSize: Theme.fontSmall
                    wrapMode: Text.Wrap
                    Layout.fillWidth: true
                }
            }

            // ---- Age ----
            ColumnLayout {
                Layout.fillWidth: true
                spacing: Theme.s1
                RowLayout {
                    Layout.fillWidth: true
                    Text {
                        Layout.fillWidth: true
                        text: "Age"
                        color: Theme.textSecondary
                        font.pixelSize: Theme.fontSmall
                    }
                    Text {
                        text: page.ageDraft + " years"
                        color: Theme.turquoise
                        font.pixelSize: Theme.fontBody
                        font.bold: true
                    }
                }
                Slider {
                    id: ageSlider
                    Layout.fillWidth: true
                    from: 14; to: 90; stepSize: 1
                    value: page.ageDraft
                    onMoved: page.ageDraft = Math.round(value)
                }
            }

            // ---- Bodyweight ----
            ColumnLayout {
                Layout.fillWidth: true
                spacing: Theme.s1
                Text {
                    text: "Bodyweight (" + UnitPreference.suffix + ")"
                    color: Theme.textSecondary
                    font.pixelSize: Theme.fontSmall
                }
                ThemedTextField {
                    id: bwField
                    Layout.fillWidth: true
                    placeholderText: UnitPreference.isLbs ? "e.g. 175" : "e.g. 80"
                    inputMethodHints: Qt.ImhFormattedNumbersOnly
                    // Seed the field once on construction; from then on the
                    // user owns the text and we only read it onTextChanged.
                    // (A property-binding back to a numeric draft would cause
                    // the cursor to jump every time the user types ".0".)
                    Component.onCompleted: {
                        if (page.bwDisplayDraft > 0) {
                            text = Number(page.bwDisplayDraft).toFixed(1).replace(/\.0$/, "");
                        }
                    }
                    onTextChanged: {
                        const v = parseFloat(text);
                        page.bwDisplayDraft = isNaN(v) ? 0.0 : v;
                    }
                    // If the user toggles unit while the survey is open, re-seed
                    // with the converted value so the placeholder/example match.
                    Connections {
                        target: UnitPreference
                        function onUnitChanged() {
                            if (page.bwDisplayDraft > 0) {
                                // Convert: previous draft was in old display unit,
                                // already mirrored to draft. Re-derive from kg if
                                // we have one stored on the profile, else leave.
                                if (UserProfile.bodyweightKg > 0) {
                                    page.bwDisplayDraft = UnitPreference.toDisplay(UserProfile.bodyweightKg);
                                    bwField.text = Number(page.bwDisplayDraft)
                                                       .toFixed(1).replace(/\.0$/, "");
                                }
                            }
                        }
                    }
                }
                Text {
                    text: "Stored in kg internally; the strength model is bodyweight-normalised."
                    color: Theme.textSecondary
                    font.pixelSize: Theme.fontSmall
                    wrapMode: Text.Wrap
                    Layout.fillWidth: true
                }
            }

            // ---- Years of training ----
            ColumnLayout {
                Layout.fillWidth: true
                spacing: Theme.s1
                RowLayout {
                    Layout.fillWidth: true
                    Text {
                        Layout.fillWidth: true
                        text: "Years of consistent training"
                        color: Theme.textSecondary
                        font.pixelSize: Theme.fontSmall
                    }
                    Text {
                        text: page.yearsDraft <= 0
                              ? "Less than 1"
                              : (page.yearsDraft >= 30 ? "30+" : page.yearsDraft + "")
                        color: Theme.turquoise
                        font.pixelSize: Theme.fontBody
                        font.bold: true
                    }
                }
                Slider {
                    id: yearsSlider
                    Layout.fillWidth: true
                    from: 0; to: 30; stepSize: 1
                    value: page.yearsDraft
                    onMoved: page.yearsDraft = Math.round(value)
                }
                Text {
                    text: "Used in the experience curve. The model treats anything past ~9 years as fully developed."
                    color: Theme.textSecondary
                    font.pixelSize: Theme.fontSmall
                    wrapMode: Text.Wrap
                    Layout.fillWidth: true
                }
            }

            // ---- Target workouts per week (streak goal) ----
            ColumnLayout {
                Layout.fillWidth: true
                spacing: Theme.s1
                RowLayout {
                    Layout.fillWidth: true
                    Text {
                        Layout.fillWidth: true
                        text: "Target workouts per week"
                        color: Theme.textSecondary
                        font.pixelSize: Theme.fontSmall
                    }
                    Text {
                        text: page.freqDraft + " / week"
                        color: Theme.turquoise
                        font.pixelSize: Theme.fontBody
                        font.bold: true
                    }
                }
                RowLayout {
                    Layout.fillWidth: true
                    spacing: Theme.s1
                    Repeater {
                        model: 7
                        delegate: Button {
                            Layout.fillWidth: true
                            checkable: true
                            checked: page.freqDraft === (index + 1)
                            text: (index + 1) + ""
                            onClicked: page.freqDraft = index + 1
                            contentItem: Text {
                                text: parent.text
                                color: parent.checked ? Theme.textOnAccent : Theme.textPrimary
                                horizontalAlignment: Text.AlignHCenter
                                verticalAlignment: Text.AlignVCenter
                                font.pixelSize: Theme.fontBody
                                font.bold: true
                            }
                            background: Rectangle {
                                radius: Theme.radiusSm
                                color: parent.checked ? Theme.turquoise : Theme.navyMid
                                border.width: 1
                                border.color: parent.checked ? Theme.turquoise : Theme.navyLine
                            }
                        }
                    }
                }
                Text {
                    text: "Drives the streak / weekly-goal display on Home."
                    color: Theme.textSecondary
                    font.pixelSize: Theme.fontSmall
                    wrapMode: Text.Wrap
                    Layout.fillWidth: true
                }
            }

            // ---- Workout split ----
            // Advisory field — lets the app filter workout history by split
            // and pre-populate the "Start Workout" exercise picker. Does not
            // affect the strength percentile model. Marked Optional so users
            // who follow a non-standard program are not blocked.
            ColumnLayout {
                Layout.fillWidth: true
                spacing: Theme.s2

                // Section header
                RowLayout {
                    Layout.fillWidth: true
                    spacing: Theme.s2
                    Text {
                        Layout.fillWidth: true
                        text: "Workout split"
                        color: Theme.textSecondary
                        font.pixelSize: Theme.fontSmall
                    }
                    Rectangle {
                        radius: Theme.radiusSm
                        color: Qt.rgba(0.176, 0.831, 0.749, 0.12)
                        implicitWidth:  splitOptLabel.implicitWidth + Theme.s3 * 2
                        implicitHeight: 22
                        Text {
                            id: splitOptLabel
                            anchors.centerIn: parent
                            text: "Optional"
                            color: Theme.turquoise
                            font.pixelSize: Theme.fontSmall
                        }
                    }
                }

                Text {
                    Layout.fillWidth: true
                    wrapMode: Text.Wrap
                    text: "How do you typically organise your training week? Used to help filter your workout history."
                    color: Theme.textSecondary
                    font.pixelSize: Theme.fontSmall
                }

                // Row 1: Push / Pull / Legs
                Button {
                    Layout.fillWidth: true
                    checkable: true
                    checked: page.splitDraft === "ppl"
                    onClicked: page.splitDraft = (page.splitDraft === "ppl" ? "" : "ppl")
                    contentItem: ColumnLayout {
                        spacing: 2
                        Text {
                            Layout.fillWidth: true
                            text: "Push / Pull / Legs"
                            color: parent.parent.checked ? Theme.textOnAccent : Theme.textPrimary
                            font.pixelSize: Theme.fontBody
                            font.bold: true
                            horizontalAlignment: Text.AlignHCenter
                        }
                        Text {
                            Layout.fillWidth: true
                            text: "3 or 6-day split — chest/shoulders/tris · back/biceps · legs"
                            color: parent.parent.checked
                                   ? Qt.rgba(0, 0, 0, 0.60)
                                   : Theme.textSecondary
                            font.pixelSize: Theme.fontSmall
                            horizontalAlignment: Text.AlignHCenter
                        }
                    }
                    background: Rectangle {
                        radius: Theme.radiusMd
                        color: parent.checked ? Theme.turquoise : Theme.navyMid
                        border.width: 1
                        border.color: parent.checked ? Theme.turquoise : Theme.navyLine
                    }
                    implicitHeight: 52
                }

                // Row 2: Upper / Lower
                Button {
                    Layout.fillWidth: true
                    checkable: true
                    checked: page.splitDraft === "ul"
                    onClicked: page.splitDraft = (page.splitDraft === "ul" ? "" : "ul")
                    contentItem: ColumnLayout {
                        spacing: 2
                        Text {
                            Layout.fillWidth: true
                            text: "Upper / Lower"
                            color: parent.parent.checked ? Theme.textOnAccent : Theme.textPrimary
                            font.pixelSize: Theme.fontBody
                            font.bold: true
                            horizontalAlignment: Text.AlignHCenter
                        }
                        Text {
                            Layout.fillWidth: true
                            text: "4-day split — 2 upper sessions + 2 lower sessions per week"
                            color: parent.parent.checked
                                   ? Qt.rgba(0, 0, 0, 0.60)
                                   : Theme.textSecondary
                            font.pixelSize: Theme.fontSmall
                            horizontalAlignment: Text.AlignHCenter
                        }
                    }
                    background: Rectangle {
                        radius: Theme.radiusMd
                        color: parent.checked ? Theme.turquoise : Theme.navyMid
                        border.width: 1
                        border.color: parent.checked ? Theme.turquoise : Theme.navyLine
                    }
                    implicitHeight: 52
                }

                // Row 3: Other (custom / full-body / bro split / etc.)
                Button {
                    Layout.fillWidth: true
                    checkable: true
                    checked: page.splitDraft === "other"
                    onClicked: page.splitDraft = (page.splitDraft === "other" ? "" : "other")
                    contentItem: ColumnLayout {
                        spacing: 2
                        Text {
                            Layout.fillWidth: true
                            text: "Other"
                            color: parent.parent.checked ? Theme.textOnAccent : Theme.textPrimary
                            font.pixelSize: Theme.fontBody
                            font.bold: true
                            horizontalAlignment: Text.AlignHCenter
                        }
                        Text {
                            Layout.fillWidth: true
                            text: "Full-body, bro split, custom programme — name it below"
                            color: parent.parent.checked
                                   ? Qt.rgba(0, 0, 0, 0.60)
                                   : Theme.textSecondary
                            font.pixelSize: Theme.fontSmall
                            horizontalAlignment: Text.AlignHCenter
                        }
                    }
                    background: Rectangle {
                        radius: Theme.radiusMd
                        color: parent.checked ? Theme.turquoise : Theme.navyMid
                        border.width: 1
                        border.color: parent.checked ? Theme.turquoise : Theme.navyLine
                    }
                    implicitHeight: 52
                }

                // Custom split name — only shown when "Other" is selected.
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: Theme.s1
                    visible: page.splitDraft === "other"
                    Layout.preferredHeight: visible ? implicitHeight : 0

                    Text {
                        text: "What do you call your split?"
                        color: Theme.textSecondary
                        font.pixelSize: Theme.fontSmall
                    }
                    ThemedTextField {
                        id: customSplitField
                        Layout.fillWidth: true
                        placeholderText: "e.g. Full Body, Bro Split, 5/3/1"
                        maximumLength: 48
                        text: page.customSplitDraft
                        onTextChanged: page.customSplitDraft = text
                    }
                    Text {
                        text: "This name will appear in workout history filters."
                        color: Theme.textSecondary
                        font.pixelSize: Theme.fontSmall
                        wrapMode: Text.Wrap
                        Layout.fillWidth: true
                    }
                }
            }

            // ---- Avatar setup (optional) ----
            // Deliberately placed after the required fields so it doesn't
            // distract first-timers from completing the percentile data.
            // Clearly marked "Optional" — skipping leaves a "?" initials
            // placeholder until the user sets their name later in Settings.
            Rectangle {
                Layout.fillWidth: true
                color: Theme.navyDeep
                radius: Theme.radiusLg
                border.width: 1
                border.color: Theme.navyLine
                implicitHeight: avatarSetupCol.implicitHeight + Theme.s4 * 2

                ColumnLayout {
                    id: avatarSetupCol
                    anchors.fill: parent
                    anchors.margins: Theme.s4
                    spacing: Theme.s3

                    // Section header
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: Theme.s2
                        Text {
                            Layout.fillWidth: true
                            text: "Set up your avatar"
                            color: Theme.textPrimary
                            font.pixelSize: Theme.fontH2
                            font.bold: true
                        }
                        Rectangle {
                            radius: Theme.radiusSm
                            color: Qt.rgba(0.176, 0.831, 0.749, 0.12)
                            implicitWidth:  optionalLabel.implicitWidth + Theme.s3 * 2
                            implicitHeight: 22
                            Text {
                                id: optionalLabel
                                anchors.centerIn: parent
                                text: "Optional"
                                color: Theme.turquoise
                                font.pixelSize: Theme.fontSmall
                            }
                        }
                    }

                    Text {
                        Layout.fillWidth: true
                        wrapMode: Text.Wrap
                        text: "Your avatar shows in the app header instead of the gear icon. "
                              + "You can skip this and set it later in Settings."
                        color: Theme.textSecondary
                        font.pixelSize: Theme.fontSmall
                    }

                    // Live avatar preview + color swatches side-by-side
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: Theme.s4

                        // Preview circle
                        Rectangle {
                            width: 52; height: 52
                            radius: 26
                            color: page.avatarColors[page.avatarColorDraft]
                            Layout.alignment: Qt.AlignVCenter

                            Text {
                                anchors.centerIn: parent
                                text: {
                                    const name = (page.displayNameDraft || "").trim();
                                    if (name.length === 0) return "?";
                                    const words = name.split(/\s+/).filter(
                                        function(w) { return w.length > 0; });
                                    if (words.length >= 2)
                                        return (words[0].charAt(0)
                                              + words[words.length - 1].charAt(0)).toUpperCase();
                                    return name.substring(0, Math.min(2, name.length)).toUpperCase();
                                }
                                color: Theme.textOnAccent
                                font.pixelSize: 18
                                font.bold: true
                            }
                        }

                        // Color swatch grid
                        Flow {
                            Layout.fillWidth: true
                            spacing: Theme.s2

                            Repeater {
                                model: page.avatarColors
                                delegate: Rectangle {
                                    width: 32; height: 32
                                    radius: 16
                                    color: modelData
                                    border.width: page.avatarColorDraft === index ? 3 : 0
                                    border.color: Theme.textPrimary
                                    opacity: swatchHover.containsMouse ? 0.80 : 1.0

                                    Behavior on opacity { NumberAnimation { duration: 100 } }
                                    Behavior on border.width { NumberAnimation { duration: 100 } }

                                    MouseArea {
                                        id: swatchHover
                                        anchors.fill: parent
                                        hoverEnabled: true
                                        cursorShape: Qt.PointingHandCursor
                                        onClicked: page.avatarColorDraft = index
                                    }
                                }
                            }
                        }
                    }

                    // Display name field
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: Theme.s1
                        Text {
                            text: "Display name (optional)"
                            color: Theme.textSecondary
                            font.pixelSize: Theme.fontSmall
                        }
                        ThemedTextField {
                            id: displayNameField
                            Layout.fillWidth: true
                            placeholderText: "e.g. Alex, Marcus, Priya"
                            maximumLength: 32
                            text: page.displayNameDraft
                            onTextChanged: page.displayNameDraft = text
                        }
                        Text {
                            text: "Appears inside your avatar circle. Max 32 characters."
                            color: Theme.textSecondary
                            font.pixelSize: Theme.fontSmall
                            wrapMode: Text.Wrap
                            Layout.fillWidth: true
                        }
                    }
                }
            }

            // ---- Save ----
            PrimaryButton {
                Layout.fillWidth: true
                Layout.topMargin: Theme.s3
                text: "Save and continue"
                enabled: page.valid()
                onClicked: page.commit()
            }

            Text {
                Layout.alignment: Qt.AlignHCenter
                horizontalAlignment: Text.AlignHCenter
                wrapMode: Text.Wrap
                Layout.fillWidth: true
                text: "You can change any of these later in Settings."
                color: Theme.textSecondary
                font.pixelSize: Theme.fontSmall
                opacity: 0.8
            }
        }
    }
}
