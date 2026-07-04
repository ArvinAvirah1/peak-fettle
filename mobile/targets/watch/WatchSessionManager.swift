// WatchSessionManager.swift -- TICKET-140 Stage A: the WATCH side of the
// WatchConnectivity bridge (mirror image of
// mobile/modules/watch-connectivity/ios/WatchConnectivityModule.swift, which
// is the PHONE side).
//
// Responsibilities (per the architecture doc -- Stage A scope only):
//   1. Activate WCSession on launch.
//   2. Receive applicationContext pushes from the phone (the mirror payload)
//      and publish them as @Published state for TodayView to render.
//   3. On activation, send the phone a `{"type":"refresh"}` message so a
//      fresh watch launch always gets the latest state immediately, rather
//      than waiting for the phone's next foreground/save-triggered push.
//
// This class does ZERO interpretation of the payload beyond JSON decoding --
// no unit conversion, no "what does done mean" logic, nothing. Every display
// string it renders (weightLabel, repsLabel) was already formatted on the
// phone (constants/units.ts formatWeight) -- see the architecture doc's
// "no unit/locale logic in Swift" rule.

import Foundation
import WatchConnectivity
import Combine

// MARK: - Payload model (mirrors WatchMirrorPayload in
// src/hooks/watchMirrorPayload.ts byte-for-byte -- keep in sync.)

struct WatchExerciseMirror: Codable, Identifiable {
    var id: String { name }
    let name: String
    let sets: Int
    let repsLabel: String
    let weightLabel: String?
    let done: Bool
}

struct WatchTodayMirror: Codable {
    let workoutName: String
    let exercises: [WatchExerciseMirror]
}

struct WatchMirrorPayload: Codable {
    let v: Int
    let generatedAt: String
    let today: WatchTodayMirror?
}

// MARK: - Session manager

final class WatchSessionManager: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = WatchSessionManager()

    /// nil = no payload received yet this launch (distinct from `today: nil`,
    /// which means "the phone confirmed there's no scheduled workout / it's a
    /// rest day"). TodayView tells these apart to show the right empty state.
    @Published private(set) var payload: WatchMirrorPayload?
    @Published private(set) var isReachable: Bool = false

    private override init() {
        super.init()
        activate()
    }

    private func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    // MARK: WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async {
            self.isReachable = session.isReachable
        }
        // On-activate handshake: ask the phone to re-push its current state.
        // Policy (what "refresh" means, what to send back) lives entirely on
        // the phone side -- this watch never decides what data it needs.
        requestRefresh()

        // A context may already be sitting from a previous phone push before
        // this activation completed -- pick it up immediately rather than
        // waiting for the next push.
        applyContext(session.receivedApplicationContext)
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async {
            self.isReachable = session.isReachable
        }
        if session.isReachable {
            requestRefresh()
        }
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        applyContext(applicationContext)
    }

    // MARK: - Context handling

    private func applyContext(_ context: [String: Any]) {
        guard let json = context["payload"] as? String,
              let data = json.data(using: .utf8) else { return }
        guard let decoded = try? JSONDecoder().decode(WatchMirrorPayload.self, from: data) else { return }
        DispatchQueue.main.async {
            self.payload = decoded
        }
    }

    /// Sends the on-activate/reachability-change refresh handshake. Fire-and-
    /// forget -- if the phone app isn't reachable right now, WCSession simply
    /// fails this send silently; the next applicationContext push (or the next
    /// reachability change) will catch the watch up regardless.
    private func requestRefresh() {
        guard WCSession.default.activationState == .activated else { return }
        guard WCSession.default.isReachable else { return }
        WCSession.default.sendMessage(["type": "refresh"], replyHandler: nil, errorHandler: nil)
    }
}
