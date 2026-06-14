/**
 * Peak Fettle iOS widget target (WIDGET-001, founder 2026-06-11).
 *
 * Built by @bacons/apple-targets at `npx expo prebuild -p ios`. The Swift
 * sources live next to this file (index.swift) and read the JSON payload the
 * app writes to the App Group via src/services/widgetBridge.ts.
 *
 * The App Group entitlement is mirrored automatically from
 * ios.entitlements['com.apple.security.application-groups'] in app.json.
 */

/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'PeakFettleWidget',
  displayName: 'Peak Fettle',
  // ".widget" → com.peakfettle.app.widget (appended to the app bundle id).
  bundleIdentifier: '.widget',
  // Matches the app's minimum (RN 0.81 / Expo SDK 54). Lock-screen accessory
  // families are gated at runtime with #available(iOS 16).
  deploymentTarget: '15.1',
  frameworks: ['SwiftUI', 'WidgetKit'],
  colors: {
    $accent: { color: '#00D4C8', darkColor: '#00D4C8' },
    $widgetBackground: { color: '#0A0E1A', darkColor: '#0A0E1A' },
  },
};
