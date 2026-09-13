import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

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

const knobView = transpile('../src/features/player/ParameterKnobView.ts');
const synthView = transpile('../src/features/player/SynthModuleView.ts', {
  './ParameterKnobView': knobView,
});
const settingsView = transpile('../src/features/player/ModuleSettingsView.ts', {
  './ParameterKnobView': knobView,
  './ModuleEffectsView': { createModuleEffectCardsMarkup: () => '' },
  '../audio/AudioOutputService': { createAudioRouteOptions: () => '' },
  './VelocityCurveView': { createVelocityCardMarkup: () => '' },
});

test('shared knob generates empty, half-full and full value bars with one common face', () => {
  for (const [value, progress, angle] of [[0, 0, -135], [.5, .5, 0], [1, 1, 135], [-1, 0, -135], [2, 1, 135], [NaN, 0, -135]]) {
    const markup = knobView.createParameterKnobMarkup(value, '<input type="range">');
    assert.match(markup, /class="module-envelope-knob"/);
    assert.match(markup, /class="module-envelope-knob__face" aria-hidden="true"><i><\/i><\/span>/);
    assert(markup.includes(`--knob-progress:${progress}`));
    assert(markup.includes(`--knob-angle:${angle}deg`));
  }
});

test('every Synth parameter uses exactly the same knob face as timbre parameters', () => {
  const synthMarkup = synthView.createSynthModuleMarkup({});
  const moduleMarkup = settingsView.createModuleSettingsMarkup([], [], null, {}, 120, 2, '1+2');
  const faces = (markup) => [...markup.matchAll(/<span class="module-envelope-knob__face"[^>]*><i><\/i><\/span>/g)].map(([face]) => face);
  assert.equal(faces(synthMarkup).length, 13);
  assert.equal(faces(moduleMarkup).length, 5);
  assert(faces(synthMarkup).every((face) => face === faces(moduleMarkup)[0]));
  assert.doesNotMatch(synthMarkup, /module-effect-knob|synth-knob|conic-gradient|border/);
  assert.equal([...synthMarkup.matchAll(/data-synth-parameter=/g)].length, 13);
  assert.doesNotMatch(synthMarkup, /Mix OSC 2|data-synth-parameter="oscillatorMix"/);
  assert.match(synthMarkup, /Volume OSC 1/);
  assert.match(synthMarkup, /Volume OSC 2/);
});

