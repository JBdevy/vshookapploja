import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { verifyNativeBundle, verifyNativeProject } from './verify-native-ios.mjs';

const root = path.resolve(import.meta.dirname, '..');
function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bronze-ios-bundle-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const app = path.join(temp, 'App.app');
  fs.mkdirSync(app);
  for (const [folder, source] of Object.entries({
    'hook-b3': 'native-engine/assets/hook-b3', pads: 'native-engine/assets/pads',
    loops: 'public/assets/loops', 'fx-1': 'public/assets/fx/fx-1',
  })) {
    fs.mkdirSync(path.join(app, folder));
    for (const file of fs.readdirSync(path.join(root, source))) {
      if (/\.(sf2|mp3|wav)$/.test(file)) fs.writeFileSync(path.join(app, folder, file), 'audio fixture');
    }
  }
  fs.writeFileSync(path.join(app, 'App'), Buffer.from('cffaedfe', 'hex'));
  return app;
}

test('projeto iOS contém somente host nativo e referências de áudio existentes', verifyNativeProject);
test('bundle nativo aceita áudio sem recursos da interface web', t => {
  const app = fixture(t);
  const inspected = [];
  verifyNativeBundle(app, file => { inspected.push(path.basename(file)); return '/System/Library/Frameworks/UIKit.framework/UIKit'; });
  assert.deepEqual(inspected, ['App']);
});
test('bundle recusa recursos web e bibliotecas vinculadas', t => {
  const app = fixture(t);
  for (const name of ['index.html', 'player.js', 'styles.css', 'dsp.wasm']) {
    const file = path.join(app, name);
    fs.writeFileSync(file, 'not allowed');
    assert.throws(() => verifyNativeBundle(app, () => ''), /Interface web/);
    fs.unlinkSync(file);
  }
  for (const dependency of ['WebKit.framework/WebKit', 'Capacitor.framework/Capacitor', 'Cordova.framework/Cordova']) {
    assert.throws(() => verifyNativeBundle(app, () => dependency), /Biblioteca web vinculada/);
  }
  fs.mkdirSync(path.join(app, 'Capacitor.framework'));
  assert.throws(() => verifyNativeBundle(app, () => ''), /Dependência web/);
});
test('bundle recusa pad e loop ausentes e efeito vazio', t => {
  const app = fixture(t);
  const effect = fs.readdirSync(path.join(app, 'fx-1'))[0];
  fs.writeFileSync(path.join(app, 'fx-1', effect), '');
  assert.throws(() => verifyNativeBundle(app, () => ''), /Áudio ausente\/vazio/);
  fs.writeFileSync(path.join(app, 'fx-1', effect), 'audio fixture');
  const pad = fs.readdirSync(path.join(app, 'pads'))[0];
  fs.unlinkSync(path.join(app, 'pads', pad));
  assert.throws(() => verifyNativeBundle(app, () => ''), /ENOENT/);
  fs.writeFileSync(path.join(app, 'pads', pad), 'audio fixture');
  fs.unlinkSync(path.join(app, 'loops', 'Beat 4-4.mp3'));
  assert.throws(() => verifyNativeBundle(app, () => ''), /ENOENT/);
});
