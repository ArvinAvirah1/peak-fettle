// TodayView.swift -- TICKET-140 Stage A watch UI.
//
// Scope (Stage A only, per DEV_ROADMAP_2026-07-03-FEATURE-GAPS.md acceptance
// criteria #1): workout name + exercise rows (name, "sets x repsLabel",
// weightLabel, done checkmark), a no-data state, and a connectivity
// indicator. NO set logging, NO rest timer here -- that's Stage B/C.
//
// Every string rendered here (repsLabel, weightLabel) was already formatted
// on the phone (constants/units.ts formatWeight / the routine's target_reps
// string) -- this view does no unit or locale logic, per the architecture
// doc's "no unit/locale logic in Swift" rule.

import SwiftUI

// WATCH-02 correction (2026-08-04): the $-prefixed colorsets are generated
// EMPTY by @bacons/apple-targets ({"colors": []} — verified with assetutil;
// the built Assets.car carries only AppIcon), so catalog color lookups
// resolve to nothing and the whole watch UI rendered grayscale. Hardcode the brand
// palette exactly as the widget target does until colorset generation works.
private let pfAccent = Color(red: 0x00 / 255, green: 0xD4 / 255, blue: 0xC8 / 255)
private let pfBackground = Color(red: 0x0A / 255, green: 0x0E / 255, blue: 0x1A / 255)

struct TodayView: View {
    @EnvironmentObject private var session: WatchSessionManager

    var body: some View {
        NavigationStack {
            ZStack {
                pfBackground.ignoresSafeArea()
                content
            }
            .navigationTitle("Today")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    ConnectivityDot(reachable: session.isReachable)
                }
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        if let payload = session.payload {
            VStack(spacing: 0) {
                // WATCH-10: the mirror is pushed by the phone and can survive a
                // midnight rollover — flag it when it was generated on an
                // earlier day so "Today" isn't silently yesterday's plan.
                if let staleDay = staleDayLabel(generatedAt: payload.generatedAt) {
                    StalenessBanner(dayLabel: staleDay)
                }
                if let today = payload.today {
                    WorkoutList(today: today)
                } else {
                    RestDayState()
                }
            }
        } else {
            NoDataState()
        }
    }

    /// Returns a short "data from ..." day label when the payload's
    /// `generatedAt` (ISO-8601, phone-generated) falls on a different calendar
    /// day than today; nil when the payload is from today (no banner). Parsing
    /// a timestamp is not display/unit logic — the phone still formats every
    /// user-facing workout string.
    private func staleDayLabel(generatedAt: String) -> String? {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let parsed = iso.date(from: generatedAt) ?? {
            let plain = ISO8601DateFormatter()
            plain.formatOptions = [.withInternetDateTime]
            return plain.date(from: generatedAt)
        }()
        guard let date = parsed else { return nil }
        guard !Calendar.current.isDateInToday(date) else { return nil }
        return date.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())
    }
}

/// WATCH-10: shown above the list when the last payload was generated on a
/// previous day (phone hasn't pushed since midnight).
private struct StalenessBanner: View {
    let dayLabel: String
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "clock.arrow.circlepath")
                .font(.caption2)
            Text("Data from \(dayLabel)")
                .font(.caption2)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .foregroundColor(.orange)
        .padding(.vertical, 2)
        .frame(maxWidth: .infinity)
        .accessibilityLabel("Data from \(dayLabel). Open Peak Fettle on your iPhone to refresh.")
    }
}

// MARK: - Connectivity indicator

/// Small dot in the nav bar: filled accent when the phone is reachable right
/// now, hollow/muted otherwise. Mirrors are still shown from the last
/// applicationContext even when not reachable -- this is a live-link
/// indicator, not a "data is stale" warning.
private struct ConnectivityDot: View {
    let reachable: Bool
    var body: some View {
        Circle()
            .fill(reachable ? pfAccent : Color.clear)
            .strokeBorder(reachable ? pfAccent : Color.gray.opacity(0.5), lineWidth: 1.5)
            .frame(width: 8, height: 8)
            .accessibilityLabel(reachable ? "iPhone connected" : "iPhone not reachable")
    }
}

// MARK: - Workout list

private struct WorkoutList: View {
    let today: WatchTodayMirror

    var body: some View {
        List {
            Section {
                ForEach(today.exercises) { exercise in
                    ExerciseRow(exercise: exercise)
                }
            } header: {
                Text(today.workoutName)
                    .font(.headline)
                    .foregroundColor(.white)
                    .textCase(nil)
            }
        }
        .listStyle(.carousel)
    }
}

private struct ExerciseRow: View {
    let exercise: WatchExerciseMirror

    private var setsRepsLabel: String {
        "\(exercise.sets) sets x \(exercise.repsLabel)"
    }

    var body: some View {
        HStack(alignment: .top, spacing: 6) {
            VStack(alignment: .leading, spacing: 2) {
                Text(exercise.name)
                    .font(.body.weight(.semibold))
                    .foregroundColor(.white)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                Text(setsRepsLabel)
                    .font(.caption2)
                    .foregroundColor(.gray)
                    .minimumScaleFactor(0.8)
                if let weightLabel = exercise.weightLabel {
                    Text(weightLabel)
                        .font(.caption2)
                        .foregroundColor(pfAccent)
                        .minimumScaleFactor(0.8)
                }
            }
            Spacer(minLength: 4)
            if exercise.done {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(pfAccent)
                    .font(.body)
                    .accessibilityLabel("Done")
            }
        }
        .padding(.vertical, 2)
    }
}

// MARK: - Empty states

/// No payload has ever been received this launch -- the phone app hasn't
/// pushed anything yet (fresh pairing, or the iPhone app has never opened
/// since the watch app installed).
private struct NoDataState: View {
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "iphone.gen3")
                .font(.title2)
                .foregroundColor(.gray)
            Text("Open Peak Fettle on your iPhone")
                .font(.footnote.weight(.medium))
                .foregroundColor(.white)
                .multilineTextAlignment(.center)
                .minimumScaleFactor(0.8)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// The phone confirmed there's nothing scheduled today (rest day, or no
/// schedule configured at all).
private struct RestDayState: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "moon.zzz.fill")
                .font(.title3)
                .foregroundColor(pfAccent)
            Text("Rest day")
                .font(.body.weight(.semibold))
                .foregroundColor(.white)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
