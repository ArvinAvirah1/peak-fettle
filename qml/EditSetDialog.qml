// ---------------------------------------------------------------------------
// EditSetDialog.qml — edit or delete a previously logged set.
//
// Opened from the Recent Sets list on SetTrackerPage when the user taps a
// row. Lets the user change weight, reps, RIR, and the date+time. The date
// picker is the same control as on the log form so the founder can use this
// to backfill historical sets and verify the per-day aggregation in the
// progress graph.
//
// Calls WorkoutTracker.editSet (id-based) on save and
// WorkoutTracker.deleteSet on remove.
//
// Author: dev-frontend (TICKET-004)
// Date: 2026-05-01
//
// TICKET-008 (PR note, 2026-05-03)
// ---------------------------------
// A non-blocking gold banner is shown at the top of the form when the set
// being edited is the user's current PR (setData.isPr === true).
//
// C++ WorkoutTracker requirement: recentSets() must include an `isPr` bool
// on every QVariantMap it returns. Set it to true when the set's set_id
// matches any row in exercise_prs for the same (user_id, exercise_id) —
// i.e., the set currently holds either the weight-PR at its rep count OR
// the E1RM-PR (rep_count=0). See migrations/20260503_exercise_prs.sql for
// the exact JOIN pattern:
//
//   LEFT JOIN exercise_prs pr
//          ON pr.user_id     = s.user_id
//         AND pr.exercise_id = s.exercise_id
//         AND pr.set_id      = s.id
//   -- isPr = (pr.set_id IS NOT NULL)
// ---------------------------------------------------------------------------

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import PeakFettle 1.0
import "components"

