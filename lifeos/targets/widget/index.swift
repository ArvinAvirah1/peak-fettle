//
//  LifeOSWidget — Peak Fettle LifeOS home/lock-screen widgets + focus Live Activity.
//  TICKET-116 (widgets), TICKET-118 (Live Activity).
//
//  Reads the JSON the app writes to the App Group (group.com.peakfettle.lifeos)
//  under "widget_payload" via src/services/widgetBridge.ts. No network in the
//  extension — display-only, repainted from the shared payload. Colors come from
//  the payload `theme` block so the widget always matches the in-app theme.
//
//  NOTE: authored on a non-macOS host; first `xcodebuild` may need minor
//  signature touch-ups (known, recorded in lifeos/native/README.md). Interactive
//  in-widget habit check-off (App Intents) is TICKET-117 — this file ships the
//  display + deep-link version.
//

import WidgetKit
import SwiftUI
import ActivityKit

// MARK: - Shared payload (mirrors LifeOSWidgetPayload in widgetBridge.ts)

private let APP_GROUP = "group.com.peakfettle.lifeos"
private let PAYLOAD_KEY = "widget_payload"

struct WidgetThemeData: Codable {
    var bg: String
    var tile: String
    var accent: String
    var text: String
    var muted: String
    var warn: String
    var ink: String
}

struct TodayHabitData: Codable, Hashable {
    var name: String
    var icon: String
    var done: Bool
}

struct LifeOSWidgetData: Codable {
    var updatedAt: String
    var streakDays: Int
    var longestStreakDays: Int
    var milestone: Int?
    var habitsDoneToday: Int
    var habitsTotalToday: Int
    var todayHabits: [TodayHabitData]
    var blocksHeldToday: Int
    var reclaimedMinToday: Int
    var focusActive: Bool
    var focusName: String?
    var focusEndsAt: String?
    var theme: WidgetThemeData

    static func placeholder() -> LifeOSWidgetData {
        LifeOSWidgetData(
            updatedAt: "",
            streakDays: 5, longestStreakDays: 21, milestone: nil,
            habitsDoneToday: 2, habitsTotalToday: 4,
            todayHabits: [
                .init(name: "Read 10 pages", icon: "book", done: true),
                .init(name: "Stretch", icon: "figure.walk", done: true),
                .init(name: "Brush teeth", icon: "sparkles", done: false),
                .init(name: "Wash face", icon: "drop", done: false),
            ],
            blocksHeldToday: 3, reclaimedMinToday: 47,
            focusActive: false, focusName: nil, focusEndsAt: nil,
            theme: WidgetThemeData(
                bg: "#0E1117", tile: "#1A1F2B", accent: "#F2A93B",
                text: "#FFFFFF", muted: "#9AA3B2", warn: "#F2A93B", ink: "#0E1117"
            )
        )
    }
}

private func loadPayload() -> LifeOSWidgetData {
    guard
        let defaults = UserDefaults(suiteName: APP_GROUP),
        let raw = defaults.string(forKey: PAYLOAD_KEY),
        let data = raw.data(using: .utf8),
        let decoded = try? JSONDecoder().decode(LifeOSWidgetData.self, from: data)
    else {
        return LifeOSWidgetData.placeholder()
    }
    return decoded
}

// MARK: - Color helper (#RRGGBB / #AARRGGBB)

extension Color {
    init(hex: String, fallback: Color = .gray) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        var v: UInt64 = 0
        guard Scanner(string: s).scanHexInt64(&v) else { self = fallback; return }
        let r, g, b, a: Double
        switch s.count {
        case 6:
            r = Double((v & 0xFF0000) >> 16) / 255
            g = Double((v & 0x00FF00) >> 8) / 255
            b = Double(v & 0x0000FF) / 255
            a = 1
        case 8:
            a = Double((v & 0xFF000000) >> 24) / 255
            r = Double((v & 0x00FF0000) >> 16) / 255
            g = Double((v & 0x0000FF00) >> 8) / 255
            b = Double(v & 0x000000FF) / 255
        default:
            self = fallback; return
        }
        self = Color(.sRGB, red: r, green: g, blue: b, opacity: a)
    }
}

private struct Palette {
    let bg, tile, accent, text, muted, warn, ink: Color
    init(_ t: WidgetThemeData) {
        bg = Color(hex: t.bg, fallback: Color(hex: "#0E1117"))
        tile = Color(hex: t.tile, fallback: Color(hex: "#1A1F2B"))
        accent = Color(hex: t.accent, fallback: Color(hex: "#F2A93B"))
        text = Color(hex: t.text, fallback: .white)
        muted = Color(hex: t.muted, fallback: .gray)
        warn = Color(hex: t.warn, fallback: Color(hex: "#F2A93B"))
        ink = Color(hex: t.ink, fallback: Color(hex: "#0E1117"))
    }
}

