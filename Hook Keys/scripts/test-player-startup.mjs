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
let audioLoad = [0.12, 0.1, 0]; // pico, media, estouros
window.__TAURI_INTERNALS__ = {
  invoke: async (command, args) => {
    calls.push({ command, args });
    if (command === 'begin_preset_transition' && transitionBarrier) await transitionBarrier;
    if (command === 'initialize' || command === 'audio_output_status') return { ready: true, failed: false };
    if (command === 'list_midi_devices' || command === 'list_audio_output_devices') return [];
    if (command === 'module_meter_levels') return meterLevels;
    if (command === 'begin_sound_font_upload') return { cached: true };
    if (command === 'module_analysis') return [0.5, 0.25];
    if (command === 'audio_load') return audioLoad;
    return 1;
  },
  transformCallback: () => 1,
};
window.eval(compiled.outputFiles[0].text);
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
  player.sendNativeMidi(3, 0x90, 64, 127);
  player.sendNativeMidi(3, 0x80, 64, 0);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls.filter(({ command }) => command === 'send_midi').length, 2,
    'somente mensagens novas após liberar a interface chegam ao motor');
  assert.equal(player.getActivePresetState().modules[7].settings.velocityCurve.mode, 'soft', 'o Synth nasce em Soft');
  assert.equal(player.getActivePresetState().modules[7].settings.synth.noVelocitySensitivity, true, 'o Synth nasce com No Sens ligado');
  assert.equal(player.getActivePresetState().modules[5].settings.velocityCurve.fixedValue, 80, 'o módulo 6 continua em Fixed 80');
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
    assert.equal(player.bankStates.get('A').presets[0].modules[5].settings.velocityCurve.fixedValue, 80,
      'estado salvo antigo leva o módulo 6 de Soft para Fixed 80');
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
      const filterCurve = player.bankStates.get('A').presets[2].modules[module].settings.filterVelocityCurve;
      assert.equal(filterCurve.mode, 'fixed', 'Velocity do Cutoff em Middle de fábrica volta para Fixed, filtro aberto');
      assert.equal(JSON.stringify(filterCurve.points), '[127,127,127,127,127]');
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
  assert(calls.some(({ command, args }) => command === 'configure_module' && args.config.moduleIndex === 7 && args.config.enabled), 'Synth deve chegar ativado ao motor');
  root.querySelector('[data-action="toggle-metronome"]').click();
  await new Promise(resolve => setTimeout(resolve, 150));
  assert(calls.some(({ command, args }) => command === 'configure_metronome' && args.enabled && args.volume > 0), 'click deve enviar metrônomo audível');
  assert(calls.some(({ command, args }) => command === 'set_output_gain' && args.enabled && args.db > -60), 'master deve estar audível');
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
  assert.notEqual(synthFader.style.getPropertyValue('--module-meter-left-level'), '0%', 'native Synth left peak reaches the fader');
  assert.notEqual(synthFader.style.getPropertyValue('--module-meter-right-level'), '0%', 'native Synth right peak reaches the fader');
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
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  player.closeModal();
  {
    const cc = (controller, value) => player.handleMidiControlChange({ controller, value, channel: 1, inputId: 'cc-test' });
    const press = (controller) => { cc(controller, 0); cc(controller, 127); };
    const learn = (selector, controller) => {
      const button = root.querySelector(selector);
      player.onRootContextMenu({ target: button, preventDefault() {} });
      assert.equal(player.currentModalKind, 'cc-learn', `${selector} abre o Learn CC`);
      cc(controller, 127);
      player.closeModal();
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

    // A tela do Learn tem Clean, com confirmação, e volta para o Learn.
    const learnFooter = () => [...window.document.querySelectorAll('.player-modal__actions > button')];
    player.onRootContextMenu({ target: root.querySelector('[data-action="octave-up"][data-module="2"]'), preventDefault() {} });
    assert.equal(JSON.stringify(learnFooter().map((button) => button.textContent.trim())), JSON.stringify(['Voltar', 'Clean']));
    const clean = () => window.document.querySelector('[data-modal-action="clean-learn-cc"]');
    assert.equal(clean().disabled, false, 'Clean fica ativo quando o controle já tem CC');
    clean().click();
    assert.equal(player.currentModalKind, 'cc-clear-confirm', 'Clean pede confirmação');
    window.document.querySelector('[data-modal-action="cancel-cc-clear"]').click();
    assert.equal(player.currentModalKind, 'cc-learn', 'Cancelar volta para o Learn');
    assert.equal(player.ccMappings.get('octave:2:up'), 40, 'Cancelar mantém o CC');
    clean().click();
    window.document.querySelector('[data-modal-action="confirm-cc-clear"]').click();
    assert.equal(player.currentModalKind, 'cc-learn', 'Limpar volta para o Learn');
    assert(!player.ccMappings.has('octave:2:up'), 'Clean remove o CC do controle');
    assert.match(window.document.querySelector('[data-cc-learn-current]').textContent, /Ainda não mapeado/);
    assert.equal(clean().disabled, true, 'sem CC, o Clean fica desativado');
    cc(43, 127);
    assert.equal(player.ccMappings.get('octave:2:up'), 43, 'depois do Clean o Learn continua esperando o MIDI');
    assert.equal(clean().disabled, false, 'aprender um CC reativa o Clean');
    clean().click();
    window.document.querySelector('[data-modal-action="confirm-cc-clear"]').click();
    player.closeModal();

    // Duplicatas de estados antigos: fica o mapeamento gravado por último.
    const saved = JSON.parse(JSON.stringify(player.createSavedPlayerState()));
    saved.ccMappings = { ...saved.ccMappings, 'power:1': 50, 'power:2': 50 };
    player.applySavedPlayerState(saved);
    assert(!player.ccMappings.has('power:1') && player.ccMappings.get('power:2') === 50, 'duplicatas salvas são limpas');
    for (const key of ['octave:2:up', 'input:4:sustain', 'input:4:modulation', 'power:2']) player.ccMappings.delete(key);
  }
  assert.equal(synthShortcut.textContent.trim(), 'Synth', 'alternar modo não muda o atalho frontal');
  player.openModal('module-settings', 8, master);
  assert(window.document.querySelector('.module-compressor-preview'), 'Param do Synth tem preview do compressor');
  assert(!window.document.querySelector('[data-module-setting-action="open-synth"]'));
  {
    const row = window.document.querySelector('.module-settings-bottom-row');
    assert(row.querySelector('.module-velocity-card') && row.querySelector('[data-module-mod-card]'),
      'Param do Synth tem o card Mod na linha do Velocity');
    assert(!row.querySelector('[data-module-glide-card]'), 'o Glide do Synth fica no editor, não no Param');
    const lastMod = () => calls.filter(({ command, args }) => command === 'configure_module_modulation' && args.config.moduleIndex === 7).at(-1)?.args.config;
    await player.syncNativeEngine();
    assert.equal(lastMod()?.lfo, true, 'o card Mod do Synth nasce em LFO');
    window.document.querySelector('[data-module-modulation-mode="user"]').click();
    assert.match(window.document.querySelector('[data-module-mod-card] header small').textContent, /Synth · LFO/);
    await player.syncNativeEngine();
    assert.equal(lastMod().lfo, false, 'User: a roda volta para o LFO do editor do Synth');
    window.document.querySelector('[data-module-modulation-mode="lfo"]').click();
    const rate = window.document.querySelector('[data-module-modulation-rate]');
    rate.value = '6';
    rate.dispatchEvent(new window.Event('input', { bubbles: true }));
    await player.syncNativeEngine();
    assert.equal(JSON.stringify(lastMod()), JSON.stringify({ moduleIndex: 7, lfo: true, rateHz: 6 }), 'o motor recebe o Rate do card Mod do Synth');
    rate.value = '6.85';
    rate.dispatchEvent(new window.Event('input', { bubbles: true }));
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
    await player.syncNativeEngine();
    assert.equal(JSON.stringify(lastLimits(1)), JSON.stringify({ moduleIndex: 1, ignoreAbove: 127, ceiling: 127, oscillator1Limit: 127, oscillator2Limit: 127 }),
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
    assert.equal(JSON.stringify(lastLimits(7)), JSON.stringify({ moduleIndex: 7, ignoreAbove: 127, ceiling: 127, oscillator1Limit: 127, oscillator2Limit: 90 }),
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
  }
  master.value = '100';
  master.dispatchEvent(new window.Event('input', { bubbles: true }));
  await player.syncNativeEngine();
  assert(calls.some(({ command, args }) => command === 'set_output_gain' && args.db === 12));
  assert.match(root.querySelector('[data-output-value="master"]').value, /\+12/);
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
  assert.equal(master.value, '82', 'double tap resets master to unity 0dB, not +12');
  for (let module = 1; module <= 8; module++) {
    player.openModal('module-settings', module, master);
    const glideCard = window.document.querySelector('[data-module-glide-card]');
    assert.equal(Boolean(glideCard), module <= 7);
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
    assert.equal(knob.value, '0', 'double tap volta o Glide para 0 ms, desligado');
    const settings = player.getActivePresetState().modules[module - 1].settings;
    assert.equal(settings.glideMs, 0);
    await player.syncNativeEngine();
    assert.equal(calls.filter(({command,args}) => command === 'configure_module_envelope' && args.config.moduleIndex === module - 1).at(-1).args.config.glideMs, 0);
  }
  {
    const lastGlide = (moduleIndex) => calls.filter(({ command, args }) => command === 'configure_glide' && args.config.moduleIndex === moduleIndex).at(-1)?.args.config;
    for (const [module, kind] of [[2, 'module-settings'], [8, 'module-synth']]) {
      player.openModal(kind, module, master);
      const buttons = () => [...window.document.querySelectorAll('[data-module-glide-card] header button')].map((button) => button.textContent.trim());
      assert.equal(JSON.stringify(buttons()), JSON.stringify(['Sync', 'Auto', 'Config', 'No Sens']),
        'card de Glide padrão: Sync | Auto / Config | No Sens');
      // No Sens: o motor recebe velocity cheia; desligado, a curva salva (Soft).
      const curve = () => {
        const config = calls.filter(({ command, args }) => command === 'configure_module' && args.config.moduleIndex === module - 1).at(-1).args.config;
        return [config.velocityCurve0, config.velocityCurve1, config.velocityCurve2, config.velocityCurve3, config.velocityCurve4].join(',');
      };
      const noSens = () => window.document.querySelector('[data-glide-no-sens]');
      await player.syncNativeEngine();
      assert.equal(noSens().getAttribute('aria-pressed'), String(module === 8), 'No Sens nasce ligado só no Synth');
      assert.equal(curve(), module === 8 ? '127,127,127,127,127' : '0,16,44,84,127');
      noSens().click();
      await player.syncNativeEngine();
      assert.equal(noSens().getAttribute('aria-pressed'), String(module !== 8));
      assert.equal(curve(), module === 8 ? '0,16,44,84,127' : '127,127,127,127,127', 'No Sens alterna o volume fixo no motor');
      noSens().click();
      await player.syncNativeEngine();
      await player.syncNativeEngine();
      assert.equal(JSON.stringify(lastGlide(module - 1)), JSON.stringify({ moduleIndex: module - 1, portamento: false, velocityGateEnabled: false, velocityGateInverted: false, velocityThreshold: 64 }),
        'o motor começa em Auto com o limite de velocity desligado');
      window.document.querySelector('[data-glide-mode]').click();
      assert.equal(window.document.querySelector('[data-glide-mode]').textContent, 'Porta', 'o modo alterna para Portamento');
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
  const drag = { target: master, isPrimary: true, pointerType: 'mouse', button: 0, pointerId: 1, clientX: 50, clientY: 200, timeStamp: 12000, preventDefault() {} };
  player.startKnobDrag(drag, null);
  assert.equal(player.knobDrag.travelPixels, 240);
  assert.equal(player.knobDrag.linear, true);
  player.moveKnobDrag({ ...drag, clientY: 190 });
  assert.equal(master.value, '86.2', 'desktop mouse uses constant linear sensitivity');
  player.moveKnobDrag({ ...drag, clientY: 180 });
  assert.equal(master.value, '90.3', 'twice the mouse distance produces twice the change');
  player.moveKnobDrag({ ...drag, clientY: 210 });
  assert.equal(master.value, '77.8', 'dragging down reverses the linear change');
  player.moveKnobDrag({ ...drag, clientY: -400 });
  assert.equal(master.value, '100', 'desktop movement clamps at maximum');
  player.moveKnobDrag({ ...drag, clientY: 800 });
  assert.equal(master.value, '0', 'desktop movement clamps at minimum');
  player.endKnobDrag({ ...drag, type: 'pointerup', timeStamp: 12040 });
  player.openModal('module-settings', 1, master);
  const fineDrag = (input, startValue, pixels, moduleNumber = player.currentModalModuleNumber) => {
    const desktop = player.desktopRuntime;
    player.desktopRuntime = false; // Exercise the app response separately.
    input.value = String(startValue);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    input.setPointerCapture = () => {};
    input.hasPointerCapture = () => false;
    const start = { target: input, isPrimary: true, pointerType: 'touch', button: 0, pointerId: 9,
      clientX: 100, clientY: 200, timeStamp: 13000, preventDefault() {} };
    player.startKnobDrag(start, moduleNumber);
    assert.equal(player.knobDrag.linear, false);
    player.moveKnobDrag({ ...start, clientY: 200 - pixels, timeStamp: 13020 });
    player.endKnobDrag({ ...start, type: 'pointerup', clientY: 200 - pixels, timeStamp: 13040 });
    player.desktopRuntime = desktop;
  };
  const attack = window.document.querySelector('[data-module-envelope="attackMs"]');
  fineDrag(attack, 80, 3);
  assert.equal(attack.value, '81', 'app envelope permits exact 1ms steps');
  assert.equal(window.document.querySelector('[data-module-envelope-value="attackMs"]').value, '81.0 ms');
  const cutoff = window.document.querySelector('[data-module-cutoff]');
  fineDrag(cutoff, 0, 3);
  assert.equal(window.document.querySelector('[data-module-cutoff-value]').value, '21 Hz', 'module Cutoff permits exact 1Hz steps');
  player.openModal('module-synth', 8, master);
  const detune = window.document.querySelector('[data-synth-parameter="detuneCents"]');
  fineDrag(detune, 0, 3);
  assert.equal(detune.value, '1', 'Synth knobs use their exact minimum step');
  const synthCutoff = window.document.querySelector('[data-synth-scale="cutoff"]');
  fineDrag(synthCutoff, 0, 3);
  assert.equal(synthCutoff.getAttribute('aria-valuetext'), '21 Hz', 'Synth Cutoff also advances in exact Hz');
  const synthDecay = window.document.querySelector('[data-synth-parameter="decayMs"]');
  synthDecay.value = '4';
  synthDecay.setPointerCapture = () => {};
  synthDecay.hasPointerCapture = () => false;
  const mouseDecay = { target: synthDecay, isPrimary: true, pointerType: 'mouse', button: 0, pointerId: 11,
    clientX: 100, clientY: 600, timeStamp: 14000, preventDefault() {} };
  player.startKnobDrag(mouseDecay, 8);
  player.moveKnobDrag({ ...mouseDecay, clientY: 598 });
  assert.equal(synthDecay.value, '6', 'desktop mouse moves a 25 s time knob one ms per pixel near the click');
  player.moveKnobDrag({ ...mouseDecay, clientY: 597 });
  assert.equal(synthDecay.value, '7', 'the next pixel advances exactly one more ms');
  player.moveKnobDrag({ ...mouseDecay, clientY: 552 });
  assert(Number(synthDecay.value) > 50 && Number(synthDecay.value) < 110, 'desktop mouse reaches values between 50 and 110 ms');
  player.moveKnobDrag({ ...mouseDecay, clientY: 180 });
  assert.equal(synthDecay.value, '25000', 'desktop mouse still covers the whole time range in a short drag');
  player.endKnobDrag({ ...mouseDecay, type: 'pointerup', clientY: 180, timeStamp: 14040 });
  player.openModal('module-reverb', 1, master);
  const decay = window.document.querySelector('[data-module-effect-control="decay"]');
  fineDrag(decay, 2.5, 3);
  assert.equal(decay.value, '2.6', 'effect knobs use their declared decimal step');
  player.openModal('module-arpeggiator', 6, master);
  const octave2 = window.document.querySelector('[data-arpeggiator-octaves="2"]');
  octave2.click();
  assert(octave2.classList.contains('is-selected'), 'Arpeggiator octaves use the requested 2x2 buttons');
  const gate = window.document.querySelector('[data-pattern-parameter="gate"]');
  fineDrag(gate, 70, 3);
  assert.equal(gate.value, '71', 'pattern knobs use the same progressive curve');
  for (const [kind, module] of [['module-settings', 1], ['module-synth', 8], ['module-reverb', 1], ['module-delay', 1], ['module-compressor', 1], ['module-rotary', 5], ['module-arpeggiator', 6], ['module-sequencer', 7]]) {
    player.openModal(kind, module, master);
    for (const input of window.document.querySelectorAll('.player-modal .module-envelope-knob input, .player-modal .module-effect-knob input')) {
      const value = player.defaultKnobValue(input);
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
  player.ccMappings.set('preset:2', 22);
  player.handleMidiControlChange({ channel: 1, controller: 22, inputId: 'keyboard-a', value: 127 });
  assert.equal(player.bankStates.get(player.activeBank).selectedPreset, 2, 'CC mapeado aciona o preset');
  player.activateMappedPreset(1);
  player.lastCcValues.set('keyboard-a:1:22', { value: 127, receivedAt: performance.now() - 200 });
  player.handleMidiControlChange({ channel: 1, controller: 22, inputId: 'keyboard-a', value: 127 });
  assert.equal(player.bankStates.get(player.activeBank).selectedPreset, 2,
    'teclado que envia somente 127 consegue acionar o mesmo CC novamente');
  player.openModal('module-eq', 1, master);
  assert.equal(window.document.querySelector('[data-module-eq-rta]'), null,
    'EQ permanece leve e sem RTA');
  player.openModal('module-compressor', 1, master);
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.notEqual(window.document.querySelector('[data-compressor-meter="input"] i b').style.height, '0%',
    'medidor Input do compressor recebe sinal real');
  const cpuMeter = window.document.querySelector('[data-cpu-meter]');
  assert(cpuMeter, 'o desktop mostra o medidor de carga do audio ao lado de User');
  assert.equal(cpuMeter.querySelector('[data-cpu-meter-value]').textContent, '12%',
    'o medidor mostra quanto do prazo do bloco o callback consumiu');
  assert(!cpuMeter.classList.contains('is-critical'),
    'uma carga folgada nao acende o alerta');
  audioLoad = [0.97, 0.5, 0];
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(cpuMeter.querySelector('[data-cpu-meter-value]').textContent, '97%',
    'o pior bloco aparece imediatamente, sem suavizacao de ataque');
  assert(cpuMeter.classList.contains('is-critical'),
    'encostar no prazo do bloco deixa o numero vermelho');
  audioLoad = [0.12, 0.1, 0];
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
  assert.equal(player.nativeLoadedTimbres[0], 'user:b');
  assert.equal(preset.modules[7].enabled, false, 'terminar o SF2 não reativa o módulo desligado');
  assert(calls.some(({ command, args }) => command === 'begin_sound_font_upload' && /^[a-f0-9]{64}$/.test(args.assetKey)),
    'arquivo nativo recebe uma chave estável para reutilizar o cache');
  const saved = JSON.parse(JSON.stringify(player.createSavedPlayerState()));
  player.openModal('module-sequencer', 7, master);
  assert(window.document.querySelector('[data-trance-gate-editor]'));
  assert(!window.document.querySelector('[data-pattern-parameter="semitone"]'));
  assert.equal(player.createPatternPlaybackSnapshot().sequencer.settings, null,
    'o módulo 7 nunca ativa o antigo gerador de notas do sequencer');
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
  window.document.querySelector('[data-module-effect-power="sequencer"]').click();
  await player.syncNativeEngine();
  assert.equal(calls.filter(c => c.command === 'configure_trance_gate').at(-1).args.config.enabled, false);
  const gateBackup = JSON.parse(JSON.stringify(player.createSavedPlayerState()));
  player.applySavedPlayerState(gateBackup);
  assert.equal(player.getActivePresetState().modules[6].settings.tranceGate.depth, 50,
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
  assert.equal(player.ccMappings.get('metronome:tap'), 70);
  player.closeModal();

  context(root.querySelector('.player-metronome-button'));
  assert.equal(player.currentModalKind, 'metronome');
  window.document.querySelector('[data-modal-action="learn-metronome-cc"]').click();
  assert.equal(player.pendingCcLearn.kind, 'metronome-toggle');
  player.handleMidiControlChange({ channel: 1, controller: 71, inputId: 'test-midi', value: 127 });
  assert.equal(player.ccMappings.get('metronome:toggle'), 71);
  player.closeModal();
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
    assert.equal(player.knobDrag.input, input, `${kind ?? 'master'} starts dragging from the label area, not just the center`);
    player.moveKnobDrag({ ...pointer, clientY: 180 });
    assert(Number(input.value) > startValue);
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
  player.desktopRuntime = true;
  player.seamlessPresetSwitching = true;
  const beforePresetSwitch = calls.length;
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
  assert(!switchCalls.some(c => c.command === 'stop_all_notes' || c.command === 'initialize'),
    'preset switches do not panic/restart the audio engine');
  player.compatibilityMode = true;
  player.midiInput.setCompatibilityMode(true);
  player.ccMappings.set('metronome:toggle', 7);
  const beforeBlockedCc7 = player.metronome.isRunning();
  player.handleMidiControlChange({ channel: 1, controller: 7, inputId: 'test-midi', value: 127 });
  assert.equal(player.metronome.isRunning(), beforeBlockedCc7, 'blocked CC7 cannot trigger UI mappings');
  player.ccMappings.set('preset:1', 102);
  const beforeCompatibilityPreset = player.bankStates.get(player.activeBank).selectedPreset;
  player.midiInput.emitControlChange({ channel: 1, controller: 7, inputId: 'test-midi', value: 1 });
  assert.equal(player.bankStates.get(player.activeBank).selectedPreset, beforeCompatibilityPreset,
    'blocked CC7 is not converted into synthetic preset controls');
  player.ccMappings.set('metronome:toggle', 102);
  const beforeReverbControl = player.metronome.isRunning();
  player.midiInput.emitControlChange({ channel: 1, controller: 91, inputId: 'test-midi', value: 1 });
  assert.notEqual(player.metronome.isRunning(), beforeReverbControl,
    'Reverb 1 on CC91 is converted into free CC102 while raw CC91 stays blocked');
  player.ccMappings.set('preset:2', 117);
  player.midiInput.emitControlChange({ channel: 1, controller: 91, inputId: 'test-midi', value: 16 });
  assert.equal(player.bankStates.get(player.activeBank).selectedPreset, 2,
    'Reverb 16 on CC91 is converted into the final compatibility CC117');
  player.ccMappings.set('preset:3', 118);
  player.midiInput.emitControlChange({ channel: 1, controller: 91, inputId: 'test-midi', value: 17 });
  assert.equal(player.bankStates.get(player.activeBank).selectedPreset, 2,
    'Reverb values above 16 do not create synthetic CC messages');
  player.compatibilityMode = false;
  player.midiInput.setCompatibilityMode(false);
  meterLevels = Array(16).fill(0);
  player.destroy();
  const reads = calls.filter(c => c.command === 'module_meter_levels').length;
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(calls.filter(c => c.command === 'module_meter_levels').length, reads, 'meter polling stops on destroy');
  console.log('PLAYER_STARTUP_OK: startup MIDI gate, SF2/OFF, defaults, layout, metronome/BPM Learn, enlarged knobs, isolated preset transitions and CC7 compatibility block');
} finally {
  await window.happyDOM.abort();
}
