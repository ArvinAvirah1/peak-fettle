// AppIntents.swift — TICKET-145 Siri / App Intents voice logging +
// interactive widget buttons.
//
// WHY these live in the WIDGET extension (not a separate `app-intent`
// ExtensionKit target, and not the main app target):
//   - @bacons/apple-targets' `widget` extension type already bundles the
//     AppIntents framework (see expo-target.config.js) and this repo already
//     proves the exact round-trip mechanism these intents need — see
//     targets/live-activity/AppIntents.swift (TICKET-137's +15s/Skip
//     buttons), which this file mirrors line-for-line in spirit.
//   - Widget-button-triggered intents (the interactive "Start workout" /
//     "Start rest" buttons on PeakFettleWidget, iOS 17+) MUST run inside a
//     widget extension per Apple's design — `Button(intent:)` inside a
//     WidgetKit view can only invoke an AppIntent from the SAME extension
//     bundle (or the main app, but then a widget tap would need to launch
//     the app, which defeats the "no app switch" point of interactive
//     widgets). Co-locating the Siri-only intents (LogSetIntent) here too
//     avoids a second extension target, a second Info.plist, and a second
//     App-Group-round-trip implementation to maintain.
//   - `AppIntent` structs declared in a widget extension ARE discoverable
//     system-wide by Siri/Shortcuts as long as they're exposed via an
//     `AppShortcutsProvider` (below) — they do not require the app itself to
//     be foregrounded, matching the "Hey Siri, log 8 reps at 100 kilos"
//     goal in TICKET-145.
//
// ROUND-TRIP MECHANISM (identical shape to targets/live-activity/AppIntents.swift):
//   1. perform() writes a small JSON action record to the shared App Group
//      (`group.com.peakfettle.app`) under INTENT_ACTION_KEY:
//        {"intent":"logSet"|"startWorkout"|"startRest","payload":{...},"ts":...}
//   2. Posts the Darwin notification `com.peakfettle.app.intentAction` as the
//      cross-process wake-up signal (a plain UserDefaults write does not
//      itself notify anyone).
//   3. The host app's native module (documented as pending in
//      mobile/src/native/liveActivity.ts's header, reused for this feature
//      too — see mobile/src/lib/intents/intentBridge.ts's header) observes
//      the Darwin name and forwards the record into JS. Until that native
//      observer exists, mobile/src/lib/intents/intentBridge.ts still picks
//      the record up via foreground/cold-start polling of the SAME App
//      Group key — nothing is lost, delivery is just not instant while the
//      app is fully backgrounded.
//   4. intentBridge.ts parses the record, runs it through the PURE handler
//      layer in intentHandlers.ts (weight-unit conversion, exercise/routine
//      resolution, graceful-failure copy), and applies the result to the
//      LOCAL data layer only — no REST on any tier (TICKET-145 spec).
//
// Weight units: Siri parses "one hundred" as the plain number 100 with no
// unit context of its own, so LogSetIntent's `weight` parameter is unitless
// on the wire — intentHandlers.ts's `handleLogSetIntent` converts it using
// the user's ACTUAL display-unit preference (read on the JS side from
// AsyncStorage/local profile, not guessed here), via constants/units.ts's
// displayToKg(). This file must never do the kg/lb math itself.

import AppIntents
import WidgetKit
import Foundation

private let appGroup = "group.com.peakfettle.app"
private let intentActionKey = "intent_pending_action"
private let intentDarwinNotificationName = "com.peakfettle.app.intentAction" as CFString

private func postIntentAction(_ intent: String, payload: [String: Any]) {
    let record: [String: Any] = [
        "intent": intent,
        "payload": payload,
        "ts": Date().timeIntervalSince1970 * 1000,
    ]
    if let data = try? JSONSerialization.data(withJSONObject: record),
       let json = String(data: data, encoding: .utf8),
       let defaults = UserDefaults(suiteName: appGroup) {
        defaults.set(json, forKey: intentActionKey)
    }
    CFNotificationCenterPostNotification(
        CFNotificationCenterGetDarwinNotifyCenter(),
        CFNotificationName(intentDarwinNotificationName),
        nil, nil, true
    )
}

// MARK: - LogSetIntent

@available(iOSApplicationExtension 16.0, *)
struct LogSetIntent: AppIntent {
    static var title: LocalizedStringResource = "Log a Set"
    static var description = IntentDescription("Logs reps and weight to your current exercise in Peak Fettle.")
    // Opens nothing — this is a "background" intent (no host-app UI needed);
    // Siri confirms verbally using the value returned from perform().
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Reps")
    var reps: Int

