/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'shield-configuration',
  name: 'LifeOSShieldConfig',
  // ".shield" -> com.peakfettle.lifeos.shield
  bundleIdentifier: '.shield',
  deploymentTarget: '16.0',
  entitlements: {
    'com.apple.developer.family-controls': true,
    'com.apple.security.application-groups': ['group.com.peakfettle.lifeos'],
  },
};
