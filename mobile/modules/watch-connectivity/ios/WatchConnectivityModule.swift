// WatchConnectivityModule.swift -- TICKET-140 Stage A host-side native bridge
// for the paired Apple Watch app.
//
// This is the "mobile/modules/watch-connectivity" module referenced by:
//   - src/native/watchBridge.ts (the JS facade; documents the full contract
//     in its header comment -- this file implements that contract)
//   - mobile/targets/watch/ (the watchOS SwiftUI app; its WCSession delegate
//     lives in the watch target, NOT here -- this file is the PHONE side)
//
// Architecture invariant (audits/TICKET-140-watch-sync-architecture-2026-07-04.md):
// the watch is a pure mirror and NEVER talks REST. This module only ever:
//   1. Pushes an already-JSON-encoded payload via applicationContext (the
//      JS side, useWatchMirror.ts, builds the payload and formats every
//      display string -- no unit/locale logic here).
//   2. Relays inbound WCSession messages (sendMessage from the watch) back
//      to JS as an event, with zero interpretation -- the JS facade parses
//      + the useWatchMirror.ts hook decides what a message means.
//
// Everything here is availability-guarded (iOS 16.1+, matching the rest of
// this app's native targets) and never throws for unavailability: on
// simulators / iPads / devices without a paired Watch, WCSession activation
// still succeeds (it just never reaches .activated with a paired watch), and
// every function resolves to a safe false/no-op.

import ExpoModulesCore
import Foundation
import WatchConnectivity

public class WatchConnectivityModule: Module {
    public func definition() -> ModuleDefinition {
        Name("WatchConnectivityModule")

        Events("onWatchMessage")

        OnCreate {
            WatchSessionHost.shared.activate(emitter: self)
        }

        AsyncFunction("isSupported") { () -> Bool in
            WCSession.isSupported()
        }

        AsyncFunction("isPaired") { () -> Bool in
            guard WCSession.isSupported() else { return false }
            return WCSession.default.isPaired
        }

        AsyncFunction("isWatchAppInstalled") { () -> Bool in
            guard WCSession.isSupported() else { return false }
            return WCSession.default.isWatchAppInstalled
        }

        AsyncFunction("updateApplicationContext") { (payloadJson: String) -> Void in
            guard WCSession.isSupported() else { return }
            let session = WCSession.default
            guard session.activationState == .activated else { return }
            do {
                try session.updateApplicationContext(["payload": payloadJson])
            } catch {
                // Best-effort, mirrors the JS facade's try/caught discipline --
                // a failed push just means the watch shows stale data until the
                // next successful applicationContext update.
            }
        }
    }
}

// MARK: - Session host
//
// A singleton WCSessionDelegate that outlives any single module instance
// (Expo Modules can tear down/recreate the Module wrapper; WCSession itself
// must stay activated once for the process lifetime). Emits events through
// whichever WatchConnectivityModule instance last called activate() --
// Expo's sendEvent requires a live Module/Events registration, and there is
// only ever one JS-visible module instance in practice.
private final class WatchSessionHost: NSObject, WCSessionDelegate {
    static let shared = WatchSessionHost()

    private weak var emitter: WatchConnectivityModule?
    private var activated = false

    func activate(emitter: WatchConnectivityModule) {
        self.emitter = emitter
        guard WCSession.isSupported() else { return }
        guard !activated else { return }
        activated = true
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    // MARK: WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        // No JS-visible side effect required on activation itself -- the watch
        // side initiates the refresh handshake (sendMessage {type:'refresh'})
        // once ITS session activates, which arrives via didReceiveMessage below.
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        // Re-activate for a new paired Watch (Apple's documented requirement
        // when switching watches while the phone app stays alive).
        session.activate()
    }

    // Reachability changes are surfaced to JS as a generic refresh request --
    // POLICY (what to push, when) lives in useWatchMirror.ts, not here. This
    // keeps the native module a dumb transport, matching the architecture
    // doc's "no unit/locale logic in Swift" rule extended to "no policy in
    // Swift" for the sync trigger too.
    func sessionReachabilityDidChange(_ session: WCSession) {
        guard session.isReachable else { return }
        emitRefresh()
    }

    // sendMessage (no reply expected) -- Stage A only defines the watch's
    // on-activate {type:'refresh'} handshake; forwarded verbatim as JSON.
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        emit(message)
    }

    // sendMessage variant with a reply handler -- Stage A has no watch->phone
    // request that expects a reply, but WCSessionDelegate requires handling
    // both forms; reply with an empty ack so the watch's send never hangs.
    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        emit(message)
        replyHandler([:])
    }

    private func emit(_ message: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: message),
              let json = String(data: data, encoding: .utf8) else { return }
        emitter?.sendEvent("onWatchMessage", ["json": json])
    }

    private func emitRefresh() {
        emitter?.sendEvent("onWatchMessage", ["json": "{\"type\":\"refresh\"}"])
    }
}
