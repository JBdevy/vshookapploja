import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Window } from 'happy-dom';

const compiled = await build({ entryPoints: ['src/features/tracks/FileBrowserView.ts'], bundle: true,
  write: false, format: 'iife', globalName: 'FileBrowser', platform: 'browser' });
const window = new Window({ url: 'http://localhost', settings: { enableJavaScriptEvaluation: true } });
window.eval(compiled.outputFiles[0].text);
const { FileBrowserController, createFileBrowserMarkup, audioTypeForFileName, formatFileSize } = window.FileBrowser;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

try {
  assert.equal(audioTypeForFileName('Louvor.MP3'), 'audio/mpeg');
  assert.equal(audioTypeForFileName('voz.m4a'), 'audio/mp4');
  assert.equal(formatFileSize(52_000_000), '49.6 MB');
  assert.equal(formatFileSize(0), '');

  const tree = {
    'app:': [],
    'drive:': [
      { name: 'Zeta.mp3', isDirectory: false, size: 1000 },
      { name: 'Ensaios', isDirectory: true },
      { name: 'Alfa.wav', isDirectory: false, size: 2000, inCloud: true },
    ],
    'drive:Ensaios': [{ name: 'Click.m4a', isDirectory: false, size: 500 }],
  };
  let roots = [{ id: 'app', name: 'Hook Keys', removable: false }, { id: 'drive', name: 'Louvor', removable: true }];
  const calls = [];
  const native = {
    roots: async () => roots,
    addFolder: async () => { calls.push('add'); return { id: 'usb', name: 'PEN DRIVE', removable: true }; },
    removeFolder: async (rootId) => { calls.push(`remove:${rootId}`); roots = roots.filter(({ id }) => id !== rootId); },
    list: async (rootId, path) => { calls.push(`list:${rootId}:${path}`); return tree[`${rootId}:${path}`] ?? []; },
    importFile: async (rootId, path) => {
      calls.push(`import:${rootId}:${path}`);
      if (path.includes('Zeta')) throw new Error('cloud_failed');
      return { path: `/tmp/import/${path}`, name: path.split('/').pop(), size: 10 };
    },
    release: async (path) => { calls.push(`release:${path}`); },
    fileUrl: (path) => `capacitor://localhost/_capacitor_file_${path}`,
  };
  window.fetch = async (url) => ({ ok: true, blob: async () => new window.Blob([`audio:${url}`]) });

  const root = window.document.createElement('div');
  root.innerHTML = createFileBrowserMarkup();
  window.document.body.append(root);
  const imported = [];
  const states = [];
  const controller = new FileBrowserController(root, native, async (file) => { imported.push(file); }, (state) => states.push(state));
  controller.mount();
  await settle(); await settle();
  assert.match(root.querySelector('[data-file-browser-list]').textContent, /pasta Hook Keys está vazia/, 'Hook Keys abre primeiro e explica como copiar músicas');
  assert.equal(root.querySelectorAll('[data-file-browser-remove]').length, 1, 'só as pastas liberadas podem ser removidas');

  root.querySelector('[data-file-browser-root="drive"]').click();
  await settle(); await settle();
  const rows = () => [...root.querySelectorAll('.file-browser__row')].map((row) => row.textContent.replace(/\s+/g, ' ').trim());
  assert.match(rows()[0], /^Ensaios/, 'pastas vêm antes das músicas');
  assert.match(rows()[1], /Alfa\.wav.*iCloud/, 'músicas em ordem alfabética, mostrando as do iCloud');
  assert.match(rows()[2], /Zeta\.mp3/);

  root.querySelector('[data-file-browser-folder="Ensaios"]').click();
  await settle(); await settle();
  assert.equal(root.querySelector('[data-file-browser-location]').textContent, 'Louvor / Ensaios', 'mostra o caminho da pasta');
  assert.equal(root.querySelector('[data-file-browser-up]').disabled, false);
  root.querySelector('[data-file-browser-up]').click();
  await settle(); await settle();
  assert.equal(root.querySelector('[data-file-browser-location]').textContent, 'Louvor', 'voltar sobe uma pasta');

  root.querySelector('[data-file-browser-select-all]').click();
  assert.equal(states.at(-1).selectedCount, 2, 'Selecionar todas marca só as músicas');
  assert.equal(root.querySelector('[data-file-browser-select-all]').textContent, 'Desmarcar todas');

  const added = await controller.importSelected();
  assert.equal(added, 1, 'uma música entra e a que falhou não');
  assert.equal(imported.length, 1);
  assert.equal(imported[0].name, 'Alfa.wav');
  assert.equal(imported[0].type, 'audio/wav', 'o arquivo importado leva o tipo de áudio certo');
  assert(calls.includes('release:/tmp/import/Alfa.wav'), 'a cópia temporária é apagada depois de importar');
  assert.match(root.querySelector('[data-file-browser-status]').textContent, /1 música adicionada\. 1 não pôde ser lida\./);
  assert.equal(states.at(-1).busy, false);
  assert.equal(states.at(-1).selectedCount, 1, 'a música que falhou continua marcada para tentar de novo');

  root.querySelector('[data-file-browser-add]').click();
  await settle(); await settle();
  assert(calls.includes('add'), 'Adicionar pasta chama o seletor do sistema uma vez');
  assert(root.querySelector('[data-file-browser-root="usb"][aria-pressed="true"]'), 'a pasta nova já abre selecionada');

  root.querySelector('[data-file-browser-remove="drive"]').click();
  await settle(); await settle();
  assert(calls.includes('remove:drive'));
  assert(!root.querySelector('[data-file-browser-root="drive"]'), 'o atalho removido some da lista');
  controller.destroy();
  console.log('FILE_BROWSER_OK: pastas, navegação, seleção, importação, falhas e atalhos');
} finally {
  await window.happyDOM.abort();
}
