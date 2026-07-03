/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'shield-config',  // native apple-targets type (the 'shield-configuration' spelling is unknown to it)
  name: 'LifeOSShieldConfig',
  // ".shield" -> com.peakfettle.lifeos.shield
  bundleIdentifier: '.shield',
  deploymentTarget: '16.0',
  entitlements: {
    'com.apple.developer.family-controls': true,
    'com.apple.security.application-groups': ['group.com.peakfettle.lifeos'],
  },
};
