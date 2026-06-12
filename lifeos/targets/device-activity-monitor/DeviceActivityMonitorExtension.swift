// LifeOSDeviceActivityMonitor — applies/clears shields on schedule boundaries
// and usage thresholds (TICKET-102 #2a). Runs as a system extension; reads
// config written by the main app via the App Group (see LifeOsBlockingModule).

import DeviceActivity
import ManagedSettings
import FamilyControls
import Foundation

let appGroupId = "group.com.peakfettle.lifeos"

class DeviceActivityMonitorExtension: DeviceActivityMonitor {
  private func defaults() -> UserDefaults? {
    UserDefaults(suiteName: appGroupId)
  }

  private func selection(for configId: String) -> FamilyActivitySelection? {
    guard let token = defaults()?.string(forKey: "cfg_\(configId)"),
          let data = Data(base64Encoded: token) else { return nil }
    return try? PropertyListDecoder().decode(FamilyActivitySelection.self, from: data)
  }

  private func applyShield(configId: String) {
    guard let sel = selection(for: configId) else { return }
    let store = ManagedSettingsStore(named: ManagedSettingsStore.Name(configId))
    store.shield.applications = sel.applicationTokens.isEmpty ? nil : sel.applicationTokens
    store.shield.applicationCategories = sel.categoryTokens.isEmpty ? nil : .specific(sel.categoryTokens)
  }

  private func clearShield(configId: String) {
    ManagedSettingsStore(named: ManagedSettingsStore.Name(configId)).clearAllSettings()
  }

  override func intervalDidStart(for activity: DeviceActivityName) {
    super.intervalDidStart(for: activity)
    let raw = activity.rawValue

    if raw.hasPrefix("exempt_") {
      // Exemption window opened — shield already lifted by the app. Nothing to do.
      return
    }
    // Session windows shield at start; daily-limit activities shield only on
    // threshold (eventDidReachThreshold below).
    if let json = defaults()?.string(forKey: "schedule_\(raw)"),
       json.contains("startHHMM") {
      applyShield(configId: raw)
    }
  }

  override func intervalDidEnd(for activity: DeviceActivityName) {
    super.intervalDidEnd(for: activity)
    let raw = activity.rawValue

    if raw.hasPrefix("exempt_") {
      // Grant window over — re-apply the original config's shield.
      let configId = String(raw.dropFirst("exempt_".count))
      defaults()?.removeObject(forKey: "exempt_until_\(configId)")
      applyShield(configId: configId)
      return
    }
    clearShield(configId: raw)
  }

  override func eventDidReachThreshold(
    _ event: DeviceActivityEvent.Name,
    activity: DeviceActivityName
  ) {
    super.eventDidReachThreshold(event, activity: activity)
    // Daily limit hit — shield for the rest of the interval (until midnight).
    applyShield(configId: activity.rawValue)
  }
}
