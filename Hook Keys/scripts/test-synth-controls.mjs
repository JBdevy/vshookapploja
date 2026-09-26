import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function transpile(path, modules = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const context = { exports: {}, require(specifier) {
    assert(specifier in modules, `Unexpected runtime import: ${specifier}`);
    return modules[specifier];
  } };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports;
}

const knobView = transpile('../src/features/player/ParameterKnobView.ts');
const audioOutput = transpile('../src/features/audio/AudioOutputService.ts', {
  '../../platform/native/HookKeysNative': { hookKeysNative: {} },
});

test('compressor meters stop requesting analysis and reset immediately when disabled', () => {
  const source = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('PlayerScreen.ts', source, ts.ScriptTarget.Latest, true);
  const player = ast.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'PlayerScreen');
  const names = ['getCompressorAnalysisModuleIndex', 'renderModuleAnalysis'];
  const methods = player.members.filter(node => ts.isMethodDeclaration(node) && names.includes(node.name?.getText(ast)));
  const context = { exports: {}, readModuleCompressorSettings: value => ({ enabled: false, ...value }) };
  vm.runInNewContext(ts.transpileModule(`export class Handler { ${methods.map(node => node.getText(ast)).join('\n')} }`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  const handler = new context.exports.Handler();
  const state = { enabled: true, settings: { compressor: { enabled: true } } };
  const fills = [{ style: {} }, { style: {} }];
  const outputs = [{}, {}];
  handler.currentModalModuleNumber = 1;
  handler.compressorMeterDb = [-60, -60];
  handler.getActivePresetState = () => ({ modules: [state] });
  handler.modal = { querySelector(selector) {
    const index = selector.includes('output') ? 1 : 0;
    return { querySelector: part => part === 'i > b' ? fills[index] : outputs[index] };
  } };
  assert.equal(handler.getCompressorAnalysisModuleIndex(), 0);
  handler.renderModuleAnalysis([1, 0.5]);
  assert.notEqual(fills[0].style.height, '0%');
  state.settings.compressor.enabled = false;
  assert.equal(handler.getCompressorAnalysisModuleIndex(), null);
  // An in-flight native reply must not resurrect meters after OFF.
  handler.renderModuleAnalysis([1, 1]);
  for (const fill of fills) assert.equal(fill.style.height, '0%');
  for (const output of outputs) assert.equal(output.textContent, '−∞ dB');
  state.settings.compressor.enabled = true;
  handler.renderModuleAnalysis([0.5, 0.25]);
  assert.notEqual(fills[0].style.height, '0%');
  state.enabled = false;
  assert.equal(handler.getCompressorAnalysisModuleIndex(), null);
});
const glideView = transpile('../src/features/player/GlideView.ts', {
  './ParameterKnobView': knobView,
});
const synthView = transpile('../src/features/player/SynthModuleView.ts', {
  './ParameterKnobView': knobView,
  './GlideView': glideView,
});
const settingsView = transpile('../src/features/player/ModuleSettingsView.ts', {
  './ParameterKnobView': knobView,
  './GlideView': glideView,
  './ModuleEffectsView': {
    createModuleEffectCardsMarkup: () => '',
    createModuleChorusMarkup: () => '', createModuleCompressorMarkup: () => '',
    createModuleDelayMarkup: () => '', createModuleReverbMarkup: () => '',
    createModuleRotaryMarkup: () => '',
    readModuleChorusSettings: () => ({ enabled: false }),
    readModuleCompressorSettings: () => ({ enabled: false }),
    readModuleDelaySettings: () => ({ enabled: false }),
    readModuleReverbSettings: () => ({ enabled: false }),
    readModuleRotarySettings: () => ({ enabled: false }),
    readModuleCutoffEnvelopeSettings: () => ({ enabled: false }),
    readCutoffFilterType: () => 'lowpass2',
  },
  './PatternModulesView': { createArpeggiatorMarkup: () => '', readArpeggiatorSettings: () => ({ enabled: false }) },
  './TranceGateView': { createTranceGateMarkup: () => '', readTranceGateSettings: () => ({ enabled: false }) },
  '../audio/AudioOutputService': { createAudioRouteOptions: () => '' },
  './VelocityCurveView': {
    createVelocityCardMarkup: () => '',
    readVelocityLimit: (value) => Number.isFinite(Number(value)) ? Math.round(Math.min(127, Math.max(0, Number(value)))) : 127,
  },
});
const appSettingsView = transpile('../src/features/player/AppSettingsView.ts', {
  '../audio/AudioOutputService': { createAudioRouteOptions: () => '<option>1+2</option>' },
});

test('shared knob generates empty, half-full and full value bars with one common face', () => {
  for (const [value, progress, angle] of [[0, 0, -135], [.5, .5, 0], [1, 1, 135], [-1, 0, -135], [2, 1, 135], [NaN, 0, -135]]) {
    const markup = knobView.createParameterKnobMarkup(value, '<input type="range">');
    assert.match(markup, /class="module-envelope-knob"/);
    assert.match(markup, /class="module-envelope-knob__face" aria-hidden="true"><i><\/i><\/span>/);
    assert(markup.includes(`--knob-progress:${progress}`));
    assert(markup.includes(`--knob-angle:${angle}deg`));
  }
});

test('every Synth parameter uses exactly the same knob face as timbre parameters', () => {
  const synthMarkup = synthView.createSynthModuleMarkup({});
  const moduleMarkup = settingsView.createModuleSettingsMarkup([], [], null, {}, 120, 2, '1+2');
  const faces = (markup) => [...markup.matchAll(/<span class="module-envelope-knob__face"[^>]*><i><\/i><\/span>/g)].map(([face]) => face);
  assert.equal(faces(synthMarkup).length, 19, 'Synth knobs plus velocity, volume and Detune per OSC');
  assert.equal(faces(moduleMarkup).length, 10, 'timbre knobs plus Sustain, Limite Velocity and Gain');
  assert.match(moduleMarkup, /data-module-sustain aria-label="Sustain do envelope"/);
  assert(faces(synthMarkup).every((face) => face === faces(moduleMarkup)[0]));
  assert.doesNotMatch(synthMarkup, /module-effect-knob|synth-knob|conic-gradient|border/);
  assert.equal([...synthMarkup.matchAll(/data-synth-parameter=/g)].length, 19);
  assert.doesNotMatch(synthMarkup, /Mix OSC 2|data-synth-parameter="oscillatorMix"/);
  assert.match(synthMarkup, /Volume OSC 1/);
  assert.match(synthMarkup, /Volume OSC 2/);
});

test('Synth keeps one shared control layout on desktop and app', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css,
    /\.synth-editor__header\s*\{\s*grid-template-columns:\s*minmax\(180px,[^}]+\}/,
    'wide desktop must not move OSC tabs beside the preset row');
  assert.doesNotMatch(css,
    /\.player-modal--module-synth \.synth-card--oscillator\s*\{\s*grid-column:\s*span 3;/,
    'the app must not replace the shared OSC card flow');
  assert.doesNotMatch(css,
    /\.player-modal--module-synth \.synth-editor__grid\s*\{[^}]*grid-template-columns:\s*repeat\(6,/,
    'the compact app rule may resize controls but cannot replace the desktop grid');
  assert.match(css,
    /\.synth-oscillator-page \.synth-card--oscillator\s*\{[^}]*grid-column:\s*span 2;[^}]*grid-row:\s*span 2;/,
    'the oscillator card must fill the left side of both rows');
  assert.match(css,
    /\.synth-oscillator-page \.synth-card--octaves\s*\{\s*grid-column:\s*3 \/ -1;/,
    'the rectangular OCT card must fill the space below Volume and Detune');
  assert.match(css,
    /filterEnvelope[^}]+\{\s*grid-column:\s*span 2;/,
    'Filter Env must close its four-column row');
  assert.match(css,
    /\.synth-editor__grid > \.module-glide-card\s*\{\s*grid-column:\s*1 \/ -1;/,
    'Glide must use the whole final row instead of leaving empty cells');
  assert.match(css,
    /\.player-modal--module-synth \.player-modal__header\s*\{\s*display:\s*none;/,
    'the redundant Synth title must not consume vertical space');
  assert.match(css,
    /\.player-modal--module-synth \.player-modal__surface\s*\{[^}]*grid-template-rows:\s*minmax\(0, 1fr\) auto;/,
    'body and footer must use the two real modal rows after removing the title');
  assert.match(css,
    /\.player-modal--module-synth \.synth-editor\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/,
    'the Synth editor must not draw a second contour inside the modal');
});

test('Glide Sync follows one BPM beat without pattern divisions and preserves manual time', () => {
  const manual = glideView.createGlideCardMarkup({ glideMs: 450 }, 120);
  assert.match(manual, /data-module-glide-card/);
  assert.doesNotMatch(manual, /data-glide-power/, 'sem ON/OFF: 0 ms é o Glide desligado');
  assert.equal(glideView.readGlideMs({}), 0, 'módulos nascem com Glide em 0 ms');
  const order = (markup) => [...markup.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map(([, label]) => label);
  assert.equal(JSON.stringify(order(manual)), JSON.stringify(['Sync', 'Auto', 'Config', 'No Sens']));
  assert.equal(JSON.stringify(order(glideView.createGlideCardMarkup({}, 120, 'synth'))), JSON.stringify(['Sync', 'Auto', 'Config', 'No Sens']),
    'o card de Glide é igual nos módulos e no Synth');
  assert.match(manual, /data-glide-no-sens aria-pressed="false"/, 'timbres nascem sem No Sens');
  assert.match(glideView.createGlideCardMarkup({}, 120, 'synth'), /data-glide-no-sens aria-pressed="true"/, 'o Synth nasce com No Sens');
  assert.match(manual, /data-glide-sync aria-pressed="false">Sync/);
  assert.match(manual, /value="450" data-glide-time/);
  const synchronized = { glideMs: 450, glideSync: true, glideDivision: '1/8' };
  assert.equal(glideView.effectiveGlideMs(synchronized, 120), 500);
  assert.equal(glideView.effectiveGlideMs(synchronized, 60), 1000);
  const synchronizedMarkup = glideView.createGlideCardMarkup(synchronized, 120);
  assert.match(synchronizedMarkup, /value="120" data-glide-time data-glide-synced="true" disabled/);
  assert.match(synchronizedMarkup, /aria-valuetext="120 BPM"/);
  assert.doesNotMatch(synchronizedMarkup, /1\/8|Divisão/);
  const synth = glideView.createGlideCardMarkup(synchronized, 120, 'synth');
  assert.doesNotMatch(synth, /data-glide-power/);
  assert.match(synth, /data-synth-parameter="glideMs"/);
  assert.equal(glideView.readGlideMs(synchronized), 450, 'manual value remains stored while Sync is on');
});

test('modules 1 through 7 expose equal Velocity, Glide and Mod cards with LFO Pitch at 6.85 Hz by default', () => {
  const markup = settingsView.createModuleSettingsMarkup([], [], null, {}, 120, 2, '1+2');
  assert.match(markup, /data-module-mod-card/);
  assert.match(markup, /data-module-modulation-mode="lfo"\s+class="is-selected"/);
  assert.match(markup, /value="6.85"\s+data-module-modulation-rate/);
  assert.match(markup, /<output data-module-modulation-rate-value>6\.85 Hz<\/output>/);
  assert.doesNotMatch(markup, /<small>[^<]*Hz<\/small>/, 'sem texto solto embaixo de Mod');
  assert.match(markup, /data-module-setting-action="open-filter-velocity"/);
  const user = settingsView.createModuleModulationCardMarkup({ modulationMode: 'user', modulationRateHz: 12 });
  assert.match(user, /data-module-modulation-mode="user"\s+class="is-selected"/);
  assert.match(user, /data-module-modulation-rate[^>]*disabled/);
  // Tremolo: terceiro modo do SF2, com o mesmo Rate do LFO de pitch.
  assert.match(markup, /data-module-modulation-modes="4"/);
  assert.match(markup, /data-module-modulation-mode="tremolo"/);
  const tremolo = settingsView.createModuleModulationCardMarkup({ modulationMode: 'tremolo', modulationRateHz: 4 });
  assert.match(tremolo, /data-module-modulation-mode="tremolo"\s+class="is-selected"/);
  assert.match(tremolo, /<output data-module-modulation-rate-value>4\.00 Hz<\/output>/);
  // O nome inteiro fica dentro do botão: por isso o card perdeu o texto do topo.
  assert.match(tremolo, />Tremolo<\/button>/);
  assert.doesNotMatch(tremolo, /data-module-modulation-rate[^>]*disabled/, 'o Rate vale para o Tremolo');
  assert.equal(settingsView.moduleModulationEngineMode('user'), 0);
  assert.equal(settingsView.moduleModulationEngineMode('lfo'), 1);
  assert.equal(settingsView.moduleModulationEngineMode('tremolo'), 2);
  // O Synth não tem Tremolo próprio da roda: lá o card cai para o LFO.
  const synth = settingsView.createModuleModulationCardMarkup({ modulationMode: 'tremolo' }, 'synth');
  assert.match(synth, /data-module-modulation-modes="2"/);
  assert.doesNotMatch(synth, /tremolo/);
  assert.match(synth, /data-module-modulation-mode="lfo"\s+class="is-selected"/);
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.module-settings-bottom-row:has\(\.module-mod-card\)[^{]*\{[^}]*repeat\(3, minmax\(0, 1fr\)\)/s);
});

test('Modo Lite: so no App, com descricao, e nao convive com a troca sem corte', () => {
  const app = appSettingsView.createAppSettingsMarkup(false, true, 'presets', false, 1, 'standard', true, false, true);
  assert.match(app, /data-setting="lite-mode"/);
  assert.match(app, /Modo Lite/);
  assert.match(app, /aparelhos antigos/);
  // Desligado, a troca sem corte segue livre.
  assert.doesNotMatch(app, /data-setting="seamless-preset-switching"[^>]*disabled/);
  const lite = appSettingsView.createAppSettingsMarkup(false, false, 'presets', false, 1, 'standard', true, true, true);
  assert.match(lite, /data-setting="lite-mode" checked/);
  assert.match(lite, /data-setting="seamless-preset-switching" disabled/, 'com o Lite ligado ela fica travada');
  // Desktop nao tem Modo Lite.
  const desktop = appSettingsView.createAppSettingsMarkup(false, false, 'presets', false, 1, 'standard', true, false, false);
  assert.doesNotMatch(desktop, /data-setting="lite-mode"/);
  // O celular escolhe MIDI e estilo do teclado como o desktop.
  assert.match(desktop, /data-desktop-keyboard-midi-slot="3"/);
  assert.match(desktop, /data-keyboard-style="hook"/);
  assert.match(desktop, /data-keyboard-style="black"/);
});

test('Buffer Size keeps driver details out of the commercial interface', () => {
  assert.deepEqual(Array.from(appSettingsView.BUFFER_SIZES), [64, 128, 256, 512]);
  const markup = appSettingsView.createAudioSettingsMarkup([], '', { pads: '1+2', effects: '1+2' }, 128);
  assert.match(markup, /<option value="128" selected>128<\/option>/);
  assert.doesNotMatch(markup, /value="32"/);
  assert.doesNotMatch(markup, /ms|samples|latência/i);
});

test('Config Áudio lists Metrônomo as a route and Playlist fixed on 1+2', () => {
  const routing = { timbres: 'stereo:0', pads: 'stereo:0', effects: 'stereo:0', metronome: 'stereo:0' };
  const markup = appSettingsView.createAudioSettingsMarkup([{ id: 'x', name: 'Interface', channels: 8 }], 'x', routing, 256);
  assert.match(markup, /data-audio-bus="metronome"/);
  assert.match(markup, /Saídas - Metrônomo/);
  assert.doesNotMatch(markup, /data-audio-bus="music"/, 'Playlist não é uma rota que se escolhe');
  const music = /<select data-setting="music-route"([^>]*)>([\s\S]*?)<\/select>/.exec(markup);
  assert(music, 'Saídas - Playlist aparece');
  assert.match(markup, /Saídas - Playlist/);
  assert.match(music[1], /disabled/, 'sem opção de mudar');
  assert.equal(music[2].match(/<option/g).length, 1, 'uma única opção, mesmo com 8 canais');
  assert.match(music[2], />1\+2</);

  // Saídas - Módulos: mesmas opções das outras saídas, e a ordem da tela é a
  // mesma do HTML (Dispositivo/Buffer, Módulos/Playlist, Pads/Effects,
  // Metrônomo/Sample Rate).
  const timbres = /<select data-setting="audio-route" data-audio-bus="timbres">([\s\S]*?)<\/select>/.exec(markup);
  assert(timbres, 'Saídas - Módulos aparece');
  assert.match(markup, /Saídas - Módulos/);
  const pads = /<select data-setting="audio-route" data-audio-bus="pads">([\s\S]*?)<\/select>/.exec(markup);
  assert.equal(timbres[1].match(/<option/g).length, pads[1].match(/<option/g).length);
  const order = [...markup.matchAll(/data-(?:audio-route-field|setting)="([a-z-]+)"/g)]
    .map(([, name]) => name).filter((name) => name !== 'audio-route' && name !== 'music-route');
  assert.deepEqual(order, ['audio-device', 'buffer-size', 'timbres', 'music', 'pads', 'effects', 'metronome', 'sample-rate']);

  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\[data-audio-route-field="timbres"\] \{\s*grid-column: 1;\s*grid-row: 2;/);
  assert.match(css, /\[data-audio-route-field="metronome"\] \{\s*grid-column: 1;\s*grid-row: 4;/);
  assert.match(css, /--sample-rate \{\s*grid-column: 2;\s*grid-row: 4;/);
  assert.doesNotMatch(css, /audio-route-diagnostics/, 'o diagnóstico da rota saiu da tela');
});

test('a saída do módulo tem Padrão, que segue Saídas - Módulos', () => {
  const padrao = settingsView.createModuleSettingsMarkup([], [], null, {}, 120, 8, 'default');
  const select = /<select data-module-setting="audio-route">([\s\S]*?)<\/select>/.exec(padrao);
  assert(select, 'o módulo tem seletor de saída');
  assert.match(select[1], /<option value="default" selected>Padrão<\/option>/);
  // Padrão vem antes das saídas fixas, que continuam todas lá.
  const fonte = readFileSync(new URL('../src/features/player/ModuleSettingsView.ts', import.meta.url), 'utf8');
  const bloco = /<select data-module-setting="audio-route">([\s\S]*?)<\/select>/.exec(fonte)[1];
  assert(bloco.indexOf('value="default"') < bloco.indexOf('createAudioRouteOptions'));
  const saidas = audioOutput.createAudioRouteOptions(8, 'default');
  assert.equal(saidas.match(/<option/g).length, 12, 'as 12 saídas de uma placa de 8 canais');
  assert.doesNotMatch(saidas, /selected/, 'no Padrão nenhuma saída fixa fica marcada');
  assert.match(audioOutput.createAudioRouteOptions(8, 'mono:2'), /<option value="mono:2" selected>/);
  const fixa = /<select data-module-setting="audio-route">([\s\S]*?)<\/select>/
    .exec(settingsView.createModuleSettingsMarkup([], [], null, {}, 120, 8, 'mono:2'))[1];
  assert.doesNotMatch(fixa, /value="default" selected/);

  // Sem saída própria guardada, o módulo sai por onde Saídas - Módulos estiver.
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /: this\.audioRouting\.timbres;/);
  assert.match(player, /if \(select\.value === 'default'\) \{[\s\S]{0,90}delete moduleState\.settings\.outputRoute;/);
  assert.match(player, /if \(bus === 'timbres'\) void this\.syncNativeEngine\(\);/);
  assert.doesNotMatch(player, /audio-route-diagnostics|audioRouteLog/, 'o diagnóstico da rota saiu da tela');
});

test('EQ starts with Low Shelf and High Shelf while preserving five bands', () => {
  const bands = settingsView.readModuleEqBands(undefined);
  assert.equal(bands.length, 5);
  assert.equal(bands[0].type, 'low-shelf');
  assert.equal(bands[4].type, 'high-shelf');
});

test('Velocity do filtro: nasce desligado em 100 Hz e trabalha do Cutoff dele até o Cutoff do Config', () => {
  assert.equal(settingsView.readFilterVelocityEnabled({}), false);
  assert.equal(settingsView.readFilterVelocityCutoffHz({}), 100);
  const column = settingsView.createFilterVelocityCutoffMarkup({});
  assert.match(column, /data-filter-velocity-power[^>]*aria-pressed="false"[^>]*>OFF<\/button>/);
  assert.match(column, /<output data-filter-velocity-cutoff-value>100 Hz<\/output>/);
  // O motor faz 20 Hz × (Cutoff/20)^(ponto/127): os pontos Soft viram expoentes
  // que começam em 100 Hz e terminam no Cutoff do Config (20 kHz).
  const engine = settingsView.filterVelocityEnginePoints([0, 16, 44, 84, 127], 100, 20_000);
  assert.deepEqual([...engine], [30, 42, 63, 94, 127]);
  const engineHz = (point, cutoff) => 20 * (cutoff / 20) ** (point / 127);
  assert(Math.abs(engineHz(engine[0], 20_000) / 100 - 1) < 0.05, 'a nota mais fraca fecha perto de 100 Hz');
  assert.equal(engineHz(engine[4], 20_000), 20_000, 'a mais forte abre até o Cutoff do Config');
  const at400 = settingsView.filterVelocityEnginePoints([0, 32, 64, 96, 127], 400, 2_000);
  assert(Math.abs(engineHz(at400[0], 2_000) / 400 - 1) < 0.05, 'com 400 Hz a curva começa em 400 Hz');
  assert.deepEqual([...settingsView.filterVelocityEnginePoints([0, 16, 44, 84, 127], 5_000, 2_000)], [127, 127, 127, 127, 127],
    'Cutoff do Velocity acima do Cutoff do Config: fica no Cutoff do Config');
  assert.match(settingsView.createModuleSettingsMarkup([], [], null, { filterVelocityEnabled: true }, 120, 2, '1+2'),
    /class="is-active" data-module-setting-action="open-filter-velocity"/, 'ligado, o botão Velocity do Cutoff acende');
});

test('EQ: a curva do shelf segue a mesma inclinação do motor (Q vira o slope, até 1)', () => {
  const bands = settingsView.readModuleEqBands(undefined);
  assert.equal(bands[0].q, 1);
  assert.equal(bands[4].q, 1);
  bands[4].gain = 12;
  const standard = settingsView.createEqCurve(bands, 420, 170);
  bands[4].q = 0.5;
  assert.notEqual(settingsView.createEqCurve(bands, 420, 170), standard, 'Q abaixo de 1 suaviza o shelf desenhado');
  bands[4].q = 4;
  assert.equal(settingsView.createEqCurve(bands, 420, 170), standard, 'acima de 1 o motor limita o slope em 1');
});

test('desktop opens at the requested 1128 × 673 size and Param clips every preview inside its available grid row', () => {
  const config = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  const window = config.app.windows[0];
  assert.deepEqual(
    { width: window.width, height: window.height, minWidth: window.minWidth, minHeight: window.minHeight },
    { width: 1128, height: 673, minWidth: 900, minHeight: 520 },
  );
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.player-modal--module-settings \.module-settings-panel\s*\{[^}]*grid-template-rows: auto auto minmax\(0, 1fr\) auto;[^}]*overflow: hidden;/s);
  assert.match(css, /\.module-effect-controls--chorus\s*\{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/s);
  assert.match(css, /\.module-effect-controls--lofi\s*\{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/s);
  assert.match(css, /\.module-reverb-page\s*\{[^}]*grid-template-rows: auto minmax\(0, 1fr\);/s);
  assert.match(css, /\.module-delay-page\s*\{[^}]*grid-template-rows: auto minmax\(0, 1fr\);/s);
  assert.match(css, /\.module-delay-editor__divisions\s*\{[^}]*grid-template-columns: repeat\(8, minmax\(0, 1fr\)\);/s);
  // O editor perdeu o cabeçalho interno: o título já está no alto da janela.
  assert.match(css, /\.trance-gate-editor\s*\{[^}]*grid-template-rows: auto minmax\(0, 1fr\) minmax\(0, \.85fr\);/s);
  const tranceGateView = readFileSync(new URL('../src/features/player/TranceGateView.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(tranceGateView, /pattern-editor__header/);
  assert.match(css, /\.trance-gate-editor \.pattern-knob \.module-effect-knob__face\s*\{[^}]*width: min\(52px, 7vh\);[^}]*height: min\(52px, 7vh\);/s);
  assert.match(css, /\.player-modal--module-settings :is\(\s*\.module-eq-preview,[\s\S]*?max-height: 100%;/);
  assert.match(css, /html\[data-runtime="desktop"\] \.player-screen--tablet \.player-presets--combined\s*\{[^}]*grid-template-rows:/s);
});

test('new module and Synth defaults use zero Attack, 300 ms Release and maximum Hold/Decay/Cutoff, with Sustain fixed at 0 dB', () => {
  assert.deepEqual({ ...settingsView.MODULE_ENVELOPE_DEFAULTS }, { attackMs: 0, releaseMs: 300, holdMs: 15000, decayMs: 25000 });
  const defaults = synthView.readSynthSettings({});
  assert.equal(defaults.attackMs, 0);
  assert.equal(defaults.releaseMs, 300);
  assert.equal(defaults.holdMs, 15000);
  assert.equal(defaults.decayMs, 25000);
  assert.equal(defaults.filterCutoffHz, 20000);
  assert.equal(defaults.sustain, 100);
  for (const sustain of [undefined, 0, 50, 100, 999]) {
    const saved = synthView.readSynthSettings({ sustain, attackMs: 25, holdMs: 500, decayMs: 1500, releaseMs: 175, filterCutoffHz: 9000 });
    assert.equal(saved.sustain, 100, 'old presets cannot alter the fixed Sustain');
    assert.equal(saved.releaseMs, 175, 'other saved parameters stay untouched');
    assert.equal(saved.attackMs, 25);
    assert.equal(saved.filterCutoffHz, 9000);
    assert.doesNotMatch(synthView.createSynthModuleMarkup(saved), /data-synth-parameter="sustain"|>Sustain</);
  }
  const source = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('PlayerScreen.ts', source, ts.ScriptTarget.Latest, true);
  const factory = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'createDefaultModuleSettings');
  const context = {
    exports: {}, ...settingsView, ...synthView, ...glideView,
    readModuleRotarySettings: () => ({}), readModuleLoFiSettings: () => ({}), DEFAULT_ARPEGGIATOR_SETTINGS: {},
    FACTORY_MODULE_REVERB: { enabled: true, decay: 10, dampen: 50, size: 0, mix: 50 },
    readTranceGateSettings: () => ({}),
    DEFAULT_VELOCITY_CURVE: { points: [], userPoints: [] },
  };
  vm.runInNewContext(ts.transpileModule(`${factory.getText(ast)}\nexport { createDefaultModuleSettings };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  const module = context.exports.createDefaultModuleSettings();
  assert.equal(module.polyphony, 128);
  assert.equal(module.releaseMs, 300);
  assert.equal(module.cutoffHz, 20000);
  assert.equal(module.sustain, 100);
  // O Synth nasce no Preset 1 de fábrica, com os cinco slots preenchidos.
  assert.equal(module.synthActivePreset, 1);
  assert.equal(JSON.stringify(module.synth), JSON.stringify(synthView.FACTORY_SYNTH_PRESETS[0]));
  assert.equal(module.synthPresets.length, 5);
  module.synthPresets.forEach((preset, index) => {
    assert.equal(JSON.stringify(preset), JSON.stringify(synthView.FACTORY_SYNTH_PRESETS[index]));
  });
  module.synthPresets[0].releaseMs = 999;
  assert.equal(synthView.FACTORY_SYNTH_PRESETS[0].releaseMs, 85, 'novos módulos recebem cópias editáveis');
  assert.doesNotMatch(source, /sustain: \[0, 100\]/);
});

test('Reverb preview shows the selected convolution IR and the shared Mix knob', () => {
  const effects = transpile('../src/features/player/ModuleEffectsView.ts', { './ParameterKnobView': knobView });
  const markup = effects.createModuleEffectCardsMarkup({ reverb: { decay: 20, dampen: 0, size: 50, mix: 100 } }, 120);
  const preview = markup.match(/<div class="module-reverb-preview"[^>]*>([\s\S]*?)<\/div>/)[1];
  const knobs = [...preview.matchAll(/class="module-envelope-knob" style="--knob-angle:[^;]*;--knob-progress:([^"]+)"/g)];
  assert.deepEqual(knobs.map(([, progress]) => Number(progress)), [1]);
  assert.equal([...preview.matchAll(/class="module-envelope-knob__face" aria-hidden="true"><i><\/i><\/span>/g)].length, 1);
  assert.doesNotMatch(preview, /<input|<span class="module-effect-preview-knob"[^>]*><i/);
  assert.match(preview, /module-reverb-preview__impulse/);
  assert.match(preview, /<strong>Room 1<\/strong><small>IR<\/small>/);
  assert(preview.includes('<small>Mix</small>'));
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert(!css.includes('.module-effect-preview-knob > i'));
  assert.match(css, /\.module-effect-preview-knob \.module-envelope-knob\s*\{[^}]*pointer-events: none;/);
});

function createRange(parameter, min, max, scale = '') {
  const properties = new Map();
  const attributes = new Map();
  const knob = { style: { setProperty(name, value) { properties.set(name, value); } } };
  const output = { value: '' };
  const card = { querySelector(selector) { assert.equal(selector, 'output'); return output; } };
  const input = {
    min: String(min), max: String(max), value: String(min),
    dataset: { synthParameter: parameter, synthScale: scale },
    closest(selector) {
      if (selector === '.synth-card') return card;
      assert.equal(selector, '.module-envelope-knob');
      return knob;
    },
    setAttribute(name, value) { attributes.set(name, value); },
  };
  return { input, output, attributes, properties };
}

test('moving a Synth knob updates its bar, pointer, card value and enlarged accessible value together', () => {
  for (const [parameter, min, max, unit] of [
    ['oscillator1DetuneCents', -100, 100, ' cent'],
    ['oscillator2DetuneCents', -100, 100, ' cent'],
    ['oscillator3DetuneCents', -100, 100, ' cent'],
    ['filterEnvelope', -100, 100, '%'], ['filterResonance', 0, 98, '%'],
  ]) {
    const range = createRange(parameter, min, max);
    for (const progress of [0, .5, 1]) {
      const value = min + (max - min) * progress;
      range.input.value = String(value);
      assert.equal(synthView.updateSynthRangeOutput(range.input), value);
      assert.equal(range.properties.get('--knob-progress'), String(progress));
      assert.equal(range.properties.get('--knob-angle'), `${-135 + progress * 270}deg`);
      assert.equal(range.output.value, `${Math.round(value)}${unit}`);
      assert.equal(range.attributes.get('aria-valuetext'), range.output.value);
    }
  }
});

test('both oscillator volumes have independent values, mute at zero and top out at 0 dB', () => {
  for (const parameter of ['oscillator1Volume', 'oscillator2Volume']) {
    const range = createRange(parameter, 0, 100);
    for (const [value, formatted] of [[0, '−∞ dB'], [1, '-86.3 dB'], [4, '-75.0 dB'], [8, '-60.0 dB'], [24, '-36.0 dB'], [48, '-18.0 dB'], [60, '-13.5 dB'], [72, '-9.0 dB'], [100, '0.0 dB']]) {
      range.input.value = String(value);
      assert.equal(synthView.updateSynthRangeOutput(range.input), value);
      assert.equal(range.properties.get('--knob-progress'), String(value / 100));
      assert.equal(range.output.value, formatted);
      assert.equal(range.attributes.get('aria-valuetext'), formatted);
    }
  }
  // O giro segue a curva em dB do fader dos modulos, nao um ganho linear.
  assert.equal(synthView.oscillatorVolumeGain(0), 0);
  assert.equal(synthView.oscillatorVolumeGain(100), 1);
  assert(Math.abs(synthView.oscillatorVolumeGain(72) - 10 ** (-9 / 20)) < 1e-9);
  assert(Math.abs(synthView.oscillatorVolumeGain(1) - 10 ** (-86.25 / 20)) < 1e-9, 'antes de -inf o knob passa por -90 dB');
  const defaults = synthView.readSynthSettings({});
  assert.equal(defaults.oscillator1Volume, 100);
  assert.equal(defaults.oscillator2Volume, 100);
  const stored = synthView.readSynthSettings({ oscillator1Volume: 15, oscillator2Volume: 80, oscillator2Enabled: false });
  assert.equal(stored.oscillator1Volume, 15);
  assert.equal(stored.oscillator2Volume, 80);
  const restored = synthView.readSynthSettings(JSON.parse(JSON.stringify(stored)));
  assert.equal(restored.oscillator1Volume, 15);
  assert.equal(restored.oscillator2Volume, 80);
  assert.equal(restored.oscillator2Enabled, false);
});

test('legacy Mix presets migrate without overriding the independent volumes in new backups', () => {
  const legacy = synthView.readSynthSettings({ oscillatorMix: 35 });
  assert.equal(legacy.oscillator1Volume, 65);
  assert.equal(legacy.oscillator2Volume, 35);
  assert(!('oscillatorMix' in legacy));
  assert.equal(synthView.readSynthSettings({ oscillatorMix: 35, oscillator2Enabled: false }).oscillator1Volume, 100);
  assert.equal(synthView.readSynthSettings({ oscillatorMix: 35, oscillator1Enabled: false }).oscillator2Volume, 100);
  const mixed = synthView.readSynthSettings({ oscillatorMix: 35, oscillator1Volume: 0, oscillator2Volume: 100 });
  assert.equal(mixed.oscillator1Volume, 0);
  assert.equal(mixed.oscillator2Volume, 100);
  const bounded = synthView.readSynthSettings({ oscillator1Volume: -10, oscillator2Volume: 130 });
  assert.equal(bounded.oscillator1Volume, 0);
  assert.equal(bounded.oscillator2Volume, 100);
});

test('time, frequency and logarithmic cutoff keep their formatted value while filling the common bar', () => {
  for (const [parameter, max] of [['attackMs', 15000], ['holdMs', 15000], ['decayMs', 25000], ['releaseMs', 25000], ['glideMs', 5000]]) {
    const range = createRange(parameter, 0, max);
    range.input.value = String(max);
    synthView.updateSynthRangeOutput(range.input);
    assert.equal(range.properties.get('--knob-progress'), '1');
    assert.equal(range.attributes.get('aria-valuetext'), range.output.value);
    assert.match(range.output.value, / s$/);
  }
  const cutoff = createRange('filterCutoffHz', 0, 100, 'cutoff');
  for (const [position, frequency, formatted] of [[0, 20, '20 Hz'], [50, 20 * Math.sqrt(1000), '632 Hz'], [100, 20000, '20.0 kHz']]) {
    cutoff.input.value = String(position);
    assert.equal(synthView.updateSynthRangeOutput(cutoff.input), frequency);
    assert.equal(cutoff.properties.get('--knob-progress'), String(position / 100));
    assert.equal(cutoff.output.value, formatted);
    assert.equal(cutoff.attributes.get('aria-valuetext'), formatted);
  }
  const lfo = createRange('lfoRateHz', .05, 30);
  lfo.input.value = '30';
  synthView.updateSynthRangeOutput(lfo.input);
  assert.equal(lfo.output.value, '30.00 Hz');
  assert.equal(lfo.properties.get('--knob-progress'), '1');
});

test('preset 1 is selected by default; other selections replace it and remain separate from Legato', () => {
  for (const active of [undefined, 2, 5]) {
    const markup = synthView.createSynthModuleMarkup({}, [], active);
    const presets = [...markup.matchAll(/<button\b[^>]*data-synth-preset="(\d)"[^>]*>/g)];
    assert.equal(presets.length, 5);
    const selected = presets.filter(([button]) => /aria-pressed="true"/.test(button));
    assert.equal(selected.length, 1);
    assert.equal(Number(selected[0][1]), active ?? 1);
    assert.match(selected[0][0], /is-selected/);
    assert.match(markup, /class="synth-preset-group"[\s\S]*?<\/div>\s*<div class="synth-mode-controls">\s*<button[^>]*data-synth-voice-mode[^>]*>Mono<\/button>\s*<button class="synth-legato-button/);
  }
});

test('Vibes has Rate, microtonal Amount and an independently switched vinyl-noise level', () => {
  const effects = transpile('../src/features/player/ModuleEffectsView.ts', { './ParameterKnobView': knobView });
  const settings = effects.readModuleLoFiSettings({ enabled: true, rateHz: 2.5, amountSemitones: 0, vinylEnabled: false, noiseDb: -18 });
  assert.equal(settings.enabled, true);
  assert.equal(settings.rateHz, 2.5);
  assert.equal(settings.amountSemitones, 0);
  assert.equal(settings.vinylEnabled, false);
  assert.equal(settings.noiseDb, -18);
  const markup = effects.createModuleLoFiMarkup({ lofi: settings });
  assert.match(markup, /min="0\.05" max="8"[^>]*data-module-effect-control="rateHz"/);
  assert.match(markup, /min="0" max="1"[^>]*data-module-effect-control="amountSemitones"/);
  assert.match(markup, /min="-36" max="0"[^>]*data-module-effect-control="noiseDb"/);
  assert.match(markup, /data-module-vibes-vinyl[^>]*aria-pressed="false"[^>]*>OFF<\/button>/);
  assert.match(markup, />OFF<\/output>/);
  assert.doesNotMatch(markup, /Bits|bitDepth|sampleRateHz|data-module-effect-control="mix"/);
  assert.equal(effects.formatModuleEffectValue('lofi', 'amountSemitones', 0.37), '37 ct');
  assert.equal(effects.formatModuleEffectValue('lofi', 'amountSemitones', 1), '1.00 st');
  assert.equal(effects.formatModuleEffectValue('lofi', 'noiseDb', -18), '-18.0 dB');
});

test('Synth preset names are customizable, bounded and escaped in button markup', () => {
  const markup = synthView.createSynthModuleMarkup({}, [true, true], 2, 120, [
    'Lead Laranja',
    '<Azul & Rosa>',
    '1234567890123456789012345',
  ]);
  assert.match(markup, /data-synth-preset="1"[^>]*>Lead Laranja<\/button>/);
  assert.match(markup, /data-synth-preset="2"[^>]*>&lt;Azul &amp; Rosa&gt;<\/button>/);
  assert.match(markup, /data-synth-preset="3"[^>]*>12345678901234567890<\/button>/);
  assert.doesNotMatch(markup, /<Azul & Rosa>/);
  assert.match(markup, /data-synth-preset="4"[^>]*>Preset 4<\/button>/);
});

test('Synth mode is beside Legato and the Synth Param also gets a Chorus', () => {
  for (const mode of ['mono', 'poly']) {
    const markup = synthView.createSynthModuleMarkup({ voiceMode: mode });
    assert.match(markup, new RegExp(`synth-voice-mode-button is-${mode}`));
    assert.match(markup, /data-synth-voice-mode[\s\S]*?data-synth-toggle="legato"/);
  }
  const effects = transpile('../src/features/player/ModuleEffectsView.ts', { './ParameterKnobView': knobView });
  const shortcuts = effects.createModuleEffectCardsMarkup({}, 120, 'synth');
  // O compressor não tem prévia em lugar nenhum e o Chorus fica abaixo dele.
  assert.doesNotMatch(shortcuts, /module-compressor-preview/);
  assert.doesNotMatch(shortcuts, /open-synth/);
  assert.match(shortcuts, /open-compressor">Compressor<\/button>\s*<button[^>]*open-chorus">Chorus<\/button>/);
});

test('common CSS retains the dynamic fill and green selection, without a Synth-only fixed face', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.player-output-knob__face::before,\s*\.module-envelope-knob__face::before,\s*\.module-effect-knob__face::before,\s*\.knob-focus__face::before\s*\{[\s\S]*?conic-gradient\([\s\S]*?var\(--knob-progress, 0\) \* 1turn\)/);
  // Synth-specific layout sizing is allowed, but its knob face must stay shared.
  const selectors = [...css.matchAll(/([^{}]+)\{/g)].map(([, selector]) => selector.trim());
  assert(!selectors.some((selector) => selector.includes('synth') && /knob[^\s,]*__face/.test(selector)));
  assert.match(css, /\.synth-preset-button\.is-selected\s*\{[\s\S]*?background: linear-gradient\(180deg, #39df7d, #0b873f\)/);
  assert.match(css, /\.synth-oscillator-tabs \[data-synth-oscillator-tab\]\.is-selected,[\s\S]*?\.synth-preset-button\.is-selected,[\s\S]*?\.player-presets \.player-preset-button\.is-selected,[\s\S]*?\.player-navigation__bank-button\[data-action="show-bank"\]\.is-selected[\s\S]*?animation: active-page-selection-pulse/);
  assert.match(css, /@keyframes active-page-selection-pulse\s*\{[\s\S]*?filter: brightness\(1\.32\) saturate\(1\.12\)/);
});

test('each native bridge forwards all three independent oscillator volumes rather than a crossfade', () => {
  for (const path of [
    '../src/platform/native/HookKeysNative.ts',
    '../src/features/player/PlayerScreen.ts',
    '../native-engine/include/hook_keys/AnalogSynthModule.hpp',
    '../src-tauri/src/native_engine_bridge.cpp',
    '../android/app/src/main/cpp/HookKeysNativeBridge.cpp',
    '../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java',
    '../ios/App/App/HookKeysNativeEngine.h',
    '../ios/App/App/HookKeysNativeEngine.mm',
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert(source.includes('oscillator1Volume'), `${path} must forward volume 1`);
    assert(source.includes('oscillator2Volume'), `${path} must forward volume 2`);
    assert(source.includes('oscillator3Volume'), `${path} must forward volume 3`);
    assert(source.includes('oscillator1DetuneCents'), `${path} must forward detune 1`);
    assert(source.includes('oscillator2DetuneCents'), `${path} must forward detune 2`);
    assert(source.includes('oscillator3DetuneCents'), `${path} must forward detune 3`);
    assert(!source.includes('oscillatorMix'), `${path} must not keep the crossfade`);
  }
  const rust = readFileSync(new URL('../src-tauri/src/main.rs', import.meta.url), 'utf8');
  assert(rust.includes('oscillator1_volume'));
  assert(rust.includes('oscillator2_volume'));
  assert(rust.includes('oscillator3_volume'));
  assert(rust.includes('oscillator1_detune_cents'));
  assert(rust.includes('oscillator2_detune_cents'));
  assert(rust.includes('oscillator3_detune_cents'));
  assert(!rust.includes('oscillator_mix'));
});

test('independent oscillator octaves default to zero, stay within -3..+3 and survive preset serialization', () => {
  const defaults = synthView.readSynthSettings({});
  assert.equal(defaults.oscillator1Octave, 0);
  assert.equal(defaults.oscillator2Octave, 0);
  const saved = synthView.readSynthSettings({ oscillator1Octave: -3, oscillator2Octave: 2, oscillator1Volume: 35 });
  const restored = synthView.readSynthSettings(JSON.parse(JSON.stringify(saved)));
  assert.equal(restored.oscillator1Octave, -3);
  assert.equal(restored.oscillator2Octave, 2);
  assert.equal(restored.oscillator1Volume, 35);
  assert.equal(synthView.readSynthSettings({ oscillator1Octave: -9, oscillator2Octave: 9 }).oscillator1Octave, -3);
  assert.equal(synthView.readSynthSettings({ oscillator1Octave: 1.7 }).oscillator1Octave, 2);
  const markup = synthView.createSynthModuleMarkup(saved);
  assert.match(markup, /synth-card--octaves[\s\S]*?data-synth-parameter="glideMs"/);
  const buttons = [...markup.matchAll(/<button[^>]*data-synth-octave="([^"]+)"[^>]*data-synth-octave-direction="(-?1)"[^>]*>/g)];
  assert.equal(buttons.length, 6);
  assert.match(buttons[0][0], /disabled/);
  assert.doesNotMatch(buttons[1][0], /disabled/);
  assert.match(markup, /data-synth-octave-value="oscillator2Octave">\+2/);
});

test('actual octave handler updates only the requested oscillator and persists without rebuilding the modal', () => {
  const source = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('PlayerScreen.ts', source, ts.ScriptTarget.Latest, true);
  const player = ast.statements.find((node) => ts.isClassDeclaration(node) && node.name?.text === 'PlayerScreen');
  const method = player.members.find((node) => ts.isMethodDeclaration(node) && node.name?.getText(ast) === 'shiftSynthOctave');
  const context = { exports: {}, readSynthSettings: synthView.readSynthSettings };
  vm.runInNewContext(ts.transpileModule(`export class Handler { ${method.getText(ast)} }`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  const handler = new context.exports.Handler();
  const module = { settings: { synth: synthView.readSynthSettings({ oscillator2Octave: -2 }) } };
  handler.getActivePresetState = () => ({ modules: [...Array(7), module] });
  let changes = 0;
  handler.markPlayerStateChanged = () => changes++;
  const output = {};
  const buttons = [-1, 1].map((direction) => ({
    dataset: { synthOctaveDirection: String(direction) },
    attributes: {}, selected: false,
    classList: { toggle(_name, selected) { buttons[direction < 0 ? 0 : 1].selected = selected; } },
    setAttribute(name, value) { this.attributes[name] = value; },
  }));
  const modal = { querySelector: () => output, querySelectorAll: () => buttons };
  for (let i = 0; i < 4; ++i) handler.shiftSynthOctave(modal, 'oscillator1Octave', 1);
  assert.equal(module.settings.synth.oscillator1Octave, 3);
  assert.equal(module.settings.synth.oscillator2Octave, -2);
  assert.equal(output.textContent, '+3');
  assert.equal(buttons[1].disabled, true);
  assert.equal(buttons[1].selected, true);
  assert.equal(buttons[0].selected, false);
  assert.equal(changes, 3);
  for (let i = 0; i < 7; ++i) handler.shiftSynthOctave(modal, 'oscillator1Octave', -1);
  assert.equal(module.settings.synth.oscillator1Octave, -3);
  assert.equal(buttons[0].disabled, true);
  assert.equal(buttons[0].selected, true);
  assert.equal(buttons[1].selected, false);
  assert.equal(changes, 9);
  for (let i = 0; i < 3; ++i) handler.shiftSynthOctave(modal, 'oscillator1Octave', 1);
  assert.equal(module.settings.synth.oscillator1Octave, 0);
  assert.equal(buttons[0].selected, false);
  assert.equal(buttons[1].selected, false);
  assert.equal(buttons[0].attributes['aria-pressed'], 'false');
  assert.equal(buttons[1].attributes['aria-pressed'], 'false');
});

test('all platform bridges forward independent octaves to the native DSP', () => {
  for (const path of [
    '../src/platform/native/HookKeysNative.ts', '../src/features/player/PlayerScreen.ts',
    '../native-engine/include/hook_keys/AnalogSynthModule.hpp', '../src-tauri/src/native_engine_bridge.cpp',
    '../android/app/src/main/cpp/HookKeysNativeBridge.cpp',
    '../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java',
    '../ios/App/App/HookKeysNativeEngine.h', '../ios/App/App/HookKeysNativeEngine.mm',
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert(source.includes('oscillator1Octave'), path);
    assert(source.includes('oscillator2Octave'), path);
    assert(source.includes('oscillator3Octave'), path);
  }
  const rust = readFileSync(new URL('../src-tauri/src/main.rs', import.meta.url), 'utf8');
  assert.match(rust, /config\.oscillator1_octave,\s*config\.oscillator2_octave,\s*config\.oscillator3_octave,/);
});

test('Synth layout gives controls natural height and keeps presets and footer outside the inner scroll', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.synth-editor__header\s*\{[^}]*display: grid;[^}]*min-width: 0;/);
  assert.match(css, /data-synth-oscillator-tab="1"\]:not\(\.is-selected\)[\s\S]*?--button-border: var\(--gold-border\)/);
  assert.match(css, /data-synth-oscillator-tab="2"\]:not\(\.is-selected\)[\s\S]*?#ff73c8/);
  assert.match(css, /data-synth-oscillator-tab="3"\]:not\(\.is-selected\)[\s\S]*?#59b9ff/);
  assert.match(css, /data-synth-oscillator-tab\]\.is-selected[\s\S]*?--button-border:\s*#fff/);
  assert.doesNotMatch(css, /\.synth-editor__header-controls\s*\{[^}]*width: (?:84|88)%;/);
  assert.match(css, /grid-template-rows: repeat\(3, max-content\);/);
  assert.match(css, /grid-template-rows: max-content repeat\(3, minmax\(var\(--synth-row-min-height\), 1fr\)\) minmax\(max-content, 1fr\);/);
  assert.match(css, /\.player-modal--module-synth \.synth-editor__grid\s*\{[^}]*overflow-y: auto;/);
  assert.match(css, /@media \(orientation: landscape\) and \(min-width: 560px\)\s*\{\s*\.player-modal--module-synth \.synth-editor__grid\s*\{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
});

test('OCT active sign is restored in markup and remains green even at -3/+3 limits', () => {
  for (const value of [-3, -1, 0, 1, 3]) {
    const markup = synthView.createSynthModuleMarkup({ oscillator1Octave: value });
    const buttons = [...markup.matchAll(/<button[^>]*data-synth-octave="oscillator1Octave"[^>]*>/g)].map(([button]) => button);
    assert.equal(/aria-pressed="true"/.test(buttons[0]), value < 0);
    assert.equal(/aria-pressed="true"/.test(buttons[1]), value > 0);
    assert.equal(/class="is-selected"/.test(buttons[0]), value < 0);
    assert.equal(/class="is-selected"/.test(buttons[1]), value > 0);
  }
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.synth-octave-row button\[data-synth-octave\]\.is-selected:disabled\s*\{[^}]*--button-color-a: var\(--module-button-green-a\) !important;[^}]*color: #f1fff6 !important;/);
});

test('the five factory Synth presets match the sounds configured in the app', () => {
  const presets = synthView.FACTORY_SYNTH_PRESETS;
  assert.equal(presets.length, synthView.SYNTH_PRESET_COUNT);
  assert.equal(synthView.SYNTH_PRESET_COUNT, 5);
  const pick = (preset, keys) => Object.fromEntries(keys.map((key) => [key, preset[key]]));
  const keys = ['oscillator1', 'oscillator2', 'oscillator1Enabled', 'oscillator2Enabled', 'voiceMode', 'legato',
    'oscillator1Volume', 'oscillator2Volume', 'oscillator1DetuneCents', 'oscillator2DetuneCents', 'oscillator3DetuneCents', 'attackMs', 'holdMs', 'decayMs', 'releaseMs',
    'filterCutoffHz', 'filterResonance', 'filterEnvelope', 'lfoTarget', 'lfoRateHz', 'lfoDepth',
    'glideMs', 'glideSync', 'oscillator1Octave', 'oscillator2Octave'];
  const expected = [
    ['sine', 'sine', true, true, 'poly', false, 89, 60, 0, 0, 0, 8, 15000, 25000, 85, 20000, 0, 100, 'pitch', 6.85, 0, 205, false, 0, 1],
    ['saw', 'saw', true, true, 'poly', false, 89, 60, 0, 0, 0, 8, 15000, 25000, 85, 49.09, 0, 100, 'pitch', 6.85, 0, 205, false, 0, 0],
    ['sine', 'sine', true, true, 'mono', true, 100, 100, 0, 0, 0, 0, 15000, 25000, 25, 20000, 18, 24, 'pitch', 6.85, 0, 0, false, 0, 1],
    ['saw', 'saw', true, true, 'poly', false, 100, 100, 0, 0, 0, 0, 15000, 25000, 49, 308.3, 31, 14, 'filter', 6.85, 0, 129, false, 0, 0],
    ['sine', 'square', true, false, 'mono', true, 100, 100, 0, 0, 0, 0, 15000, 25000, 47, 20000, 0, 24, 'pitch', 6.85, 0, 0, false, 0, 0],
  ];
  expected.forEach((values, index) => {
    assert.equal(JSON.stringify(pick(presets[index], keys)), JSON.stringify(Object.fromEntries(keys.map((key, i) => [key, values[i]]))),
      `Preset ${index + 1} de fábrica`);
    // O preset tem de sobreviver intacto a um salvamento/restauração.
    assert.equal(JSON.stringify(synthView.readSynthSettings(JSON.parse(JSON.stringify(presets[index])))), JSON.stringify(presets[index]));
  });
  // Volumes da tela: -3.5 dB e -13.5 dB.
  const volume = createRange('oscillator1Volume', 0, 100);
  for (const [position, formatted] of [[89, '-3.5 dB'], [60, '-13.5 dB']]) {
    volume.input.value = String(position);
    synthView.updateSynthRangeOutput(volume.input);
    assert.equal(volume.output.value, formatted);
  }
  const copy = synthView.factorySynthPreset(4);
  copy.releaseMs = 1;
  assert.equal(presets[3].releaseMs, 49, 'factorySynthPreset returns an editable copy');
});

test('Param 1-7 has Limite Velocity beside Cutoff; the Synth has one limit per oscillator', () => {
  const markup = settingsView.createModuleSettingsMarkup([], [], null, { velocityLimit: 100 }, 120, 2, '1+2');
  assert.match(markup, /module-envelope-grid[\s\S]*?data-module-cutoff[\s\S]*?data-module-velocity-limit-card/,
    'Limite Velocity fica na página Envelope, logo depois do Cutoff');
  // O Config virou páginas: o topo e o rodapé ficam, o miolo troca.
  assert.match(markup, /data-module-settings-page="envelope"[^>]*class="is-selected"/);
  assert.match(markup, /data-module-settings-page="eq"[\s\S]*?data-module-settings-page="delay"/);
  assert.doesNotMatch(markup, /data-module-setting-action="reset-module"/, 'o Reset do módulo saiu');
  assert.doesNotMatch(markup.slice(markup.indexOf('module-settings-bottom-row')), /data-module-velocity-limit/,
    'a linha do Velocity não tem o Limite');
  assert.match(markup, /value="100"\s+data-module-velocity-limit/);
  assert.match(settingsView.createModuleSettingsMarkup([], [], null, {}, 120, 2, '1+2'), /value="127"\s+data-module-velocity-limit/, 'Limite Velocity nasce em 127');
  const synthParam = settingsView.createModuleSettingsMarkup([], [], null, {}, 120, 2, '1+2', 'synth');
  assert.doesNotMatch(synthParam, /data-module-velocity-limit/, 'o Param do Synth não tem Limite Velocity');
  const synth = synthView.createSynthModuleMarkup({ oscillator2VelocityLimit: 90 });
  assert.match(synth, /value="127"\s+data-synth-parameter="oscillator1VelocityLimit"/);
  assert.match(synth, /value="90"\s+data-synth-parameter="oscillator2VelocityLimit"/);
  assert.match(synth, /value="127"\s+data-synth-parameter="oscillator3VelocityLimit"/);
  const saved = synthView.readSynthSettings({ oscillator1VelocityLimit: 300, oscillator2VelocityLimit: 64 });
  assert.equal(saved.oscillator1VelocityLimit, 127);
  assert.equal(saved.oscillator2VelocityLimit, 64);
  for (const preset of synthView.FACTORY_SYNTH_PRESETS) {
    assert.equal(preset.oscillator1VelocityLimit, 127);
    assert.equal(preset.oscillator2VelocityLimit, 127);
    assert.equal(preset.oscillator3VelocityLimit, 127);
  }
  const defaultParam = settingsView.createModuleSettingsMarkup(
    [], [], null, {}, 120, 2, '1+2', 'chorus', 'envelope', 'default');
  assert.match(defaultParam, /data-module-settings-mode="default" aria-pressed="true"/);
  assert.match(defaultParam, /data-module-settings-mode="user" aria-pressed="false"/);
  assert.match(defaultParam, /module-settings-panel[^>]*is-default-mode/);
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.module-settings-panel\.is-default-mode :is\([\s\S]*?filter: grayscale\(1\) brightness\(\.58\);/);
});
