import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/features/player/KeyboardMidiRouter.ts', import.meta.url), 'utf8');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const { KeyboardMidiRouter, keyboardMidiRoute } = context.exports;

test('selected keyboard slot determines the input; no connected devices broadcasts', () => {
  const ids = ['midi-a', 'midi-b', 'midi-c'];
  for (let slot = 1; slot <= 3; slot++) {
    const route = keyboardMidiRoute(slot, ids, 3);
    assert.equal(route.inputSlot, slot - 1);
    assert.equal(route.inputId, ids[slot - 1]);
    assert.equal(keyboardMidiRoute(slot, ids, 0).inputSlot, 3);
    assert.equal(keyboardMidiRoute(slot, ids, 0).inputId, null);
  }
});

test('note-off retains original routing through device disconnect and selection changes', () => {
  let route = { inputSlot: 1, inputId: 'midi-b' };
  const sent = [];
  const router = new KeyboardMidiRouter(() => route, (...message) => sent.push(message));
  assert.equal(router.note(60, true, 110), 'midi-b');
  route = { inputSlot: 3, inputId: null };
  router.note(62, true, 100);
  assert.equal(router.note(60, false, 0), 'midi-b');
  route = { inputSlot: 0, inputId: 'midi-a' };
  assert.equal(router.note(62, false, 0), null);
  assert.deepEqual(sent, [[1, 0x90, 60, 110], [3, 0x90, 62, 100], [1, 0x80, 60, 0], [3, 0x80, 62, 0]]);
});

test('Pitch uses fourteen-bit bend and Mod uses CC 1 on the same input as keyboard notes', () => {
  for (const inputSlot of [0, 1, 2, 3]) {
    const sent = [];
    const router = new KeyboardMidiRouter(() => ({ inputSlot, inputId: null }), (...message) => sent.push(message));
    router.pitchBend(0, true);
    router.pitchBend(16383, true);
    router.pitchBend(8192, false);
    router.modulation(127, true);
    router.modulation(0, false);
    assert.deepEqual(sent, [[inputSlot, 0xe0, 0, 0], [inputSlot, 0xe0, 127, 127], [inputSlot, 0xe0, 0, 64], [inputSlot, 0xb0, 1, 127], [inputSlot, 0xb0, 1, 0]]);
  }
});

test('expression gestures retain their route on disconnect and clean up the previous modulation input', () => {
  let route = { inputSlot: 1, inputId: 'midi-b' };
  const sent = [];
  const router = new KeyboardMidiRouter(() => route, (...message) => sent.push(message));
  router.pitchBend(16383, true);
  router.modulation(127, true);
  route = { inputSlot: 3, inputId: null };
  router.pitchBend(8192, false);
  router.modulation(127, false);
  router.resetExpression();
  assert.deepEqual(sent, [[1, 0xe0, 127, 127], [1, 0xb0, 1, 127], [1, 0xe0, 0, 64], [1, 0xb0, 1, 127], [1, 0xb0, 1, 0]]);
  sent.length = 0;
  router.pitchBend(0, true);
  router.modulation(50, true);
  router.resetExpression();
  assert.deepEqual(sent, [[3, 0xe0, 0, 0], [3, 0xb0, 1, 50], [3, 0xe0, 0, 64], [3, 0xb0, 1, 0]]);
});