    @Parameter(title: "Weight")
    var weight: Double

    @Parameter(title: "Exercise", default: nil)
    var exercise: String?

    static var parameterSummary: some ParameterSummary {
        Summary("Log \(\.$reps) reps at \(\.$weight) for \(\.$exercise)")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        var payload: [String: Any] = ["reps": reps, "weight": weight]
        if let exercise, !exercise.isEmpty {
            payload["exercise"] = exercise
        }
        postIntentAction("logSet", payload: payload)
        // The action record is picked up asynchronously by the host app (see
        // this file's header); Siri gets an immediate, optimistic
        // confirmation rather than blocking on the JS round-trip, since the
        // extension has no reliable way to await the host app's response.
        return .result(dialog: "Got it — logging that now.")
    }
}

// MARK: - StartWorkoutIntent

@available(iOSApplicationExtension 16.0, *)
struct StartWorkoutIntent: AppIntent {
    static var title: LocalizedStringResource = "Start a Workout"
    static var description = IntentDescription("Starts today's workout in Peak Fettle, optionally naming a routine.")
    static var openAppWhenRun: Bool = true // starting a workout is the one intent worth foregrounding the app for

    @Parameter(title: "Routine", default: nil)
    var routine: String?

    static var parameterSummary: some ParameterSummary {
        Summary("Start \(\.$routine)")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        var payload: [String: Any] = [:]
        if let routine, !routine.isEmpty {
            payload["routine"] = routine
        }
        postIntentAction("startWorkout", payload: payload)
        return .result(dialog: routine?.isEmpty == false ? "Starting \(routine!)." : "Starting your workout.")
    }
}

// MARK: - StartRestIntent

@available(iOSApplicationExtension 16.0, *)
struct StartRestIntent: AppIntent {
    static var title: LocalizedStringResource = "Start a Rest Timer"
    static var description = IntentDescription("Starts the rest timer in Peak Fettle, optionally for a given number of seconds.")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Seconds", default: nil)
    var seconds: Int?

    static var parameterSummary: some ParameterSummary {
        Summary("Rest for \(\.$seconds) seconds")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        var payload: [String: Any] = [:]
        if let seconds {
            payload["seconds"] = seconds
        }
        postIntentAction("startRest", payload: payload)
        return .result(dialog: seconds != nil ? "Resting for \(seconds!) seconds." : "Starting your rest timer.")
    }
}

// MARK: - Siri phrase suggestions (surfaced in Settings + Shortcuts app)

@available(iOSApplicationExtension 16.0, *)
struct PeakFettleShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: LogSetIntent(),
            phrases: [
                "Log a set in \(.applicationName)",
                "Log a set with \(.applicationName)",
                "\(.applicationName) log a set",
            ],
            shortTitle: "Log a Set",
            systemImageName: "dumbbell.fill"
        )
        AppShortcut(
            intent: StartWorkoutIntent(),
            phrases: [
                "Start a workout in \(.applicationName)",
                "Start my workout with \(.applicationName)",
                "\(.applicationName) start workout",
            ],
            shortTitle: "Start a Workout",
            systemImageName: "figure.strengthtraining.traditional"
        )
        AppShortcut(
            intent: StartRestIntent(),
            phrases: [
                "Start rest in \(.applicationName)",
                "Start my rest timer with \(.applicationName)",
                "\(.applicationName) start rest timer",
            ],
            shortTitle: "Start Rest Timer",
            systemImageName: "timer"
        )
    }
}

// MARK: - Widget button intents (interactive widgets, iOS 17+)
//
// These wrap StartWorkoutIntent/StartRestIntent with FIXED defaults suitable
// for a one-tap widget button (no dictation/parameters to fill in), since a
// widget button cannot present Siri's parameter-resolution UI. The widget
// button intents deliberately do NOT open the app (openAppWhenRun = false)
// so tapping stays "in place" on the Home/Lock screen — the host app picks
// up the resulting action record next time it's foregrounded, same as any
// other intent above.

@available(iOSApplicationExtension 17.0, *)
struct WidgetStartWorkoutIntent: AppIntent {
    static var title: LocalizedStringResource = "Start Next Workout"
    static var description = IntentDescription("Starts today's scheduled workout from the widget.")
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult {
        postIntentAction("startWorkout", payload: [:])
        return .result()
    }
}

@available(iOSApplicationExtension 17.0, *)
struct WidgetStartRestIntent: AppIntent {
    static var title: LocalizedStringResource = "Start Rest"
    static var description = IntentDescription("Starts the default rest timer from the widget.")
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult {
        postIntentAction("startRest", payload: [:])
        return .result()
    }
}
