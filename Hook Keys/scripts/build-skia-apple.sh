#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Este script precisa do Xcode e deve rodar no macOS." >&2
  exit 1
fi

if [[ $# -gt 1 ]]; then
  echo "Uso: bash scripts/build-skia-apple.sh [commit-ou-tag-do-skia]" >&2
  exit 1
fi

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKIA_REVISION="${1:-$(tr -d '[:space:]' < "$PROJECT_ROOT/scripts/skia-apple.revision")}"
if [[ ! "$SKIA_REVISION" =~ ^[0-9a-f]{40}$ ]]; then
  echo "A revisão do Skia precisa ser um commit SHA-1 completo." >&2
  exit 1
fi
WORK_ROOT="${RUNNER_TEMP:-$PROJECT_ROOT/.apple-build}/bronze-skia"
DEPOT_TOOLS="$WORK_ROOT/depot_tools"
SKIA_ROOT="$WORK_ROOT/skia"
VENDOR_ROOT="$PROJECT_ROOT/ios/App/Vendor"
XCFRAMEWORK_PATH="$VENDOR_ROOT/Skia.xcframework"

mkdir -p "$WORK_ROOT" "$VENDOR_ROOT"
if [[ ! -d "$DEPOT_TOOLS/.git" ]]; then
  git clone --depth 1 https://chromium.googlesource.com/chromium/tools/depot_tools.git "$DEPOT_TOOLS"
fi
export PATH="$DEPOT_TOOLS:$PATH"

if [[ ! -d "$SKIA_ROOT/.git" ]]; then
  git clone https://skia.googlesource.com/skia.git "$SKIA_ROOT"
fi
git -C "$SKIA_ROOT" fetch --tags origin
git -C "$SKIA_ROOT" checkout --detach "$SKIA_REVISION"
python3 "$SKIA_ROOT/tools/git-sync-deps"

build_slice() {
  local name="$1"
  local target_os="$2"
  local target_cpu="$3"
  local extra_args="$4"
  local output="$SKIA_ROOT/out/$name"
  "$SKIA_ROOT/bin/gn" gen "$output" --args="
    is_official_build=true
    is_debug=false
    target_os=\"$target_os\"
    target_cpu=\"$target_cpu\"
    skia_enable_gpu=false
    skia_enable_pdf=false
    skia_enable_skottie=false
    skia_enable_svg=false
    skia_use_expat=false
    skia_use_freetype=false
    skia_use_fontconfig=false
    skia_use_harfbuzz=false
    skia_use_icu=false
    skia_use_libjpeg_turbo_decode=false
    skia_use_libjpeg_turbo_encode=false
    skia_use_libpng=false
    skia_use_libwebp_decode=false
    skia_use_libwebp_encode=false
    skia_use_system_zlib=false
    $extra_args
  "
  ninja -C "$output" skia
}

build_slice ios-arm64 ios arm64 'ios_min_target="15.0"'
build_slice ios-simulator-arm64 ios arm64 'ios_min_target="15.0" ios_use_simulator=true'
build_slice ios-simulator-x64 ios x64 'ios_min_target="15.0" ios_use_simulator=true'
build_slice macos-arm64 mac arm64 'mac_deployment_target="12.0"'
build_slice macos-x64 mac x64 'mac_deployment_target="12.0"'

STAGE_ROOT="$WORK_ROOT/stage"
rm -rf "$STAGE_ROOT" "$XCFRAMEWORK_PATH"
mkdir -p "$STAGE_ROOT/Headers"
cp -R "$SKIA_ROOT/include" "$STAGE_ROOT/Headers/include"
lipo -create \
  "$SKIA_ROOT/out/ios-simulator-arm64/libskia.a" \
  "$SKIA_ROOT/out/ios-simulator-x64/libskia.a" \
  -output "$STAGE_ROOT/libskia-ios-simulator.a"
lipo -create \
  "$SKIA_ROOT/out/macos-arm64/libskia.a" \
  "$SKIA_ROOT/out/macos-x64/libskia.a" \
  -output "$STAGE_ROOT/libskia-macos.a"

xcodebuild -create-xcframework \
  -library "$SKIA_ROOT/out/ios-arm64/libskia.a" -headers "$STAGE_ROOT/Headers" \
  -library "$STAGE_ROOT/libskia-ios-simulator.a" -headers "$STAGE_ROOT/Headers" \
  -library "$STAGE_ROOT/libskia-macos.a" -headers "$STAGE_ROOT/Headers" \
  -output "$XCFRAMEWORK_PATH"

cat > "$PROJECT_ROOT/ios/Skia.generated.xcconfig" <<'EOF'
SKIA_HEADERS[sdk=iphoneos*] = $(SRCROOT)/Vendor/Skia.xcframework/ios-arm64/Headers
SKIA_HEADERS[sdk=iphonesimulator*] = $(SRCROOT)/Vendor/Skia.xcframework/ios-arm64_x86_64-simulator/Headers
SKIA_HEADERS[sdk=macosx*] = $(SRCROOT)/Vendor/Skia.xcframework/macos-arm64_x86_64/Headers
SKIA_LIBRARY[sdk=iphoneos*] = $(SRCROOT)/Vendor/Skia.xcframework/ios-arm64/libskia.a
SKIA_LIBRARY[sdk=iphonesimulator*] = $(SRCROOT)/Vendor/Skia.xcframework/ios-arm64_x86_64-simulator/libskia-ios-simulator.a
SKIA_LIBRARY[sdk=macosx*] = $(SRCROOT)/Vendor/Skia.xcframework/macos-arm64_x86_64/libskia-macos.a
HEADER_SEARCH_PATHS = $(inherited) "$(SKIA_HEADERS)"
OTHER_LDFLAGS = $(inherited) "$(SKIA_LIBRARY)"
GCC_PREPROCESSOR_DEFINITIONS = $(inherited) BRONZE_KEYS_REQUIRE_SKIA=1
EOF

echo "Skia Apple pronto em: $XCFRAMEWORK_PATH"
echo "Revisão: $(git -C "$SKIA_ROOT" rev-parse HEAD)"
