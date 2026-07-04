// PeakFettleWidget — home & lock screen widgets.
// WIDGET-001 (founder 2026-06-11); expanded WIDGET-003 (2026-06-20).
//
// Data source: the app (src/services/widgetBridge.ts) writes a JSON payload to
// the `group.com.peakfettle.app` App Group under the key `widget_payload` and
// calls WidgetCenter.reloadAllTimelines() after every relevant local change.
// The payload now also carries the active in-app theme's colours so every widget
// matches the user's theme_preference (tokens.ts) with no extra fetch.
//
// Widgets in the bundle:
//   • Today   — split-focused: systemSmall/Medium/Large + accessoryRectangular + accessoryInline
//   • Week    — this-week stats: systemSmall/Medium/Large + accessoryCircular
//   • Streak  — week streak: systemSmall/Medium + accessoryCircular
//   • Custom  — configurable (iOS 17+): pick the stat in each slot (systemSmall/Medium/Large)
//
// For 'weekly' schedules the payload carries the 7-slot routine-name array so the
// provider re-derives "Today/Tomorrow" at render time (timeline refreshes just
// after midnight). 'cycle' schedules only advance on in-app completion.

import SwiftUI
import WidgetKit
import AppIntents

private let appGroup = "group.com.peakfettle.app"
private let payloadKey = "widget_payload"

// MARK: - Colour helpers

extension Color {
    init?(hexString: String?) {
        guard var s = hexString else { return nil }
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let v = Int(s, radix: 16) else { return nil }
        self = Color(
            .sRGB,
            red: Double((v >> 16) & 0xFF) / 255.0,
            green: Double((v >> 8) & 0xFF) / 255.0,
            blue: Double(v & 0xFF) / 255.0,
            opacity: 1
        )
    }
}

private func pfColor(_ hex: String?, _ fallback: String) -> Color {
    Color(hexString: hex) ?? Color(hexString: fallback)!
}

/// Resolved widget palette (falls back to the Deep Ocean default theme).
struct Palette {
    let bg: Color
    let tile: Color
    let accent: Color
    let text: Color
    let muted: Color
    let warn: Color
    let ink: Color

    init(_ t: ThemeColors?) {
        bg = pfColor(t?.bg, "#0A0E1A")
        tile = pfColor(t?.tile, "#151D35")
        accent = pfColor(t?.accent, "#00D4C8")
        text = pfColor(t?.text, "#FFFFFF")
        muted = pfColor(t?.muted, "#94A3B8")
        warn = pfColor(t?.warn, "#F59E0B")
        ink = pfColor(t?.ink, "#0A0E1A")
    }
}

// MARK: - Payload (mirrors WidgetPayload in src/services/widgetBridge.ts)

struct ThemeColors: Codable {
    var bg: String?
    var tile: String?
    var accent: String?
    var text: String?
    var muted: String?
    var warn: String?
    var ink: String?
}

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
    var daysThisWeek: Int?
    var weeklyGoal: Int?
    var trainedDays: [Bool]?
    var scheduledDays: [Bool]?
    var streakWeeks: Int?
    var longestStreakWeeks: Int?
    var setsThisWeek: Int?
    var volumeThisWeekKg: Double?
    var lastName: String?
    var lastWhen: String?
    var theme: ThemeColors?
}

func loadPayload() -> WidgetPayload? {
    guard
        let defaults = UserDefaults(suiteName: appGroup),
        let raw = defaults.string(forKey: payloadKey),
        let data = raw.data(using: .utf8)
    else { return nil }
    return try? JSONDecoder().decode(WidgetPayload.self, from: data)
}

// MARK: - Timeline entry

struct PFEntry: TimelineEntry {
    let date: Date
    let hasData: Bool
    let nextName: String?
    let whenLabel: String
    let isRest: Bool
    let prsThisWeek: Int
    let goalsThisWeek: Int
    let goalsActive: Int
    let daysThisWeek: Int
    let weeklyGoal: Int
    let trainedDays: [Bool]
    let scheduledDays: [Bool]
    let streakWeeks: Int
    let longestStreakWeeks: Int
    let setsThisWeek: Int
    let volumeThisWeekKg: Double
    let lastName: String?
    let lastWhen: String?
    let pal: Palette
}

private let weekdayShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/// Compact thousands format: 12480 → "12.5k", 940 → "940".
private func kfmt(_ v: Double) -> String {
    if v >= 1000 { return String(format: "%.1fk", v / 1000.0) }
    return String(Int(v.rounded()))
}

