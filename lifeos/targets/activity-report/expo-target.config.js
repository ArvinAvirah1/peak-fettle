/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'device-activity-report',
  name: 'LifeOSActivityReport',
  // ".report" -> com.peakfettle.lifeos.report
  bundleIdentifier: '.report',
  deploymentTarget: '16.0',
  entitlements: {
    'com.apple.developer.family-controls': true,
    'com.apple.security.application-groups': ['group.com.peakfettle.lifeos'],
  },
};
