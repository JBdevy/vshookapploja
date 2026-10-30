#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
simulator="${1:?Pass the UDID of a booted iPad simulator}"
color_test_dir="$(mktemp -d "${TMPDIR:-/tmp}/catlive-ipad-text-colors.XXXXXX")"
trap 'rm -rf "$color_test_dir"' EXIT
python3 scripts/ipad-text-colors-fixture.py "$color_test_dir"
xcrun --sdk iphonesimulator swiftc -parse-as-library -swift-version 5 \
  -target arm64-apple-ios16.0-simulator -sdk "$(xcrun --sdk iphonesimulator --show-sdk-path)" \
  "$color_test_dir/main.swift" -o "$color_test_dir/EditorFixture.app/EditorFixture"
xcrun simctl terminate "$simulator" com.catlive.tests.editorcolors >/dev/null 2>&1 || true
xcrun simctl install "$simulator" "$color_test_dir/EditorFixture.app"
container="$(xcrun simctl get_app_container "$simulator" com.catlive.tests.editorcolors data)"
rm -f "$container/Documents/result.txt"
xcrun simctl launch "$simulator" com.catlive.tests.editorcolors
for ((attempt=0; attempt<30; attempt++)); do
  if [[ -f "$container/Documents/result.txt" ]]; then
    cat "$container/Documents/result.txt"
    echo
    exit 0
  fi
  sleep 1
done
echo 'The iPad text color fixture failed to complete.' >&2
exit 1
