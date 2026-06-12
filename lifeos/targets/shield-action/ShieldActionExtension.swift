// LifeOSShieldAction — button handling on the shield (TICKET-102 #2c).
//
// IMPORTANT iOS constraint (TICKET-113 security note): shield action
// extensions CANNOT open URLs or launch the host app. The unlock handoff is
// therefore: write `pending_unlock` = <configId> into the App Group, respond
// .none (shield stays up), and instruct the user via the shield copy to open
// the app. On next foreground the app calls consumePendingUnlock() and routes
// into the friction flow. Friction state lives app-side, so nothing here (or
// a forged deep link) can lift a shield — only grantExemption() after the
// wait/breathing gate completes.

import ManagedSettings
import Foundation

let appGroupId = "group.com.peakfettle.lifeos"

class ShieldActionExtension: ShieldActionDelegate {
  private func recordPendingUnlock() {
    let defaults = UserDefaults(suiteName: appGroupId)
    // The monitor stores per-config selections under cfg_<id>; the shield API
    // doesn't tell us which config shielded this app, so the app resolves the
    // active config(s) itself. The marker just signals intent.
    defaults?.set("from_shield", forKey: "pending_unlock")
  }

  override func handle(
    action: ShieldAction,
    for application: ApplicationToken,
    completionHandler: @escaping (ShieldActionResponse) -> Void
  ) {
    switch action {
    case .primaryButtonPressed:
      // "Keep me blocked" — a held block. The app logs it as the win it is.
      completionHandler(.close)
    case .secondaryButtonPressed:
      // "Open <app> to unlock" — record intent; user opens the app manually.
      recordPendingUnlock()
      completionHandler(.close)
    @unknown default:
      completionHandler(.none)
    }
  }

  override func handle(
    action: ShieldAction,
    for category: ActivityCategoryToken,
    completionHandler: @escaping (ShieldActionResponse) -> Void
  ) {
    switch action {
    case .primaryButtonPressed:
      completionHandler(.close)
    case .secondaryButtonPressed:
      recordPendingUnlock()
      completionHandler(.close)
    @unknown default:
      completionHandler(.none)
    }
  }
}
