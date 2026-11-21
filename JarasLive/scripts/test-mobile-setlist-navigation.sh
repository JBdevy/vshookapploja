#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
test_dir="$(mktemp -d "${TMPDIR:-/tmp}/catlive-setlist-navigation.XXXXXX")"
trap 'rm -rf "$test_dir"' EXIT
python3 - "$test_dir/Probe.swift" <<'PY'
from pathlib import Path
import sys
source = Path('Apple/Shared/DAWRemoteView.swift').read_text()
start = source.index('    private func resetSetlistBrowsing(')
end = source.index('    private func ', source.index('    private func performRemoteMIDI(', start) + 1)
handlers = source[start:end].replace('private func ', 'func ')
enum = source[source.index('private enum RemoteMIDIAction:'):source.index('private struct RemoteMIDIBinding:')]
fixture = Path('Tests/Apple/MobileSetlistNavigationTests.swift').read_text()
Path(sys.argv[1]).write_text(enum + fixture.replace('    // PRODUCTION_HANDLERS', handlers))
PY
swiftc -swift-version 5 -parse-as-library Application/Project/TeleprompterSettings.swift \
    Application/Controls/ControlInput.swift Application/Controls/HardwareKeyboardInput.swift \
    Apple/Shared/DAWRemoteProtocol.swift "$test_dir/Probe.swift" -o "$test_dir/test"
"$test_dir/test"
