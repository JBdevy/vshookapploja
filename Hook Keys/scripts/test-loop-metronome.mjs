import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Window } from 'happy-dom';

const calls = [];
const compiled = await build({
  entryPoints: ['src/features/metronome/MetronomeEngine.ts'],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'Metronome',
  platform: 'browser',
  plugins: [{
    name: 'mock-native-metronome',
    setup(buildApi) {
      buildApi.onResolve({ filter: /HookKeysNative$/ }, () => ({ path: 'native', namespace: 'mock' }));
      buildApi.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({
        contents: 'export const hookKeysNative = globalThis.__hookKeysNative;',
        loader: 'js',
      }));
    },
  }],
});

const window = new Window({ settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
window.__hookKeysNative = {
  isAvailable: () => true,
  configureMetronome: async (config) => { calls.push(structuredClone(config)); },
};
window.eval(compiled.outputFiles[0].text);
const waitForSync = () => new Promise((resolve) => setTimeout(resolve, 15));

try {
  const metronome = new window.Metronome.MetronomeEngine();
  metronome.setLoopPlaybackActive(true, true);
  await waitForSync();
  assert.deepEqual(calls.at(-1), {
    enabled: true,
    bpm: 120,
    volume: 0,
    clickSound: 1,
    accentEnabled: false,
    doubleTimeEnabled: false,
    timeSignatureNumerator: 4,
    timeSignatureDenominator: 4,
    restart: true,
  }, 'o loop liga e reinicia o relógio nativo, mas mantém o click mudo');

  metronome.setClickSound(4);
  await new Promise((resolve) => setTimeout(resolve, 45));
  assert.equal(calls.at(-1).clickSound, 4, 'Click 4 chega ao motor nativo como a quarta amostra');

  metronome.start();
  await waitForSync();
  assert.equal(calls.at(-1).enabled, true);
  assert.equal(calls.at(-1).volume, 1, 'durante o loop o botão Click libera somente o volume');
  assert.equal(calls.at(-1).restart, false, 'liberar o volume não perde a fase já alinhada');

  metronome.stop();
  await waitForSync();
  assert.equal(calls.at(-1).enabled, true, 'desligar Click não para o relógio enquanto o loop toca');
  assert.equal(calls.at(-1).volume, 0, 'desligar Click silencia o metrônomo durante o loop');

  metronome.setLoopPlaybackActive(false);
  await waitForSync();
  assert.equal(calls.at(-1).enabled, false, 'sem loop e com Click desligado o relógio para');
  metronome.destroy();
  console.log('LOOP_METRONOME_OK: loop reinicia o relógio e Click controla apenas o volume');
} finally {
  await window.happyDOM.abort();
}