/// Monday-anchored index of "today" (0=Mon … 6=Sun).
private func todayMonIndex(_ date: Date = Date()) -> Int {
    (Calendar.current.component(.weekday, from: date) + 5) % 7
}

private func nextMidnight(after now: Date = Date()) -> Date {
    Calendar.current.nextDate(
        after: now, matching: DateComponents(hour: 0, minute: 5),
        matchingPolicy: .nextTime
    ) ?? now.addingTimeInterval(6 * 60 * 60)
}

func makeEntry(for date: Date) -> PFEntry {
    guard let p = loadPayload() else {
        return PFEntry(
            date: date, hasData: false, nextName: nil, whenLabel: "Open the app",
            isRest: false, prsThisWeek: 0, goalsThisWeek: 0, goalsActive: 0,
            daysThisWeek: 0, weeklyGoal: 3,
            trainedDays: Array(repeating: false, count: 7),
            scheduledDays: Array(repeating: false, count: 7),
            streakWeeks: 0, longestStreakWeeks: 0, setsThisWeek: 0,
            volumeThisWeekKg: 0, lastName: nil, lastWhen: nil, pal: Palette(nil)
        )
    }

    var nextName = p.nextName
    var whenLabel = p.whenLabel ?? "Next up"
    var isRest = p.isRest ?? false

    // Weekly mode: re-derive from the 7-slot array so the label survives midnight
    // without the app running (mirrors schedule.resolveNextUp).
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
        goalsThisWeek: p.goalsThisWeek ?? 0,
        goalsActive: p.goalsActive ?? 0,
        daysThisWeek: p.daysThisWeek ?? 0,
        weeklyGoal: max(1, p.weeklyGoal ?? 3),
        trainedDays: p.trainedDays ?? Array(repeating: false, count: 7),
        scheduledDays: p.scheduledDays ?? Array(repeating: false, count: 7),
        streakWeeks: p.streakWeeks ?? 0,
        longestStreakWeeks: p.longestStreakWeeks ?? 0,
        setsThisWeek: p.setsThisWeek ?? 0,
        volumeThisWeekKg: p.volumeThisWeekKg ?? 0,
        lastName: p.lastName,
        lastWhen: p.lastWhen,
        pal: Palette(p.theme)
    )
}

// MARK: - Providers

struct PFProvider: TimelineProvider {
    func placeholder(in context: Context) -> PFEntry { makeEntry(for: Date()) }

    func getSnapshot(in context: Context, completion: @escaping (PFEntry) -> Void) {
        completion(makeEntry(for: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PFEntry>) -> Void) {
        let entry = makeEntry(for: Date())
        completion(Timeline(entries: [entry], policy: .after(nextMidnight())))
    }
}

// MARK: - Background helpers

extension View {
    @ViewBuilder
    func pfBackground(_ pal: Palette) -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            self.containerBackground(pal.bg, for: .widget)
        } else {
            self.background(pal.bg)
        }
    }

    @ViewBuilder
    func pfAccessoryBackground() -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            self.containerBackground(.clear, for: .widget)
        } else {
            self
        }
    }
}

// MARK: - Shared building blocks

struct SplitBlock: View {
    let entry: PFEntry
    var size: CGFloat = 17
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(entry.whenLabel.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(entry.pal.muted)
            Text(entry.isRest ? "Rest day" : (entry.nextName ?? "No split set"))
                .font(.system(size: size, weight: .bold))
                .foregroundColor(entry.isRest ? entry.pal.muted : entry.pal.text)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
        }
    }
}

struct MiniStat: View {
    let value: String
    let label: String
    let pal: Palette
    var accent: Bool = false
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(value).font(.system(size: 20, weight: .bold))
                .foregroundColor(accent ? pal.accent : pal.text)
            Text(label).font(.system(size: 11)).foregroundColor(pal.muted).lineLimit(2)
        }
    }
}

struct StatTile: View {
    let value: String
    let label: String
    let pal: Palette
    var accent: Bool = false
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value).font(.system(size: 19, weight: .bold))
                .foregroundColor(accent ? pal.accent : pal.text)
            Text(label).font(.system(size: 11)).foregroundColor(pal.muted).lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 9)
        .padding(.horizontal, 10)
        .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(pal.tile))
    }
}

