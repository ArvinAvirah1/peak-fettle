/**
 * Expo config plugin — FamilyControls entitlements (TICKET-102 #3).
 *
 * Ensures the MAIN app target carries:
 *   - com.apple.developer.family-controls  (Screen Time authorization)
 *   - the shared App Group (config handoff to the extensions)
 *
 * The four extension targets (shield config/action, device-activity monitor,
 * activity report) are declared via @bacons/apple-targets in lifeos/targets/;
 * each target's expo-target.config.js declares the same entitlements.
 *
 * Idempotent: safe across repeated `expo prebuild`.
 */

const { withEntitlementsPlist } = require('expo/config-plugins');

const APP_GROUP = 'group.com.peakfettle.lifeos';

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
