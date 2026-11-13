#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
test_dir="$(mktemp -d "${TMPDIR:-/tmp}/catlive-sidebar-wheel.XXXXXX")"
trap 'rm -rf "$test_dir"' EXIT
python3 - "$test_dir/main.swift" <<'PY'
from pathlib import Path
import sys
source = Path('Apple/Shared/GridScrollView.swift').read_text()
start = source.index('struct SidebarScrollMetrics:')
subject = source[start:source.index('\n#endif', start)]
Path(sys.argv[1]).write_text('import SwiftUI\nimport AppKit\n' + subject + '\n' + Path('Tests/Apple/SidebarWheelRoutingTests.swift').read_text())
PY
swiftc -swift-version 5 -target "${CATLIVE_TEST_ARCH:-$(uname -m)}-apple-macos12.0" Apple/Shared/NativeTimelineInputGate.swift "$test_dir/main.swift" -o "$test_dir/test"
"$test_dir/test"
