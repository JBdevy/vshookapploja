import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { runNativeSessionTests } from './test-native-session.mjs';

function simulate(platform, { compilerMissing = false, buildFails = false, runFails = false, backupMarker = true } = {}) {
  const calls = [], logs = [];
  const execute = () => runNativeSessionTests({ platform, log: value => logs.push(value), runCommand: (command, args) => {
    calls.push({ command, args });
    if (args[0] === '--version') return compilerMissing
      ? { error: { code: 'ENOENT' }, status: null, stderr: 'swiftc missing' }
      : { status: 0, stdout: 'Swift test compiler', stderr: '' };
    if (command === 'swiftc') return { status: buildFails ? 1 : 0, stdout: '', stderr: buildFails ? 'compile failure' : '' };
    return { status: runFails ? 1 : 0, stderr: runFails ? 'fixture failure' : '',
      stdout: 'NATIVE_SESSION_OK: fixture\n' + (backupMarker ? 'NATIVE_BACKUP_OK: fixture\n' : '') };
  } });
  return { execute, calls, logs };
}

test('Linux with swiftc runs session tests without compiling Apple CryptoKit', () => {
  const check = simulate('linux', { backupMarker: false });
  check.execute();
  assert.equal(check.calls.length, 3);
  const args = check.calls[1].args;
  assert(args.some(file => file.endsWith('BronzeNativeSession.swift')));
  assert(args.some(file => file.endsWith('BronzeUserWorkspace.swift')));
  assert(args.some(file => file.endsWith('BronzeNativeCatalog.swift')));
  assert(args.some(file => file.endsWith('main.swift')));
  assert(!args.some(file => file.endsWith('BronzeNativeBackup.swift')));
  assert(check.logs.some(line => line.startsWith('NATIVE_BACKUP_SKIP:')));
  assert(!fs.existsSync(path.dirname(args.at(-1))), 'temporary build directory cleaned');
});

test('macOS must compile the real backup and execute its tests', () => {
  const check = simulate('darwin');
  check.execute();
  assert(check.calls[1].args.some(file => file.endsWith('BronzeNativeBackup.swift')));
  assert(!check.logs.some(line => line.includes('SKIP')));
  assert.throws(simulate('darwin', { backupMarker: false }).execute, /must execute the CryptoKit/);
  assert.throws(simulate('darwin', { compilerMissing: true }).execute, /swiftc missing/);
});

test('non-Apple hosts without Swift explicitly skip execution, never report executed fixtures', () => {
  for (const platform of ['linux', 'win32']) {
    const check = simulate(platform, { compilerMissing: true });
    check.execute();
    assert.equal(check.calls.length, 1);
    assert(check.logs[0].includes('SKIP Swift execution'));
    assert(!check.logs[0].includes('NATIVE_BACKUP_OK'));
  }
});

test('compile and test failures still fail the release on either platform', () => {
  for (const platform of ['linux', 'darwin']) {
    for (const failure of [{ buildFails: true }, { runFails: true }]) {
      const check = simulate(platform, failure);
      assert.throws(check.execute, /compile failure|fixture failure/);
      assert(!fs.existsSync(path.dirname(check.calls[1].args.at(-1))));
    }
  }
});

test('the Swift fixture only gates backup tests, not the session/workspace checks', () => {
  const fixture = fs.readFileSync(new URL('./test-fixtures/native-session/main.swift', import.meta.url), 'utf8');
  const appleBlock = fixture.match(/^#if os\(macOS\)\s*\n([\s\S]*?)^#endif[^\S\r\n]*$/m);
  assert(appleBlock, 'the backup checks have a complete macOS-only block');
  const apple = appleBlock[1];
  const shared = fixture.replace(appleBlock[0], '');
  assert.match(shared, /NATIVE_SESSION_OK:/);
  assert.doesNotMatch(shared, /BronzeNativeBackup\./);
  assert.match(shared, /NATIVE_PLAYLIST_SIDEBAR_OK/);
  assert.match(shared, /mixer gains, mute, octave, transpose and mono round-trip/);
  assert.doesNotMatch(shared, /^#(?:if|elseif|else|endif)\b/m,
    'session/workspace checks before and after backup run on every Swift host');
  assert.match(apple, /BronzeNativeBackup\.export/);
  assert.match(apple, /BronzeNativeBackup\.stage/);
  assert.match(apple, /NATIVE_BACKUP_OK:/);
});
