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
const nativeRoot = read('ios/App/App/BronzeNativeRootView.swift') + read('ios/App/App/BronzeNativePlayerView.swift') + read('ios/App/App/BronzeNativeModuleLayout.swift');
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
assert.doesNotMatch(info, /BronzeNativeUIEnabled|CAPACITOR/);
assert.match(delegate, /rootViewController = BronzeNativeHostingController\(\)/);
assert.doesNotMatch(delegate + project, /Capacitor|CapApp-SPM|HookKeysBridgeViewController|SessionVaultPlugin|HookKeysNativePlugin/,
  'iOS deve iniciar e vincular exclusivamente a interface nativa');
assert.match(delegate, /isIdleTimerDisabled = true/,
  'UIKit mantém a tela ligada, sem o antigo plugin KeepAwake');
assert.match(engine, /MIDIInputPortCreate/);
assert.match(engine, /AVAudioSourceNode/);
assert.match(engine, /runtime->setNativeArpeggiator/);
assert.match(nativeRoot, /BronzeNativeArpeggiatorEditor/);
assert.match(nativeModel, /autoFaderEnabled: arp.enabled && arp.autoFaderEnabled/);
assert.match(nativeModel, /arpeggiator: moduleArpeggiators\[index\]/);
assert.match(nativeModel, /sendArpeggiator\(module.arpeggiator/);
assert.match(nativeModel, /performance: modulePerformance\[index\], tone: moduleTones\[index\]/);
assert.match(nativeModel, /sendPerformanceGlide\(module.performance/);
assert.match(nativeRoot, /BronzeNativeToneEditor/);
assert.match(nativeRoot, /BronzeNativePerformanceEditor/);
assert.match(engine, /runtime->setModuleTone/);
assert.match(engine, /runtime->setModulePerformance/);
const startupBoundary = engine.slice(engine.indexOf('- (BOOL)startWithBufferFrames:'),
  engine.indexOf('- (void)recordStartupStage:(NSString *)stage {'));
assert.match(startupBoundary, /@try[\s\S]*startAudioWithBufferFrames/,
  'a abertura do grafo precisa capturar NSException, não apenas NSError');
assert.match(startupBoundary, /@catch \(NSException \*exception\)/);
assert.match(startupBoundary, /catch \(const std::exception& exception\)/);
assert.doesNotMatch(startupBoundary, /\[self stop\]/,
  'a recuperação não pode readquirir o mutex de controle que já está bloqueado');
assert.match(startupBoundary, /_audioState\.reset\(\)/);
assert.match(engine, /\[BronzeStartup\]/);
assert.match(releaseWorkflow, /-resultBundlePath/);
assert.match(releaseWorkflow, /name: Bronze-Keys-iOS-diagnostics/);
assert.match(releaseWorkflow, /Bronze-Keys\.xcarchive\/dSYMs/,
  'os símbolos da build precisam ser preservados para simbolicar o crash do iPad');
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
assert.match(nativeControls, /firstNote: Int \{ fullRange \? 21 : 48 \}/);
assert.match(nativeControls, /lastNote: Int \{ fullRange \? 108 : 84 \}/);
assert.match(nativeControls, /touchesCancelled/,
  'o teclado nativo precisa soltar notas quando o sistema cancela o toque');
assert.match(nativeModel, /configureMetronomeEnabled/,
  'o transporte nativo precisa controlar o metrônomo do runtime C++');
assert.match(nativeRoot, /model.toggleMetronome\(\)/);
assert.match(nativeRoot, /model.setTimeSignature\(numerator: beats/);
assert.match(nativeRoot, /beats >= 6 \? 8 : 4/);
for (const event of ['sceneWillResignActive', 'sceneDidEnterBackground']) {
  const body = delegate.match(new RegExp(`func ${event}[^}]+}`))?.[0] ?? '';
  assert.match(body, /bronzeKeysReleaseTouches/, 'background releases touch input');
  assert.doesNotMatch(body, /bronzeKeysStopAllNotes/, 'background must preserve continuous pads and FX');
}
const background = nativeModel.match(/func prepareForBackground\(\)[\s\S]*?\n    }/)?.[0] ?? '';
assert.match(background, /stopPerformanceNotes/);
assert.doesNotMatch(background, /stopAllNotes|panic\(/);
assert.match(nativeModel, /storeActivePreset\(\)/);

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
assert.match(engine, /runtime->setModuleReverb/);
assert.match(engineHeader, /NS_SWIFT_NAME\(configureReverb\(_:enabled:impulse:mix:decay:\)\)/);
assert.match(nativeRoot, /BronzeNativeReverbEditor\(model: model, moduleIndex: model.selectedModule\)/);
assert.match(nativeRoot, /Text\("Convolution"\)/);
assert.match(nativeModel, /reverb: moduleReverbs\[index\]/);
assert.match(nativeModel, /engine.configureReverb\(index, enabled: module.reverb.enabled/,
  'restaurar sessão e preset precisa aplicar o reverb ao motor');
assert.match(nativeModel, /pendingReverbs\[moduleIndex\] = reverb/,
  'somente o valor mais recente aguarda a preparação do IR');
assert.match(nativeModel, /audioQueue.async \{ \[weak self\] in\s*let success = engine.configureReverb/,
  'preparar convolução não pode bloquear a thread da interface');
assert.match(nativeModel, /!isApplyingSnapshot, !updatingEffects, loadingSoundFontModule/,
  'troca de preset não pode ultrapassar uma alteração pendente de reverb ou Delay');
assert.match(nativeRoot, /BronzeNativeDelayEditor\(model: model, moduleIndex: model.selectedModule\)/);
assert.match(nativeModel, /Self.sendDelay\(module.delay, moduleIndex: index, engine: engine\)/);
assert.match(nativeModel, /pendingDelays\[moduleIndex\] = delay/);
assert.match(nativeModel, /audioQueue.async \{ \[weak self\] in\s*let success = Self.sendDelay/);
assert.match(nativeModel, /nonisolated private static func sendDelay/,
  'o envio ao motor precisa funcionar na fila de áudio sem isolamento MainActor');
assert.match(engine, /runtime->setModuleDelay/);
assert.match(engine, /runtime->setModuleSoundEffects/);
assert.match(nativeRoot, /BronzeNativeProcessorEditor\(model: model/);
assert.match(nativeRoot, /model.selectedModule != 6 \|\| kind == .chorus/);
assert.match(nativeModel, /Self.sendSoundEffects\(module.soundEffects \?\? BronzeSoundEffects\(\)/);
assert.match(nativeModel, /soundEffects: moduleSoundEffects\[index\]/);
assert.match(nativeModel, /pendingSoundEffects\[moduleIndex\] = effects/);
assert.match(nativeRoot, /VINYL ON/);
assert.match(nativeRoot, /BronzeNativePulseEditor\(model: model/);
assert.match(nativeModel, /Self.sendPulse\(module.pulse \?\? BronzePulse\(\)/);
assert.match(nativeModel, /pulse: modulePulses\[index\]/);
assert.match(nativeModel, /measureBeats: Float\(pulse.measureBeats\(numerator: numerator, denominator: denominator\)\)/);
assert.match(nativeRoot, /BronzeNativeSynthEditor\(model: model\)/);
assert.match(nativeModel, /synth: index == 7 \? synth : nil/);
assert.match(nativeModel, /Self.sendSynth\(modules\[7\].synth \?\? BronzeSynth\(\)/);
assert.match(nativeModel, /oscillator1Octave: a.octave, oscillator2Octave: b.octave, oscillator3Octave: c.octave/);
assert.match(nativeModel, /decay: Float\(module.reverb.decay\)/);
assert.match(nativeRoot, /\$0.setDecay\(/);
assert.match(nativeRoot, /repetition\?\.cancel\(\)/);
assert.match(nativeModel, /setModuleEnabledMask\(mask\)/);
assert.match(engineHeader, /NS_SWIFT_NAME\(setModuleEnabledMask\(_:\)\)/);
assert.match(nativeRoot, /toggleModuleSolo\(index\)/);
assert.match(nativeModel, /startAccessingSecurityScopedResource\(\)/);
assert.match(nativeModel, /stopAccessingSecurityScopedResource\(\)/);
assert.match(nativeRoot, /fileImporter\(/);
assert.match(nativeModel, /loadSoundFont\(atPath:/);
assert.match(nativeModel, /let syncLoop = loopPlaying && selectedLoop\?\.isLoop == true/);
assert.match(nativeModel, /metronomeEnabled \|\| syncLoop/);
assert.match(nativeModel, /selectedLoop.isLoop \? tempo \/ 120 : 1/);
assert.match(nativeModel, /volume: metronomeEnabled && mixer.enabled\[3\] \? pow\(10, outputDb\(3\) \/ 20\) : 0/);
assert.match(nativeModel, /syncMetronome: selectedLoop.isLoop/);
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
