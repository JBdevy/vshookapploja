import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { Window } from 'happy-dom';

const compiled = await build({ entryPoints: ['src/features/tracks/TracksPanelController.ts'], bundle: true,
  write: false, format: 'iife', globalName: 'Tracks', platform: 'browser' });
const window = new Window({ settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
window.eval(compiled.outputFiles[0].text);
const settle = async () => { for (let index = 0; index < 12; index += 1) await new Promise(resolve => setImmediate(resolve)); };
const style = window.document.createElement('style');
style.textContent = readFileSync('src/styles.css', 'utf8');
window.document.head.append(style);
try {
for (const [layout, markup, wrapper] of [
  ['split', window.Tracks.createTracksSplitPanelMarkup(), 'player-screen'],
  ['normal', window.Tracks.createTracksPanelMarkup(), 'modal']
]) {
window.document.body.innerHTML = `<div class="${wrapper}">${markup}</div>`;
const panel = window.document.querySelector(layout === 'split' ? '.tracks-split-panel' : '.tracks-tools-panel');
panel.querySelector('[data-tracks-library]').innerHTML = ['a', 'b', 'c'].map(id =>
  `<button class="track-card" data-track-id="${id}"><strong>${id}</strong><span class="track-card__progress"><i></i></span></button>`).join('');
const controller = new window.Tracks.TracksPanelController(panel, {});
const importLoading = panel.querySelector('[data-tracks-import-loading]');
assert(importLoading?.hidden, `loading de importação nasce oculto no modo ${layout}`);
controller.setImportLoading(true, 'Adicionando 2 de 3...');
assert(!importLoading.hidden, `loading aparece durante a importação no modo ${layout}`);
assert.equal(importLoading.querySelector('[data-tracks-import-loading-label]').textContent, 'Adicionando 2 de 3...');
assert.equal(panel.getAttribute('aria-busy'), 'true');
controller.setImportLoading(true, 'Adicionando 2 de 3...', 1 / 3);
const importBar = importLoading.querySelector('[data-tracks-import-loading-bar]');
assert(!importBar.classList.contains('is-indeterminate'), `barra avança por arquivo no modo ${layout}`);
assert.equal(Number(importBar.style.getPropertyValue('--import-progress')).toFixed(3), '0.333');
controller.setImportLoading(false);
assert(importLoading.hidden, `loading some somente depois da atualização no modo ${layout}`);
const snapshot = { selectedTrackId: 'a', playingTrackId: 'a', queuedTrackId: 'b', queuedTrackName: 'b',
  queueSource: 'manual', state: 'playing', progress: 0.25, queueProgress: 0.75 };
const row = id => panel.querySelector(`[data-track-id="${id}"]`);
const color = id => window.getComputedStyle(row(id)).getPropertyValue('--button-color-a').trim();
  controller.syncPlayback(snapshot);
  assert(row('b').classList.contains('is-queued'));
  assert.equal(color('b'), '#e77d1c', 'a fila mantém tarja laranja apesar do tema genérico de botões');
  assert.equal(color('a'), '#9d2718', 'tocando permanece vermelho');
  assert.equal(color('c'), '#2f2f33', 'músicas fora da fila permanecem neutras');
  assert.equal(row('b').style.getPropertyValue('--track-queue-progress'), '0.75');
  assert.equal(window.getComputedStyle(row('b').querySelector('.track-card__progress i')).backgroundColor,
    '#ffd43b', 'barra regressiva da fila continua amarela');
  controller.syncPlayback({ ...snapshot, queuedTrackId: 'c' });
  assert(!row('b').classList.contains('is-queued'));
  assert.equal(color('b'), '#2f2f33');
  assert.equal(color('c'), '#e77d1c');
  controller.syncPlayback({ ...snapshot, queuedTrackId: null });
  assert.equal(color('c'), '#2f2f33', 'tirar a música da fila remove a tarja laranja');
  console.log(`PLAYLIST_QUEUE_OK (${layout}): queued orange, countdown yellow, playback and queue changes`);
}
// Add música: no app nativo abre direto o seletor de arquivos, e só áudio entra.
const nativeAccept = window.Tracks.trackFileAccept(true);
assert(nativeAccept.startsWith('application/octet-stream'), 'nativo pede documento, sem câmera ou fotos');
assert(!nativeAccept.includes('audio/*'), 'nativo não usa o curinga audio/*');
assert.match(nativeAccept, /\.mp3/);
assert(window.Tracks.trackFileAccept(false).startsWith('audio/*'), 'no navegador continua filtrando áudio');
assert.equal(window.Tracks.isTrackAudioFile({ name: 'Louvor.MP3', type: '' }), true);
assert.equal(window.Tracks.isTrackAudioFile({ name: 'voz', type: 'audio/mp4' }), true);
assert.equal(window.Tracks.isTrackAudioFile({ name: 'foto.jpg', type: 'image/jpeg' }), false);
console.log('TRACK_FILE_PICKER_OK: documento direto no nativo e filtro de áudio');
// iOS: Add música abre o gerenciador do app; sem ele, o seletor do sistema.
for (const [available, expectsPicker] of [[true, false], [false, true]]) {
  const host = window.document.createElement('div');
  host.innerHTML = window.Tracks.createTracksPanelMarkup() + '<button type="button" data-tracks-action="add-music">Add música</button>';
  window.document.body.append(host);
  let requested = 0;
  let pickerOpened = 0;
  host.querySelector('[data-tracks-file]').click = () => { pickerOpened += 1; };
  const panel = new window.Tracks.TracksPanelController(host, {}, {
    onAddMusicRequested: () => { requested += 1; return available; },
  });
  panel.mount();
  host.querySelector('[data-tracks-action="add-music"]').click();
  assert.equal(requested, 1, 'Add música pergunta pelo gerenciador do app');
  assert.equal(pickerOpened, expectsPicker ? 1 : 0, available ? 'com o gerenciador, o seletor do sistema não abre' : 'sem o gerenciador, abre o seletor do sistema');
  panel.destroy();
  host.remove();
}
console.log('ADD_MUSIC_PICKER_OK: seletor nativo no iOS, campo de arquivo nas outras plataformas');

// Delete All: em All apaga a biblioteca; numa playlist limpa só a associação.
for (const scope of ['all', 'playlist']) {
  const host = window.document.createElement('div');
  host.innerHTML = window.Tracks.createTracksPanelMarkup() + `
    <button type="button" data-tracks-action="delete-all" disabled>Delete All</button>`;
  window.document.body.append(host);
  let tracks = [
    { id: 'a', name: 'A', fileName: 'a.mp3', mimeType: 'audio/mpeg', size: 1, addedAt: '' },
    { id: 'b', name: 'B', fileName: 'b.mp3', mimeType: 'audio/mpeg', size: 1, addedAt: '' },
  ];
  let playlists = [{ id: 'p', name: 'Set', trackIds: ['a'], createdAt: '', updatedAt: '' }];
  let deletedLibrary = 0;
  let deletedFiles = 0;
  const library = {
    list: async () => tracks,
    listPlaylists: async () => playlists,
    listBlocks: async () => [],
    getListLayout: async () => [],
    saveListLayout: async () => {},
    updatePlaylist: async (id, name, trackIds) => {
      const updated = { ...playlists.find(item => item.id === id), id, name, trackIds: [...trackIds], updatedAt: '' };
      playlists = playlists.map(item => item.id === id ? updated : item);
      return updated;
    },
    deleteAllTracks: async () => { deletedLibrary += 1; const removed = tracks; tracks = []; return removed; },
  };
  const controller = new window.Tracks.TracksPanelController(host, library, {
    onTracksDeleting: async removed => { deletedFiles += removed.length; },
  });
  controller.mount();
  await settle();
  if (scope === 'playlist') {
    host.querySelector('[data-playlist-id="p"]').click();
    await settle();
  }
  const button = host.querySelector('[data-tracks-action="delete-all"]');
  assert.equal(button.disabled, false, `Delete All habilita quando há música em ${scope}`);
  button.click();
  const confirmation = host.querySelector('[data-playlist-editor]');
  assert.equal(confirmation.hidden, false, `Delete All pede confirmação em ${scope}`);
  if (scope === 'playlist') assert.match(confirmation.textContent, /continuarão disponíveis em All/);
  else assert.match(confirmation.textContent, /apagadas da biblioteca e de todas as playlists/);
  confirmation.querySelector('[data-tracks-action="delete-all-confirm"]').click();
  await settle();
  if (scope === 'playlist') {
    assert.equal(deletedLibrary, 0, 'limpar playlist não apaga a biblioteca');
    assert.equal(deletedFiles, 0, 'limpar playlist não apaga os arquivos');
    assert.deepEqual(playlists[0].trackIds, [], 'playlist fica vazia');
    assert.equal(tracks.length, 2, 'as músicas continuam em All');
  } else {
    assert.equal(deletedLibrary, 1, 'All apaga a biblioteca');
    assert.equal(deletedFiles, 2, 'All solicita a remoção dos arquivos');
    assert.equal(tracks.length, 0);
  }
  assert.equal(button.disabled, true, `Delete All apaga quando a lista ${scope} fica vazia`);
  controller.destroy();
  host.remove();
}
console.log('DELETE_ALL_OK: confirmação, biblioteca inteira em All e somente associações na playlist');
} finally {
  await window.happyDOM.abort();
}
