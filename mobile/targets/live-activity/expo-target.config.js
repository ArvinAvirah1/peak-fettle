/**
 * Peak Fettle iOS Live Activity target (TICKET-137).
 *
 * Built by @bacons/apple-targets at `npx expo prebuild -p ios`, same pattern
 * as targets/widget/ (WIDGET-001). The Swift sources live next to this file
 * (RestTimerLiveActivity.swift for the ActivityKit widget UI, AppIntents.swift
 * for the +15s/Skip button actions).
 *
 * Live Activities are a WIDGET-EXTENSION target — a widget bundle can host
 * BOTH regular home-screen widgets and Live Activities, but this repo already
 * has targets/widget/ dedicated to the home/lock-screen stat widgets
 * (PeakFettleWidget bundle id `.widget`). Rather than merge unrelated
 * concerns into one Swift file, this is a SEPARATE widget-extension target
 * (`.liveactivity`) whose WidgetBundle contains only the ActivityKit
 * Live Activity — @bacons/apple-targets supports multiple widget-type
 * targets in one app (each gets its own extension + Info.plist).
 *
 * The App Group entitlement is mirrored automatically from
 * ios.entitlements['com.apple.security.application-groups'] in app.json
 * (already `group.com.peakfettle.app`, shared with targets/widget/).
 *
 * NSSupportsLiveActivities must be set to true in app.json's ios.infoPlist —
 * see the orchestrator-owned app.json diff in this ticket's final report.
 */

/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'PeakFettleRestTimerActivity',
  displayName: 'Peak Fettle Rest Timer',
  // ".liveactivity" → com.peakfettle.app.liveactivity (appended to the app bundle id).
  bundleIdentifier: '.liveactivity',
  // ActivityKit + the Text(timerInterval:) native countdown need iOS 16.1+
  // (Dynamic Island compact/expanded/minimal presentations are 16.1+; the
  // widget itself still degrades to lock-screen-only on non-Island devices).
  deploymentTarget: '16.1',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit', 'AppIntents'],
  colors: {
    $accent: { color: '#00D4C8', darkColor: '#00D4C8' },
    $activityBackground: { color: '#0A0E1A', darkColor: '#0A0E1A' },
  },
};