test('new module and Synth defaults use zero Attack, 90 ms Release and maximum Hold/Decay/Cutoff, with fixed hidden Sustain', () => {
  assert.deepEqual({ ...settingsView.MODULE_ENVELOPE_DEFAULTS }, { attackMs: 0, releaseMs: 90, holdMs: 15000, decayMs: 25000 });
  const defaults = synthView.readSynthSettings({});
  assert.equal(defaults.attackMs, 0);
  assert.equal(defaults.releaseMs, 90);
  assert.equal(defaults.holdMs, 15000);
  assert.equal(defaults.decayMs, 25000);
  assert.equal(defaults.filterCutoffHz, 20000);
  assert.equal(defaults.sustain, 100);
  for (const sustain of [undefined, 0, 50, 100, 999]) {
    const saved = synthView.readSynthSettings({ sustain, attackMs: 25, holdMs: 500, decayMs: 1500, releaseMs: 175, filterCutoffHz: 9000 });
    assert.equal(saved.sustain, 100, 'old presets cannot alter the fixed Sustain');
    assert.equal(saved.releaseMs, 175, 'other saved parameters stay untouched');
    assert.equal(saved.attackMs, 25);
    assert.equal(saved.filterCutoffHz, 9000);
    assert.doesNotMatch(synthView.createSynthModuleMarkup(saved), /data-synth-parameter="sustain"|>Sustain</);
  }
  const source = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('PlayerScreen.ts', source, ts.ScriptTarget.Latest, true);
  const factory = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'createDefaultModuleSettings');
  const context = {
    exports: {}, ...settingsView, ...synthView,
    readModuleRotarySettings: () => ({}), DEFAULT_ARPEGGIATOR_SETTINGS: {},
    DEFAULT_SEQUENCER_SETTINGS: { steps: [] }, DEFAULT_VELOCITY_CURVE: { points: [], userPoints: [] },
  };
  vm.runInNewContext(ts.transpileModule(`${factory.getText(ast)}\nexport { createDefaultModuleSettings };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  const module = context.exports.createDefaultModuleSettings();
  assert.equal(module.releaseMs, 90);
  assert.equal(module.cutoffHz, 20000);
  assert.equal(module.sustain, 100);
  assert.equal(module.synth.releaseMs, 90);
  assert.equal(module.synthPresets[0].releaseMs, 90);
  assert.doesNotMatch(source, /sustain: \[0, 100\]/);
});

test('Reverb previews use the shared thin dynamic knob face rather than the old fixed blue arc', () => {
  const effects = transpile('../src/features/player/ModuleEffectsView.ts', { './ParameterKnobView': knobView });
  const markup = effects.createModuleEffectCardsMarkup({ reverb: { decay: 20, dampen: 0, size: 50, mix: 100 } }, 120);
  const preview = markup.match(/<div class="module-reverb-preview"[^>]*>([\s\S]*?)<\/div>/)[1];
  const knobs = [...preview.matchAll(/class="module-envelope-knob" style="--knob-angle:[^;]*;--knob-progress:([^"]+)"/g)];
  assert.deepEqual(knobs.map(([, progress]) => Number(progress)), [1, 0, .5, 1]);
  assert.equal([...preview.matchAll(/class="module-envelope-knob__face" aria-hidden="true"><i><\/i><\/span>/g)].length, 4);
  assert.doesNotMatch(preview, /<input|<span class="module-effect-preview-knob"[^>]*><i/);
  for (const label of ['Decay', 'Dampen', 'Size', 'Mix']) assert(preview.includes(`<small>${label}</small>`));
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert(!css.includes('.module-effect-preview-knob > i'));
  assert.match(css, /\.module-effect-preview-knob \.module-envelope-knob\s*\{[^}]*pointer-events: none;/);
});

function createRange(parameter, min, max, scale = '') {
  const properties = new Map();
  const attributes = new Map();
  const knob = { style: { setProperty(name, value) { properties.set(name, value); } } };
  const output = { value: '' };
  const card = { querySelector(selector) { assert.equal(selector, 'output'); return output; } };
  const input = {
    min: String(min), max: String(max), value: String(min),
    dataset: { synthParameter: parameter, synthScale: scale },
    closest(selector) {
      if (selector === '.synth-card') return card;
      assert.equal(selector, '.module-envelope-knob');
      return knob;
    },
    setAttribute(name, value) { attributes.set(name, value); },
  };
  return { input, output, attributes, properties };
}

test('moving a Synth knob updates its bar, pointer, card value and enlarged accessible value together', () => {
  for (const [parameter, min, max, unit] of [
    ['detuneCents', -100, 100, ' cent'],
    ['filterEnvelope', -100, 100, '%'], ['filterResonance', 0, 98, '%'],
  ]) {
    const range = createRange(parameter, min, max);
    for (const progress of [0, .5, 1]) {
      const value = min + (max - min) * progress;
      range.input.value = String(value);
      assert.equal(synthView.updateSynthRangeOutput(range.input), value);
      assert.equal(range.properties.get('--knob-progress'), String(progress));
      assert.equal(range.properties.get('--knob-angle'), `${-135 + progress * 270}deg`);
      assert.equal(range.output.value, `${Math.round(value)}${unit}`);
      assert.equal(range.attributes.get('aria-valuetext'), range.output.value);
    }
  }
});

test('both oscillator volumes have independent values, mute at zero and top out at 0 dB', () => {
  for (const parameter of ['oscillator1Volume', 'oscillator2Volume']) {
    const range = createRange(parameter, 0, 100);
    for (const [value, formatted] of [[0, '−∞ dB'], [50, '-6.0 dB'], [100, '0.0 dB']]) {
      range.input.value = String(value);
      assert.equal(synthView.updateSynthRangeOutput(range.input), value);
      assert.equal(range.properties.get('--knob-progress'), String(value / 100));
      assert.equal(range.output.value, formatted);
      assert.equal(range.attributes.get('aria-valuetext'), formatted);
    }
  }
  const defaults = synthView.readSynthSettings({});
  assert.equal(defaults.oscillator1Volume, 100);
  assert.equal(defaults.oscillator2Volume, 100);
  const stored = synthView.readSynthSettings({ oscillator1Volume: 15, oscillator2Volume: 80, oscillator2Enabled: false });
  assert.equal(stored.oscillator1Volume, 15);
  assert.equal(stored.oscillator2Volume, 80);
  const restored = synthView.readSynthSettings(JSON.parse(JSON.stringify(stored)));
  assert.equal(restored.oscillator1Volume, 15);
  assert.equal(restored.oscillator2Volume, 80);
  assert.equal(restored.oscillator2Enabled, false);
});

test('legacy Mix presets migrate without overriding the independent volumes in new backups', () => {
  const legacy = synthView.readSynthSettings({ oscillatorMix: 35 });
  assert.equal(legacy.oscillator1Volume, 65);
  assert.equal(legacy.oscillator2Volume, 35);
  assert(!('oscillatorMix' in legacy));
  assert.equal(synthView.readSynthSettings({ oscillatorMix: 35, oscillator2Enabled: false }).oscillator1Volume, 100);
  assert.equal(synthView.readSynthSettings({ oscillatorMix: 35, oscillator1Enabled: false }).oscillator2Volume, 100);
  const mixed = synthView.readSynthSettings({ oscillatorMix: 35, oscillator1Volume: 0, oscillator2Volume: 100 });
  assert.equal(mixed.oscillator1Volume, 0);
  assert.equal(mixed.oscillator2Volume, 100);
  const bounded = synthView.readSynthSettings({ oscillator1Volume: -10, oscillator2Volume: 130 });
  assert.equal(bounded.oscillator1Volume, 0);
  assert.equal(bounded.oscillator2Volume, 100);
});

test('time, frequency and logarithmic cutoff keep their formatted value while filling the common bar', () => {
  for (const [parameter, max] of [['attackMs', 15000], ['holdMs', 15000], ['decayMs', 25000], ['releaseMs', 25000], ['glideMs', 5000]]) {
    const range = createRange(parameter, 0, max);
    range.input.value = String(max);
    synthView.updateSynthRangeOutput(range.input);
    assert.equal(range.properties.get('--knob-progress'), '1');
    assert.equal(range.attributes.get('aria-valuetext'), range.output.value);
    assert.match(range.output.value, / s$/);
  }
  const cutoff = createRange('filterCutoffHz', 0, 100, 'cutoff');
  for (const [position, frequency, formatted] of [[0, 20, '20 Hz'], [50, 20 * Math.sqrt(1000), '632 Hz'], [100, 20000, '20.0 kHz']]) {
    cutoff.input.value = String(position);
    assert.equal(synthView.updateSynthRangeOutput(cutoff.input), frequency);
    assert.equal(cutoff.properties.get('--knob-progress'), String(position / 100));
    assert.equal(cutoff.output.value, formatted);
    assert.equal(cutoff.attributes.get('aria-valuetext'), formatted);
  }
  const lfo = createRange('lfoRateHz', .05, 30);
  lfo.input.value = '30';
  synthView.updateSynthRangeOutput(lfo.input);
  assert.equal(lfo.output.value, '30.00 Hz');
  assert.equal(lfo.properties.get('--knob-progress'), '1');
});

test('preset 1 is selected by default; other selections replace it and remain separate from Legato', () => {
  for (const active of [undefined, 2, 6]) {
    const markup = synthView.createSynthModuleMarkup({}, [], active);
    const presets = [...markup.matchAll(/<button\b[^>]*data-synth-preset="(\d)"[^>]*>/g)];
    assert.equal(presets.length, 6);
    const selected = presets.filter(([button]) => /aria-pressed="true"/.test(button));
    assert.equal(selected.length, 1);
    assert.equal(Number(selected[0][1]), active ?? 1);
    assert.match(selected[0][0], /is-selected/);
    assert.match(markup, /class="synth-preset-group"[\s\S]*?<\/div>\s*<button class="synth-legato-button/);
  }
});

test('common CSS retains the dynamic fill and green selection, without a Synth-only fixed face', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.player-output-knob__face,\s*\.module-envelope-knob__face,\s*\.module-effect-knob__face,\s*\.knob-focus__face\s*\{\s*border-width: 0;\s*background: conic-gradient\([\s\S]*?var\(--knob-progress, 0\)/);
  // Synth-specific layout sizing is allowed, but its knob face must stay shared.
  const selectors = [...css.matchAll(/([^{}]+)\{/g)].map(([, selector]) => selector.trim());
  assert(!selectors.some((selector) => selector.includes('synth') && /knob[^\s,]*__face/.test(selector)));
  assert.match(css, /\.synth-preset-button\.is-selected\s*\{[\s\S]*?background: linear-gradient\(180deg, #39df7d, #0b873f\)/);
});

test('each native bridge forwards both independent oscillator volumes rather than a crossfade', () => {
  for (const path of [
    '../src/platform/native/HookKeysNative.ts',
    '../src/features/player/PlayerScreen.ts',
    '../native-engine/include/hook_keys/AnalogSynthModule.hpp',
    '../src-tauri/src/native_engine_bridge.cpp',
    '../android/app/src/main/cpp/HookKeysNativeBridge.cpp',
    '../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java',
    '../ios/App/App/HookKeysNativeEngine.h',
    '../ios/App/App/HookKeysNativeEngine.mm',
    '../ios/App/App/HookKeysNativePlugin.swift',
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert(source.includes('oscillator1Volume'), `${path} must forward volume 1`);
    assert(source.includes('oscillator2Volume'), `${path} must forward volume 2`);
    assert(!source.includes('oscillatorMix'), `${path} must not keep the crossfade`);
  }
  const rust = readFileSync(new URL('../src-tauri/src/main.rs', import.meta.url), 'utf8');
  assert(rust.includes('oscillator1_volume'));
  assert(rust.includes('oscillator2_volume'));
  assert(!rust.includes('oscillator_mix'));
});

test('independent oscillator octaves default to zero, stay within -3..+3 and survive preset serialization', () => {
  const defaults = synthView.readSynthSettings({});
  assert.equal(defaults.oscillator1Octave, 0);
  assert.equal(defaults.oscillator2Octave, 0);
  const saved = synthView.readSynthSettings({ oscillator1Octave: -3, oscillator2Octave: 2, oscillator1Volume: 35 });
  const restored = synthView.readSynthSettings(JSON.parse(JSON.stringify(saved)));
  assert.equal(restored.oscillator1Octave, -3);
  assert.equal(restored.oscillator2Octave, 2);
  assert.equal(restored.oscillator1Volume, 35);
  assert.equal(synthView.readSynthSettings({ oscillator1Octave: -9, oscillator2Octave: 9 }).oscillator1Octave, -3);
  assert.equal(synthView.readSynthSettings({ oscillator1Octave: 1.7 }).oscillator1Octave, 2);
  const markup = synthView.createSynthModuleMarkup(saved);
  assert.match(markup, /data-synth-parameter="glideMs"[\s\S]*?synth-card--octaves/);
  const buttons = [...markup.matchAll(/<button[^>]*data-synth-octave="([^"]+)"[^>]*data-synth-octave-direction="(-?1)"[^>]*>/g)];
  assert.equal(buttons.length, 4);
  assert.match(buttons[0][0], /disabled/);
  assert.doesNotMatch(buttons[1][0], /disabled/);
  assert.match(markup, /data-synth-octave-value="oscillator2Octave">\+2/);
});

test('actual octave handler updates only the requested oscillator and persists without rebuilding the modal', () => {
  const source = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('PlayerScreen.ts', source, ts.ScriptTarget.Latest, true);
  const player = ast.statements.find((node) => ts.isClassDeclaration(node) && node.name?.text === 'PlayerScreen');
  const method = player.members.find((node) => ts.isMethodDeclaration(node) && node.name?.getText(ast) === 'shiftSynthOctave');
  const context = { exports: {}, readSynthSettings: synthView.readSynthSettings };
  vm.runInNewContext(ts.transpileModule(`export class Handler { ${method.getText(ast)} }`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  const handler = new context.exports.Handler();
  const module = { settings: { synth: synthView.readSynthSettings({ oscillator2Octave: -2 }) } };
  handler.getActivePresetState = () => ({ modules: [...Array(7), module] });
  let changes = 0;
  handler.markPlayerStateChanged = () => changes++;
  const output = {};
  const buttons = [-1, 1].map((direction) => ({
    dataset: { synthOctaveDirection: String(direction) },
    attributes: {}, selected: false,
    classList: { toggle(_name, selected) { buttons[direction < 0 ? 0 : 1].selected = selected; } },
    setAttribute(name, value) { this.attributes[name] = value; },
  }));
  const modal = { querySelector: () => output, querySelectorAll: () => buttons };
  for (let i = 0; i < 4; ++i) handler.shiftSynthOctave(modal, 'oscillator1Octave', 1);
  assert.equal(module.settings.synth.oscillator1Octave, 3);
  assert.equal(module.settings.synth.oscillator2Octave, -2);
  assert.equal(output.textContent, '+3');
  assert.equal(buttons[1].disabled, true);
  assert.equal(buttons[1].selected, true);
  assert.equal(buttons[0].selected, false);
  assert.equal(changes, 3);
  for (let i = 0; i < 7; ++i) handler.shiftSynthOctave(modal, 'oscillator1Octave', -1);
  assert.equal(module.settings.synth.oscillator1Octave, -3);
  assert.equal(buttons[0].disabled, true);
  assert.equal(buttons[0].selected, true);
  assert.equal(buttons[1].selected, false);
  assert.equal(changes, 9);
  for (let i = 0; i < 3; ++i) handler.shiftSynthOctave(modal, 'oscillator1Octave', 1);
  assert.equal(module.settings.synth.oscillator1Octave, 0);
  assert.equal(buttons[0].selected, false);
  assert.equal(buttons[1].selected, false);
  assert.equal(buttons[0].attributes['aria-pressed'], 'false');
  assert.equal(buttons[1].attributes['aria-pressed'], 'false');
});

test('all platform bridges forward independent octaves to the native DSP', () => {
  for (const path of [
    '../src/platform/native/HookKeysNative.ts', '../src/features/player/PlayerScreen.ts',
    '../native-engine/include/hook_keys/AnalogSynthModule.hpp', '../src-tauri/src/native_engine_bridge.cpp',
    '../android/app/src/main/cpp/HookKeysNativeBridge.cpp',
    '../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java',
    '../ios/App/App/HookKeysNativeEngine.h', '../ios/App/App/HookKeysNativeEngine.mm',
    '../ios/App/App/HookKeysNativePlugin.swift',
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert(source.includes('oscillator1Octave'), path);
    assert(source.includes('oscillator2Octave'), path);
  }
  const rust = readFileSync(new URL('../src-tauri/src/main.rs', import.meta.url), 'utf8');
  assert.match(rust, /config\.oscillator1_octave,\s*config\.oscillator2_octave,/);
});

test('Synth layout gives controls natural height and keeps presets and footer outside the inner scroll', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.synth-editor__header\s*\{[^}]*display: grid;[^}]*min-width: 0;/);
  assert.doesNotMatch(css, /\.synth-editor__header-controls\s*\{[^}]*width: (?:84|88)%;/);
  assert.match(css, /grid-template-rows: repeat\(3, max-content\);/);
  assert.match(css, /grid-template-rows: max-content repeat\(3, minmax\(var\(--synth-row-min-height\), 1fr\)\) minmax\(max-content, 1fr\);/);
  assert.match(css, /\.player-modal--module-synth \.synth-editor__grid\s*\{[^}]*overflow-y: auto;/);
  assert.match(css, /@media \(orientation: landscape\) and \(min-width: 560px\)\s*\{\s*\.player-modal--module-synth \.synth-editor__grid\s*\{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
});

test('OCT active sign is restored in markup and remains green even at -3/+3 limits', () => {
  for (const value of [-3, -1, 0, 1, 3]) {
    const markup = synthView.createSynthModuleMarkup({ oscillator1Octave: value });
    const buttons = [...markup.matchAll(/<button[^>]*data-synth-octave="oscillator1Octave"[^>]*>/g)].map(([button]) => button);
    assert.equal(/aria-pressed="true"/.test(buttons[0]), value < 0);
    assert.equal(/aria-pressed="true"/.test(buttons[1]), value > 0);
    assert.equal(/class="is-selected"/.test(buttons[0]), value < 0);
    assert.equal(/class="is-selected"/.test(buttons[1]), value > 0);
  }
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.synth-octave-row button\[data-synth-octave\]\.is-selected:disabled\s*\{[^}]*--button-color-a: var\(--module-button-green-a\) !important;[^}]*color: #f1fff6 !important;/);
});
