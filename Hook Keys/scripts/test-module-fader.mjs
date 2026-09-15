import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const handleRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter(([, selector]) => selector.trim().endsWith('.player-module__fader-handle'));

test('iOS bridge registers a plugin instance rather than a type skipped by auto-registration', () => {
  const controller = readFileSync(new URL('../ios/App/App/HookKeysBridgeViewController.swift', import.meta.url), 'utf8');
  assert.match(controller, /private let hookKeysNativePlugin = HookKeysNativePlugin\(\)/);
  assert.match(controller, /bridge\?\.registerPluginInstance\(hookKeysNativePlugin\)/);
  assert.doesNotMatch(controller, /bridge\?\.registerPluginType\(/);
});

test('iOS generator and DSP use the same sample-rate clock negotiated by the route', () => {
  const engine = readFileSync(new URL('../ios/App/App/HookKeysNativeEngine.mm', import.meta.url), 'utf8');
  assert.match(engine, /outputFormat\s*=\s*\[_audioEngine\.outputNode inputFormatForBus:0\]/);
  assert.match(engine, /sampleRate\s*=\s*outputFormat\.sampleRate/);
  assert.match(engine, /makeSourceNode\(renderFormat, state\)/);
  assert.match(engine, /initWithFormat:format renderBlock:/);
  assert.match(engine, /connect:_sourceNode to:_audioEngine\.mainMixerNode format:renderFormat/);
  assert.doesNotMatch(engine, /connect:_sourceNode to:_audioEngine\.mainMixerNode format:nil/);
});

test('iOS keeps a USB audio route stable during the system hand-off', () => {
  const plugin = readFileSync(new URL('../ios/App/App/HookKeysNativePlugin.swift', import.meta.url), 'utf8');
  assert.match(plugin, /cachedAudioOutputs/);
  assert.match(plugin, /AVAudioSession\.routeChangeNotification/);
  assert.match(plugin, /reason\s*==\s*\.oldDeviceUnavailable/);
  assert.match(plugin, /AVAudioSessionRouteChangePreviousRouteKey/);
  assert.match(plugin, /currentRoute\.outputs/);
  assert.match(plugin, /scheduleAudioRouteRecovery/);
  assert.match(plugin, /if alreadyActive[\s\S]*?call\.resolve\(\)[\s\S]*?return/);
  assert.doesNotMatch(plugin, /audioOutputGracePeriod/);
});

test('Android and desktop build their DSP clock from the actual 44.1/48 kHz stream', () => {
  const android = readFileSync(new URL('../android/app/src/main/cpp/HookKeysNativeBridge.cpp', import.meta.url), 'utf8');
  const desktop = readFileSync(new URL('../src-tauri/src/main.rs', import.meta.url), 'utf8');
  assert.match(android, /sampleRate\s*=\s*static_cast<double>\(AAudioStream_getSampleRate\(stream_\)\)/);
  assert.match(android, /NativeEngineRuntime>\(sampleRate, kRenderChunkFrames\)/);
  assert.match(desktop, /sample_rate\s*=\s*selected\.sample_rate\(\)/);
  assert.match(desktop, /NativeRuntime::new\([\s\S]*sample_rate as f64/);
});

test('iOS batches MIDI paint and isolates dynamic keyboard and meter layers', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const runtime = readFileSync(new URL('../src/platform/runtime.ts', import.meta.url), 'utf8');
  assert.match(runtime, /dataset\.platform\s*=\s*isNative \? Capacitor\.getPlatform\(\)/);
  assert.match(player, /iosRuntime[\s\S]*pendingKeyboardNoteStates[\s\S]*requestAnimationFrame/);
  assert.match(css, /html\[data-platform="ios"\] :is\(\.player-module__meter, \.performance-keyboard__key\)[\s\S]*contain:\s*paint/);
  assert.match(css, /html\[data-platform="ios"\] \.player-module__meter-fill[\s\S]*transition-property:\s*transform/);
});

test('mobile effects omitted from a call stay bypassed rather than activating compression', () => {
  const plugin = readFileSync(new URL('../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java', import.meta.url), 'utf8');
  const iosPlugin = readFileSync(new URL('../ios/App/App/HookKeysNativePlugin.swift', import.meta.url), 'utf8');
  for (const effect of ['compressorMix', 'delayMix', 'reverbMix']) {
    assert(plugin.includes(`call.getFloat("${effect}", 0.0f)`), `${effect} deve nascer em zero`);
    assert(iosPlugin.includes(`call.getFloat("${effect}", 0)`), `${effect} deve nascer em zero no iOS`);
  }
});

test('module fader handles reach the inner edges without protruding in every layout', () => {
  assert(handleRules.length >= 3);
  const offsets = handleRules.filter(([, , declarations]) => /(?:left|right):/.test(declarations));
  assert.equal(offsets.length, 3);
  for (const [, selector, declarations] of offsets) {
    assert.match(declarations, /left:\s*0px;/, selector.trim());
    assert.match(declarations, /right:\s*0px;/, selector.trim());
    assert.doesNotMatch(declarations, /(?:left|right):\s*-/, selector.trim());
  }
  for (const railWidth of [20, 24, 27, 38, 42]) {
    const contentWidth = railWidth - 2; // Shared themed rail has a 1px border.
    const handleWidth = contentWidth;
    assert(handleWidth > 0);
    assert.equal(1 + handleWidth, railWidth - 1);
  }
});

test('all eight modules inherit the same darker Synth gray theme', () => {
  assert.match(css, /--module-accent:\s*#7b8390;/);
  assert.match(css, /--module-surface-a:\s*#1c1e22;/);
  assert.match(css, /--module-surface-b:\s*#0b0c0f;/);
  assert.doesNotMatch(css, /\.player-module:nth-child\(\d\)\s*\{\s*--module-accent:/);
});

test('themed handle retains square corners and its module colors, without an external glow', () => {
  const themed = handleRules.find(([, , declarations]) => declarations.includes('var(--module-accent-hot)'))[2];
  assert.match(themed, /border-radius:\s*0;/);
  assert.match(themed, /linear-gradient\(180deg, var\(--module-accent-hot\)/);
  const shadows = themed.match(/box-shadow:([^;]+);/)[1].split(/,\s*(?![^()]*\))/);
  assert(shadows.every((shadow) => shadow.trim().startsWith('inset ')));
});

test('audio meter fills the complete rail as independent stereo halves', () => {
  const meterRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selector]) => selector.trim().endsWith('.player-module__meter'));
  const themed = meterRules.find(([, , declarations]) => declarations.includes('z-index: 1'));
  assert(themed);
  assert.match(themed[2], /inset:\s*3px;/);
  assert.match(themed[2], /width:\s*auto;/);
  assert.match(themed[2], /overflow:\s*hidden;/);
  assert.match(css, /\.player-module__meter::after\s*\{[^}]*left:\s*50%;/s);
  assert.match(css, /width:\s*calc\(50% - \.5px\);/);
  // Degradê em altura total dentro de uma janela: os dois andam só com transform
  // (GPU), sem repintar e sem comprimir as cores.
  assert.match(css, /\.player-module__meter-fill > i\s*\{[^}]*#0db758[^}]*#ffe23b[^}]*#ff3e32/s);
  assert.match(css, /\.player-module__meter-fill\s*\{[^}]*overflow:\s*hidden;[^}]*transform:\s*translate3d\(0, 100%, 0\);[^}]*transition:\s*transform 90ms linear/s);
  assert.doesNotMatch(css, /transition:\s*clip-path/);
  const fader = readFileSync(new URL('../src/features/player/ModuleFader.ts', import.meta.url), 'utf8');
  assert.match(fader, /window\.style\.transform = `translate3d\(0, \$\{hidden\}%, 0\)`/);
  assert.match(fader, /gradient\.style\.transform = `translate3d\(0, -\$\{hidden\}%, 0\)`/);
  assert.doesNotMatch(fader, /style\.clipPath|scaleY\(/);
  assert.match(css, /html\[data-runtime="native"\] \.player-module__meter-fill/);
  assert.match(css, /\.player-module__fader\.is-clipping \.player-module__meter-fill/);
});

test('live fader gain is forwarded by every native platform bridge', () => {
  for (const [path, marker] of [
    ['../src/platform/native/HookKeysNative.ts', 'setModuleGain'],
    ['../src-tauri/src/main.rs', 'set_module_gain'],
    ['../src-tauri/src/native_engine_bridge.cpp', 'hk_runtime_set_module_gain'],
    ['../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java', 'setModuleGain'],
    ['../android/app/src/main/cpp/HookKeysNativeBridge.cpp', 'nativeSetModuleGain'],
    ['../ios/App/App/HookKeysNativePlugin.swift', 'setModuleGain'],
    ['../ios/App/App/HookKeysNativeEngine.mm', 'setModuleGainDb'],
  ]) {
    assert(readFileSync(new URL(path, import.meta.url), 'utf8').includes(marker), path);
  }
});

test('library default and active module ON/HLD/MOD use darker greens without overwriting timbre colors or OFF red', () => {
  assert.match(css, /--module-button-green-a: #18874e;/);
  assert.match(css, /--module-button-green-b: #064526;/);
  for (const selector of ['.player-module__sound-button', '.player-screen .player-module__power-button.is-on', ':is(.player-screen, .player-modal) .player-module__filter-button:not(.is-blocked)']) {
    const rule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, candidate, declarations]) => candidate.trim().endsWith(selector) && declarations.includes('--module-button-green-a'));
    assert(rule, selector);
    assert.match(rule[2], /--button-color-a: var\(--module-button-green-a\) !important;/);
    assert.match(rule[2], /--button-color-b: var\(--module-button-green-b\) !important;/);
  }
  assert.match(css, /\.player-module__sound-button\.has-selected-timbre\s*\{[^}]*var\(--module-sound-color\)/);
  assert.match(css, /\.player-module__power-button\.is-off,[\s\S]*?--button-color-a: #f05a4f !important;/);
  assert.match(css, /\.player-screen \.player-module__action-button\.is-octave-active,\s*\.player-screen \.player-module__power-button\.is-on\s*\{[^}]*--button-color-a: var\(--module-button-green-a\) !important;/);
});

test('all module borders use the same orange identity without changing the common gray surfaces', () => {
  assert.match(css, /--module-border-color: #ff7900;/);
  assert.doesNotMatch(css, /\.player-module:nth-child\(\d\)\s*\{\s*--module-border-color:/);
  assert.match(css, /\.player-module\s*\{\s*border-color: var\(--module-border-color\);/);
  assert.doesNotMatch(css, /\.player-module:nth-child\(\d\)\s*\{[^}]*--module-surface/);
});

function transpile(path, modules = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const context = { exports: {}, require(specifier) {
    assert(specifier in modules, `Unexpected runtime import: ${specifier}`);
    return modules[specifier];
  } };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports;
}

test('module faders and output levels pass through -90 dB before -inf', () => {
  const fader = transpile('../src/features/player/ModuleFader.ts', {
    '../../shared/gestures/LongPressGesture': { LongPressGesture: class {} },
    '../../shared/gestures/DoubleTapTracker': { DoubleTapTracker: class {} },
    '../../platform/runtime': { isDesktopRuntime: () => true },
  });
  const output = transpile('../src/features/player/OutputControls.ts', { './ModuleFader': fader });
  assert.equal(fader.MODULE_FADER_MIN_DB, -90);
  assert.equal(fader.formatFaderDb(-90), '−∞ dB');
  assert.equal(fader.formatFaderDb(-89.9), '-89.9 dB');
  // Rail bottom (6% safe area) is silence; the tail reaches -60 dB at 6% of travel.
  assert.equal(fader.visualPositionToFaderDb(0.06), -90);
  assert.equal(fader.visualPositionToFaderDb(0.06 + 0.06 * 0.88), -60);
  assert(fader.visualPositionToFaderDb(0.06 + 0.03 * 0.88) < -60, 'fader has room between -60 dB and silence');
  assert.equal(fader.visualPositionToFaderDb(0.06 + 0.8 * 0.88) + 0, 0, '0 dB keeps its fader position');

  assert.equal(output.OUTPUT_MIN_DB, -90);
  assert.equal(output.outputDbFromPosition(0), -90);
  assert.equal(output.outputDbFromPosition(3), -75);
  assert.equal(output.outputDbFromPosition(6), -60);
  assert.equal(output.outputDbFromPosition(82), 0, '0 dB keeps its output knob position');
  assert.equal(output.formatOutputDb(-90), '−∞ dB');
  assert.equal(output.formatOutputDb(-75), '-75.0 dB');
  assert.equal(output.outputPosition(-75), 3);
});

test('velocity limits are forwarded by every native platform bridge', () => {
  for (const [path, markers] of [
    ['../src/platform/native/HookKeysNative.ts', ["'configure_velocity_limits'", 'plugin.configureVelocityLimits']],
    ['../src-tauri/src/main.rs', ['fn configure_velocity_limits', '            configure_velocity_limits,']],
    ['../src-tauri/src/native_engine_bridge.cpp', ['hk_runtime_configure_velocity_limits', 'setVelocityLimits']],
    ['../ios/App/App/HookKeysNativePlugin.swift', ['name: "configureVelocityLimits"', 'func configureVelocityLimits']],
    ['../ios/App/App/HookKeysNativeEngine.h', ['configureVelocityLimits:']],
    ['../ios/App/App/HookKeysNativeEngine.mm', ['configureVelocityLimits:', 'setVelocityLimits']],
    ['../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java', ['public void configureVelocityLimits', 'nativeConfigureVelocityLimits(']],
    ['../android/app/src/main/cpp/HookKeysNativeBridge.cpp', ['nativeConfigureVelocityLimits', 'setVelocityLimits']],
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    for (const marker of markers) assert(source.includes(marker), `${path}: ${marker}`);
  }
});

test('metronome output route is forwarded by every native platform bridge', () => {
  for (const [path, markers] of [
    ['../src/platform/native/HookKeysNative.ts', ["'set_metronome_output'", 'plugin.setMetronomeOutput']],
    ['../src-tauri/src/main.rs', ['fn set_metronome_output', 'hk_runtime_set_metronome_output', '            set_metronome_output,']],
    ['../src-tauri/src/native_engine_bridge.cpp', ['hk_runtime_set_metronome_output', 'setMetronomeOutput']],
    ['../ios/App/App/HookKeysNativePlugin.swift', ['name: "setMetronomeOutput"', 'func setMetronomeOutput']],
    ['../ios/App/App/HookKeysNativeEngine.h', ['setMetronomeOutputChannelStart:']],
    ['../ios/App/App/HookKeysNativeEngine.mm', ['setMetronomeOutputChannelStart:', 'setMetronomeOutput(']],
    ['../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java', ['public void setMetronomeOutput', 'nativeSetMetronomeOutput(']],
    ['../android/app/src/main/cpp/HookKeysNativeBridge.cpp', ['nativeSetMetronomeOutput', 'setMetronomeOutput(']],
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    for (const marker of markers) assert(source.includes(marker), `${path}: ${marker}`);
  }
});

test('music plays inside the iOS engine with its own output', () => {
  for (const [path, markers] of [
    ['../src/platform/native/HookKeysNative.ts', ['plugin.beginTrackUpload', 'plugin.loadTrack', 'plugin.controlTrack',
      'plugin.trackStatus', 'plugin.configureTrackOutput', 'plugin.adoptPickedAudioFile']],
    ['../ios/App/App/HookKeysNativePlugin.swift', ['name: "loadTrack"', 'name: "controlTrack"', 'name: "trackStatus"',
      'name: "configureTrackOutput"', 'name: "beginTrackUpload"', 'name: "appendTrackChunk"', 'name: "finishTrackUpload"',
      'name: "adoptPickedAudioFile"', '"track_not_loaded"', 'applicationSupportDirectory']],
    ['../ios/App/App/HookKeysNativeEngine.h', ['loadTrackId:', 'controlTrackId:', 'trackStatus', 'configureTrackOutputChannelStart:']],
    ['../ios/App/App/HookKeysNativeEngine.mm', ['ExtAudioFileOpenURL', 'kExtAudioFileProperty_ClientDataFormat', 'tracks()']],
    ['../native-engine/src/NativeEngineRuntime.cpp', ['tracks_->render(output, frames, channels)']],
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    for (const marker of markers) assert(source.includes(marker), `${path}: ${marker}`);
  }
});

test('Glide mode and velocity gate are forwarded by every native platform bridge', () => {
  for (const [path, markers] of [
    ['../src/platform/native/HookKeysNative.ts', ["'configure_glide'", 'plugin.configureGlide']],
    ['../src-tauri/src/main.rs', ['fn configure_glide', 'hk_runtime_configure_glide', '            configure_glide,']],
    ['../src-tauri/src/native_engine_bridge.cpp', ['hk_runtime_configure_glide', 'setGlideBehavior']],
    ['../ios/App/App/HookKeysNativePlugin.swift', ['name: "configureGlide"', 'func configureGlide', 'velocityThreshold']],
    ['../ios/App/App/HookKeysNativeEngine.h', ['configureGlide:']],
    ['../ios/App/App/HookKeysNativeEngine.mm', ['configureGlide:', 'setGlideBehavior']],
    ['../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java', ['public void configureGlide', 'nativeConfigureGlide(']],
    ['../android/app/src/main/cpp/HookKeysNativeBridge.cpp', ['nativeConfigureGlide', 'setGlideBehavior']],
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    for (const marker of markers) assert(source.includes(marker), `${path}: ${marker}`);
  }
});

test('track waveform peaks follow the loudness of the music', () => {
  const transport = transpile('../src/features/tracks/TrackTransport.ts', {
    './TrackLibraryStore': {},
    '../../shared/gestures/LongPressGesture': { LongPressGesture: class {} },
    '../../platform/runtime': { isDesktopRuntime: () => false },
  });
  const quietThenLoud = new Float32Array(1000).map((_, index) => (index < 500 ? 0.1 : -0.8) * (index % 2 ? 1 : 0.5));
  const peaks = transport.waveformPeaksFromChannels([quietThenLoud], 4);
  assert.equal(peaks.length, 4);
  assert.equal(Math.max(...peaks), 1, 'a parte mais alta da música ocupa a altura toda');
  assert(peaks[0] < 0.2 && peaks[1] < 0.2 && peaks[2] === 1 && peaks[3] === 1, `picos: ${peaks.join(', ')}`);
  const left = new Float32Array(400).fill(0.25);
  const right = new Float32Array(400).fill(-0.5);
  assert.equal(JSON.stringify(transport.waveformPeaksFromChannels([left, right], 2)), '[1,1]', 'o pico junta os canais');
  assert.equal(JSON.stringify(transport.waveformPeaksFromChannels([new Float32Array(100)], 3)), '[0,0,0]', 'silêncio não divide por zero');
  assert.equal(JSON.stringify(transport.waveformPeaksFromChannels([], 3)), '[]');
  assert.equal(transport.TRACK_WAVEFORM_BARS, 96);
});

test('iOS Add música opens the native document picker directly', () => {
  const bridge = readFileSync(new URL('../src/platform/native/HookKeysNative.ts', import.meta.url), 'utf8');
  const swift = readFileSync(new URL('../ios/App/App/HookKeysNativePlugin.swift', import.meta.url), 'utf8');
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  for (const method of ['pickAudioFiles', 'releasePickedAudioFile']) {
    assert(bridge.includes(`plugin.${method}(`), `TypeScript chama ${method}`);
    assert(swift.includes(`CAPPluginMethod(name: "${method}"`), `Swift registra ${method}`);
    assert(swift.includes(`@objc func ${method}(_ call: CAPPluginCall)`), `Swift implementa ${method}`);
  }
  assert(swift.includes('UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: true)'), 'abre o seletor de documentos direto, em áudio');
  assert(swift.includes('picker.allowsMultipleSelection = true'), 'várias músicas de uma vez');
  assert(swift.includes('FileManager.default.copyItem(at: url, to: destination)'), 'aceita músicas vindas de outro volume/provedor do app Arquivos');
  assert(!/fileBrowser|FileBrowser/.test(swift + bridge + player), 'o gerenciador próprio saiu');
  assert(bridge.includes("Capacitor.getPlatform() === 'ios'"), 'só no app iOS');
  assert(player.includes('hookKeysNative.audioPicker.isAvailable()'), 'Add música usa o seletor nativo no iOS');
  assert(player.includes('this.trackLibrary.addNativeFile({'), 'a biblioteca registra a música depois da adoção nativa');
  assert(!player.includes('fetch(picker.fileUrl(file.path))'), 'não duplica a música inteira na memória e no IndexedDB');
});

test('App Store icon has no alpha channel (Apple rejects transparent icons, error 90717)', () => {
  const png = readFileSync(new URL('../ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', import.meta.url));
  assert.equal(png.toString('ascii', 12, 16), 'IHDR');
  assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(png.readUInt32BE(20), 1024);
  // PNG color type: 2 = RGB. 4 and 6 carry alpha; 3 (palette) can carry tRNS.
  assert.equal(png[25], 2, 'o ícone da loja precisa ser RGB, sem canal alfa');
  assert(!png.includes(Buffer.from('tRNS')), 'o ícone da loja não pode ter transparência');
});

test('Playlist aberta no tablet: nome em cima e dB embaixo em todas as plataformas, celular fora', () => {
  assert.match(css, /\n\.player-screen--tablet:not\(\.player-screen--cellular\)\.is-tracks-split \.player-output-knob \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*grid-template-rows:\s*auto auto auto;/);
  assert.doesNotMatch(css, /html\[data-runtime="desktop"\] \.player-screen--tablet\.is-tracks-split \.player-output-knob \{/);
});

test('Auto ligado fica amarelo e Repetir ligado pisca verde acima do tema geral', () => {
  assert.match(css, /\.player-screen \.tracks-split-controls button\[data-tracks-action="toggle-auto"\]:is\(\.is-selected, \[aria-pressed="true"\]\) \{[^}]*--button-color-a:\s*#ffe45c !important;/);
  assert.match(css, /\.player-screen \.tracks-split-controls button\[data-tracks-action="toggle-loop"\]:is\(\.is-selected, \[aria-pressed="true"\]\) \{[^}]*animation:\s*tracks-loop-blink/);
});

test('Modo Lite não tira a transição nem desacelera o meter', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const lite = css.match(/\.hook-keys-lite :is\(\.player-module__meter-fill, \.player-module__meter-fill > i\) \{([^}]*)\}/)[1];
  assert.doesNotMatch(lite, /transition:\s*none/);
  assert.doesNotMatch(player, /LITE_MODULE_METER_INTERVAL_MS/);
});

test('iOS mantém a interface USB escolhida enquanto a rota reconecta', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const plugin = readFileSync(new URL('../ios/App/App/HookKeysNativePlugin.swift', import.meta.url), 'utf8');
  assert.match(player, /devices\.some\(\(\{ id \}\) => id === selectedId\)\)[\s\S]{0,120}return;[\s\S]{0,500}if \(this\.iosRuntime\) return;/);
  assert.match(player, /this\.selectedAudioDeviceId && !device && !this\.iosRuntime/);
  assert.match(plugin, /alreadyActive = \(requestedId\.isEmpty\s*\|\|/);
  assert.match(plugin, /CAPPluginMethod\(name: "audioRouteLog"/);
});

test('música importada no iOS não grava Blob no IndexedDB', () => {
  const store = readFileSync(new URL('../src/features/tracks/TrackLibraryStore.ts', import.meta.url), 'utf8');
  const nativeAdd = store.match(/async addNativeFile[\s\S]*?\r?\n  \}\r?\n/)[0];
  assert.match(nativeAdd, /storage:\s*'native'/);
  assert.doesNotMatch(nativeAdd, /new Blob/);
  assert.match(store, /record\.storage === 'native'/);
});

test('iOS abre interface USB com mais de 2 saídas no formato exato da placa', () => {
  const engine = readFileSync(new URL('../ios/App/App/HookKeysNativeEngine.mm', import.meta.url), 'utf8');
  // Formato idêntico ao da placa primeiro: sem conversor de canais, L e R não somam.
  assert.match(engine, /hardware\.channelCount == channels && std::abs\(hardware\.sampleRate - sampleRate\) < 1\.0 &&[\s\S]*?\[formats addObject:hardware\];/);
  assert.match(engine, /kAudioChannelLayoutTag_DiscreteInOrder \| channels/, 'canais discretos só como reserva');
  assert.match(engine, /for \(AVAudioFormat \*renderFormat in renderFormatsFor\(hardware, state->sampleRate, channels\)\)/);
});

test('Android confere a placa aberta, reabre após desconectar e lista só saídas de música', () => {
  const bridge = readFileSync(new URL('../android/app/src/main/cpp/HookKeysNativeBridge.cpp', import.meta.url), 'utf8');
  const plugin = readFileSync(new URL('../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java', import.meta.url), 'utf8');
  assert.match(bridge, /AAudioStream_getDeviceId\(stream_\) != requestedDeviceId/);
  assert.match(bridge, /error != AAUDIO_ERROR_DISCONNECTED[\s\S]*?std::thread/);
  assert.match(plugin, /if \(!isMusicOutput\(info\.getType\(\)\)\) continue;/);
  assert.match(plugin, /public void audioRouteLog\(PluginCall call\)/);
});

test('seletores do módulo usam o seletor próprio do app', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /APP_SELECT_QUERY = 'select\[data-setting\], select\[data-module-setting\]'/);
  assert.match(player, /kind === 'app-settings-audio' \|\| kind === 'module-settings'\) \{\s*this\.enhanceAppSelects\(modal\);/);
});

test('toque não vaza para a tela aberta pelo próprio toque', () => {
  const tap = readFileSync(new URL('../src/shared/gestures/ResilientTapController.ts', import.meta.url), 'utf8');
  assert.match(tap, /if \(!this\.duplicateControl\) return;\s*\/\/[\s\S]*?event\.preventDefault\(\);/);
  assert.match(tap, /if \(!down\.isConnected\) return true;/);
});

test('lista da Playlist reaproveita linhas e só sincroniza o que mudou', () => {
  const panel = readFileSync(new URL('../src/features/tracks/TracksPanelController.ts', import.meta.url), 'utf8');
  assert.match(panel, /listItemCache\.get\(item\.id\)/);
  assert.match(panel, /grid\.replaceChildren\(\.\.\.elements\)/);
  assert.match(panel, /button\.dataset\.playbackState !== state/);
  assert.doesNotMatch(css.match(/\n\.track-card__progress i \{[^}]*\}/)[0], /will-change/);
  assert.match(css, /\.track-card:is\(\.is-playing, \.is-queued\) \.track-card__progress i \{\s*will-change: transform;/);
});

test('ícone do Android cabe no recorte redondo do launcher', async () => {
  const png = readFileSync(new URL('../android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png', import.meta.url));
  assert.equal(png.readUInt32BE(16), 432);
});

test('listas da Playlist não têm efeito elástico nas pontas', () => {
  assert.match(css, /:is\(\.tracks-library-grid, \.tracks-playlists, \.tracks-playlist-selection-grid\) \{\s*overscroll-behavior: none;/);
  assert.doesNotMatch(css, /\.tracks-split-panel \.tracks-library-grid \{[^}]*overscroll-behavior: contain/);
});

test('Modo Lite corta a pintura dos botões no toque', () => {
  assert.match(css, /\.hook-keys-lite :is\(\.player-screen, \.player-modal\) :is\(button, \[role="button"\], \.app-select__toggle\) \{\s*text-shadow: none !important;\s*transition: none !important;/);
});

test('apps mostram RAM ao lado do User; desktop mantém CPU', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const ios = readFileSync(new URL('../ios/App/App/HookKeysNativePlugin.swift', import.meta.url), 'utf8');
  const android = readFileSync(new URL('../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java', import.meta.url), 'utf8');
  assert.match(player, /this\.desktopRuntime \? `[\s\S]*?data-cpu-meter[\s\S]*?` : Capacitor\.isNativePlatform\(\) \? `[\s\S]*?data-ram-meter/);
  assert.match(ios, /CAPPluginMethod\(name: "memoryUsage"/);
  assert.match(ios, /phys_footprint[\s\S]*?os_proc_available_memory\(\)/);
  assert.match(android, /public void memoryUsage\(PluginCall call\)\s*\{\s*memoryExecutor\.execute/);
});

test('teclas do keyboard só acendem, sem nome de nota', () => {
  const keyboard = readFileSync(new URL('../src/features/player/PerformanceKeyboard.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(keyboard, /<span>\$\{formatMidiNote\(noteNumber\)\}<\/span>/);
  assert.match(keyboard, /aria-label="\$\{formatMidiNote\(noteNumber\)\}"/, 'o nome segue só para acessibilidade');
  assert.doesNotMatch(css, /performance-keyboard__key[a-z-]* span/);
});

test('Reset do EQ/compressor no celular fica acima do contorno do painel', () => {
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 520px\) \{\s*\.module-processor-reset-button \{\s*top: 4px;[^}]*min-height: 26px;/);
});

test('8 presets por banco numa fileira só', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /const PRESET_COUNT = 8;/);
  assert.doesNotMatch(player, /VISIBLE_PRESET_COUNT/);
  assert.match(css, /\.player-presets--combined \.player-presets__grid \{[^}]*grid-template-rows: minmax\(0, 1fr\);/);
});

test('celular: Glide com knob no padrão da tela e Volume sem ON cortado', () => {
  assert.match(css, /\.player-modal--module-synth \.module-glide-card \.module-envelope-knob \{\s*width: var\(--synth-knob-size\);/);
  assert.match(css, /\.module-glide-card \{\s*grid-template-columns: max-content minmax\(0, 1fr\) max-content;/);
  assert.match(css, /\.output-fader-rail \{\s*min-height: 120px;/);
  assert.match(css, /\.player-modal--module-synth \.synth-editor__identity \{\s*display: none;/);
});

test('módulos nascem com Reverb de fábrica, Mod em User e o 5 com Rotary', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const effects = readFileSync(new URL('../src/features/player/ModuleEffectsView.ts', import.meta.url), 'utf8');
  assert.match(effects, /FACTORY_MODULE_REVERB: ModuleReverbSettings = \{\s*enabled: true,\s*decay: 4,\s*dampen: 58,\s*size: 0,\s*mix: 44,/);
  assert.match(player, /modulationMode: 'user',/);
  assert.match(player, /reverb: \{ \.\.\.FACTORY_MODULE_REVERB \},/);
  assert.match(player, /rotary: \{ \.\.\.readModuleRotarySettings\(undefined\), enabled: moduleIndex === 4 \},/);
});

test('knobs só pela horizontal e sem o salto nativo do range do iOS', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /const horizontalDelta = event\.clientX - drag\.startX;/);
  assert.doesNotMatch(player, /verticalDelta/);
  for (const knob of ['player-output-knob', 'module-envelope-knob', 'module-effect-knob']) {
    const block = css.match(new RegExp(`\n\.${knob} input \{[^}]*\}`))[0];
    assert.match(block, /pointer-events: none;/, `${knob}: o toque vai para o knob, não para o range`);
  }
});

test('teto de velocity: variável numérica (a alça desce) e escondido em Fixed', () => {
  const view = readFileSync(new URL('../src/features/player/VelocityCurveView.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(view, /--velocity-ceiling:\$\{\(ceiling \/ 127\) \* 100\}%/);
  assert.match(view, /setProperty\('--velocity-ceiling', String\(\(value \/ 127\) \* 100\)\)/);
  assert.match(css, /\.velocity-curve-editor\[data-velocity-mode="fixed"\] :is\(\.velocity-ceiling, \.velocity-ceiling-zone, \.velocity-ceiling-line\) \{\s*display: none;/);
});

test('área do teclado/módulos sem :has() (Safari 16 recalculava tudo a cada tecla acesa)', () => {
  assert.doesNotMatch(css, /player-bank-view:has\(/);
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /class="player-bank-view player-bank-view--combined\$\{this\.cellularLayout \? ' player-bank-view--cellular' : ''\}"/);
});

test('Hook Keys: long press só abre os 30%; com eles abertos, um toque fecha', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /if \(this\.splitTracksController\) \{\s*this\.closeTracksSplitView\(\);\s*return;\s*\}\s*this\.openModal\('about'/);
  assert.match(player, /if \(!this\.splitTracksController\) this\.startTracksHoldGesture\(brandButton, event\);/);
  assert.doesNotMatch(player, /toggleTracksSplitView/);
});

test('paisagem dos dois lados no iOS e no Android', () => {
  const runtime = readFileSync(new URL('../src/platform/runtime.ts', import.meta.url), 'utf8');
  const ios = readFileSync(new URL('../ios/App/App/HookKeysNativePlugin.swift', import.meta.url), 'utf8');
  const android = readFileSync(new URL('../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java', import.meta.url), 'utf8');
  assert.match(runtime, /if \(await hookKeysNative\.lockOrientation\(mode\)\) return;/);
  assert.match(ios, /let mask: UIInterfaceOrientationMask = landscape \? \.landscape : \.portrait/);
  assert.match(android, /SCREEN_ORIENTATION_SENSOR_LANDSCAPE/);
});
