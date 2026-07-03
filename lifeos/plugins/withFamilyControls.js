/**
 * Expo config plugin — FamilyControls support + build toggle (TICKET-102 #3).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛳ THE ONE SWITCH:
 *   FAMILY_CONTROLS_ENABLED = false  → blocker OFF at build level. The four FC
 *     extension targets in lifeos/targets/ are skipped, the FC entitlement is
 *     stripped from the main app, and the FC appExtensions are removed from the
 *     EAS credentials config. App Store / preview / production builds sign
 *     WITHOUT Apple's Family Controls distribution entitlement. The Focus tab
 *     ships dark (its designed pre-entitlement state, Q18a); ALL code stays in
 *     the repo untouched.
 *   FAMILY_CONTROLS_ENABLED = true   → full blocker build. Requires Apple's
 *     Family Controls (Distribution) entitlement grant for com.peakfettle.lifeos
 *     + .monitor/.shield/.shieldaction/.report for store-class profiles
 *     (Development-signed builds work without the grant).
 *   Nothing else needs to change in either direction — flip, commit, rebuild.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * With FC enabled this plugin also:
 * 1. Teaches @bacons/apple-targets (≤4.0.7) the one FC target type it lacks,
 *    'device-activity-report' (registry + derived maps + a type alias inside
 *    createConfigurationListForType, whose exhaustive switch otherwise throws).
 *    'device-activity-monitor'/'shield-config'/'shield-action' are native, with
 *    NSExtensionPrincipalClass values matching our Swift classes. The default
 *    Info.plist (point identifier only) is correct for the @main report ext.
 * 2. Adds the FC entitlement + App Group to the main target.
 *
 * MUST be listed BEFORE "@bacons/apple-targets" in app.json's plugins array.
 * Idempotent across repeated `expo prebuild`.
 */

const { withEntitlementsPlist } = require('expo/config-plugins');

const FAMILY_CONTROLS_ENABLED = false; // ← flip to true when Apple grants the distribution entitlement

const APP_GROUP = 'group.com.peakfettle.lifeos';
const FC_ENTITLEMENT = 'com.apple.developer.family-controls';
const FC_TARGET_TYPES = [
  'device-activity-monitor',
  'device-activity-report',
  'shield-config',
  'shield-action',
];
const FC_EXTENSION_BUNDLE_IDS = [
  'com.peakfettle.lifeos.monitor',
  'com.peakfettle.lifeos.shield',
  'com.peakfettle.lifeos.shieldaction',
  'com.peakfettle.lifeos.report',
];

// --- apple-targets patches (unconditional: harmless when FC is off, required
// --- when it is on; keeping them live means re-enabling is only the flag) ----

const target = require('@bacons/apple-targets/build/target.js');

const REPORT_TYPE = 'device-activity-report';
const REPORT_DEF = {
  extensionPointIdentifier: 'com.apple.deviceactivityui.report-extension',
  frameworks: ['DeviceActivity', 'SwiftUI'],
  appGroupsByDefault: true,
  displayName: 'Device Activity Report',
  description: 'On-device screen-time report UI',
};

if (!target.TARGET_REGISTRY[REPORT_TYPE]) {
  target.TARGET_REGISTRY[REPORT_TYPE] = REPORT_DEF;
  target.KNOWN_EXTENSION_POINT_IDENTIFIERS[REPORT_DEF.extensionPointIdentifier] = REPORT_TYPE;
  target.SHOULD_USE_APP_GROUPS_BY_DEFAULT[REPORT_TYPE] = true;
}

const configurationList = require('@bacons/apple-targets/build/configuration-list.js');

if (!configurationList.createConfigurationListForType.__lifeosFcPatched) {
  const original = configurationList.createConfigurationListForType;
  const patched = function createConfigurationListForType(project, props) {
    if (props && props.type === REPORT_TYPE) {
      // Same createDefaultConfigurationList path as the monitor extension;
      // props.type is only read by the (exhaustive) switch we are bypassing.
      return original(project, { ...props, type: 'device-activity-monitor' });
    }
    return original(project, props);
  };
  patched.__lifeosFcPatched = true;
  configurationList.createConfigurationListForType = patched;
}

// --- FC-off: skip the four extension targets at enumeration time -------------
// config-plugin.js globs targets/*/expo-target.config.js and hands each to
// with-widget's DEFAULT export via the module namespace — so wrapping the
// export cleanly skips a target without touching any file in targets/.

if (!FAMILY_CONTROLS_ENABLED) {
  const withWidgetModule = require('@bacons/apple-targets/build/with-widget.js');
  if (!withWidgetModule.default.__lifeosFcGate) {
    const originalWithWidget = withWidgetModule.default;
    const gated = function withWidgetGated(config, props) {
      if (props && FC_TARGET_TYPES.includes(props.type)) {
        return config; // FC target skipped — not added to the Xcode project.
      }
      return originalWithWidget(config, props);
    };
    gated.__lifeosFcGate = true;
    withWidgetModule.default = gated;
  }
}

// --- the plugin --------------------------------------------------------------

module.exports = function withFamilyControls(config) {
  if (!FAMILY_CONTROLS_ENABLED) {
    // Strip the FC entitlement app.json declares statically (main target).
    if (config.ios && config.ios.entitlements) {
      delete config.ios.entitlements[FC_ENTITLEMENT];
    }
    // Remove the FC extensions from EAS managed-credentials config so no
    // FC-capable provisioning profile is requested (widget entry stays).
    const iosEas =
      config.extra &&
      config.extra.eas &&
      config.extra.eas.build &&
      config.extra.eas.build.experimental &&
      config.extra.eas.build.experimental.ios;
    if (iosEas && Array.isArray(iosEas.appExtensions)) {
      iosEas.appExtensions = iosEas.appExtensions.filter(
        (e) => !FC_EXTENSION_BUNDLE_IDS.includes(e.bundleIdentifier)
      );
    }
  }

  return withEntitlementsPlist(config, (mod) => {
    if (FAMILY_CONTROLS_ENABLED) {
      mod.modResults[FC_ENTITLEMENT] = true;
    } else {
      delete mod.modResults[FC_ENTITLEMENT]; // defensive: never sign main with FC while off
    }
    const groups = mod.modResults['com.apple.security.application-groups'] || [];
    if (!groups.includes(APP_GROUP)) {
      groups.push(APP_GROUP); // widget bridge needs the App Group regardless
    }
    mod.modResults['com.apple.security.application-groups'] = groups;
    return mod;
  });
};
