import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/features/player/PerformanceKeyboard.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup() {
  class Key {
    constructor(note) { this.dataset = { keyboardNote: String(note) }; }
    closest() { return this; }
    classList = { toggle() {} };
    setAttribute() {}
  }
  const keys = [60, 61, 62].map(note => new Key(note));
  const listeners = new Map();
  const captured = new Set();
  const notes = [];
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
  };
  const context = {
    exports: {}, require: () => ({ formatMidiNote: String }), Element: Key,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    window: { dispatchEvent() {}, setTimeout: fn => { fn(); return 1; }, clearTimeout() {} },
  };
  vm.runInNewContext(compiled, context);
  const controller = new context.exports.PerformanceKeyboardController(root, () => spreads++, (note, pressed) => notes.push([note, pressed]));
  controller.mount();
  function send(type, id = 1, keyIndex = 0, x = 0, time = 0) {
    hit = keys[keyIndex] ?? null;
    // Captured pointermove still targets the original key, not the hit key.
    listeners.get(type)?.({ type, pointerId: id, target: keys[0], pointerType: 'touch', button: 0,
      clientX: x, clientY: 0, timeStamp: time, preventDefault() {} });
  }
  return { controller, notes, send, captured, get spreads() { return spreads; } };
}

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
