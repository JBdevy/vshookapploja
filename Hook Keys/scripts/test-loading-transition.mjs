import assert from 'node:assert/strict';
import { build } from 'esbuild';
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
    const welcome = app.playWelcomeTransition('João <Silva>');
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
      timers.shift().callback();
    }
    await welcome;
    assert(!window.document.querySelector('[data-welcome-transition]'));
  }
  console.log('LOADING_TRANSITION_OK: readiness, logout and personalized welcome typing/erasing, including reduced motion.');
} finally { await window.happyDOM.abort(); }
