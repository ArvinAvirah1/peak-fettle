/**
 * Expo config plugin — FamilyControls support (TICKET-102 #3, extended 2026-07-02).
 *
 * Does TWO things:
 *
 * 1. REGISTERS the four FamilyControls extension target types with
 *    @bacons/apple-targets. No released version of apple-targets (≤4.0.7) knows
 *    'device-activity-monitor' / 'device-activity-report' / 'shield-configuration'
 *    / 'shield-action', so without this its config plugin throws
 *    "Cannot read properties of undefined (reading 'frameworks')" at
 *    prebuild/export time. We mutate its TARGET_REGISTRY (+ the two maps derived
 *    from it at module load) and wrap getTargetInfoPlistForType to inject each
 *    extension's NSExtensionPrincipalClass (the report extension uses @main and
 *    needs none). This module MUST be listed BEFORE "@bacons/apple-targets" in
 *    app.json's plugins array so the registry is patched before it runs.
 *
 * 2. Ensures the MAIN app target carries:
 *    - com.apple.developer.family-controls  (Screen Time authorization)
 *    - the shared App Group (config handoff to the extensions)
 *
 * Idempotent: safe across repeated `expo prebuild`.
 */

const { withEntitlementsPlist } = require('expo/config-plugins');

const APP_GROUP = 'group.com.peakfettle.lifeos';

// --- 1. apple-targets registry extension -----------------------------------

const target = require('@bacons/apple-targets/build/target.js');

// Frameworks are linked, not embedded; all four extensions are iOS 16+ (the
// deploymentTarget in each expo-target.config.js). Extension point identifiers
// are Apple's documented values for the Screen Time API family.
const FC_TARGET_TYPES = {
  'device-activity-monitor': {
    extensionPointIdentifier: 'com.apple.deviceactivity.monitor-extension',
    frameworks: ['DeviceActivity', 'FamilyControls', 'ManagedSettings'],
    appGroupsByDefault: true,
    displayName: 'Device Activity Monitor',
    description: 'Applies/clears app shields on schedule boundaries',
  },
  'device-activity-report': {
    extensionPointIdentifier: 'com.apple.deviceactivityui.report-extension',
    frameworks: ['DeviceActivity', 'SwiftUI'],
    appGroupsByDefault: true,
    displayName: 'Device Activity Report',
    description: 'On-device screen-time report UI',
  },
  'shield-configuration': {
    extensionPointIdentifier: 'com.apple.ManagedSettingsUI.shield-configuration-service',
    frameworks: ['ManagedSettings', 'ManagedSettingsUI', 'FamilyControls', 'UIKit'],
    appGroupsByDefault: true,
    displayName: 'Shield Configuration',
    description: 'Branded block screen',
  },
  'shield-action': {
    extensionPointIdentifier: 'com.apple.ManagedSettings.shield-action-service',
    frameworks: ['ManagedSettings', 'FamilyControls'],
    appGroupsByDefault: true,
    displayName: 'Shield Action',
    description: 'Block-screen button handling',
  },
};

// NSExtensionPrincipalClass per type — must match the Swift class names in
// lifeos/targets/*/ (the report extension is @main-annotated; no entry).
const FC_PRINCIPAL_CLASS = {
  'device-activity-monitor': '$(PRODUCT_MODULE_NAME).DeviceActivityMonitorExtension',
  'shield-configuration': '$(PRODUCT_MODULE_NAME).ShieldConfigurationExtension',
  'shield-action': '$(PRODUCT_MODULE_NAME).ShieldActionExtension',
};

for (const [type, def] of Object.entries(FC_TARGET_TYPES)) {
  if (!target.TARGET_REGISTRY[type]) {
    target.TARGET_REGISTRY[type] = def;
    // These two maps are derived from TARGET_REGISTRY once at module load —
    // extend them too or target detection / app-group sync silently breaks.
    target.KNOWN_EXTENSION_POINT_IDENTIFIERS[def.extensionPointIdentifier] = type;
    target.SHOULD_USE_APP_GROUPS_BY_DEFAULT[type] = def.appGroupsByDefault;
  }
}

if (!target.getTargetInfoPlistForType.__lifeosFcPatched) {
  const original = target.getTargetInfoPlistForType;
  const patched = function getTargetInfoPlistForType(type) {
    const plist = original(type);
    if (FC_PRINCIPAL_CLASS[type] && plist && plist.NSExtension) {
      plist.NSExtension.NSExtensionPrincipalClass = FC_PRINCIPAL_CLASS[type];
    }
    return plist;
  };
  patched.__lifeosFcPatched = true;
  target.getTargetInfoPlistForType = patched;
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
