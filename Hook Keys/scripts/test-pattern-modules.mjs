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

test('pattern settings are normalized and sequencer always restores sixteen safe steps', () => {
  const arp = views.readArpeggiatorSettings({ enabled: true, mode: 'invalid', octaves: 99, gate: -4 });
  assert.equal(arp.enabled, true);
  assert.equal(arp.mode, 'up');
  assert.equal(arp.octaves, 4);
  assert.equal(arp.gate, 10);

  const sequence = views.readSequencerSettings({
    length: 99,
    steps: [{ enabled: false, semitone: 90, velocity: 0, gate: 200 }],
  });
  assert.equal(sequence.length, 16);
  assert.equal(sequence.steps.length, 16);
  assert.deepEqual({ ...sequence.steps[0] }, { enabled: false, semitone: 24, velocity: 1, gate: 100 });
});

test('division clock keeps swing pairs at the same total duration', () => {
  const straight = views.patternStepMilliseconds(120, '1/16', 0, 0);
  const long = views.patternStepMilliseconds(120, '1/16', 50, 0);
  const short = views.patternStepMilliseconds(120, '1/16', 50, 1);
  assert.equal(straight, 125);
  assert.equal(long + short, straight * 2);
});

test('arpeggiator and sequencer send generated notes through isolated engine inputs', () => {
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
    sequencer: {
      moduleEnabled: true, hasSound: true, midiInputId: null, lowNote: 0, highNote: 127,
      settings: { enabled: true, division: '1/16', length: 4, swing: 0 },
    },
  };
  const controller = new playback.PatternPlaybackController(() => snapshot, (...message) => sent.push(message));
  controller.handleInput({ inputId: null, noteNumber: 60, pressed: true, velocity: 100 });
  assert.deepEqual(sent.slice(0, 2).map((message) => message[0]), [4, 5]);
  controller.handleInput({ inputId: null, noteNumber: 60, pressed: false, velocity: 0 });
  assert(sent.some(([slot, status]) => slot === 4 && status === 0x80));
  assert(sent.some(([slot, status]) => slot === 5 && status === 0x80));
  controller.destroy();
});
