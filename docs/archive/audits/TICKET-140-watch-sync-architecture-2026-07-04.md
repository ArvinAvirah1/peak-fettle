# TICKET-140 — Apple Watch v1: sync architecture (Opus-lane review, 2026-07-04)

**Founder decisions locked (2026-07-04):** GO on the watch block. Standalone-watch logging: **phone always present** — the watch is a pure mirror/remote; the PHONE is the only source of truth and the only thing that touches the local DB. No watch-local store, no sync merge. (Retrofitting standalone later = rework of the queue layer; accepted.)

## Invariants (from CLAUDE.md, extended to the wrist)
1. **The watch NEVER talks REST.** All watch traffic is WatchConnectivity to the paired phone; the phone writes through the existing tier-branched local data layer. Local-first holds on both tiers by construction.
2. **No unit/locale logic in Swift.** All display strings (weights via `constants/units.ts` formatWeight, effort via loggerLogic.formatEffort) are formatted on the phone and shipped as strings — same rule the live-activity payload follows.
3. **Phone remains source of truth for timing** (`useRestTimer`) and session state (`WorkoutLoggerHost`); the watch renders and requests, never owns.

## Transport map (WCSession)
- **applicationContext** (latest-state, survives offline/killed watch app): phone → watch mirror payload (Stage A) and session-state snapshots (Stage C rest timer).
- **sendMessage** (reachable, request/reply): watch → phone "refresh" handshake on activate; Stage B optimistic set-log delivery when reachable.
- **transferUserInfo** (queued, guaranteed order, survives process death): Stage B offline set-log queue, replayed by the OS; conflict rule last-write-wins per set id (phone applies by `(workout_id, exercise_id, set_index)`); idempotent apply via a `client_action_id` uuid generated on the watch.

## Stage A (this wave): mirror + handshake
- `mobile/targets/watch/` — @bacons/apple-targets `type: 'watch'` SwiftUI app (deploymentTarget watchOS 10). Screens: Today (workout name, exercise list with target sets × reps × weight strings), empty/"open phone" state, connectivity dot.
- `mobile/modules/watch-connectivity/` — local Expo module (Swift, WCSession delegate on the phone): `isSupported/isPaired/isWatchAppInstalled`, `updateApplicationContext(json)`, event `onWatchMessage` (Stage B uses it; Stage A only handles `{type:'refresh'}` by re-pushing context).
- `mobile/src/native/watchBridge.ts` — guarded facade, EXACT pattern of `src/native/liveActivity.ts` (no-ops when module absent — Android, simulator, Expo Go, JS tests).
- `mobile/src/hooks/useWatchMirror.ts` — builds the mirror payload from the EXISTING local data layer (today's scheduled workout: same selectors the home tab uses), pushes on app foreground + after workout save + on `refresh` request. Deferred/idle, never on the boot critical path (CLAUDE.md §5 discipline).
- Payload v1 (versioned envelope): `{ v: 1, generatedAt, today: { workoutName, exercises: [{ name, sets, repsLabel, weightLabel, done }] } | null }`.
- **Parking after merge:** 🔔 EAS build + physical iPhone+Watch pairing test (handshake, mirror renders, refresh round-trip) BEFORE Stage B starts.

## Stage B (next): set logging from the wrist
Watch UI ticks a set (✓ at target or crown-adjust reps/weight in DISPLAY units — converted on the PHONE via `displayToKg`; the watch sends the raw display value + unit tag, never kg math in Swift). Delivery: sendMessage when reachable else transferUserInfo queue; phone applies through the same local-data write path the logger uses (no new write surface), emits updated mirror context back. Idempotency by `client_action_id`; last-write-wins per set id.

## Stage C (last): rest timer + HR
Rest timer state snapshots ride applicationContext (watch haptic at zero from the shipped end date — no per-second traffic, same trick as the Live Activity). HR via HKWorkoutSession on the watch → summarized per-set/per-workout → `importCardioMetrics` (the adapter seam built for exactly this).

## Discovered during review (fixed this wave)
`mobile/modules/` did not exist: TICKET-137's host-side `LiveActivityModule` local Expo module (contract documented in `src/native/liveActivity.ts` header) was never created, so `isLiveActivityAvailable()` is permanently false and the Live Activity never starts. Building it now (same local-module pattern Stage A needs). 137's device test remains parked on the EAS batch.

## Risks / notes for the founder
- Swift cannot be compiled in the dev sandbox — the EAS build IS the compile check for `targets/watch`, `modules/*`. Budget one iteration.
- watchOS app review: watch targets add App Store screenshot/asset obligations — none needed for TestFlight stages.
- Battery soak test (60-min workout, screen-off gaps, zero lost sets) is the Stage B/C exit gate, per the roadmap.
