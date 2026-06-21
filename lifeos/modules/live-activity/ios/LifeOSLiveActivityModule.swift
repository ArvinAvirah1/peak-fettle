// LifeOSLiveActivityModule — TICKET-118.
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
//   2. Activity.request(...) signature differs across iOS 16.2 / 17 / 18 SDKs
//      (contentState: vs content:/ActivityContent). Adjust to the build SDK.
//   3. NSSupportsLiveActivities is already set in app.json (TICKET-114).

import ExpoModulesCore
import Foundation
import ActivityKit

// MUST match targets/widget/index.swift › LifeOSFocusAttributes.
@available(iOS 16.2, *)
struct LifeOSFocusAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var endsAt: Date
    var blocksHeld: Int
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

public class LifeOSLiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LifeOSLiveActivity")

    Function("startFocusActivity") { (name: String, endsAtISO: String, accentHex: String) in
      guard #available(iOS 16.2, *) else { return }
      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
      // One focus session at a time — clear any existing first.
      LifeOSLiveActivityModule.endAll()
      let endsAt = parseISODate(endsAtISO) ?? Date().addingTimeInterval(1500)
      let attrs = LifeOSFocusAttributes(sessionName: name, accentHex: accentHex)
      let state = LifeOSFocusAttributes.ContentState(endsAt: endsAt, blocksHeld: 0)
      do {
        _ = try Activity.request(attributes: attrs, contentState: state, pushType: nil)
      } catch {
        // ignore — a focus session must still work without the Live Activity
      }
    }

    Function("updateFocusActivity") { (blocksHeld: Int, endsAtISO: String?) in
      guard #available(iOS 16.2, *) else { return }
      Task {
        for activity in Activity<LifeOSFocusAttributes>.activities {
          let endsAt = endsAtISO.flatMap(parseISODate) ?? activity.contentState.endsAt
          let state = LifeOSFocusAttributes.ContentState(endsAt: endsAt, blocksHeld: blocksHeld)
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
