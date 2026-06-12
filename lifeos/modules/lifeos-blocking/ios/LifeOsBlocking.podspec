Pod::Spec.new do |s|
  s.name           = 'LifeOsBlocking'
  s.version        = '0.1.0'
  s.summary        = 'FamilyControls / ManagedSettings / DeviceActivity bridge for Life OS'
  s.description    = 'Native blocking bridge: authorization, FamilyActivityPicker, shields, schedules.'
  s.author         = 'Peak Fettle'
  s.homepage       = 'https://peakfettle.com'
  s.platforms      = { :ios => '16.0' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.license        = { :type => 'UNLICENSED' }

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,swift}'
end
