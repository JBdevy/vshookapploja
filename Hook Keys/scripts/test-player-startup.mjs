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
const calls = [];
let transitionBarrier = null;
let meterLevels = [0.25, 0.1, ...Array(12).fill(0), 0.5, 0.2];
let processCpuUsage = 12;
window.__TAURI_INTERNALS__ = {
  invoke: async (command, args) => {
    calls.push({ command, args });
    if (command === 'begin_preset_transition' && transitionBarrier) await transitionBarrier;
    if (command === 'initialize' || command === 'audio_output_status') return { ready: true, failed: false };
    if (command === 'list_midi_devices' || command === 'list_audio_output_devices') return [];
    if (command === 'module_meter_levels') return meterLevels;
    if (command === 'begin_sound_font_upload') return { cached: true };
    if (command === 'module_analysis') return [0.5, 0.25];
    if (command === 'process_cpu_usage') return processCpuUsage;
    return 1;
  },
  transformCallback: () => 1,
};
window.eval(compiled.outputFiles[0].text);
assert.equal(window.HookPlayer.isCellularPlayerViewport(844, 390, false), true,
  'iPhone em paisagem usa o layout celular sem Keyboard');
assert.equal(window.HookPlayer.isCellularPlayerViewport(915, 412, false), true,
  'Android em paisagem usa o layout celular sem Keyboard');
assert.equal(window.HookPlayer.isCellularPlayerViewport(1024, 768, false), false,
  'tablet mantém o Keyboard');
assert.equal(window.HookPlayer.isCellularPlayerViewport(800, 500, true), false,
  'desktop mantém o Keyboard mesmo com uma janela menor');
const playerCss = await import('node:fs/promises').then(({ readFile }) => readFile('src/styles.css', 'utf8'));
const readSource = (path) => import('node:fs/promises').then(({ readFile }) => readFile(path, 'utf8'));
const playerSource = await readSource('src/features/player/PlayerScreen.ts');
const compatibilityNativeSources = await Promise.all([
  readSource('native-engine/src/NativeEngineRuntime.cpp'),
  readSource('src-tauri/src/main.rs'),
  readSource('android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java'),
  readSource('ios/App/App/HookKeysNativeEngine.mm'),
]);
for (const source of compatibilityNativeSources) {
  assert.match(source, /(?:messageType|message_type|type)\s*==\s*0xc0/,
    'modo compatibilidade bloqueia Program Change antes de chegar ao SF2 em todas as plataformas');
}
assert.match(playerCss,
  /\.player-screen--cellular \.player-bank-view\.player-bank-view--cellular[\s\S]*?grid-template-rows:\s*minmax\(0, 1fr\) auto/,
  'no celular, a altura retirada do Keyboard aumenta a linha dos módulos');
assert.match(playerCss, /\.player-modal--app-settings select\[data-setting\]:not\(\.app-select__native\)[\s\S]*?visibility:\s*hidden/,
  'o seletor nativo fica oculto antes do seletor próprio ser montado');
assert.match(playerCss,
  /\.performance-section\.performance-section--effects\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*grid-template-rows:\s*minmax\(28px, auto\) minmax\(0, 1fr\)/,
  'os oito bancos FX ficam numa linha inteira acima dos pads de efeito');
for (const [selector, column, row] of [
  ['\\.app-settings-field--audio-device', 1, 1],
  ['\\.app-settings-field--buffer', 2, 1],
  ['\\[data-audio-route-field="timbres"\\]', 1, 2],
  ['\\[data-audio-route-field="music"\\]', 2, 2],
  ['\\[data-audio-route-field="pads"\\]', 1, 3],
  ['\\[data-audio-route-field="effects"\\]', 2, 3],
  ['\\[data-audio-route-field="metronome"\\]', 1, 4],
  ['\\.app-settings-field--sample-rate', 2, 4],
]) {
  assert.match(playerCss, new RegExp(`${selector}\\s*\\{[^}]*grid-column:\\s*${column};[^}]*grid-row:\\s*${row};`),
    `posição fixa do campo de áudio ${selector}`);
}
// Em Default os parâmetros do módulo ficam travados: os testes mexem em User.
const useUserSettings = () => window.document.querySelector('[data-module-settings-mode="user"]')?.click();
const root = window.document.createElement('div');
window.document.body.append(root);
const player = new window.HookPlayer.PlayerScreen(root, { email: 'startup@example.invalid', name: 'Startup test' },
  async () => {}, { getSoundCatalog: async () => ({ categories: [], sounds: [] }), getCompatibilityVideoUrl: async () => '' },
  { load: async () => null, save() {}, saveNow() {}, persistNow() {}, destroy() {} }, { start() {}, stop() {}, destroy() {} });
