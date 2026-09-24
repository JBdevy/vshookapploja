import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const info = read('ios/App/App/Info.plist');
const delegate = read('ios/App/App/AppDelegate.swift');
const engine = read('ios/App/App/HookKeysNativeEngine.mm');
const engineHeader = read('ios/App/App/HookKeysNativeEngine.h');
const nativeModel = read('ios/App/App/BronzeNativeAppModel.swift');
const nativeRoot = read('ios/App/App/BronzeNativeRootView.swift');
const nativeControls = read('ios/App/App/BronzeNativeControls.swift');
const nativeHost = read('ios/App/App/BronzeNativeHostingController.swift');
const skia = read('ios/App/App/BronzeSkiaControlView.mm');
const project = read('ios/App/App.xcodeproj/project.pbxproj');
const releaseWorkflow = read('../.github/workflows/hook-keys-release.yml');
const skiaRevision = read('scripts/skia-apple.revision').trim();
const skiaBuild = read('scripts/build-skia-apple.sh');

const definitions = [...project.matchAll(/^\s*([A-F0-9]{24})\s+\/\*[^\n]*?\*\/\s*=\s*\{/gm)].map(match => match[1]);
assert.equal(new Set(definitions).size, definitions.length,
  'cada objeto Xcode precisa de um UUID único, inclusive configurações e arquivos Swift');
const sessionRef = project.match(/([A-F0-9]{24}) \/\* BronzeNativeSession\.swift \*\/ = \{isa = PBXFileReference;[^\n]+path = BronzeNativeSession\.swift;/)?.[1];
assert.ok(sessionRef, 'a sessão precisa ser um arquivo Swift real, não uma referência a xcconfig');
assert.match(project, new RegExp(`fileRef = ${sessionRef} /\\* BronzeNativeSession\\.swift \\*/`));
assert.doesNotMatch(nativeRoot, /\? \.secondary : \.green/,
  'a cor condicional precisa de tipos ShapeStyle compatíveis');

assert.doesNotMatch(info, /UIMainStoryboardFile/,
  'o storyboard não pode instanciar a WebView antes da escolha do root nativo');
assert.match(info, /<key>BronzeNativeUIEnabled<\/key>\s*<true\/>/,
  'a IPA precisa abrir a interface nativa por padrão');
assert.match(delegate, /--bronze-native-ui/);
assert.match(delegate, /BronzeNativeHostingController\(\)/);
assert.match(delegate, /HookKeysBridgeViewController\(\)/,
  'a interface atual continua disponível durante a migração controlada');
assert.match(engine, /MIDIInputPortCreate/);
assert.match(engine, /AVAudioSourceNode/);
assert.doesNotMatch(engine, /reservedPadNote/,
  'canal MIDI 10 precisa entrar no runtime C++, não parar no callback visual');
assert.match(engineHeader, /loadEffectAtPath/);
assert.match(nativeModel, /loadBundledEffects\(\)/);
assert.match(nativeModel, /applyOrganFactoryDefaults\(\)/);
assert.match(nativeModel, /configureModuleEnvelope/,
  'os knobs do envelope nativo precisam alterar diretamente o motor C++');
assert.match(nativeModel, /self\.moduleLevels = nextLevels/,
  'os oito meters devem publicar uma única atualização SwiftUI por frame');
assert.match(nativeRoot, /BronzeSkiaControl/);
assert.doesNotMatch(nativeRoot, /value:\s*\.constant/,
  'controles da tela nativa não podem ser apenas demonstrativos');
assert.match(nativeRoot, /BronzePerformanceKeyboard/);
assert.match(nativeModel, /fromSlot:\s*3/,
  'o teclado da tela deve usar diretamente o slot MIDI nativo reservado');
assert.match(nativeControls, /isMultipleTouchEnabled = true/);
assert.match(nativeControls, /firstNote = 48/);
assert.match(nativeControls, /lastNote = 84/);
assert.match(nativeControls, /touchesCancelled/,
  'o teclado nativo precisa soltar notas quando o sistema cancela o toque');
assert.match(nativeModel, /configureMetronomeEnabled/,
  'o transporte nativo precisa controlar o metrônomo do runtime C++');
assert.match(nativeRoot, /CLICK ON/);
assert.match(nativeRoot, /Button\("4\/4"\)/);
assert.match(nativeRoot, /Button\("6\/8"\)/);
assert.match(delegate, /bronzeKeysStopAllNotes/,
  'ir para segundo plano precisa liberar todas as notas nativas');
assert.match(engineHeader, /setOrganRotaryFast/);
assert.match(engineHeader, /setOrganCabinetEnabled/);
assert.match(nativeRoot, /toggleOrganRotarySpeed/);
assert.match(nativeRoot, /toggleOrganCabinet/);
assert.match(nativeRoot, /BronzeNativeEqualizerEditor\(model: model, moduleIndex: model.selectedModule\)/);
assert.match(nativeRoot, /\.onChanged \{ value in[\s\S]*?model.editEQBand/,
  'o arraste precisa enviar o EQ enquanto move, não somente ao soltar');
assert.match(nativeModel, /equalizer: moduleEqualizers\[index\]/);
assert.match(nativeModel, /sendEqualizer\(module.equalizer, moduleIndex: index, engine: engine\)/);
assert.match(engine, /runtime->setModuleEqualizer/);
assert.match(nativeRoot, /repetition\?\.cancel\(\)/);
assert.match(nativeModel, /setModuleEnabledMask\(mask\)/);
assert.match(engineHeader, /NS_SWIFT_NAME\(setModuleEnabledMask\(_:\)\)/);
assert.match(nativeRoot, /toggleModuleSolo\(index\)/);
assert.match(nativeModel, /startAccessingSecurityScopedResource\(\)/);
assert.match(nativeModel, /stopAccessingSecurityScopedResource\(\)/);
assert.match(nativeRoot, /fileImporter\(/);
assert.match(nativeModel, /loadSoundFont\(atPath:/);
assert.match(nativeModel, /metronomeEnabled \|\| loopPlaying/);
assert.match(nativeModel, /volume: metronomeEnabled \? 1 : 0/);
assert.match(nativeModel, /syncMetronome: true/);
assert.match(nativeModel, /playbackRate: tempo \/ 120/);
assert.match(nativeModel, /bankIndex: activePadBank, enabled: false/);
assert.match(nativeModel, /bankIndex: selectedPadBank, enabled: true/);
assert.match(nativeModel, /guard !pressedEffects\.contains\(index\)/,
  'mover o dedo dentro do FX não pode dispará-lo novamente');
assert.match(nativeRoot, /model\.setPadFilter\(low: low, normalized: \$0\)/);
for (const loop of ['Beat 4-4', 'Beat 4-4 2', 'Beat 6-8']) {
  assert.ok(fs.existsSync(path.join(root, 'public/assets/loops', `${loop}.mp3`)),
    `loop nativo precisa estar empacotado: ${loop}`);
}
assert.doesNotMatch(nativeRoot, /UIHostingController|UIKit/,
  'a view principal deve continuar compartilhável com o target macOS');
assert.match(nativeHost, /UIHostingController<BronzeNativeRootView>/);
assert.match(skia, /SkCanvas/);
assert.match(skia, /BRONZE_KEYS_REQUIRE_SKIA/);
assert.match(skiaRevision, /^[0-9a-f]{40}$/);
assert.match(skiaBuild, /cd "\$SKIA_ROOT"\s+bin\/gn gen "out\/\$name"/,
  'o GN precisa rodar dentro da raiz que contém o arquivo .gn do Skia');
assert.match(project, /common\.xcconfig/);
assert.match(releaseWorkflow, /build-skia-apple\.sh/);
assert.match(releaseWorkflow, /Skia\.xcframework/);
for (const file of [
  'BronzeNativeAppModel.swift', 'BronzeNativeSession.swift', 'BronzeNativeControls.swift',
  'BronzeNativeRootView.swift', 'BronzeNativeHostingController.swift',
  'BronzeSkiaControlView.mm'
]) {
  assert.match(project, new RegExp(file.replace('.', '\\.')),
    `${file} precisa fazer parte do target iOS`);
}

const effects = fs.readdirSync(path.join(root, 'public/assets/fx/fx-1'))
  .filter((name) => name.toLowerCase().endsWith('.mp3'));
assert.equal(effects.length, 12, 'o banco Church precisa dos doze FX empacotados');

console.log('APPLE_NATIVE_FOUNDATION_OK: root sem storyboard, Core MIDI/Core Audio direto, FX no C++ e controles Skia preparados');
