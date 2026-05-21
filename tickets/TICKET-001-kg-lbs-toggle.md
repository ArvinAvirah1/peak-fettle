# TICKET-001 — kg / lbs Display Toggle
**Owner:** dev-frontend
**Date opened:** 2026-04-30
**Phase:** A (Qt prototype hardening)
**Source:** `workflow-optimization/briefs/dev-roadmap-relay-2026-04-30.md`

---

## Goal

Let the user choose whether weights are displayed in kilograms or pounds, without changing the underlying persistence model. All weights stay in **kg** in `Set::weightKg` and the upcoming `sets.weight_kg` Postgres column. Conversion happens at render time only.

---

## Acceptance criteria

1. A toggle in Settings switches the unit between `kg` and `lbs`.
2. Every place a weight is shown — tracker page input, progress chart axis, PR badge label, named-routine summary — respects the current unit.
3. Persisted weights are unchanged in the model. Round-tripping a value through the UI does not introduce drift (per dev-lead rule: never round-trip through both units).
4. A user who toggles to `lbs`, logs a set with `155`, then toggles back to `kg`, sees `70.31 kg` on the same set — not a re-rounded value.
5. The user's preference survives an app restart (persisted to `QSettings` for now; will move to the `users.unit_pref` column when backend is wired in Phase B).

---

## Implementation plan

### Files to add

- `src/UnitPreference.h` / `src/UnitPreference.cpp` — singleton wrapping `QSettings`. Exposes `Q_PROPERTY(QString unit READ unit WRITE setUnit NOTIFY unitChanged)`. Two values only: `"kg"` and `"lbs"`.
- `qml/components/WeightLabel.qml` — single QML component used everywhere a weight is rendered. Takes `weightKg: real` and reads `UnitPreference.unit` to format. Emits one display string with the suffix (`70 kg` / `154 lb`).

### Files to modify

- `qml/SettingsPage.qml` — add a `Switch` bound to `UnitPreference.unit`.
- `qml/SetTrackerPage.qml` — replace inline `text: weightKg + " kg"` with `WeightLabel { weightKg: ... }`. Replace the weight `TextField` input with a wrapper that:
  - shows the value in the current unit
  - on commit, converts back to kg via `UnitPreference.toKg(value)` before passing to `WorkoutTracker::logSet`.
- `qml/ProgressChart.qml` — `axisY.titleText` and `labelDecimals` switch to `lbs` formatting when unit is `lbs`. Conversion happens in the data binding, never in the persisted series.
- `src/WorkoutTracker.cpp` — no changes. Persistence stays in kg. Confirm via grep that no QML caller is converting before passing.

### Conversion constants

```cpp
constexpr double KG_PER_LB = 0.45359237;  // exact NIST value
inline double kgToLbs(double kg) { return kg / KG_PER_LB; }
inline double lbsToKg(double lb) { return lb * KG_PER_LB; }
```

Store the constant in `UnitPreference` so any future place needing it has one source of truth.

### Display rounding

- `kg` → 1 decimal place for sub-100 values, 0 decimals for ≥100 (matches what bars are loaded with).
- `lbs` → integer for input convenience; the underlying kg keeps full precision.

### CMake update

Add the new files to `PEAK_FETTLE_CPP_SOURCES`, `PEAK_FETTLE_CPP_HEADERS`, and `qt_add_qml_module(... QML_FILES ...)`. Per dev-lead pre-build checklist items 1 and 2.

### Pre-build checklist (run before declaring "compiles")

Walk the dev-lead.md checklist:
1. New files added to CMake — yes (above)
2. New `.qml` files added to QML_FILES — yes
3. Q_PROPERTY on `unit` has READ + NOTIFY — yes; writable via WRITE
4. Q_OBJECT on UnitPreference — yes
5. No new `ValueAxis` introduced; no `labelFormat: "%d"` regression
6. Q_INVOKABLE callers — none added
7. No new owned pointer collections — N/A
8. **Clean build before testing** — `cmake --build build --target clean` then rebuild, because we're touching code paths the MOC has cached

---

## Test plan

Manual against the Qt prototype:

1. Toggle to `lbs`. Log a set: 155 × 5. Confirm chart shows 155, axis says `lbs`.
2. Toggle to `kg`. Same set should now read `70.3 kg` (155 × 0.45359237 = 70.31).
3. Restart the app. Toggle preference is preserved.
4. Edit the same set: change reps to 6 in `lbs` mode. Toggle to `kg`. Weight is unchanged at 70.3.
5. PR badge text reflects the active unit.
6. Named-routine summary card reflects the active unit.

Regression check:

- Set logged in earlier sprints (pre-toggle) still renders correctly.
- Best-of-day aggregation is unaffected (it operates on kg in the model).

---

## Known traps to avoid

- **Do not** add a `weight_lb` field anywhere. We persist kg. UI converts.
- **Do not** wire conversion into `WorkoutTracker::logSet` — that's a model boundary; the UI is responsible for handing it kg.
- **Do not** change `labelFormat` on the chart's `ValueAxis` to `"%d"` (project-wide trap; see dev-lead.md).

---

## Output (per dev-context format)

After merge, dev-frontend appends to `dev-lead.md` "Recently completed":

> `2026-04-30` — TICKET-001 kg/lbs display toggle. New `UnitPreference` singleton, new `WeightLabel.qml` component, `SetTrackerPage.qml` and `ProgressChart.qml` updated to render via the new component. Persistence unchanged — all weights stay in kg.

API endpoints consumed: none (Phase A is offline-only).
UX decisions made: lbs displays as integer; kg shows one decimal under 100, integer above. Toggle is a single binary switch — no third "auto" option for v1.
