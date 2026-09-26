#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

# Native iPad interface and audio engine, built for this Mac with Catalyst.
# No Git push, release tag, simulator or WebView.
bronze_build_dir="${BRONZE_MAC_BUILD_DIR:-$HOME/Library/Developer/Xcode/DerivedData/BronzeKeysNativeMac}"
bronze_team="${BRONZE_DEVELOPMENT_TEAM:-573QZX9H7Y}"
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Release -destination 'platform=macOS,variant=Mac Catalyst' \
  -derivedDataPath "$bronze_build_dir" \
  DEVELOPMENT_TEAM="$bronze_team" CODE_SIGN_STYLE=Automatic \
  CODE_SIGN_IDENTITY='Apple Development' \
  SKIA_HEADERS= SKIA_LIBRARY= \
  GCC_PREPROCESSOR_DEFINITIONS= \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration build

bronze_app="$bronze_build_dir/Build/Products/Release-maccatalyst/Bronze Keys.app"
codesign --verify --deep --strict "$bronze_app"
mkdir -p "$HOME/Applications"
ditto "$bronze_app" "$HOME/Applications/Bronze Keys.app"
open "$HOME/Applications/Bronze Keys.app"
