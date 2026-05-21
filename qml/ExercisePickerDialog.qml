// ---------------------------------------------------------------------------
// ExercisePickerDialog.qml — searchable, categorised exercise picker.
//
// Sits behind the "Library" button on the log form and the edit-set dialog.
// Displays the bundled ExerciseLibrary (hundreds of common movements)
// grouped by muscle / category, plus a top-of-list "Recent" section that
// mirrors the user's previously-trained exercises so common picks remain
// one tap away.
//
// On selection the dialog closes and invokes the caller's callback with
// the chosen exercise name.
//
// Author: dev-frontend (TICKET-003)
// Date: 2026-05-01
// ---------------------------------------------------------------------------

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import PeakFettle 1.0
import "components"

Dialog {
    id: dialog
    modal: true
    title: "Choose an exercise"
    anchors.centerIn: parent
    width:  Math.min((parent ? parent.width  : 420) - Theme.s5 * 2, 520)
    height: Math.min((parent ? parent.height : 700) - Theme.s5 * 2, 640)

    background: Rectangle {
        color: Theme.navyDeep
        radius: Theme.radiusLg
        border.color: Theme.navyLine
        border.width: 1
    }

    // ----- API -----
    // Caller sets onSelected to a JS function (name) -> void; it's invoked
    // when the user picks an item.
    property var onSelected: null

    // Prefix with `pick` so we don't shadow the inherited Dialog.open().
    function pickWith(callback) {
        dialog.onSelected = callback;
        searchField.text = "";
        rebuildModel();
        open();   // built-in Dialog.open()
    }

    // ---- Combined model: { type: "section"|"item", label, name } ----
    // section rows are uppercased category labels; item rows are exercises.
    ListModel {
        id: filteredModel
    }

    function rebuildModel() {
        filteredModel.clear();
        const q = (searchField.text || "").trim();

        // ---- Search mode: alias-aware flat list (TICKET-007) ----
        // Uses searchDetailed() which returns { name, hint } objects so we
        // can display a "via: OHP" subtitle when an alias drove the match.
        if (q.length > 0) {
            const matches = ExerciseLibrary.searchDetailed(q, 200);
            if (matches.length === 0) {
                filteredModel.append({ type: "section", label: "No matches", name: "", hint: "" });
            } else {
                filteredModel.append({ type: "section",
                                       label: "Matches (" + matches.length + ")",
                                       name: "", hint: "" });
                for (let i = 0; i < matches.length; ++i) {
                    filteredModel.append({ type: "item",
                                           label: matches[i].name,
                                           name:  matches[i].name,
                                           hint:  matches[i].hint || "" });
                }
            }
            return;
        }

        // ---- Browse mode: Recent (user's history) + categories ----
        const recents = WorkoutTracker.exerciseNames || [];
        if (recents.length > 0) {
            filteredModel.append({ type: "section",
                                   label: "Your recent",
                                   name:  "", hint: "" });
            for (let r = 0; r < recents.length; ++r) {
                filteredModel.append({ type: "item",
                                       label: recents[r],
                                       name:  recents[r], hint: "" });
            }
        }

        const groups = ExerciseLibrary.grouped();
        for (let g = 0; g < groups.length; ++g) {
            const group = groups[g];
            filteredModel.append({ type: "section",
                                   label: group.label,
                                   name:  "", hint: "" });
            for (let i = 0; i < group.exercises.length; ++i) {
                filteredModel.append({ type: "item",
                                       label: group.exercises[i],
                                       name:  group.exercises[i], hint: "" });
            }
        }
    }

    // N-05: Debounce timer — prevents ExercisePickerDialog from rebuilding the
    // full list on every keystroke. 180 ms is imperceptible to the user but
    // prevents per-character DOM thrash and is a precondition for TICKET-007
    // backend fuzzy search when that replaces the local C++ search.
    Timer {
        id: searchDebounce
        interval: 180
        repeat: false
        onTriggered: dialog.rebuildModel()
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: Theme.s3

        // Search field.
        ThemedTextField {
            id: searchField
            Layout.fillWidth: true
            placeholderText: "Search hundreds of exercises…"
            onTextChanged: searchDebounce.restart()
        }

        // Big sectioned list.
        ListView {
            id: list
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            model: filteredModel
            spacing: 1

            delegate: Rectangle {
                width: list.width
                // Item rows grow slightly taller when an alias hint is present
                // so there's room for the two-line layout.
                height: model.type === "section" ? 32
                        : (model.hint && model.hint.length > 0 ? 52 : 44)
                color: model.type === "section"
                       ? Qt.rgba(0.176, 0.831, 0.749, 0.08)
                       : (index % 2 === 0
                          ? "transparent"
                          : Qt.rgba(1, 1, 1, 0.02))
                radius: Theme.radiusSm

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin:  Theme.s3
                    anchors.rightMargin: Theme.s3
                    spacing: Theme.s2

                    // Section rows: single label.
                    // Item rows: name + optional alias hint subtitle.
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 0

                        Text {
                            Layout.fillWidth: true
                            text: model.label
                            elide: Text.ElideRight
                            color: model.type === "section"
                                   ? Theme.turquoise
                                   : Theme.textPrimary
                            font.pixelSize: model.type === "section"
                                            ? Theme.fontSmall
                                            : Theme.fontBody
                            font.bold: model.type === "section"
                            font.capitalization: model.type === "section"
                                                 ? Font.AllUppercase
                                                 : Font.MixedCase
                        }

                        // TICKET-007: Alias hint — "via: OHP", "via: rdl", etc.
                        // Only shown for item rows where a hint was returned by
                        // searchDetailed(). Hidden in browse mode (hint == "").
                        Text {
                            visible: model.type === "item"
                                     && model.hint !== undefined
                                     && model.hint.length > 0
                            Layout.fillWidth: true
                            text: visible ? "also: " + model.hint : ""
                            color: Theme.textSecondary
                            font.pixelSize: Theme.fontSmall - 1
                            font.italic: true
                            elide: Text.ElideRight
                        }
                    }
                }

                MouseArea {
                    anchors.fill: parent
                    enabled: model.type === "item"
                    cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
                    onClicked: {
                        if (typeof dialog.onSelected === "function") {
                            dialog.onSelected(model.name);
                        }
                        dialog.close();
                    }
                }
            }
        }

        // Footer.
        RowLayout {
            Layout.fillWidth: true
            spacing: Theme.s2

            Text {
                Layout.fillWidth: true
                text: "Can't find it? Just type the name on the form — new exercises are added to your history automatically."
                color: Theme.textSecondary
                font.pixelSize: Theme.fontSmall
                wrapMode: Text.Wrap
            }

            SecondaryButton {
                text: "Cancel"
                Layout.preferredWidth: 100
                onClicked: dialog.close()
            }
        }
    }
}
