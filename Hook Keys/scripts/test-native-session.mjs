import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'ios/App/App/BronzeNativeSession.swift');
const model = fs.readFileSync(path.join(root, 'ios/App/App/BronzeNativeAppModel.swift'), 'utf8');
const project = fs.readFileSync(path.join(root, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
assert.match(project, /BronzeNativeSession\.swift in Sources/);
assert.match(model, /defer \{ if !committed \{ engine\.cancelPresetTransition\(\) \} \}/);
assert.match(model, /!isApplyingSnapshot/);
assert.match(model, /\.now\(\) \+ 0\.4/);
export function runNativeSessionTests({ platform = process.platform, runCommand = spawnSync, log = console.log } = {}) {
  const apple = platform === 'darwin';
  const compiler = runCommand('swiftc', ['--version'], { encoding: 'utf8' });
  if (compiler.error?.code === 'ENOENT' && !apple) {
    log('NATIVE_SESSION_STRUCTURE_OK; SKIP Swift execution: swiftc unavailable (required on Apple CI)');
    return;
  }
  assert.equal(compiler.status, 0, compiler.stderr);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bronze-session-test-'));
  try {
    const binary = path.join(temp, platform === 'win32' ? 'session-test.exe' : 'session-test');
    // Ubuntu runners can have swiftc, but not the Apple CryptoKit SDK.
    // Keep Foundation/session coverage there; require the real backup on macOS.
    const sources = [source, path.join(root, 'ios/App/App/BronzeUserWorkspace.swift'),
      path.join(root, 'ios/App/App/BronzeNativeCatalog.swift')];
    if (apple) sources.push(path.join(root, 'ios/App/App/BronzeNativeBackup.swift'));
    sources.push(path.join(root, 'scripts/test-fixtures/native-session/main.swift'));
    const build = runCommand('swiftc', [...sources, '-o', binary], { encoding: 'utf8' });
    assert.equal(build.status, 0, build.stdout + build.stderr);
    const run = runCommand(binary, [], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /NATIVE_SESSION_OK:/, 'Session fixture must execute on every Swift host.');
    if (apple) assert.match(run.stdout, /NATIVE_BACKUP_OK:/, 'Apple CI must execute the CryptoKit backup tests.');
    log(run.stdout.trim());
    if (!apple) log('NATIVE_BACKUP_SKIP: Apple CryptoKit unavailable on this host; backup tests required on macOS CI.');
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runNativeSessionTests();
}
