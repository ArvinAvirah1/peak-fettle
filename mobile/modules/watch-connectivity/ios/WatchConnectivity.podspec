require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', '..', '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'WatchConnectivity'
  s.version        = package['version'] || '1.0.0'
  s.summary        = 'WatchConnectivity host bridge for the Peak Fettle Apple Watch app (TICKET-140)'
  s.description    = 'Activates WCSession on the phone, pushes the today-workout mirror payload via applicationContext, and relays inbound watch sendMessage requests (the on-activate {type:"refresh"} handshake) back to JS.'
  s.author         = 'Peak Fettle'
  s.homepage       = 'https://peakfettle.com'
  s.platforms      = { :ios => '16.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '*.{h,m,swift}'
end
