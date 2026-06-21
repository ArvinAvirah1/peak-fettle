/**
 * Peak Fettle LifeOS iOS widget + Live Activity target (TICKET-116/118).
 *
 * Mirrors the proven fitness-app widget target (mobile/targets/widget). Built by
 * @bacons/apple-targets at `npx expo prebuild -p ios`. Swift sources live next to
 * this file (index.swift) and read the JSON payload the app writes to the App
 * Group via src/services/widgetBridge.ts. The App Group entitlement is mirrored
 * from ios.entitlements['com.apple.security.application-groups'] in app.json.
 *
 * Colors here are static asset-catalog fallbacks ONLY; at runtime the widget
 * paints itself from the `theme` block inside the shared payload so it always
 * matches the user's active in-app theme (same pattern as the fitness widget).
 */

/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'LifeOSWidget',
  displayName: 'LifeOS',
  // ".widget" -> com.peakfettle.lifeos.widget (appended to the app bundle id).
  bundleIdentifier: '.widget',
  // iOS 16.1: lock-screen accessory families need 16.0; ActivityKit Live
  // Activities need 16.1; interactive App Intents check-off needs 17 (gated in code).
  deploymentTarget: '16.1',
  frameworks: ['SwiftUI', 'WidgetKit', 'AppIntents', 'ActivityKit'],
  colors: {
    $accent: { color: '#5B8DEF', darkColor: '#5B8DEF' },
    $widgetBackground: { color: '#0E1117', darkColor: '#0E1117' },
  },
};
