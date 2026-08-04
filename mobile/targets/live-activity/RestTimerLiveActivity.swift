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
// interactive buttons do not) the lock screen shows a non-interactive
// "open the app" hint in their place (WATCH-19) — the countdown/progress
// are still fully visible either way.

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

    /// True once the countdown is over — either JS marked it finished, or the
    /// end date has already passed (timer expired while the app was suspended
    /// and no update ever arrived). WATCH-01: every timer view must branch on
    /// this instead of `finished` alone.
    var isComplete: Bool { finished || endDate <= Date.now }

    /// WATCH-01 crash guard: `Date.now...endDate` TRAPS (ClosedRange precondition)
    /// when `endDate < now` — which happens whenever the countdown hits 0 while
    /// the app is backgrounded. Clamp the lower bound so the range is always valid.
    var countdownRange: ClosedRange<Date> { min(Date.now, endDate)...endDate }

    /// Same clamp for the progress bar's start...end range.
    var progressRange: ClosedRange<Date> { min(startDate, endDate)...endDate }
}

// MARK: - Colour helpers (mirrors targets/widget/index.swift's approach)

private let accent = Color("$accent")
private let activityBg = Color("$activityBackground")

// WATCH-14: opacity for stale content. The host app sets a staleDate
// (endDate + 30s grace) on every update; once the system flags the context
// stale, dim the timer UI so it no longer reads as live. `isStale` is
// iOS 16.2+ while this target deploys to 16.1, hence the availability guard
// (pre-16.2 simply never dims).
private func staleDim(_ context: ActivityViewContext<RestTimerAttributes>) -> Double {
    if #available(iOSApplicationExtension 16.2, *), context.isStale {
        return 0.55
    }
    return 1.0
}

// MARK: - Lock Screen / Banner UI

struct RestTimerLockScreenView: View {
    let context: ActivityViewContext<RestTimerAttributes>

    var body: some View {
        let state = context.state
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(state.isComplete ? "Rest complete" : "RESTING")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.white.opacity(0.7))
                    Text(state.exerciseName)
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                }
                Spacer()
                if state.isComplete {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 28))
                        .foregroundColor(accent)
                } else {
                    Text(timerInterval: state.countdownRange, countsDown: true)
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                        .foregroundColor(accent)
                        .monospacedDigit()
                        .frame(minWidth: 64)
                }
            }

            if !state.isComplete {
                ProgressView(timerInterval: state.progressRange, countsDown: false)
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

            if !state.isComplete {
                // WATCH-19: interactive widget buttons need iOS 17+. On 16.1-16.x
                // the old guard-inside-the-HStack rendered an empty row; show a
                // non-interactive hint instead of dead space.
                if #available(iOSApplicationExtension 17.0, *) {
                    HStack(spacing: 10) {
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
                } else {
                    Text("Open Peak Fettle to add time or skip")
                        .font(.system(size: 11))
                        .foregroundColor(.white.opacity(0.5))
                }
            }
        }
        .padding(16)
        // WATCH-14: staleDate passed (endDate + grace) — once the system marks
        // the content stale, dim the whole card so it no longer reads as live.
        .opacity(staleDim(context))
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
                        Text(state.isComplete ? "Rest complete" : "Resting")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.secondary)
                        Text(state.exerciseName)
                            .font(.system(size: 15, weight: .bold))
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if state.isComplete {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(accent)
                    } else {
                        Text(timerInterval: state.countdownRange, countsDown: true)
                            .font(.system(size: 22, weight: .bold, design: .rounded))
                            .foregroundColor(accent)
                            .monospacedDigit()
                            .opacity(staleDim(context))
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
                        if !state.isComplete {
                            ProgressView(timerInterval: state.progressRange, countsDown: false)
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
                if state.isComplete {
                    Image(systemName: "checkmark")
                        .foregroundColor(accent)
                } else {
                    Text(timerInterval: state.countdownRange, countsDown: true)
                        .font(.system(size: 14, weight: .semibold, design: .rounded))
                        .foregroundColor(accent)
                        .monospacedDigit()
                        .frame(maxWidth: 44)
                        .opacity(staleDim(context))
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
