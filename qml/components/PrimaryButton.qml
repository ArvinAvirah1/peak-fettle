// PrimaryButton - turquoise filled CTA.
import QtQuick
import QtQuick.Controls
import PeakFettle 1.0

Button {
    id: btn
    property color baseColor:  Theme.turquoise
    property color hoverColor: Theme.turquoiseHi
    property color downColor:  Theme.turquoiseLo

    implicitHeight: 48
    padding: Theme.s4
    font.pixelSize: Theme.fontBody
    font.bold: true

    contentItem: Text {
        text: btn.text
        font: btn.font
        color: Theme.textOnAccent
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
        elide: Text.ElideRight
    }

    background: Rectangle {
        radius: Theme.radiusMd
        color: btn.down ? btn.downColor
                        : (btn.hovered ? btn.hoverColor : btn.baseColor)
        Behavior on color { ColorAnimation { duration: 120 } }
    }
}