struct WeekDots: View {
    let entry: PFEntry
    private let labels = ["M", "T", "W", "T", "F", "S", "S"]
    var body: some View {
        let today = todayMonIndex()
        HStack(spacing: 0) {
            ForEach(0..<7, id: \.self) { i in
                VStack(spacing: 6) {
                    dot(i, today: today)
                    Text(labels[i]).font(.system(size: 11))
                        .foregroundColor(i == today ? entry.pal.accent : entry.pal.muted.opacity(0.85))
                }
                .frame(maxWidth: .infinity)
            }
        }
    }

    @ViewBuilder
    private func dot(_ i: Int, today: Int) -> some View {
        let trained = i < entry.trainedDays.count && entry.trainedDays[i]
        let scheduled = i < entry.scheduledDays.count && entry.scheduledDays[i]
        if i == today {
            Circle().strokeBorder(entry.pal.accent, lineWidth: 2).frame(width: 11, height: 11)
        } else if trained {
            Circle().fill(entry.pal.accent).frame(width: 10, height: 10)
        } else if scheduled {
            Circle().strokeBorder(entry.pal.muted.opacity(0.6), lineWidth: 1.5).frame(width: 10, height: 10)
        } else {
            Circle().fill(entry.pal.muted.opacity(0.4)).frame(width: 6, height: 6)
        }
    }
}

/// The "days this week" squircle: a rounded square whose accent border fills
/// proportionally (days / goal), with the count + label on the inner coin.
struct DaysSquare: View {
    let entry: PFEntry
    var side: CGFloat = 112
    private var progress: CGFloat {
        entry.weeklyGoal > 0 ? min(1, CGFloat(entry.daysThisWeek) / CGFloat(entry.weeklyGoal)) : 0
    }
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 28, style: .continuous).fill(entry.pal.tile)
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .trim(from: 0, to: progress)
                .stroke(entry.pal.accent, style: StrokeStyle(lineWidth: 9, lineCap: .round))
                .padding(5)
            VStack(spacing: 2) {
                Text("\(entry.daysThisWeek)/\(entry.weeklyGoal)")
                    .font(.system(size: 30, weight: .bold)).foregroundColor(entry.pal.text)
                Text("days this week").font(.system(size: 11)).foregroundColor(entry.pal.muted)
            }
            .padding(.horizontal, 8)
        }
        .frame(width: side, height: side)
    }
}

// MARK: - Interactive quick actions (TICKET-145, iOS 17+ with static fallback)
//
// "Start workout" / "Start rest" buttons wired to WidgetStartWorkoutIntent /
// WidgetStartRestIntent (AppIntents.swift). Button(intent:) requires iOS 17;
// below that, StaticFallbackActions renders the SAME two chips as plain
// widgetURL deep links (peak-fettle://start-workout, peak-fettle://start-rest)
// so pre-17 devices still get one-tap access — just via an app launch instead
// of an in-place widget action. The app's deep-link handler (owned by the
// orchestrator / app root, not this file) is expected to route those two
// paths to the same intentBridge plans this file's AppIntents post directly.

struct QuickActionChip: View {
    let label: String
    let systemImage: String
    let pal: Palette
    var body: some View {
        Label(label, systemImage: systemImage)
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(pal.ink)
            .padding(.vertical, 7)
            .padding(.horizontal, 11)
            .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(pal.accent))
    }
}

@available(iOSApplicationExtension 17.0, *)
struct InteractiveQuickActions: View {
    let entry: PFEntry
    var body: some View {
        HStack(spacing: 8) {
            Button(intent: WidgetStartWorkoutIntent()) {
                QuickActionChip(label: "Start", systemImage: "play.fill", pal: entry.pal)
            }
            .buttonStyle(.plain)
            Button(intent: WidgetStartRestIntent()) {
                QuickActionChip(label: "Rest", systemImage: "timer", pal: entry.pal)
            }
            .buttonStyle(.plain)
        }
    }
}

/// Pre-iOS 17 fallback: same two chips, but each is its own tappable widgetURL
/// deep link (a WidgetKit limitation — only ONE widgetURL applies per widget
/// on older iOS, so this fallback is only shown standalone, never alongside
/// another primary widgetURL on the same view — see TodayMedium/TodayLarge's
/// use of `.today` links only through this row on pre-17).
struct StaticFallbackActions: View {
    let entry: PFEntry
    var body: some View {
        HStack(spacing: 8) {
            Link(destination: URL(string: "peak-fettle://start-workout")!) {
                QuickActionChip(label: "Start", systemImage: "play.fill", pal: entry.pal)
            }
            Link(destination: URL(string: "peak-fettle://start-rest")!) {
                QuickActionChip(label: "Rest", systemImage: "timer", pal: entry.pal)
            }
        }
    }
}

