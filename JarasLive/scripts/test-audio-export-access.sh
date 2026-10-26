#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
test_dir="$(mktemp -d "${TMPDIR:-/tmp}/catlive-export-access.XXXXXX")"
trap 'rm -rf "$test_dir"' EXIT
python3 - "$test_dir/main.swift" <<'PY'
from pathlib import Path
import sys
source=Path('Apple/Shared/AudioExportView.swift').read_text()
a=source.index('final class AudioExportURLAccess:')
b=source.index('@MainActor private final class AudioExportSession:',a)
Path(sys.argv[1]).write_text('import Foundation\n'+source[a:b]+Path('Tests/Apple/AudioExportAccessTests.swift').read_text())
PY
swiftc -swift-version 5 "$test_dir/main.swift" -o "$test_dir/test"
"$test_dir/test"
