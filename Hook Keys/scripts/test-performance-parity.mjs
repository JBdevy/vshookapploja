import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
const bundle = await build({ stdin: { contents: `export * from './src/features/player/ModuleEffectsView'; export * from './src/features/player/PadsEffectsView'; export * from './src/features/tracks/TrackTransport';`, resolveDir: '.', loader: 'ts' }, bundle: true, write: false, format: 'iife', globalName: 'Parity', platform: 'browser' });
function setup() {
  const window = new Window({ url: 'http://localhost', settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
  window.eval(bundle.outputFiles[0].text); return window;
}
function handlers(window, methods) {
  const source = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('PlayerScreen.ts', source, ts.ScriptTarget.Latest, true);
  const player = ast.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'PlayerScreen');
  const helpers = ['boundedNumber', 'isRecord', 'ensureReverbMixPresets', 'isModuleEffectKind'].map(name => ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(ast)).join('\n');
  const body = methods.map(name => player.members.find(n => ts.isMethodDeclaration(n) && n.name?.getText(ast) === name).getText(ast)).join('\n');
  const context = { exports: {}, ...window.Parity, HTMLInputElement: window.HTMLInputElement, EFFECT_PAD_MIN_DB: -36, EFFECT_PAD_MAX_DB: 0, formatOutputDb: v => `${v} dB` };
  vm.runInNewContext(ts.transpileModule(`${helpers}\nexport class Player { ${body} }`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return new context.exports.Player();
}
test('FX slider changes active bank and playing voices without retriggering', () => {
  const window = setup(), root = window.document.createElement('div');
  root.innerHTML = window.Parity.createPadsEffectsMarkup();
  assert.equal(root.querySelectorAll('[data-effect-inline-volume]').length, 12);
  const player = handlers(window, ['onRootInput']);
  const active = { volumeDb: 0 }, other = { volumeDb: -3 }, voice = { volume: 1 }, unrelated = { volume: 0.5 };
  Object.assign(player, { activeEffectBank: '2', effectPadStates: new Map([['2', [active]], ['3', [other]]]), effectPadAudio: new Map([['2:1', { voices: [voice] }], ['3:1', { voices: [unrelated] }]]), effectAudioBaseGain: new WeakMap(), outputEnabled: { effects: true }, outputLevels: { effects: -6 }, markPlayerStateChanged() {} });
  const input = root.querySelector('[data-effect-inline-volume="1"]'); input.value = '-12'; player.onRootInput({ target: input });
  assert.equal(active.volumeDb, -12); assert.equal(other.volumeDb, -3);
  assert(Math.abs(voice.volume - Math.pow(10, -18 / 20)) < 1e-8); assert.equal(unrelated.volume, 0.5);
  assert.equal(input.parentElement.querySelector('output').textContent, '-12 dB'); window.happyDOM.abort();
});
test('Reverb Decay persists independently in each environment', () => {
  const window = setup(), settings = { reverbSpace: 'room1', reverb: { enabled: true, mix: 35 } };
  const player = handlers(window, ['updateModuleEffectControl', 'selectReverbSpace']);
  Object.assign(player, { getActivePresetState: () => ({ modules: [{ settings }] }), markPlayerStateChanged() {}, syncNativeEngine: async () => {} });
  const modal = window.document.createElement('div'); modal.innerHTML = window.Parity.createModuleReverbMarkup(settings);
  let input = modal.querySelector('[data-module-effect-control="decay"]'); assert.equal(input.value, '100');
  input.value = '40'; player.updateModuleEffectControl(modal, input, 1); player.selectReverbSpace(modal, 1, 'hall1');
  input = modal.querySelector('[data-module-effect-control="decay"]'); assert.equal(input.value, '100');
  input.value = '70'; player.updateModuleEffectControl(modal, input, 1); player.selectReverbSpace(modal, 1, 'room1');
  assert.equal(modal.querySelector('[data-module-effect-control="decay"]').value, '40');
  const saved = JSON.parse(JSON.stringify(settings)); assert.equal(window.Parity.readReverbSpaceDecay(saved, 'hall1'), 70);
  assert.equal(window.Parity.readReverbSpaceMix(saved, 'room1'), 35); window.happyDOM.abort();
});
test('transport opens empty library and suppresses click after hold', () => {
  const window = setup(), root = window.document.createElement('div'); root.innerHTML = window.Parity.createTrackTransportMarkup();
  let libraries = 0, positions = 0;
  const controller = new window.Parity.TrackTransportController(root, {}, () => {}, () => {}, () => positions++, null, async () => {}, () => libraries++);
  const name = root.querySelector('[data-transport-track-name]'); controller.onClick({ target: name }); assert.equal(libraries, 1);
  controller.selectedTrack = { id: 'song' }; controller.nameHoldGesture = { start: (_event, activate) => activate() };
  controller.onPointerDown({ target: name, pointerType: 'touch', pointerId: 1 }); assert.equal(positions, 1);
  controller.onClick({ target: name }); assert.equal(libraries, 1); window.happyDOM.abort();
});

test('desktop right-click opens position from clock, name and Play without triggering playback', () => {
  const window = setup(); window.__TAURI_INTERNALS__ = {};
  const root = window.document.createElement('div'); root.innerHTML = window.Parity.createTrackTransportMarkup();
  let positions = 0, libraries = 0, playback = 0;
  const controller = new window.Parity.TrackTransportController(root, {}, () => {}, () => {}, () => positions++, null, async () => {}, () => libraries++);
  controller.togglePlayStop = () => playback++;
  controller.mount();
  for (const selector of ['[data-transport-remaining]', '[data-transport-track-name]', '[data-transport-action]']) {
    const target = root.querySelector(selector);
    const event = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    target.dispatchEvent(event); assert.equal(event.defaultPrevented, true);
  }
  assert.equal(positions, 3); assert.equal(libraries, 0); assert.equal(playback, 0);
  root.querySelector('[data-transport-remaining]').click(); assert.equal(libraries, 1);
  controller.destroy(); window.happyDOM.abort();
});
