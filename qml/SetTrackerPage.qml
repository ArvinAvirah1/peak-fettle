// ---------------------------------------------------------------------------
// SetTrackerPage.qml - the core "log a set" workflow.
//
// Structure (post TICKET-003/004 revision, 2026-05-02):
//
//   1. Header   — logo + "Graph ↗" + gear icon
//   2. Today banner — date, set count, exercises trained today
//   3. START TODAY'S WORKOUT button (TICKET-004) — large primary CTA when
//      the user has not yet logged any sets today; changes to
//      "Continue Today's Workout" once the first set is in. Scrolls the
//      input card into view so the action path is obvious.
//   4. My Routines strip (TICKET-003) — shows ONLY the user's custom saved
//      routines (separate from templates). Includes a delete button per
//      row so users can manage their library without hunting.
//   5. Templates strip — pre-seeded PPL/Upper-Lower starters, visually
//      distinct (starred) so users know these are "built-in."
//   6. Log a set card — exercise picker (with searchable library), weight,
//      reps, optional RIR (TICKET-002), date/time.
//   7. Recent sets list — today's sets highlighted; tap to edit; PR badge
//      (TICKET-008) on the set that sets a new personal record.
//
// Beta testers Linda + Tyler couldn't find "Start Workout" (TICKET-004).
// Beta testers Alex, Sam, Jordan, Maya couldn't find the saved routines
// after saving (TICKET-003). Both are fixed in this revision.
//
// RPE was replaced with RIR on 2026-04-30 — see CTO guardrail #7.
// ---------------------------------------------------------------------------

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import PeakFettle 1.0
import "components"

