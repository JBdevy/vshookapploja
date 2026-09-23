import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const sourceUrl = new URL('../src/platform/desktop/installDesktopBrowserShortcutBlocker.ts', import.meta.url);
const source = readFileSync(sourceUrl, 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const shortcuts = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);

const key = (value, modifiers = {}) => ({
  altKey: false,
  ctrlKey: false,
  key: value,
  metaKey: false,
  shiftKey: false,
  ...modifiers,
});

test('atalhos de navegador ficam bloqueados no desktop', () => {
  for (const event of [
    key('f', { ctrlKey: true }),
    key('p', { ctrlKey: true }),
    key('r', { ctrlKey: true }),
    key('s', { ctrlKey: true }),
    key('u', { ctrlKey: true }),
    key('+', { ctrlKey: true }),
    key('i', { ctrlKey: true, shiftKey: true }),
    key('c', { ctrlKey: true, shiftKey: true }),
    key('[', { metaKey: true }),
    key('ArrowLeft', { altKey: true }),
    key('F5'),
    key('F12'),
    key('F10', { shiftKey: true }),
    key('BrowserBack'),
  ]) {
    assert.equal(shortcuts.isDesktopBrowserShortcut(event), true, `${event.key} deveria ser bloqueado`);
  }
});

test('atalhos de edição e teclas musicais continuam livres', () => {
  for (const event of [
    key('a', { ctrlKey: true }),
    key('c', { ctrlKey: true }),
    key('v', { ctrlKey: true }),
    key('x', { ctrlKey: true }),
    key('y', { ctrlKey: true }),
    key('z', { ctrlKey: true }),
    key('z'), key('s'), key('x'), key('d'), key('c'), key('q'), key('2'), key('w'),
  ]) {
    assert.equal(shortcuts.isDesktopBrowserShortcut(event), false, `${event.key} deveria continuar livre`);
  }
});

test('Windows desliga os aceleradores diretamente no WebView2', () => {
  const rust = readFileSync(new URL('../src-tauri/src/main.rs', import.meta.url), 'utf8');
  assert.match(rust, /SetAreBrowserAcceleratorKeysEnabled\(false\)/);
});