struct QuickActionsRow: View {
    let entry: PFEntry
    var body: some View {
        if #available(iOSApplicationExtension 17.0, *) {
            InteractiveQuickActions(entry: entry)
        } else {
            StaticFallbackActions(entry: entry)
        }
    }
}

// MARK: - Today widget

struct TodaySmall: View {
    let entry: PFEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            SplitBlock(entry: entry, size: 20)
            Spacer(minLength: 0)
            Text("\(entry.prsThisWeek) PR\(entry.prsThisWeek == 1 ? "" : "s") · \(entry.goalsThisWeek) goal\(entry.goalsThisWeek == 1 ? "" : "s")")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(entry.pal.accent)
                .lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding()
        .pfBackground(entry.pal)
    }
}

struct TodayMedium: View {
    let entry: PFEntry
    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 8) {
                SplitBlock(entry: entry, size: 22)
                QuickActionsRow(entry: entry)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Rectangle().fill(entry.pal.muted.opacity(0.25)).frame(width: 1, height: 86)
            VStack(alignment: .leading, spacing: 9) {
                MiniStat(value: "\(entry.prsThisWeek)", label: "PRs this week", pal: entry.pal, accent: true)
                MiniStat(value: "\(entry.goalsThisWeek)", label: "Goals this week", pal: entry.pal)
            }
            .frame(width: 96, alignment: .leading)
        }
        .padding()
        .pfBackground(entry.pal)
    }
}

struct TodayLarge: View {
    let entry: PFEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(entry.whenLabel.uppercased())
                .font(.system(size: 11, weight: .semibold)).foregroundColor(entry.pal.muted)
            Text(entry.isRest ? "Rest day" : (entry.nextName ?? "No split set"))
                .font(.system(size: 27, weight: .bold)).foregroundColor(entry.pal.text)
                .lineLimit(1).minimumScaleFactor(0.7)

            WeekDots(entry: entry).padding(.top, 16)

            VStack(spacing: 9) {
                HStack(spacing: 9) {
                    StatTile(value: "\(entry.daysThisWeek)/\(entry.weeklyGoal)", label: "Days trained", pal: entry.pal, accent: true)
                    StatTile(value: "\(entry.prsThisWeek)", label: "PRs this week", pal: entry.pal)
                }
                HStack(spacing: 9) {
                    StatTile(value: kfmt(entry.volumeThisWeekKg), label: "kg lifted", pal: entry.pal)
                    StatTile(value: "\(entry.streakWeeks)", label: "week streak", pal: entry.pal, accent: true)
                }
            }
            .padding(.top, 14)

            QuickActionsRow(entry: entry).padding(.top, 14)

            Spacer(minLength: 0)

            if let name = entry.lastName {
                Divider().overlay(entry.pal.muted.opacity(0.25))
                Text("Last: \(name)\(entry.lastWhen.map { " · \($0)" } ?? "")")
                    .font(.system(size: 12)).foregroundColor(entry.pal.muted)
                    .padding(.top, 8).lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding()
        .pfBackground(entry.pal)
    }
}

struct TodayRectangular: View {
    let entry: PFEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(entry.whenLabel.uppercased()).font(.system(size: 11, weight: .semibold)).opacity(0.7)
            Text(entry.isRest ? "Rest day" : (entry.nextName ?? "No split set"))
                .font(.system(size: 16, weight: .bold)).lineLimit(1).minimumScaleFactor(0.7)
            Text("\(entry.prsThisWeek) PRs · \(entry.daysThisWeek)/\(entry.weeklyGoal) days")
                .font(.system(size: 11)).opacity(0.85)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .pfAccessoryBackground()
    }
}

struct TodayInline: View {
    let entry: PFEntry
    var body: some View {
        Label(
            "\(entry.isRest ? "Rest day" : (entry.nextName ?? "No split")) · \(entry.prsThisWeek) PRs",
            systemImage: "dumbbell.fill"
        )
    }
}

