// PeakFettleWidget — home & lock screen widget (WIDGET-001, founder 2026-06-11).
//
// Data source: the app (src/services/widgetBridge.ts) writes a JSON payload to
// the `group.com.peakfettle.app` App Group under the key `widget_payload` and
// calls WidgetCenter.reloadAllTimelines() after every relevant local change.
//
// Families:
//   • systemMedium        — next split + PRs this week + goals achieved this week
//   • systemSmall         — next split + compact PR/goal line
//   • accessoryRectangular (iOS 16+, lock screen) — next split only (founder
//     decision: most glanceable daily value)
//
// For 'weekly' schedules the payload carries the 7-slot routine-name array so
// the provider re-derives "Today/Tomorrow" at render time (the timeline is
// refreshed just after midnight). 'cycle' schedules only advance when a routine
// is completed in-app, so the precomputed label stays valid.

import SwiftUI
import WidgetKit

private let appGroup = "group.com.peakfettle.app"
private let payloadKey = "widget_payload"
private let kind = "PeakFettleWidget"

// MARK: - Payload (mirrors WidgetPayload in src/services/widgetBridge.ts)

struct WidgetPayload: Codable {
    var updatedAt: String?
    var scheduleMode: String?
    var nextName: String?
    var whenLabel: String?
    var isRest: Bool?
    var weekly: [String?]?
    var prsThisWeek: Int?
    var goalsThisWeek: Int?
    var goalsActive: Int?
}

func loadPayload() -> WidgetPayload? {
    guard
        let defaults = UserDefaults(suiteName: appGroup),
        let raw = defaults.string(forKey: payloadKey),
        let data = raw.data(using: .utf8)
    else { return nil }
    return try? JSONDecoder().decode(WidgetPayload.self, from: data)
}

// MARK: - Timeline

struct PFEntry: TimelineEntry {
    let date: Date
    let hasData: Bool
    let nextName: String?
    let whenLabel: String
    let isRest: Bool
    let prsThisWeek: Int
    let goalsThisWeek: Int
}

private let weekdayShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

func makeEntry(for date: Date) -> PFEntry {
    guard let p = loadPayload() else {
        return PFEntry(
            date: date, hasData: false, nextName: nil, whenLabel: "Open the app",
            isRest: false, prsThisWeek: 0, goalsThisWeek: 0
        )
    }

    var nextName = p.nextName
    var whenLabel = p.whenLabel ?? "Next up"
    var isRest = p.isRest ?? false

    // Weekly mode: re-derive from the 7-slot array so the label survives
    // midnight without the app running (mirrors schedule.resolveNextUp).
    if p.scheduleMode == "weekly", let weekly = p.weekly, weekly.count == 7 {
        let today = Calendar.current.component(.weekday, from: date) - 1 // 0 = Sun
        var found = false
        for offset in 0..<7 {
            let idx = (today + offset) % 7
            if let name = weekly[idx], !name.isEmpty {
                nextName = name
                whenLabel = offset == 0 ? "Today" : (offset == 1 ? "Tomorrow" : weekdayShort[idx])
                isRest = false
                found = true
                break
            }
        }
        if !found {
            nextName = nil
            whenLabel = "Today"
            isRest = true
        }
    }

    return PFEntry(
        date: date,
        hasData: true,
        nextName: nextName,
        whenLabel: whenLabel,
        isRest: isRest,
        prsThisWeek: p.prsThisWeek ?? 0,
        goalsThisWeek: p.goalsThisWeek ?? 0
    )
}