// MARK: - Timeline

struct LifeOSEntry: TimelineEntry {
    let date: Date
    let data: LifeOSWidgetData
}

struct LifeOSProvider: TimelineProvider {
    func placeholder(in context: Context) -> LifeOSEntry {
        LifeOSEntry(date: Date(), data: .placeholder())
    }
    func getSnapshot(in context: Context, completion: @escaping (LifeOSEntry) -> Void) {
        completion(LifeOSEntry(date: Date(), data: loadPayload()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<LifeOSEntry>) -> Void) {
        // App calls reloadAllTimelines() on every relevant change; refresh hourly
        // as a backstop so day-rollover and focus end-times stay roughly fresh.
        let entry = LifeOSEntry(date: Date(), data: loadPayload())
        let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date().addingTimeInterval(3600)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// MARK: - Streak ring widget

struct StreakRingView: View {
    @Environment(\.widgetFamily) private var family
    let data: LifeOSWidgetData
    var p: Palette { Palette(data.theme) }

    private var ringProgress: Double {
        guard data.habitsTotalToday > 0 else { return data.streakDays > 0 ? 1 : 0 }
        return min(1, Double(data.habitsDoneToday) / Double(data.habitsTotalToday))
    }

    var body: some View {
        switch family {
        case .accessoryCircular:
            Gauge(value: ringProgress) {
                Image(systemName: "flame.fill")
            } currentValueLabel: {
                Text("\(data.streakDays)")
            }
            .gaugeStyle(.accessoryCircularCapacity)
            .accessibilityLabel("\(data.streakDays) day streak")
        case .accessoryInline:
            Label("\(data.streakDays)-day streak", systemImage: "flame.fill")
        default:
            ZStack {
                Circle().stroke(p.tile, lineWidth: 10)
                Circle()
                    .trim(from: 0, to: ringProgress)
                    .stroke(p.accent, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                VStack(spacing: 2) {
                    Text("\(data.streakDays)")
                        .font(.system(size: 34, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundColor(p.text)
                    Text("day streak").font(.caption2).foregroundColor(p.muted)
                }
            }
            .padding(14)
            .containerBackgroundCompat(p.bg)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(data.streakDays) day streak. \(data.habitsDoneToday) of \(data.habitsTotalToday) habits done today.")
        }
    }
}

// MARK: - Today's habits widget (display + deep link; interactive = TICKET-117)

struct TodayHabitsView: View {
    let data: LifeOSWidgetData
    var p: Palette { Palette(data.theme) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Today").font(.headline).foregroundColor(p.text)
                Spacer()
                Text("\(data.habitsDoneToday)/\(data.habitsTotalToday)")
                    .font(.subheadline).monospacedDigit().foregroundColor(p.muted)
            }
            if data.todayHabits.isEmpty {
                Text("No habits yet — add one to get going.")
                    .font(.caption).foregroundColor(p.muted)
            } else {
                ForEach(data.todayHabits.prefix(5), id: \.self) { h in
                    Link(destination: URL(string: "lifeos://habits")!) {
                        HStack(spacing: 8) {
                            Image(systemName: h.done ? "checkmark.circle.fill" : "circle")
                                .foregroundColor(h.done ? p.accent : p.muted)
                            Text(h.name)
                                .font(.subheadline)
                                .strikethrough(h.done, color: p.muted)
                                .foregroundColor(h.done ? p.muted : p.text)
                                .lineLimit(1)
                            Spacer()
                        }
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(h.name), \(h.done ? "done" : "not done")")
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .containerBackgroundCompat(p.bg)
    }
}

// MARK: - Time reclaimed / blocks held widget

struct ReclaimedView: View {
    @Environment(\.widgetFamily) private var family
    let data: LifeOSWidgetData
    var p: Palette { Palette(data.theme) }

    private var reclaimedLabel: String {
        let h = data.reclaimedMinToday / 60, m = data.reclaimedMinToday % 60
        return h > 0 ? "\(h)h \(m)m" : "\(m)m"
    }

    var body: some View {
        switch family {
        case .accessoryRectangular:
            VStack(alignment: .leading) {
                Text("Reclaimed today").font(.caption2)
                Text(reclaimedLabel).font(.headline).monospacedDigit()
                Text("\(data.blocksHeldToday) blocks held").font(.caption2)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(reclaimedLabel) reclaimed today, \(data.blocksHeldToday) blocks held")
        default:
            VStack(alignment: .leading, spacing: 4) {
                Image(systemName: "shield.lefthalf.filled").foregroundColor(p.accent)
                Spacer()
                Text(reclaimedLabel)
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .monospacedDigit().foregroundColor(p.text)
                Text("reclaimed today").font(.caption2).foregroundColor(p.muted)
                Text("\(data.blocksHeldToday) blocks held")
                    .font(.caption2).foregroundColor(p.accent)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .containerBackgroundCompat(p.bg)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(reclaimedLabel) reclaimed today, \(data.blocksHeldToday) blocks held")
        }
    }
}

// MARK: - Focus status widget (small)

struct FocusStatusView: View {
    let data: LifeOSWidgetData
    var p: Palette { Palette(data.theme) }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: data.focusActive ? "moon.fill" : "moon").foregroundColor(p.accent)
            Spacer()
            if data.focusActive, let name = data.focusName {
                Text(name).font(.headline).foregroundColor(p.text).lineLimit(1)
                if let endsAt = data.focusEndsAt, let end = ISO8601DateFormatter().date(from: endsAt) {
                    Text(end, style: .timer).font(.title3).monospacedDigit().foregroundColor(p.accent)
                }
            } else {
                Text("No focus session").font(.subheadline).foregroundColor(p.muted)
                Link(destination: URL(string: "lifeos://focus")!) {
                    Text("Start focus").font(.caption).foregroundColor(p.accent)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .containerBackgroundCompat(p.bg)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - containerBackground shim (iOS 17 requirement, safe pre-17)

extension View {
    @ViewBuilder
    func containerBackgroundCompat(_ color: Color) -> some View {
        if #available(iOS 17.0, *) {
            self.containerBackground(color, for: .widget)
        } else {
            self.background(color)
        }
    }
}

// MARK: - Widget definitions

struct StreakRingWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "LifeOSStreakRing", provider: LifeOSProvider()) { entry in
            StreakRingView(data: entry.data)
        }
        .configurationDisplayName("Streak")
        .description("Your showing-up streak and today's progress.")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryInline])
    }
}

struct TodayHabitsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "LifeOSTodayHabits", provider: LifeOSProvider()) { entry in
            TodayHabitsView(data: entry.data)
        }
        .configurationDisplayName("Today's Habits")
        .description("Your habits for today at a glance.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

struct ReclaimedWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "LifeOSReclaimed", provider: LifeOSProvider()) { entry in
            ReclaimedView(data: entry.data)
        }
        .configurationDisplayName("Time Reclaimed")
        .description("Minutes reclaimed and blocks held today.")
        .supportedFamilies([.systemSmall, .accessoryRectangular])
    }
}

struct FocusStatusWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "LifeOSFocusStatus", provider: LifeOSProvider()) { entry in
            FocusStatusView(data: entry.data)
        }
        .configurationDisplayName("Focus")
        .description("Current focus session, or start one.")
        .supportedFamilies([.systemSmall])
    }
}

