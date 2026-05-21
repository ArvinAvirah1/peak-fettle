// ---------------------------------------------------------------------------
// Main.qml - root window + StackView navigation.
//
// Navigation flow (only the in-scope screens are wired up):
//
//      LandingPage  --(Get Started)-->   SignUpPage
//                   --(Have account)-->  |
//                                        v
//                                    OnboardingPage  (new users only)
//                                        |
//                                        v
//                                    HomePage  <------- (root after auth)
//                                        |
//                                        v
//                                    SetTrackerPage  <--+
//                                        |              |
//                                        +-->  ProgressGraphPage
//                                        |
//                                        +-->  SettingsPage  (gear icon)
//
// Other tabs/sections from the full Peak Fettle spec (programs, percentile
// ranking, paid plans) are intentionally NOT wired up per the brief.
// ---------------------------------------------------------------------------

import QtQuick
import QtQuick.Controls
import QtQuick.Window
import PeakFettle 1.0

ApplicationWindow {
    id: window
    visible: true

    // Adaptive sizing: opens at a phone-friendly size, but is resizable so it
    // also looks correct as a desktop window.
    width:  420
    height: 820
    minimumWidth:  340
    minimumHeight: 560
    title: "Peak Fettle"
    color: Theme.black

    // Convenience: every page can ask `window.isPhone` for adaptive layout.
    readonly property bool isPhone: Theme.isPhone(width)

    StackView {
        id: stack
        anchors.fill: parent
        initialItem: landingComponent

        // Subtle slide transition between pages.
        pushEnter: Transition {
            NumberAnimation { property: "x"; from: stack.width; to: 0; duration: 220; easing.type: Easing.OutCubic }
            NumberAnimation { property: "opacity"; from: 0; to: 1; duration: 180 }
        }
        pushExit: Transition {
            NumberAnimation { property: "opacity"; from: 1; to: 0; duration: 120 }
        }
        popEnter: Transition {
            NumberAnimation { property: "x"; from: -stack.width / 4; to: 0; duration: 220; easing.type: Easing.OutCubic }
            NumberAnimation { property: "opacity"; from: 0; to: 1; duration: 180 }
        }
        popExit: Transition {
            NumberAnimation { property: "x"; from: 0; to: stack.width; duration: 220; easing.type: Easing.InCubic }
        }
    }

    Component { id: landingComponent;       LandingPage      {} }
    Component { id: signUpComponent;        SignUpPage       {} }
    Component { id: onboardingComponent;    OnboardingPage   {} }   // TICKET-005
    Component { id: homeComponent;          HomePage         {} }   // post-auth root
    Component { id: trackerComponent;       SetTrackerPage   {} }
    Component { id: graphComponent;         ProgressGraphPage{} }
    Component { id: settingsComponent;      SettingsPage     {} }
    // 2026-05-03 additions: profile survey + percentiles.
    Component { id: profileSurveyComponent; ProfileSurveyPage{} }
    Component { id: percentilesComponent;   PercentilesPage  {} }

    // Centralized navigation - pages call window.goTo("signup") etc. so they
    // don't have to know the StackView's component names.
    //
    // The "profileSurvey" route accepts an optional next-route hint via
    // goToWithRoute(); plain goTo("profileSurvey") defaults to "home" so it
    // is safe to call from onboarding's last step.
    function goTo(name) {
        switch (name) {
        case "landing":         stack.replace(null, landingComponent);  break;
        case "signup":          stack.push(signUpComponent);            break;
        case "onboarding":      stack.push(onboardingComponent);        break; // TICKET-005
        case "home":            stack.replace(null, homeComponent);     break; // post-auth root
        case "tracker":         stack.push(trackerComponent);           break; // push so ‹ back returns home
        case "graph":           stack.push(graphComponent);             break;
        case "settings":        stack.push(settingsComponent);          break;
        case "percentiles":     stack.push(percentilesComponent);       break; // 2026-05-03
        case "profileSurvey":   stack.push(profileSurveyComponent);     break; // 2026-05-03
        case "back":            stack.pop();                            break;
        }
    }

    // Same as goTo("profileSurvey") but lets the caller specify what page
    // the survey should advance to on Save. Used by OnboardingPage so the
    // survey -> "home" path stays explicit; SettingsPage uses goTo() for
    // the default "back-after-save" wiring (the "home" default is benign
    // because Settings is itself reachable from Home).
    function goToProfileSurvey(nextRoute) {
        const item = stack.push(profileSurveyComponent);
        if (item && nextRoute) item.nextRoute = nextRoute;
    }
}
