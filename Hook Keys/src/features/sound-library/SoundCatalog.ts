import type { SoundCategoryDefinition, SoundCategoryId } from './SoundCategories';

export interface FixedSoundDefinition {
  id: string;
  name: string;
  category: SoundCategoryId;
  color: string;
  sf2ObjectKey: string;
  previewObjectKey: string;
  catalogVersion: number;
  byteSize?: number;
  sha256?: string;
}

export interface SoundCatalogCategory extends SoundCategoryDefinition {
  sounds: readonly FixedSoundDefinition[];
  visibleModule?: number | null;
}

export interface PerformanceAssetDefinition {
  id: string;
  kind: 'pad' | 'fx';
  bank: string;
  slot: number;
  name: string;
  assetUrl: string;
  byteSize?: number;
  assetVersion: number;
}

export interface SoundCatalogPayload {
  revision: number;
  updatedAt: string | null;
  categories: readonly SoundCatalogCategory[];
  performanceAssets: readonly PerformanceAssetDefinition[];
}

export class SoundCatalog {
  private readonly soundsById: ReadonlyMap<string, FixedSoundDefinition>;
  readonly version: number;
  readonly sounds: readonly FixedSoundDefinition[];
  readonly categories: readonly SoundCatalogCategory[];
  readonly performanceAssets: readonly PerformanceAssetDefinition[];

  constructor(payload: SoundCatalogPayload = emptySoundCatalog()) {
    const validated = validateSoundCatalog(payload);
    this.version = validated.revision;
    this.categories = validated.categories;
    this.performanceAssets = validated.performanceAssets;
    this.sounds = validated.categories.flatMap((category) => category.sounds);
    this.soundsById = new Map(this.sounds.map((sound) => [sound.id, sound]));
  }

  get(soundId: string): FixedSoundDefinition | null {
    return this.soundsById.get(soundId) ?? null;
  }

  getCategory(categoryId: SoundCategoryId): SoundCatalogCategory | null {
    return this.categories.find((category) => category.id === categoryId) ?? null;
  }

  categoriesForModule(moduleNumber: number | null): readonly SoundCatalogCategory[] {
    if (moduleNumber === null) return this.categories;
    return this.categories.filter((category) => category.visibleModule == null || category.visibleModule === moduleNumber);
  }

  listByCategory(category: SoundCategoryId): readonly FixedSoundDefinition[] {
    return this.getCategory(category)?.sounds ?? [];
  }

  getPerformanceAsset(kind: 'pad' | 'fx', bank: string, slot: number): PerformanceAssetDefinition | null {
    return this.performanceAssets.find((asset) => asset.kind === kind && asset.bank === bank && asset.slot === slot) ?? null;
  }
}

export function emptySoundCatalog(): SoundCatalogPayload {
  return { revision: 1, updatedAt: null, categories: [], performanceAssets: [] };
}

export function validateSoundCatalog(value: unknown): SoundCatalogPayload {
  if (!isRecord(value) || !Array.isArray(value.categories)) throw new Error('sound_catalog_invalid');
  const revision = positiveInteger(value.revision, 1);
  const categoryIds = new Set<string>();
  const soundIds = new Set<string>();
  const categories = value.categories.map((rawCategory, categoryIndex) => {
    if (!isRecord(rawCategory)) throw new Error('sound_category_invalid');
    const id = safeId(rawCategory.id);
    if (categoryIds.has(id)) throw new Error('sound_category_duplicate');
    categoryIds.add(id);
    const sounds = Array.isArray(rawCategory.sounds) ? rawCategory.sounds.map((rawSound, soundIndex) => {
      if (!isRecord(rawSound)) throw new Error('sound_invalid');
      const soundId = safeId(rawSound.id);
      if (soundIds.has(soundId)) throw new Error('sound_duplicate');
      soundIds.add(soundId);
      return Object.freeze({
        id: soundId,
        name: safeName(rawSound.name, 120),
        category: id,
        color: safeColor(rawSound.color),
        sf2ObjectKey: optionalSafeHttpUrl(rawSound.sf2Url),
        previewObjectKey: optionalSafeHttpUrl(rawSound.previewUrl),
        catalogVersion: positiveInteger(rawSound.assetVersion, revision),
        byteSize: optionalPositiveInteger(rawSound.byteSize),
        order: positiveInteger(rawSound.order, soundIndex + 1),
      });
    }).sort((left, right) => left.order - right.order) : [];
    return Object.freeze({
      id,
      name: safeName(rawCategory.name, 80),
      color: safeColor(rawCategory.color),
      order: positiveInteger(rawCategory.order, categoryIndex + 1),
      moduleRole: rawCategory.moduleRole === 'sequencer' || rawCategory.moduleRole === 'mono'
        ? rawCategory.moduleRole : null,
      visibleModule: visibleModule(rawCategory.visibleModule),
      sounds,
    });
  }).sort((left, right) => left.order - right.order);

  const performanceAssets = Array.isArray(value.performanceAssets)
    ? value.performanceAssets.map((rawAsset) => {
      if (!isRecord(rawAsset)) throw new Error('performance_asset_invalid');
      const kind = rawAsset.kind === 'pad' || rawAsset.kind === 'fx' ? rawAsset.kind : null;
      if (!kind) throw new Error('performance_asset_kind_invalid');
      const assetUrl = String(rawAsset.assetUrl || '').trim();
      return Object.freeze({
        id: safeId(rawAsset.id),
        kind,
        bank: safeName(rawAsset.bank, 4),
        slot: positiveInteger(rawAsset.slot, 1),
        name: safeName(rawAsset.name, 120),
        assetUrl: assetUrl ? safeHttpUrl(assetUrl) : '',
        byteSize: optionalPositiveInteger(rawAsset.byteSize),
        assetVersion: positiveInteger(rawAsset.assetVersion, 1),
      });
    }) : [];

  return Object.freeze({
    revision,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null,
    categories: Object.freeze(categories),
    performanceAssets: Object.freeze(performanceAssets),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function visibleModule(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 8) {
    throw new Error('sound_category_module_invalid');
  }
  return value;
}

function safeId(value: unknown): string {
  const id = String(value || '').trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(id)) throw new Error('sound_catalog_id_invalid');
  return id;
}

function safeName(value: unknown, limit: number): string {
  const name = String(value || '').trim().slice(0, limit);
  if (!name) throw new Error('sound_catalog_name_invalid');
  return name;
}

function safeColor(value: unknown): string {
  const color = String(value || '').toLowerCase();
  return /^#[0-9a-f]{6}$/.test(color) ? color : '#ff8a22';
}

function safeHttpUrl(value: unknown): string {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('sound_catalog_url_invalid');
  return url.toString();
}

function optionalSafeHttpUrl(value: unknown): string {
  const raw = String(value || '').trim();
  return raw ? safeHttpUrl(raw) : '';
}

function positiveInteger(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function optionalPositiveInteger(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}
