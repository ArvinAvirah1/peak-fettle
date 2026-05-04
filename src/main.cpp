// ---------------------------------------------------------------------------
// Peak Fettle - main.cpp
//
// Entry point for the Peak Fettle Qt6/QML application.
// Responsibilities:
//   * Initialise the Qt application and QML engine.
//   * Register C++ types (Set, Exercise, WorkoutTracker, UserManager) so they
//     are usable directly from QML.
//   * Apply the dark-blue / turquoise / black material style.
//   * Load the root Main.qml file from the embedded QML module.
// ---------------------------------------------------------------------------

#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickStyle>
#include <QIcon>

// Note: C++ types (Set, Exercise, WorkoutTracker, UserManager) are
// auto-registered into the "PeakFettle" QML module by qt_add_qml_module
// because their headers carry the QML_ELEMENT / QML_SINGLETON macros.
// We do NOT manually call qmlRegisterType here - that would register them
// twice and abort at startup. Includes are still implicitly pulled in by
// the build's MOC pass over the executable's sources.

int main(int argc, char *argv[])
{
    // High-DPI is enabled by default in Qt 6, no extra attribute calls needed.
    QGuiApplication app(argc, argv);

    QGuiApplication::setApplicationName("Peak Fettle");
    QGuiApplication::setOrganizationName("Peak Fettle");
    QGuiApplication::setApplicationVersion("0.1.0");
    QGuiApplication::setWindowIcon(QIcon(":/qt/qml/PeakFettle/resources/mountain_logo.svg"));

    // Material gives us a clean, modern look that adapts well to mobile + desktop.
    // Theme colors themselves come from qml/Theme.qml (the singleton).
    QQuickStyle::setStyle("Material");

    QQmlApplicationEngine engine;

    // ----- Load root QML -----
    const QUrl url(QStringLiteral("qrc:/qt/qml/PeakFettle/qml/Main.qml"));
    QObject::connect(
        &engine, &QQmlApplicationEngine::objectCreated,
        &app, [url](QObject *obj, const QUrl &objUrl) {
            if (!obj && url == objUrl)
                QCoreApplication::exit(-1);
        },
        Qt::QueuedConnection);

    engine.load(url);
    if (engine.rootObjects().isEmpty())
        return -1;

    return app.exec();
}
