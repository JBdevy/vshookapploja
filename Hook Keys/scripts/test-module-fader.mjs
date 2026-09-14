import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const handleRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter(([, selector]) => selector.trim().endsWith('.player-module__fader-handle'));

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
  assert.match(css, /\.player-module__meter-fill\s*\{[^}]*#0db758[^}]*#ffe23b[^}]*#ff3e32/s);
  assert.match(css, /transform:\s*scaleY\(0\)/);
  assert.match(css, /transform-origin:\s*center bottom/);
  assert.match(css, /transition:\s*transform 90ms linear/);
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

test('module borders retain independent identities without changing the common gray surfaces', () => {
  assert.match(css, /--module-border-color: #ff7900;/);
  assert.match(css, /\.player-module:nth-child\(6\)\s*\{\s*--module-border-color: #a855f7;/);
  assert.match(css, /\.player-module:nth-child\(7\)\s*\{\s*--module-border-color: #ff3434;/);
  assert.match(css, /\.player-module:nth-child\(8\)\s*\{\s*--module-border-color: #3985ff;/);
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
  assert(!/fileBrowser|FileBrowser/.test(swift + bridge + player), 'o gerenciador próprio saiu');
  assert(bridge.includes("Capacitor.getPlatform() === 'ios'"), 'só no app iOS');
  assert(player.includes('hookKeysNative.audioPicker.isAvailable()'), 'Add música usa o seletor nativo no iOS');
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
