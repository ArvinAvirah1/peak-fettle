// ---------------------------------------------------------------------------
// WeightLabel.qml — universal weight-display component.
//
// Takes a weight in kg and renders it in the user's current preferred unit.
// Use this everywhere a weight value is displayed so that the unit toggle
// in Settings immediately reflects across the whole UI.
//
// Usage:
//   WeightLabel { weightKg: set.weightKg }
//   WeightLabel { weightKg: set.weightKg; font.pixelSize: Theme.fontH2 }
//
// The `text` property is auto-computed via UnitPreference.format().
//
// Reactivity note (TICKET-002 fix, 2026-05-01):
//   `UnitPreference.format()` is a Q_INVOKABLE method, not a property, so
//   QML's binding system does NOT automatically re-run this expression on
//   `unitChanged`. Previously this caused the bug where switching kg→lbs
//   in Settings left every WeightLabel still showing the old "X kg" text.
//
//   The fix references `UnitPreference.unit` (a real Q_PROPERTY with NOTIFY)
//   inside the binding via the JS comma operator, so QML registers a
//   dependency on it. When the unit toggles, the binding re-evaluates and
//   the label re-renders correctly.
//
// Author: dev-frontend (TICKET-001 / -002)
// Date: 2026-05-01
// ---------------------------------------------------------------------------

import QtQuick
import PeakFettle 1.0

Text {
    // The weight in kg (canonical storage unit). Required.
    property real weightKg: 0.0

    // Formatted display string, re-evaluated when unit or value changes.
    // `UnitPreference.unit` is referenced (and discarded by the comma
    // operator) purely to register a binding dependency on the unit toggle.
    text: (UnitPreference.unit, weightKg > 0
                                ? UnitPreference.format(weightKg)
                                : "BW")     // bodyweight sets have weightKg == 0

    color: Theme.turquoise
    font.pixelSize: Theme.fontBody
    font.bold: true
}
