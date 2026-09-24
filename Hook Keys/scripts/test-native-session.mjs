import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'ios/App/App/BronzeNativeSession.swift');
const model = fs.readFileSync(path.join(root, 'ios/App/App/BronzeNativeAppModel.swift'), 'utf8');
const project = fs.readFileSync(path.join(root, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
assert.match(project, /BronzeNativeSession\.swift in Sources/);
assert.match(model, /defer \{ if !committed \{ engine\.cancelPresetTransition\(\) \} \}/);
assert.match(model, /!isApplyingSnapshot/);
assert.match(model, /\.now\(\) \+ 0\.4/);
const compiler = spawnSync('swiftc', ['--version'], { encoding: 'utf8' });
if (compiler.error?.code === 'ENOENT' && process.platform !== 'darwin') {
  console.log('NATIVE_SESSION_STRUCTURE_OK; SKIP Swift execution: swiftc unavailable (required on Apple CI)');
} else {
  assert.equal(compiler.status, 0, compiler.stderr);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bronze-session-test-'));
  try {
    const binary = path.join(temp, process.platform === 'win32' ? 'session-test.exe' : 'session-test');
    const build = spawnSync('swiftc', [source, path.join(root, 'scripts/test-fixtures/native-session/main.swift'), '-o', binary], { encoding: 'utf8' });
    assert.equal(build.status, 0, build.stdout + build.stderr);
    const run = spawnSync(binary, [], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    console.log(run.stdout.trim());
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
