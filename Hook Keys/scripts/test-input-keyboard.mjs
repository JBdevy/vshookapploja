import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Window } from 'happy-dom';

const compiled = await build({ entryPoints: ['src/shared/ui/TabletInputKeyboardController.ts'], bundle: true,
  write: false, format: 'iife', globalName: 'InputKeyboard', platform: 'browser' });
const window = new Window({ url: 'http://localhost', settings: { enableJavaScriptEvaluation: true } });
window.eval(compiled.outputFiles[0].text);
const modal = window.document.createElement('section');
modal.innerHTML = `<div class="player-modal__body"><div>
  <input data-name type="text"><input data-count type="number" max="128">
  <input data-decimal type="text" inputmode="decimal" max="600">
  <input data-code type="text" inputmode="numeric" maxlength="6">
  </div></div>`;
window.document.body.append(modal);
const controller = new window.InputKeyboard.TabletInputKeyboardController(modal);
const key = value => modal.querySelector(`[data-on-screen-key="${value}"]`)?.click();
try {
  controller.mount();
  const name = modal.querySelector('[data-name]');
  controller.openFor(name);
  assert(modal.querySelector('[data-on-screen-key="A"]'));
  key('A');
  assert.equal(name.value, 'a');
  const count = modal.querySelector('[data-count]');
  controller.openFor(count);
  assert(modal.querySelector('.on-screen-keyboard--numeric'));
  assert(!modal.querySelector('[data-on-screen-key="A"]'));
  assert(!modal.querySelector('[data-on-screen-key="."]'));
  for (const value of ['1', '2', '8']) key(value);
  assert.equal(count.value, '128');
  key('9');
  assert.equal(count.value, '128', 'respeita o limite');
  const decimal = modal.querySelector('[data-decimal]');
  controller.openFor(decimal);
  assert(modal.querySelector('[data-on-screen-key="."]'));
  for (const value of ['6', '0', '.', '5']) key(value);
  assert.equal(decimal.value, '60.5');
  key('.');
  assert.equal(decimal.value, '60.5', 'não duplica separador decimal');
  const code = modal.querySelector('[data-code]');
  controller.openFor(code);
  assert(!modal.querySelector('[data-on-screen-key="."]'));
  for (const value of ['1', '2', '3', '4', '5', '6', '7']) key(value);
  assert.equal(code.value, '123456', 'campo numérico sem max não fica limitado a zero');
  controller.openFor(name);
  assert(modal.querySelector('[data-on-screen-key="A"]'), 'volta ao teclado de letras');
  assert.equal(modal.querySelectorAll('.on-screen-keyboard').length, 1);
  assert.equal(name.readOnly, true, 'não chama teclado nativo');
  console.log('INPUT_KEYBOARD_OK: texto, números, decimal, limites e alternância de layout.');
} finally {
  controller.destroy();
  await window.happyDOM.abort();
}
