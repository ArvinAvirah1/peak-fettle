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

struct TodayView: View {
    @EnvironmentObject private var session: WatchSessionManager

    var body: some View {
        NavigationStack {
            ZStack {
                Color("watchBackground").ignoresSafeArea()
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
            if let today = payload.today {
                WorkoutList(today: today)
            } else {
                RestDayState()
            }
        } else {
            NoDataState()
        }
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
            .fill(reachable ? Color("accent") : Color.clear)
            .strokeBorder(reachable ? Color("accent") : Color.gray.opacity(0.5), lineWidth: 1.5)
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
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)
                    .lineLimit(2)
                Text(setsRepsLabel)
                    .font(.system(size: 12))
                    .foregroundColor(.gray)
                if let weightLabel = exercise.weightLabel {
                    Text(weightLabel)
                        .font(.system(size: 12))
                        .foregroundColor(Color("accent"))
                }
            }
            Spacer(minLength: 4)
            if exercise.done {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(Color("accent"))
                    .font(.system(size: 16))
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
                .font(.system(size: 28))
                .foregroundColor(.gray)
            Text("Open Peak Fettle on your iPhone")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(.white)
                .multilineTextAlignment(.center)
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
                .font(.system(size: 26))
                .foregroundColor(Color("accent"))
            Text("Rest day")
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(.white)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
