import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, modules = {}, globals = {}) {
  const context = { exports: {}, URL, ...globals, require: (specifier) => {
    assert(specifier in modules, `Unexpected import: ${specifier}`);
    return modules[specifier];
  } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports;
}
const catalog = load('../src/features/sound-library/SoundCatalog.ts');
const category = (id, visibleModule, moduleRole = null) => ({ id, name: id, color: '#118ab2', sounds: [], visibleModule, moduleRole });
const payload = { revision: 2, updatedAt: null, categories: [
  category('legacy', undefined, 'sequencer'), category('all', null),
  ...Array.from({ length: 8 }, (_, index) => category(`only-${index + 1}`, index + 1)),
] };

test('categories appear only in their chosen module; old categories and Todos remain unrestricted', () => {
  const sounds = new catalog.SoundCatalog(payload);
  for (let number = 1; number <= 8; ++number) {
    assert.deepEqual(Array.from(sounds.categoriesForModule(number), ({ id }) => id), ['legacy', 'all', `only-${number}`]);
  }
  assert.equal(sounds.categoriesForModule(null).length, 10);
  assert.equal(sounds.getCategory('only-5').color, '#118ab2');
});

test('category module filtering survives the offline catalog cache and a new application session', () => {
  const storage = new Map();
  const { SoundCatalogCache } = load('../src/features/sound-library/SoundCatalogCache.ts', { './SoundCatalog': catalog }, {
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
  });
  new SoundCatalogCache('test@example.com').write(payload);
  const restored = new catalog.SoundCatalog(new SoundCatalogCache('test@example.com').read());
  assert.deepEqual(Array.from(restored.categoriesForModule(8), ({ id }) => id), ['legacy', 'all', 'only-8']);
});

test('invalid module restrictions cannot silently become visible in every module', () => {
  for (const visibleModule of [0, 9, -1, 1.5, '5', true, []]) {
    assert.throws(() => catalog.validateSoundCatalog({ categories: [category('invalid', visibleModule)] }), /sound_category_module_invalid/);
  }
});

test('mobile and desktop share the same filtered library and reject selecting a hidden category', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /return this\.soundCatalog\.categoriesForModule\(moduleNumber\);/);
  assert.match(player, /const categories = this\.soundCategoriesForModule\(moduleNumber\);\s*if \(category !== 'user' && !categories\.some/);
});