Dialog {
    id: dialog
    modal: true
    title: "Edit set"
    anchors.centerIn: parent
    // Constrain so it stays usable on phone widths.
    width: Math.min((parent ? parent.width : 420) - Theme.s5 * 2, 460)

    background: Rectangle {
        color: Theme.navyDeep
        radius: Theme.radiusLg
        border.color: Theme.navyLine
        border.width: 1
    }

    // Inputs - bound to the row that opened the dialog.
    property var setData: ({})              // the row from recentSets()
    // Working copies so we only commit on Save.
    property string draftExercise: ""
    property string draftWeightDisplay: ""  // string in CURRENT display unit
    property string draftReps: ""
    property string draftRir: ""
    property date   draftDate: new Date()
    property int    draftHour: 12
    property int    draftMinute: 0

    // Re-prime drafts every time we open. setData might mutate while open
    // if dataChanged fires; we snapshot at open time to avoid surprise edits.
    function loadFrom(row) {
        setData = row || ({});
        draftExercise = row.exercise || "";
        draftWeightDisplay = row.weight > 0
            ? String(Math.round(UnitPreference.toDisplay(row.weight) * 100) / 100)
            : "";
        draftReps = row.reps !== undefined ? String(row.reps) : "";
        draftRir  = (row.rir !== undefined && row.rir >= 0) ? String(row.rir) : "";
        const ts = row.timestamp ? new Date(row.timestamp) : new Date();
        draftDate   = ts;
        draftHour   = ts.getHours();
        draftMinute = ts.getMinutes();
        editError.text = "";
    }

    // NOTE: do not name this `open` - that would shadow the inherited
    // Dialog.open() and prevent us from showing the dialog.
    function openForEdit(row) {
        loadFrom(row);
        open();   // built-in Dialog.open()
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: Theme.s3

        // ---- Exercise (free text + library picker) ----
        ColumnLayout {
            Layout.fillWidth: true
            spacing: Theme.s1
            Text { text: "Exercise"; color: Theme.textSecondary; font.pixelSize: Theme.fontSmall }
            RowLayout {
                Layout.fillWidth: true
                spacing: Theme.s2
                ThemedTextField {
                    id: editExercise
                    Layout.fillWidth: true
                    text: dialog.draftExercise
                    onTextChanged: dialog.draftExercise = text
                    placeholderText: "e.g. Bench Press"
                }
                SecondaryButton {
                    text: "Library"
                    Layout.preferredWidth: 96
                    onClicked: {
                        // Open the picker, then write the chosen name back.
                        // The picker dialog is owned by SetTrackerPage; we
                        // route through a lightweight signal so we don't
                        // hard-code an id reference here.
                        dialog.requestLibraryPick(function(name) {
                            dialog.draftExercise = name;
                        });
                    }
                }
            }
        }

        // ---- Weight (display unit) + Reps + RIR ----
        GridLayout {
            Layout.fillWidth: true
            columns: 3
            rowSpacing: Theme.s2
            columnSpacing: Theme.s2

            ColumnLayout {
                Layout.fillWidth: true
                spacing: Theme.s1
                Text {
                    text: UnitPreference.inputLabel
                    color: Theme.textSecondary
                    font.pixelSize: Theme.fontSmall
                }
                ThemedTextField {
                    id: editWeight
                    Layout.fillWidth: true
                    text: dialog.draftWeightDisplay
                    onTextChanged: dialog.draftWeightDisplay = text
                    placeholderText: UnitPreference.placeholderExample
                    inputMethodHints: Qt.ImhFormattedNumbersOnly
                    validator: DoubleValidator { bottom: 0; decimals: 2 }
                }
            }
            ColumnLayout {
                Layout.fillWidth: true
                spacing: Theme.s1
                Text { text: "Reps"; color: Theme.textSecondary; font.pixelSize: Theme.fontSmall }
                ThemedTextField {
                    id: editReps
                    Layout.fillWidth: true
                    text: dialog.draftReps
                    onTextChanged: dialog.draftReps = text
                    inputMethodHints: Qt.ImhDigitsOnly
                    validator: IntValidator { bottom: 1; top: 9999 }
                }
            }
            // RIR column - mirror SetTrackerPage's rule: hidden when the
            // user has turned off effort tracking (TICKET-002). Editing a
            // legacy set with a stored RIR value while the field is hidden
            // is fine because draftRir stays at its loaded value and is
            // round-tripped on Save.
            ColumnLayout {
                Layout.fillWidth: true
                spacing: Theme.s1
                visible: EffortPreference.showRir
                Layout.preferredHeight: visible ? implicitHeight : 0
                Text {
                    text: "RIR (optional)"
                    color: Theme.textSecondary
                    font.pixelSize: Theme.fontSmall
                }
                ThemedTextField {
                    id: editRir
                    Layout.fillWidth: true
                    text: dialog.draftRir
                    onTextChanged: dialog.draftRir = text
                    inputMethodHints: Qt.ImhDigitsOnly
                    placeholderText: "0-5"
                    validator: IntValidator { bottom: 0; top: 10 }
                }
                Text {
                    text: "Reps in Reserve - how many more reps could you have done? Skip if unsure."
                    color: Theme.textSecondary
                    font.pixelSize: Theme.fontSmall - 1
                    wrapMode: Text.Wrap
                    Layout.fillWidth: true
                }
            }
        }

        // ---- TICKET-008: PR warning banner ----
        // Non-blocking notice shown when the set being edited is the user's
        // current personal record. Editing it will cause WorkoutTracker to
        // recompute the exercise_prs entry on the next logSet() or on reload.
        Rectangle {
            visible: dialog.setData.isPr === true
            Layout.fillWidth: true
            color: Qt.rgba(1.0, 0.84, 0.0, 0.10)
            border.color: Qt.rgba(1.0, 0.84, 0.0, 0.50)
            border.width: 1
            radius: Theme.radiusMd
            implicitHeight: prNoteRow.implicitHeight + Theme.s3 * 2

            RowLayout {
                id: prNoteRow
                anchors.fill: parent
                anchors.margins: Theme.s3
                spacing: Theme.s2

                Text {
                    text: "⚑"
                    color: Qt.rgba(1.0, 0.80, 0.0, 1.0)
                    font.pixelSize: Theme.fontBody
                }

                Text {
                    Layout.fillWidth: true
                    wrapMode: Text.Wrap
                    font.pixelSize: Theme.fontSmall
                    color: Theme.textPrimary
                    text: "Editing your current PR for <b>"
                          + (dialog.setData.exercise || "this exercise")
                          + "</b> — history will recompute after you save."
                }
            }
        }

        // ---- Date + time ----
        // N-01: replaced SpinBoxes with inputMask text fields matching the
        // pattern used in SetTrackerPage.qml. SpinBoxes were a regression on
        // mobile widths and inconsistent with the log form the user just came from.
        //
        // TASK-3 note: per-set times are preserved for ordering, but only the
        // FIRST and LAST set times of a workout day are shown in the session
        // banner — the duration display on SetTrackerPage reflects this range.
        ColumnLayout {
            Layout.fillWidth: true
            spacing: Theme.s1

            Text {
                text: "Date and time"
                color: Theme.textSecondary
                font.pixelSize: Theme.fontSmall
            }
            Text {
                text: "Affects workout start / end when this is the first or last set of the day."
                color: Theme.textSecondary
                font.pixelSize: Theme.fontSmall - 1
                wrapMode: Text.Wrap
                Layout.fillWidth: true
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: Theme.s2

                // Date field: YYYY-MM-DD
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: Theme.s1
                    Text {
                        text: "Date (YYYY-MM-DD)"
                        color: Theme.textSecondary
                        font.pixelSize: Theme.fontSmall
                    }
                    ThemedTextField {
                        id: dateInput
                        Layout.fillWidth: true
                        text: Qt.formatDate(dialog.draftDate, "yyyy-MM-dd")
                        placeholderText: "2026-05-03"
                        inputMask: "9999-99-99;_"
                        onTextChanged: {
                            const m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                            if (m) {
                                const y  = parseInt(m[1], 10);
                                const mo = parseInt(m[2], 10) - 1;
                                const d  = parseInt(m[3], 10);
                                const candidate = new Date(y, mo, d);
                                if (!isNaN(candidate.getTime())) dialog.draftDate = candidate;
                            }
                        }
                    }
                }

                // Time field: HH:MM (24h)
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: Theme.s1
                    Text {
                        text: "Time (HH:MM, 24h)"
                        color: Theme.textSecondary
                        font.pixelSize: Theme.fontSmall
                    }
                    ThemedTextField {
                        id: timeInput
                        Layout.fillWidth: true
                        text: {
                            const hh = String(dialog.draftHour).padStart(2, "0");
                            const mm = String(dialog.draftMinute).padStart(2, "0");
                            return hh + ":" + mm;
                        }
                        placeholderText: "08:30"
                        inputMask: "99:99;_"
                        onTextChanged: {
                            const m = text.match(/^(\d{2}):(\d{2})$/);
                            if (m) {
                                const hh = parseInt(m[1], 10);
                                const mm = parseInt(m[2], 10);
                                if (hh >= 0 && hh <= 23) dialog.draftHour   = hh;
                                if (mm >= 0 && mm <= 59) dialog.draftMinute = mm;
                            }
                        }
                    }
                }

                SecondaryButton {
                    text: "Now"
                    Layout.preferredWidth: 80
                    Layout.alignment: Qt.AlignBottom
                    onClicked: {
                        const now = new Date();
                        dialog.draftDate   = now;
                        dialog.draftHour   = now.getHours();
                        dialog.draftMinute = now.getMinutes();
                    }
                }
            }
        }

        Text {
            id: editError
            visible: text.length > 0
            text: ""
            color: Theme.danger
            font.pixelSize: Theme.fontSmall
            wrapMode: Text.Wrap
            Layout.fillWidth: true
        }

        // ---- Action buttons ----
        RowLayout {
            Layout.fillWidth: true
            spacing: Theme.s2

            // Delete is destructive - styled as a danger-tinted text button
            // so it doesn't get clicked by accident.
            Button {
                Layout.preferredWidth: 100
                text: "Delete"
                onClicked: {
                    if (!dialog.setData || !dialog.setData.id) {
                        editError.text = "Cannot identify this set.";
                        return;
                    }
                    WorkoutTracker.deleteSet(dialog.setData.id);
                    dialog.close();
                }
                contentItem: Text {
                    text: parent.text
                    color: Theme.danger
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                    font.pixelSize: Theme.fontBody
                    font.bold: true
                }
                background: Rectangle {
                    radius: Theme.radiusMd
                    color: parent.hovered
                           ? Qt.rgba(0.97, 0.44, 0.44, 0.10)
                           : "transparent"
                    border.color: Theme.danger
                    border.width: 1
                }
            }

            Item { Layout.fillWidth: true }

            SecondaryButton {
                text: "Cancel"
                Layout.preferredWidth: 100
                onClicked: dialog.close()
            }

            PrimaryButton {
                text: "Save"
                Layout.preferredWidth: 110
                onClicked: {
                    if (!dialog.setData || !dialog.setData.id) {
                        editError.text = "Cannot identify this set.";
                        return;
                    }
                    const name = (dialog.draftExercise || "").trim();
                    if (!name) { editError.text = "Enter an exercise name."; return; }
                    const reps = parseInt(dialog.draftReps, 10);
                    if (!(reps > 0)) { editError.text = "Reps must be 1 or more."; return; }

                    const wDisplay = parseFloat(dialog.draftWeightDisplay);
                    const weightKg = isNaN(wDisplay) ? 0 : UnitPreference.toKg(wDisplay);
                    const rirParsed = parseInt(dialog.draftRir, 10);
                    const rir = isNaN(rirParsed) ? -1 : rirParsed;

                    const ts = new Date(
                        dialog.draftDate.getFullYear(),
                        dialog.draftDate.getMonth(),
                        dialog.draftDate.getDate(),
                        dialog.draftHour,
                        dialog.draftMinute,
                        0, 0
                    );

                    const ok = WorkoutTracker.editSet(
                        dialog.setData.id, name, weightKg, reps, rir, ts
                    );
                    if (!ok) {
                        editError.text = "Could not save changes.";
                        return;
                    }
                    dialog.close();
                }
            }
        }
    }

    // Bubble up "open the library picker" without depending on a sibling id.
    // SetTrackerPage hooks this signal and shows ExercisePickerDialog with
    // the supplied callback.
    signal requestLibraryPick(var callback)
}
