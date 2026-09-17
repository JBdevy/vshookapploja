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
const category = (id, visibleModule) => ({ id, name: id, color: '#118ab2', sounds: [], visibleModule });
const payload = { revision: 2, updatedAt: null, categories: [
  category('legacy', undefined), category('all', null),
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

test('private R2 object keys and legacy URLs are both accepted by the catalog', () => {
  const privateCatalog = new catalog.SoundCatalog({
    revision: 3,
    categories: [{
      ...category('pianos', null),
      sounds: [{
        id: 'astoria',
        name: 'Astoria Grand',
        color: '#118ab2',
        sf2ObjectKey: 'library/1-Grand Piano/Astoria Grand.sf2',
        previewObjectKey: 'library/previews/Astoria Grand.mp3',
        assetVersion: 2,
      }],
    }],
  });
  assert.equal(privateCatalog.get('astoria').sf2ObjectKey, 'library/1-Grand Piano/Astoria Grand.sf2');
  assert.equal(privateCatalog.get('astoria').previewObjectKey, 'library/previews/Astoria Grand.mp3');

  const legacyCatalog = new catalog.SoundCatalog({
    categories: [{
      ...category('legacy-url', null),
      sounds: [{
        id: 'legacy-sound', name: 'Legacy', color: '#118ab2',
        sf2Url: 'https://cdn.example.com/legacy.sf2', previewUrl: '',
      }],
    }],
  });
  assert.equal(legacyCatalog.get('legacy-sound').sf2ObjectKey, 'https://cdn.example.com/legacy.sf2');
  assert.throws(() => new catalog.SoundCatalog({
    categories: [{
      ...category('unsafe', null),
      sounds: [{ id: 'unsafe-sound', name: 'Unsafe', color: '#118ab2', sf2ObjectKey: '../outside.sf2' }],
    }],
  }), /sound_catalog_object_key_invalid/);
});

test('catalog keeps Global settings and per-sound scopes for modules 1-4, 5, 6 and 7', () => {
  const settings = {
    modules1To4: { attackMs: 3 },
    module5: { rotary: { enabled: true } },
    module6: { arpeggiator: { enabled: false } },
    module7: { tranceGate: { enabled: true } },
  };
  const sounds = new catalog.SoundCatalog({
    revision: 4,
    defaultSettings: settings,
    categories: [{
      ...category('configured', null),
      defaultSettings: {
        modules1To4: { attackMs: 7 },
        module5: { rotary: { enabled: false } },
        module6: { arpeggiator: { enabled: true } },
        module7: { tranceGate: { enabled: false } },
      },
      sounds: [{
        id: 'configured-sound', name: 'Configured', color: '#118ab2',
        sf2ObjectKey: 'library/configured.sf2', moduleSettings: settings,
      }],
    }],
  });
  assert.equal(sounds.defaultSettings.modules1To4.attackMs, 3);
  assert.equal(sounds.getCategory('configured').defaultSettings.modules1To4.attackMs, 7);
  assert.equal(sounds.getCategory('configured').defaultSettings.module6.arpeggiator.enabled, true);
  assert.equal(sounds.get('configured-sound').moduleSettings.module5.rotary.enabled, true);
  assert.equal(sounds.get('configured-sound').moduleSettings.module7.tranceGate.enabled, true);
});
