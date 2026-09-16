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
    if (command === 'module_meter_levels') return Array(16).fill(0);
    if (command === 'module_analysis') return [0, 0];
    if (command === 'audio_load') return [0.1, 0.1, 0];
    return 1;
  },
  transformCallback: () => 1,
};
window.eval(compiled.outputFiles[0].text);
const root = window.document.createElement('div');
window.document.body.append(root);
const player = new window.HookPlayer.PlayerScreen(root, { email: 'style@example.invalid', name: 'Style test' },
  async () => {}, { getSoundCatalog: async () => ({ categories: [], sounds: [] }), getCompatibilityVideoUrl: async () => '' },
  { load: async () => null, save() {}, saveNow() {}, persistNow() {}, destroy() {} }, { start() {}, stop() {}, destroy() {} });
try {
  player.mount();
  await player.nativeBootPromise;

  const keyboard = window.document.querySelector('[data-performance-keyboard]');
  assert(keyboard, 'o teclado existe no DOM');
  const styleOf = () => ['standard', 'black', 'hook']
    .filter(name => keyboard.classList.contains(`performance-keyboard--${name}`));
  assert.deepEqual(styleOf(), ['standard'], 'o teclado nasce no estilo padrão');

  player.openModal('keyboard-settings', null, window.document.createElement('button'));
  const modal = player.modal;
  assert(modal, 'o modal de configurações do teclado abre');
  const choices = [...modal.querySelectorAll('[data-keyboard-style]')];
  assert.deepEqual(choices.map(button => button.dataset.keyboardStyle), ['standard', 'black', 'hook'],
    'os três estilos aparecem');
  assert.deepEqual(choices.map(button => button.textContent.trim()), ['Default', 'Black', 'Hook'],
    'os estilos se chamam Default, Black e Hook');

  // Cada escolha precisa trocar a classe no teclado, e só uma pode ficar.
  for (const wanted of ['hook', 'black', 'standard', 'hook', 'standard']) {
    const button = choices.find(candidate => candidate.dataset.keyboardStyle === wanted);
    button.dispatchEvent(new window.Event('click', { bubbles: true }));
    assert.deepEqual(styleOf(), [wanted], `escolher ${wanted} aplica ${wanted} e remove os outros`);
    assert.equal(player.keyboardStyle, wanted, `o estado guarda ${wanted}`);
    const selected = choices.filter(candidate => candidate.classList.contains('is-selected'));
    assert.deepEqual(selected.map(candidate => candidate.dataset.keyboardStyle), [wanted],
      `só o botão ${wanted} fica marcado`);
  }
  // No desktop o modal de Mostrar nao existe, entao o estilo precisa estar
  // alcancavel pelas Configuracoes - era esse o caminho que faltava.
  player.closeModal();
  player.openModal('app-settings', null, window.document.createElement('button'));
  const settings = player.modal;
  const desktopChoices = [...settings.querySelectorAll('[data-keyboard-style]')];
  assert.deepEqual(desktopChoices.map(button => button.textContent.trim()), ['Default', 'Black', 'Hook'],
    'as Configuracoes do desktop oferecem os tres estilos');
  assert.deepEqual([...settings.querySelectorAll('[data-desktop-keyboard-midi-slot]')].map(b => b.textContent.trim()),
    ['MIDI 1', 'MIDI 2', 'MIDI 3'], 'o grupo de cima diz que roteia MIDI, nao que muda o visual');
  for (const wanted of ['black', 'hook', 'standard']) {
    desktopChoices.find(c => c.dataset.keyboardStyle === wanted)
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    assert.deepEqual(styleOf(), [wanted], `pelas Configuracoes, ${wanted} tambem se aplica`);
  }

  console.log('KEYBOARD_STYLE_OK: os tres estilos trocam no modal do teclado e nas Configuracoes do desktop');
} finally {
  await window.happyDOM.abort();
}
