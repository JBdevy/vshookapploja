import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Execute the actual build orchestration without Xcode or network downloads.
// In particular, a broken depot_tools Ninja on PATH must never be invoked.
const root = path.resolve(import.meta.dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bronze-skia-script-'));
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const posix = (value) => value.replaceAll('\\', '/').replace(/^([A-Za-z]):\//, (_, drive) => `/${drive.toLowerCase()}/`);
const write = (file, contents) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
  fs.chmodSync(file, 0o755);
};
try {
  const patchProbe = path.join(temp, 'patch-probe');
  write(path.join(patchProbe, 'gn/skia/BUILD.gn'), `    } else if (current_cpu == "arm64") {
      _arch_flags = [
        "-arch",
        "arm64",
        "-arch",
        "arm64e",
      ]
    } else if (current_cpu == "x86") {
`);
  const patchFile = path.join(root, 'scripts/skia-apple-arm64.patch');
  const patchResult = spawnSync('git', ['apply', patchFile], { cwd: patchProbe, encoding: 'utf8' });
  assert.equal(patchResult.status, 0, patchResult.stderr);
  assert.doesNotMatch(fs.readFileSync(path.join(patchProbe, 'gn/skia/BUILD.gn'), 'utf8'), /arm64e/);
  assert.equal(spawnSync('git', ['apply', '--reverse', '--check', patchFile], { cwd: patchProbe }).status, 0);
  const project = path.join(temp, 'project with spaces');
  const tools = path.join(temp, 'tools');
  const skia = path.join(temp, 'runner', 'bronze-skia', 'skia');
  const actualNinja = path.join(temp, 'homebrew', 'bin', 'ninja');
  const log = path.join(temp, 'calls.log');
  write(path.join(project, 'scripts', 'build-skia-apple.sh'), fs.readFileSync(path.join(root, 'scripts/build-skia-apple.sh')));
  write(path.join(project, 'scripts', 'skia-apple.revision'), fs.readFileSync(path.join(root, 'scripts/skia-apple.revision')));
  write(path.join(project, 'scripts', 'skia-apple-arm64.patch'), fs.readFileSync(path.join(root, 'scripts/skia-apple-arm64.patch')));
  fs.mkdirSync(path.join(skia, '.git'), { recursive: true });
  write(path.join(skia, '.gn'), '');
  write(path.join(skia, 'include', 'core', 'SkCanvas.h'), '// test header');
  write(path.join(tools, 'uname'), '#!/bin/bash\necho Darwin\n');
  write(path.join(tools, 'git'), '#!/bin/bash\nexit 0\n');
  write(path.join(tools, 'python3'), '#!/bin/bash\nexit 0\n');
  write(path.join(tools, 'brew'), `#!/bin/bash
case "$1" in
  list) exit 0 ;;
  --prefix) echo "$SKIA_TEST_PREFIX" ;;
  *) exit 1 ;;
esac
`);
  write(path.join(tools, 'ninja'), '#!/bin/bash\necho "WRONG_NINJA" >&2\nexit 99\n');
  write(path.join(skia, 'bin', 'gn'), `#!/bin/bash
set -eu
test -f .gn
test "$1" = gen
test "$3" = --fail-on-unused-args
case "$4" in *skia_enable_gpu=*|*skia_use_libpng=*|*mac_deployment_target=*) exit 11;; esac
case "$4" in *skia_enable_ganesh=false*skia_enable_graphite=false*) ;; *) exit 12;; esac
case "$4" in *skia_use_libpng_decode=false*skia_use_libpng_encode=false*) ;; *) exit 13;; esac
case "$4" in *skia_use_partition_alloc=false*skia_use_zlib=false*) ;; *) exit 14;; esac
case "$2" in
  out/macos-*) case "$4" in *-mmacosx-version-min=12.0*) ;; *) exit 15;; esac ;;
esac
mkdir -p "$2"
echo "gn:$2" >> "$SKIA_TEST_LOG"
`);
  write(actualNinja, `#!/bin/bash
set -eu
if [[ "$1" == --version ]]; then echo 'test-ninja'; exit 0; fi
test "$1" = -C
test "$3" = skia
test -d "$2"
echo archive > "$2/libskia.a"
slice="$(basename "$2")"
echo "ninja:$slice" >> "$SKIA_TEST_LOG"
`);
  write(path.join(tools, 'lipo'), `#!/bin/bash
set -eu
test -s "$2"
test -s "$3"
test "$4" = -output
echo archive > "$5"
`);
  write(path.join(tools, 'xcodebuild'), `#!/bin/bash
set -eu
while [[ $# -gt 0 ]]; do
  case "$1" in
    -library) shift; test -s "$1" ;;
    -output) shift; mkdir -p "$1" ;;
  esac
  shift
done
`);
  const result = spawnSync(bash, ['-c', 'export PATH="$SKIA_TEST_TOOLS:$PATH"; exec bash "$1"',
    'skia-script-test', posix(path.join(project, 'scripts/build-skia-apple.sh'))], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SKIA_TEST_TOOLS: posix(tools),
      RUNNER_TEMP: posix(path.join(temp, 'runner')),
      SKIA_TEST_PREFIX: posix(path.dirname(path.dirname(actualNinja))),
      SKIA_TEST_LOG: posix(log),
    },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr + (result.error ?? ''));
  const calls = fs.readFileSync(log, 'utf8').trim().split(/\r?\n/);
  assert.deepEqual(calls, ['ios-arm64', 'ios-simulator-arm64', 'ios-simulator-x64', 'macos-arm64', 'macos-x64']
    .flatMap((slice) => [`gn:out/${slice}`, `ninja:${slice}`]));
  assert.ok(fs.existsSync(path.join(project, 'ios/App/Vendor/Skia.xcframework')));
  assert.match(fs.readFileSync(path.join(project, 'ios/Skia.generated.xcconfig'), 'utf8'), /BRONZE_KEYS_REQUIRE_SKIA=1/);
  console.log('SKIA_BUILD_SCRIPT_OK: five slices, source root, standalone Ninja, paths with spaces and packaging');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
