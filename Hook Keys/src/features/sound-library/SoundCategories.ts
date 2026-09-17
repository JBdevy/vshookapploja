export type SoundCategoryId = string;

export interface SoundCategoryDefinition {
  id: SoundCategoryId;
  name: string;
  color: string;
  order: number;
}

export const DEFAULT_SOUND_CATEGORY: SoundCategoryId = '';

export function isSoundCategoryId(value: string | undefined): value is SoundCategoryId {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(value);
}
