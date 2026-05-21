// ---------------------------------------------------------------------------
// ProgressGraphPage.qml
//
// Plots a chronological series for one exercise. The user picks:
//   * which exercise to graph
//   * which metric to plot (e1RM, weight, total volume, strength score)
//
// Aggregation: each point is the BEST value for that metric on a given
// training day, NOT every individual set. This avoids the "your second
// set to failure looks like regression" graph artifact that beta tester
// Marcus and the founder both flagged on 2026-04-30. Per-set inspection
// is still possible from the recent-sets list on SetTrackerPage.
//
// Note on the x-axis: Qt Graphs 2D's ValueAxis labels are floating point.
// Using a `labelFormat: "%d"` printf string on a double is undefined
// behaviour and was producing garbage labels like "858993459" in the
// first build. The fix is `labelDecimals: 0` plus integer-valued bounds
// and a tickInterval of 1 - so the axis prints "1, 2, 3, 4, ..." cleanly.
// ---------------------------------------------------------------------------

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtGraphs
import PeakFettle 1.0
import "components"

Page {
    id: page
    background: Rectangle { color: Theme.black }

    // ---- State ----
    property string currentExercise: ""
    // "e1rm" | "weight" | "volume" | "strengthScore"
    property string currentMetric:   "e1rm"
    property var    seriesData:      []
    property var    stats:           ({ setCount: 0, totalVolume: 0, prWeight: 0,
                                        e1rm: 0,    strengthScore: 0 })
    property string dateRangeLabel:  ""

    // Re-trigger metricTitle() binding when unit changes so chart title updates.
    Connections {
        target: UnitPreference
        function onUnitChanged() { page.refresh(); }
    }

    function refresh() {
        const names = WorkoutTracker.exerciseNames;
        if (names.length === 0) {
            currentExercise = "";
            seriesData = [];
            stats = { setCount: 0, totalVolume: 0, prWeight: 0,
                      e1rm: 0,    strengthScore: 0 };
            dateRangeLabel = "";
            return;
        }
        if (!names.includes(currentExercise)) currentExercise = names[0];
        // perSet=false (default) - aggregate to best-of-day. See file header.
        seriesData = WorkoutTracker.progressSeries(currentExercise, currentMetric);
        stats      = WorkoutTracker.exerciseStats(currentExercise);
        rebuildChart();
    }

    // 2026-05-03: convert kg-denominated y values into the user's chosen
    // display unit BEFORE plotting. Previously the title axis labelled
    // itself "kg" or "lb" via UnitPreference.suffix, but the plotted numbers
    // stayed in kg — so a lbs user saw a "lb"-labelled chart with 80, 82,
    // 85 instead of 176, 180, 187. We convert at the single point where C++
    // data crosses into the QML render path.
    //
    // strengthScore is unitless (0..1000 derived internally from kg-e1RM):
    // converting it would change the score arbitrarily, so we leave it.
    function yToDisplay(y) {
        if (page.currentMetric === "strengthScore") return y;
        // weight, e1rm, and volume are all kg-derived (volume = weight*reps,
        // so kg-reps; multiplying by lb/kg gives lb-reps, which is what the
        // axis label says).
        return UnitPreference.toDisplay(y);
    }

    function rebuildChart() {
        lineSeries.clear();
        if (seriesData.length === 0) {
            xAxis.min = 0; xAxis.max = 1;
            yAxis.min = 0; yAxis.max = 10;
            dateRangeLabel = "";
            return;
        }

        let minY =  Number.POSITIVE_INFINITY;
        let maxY =  Number.NEGATIVE_INFINITY;
        let minDate = Number.POSITIVE_INFINITY;
        let maxDate = Number.NEGATIVE_INFINITY;

        // Each point is one TRAINING DAY (best-of-day aggregation).
        for (let i = 0; i < seriesData.length; ++i) {
            const p = seriesData[i];
            // p.x is the 1-based integer day index from C++.
            // p.y is in kg (or unitless for strengthScore) — convert.
            const yDisp = page.yToDisplay(p.y);
            lineSeries.append(p.x, yDisp);
            if (yDisp < minY) minY = yDisp;
            if (yDisp > maxY) maxY = yDisp;
            if (p.date < minDate) minDate = p.date;
            if (p.date > maxDate) maxDate = p.date;
        }

        // Pad y-range so the polyline doesn't touch the axes.
        const yPad = Math.max((maxY - minY) * 0.15, 1.0);
        yAxis.min = Math.max(0, minY - yPad);
        yAxis.max = maxY + yPad;

        // Integer bounds + tickInterval=1 + labelDecimals=0 keep labels
        // as clean integers ("1, 2, 3, ..."). Single-point series gets a
        // small symmetric span so the line is centered, not cut in half.
        if (seriesData.length === 1) {
            xAxis.min = 0;
            xAxis.max = 2;
        } else {
            xAxis.min = 1;
            xAxis.max = seriesData.length;
        }

        // "Apr 12 - Apr 30" style subtitle.
        const fmt = function(ms) {
            return Qt.formatDate(new Date(ms), "MMM d");
        };
        dateRangeLabel = (minDate === maxDate) ? fmt(minDate)
                                               : fmt(minDate) + "  -  " + fmt(maxDate);
    }

    Component.onCompleted: refresh()
    Connections {
        target: WorkoutTracker
        function onDataChanged() { page.refresh(); }
    }

    // ---- Helpers ----
    // metricTitle updates reactively because UnitPreference.suffix is a
    // Q_PROPERTY with NOTIFY (TICKET-002 fix). The page already wires a
    // Connections handler to refresh() on unitChanged, but the binding is
    // also reactive on its own now.
    function metricTitle(m) {
        const u = UnitPreference.suffix;  // "kg" or "lb"
        switch (m) {
        case "weight":         return "Weight per day (" + u + ")";
        case "volume":         return "Volume per day (" + u + "-reps)";
        case "strengthScore":  return "Strength Score (gamified)";
        default:               return "Estimated 1RM (" + u + ")";
        }
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
                text: "Progress"
                color: Theme.textPrimary
                font.pixelSize: Theme.fontH2
                font.bold: true
            }
        }
    }

    // ---- Body ----
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Theme.s4
        spacing: Theme.s3

        // Empty-state takeover when there's nothing to graph yet.
        ColumnLayout {
            visible: WorkoutTracker.totalSets === 0
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: Theme.s3
            MountainLogo { Layout.alignment: Qt.AlignHCenter; size: 96 }
            Text {
                Layout.alignment: Qt.AlignHCenter
                text: "Nothing to graph yet"
                color: Theme.textPrimary
                font.pixelSize: Theme.fontH1
                font.bold: true
            }
            Text {
                Layout.alignment: Qt.AlignHCenter
                horizontalAlignment: Text.AlignHCenter
                wrapMode: Text.Wrap
                Layout.maximumWidth: 360
                text: "Log a few sets and your progress curve will appear here. Each point on the graph is one training day - your best set of the day for the chosen metric."
                color: Theme.textSecondary
                font.pixelSize: Theme.fontBody
            }
            PrimaryButton {
                Layout.alignment: Qt.AlignHCenter
                Layout.preferredWidth: 200
                text: "Back to tracker"
                onClicked: window.goTo("back")
            }
        }

        // ---- Real graph view (only when there's data) ----
        ColumnLayout {
            visible: WorkoutTracker.totalSets > 0
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: Theme.s3

            // Selectors row
            GridLayout {
                Layout.fillWidth: true
                columns: window.isPhone ? 1 : 2
                rowSpacing: Theme.s3
                columnSpacing: Theme.s3

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: Theme.s1
                    Text { text: "Exercise"; color: Theme.textSecondary; font.pixelSize: Theme.fontSmall }
                    ComboBox {
                        id: exerciseSelect
                        Layout.fillWidth: true
                        model: WorkoutTracker.exerciseNames
                        currentIndex: Math.max(0, model.indexOf(page.currentExercise))
                        onActivated: {
                            page.currentExercise = textAt(currentIndex);
                            page.refresh();
                        }
                        background: Rectangle {
                            radius: Theme.radiusMd
                            color: Theme.navyDeep
                            border.color: Theme.navyLine
                            border.width: 1
                        }
                    }
                }

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: Theme.s1
                    Text { text: "Metric"; color: Theme.textSecondary; font.pixelSize: Theme.fontSmall }
                    GridLayout {
                        Layout.fillWidth: true
                        columns: 2
                        rowSpacing: Theme.s1
                        columnSpacing: Theme.s2
                        Repeater {
                            model: [
                                { id: "e1rm",          label: "Est. 1RM"       },
                                { id: "strengthScore", label: "Strength Score" },
                                { id: "weight",        label: "Weight"         },
                                { id: "volume",        label: "Volume"         }
                            ]
                            delegate: Button {
                                Layout.fillWidth: true
                                checkable: true
                                checked: page.currentMetric === modelData.id
                                text: modelData.label
                                onClicked: {
                                    page.currentMetric = modelData.id;
                                    page.refresh();
                                }
                                contentItem: Text {
                                    text: parent.text
                                    color: parent.checked ? Theme.textOnAccent : Theme.textPrimary
                                    horizontalAlignment: Text.AlignHCenter
                                    verticalAlignment: Text.AlignVCenter
                                    font.pixelSize: Theme.fontSmall
                                    font.bold: true
                                }
                                background: Rectangle {
                                    radius: Theme.radiusSm
                                    color: parent.checked ? Theme.turquoise : Theme.navyDeep
                                    border.width: 1
                                    border.color: parent.checked ? Theme.turquoise : Theme.navyLine
                                }
                            }
                        }
                    }
                }
            }

            // Stats strip — PR and Est. 1RM are displayed in the active unit.
            // UnitPreference.format() handles the conversion and formatting.
            RowLayout {
                Layout.fillWidth: true
                spacing: Theme.s3
                Repeater {
                    model: [
                        { label: "Sets",     value: page.stats.setCount + "" },
                        { label: "PR",       value: UnitPreference.format(page.stats.prWeight) },
                        { label: "Est. 1RM", value: UnitPreference.format(page.stats.e1rm) },
                        { label: "Score",    value: Math.round(page.stats.strengthScore) + "" }
                    ]
                    delegate: Rectangle {
                        Layout.fillWidth: true
                        Layout.preferredHeight: 64
                        color: Theme.navyDeep
                        radius: Theme.radiusMd
                        border.width: 1
                        border.color: Theme.navyLine
                        ColumnLayout {
                            anchors.centerIn: parent
                            spacing: 2
                            Text {
                                text: modelData.value
                                color: Theme.turquoise
                                font.pixelSize: Theme.fontH2
                                font.bold: true
                                horizontalAlignment: Text.AlignHCenter
                                Layout.alignment: Qt.AlignHCenter
                            }
                            Text {
                                text: modelData.label
                                color: Theme.textSecondary
                                font.pixelSize: Theme.fontSmall
                                horizontalAlignment: Text.AlignHCenter
                                Layout.alignment: Qt.AlignHCenter
                            }
                        }
                    }
                }
            }

            // ---- Chart card ----
            Rectangle {
                Layout.fillWidth: true
                Layout.fillHeight: true
                color: Theme.navyDeep
                radius: Theme.radiusLg
                border.width: 1
                border.color: Theme.navyLine
                clip: true

                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: Theme.s4
                    spacing: Theme.s2

                    // Title + subtitle (Qt Graphs has no title prop, so we
                    // render it ourselves above the GraphsView).
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 2
                        Text {
                            text: page.currentExercise + "  -  " + page.metricTitle(page.currentMetric)
                            color: Theme.textPrimary
                            font.pixelSize: Theme.fontH2
                            font.bold: true
                            elide: Text.ElideRight
                            Layout.fillWidth: true
                        }
                        Text {
                            text: page.dateRangeLabel.length > 0
                                  ? "Day 1 to " + page.seriesData.length
                                    + "  -  " + page.dateRangeLabel
                                  : ""
                            color: Theme.textSecondary
                            font.pixelSize: Theme.fontSmall
                        }
                    }

                    GraphsView {
                        id: chart
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        antialiasing: true

                        // Custom theme - dark navy background with turquoise line.
                        // Note: gridMainColor, gridSubColor, axisXMainColor, axisYMainColor
                        // do NOT exist in Qt Graphs 6.x GraphsTheme (confirmed vs Qt 6.11 docs).
                        theme: GraphsTheme {
                            colorScheme: GraphsTheme.ColorScheme.Dark
                            seriesColors: [Theme.turquoise]
                            backgroundColor: Theme.navyDeep
                            plotAreaBackgroundColor: "transparent"
                            labelTextColor: Theme.textSecondary
                        }

                        axisX: ValueAxis {
                            id: xAxis
                            min: 1; max: 2
                            // CRITICAL: do NOT use labelFormat: "%d" - %d on a
                            // double is undefined behaviour and prints garbage
                            // (we got "858993459"-style labels in the first
                            // build). Use labelDecimals instead.
                            labelDecimals: 0
                            tickInterval: 1
                            subTickCount: 0
                        }
                        axisY: ValueAxis {
                            id: yAxis
                            min: 0; max: 10
                            labelDecimals: 1
                        }

                        LineSeries {
                            id: lineSeries
                            width: 3
                            color: Theme.turquoise
                            // Show a point marker at every day so single-day
                            // series and clusters are still visible.
                            // Note: property is pointDelegate (not pointMarker) in Qt Graphs 6.x
                            pointDelegate: Component {
                                Rectangle {
                                    width: 10; height: 10; radius: 5
                                    color: Theme.turquoise
                                    border.width: 2
                                    border.color: Theme.turquoiseHi
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
