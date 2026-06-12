# Life OS — Native Blocking Architecture (TICKET-102)

## What's here

| Piece | Path | Role |
|-------|------|------|
| JS facade | `src/native/blocking.ts` | Single TS entry point; no-ops gracefully when the module is absent |
| Local Expo module | `modules/lifeos-blocking/` | Authorization, FamilyActivityPicker, shields, schedules, exemptions |
| Monitor extension | `targets/device-activity-monitor/` | Applies/clears shields on schedule boundaries + usage thresholds |
| Shield UI extension | `targets/shield-config/` | Branded block screen |
| Shield action extension | `targets/shield-action/` | Button handling + pending-unlock handoff |
| Report extension | `targets/activity-report/` | On-device screen-time display (data cannot leave the device) |
| Config plugin | `plugins/withFamilyControls.js` | Main-target entitlements (FamilyControls + App Group) |

## ⚠️ Founder action — day 1 (Apple review clock)

1. Sign in to the [Apple Developer portal](https://developer.apple.com/account).
2. Identifiers → register `com.peakfettle.lifeos` (+ the four extension IDs
   prebuild generates, e.g. `com.peakfettle.lifeos.LifeOSDeviceActivityMonitor`).
3. Request the **Family Controls (Distribution)** entitlement:
   developer.apple.com → "Family Controls entitlement request" form, one
   request per bundle ID that needs it (main app + monitor + both shield
   extensions). Justification: user-initiated self-screen-time management;
   no parental-control marketing.
4. **Development** builds work immediately with the development entitlement —
   building/testing does not wait for Apple.

## Build + verify (requires macOS — NOT possible from this Windows sandbox)

```bash
cd lifeos
npm install
npx expo prebuild -p ios          # generates ios/, applies plugin + targets
npx expo run:ios --device         # dev client on a physical device (Screen Time needs real hardware)
```

Definition-of-done demo (spec §TICKET-102): pick an app → shield appears →
shield's "Open … to unlock" → app foregrounds → friction flow runs →
`grantExemption` lifts the shield → auto-reshield after the grant window.

## Honest caveats (recorded for TICKET-113)

- **None of the Swift in this directory has been compiled.** It was written
  on Windows against the documented FamilyControls/ManagedSettings/
  DeviceActivity APIs (iOS 16+). Expect minor API-signature fixes on first
  `xcodebuild`.
- `@bacons/apple-targets` target `type` strings for shield/monitor/report
  extensions depend on the installed version. If a type is unsupported,
  create the target manually in Xcode and copy the Swift files — they are the
  deliverable; the config files are convenience.
- Shield action extensions **cannot launch the host app** (OS restriction).
  The unlock handoff is via the App Group `pending_unlock` marker — see
  `ShieldActionExtension.swift` header. Friction state lives app-side, so a
  forged `lifeos://unlock` deep link cannot lift a shield.
- Selection tokens (`FamilyActivitySelection`) are **not portable across
  devices**: after a backup restore the user re-picks apps (restore flow
  already includes this step).
