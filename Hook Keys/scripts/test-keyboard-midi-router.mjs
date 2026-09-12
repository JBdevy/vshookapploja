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
