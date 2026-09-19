import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { Window } from 'happy-dom';

function load(path, modules = {}, globals = {}) {
  const context = { exports: {}, ...globals, require(specifier) {
    assert(specifier in modules, `Unexpected import: ${specifier}`);
    return modules[specifier];
  } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports;
}

const effects = load('../src/features/player/ModuleEffectsView.ts', {
  './ParameterKnobView': load('../src/features/player/ParameterKnobView.ts'),
});
const glide = load('../src/features/player/GlideView.ts', {
  './ParameterKnobView': load('../src/features/player/ParameterKnobView.ts'),
});

function loadPlayerHandlers(names, globals = {}) {
  const source = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('PlayerScreen.ts', source, ts.ScriptTarget.Latest, true);
  const player = ast.statements.find((node) => ts.isClassDeclaration(node) && node.name?.text === 'PlayerScreen');
  const methods = names.map((name) => {
    const method = player.members.find((node) => ts.isMethodDeclaration(node) && node.name?.getText(ast) === name);
    assert(method, `Missing real handler: ${name}`);
    return method.getText(ast);
  }).join('\n');
  const helpers = ['isModuleEffectKind', 'isCcMappingKey', 'ccMappingKey'].map((name) => (
    ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(ast)
  )).join('\n');
  const context = { exports: {}, ...effects, ...globals };
  vm.runInNewContext(ts.transpileModule(`${helpers}\nexport class Handlers { ${methods} }\nexport { isCcMappingKey };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports;
}
test('Rotary and Chorus stack below Compressor, and the compressor has no preview anywhere', () => {
  const shortcuts = effects.createModuleEffectCardsMarkup({}, 120, 'rotary');
  assert.match(shortcuts, /module-effect-card--processor-shortcuts/);
  assert.match(shortcuts, /open-compressor">Compressor<\/button>\s*<button[^>]*open-rotary">Rotary<\/button>/);
  assert.doesNotMatch(shortcuts, /module-compressor-preview/);
  // Módulos 1 a 4: o Chorus toma o lugar que o Rotary tem no 5.
  const chorus = effects.createModuleEffectCardsMarkup({}, 120, 'compressor');
  assert.doesNotMatch(chorus, /module-compressor-preview/);
  assert.match(chorus, /open-compressor">Compressor<\/button>\s*<button[^>]*open-chorus">Chorus<\/button>/);
  assert.equal(effects.readModuleChorusSettings(undefined).enabled, false, 'o Chorus nasce desligado');
  assert.equal(effects.readModuleChorusSettings({ enabled: true, rateHz: 99 }).rateHz, 8, 'Rate vai até 8 Hz');
  const settings = load('../src/features/player/ModuleSettingsView.ts', {
    './ModuleEffectsView': effects,
  './PatternModulesView': { createArpeggiatorMarkup: () => '', readArpeggiatorSettings: () => ({ enabled: false }) },
  './TranceGateView': { createTranceGateMarkup: () => '', readTranceGateSettings: () => ({ enabled: false }) },
    './ParameterKnobView': load('../src/features/player/ParameterKnobView.ts'),
    './GlideView': glide,
    '../audio/AudioOutputService': { createAudioRouteOptions: () => '' },
    './VelocityCurveView': { createVelocityCardMarkup: () => '', readVelocityLimit: () => 127 },
  });
  assert.match(settings.createModuleSettingsMarkup([], [], null, {}, 120, 2, 'stereo:0', 'rotary'), /toggle-voice-mode/);
  // Módulos 1-4 (compressor/chorus), 5 (rotary), 6 (arpeggiator) e 7 (Trance Gate).
  for (const processor of ['compressor', 'rotary', 'arpeggiator', 'trance-gate']) {
    const markup = settings.createModuleSettingsMarkup([], [], null, {}, 120, 2, 'stereo:0', processor);
    assert.match(markup, /class="module-settings-panel module-settings-panel--voice-switch"/);
    assert.match(markup, /module-settings-io-row[\s\S]*?module-polyphony-button[\s\S]*?module-voice-mode-button/);
  }
  assert.doesNotMatch(settings.createModuleSettingsMarkup([], [], null, {}, 120, 2, 'stereo:0', 'synth'), /toggle-voice-mode/,
    'o Synth troca Poly/Mono no próprio editor');
});

test('Rotary defaults to OFF/Slow, validates ranges and preserves presets/backups', () => {
  assert.equal(effects.readModuleRotarySettings(undefined).enabled, false);
  assert.equal(effects.readModuleRotarySettings(undefined).speed, 'slow');
  assert.equal(effects.readModuleRotarySettings(undefined).modulationEnabled, false);
  const stored = effects.readModuleRotarySettings({ enabled: true, modulationEnabled: true, speed: 'fast', slowHz: 1.5, fastHz: 8, rampSeconds: 3, depth: 55, mix: 80 });
  assert.deepEqual({ ...effects.readModuleEffectSettings('rotary', JSON.parse(JSON.stringify(stored))) }, { ...stored });
  const invalid = effects.readModuleRotarySettings({ speed: 'bad', slowHz: -9, fastHz: 99, rampSeconds: 99, depth: -1, mix: 200 });
  assert.deepEqual({ ...invalid }, { enabled: false, modulationEnabled: false, speed: 'slow', slowHz: .2, fastHz: 10, rampSeconds: 10, depth: 0, mix: 100 });
  const markup = effects.createModuleRotaryMarkup({ rotary: stored });
  // O Mix saiu: a caixa toca sempre inteira, em 100%.
  assert.equal([...markup.matchAll(/data-module-effect-control=/g)].length, 4);
  assert.doesNotMatch(markup, /data-module-effect-control="mix"/);
  assert.equal(effects.readModuleRotarySettings({ mix: 30 }).mix, 100);
  assert.match(markup, /data-module-rotary-speed="fast" class="is-selected" aria-pressed="true"/);
  assert.match(markup, /module-effect-knob__face/);
  assert.match(markup, /module-rotary-modulation is-on" data-module-rotary-modulation aria-pressed="true">Modulation On/);
  assert.match(effects.createModuleRotaryMarkup({}), /module-rotary-modulation is-off" data-module-rotary-modulation aria-pressed="false">Modulation Off/);
  assert.equal(effects.formatModuleEffectValue('rotary', 'fastHz', 6.4), '6.40 Hz');
  assert.equal(effects.formatModuleEffectValue('rotary', 'rampSeconds', 1.2), '1.2 s');
});

test('real Rotary handlers update module 5, retain parameters through ON/OFF and reset to OFF', () => {
  const source = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('PlayerScreen.ts', source, ts.ScriptTarget.Latest, true);
  const player = ast.statements.find((node) => ts.isClassDeclaration(node) && node.name?.text === 'PlayerScreen');
  const names = ['selectModuleRotarySpeed', 'setModuleRotarySpeed', 'updateModuleEffectControl', 'toggleModuleEffectPower', 'confirmProcessorReset'];
  const methods = names.map((name) => {
    const method = player.members.find((node) => ts.isMethodDeclaration(node) && node.name?.getText(ast) === name);
    assert(method, `Missing real handler: ${name}`);
    return method.getText(ast);
  }).join('\n');
  const guard = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'isModuleEffectKind');
  const context = { exports: {}, ...effects };
  vm.runInNewContext(ts.transpileModule(`${guard.getText(ast)}\nexport class Handlers { ${methods} }`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  const screen = new context.exports.Handlers();
  const modules = Array.from({ length: 8 }, () => ({ settings: {} }));
  const buttons = ['brake', 'slow', 'fast'].map((speed) => ({
    dataset: { moduleRotarySpeed: speed }, selected: false, pressed: false,
    classList: { toggle(_name, value) { this.value = value; } },
    setAttribute(_name, value) { this.pressed = value; },
  }));
  const modal = { querySelectorAll: () => buttons };
  let changes = 0;
  Object.assign(screen, { getActivePresetState: () => ({ modules }), markPlayerStateChanged: () => changes++, root: {}, setStatus() {}, openModal(kind, number) { this.opened = [kind, number]; }, syncNativeEngine: async () => {}, currentModalKind: 'module-rotary' });
  screen.selectModuleRotarySpeed(modal, buttons[2]);
  assert.equal(modules[6].settings.rotary.speed, 'fast');
  assert.deepEqual(buttons.map((button) => button.pressed), ['false', 'false', 'true']);
  const output = { value: '' };
  const properties = new Map();
  const knob = { style: { setProperty: (name, value) => properties.set(name, value) }, querySelector: () => output };
  const input = { dataset: { moduleEffectKind: 'rotary', moduleEffectControl: 'fastHz' }, value: '8', min: '2', max: '10', closest: () => knob, setAttribute() {} };
  screen.updateModuleEffectControl(modal, input, 5);
  assert.equal(modules[4].settings.rotary.fastHz, 8);
  assert.equal(properties.get('--knob-progress'), '0.75');
  assert.equal(output.value, '8.00 Hz');
  const power = { dataset: { moduleEffectPower: 'rotary' }, classList: { toggle() {} }, setAttribute() {}, closest: () => null };
  screen.toggleModuleEffectPower(power, 5);
  assert.equal(power.textContent, 'ON');
  screen.toggleModuleEffectPower(power, 5);
  assert.equal(power.textContent, 'OFF');
  assert.equal(modules[4].settings.rotary.fastHz, 8);
  // O Reset devolve a página ao Default daquele timbre.
  screen.defaultSettingsForModule = () => ({ rotary: effects.readModuleRotarySettings(undefined) });
  screen.confirmProcessorReset(5, 'rotary');
  assert.deepEqual(screen.opened, ['module-rotary', 5]);
  assert.deepEqual({ ...modules[4].settings.rotary }, { ...effects.readModuleRotarySettings(undefined) });
  assert.equal(changes, 5);
  assert.deepEqual(modules[3].settings, {});
});

test('clicking Room, Hall or Stage replaces the reverb page instead of nesting a new one', () => {
  const names = ['selectReverbSpace'];
  const source = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('PlayerScreen.ts', source, ts.ScriptTarget.Latest, true);
  const player = ast.statements.find((node) => ts.isClassDeclaration(node) && node.name?.text === 'PlayerScreen');
  const methods = names.map((name) => {
    const method = player.members.find((node) => ts.isMethodDeclaration(node) && node.name?.getText(ast) === name);
    assert(method, `Missing real handler: ${name}`);
    return method.getText(ast);
  }).join('\n');
  const context = { exports: {}, ...effects };
  vm.runInNewContext(ts.transpileModule(`export class Handlers { ${methods} }`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  const screen = new context.exports.Handlers();
  const window = new Window({ settings: { enableJavaScriptEvaluation: true } });
  const modal = window.document.createElement('div');
  modal.innerHTML = effects.createModuleReverbMarkup({});
  window.document.body.appendChild(modal);
  const moduleState = { settings: {} };
  Object.assign(screen, {
    getActivePresetState: () => ({ modules: [moduleState] }),
    markPlayerStateChanged: () => {},
    syncNativeEngine: async () => {},
  });
  for (let click = 0; click < 3; click += 1) {
    screen.selectReverbSpace(modal, 1, 'hall');
    assert.equal(modal.querySelectorAll('.module-reverb-page').length, 1,
      `still a single reverb page after click ${click + 1}`);
    assert.equal(modal.querySelectorAll('.module-reverb-spaces button').length, 3,
      `still exactly Room/Hall/Stage after click ${click + 1}, not multiplying`);
  }
  window.close();
});

test('Modulation toggle persists; CC 1 updates the correct module only at Slow/Fast crossings; mapped buttons use press edges', () => {
  const { Handlers, isCcMappingKey } = loadPlayerHandlers([
    'toggleRotaryModulation', 'receiveRotaryModulation', 'setModuleRotarySpeed', 'mappedCcRatio', 'handleMidiControlChange',
  ]);
  const screen = new Handlers();
  const modules = Array.from({ length: 8 }, () => ({ enabled: true, modulationInputEnabled: true, midiInputId: 'midi-1', settings: {} }));
  const power = { classes: new Map(), classList: { toggle(name, value) { power.classes.set(name, value); } }, setAttribute(name, value) { this[name] = value; } };
  const speeds = ['brake', 'slow', 'fast'].map((speed) => ({ dataset: { moduleRotarySpeed: speed }, classList: { toggle() {} }, setAttribute(name, value) { this[name] = value; } }));
  let changes = 0;
  Object.assign(screen, {
    modal: { querySelector: () => power, querySelectorAll: () => speeds }, currentModalKind: 'module-rotary',
    liveMidiEnabled: true,
    rotaryModulationValues: new Map(), lastRotaryModulationValue: 0, lastCcValues: new Map(), ccMappings: new Map(),
    ccMappingOptions: new Map(),
    getActivePresetState: () => ({ modules }), markPlayerStateChanged: () => changes++,
  });
  screen.receiveRotaryModulation(127, 'midi-1');
  assert.equal(changes, 0, 'Modulation OFF never changes manual speed');
  screen.toggleRotaryModulation();
  assert.equal(power.textContent, 'Modulation On');
  assert.equal(power.classes.get('is-on'), true);
  assert.equal(power.classes.get('is-off'), false);
  assert.equal(modules[6].settings.rotary.speed, 'fast', 'enabling uses the last selected MIDI Mod value');
  assert.equal(JSON.parse(JSON.stringify(modules[6].settings)).rotary.modulationEnabled, true);
  screen.handleMidiControlChange({ controller: 1, value: 0, inputId: 'other-midi' });
  assert.equal(modules[6].settings.rotary.speed, 'fast', 'different assigned device cannot alter Rotary');
  screen.handleMidiControlChange({ controller: 1, value: 63, inputId: 'midi-1' });
  assert.equal(modules[6].settings.rotary.speed, 'slow');
  const before = changes;
  screen.handleMidiControlChange({ controller: 1, value: 20, inputId: 'midi-1' });
  assert.equal(changes, before, 'continuous Mod movement does not resync/persist the whole player');
  screen.handleMidiControlChange({ controller: 1, value: 64, inputId: 'midi-1' });
  assert.equal(modules[6].settings.rotary.speed, 'fast');
  assert.deepEqual(speeds.map((button) => button['aria-pressed']), ['false', 'false', 'true']);
  screen.handleMidiControlChange({ controller: 1, value: 0, inputId: null });
  assert.equal(modules[6].settings.rotary.speed, 'slow', 'virtual keyboard Mod broadcast controls Rotary');
  screen.toggleRotaryModulation();
  assert.equal(power.textContent, 'Modulation Off');
  assert.equal(power.classes.get('is-on'), false);
  assert.equal(power.classes.get('is-off'), true);
  screen.handleMidiControlChange({ controller: 1, value: 127, inputId: 'midi-1' });
  assert.equal(modules[6].settings.rotary.speed, 'slow');
  for (const [index, speed] of ['brake', 'fast', 'slow'].entries()) {
    const key = `module-control:7:rotary:speed:${speed}`;
    assert(isCcMappingKey(key), `${key} survives saved state / backup validation`);
    screen.ccMappings.set(key, 20 + index);
    screen.handleMidiControlChange({ controller: 20 + index, value: 127, inputId: 'midi-1' });
    assert.equal(modules[6].settings.rotary.speed, speed);
    const pressedChanges = changes;
    screen.handleMidiControlChange({ controller: 20 + index, value: 0, inputId: 'midi-1' });
    assert.equal(modules[6].settings.rotary.speed, speed);
    assert.equal(changes, pressedChanges, 'releasing the mapped MIDI button never reverses the selection');
  }
  assert(isCcMappingKey('module-control:7:rotary:depth'));
  assert(!isCcMappingKey('module-control:7:rotary:speed:invalid'));
  assert(!isCcMappingKey('module-control:4:rotary:speed:slow'));
});

test('Rotary Learn uses two-second touch hold with movement cancellation and desktop right-click', () => {
  let time = 0;
  let nextTimer = 0;
  const timers = new Map();
  const window = {
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, at: time + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const advance = (ms) => {
    time += ms;
    for (const [id, timer] of [...timers]) if (timer.at <= time) { timers.delete(id); timer.callback(); }
  };
  class Element { closest() { return null; } }
  const button = new Element();
  button.dataset = { moduleRotarySpeed: 'slow' };
  button.closest = (selector) => selector === '[data-module-rotary-speed]' ? button : null;
  const { LongPressGesture } = load('../src/shared/gestures/LongPressGesture.ts', {}, { window });
  const { Handlers } = loadPlayerHandlers(['ccLearnTargetForRotarySpeed', 'startRotarySpeedLearn', 'onRootContextMenu'], { window, Element });
  const screen = new Handlers();
  const learned = [];
  Object.assign(screen, {
    currentModalKind: 'module-rotary', currentModalModuleNumber: 7, desktopRuntime: false,
    knobInputForTarget: () => null,
    knobCcLearnGesture: new LongPressGesture(2000, 8), openCcLearn: (target) => learned.push(target.control),
  });
  const event = { isPrimary: true, pointerType: 'touch', pointerId: 1, clientX: 0, clientY: 0 };
  const target = screen.ccLearnTargetForRotarySpeed(button);
  screen.startRotarySpeedLearn(event, button, target);
  advance(1999);
  assert.deepEqual(learned, []);
  advance(1);
  assert.deepEqual(learned, ['rotary:speed:slow']);
  assert.equal(screen.suppressNextCcControlClick, button);
  screen.startRotarySpeedLearn(event, button, target);
  screen.knobCcLearnGesture.move({ ...event, clientX: 9 });
  advance(2000);
  assert.equal(learned.length, 1, 'moving cancels Learn');
  screen.startRotarySpeedLearn(event, button, target);
  screen.knobCcLearnGesture.end(event);
  advance(2000);
  assert.equal(learned.length, 1, 'releasing early cancels Learn');
  screen.desktopRuntime = true;
  screen.startRotarySpeedLearn({ ...event, pointerType: 'mouse', button: 0 }, button, target);
  advance(2000);
  assert.equal(learned.length, 1, 'desktop left hold does not Learn');
  let prevented = false;
  screen.onRootContextMenu({ target: button, preventDefault() { prevented = true; } });
  assert.equal(prevented, true, 'native context menu is suppressed');
  assert.deepEqual(learned, ['rotary:speed:slow', 'rotary:speed:slow']);
});

test('all native bridges forward Rotary modulation enablement', () => {
  for (const path of [
    '../src/platform/native/HookKeysNative.ts', '../src/features/player/PlayerScreen.ts',
    '../src-tauri/src/native_engine_bridge.cpp', '../android/app/src/main/cpp/HookKeysNativeBridge.cpp',
    '../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java',
    '../ios/App/App/HookKeysNativeEngine.h', '../ios/App/App/HookKeysNativeEngine.mm', '../ios/App/App/HookKeysNativePlugin.swift',
  ]) assert(readFileSync(new URL(path, import.meta.url), 'utf8').includes('rotaryModulationEnabled'), path);
  assert(readFileSync(new URL('../src-tauri/src/main.rs', import.meta.url), 'utf8').includes('rotary_modulation_enabled'));
});

test('all native bridges forward the Cutoff filter type and envelope', () => {
  for (const path of [
    '../src/platform/native/HookKeysNative.ts', '../src/features/player/PlayerScreen.ts',
    '../src-tauri/src/native_engine_bridge.cpp', '../android/app/src/main/cpp/HookKeysNativeBridge.cpp',
    '../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java',
    '../ios/App/App/HookKeysNativeEngine.h', '../ios/App/App/HookKeysNativeEngine.mm', '../ios/App/App/HookKeysNativePlugin.swift',
  ]) {
    const content = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert(content.includes('cutoffFilterType'), `${path} missing cutoffFilterType`);
    assert(content.includes('cutoffEnvelopeEnabled'), `${path} missing cutoffEnvelopeEnabled`);
    assert(content.includes('cutoffEnvelopeDepthOctaves'), `${path} missing cutoffEnvelopeDepthOctaves`);
  }
  const rust = readFileSync(new URL('../src-tauri/src/main.rs', import.meta.url), 'utf8');
  assert(rust.includes('cutoff_filter_type'));
  assert(rust.includes('cutoff_envelope_depth_octaves'));
});

test('all native bridges forward the Reverb Mod knob', () => {
  for (const path of [
    '../src/platform/native/HookKeysNative.ts', '../src/features/player/PlayerScreen.ts',
    '../src-tauri/src/native_engine_bridge.cpp', '../android/app/src/main/cpp/HookKeysNativeBridge.cpp',
    '../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java',
    '../ios/App/App/HookKeysNativeEngine.h', '../ios/App/App/HookKeysNativeEngine.mm', '../ios/App/App/HookKeysNativePlugin.swift',
  ]) assert(readFileSync(new URL(path, import.meta.url), 'utf8').includes('reverbMod'), path);
  assert(readFileSync(new URL('../src-tauri/src/main.rs', import.meta.url), 'utf8').includes('reverb_mod'));
});

test('all native bridges forward No Sens (velocity does not drive the amp envelope)', () => {
  for (const path of [
    '../src/platform/native/HookKeysNative.ts', '../src/features/player/PlayerScreen.ts',
    '../src-tauri/src/native_engine_bridge.cpp', '../android/app/src/main/cpp/HookKeysNativeBridge.cpp',
    '../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java',
    '../ios/App/App/HookKeysNativeEngine.h', '../ios/App/App/HookKeysNativeEngine.mm', '../ios/App/App/HookKeysNativePlugin.swift',
  ]) assert(readFileSync(new URL(path, import.meta.url), 'utf8').includes('noVelocitySensitivity'), path);
  assert(readFileSync(new URL('../src-tauri/src/main.rs', import.meta.url), 'utf8').includes('no_velocity_sensitivity'));
});

test('all native bridges forward Mono and Legato', () => {
  for (const path of [
    '../src/platform/native/HookKeysNative.ts', '../src/features/player/PlayerScreen.ts',
    '../src-tauri/src/native_engine_bridge.cpp', '../android/app/src/main/cpp/HookKeysNativeBridge.cpp',
    '../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java',
    '../ios/App/App/HookKeysNativeEngine.h', '../ios/App/App/HookKeysNativeEngine.mm', '../ios/App/App/HookKeysNativePlugin.swift',
  ]) {
    const content = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert(content.includes('mono'), `${path} missing mono`);
    assert(content.includes('legato'), `${path} missing legato`);
  }
  const rust = readFileSync(new URL('../src-tauri/src/main.rs', import.meta.url), 'utf8');
  assert(rust.includes('mono: bool') || rust.includes('mono: i32'));
  assert(rust.includes('legato: bool') || rust.includes('legato: i32'));
});

test('module-only Stereo/Mono reaches every native bridge as dual mono routing', () => {
  for (const path of [
    '../src/platform/native/HookKeysNative.ts', '../src/features/player/PlayerScreen.ts',
    '../src-tauri/src/native_engine_bridge.cpp', '../android/app/src/main/cpp/HookKeysNativeBridge.cpp',
    '../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java',
    '../ios/App/App/HookKeysNativeEngine.h', '../ios/App/App/HookKeysNativeEngine.mm', '../ios/App/App/HookKeysNativePlugin.swift',
    '../native-engine/include/hook_keys/EngineTypes.hpp', '../native-engine/src/HookKeysEngine.cpp',
  ]) assert(readFileSync(new URL(path, import.meta.url), 'utf8').includes('outputDualMono'), path);
  assert(readFileSync(new URL('../src-tauri/src/main.rs', import.meta.url), 'utf8').includes('output_dual_mono'));
});

test('all native bridges forward the global transpose', () => {
  for (const path of [
    '../src/platform/native/HookKeysNative.ts', '../src/features/player/PlayerScreen.ts',
    '../src-tauri/src/native_engine_bridge.cpp', '../android/app/src/main/cpp/HookKeysNativeBridge.cpp',
    '../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java',
    '../ios/App/App/HookKeysNativeEngine.h', '../ios/App/App/HookKeysNativeEngine.mm', '../ios/App/App/HookKeysNativePlugin.swift',
  ]) assert(readFileSync(new URL(path, import.meta.url), 'utf8').includes('GlobalTranspose'), path);
  assert(readFileSync(new URL('../src-tauri/src/main.rs', import.meta.url), 'utf8').includes('set_global_transpose'));
});

test('entry lasts three seconds, logout six, both keep the animation except the keyboard and share bold italic typography', () => {
  const source = readFileSync(new URL('../src/app/HookKeysApp.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('HookKeysApp.ts', source, ts.ScriptTarget.Latest, true);
  const factory = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'createOctaveTransitionMarkup');
  const context = { exports: {} };
  vm.runInNewContext(ts.transpileModule(`${factory.getText(ast)}\nexport { createOctaveTransitionMarkup };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  for (const direction of ['enter', 'exit']) {
    const markup = context.exports.createOctaveTransitionMarkup(direction);
    assert.doesNotMatch(markup, /octave-transition__(keyboard|white-key)/);
    for (const retained of ['identity', 'meter', 'title', 'progress', 'atmosphere']) assert(markup.includes(`octave-transition__${retained}`));
  }
  assert.match(source, /totalDuration = direction === 'enter' \? 3000 : 6000/);
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert(css.includes('animation: premium-transition-exit 6s'));
  assert(css.includes('animation: premium-deck-exit 6s'));
  assert(css.includes('animation: premium-loading-deck 1.6s'));
  assert(css.includes('animation: premium-loading-progress 1.8s'));
  assert.match(css, /body,\s*body :is\([^{}]+\)\s*\{\s*font-weight: 800 !important;\s*font-style: italic !important;/);
});

test('EQ preview shrinks to the card and reserves its own inset for the graph and frequency labels', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.module-eq-card\s*\{\s*min-height: 0;\s*overflow: hidden;/);
  assert.match(css, /\.module-eq-preview\s*\{[^}]*height: 100%;\s*min-height: 0;/);
  assert.match(css, /\.module-eq-preview svg\s*\{[^}]*position: absolute;[^}]*height: calc\(100% - 18px\);/);
  assert(![...css.matchAll(/\.module-eq-preview\s*\{([^}]*)\}/g)].some(([, rules]) => /min-height:\s*(105|44)px/.test(rules)));
});

