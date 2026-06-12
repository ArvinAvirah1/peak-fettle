/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'shield-action',
  name: 'LifeOSShieldAction',
  deploymentTarget: '16.0',
  entitlements: {
    'com.apple.developer.family-controls': true,
    'com.apple.security.application-groups': ['group.com.peakfettle.lifeos'],
  },
};
