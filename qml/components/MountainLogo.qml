// ---------------------------------------------------------------------------
// MountainLogo.qml
//
// Reusable wrapper around the SVG logo. Renders crisply at any size (Image
// with Image.PreserveAspectFit + a sourceSize avoids Qt's pixel-bucketing).
//
// Usage:   MountainLogo { size: 96 }
// ---------------------------------------------------------------------------

import QtQuick

Item {
    id: root

    // The square edge length of the logo in logical pixels.
    property int size: 96

    implicitWidth:  size
    implicitHeight: size
    width:          size
    height:         size

    Image {
        anchors.fill: parent
        source: "qrc:/qt/qml/PeakFettle/resources/mountain_logo.svg"
        fillMode: Image.PreserveAspectFit
        smooth: true
        // Force the SVG rasterizer to render at the displayed size (x2 for
        // crisp HiDPI). This is what keeps the mountain edges clean.
        sourceSize.width:  root.size * 2
        sourceSize.height: root.size * 2
        asynchronous: true
    }
}
