import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { verifyNativeBundle, verifyNativeProject, verifyNativeFrameworks, verifyIOSLoadCommands } from './verify-native-ios.mjs';

const loadCommands = (command = 'LC_LOAD_WEAK_DYLIB', version = '15.0', platform = '2') => `App:
Load command 0
      cmd LC_BUILD_VERSION
  cmdsize 32
 platform ${platform}
    minos ${version}
      sdk 26.0
Load command 1
      cmd LC_LOAD_DYLIB
  cmdsize 88
     name /System/Library/Frameworks/UIKit.framework/UIKit (offset 24)
Load command 2
      cmd ${command}
  cmdsize 96
     name /System/Library/Frameworks/SwiftUICore.framework/SwiftUICore (offset 24)
`;

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
test('frameworks de áudio e MIDI precisam estar na fase de linkagem, não só listados', () => {
  const project = fs.readFileSync(path.join(root, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
  verifyNativeFrameworks(project);
  for (const name of ['AVFoundation', 'AudioToolbox', 'CoreMIDI']) {
    const disconnected = project.replace(new RegExp(`\\t+[A-F0-9]{24} /\\* ${name}\\.framework in Frameworks \\*/,`), '');
    assert.notEqual(disconnected, project);
    assert.throws(() => verifyNativeFrameworks(disconnected), /Framework fora da linkagem/);
    assert.throws(() => verifyNativeFrameworks(project.replace(`path = System/Library/Frameworks/${name}.framework;`, 'path = missing;')), /Framework nativo ausente/);
  }
});
test('bundle nativo aceita áudio sem recursos da interface web', t => {
  const app = fixture(t);
  const inspected = [];
  verifyNativeBundle(app, file => { inspected.push(path.basename(file)); return loadCommands(); });
  assert.deepEqual(inspected, ['App']);
});

test('reproduz o crash DYLD da build 98: SwiftUICore obrigatório é rejeitado', t => {
  const app = fixture(t);
  assert.throws(() => verifyNativeBundle(app, () => loadCommands('LC_LOAD_DYLIB')), /SwiftUICore obrigatório/);
  assert.throws(() => verifyIOSLoadCommands(loadCommands('LC_REEXPORT_DYLIB')), /SwiftUICore obrigatório/);
  assert.throws(() => verifyIOSLoadCommands(loadCommands('LC_LOAD_UPWARD_DYLIB')), /SwiftUICore obrigatório/);
  verifyNativeBundle(app, () => loadCommands());
  // No SwiftUICore dependency at all is also valid on older deployment targets.
  verifyIOSLoadCommands(loadCommands().split('Load command 2')[0], true);
  // A weak command elsewhere cannot conceal a mandatory command in another slice.
  assert.throws(() => verifyIOSLoadCommands(loadCommands() + loadCommands('LC_LOAD_DYLIB')), /SwiftUICore obrigatório/);
});

test('valida versão mínima e plataforma do executável, inclusive formato antigo', () => {
  verifyIOSLoadCommands(loadCommands('LC_LOAD_WEAK_DYLIB', '15.0', 'IOS'), true);
  verifyIOSLoadCommands('Load command 0\n cmd LC_VERSION_MIN_IPHONEOS\n version 15.0\n sdk 16.4\n', true);
  for (const version of ['15.1', '16.0', '18.0']) {
    assert.throws(() => verifyIOSLoadCommands(loadCommands('LC_LOAD_WEAK_DYLIB', version), true), /acima do mínimo/);
  }
  for (const platform of ['7', 'IOSSIMULATOR', '1', 'MACOS']) {
    assert.throws(() => verifyIOSLoadCommands(loadCommands('LC_LOAD_WEAK_DYLIB', '15.0', platform), true), /dispositivo iOS/);
  }
  assert.throws(() => verifyIOSLoadCommands('App: /System/Library/Frameworks/SwiftUICore.framework/SwiftUICore'), /otool -l/);
  assert.throws(() => verifyIOSLoadCommands('Load command 0\n cmd LC_UUID\n', true), /sem versão mínima/);
});

test('dependências embarcadas também não podem exigir SwiftUICore', t => {
  const app = fixture(t);
  fs.mkdirSync(path.join(app, 'Frameworks'));
  fs.writeFileSync(path.join(app, 'Frameworks', 'Extra'), Buffer.from('cffaedfe', 'hex'));
  assert.throws(() => verifyNativeBundle(app, file => loadCommands(path.basename(file) === 'App' ? 'LC_LOAD_WEAK_DYLIB' : 'LC_LOAD_DYLIB')), /SwiftUICore obrigatório/);
});

test('IPA sem executável ou com arquivo inválido não é aprovada', t => {
  const app = fixture(t);
  fs.writeFileSync(path.join(app, 'App'), 'not a binary');
  assert.throws(() => verifyNativeBundle(app, () => loadCommands()), /não é Mach-O/);
  fs.unlinkSync(path.join(app, 'App'));
  assert.throws(() => verifyNativeBundle(app, () => loadCommands()), /Executável App ausente/);
});

test('workflow verifica o conteúdo da IPA exportada antes de publicar', () => {
  const workflow = fs.readFileSync(path.join(root, '../.github/workflows/hook-keys-release.yml'), 'utf8');
  const exported = workflow.indexOf('xcodebuild -exportArchive');
  const extracted = workflow.indexOf('ditto -x -k "$IPA_PATH" "$IPA_CHECK"', exported);
  const checked = workflow.indexOf('node scripts/verify-native-ios.mjs --app "$IPA_CHECK/Payload/App.app"', extracted);
  const published = workflow.indexOf('cp "$IPA_PATH"', checked);
  assert(exported >= 0 && extracted > exported && checked > extracted && published > checked);
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
