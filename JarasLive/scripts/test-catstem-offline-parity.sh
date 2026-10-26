#!/bin/bash
set -euo pipefail
CATSTEM_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CATSTEM_MODEL="${CATSTEM_TEST_OFFLINE_MODEL:-$CATSTEM_ROOT/build/CatStemCoreML/Compiled/CatStemHTDemucs6Offline.mlmodelc}"
CATSTEM_PYTHON="${CATSTEM_TEST_PYTHON:-$CATSTEM_ROOT/build/StemSeparationRuntime/arm64/python/bin/python3.11}"
CATSTEM_CHECKPOINT="${CATSTEM_TEST_CHECKPOINT:-$CATSTEM_ROOT/build/StemSeparationRuntime/5c90dfd2-34c22ccb.th}"
CATSTEM_BUILD="$(mktemp -d "${TMPDIR:-/tmp}/catstem-offline-parity.XXXXXX")"
trap 'rm -rf "$CATSTEM_BUILD"' EXIT
python3 - "$CATSTEM_ROOT" "$CATSTEM_BUILD" <<'PYCODE'
from pathlib import Path
import sys
root, out = map(Path, sys.argv[1:])
source = (root / 'Apple/Bridge/JarasStemSeparator.mm').read_text()
start = source.index('namespace CatStemRealtime {')
end = source.index('#if TARGET_OS_OSX\nstd::atomic<bool> workerLease', start)
(out / 'CatStemCoreMLTestKernel.hpp').write_text(source[start:end] + '\n#include "CatStemCoreMLRuntime.inc"\n}\n')
PYCODE
"$CATSTEM_PYTHON" "$CATSTEM_ROOT/scripts/catstem/offline-parity-fixtures.py" --output "$CATSTEM_BUILD/fixtures" --checkpoint "$CATSTEM_CHECKPOINT"
xcrun clang++ -std=c++17 -O2 -fobjc-arc -mmacosx-version-min=13.0 \
  -I "$CATSTEM_ROOT/Apple/Bridge" -I "$CATSTEM_BUILD" \
  "$CATSTEM_ROOT/Tests/Apple/CatStemOfflineParityTests.mm" \
  -framework Foundation -framework CoreML -framework AVFoundation -framework Accelerate \
  -o "$CATSTEM_BUILD/test-parity"
"$CATSTEM_BUILD/test-parity" "$CATSTEM_MODEL" "$CATSTEM_BUILD/fixtures"
