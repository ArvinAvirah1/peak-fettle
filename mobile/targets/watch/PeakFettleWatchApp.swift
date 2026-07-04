// PeakFettleWatchApp.swift -- TICKET-140 Stage A watch app entry point.
//
// Architecture (audits/TICKET-140-watch-sync-architecture-2026-07-04.md):
// the phone is ALWAYS present and is the only source of truth. This app is a
// pure mirror/remote -- it holds no local store of its own and performs no
// sync merge. Everything it shows comes from the last applicationContext the
// phone pushed (WatchSessionManager below); it never talks REST.

import SwiftUI

@main
struct PeakFettleWatchApp: App {
    @StateObject private var session = WatchSessionManager.shared

    var body: some Scene {
        WindowGroup {
            TodayView()
                .environmentObject(session)
        }
    }
}
