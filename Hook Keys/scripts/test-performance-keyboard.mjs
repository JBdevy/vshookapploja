import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/features/player/PerformanceKeyboard.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const midiSource = readFileSync(new URL('../src/features/midi/MidiInputService.ts', import.meta.url), 'utf8');
const midiCompiled = ts.transpileModule(midiSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const midiContext = { exports: {}, require: () => ({ hookKeysNative: {}, isDesktopRuntime: () => false }) };
vm.runInNewContext(midiCompiled, midiContext);

test('full keyboard names run from A-1 through C7', () => {
  assert.equal(midiContext.exports.formatMidiNote(21), 'A-1');
  assert.equal(midiContext.exports.formatMidiNote(60), 'C3');
  assert.equal(midiContext.exports.formatMidiNote(108), 'C7');
});

test('physical MIDI C3 lights the C3 key without changing its MIDI note', () => {
  const context = { exports: {}, require: () => ({ formatMidiNote: midiContext.exports.formatMidiNote }) };
  vm.runInNewContext(compiled, context);
  const markup = context.exports.createPerformanceKeysMarkup();
  assert.match(markup, /data-keyboard-note="21"[\s\S]*?aria-label="A-1"/);
  assert.match(markup, /data-keyboard-note="60"[\s\S]*?aria-label="C3"/);
  assert.match(markup, /data-keyboard-note="108"[\s\S]*?aria-label="C7"/);
  assert.doesNotMatch(markup, /data-keyboard-note="9"/);
});

function setup() {
  class Key {
    constructor(note) { this.dataset = { keyboardNote: String(note) }; }
    closest() { return this; }
    getBoundingClientRect() { return { top: 10, bottom: 110, height: 100 }; }
    classList = { toggle() {} };
    setAttribute() {}
  }
  const keys = [60, 61, 62].map(note => new Key(note));
  const listeners = new Map();
  const captured = new Set();
  const notes = [];
  const velocities = [];
  let hit = keys[0];
  let spreads = 0;
  const root = {
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: name => listeners.delete(name),
    setPointerCapture: id => captured.add(id),
    hasPointerCapture: id => captured.has(id),
    releasePointerCapture: id => captured.delete(id),
    contains: key => keys.includes(key),
    ownerDocument: { elementFromPoint: () => hit },
    querySelector: selector => keys.find(key => selector.includes(`"${key.dataset.keyboardNote}"`)),
    querySelectorAll: selector => selector === '[data-keyboard-note]' ? keys : [],
  };
  const context = {
    exports: {}, require: () => ({ formatMidiNote: String }), Element: Key,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    window: { dispatchEvent() {}, setTimeout: fn => { fn(); return 1; }, clearTimeout() {} },
  };
  vm.runInNewContext(compiled, context);
  const controller = new context.exports.PerformanceKeyboardController(root, () => spreads++, (note, pressed, velocity) => {
    notes.push([note, pressed]);
    velocities.push(velocity);
  });
  controller.mount();
  function send(type, id = 1, keyIndex = 0, x = 0, time = 0, y = 60) {
    hit = keys[keyIndex] ?? null;
    // Captured pointermove still targets the original key, not the hit key.
    listeners.get(type)?.({ type, pointerId: id, target: type === 'pointerdown' ? hit : keys[0], pointerType: 'touch', button: 0,
      clientX: x, clientY: y, timeStamp: time, preventDefault() {} });
  }
  return { controller, notes, velocities, send, captured, get spreads() { return spreads; } };
}

test('vertical touch position selects soft through loud velocity layers', () => {
  const { send, notes, velocities } = setup();
  send('pointerdown', 1, 0, 0, 0, 10);
  send('pointerup', 1);
  send('pointerdown', 2, 1, 0, 0, 60);
  send('pointerup', 2);
  send('pointerdown', 3, 2, 0, 0, 110);
  send('pointerup', 3);
  assert.deepEqual(notes, [[60, true], [60, false], [61, true], [61, false], [62, true], [62, false]]);
  assert.deepEqual(velocities, [1, 0, 64, 0, 127, 0]);
});

test('glissando crosses white/black keys without retriggering the same key', () => {
  const { send, notes } = setup();
  send('pointerdown');
  send('pointermove', 1, 1);
  send('pointermove', 1, 1);
  send('pointermove', 1, 2);
  send('pointerup');
  assert.deepEqual(notes, [[60, true], [60, false], [61, true], [61, false], [62, true], [62, false]]);
});

test('leaving the keyboard releases the note and reentry plays again', () => {
  const { send, notes } = setup();
  send('pointerdown');
  send('pointermove', 1, -1);
  send('pointermove', 1, 2);
  send('pointercancel');
  assert.deepEqual(notes, [[60, true], [60, false], [62, true], [62, false]]);
});

test('a second finger holding the same note prevents an early note-off', () => {
  const { send, notes, controller } = setup();
  send('pointerdown');
  send('pointerdown', 2);
  send('pointermove', 1, 1);
  send('pointerup', 2);
  controller.destroy();
  assert.deepEqual(notes, [[60, true], [61, true], [60, false], [61, false]]);
});

test('capture loss releases the sounding note exactly once', () => {
  const { send, notes, captured } = setup();
  send('pointerdown');
  send('lostpointercapture');
  send('pointerup');
  assert.deepEqual(notes, [[60, true], [60, false]]);
  assert.equal(captured.size, 0);
});

test('confirmed spread silences notes and opens presets only after release', () => {
  const state = setup();
  state.send('pointerdown', 1, 0, 0);
  state.send('pointerdown', 2, 0, 100);
  state.send('pointermove', 1, 0, -40);
  state.send('pointermove', 2, 0, 140);
  assert.equal(state.spreads, 0);
  state.send('pointerup', 1);
  state.send('pointerup', 2);
  assert.equal(state.spreads, 1);
  assert.deepEqual(state.notes, [[60, true], [60, false]]);
});

test('cancelled spread never opens presets', () => {
  const state = setup();
  state.send('pointerdown', 1, 0, 0);
  state.send('pointerdown', 2, 0, 100);
  state.send('pointermove', 1, 0, -40);
  state.send('pointermove', 2, 0, 140);
  state.send('pointercancel', 1);
  state.send('pointerup', 2);
  assert.equal(state.spreads, 0);
});
