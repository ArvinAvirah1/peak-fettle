// LifeOsBlockingModule — Expo local module bridging FamilyControls /
// ManagedSettings / DeviceActivity to JS (TICKET-102 #4).
//
// ⚠️ Compiles only in a dev-client / EAS build with the FamilyControls
// entitlement. Cannot be verified from the Windows sandbox — see
// lifeos/native/README.md for build + verification steps.
//
// App Group contract (shared with the extension targets):
//   cfg_<configId>          — base64 PropertyList of FamilyActivitySelection
//   schedule_<configId>     — JSON schedule (mirror of lo_focus_configs.schedule_json)
//   pending_unlock          — SENTINEL marker (the literal "from_shield")
//                             written by the ShieldAction extension. It is NOT
//                             a configId: the shield API does not tell the
//                             extension which config fired, so the app routes
//                             to the friction flow and resolves the active
//                             config there (single active rule auto-selects;
//                             otherwise the user picks). Never treat the
//                             returned string as an id.
//   exempt_until_<configId> — ISO timestamp while a friction-earned exemption
//                             is active

import ExpoModulesCore
import FamilyControls
import ManagedSettings
import DeviceActivity
import SwiftUI

let appGroupId = "group.com.peakfettle.lifeos"

public class LifeOsBlockingModule: Module {
  private let center = AuthorizationCenter.shared
  private let activityCenter = DeviceActivityCenter()

  private func defaults() -> UserDefaults? {
    UserDefaults(suiteName: appGroupId)
  }

  private func store(for configId: String) -> ManagedSettingsStore {
    ManagedSettingsStore(named: ManagedSettingsStore.Name(configId))
  }

  private func loadSelection(_ token: String) -> FamilyActivitySelection? {
    guard let data = Data(base64Encoded: token) else { return nil }
    return try? PropertyListDecoder().decode(FamilyActivitySelection.self, from: data)
  }

  public func definition() -> ModuleDefinition {
    Name("LifeOsBlocking")

    AsyncFunction("isAuthorized") { () -> Bool in
      return self.center.authorizationStatus == .approved
    }

    AsyncFunction("requestAuthorization") { () -> Bool in
      try await self.center.requestAuthorization(for: .individual)
      return self.center.authorizationStatus == .approved
    }

    // Presents the system FamilyActivityPicker over the root view controller.
    // Resolves to a base64-encoded PropertyList of the selection, or nil if
    // the user cancels. The token is opaque to JS and never leaves the device.
    AsyncFunction("pickApps") { (existingToken: String?, promise: Promise) in
      DispatchQueue.main.async {
        guard let root = UIApplication.shared.connectedScenes
          .compactMap({ ($0 as? UIWindowScene)?.keyWindow })
          .first?.rootViewController else {
          promise.resolve(nil)
          return
        }
        var selection = existingToken.flatMap { self.loadSelection($0) } ?? FamilyActivitySelection()
        let picker = FamilyPickerHost(selection: selection) { result in
          root.dismiss(animated: true)
          guard let result = result,
                let data = try? PropertyListEncoder().encode(result) else {
            promise.resolve(nil)
            return
          }
          promise.resolve(data.base64EncodedString())
        }
        let host = UIHostingController(rootView: picker)
        root.present(host, animated: true)
      }
    }

    AsyncFunction("applyShield") { (configId: String, selectionToken: String) in
      guard let selection = self.loadSelection(selectionToken) else { return }
      self.defaults()?.set(selectionToken, forKey: "cfg_\(configId)")
      let store = self.store(for: configId)
      store.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
      store.shield.applicationCategories = selection.categoryTokens.isEmpty
        ? nil
        : .specific(selection.categoryTokens)
    }

    AsyncFunction("clearShield") { (configId: String) in
      self.store(for: configId).clearAllSettings()
      self.defaults()?.removeObject(forKey: "exempt_until_\(configId)")
    }

    // scheduleJson mirrors lo_focus_configs.schedule_json:
    //   session: { days:[1..5], startHHMM:"09:00", endHHMM:"12:00" }
    //   limit:   { dailyLimitMin: 45 }
    AsyncFunction("scheduleActivity") { (configId: String, scheduleJson: String, selectionToken: String) in
      self.defaults()?.set(selectionToken, forKey: "cfg_\(configId)")
      self.defaults()?.set(scheduleJson, forKey: "schedule_\(configId)")

      guard let data = scheduleJson.data(using: .utf8),
            let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }

      let activityName = DeviceActivityName(configId)
      self.activityCenter.stopMonitoring([activityName])

      if let limitMin = obj["dailyLimitMin"] as? Int {
        // Daily limit: monitor all-day, threshold event fires the shield from
        // the DeviceActivityMonitor extension.
        guard let selection = self.loadSelection(selectionToken) else { return }
        let schedule = DeviceActivitySchedule(
          intervalStart: DateComponents(hour: 0, minute: 0),
          intervalEnd: DateComponents(hour: 23, minute: 59),
          repeats: true
        )
        let event = DeviceActivityEvent(
          applications: selection.applicationTokens,
          categories: selection.categoryTokens,
          webDomains: [],
          threshold: DateComponents(minute: limitMin)
        )
        try self.activityCenter.startMonitoring(
          activityName,
          during: schedule,
          events: [DeviceActivityEvent.Name("limit_\(configId)"): event]
        )
      } else if let start = obj["startHHMM"] as? String, let end = obj["endHHMM"] as? String {
        // Session window: the monitor extension applies the shield at
        // intervalDidStart and clears it at intervalDidEnd.
        func comps(_ hhmm: String) -> DateComponents {
          let parts = hhmm.split(separator: ":").compactMap { Int($0) }
          return DateComponents(hour: parts.first ?? 0, minute: parts.count > 1 ? parts[1] : 0)
        }
        let schedule = DeviceActivitySchedule(
          intervalStart: comps(start),
          intervalEnd: comps(end),
          repeats: true
        )
        try self.activityCenter.startMonitoring(activityName, during: schedule, events: [:])
      }
    }