// TICKET-145: TodayMedium/TodayLarge nest a QuickActionsRow (Button(intent:)
// on iOS 17+, plain Link on pre-17) INSIDE this view's own `.widgetURL`
// below. This is standard, documented WidgetKit precedence — a tap that
// lands on a nested Link/Button(intent:) is handled by that control; only
// taps OUTSIDE any nested interactive control fall through to the
// container's widgetURL. No conflict: the quick-action chips get their own
// tap targets, the rest of the card still opens the app.
struct TodayEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: PFEntry
    var body: some View {
        Group {
            switch family {
            case .accessoryRectangular: TodayRectangular(entry: entry)
            case .accessoryInline: TodayInline(entry: entry)
            case .systemLarge: TodayLarge(entry: entry)
            case .systemMedium: TodayMedium(entry: entry)
            default: TodaySmall(entry: entry)
            }
        }
        .widgetURL(URL(string: "peak-fettle://"))
    }
}

// MARK: - Week widget

struct WeekSmall: View {
    let entry: PFEntry
    var body: some View {
        DaysSquare(entry: entry)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(8)
            .pfBackground(entry.pal)
    }
}

struct WeekMedium: View {
    let entry: PFEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("THIS WEEK").font(.system(size: 11, weight: .semibold)).foregroundColor(entry.pal.muted)
            HStack(spacing: 9) {
                StatTile(value: "\(entry.daysThisWeek)/\(entry.weeklyGoal)", label: "Days", pal: entry.pal, accent: true)
                StatTile(value: "\(entry.prsThisWeek)", label: "PRs", pal: entry.pal)
                StatTile(value: kfmt(entry.volumeThisWeekKg), label: "kg", pal: entry.pal)
                StatTile(value: "\(entry.setsThisWeek)", label: "Sets", pal: entry.pal)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding()
        .pfBackground(entry.pal)
    }
}

struct WeekLarge: View {
    let entry: PFEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("THIS WEEK").font(.system(size: 11, weight: .semibold)).foregroundColor(entry.pal.muted)
            VStack(spacing: 9) {
                HStack(spacing: 9) {
                    StatTile(value: "\(entry.daysThisWeek)/\(entry.weeklyGoal)", label: "Days trained", pal: entry.pal, accent: true)
                    StatTile(value: "\(entry.streakWeeks)", label: "week streak", pal: entry.pal)
                }
                HStack(spacing: 9) {
                    StatTile(value: "\(entry.prsThisWeek)", label: "PRs this week", pal: entry.pal)
                    StatTile(value: "\(entry.goalsThisWeek)", label: "Goals hit", pal: entry.pal)
                }
                HStack(spacing: 9) {
                    StatTile(value: kfmt(entry.volumeThisWeekKg), label: "kg lifted", pal: entry.pal)
                    StatTile(value: "\(entry.setsThisWeek)", label: "Total sets", pal: entry.pal)
                }
            }
            .padding(.top, 12)
            Spacer(minLength: 0)
            WeekDots(entry: entry)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding()
        .pfBackground(entry.pal)
    }
}

struct WeekCircular: View {
    let entry: PFEntry
    private var progress: Double {
        entry.weeklyGoal > 0 ? min(1, Double(entry.daysThisWeek) / Double(entry.weeklyGoal)) : 0
    }
    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            Circle().trim(from: 0, to: progress)
                .stroke(style: StrokeStyle(lineWidth: 5, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .padding(4)
            VStack(spacing: -1) {
                Text("\(entry.daysThisWeek)").font(.system(size: 16, weight: .bold))
                Text("/\(entry.weeklyGoal)").font(.system(size: 10))
            }
        }
        .pfAccessoryBackground()
    }
}

struct WeekEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: PFEntry
    var body: some View {
        Group {
            switch family {
            case .accessoryCircular: WeekCircular(entry: entry)
            case .systemLarge: WeekLarge(entry: entry)
            case .systemMedium: WeekMedium(entry: entry)
            default: WeekSmall(entry: entry)
            }
        }
        .widgetURL(URL(string: "peak-fettle://"))
    }
}

// MARK: - Streak widget

struct StreakSmall: View {
    let entry: PFEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text("\(entry.streakWeeks)").font(.system(size: 46, weight: .bold)).foregroundColor(entry.pal.accent)
                Image(systemName: "flame.fill").font(.system(size: 20)).foregroundColor(entry.pal.warn)
            }
            Text("week streak").font(.system(size: 13, weight: .semibold)).foregroundColor(entry.pal.text)
            Text("Longest \(entry.longestStreakWeeks) weeks").font(.system(size: 11)).foregroundColor(entry.pal.muted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding()
        .pfBackground(entry.pal)
    }
}

