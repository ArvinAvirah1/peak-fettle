// LiveActivityModule.swift — TICKET-137 host-side native bridge for the
// rest-timer Live Activity (ActivityKit / Dynamic Island).
//
// This is the "mobile/modules/live-activity" module referenced by:
//   - src/native/liveActivity.ts (the JS facade; documents the full
//     contract in its header comment — this file implements that contract)
//   - targets/live-activity/RestTimerLiveActivity.swift (the widget-extension
//     UI; declares RestTimerAttributes — mirrored byte-for-byte below,
//     required because ActivityKit matches attributes between the host app
//     and the extension by type name + Codable encoding)
//   - targets/live-activity/AppIntents.swift (writes the +15s/Skip action
//     record to the shared App Group + posts the Darwin notification that
//     this module observes)
//
// ActivityKit MUST be driven from the host app process — a widget extension
// cannot start/update/end its own Live Activity. Hence this bridge exists
// separately from the widget-extension target.
//
// Everything here is availability-guarded (iOS 16.1+) and never throws for
// unavailability: on older iOS / non-iOS this module either isn't loaded at
// all (Platform.OS check in the JS facade) or every function resolves to a
// harmless null/no-op so the rest timer itself keeps working with zero
// native side (see the facade's design rules).

import ExpoModulesCore
import Foundation
import ActivityKit

// MARK: - Attributes (MUST mirror RestTimerAttributes in
// targets/live-activity/RestTimerLiveActivity.swift byte-for-byte — same
// type name, same field names/types, same Codable encoding. ActivityKit
// matches the host app's and the extension's attribute types by this
// encoding; any mismatch means the activity silently never renders.)

struct RestTimerAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var endEpochMs: Double
        var startEpochMs: Double
        var exerciseName: String
        var setProgress: String
        var nextTarget: String?
        var finished: Bool
    }

    var sessionId: String
}

// MARK: - JSON payload decoding (mirrors RestActivityContentState in
// src/native/liveActivity.ts — the facade JSON.stringify()s this exact shape
// before calling into startActivity/updateActivity/endActivity).

private struct RestActivityPayload: Codable {
    var endEpochMs: Double
    var startEpochMs: Double
    var exerciseName: String
    var setProgress: String
    var nextTarget: String?
    var finished: Bool
}

@available(iOS 16.1, *)
private func decodePayload(_ json: String) -> RestActivityPayload? {
    guard let data = json.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(RestActivityPayload.self, from: data)
}

@available(iOS 16.1, *)
private func contentState(from payload: RestActivityPayload) -> RestTimerAttributes.ContentState {
    RestTimerAttributes.ContentState(
        endEpochMs: payload.endEpochMs,
        startEpochMs: payload.startEpochMs,
        exerciseName: payload.exerciseName,
        setProgress: payload.setProgress,
        nextTarget: payload.nextTarget,
        finished: payload.finished
    )
}

// A grace margin added on top of the JS-provided end date for the
// activity's staleDate — a stale-activity guard so the system knows when to
// treat the content as outdated if the app never sends another update
// (e.g. backgrounded mid-rest). Purely a staleness hint to ActivityKit; the
// countdown text itself always renders from endEpochMs via
// Text(timerInterval:) in the widget-extension UI, never from this margin.
private let staleGraceMs: Double = 30_000

// MARK: - App Group / Darwin notification constants (MUST mirror
// targets/live-activity/AppIntents.swift exactly).

private let appGroup = "group.com.peakfettle.app"
private let actionKey = "rest_timer_pending_action"
private let darwinNotificationName = "com.peakfettle.app.restTimerAction" as CFString

// MARK: - Module

public class LiveActivityModule: Module {
    // Retained observer token so we can remove it in OnDestroy (the Swift
    // closure-based CFNotificationCenter API needs a stable observer
    // pointer — `self` — passed at registration time).
    private var darwinObserverRegistered = false

