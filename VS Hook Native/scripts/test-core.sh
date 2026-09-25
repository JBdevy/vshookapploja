#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "$0")/.."
test_dir=$(mktemp -d -t vshook-core)
trap 'rm -rf -- "$test_dir"' EXIT
swiftc Sources/Protocol.swift Sources/ApplePeer.swift Sources/Discovery.swift Sources/Session.swift Sources/DirectorState.swift Sources/MixerScale.swift Sources/TCPState.swift Sources/TelepromptPreferences.swift Sources/TelepromptNotice.swift Tests/CoreTests.swift -o "$test_dir/core-tests"
"$test_dir/core-tests"
