require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', '..', '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'LifeOSLiveActivity'
  s.version        = package['version'] || '0.1.0'
  s.summary        = 'Focus-session Live Activity (ActivityKit) for Peak Fettle LifeOS (TICKET-118)'
  s.description    = 'Starts/updates/ends the focus Dynamic Island + lock-screen countdown from RN.'
  s.author         = 'Peak Fettle'
  s.homepage       = 'https://peakfettle.com'
  s.platforms      = { :ios => '16.2' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '*.{swift}'
end
