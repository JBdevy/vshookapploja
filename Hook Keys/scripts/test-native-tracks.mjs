import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Window } from 'happy-dom';

const compiled = await build({
  stdin: {
    contents: "export * from './src/features/tracks/TrackTransport'; export * from './src/features/tracks/NativeTrackPlayer';",
    resolveDir: '.', loader: 'ts',
  },
  bundle: true, write: false, format: 'iife', globalName: 'Tracks', platform: 'browser',
});
const window = new Window({ url: 'http://localhost', settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
window.eval(compiled.outputFiles[0].text);
const { TrackTransportController, NativeTrackPlayer, trackFileExtension } = window.Tracks;
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const settle = async () => { for (let index = 0; index < 20; index += 1) await new Promise(resolve => setImmediate(resolve)); };

// Motor falso: guarda o que o motor nativo guardaria e registra cada comando.
const calls = [];
const stored = new Set();
const engine = { sources: new Map(), activeId: 0, playing: false, ended: false };
const bridge = {
  async storeTrackFile(key, extension, file) {
    calls.push(['store', key, extension, file.size]);
    stored.add(`${key}.${extension}`);
  },
  async loadTrack(sourceId, key, extension) {
    calls.push(['load', sourceId, key]);
    assert(stored.has(`${key}.${extension}`), 'o arquivo chega ao aparelho antes de abrir no motor');
    engine.sources.set(sourceId, { key, duration: key === 'a' ? 180 : 240, position: 0, loop: false });
    return engine.sources.get(sourceId).duration;
  },
  async controlTrack(sourceId, action, options = {}) {
    calls.push(['control', sourceId, action, options]);
    if (action === 'unload') {
      engine.sources.delete(sourceId);
      if (engine.activeId === sourceId) Object.assign(engine, { activeId: 0, playing: false, ended: false });
      return;
    }
    const source = engine.sources.get(sourceId);
    if (!source) throw Object.assign(new Error('not loaded'), { code: 'track_not_loaded' });
    if (action === 'play') Object.assign(engine, { activeId: sourceId, playing: true, ended: false });
    // Como no motor real, pausar só vale para a fonte ativa.
    if (action === 'pause' && engine.activeId === sourceId) engine.playing = false;
    if (action === 'seek') source.position = options.seconds;
    if (action === 'loop') source.loop = options.loop;
    if (action === 'rate') source.playbackRate = options.playbackRate;
  },
  async trackStatus() {
    const source = engine.sources.get(engine.activeId);
    return { activeId: engine.activeId, playing: engine.playing && !engine.ended, ended: engine.ended,
      positionSeconds: source?.position ?? 0 };
  },
};

const tracks = {
  a: { id: 'a', name: 'Primeira', fileName: 'Primeira.MP3', mimeType: 'audio/mpeg', size: 3, addedAt: '' },
  b: { id: 'b', name: 'Segunda', fileName: 'Segunda.m4a', mimeType: 'audio/mp4', size: 4, addedAt: '' },
  loop: { id: 'fixed-loop:test', name: 'Loop', fileName: 'Loop.mp3', mimeType: 'audio/mpeg', size: 4, addedAt: '', fixedLoop: true, loopSourceBpm: 120 },
};
const library = { getFile: async (id) => new window.Blob([id === 'a' ? 'aaa' : 'bbbb']) };

const root = window.document.createElement('div');
root.innerHTML = window.Tracks.createTrackTransportMarkup();
window.document.body.append(root);
let snapshot = null;
const messages = [];
const transport = new TrackTransportController(root, library, (next) => { snapshot = next; }, (message) => messages.push(message), () => {},
  new NativeTrackPlayer(bridge));
transport.mount();
const controls = (action) => calls.filter(([kind, , name]) => kind === 'control' && name === action);

try {
  assert.equal(trackFileExtension('Louvor.Final.FLAC'), 'flac');
  assert.equal(trackFileExtension('sem-extensao'), 'audio');

  await transport.selectTrack(tracks.a);
  await settle();
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), ['store', 'a', 'mp3', 3], 'a música sobe com a extensão do arquivo');
  const firstSource = calls[1][1];
  assert.equal(snapshot.state, 'stopped', 'a duração vinda do motor libera o Play');
  assert.equal(root.querySelector('[data-transport-remaining]').value, '03:00');

  await transport.togglePlayStop();
  await settle();
  assert.equal(snapshot.state, 'playing', 'Play toca no motor');
  assert.equal(snapshot.loopPlaying, false, 'música normal não força o relógio do metrônomo');
  assert.deepEqual(controls('play').map(([, id]) => id), [firstSource]);

  engine.sources.get(firstSource).position = 60;
  await wait(260);
  assert.equal(root.querySelector('[data-transport-remaining]').value, '02:00', 'a posição do motor chega à tela');

  await transport.selectTrack(tracks.b);
  await settle();
  assert.equal(snapshot.queuedTrackId, 'b', 'escolher outra música tocando põe na fila');
  const secondSource = calls.find(([kind, , key]) => kind === 'load' && key === 'b')[1];
  assert.notEqual(secondSource, firstSource, 'a próxima música prepara a própria fonte no motor');

  transport.setLoopEnabled(true);
  await settle();
  assert.equal(controls('loop').length, 0, 'com uma próxima escolhida à mão, repetir não prende a atual');

  engine.ended = true;
  await wait(260);
  await settle();
  assert.equal(snapshot.selectedTrackId, 'b', 'o fim no motor promove a próxima');
  assert.equal(snapshot.state, 'playing');
  assert.equal(engine.activeId, secondSource, 'a próxima toca no motor');
  assert(controls('unload').some(([, id]) => id === firstSource), 'a música anterior sai do motor');
  assert.deepEqual(JSON.parse(JSON.stringify(controls('loop').at(-1))), ['control', secondSource, 'loop', { loop: true }],
    'repetir vale para a música que entrou');

  await transport.togglePlayStop();
  await settle();
  assert.equal(snapshot.state, 'stopped');
  assert.equal(snapshot.loopPlaying, false);
  assert.equal(engine.playing, false, 'Stop pausa no motor');
  assert.deepEqual(JSON.parse(JSON.stringify(controls('seek').at(-1))), ['control', secondSource, 'seek', { seconds: 0 }],
    'Stop volta ao início');

  // Troca de saída recria o motor: o próximo Play carrega a música de novo e toca.
  engine.sources.clear();
  engine.activeId = 0;
  const loadsBefore = calls.filter(([kind]) => kind === 'load').length;
  await transport.togglePlayStop();
  await settle();
  assert.equal(calls.filter(([kind]) => kind === 'load').length, loadsBefore + 1, 'a música volta ao motor recriado');
  assert.equal(engine.activeId, secondSource);
  assert.equal(snapshot.state, 'playing', 'e continua tocando');
  assert.deepEqual(messages, [], 'nenhum erro para o usuário');

  await transport.togglePlayStop();
  transport.setLoopEnabled(false);
  await transport.selectTrack(tracks.loop);
  await settle();
  assert.deepEqual(JSON.parse(JSON.stringify(controls('loop').at(-1))).slice(2), ['loop', { loop: true }],
    'áudio da playlist Loops repete mesmo com o Repeat geral desligado');
  transport.setTempoBpm(180);
  await settle();
  assert.deepEqual(JSON.parse(JSON.stringify(controls('rate').at(-1))).slice(2), ['rate', { playbackRate: 1.5 }],
    'loop preparado em 120 BPM acompanha o BPM global');
  await transport.togglePlayStop();
  await settle();
  assert.equal(snapshot.loopPlaying, true,
    'um loop tocando informa que o relógio do metrônomo deve ficar ativo e alinhado');
  await transport.selectTrack(tracks.a);
  await settle();
  assert.equal(transport.audio.playbackRate, 1, 'música normal permanece na velocidade original');
  assert.equal(snapshot.selectedTrackId, 'a', 'escolher outro áudio troca imediatamente o loop infinito');
  assert.equal(snapshot.queuedTrackId, null, 'o próximo áudio não fica preso atrás do loop');
  transport.destroy();
  await settle();
  assert.equal(engine.sources.size, 0, 'fechar o transporte libera o motor');
  console.log('NATIVE_TRACKS_OK: upload, load, play, engine position, queue promotion, loop, stop and engine restart');
} finally {
  await window.happyDOM.abort();
}
