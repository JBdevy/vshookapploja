#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${CATLIVE_VIDEO_SIMULATOR:?Choose a booted iPad simulator UUID}"
test_dir="$(mktemp -d "${TMPDIR:-/tmp}/catlive-video-window.XXXXXX")"
trap 'rm -rf "$test_dir"' EXIT
mkdir -p "$test_dir/Fixture.app"
python3 - "$test_dir" <<'PY'
from pathlib import Path
import plistlib, sys
out=Path(sys.argv[1])
source=Path('Apple/Shared/JarasLiveApp.swift').read_text()
start=source.index('@MainActor final class JarasMobileApplicationDelegate:')
end=source.index('\n#endif',start)
# Keep the actual single-workspace scene guard, independent of auth/audio files.
(out/'AppDelegate.swift').write_text('import SwiftUI\nimport UIKit\n'+source[start:end].replace('private struct IpadMainWindowRoot','struct IpadMainWindowRoot',1))
(out/'Fixture.app/Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier':'com.hookdeveloper.tests.video-window','CFBundleName':'Video Fixture','CFBundleExecutable':'Fixture','CFBundlePackageType':'APPL','CFBundleVersion':'1','CFBundleShortVersionString':'1.0','MinimumOSVersion':'16.0','UIDeviceFamily':[2],'UILaunchScreen':{},'UIApplicationSceneManifest':{'UIApplicationSupportsMultipleScenes':True},'UISupportedInterfaceOrientations':['UIInterfaceOrientationPortrait','UIInterfaceOrientationLandscapeLeft','UIInterfaceOrientationLandscapeRight','UIInterfaceOrientationPortraitUpsideDown']}))
PY
xcrun --sdk iphonesimulator swiftc -sdk "$(xcrun --sdk iphonesimulator --show-sdk-path)" -target "$(uname -m)-apple-ios16.0-simulator" -parse-as-library -swift-version 5 \
    Application/Project/{ProjectModels,ItemFade,ItemFadeCurve,MIDIItem,TrackAutomation,MultiLoop,AudioFileRead,ProjectDocumentCodec,ProjectDocumentAppearance,TimelineTempo,OutputPatch,TrackRouting,NativeFXSettings,StemProjectImporter,MediaFileNames,HookImportRules}.swift \
    Application/Controls/NativeFXParameter.swift Apple/Shared/VideoMediaSettings.swift Apple/Shared/VideoPlayback.swift \
    "$test_dir/AppDelegate.swift" Tests/Apple/IpadVideoWindowTests.swift -o "$test_dir/Fixture.app/Fixture"
xcrun simctl install "$CATLIVE_VIDEO_SIMULATOR" "$test_dir/Fixture.app"
xcrun simctl launch --console "$CATLIVE_VIDEO_SIMULATOR" com.hookdeveloper.tests.video-window > "$test_dir/run.log" 2>&1
cat "$test_dir/run.log"
rg -q '^IPAD_VIDEO_EMBEDDED_DEFAULT_REAL_SCENE_DETACH_DOCK_CLOSE_OK' "$test_dir/run.log"
