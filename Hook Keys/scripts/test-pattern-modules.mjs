import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function transpile(path, require = () => ({}), globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const context = { exports: {}, require, ...globals };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports;
}

const views = transpile('../src/features/player/PatternModulesView.ts');
const knob = transpile('../src/features/player/ParameterKnobView.ts');
const tranceGate = transpile('../src/features/player/TranceGateView.ts', specifier =>
  specifier === './ParameterKnobView' ? knob : views);

test('Trance Gate defaults and normalized settings contain only volume steps, with BPM divisions', () => {
  const defaults = tranceGate.readTranceGateSettings(undefined);
  assert.equal(defaults.enabled, true);
  assert.equal(defaults.gate, 50);
  assert.equal(defaults.depth, 100);
  assert.equal(defaults.steps.length, 16);
  const restored = tranceGate.readTranceGateSettings({ enabled: false, length: 8, steps: [false, true], depth: 55 });
  assert.equal(restored.enabled, false);
  assert.equal(restored.depth, 55);
  assert.equal(restored.steps[0], false);
  assert.equal(tranceGate.readTranceGateSettings({ gate: NaN }).gate, 50);
  const markup = tranceGate.createTranceGateMarkup(restored);
  assert.match(markup, /Pulse/);
  assert.doesNotMatch(markup, /Velocity|Semitone|data-pattern-parameter="semitone"/);
  assert.equal([...markup.matchAll(/data-trance-gate-step=/g)].length, 16);
  assert.equal(tranceGate.tranceGateBeatMultiplier('1/8 T'), 1 / 3);
  for (const path of ['../src-tauri/src/main.rs', '../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java', '../ios/App/App/HookKeysNativePlugin.swift']) {
    assert.match(readFileSync(new URL(path, import.meta.url), 'utf8'), /configure_trance_gate|configureTranceGate/);
  }
});

test('arpeggiator settings are normalized, and the old step sequencer is gone', () => {
  const arp = views.readArpeggiatorSettings({ enabled: true, mode: 'invalid', octaves: 99, gate: -4 });
  assert.equal(arp.enabled, true);
  assert.equal(arp.mode, 'up');
  assert.equal(arp.octaves, 4);
  assert.equal(arp.gate, 10);
  // O módulo 07 é só Trance Gate: não existe mais sequenciador de notas.
  assert.equal(views.readSequencerSettings, undefined);
  assert.equal(views.createSequencerMarkup, undefined);
});

test('division clock keeps swing pairs at the same total duration', () => {
  const straight = views.patternStepMilliseconds(120, '1/16', 0, 0);
  const long = views.patternStepMilliseconds(120, '1/16', 50, 0);
  const short = views.patternStepMilliseconds(120, '1/16', 50, 1);
  assert.equal(straight, 125);
  assert.equal(long + short, straight * 2);
  assert.equal(views.patternStepMilliseconds(120, '1/8 T', 0, 0), 500 / 3);
  assert.equal(views.patternStepMilliseconds(120, '1/16 T', 0, 0), 500 / 6);
});

test('arpeggiator offers triplets and 2x2 octave buttons while remaining permanently BPM-synced', () => {
  const markup = views.createArpeggiatorMarkup({ division: '1/8 T', octaves: 3 });
  assert.match(markup, /data-arpeggiator-division="1\/8 T"[^>]*aria-pressed="true"/);
  assert.equal((markup.match(/data-arpeggiator-octaves=/g) ?? []).length, 4);
  assert.doesNotMatch(markup, /data-pattern-parameter="octaves"/);
  assert.doesNotMatch(markup, /data-arpeggiator-sync|rateBpm/);
});

test('every module runs its own independent Arpeggiator, each on its own engine input', () => {
  let timerId = 0;
  const timers = new Map();
  const fakeWindow = {
    setTimeout(callback) {
      timerId += 1;
      timers.set(timerId, callback);
      return timerId;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  const playback = transpile(
    '../src/features/player/PatternPlaybackController.ts',
    (specifier) => specifier === './PatternModulesView' ? views : {},
    { window: fakeWindow, Math },
  );
  const sent = [];
  const snapshot = {
    bpm: 120,
    arpeggiator: {
      moduleEnabled: true, hasSound: true, midiInputId: null, lowNote: 0, highNote: 127,
      settings: { enabled: true, mode: 'up', division: '1/16', octaves: 1, gate: 70, swing: 0 },
    },
  };
  const controller = new playback.PatternPlaybackController(
    () => snapshot,
    (moduleNumber, slot, status, note, velocity) => sent.push([moduleNumber, slot, status, note, velocity]),
  );
  controller.handleInput({ inputId: null, noteNumber: 60, pressed: true, velocity: 100 });
  // Cada um dos 8 módulos tem seu próprio Arpeggiator: a mesma nota física
  // gera uma frase independente para cada um, no seu próprio slot gerado.
  assert.equal(sent.length, 8, 'each of the 8 modules runs its own generator');
  for (const [moduleNumber, slot] of sent) {
    assert.equal(slot, playback.arpeggiatorInputSlotForModule(moduleNumber),
      'each module sends through its own base-plus-index engine input');
  }
  assert.equal(sent.find(([moduleNumber]) => moduleNumber === 1)?.[1], 4,
    'module 1 keeps using the base engine input');
  controller.handleInput({ inputId: null, noteNumber: 60, pressed: false, velocity: 0 });
  assert(sent.some(([, slot, status]) => slot === 4 && status === 0x80));
  controller.destroy();
});

test('arpeggiator follows physical key-up and the pedal holds it like any module', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  // O pedal voltou a valer no arpeggiator: pisado, ele segura as teclas e a
  // frase continua. Quem nao quiser desliga no botao Sustain do modulo.
  assert.match(player, /sustain: moduleState\?\.sustainInputEnabled \?\? true,/,
    'the pedal reaches the arpeggiator through the module Sustain switch');
  assert.match(player, /inputSlot:\s*patternInputSlot \?\?/,
    'enabled arpeggiator must receive only its generated note stream');
  const playback = readFileSync(new URL('../src/features/player/PatternPlaybackController.ts', import.meta.url), 'utf8');
  assert.match(playback, /if \(existing >= 0\) state\.held\.splice\(existing, 1\);\s*if \(state\.held\.length === 0\) this\.stop\(moduleNumber, false\);/,
    'physical Note Off must stop the arpeggio as soon as the final key is released');
});