struct StreakMedium: View {
    let entry: PFEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 11) {
                Image(systemName: "flame.fill").font(.system(size: 26)).foregroundColor(entry.pal.warn)
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text("\(entry.streakWeeks)").font(.system(size: 30, weight: .bold)).foregroundColor(entry.pal.accent)
                    Text("week streak").font(.system(size: 15, weight: .semibold)).foregroundColor(entry.pal.text)
                }
            }
            HStack(spacing: 6) {
                ForEach(0..<5, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 4)
                        .fill(i < min(entry.streakWeeks, 5) ? entry.pal.accent : entry.pal.muted.opacity(0.25))
                        .frame(height: 7)
                }
            }
            .padding(.top, 15)
            Text("This week: \(entry.daysThisWeek) / \(entry.weeklyGoal) days · Longest \(entry.longestStreakWeeks)")
                .font(.system(size: 12)).foregroundColor(entry.pal.muted).padding(.top, 10)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding()
        .pfBackground(entry.pal)
    }
}

struct StreakCircular: View {
    let entry: PFEntry
    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: -1) {
                Image(systemName: "flame.fill").font(.system(size: 14))
                Text("\(entry.streakWeeks)").font(.system(size: 16, weight: .bold))
                Text("wk").font(.system(size: 9))
            }
        }
        .pfAccessoryBackground()
    }
}

struct StreakEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: PFEntry
    var body: some View {
        Group {
            switch family {
            case .accessoryCircular: StreakCircular(entry: entry)
            case .systemMedium: StreakMedium(entry: entry)
            default: StreakSmall(entry: entry)
            }
        }
        .widgetURL(URL(string: "peak-fettle://"))
    }
}

// MARK: - Configurable "Custom" widget (iOS 17+)

@available(iOSApplicationExtension 17.0, *)
enum PFMetric: String, AppEnum {
    case todaySplit
    case daysTrained
    case streak
    case prs
    case goals
    case volume
    case sets
    case lastWorkout

    static var typeDisplayRepresentation: TypeDisplayRepresentation { "Stat" }
    static var caseDisplayRepresentations: [PFMetric: DisplayRepresentation] {
        [
            .todaySplit: "Today's split",
            .daysTrained: "Days trained + goal",
            .streak: "Current streak",
            .prs: "PRs this week",
            .goals: "Goals this week",
            .volume: "Weekly volume",
            .sets: "Total sets",
            .lastWorkout: "Last workout",
        ]
    }
}

@available(iOSApplicationExtension 17.0, *)
struct PFConfigIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource { "Choose stats" }
    static var description: IntentDescription { IntentDescription("Pick what each slot shows.") }

    @Parameter(title: "Slot 1", default: .todaySplit) var slot1: PFMetric
    @Parameter(title: "Slot 2", default: .streak) var slot2: PFMetric
    @Parameter(title: "Slot 3", default: .daysTrained) var slot3: PFMetric
    @Parameter(title: "Slot 4", default: .prs) var slot4: PFMetric
    @Parameter(title: "Slot 5", default: .volume) var slot5: PFMetric
    @Parameter(title: "Slot 6", default: .sets) var slot6: PFMetric
}

@available(iOSApplicationExtension 17.0, *)
struct PFConfigEntry: TimelineEntry {
    let date: Date
    let data: PFEntry
    let config: PFConfigIntent
}

@available(iOSApplicationExtension 17.0, *)
struct PFConfigProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> PFConfigEntry {
        PFConfigEntry(date: Date(), data: makeEntry(for: Date()), config: PFConfigIntent())
    }
    func snapshot(for configuration: PFConfigIntent, in context: Context) async -> PFConfigEntry {
        PFConfigEntry(date: Date(), data: makeEntry(for: Date()), config: configuration)
    }
    func timeline(for configuration: PFConfigIntent, in context: Context) async -> Timeline<PFConfigEntry> {
        let entry = PFConfigEntry(date: Date(), data: makeEntry(for: Date()), config: configuration)
        return Timeline(entries: [entry], policy: .after(nextMidnight()))
    }
}

