#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
test_dir="$(mktemp -d "${TMPDIR:-/tmp}/catlive-drawer-guide.XXXXXX")"
trap 'rm -rf "$test_dir"' EXIT
python3 - "$test_dir" <<'PY'
from pathlib import Path
import sys
out=Path(sys.argv[1])
s=Path('Apple/Shared/DAWRemoteView.swift').read_text()
a=s.index('private struct RemoteSetlistDrawerGuide: ViewModifier {')
b=s.index('\nprivate struct RemoteSetlistRowLabel:',a)
guide=s[a:b]
assert s.count('.modifier(RemoteSetlistDrawerGuide(child: row.child, continues: row.drawerContinues, spacing:') == 2
out.joinpath('guide.swift').write_text('import SwiftUI\nprivate enum JarasTheme { static let green = Color.green }\n'+guide)
out.joinpath('main.swift').write_text(Path('Application/Project/TeleprompterSettings.swift').read_text()+'\n'+Path('Apple/Shared/DAWRemoteProtocol.swift').read_text()+'\nimport SwiftUI\n'+guide+'\n'+Path('Tests/Apple/SetlistDrawerGuideTests.swift').read_text())
PY
swiftc -typecheck -swift-version 5 -target arm64-apple-ios16.0 -sdk "$(xcrun --sdk iphoneos --show-sdk-path)" "$test_dir/guide.swift"
swiftc -O -swift-version 5 "$test_dir/main.swift" -o "$test_dir/test"
"$test_dir/test" "${1:-/private/tmp/catlive-drawer-guide.png}"
