// LifeOSLiveActivityModule — TICKET-118 (+ TICKET-172 snooze/relock polish).
//
// Starts/updates/ends the focus-session Live Activity from the APP process
// (ActivityKit cannot be driven from a widget extension). The RN wrapper is
// lifeos/modules/live-activity/index.ts; the Live Activity UI is
// LifeOSFocusLiveActivity in targets/widget/index.swift.
//
// ⚠️ macOS / Apple-gated (authored on Windows; first `xcodebuild` may need minor
//    signature fixes — see lifeos/native/README.md):
//   1. The ActivityAttributes type below MUST stay byte-for-byte in sync with
//      LifeOSFocusAttributes in targets/widget/index.swift (shared contract).
//      A real build should hoist it into a shared file included by both targets.
//      Same for RelockFocusIntent (TICKET-172) — see its comment.
//   2. Activity.request(...) signature differs across iOS 16.2 / 17 / 18 SDKs
//      (contentState: vs content:/ActivityContent). Adjust to the build SDK.
//   3. NSSupportsLiveActivities is already set in app.json (TICKET-114).

import ExpoModulesCore
import Foundation
import ActivityKit
import AppIntents

private let appGroupId = "group.com.peakfettle.lifeos"

// MUST match targets/widget/index.swift › LifeOSFocusAttributes.
@available(iOS 16.2, *)
struct LifeOSFocusAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var endsAt: Date
    var blocksHeld: Int
    /// TICKET-172: true while a snooze/grant window is counting down (the
    /// island then offers one-tap "Relock now"). Optional so a state written
    /// by an older module still decodes; nil == false.
    var isSnooze: Bool?
  }
  var sessionName: String
  var accentHex: String
}

private func parseISODate(_ s: String) -> Date? {
  let f = ISO8601DateFormatter()
  f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  if let d = f.date(from: s) { return d }
  return ISO8601DateFormatter().date(from: s)
}

// App-process copy of RelockFocusIntent (TICKET-172).
// ⚠️ MUST stay in sync with targets/widget/index.swift › RelockFocusIntent —
// same type name, same perform() body. Dual inclusion is Apple's documented
// pattern for LiveActivityIntent: the widget-extension binary needs the type so
// Button(intent:) compiles; THIS copy (in the app binary) is the one the system
// actually performs, so the running Activity is reachable here.
@available(iOS 17.0, *)
struct RelockFocusIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Relock now"
  static var openAppWhenRun: Bool = false

  init() {}

  func perform() async throws -> some IntentResult {
    // 1) App Group marker — same handoff pattern as pending_unlock /
    //    pending_habit_toggles: the app consumes it on next foreground via
    //    consumePendingRelock() (modules/live-activity/index.ts) and re-applies
    //    the shield app-side (ManagedSettings state lives with the app).
    UserDefaults(suiteName: appGroupId)?.set(
      ISO8601DateFormatter().string(from: Date()),
      forKey: "pending_relock"
    )
    // 2) Optimistic response: end the snooze presentation immediately — a
    //    countdown is void once the user asked to relock.
    for activity in Activity<LifeOSFocusAttributes>.activities {
      await activity.end(dismissalPolicy: .immediate)
    }
    return .result()
  }
}

public class LifeOSLiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LifeOSLiveActivity")

    // isSnooze (TICKET-172, additive): true renders the snooze presentation
    // (lock-open icon, accent countdown, relock button on iOS 17+); nil/false
    // keeps the plain focus-session presentation. Trailing optional — the
    // pre-172 3-argument JS call shape still works.
    Function("startFocusActivity") { (name: String, endsAtISO: String, accentHex: String, isSnooze: Bool?) in
      guard #available(iOS 16.2, *) else { return }
      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
      // Graceful takeover (TICKET-172): single-activity behavior — a stack run
      // restarts any running focus activity. Capture the CURRENT activities
      // BEFORE requesting the new one, then end only that captured list. (The
      // previous fire-and-forget endAll() raced Activity.request and could end
      // the activity it had just created.)
      let olds = Array(Activity<LifeOSFocusAttributes>.activities)
      let endsAt = parseISODate(endsAtISO) ?? Date().addingTimeInterval(1500)
      let attrs = LifeOSFocusAttributes(sessionName: name, accentHex: accentHex)
      let state = LifeOSFocusAttributes.ContentState(endsAt: endsAt, blocksHeld: 0, isSnooze: isSnooze)
      do {
        _ = try Activity.request(attributes: attrs, contentState: state, pushType: nil)
      } catch {
        // ignore — a focus session must still work without the Live Activity
      }
      Task {
        for activity in olds {
          await activity.end(dismissalPolicy: .immediate)
        }
      }
    }

    // isSnooze: nil = keep the activity's current mode (additive, TICKET-172).
    Function("updateFocusActivity") { (blocksHeld: Int, endsAtISO: String?, isSnooze: Bool?) in
      guard #available(iOS 16.2, *) else { return }
      Task {
        for activity in Activity<LifeOSFocusAttributes>.activities {
          let endsAt = endsAtISO.flatMap(parseISODate) ?? activity.contentState.endsAt
          let state = LifeOSFocusAttributes.ContentState(
            endsAt: endsAt,
            blocksHeld: blocksHeld,
            isSnooze: isSnooze ?? activity.contentState.isSnooze
          )
          await activity.update(using: state)
        }
      }
    }

    Function("endFocusActivity") {
      guard #available(iOS 16.2, *) else { return }
      LifeOSLiveActivityModule.endAll()
    }
  }

  @available(iOS 16.2, *)
  private static func endAll() {
    Task {
      for activity in Activity<LifeOSFocusAttributes>.activities {
        await activity.end(dismissalPolicy: .immediate)
      }
    }
  }
}
