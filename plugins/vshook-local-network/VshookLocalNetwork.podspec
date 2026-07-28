require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'VshookLocalNetwork'
  s.version = package['version']
  s.summary = package['description']
  s.license = package['license']
  s.homepage = 'https://vshook.com.br'
  s.author = 'Hook Developer'
  s.source = { :git => 'https://github.com/JBdevy/Extensionvshook.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.{swift,h,m,c,cc,mm,cpp}'
  s.ios.deployment_target = '13.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.1'
end
