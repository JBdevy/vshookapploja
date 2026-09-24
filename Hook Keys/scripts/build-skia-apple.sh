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
SKIA_ROOT="$WORK_ROOT/skia"
VENDOR_ROOT="$PROJECT_ROOT/ios/App/Vendor"
XCFRAMEWORK_PATH="$VENDOR_ROOT/Skia.xcframework"

mkdir -p "$WORK_ROOT" "$VENDOR_ROOT"
# Use o executável real do Ninja, não o wrapper Python do depot_tools.
# O wrapper exige bootstrap próprio e pode mascarar o Ninja do runner no PATH.
if ! command -v brew >/dev/null 2>&1; then
  echo "Instale o Homebrew e o Ninja para compilar o Skia Apple." >&2
  exit 1
fi
if ! brew list --versions ninja >/dev/null 2>&1; then
  brew install ninja
fi
NINJA_BIN="$(brew --prefix ninja)/bin/ninja"
"$NINJA_BIN" --version

if [[ ! -d "$SKIA_ROOT/.git" ]]; then
  git clone https://skia.googlesource.com/skia.git "$SKIA_ROOT"
fi
git -C "$SKIA_ROOT" fetch --tags origin
git -C "$SKIA_ROOT" checkout --detach "$SKIA_REVISION"
# This revision emits both arm64 and arm64e for target_cpu=arm64. Build a
# single, predictable slice; arm64e is not an iOS simulator architecture.
ARM64_PATCH="$PROJECT_ROOT/scripts/skia-apple-arm64.patch"
if ! git -C "$SKIA_ROOT" apply --reverse --check "$ARM64_PATCH" 2>/dev/null; then
  git -C "$SKIA_ROOT" apply --check "$ARM64_PATCH"
  git -C "$SKIA_ROOT" apply "$ARM64_PATCH"
fi
python3 "$SKIA_ROOT/tools/git-sync-deps"

build_slice() {
  local name="$1"
  local target_os="$2"
  local target_cpu="$3"
  local extra_args="$4"
  local output="$SKIA_ROOT/out/$name"
  # O wrapper bin/gn procura o arquivo .gn a partir do diretório atual. No
  # Actions o script roda na raiz do Bronze Keys, portanto é obrigatório
  # executar o GN dentro do checkout do Skia.
  (
  cd "$SKIA_ROOT"
  bin/gn gen "out/$name" --fail-on-unused-args --args="
    is_official_build=true
    is_debug=false
    target_os=\"$target_os\"
    target_cpu=\"$target_cpu\"
    skia_enable_ganesh=false
    skia_enable_graphite=false
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
    skia_use_libpng_decode=false
    skia_use_libpng_encode=false
    skia_use_wuffs=false
    skia_use_partition_alloc=false
    skia_use_libwebp_decode=false
    skia_use_libwebp_encode=false
    skia_use_zlib=false
    $extra_args
  "
  )
  "$NINJA_BIN" -C "$output" skia
}

build_slice ios-arm64 ios arm64 'ios_min_target="15.0"'
build_slice ios-simulator-arm64 ios arm64 'ios_min_target="15.0" ios_use_simulator=true'
build_slice ios-simulator-x64 ios x64 'ios_min_target="15.0" ios_use_simulator=true'
MACOS_ARGS='extra_cflags=["-mmacosx-version-min=12.0"] extra_asmflags=["-mmacosx-version-min=12.0"] extra_ldflags=["-mmacosx-version-min=12.0"]'
build_slice macos-arm64 mac arm64 "$MACOS_ARGS"
build_slice macos-x64 mac x64 "$MACOS_ARGS"

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
OTHER_LDFLAGS = $(inherited) "$(SKIA_LIBRARY)" -framework CoreText -framework CoreGraphics -framework CoreFoundation
GCC_PREPROCESSOR_DEFINITIONS = $(inherited) BRONZE_KEYS_REQUIRE_SKIA=1
EOF

echo "Skia Apple pronto em: $XCFRAMEWORK_PATH"
echo "Revisão: $(git -C "$SKIA_ROOT" rev-parse HEAD)"