try {
  player.mount();
  player.sendNativeMidi(3, 0x90, 60, 127);
  player.sendNativeMidi(3, 0x80, 60, 0);
  await player.nativeBootPromise;
  assert(!calls.some(({ command }) => command === 'send_midi'),
    'notas tocadas durante o carregamento não são guardadas');
  player.sendNativeMidi(3, 0x90, 62, 127);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert(!calls.some(({ command }) => command === 'send_midi'),
    'motor pronto continua bloqueado até a animação terminar');
  await player.activateLiveMidi();
  const initialModuleConfigs = calls.filter(({ command }) => command === 'configure_module')
    .slice(-8);
  assert.equal(initialModuleConfigs.length, 8, 'a abertura configura os oito módulos no motor');
  assert(initialModuleConfigs.every(({ args }) => args.config.inputSlot === 0xff),
    'sem dispositivo específico, todos os módulos aceitam qualquer entrada MIDI e o teclado da tela');
  assert(!root.querySelector('.player-next-field'), 'o campo Próxima saiu do topo');
  const globalOctaveUp = root.querySelector('[data-action="global-octave-up"]');
  assert(globalOctaveUp, 'o topo mostra o controle de oitava geral');
  assert.deepEqual([...root.querySelectorAll('.player-header-knobs .player-output-knob > span:first-child')]
    .map(label => label.textContent.trim()), ['Playlist', 'Pads', 'Efects', 'Click', 'Módulos']);
  assert.equal(root.querySelectorAll('.player-header-knobs__divider').length, 0,
    'os cinco knobs principais ficam sem barras entre eles');
  assert(!root.querySelector('[data-action="open-tracks"]'), 'a Playlist saiu do topo');
  assert.equal(root.querySelectorAll('.player-module').length, 8, 'mantém os oito módulos');
  assert.deepEqual(
    [...root.querySelectorAll('[data-action="select-pad-bank"]')].map(button => button.textContent.trim()),
    ['Pads 1', 'Pads 2'],
    'a interface mantém somente os dois bancos SF2 de Pads',
  );
  assert(root.querySelector('[data-pad-low-cut]'), 'LOW oferece o high-pass dos Pads');
  assert(root.querySelector('[data-pad-high-cut]'), 'HIGH oferece o low-pass dos Pads');
  assert.deepEqual(
    [...root.querySelectorAll('.performance-pad--note > span')].map(label => label.textContent.trim()),
    ['C - Am', 'C# - Bbm', 'D - Bm', 'D# - Cm', 'E - C#m', 'F - Dm',
      'F# - Ebm', 'G - Em', 'G# - Fm', 'A - F#m', 'A# - Gm', 'B - G#m'],
    'cada Pad mostra a tonalidade maior e sua relativa menor',
  );
  root.querySelector('[data-action="show-pads-effects"]').click();
  assert.deepEqual(
    [...root.querySelectorAll('.performance-pad--effect > span')].map(label => label.textContent.trim()),
    ['Kick', 'Bump', 'SineDrop', 'BourineFx', 'ClapFx', 'ClapVerb',
      'ClapBourine', 'PluckFx', 'ClipVerb', 'Carillon', 'DoupFx', 'Reverse'],
    'FX 1 mostra os doze efeitos nativos empacotados no app',
  );
  const fxOneBank = root.querySelector('[data-action="select-effect-bank"][data-effect-bank="1"]');
  fxOneBank.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  assert(fxOneBank.classList.contains('is-editing'), 'FX 1 entra no modo Edit');
  root.querySelector('[data-action="show-bank"][data-bank="A"]').click();
  assert(!fxOneBank.classList.contains('is-editing'),
    'sair de Pads - Effects encerra o modo Edit');
  const factoryModules = player.getActivePresetState().modules;
  assert(factoryModules.every((module) => module.lowNote === 21 && module.highNote === 108),
    'na primeira abertura todos os módulos usam a faixa MIDI 21..108');
  assert(factoryModules.every((_, index) => {
    const module = root.querySelector(`.player-module[data-module="${index + 1}"]`);
    return module?.querySelector('[data-action="learn-note-range"][data-bound="low"]')?.textContent === 'A-1'
      && module?.querySelector('[data-action="learn-note-range"][data-bound="high"]')?.textContent === 'C7';
  }), 'na primeira abertura todos os módulos mostram A-1 e C7');
  assert.equal(factoryModules[6].settings.tranceGate.enabled, false,
    'o Trance Gate do Organ nasce desligado');
  assert.equal(
    JSON.stringify(factoryModules.map((module) => {
      const reverb = module.settings.reverb;
      return [reverb.decay, reverb.dampen, reverb.size];
    })),
    JSON.stringify(Array.from({ length: 8 }, () => [1.2, 62, 18])),
    'o Reverb de fábrica nasce no ambiente Room em todos os módulos',
  );
  assert.equal(factoryModules[6].settings.modulationMode, 'rotary',
    'a roda Mod do Organ nasce em Rotary');
  assert.equal(factoryModules[6].settings.rotary.modulationEnabled, true,
    'o Rotary do Organ responde à roda Mod sem um segundo botão On/Off');
  assert.deepEqual(
    [...root.querySelectorAll('.keyboard-expression__track i b')].map((label) => label.textContent),
    ['H', 'K'],
    'H e K ficam dentro dos botões móveis de Pitch e Modulation',
  );
  assert.doesNotMatch(playerCss, /\.keyboard-expression--mod \.keyboard-expression__track i\s*\{[^}]*opacity:\s*0/,
    'o botão móvel do Modulation continua visível sobre a barra laranja');
  const moduleOctaves = player.getActivePresetState().modules.map(module => module.octaveShift);
  globalOctaveUp.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(player.globalOctaveShift, 1, 'OCT + altera a oitava geral da entrada');
  assert.deepEqual(player.getActivePresetState().modules.map(module => module.octaveShift), moduleOctaves,
    'OCT geral não altera o Oct individual dos módulos');
  assert(calls.some(({ command, args }) => command === 'set_global_transpose' && args?.semitones === 12),
    'uma oitava geral é enviada ao motor como 12 semitons');
  assert.deepEqual(
    [...root.querySelectorAll('.player-global-pitch__separator')].map((separator) => separator.textContent),
    ['|', '|', '|'],
    'barras verticais separam OCT, TRS, STEREO e PANIC',
  );
  assert.equal(root.querySelectorAll('.player-global-pitch__group > span').length, 0,
    'não repete os nomes OCT e TRANS ao lado dos botões');
  const moduleOutputMode = root.querySelector('[data-action="toggle-module-output-mode"]');
  assert.equal(moduleOutputMode.textContent, 'STEREO');
  const beforeDualMono = calls.length;
  moduleOutputMode.click();
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(moduleOutputMode.textContent, 'MONO');
  const dualMonoConfigs = calls.slice(beforeDualMono).filter(({ command }) => command === 'configure_module');
  assert.equal(new Set(dualMonoConfigs.map(({ args }) => args.config.moduleIndex)).size, 8,
    'Mono atualiza os oito módulos');
  assert(dualMonoConfigs.every(({ args }) => args.config.outputDualMono === true),
    'Mono envia L+R duplicado somente pela configuração dos módulos');
  moduleOutputMode.click();
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(moduleOutputMode.textContent, 'STEREO');
  {
    const modal = window.document.createElement('div');
    modal.innerHTML = `<p data-user-sf2-load-status></p><div data-user-sf2-list></div>
      <button data-user-sf2-action="name">Add SF2</button>
      <div data-user-sf2-name><input data-user-sf2-name-input value="Piano">
        <p data-user-sf2-message></p><button data-user-sf2-action="choose-file">Confirmar</button>
        <button data-user-sf2-action="cancel">Cancelar</button>
      </div><input type="file" data-user-sf2-file>`;
    window.document.body.append(modal);
    const input = modal.querySelector('[data-user-sf2-file]');
    Object.defineProperty(input, 'files', { value: [new window.File(['test'], 'piano.sf2')], configurable: true });
    input.dataset.soundfontName = 'Piano';
    const originalLibrary = player.soundLibrary;
    const originalRender = player.renderUserSoundfonts;
    let completeImport, importCount = 0, rendered = false;
    player.soundLibrary = { addUser: async () => {
      importCount += 1; await new Promise(resolve => { completeImport = resolve; });
    } };
    player.renderUserSoundfonts = async () => { rendered = true; };
    try {
      const importing = player.importUserSoundfont(modal, input);
      assert.equal(modal.dataset.userSf2Importing, 'true');
      assert(modal.querySelector('[data-user-sf2-action="choose-file"]').disabled,
        'Confirmar fica bloqueado enquanto grava o SF2');
      await player.importUserSoundfont(modal, input);
      assert.equal(importCount, 1, 'toque repetido não adiciona o mesmo arquivo duas vezes');
      completeImport(); await importing;
      assert.equal(modal.querySelector('[data-user-sf2-name]').hidden, true,
        'sucesso retorna à biblioteca e remove a tela de confirmação');
      assert.equal(modal.querySelector('[data-user-sf2-name-input]').value, '');
      assert(rendered);
      assert.match(modal.querySelector('[data-user-sf2-load-status]').textContent, /Piano adicionado/);
      assert.equal(modal.dataset.userSf2Importing, undefined);
      assert(!modal.querySelector('[data-user-sf2-action="name"]').disabled);
      modal.querySelector('[data-user-sf2-name]').hidden = false;
      input.dataset.soundfontName = 'Piano';
      player.soundLibrary = { addUser: async () => { throw new Error('storage failed'); } };
      await player.importUserSoundfont(modal, input);
      assert.equal(modal.querySelector('[data-user-sf2-name]').hidden, false,
        'falha mantém o editor aberto para o usuário tentar novamente');
      assert.match(modal.querySelector('[data-user-sf2-message]').textContent, /Não foi possível/);
      assert.equal(modal.dataset.userSf2Importing, undefined);
    } finally {
      player.soundLibrary = originalLibrary;
      player.renderUserSoundfonts = originalRender;
      modal.remove();
    }
  }
  player.sendNativeMidi(3, 0x90, 64, 127);
  player.sendNativeMidi(3, 0x80, 64, 0);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls.filter(({ command }) => command === 'send_midi').length, 2,
    'somente mensagens novas após liberar a interface chegam ao motor');
  assert.equal(player.getActivePresetState().modules[7].settings.velocityCurve.mode, 'soft', 'o Synth nasce em Soft');
  assert.equal(player.getActivePresetState().modules[7].settings.synth.noVelocitySensitivity, true, 'o Synth nasce com No Sens ligado');
  assert.equal(player.getActivePresetState().modules[5].settings.velocityCurve.mode, 'soft',
    'o módulo 6 voltou a ser um módulo normal, sem curva de velocity fixa');
  {
    const current = JSON.parse(JSON.stringify(player.createSavedPlayerState()));
    const soft = { mode: 'soft', points: [0, 16, 44, 84, 127], userPoints: [0, 32, 64, 96, 127], fixedValue: 100 };
    const fixed127 = { mode: 'fixed', points: [127, 127, 127, 127, 127], userPoints: [0, 32, 64, 96, 127], fixedValue: 127 };
    const legacy = JSON.parse(JSON.stringify(current));
    delete legacy.fixedModuleVelocityDefault;
    legacy.banks.A.presets[0].modules[5].settings.velocityCurve = soft;
    legacy.banks.A.presets[0].modules[7].settings.velocityCurve = soft;
    legacy.banks.A.presets[0].modules[0].settings.velocityCurve = soft;
    player.applySavedPlayerState(legacy);
    assert.equal(player.bankStates.get('A').presets[0].modules[5].settings.velocityCurve.mode, 'soft',
      'módulo 6 voltou a ser normal: o Soft antigo permanece em Soft');
    assert.equal(player.bankStates.get('A').presets[0].modules[7].settings.velocityCurve.mode, 'soft',
      'o Synth antigo em Soft continua em Soft');
    assert.equal(player.bankStates.get('A').presets[0].modules[0].settings.velocityCurve.mode, 'soft',
      'módulos de timbre continuam em Soft');
    // A v1 deixou o Synth em Fixed 127; agora ele volta para o Soft de fábrica.
    const fromV1 = JSON.parse(JSON.stringify(current));
    fromV1.fixedModuleVelocityDefault = 'v1';
    for (const [bank, preset] of [['A', 0], ['B', 3]]) fromV1.banks[bank].presets[preset].modules[7].settings.velocityCurve = fixed127;
    player.applySavedPlayerState(fromV1);
    for (const [bank, preset] of [['A', 0], ['B', 3]]) {
      assert.equal(player.bankStates.get(bank).presets[preset].modules[7].settings.velocityCurve.mode, 'soft',
        'o Fixed 127 de fábrica do Synth volta para Soft');
    }
    const chosenFixed = JSON.parse(JSON.stringify(current));
    chosenFixed.banks.A.presets[0].modules[7].settings.velocityCurve = fixed127;
    player.applySavedPlayerState(chosenFixed);
    assert.equal(player.bankStates.get('A').presets[0].modules[7].settings.velocityCurve.mode, 'fixed',
      'Fixed 127 escolhido num estado atual é respeitado');
    const oldGlide = JSON.parse(JSON.stringify(current));
    delete oldGlide.moduleGlideDefault;
    Object.assign(oldGlide.banks.A.presets[1].modules[0].settings, { glideEnabled: false, glideMs: 120, glideSync: true });
    Object.assign(oldGlide.banks.A.presets[1].modules[1].settings, { glideEnabled: true, glideMs: 300 });
    player.applySavedPlayerState(oldGlide);
    const glideOff = player.bankStates.get('A').presets[1].modules[0].settings;
    assert.equal(glideOff.glideMs, 0, 'Glide OFF antigo vira 0 ms');
    assert.equal(glideOff.glideSync, false);
    assert.equal(player.bankStates.get('A').presets[1].modules[1].settings.glideMs, 300, 'Glide ON antigo mantém o tempo');
    assert(!('glideEnabled' in glideOff), 'o ON/OFF antigo sai do estado');
    const oldRate = JSON.parse(JSON.stringify(current));
    delete oldRate.modulationRateDefault;
    oldRate.banks.A.presets[3].modules[0].settings.modulationRateHz = 7.55;
    oldRate.banks.A.presets[3].modules[1].settings.modulationRateHz = 9;
    player.applySavedPlayerState(oldRate);
    assert.equal(player.bankStates.get('A').presets[3].modules[0].settings.modulationRateHz, 6.85, 'o Rate de fábrica 7,55 Hz vira 6,85 Hz');
    assert.equal(player.bankStates.get('A').presets[3].modules[1].settings.modulationRateHz, 9, 'um Rate escolhido é mantido');
    const middleFilter = { mode: 'middle', points: [0, 32, 64, 96, 127], userPoints: [0, 32, 64, 96, 127], fixedValue: 127 };
    const legacyFilter = JSON.parse(JSON.stringify(current));
    delete legacyFilter.filterVelocityDefault;
    for (const module of [0, 7]) legacyFilter.banks.A.presets[2].modules[module].settings.filterVelocityCurve = middleFilter;
    player.applySavedPlayerState(legacyFilter);
    for (const module of [0, 7]) {
      const filterSettings = player.bankStates.get('A').presets[2].modules[module].settings;
      assert.equal(filterSettings.filterVelocityCurve.mode, 'soft', 'Velocity do Cutoff em Middle de fábrica volta para a curva de fábrica');
      // Ligado nos módulos 1 e 2, desligado no resto: é o padrão de fábrica.
      assert.equal(filterSettings.filterVelocityEnabled, module === 0);
    }
    const chosenFilter = JSON.parse(JSON.stringify(current));
    chosenFilter.banks.A.presets[2].modules[7].settings.filterVelocityCurve = middleFilter;
    player.applySavedPlayerState(chosenFilter);
    assert.equal(player.bankStates.get('A').presets[2].modules[7].settings.filterVelocityCurve.mode, 'middle',
      'Middle escolhido no Cutoff num estado atual é respeitado');
    const chosen = JSON.parse(JSON.stringify(current));
    chosen.banks.A.presets[0].modules[7].settings.velocityCurve = soft;
    player.applySavedPlayerState(chosen);
    assert.equal(player.bankStates.get('A').presets[0].modules[7].settings.velocityCurve.mode, 'soft',
      'Soft escolhido pelo músico num estado atual é respeitado');
    player.applySavedPlayerState(current);
  }
  assert(calls.some(({ command }) => command === 'initialize'), 'mount deve iniciar o motor');
  // Todo módulo nasce desligado, o Synth incluído: o músico liga o que for usar.
  assert(calls.filter(({ command, args }) => command === 'configure_module' && args.config.moduleIndex === 7)
    .every(({ args }) => !args.config.enabled), 'Synth nasce desligado como qualquer outro módulo');
  assert(calls.filter(({ command }) => command === 'configure_module_effects')
    .every(({ args }) => args.config.compressorMix === 0), 'compressor desligado não recebe mix ativo no boot');
  root.querySelector('[data-action="toggle-metronome"]').click();
  await new Promise(resolve => setTimeout(resolve, 150));
  assert(calls.some(({ command, args }) => command === 'configure_metronome' && args.enabled && args.volume > 0), 'click deve enviar metrônomo audível');
  assert(calls.some(({ command, args }) => command === 'set_output_gain' && args.enabled && args.db > -60), 'master deve estar audível');
  assert.equal(root.querySelectorAll('[data-action="adjust-tempo"]').length, 2, 'BPM tem botões menos e mais nas laterais');
  root.querySelector('[data-tempo-step="0.5"]').click();
  assert.equal(player.metronome.getBpm(), 120.5, 'mais aumenta o BPM em 0,5');
  root.querySelector('[data-tempo-step="-0.5"]').click();
  assert.equal(player.metronome.getBpm(), 120, 'menos diminui o BPM em 0,5');
  player.metronome.setBpm(999);
  assert.equal(player.metronome.getBpm(), 300, 'BPM máximo é 300');
  player.metronome.setBpm(1);
  assert.equal(player.metronome.getBpm(), 60, 'BPM mínimo é 60');
  player.metronome.setBpm(120);
  const panel = root.querySelector('[data-player-bottom-panel]');
  assert(panel.classList.contains('player-presets--combined'));
  assert(!panel.classList.contains('is-keyboard'), 'combined layout must not inherit keyboard-only CSS');
  assert(!panel.querySelector('.player-presets__grid').hidden);
  assert(!panel.querySelector('[data-performance-keyboard]').hidden);
  // Topo com ícones, módulo com Config e + quando está sem timbre.
  assert(root.querySelector('[data-action="open-app-settings"] svg'), 'Settings é um ícone de engrenagem');
  assert.equal(root.querySelector('[data-action="open-user"]').getAttribute('aria-label'), 'Conta');
  assert(root.querySelector('[data-action="open-user"] svg'), 'User é um ícone de conta');
  assert.equal(root.querySelector('[data-action="open-module-settings"][data-module="1"]').textContent.trim(), 'Config');
  const emptySound = root.querySelector('[data-module="1"] .player-module__sound-label');
  assert.equal(emptySound.textContent, '+', 'módulo sem timbre mostra +');
  assert(emptySound.classList.contains('is-empty'));
  assert.match(root.querySelector('[data-module="1"] .player-module__sound-button').getAttribute('aria-label'), /Sem timbre/);
  player.openModal('app-settings', null, root.querySelector('[data-action="open-app-settings"]'));
  {
    // O perfil leve (sem animações) vale sempre. O Modo Lite que se liga em
    // Settings é só para o App: no desktop ele nem aparece.
    assert(root.classList.contains('hook-keys-lite'), 'o perfil leve fica sempre aplicado');
    assert(!window.document.querySelector('[data-setting="lite-mode"]'),
      'o Modo Lite é só do App, não do desktop');

    const compatibility = window.document.querySelector('[data-setting="compatibility-mode"]');
    const callsBeforeCompatibility = calls.length;
    compatibility.checked = true;
    compatibility.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(player.currentModalKind, 'compatibility-mode',
      'a alteração do modo compatibilidade exige confirmação');
    window.document.querySelector('[data-modal-action="apply-compatibility"]').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(player.compatibilityMode, true, 'a confirmação ativa o modo na interface');
    assert(calls.slice(callsBeforeCompatibility).some(({ command, args }) => (
      command === 'set_compatibility_mode' && args?.enabled === true
    )), 'a confirmação aplica o modo imediatamente ao motor nativo');
    assert.equal(player.createSavedPlayerState().compatibilityMode, true,
      'o modo confirmado entra no estado persistente do usuário');

    const compatibilityAfterApply = window.document.querySelector('[data-setting="compatibility-mode"]');
    compatibilityAfterApply.checked = false;
    compatibilityAfterApply.dispatchEvent(new window.Event('change', { bubbles: true }));
    window.document.querySelector('[data-modal-action="apply-compatibility"]').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(player.compatibilityMode, false, 'a confirmação também desativa o modo imediatamente');
    assert(calls.slice(callsBeforeCompatibility).some(({ command, args }) => (
      command === 'set_compatibility_mode' && args?.enabled === false
    )), 'a desativação também chega ao motor nativo sem reiniciar o áudio');
  }
  player.closeModal();
  player.openModal('about', null, root.querySelector('[data-action="open-about"]'));
  assert(!window.document.querySelector('[data-setting="lite-mode"]'), 'o Modo Lite não fica na tela da versão');
  player.closeModal();
  player.openTracksSplitView();
  assert(!root.querySelector('.tracks-horizontal-scroll-guide'), 'desktop has no drag-here bar');
  {
    const controls = [...root.querySelectorAll('.tracks-split-controls button')].map((button) => button.dataset.tracksAction);
    assert.equal(JSON.stringify(controls.slice(0, 2)), JSON.stringify(['toggle-loop', 'toggle-auto']), 'Repetir fica à esquerda do Auto');
    const loop = root.querySelector('[data-tracks-action="toggle-loop"]');
    assert.equal(loop.getAttribute('aria-pressed'), 'false');
    assert.equal(player.trackTransport.audio.loop, false);
    loop.click();
    assert.equal(loop.getAttribute('aria-pressed'), 'true', 'Repetir liga');
    assert.equal(player.trackTransport.audio.loop, true, 'a música passa a repetir');
    loop.click();
    assert.equal(player.trackTransport.audio.loop, false, 'Repetir desliga');
  }
  player.closeTracksSplitView();
  const synthFader = root.querySelector('[data-module-fader="8"]');
  // Janela do medidor em 100% = vazio; um pico nativo precisa subir a janela.
  assert.notEqual(synthFader.querySelector('.player-module__meter-fill--left')?.style.transform, 'translate3d(0, 100.00%, 0)', 'native Synth left peak reaches the fader');
  assert.notEqual(synthFader.querySelector('.player-module__meter-fill--right')?.style.transform, 'translate3d(0, 100.00%, 0)', 'native Synth right peak reaches the fader');
  const master = root.querySelector('[data-output-level="master"]');
  const synthShortcut = root.querySelector('[data-module="8"] .player-module__sound-button');
  assert.equal(synthShortcut.textContent.trim(), 'Synth');
  synthShortcut.click();
  assert.equal(player.currentModalKind, 'module-synth', 'botão frontal abre diretamente o editor');
  let synthMode = window.document.querySelector('[data-synth-voice-mode]');
  assert.equal(synthMode.textContent, 'Poly', 'o Synth abre no Preset 1 de fábrica, em Poly');
  assert.equal(synthMode.nextElementSibling.dataset.synthToggle, 'legato');
  synthMode.click();
  await player.syncNativeEngine();
  assert.equal(synthMode.textContent, 'Mono');
  assert(synthMode.classList.contains('is-mono'));
  assert.equal(calls.filter(c => c.command === 'configure_synth').at(-1).args.config.voiceMode, 1, 'Mono sem Legato');
  synthMode.click();
  await player.syncNativeEngine();
  assert.equal(synthMode.textContent, 'Poly');
  assert(synthMode.classList.contains('is-poly'));
  assert.equal(calls.filter(c => c.command === 'configure_synth').at(-1).args.config.voiceMode, 0);
  synthMode.click();
  await player.syncNativeEngine();
  assert.equal(synthMode.textContent, 'Mono');
  {
    const footer = [...window.document.querySelectorAll('.player-modal__actions > button')].map((button) => button.textContent.trim());
    assert.deepEqual(JSON.stringify(footer), JSON.stringify(['Voltar', 'Reset', 'OK']), 'Reset fica entre Voltar e OK');
    assert.equal(window.document.querySelectorAll('[data-synth-preset]').length, 5, 'o Synth tem cinco presets');
    const synthState = player.getActivePresetState().modules[7].settings;
    assert.equal(synthState.synthActivePreset, 1);
    synthState.synthPresets[0] = { ...synthState.synth };
    window.document.querySelector('[data-modal-action="reset-synth-preset"]').click();
    const confirmation = window.document.querySelector('[data-synth-reset-confirmation]');
    assert(confirmation, 'Reset pede confirmação');
    assert.match(confirmation.textContent, /Resetar Preset 1\?/);
    confirmation.querySelector('[data-synth-reset-choice="cancel"]').click();
    assert(!window.document.querySelector('[data-synth-reset-confirmation]'), 'Cancelar fecha a confirmação');
    assert.equal(player.getActivePresetState().modules[7].settings.synth.voiceMode, 'mono', 'Cancelar não altera o preset');
    window.document.querySelector('[data-modal-action="reset-synth-preset"]').click();
    window.document.querySelector('[data-synth-reset-choice="confirm"]').click();
    const reset = player.getActivePresetState().modules[7].settings;
    assert.equal(reset.synth.voiceMode, 'poly', 'Reset volta o Preset 1 para Poly de fábrica');
    assert.equal(reset.synth.releaseMs, 85);
    assert.equal(reset.synthPresets[0].voiceMode, 'poly', 'o slot salvo também volta à fábrica');
    assert.equal(window.document.querySelector('[data-synth-voice-mode]').textContent, 'Poly', 'o editor mostra o preset resetado');
    assert.equal(player.currentModalKind, 'module-synth', 'o editor continua aberto após o Reset');
    await player.syncNativeEngine();
    assert.equal(calls.filter(c => c.command === 'configure_synth').at(-1).args.config.voiceMode, 0, 'o motor recebe o preset de fábrica');
    // Arrastar um knob envia ao motor enquanto ele se move, não só ao soltar.
    const attack = window.document.querySelector('[data-synth-parameter="attackMs"]');
    const sentAttacks = () => calls.filter(c => c.command === 'configure_synth').map(c => c.args.config.attackMs);
    const before = sentAttacks().length;
    for (const value of [100, 200, 300, 400, 500, 600]) {
      attack.value = String(value);
      attack.dispatchEvent(new window.Event('input', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    const duringDrag = sentAttacks().slice(before);
    assert(duringDrag.some(value => value > 0 && value < 600), `o motor recebe valores durante o arraste: ${duringDrag.join(', ')}`);
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.equal(sentAttacks().at(-1), 600, 'o último valor do arraste chega ao motor');
    attack.value = '8';
    attack.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(
      player.getActivePresetState().modules[7].settings.synthPresets[0].attackMs,
      8,
      'cada alteração do Synth é salva automaticamente no preset ativo',
    );
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  player.closeModal();
  {
    const cc = (controller, value) => player.handleMidiControlChange({ controller, value, channel: 1, inputId: 'cc-test' });
    const press = (controller) => { cc(controller, 0); cc(controller, 127); };
    const learn = (selector, controller) => {
      const button = root.querySelector(selector);
      player.onRootContextMenu({ target: button, preventDefault() {} });
      if (player.currentModalKind === 'module-power-learn-choice') {
        window.document.querySelector('[data-module-learn-choice="power"]').click();
      }
      assert.equal(player.currentModalKind, 'cc-learn', `${selector} abre o Learn CC`);
      cc(controller, 127);
      window.document.querySelector('[data-modal-action="confirm-cc-learn"]').click();
    };
    const moduleState = (number) => player.getActivePresetState().modules[number - 1];
    // A-1 e C7 não entram no Learn.
    player.onRootContextMenu({ target: root.querySelector('[data-action="learn-note-range"][data-module="1"]'), preventDefault() {} });
    assert.notEqual(player.currentModalKind, 'cc-learn', 'A-1 não é mapeável');
    player.closeModal();

    learn('[data-action="toggle-module"][data-module="3"]', 40);
    assert.equal(player.ccMappings.get('power:3'), 40);
    const enabled = moduleState(3).enabled;
    press(40);
    assert.equal(moduleState(3).enabled, !enabled, 'CC liga/desliga o módulo');
    assert.equal(root.querySelector('[data-action="toggle-module"][data-module="3"]').getAttribute('aria-pressed'), String(!enabled));
    press(40);
    assert.equal(moduleState(3).enabled, enabled);

    const moduleThreePower = root.querySelector('[data-action="toggle-module"][data-module="3"]');
    player.onRootContextMenu({ target: moduleThreePower, preventDefault() {} });
    assert.equal(player.currentModalKind, 'module-power-learn-choice');
    assert.deepEqual([...window.document.querySelectorAll('[data-module-learn-choice]')]
      .map(button => button.textContent.trim().split(/\s+/)[0]), ['ON/OFF', 'SOLO']);
    window.document.querySelector('[data-module-learn-choice="solo"]').click();
    cc(43, 127);
    window.document.querySelector('[data-modal-action="confirm-cc-learn"]').click();
    assert.equal(player.ccMappings.get('solo:3'), 43);
    press(43);
    assert.equal(player.soloedModuleNumber, 3, 'CC ativa o Solo escolhido no modal');
    press(43);
    assert.equal(player.soloedModuleNumber, null, 'o mesmo CC desativa o Solo');

    learn('[data-action="toggle-sustain-input"][data-module="4"]', 41);
    learn('[data-action="toggle-modulation-input"][data-module="4"]', 42);
    const hold = moduleState(4).sustainInputEnabled;
    const mod = moduleState(4).modulationInputEnabled;
    press(41);
    press(42);
    assert.equal(moduleState(4).sustainInputEnabled, !hold, 'CC alterna o HLD');
    assert.equal(moduleState(4).modulationInputEnabled, !mod, 'CC alterna o MOD');
    press(41);
    press(42);

    // Aprender o mesmo CC em outro controle tira o CC do anterior.
    learn('[data-action="octave-up"][data-module="2"]', 40);
    assert.equal(player.ccMappings.get('octave:2:up'), 40);
    assert(!player.ccMappings.has('power:3'), 'o CC sai do ON/OFF anterior');
    const octave = moduleState(2).octaveShift;
    press(40);
    assert.equal(moduleState(2).octaveShift, octave + 1, 'o CC comanda somente o controle novo');
    assert.equal(moduleState(3).enabled, enabled, 'o controle anterior não responde mais');
    player.shiftModuleOctave(2, -1);

    // Learn fica ouvindo continuamente e confirma somente o ultimo CC no OK.
    const learnFooter = () => [...window.document.querySelectorAll('.player-modal__actions > button')];
    player.onRootContextMenu({ target: root.querySelector('[data-action="octave-up"][data-module="2"]'), preventDefault() {} });
    // Sair sem mapear e limpar o mapeamento saem da propria tela de Learn.
    assert.equal(JSON.stringify(learnFooter().map((button) => button.textContent.trim())),
      JSON.stringify(['Voltar', 'Clean', 'OK']));
    cc(43, 127);
    cc(44, 127);
    cc(45, 127);
    assert.equal(player.pendingCcLearn.kind, 'module-octave', 'a escuta continua ativa após vários controles');
    assert.equal(player.ccMappings.get('octave:2:up'), 40, 'a seleção não altera o mapeamento antes do OK');
    assert.match(window.document.querySelector('[data-cc-learn-current]').textContent, /CC 45/);
    window.document.querySelector('[data-modal-action="confirm-cc-learn"]').click();
    assert.equal(player.ccMappings.get('octave:2:up'), 45, 'o último controle pressionado é confirmado');
    assert.equal(player.currentModalKind, null, 'OK fecha o Learn aberto pela interface principal');

    // Duplicatas de estados antigos: fica o mapeamento gravado por último.
    const saved = JSON.parse(JSON.stringify(player.createSavedPlayerState()));
    saved.ccMappings = { ...saved.ccMappings, 'power:1': 50, 'power:2': 50 };
    player.applySavedPlayerState(saved);
    assert(!player.ccMappings.has('power:1') && player.ccMappings.get('power:2') === 50, 'duplicatas salvas são limpas');
    for (const key of ['octave:2:up', 'input:4:sustain', 'input:4:modulation', 'power:2']) player.ccMappings.delete(key);

    // Knobs e faders podem inverter e limitar o destino sem reduzir o curso
    // físico do controlador. Botões continuam binários e não exibem a curva.
    const moduleFader = root.querySelector('[data-module-fader="1"] .player-module__fader-rail');
    player.openCcLearn({ kind: 'module-volume', moduleNumber: 1 }, moduleFader);
    const minimumLimit = window.document.querySelector('[data-cc-limit="minimum"]');
    const maximumLimit = window.document.querySelector('[data-cc-limit="maximum"]');
    assert(minimumLimit && maximumLimit, 'Learn de fader mostra as duas alças na mesma barra de Limite CC');
    maximumLimit.value = '76.4';
    maximumLimit.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.match(window.document.querySelector('[data-cc-limit-output]').textContent, /dB$/,
      'limite do fader é mostrado em dB, não em porcentagem genérica');
    window.document.querySelector('[data-cc-limit-endpoint="minimum"]').click();
    assert.equal(minimumLimit.value, '0', 'a alça mínima preserva sua própria posição');
    minimumLimit.value = '20';
    minimumLimit.dispatchEvent(new window.Event('input', { bubbles: true }));
    window.document.querySelector('[data-cc-limit-endpoint="maximum"]').click();
    assert.equal(maximumLimit.value, '76.4', 'a alça máxima preserva sua própria posição');
    cc(46, 127);
    window.document.querySelector('[data-modal-action="confirm-cc-learn"]').click();
    assert.equal(player.ccMappingOptions.get('module:1').inverted, false);
    assert.equal(player.ccMappingOptions.get('module:1').minimumPercent, 20);
    assert.equal(player.ccMappingOptions.get('module:1').maximumPercent, 76.4);
    cc(46, 127);
    assert(Math.abs(player.faders.get(1).getValueDb() - (-5.1)) < 0.11,
      '100% físico respeita o limite configurado abaixo do novo teto de 0 dB');
    cc(46, 0);
    const mappedMinimumDb = player.faders.get(1).getValueDb();
    assert(mappedMinimumDb > -90 && mappedMinimumDb < -5.1,
      '0% físico respeita o novo limite mínimo em vez de cair no fundo do fader');

    player.openCcLearn({ kind: 'module-volume', moduleNumber: 1 }, moduleFader);
    window.document.querySelector('[data-modal-action="toggle-cc-invert"]').click();
    window.document.querySelector('[data-modal-action="confirm-cc-learn"]').click();
    cc(46, 0);
    assert(Math.abs(player.faders.get(1).getValueDb() - (-5.1)) < 0.11,
      'Inverter troca o sentido e mantém o mesmo limite');
    cc(46, 127);
    assert(Math.abs(player.faders.get(1).getValueDb() - mappedMinimumDb) < 0.01,
      'fim invertido chega ao limite mínimo configurado');
    const curveBackup = JSON.parse(JSON.stringify(player.createSavedPlayerState()));
    player.ccMappingOptions.clear();
    player.applySavedPlayerState(curveBackup);
    assert.equal(player.ccMappingOptions.get('module:1').inverted, true,
      'inversão sobrevive ao backup');
    assert.equal(player.ccMappingOptions.get('module:1').minimumPercent, 20,
      'limite mínimo sobrevive ao backup');
    assert.equal(player.ccMappingOptions.get('module:1').maximumPercent, 76.4,
      'limite máximo sobrevive ao backup');

    player.openCcLearn({ kind: 'module-power', moduleNumber: 1 }, root.querySelector('[data-action="toggle-module"][data-module="1"]'));
    assert(!window.document.querySelector('[data-cc-limit]'), 'botões não recebem opções de curva contínua');
    player.closeModal();
    player.ccMappings.delete('module:1');
    player.ccMappingOptions.delete('module:1');

    player.openCcLearn({ kind: 'module-control', moduleNumber: 1, control: 'attackMs', label: 'Attack' }, moduleFader);
    assert.match(window.document.querySelector('[data-cc-limit-output]').textContent, /ms$/,
      'limite do Attack é mostrado em milissegundos');
    player.closeModal();
    player.openCcLearn({ kind: 'module-control', moduleNumber: 1, control: 'cutoff', label: 'Cutoff' }, moduleFader);
    assert.match(window.document.querySelector('[data-cc-limit-output]').textContent, /kHz$/,
      'limite do Cutoff é mostrado em frequência');
    player.closeModal();
  }

  // A prévia do editor também usa o visual de pad, mas não é um dos 12 pads
  // numerados. Atualizar o banco nunca pode transformar seu nome em Efeito NaN.
  player.activeEffectBank = '2';
  player.renderActiveEffectBank();
  const firstEffect = root.querySelector(
    '.performance-pad--effect[data-performance-kind="effect"][data-performance-value="1"]',
  );
  player.openEffectPadEditor(firstEffect);
  const effectPreviewName = window.document.querySelector('.effect-pad-editor__preview-button span');
  assert.equal(effectPreviewName.textContent.trim(), 'Efeito 1');
  const effectVolume = window.document.querySelector('[data-effect-pad-volume]');
  effectVolume.value = '-8';
  effectVolume.dispatchEvent(new window.Event('input', { bubbles: true }));
  player.renderActiveEffectBank();
  assert.equal(effectPreviewName.textContent.trim(), 'Efeito 1', 'volume não renomeia a prévia para Efeito NaN');
  player.closeModal();

  assert.equal(synthShortcut.textContent.trim(), 'Synth', 'alternar modo não muda o atalho frontal');
  player.openModal('module-settings', 8, master);
  useUserSettings();
  assert(!window.document.querySelector('.module-compressor-preview'),
    'o compressor não tem prévia em lugar nenhum');
  // O Config virou páginas: o Synth também tem a página do Chorus.
  assert(window.document.querySelector('[data-module-settings-page="chorus"]'),
    'o Param do Synth também tem Chorus');
  assert(!window.document.querySelector('[data-module-settings-page="envelope"]'),
    'o Synth cuida do envelope no editor dele');
  assert(!window.document.querySelector('[data-module-setting-action="open-synth"]'));
  {
    const row = window.document.querySelector('.module-settings-bottom-row');
    assert(row.querySelector('.module-velocity-card') && row.querySelector('[data-module-mod-card]'),
      'Param do Synth tem o card Mod na linha do Velocity');
    assert(!row.querySelector('[data-module-glide-card]'), 'o Glide do Synth fica no editor, não no Param');
    const lastMod = () => calls.filter(({ command, args }) => command === 'configure_module_modulation' && args.config.moduleIndex === 7).at(-1)?.args.config;
    await player.syncNativeEngine();
    assert.equal(lastMod()?.mode, 0, 'o card Mod do Synth nasce em User, como todos os módulos');
    assert(!window.document.querySelector('[data-module-modulation-rate]'), 'o Mod do Synth não tem Rate próprio');
    // O card não tem mais texto embaixo de "Mod": o botão aceso é que diz o modo.
    assert(!window.document.querySelector('[data-module-mod-card] header small'));
    assert.equal(window.document.querySelector('[data-module-modulation-mode="user"]').className, 'is-selected');
    window.document.querySelector('[data-module-modulation-mode="lfo"]').click();
    assert.equal(window.document.querySelector('[data-module-modulation-mode="lfo"]').className, 'is-selected');
    await player.syncNativeEngine();
    assert.equal(lastMod().mode, 1, 'LFO: a roda aciona o LFO do editor do Synth');
    // Tremolo é só do SF2: o card do Synth continua com User e LFO.
    assert(!window.document.querySelector('[data-module-modulation-mode="tremolo"]'),
      'o Mod do Synth não tem Tremolo');
    window.document.querySelector('[data-module-modulation-mode="user"]').click();
  }
  player.closeModal();
  {
    // Posição da música: agulha sobre a waveform; tocando, tentar mover avisa.
    player.closeModal();
    player.openModal('track-position', null, master);
    const waveform = window.document.querySelector('.waveform-position');
    assert(waveform.querySelector('.waveform-position__needle'), 'o modal tem a agulha');
    assert.equal(waveform.querySelectorAll('[data-waveform-bars] i').length, 96, 'a waveform tem uma barra por faixa da música');
    waveform.classList.add('is-locked');
    waveform.querySelector('.waveform-position__played').dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 31 }));
    const notice = waveform.querySelector('[data-waveform-notice]');
    assert(notice && !notice.hidden, 'tocar na waveform travada mostra o aviso');
    assert.equal(notice.textContent, 'Não é possível mover a posição com a música reproduzindo.');
    player.closeModal();
    // A agulha é arrastada pela waveform inteira (música parada de 200 s).
    const transport = player.trackTransport;
    const previousTrack = transport.selectedTrack;
    const previousState = transport.state;
    let seconds = 0;
    Object.defineProperty(transport.audio, 'duration', { configurable: true, get: () => 200 });
    Object.defineProperty(transport.audio, 'currentTime', { configurable: true, get: () => seconds, set: (value) => { seconds = value; } });
    transport.selectedTrack = { id: 'drag-test', name: 'Drag test' };
    transport.state = 'stopped';
    player.openModal('track-position', null, master);
    const dragWave = window.document.querySelector('.waveform-position');
    dragWave.getBoundingClientRect = () => ({ left: 100, top: 0, width: 224, height: 100, right: 324, bottom: 100 });
    dragWave.setPointerCapture = () => {};
    dragWave.hasPointerCapture = () => true;
    dragWave.releasePointerCapture = () => {};
    const pointer = (type, clientX) => dragWave.dispatchEvent(new window.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 41, clientX }));
    pointer('pointerdown', 162);
    assert.equal(seconds, 50, 'tocar na waveform leva a agulha até o ponto (25%)');
    pointer('pointermove', 262);
    assert.equal(seconds, 150, 'arrastar move a agulha junto com o dedo (75%)');
    assert.equal(dragWave.style.getPropertyValue('--track-ratio'), '0.75', 'a agulha acompanha o arraste');
    pointer('pointerup', 262);
    pointer('pointermove', 112);
    assert.equal(seconds, 150, 'depois de soltar, mover não altera a posição');
    transport.state = 'playing';
    pointer('pointerdown', 162);
    assert.equal(seconds, 150, 'tocando, a agulha não se move');
    player.closeModal();
    delete transport.audio.duration;
    delete transport.audio.currentTime;
    transport.selectedTrack = previousTrack;
    transport.state = previousState;
    player.openModal('module-delay', 1, master);
    // Limites de velocity: card Limite, limitador do Velocity e um limite por OSC no Synth.
    const lastLimits = (moduleIndex) => calls.filter(({ command, args }) => command === 'configure_velocity_limits' && args.config.moduleIndex === moduleIndex).at(-1)?.args.config;
    player.closeModal();
    player.openModal('module-settings', 2, master);
    useUserSettings();
    await player.syncNativeEngine();
    assert.equal(JSON.stringify(lastLimits(1)), JSON.stringify({ moduleIndex: 1, ignoreAbove: 127, ceiling: 127, oscillator1Limit: 127, oscillator2Limit: 127, oscillator3Limit: 127 }),
      'os limites nascem em 127');
    const limitKnob = window.document.querySelector('[data-module-velocity-limit]');
    limitKnob.value = '100';
    limitKnob.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(window.document.querySelector('[data-module-velocity-limit-value]').value, '100');
    await player.syncNativeEngine();
    assert.equal(lastLimits(1).ignoreAbove, 100, 'o card Limite chega ao motor');
    player.openModal('module-velocity', 2, master);
    const ceiling = window.document.querySelector('[data-velocity-ceiling]');
    assert(ceiling, 'o Velocity dos módulos 1 a 7 tem o limitador');
    ceiling.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
    ceiling.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    assert.equal(window.document.querySelector('[data-velocity-ceiling-output]').value, '116');
    await player.syncNativeEngine();
    assert.equal(lastLimits(1).ceiling, 116, 'o limitador chega ao motor');
    player.openModal('module-velocity', 8, master);
    assert(!window.document.querySelector('[data-velocity-ceiling]'), 'o Velocity do Synth não tem o limitador');
    player.openModal('module-synth', 8, master);
    const osc2Limit = window.document.querySelector('[data-synth-parameter="oscillator2VelocityLimit"]');
    osc2Limit.value = '90';
    osc2Limit.dispatchEvent(new window.Event('input', { bubbles: true }));
    await player.syncNativeEngine();
    assert.equal(JSON.stringify(lastLimits(7)), JSON.stringify({ moduleIndex: 7, ignoreAbove: 127, ceiling: 127, oscillator1Limit: 127, oscillator2Limit: 90, oscillator3Limit: 127 }),
      'o limite do OSC 2 chega ao motor');
    Object.assign(player.getActivePresetState().modules[1].settings, { velocityLimit: 127, velocityCeiling: 127 });
    player.getActivePresetState().modules[7].settings.synth = { ...player.getActivePresetState().modules[7].settings.synth, oscillator2VelocityLimit: 127 };
    player.closeModal();
    player.openModal('module-delay', 1, master);
    // A divisão não liga o Sync: sem ele, vale sobre os ms do knob.
    player.openModal('module-delay', 1, master);
    const delayState = () => player.getActivePresetState().modules[0].settings.delay;
    const sync = () => window.document.querySelector('[data-module-delay-sync]');
    assert.equal(sync().getAttribute('aria-pressed'), 'false', 'o Delay começa sem Sync');
    const lastEffects = () => calls.filter(({ command, args }) => command === 'configure_module_effects' && args.config.moduleIndex === 0).at(-1).args.config;
    for (const [division, multiplier] of [['1/2', 2], ['1/1', 4], ['1/16', 0.25]]) {
      window.document.querySelector(`[data-module-delay-division="${division}"]`).click();
      assert.equal(delayState().division, division);
      assert.equal(delayState().sync, false, `${division} não liga o Sync`);
      assert.equal(sync().getAttribute('aria-pressed'), 'false');
      await player.syncNativeEngine();
      assert.equal(lastEffects().delaySync, false);
      assert.equal(lastEffects().delayMs, 500, 'o knob continua nos ms escolhidos');
      assert.equal(lastEffects().delayBeatMultiplier, multiplier, `o motor recebe a divisão ${division}`);
    }
    sync().click();
    await player.syncNativeEngine();
    assert.equal(lastEffects().delaySync, true);
    assert.equal(lastEffects().delayBeatMultiplier, 0.25, 'com Sync a divisão continua valendo');
    assert.equal(delayState().milliseconds, 500, 'com Sync o knob guarda a batida do BPM (120 BPM = 500 ms)');
    sync().click();
    window.document.querySelector('[data-module-delay-division="1/4"]').click();
    player.closeModal();

    // Módulos 1 e 2 nascem com o Velocity do filtro ligado, em 110 Hz e curva Soft.
    for (const moduleIndex of [0, 1]) {
      const settings = player.getActivePresetState().modules[moduleIndex].settings;
      assert.equal(settings.filterVelocityEnabled, true, `módulo ${moduleIndex + 1} nasce com o Velocity do filtro ligado`);
      assert.equal(settings.filterVelocityCutoffHz, 110);
      assert.equal(settings.filterVelocityCurve.mode, 'soft');
    }
    for (const moduleIndex of [2, 4, 7]) {
      const settings = player.getActivePresetState().modules[moduleIndex].settings;
      assert.equal(settings.filterVelocityEnabled, false, `módulo ${moduleIndex + 1} continua com ele desligado`);
      assert.equal(settings.filterVelocityCutoffHz, 100);
    }

    // Velocity do filtro: ON/OFF embaixo e Cutoff próprio, de onde a curva começa.
    player.openModal('module-settings', 1, master);
    useUserSettings();
    window.document.querySelector('[data-module-setting-action="open-filter-velocity"]').click();
    assert.equal(player.currentModalKind, 'module-filter-velocity');
    const filterPower = () => window.document.querySelector('[data-filter-velocity-power]');
    const cutoffVelocity = () => [0, 1, 2, 3, 4].map((index) => lastEffects()[`cutoffVelocity${index}`]).join(',');
    assert.equal(filterPower().textContent, 'ON', 'no módulo 1 nasce ligado');
    assert.equal(window.document.querySelector('[data-filter-velocity-cutoff-value]').textContent, '110 Hz', 'e em 110 Hz');
    await player.syncNativeEngine();
    assert.equal(cutoffVelocity(), '31,43,64,95,127', 'ligado em Soft: de 110 Hz até 20 kHz');
    filterPower().click();
    assert.equal(filterPower().textContent, 'OFF');
    await player.syncNativeEngine();
    assert.equal(cutoffVelocity(), '127,127,127,127,127', 'desligado, o corte fica no Cutoff do Config');
    filterPower().click();
    assert.equal(filterPower().textContent, 'ON');
    const filterKnob = window.document.querySelector('[data-filter-velocity-cutoff]');
    filterKnob.value = String(Math.log(400 / 20) / Math.log(1000));
    filterKnob.dispatchEvent(new window.Event('input', { bubbles: true }));
    filterKnob.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(window.document.querySelector('[data-filter-velocity-cutoff-value]').textContent, '400 Hz');
    assert.equal(player.getActivePresetState().modules[0].settings.filterVelocityCutoffHz, 400);
    await player.syncNativeEngine();
    assert.equal(cutoffVelocity(), '55,64,80,103,127', 'com 400 Hz o Velocity trabalha de 400 Hz para cima');
    window.document.querySelector('[data-modal-action="confirm"]').click();
    assert.equal(player.currentModalKind, 'module-settings');
    assert(window.document.querySelector('[data-module-setting-action="open-filter-velocity"]').classList.contains('is-active'),
      'ligado, o botão Velocity do card Cutoff acende');
    Object.assign(player.getActivePresetState().modules[0].settings, { filterVelocityEnabled: true, filterVelocityCutoffHz: 110 });
    player.closeModal();
  }
  master.value = '100';
  master.dispatchEvent(new window.Event('input', { bubbles: true }));
  await player.syncNativeEngine();
  assert(calls.some(({ command, args }) => command === 'set_output_gain' && args.db === 0));
  assert.equal(root.querySelector('[data-output-value="master"]').value, '0.0 dB');
  player.faders.get(8).setValueDb(-12, true);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert(calls.some(({ command, args }) => command === 'set_module_gain' && args.moduleIndex === 7 && args.db === -12),
    'fader envia ganho ao motor durante a nota, sem esperar reconfigurar o módulo inteiro');
  const tap = (input, time) => {
    input.setPointerCapture = () => {};
    input.hasPointerCapture = () => false;
    const event = { target: input, isPrimary: true, pointerType: 'touch', button: 0, pointerId: 1, clientX: 50, clientY: 200, timeStamp: time, preventDefault() {} };
    player.startKnobDrag(event, player.currentModalModuleNumber);
    player.endKnobDrag({ ...event, type: 'pointerup', timeStamp: time + 30 });
  };
  tap(master, 1000); tap(master, 1150);
  assert.equal(master.value, '100', 'double tap resets master to unity at the 0dB ceiling');
  for (let module = 1; module <= 8; module++) {
    player.openModal('module-settings', module, master);
    useUserSettings();
    const glideCard = window.document.querySelector('[data-module-glide-card]');
    assert.equal(Boolean(glideCard), module <= 6);
    if (module === 7) {
      await player.syncNativeEngine();
      assert.equal(calls.filter(({command,args}) => command === 'configure_module_envelope' && args.config.moduleIndex === 6).at(-1).args.config.glideMs, 0);
      continue;
    }
    if (module > 7) continue;
    assert(!window.document.querySelector('[data-glide-power]'), 'o Glide dos módulos não tem ON/OFF');
    let knob = window.document.querySelector('[data-glide-time]');
    assert.equal(knob.value, '0', 'o Glide dos módulos nasce em 0 ms');
    await player.syncNativeEngine();
    assert.equal(calls.filter(({command,args}) => command === 'configure_module_envelope' && args.config.moduleIndex === module - 1).at(-1).args.config.glideMs, 0);
    knob.value = '450';
    knob.dispatchEvent(new window.Event('input', { bubbles: true }));
    await player.syncNativeEngine();
    assert(calls.some(({command,args}) => command === 'configure_module_envelope' && args.config.moduleIndex === module - 1 && args.config.glideMs === 450));
    window.document.querySelector('[data-glide-sync]').click();
    knob = window.document.querySelector('[data-glide-time]');
    assert.equal(knob.dataset.glideSynced, 'true');
    assert.equal(knob.getAttribute('aria-valuetext'), '120 BPM');
    assert.equal(knob.disabled, true, 'BPM global controls synchronized Glide');
    await player.syncNativeEngine();
    assert.equal(calls.filter(({command,args}) => command === 'configure_module_envelope' && args.config.moduleIndex === module - 1).at(-1).args.config.glideMs, 500);
    window.document.querySelector('[data-glide-sync]').click();
    knob = window.document.querySelector('[data-glide-time]');
    assert.equal(knob.value, '450', 'desligar Sync restaura o tempo manual');
    tap(knob, 2000 + module * 1000); tap(knob, 2150 + module * 1000);
    assert.equal(knob.value, '450', 'tocar no knob apenas abre o fader e não altera o Glide');
    const settings = player.getActivePresetState().modules[module - 1].settings;
    assert.equal(settings.glideMs, 450);
    await player.syncNativeEngine();
    assert.equal(calls.filter(({command,args}) => command === 'configure_module_envelope' && args.config.moduleIndex === module - 1).at(-1).args.config.glideMs, 450);
  }
  {
    // Modo Poly/Mono do Config: módulos 1 a 7 (Arpeggiator e Trance Gate inclusos).
    // O motor decide o Mono sozinho agora (substitui e devolve a nota
    // anterior); a polifonia configurada continua valendo, sem ser forçada a 1.
    const lastConfig = (moduleIndex) => calls.filter(({ command, args }) => command === 'configure_module' && args.config.moduleIndex === moduleIndex).at(-1).args.config;
    for (const module of [1, 6, 7]) {
      player.openModal('module-settings', module, master);
      useUserSettings();
      const modeButton = () => window.document.querySelector('[data-module-setting-action="toggle-voice-mode"]');
      assert(modeButton(), `módulo ${module} tem o botão Modo`);
      if (module === 7) {
        assert(!window.document.querySelector('[data-module-settings-mode="user"]'), 'o Organ não expõe mais a opção User');
      } else {
        assert(modeButton().previousElementSibling?.classList.contains('module-settings-source-button'),
          `em cima do Modo fica Default/User, não o Reset, no módulo ${module}`);
      }
      assert.equal(modeButton().querySelector('strong').textContent, 'Poly');
      const glideModeButton = () => window.document.querySelector('[data-glide-mode]');
      assert.equal(glideModeButton()?.textContent, module === 7 ? undefined : 'Auto',
        `módulo ${module} ${module === 7 ? 'não exibe Glide' : 'começa em Auto'}`);
      modeButton().click();
      await player.syncNativeEngine();
      assert.equal(modeButton().querySelector('strong').textContent, 'Mono');
      assert.equal(lastConfig(module - 1).mono, true, `Mono do módulo ${module} chega ao motor como uma flag`);
      assert.equal(lastConfig(module - 1).polyphony, 128, `Mono não força mais a polifonia a 1 no módulo ${module}`);
      assert.equal(player.getActivePresetState().modules[module - 1].settings.glideMode,
        module === 7 ? 'auto' : 'portamento',
        `Mono ${module === 7 ? 'não ativa Glide no Organ' : 'liga o Portamento sozinho'} no módulo ${module}`);
      if (module === 7) {
        player.closeModal();
        continue;
      }
      // Mono → Portamento tem que aparecer na hora no card de Glide, sem fechar
      // e reabrir o Config.
      assert.equal(glideModeButton()?.textContent, 'Portamento', `módulo ${module}: Auto virou Portamento na hora`);
      // E o caminho contrário: apagar o Portamento no card de Glide devolve o
      // módulo pro Poly, também refletido na hora no botão Modo.
      glideModeButton().click();
      await player.syncNativeEngine();
      assert.equal(player.getActivePresetState().modules[module - 1].settings.glideMode, 'auto',
        `módulo ${module}: desligar o Porta volta o Glide pra Auto`);
      assert.equal(player.getActivePresetState().modules[module - 1].settings.voiceMode, 'poly',
        `módulo ${module}: desligar o Porta devolve o módulo pro Poly`);
      assert.equal(modeButton().querySelector('strong').textContent, 'Poly',
        `módulo ${module}: o botão Modo mostra Poly na hora, sem reabrir`);
      assert.equal(lastConfig(module - 1).mono, false, `Poly do módulo ${module} desliga a flag de Mono`);
      assert.equal(lastConfig(module - 1).polyphony, 128, `Poly do módulo ${module} volta à polifonia escolhida`);
      player.closeModal();
    }
  }
  {
    // O mesmo vínculo Mono/Poly ↔ Portamento/Auto vale pro Synth (módulo 8), que
    // tem seu próprio botão de Modo dentro do editor.
    player.openModal('module-synth', 8, master);
    const synthModeButton = () => window.document.querySelector('[data-synth-voice-mode]');
    const synthGlideModeButton = () => window.document.querySelector('[data-glide-mode]');
    assert(synthModeButton(), 'Synth tem o botão de Modo');
    assert.equal(synthModeButton().textContent, 'Poly');
    synthModeButton().click();
    await player.syncNativeEngine();
    assert.equal(synthModeButton().textContent, 'Mono', 'Synth: Poly vira Mono');
    assert.equal(synthGlideModeButton()?.textContent, 'Portamento', 'Synth: Mono liga o Portamento na hora');
    synthGlideModeButton().click();
    await player.syncNativeEngine();
    assert.equal(synthModeButton().textContent, 'Poly', 'Synth: desligar o Porta devolve o Poly na hora');
    player.closeModal();
  }
  {
    // Em Default os parâmetros ficam travados: tocar num deles abre o aviso e
    // não muda nada. Só depois de ir para User o controle responde. As outras
    // partes desta suíte trocam para User primeiro, então é aqui que a trava
    // fica guardada.
    player.openModal('module-settings', 3, master);
    const panel = () => window.document.querySelector('.player-modal--module-settings');
    window.document.querySelector('[data-module-settings-mode="default"]').click();
    assert(panel().classList.contains('is-default-settings'), 'o módulo volta para Default');
    const gain = () => window.document.querySelector('[data-module-gain]');
    const before = gain().value;
    gain().dispatchEvent(new window.Event('pointerdown', { bubbles: true, cancelable: true }));
    const notice = () => window.document.querySelector('[data-default-settings-notice]');
    assert(notice(), 'tocar no parâmetro abre o aviso');
    assert.match(notice().textContent, /Mude para User/);
    assert.equal(gain().value, before, 'e o parâmetro continua como estava');
    window.document.querySelector('[data-default-settings-notice-close]').click();
    assert(!notice(), 'o aviso fecha no Entendi');
    assert(panel().classList.contains('is-default-settings'), 'e o módulo continua em Default');
    useUserSettings();
    assert(!panel().classList.contains('is-default-settings'), 'em User os parâmetros liberam');
    player.closeModal();
  }
  {
    player.openModal('module-settings', 8, master);
    useUserSettings();
    assert.equal(window.document.querySelector('[data-module-setting-action="toggle-voice-mode"]'), null,
      'o Config do Synth não tem Modo (fica no editor do Synth)');
    player.closeModal();
  }
  {
    const lastGlide = (moduleIndex) => calls.filter(({ command, args }) => command === 'configure_glide' && args.config.moduleIndex === moduleIndex).at(-1)?.args.config;
    for (const [module, kind] of [[2, 'module-settings'], [8, 'module-synth']]) {
      player.openModal(kind, module, master);
      const buttons = () => [...window.document.querySelectorAll('[data-module-glide-card] .module-glide-card__buttons button')].map((button) => button.textContent.trim());
      assert.equal(JSON.stringify(buttons()), JSON.stringify(['Sync', 'Auto', 'Config', 'No Sens']),
        'card de Glide padrão: Sync | Auto / Config | No Sens');
      // No Sens agora desliga o envelope do amplificador direto no motor
      // (retroativo, nem novo Note On precisa); a curva de velocity salva
      // sempre vai real pro motor, ligado ou não.
      const moduleConfig = () => calls.filter(({ command, args }) => command === 'configure_module' && args.config.moduleIndex === module - 1).at(-1).args.config;
      const curve = () => {
        const config = moduleConfig();
        return [config.velocityCurve0, config.velocityCurve1, config.velocityCurve2, config.velocityCurve3, config.velocityCurve4].join(',');
      };
      const noSens = () => window.document.querySelector('[data-glide-no-sens]');
      await player.syncNativeEngine();
      assert.equal(noSens().getAttribute('aria-pressed'), String(module === 8), 'No Sens nasce ligado só no Synth');
      assert.equal(curve(), '0,16,44,84,127');
      assert.equal(moduleConfig().noVelocitySensitivity, module === 8, 'No Sens vai direto pro motor, sem mexer na curva salva');
      noSens().click();
      await player.syncNativeEngine();
      assert.equal(noSens().getAttribute('aria-pressed'), String(module !== 8));
      assert.equal(curve(), '0,16,44,84,127', 'a curva salva não muda mais quando o No Sens alterna');
      assert.equal(moduleConfig().noVelocitySensitivity, module !== 8, 'No Sens alterna direto no motor');
      noSens().click();
      await player.syncNativeEngine();
      await player.syncNativeEngine();
      assert.equal(JSON.stringify(lastGlide(module - 1)), JSON.stringify({ moduleIndex: module - 1, portamento: false, velocityGateEnabled: false, velocityGateInverted: false, velocityThreshold: 64 }),
        'o motor começa em Auto com o limite de velocity desligado');
      window.document.querySelector('[data-glide-mode]').click();
      assert.equal(window.document.querySelector('[data-glide-mode]').textContent, 'Portamento', 'o modo alterna para Portamento');
      const settings = () => module === 8
        ? player.getActivePresetState().modules[7].settings.synth
        : player.getActivePresetState().modules[module - 1].settings;
      assert.equal(settings().glideMode, 'portamento');

      window.document.querySelector('[data-glide-config]').click();
      assert.equal(player.currentModalKind, 'glide-config', 'Config abre o velocity do Glide');
      assert(!window.document.querySelector('[data-velocity-mode-option]'), 'o velocity do Glide não tem modos');
      const power = () => window.document.querySelector('[data-glide-velocity-power]');
      assert.equal(power().textContent, 'OFF', 'o limite de velocity vem desligado');
      power().click();
      const threshold = window.document.querySelector('[data-glide-velocity-threshold]');
      assert.equal(threshold.min, '0');
      assert.equal(threshold.max, '127');
      threshold.value = '70';
      threshold.dispatchEvent(new window.Event('input', { bubbles: true }));
      assert.match(window.document.querySelector('[data-glide-velocity-help]').textContent, /70 ou mais tocam sem Glide/);
      window.document.querySelector('[data-glide-velocity-invert]').click();
      assert.match(window.document.querySelector('[data-glide-velocity-help]').textContent, /abaixo de 70 tocam sem Glide/);
      assert.equal(settings().glideVelocityEnabled, true);
      assert.equal(settings().glideVelocityThreshold, 70);
      assert.equal(settings().glideVelocityInverted, true);
      window.document.querySelector('[data-modal-action="confirm"]').click();
      assert.equal(player.currentModalKind, kind, 'OK volta para o card de Glide');
      assert(window.document.querySelector('[data-glide-config]').classList.contains('is-active'), 'Config indica o limite ativo');
      await player.syncNativeEngine();
      assert.equal(JSON.stringify(lastGlide(module - 1)), JSON.stringify({ moduleIndex: module - 1, portamento: true, velocityGateEnabled: true, velocityGateInverted: true, velocityThreshold: 70 }),
        'o motor recebe Portamento e o limite de velocity');
      // Restaura o padrão para os próximos testes.
      window.document.querySelector('[data-glide-mode]').click();
      Object.assign(settings(), { glideVelocityEnabled: false, glideVelocityInverted: false, glideVelocityThreshold: 64 });
      if (module === 8) player.getActivePresetState().modules[7].settings.synth = { ...settings() };
      player.closeModal();
    }
  }
  player.closeModal();
  // Parte do meio do curso para testar a sensibilidade sem já iniciar no
  // novo teto físico de 0 dB (posição 100).
  master.value = '82';
  master.dispatchEvent(new window.Event('input', { bubbles: true }));
  const drag = { target: master, isPrimary: true, pointerType: 'mouse', button: 0, pointerId: 1, clientX: 50, clientY: 200, timeStamp: 12000, preventDefault() {} };
  player.startKnobDrag(drag, null);
  player.moveKnobDrag({ ...drag, clientX: 60 });
  assert.equal(master.value, '82', 'arrastar o knob não altera mais o parâmetro');
  assert(window.document.querySelector('[data-knob-focus]').classList.contains('is-visible'),
    'tocar no knob abre o fader vertical');
  player.endKnobDrag({ ...drag, type: 'pointerup', timeStamp: 12040 });
  player.openModal('module-settings', 1, master);
  useUserSettings();
  const fineDrag = (input, startValue, pixels, moduleNumber = player.currentModalModuleNumber) => {
    input.value = String(startValue);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    const step = Number(input.step) || 1;
    input.value = String(Math.max(Number(input.min) || 0, Number(startValue)) + Math.sign(pixels) * step);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  };
  const attack = window.document.querySelector('[data-module-envelope="attackMs"]');
  fineDrag(attack, 80, 3);
  assert.equal(attack.value, '81', 'app envelope permits exact 1ms steps');
  assert.equal(window.document.querySelector('[data-module-envelope-value="attackMs"]').value, '81.0 ms');
  const cutoff = window.document.querySelector('[data-module-cutoff]');
  fineDrag(cutoff, 0, 3);
  assert.equal(window.document.querySelector('[data-module-cutoff-value]').value, '20 Hz', 'module Cutoff remains at its lower bound');
  player.openModal('module-synth', 8, master);
  const detune = window.document.querySelector('[data-synth-parameter="oscillator1DetuneCents"]');
  fineDrag(detune, 0, 3);
  assert.equal(detune.value, '1', 'Synth knobs use their exact minimum step');
  const synthCutoff = window.document.querySelector('[data-synth-scale="cutoff"]');
  fineDrag(synthCutoff, 0, 3);
  assert.equal(synthCutoff.getAttribute('aria-valuetext'), '20 Hz', 'Synth Cutoff remains at its lower bound');
  const synthDecay = window.document.querySelector('[data-synth-parameter="decayMs"]');
  synthDecay.value = '4';
  synthDecay.setPointerCapture = () => {};
  synthDecay.hasPointerCapture = () => false;
  const mouseDecay = { target: synthDecay, isPrimary: true, pointerType: 'mouse', button: 0, pointerId: 11,
    clientX: 100, clientY: 600, timeStamp: 14000, preventDefault() {} };
  player.startKnobDrag(mouseDecay, 8);
  player.moveKnobDrag({ ...mouseDecay, clientX: 102 });
  assert.equal(synthDecay.value, '4', 'arrastar o knob do Synth não altera o valor');
  player.moveKnobDrag({ ...mouseDecay, clientX: 103 });
  assert.equal(synthDecay.value, '4', 'movimentos seguintes continuam sem alterar o knob');
  player.moveKnobDrag({ ...mouseDecay, clientX: 148 });
  assert.equal(synthDecay.value, '4');
  player.moveKnobDrag({ ...mouseDecay, clientX: 520 });
  assert.equal(synthDecay.value, '4');
  player.endKnobDrag({ ...mouseDecay, type: 'pointerup', clientX: 520, timeStamp: 14040 });
  player.openModal('module-reverb', 1, master);
  const reverbMix = window.document.querySelector('[data-module-effect-control="mix"]');
  fineDrag(reverbMix, 25, 3);
  assert.equal(reverbMix.value, '26', 'Convolution Mix uses its declared step');
  player.showKnobFocus(reverbMix);
  const focusFader = root.querySelector('[data-knob-focus-fader]');
  focusFader.parentElement.getBoundingClientRect = () => ({ top: 0, bottom: 100, height: 100 });
  focusFader.setPointerCapture = () => {};
  focusFader.hasPointerCapture = () => false;
  focusFader.dispatchEvent(new window.PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, pointerId: 77, pointerType: 'touch', clientY: 100,
  }));
  assert.equal(reverbMix.value, '26', 'encostar no fader não faz o valor saltar');
  focusFader.dispatchEvent(new window.PointerEvent('pointermove', {
    bubbles: true, cancelable: true, pointerId: 77, pointerType: 'touch', clientY: 0,
  }));
  assert.equal(reverbMix.value, '100', 'the enlarged vertical fader reaches and updates the knob maximum');
  focusFader.dispatchEvent(new window.PointerEvent('pointerup', {
    bubbles: true, cancelable: true, pointerId: 77, pointerType: 'touch', clientY: 0,
  }));
  player.openModal('module-rotary', 7, master);
  const rotaryDepth = window.document.querySelector('[data-module-effect-kind="rotary"][data-module-effect-control="depth"]');
  player.showKnobFocus(rotaryDepth);
  focusFader.dispatchEvent(new window.PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, pointerId: 78, pointerType: 'touch', clientY: 100,
  }));
  focusFader.dispatchEvent(new window.PointerEvent('pointermove', {
    bubbles: true, cancelable: true, pointerId: 78, pointerType: 'touch', clientY: 27,
  }));
  assert.equal(rotaryDepth.value, '100', 'the enlarged relative fader forwards its value to a Rotary knob');
  assert.equal(player.getActivePresetState().modules[6].settings.rotary.depth, 100,
    'the Rotary state receives changes made with the enlarged fader');
  focusFader.dispatchEvent(new window.PointerEvent('pointerup', {
    bubbles: true, cancelable: true, pointerId: 78, pointerType: 'touch', clientY: 27,
  }));
  player.openModal('module-organ', 7, master);
  const organState = player.getActivePresetState().modules[6];
  const embeddedRotaryDepth = window.document.querySelector('[data-module-effect-kind="rotary"][data-module-effect-control="depth"]');
  player.showKnobFocus(embeddedRotaryDepth);
  focusFader.value = '41';
  focusFader.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(embeddedRotaryDepth.value, '41', 'the enlarged fader updates Rotary inside the Organ screen');
  assert.equal(organState.settings.rotary.depth, 41,
    'Rotary controls embedded in Organ persist their values');
  const firstDrawbar = window.document.querySelector('[data-organ-drawbar-track="0"]');
  organState.enabled = true;
  player.applyOrganDrawbar(firstDrawbar, 7, 7);
  assert.equal(organState.settings.organ.drawbars[0], 7, 'drawbar movement remains active without Drawbar Sound');
  assert.equal(window.document.querySelector('[data-organ-sound-toggle]'), null,
    'Drawbar Sound control was removed from Organ');
  assert.equal(window.document.querySelector('[data-organ-click-volume]'), null,
    'Drawbar Sound volume was removed from Organ');
  await player.syncNativeEngine();
  assert.equal(calls.filter(({ command, args }) => command === 'configure_module'
    && args.config.moduleIndex === 6).at(-1).args.config.enabled, true,
  'removing Drawbar Sound does not disable the Organ timbre');
  window.document.querySelector('[data-module-rotary-speed="brake"]').click();
  assert.equal(organState.settings.rotary.speed, 'brake', 'Brake works inside the embedded Organ Rotary');
  assert.doesNotMatch(playerSource, /playOrganClick|data-organ-sound-toggle|data-organ-click-volume/,
    'Drawbar Sound implementation was removed');
  player.openModal('module-arpeggiator', 5, master);
  const octave2 = window.document.querySelector('[data-arpeggiator-octaves="2"]');
  octave2.click();
  assert(octave2.classList.contains('is-selected'), 'Arpeggiator octaves use the requested 2x2 buttons');
  const gate = window.document.querySelector('[data-pattern-parameter="gate"]');
  fineDrag(gate, 70, 3);
  assert.equal(gate.value, '71', 'pattern knobs use the same progressive curve');
  for (const [kind, module] of [['module-settings', 1], ['module-synth', 8], ['module-reverb', 1], ['module-delay', 1], ['module-compressor', 1], ['module-rotary', 7], ['module-arpeggiator', 5], ['module-trance-gate', 6]]) {
    player.openModal(kind, module, master);
    for (const input of window.document.querySelectorAll('.player-modal .module-envelope-knob input, .player-modal .module-effect-knob input')) {
      const value = Number(input.value);
      assert(Number.isFinite(value) && value >= Number(input.min) && value <= Number(input.max), `${kind} ${input.ariaLabel}: valid factory default`);
    }
  }
  player.closeModal();
  const transport = player.trackTransport;
  const originalTogglePlayStop = transport.togglePlayStop;
  let desktopSpaceToggles = 0;
  transport.togglePlayStop = async () => { desktopSpaceToggles += 1; };
  const space = new window.KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true });
  window.document.dispatchEvent(space);
  assert.equal(desktopSpaceToggles, 1, 'desktop Space alterna Play/Stop da playlist');
  assert.equal(space.defaultPrevented, true, 'desktop Space não rola a página nem aciona o botão focado');
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Space', repeat: true, bubbles: true, cancelable: true }));
  assert.equal(desktopSpaceToggles, 1, 'repetição automática da tecla não alterna novamente');
  const editable = window.document.createElement('input');
  root.append(editable);
  editable.focus();
  editable.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }));
  assert.equal(desktopSpaceToggles, 1, 'Space continua disponível para digitação em campos');
  editable.remove();
  transport.togglePlayStop = originalTogglePlayStop;
  const originalAudio = transport.audio;
  const originalSelectedTrack = transport.selectedTrack;
  const originalState = transport.state;
  const originalPrepareAudioOutput = transport.prepareAudioOutput;
  let pauseCalls = 0;
  let playCalls = 0;
  transport.audio = {
    src: 'blob:desktop-space-test',
    duration: 180,
    currentTime: 42,
    volume: 1,
    pause() { pauseCalls += 1; },
    async play() { playCalls += 1; },
  };
  transport.selectedTrack = { id: 'space-test', name: 'Space test', fileName: 'space.mp3', mimeType: 'audio/mpeg', size: 1, addedAt: '' };
  transport.state = 'playing';
  transport.prepareAudioOutput = async () => {};
  await transport.togglePlayStop();
  assert.equal(pauseCalls, 1, 'Stop pausa o elemento de áudio');
  assert.equal(transport.audio.currentTime, 0, 'Stop zera a música');
  assert.equal(transport.state, 'stopped');
  await transport.togglePlayStop();
  assert.equal(playCalls, 1, 'o próximo Play começa novamente do início');
  assert.equal(transport.state, 'playing');
  transport.audio = originalAudio;
  transport.selectedTrack = originalSelectedTrack;
  transport.state = originalState;
  transport.prepareAudioOutput = originalPrepareAudioOutput;
  player.ccMappings.set('preset:A:2', 22);
  player.handleMidiControlChange({ channel: 1, controller: 22, inputId: 'keyboard-a', value: 127 });
  assert.equal(player.bankStates.get(player.activeBank).selectedPreset, 2, 'CC mapeado aciona o preset');
  player.activateMappedPreset('A', 1);
  player.lastCcValues.set('keyboard-a:1:22', { value: 127, receivedAt: performance.now() - 200 });
  player.handleMidiControlChange({ channel: 1, controller: 22, inputId: 'keyboard-a', value: 127 });
  assert.equal(player.bankStates.get(player.activeBank).selectedPreset, 2,
    'teclado que envia somente 127 consegue acionar o mesmo CC novamente');
  // Os seis bancos são independentes: o Preset 3 do Banco D tem o seu próprio
  // controle e, tocado com a tela no Banco A, leva ao Banco D.
  assert.equal(player.activeBank, 'A');
  player.ccMappings.set('preset:D:3', 23);
  player.handleMidiControlChange({ channel: 1, controller: 23, inputId: 'keyboard-a', value: 127 });
  assert.equal(player.activeBank, 'D', 'preset mapeado do Banco D troca a tela para o Banco D na hora');
  assert.equal(player.bankStates.get('D').selectedPreset, 3, 'o Preset 3 do Banco D fica selecionado');
  assert.equal(player.bankStates.get('A').selectedPreset, null, 'só um preset fica ativo entre os seis bancos');
  assert.equal(window.document.querySelector('[data-action="show-bank"][data-bank="D"]').getAttribute('aria-pressed'), 'true',
    'o botão do Banco D acende');
  assert.equal(window.document.querySelector('.player-preset-button[data-preset="3"]').getAttribute('aria-pressed'), 'true',
    'o botão do Preset 3 acende no Banco D');
  player.handleMidiControlChange({ channel: 1, controller: 22, inputId: 'keyboard-a', value: 0 });
  player.handleMidiControlChange({ channel: 1, controller: 22, inputId: 'keyboard-a', value: 127 });
  assert.equal(player.activeBank, 'A', 'o controle do Preset 2 do Banco A volta ao Banco A');
  assert.equal(player.bankStates.get('A').selectedPreset, 2);
  assert.equal(player.bankStates.get('D').selectedPreset, null);
  const savedBankPresets = JSON.parse(JSON.stringify(player.createSavedPlayerState()));
  savedBankPresets.ccMappings = { ...savedBankPresets.ccMappings, 'preset:A:3': 61, 'preset:3': 62 };
  player.applySavedPlayerState(savedBankPresets);
  assert.equal(player.ccMappings.get('preset:A:3'), 61, 'Preset 3 do Banco A é salvo à parte');
  assert.equal(player.ccMappings.get('preset:D:3'), 23, 'Preset 3 do Banco D é salvo à parte');
  assert(!player.ccMappings.has('preset:3'), 'preset sem banco não é mais um destino');
  player.ccMappings.delete('preset:A:3');
  player.ccMappings.delete('preset:D:3');
  // Learn CC do Preset 5 aberto no Banco B grava o destino do Banco B.
  player.showBank('B');
  window.document.querySelector('.player-preset-button[data-preset="5"]').click();
  player.openModal('preset-name', 5, window.document.querySelector('.player-preset-button[data-preset="5"]'));
  window.document.querySelector('[data-modal-action="learn-preset-cc"]').click();
  assert.equal(JSON.stringify(player.pendingCcLearn), JSON.stringify({ kind: 'preset', bank: 'B', presetNumber: 5 }));
  player.handleMidiControlChange({ channel: 1, controller: 31, inputId: 'keyboard-a', value: 127 });
  window.document.querySelector('[data-modal-action="confirm-cc-learn"]').click();
  assert.equal(player.ccMappings.get('preset:B:5'), 31, 'Learn no Banco B mapeia o Preset 5 do Banco B');
  assert(!player.ccMappings.has('preset:A:5'), 'o Preset 5 do Banco A continua livre');
  player.closeModal();
  player.ccMappings.delete('preset:B:5');
  player.showBank('A');
  window.document.querySelector('.player-preset-button[data-preset="2"]').click();
  assert.equal(player.bankStates.get('A').selectedPreset, 2);

  // Limite de notas do módulo aprendido pelo teclado da tela, inclusive nas pontas.
  {
    const moduleOne = () => player.getActivePresetState().modules[0];
    const beforeRange = { low: moduleOne().lowNote, high: moduleOne().highNote };
    player.toggleNoteLearn(1, 'low');
    player.learnNoteRangeFrom(21, null);
    assert.equal(moduleOne().lowNote, 21, 'A-1 tocado na tela vira o limite grave');
    player.toggleNoteLearn(1, 'high');
    player.learnNoteRangeFrom(108, null);
    assert.equal(moduleOne().highNote, 108, 'C7 tocado na tela vira o limite agudo');
    player.toggleNoteLearn(1, 'low');
    player.learnNoteRangeFrom(60, 'outro-teclado');
    assert.equal(moduleOne().lowNote, 60, 'sem dispositivo escolhido no módulo, qualquer entrada ensina');
    moduleOne().midiInputId = 'teclado-do-modulo';
    player.toggleNoteLearn(1, 'low');
    player.learnNoteRangeFrom(48, 'outro-teclado');
    assert.equal(moduleOne().lowNote, 60, 'com dispositivo escolhido, outro teclado não ensina');
    player.learnNoteRangeFrom(48, 'teclado-do-modulo');
    assert.equal(moduleOne().lowNote, 48, 'o teclado do módulo ensina');
    moduleOne().midiInputId = null;
    moduleOne().lowNote = beforeRange.low;
    moduleOne().highNote = beforeRange.high;
    player.cancelNoteLearn();
  }

  // Copy / Paste, os seis bancos e o botão Presets/Keyboard.
  {
    const copyButton = () => window.document.querySelector('[data-action="copy-preset"]');
    const bankButton = (bank) => window.document.querySelector(`[data-action="show-bank"][data-bank="${bank}"]`);
    const presetButton = (number) => window.document.querySelector(`.player-preset-button[data-preset="${number}"]`);
    const header = [...window.document.querySelectorAll('.player-presets__header > button')].map((button) => button.textContent.trim());
    // Este player roda como desktop, onde o Keyboard fica sempre à mostra e o
    // botão Presets/Keyboard não existe; no app ele entra no fim da linha.
    assert.equal(JSON.stringify(header), JSON.stringify(['Copy', 'A', 'B', 'C', 'D', 'E', 'F']),
      'a linha de cima tem Copy e os seis bancos');
    assert.equal(window.document.querySelector('[data-action="toggle-bottom-view"]'), null,
      'o desktop não tem o botão Presets/Keyboard');
    assert.equal(window.document.querySelector('[data-performance-keyboard]').hidden, false,
      'e o Keyboard do desktop continua fixo');
    assert.equal(window.document.querySelectorAll('.player-preset-button').length, 16, 'dezesseis presets');
    assert.equal(copyButton().textContent.trim(), 'Copy');
    assert.equal(copyButton().dataset.copyState, 'idle', 'Copy começa vermelho, parado');
    bankButton('F').click();
    assert.equal(player.activeBank, 'F', 'cada banco tem o seu botão');
    assert.equal(bankButton('F').getAttribute('aria-pressed'), 'true');
    bankButton('A').click();
    assert.equal(player.activeBank, 'A');

    const source = player.bankStates.get('A').presets[1];
    source.name = 'Origem';
    source.modules[0].settings.cutoffHz = 1234;
    copyButton().click();
    assert.equal(copyButton().dataset.copyState, 'copied', 'copiado: amarelo piscando');
    assert.equal(copyButton().textContent.trim(), 'Copy');
    copyButton().click();
    assert.equal(copyButton().dataset.copyState, 'idle', 'Copy de novo cancela tudo');
    assert.equal(player.presetClipboard, null);

    copyButton().click();
    source.modules[0].settings.cutoffHz = 999;
    bankButton('B').click();
    assert.equal(copyButton().dataset.copyState, 'copied', 'sem preset escolhido no Banco B, segue esperando');
    presetButton(5).click();
    assert.equal(copyButton().dataset.copyState, 'paste');
    assert.equal(copyButton().textContent.trim(), 'Paste', 'outro preset escolhido: vira Paste e pisca mais rápido');
    copyButton().click();
    assert.equal(player.currentModalKind, 'preset-paste-confirm', 'Paste pede confirmação');
    assert.match(window.document.querySelector('.preset-paste-confirmation strong').textContent,
      /Deseja colar o Preset 02 do Banco A em cima do Preset 05 do Banco B\?/);
    window.document.querySelector('[data-modal-action="cancel-preset-paste"]').click();
    assert.equal(player.currentModalKind, null);
    assert.equal(copyButton().dataset.copyState, 'paste', 'Cancelar não perde a cópia');
    assert.notEqual(player.bankStates.get('B').presets[4].name, 'Origem', 'nada foi colado');
    copyButton().click();
    assert.equal(player.currentModalKind, null);
    assert.equal(copyButton().dataset.copyState, 'idle', 'Paste de novo depois de cancelar: cancela tudo');

    bankButton('A').click();
    presetButton(2).click();
    source.modules[0].settings.cutoffHz = 1234;
    copyButton().click();
    source.modules[0].settings.cutoffHz = 999;
    bankButton('B').click();
    presetButton(5).click();
    copyButton().click();
    window.document.querySelector('[data-modal-action="confirm-preset-paste"]').click();
    const pasted = player.bankStates.get('B').presets[4];
    assert.equal(pasted.name, 'Origem', 'Paste deixa o preset igual ao copiado');
    assert.equal(pasted.modules[0].settings.cutoffHz, 1234, 'vale a configuração do momento do Copy');
    pasted.modules[1].settings.cutoffHz = 777;
    assert.notEqual(player.bankStates.get('A').presets[1].modules[1].settings.cutoffHz, 777, 'a cópia é independente');
    assert.equal(copyButton().dataset.copyState, 'idle', 'depois de colar, Copy volta ao vermelho');
    assert.equal(player.activeBank, 'B');
    assert.equal(player.bankStates.get('B').selectedPreset, 5);
    assert.equal(presetButton(5).querySelector('.player-preset-button__label').textContent, 'Origem', 'o nome colado aparece no botão');

    // Clique direito é o toque longo do desktop: abre o nome/Advanced do banco,
    // mas continua sem transformar o próprio banco em destino de Learn CC.
    player.onRootContextMenu({ target: bankButton('E'), preventDefault() {} });
    assert.equal(player.currentModalKind, 'bank-name', 'clique direito no banco abre o editor');
    const bankNameInput = window.document.querySelector('[data-bank-name-input]');
    assert.equal(bankNameInput.maxLength, 12, 'nome do banco tem no máximo 12 caracteres');
    bankNameInput.value = 'Show Principal';
    bankNameInput.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    assert.equal(player.currentModalKind, null, 'Enter no desktop aciona o botão OK do modal');
    assert.equal(player.bankStates.get('E').name, 'Show Princip', 'nome salvo respeita os 12 caracteres');
    assert.equal(bankButton('E').textContent, 'Show Princip');

    player.onRootContextMenu({ target: bankButton('B'), preventDefault() {} });
    window.document.querySelector('[data-modal-action="open-bank-advanced"]').click();
    assert.deepEqual([...window.document.querySelectorAll('[data-bank-fader-mode]')].map(button => button.textContent.trim()),
      ['Default', 'Master', 'Bank'], 'Advanced oferece apenas Default, Master e Bank');
    window.document.querySelector('[data-bank-fader-mode="master"]').click();
    assert.equal(player.bankStates.get('B').faderMode, 'master');
    player.closeModal();
    player.faders.get(1).setValueDb(-18, true);
    presetButton(6).click();
    assert(Math.abs(player.faders.get(1).getValueDb() + 18) < 0.01,
      'Master mantém o volume do fader ao trocar de preset');

    player.onRootContextMenu({ target: bankButton('B'), preventDefault() {} });
    window.document.querySelector('[data-modal-action="open-bank-advanced"]').click();
    window.document.querySelector('[data-bank-fader-mode="bank2"]').click();
    player.closeModal();
    assert.equal(player.bankStates.get('B').faderMode, 'bank2');
    assert.equal(bankButton('B').dataset.bankModeLabel, 'Bank');
    player.faders.get(1).setValueDb(-22, true);
    const presetFiveVolume = player.bankStates.get('B').presets[4].modules[0].volumeDb;
    presetButton(5).click();
    assert(Math.abs(player.faders.get(1).getValueDb() - presetFiveVolume) < 0.01,
      'Bank restaura o volume individual do preset de destino');
    player.faders.get(1).setValueDb(-8, true);
    presetButton(6).click();
    assert(Math.abs(player.faders.get(1).getValueDb() + 22) < 0.01,
      'Bank recupera o volume salvo no preset 6');
    presetButton(5).click();
    assert(Math.abs(player.faders.get(1).getValueDb() + 8) < 0.01,
      'Bank recupera o volume salvo no preset 5');
    presetButton(6).click();
    const bankFader = root.querySelector('[data-module-fader="1"] .player-module__fader-rail');
    player.openCcLearn({ kind: 'module-volume', moduleNumber: 1 }, bankFader);
    player.handleMidiControlChange({ controller: 118, value: 127, channel: 1, inputId: 'bank-cc' });
    window.document.querySelector('[data-modal-action="confirm-cc-learn"]').click();
    assert.equal(player.ccMappings.get('module-bank:B:6:1'), 118,
      'Bank grava o CC do fader no preset atual');
    presetButton(5).click();
    player.openCcLearn({ kind: 'module-volume', moduleNumber: 1 }, bankFader);
    player.handleMidiControlChange({ controller: 118, value: 127, channel: 1, inputId: 'bank-cc' });
    window.document.querySelector('[data-modal-action="confirm-cc-learn"]').click();
    assert.equal(player.ccMappings.get('module-bank:B:5:1'), 118,
      'o mesmo CC pode ser remapeado no outro preset do modo Bank');
    presetButton(6).click();
    assert.equal(player.ccMappingKeyForTarget({ kind: 'module-volume', moduleNumber: 1 }), 'module-bank:B:6:1',
      'Bank mantém o Learn CC do fader individual por preset');
    assert.equal(player.createSavedPlayerState().banks.B.faderMode, 'bank2',
      'Bank é preservado no estado salvo');
    player.onRootContextMenu({ target: bankButton('B'), preventDefault() {} });
    window.document.querySelector('[data-modal-action="open-bank-advanced"]').click();
    window.document.querySelector('[data-bank-fader-mode="default"]').click();
    player.closeModal();
    player.ccMappings.delete('module-bank:B:5:1');
    player.ccMappings.delete('module-bank:B:6:1');

    const sourceConfig = player.getActivePresetState().modules[4];
    const targetConfig = player.getActivePresetState().modules[5];
    sourceConfig.timbreId = 'fixed:config-copy-test';
    sourceConfig.timbreName = 'Copy Test';
    sourceConfig.settings.attackMs = 432;
    targetConfig.midiInputId = 'midi-destino';
    player.ccMappings.set('module-control:6:attackMs', 117);
    const sourceConfigButton = root.querySelector('[data-action="open-module-settings"][data-module="5"]');
    const targetConfigButton = root.querySelector('[data-action="open-module-settings"][data-module="6"]');
    player.onRootContextMenu({ target: sourceConfigButton, preventDefault() {} });
    assert(sourceConfigButton.classList.contains('is-config-copy-source'), 'Config de origem fica piscando');
    targetConfigButton.click();
    assert.equal(player.currentModalKind, 'module-config-copy-confirm', 'destino pede confirmação antes de substituir o Config');
    assert.match(window.document.querySelector('.preset-paste-confirmation').textContent,
      /módulo 5 para o módulo 6/);
    window.document.querySelector('[data-modal-action="confirm-module-config-copy"]').click();
    assert.equal(player.getActivePresetState().modules[5].timbreName, 'Copy Test', 'copia também o timbre');
    assert.equal(player.getActivePresetState().modules[5].settings.attackMs, 432, 'copia a configuração inteira');
    assert.equal(player.getActivePresetState().modules[5].midiInputId, 'midi-destino', 'não copia a entrada MIDI');
    assert.equal(player.ccMappings.get('module-control:6:attackMs'), 117, 'não altera o MIDI mapeado no destino');
    player.ccMappings.delete('module-control:6:attackMs');

    player.ccMappings.set('bank:E', 41);
    player.applySavedPlayerState(JSON.parse(JSON.stringify({ ...player.createSavedPlayerState(), ccMappings: { 'bank:E': 41 } })));
    assert(!player.ccMappings.has('bank:E'), 'mapeamento de banco não é mais um destino salvo');

    source.name = 'Preset';
    source.modules[0].settings.cutoffHz = 20_000;
    player.bankStates.get('B').presets[4] = JSON.parse(JSON.stringify(player.bankStates.get('B').presets[5]));
    bankButton('A').click();
    presetButton(2).click();
    assert.equal(player.activeBank, 'A');
    assert.equal(player.bankStates.get('A').selectedPreset, 2);
  }
  // O módulo nasce desligado: sem ligá-lo, não haveria sinal para o medidor
  // do compressor mostrar mais abaixo.
  root.querySelector('[data-action="toggle-module"][data-module="1"]').click();
  player.openModal('module-eq', 1, master);
  assert.equal(window.document.querySelector('[data-module-eq-rta]'), null,
    'EQ permanece leve e sem RTA');
  player.openModal('module-compressor', 1, master);
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(window.document.querySelector('[data-compressor-meter="input"] i b').style.height, '0%',
    'compressor desligado não processa nem mostra medidor');
  window.document.querySelector('[data-module-effect-power="compressor"]').click();
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.notEqual(window.document.querySelector('[data-compressor-meter="input"] i b').style.height, '0%',
    'medidor Input do compressor ligado recebe sinal real');
  const cpuMeter = window.document.querySelector('[data-cpu-meter]');
  assert(cpuMeter, 'o desktop mostra a CPU do processo Hook Keys ao lado de User');
  assert.equal(cpuMeter.querySelector('[data-cpu-meter-value]').textContent, '12%',
    'o medidor mostra somente a CPU consumida pelo Hook Keys');
  assert(!cpuMeter.classList.contains('is-critical'),
    'uma carga folgada nao acende o alerta');
  processCpuUsage = 97;
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(cpuMeter.querySelector('[data-cpu-meter-value]').textContent, '97%',
    'a leitura nova aparece rapidamente e sem segurar o valor anterior');
  assert(cpuMeter.classList.contains('is-critical'),
    'o próprio Hook Keys perto do teto deixa o número vermelho');
  // RAM do aparelho: percentual, texto com GB usados do total e as cores só no fim.
  // No desktop ela fica ao lado da CPU, no mesmo canto.
  const ramMeter = root.querySelector('[data-ram-meter]');
  assert(ramMeter, 'o desktop mostra a RAM junto da CPU');
  assert.equal(ramMeter.previousElementSibling?.dataset.cpuMeter !== undefined, true, 'uma do lado da outra');
  player.renderRamMeter({ percent: 62.4, usedBytes: 3.2 * 1024 ** 3, limitBytes: 5.9 * 1024 ** 3 });
  assert.equal(ramMeter.querySelector('[data-ram-meter-value]').textContent, '62%');
  assert.equal(ramMeter.title, 'Memória usada no aparelho: 3.2 GB de 5.9 GB');
  assert(!ramMeter.classList.contains('is-warning') && !ramMeter.classList.contains('is-critical'),
    'a RAM do aparelho vive alta: 62% não acende alerta');
  player.renderRamMeter({ percent: 88, usedBytes: 5.2 * 1024 ** 3, limitBytes: 5.9 * 1024 ** 3 });
  assert(ramMeter.classList.contains('is-warning'));
  player.renderRamMeter({ percent: 96, usedBytes: 5.7 * 1024 ** 3, limitBytes: 5.9 * 1024 ** 3 });
  assert(ramMeter.classList.contains('is-critical'));
  processCpuUsage = 12;
  const restartStart = calls.length;
  player.openModal('app-settings-audio', null, master);
  const buffer = window.document.querySelector('[data-setting="buffer-size"]');
  // 512: o padrao agora e 256, e escolher o valor ja ativo nao reinicia nada.
  buffer.value = '512';
  buffer.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert(window.document.querySelector('[data-audio-restart]'),
    'trocar buffer mostra Aguarde enquanto o stream reinicia');
  await player.nativeAudioOutputSync;
  const restartCalls = calls.slice(restartStart);
  const restartIndex = restartCalls.findIndex(({ command }) => command === 'set_audio_output_device');
  assert(restartIndex >= 0, 'trocar buffer reinicia a saída');
  assert.equal(restartCalls[restartIndex].args.preserveEngine, true,
    'trocar somente o buffer preserva o motor e os SF2 decodificados');
  assert(!restartCalls.slice(restartIndex + 1).some(({ command }) => command === 'configure_module'),
    'trocar buffer não recarrega módulos quando o motor foi preservado');
  await new Promise(resolve => setTimeout(resolve, 280));
  assert(!window.document.querySelector('[data-audio-restart]'),
    'o aviso fecha depois que o callback da saída volta');
  // Saída do metrônomo: aparece junto de Pads/Effects, chega ao motor e fica salva.
  player.openModal('app-settings-audio', null, master);
  const metronomeRoute = window.document.querySelector('[data-setting="audio-route"][data-audio-bus="metronome"]');
  assert(metronomeRoute, 'Config › Áudio tem Saídas - Metrônomo');
  const musicRoute = window.document.querySelector('[data-setting="music-route"]');
  assert(musicRoute?.disabled, 'Saídas - Músicas aparece travada');
  assert.equal(musicRoute.parentElement.querySelector('.app-select__toggle span').textContent, '1+2');
  assert(musicRoute.parentElement.querySelector('[data-app-select-toggle]').disabled, 'o seletor de Músicas não abre');
  metronomeRoute.value = 'mono:1';
  metronomeRoute.dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 10));
  const lastMetronomeOutput = calls.filter(({ command }) => command === 'set_metronome_output').at(-1)?.args;
  assert.equal(JSON.stringify(lastMetronomeOutput), JSON.stringify({ channelStart: 1, channelCount: 1 }),
    'a saída escolhida chega ao motor');
  assert.equal(player.createSavedPlayerState().audioRouting.metronome, 'mono:1', 'a saída do metrônomo é salva');
  const sampleRate = window.document.querySelector('[data-setting="sample-rate"]');
  assert.deepEqual([...sampleRate.options].map(option => option.value), ['44100', '48000']);
  sampleRate.value = '44100';
  sampleRate.dispatchEvent(new window.Event('change', { bubbles: true }));
  await player.nativeAudioOutputSync;
  const rateChange = calls.filter(({ command }) => command === 'set_audio_output_device').at(-1);
  assert.equal(rateChange.args.sampleRate, 44100, 'sample rate selecionado chega à saída');
  assert.equal(rateChange.args.preserveEngine, false, 'mudança da taxa recompõe o motor na nova taxa');
  assert.equal(player.createSavedPlayerState().sampleRate, 44100, 'sample rate fica salvo');
  sampleRate.value = '48000';
  sampleRate.dispatchEvent(new window.Event('change', { bubbles: true }));
  await player.nativeAudioOutputSync;
  player.closeModal();
  // A large file read must not hold up configuration commands or roll back a
  // newer timbre selected while that read was still in flight.
  const library = player.soundLibrary;
  const timbres = ['a', 'b'].map(id => ({ id, name: id.toUpperCase(), fileName: `${id}.sf2`, colorIndex: 0, size: 4 }));
  library.listUser = async () => timbres;
  let releaseFirstFile;
  let firstFileStarted = false;
  library.getUserFile = async id => {
    if (id === 'a') {
      firstFileStarted = true;
      return await new Promise(resolve => { releaseFirstFile = resolve; });
    }
    return new window.Blob(['test']);
  };
  const preset = player.getActivePresetState();
  preset.modules[0].category = 'user';
  preset.modules[0].settingsMode = 'user';
  preset.modules[0].settings.attackMs = 4321;
  preset.modules[0].userSettings = JSON.parse(JSON.stringify(preset.modules[0].settings));
  // O módulo nasce desligado: liga primeiro, para o clique de baixo desligar
  // de verdade e testar o OFF chegando ao motor durante o carregamento.
  root.querySelector('[data-module="8"] .player-module__power-button').click();
  player.openModal('sound-selection', 1, master);
  await new Promise(resolve => setTimeout(resolve, 10));
  const firstButton = window.document.querySelector('[data-user-soundfont-id="a"]');
  const secondButton = window.document.querySelector('[data-user-soundfont-id="b"]');
  assert(firstButton && secondButton);
  const firstSelection = player.selectUserSoundfont(1, firstButton);
  for (let attempt = 0; !firstFileStarted && attempt < 50; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert(firstFileStarted);
  const pendingLoadStart = calls.length;
  root.querySelector('[data-module="8"] .player-module__power-button').click();
  await new Promise(resolve => setTimeout(resolve, 100));
  assert(calls.slice(pendingLoadStart).some(({ command, args }) =>
    command === 'configure_module' && args.config.moduleIndex === 7 && !args.config.enabled),
    'OFF chega ao motor enquanto o SF2 de outro módulo ainda está carregando');
  const secondSelection = player.selectUserSoundfont(1, secondButton);
  releaseFirstFile(new window.Blob(['old']));
  await Promise.all([firstSelection, secondSelection]);
  assert.equal(preset.modules[0].timbreId, 'user:b', 'seleção antiga não desfaz a mais recente');
  assert.equal(preset.modules[0].settingsMode, 'user', 'trocar timbre não volta um módulo já editado para Default');
  assert.equal(preset.modules[0].settings.attackMs, 4321, 'trocar timbre preserva a configuração User ativa');
  assert.equal(preset.modules[0].userSettings.attackMs, 4321, 'a memória de User também continua preservada');
  assert.equal(player.nativeLoadedTimbres[0], 'user:b');
  assert.equal(preset.modules[7].enabled, false, 'terminar o SF2 não reativa o módulo desligado');
  assert(calls.some(({ command, args }) => command === 'begin_sound_font_upload' && /^[a-f0-9]{64}$/.test(args.assetKey)),
    'arquivo nativo recebe uma chave estável para reutilizar o cache');
  const saved = JSON.parse(JSON.stringify(player.createSavedPlayerState()));
  player.openModal('module-trance-gate', 6, master);
  assert(window.document.querySelector('[data-trance-gate-editor]'));
  assert(!window.document.querySelector('[data-pattern-parameter="semitone"]'));
  assert.equal(player.createPatternPlaybackSnapshot(5).sequencer, undefined,
    'o antigo gerador de notas do sequencer não existe mais');
  // Cada módulo tem seu próprio Arpeggiator: o snapshot do módulo 5 lê o
  // timbre do módulo 5, não o de outro módulo qualquer.
  preset.modules[4].timbreId = 'fixed:arp-voice';
  preset.modules[5].timbreId = null;
  const arpSnapshot = player.createPatternPlaybackSnapshot(5).arpeggiator;
  assert.equal(arpSnapshot.hasSound, true, 'o snapshot do módulo 5 lê o timbre do módulo 5');
  const otherSnapshot = player.createPatternPlaybackSnapshot(6).arpeggiator;
  assert.equal(otherSnapshot.hasSound, false, 'o snapshot do módulo 6 não lê o timbre do módulo 5');
  const step = window.document.querySelector('[data-trance-gate-step="1"]');
  step.click();
  await player.syncNativeEngine();
  let gateConfig = calls.filter(c => c.command === 'configure_trance_gate').at(-1).args.config;
  assert.equal(gateConfig.steps, 65533);
  assert.equal(step.getAttribute('aria-pressed'), 'false');
  window.document.querySelector('[data-trance-gate-division="1/8 T"]').click();
  window.document.querySelector('[data-trance-gate-length="8"]').click();
  const depth = window.document.querySelector('[data-trance-gate-parameter="depth"]');
  depth.value = '50';
  depth.dispatchEvent(new window.Event('input', { bubbles: true }));
  await player.syncNativeEngine();
  gateConfig = calls.filter(c => c.command === 'configure_trance_gate').at(-1).args.config;
  assert.equal(gateConfig.length, 8);
  assert.equal(gateConfig.beatMultiplier, 1 / 3);
  assert.equal(gateConfig.depth, 0.5);
  window.document.querySelector('[data-module-effect-power="trance-gate"]').click();
  await player.syncNativeEngine();
  assert.equal(calls.filter(c => c.command === 'configure_trance_gate').at(-1).args.config.enabled, false);
  const gateBackup = JSON.parse(JSON.stringify(player.createSavedPlayerState()));
  player.applySavedPlayerState(gateBackup);
  assert.equal(player.getActivePresetState().modules[5].settings.tranceGate.depth, 50,
    'Trance Gate settings persist in presets and backups');
  player.closeModal();
  const savedSynth = saved.banks[player.activeBank].presets[player.bankStates.get(player.activeBank).selectedPreset - 1].modules[7];
  savedSynth.settings.velocityCurve = { ...savedSynth.settings.velocityCurve, fixedValue: 93 };
  player.applySavedPlayerState(saved);
  assert.equal(player.getActivePresetState().modules[7].settings.velocityCurve.fixedValue, 93,
    'o novo padrão Fixed 127 não sobrescreve o Velocity salvo pelo usuário');
  player.closeModal();
  const tempoButton = root.querySelector('[data-action="tap-tempo"]');
  tempoButton.setPointerCapture = () => {};
  tempoButton.hasPointerCapture = () => false;
  tempoButton.releasePointerCapture = () => {};
  const context = element => element.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
  context(tempoButton.querySelector('strong'));
  assert.equal(player.currentModalKind, 'tempo-edit', 'right click on BPM opens settings rather than Learn immediately');
  let tempoInput = window.document.querySelector('[data-tempo-input]');
  assert.equal(tempoInput.readOnly, false, 'desktop uses its physical keyboard');
  assert(!window.document.querySelector('.player-modal .on-screen-keyboard'));
  tempoInput.value = '145';
  window.document.querySelector('[data-modal-action="learn-tempo-cc"]').click();
  assert.equal(player.metronome.getBpm(), 145);
  assert.equal(player.pendingCcLearn.kind, 'tap-tempo');
  player.handleMidiControlChange({ channel: 1, controller: 70, inputId: 'test-midi', value: 127 });
  window.document.querySelector('[data-modal-action="confirm-cc-learn"]').click();
  assert.equal(player.ccMappings.get('metronome:tap'), 70);
  player.closeModal();

  context(root.querySelector('.player-metronome-button'));
  assert.equal(player.currentModalKind, 'metronome');
  window.document.querySelector('[data-modal-action="learn-metronome-cc"]').click();
  assert.equal(player.pendingCcLearn.kind, 'metronome-toggle');
  player.handleMidiControlChange({ channel: 1, controller: 71, inputId: 'test-midi', value: 127 });
  window.document.querySelector('[data-modal-action="confirm-cc-learn"]').click();
  assert.equal(player.ccMappings.get('metronome:toggle'), 71);
  player.closeModal();

  const tempoDecreaseButton = root.querySelector('[data-action="adjust-tempo"][data-tempo-step="-0.5"]');
  const tempoIncreaseButton = root.querySelector('[data-action="adjust-tempo"][data-tempo-step="0.5"]');
  context(tempoDecreaseButton);
  assert.equal(player.pendingCcLearn.kind, 'tempo-adjust');
  assert.equal(player.pendingCcLearn.direction, -1);
  player.handleMidiControlChange({ channel: 1, controller: 72, inputId: 'test-midi', value: 127 });
  window.document.querySelector('[data-modal-action="confirm-cc-learn"]').click();
  assert.equal(player.ccMappings.get('metronome:decrease'), 72);
  context(tempoIncreaseButton);
  assert.equal(player.pendingCcLearn.kind, 'tempo-adjust');
  assert.equal(player.pendingCcLearn.direction, 1);
  player.handleMidiControlChange({ channel: 1, controller: 73, inputId: 'test-midi', value: 127 });
  window.document.querySelector('[data-modal-action="confirm-cc-learn"]').click();
  assert.equal(player.ccMappings.get('metronome:increase'), 73);
  player.metronome.setBpm(145);
  player.handleMidiControlChange({ channel: 1, controller: 72, inputId: 'test-midi', value: 0 });
  player.handleMidiControlChange({ channel: 1, controller: 72, inputId: 'test-midi', value: 127 });
  assert.equal(player.metronome.getBpm(), 144.5, 'CC do botão menos diminui exatamente 0,5 BPM');
  player.handleMidiControlChange({ channel: 1, controller: 72, inputId: 'test-midi', value: 127 });
  assert.equal(player.metronome.getBpm(), 144.5, 'CC mantido pressionado não repete o botão menos');
  player.handleMidiControlChange({ channel: 1, controller: 73, inputId: 'test-midi', value: 0 });
  player.handleMidiControlChange({ channel: 1, controller: 73, inputId: 'test-midi', value: 127 });
  assert.equal(player.metronome.getBpm(), 145, 'CC do botão mais aumenta exatamente 0,5 BPM');

  const midiToggle = value => player.handleMidiControlChange({ channel: 1, controller: 71, inputId: 'test-midi', value });
  const initialRunning = player.metronome.isRunning();
  midiToggle(0); midiToggle(127);
  assert.equal(player.metronome.isRunning(), !initialRunning, 'mapped CC toggles metronome');
  midiToggle(0); midiToggle(127);
  assert.equal(player.metronome.isRunning(), initialRunning, 'release then another press toggles it back');
  const mappingBackup = JSON.parse(JSON.stringify(player.createSavedPlayerState()));
  player.ccMappings.delete('metronome:toggle');
  player.applySavedPlayerState(mappingBackup);
  assert.equal(player.ccMappings.get('metronome:toggle'), 71, 'ON/OFF mapping survives backup restoration');
  assert.equal(player.ccMappings.get('metronome:decrease'), 72, 'mapeamento do botão menos sobrevive ao backup');
  assert.equal(player.ccMappings.get('metronome:increase'), 73, 'mapeamento do botão mais sobrevive ao backup');

  const tempoPointer = { target: tempoButton, isPrimary: true, pointerType: 'mouse', button: 0,
    pointerId: 30, clientX: 80, clientY: 200, timeStamp: 30000, preventDefault() {} };
  const initialTapCount = player.metronome.tapTimes.length;
  player.onRootPointerDown(tempoPointer);
  player.onRootPointerMove({ ...tempoPointer, clientY: 191 });
  assert.equal(player.metronome.getBpm(), 146.5, 'desktop drag up changes BPM by 0.5 per three pixels');
  player.onRootPointerMove({ ...tempoPointer, clientY: 206 });
  assert.equal(player.metronome.getBpm(), 144, 'desktop drag down decreases BPM in steps of 0.5');
  player.onRootPointerEnd({ ...tempoPointer, type: 'pointerup', timeStamp: 30020 });
  assert.equal(player.metronome.tapTimes.length, initialTapCount, 'BPM drag never counts as a tempo tap');
  player.metronome.tapTimes = [];
  for (const time of [31000, 31500]) {
    player.onRootPointerDown({ ...tempoPointer, timeStamp: time });
    player.onRootPointerEnd({ ...tempoPointer, type: 'pointerup', timeStamp: time + 20 });
  }
  assert.equal(player.metronome.getBpm(), 120, 'ordinary short clicks retain Tap Tempo');

  for (const [kind, module, selector] of [
    [null, null, '.player-output-knob'],
    ['module-settings', 1, '.module-envelope-knob'],
    ['module-synth', 8, '.module-envelope-knob'],
    ['module-reverb', 1, '.module-effect-knob']
  ]) {
    if (kind) player.openModal(kind, module, master);
    const area = kind ? window.document.querySelector(`.player-modal ${selector}`) : master.closest(selector);
    const input = area.querySelector('input[type="range"]');
    input.setPointerCapture = () => {};
    input.hasPointerCapture = () => false;
    const startValue = (Number(input.min) + Number(input.max)) / 2;
    input.value = String(startValue);
    const pointer = { ...tempoPointer, target: area, pointerId: 31, timeStamp: 32000 };
    if (kind) player.startKnobDrag(pointer, module);
    else player.onRootPointerDown(pointer);
    assert.equal(player.knobDrag.input, input, `${kind ?? 'master'} abre o fader pela área inteira do knob`);
    player.moveKnobDrag({ ...pointer, clientX: pointer.clientX + 20 });
    assert.equal(Number(input.value), startValue, 'o arrasto no knob não altera o parâmetro');
    player.endKnobDrag({ ...pointer, type: 'pointerup', timeStamp: 32040 });
    assert.equal(player.knobInputForTarget(area.querySelector('span')), input, 'knob face resolves the same input');
    if (kind) player.closeModal();
  }

  player.desktopRuntime = false;
  const appTempoPointer = { ...tempoPointer, pointerType: 'touch', pointerId: 32, timeStamp: 34000 };
  player.onRootPointerDown(appTempoPointer);
  await new Promise(resolve => setTimeout(resolve, 600));
  assert.equal(player.currentModalKind, 'tempo-edit', 'app long press opens BPM editor');
  tempoInput = window.document.querySelector('[data-tempo-input]');
  assert.equal(tempoInput.readOnly, true, 'app never opens the native keyboard');
  assert.equal(tempoInput.getAttribute('inputmode'), 'none');
  assert(window.document.querySelector('.on-screen-keyboard--numeric'));
  const appTapCount = player.metronome.tapTimes.length;
  player.onRootPointerEnd({ ...appTempoPointer, type: 'pointerup', timeStamp: 34620 });
  assert.equal(player.metronome.tapTimes.length, appTapCount, 'holding BPM does not change tempo by tapping');
  tempoInput.setSelectionRange(0, tempoInput.value.length);
  window.document.querySelector('.on-screen-keyboard--numeric [data-on-screen-key="9"]').click();
  window.document.querySelector('.on-screen-keyboard--numeric [data-on-screen-key="6"]').click();
  assert.equal(tempoInput.value, '96', 'custom numeric keys edit BPM');
  window.document.querySelector('[data-modal-action="confirm"]').click();
  assert.equal(player.metronome.getBpm(), 96, 'custom BPM is committed');
  player.selectBottomView('keyboard');
  const appBankButton = root.querySelector('[data-action="show-bank"][data-bank="C"]');
  assert.equal(appBankButton.getAttribute('aria-disabled'), null,
    'no app, os bancos continuam habilitados quando o Keyboard aparece');
  assert.doesNotMatch(playerCss,
    /\.player-presets\.is-keyboard[^\{]*player-navigation__bank-button[^\{]*\{[^}]*pointer-events:\s*none/,
    'o Keyboard não bloqueia os eventos de toque dos bancos');
  appBankButton.click();
  assert.equal(player.activeBank, 'C', 'toque simples no app troca de banco com o Keyboard aberto');
  const appBankPointer = { ...appTempoPointer, target: appBankButton, pointerId: 33, timeStamp: 35000 };
  player.onRootPointerDown(appBankPointer);
  await new Promise(resolve => setTimeout(resolve, 600));
  assert.equal(player.currentModalKind, 'bank-name', 'toque longo no banco abre a edição no app');
  player.onRootPointerEnd({ ...appBankPointer, type: 'pointerup', timeStamp: 35620 });
  player.closeModal();
  player.selectBottomView('presets');
  player.desktopRuntime = true;
  player.seamlessPresetSwitching = true;
  const beforePresetSwitch = calls.length;
  const syncSoundfontsForTest = player.syncNativeSoundfonts.bind(player);
  player.syncNativeSoundfonts = async (...args) => {
    calls.push({ command: '__sync_soundfonts_start', args: {} });
    return syncSoundfontsForTest(...args);
  };
  let finishTransition;
  transitionBarrier = new Promise(resolve => { finishTransition = resolve; });
  root.querySelector('.player-preset-button[data-preset="4"]').click();
  const switchReady = player.syncNativeEngine();
  await new Promise(resolve => setTimeout(resolve, 60));
  player.faders.get(1).setValueDb(-12, true);
  assert.equal(calls.slice(beforePresetSwitch).filter(c => c.command === 'begin_preset_transition').length, 1);
  assert(!calls.slice(beforePresetSwitch).some(c => c.command === 'configure_module'),
    'new preset parameters wait for its independent layer, never overwrite the old engine while transition prepares');
  assert(!calls.slice(beforePresetSwitch).some(c => c.command === 'set_module_gain'),
    'faders used during transition cannot mutate gain on the old preset');
  finishTransition();
  await switchReady;
  await player.nativeEngineSyncQueue;
  transitionBarrier = null;
  const switchCalls = calls.slice(beforePresetSwitch);
  assert.equal(switchCalls[0].command, 'begin_preset_transition');
  assert.equal(new Set(switchCalls.filter(c => c.command === 'configure_module').map(c => c.args.config.moduleIndex)).size, 8,
    'fresh preset layer receives every module config even if equal to the previous preset');
  assert(switchCalls.some(c => c.command === 'configure_synth'));
  const commitIndex = switchCalls.findIndex(c => c.command === 'commit_preset_transition');
  assert(commitIndex > switchCalls.findIndex(c => c.command === 'configure_synth'),
    'preset starts accepting new notes only after all its parameters are installed');
  const firstSoundFontLoad = switchCalls.findIndex(c => /sound_font/.test(c.command));
  assert(firstSoundFontLoad < 0 || commitIndex < firstSoundFontLoad,
    'trocou de preset, a próxima nota já é dele: o commit não espera o SF2 carregar');
  const soundfontSyncIndex = switchCalls.findIndex(c => c.command === '__sync_soundfonts_start');
  assert(soundfontSyncIndex >= 0 && commitIndex >= 0 && commitIndex < soundfontSyncIndex,
    'o commit vem antes de sincronizar os timbres: a nota seguinte já é do preset novo');
  player.syncNativeSoundfonts = syncSoundfontsForTest;
  const configsBeforeCommit = switchCalls.slice(0, commitIndex).filter(c => c.command === 'configure_module');
  for (const { args } of configsBeforeCommit) {
    const moduleIndex = args.config.moduleIndex;
    const timbre = player.getActivePresetState()?.modules[moduleIndex]?.timbreId ?? null;
    if (moduleIndex !== 7 && timbre && timbre !== player.nativeLoadedTimbres[moduleIndex]) {
      assert.equal(args.config.enabled, false, 'módulo com SF2 ainda chegando fica mudo, nunca toca o timbre antigo');
    }
  }
  assert(!switchCalls.some(c => c.command === 'stop_all_notes' || c.command === 'initialize'),
    'preset switches do not panic/restart the audio engine');
  player.compatibilityMode = true;
  player.midiInput.setCompatibilityMode(true);
  const beforeBlockedCc7 = player.metronome.isRunning();
  for (const controller of [0, 6, 7, 10, 16, 32, 100, 101]) {
    player.ccMappings.set('metronome:toggle', controller);
    player.midiInput.emitControlChange({ channel: 1, controller, inputId: 'test-midi', value: 127 });
    assert.equal(player.metronome.isRunning(), beforeBlockedCc7,
      `CC${controller} automático do teclado comum fica isolado no modo compatibilidade`);
  }
  player.handleMidiControlChange({ channel: 1, controller: 7, inputId: 'test-midi', value: 127 });
  assert.equal(player.metronome.isRunning(), beforeBlockedCc7, 'blocked CC7 cannot trigger UI mappings');
  player.ccMappings.set('metronome:toggle', 64);
  player.midiInput.emitControlChange({ channel: 1, controller: 64, inputId: 'test-midi', value: 127 });
  assert.notEqual(player.metronome.isRunning(), beforeBlockedCc7,
    'Sustain CC64 continua disponível para mapeamento no modo compatibilidade');
  player.ccMappings.set('preset:A:1', 102);
  const beforeCompatibilityPreset = player.bankStates.get(player.activeBank).selectedPreset;
  player.midiInput.emitControlChange({ channel: 1, controller: 7, inputId: 'test-midi', value: 1 });
  assert.equal(player.bankStates.get(player.activeBank).selectedPreset, beforeCompatibilityPreset,
    'blocked CC7 is not converted into synthetic preset controls');
  player.ccMappings.set('metronome:toggle', 102);
  const beforeReverbControl = player.metronome.isRunning();
  player.midiInput.emitControlChange({ channel: 1, controller: 91, inputId: 'test-midi', value: 1 });
  assert.notEqual(player.metronome.isRunning(), beforeReverbControl,
    'Reverb 1 on CC91 is converted into free CC102 while raw CC91 stays blocked');
  player.ccMappings.set('preset:A:2', 117);
  player.midiInput.emitControlChange({ channel: 1, controller: 91, inputId: 'test-midi', value: 16 });
  assert.equal(player.bankStates.get(player.activeBank).selectedPreset, 2,
    'Reverb 16 on CC91 is converted into the final compatibility CC117');
  player.ccMappings.set('preset:A:3', 118);
  player.midiInput.emitControlChange({ channel: 1, controller: 91, inputId: 'test-midi', value: 17 });
  assert.equal(player.bankStates.get(player.activeBank).selectedPreset, 2,
    'Reverb values above 16 do not create synthetic CC messages');
  player.compatibilityMode = false;
  player.midiInput.setCompatibilityMode(false);

  {
    const originalInstall = player.soundLibraryEngine.install.bind(player.soundLibraryEngine);
    const originalSyncNativeEngine = player.syncNativeEngine.bind(player);
    let simultaneousDownloads = 0;
    let maximumSimultaneousDownloads = 0;
    const order = [];
    player.soundLibraryEngine.install = async (soundId, onProgress) => {
      simultaneousDownloads += 1;
      maximumSimultaneousDownloads = Math.max(maximumSimultaneousDownloads, simultaneousDownloads);
      order.push(`start:${soundId}`);
      onProgress?.({ soundId, phase: 'downloading', receivedBytes: 50, totalBytes: 100, percentage: 50 });
      await new Promise(resolve => setTimeout(resolve, 5));
      order.push(`end:${soundId}`);
      simultaneousDownloads -= 1;
      return {};
    };
    player.syncNativeEngine = async () => {};
    const queuedSound = (id, name) => ({ id, name, category: 'keys', color: '#fff', sf2ObjectKey: `${id}.sf2`,
      previewObjectKey: '', catalogVersion: 1, publishedAt: null });
    for (const sound of [queuedSound('queue-one', 'Fila 1'), queuedSound('queue-two', 'Fila 2')]) {
      player.activeSoundDownloads.set(sound.id, {
        sound, percentage: 0, abort: new AbortController(), state: 'queued',
      });
    }
    await player.processSoundDownloadQueue();
    assert.equal(maximumSimultaneousDownloads, 1, 'downloads de timbre rodam um por vez');
    assert.deepEqual(order, ['start:queue-one', 'end:queue-one', 'start:queue-two', 'end:queue-two'],
      'a fila termina um timbre antes de iniciar o próximo');
    player.soundLibraryEngine.install = originalInstall;
    player.syncNativeEngine = originalSyncNativeEngine;
  }

  meterLevels = Array(16).fill(0);
  player.destroy();
  const reads = calls.filter(c => c.command === 'module_meter_levels').length;
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(calls.filter(c => c.command === 'module_meter_levels').length, reads, 'meter polling stops on destroy');
  console.log('PLAYER_STARTUP_OK: startup MIDI gate, SF2/OFF, defaults, layout, metronome/BPM Learn, enlarged knobs, isolated preset transitions and CC7 compatibility block');
} finally {
  await window.happyDOM.abort();
}
