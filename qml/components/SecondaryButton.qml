// SecondaryButton - outlined turquoise button on dark surface.
import QtQuick
import QtQuick.Controls
import PeakFettle 1.0

Button {
    id: btn
    implicitHeight: 48
    padding: Theme.s4
    font.pixelSize: Theme.fontBody
    font.bold: true

    contentItem: Text {
        text: btn.text
        font: btn.font
        color: btn.hovered ? Theme.turquoiseHi : Theme.turquoise
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
        elide: Text.ElideRight
    }

    background: Rectangle {
        radius: Theme.radiusMd
        color: btn.down ? Qt.rgba(0.176, 0.831, 0.749, 0.18)
                        : (btn.hovered ? Qt.rgba(0.176, 0.831, 0.749, 0.10)
                                       : "transparent")
        border.width: 1.5
        border.color: btn.hovered ? Theme.turquoiseHi : Theme.turquoise
        Behavior on color { ColorAnimation { duration: 120 } }
    }
}
