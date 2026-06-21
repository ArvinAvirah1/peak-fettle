// LifeOSShieldConfig — branded block screen (TICKET-102 #2b, design §4).
//
// Copy rules (CONTENT_SAFETY.md §3): supportive, never shaming; the escape
// route ("Keep me blocked") is equally prominent. PRODUCT_NAME is duplicated
// here because extensions can't import the RN bundle — this `productName`
// constant is the single Swift source of truth; keep it in sync with
// lifeos/src/config/product.ts (PRODUCT_NAME). Q7 RESOLVED 2026-06-20.

import ManagedSettings
import ManagedSettingsUI
import UIKit

class ShieldConfigurationExtension: ShieldConfigurationDataSource {
  private let productName = "Peak Fettle LifeOS" // Q7 RESOLVED 2026-06-20 (= PRODUCT_NAME)

  private func makeConfig(subtitleText: String) -> ShieldConfiguration {
    ShieldConfiguration(
      backgroundBlurStyle: .systemUltraThinMaterialDark,
      backgroundColor: UIColor(red: 0.047, green: 0.059, blue: 0.090, alpha: 1.0), // base950
      icon: UIImage(systemName: "mountain.2.fill"),
      title: ShieldConfiguration.Label(
        text: "Blocked while you focus",
        color: .white
      ),
      subtitle: ShieldConfiguration.Label(
        text: subtitleText,
        color: UIColor(red: 0.608, green: 0.643, blue: 0.737, alpha: 1.0) // muted400
      ),
      primaryButtonLabel: ShieldConfiguration.Label(
        text: "Keep me blocked",
        color: UIColor(red: 0.102, green: 0.075, blue: 0.016, alpha: 1.0)
      ),
      primaryButtonBackgroundColor: UIColor(red: 0.949, green: 0.663, blue: 0.231, alpha: 1.0), // accent500
      secondaryButtonLabel: ShieldConfiguration.Label(
        text: "Open \(productName) to unlock",
        color: .white
      )
    )
  }

  override func configuration(shielding application: Application) -> ShieldConfiguration {
    makeConfig(subtitleText: "This time belongs to your plan. Unlocking takes a moment on purpose.")
  }

  override func configuration(
    shielding application: Application,
    in category: ActivityCategory
  ) -> ShieldConfiguration {
    makeConfig(subtitleText: "This category is paused right now. Unlocking takes a moment on purpose.")
  }

  override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration {
    // Website shields ship in v1.1 (TICKET-112); config provided for completeness.
    makeConfig(subtitleText: "This site is paused right now.")
  }
}
