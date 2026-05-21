# Peak Fettle — Dev Skill File

A living reference of Qt/C++ gotchas, API quirks, and hard-won fixes discovered during real build and debug sessions. Read this before writing new Qt/QML/C++ code so you don't repeat solved problems.

---

## Standing rule — Ask clarifying questions before ambiguous work

**Added:** 2026-05-04 (per owner instruction)

**Rule:** Any time there is even the slightest unsureness about scope, intent, design decision, or acceptance criteria — ask a clarifying question before writing code. Do not assume and proceed; ask first.

**What counts as "even slight unsureness":**
- Multiple reasonable interpretations of a feature request exist
- A design decision touches the user-visible experience (colors, layout, copy)
- A new feature needs a data model choice that affects persistence
- The ticket description leaves the exact behavior at an edge case undefined
- A backend contract isn't fully specified (field names, error codes, response shape)
- The requested change touches a component that is shared across multiple pages
- It is unclear which phase / priority bucket the work belongs to

**How to ask:**
- Ask the minimum number of targeted questions needed to resolve the ambiguity (one to three max — not an exhaustive interrogation)
- Phrase as a concrete choice: "Should the avatar color picker appear on a separate step of the onboarding flow, or added to the existing ProfileSurveyPage?" rather than "What do you want?"
- If the work is strictly additive and the most natural implementation is obvious, note the assumption inline and proceed — but call it out explicitly so the owner can correct it without re-reading every line

**Rationale:** Dev time is the scarcest resource. Implementing the wrong thing because of an ambiguous brief costs more than a 30-second question before starting.

---

## Qt Graphs (2D)

### `GraphsTheme` — axis color properties that DO and DON'T exist

**Session:** 2026-04-30

`GraphsTheme` in Qt Graphs 6.x (2D graphs) exposes `axisXMainColor` but **not** `axisYMainColor`. Assigning `axisYMainColor` causes a fatal QML load error:

```
Cannot assign to non-existent property "axisYMainColor"
```

**Fix:** Remove `axisYMainColor`. Only set `axisXMainColor`. The y-axis inherits styling from the color scheme.

**Valid `GraphsTheme` color/style properties confirmed in Qt 6.11 docs:**
- `colorScheme` (`GraphsTheme.ColorScheme.Dark` / `.Light`)
- `theme` (preset theme enum)
- `seriesColors` (list of colors)
- `baseColors`
- `borderColors`
- `backgroundColor`
- `plotAreaBackgroundColor`
- `labelTextColor`
- `labelBackgroundColor`
- `singleHighlightColor`
- `multiHighlightColor`
- `gridVisible` (bool)

**Properties that do NOT exist (confirmed against Qt 6.11 docs — will crash QML load):**
- ~~`gridMainColor`~~ ❌
- ~~`gridSubColor`~~ ❌
- ~~`axisXMainColor`~~ ❌
- ~~`axisYMainColor`~~ ❌

Grid line color cannot be set through `GraphsTheme` in Qt 6.11. Use `gridVisible: false` to hide them, or accept the default color from the color scheme.

---

### Qt Graphs vs Qt Charts migration notes

**Session:** 2026-04-30

Qt Charts is deprecated from Qt 6.7+. Qt Graphs is the replacement. Key differences:

| Qt Charts | Qt Graphs |
|---|---|
| `ChartView` | `GraphsView` |
| `ChartView { title: "..." }` | No `title` prop — render a sibling `Text` instead |
| `DateTimeAxis` | Unstable/removed in 2D — use `ValueAxis` with sequential index |
| Theme via `ChartView.theme` enum | Theme via `GraphsTheme { ... }` child object |

### `LineSeries` — correct property names (confirmed Qt 6.11 docs)

**Session:** 2026-04-30

`pointMarker` does **not** exist. The correct property for rendering a custom component at each data point is `pointDelegate`.

**Valid `LineSeries` properties (Qt 6.11):**
- `width` — line thickness (real, default 2.0)
- `color` — inherited from `XYSeries`
- `capStyle` — `Qt.FlatCap`, `Qt.SquareCap`, `Qt.RoundCap`
- `joinStyle` — `Qt.BevelJoin`, `Qt.MiterJoin`, `Qt.RoundJoin`
- `lineStyle` — `LineSeries.Straight`, `.StepLeft`, `.StepRight`, `.StepCenter`
- `strokeStyle` — `LineSeries.SolidLine`, `LineSeries.DashLine`
- `dashPattern` — list of reals (only when strokeStyle is DashLine)
- `dashOffset` — real
- `pointDelegate` ✅ — Component rendered at each data point

**Does NOT exist:**
- ~~`pointMarker`~~ ❌ — this was the Qt Charts name; Qt Graphs uses `pointDelegate`

---

## SVG / Qt SVG Renderer

### `--` is illegal inside XML comments

**Session:** 2026-04-30

The Qt SVG renderer is a strict XML parser. The XML spec forbids `--` anywhere inside a comment body (it looks like the start of the closing `-->`). Using CSS custom-property naming conventions (e.g., `--bg-black`, `--navy-deep`) in SVG comments causes a parse failure:

```
qt.svg: Cannot read file '...mountain_logo.svg', because: Expected '>', but got '[a-zA-Z]'. (line 10)
```

**Fix:** Strip the `--` prefix from any variable names inside XML comments. Use plain names (`bg-black`, `navy-deep`) or restructure as a table.

**Wrong:**
```xml
<!--
    --turquoise    #2DD4BF
    --navy-deep    #0A1A33
-->
```

**Right:**
```xml
<!--
    turquoise    #2DD4BF
    navy-deep    #0A1A33
-->
```

---

## QML Module Registration

### Don't mix `QML_ELEMENT` / `QML_SINGLETON` macros with `qmlRegisterType`

**Session:** 2026-04-30

Using both the CMake `qt_add_qml_module` auto-registration (via `QML_ELEMENT` / `QML_SINGLETON` macros on C++ classes) AND manual `qmlRegisterType()` / `qmlRegisterSingletonType()` calls in `main.cpp` causes double-registration errors at runtime.

**Fix:** Pick one. Prefer the macro + `qt_add_qml_module` path — it's the modern Qt 6 approach and requires no manual registration in `main.cpp`.

---

## Build Setup (Windows, Qt 6.11, MinGW)

### Recommended build path for non-expert users

**Session:** 2026-04-30

- Use **Qt Creator** (File → Open → CMakeLists.txt, pick MinGW 64-bit kit, hit Run).
- Do NOT use VS Code as a compiler — it is an editor, not a toolchain.
- Do NOT manually set `CMAKE_PREFIX_PATH` if launching from the Qt-provided Start Menu command prompt (the prompt pre-loads the Qt environment).
- Command-line fallback only if Qt Creator misbehaves:

```
# Open "Qt 6.11.0 (MinGW 13.x.x 64-bit)" from the Start Menu, then:
cd "C:\Users\aavir\OneDrive\Documents\Claude\Projects\Peak Fettle"
cmake -S . -B build -G Ninja
cmake --build build
.\build\PeakFettle.exe
```

---

*Add new entries above the build section. Format: one H3 per issue, include the session date, the symptom, and the fix.*
