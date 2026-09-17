import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function loadService(saveBackup) {
  const source = readFileSync(new URL('../src/features/account/PlayerBackupService.ts', import.meta.url), 'utf8');
  const context = {
    exports: {}, TextEncoder, Blob, URL, DOMException,
    window: { setTimeout }, document: {},
    require(specifier) {
      assert.equal(specifier, '../../platform/native/HookKeysNative');
      return { hookKeysNative: { saveBackup } };
    },
  };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports.PlayerBackupService;
}

function backupFile(name, document) {
  const text = JSON.stringify(document);
  return { name, size: Buffer.byteLength(text), text: async () => text };
}

test('backup is created locally without email, network or account data', async () => {
  let written;
  const PlayerBackupService = loadService(async (fileName, content) => {
    written = { fileName, content };
    return true;
  });
  const service = new PlayerBackupService('cliente@example.com');
  const result = await service.backupNow({ version: 9, activeBank: 'A' });
  const document = JSON.parse(written.content);
  assert.equal(result.saved, true);
  assert.match(result.fileName, /^Hook Keys Backup .*\.json$/);
  assert.equal(document.format, 'hook-keys-backup');
  assert.equal(document.version, 2);
  assert.deepEqual(document.state, { version: 9, activeBank: 'A' });
  assert.equal('accountEmail' in document, false);
  assert.doesNotMatch(written.content, /cliente@example\.com/);
});

test('cancelled native picker is reported without uploading anything', async () => {
  const PlayerBackupService = loadService(async () => false);
  const result = await new PlayerBackupService('cliente@example.com').backupNow({ version: 1 });
  assert.equal(result.saved, false);
});

test('backup accepts the current preset library above the old 1 MB limit', async () => {
  let writtenBytes = 0;
  const PlayerBackupService = loadService(async (_fileName, content) => {
    writtenBytes = Buffer.byteLength(content);
    return true;
  });
  const state = { presets: 'x'.repeat(2 * 1024 * 1024) };
  const result = await new PlayerBackupService('cliente@example.com').backupNow(state);
  assert.equal(result.saved, true);
  assert.ok(writtenBytes > 1024 * 1024);
});

test('restore accepts local v2 and keeps compatibility with same-account v1', async () => {
  const PlayerBackupService = loadService(async () => true);
  const service = new PlayerBackupService('cliente@example.com');
  const state = { banks: { A: {} } };
  assert.equal(JSON.stringify(await service.restore(backupFile('local.json', {
    format: 'hook-keys-backup', version: 2, createdAt: new Date().toISOString(), state,
  }))), JSON.stringify(state));
  assert.equal(JSON.stringify(await service.restore(backupFile('antigo.json', {
    format: 'hook-keys-backup', version: 1, createdAt: new Date().toISOString(),
    accountEmail: 'cliente@example.com', state,
  }))), JSON.stringify(state));
  await assert.rejects(() => service.restore(backupFile('outra-conta.json', {
    format: 'hook-keys-backup', version: 1, createdAt: new Date().toISOString(),
    accountEmail: 'outra@example.com', state,
  })), /invalid_backup_document/);
});

test('backend email endpoint is absent from the app bundle source', () => {
  const api = readFileSync(new URL('../src/features/account/AccountApi.ts', import.meta.url), 'utf8');
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const playerState = readFileSync(new URL('../src/features/account/PlayerStateService.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(api + player, /player-backup\/email|emailPlayerBackup|Backup enviado para/);
  assert.doesNotMatch(api, /player-state|getPlayerState|savePlayerState/,
    'estado e backups não devem ser enviados ao backend');
  assert.doesNotMatch(playerState, /AccountApi|HttpClient|fetch\(|navigator\.onLine|getPlayerState|savePlayerState/,
    'salvamento automático deve permanecer somente no armazenamento local');
});
