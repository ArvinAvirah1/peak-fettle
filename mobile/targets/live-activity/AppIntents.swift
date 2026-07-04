// AppIntents.swift — TICKET-137 round-trip actions for the rest-timer Live
// Activity ("+15s" / "Skip" buttons in RestTimerLiveActivity.swift).
//
// WHY App Intents + App Group + Darwin notification (documented once here;
// mirrored in src/native/liveActivity.ts's header comment):
//   App Intents run IN-PROCESS inside the widget extension when tapped from
//   a Live Activity/Dynamic Island button — they do NOT launch or message
//   the host app directly. The only way to hand data back to the host app
//   is a mechanism both processes can reach: here, the shared App Group's
//   UserDefaults (already used for the home-screen widget payload — see
//   targets/widget/index.swift) plus a Darwin notification
//   (CFNotificationCenterPostNotification) as the cross-process wake-up
//   signal, since a plain UserDefaults write does not itself notify anyone.
//
//   perform() therefore:
//     1. Writes a small JSON action record to the App Group under
//        REST_TIMER_ACTION_KEY: {"action":"add15"|"skip","activityId":...,"ts":...}
//     2. Posts the Darwin notification named by REST_TIMER_DARWIN_NOTIFICATION.
//   The host app's native module (mobile/modules/live-activity, Swift, NOT
//   owned by this file) observes that Darwin name via
//   CFNotificationCenterAddObserver at module init, reads + clears the
//   record, and forwards it to JS as an Expo Modules event. If the app was
//   fully killed, the record still sits in the App Group and is picked up by
//   the module's cold-start catch-up read (see liveActivity.ts's
//   `readPendingAction`).

import AppIntents
import Foundation

private let appGroup = "group.com.peakfettle.app"
private let actionKey = "rest_timer_pending_action"
private let darwinNotificationName = "com.peakfettle.app.restTimerAction" as CFString

private func postAction(_ action: String, activityId: String) {
    let record: [String: Any] = [
        "action": action,
        "activityId": activityId,
        "ts": Date().timeIntervalSince1970 * 1000,
    ]
    if let data = try? JSONSerialization.data(withJSONObject: record),
       let json = String(data: data, encoding: .utf8),
       let defaults = UserDefaults(suiteName: appGroup) {
        defaults.set(json, forKey: actionKey)
    }
    CFNotificationCenterPostNotification(
        CFNotificationCenterGetDarwinNotifyCenter(),
        CFNotificationName(darwinNotificationName),
        nil, nil, true
    )
}

@available(iOSApplicationExtension 17.0, *)
struct RestTimerAddIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Add 15 seconds"
    static var description = IntentDescription("Extends the current rest period by 15 seconds.")

    @Parameter(title: "Activity ID")
    var activityId: String

    init() {}
    init(activityId: String) {
        self.activityId = activityId
    }

    func perform() async throws -> some IntentResult {
        postAction("add15", activityId: activityId)
        return .result()
    }
}

@available(iOSApplicationExtension 17.0, *)
struct RestTimerSkipIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Skip rest"
    static var description = IntentDescription("Ends the current rest period immediately.")

    @Parameter(title: "Activity ID")
    var activityId: String

    init() {}
    init(activityId: String) {
        self.activityId = activityId
    }

    func perform() async throws -> some IntentResult {
        postAction("skip", activityId: activityId)
        return .result()
    }
}