    AsyncFunction("cancelActivity") { (configId: String) in
      self.activityCenter.stopMonitoring([DeviceActivityName(configId)])
      self.store(for: configId).clearAllSettings()
      self.defaults()?.removeObject(forKey: "schedule_\(configId)")
    }

    // Friction-earned exemption: lift the shield now; a one-shot monitoring
    // interval re-applies it via the extension when the grant window ends.
    AsyncFunction("grantExemption") { (configId: String, grantWindowMin: Int) in
      let store = self.store(for: configId)
      store.shield.applications = nil
      store.shield.applicationCategories = nil

      let until = Date().addingTimeInterval(TimeInterval(grantWindowMin * 60))
      self.defaults()?.set(ISO8601DateFormatter().string(from: until), forKey: "exempt_until_\(configId)")

      let cal = Calendar.current
      let endComps = cal.dateComponents([.hour, .minute], from: until)
      let startComps = cal.dateComponents([.hour, .minute], from: Date())
      let schedule = DeviceActivitySchedule(
        intervalStart: startComps,
        intervalEnd: endComps,
        repeats: false
      )
      try? self.activityCenter.startMonitoring(
        DeviceActivityName("exempt_\(configId)"),
        during: schedule,
        events: [:]
      )
    }

    // Pending unlock handoff from the ShieldAction extension. Returns the
    // SENTINEL marker (not a configId — see App Group contract above) or nil.
    // Called by the app on every foreground.
    AsyncFunction("consumePendingUnlock") { () -> String? in
      guard let d = self.defaults(), let id = d.string(forKey: "pending_unlock") else { return nil }
      d.removeObject(forKey: "pending_unlock")
      return id
    }
  }
}

// SwiftUI host for the system picker.
struct FamilyPickerHost: View {
  @State var selection: FamilyActivitySelection
  let onDone: (FamilyActivitySelection?) -> Void

  var body: some View {
    NavigationView {
      FamilyActivityPicker(selection: $selection)
        .navigationTitle("Choose apps")
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button("Cancel") { onDone(nil) }
          }
          ToolbarItem(placement: .confirmationAction) {
            Button("Done") { onDone(selection) }
          }
        }
    }
  }
}
