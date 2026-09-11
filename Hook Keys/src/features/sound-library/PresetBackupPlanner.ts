import { SoundCatalog, type FixedSoundDefinition } from './SoundCatalog';
import { SoundLibraryStore } from './SoundLibraryStore';

export interface PresetSoundUsage {
  bank: string;
  preset: number;
  module: number;
}

export interface MissingUserSoundfont {
  id: string;
  name: string;
  usages: PresetSoundUsage[];
}

export interface PresetBackupPlan {
  fixedSoundsToDownload: FixedSoundDefinition[];
  missingFixedSoundIds: string[];
  missingUserSoundfonts: MissingUserSoundfont[];
}

interface SoundReference {
  id: string;
  kind: 'fixed' | 'user';
  name: string;
  usage: PresetSoundUsage;
}

export class PresetBackupPlanner {
  constructor(
    private readonly catalog: SoundCatalog,
    private readonly store: SoundLibraryStore,
  ) {}

  async createPlan(savedPlayerState: unknown): Promise<PresetBackupPlan> {
    const references = collectSoundReferences(savedPlayerState);
    const [installedFixed, installedUser] = await Promise.all([
      this.store.listInstalledFixedIds(),
      this.store.listUser().then((sounds) => new Set(sounds.map((sound) => sound.id))),
    ]);

    const fixedSoundsToDownload = new Map<string, FixedSoundDefinition>();
    const missingFixedSoundIds = new Set<string>();
    const missingUserSoundfonts = new Map<string, MissingUserSoundfont>();
    for (const reference of references) {
      if (reference.kind === 'fixed') {
        if (installedFixed.has(reference.id)) continue;
        const sound = this.catalog.get(reference.id);
        if (sound) fixedSoundsToDownload.set(sound.id, sound);
        else missingFixedSoundIds.add(reference.id);
        continue;
      }
      if (installedUser.has(reference.id)) continue;
      const current = missingUserSoundfonts.get(reference.id) ?? {
        id: reference.id,
        name: reference.name,
        usages: [],
      };
      current.usages.push(reference.usage);
      missingUserSoundfonts.set(reference.id, current);
    }

    return {
      fixedSoundsToDownload: [...fixedSoundsToDownload.values()],
      missingFixedSoundIds: [...missingFixedSoundIds],
      missingUserSoundfonts: [...missingUserSoundfonts.values()],
    };
  }
}

function collectSoundReferences(value: unknown): SoundReference[] {
  if (!isRecord(value) || !isRecord(value.banks)) return [];
  const references: SoundReference[] = [];
  for (const [bank, bankValue] of Object.entries(value.banks)) {
    if (!isRecord(bankValue) || !Array.isArray(bankValue.presets)) continue;
    bankValue.presets.forEach((presetValue, presetIndex) => {
      if (!isRecord(presetValue) || !Array.isArray(presetValue.modules)) return;
      presetValue.modules.forEach((moduleValue, moduleIndex) => {
        if (!isRecord(moduleValue) || typeof moduleValue.timbreId !== 'string') return;
        const match = /^(fixed|user):(.+)$/.exec(moduleValue.timbreId);
        if (!match || !match[1] || !match[2]) return;
        references.push({
          kind: match[1] as 'fixed' | 'user',
          id: match[2],
          name: typeof moduleValue.timbreName === 'string' && moduleValue.timbreName.trim()
            ? moduleValue.timbreName.trim().slice(0, 120)
            : 'Timbre de usuário',
          usage: { bank, preset: presetIndex + 1, module: moduleIndex + 1 },
        });
      });
    });
  }
  return references;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
