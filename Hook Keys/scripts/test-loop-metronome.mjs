import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

const playerSource = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
assert.match(playerSource, /\(\[1, 2, 3, 4, 5\] as const\)/,
  'o modal oferece os cinco sons do metrônomo');
assert.match(playerSource, /sound === 1 \|\| sound === 2 \|\| sound === 3 \|\| sound === 4 \|\| sound === 5/,
  'o evento do modal aceita selecionar também o Click 5');
assert.match(styles, /\.metronome-panel__sounds\s*\{[^}]*grid-template-columns:\s*repeat\(5,/s,
  'os cinco botões de Click permanecem na mesma linha');
assert.match(styles, /\.player-module__actions\s*\{[^}]*grid-template-rows:\s*repeat\(3,/s,
  'faixa, oitava e HLD/MOD recebem três linhas reais sem esmagar o último par');

try {
  const metronome = new window.Metronome.MetronomeEngine();
  metronome.setAccentEnabled(true);
  await new Promise((resolve) => setTimeout(resolve, 45));
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

  metronome.setClickSound(5);
  await new Promise((resolve) => setTimeout(resolve, 45));
  assert.equal(calls.at(-1).clickSound, 5, 'Click 5 chega ao motor nativo como a quinta amostra');

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
  assert.equal(calls.at(-1).accentEnabled, true, 'A-B volta à preferência escolhida depois que o loop para');
  metronome.destroy();

  // Reproduz a corrida que fazia o Click falhar de modo intermitente: o
  // comando mudo demora mais para concluir que o comando de abrir o volume.
  calls.length = 0;
  window.__hookKeysNative.configureMetronome = async (config) => {
    await new Promise((resolve) => setTimeout(resolve, config.volume === 0 ? 35 : 1));
    calls.push(structuredClone(config));
  };
  const racingMetronome = new window.Metronome.MetronomeEngine();
  racingMetronome.setLoopPlaybackActive(true, true);
  await new Promise((resolve) => setTimeout(resolve, 1));
  racingMetronome.start();
  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.equal(calls.at(-1).enabled, true, 'o relógio continua ativo durante o loop');
  assert.equal(calls.at(-1).volume, 1, 'o último comando sempre libera o Click, mesmo com inicialização lenta');
  racingMetronome.destroy();
  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.equal(calls.at(-1).enabled, false,
    'destruir o player sempre deixa o metrônomo nativo desligado depois dos comandos pendentes');
  assert.equal(calls.at(-1).volume, 0, 'destruir o player também fecha o volume do Click');

  const boundedMetronome = new window.Metronome.MetronomeEngine();
  boundedMetronome.setVolume(10 ** (12 / 20));
  assert.equal(boundedMetronome.getVolume(), 1, 'o estado usa o mesmo teto de 0 dB do controle e do motor nativo');
  boundedMetronome.destroy();
  console.log('LOOP_METRONOME_OK: A-B ignorado no loop e Click sem corrida de ativação');
} finally {
  await window.happyDOM.abort();
}
