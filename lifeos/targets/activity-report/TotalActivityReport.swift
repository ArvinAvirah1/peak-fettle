// LifeOSActivityReport — on-device screen-time report (TICKET-102 #2d).
//
// DeviceActivityReport renders INSIDE this extension's sandbox; raw usage
// data never reaches the app process or any server (OS-enforced — this is
// the honest basis for the privacy copy in legal/lifeos-privacy-addendum.md).
// The Focus tab embeds this scene via DeviceActivityReport(context:filter:).

import DeviceActivity
import SwiftUI

@main
struct LifeOSActivityReportExtension: DeviceActivityReportExtension {
  var body: some DeviceActivityReportScene {
    TotalActivityReport { totalActivity in
      TotalActivityView(totalActivity: totalActivity)
    }
  }
}

extension DeviceActivityReport.Context {
  static let totalActivity = Self("Total Activity")
}

struct TotalActivityReport: DeviceActivityReportScene {
  let context: DeviceActivityReport.Context = .totalActivity
  let content: (String) -> TotalActivityView

  func makeConfiguration(
    representing data: DeviceActivityResults<DeviceActivityData>
  ) async -> String {
    let totalDuration = await data.flatMap { $0.activitySegments }
      .reduce(0) { $0 + $1.totalActivityDuration }
    let hours = Int(totalDuration) / 3600
    let minutes = (Int(totalDuration) % 3600) / 60
    return hours > 0 ? "\(hours)h \(minutes)m" : "\(minutes)m"
  }
}

struct TotalActivityView: View {
  let totalActivity: String

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("Screen time today")
        .font(.caption)
        .foregroundColor(.secondary)
      Text(totalActivity)
        .font(.system(size: 34, weight: .semibold, design: .rounded))
        .monospacedDigit()
    }
    .padding()
  }
}
