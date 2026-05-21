// ThemedTextField - dark surface, turquoise focus ring.
import QtQuick
import QtQuick.Controls
import PeakFettle 1.0

TextField {
    id: tf

    implicitHeight: 48
    leftPadding: Theme.s4
    rightPadding: Theme.s4
    color: Theme.textPrimary
    placeholderTextColor: Theme.textSecondary
    selectionColor: Theme.turquoise
    selectedTextColor: Theme.textOnAccent
    font.pixelSize: Theme.fontBody

    background: Rectangle {
        radius: Theme.radiusMd
        color: Theme.navyDeep
        border.width: tf.activeFocus ? 2 : 1
        border.color: tf.activeFocus ? Theme.turquoise : Theme.navyLine
        Behavior on border.color { ColorAnimation { duration: 120 } }
    }
}