@available(iOSApplicationExtension 17.0, *)
private func metricValue(_ m: PFMetric, _ e: PFEntry) -> (String, String, Bool) {
    switch m {
    case .todaySplit: return (e.isRest ? "Rest" : (e.nextName ?? "—"), "Today", false)
    case .daysTrained: return ("\(e.daysThisWeek)/\(e.weeklyGoal)", "Days trained", true)
    case .streak: return ("\(e.streakWeeks)", "Week streak", true)
    case .prs: return ("\(e.prsThisWeek)", "PRs this week", false)
    case .goals: return ("\(e.goalsThisWeek)", "Goals this week", false)
    case .volume: return (kfmt(e.volumeThisWeekKg), "kg lifted", false)
    case .sets: return ("\(e.setsThisWeek)", "Total sets", false)
    case .lastWorkout: return (e.lastName ?? "—", "Last\(e.lastWhen.map { " · \($0)" } ?? "")", false)
    }
}

@available(iOSApplicationExtension 17.0, *)
struct MetricTile: View {
    let metric: PFMetric
    let entry: PFEntry
    var body: some View {
        let v = metricValue(metric, entry)
        return VStack(alignment: .leading, spacing: 3) {
            Text(v.0).font(.system(size: 18, weight: .bold))
                .foregroundColor(v.2 ? entry.pal.accent : entry.pal.text)
                .lineLimit(1).minimumScaleFactor(0.6)
            Text(v.1).font(.system(size: 11)).foregroundColor(entry.pal.muted).lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding(.vertical, 9).padding(.horizontal, 10)
        .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(entry.pal.tile))
    }
}

@available(iOSApplicationExtension 17.0, *)
struct CustomEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: PFConfigEntry
    var body: some View {
        let e = entry.data
        let c = entry.config
        Group {
            switch family {
            case .systemLarge:
                VStack(spacing: 9) {
                    HStack(spacing: 9) { MetricTile(metric: c.slot1, entry: e); MetricTile(metric: c.slot2, entry: e) }
                    HStack(spacing: 9) { MetricTile(metric: c.slot3, entry: e); MetricTile(metric: c.slot4, entry: e) }
                    HStack(spacing: 9) { MetricTile(metric: c.slot5, entry: e); MetricTile(metric: c.slot6, entry: e) }
                }
                .padding().pfBackground(e.pal)
            case .systemMedium:
                HStack(spacing: 9) {
                    MetricTile(metric: c.slot1, entry: e)
                    MetricTile(metric: c.slot2, entry: e)
                    MetricTile(metric: c.slot3, entry: e)
                }
                .padding().pfBackground(e.pal)
            default:
                MetricTile(metric: c.slot1, entry: e)
                    .padding().pfBackground(e.pal)
            }
        }
        .widgetURL(URL(string: "peak-fettle://"))
    }
}

// MARK: - Widgets

struct PeakFettleTodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PeakFettleWidget", provider: PFProvider()) { entry in
            TodayEntryView(entry: entry)
        }
        .configurationDisplayName("Peak Fettle — Today")
        .description("Your next split, PRs and goals this week.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular, .accessoryInline])
    }
}

struct PeakFettleWeekWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PeakFettleWeekWidget", provider: PFProvider()) { entry in
            WeekEntryView(entry: entry)
        }
        .configurationDisplayName("Peak Fettle — This Week")
        .description("Days trained, PRs, volume and sets this week.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular])
    }
}

struct PeakFettleStreakWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PeakFettleStreakWidget", provider: PFProvider()) { entry in
            StreakEntryView(entry: entry)
        }
        .configurationDisplayName("Peak Fettle — Streak")
        .description("Your training week-streak at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular])
    }
}

@available(iOSApplicationExtension 17.0, *)
struct PeakFettleCustomWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "PeakFettleCustomWidget", intent: PFConfigIntent.self, provider: PFConfigProvider()) { entry in
            CustomEntryView(entry: entry)
        }
        .configurationDisplayName("Peak Fettle — Custom")
        .description("Pick the stat shown in each slot.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

// MARK: - Bundle

@main
struct PeakFettleWidgetBundle: WidgetBundle {
    var body: some Widget {
        PeakFettleTodayWidget()
        PeakFettleWeekWidget()
        PeakFettleStreakWidget()
        if #available(iOSApplicationExtension 17.0, *) {
            PeakFettleCustomWidget()
        }
    }
}
