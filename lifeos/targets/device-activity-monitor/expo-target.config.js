/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'device-activity-monitor',
  name: 'LifeOSDeviceActivityMonitor',
  // ".monitor" -> com.peakfettle.lifeos.monitor (TICKET-114: declared in app.json extra.eas appExtensions)
  bundleIdentifier: '.monitor',
  deploymentTarget: '16.0',
  entitlements: {
    'com.apple.developer.family-controls': true,
    'com.apple.security.application-groups': ['group.com.peakfettle.lifeos'],
  },
};
