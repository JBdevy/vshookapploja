import { emptySoundCatalog, validateSoundCatalog, type SoundCatalogPayload } from './SoundCatalog';

export class SoundCatalogCache {
  private readonly storageKey: string;

  constructor(accountEmail: string) {
    this.storageKey = `hookkeys.sound-catalog.${accountEmail.trim().toLowerCase()}`;
  }

  read(): SoundCatalogPayload {
    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? validateSoundCatalog(JSON.parse(raw)) : emptySoundCatalog();
    } catch {
      return emptySoundCatalog();
    }
  }

  write(catalog: SoundCatalogPayload): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(validateSoundCatalog(catalog)));
    } catch {
      // O catálogo em memória continua disponível nesta sessão.
    }
  }
}