function setupExpression() {
  class Input {
    constructor(kind) {
      this.dataset = { keyboardExpression: kind };
      this.value = kind === 'pitch' ? '8192' : '0';
      this.attributes = new Map();
      this.properties = new Map();
      this.label = { style: { setProperty: (name, value) => this.properties.set(name, value) } };
      this.captured = new Set();
    }
    closest(selector) { return selector === '.keyboard-expression' ? this.label : this; }
    matches(selector) { return selector.includes(`"${this.dataset.keyboardExpression}"`); }
    getBoundingClientRect() { return { top: 10, height: 100 }; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    setPointerCapture(id) { this.captured.add(id); }
    hasPointerCapture(id) { return this.captured.has(id); }
    releasePointerCapture(id) { this.captured.delete(id); listeners.get('lostpointercapture')?.({ pointerId: id }); }
  }
  const inputs = { pitch: new Input('pitch'), mod: new Input('mod') };
  const listeners = new Map();
  const windowListeners = new Map();
  const documentListeners = new Map();
  const root = {
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: (name) => listeners.delete(name),
    querySelector: (selector) => inputs[selector.match(/"(pitch|mod)"/)[1]],
  };
  const globals = {
    Element: Input,
    window: { addEventListener: (name, handler) => windowListeners.set(name, handler), removeEventListener: (name) => windowListeners.delete(name) },
    document: { hidden: false, addEventListener: (name, handler) => documentListeners.set(name, handler), removeEventListener: (name) => documentListeners.delete(name) },
  };
  const { KeyboardExpressionController } = load('../src/features/player/KeyboardExpressionController.ts', {}, globals);
  const sent = [];
  const controller = new KeyboardExpressionController(root, (...message) => sent.push(message));
  controller.mount();
  const send = (type, kind = 'pitch', y = 60, pointerId = 1, button = 0) => listeners.get(type)?.({ target: inputs[kind], clientY: y, pointerId, button, preventDefault() {} });
  return { controller, sent, inputs, send, listeners, windowListeners, documentListeners, globals };
}

test('touch/mouse drag reaches wheel extremes, Pitch springs to centre and Mod latches', () => {
  const { controller, send, inputs, sent } = setupExpression();
  send('pointerdown', 'pitch', 10);
  send('pointermove', 'pitch', 150);
  send('pointerup', 'pitch');
  assert.deepEqual(sent, [['pitch', 16383, true], ['pitch', 0, true], ['pitch', 8192, false]]);
  assert.equal(inputs.pitch.value, '8192');
  sent.length = 0;
  send('pointerdown', 'mod', 10);
  send('pointerup', 'mod');
  assert.equal(inputs.mod.value, '127');
  assert.deepEqual(sent, [['mod', 127, true], ['mod', 127, false]]);
  controller.destroy();
});

test('simultaneous note-independent wheels survive capture loss, blur and resize without stuck Pitch', () => {
  const { send, sent, windowListeners } = setupExpression();
  send('pointerdown', 'pitch', 10, 1);
  send('pointerdown', 'mod', 10, 2);
  send('pointercancel', 'pitch', 10, 1);
  send('lostpointercapture', 'pitch', 10, 1);
  assert.equal(sent.filter(([kind, value, active]) => kind === 'pitch' && value === 8192 && !active).length, 1);
  send('pointerup', 'mod', 10, 2);
  send('pointerdown', 'pitch', 10, 3);
  windowListeners.get('blur')();
  assert.deepEqual(sent.at(-1), ['pitch', 8192, false]);
  send('pointerdown', 'pitch', 10, 4);
  windowListeners.get('resize')();
  assert.deepEqual(sent.at(-1), ['pitch', 8192, false]);
});

test('physical MIDI updates only the selected keyboard, remembers other devices and never echoes MIDI', () => {
  const { controller, inputs, sent } = setupExpression();
  controller.setInputId('midi-a');
  controller.receiveMidi('pitch', 16383, 'midi-b');
  assert.equal(inputs.pitch.value, '8192');
  controller.receiveMidi('pitch', 0, 'midi-a');
  controller.receiveMidi('mod', 100, 'midi-a');
  assert.equal(inputs.pitch.value, '0');
  assert.equal(inputs.mod.value, '100');
  controller.setInputId('midi-b');
  assert.equal(inputs.pitch.value, '16383');
  assert.equal(inputs.mod.value, '0');
  controller.setInputId(null);
  assert.equal(inputs.pitch.value, '8192');
  assert.equal(inputs.mod.value, '0');
  assert.equal(sent.length, 0);
});

test('keyboard input and focus loss also release Pitch and destruction removes all event handlers', () => {
  const { controller, inputs, sent, send, listeners, windowListeners, documentListeners } = setupExpression();
  inputs.pitch.value = '16383';
  send('input');
  assert.deepEqual(sent.at(-1), ['pitch', 16383, true]);
  send('focusout');
  assert.deepEqual(sent.at(-1), ['pitch', 8192, false]);
  controller.destroy();
  assert.equal(listeners.size + windowListeners.size + documentListeners.size, 0);
});

test('Web MIDI and native Pitch feedback keep the full fourteen-bit value and selected input filtering', () => {
  const pitches = [];
  const midi = load('../src/features/midi/MidiInputService.ts', {
    '../../platform/native/HookKeysNative': { hookKeysNative: {} },
    '../../platform/runtime': { isDesktopRuntime: () => false },
  }).MidiInputService;
  const service = new midi(() => assert.fail('Pitch is not a note'), () => {}, () => {}, (input) => pitches.push(input));
  service.selectedInputIds.add('midi-a');
  service.processMidiMessage(new Uint8Array([0xe2, 127, 127]), 'midi-a');
  service.processMidiMessage(new Uint8Array([0xe0, 0, 64]), 'midi-a');
  service.processMidiMessage(new Uint8Array([0xe0, 0, 0]), 'other');
  service.handleNativePitchBend({ detail: { inputId: 'midi-a', channel: 1, value: 16383 } });
  assert.deepEqual(pitches.map((pitch) => ({ ...pitch })), [
    { channel: 3, inputId: 'midi-a', value: 16383 },
    { channel: 1, inputId: 'midi-a', value: 8192 },
    { channel: 1, inputId: 'midi-a', value: 16383 },
  ]);
});
