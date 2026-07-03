/**
 * Expo config plugin — FamilyControls support (TICKET-102 #3; rewritten 2026-07-03).
 *
 * Does TWO things:
 *
 * 1. TEACHES @bacons/apple-targets the one FamilyControls target type it does
 *    not ship (≤4.0.7): 'device-activity-report'. The other three
 *    ('device-activity-monitor', 'shield-config', 'shield-action') are native —
 *    with NSExtensionPrincipalClass values that match our Swift classes — so we
 *    do NOT touch them. (Our shield target uses the native 'shield-config'
 *    spelling; 'shield-configuration' is unknown to the package.)
 *
 *    Three patch points, all for 'device-activity-report':
 *      a. TARGET_REGISTRY + the two maps derived from it at module load
 *         (KNOWN_EXTENSION_POINT_IDENTIFIERS, SHOULD_USE_APP_GROUPS_BY_DEFAULT).
 *      b. Info.plist: nothing to patch — unknown types fall through to the
 *         default `NSExtension { NSExtensionPointIdentifier }`, which is exactly
 *         right for the report extension (its entry point is an @main-annotated
 *         DeviceActivityReportExtension struct; no principal class).
 *      c. configuration-list.js `createConfigurationListForType` has an
 *         exhaustive switch that THROWS "Unhandled case: device-activity-report"
 *         (seen on the first EAS prebuild, 2026-07-03). We wrap the export and
 *         alias the type to 'device-activity-monitor' for that call only — both
 *         types take the createDefaultConfigurationList path, and props.type is
 *         not read anywhere else in that function.
 *
 *    This module MUST be listed BEFORE "@bacons/apple-targets" in app.json's
 *    plugins array so the patches land before its plugin executes.
 *
 * 2. Ensures the MAIN app target carries:
 *    - com.apple.developer.family-controls  (Screen Time authorization)
 *    - the shared App Group (config handoff to the extensions)
 *
 * Idempotent: safe across repeated `expo prebuild`.
 */

const { withEntitlementsPlist } = require('expo/config-plugins');

const APP_GROUP = 'group.com.peakfettle.lifeos';

// --- 1a. registry: add device-activity-report -------------------------------

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

// --- 1c. configuration-list: alias report -> monitor for the settings switch --

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

// --- 2. main-target entitlements --------------------------------------------

module.exports = function withFamilyControls(config) {
  return withEntitlementsPlist(config, (mod) => {
    mod.modResults['com.apple.developer.family-controls'] = true;
    const groups = mod.modResults['com.apple.security.application-groups'] || [];
    if (!groups.includes(APP_GROUP)) {
      groups.push(APP_GROUP);
    }
    mod.modResults['com.apple.security.application-groups'] = groups;
    return mod;
  });
};
