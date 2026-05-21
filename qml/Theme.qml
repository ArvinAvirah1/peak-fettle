// ---------------------------------------------------------------------------
// Theme.qml  (singleton)
//
// Centralized color + spacing palette for the entire app. Registered as a
// QML singleton in CMakeLists (set_source_files_properties ... SINGLETON_TYPE),
// so any QML file can `import PeakFettle 1.0` and reference `Theme.turquoise`,
// `Theme.spacing`, etc.
//
// Palette: dark blue / turquoise / black (per project brief).
// ---------------------------------------------------------------------------

pragma Singleton
import QtQuick

QtObject {
    // ----- Core palette -----
    readonly property color black:        "#06080F"   // near-pure black bg
    readonly property color navyDeep:     "#0A1A33"   // primary dark blue
    readonly property color navyMid:      "#122E5C"   // card / panel surface
    readonly property color navyLine:     "#1E3A66"   // subtle borders
    readonly property color turquoise:    "#2DD4BF"   // primary accent
    readonly property color turquoiseHi:  "#5EEAD4"   // hover / highlight
    readonly property color turquoiseLo:  "#14B8A6"   // pressed / muted accent

    // ----- Text -----
    readonly property color textPrimary:   "#E2EEF7"
    readonly property color textSecondary: "#8FA4BC"
    readonly property color textOnAccent:  "#06121A"  // text on turquoise btn
    readonly property color danger:        "#F87171"
    readonly property color success:       "#34D399"

    // ----- Spacing scale (4-pt grid) -----
    readonly property int s1:  4
    readonly property int s2:  8
    readonly property int s3:  12
    readonly property int s4:  16
    readonly property int s5:  24
    readonly property int s6:  32
    readonly property int s7:  48
    readonly property int s8:  64

    // ----- Radii -----
    readonly property int radiusSm: 6
    readonly property int radiusMd: 12
    readonly property int radiusLg: 20

    // ----- Typography sizes (logical pt) -----
    readonly property int fontDisplay: 36
    readonly property int fontH1:      26
    readonly property int fontH2:      20
    readonly property int fontBody:    15
    readonly property int fontSmall:   12

    // ----- Adaptive helper -----
    // True when the window is narrow enough that we should switch to a
    // single-column phone layout. Used by every page.
    function isPhone(width) { return width < 600; }
}
