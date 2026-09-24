import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  assert(!modal.querySelector('[data-on-screen-key="emoji"]'), 'o teclado de texto não oferece emojis');
  assert.equal(modal.querySelectorAll('.on-screen-keyboard__row--actions > button').length, 3,
    'a última linha contém caracteres especiais, Espaço e Enter');
  assert.equal(modal.querySelector('.on-screen-keyboard__row--actions > button:nth-child(2)')?.dataset.onScreenKey, 'space',
    'Espaço permanece no centro');
  assert.equal(modal.querySelector('.on-screen-keyboard__row--actions > button:last-child')?.dataset.onScreenKey, 'enter',
    'Enter volta para a posição da direita');
  key('symbols');
  assert(modal.querySelector('[data-keyboard-layout-panel="letters"]').hidden);
  assert(!modal.querySelector('[data-keyboard-layout-panel="symbols"]').hidden);
  key('@');
  assert.equal(name.value, '@', 'o painel de caracteres especiais escreve no campo');
  key('symbols');
  assert(!modal.querySelector('[data-keyboard-layout-panel="letters"]').hidden, 'ABC retorna às letras');
  // O teclado abre com a primeira letra maiúscula e o Shift aceso; depois dela
  // volta sozinho para minúscula.
  assert.equal(modal.querySelector('[data-on-screen-key="shift"]').getAttribute('aria-pressed'), 'true');
  key('A');
  assert.equal(name.value, '@A');
  assert.equal(modal.querySelector('[data-on-screen-key="shift"]').getAttribute('aria-pressed'), 'false');
  key('A');
  assert.equal(name.value, '@Aa');
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
  for (let index = 0; index < 8; index += 1) key('A');
  const lengthBeforeHold = Array.from(name.value).length;
  const backspace = modal.querySelector('[data-on-screen-key="backspace"]');
  backspace.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, pointerId: 41 }));
  await new Promise(resolve => setTimeout(resolve, 610));
  backspace.dispatchEvent(new window.PointerEvent('pointerup', { bubbles: true, pointerId: 41 }));
  backspace.click();
  assert(Array.from(name.value).length <= lengthBeforeHold - 2,
    'segurar Backspace apaga repetidamente e o clique da soltura não acrescenta outra ação');
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.on-screen-keyboard__row button \{[^}]*border-radius: 4px;/s,
    'todas as teclas usam arredondamento de 4px');
  console.log('INPUT_KEYBOARD_OK: texto, números, decimal, limites e alternância de layout.');
} finally {
  controller.destroy();
  await window.happyDOM.abort();
}
