require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', '..', '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'LiveActivity'
  s.version        = package['version'] || '1.0.0'
  s.summary        = 'Rest-timer Live Activity (ActivityKit) host bridge for Peak Fettle (TICKET-137)'
  s.description    = 'Starts/updates/ends the rest-timer Dynamic Island + lock-screen countdown from RN, and relays the +15s/Skip App Intent actions back to JS via a Darwin notification + App Group handoff.'
  s.author         = 'Peak Fettle'
  s.homepage       = 'https://peakfettle.com'
  s.platforms      = { :ios => '16.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '*.{h,m,swift}'
end
