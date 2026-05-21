cmake_minimum_required(VERSION 3.21)

project(PeakFettle
    VERSION 0.1.0
    DESCRIPTION "Peak Fettle - Fitness tracking app (landing + sign-up + set tracking + graphing)"
    LANGUAGES CXX
)

# ----- Standards -----
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Qt-specific automation
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

# ----- Qt 6 -----
# Required modules:
#   Core/Gui/Qml/Quick   -> QML application
#   QuickControls2       -> styled controls (buttons, text fields)
#   Graphs               -> progress graphing (replaces deprecated QtCharts;
#                          Qt Graphs 2D is the supported chart module from
#                          Qt 6.7 onward and is what we install via the
#                          Qt 6.11.x installer's "Qt Graphs" component)
#   Svg                  -> clean mountain logo rendering
find_package(Qt6 6.7 REQUIRED COMPONENTS
    Core
    Gui
    Qml
    Quick
    QuickControls2
    Graphs
    Svg
)

qt_standard_project_setup(REQUIRES 6.5)

# ----- Sources -----
set(PEAK_FETTLE_CPP_SOURCES
    src/main.cpp
    src/set.cpp
    src/exercise.cpp
    src/workouttracker.cpp
    src/usermanager.cpp
    src/UnitPreference.cpp          # TICKET-001: kg/lbs display toggle
    src/ExerciseLibrary.cpp         # bundled exercise library
    src/EffortPreference.cpp        # TICKET-002: RIR show/hide preference
    src/UserProfile.cpp             # 2026-05-03: demographic survey + targets
    src/StrengthCurve.cpp           # 2026-05-03: in-app percentile model v1
)

set(PEAK_FETTLE_CPP_HEADERS
    src/set.h
    src/exercise.h
    src/workouttracker.h
    src/usermanager.h
    src/UnitPreference.h            # TICKET-001: kg/lbs display toggle
    src/ExerciseLibrary.h           # bundled exercise library
    src/EffortPreference.h          # TICKET-002: RIR show/hide preference
    src/UserProfile.h               # 2026-05-03: demographic survey + targets
    src/StrengthCurve.h             # 2026-05-03: in-app percentile model v1
)

qt_add_executable(PeakFettle
    ${PEAK_FETTLE_CPP_SOURCES}
    ${PEAK_FETTLE_CPP_HEADERS}
)

# ----- QML module -----
# Bundles QML files + assets into the binary via Qt's resource system.
qt_add_qml_module(PeakFettle
    URI PeakFettle
    VERSION 1.0
    QML_FILES
        qml/Main.qml
        qml/LandingPage.qml
        qml/SignUpPage.qml
        qml/SetTrackerPage.qml
        qml/ProgressGraphPage.qml
        qml/components/MountainLogo.qml
        qml/components/PrimaryButton.qml
        qml/components/SecondaryButton.qml
        qml/components/ThemedTextField.qml
        qml/components/WeightLabel.qml      # TICKET-001: unit-aware weight display
        qml/components/AvatarButton.qml     # 2026-05-04: avatar replaces gear icon
        qml/SettingsPage.qml                # TICKET-001: settings with unit toggle
        qml/EditSetDialog.qml               # edit existing sets (date, weight, ...)
        qml/ExercisePickerDialog.qml        # TICKET-003: searchable bundled library picker
        qml/OnboardingPage.qml             # TICKET-005: guided first-session onboarding
        qml/HomePage.qml                   # post-auth home dashboard (streaks + summary)
        qml/ProfileSurveyPage.qml          # 2026-05-03: age/sex/years/freq survey step
        qml/PercentilesPage.qml            # 2026-05-03: per-exercise percentile bars
    RESOURCES
        resources/mountain_logo.svg
    IMPORTS
        QtQuick
        QtQuick.Controls
        QtGraphs
)

# Theme.qml is registered as a QML singleton so colors are accessible
# from every QML file via `import PeakFettle 1.0` -> `Theme.<color>`.
set_source_files_properties(qml/Theme.qml
    PROPERTIES QT_QML_SINGLETON_TYPE TRUE
)
qt_target_qml_sources(PeakFettle
    QML_FILES qml/Theme.qml
)

# UnitPreference is a C++ QML_SINGLETON (registered via QML_ELEMENT + QML_SINGLETON
# macros in UnitPreference.h). No manual qmlRegisterSingletonType call is needed;
# qt_add_qml_module handles registration. The singleton factory is
# UnitPreference::create(QQmlEngine*, QJSEngine*).
# NOTE: Do NOT call qmlRegisterSingletonType<UnitPreference> in main.cpp -
# that would double-register and cause a startup abort (see dev-lead.md gotchas).

target_link_libraries(PeakFettle PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Qml
    Qt6::Quick
    Qt6::QuickControls2
    Qt6::Graphs
    Qt6::Svg
)

target_include_directories(PeakFettle PRIVATE src)

# ----- Install -----
include(GNUInstallDirs)
install(TARGETS PeakFettle
    BUNDLE  DESTINATION .
    RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
    LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
)

qt_generate_deploy_qml_app_script(
    TARGET PeakFettle
    OUTPUT_SCRIPT deploy_script
    NO_UNSUPPORTED_PLATFORM_ERROR
)
install(SCRIPT ${deploy_script})
