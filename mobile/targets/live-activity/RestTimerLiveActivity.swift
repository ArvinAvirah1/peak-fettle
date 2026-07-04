// PeakFettleRestTimerActivity — TICKET-137
//
// ActivityKit Live Activity for the between-sets rest countdown. Rendered on
// the Lock Screen and (on Dynamic-Island devices) in the Island's compact /
// minimal / expanded presentations.
//
// Data source: the app (src/native/liveActivity.ts) starts/updates/ends this
// activity via a local Expo module (mobile/modules/live-activity — native
// bridge, NOT owned by this file) which calls
// `Activity<RestTimerAttributes>.request(...)` / `.update(...)` / `.end(...)`.
// The countdown text itself is NEVER pushed per-second from JS — it renders
// from a native `Text(timerInterval:)` / `.progressView(timerInterval:)`
// driven by the `endDate` in the content state, so it keeps ticking correctly
// even if the host app is suspended.
//
// Actions: the "+15s" and "Skip" buttons are wired to App Intents defined in
// AppIntents.swift (RestTimerAddIntent / RestTimerSkipIntent). Interactive
// widget buttons require iOS 17+; on iOS 16.1-16.x (Live Activities exist,
// interactive buttons do not) the buttons still render but iOS silently
// treats them as regular non-interactive views — see the availability guard
// below. There is no non-interactive fallback needed beyond that: the
// countdown/progress are still fully visible without the buttons working.

import ActivityKit
import WidgetKit
import SwiftUI

// MARK: - Attributes (mirrors RestActivityContentState in src/native/liveActivity.ts)

struct RestTimerAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// Absolute epoch-seconds the rest period ends. Drives the native countdown text — never updated per second from JS.
        var endEpochMs: Double
        /// Absolute epoch-seconds the rest period started (progress bar 0..1 range).
        var startEpochMs: Double
        var exerciseName: String
        /// Pre-formatted "3 / 5" style string — no locale logic here.
        var setProgress: String
        var nextTarget: String?
        /// True once the countdown has reached 0 — shows a brief "Rest complete" state before the activity ends.
        var finished: Bool
    }

    /// Static across the activity's lifetime — currently unused but required by the protocol; kept for a future
    /// per-activity identifier if multiple concurrent activities are ever supported.
    var sessionId: String
}

private extension RestTimerAttributes.ContentState {
    var endDate: Date { Date(timeIntervalSince1970: endEpochMs / 1000) }
    var startDate: Date { Date(timeIntervalSince1970: startEpochMs / 1000) }
}

// MARK: - Colour helpers (mirrors targets/widget/index.swift's approach)

private let accent = Color("$accent")
private let activityBg = Color("$activityBackground")

// MARK: - Lock Screen / Banner UI

struct RestTimerLockScreenView: View {
    let context: ActivityViewContext<RestTimerAttributes>

    var body: some View {
        let state = context.state
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(state.finished ? "Rest complete" : "RESTING")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.white.opacity(0.7))
                    Text(state.exerciseName)
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                }
                Spacer()
                if state.finished {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 28))
                        .foregroundColor(accent)
                } else {
                    Text(timerInterval: Date.now...state.endDate, countsDown: true)
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                        .foregroundColor(accent)
                        .monospacedDigit()
                        .frame(minWidth: 64)
                }
            }

            if !state.finished {
                ProgressView(timerInterval: state.startDate...state.endDate, countsDown: false)
                    .tint(accent)
            }

            HStack {
                Text(state.setProgress)
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.6))
                Spacer()
                if let next = state.nextTarget {
                    Text("Next: \(next)")
                        .font(.system(size: 12))
                        .foregroundColor(.white.opacity(0.6))
                        .lineLimit(1)
                }
            }

            if !state.finished {
                HStack(spacing: 10) {
                    if #available(iOSApplicationExtension 17.0, *) {
                        Button(intent: RestTimerAddIntent(activityId: context.activityID)) {
                            Label("+15s", systemImage: "plus.circle.fill")
                                .font(.system(size: 13, weight: .semibold))
                        }
                        .buttonStyle(.bordered)
                        .tint(accent)

                        Button(intent: RestTimerSkipIntent(activityId: context.activityID)) {
                            Label("Skip", systemImage: "forward.fill")
                                .font(.system(size: 13, weight: .semibold))
                        }
                        .buttonStyle(.bordered)
                        .tint(.white.opacity(0.7))
                    }
                }
            }
        }
        .padding(16)
        .activityBackgroundTint(activityBg)
        .activitySystemActionForegroundColor(.white)
    }
}

// MARK: - Dynamic Island

struct RestTimerLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestTimerAttributes.self) { context in
            RestTimerLockScreenView(context: context)
        } dynamicIsland: { context in
            let state = context.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(state.finished ? "Rest complete" : "Resting")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.secondary)
                        Text(state.exerciseName)
                            .font(.system(size: 15, weight: .bold))
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if state.finished {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(accent)
                    } else {
                        Text(timerInterval: Date.now...state.endDate, countsDown: true)
                            .font(.system(size: 22, weight: .bold, design: .rounded))
                            .foregroundColor(accent)
                            .monospacedDigit()
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text(state.setProgress).font(.system(size: 12)).foregroundColor(.secondary)
                            Spacer()
                            if let next = state.nextTarget {
                                Text("Next: \(next)").font(.system(size: 12)).foregroundColor(.secondary).lineLimit(1)
                            }
                        }
                        if !state.finished {
                            ProgressView(timerInterval: state.startDate...state.endDate, countsDown: false)
                                .tint(accent)
                            if #available(iOSApplicationExtension 17.0, *) {
                                HStack(spacing: 10) {
                                    Button(intent: RestTimerAddIntent(activityId: context.activityID)) {
                                        Label("+15s", systemImage: "plus.circle.fill")
                                    }
                                    .buttonStyle(.bordered)
                                    .tint(accent)
                                    Button(intent: RestTimerSkipIntent(activityId: context.activityID)) {
                                        Label("Skip", systemImage: "forward.fill")
                                    }
                                    .buttonStyle(.bordered)
                                }
                            }
                        }
                    }
                }
            } compactLeading: {
                Image(systemName: "timer")
                    .foregroundColor(accent)
            } compactTrailing: {
                if state.finished {
                    Image(systemName: "checkmark")
                        .foregroundColor(accent)
                } else {
                    Text(timerInterval: Date.now...state.endDate, countsDown: true)
                        .font(.system(size: 14, weight: .semibold, design: .rounded))
                        .foregroundColor(accent)
                        .monospacedDigit()
                        .frame(maxWidth: 44)
                }
            } minimal: {
                Image(systemName: "timer")
                    .foregroundColor(accent)
            }
            .widgetURL(URL(string: "peak-fettle://"))
            .keylineTint(accent)
        }
    }
}

// MARK: - Bundle

@main
struct PeakFettleRestTimerActivityBundle: WidgetBundle {
    var body: some Widget {
        RestTimerLiveActivityWidget()
    }
}
