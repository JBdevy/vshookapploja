import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
import { webcrypto } from 'node:crypto';

const compiled = await build({ entryPoints: ['src/features/player/PlayerScreen.ts'], bundle: true,
  write: false, format: 'iife', globalName: 'HookPlayer', platform: 'browser' });
const window = new Window({ url: 'http://localhost:5173', settings: { enableJavaScriptEvaluation: true } });
Object.defineProperty(window, 'crypto', { value: webcrypto });
window.TextEncoder = TextEncoder;
window.Option = function Option(text = '', value = '') {
  const option = window.document.createElement('option');
  option.textContent = text;
  option.value = value;
  return option;
};
window.__TAURI_INTERNALS__ = {
  invoke: async (command) => {
    if (command === 'initialize' || command === 'audio_output_status') return { ready: true, failed: false };
    if (command === 'list_midi_devices' || command === 'list_audio_output_devices') return [];
    if (command === 'module_meter_levels') return [];
    if (command === 'module_analysis') return [0, 0];
    if (command === 'audio_load') return [0, 0, 0];
    return 1;
  },
  transformCallback: () => 1,
};
window.eval(compiled.outputFiles[0].text);

const root = window.document.createElement('div');
window.document.body.append(root);
const player = new window.HookPlayer.PlayerScreen(root, { email: 'reset-test@example.invalid', name: 'Reset test' },
  async () => {}, { getSoundCatalog: async () => ({ categories: [], sounds: [] }), getCompatibilityVideoUrl: async () => '' },
  { load: async () => null, save() {}, saveNow() {}, persistNow() {}, destroy() {} }, { start() {}, stop() {}, destroy() {} });

player.mount();
await player.nativeBootPromise;
await player.activateLiveMidi();

function openModuleSettings(moduleNumber) {
  root.querySelector(`[data-action="open-module-settings"][data-module="${moduleNumber}"]`).click();
  const modal = root.querySelector('.player-modal--module-settings');
  assert(modal, `módulo ${moduleNumber}: modal Config não abriu`);
  return modal;
}

function goToPage(modal, page) {
  const tab = modal.querySelector(`[data-module-settings-page="${page}"]`);
  assert(tab, `aba ${page} não existe nas páginas do Config`);
  tab.click();
}

// Módulos 1-6 nascem em Default: precisa estar em User pra editar/resetar.
const modal = openModuleSettings(1);
modal.querySelector('[data-module-settings-mode="user"]').click();

// Rotary não é uma aba do Config: só existe no editor próprio do Organ
// (módulo 7). As outras cinco são abas comuns a qualquer módulo 1-6.
for (const page of ['eq', 'compressor', 'reverb', 'delay', 'chorus']) {
  goToPage(modal, page);
  const resetButton = modal.querySelector('.player-modal__actions [data-reset-processor]');
  assert(resetButton, `${page}: botão de Reset não está no rodapé`);
  assert.equal(resetButton.hidden, false, `${page}: Reset não devia estar escondido em User`);
  assert.equal(resetButton.dataset.resetProcessor, page, `${page}: data-reset-processor não acompanhou a aba`);
  resetButton.click();
  const confirmation = modal.querySelector('[data-processor-reset-confirmation]');
  assert(confirmation, `${page}: clicar em Reset não abriu a janela de confirmação`);
  const confirmButton = confirmation.querySelector('[data-processor-reset-choice="confirm"]');
  assert(confirmButton, `${page}: confirmação sem botão de confirmar`);
  confirmButton.click();
  assert(!root.querySelector('[data-processor-reset-confirmation]'),
    `${page}: confirmar não fechou a janela de confirmação`);
}

console.log('PROCESSOR_RESET_OK: Reset por aba abre a confirmação e reseta em EQ, Compressor, Reverb, Delay, Rotary e Chorus');