struct PFProvider: TimelineProvider {
    func placeholder(in context: Context) -> PFEntry {
        PFEntry(
            date: Date(), hasData: true, nextName: "Push A", whenLabel: "Today",
            isRest: false, prsThisWeek: 3, goalsThisWeek: 2
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (PFEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : makeEntry(for: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PFEntry>) -> Void) {
        let now = Date()
        let entry = makeEntry(for: now)
        // Refresh shortly after midnight so Today/Tomorrow labels roll over;
        // in-app changes trigger immediate reloads via WidgetCenter.
        let cal = Calendar.current
        let nextMidnight = cal.nextDate(
            after: now, matching: DateComponents(hour: 0, minute: 5),
            matchingPolicy: .nextTime
        ) ?? now.addingTimeInterval(6 * 60 * 60)
        completion(Timeline(entries: [entry], policy: .after(nextMidnight)))
    }
}

// MARK: - Palette (matches src/theme/tokens.ts default theme)

private let pfBg = Color(red: 0x0A / 255.0, green: 0x0E / 255.0, blue: 0x1A / 255.0)
private let pfAccent = Color(red: 0x00 / 255.0, green: 0xD4 / 255.0, blue: 0xC8 / 255.0)
private let pfText = Color.white
private let pfMuted = Color.white.opacity(0.55)

extension View {
    @ViewBuilder
    func pfWidgetBackground() -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            self.containerBackground(for: .widget) { pfBg }
        } else {
            self.background(pfBg)
        }
    }
}

// MARK: - Views

struct SplitBlock: View {
    let entry: PFEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(entry.whenLabel.uppercased())
                .font(.caption2.weight(.semibold))
                .foregroundColor(pfMuted)
            Text(entry.isRest ? "Rest day" : (entry.nextName ?? "No split set"))
                .font(.headline.weight(.bold))
                .foregroundColor(entry.isRest ? pfMuted : pfText)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
        }
    }
}

struct StatBlock: View {
    let value: Int
    let label: String
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("\(value)")
                .font(.title2.weight(.bold))
                .foregroundColor(pfAccent)
            Text(label)
                .font(.caption2)
                .foregroundColor(pfMuted)
                .lineLimit(2)
        }
    }
}

struct MediumView: View {
    let entry: PFEntry
    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            SplitBlock(entry: entry)
                .frame(maxWidth: .infinity, alignment: .leading)
            Rectangle()
                .fill(Color.white.opacity(0.12))
                .frame(width: 1, height: 44)
            StatBlock(value: entry.prsThisWeek, label: "PRs this week")
            StatBlock(value: entry.goalsThisWeek, label: "Goals this week")
        }
        .padding()
        .pfWidgetBackground()
    }
}

struct SmallView: View {
    let entry: PFEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            SplitBlock(entry: entry)
            Spacer(minLength: 0)
            Text("\(entry.prsThisWeek) PR\(entry.prsThisWeek == 1 ? "" : "s") · \(entry.goalsThisWeek) goal\(entry.goalsThisWeek == 1 ? "" : "s")")
                .font(.caption.weight(.semibold))
                .foregroundColor(pfAccent)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding()
        .pfWidgetBackground()
    }
}

// Lock screen (iOS 16+): next split ONLY (founder decision 2026-06-11).
struct RectangularView: View {
    let entry: PFEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(entry.whenLabel.uppercased())
                .font(.caption2.weight(.semibold))
                .opacity(0.7)
            Text(entry.isRest ? "Rest day" : (entry.nextName ?? "No split set"))
                .font(.headline.weight(.bold))
                .lineLimit(2)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .pfWidgetBackground()
    }
}

struct PeakFettleWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: PFEntry

    var body: some View {
        Group {
            if #available(iOSApplicationExtension 16.0, *), family == .accessoryRectangular {
                RectangularView(entry: entry)
            } else if family == .systemMedium {
                MediumView(entry: entry)
            } else {
                SmallView(entry: entry)
            }
        }
        .widgetURL(URL(string: "peak-fettle://"))
    }
}

// MARK: - Widget

struct PeakFettleWidget: Widget {
    private var families: [WidgetFamily] {
        if #available(iOSApplicationExtension 16.0, *) {
            return [.systemSmall, .systemMedium, .accessoryRectangular]
        }
        return [.systemSmall, .systemMedium]
    }

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PFProvider()) { entry in
            PeakFettleWidgetView(entry: entry)
        }
        .configurationDisplayName("Peak Fettle")
        .description("Your next split, PRs and goals this week.")
        .supportedFamilies(families)
    }
}

@main
struct PeakFettleWidgetBundle: WidgetBundle {
    var body: some Widget {
        PeakFettleWidget()
    }
}