Page {
    id: page
    background: Rectangle { color: Theme.black }

    // Reactively re-pull the recent-sets list whenever WorkoutTracker emits
    // dataChanged. We bind via a property so QML re-evaluates on signal.
    property var recent: []
    property string todayKey: ""
    property var routineRows: []

    // TICKET-003: split routineRows into user-saved vs. built-in templates so
    // the two sections can be rendered separately with distinct controls.
    property var userRoutines:  []   // isTemplate == false
    property var templateRows:  []   // isTemplate == true

    // ---- Split filter ----
    // "" means "all splits / no filter".
    // Valid values mirror the routine name patterns seeded in WorkoutTracker:
    //   "ppl"   — Push Day / Pull Day / Leg Day templates
    //   "ul"    — Upper A/B / Lower A/B templates
    //   "other" — user-created custom split (name from UserProfile)
    // The filter is applied client-side (recent[] already holds all sets).
    property string splitFilter: ""

    // Returns the display label for a split token.
    function splitLabel(token) {
        if (token === "ppl")   return "Push / Pull / Legs";
        if (token === "ul")    return "Upper / Lower";
        if (token === "other") {
            const custom = UserProfile.customSplitName;
            return custom.length > 0 ? custom : "Other";
        }
        return "All splits";
    }

    // Returns the routine names that belong to a given split token.
    // Used to determine which sets to show when filtering.
    function routineNamesForSplit(token) {
        if (token === "ppl")
            return ["Push Day (PPL)", "Pull Day (PPL)", "Leg Day (PPL)"];
        if (token === "ul")
            return ["Upper A (Upper/Lower)", "Lower A (Upper/Lower)",
                    "Upper B (Upper/Lower)", "Lower B (Upper/Lower)"];
        return [];   // "other" / custom: no template match; filter by custom name
    }

    // Filter recent[] by the active split. For template splits we check whether
    // today's exercises match any template routine. For "other" we check the
    // custom split name against saved routines. For "" we return everything.
    //
    // Implementation note: sets don't carry a routine tag — the link is through
    // exercise names. We build an allowed-exercise set from matching templates
    // and show only sets whose exercise is in that set.
    function filteredRecent() {
        if (splitFilter === "") return recent;

        // Build the set of allowed exercise names from matching template routines.
        const matchedRoutines = routineNamesForSplit(splitFilter);
        if (matchedRoutines.length > 0) {
            const allowed = {};
            for (let ri = 0; ri < routineRows.length; ++ri) {
                const r = routineRows[ri];
                if (matchedRoutines.indexOf(r.name) >= 0) {
                    for (let ei = 0; ei < r.exercises.length; ++ei)
                        allowed[r.exercises[ei]] = true;
                }
            }
            const out = [];
            for (let si = 0; si < recent.length; ++si) {
                if (allowed[recent[si].exercise]) out.push(recent[si]);
            }
            return out;
        }

        // "other": match against the user-saved (non-template) routines whose
        // name contains the custom split label (case-insensitive), or fall
        // through to showing all non-template exercises.
        if (splitFilter === "other") {
            const customName = (UserProfile.customSplitName || "").toLowerCase().trim();
            const allowed2 = {};
            for (let ri2 = 0; ri2 < userRoutines.length; ++ri2) {
                const r2 = userRoutines[ri2];
                const matches = customName.length === 0
                    || r2.name.toLowerCase().indexOf(customName) >= 0;
                if (matches) {
                    for (let ei2 = 0; ei2 < r2.exercises.length; ++ei2)
                        allowed2[r2.exercises[ei2]] = true;
                }
            }
            // If no custom routines match, show all sets (graceful degradation).
            if (Object.keys(allowed2).length === 0) return recent;
            const out2 = [];
            for (let si2 = 0; si2 < recent.length; ++si2) {
                if (allowed2[recent[si2].exercise]) out2.push(recent[si2]);
            }
            return out2;
        }

        return recent;
    }

    // Two-digit pad helper used by the date/time preview + text fields.
    function formatTwoDigit(n) { return (n < 10 ? "0" : "") + n; }

    function refresh() {
        recent = WorkoutTracker.recentSets(50);
        // Local YYYY-MM-DD - matches the dayKey format generated in C++.
        todayKey = Qt.formatDate(new Date(), "yyyy-MM-dd");
        routineRows = WorkoutTracker.routineList();

        // Split into user-saved and built-in for the two dedicated strips.
        const ur = [];
        const tr = [];
        for (let i = 0; i < routineRows.length; ++i) {
            if (routineRows[i].isTemplate) tr.push(routineRows[i]);
            else                           ur.push(routineRows[i]);
        }
        userRoutines = ur;
        templateRows = tr;
    }
    Component.onCompleted: refresh()
    Connections {
        target: WorkoutTracker
        function onDataChanged() { page.refresh(); }
    }

    // Today's sets (filtered from `recent` so we don't fetch twice).
    function todaySets() {
        const out = [];
        for (let i = 0; i < page.recent.length; ++i) {
            if (page.recent[i].dayKey === page.todayKey) out.push(page.recent[i]);
        }
        return out;
    }

    // Distinct exercises trained today, in order they were first logged.
    function todayExercises() {
        const seen = {};
        const out = [];
        const t = todaySets();
        for (let i = t.length - 1; i >= 0; --i) {     // recent[] is newest-first
            const ex = t[i].exercise;
            if (!seen[ex]) { seen[ex] = true; out.push(ex); }
        }
        return out;
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

            // Home button — returns to the dashboard without losing set data.
            ToolButton {
                text: "⌂"
                font.pixelSize: 20
                onClicked: window.goTo("back")
                contentItem: Text {
                    text: parent.text
                    color: Theme.textSecondary
                    font: parent.font
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                }
                background: Rectangle {
                    color: parent.hovered ? Qt.rgba(1, 1, 1, 0.06) : "transparent"
                    radius: Theme.radiusSm
                }
            }

            ColumnLayout {
                Layout.fillWidth: true
                spacing: 0
                Text {
                    text: "Set Tracker"
                    color: Theme.textPrimary
                    font.pixelSize: Theme.fontH2
                    font.bold: true
                }
                Text {
                    text: WorkoutTracker.totalSets + " sets logged"
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

            // Avatar button — replaces the ⚙ gear icon (2026-05-04).
            // Taps navigate to SettingsPage. Red dot if profile is incomplete.
            AvatarButton {
                size: 36
                Layout.alignment: Qt.AlignVCenter
            }
        }
    }

    // ----- Working "set date" state -----
    // Defaults to now; the date row in the log card writes to these. We
    // keep year/month/day separate from hour/minute because the SpinBox
    // representation is field-by-field.
    // TICKET-010: tracks which mode the input card is in.
    // "lift" shows weight/reps/RIR; "cardio" shows duration/distance.
    property string logMode: "lift"

    property date logDate: new Date()
    property int  logHour: (new Date()).getHours()
    property int  logMinute: (new Date()).getMinutes()
    property bool logUseNow: true   // when true, the form ignores draft
                                    // date and stamps with `now` on log

    function resetLogDateToNow() {
        const now = new Date();
        page.logDate = now;
        page.logHour = now.getHours();
        page.logMinute = now.getMinutes();
        page.logUseNow = true;
    }

    // ----- Body -----
    // Wrapped in a Flickable so the new template strip + date row don't
    // push content off-screen on phone-narrow heights. ColumnLayout sits
    // inside an Item with explicit width so the layout system isn't asked
    // to fight the Flickable's contentItem anchors.
    Flickable {
        id: bodyFlick
        anchors.fill: parent
        contentWidth: width
        contentHeight: bodyCol.implicitHeight + Theme.s4 * 2
        clip: true

        ColumnLayout {
            id: bodyCol
            x: Theme.s4
            y: Theme.s4
            width: bodyFlick.width - Theme.s4 * 2
            spacing: Theme.s4

            // ---- Today banner ----
            // Each calendar day is a discrete workout. Showing today's date
            // up front turns "log a set" into "log a set for today's workout"
            // - which makes the per-day aggregation in the graph make intuitive
            // sense, and matches how serious lifters think about their splits.
            Rectangle {
                Layout.fillWidth: true
                color: Theme.navyMid
                radius: Theme.radiusLg
                border.width: 1
                border.color: Theme.turquoise
                implicitHeight: todayCol.implicitHeight + Theme.s4 * 2

                ColumnLayout {
                    id: todayCol
                    anchors.fill: parent
                    anchors.margins: Theme.s4
                    spacing: Theme.s1
                    Text {
                        text: "Today - " + Qt.formatDate(new Date(), "ddd, MMM d")
                        color: Theme.textPrimary
                        font.pixelSize: Theme.fontH2
                        font.bold: true
                    }
                    Text {
                        text: page.todaySets().length + " set"
                              + (page.todaySets().length === 1 ? "" : "s")
                              + " logged today"
                              + (page.todayExercises().length > 0
                                    ? " - " + page.todayExercises().join(", ")
                                    : "")
                        color: Theme.textSecondary
                        font.pixelSize: Theme.fontSmall
                        elide: Text.ElideRight
                        Layout.fillWidth: true
                    }
                }
            }

            // ---- TICKET-004: Start / Continue Today's Workout CTA ----
            // Beta Round 1: 3/6 testers had material friction finding how
            // to begin a session. Linda and Tyler both opened the app and
            // spent time reading the input card before understanding they
            // should just tap and type. A single large-target CTA removes
            // that ambiguity: one tap lands them in the exercise field.
            //
            // When sets have already been logged today the label flips to
            // "Continue" so returning mid-session also has a clear entry
            // point. The CTA is hidden after 10+ sets (user clearly knows
            // the flow by then and the card space is better used elsewhere).
            Rectangle {
                Layout.fillWidth: true
                visible: page.todaySets().length < 10
                color: page.todaySets().length === 0
                       ? Theme.turquoise
                       : Qt.rgba(0.176, 0.831, 0.749, 0.15)
                radius: Theme.radiusLg
                border.width: page.todaySets().length === 0 ? 0 : 1
                border.color: Theme.turquoise
                implicitHeight: startCtaRow.implicitHeight + Theme.s4 * 2

                RowLayout {
                    id: startCtaRow
                    anchors.fill: parent
                    anchors.margins: Theme.s4
                    spacing: Theme.s3

                    // Icon changes based on session state.
                    Text {
                        text: page.todaySets().length === 0 ? "▶" : "◉"
                        color: page.todaySets().length === 0
                               ? Theme.textOnAccent : Theme.turquoise
                        font.pixelSize: 20
                        font.bold: true
                    }

                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 2
                        Text {
                            text: page.todaySets().length === 0
                                  ? "Start Today's Workout"
                                  : "Continue Today's Workout"
                            color: page.todaySets().length === 0
                                   ? Theme.textOnAccent : Theme.textPrimary
                            font.pixelSize: Theme.fontH2
                            font.bold: true
                        }
                        Text {
                            visible: page.todaySets().length === 0
                            text: "Pick an exercise and log your first set"
                            color: Qt.rgba(0, 0, 0, 0.65)
                            font.pixelSize: Theme.fontSmall
                        }
                        Text {
                            visible: page.todaySets().length > 0
                            text: page.todaySets().length + " set"
                                  + (page.todaySets().length === 1 ? "" : "s")
                                  + " · " + page.todayExercises().length
                                  + " exercise" + (page.todayExercises().length === 1 ? "" : "s")
                            color: Theme.turquoise
                            font.pixelSize: Theme.fontSmall
                        }
                    }

                    Text {
                        text: "→"
                        color: page.todaySets().length === 0
                               ? Theme.textOnAccent : Theme.turquoise
                        font.pixelSize: 22
                        font.bold: true
                    }
                }

                MouseArea {
                    anchors.fill: parent
                    cursorShape: Qt.PointingHandCursor
                    onClicked: {
                        // Scroll down to the log card and focus the exercise
                        // picker so the user can start typing immediately.
                        bodyFlick.contentY = inputCardY.y - Theme.s4;
                        exerciseField.forceActiveFocus();
                    }
                }
            }

            // Invisible anchor used by the CTA to scroll to the input card.
            Item { id: inputCardY; height: 0; Layout.fillWidth: true }

            // ---- Input card ----
            Rectangle {
                Layout.fillWidth: true
                color: Theme.navyDeep
                radius: Theme.radiusLg
                border.width: 1
                border.color: Theme.navyLine
                implicitHeight: inputCol.implicitHeight + Theme.s5 * 2

                ColumnLayout {
                    id: inputCol
                    anchors.fill: parent
                    anchors.margins: Theme.s5
                    spacing: Theme.s3

                    // ---- Log card header: title + Lift/Cardio mode toggle ----
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: Theme.s3

                        Text {
                            text: "Log a set"
                            color: Theme.textPrimary
                            font.pixelSize: Theme.fontH2
                            font.bold: true
                            Layout.fillWidth: true
                        }

                        // TICKET-010: segmented Lift | Cardio toggle.
                        // Looks like a pill with two tappable halves.
                        Row {
                            spacing: 0
                            Repeater {
                                model: [
                                    { label: "Lift",   mode: "lift"   },
                                    { label: "Cardio", mode: "cardio" }
                                ]
                                Rectangle {
                                    property bool active: page.logMode === modelData.mode
                                    width: 64; height: 30
                                    color: active ? Theme.turquoise : Qt.rgba(1,1,1,0.06)
                                    // Left half pill-ends on "Lift", right half on "Cardio".
                                    radius: Theme.radiusSm
                                    border.width: active ? 0 : 1
                                    border.color: Theme.navyLine
                                    Text {
                                        anchors.centerIn: parent
                                        text: modelData.label
                                        color: active ? Theme.textOnAccent : Theme.textSecondary
                                        font.pixelSize: Theme.fontSmall
                                        font.bold: active
                                    }
                                    MouseArea {
                                        anchors.fill: parent
                                        cursorShape: Qt.PointingHandCursor
                                        onClicked: page.logMode = modelData.mode
                                    }
                                }
                            }
                        }
                    }

                    // Exercise picker w/ free-form entry. Combined with a
                    // "Library" button that opens the full bundled list.
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: Theme.s1
                        Text { text: "Exercise"; color: Theme.textSecondary; font.pixelSize: Theme.fontSmall }
                        RowLayout {
                            Layout.fillWidth: true
                            spacing: Theme.s2
                            ComboBox {
                                id: exerciseField
                                Layout.fillWidth: true
                                editable: true
                                model: WorkoutTracker.exerciseNames
                                Component.onCompleted: editText = ""
                                background: Rectangle {
                                    radius: Theme.radiusMd
                                    color: Theme.black
                                    border.width: 1
                                    border.color: exerciseField.activeFocus
                                                  ? Theme.turquoise : Theme.navyLine
                                }
                                contentItem: TextField {
                                    text: exerciseField.editText
                                    onTextChanged: exerciseField.editText = text
                                    placeholderText: "e.g. Bench Press"
                                    color: Theme.textPrimary
                                    placeholderTextColor: Theme.textSecondary
                                    background: null
                                    verticalAlignment: TextInput.AlignVCenter
                                    leftPadding: Theme.s4
                                }
                            }
                            SecondaryButton {
                                text: "Browse"
                                // 110 is enough to keep the word un-elided
                                // even on the narrowest phone width.
                                Layout.preferredWidth: 110
                                onClicked: pickerDialog.pickWith(function(name) {
                                    exerciseField.editText = name;
                                });
                            }
                        }
                    }

                    // ---- Weight + Reps + RIR row (lift mode only) ----
                    GridLayout {
                        Layout.fillWidth: true
                        visible: page.logMode === "lift"
                        Layout.preferredHeight: visible ? implicitHeight : 0
                        columns: window.isPhone ? 1 : 3
                        rowSpacing: Theme.s3
                        columnSpacing: Theme.s3

                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: Theme.s1
                            // Bound to the inputLabel Q_PROPERTY so the
                            // label refreshes on unit toggle (TICKET-002).
                            Text {
                                text: UnitPreference.inputLabel
                                color: Theme.textSecondary
                                font.pixelSize: Theme.fontSmall
                            }
                            ThemedTextField {
                                id: weightField
                                Layout.fillWidth: true
                                placeholderText: UnitPreference.placeholderExample
                                inputMethodHints: Qt.ImhFormattedNumbersOnly
                                validator: DoubleValidator { bottom: 0; decimals: 2 }
                                text: ""
                            }
                        }
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: Theme.s1
                            Text { text: "Reps"; color: Theme.textSecondary; font.pixelSize: Theme.fontSmall }
                            ThemedTextField {
                                id: repsField
                                Layout.fillWidth: true
                                placeholderText: "e.g. 5"
                                inputMethodHints: Qt.ImhDigitsOnly
                                validator: IntValidator { bottom: 1; top: 9999 }
                                text: ""
                            }
                        }
                        // RIR column - shown only when EffortPreference.mode == "rir"
                        // (TICKET-002). Beta tester Linda described the field
                        // as making her feel she was "doing the app wrong" by
                        // skipping it; the toggle in Settings -> Effort tracking
                        // lets users hide the field entirely. The data column
                        // (rir == -1 == not recorded) is unchanged - this is a
                        // pure render-time concern. RIR replaces RPE for new
                        // sets per CTO guardrail #7.
                        ColumnLayout {
                            id: rirCol
                            Layout.fillWidth: true
                            spacing: Theme.s1
                            visible: EffortPreference.showRir
                            // Reflow the GridLayout when the column is hidden
                            // so we don't leave an empty cell on phone widths.
                            Layout.preferredHeight: visible ? implicitHeight : 0
                            Text {
                                text: "RIR (optional)"
                                color: Theme.textSecondary
                                font.pixelSize: Theme.fontSmall
                            }
                            ThemedTextField {
                                id: rirField
                                Layout.fillWidth: true
                                placeholderText: "reps left in tank, 0-5"
                                inputMethodHints: Qt.ImhDigitsOnly
                                validator: IntValidator { bottom: 0; top: 10 }
                                text: ""
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

                    // ---- TICKET-010: Cardio duration + distance fields ----
                    // Visible only when the user has toggled to Cardio mode.
                    // Duration is required (minutes + seconds); distance is
                    // optional (activities like HIIT or rowing by time often
                    // have no meaningful distance figure).
                    GridLayout {
                        id: cardioFieldsGrid
                        Layout.fillWidth: true
                        visible: page.logMode === "cardio"
                        Layout.preferredHeight: visible ? implicitHeight : 0
                        columns: window.isPhone ? 1 : 2
                        rowSpacing: Theme.s3
                        columnSpacing: Theme.s3

                        // Duration: MM : SS pair
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: Theme.s1
                            Text {
                                text: "Duration (required)"
                                color: Theme.textSecondary
                                font.pixelSize: Theme.fontSmall
                            }
                            RowLayout {
                                Layout.fillWidth: true
                                spacing: Theme.s2

                                ThemedTextField {
                                    id: cardioMinutes
                                    Layout.fillWidth: true
                                    placeholderText: "mm"
                                    inputMethodHints: Qt.ImhDigitsOnly
                                    validator: IntValidator { bottom: 0; top: 999 }
                                    text: ""
                                }
                                Text {
                                    text: ":"
                                    color: Theme.textSecondary
                                    font.pixelSize: Theme.fontH2
                                    font.bold: true
                                }
                                ThemedTextField {
                                    id: cardioSeconds
                                    Layout.preferredWidth: 60
                                    placeholderText: "ss"
                                    inputMethodHints: Qt.ImhDigitsOnly
                                    validator: IntValidator { bottom: 0; top: 59 }
                                    text: ""
                                }
                            }
                        }

                        // Distance: optional, in km
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: Theme.s1
                            Text {
                                text: "Distance km (optional)"
                                color: Theme.textSecondary
                                font.pixelSize: Theme.fontSmall
                            }
                            ThemedTextField {
                                id: cardioDistance
                                Layout.fillWidth: true
                                placeholderText: "e.g. 5.0"
                                inputMethodHints: Qt.ImhFormattedNumbersOnly
                                validator: DoubleValidator { bottom: 0; decimals: 3 }
                                text: ""
                            }
                        }
                    }

                    // ---- Set date / time row ----
                    //
                    // Design (rev. 2, 2026-05-01): the original SpinBox grid
                    // collapsed on phone widths so badly that the values
                    // disappeared between the - / + buttons (see screenshot
                    // feedback). Replaced with:
                    //   * a big readable preview line at the top,
                    //   * a single "Backdate" toggle,
                    //   * preset chips for the common cases (Today / Yesterday
                    //     / -2 / -7 days), and
                    //   * two clearly-labelled text fields (YYYY-MM-DD and
                    //     HH:MM) for arbitrary dates.
                    // This matches how iOS / Android health apps tend to
                    // surface backdating without pulling in a heavy native
                    // calendar dependency.
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: Theme.s2

                        RowLayout {
                            Layout.fillWidth: true
                            spacing: Theme.s2
                            Text {
                                text: "Set time"
                                color: Theme.textSecondary
                                font.pixelSize: Theme.fontSmall
                                Layout.alignment: Qt.AlignVCenter
                            }
                            Item { Layout.fillWidth: true }
                            CheckBox {
                                id: backdateToggle
                                checked: !page.logUseNow
                                onToggled: {
                                    page.logUseNow = !checked;
                                    if (page.logUseNow) {
                                        page.resetLogDateToNow();
                                    } else {
                                        // Sync the input fields to the
                                        // current draft on first reveal.
                                        dateInput.text = Qt.formatDate(page.logDate, "yyyy-MM-dd");
                                        timeInput.text = page.formatTwoDigit(page.logHour) + ":"
                                                       + page.formatTwoDigit(page.logMinute);
                                    }
                                }
                                contentItem: Text {
                                    text: "Backdate this set"
                                    color: Theme.textPrimary
                                    leftPadding: backdateToggle.indicator.width + Theme.s2
                                    verticalAlignment: Text.AlignVCenter
                                    font.pixelSize: Theme.fontSmall
                                }
                            }
                        }

                        // Big readable preview - works in both modes.
                        Rectangle {
                            Layout.fillWidth: true
                            color: Qt.rgba(0.176, 0.831, 0.749, 0.08)
                            border.color: Qt.rgba(0.176, 0.831, 0.749, 0.30)
                            border.width: 1
                            radius: Theme.radiusMd
                            implicitHeight: previewCol.implicitHeight + Theme.s3 * 2

                            ColumnLayout {
                                id: previewCol
                                anchors.fill: parent
                                anchors.margins: Theme.s3
                                spacing: 2

                                Text {
                                    text: page.logUseNow
                                          ? Qt.formatDateTime(new Date(), "dddd, MMMM d")
                                          : Qt.formatDate(page.logDate, "dddd, MMMM d")
                                    color: Theme.textPrimary
                                    font.pixelSize: Theme.fontH2
                                    font.bold: true
                                }
                                Text {
                                    text: page.logUseNow
                                          ? "Right now · " + Qt.formatDateTime(new Date(), "h:mm AP")
                                          : "Backdated · " + page.formatTwoDigit(page.logHour) + ":"
                                            + page.formatTwoDigit(page.logMinute)
                                    color: Theme.turquoise
                                    font.pixelSize: Theme.fontSmall
                                }
                            }
                        }

                        // Preset chips (only visible in backdate mode).
                        Flow {
                            visible: !page.logUseNow
                            Layout.fillWidth: true
                            spacing: Theme.s2

                            Repeater {
                                model: [
                                    { label: "Today",     daysAgo: 0  },
                                    { label: "Yesterday", daysAgo: 1  },
                                    { label: "2 days ago",daysAgo: 2  },
                                    { label: "3 days ago",daysAgo: 3  },
                                    { label: "1 week ago",daysAgo: 7  },
                                    { label: "2 weeks ago",daysAgo: 14}
                                ]
                                delegate: Rectangle {
                                    radius: Theme.radiusSm
                                    color: presetMouse.containsMouse
                                           ? Qt.rgba(0.176, 0.831, 0.749, 0.18)
                                           : Theme.navyMid
                                    border.color: Theme.navyLine
                                    border.width: 1
                                    implicitWidth: presetText.implicitWidth + Theme.s4 * 2
                                    implicitHeight: 32
                                    Text {
                                        id: presetText
                                        anchors.centerIn: parent
                                        text: modelData.label
                                        color: Theme.textPrimary
                                        font.pixelSize: Theme.fontSmall
                                        font.bold: true
                                    }
                                    MouseArea {
                                        id: presetMouse
                                        anchors.fill: parent
                                        hoverEnabled: true
                                        cursorShape: Qt.PointingHandCursor
                                        onClicked: {
                                            const d = new Date();
                                            d.setDate(d.getDate() - modelData.daysAgo);
                                            // Preserve current hour/minute if user already set one.
                                            page.logDate = d;
                                            dateInput.text = Qt.formatDate(d, "yyyy-MM-dd");
                                        }
                                    }
                                }
                            }
                        }

                        // Two side-by-side text fields with clear labels.
                        // Using TextField rather than SpinBox because the
                        // value is always visible at any width (the previous
                        // SpinBox UI eat the value between - and + on phones).
                        GridLayout {
                            visible: !page.logUseNow
                            Layout.fillWidth: true
                            columns: window.isPhone ? 1 : 2
                            rowSpacing: Theme.s2
                            columnSpacing: Theme.s3

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
                                    text: Qt.formatDate(page.logDate, "yyyy-MM-dd")
                                    placeholderText: "2026-04-30"
                                    inputMask: "9999-99-99;_"
                                    onTextChanged: {
                                        const m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                                        if (m) {
                                            const y  = parseInt(m[1], 10);
                                            const mo = parseInt(m[2], 10) - 1;
                                            const d  = parseInt(m[3], 10);
                                            const candidate = new Date(y, mo, d);
                                            if (!isNaN(candidate.getTime())) page.logDate = candidate;
                                        }
                                    }
                                }
                            }

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
                                    text: page.formatTwoDigit(page.logHour) + ":"
                                          + page.formatTwoDigit(page.logMinute)
                                    placeholderText: "18:30"
                                    inputMask: "99:99;_"
                                    onTextChanged: {
                                        const m = text.match(/^(\d{2}):(\d{2})$/);
                                        if (m) {
                                            const hh = parseInt(m[1], 10);
                                            const mm = parseInt(m[2], 10);
                                            if (hh >= 0 && hh <= 23) page.logHour = hh;
                                            if (mm >= 0 && mm <= 59) page.logMinute = mm;
                                        }
                                    }
                                }
                            }
                        }
                    }

                    Text {
                        id: inputError
                        visible: text.length > 0
                        text: ""
                        color: Theme.danger
                        font.pixelSize: Theme.fontSmall
                    }

                    // Button row — two-row layout so "Log set" always gets
                    // full width and is never squished by the secondary actions.
                    // Previously all three were in one RowLayout; on the 420px
                    // default window the fixed-width secondaries left only ~46px
                    // for Log set (visible as a squashed teal square).
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: Theme.s2

                        PrimaryButton {
                            Layout.fillWidth: true
                            text: "Log set"
                            onClicked: {
                                const name = (exerciseField.editText || "").trim();
                                if (!name) { inputError.text = "Enter an exercise name."; return; }

                                // Build the timestamp (shared across lift + cardio).
                                const ts = page.logUseNow
                                    ? new Date()
                                    : new Date(
                                        page.logDate.getFullYear(),
                                        page.logDate.getMonth(),
                                        page.logDate.getDate(),
                                        page.logHour,
                                        page.logMinute,
                                        0, 0
                                    );

                                if (page.logMode === "cardio") {
                                    // ---- Cardio path ----
                                    const mins = parseInt(cardioMinutes.text, 10);
                                    const secs = parseInt(cardioSeconds.text, 10);
                                    const durationSec = (isNaN(mins) ? 0 : mins) * 60
                                                       + (isNaN(secs) ? 0 : secs);
                                    if (durationSec <= 0) {
                                        inputError.text = "Enter a duration (minutes and/or seconds).";
                                        return;
                                    }
                                    const distKm = parseFloat(cardioDistance.text);
                                    // Store as metres internally; -1 if blank (not recorded).
                                    const distanceM = isNaN(distKm) || distKm <= 0 ? -1.0 : distKm * 1000.0;

                                    WorkoutTracker.logCardioSetAt(name, durationSec, distanceM, -1.0, ts);
                                    inputError.text = "";
                                    // Clear cardio fields; keep exercise name.
                                    cardioMinutes.text = ""; cardioSeconds.text = "";
                                    cardioDistance.text = "";
                                    // N-14: after backdating, reset to "now" mode so the user
                                    // doesn't silently log another set on the same past date.
                                    if (!page.logUseNow) {
                                        const backdatedLabel = Qt.formatDate(page.logDate, "MMMM d");
                                        inputError.text = "✓ Backdated to " + backdatedLabel + " — form reset to now.";
                                        page.logUseNow = true;
                                        page.resetLogDateToNow();
                                    }
                                    cardioMinutes.forceActiveFocus();

                                } else {
                                    // ---- Lift path ----
                                    const reps = parseInt(repsField.text, 10);
                                    const w    = parseFloat(weightField.text);
                                    if (!(reps > 0)) { inputError.text = "Reps must be 1 or more."; return; }
                                    // Convert display-unit value → kg before handing to the model.
                                    const displayWeight = isNaN(w) ? 0 : w;
                                    const weightKg = UnitPreference.toKg(displayWeight);
                                    // RIR: blank -> -1 (not recorded). 0 is a valid RIR (failure set).
                                    const rirParsed = parseInt(rirField.text, 10);
                                    const rir = isNaN(rirParsed) ? -1 : rirParsed;

                                    if (page.logUseNow) {
                                        WorkoutTracker.logSet(name, weightKg, reps, rir);
                                        inputError.text = "";
                                    } else {
                                        WorkoutTracker.logSetAt(name, weightKg, reps, rir, ts);
                                        // N-14: after backdating, reset to "now" mode so the user
                                        // doesn't silently log another set on the same past date.
                                        const backdatedLabel = Qt.formatDate(page.logDate, "MMMM d");
                                        inputError.text = "✓ Backdated to " + backdatedLabel + " — form reset to now.";
                                        page.logUseNow = true;
                                        page.resetLogDateToNow();
                                    }
                                    // Keep exercise name (fast multi-set entry); clear numbers.
                                    weightField.text = ""; repsField.text = ""; rirField.text = "";
                                    repsField.forceActiveFocus();
                                }
                            }
                        }

                        // Secondary actions on a separate row — each gets half
                        // the available width so neither is ever truncated.
                        RowLayout {
                            Layout.fillWidth: true
                            spacing: Theme.s3
                            SecondaryButton {
                                text: "Save as routine"
                                Layout.fillWidth: true
                                enabled: page.todayExercises().length > 0
                                onClicked: routineDialog.open()
                            }
                            SecondaryButton {
                                text: "Clear all"
                                Layout.fillWidth: true
                                enabled: WorkoutTracker.totalSets > 0
                                onClicked: WorkoutTracker.clearAll()
                            }
                        }
                    }
                }
            }

            // ---- TICKET-003: My Routines strip ----
            // Beta Round 1: 4/6 testers couldn't find their saved routines
            // after saving them. The previous single "Templates and routines"
            // strip mixed user-saved routines in among the built-in templates
            // with no visual distinction and no way to delete. Now:
            //   * User routines appear in their own prominently-labelled card
            //     with a trash icon per row.
            //   * Built-in templates have their own card below.
            //   * The "My Routines" card shows an inviting empty state
            //     when no routines have been saved yet (guides users toward
            //     the "Save as routine" button on the log card).
            Rectangle {
                Layout.fillWidth: true
                color: Theme.navyDeep
                radius: Theme.radiusLg
                border.width: 1
                border.color: Theme.navyLine
                implicitHeight: myRoutineCol.implicitHeight + Theme.s4 * 2

                ColumnLayout {
                    id: myRoutineCol
                    anchors.fill: parent
                    anchors.margins: Theme.s4
                    spacing: Theme.s2

                    RowLayout {
                        Layout.fillWidth: true
                        Text {
                            Layout.fillWidth: true
                            text: "My Routines"
                            color: Theme.textPrimary
                            font.pixelSize: Theme.fontH2
                            font.bold: true
                        }
                        // Count badge (only when routines exist)
                        Rectangle {
                            visible: page.userRoutines.length > 0
                            color: Qt.rgba(0.176, 0.831, 0.749, 0.18)
                            radius: 10
                            implicitWidth: badgeCount.implicitWidth + 12
                            implicitHeight: 22
                            Text {
                                id: badgeCount
                                anchors.centerIn: parent
                                text: page.userRoutines.length
                                color: Theme.turquoise
                                font.pixelSize: Theme.fontSmall
                                font.bold: true
                            }
                        }
                    }

                    // Empty state — shown before the first routine is saved.
                    ColumnLayout {
                        visible: page.userRoutines.length === 0
                        Layout.fillWidth: true
                        spacing: Theme.s1
                        Text {
                            Layout.fillWidth: true
                            wrapMode: Text.Wrap
                            text: "Your saved routines appear here."
                            color: Theme.textSecondary
                            font.pixelSize: Theme.fontSmall
                        }
                        Text {
                            Layout.fillWidth: true
                            wrapMode: Text.Wrap
                            text: "Log a workout, then tap \"Save\" as routine to keep it."
                            color: Theme.textSecondary
                            font.pixelSize: Theme.fontSmall
                            font.italic: true
                        }
                    }

                    // Routine rows (only when routines exist).
                    Repeater {
                        model: page.userRoutines
                        delegate: Rectangle {
                            Layout.fillWidth: true
                            implicitHeight: routineRowContent.implicitHeight + Theme.s2 * 2
                            color: routineRowMouse.containsMouse
                                   ? Qt.rgba(0.176, 0.831, 0.749, 0.12)
                                   : Qt.rgba(1, 1, 1, 0.03)
                            radius: Theme.radiusMd
                            border.color: Theme.navyLine
                            border.width: 1

                            RowLayout {
                                id: routineRowContent
                                anchors.fill: parent
                                anchors.leftMargin: Theme.s3
                                anchors.rightMargin: Theme.s2
                                anchors.topMargin: Theme.s2
                                anchors.bottomMargin: Theme.s2
                                spacing: Theme.s2

                                // Routine icon
                                Text {
                                    text: "☐"
                                    color: Theme.textSecondary
                                    font.pixelSize: 16
                                }

                                ColumnLayout {
                                    Layout.fillWidth: true
                                    spacing: 2
                                    Text {
                                        text: modelData.name
                                        color: Theme.textPrimary
                                        font.pixelSize: Theme.fontBody
                                        font.bold: true
                                        elide: Text.ElideRight
                                        Layout.fillWidth: true
                                    }
                                    Text {
                                        text: modelData.exercises
                                              ? modelData.exercises.slice(0, 3).join(" · ")
                                                + (modelData.exercises.length > 3
                                                   ? " + " + (modelData.exercises.length - 3) + " more"
                                                   : "")
                                              : ""
                                        color: Theme.textSecondary
                                        font.pixelSize: Theme.fontSmall
                                        elide: Text.ElideRight
                                        Layout.fillWidth: true
                                    }
                                }

                                // Delete button — trash icon
                                ToolButton {
                                    text: "🗑"
                                    font.pixelSize: 15
                                    onClicked: {
                                        deleteConfirmDialog.routineName = modelData.name;
                                        deleteConfirmDialog.open();
                                    }
                                    contentItem: Text {
                                        text: parent.text
                                        color: deleteHover.containsMouse
                                               ? Theme.danger : Theme.textSecondary
                                        font: parent.font
                                        horizontalAlignment: Text.AlignHCenter
                                        verticalAlignment: Text.AlignVCenter
                                    }
                                    background: Rectangle {
                                        color: deleteHover.containsMouse
                                               ? Qt.rgba(1, 0.2, 0.2, 0.1) : "transparent"
                                        radius: Theme.radiusSm
                                    }
                                    HoverHandler { id: deleteHover }
                                }
                            }

                            MouseArea {
                                id: routineRowMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                // Only tap outside the delete button opens the dialog.
                                onClicked: function(mouse) {
                                    if (modelData.exercises && modelData.exercises.length > 0) {
                                        exerciseField.editText = modelData.exercises[0];
                                        routineDetailDialog.routine = modelData;
                                        routineDetailDialog.open();
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // ---- Templates strip ----
            // Pre-seeded PPL + Upper/Lower templates (isTemplate == true).
            // These are read-only (no delete button) and visually starred to
            // communicate they are "built-in starters" vs. user-saved routines.
            Rectangle {
                Layout.fillWidth: true
                color: Theme.navyDeep
                radius: Theme.radiusLg
                border.width: 1
                border.color: Theme.navyLine
                implicitHeight: templateCol.implicitHeight + Theme.s4 * 2

                ColumnLayout {
                    id: templateCol
                    anchors.fill: parent
                    anchors.margins: Theme.s4
                    spacing: Theme.s2

                    RowLayout {
                        Layout.fillWidth: true
                        Text {
                            Layout.fillWidth: true
                            text: "Starter Templates"
                            color: Theme.textPrimary
                            font.pixelSize: Theme.fontH2
                            font.bold: true
                        }
                        Text {
                            text: "Built-in"
                            color: Theme.turquoise
                            font.pixelSize: Theme.fontSmall
                        }
                    }

                    Text {
                        Layout.fillWidth: true
                        wrapMode: Text.Wrap
                        text: "Tap a template to see its exercises and preload the first one."
                        color: Theme.textSecondary
                        font.pixelSize: Theme.fontSmall
                    }

                    Flow {
                        Layout.fillWidth: true
                        spacing: Theme.s2

                        Repeater {
                            model: page.templateRows
                            delegate: Rectangle {
                                radius: Theme.radiusMd
                                color: Qt.rgba(0.176, 0.831, 0.749, 0.10)
                                border.color: Theme.turquoise
                                border.width: 1
                                implicitWidth: tplPillRow.implicitWidth + Theme.s4 * 2
                                implicitHeight: tplPillRow.implicitHeight + Theme.s3 * 2

                                Row {
                                    id: tplPillRow
                                    anchors.centerIn: parent
                                    spacing: 6
                                    Text {
                                        text: "★"
                                        color: Theme.turquoise
                                        font.pixelSize: 13
                                        anchors.verticalCenter: parent.verticalCenter
                                    }
                                    Text {
                                        text: modelData.name
                                        color: Theme.textPrimary
                                        font.pixelSize: Theme.fontSmall
                                        font.bold: true
                                        anchors.verticalCenter: parent.verticalCenter
                                    }
                                }
                                MouseArea {
                                    anchors.fill: parent
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: {
                                        if (modelData.exercises && modelData.exercises.length > 0) {
                                            exerciseField.editText = modelData.exercises[0];
                                            routineDetailDialog.routine = modelData;
                                            routineDetailDialog.open();
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // ---- Recent sets list ----
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: Math.max(280, Math.min(420, list.count * 60 + 80))
                color: Theme.navyDeep
                radius: Theme.radiusLg
                border.width: 1
                border.color: Theme.navyLine

                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: Theme.s4
                    spacing: Theme.s2

                    RowLayout {
                        Layout.fillWidth: true
                        Text {
                            Layout.fillWidth: true
                            text: "Recent sets"
                            color: Theme.textPrimary
                            font.pixelSize: Theme.fontH2
                            font.bold: true
                        }
                        Text {
                            text: page.filteredRecent().length
                                  + (page.splitFilter !== "" ? " filtered" : " shown")
                                  + " · tap to edit"
                            color: Theme.textSecondary
                            font.pixelSize: Theme.fontSmall
                        }
                    }

                    // Workout session duration summary — shows for today's workout
                    // when at least 2 sets have been logged (so start ≠ end).
                    // Duration = time between FIRST and LAST set of the day.
                    // This is the only timestamp surface that users see;
                    // per-set timestamps are kept internally for ordering only.
                    Rectangle {
                        // todaySets() depends on page.recent, so this re-evaluates
                        // after every refresh() call. The setCount >= 2 guard ensures
                        // we only show the banner once there is a meaningful duration
                        // (first and last set define a non-zero interval).
                        visible: page.todaySets().length >= 2
                        Layout.fillWidth: true
                        color: Qt.rgba(0.176, 0.831, 0.749, 0.07)
                        border.color: Qt.rgba(0.176, 0.831, 0.749, 0.20)
                        border.width: 1
                        radius: Theme.radiusMd
                        implicitHeight: sessionRow.implicitHeight + Theme.s2 * 2

                        RowLayout {
                            id: sessionRow
                            anchors.fill: parent
                            anchors.margins: Theme.s2
                            spacing: Theme.s3

                            Text {
                                text: "⏱"
                                color: Theme.turquoise
                                font.pixelSize: Theme.fontBody
                            }

                            Text {
                                Layout.fillWidth: true
                                font.pixelSize: Theme.fontSmall
                                color: Theme.textSecondary
                                // page.recent dependency ensures this re-runs after refresh().
                                text: {
                                    void page.recent;   // establish binding dependency
                                    const session = WorkoutTracker.workoutSession(page.todayKey);
                                    if (!session || !session.startTime) return "";
                                    const start = Qt.formatDateTime(session.startTime, "h:mm AP");
                                    const dur   = session.durationSec || 0;
                                    const mins  = Math.floor(dur / 60);
                                    const secs  = dur % 60;
                                    const durStr = mins > 0
                                        ? mins + "m " + secs + "s"
                                        : secs + "s";
                                    return "Started " + start + "  ·  " + durStr + " elapsed";
                                }
                            }
                        }
                    }

                    // ---- Split filter chips ----
                    // Shows when the user has at least one split defined (profile
                    // or saved routines). Each chip narrows the list to sets whose
                    // exercise belongs to the matching template or custom routine.
                    Flow {
                        Layout.fillWidth: true
                        spacing: Theme.s2

                        // "All" chip — always shown so the user can clear the filter.
                        Rectangle {
                            property bool active: page.splitFilter === ""
                            radius: Theme.radiusSm
                            color: active
                                   ? Theme.turquoise
                                   : Qt.rgba(1, 1, 1, 0.06)
                            border.width: active ? 0 : 1
                            border.color: Theme.navyLine
                            implicitWidth: allChipText.implicitWidth + Theme.s4 * 2
                            implicitHeight: 28
                            Text {
                                id: allChipText
                                anchors.centerIn: parent
                                text: "All"
                                color: parent.active ? Theme.textOnAccent : Theme.textSecondary
                                font.pixelSize: Theme.fontSmall
                                font.bold: parent.active
                            }
                            MouseArea {
                                anchors.fill: parent
                                cursorShape: Qt.PointingHandCursor
                                onClicked: page.splitFilter = ""
                            }
                        }

                        // Template split chips: PPL and Upper/Lower.
                        Repeater {
                            model: [
                                { token: "ppl", label: "Push / Pull / Legs" },
                                { token: "ul",  label: "Upper / Lower"      }
                            ]
                            delegate: Rectangle {
                                property bool active: page.splitFilter === modelData.token
                                radius: Theme.radiusSm
                                color: active
                                       ? Theme.turquoise
                                       : Qt.rgba(1, 1, 1, 0.06)
                                border.width: active ? 0 : 1
                                border.color: Theme.navyLine
                                implicitWidth: chipText.implicitWidth + Theme.s4 * 2
                                implicitHeight: 28
                                Text {
                                    id: chipText
                                    anchors.centerIn: parent
                                    text: modelData.label
                                    color: parent.active ? Theme.textOnAccent : Theme.textSecondary
                                    font.pixelSize: Theme.fontSmall
                                    font.bold: parent.active
                                }
                                MouseArea {
                                    anchors.fill: parent
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: page.splitFilter =
                                        (page.splitFilter === modelData.token ? "" : modelData.token)
                                }
                            }
                        }

                        // Custom split chip — only visible when the user has set a
                        // custom split in their profile OR has saved custom routines.
                        Rectangle {
                            property bool active: page.splitFilter === "other"
                            visible: UserProfile.workoutSplit === "other"
                                     || page.userRoutines.length > 0
                            radius: Theme.radiusSm
                            color: active
                                   ? Theme.turquoise
                                   : Qt.rgba(1, 1, 1, 0.06)
                            border.width: active ? 0 : 1
                            border.color: Theme.navyLine
                            implicitWidth: customChipText.implicitWidth + Theme.s4 * 2
                            implicitHeight: 28
                            Text {
                                id: customChipText
                                anchors.centerIn: parent
                                text: page.splitLabel("other")
                                color: parent.active ? Theme.textOnAccent : Theme.textSecondary
                                font.pixelSize: Theme.fontSmall
                                font.bold: parent.active
                            }
                            MouseArea {
                                anchors.fill: parent
                                cursorShape: Qt.PointingHandCursor
                                onClicked: page.splitFilter =
                                    (page.splitFilter === "other" ? "" : "other")
                            }
                        }
                    }

                    Rectangle { Layout.fillWidth: true; height: 1; color: Theme.navyLine }

                    ListView {
                        id: list
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        clip: true
                        model: page.filteredRecent()
                        spacing: Theme.s1

                        // Empty-state placeholder.
                        Text {
                            anchors.centerIn: parent
                            visible: list.count === 0
                            text: "No sets logged yet.\nLog your first set above to start your climb."
                            color: Theme.textSecondary
                            horizontalAlignment: Text.AlignHCenter
                            font.pixelSize: Theme.fontBody
                        }

                        delegate: Rectangle {
                            width: list.width
                            height: 56
                            // Highlight today's sets so the user can see at a
                            // glance what they've already done in this session.
                            color: rowMouse.containsMouse
                                   ? Qt.rgba(0.176, 0.831, 0.749, 0.18)
                                   : (modelData.dayKey === page.todayKey
                                      ? Qt.rgba(0.176, 0.831, 0.749, 0.10)
                                      : (index % 2 === 0
                                         ? "transparent"
                                         : Qt.rgba(0.176, 0.831, 0.749, 0.04)))
                            radius: Theme.radiusSm

                            RowLayout {
                                anchors.fill: parent
                                anchors.leftMargin:  Theme.s3
                                anchors.rightMargin: Theme.s3
                                spacing: Theme.s3

                                // Color dot - hash exercise name to a hue between
                                // turquoise and pale blue for quick visual grouping.
                                Rectangle {
                                    width: 10; height: 10; radius: 5
                                    color: Theme.turquoise
                                    opacity: 0.4 + 0.6 * ((modelData.exercise.length % 7) / 7)
                                }

                                ColumnLayout {
                                    Layout.fillWidth: true
                                    spacing: 0
                                    Text {
                                        text: modelData.exercise
                                        color: Theme.textPrimary
                                        font.pixelSize: Theme.fontBody
                                        font.bold: true
                                        elide: Text.ElideRight
                                    }
                                    Text {
                                        // Show date (not per-set time). Per-set timestamps
                                        // are preserved internally for ordering and session
                                        // duration, but only workout start/end are surfaced
                                        // in the UI (see session banner above the list).
                                        // RIR / RPE appended when recorded.
                                        text: Qt.formatDate(modelData.timestamp, "MMM d")
                                              + (modelData.rir >= 0
                                                 ? "  · " + modelData.rir + " RIR"
                                                 : (modelData.rpe > 0
                                                    ? "  · RPE " + modelData.rpe
                                                    : ""))
                                        color: Theme.textSecondary
                                        font.pixelSize: Theme.fontSmall
                                    }
                                }

                                // Right-side stats — two layouts, one visible at a time.
                                // Lift: PR badge + weight × reps.
                                // Cardio (TICKET-010): duration + optional distance km.

                                // ---- Lift stats ----
                                RowLayout {
                                    spacing: 2
                                    visible: modelData.kind !== "cardio"
                                    // TICKET-008: PR badge — shown when this set ties the best
                                    // e1rm for this exercise (computed by WorkoutTracker).
                                    Rectangle {
                                        visible: modelData.isPr && modelData.weight > 0
                                        color: Qt.rgba(1.0, 0.84, 0.0, 0.18)
                                        border.color: Qt.rgba(1.0, 0.84, 0.0, 0.70)
                                        border.width: 1
                                        radius: 8
                                        implicitWidth: prLabel.implicitWidth + 10
                                        implicitHeight: 22
                                        Text {
                                            id: prLabel
                                            anchors.centerIn: parent
                                            text: "PR"
                                            color: Qt.rgba(1.0, 0.80, 0.0, 1.0)
                                            font.pixelSize: Theme.fontSmall - 1
                                            font.bold: true
                                        }
                                    }
                                    WeightLabel {
                                        weightKg: modelData.weight   // 0 → shows "BW"
                                    }
                                    Text {
                                        text: "× " + modelData.reps
                                        color: Theme.turquoise
                                        font.pixelSize: Theme.fontBody
                                        font.bold: true
                                    }
                                }

                                // ---- Cardio stats ----
                                RowLayout {
                                    spacing: Theme.s2
                                    visible: modelData.kind === "cardio"
                                    // Duration: M:SS or MM:SS
                                    Text {
                                        text: {
                                            const dur = modelData.durationSec;
                                            if (!dur || dur < 0) return "--:--";
                                            const m = Math.floor(dur / 60);
                                            const s = dur % 60;
                                            return m + ":" + (s < 10 ? "0" : "") + s;
                                        }
                                        color: Theme.turquoise
                                        font.pixelSize: Theme.fontBody
                                        font.bold: true
                                    }
                                    // Distance — only when the user logged it
                                    Text {
                                        visible: modelData.distanceM > 0
                                        text: modelData.distanceM > 0
                                              ? (modelData.distanceM / 1000).toFixed(2) + " km"
                                              : ""
                                        color: Theme.textSecondary
                                        font.pixelSize: Theme.fontSmall
                                    }
                                }

                                Text {
                                    text: "›"
                                    color: Theme.textSecondary
                                    font.pixelSize: Theme.fontH2
                                }
                            }

                            MouseArea {
                                id: rowMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: {
                                    editDialog.openForEdit(modelData);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // ---- Save-as-routine dialog ----
    Dialog {
        id: routineDialog
        modal: true
        title: "Save today's workout as a routine"
        anchors.centerIn: parent
        width: Math.min(parent.width - Theme.s5 * 2, 420)
        background: Rectangle {
            color: Theme.navyDeep
            radius: Theme.radiusLg
            border.color: Theme.navyLine
            border.width: 1
        }

        ColumnLayout {
            anchors.fill: parent
            spacing: Theme.s3

            Text {
                Layout.fillWidth: true
                wrapMode: Text.Wrap
                color: Theme.textSecondary
                font.pixelSize: Theme.fontSmall
                text: "Give your workout a name (e.g. \"Push A\", \"Monday Lower\"). "
                      + "You'll be able to start a new session from this routine on any future day."
            }

            ColumnLayout {
                Layout.fillWidth: true
                spacing: Theme.s1
                Text { text: "Routine name"; color: Theme.textSecondary; font.pixelSize: Theme.fontSmall }
                ThemedTextField {
                    id: routineNameField
                    Layout.fillWidth: true
                    placeholderText: "e.g. Push A"
                    text: ""
                }
            }

            Text {
                Layout.fillWidth: true
                wrapMode: Text.Wrap
                color: Theme.textPrimary
                font.pixelSize: Theme.fontSmall
                text: "Includes: " + page.todayExercises().join(", ")
            }

            Text {
                id: routineError
                visible: text.length > 0
                text: ""
                color: Theme.danger
                font.pixelSize: Theme.fontSmall
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: Theme.s2
                SecondaryButton {
                    text: "Cancel"
                    Layout.fillWidth: true
                    onClicked: { routineError.text = ""; routineDialog.close(); }
                }
                PrimaryButton {
                    text: "Save"
                    Layout.fillWidth: true
                    onClicked: {
                        const name = (routineNameField.text || "").trim();
                        if (!name) { routineError.text = "Routine name cannot be empty."; return; }
                        const err = WorkoutTracker.saveRoutine(name, page.todayExercises());
                        if (err && err.length > 0) { routineError.text = err; return; }
                        routineError.text = "";
                        routineNameField.text = "";
                        routineDialog.close();
                    }
                }
            }
        }
    }

    // ---- Routine details dialog ----
    // Shown when a template pill is tapped; lists the routine's exercises
    // so the user can see what they're committing to before logging sets.
    Dialog {
        id: routineDetailDialog
        modal: true
        title: routine.name || "Routine"
        anchors.centerIn: parent
        width: Math.min(parent.width - Theme.s5 * 2, 460)

        property var routine: ({ name: "", exercises: [], description: "", isTemplate: false })

        background: Rectangle {
            color: Theme.navyDeep
            radius: Theme.radiusLg
            border.color: Theme.navyLine
            border.width: 1
        }

        ColumnLayout {
            anchors.fill: parent
            spacing: Theme.s3

            Text {
                Layout.fillWidth: true
                wrapMode: Text.Wrap
                text: routineDetailDialog.routine.description || ""
                color: Theme.textSecondary
                font.pixelSize: Theme.fontSmall
                visible: text.length > 0
            }

            Text {
                text: "Exercises"
                color: Theme.textSecondary
                font.pixelSize: Theme.fontSmall
            }

            Repeater {
                model: routineDetailDialog.routine.exercises || []
                delegate: Rectangle {
                    Layout.fillWidth: true
                    implicitHeight: 36
                    color: index % 2 === 0
                           ? "transparent"
                           : Qt.rgba(1, 1, 1, 0.03)
                    radius: Theme.radiusSm
                    Text {
                        anchors.left: parent.left
                        anchors.verticalCenter: parent.verticalCenter
                        anchors.leftMargin: Theme.s3
                        text: (index + 1) + ". " + modelData
                        color: Theme.textPrimary
                        font.pixelSize: Theme.fontSmall
                    }
                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            exerciseField.editText = modelData;
                            routineDetailDialog.close();
                            weightField.forceActiveFocus();
                        }
                    }
                }
            }

            RowLayout {
                Layout.fillWidth: true
                Item { Layout.fillWidth: true }
                SecondaryButton {
                    text: "Close"
                    Layout.preferredWidth: 100
                    onClicked: routineDetailDialog.close()
                }
            }
        }
    }

    // ---- TICKET-003: Delete routine confirmation dialog ----
    // Confirmation gate so tapping the trash icon by accident
    // doesn't silently wipe a saved routine. Template routines
    // are read-only and cannot be deleted — WorkoutTracker.deleteRoutine
    // enforces this at the model level too.
    Dialog {
        id: deleteConfirmDialog
        modal: true
        anchors.centerIn: parent
        width: Math.min(parent.width - Theme.s5 * 2, 360)

        property string routineName: ""

        background: Rectangle {
            color: Theme.navyDeep
            radius: Theme.radiusLg
            border.color: Theme.navyLine
            border.width: 1
        }

        ColumnLayout {
            anchors.fill: parent
            spacing: Theme.s3

            Text {
                Layout.fillWidth: true
                text: "Delete routine?"
                color: Theme.textPrimary
                font.pixelSize: Theme.fontH2
                font.bold: true
            }
            Text {
                Layout.fillWidth: true
                wrapMode: Text.Wrap
                text: "\"" + deleteConfirmDialog.routineName + "\" will be removed from My Routines. Your logged sets are not affected."
                color: Theme.textSecondary
                font.pixelSize: Theme.fontSmall
            }
            RowLayout {
                Layout.fillWidth: true
                spacing: Theme.s2
                SecondaryButton {
                    text: "Cancel"
                    Layout.fillWidth: true
                    onClicked: deleteConfirmDialog.close()
                }
                // Danger-style button for the destructive action.
                Button {
                    text: "Delete"
                    Layout.fillWidth: true
                    onClicked: {
                        WorkoutTracker.deleteRoutine(deleteConfirmDialog.routineName);
                        deleteConfirmDialog.close();
                    }
                    contentItem: Text {
                        text: parent.text
                        color: Theme.textOnAccent
                        font.pixelSize: Theme.fontBody
                        font.bold: true
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                    }
                    background: Rectangle {
                        radius: Theme.radiusMd
                        color: Theme.danger
                        opacity: parent.hovered ? 0.85 : 1.0
                    }
                }
            }
        }
    }

    // ---- Edit-existing-set dialog ----
    EditSetDialog {
        id: editDialog
        // When the dialog wants to open the library, run our pickerDialog
        // and pipe the chosen name back through the supplied callback.
        onRequestLibraryPick: function(callback) {
            pickerDialog.pickWith(callback);
        }
    }

    // ---- Library picker (TICKET-003) ----
    // Single instance for the whole page; opened from the log form Library
    // button and from EditSetDialog via its requestLibraryPick signal.
    ExercisePickerDialog {
        id: pickerDialog
    }
}