    public func definition() -> ModuleDefinition {
        Name("LiveActivityModule")

        Events("onRestTimerAction")

        OnCreate {
            self.registerDarwinObserver()
        }

        OnDestroy {
            self.unregisterDarwinObserver()
        }

        AsyncFunction("startActivity") { (payloadJson: String) -> String? in
            guard #available(iOS 16.1, *) else { return nil }
            guard ActivityAuthorizationInfo().areActivitiesEnabled else { return nil }
            guard let payload = decodePayload(payloadJson) else { return nil }

            let attributes = RestTimerAttributes(sessionId: UUID().uuidString)
            let state = contentState(from: payload)
            let staleDate = Date(timeIntervalSince1970: (payload.endEpochMs + staleGraceMs) / 1000)

            do {
                let activity = try Activity<RestTimerAttributes>.request(
                    attributes: attributes,
                    contentState: state,
                    pushType: nil,
                    staleDate: staleDate
                )
                return activity.id
            } catch {
                return nil
            }
        }

        AsyncFunction("updateActivity") { (activityId: String, payloadJson: String) -> Void in
            guard #available(iOS 16.1, *) else { return }
            guard let payload = decodePayload(payloadJson) else { return }
            guard let activity = LiveActivityModule.findActivity(activityId) else { return }

            let state = contentState(from: payload)
            let staleDate = Date(timeIntervalSince1970: (payload.endEpochMs + staleGraceMs) / 1000)
            await activity.update(
                ActivityContent(state: state, staleDate: staleDate)
            )
        }

        AsyncFunction("endActivity") { (activityId: String, finalPayloadJson: String?) -> Void in
            guard #available(iOS 16.1, *) else { return }
            guard let activity = LiveActivityModule.findActivity(activityId) else { return }

            if let finalJson = finalPayloadJson, let payload = decodePayload(finalJson) {
                let state = contentState(from: payload)
                await activity.end(
                    ActivityContent(state: state, staleDate: nil),
                    dismissalPolicy: .default
                )
            } else {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }

        AsyncFunction("endAllActivities") { () -> Void in
            guard #available(iOS 16.1, *) else { return }
            for activity in Activity<RestTimerAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }

        AsyncFunction("readPendingAction") { () -> String? in
            return LiveActivityModule.consumePendingAction()
        }
    }

    // MARK: - Activity lookup

    @available(iOS 16.1, *)
    private static func findActivity(_ activityId: String) -> Activity<RestTimerAttributes>? {
        Activity<RestTimerAttributes>.activities.first { $0.id == activityId }
    }

    // MARK: - App Group action record (shared with AppIntents.swift)

    /// Reads + clears the pending action record. Safe to call with no record
    /// present (returns nil). Shared by both the Darwin-notification fire
    /// path and the cold-launch `readPendingAction()` catch-up path.
    private static func consumePendingAction() -> String? {
        guard let defaults = UserDefaults(suiteName: appGroup) else { return nil }
        guard let json = defaults.string(forKey: actionKey) else { return nil }
        defaults.removeObject(forKey: actionKey)
        return json
    }

    // MARK: - Darwin notification observer
    //
    // App Intents run in the widget extension's process and cannot call
    // back into the host app directly; AppIntents.swift posts a Darwin
    // notification as the only available cross-process wake-up signal, after
    // writing the action JSON into the shared App Group. We observe that
    // notification here for as long as the host app process is alive, and
    // additionally expose `readPendingAction()` above for the case where the
    // action was written while the app was fully killed (no observer yet).

    private func registerDarwinObserver() {
        guard !darwinObserverRegistered else { return }
        darwinObserverRegistered = true

        let observer = Unmanaged.passUnretained(self).toOpaque()
        CFNotificationCenterAddObserver(
            CFNotificationCenterGetDarwinNotifyCenter(),
            observer,
            { (_, observer, _, _, _) in
                guard let observer = observer else { return }
                let module = Unmanaged<LiveActivityModule>.fromOpaque(observer).takeUnretainedValue()
                module.handleDarwinNotification()
            },
            darwinNotificationName,
            nil,
            .deliverImmediately
        )
    }

    private func unregisterDarwinObserver() {
        guard darwinObserverRegistered else { return }
        darwinObserverRegistered = false
        let observer = Unmanaged.passUnretained(self).toOpaque()
        CFNotificationCenterRemoveObserver(
            CFNotificationCenterGetDarwinNotifyCenter(),
            observer,
            CFNotificationName(darwinNotificationName),
            nil
        )
    }

    private func handleDarwinNotification() {
        guard let json = LiveActivityModule.consumePendingAction() else { return }
        sendEvent("onRestTimerAction", ["payload": json])
    }
}