// MARK: - Focus Live Activity (TICKET-118; started from RN via ActivityKit module)

struct LifeOSFocusAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var endsAt: Date
        var blocksHeld: Int
    }
    var sessionName: String
    var accentHex: String
}

@available(iOS 16.2, *)
struct LifeOSFocusLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: LifeOSFocusAttributes.self) { context in
            // Lock screen / banner
            HStack {
                Image(systemName: "moon.fill")
                    .foregroundColor(Color(hex: context.attributes.accentHex, fallback: .orange))
                VStack(alignment: .leading) {
                    Text(context.attributes.sessionName).font(.headline)
                    Text("\(context.state.blocksHeld) blocks held").font(.caption)
                }
                Spacer()
                Text(context.state.endsAt, style: .timer)
                    .font(.title2).monospacedDigit()
                    .frame(maxWidth: 90)
            }
            .padding()
            .activityBackgroundTint(Color.black.opacity(0.6))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label(context.attributes.sessionName, systemImage: "moon.fill")
                        .font(.caption)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.endsAt, style: .timer).monospacedDigit().frame(maxWidth: 70)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("\(context.state.blocksHeld) distractions blocked")
                        .font(.caption2).foregroundColor(.secondary)
                }
            } compactLeading: {
                Image(systemName: "moon.fill")
            } compactTrailing: {
                Text(context.state.endsAt, style: .timer).monospacedDigit().frame(maxWidth: 44)
            } minimal: {
                Image(systemName: "moon.fill")
            }
        }
    }
}

// MARK: - Bundle (single @main entry for the extension)

@main
struct LifeOSWidgetBundle: WidgetBundle {
    @WidgetBundleBuilder
    var body: some Widget {
        StreakRingWidget()
        TodayHabitsWidget()
        ReclaimedWidget()
        FocusStatusWidget()
        if #available(iOS 16.2, *) {
            LifeOSFocusLiveActivity()
        }
    }
}
