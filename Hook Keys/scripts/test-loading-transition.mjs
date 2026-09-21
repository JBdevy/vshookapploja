import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';

const compiled = await build({ entryPoints: ['src/app/HookKeysApp.ts'], bundle: true, write: false,
  format: 'iife', globalName: 'HookApp', platform: 'browser' });
const window = new Window({ url: 'http://localhost', settings: { enableJavaScriptEvaluation: true } });
window.eval(compiled.outputFiles[0].text);
const root = window.document.createElement('div');
window.document.body.append(root);
const app = new window.HookApp.HookKeysApp(root);
const frames = [], timers = [];
window.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
window.setTimeout = (callback, delay) => { timers.push({ callback, delay }); return timers.length; };
const flush = () => new Promise(resolve => setImmediate(resolve));
try {
  for (const reduced of [false, true]) {
    window.matchMedia = () => ({ matches: reduced });
    let ready;
    let finished = false;
    const loading = app.playOctaveTransition('enter', undefined, new Promise(resolve => { ready = resolve; })).then(() => { finished = true; });
    frames.shift()(0);
    assert.equal(timers[0].delay, 3000, 'minimum 3 seconds, including reduced motion');
    timers.shift().callback();
    await flush();
    assert(!finished && window.document.querySelector('[data-octave-transition]'), 'slow loading remains covered beyond 3 seconds');
    ready(); await flush();
    timers.shift().callback(); await loading;
    assert(!window.document.querySelector('[data-octave-transition]'));
    const exit = app.playOctaveTransition('exit');
    frames.shift()(0);
    assert.equal(timers[0].delay, 6000, 'logout also lasts 6 seconds');
    timers.shift().callback(); await exit;
  }
  for (const reduced of [false, true]) {
    window.matchMedia = () => ({ matches: reduced });
    const fullText = 'Bem Vindo, João <Silva>';
    let revealed = false;
    const welcome = app.playWelcomeTransition('João <Silva>', () => { revealed = true; });
    frames.shift()(0);
    const text = window.document.querySelector('[data-welcome-text]');
    if (reduced) {
      assert.equal(text.textContent, fullText);
      assert.equal(timers[0].delay, 1100);
      timers.shift().callback();
    } else {
      assert.equal(text.textContent, '');
      assert.equal(timers[0].delay, 380);
      while (timers[0].delay !== 1050) timers.shift().callback();
      assert.equal(text.textContent, fullText, 'nome é digitado completo');
      assert.equal(text.childElementCount, 0, 'nome não é interpretado como HTML');
      timers.shift().callback();
      assert.equal(text.textContent, fullText.slice(0, -1), 'apaga letra a letra');
      while (timers[0].delay !== 360) timers.shift().callback();
      assert.equal(text.textContent, '');
      assert.equal(revealed, true, 'the player is revealed underneath the final welcome fade');
      timers.shift().callback();
    }
    await welcome;
    assert.equal(revealed, true);
    assert(!window.document.querySelector('[data-welcome-transition]'));
  }
  const stubs = new Map([
    ['PlayerScreen.ts', `export class PlayerScreen {
      constructor(root) { this.root = root; }
      mount() { window.startupSteps.push('mount'); this.root.textContent = 'PLAYER'; }
      waitUntilReady() { return window.engineReady; }
      async activateLiveMidi() {
        window.startupSteps.push('midi'); await window.midiReady;
        window.startupSteps.push('midi-ready');
      }
      destroy() {}
    }`],
    ['AuthScreen.ts', `export class AuthScreen {
      constructor(root) { this.root = root; }
      async start() { this.root.textContent = 'LOGIN'; }
    }`],
    ['PlayerStateService.ts', 'export class PlayerStateService {}'],
    ['PlayerBackupService.ts', 'export class PlayerBackupService {}'],
    ['orientationTransition.ts', `export function coverOrientationChange() {
      const cover = document.createElement('div');
      cover.className = 'orientation-transition-cover';
      document.body.append(cover); return cover;
    }
    export async function prepareScreenOrientation(mode) { window.startupSteps.push(mode); }
    export async function nextPaint() {}`],
  ]);
  const sequenced = await build({ entryPoints: ['src/app/HookKeysApp.ts'], bundle: true, write: false,
    format: 'iife', globalName: 'SequencedHookApp', platform: 'browser', plugins: [{
      name: 'startup-dependencies', setup(builder) {
        builder.onLoad({ filter: /\.ts$/ }, args => {
          const contents = stubs.get(args.path.split(/[\\/]/).pop());
          return contents === undefined ? undefined : { contents, loader: 'ts' };
        });
      },
    }] });
  window.eval(sequenced.outputFiles[0].text);
  const sessions = { startLicenseMonitoring: () => () => {} };
  const session = { token: 'test', account: { email: 'test@example.invalid', name: 'João' } };
  const barrier = () => {
    let resolve, reject;
    const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
  };
  for (const scenario of ['success', 'error', 'cancel']) {
    window.startupSteps = [];
    const engine = barrier(), loading = barrier(), welcome = barrier(), midi = barrier();
    window.engineReady = engine.promise;
    window.midiReady = midi.promise;
    const sequenceApp = new window.SequencedHookApp.HookKeysApp(root, sessions, {});
    sequenceApp.playOctaveTransition = async (_direction, swap, readiness) => {
      window.startupSteps.push('loading');
      const overlay = window.document.createElement('div');
      overlay.dataset.octaveTransition = '';
      window.document.body.append(overlay);
      sequenceApp.octaveTransition = overlay;
      await readiness; await loading.promise;
      swap?.();
      assert(window.startupSteps.includes('welcome'),
        'welcome is prepared while the loading overlay still covers the screen');
      assert(overlay.isConnected, 'loading remains visible until welcome is ready underneath');
      overlay.remove();
      window.startupSteps.push('loading-finished');
    };
    sequenceApp.playWelcomeTransition = async (name, revealPlayer, handoffFromLoading) => {
      assert.equal(name, 'João');
      assert.equal(handoffFromLoading, true, 'startup uses the seamless loading handoff');
      assert(window.document.querySelector('.orientation-transition-cover--startup'),
        'black cover survives the loading-to-welcome handoff');
      window.startupSteps.push('welcome');
      await welcome.promise;
      revealPlayer();
      window.startupSteps.push('welcome-finished');
    };
    const startup = sequenceApp.showPlayer(session);
    await flush();
    const screen = root.querySelector('#screen-root');
    const cover = window.document.querySelector('.orientation-transition-cover--startup');
    assert(cover?.isConnected, 'player stays behind the black cover during loading');
    assert.equal(screen.inert, true, 'hidden player cannot receive focus or touches');
    assert.equal(screen.textContent, 'PLAYER', 'player can prepare its layout behind the cover');
    if (scenario === 'error') {
      engine.reject(new Error('Engine failed'));
      await startup;
      assert(window.document.querySelector('.startup-error'), 'failure shows the error instead of the player');
      assert(!cover.isConnected);
      assert.equal(screen.inert, false);
      sequenceApp.octaveTransition.remove();
      continue;
    }
    engine.resolve(); loading.resolve(); await flush();
    assert(cover.isConnected, 'cover remains throughout the welcome animation and fade');
    assert(!window.startupSteps.includes('midi'), 'MIDI remains blocked until welcome finishes');
    if (scenario === 'cancel') {
      await sequenceApp.showLogin();
      welcome.resolve(); await startup;
      assert.equal(screen.textContent, 'LOGIN');
      assert.equal(screen.inert, false, 'cancelled startup cannot leave login inert');
      assert(!window.startupSteps.includes('midi'), 'cancelled welcome cannot activate the old player');
    } else {
      welcome.resolve(); await flush();
      assert(!cover.isConnected, 'welcome fade reveals the prepared player directly, without a black frame');
      assert.equal(screen.inert, false, 'the visible player is ready while native MIDI finishes activating');
      assert(window.startupSteps.includes('midi'), 'MIDI activation starts only after the welcome transition');
      midi.resolve(); await startup;
      assert.equal(screen.inert, false);
      assert.deepEqual(window.startupSteps, ['tablet', 'mount', 'loading', 'welcome',
        'loading-finished', 'welcome-finished', 'midi', 'midi-ready']);
    }
    assert(!cover.isConnected, 'the startup cover cannot return after the welcome fade');
  }
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.orientation-transition-cover--startup\s*\{\s*z-index:\s*9999;/);
  assert.match(css, /\.welcome-transition--handoff\s*\{\s*z-index:\s*9999;/);
  for (const selector of ['octave-transition', 'welcome-transition']) {
    assert.match(css, new RegExp(`\\.${selector}\\s*\\{[^}]*z-index:\\s*10000;`));
  }
  console.log('LOADING_TRANSITION_OK: readiness, logout and welcome reveal the player without an intermediate black frame.');
} finally { await window.happyDOM.abort(); }
