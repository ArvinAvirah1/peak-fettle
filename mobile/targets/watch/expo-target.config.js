/**
 * Peak Fettle watchOS app target (TICKET-140 Stage A).
 *
 * Built by @bacons/apple-targets at `npx expo prebuild -p ios`, same pattern
 * as targets/widget/ and targets/live-activity/ -- Swift sources live next to
 * this file and are picked up automatically via the plugin's file-system
 * synchronized group (no manual project.pbxproj wiring).
 *
 * `type: 'watch'` maps to productType "com.apple.product-type.application"
 * with needsEmbeddedSwift -- a real standalone watchOS app target (not an
 * extension), which is what WatchConnectivity + a SwiftUI UI both need.
 *
 * Per the architecture doc (audits/TICKET-140-watch-sync-architecture-2026-07-04.md):
 * the watch is a PURE MIRROR -- it never talks REST and never computes
 * anything. It only renders whatever JSON the phone last pushed via
 * applicationContext (WatchSessionManager.swift) and sends the phone a
 * `{type:"refresh"}` sendMessage on session activate.
 *
 * The App Group entitlement is NOT required for Stage A (the watch has no
 * App Group storage of its own -- WatchConnectivity's applicationContext is
 * the entire transport). Added here anyway, mirroring group.com.peakfettle.app,
 * in case a Stage C rest-timer snapshot cache benefits from it later; harmless
 * if unused today.
 */

/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'watch',
  name: 'PeakFettleWatch',
  displayName: 'Peak Fettle',
  // ".watchapp" -> com.peakfettle.app.watchapp (appended to the app bundle id).
  bundleIdentifier: '.watchapp',
  // watchOS 10 -- NavigationStack + modern SwiftUI APIs used by TodayView.
  deploymentTarget: '10.0',
  frameworks: ['SwiftUI', 'WatchConnectivity'],
  entitlements: {
    'com.apple.security.application-groups': ['group.com.peakfettle.app'],
  },
  colors: {
    $accent: { color: '#00D4C8', darkColor: '#00D4C8' },
    $watchBackground: { color: '#0A0E1A', darkColor: '#0A0E1A' },
  },
};
