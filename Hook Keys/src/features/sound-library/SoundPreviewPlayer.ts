import type { SoundAssetGateway } from './SoundAssetGateway';
import type { FixedSoundDefinition } from './SoundCatalog';
import type { SoundLibraryStore } from './SoundLibraryStore';

const PREVIEW_LIMIT_SECONDS = 30;

export class SoundPreviewPlayer {
  private readonly audio = new Audio();
  private stopTimer: number | null = null;
  private objectUrl: string | null = null;
  private downloadAbort: AbortController | null = null;

  constructor(
    private readonly gateway: SoundAssetGateway,
    private readonly store: SoundLibraryStore,
  ) {
    this.audio.preload = 'metadata';
    this.audio.addEventListener('ended', () => this.clearStopTimer());
  }

  async play(sound: FixedSoundDefinition): Promise<void> {
    this.stop();
    const controller = new AbortController();
    this.downloadAbort = controller;
    const cached = await this.store.getPreview(sound.id);
    if (controller.signal.aborted) throw new DOMException('Cancelado', 'AbortError');
    let file = cached?.catalogVersion === sound.catalogVersion
      && cached.sourceKey === sound.previewObjectKey
      ? cached.file
      : null;
    if (!file) {
      file = await this.gateway.downloadPreview(sound, controller.signal);
      if (controller.signal.aborted) throw new DOMException('Cancelado', 'AbortError');
      await this.store.savePreview({
        soundId: sound.id,
        file,
        catalogVersion: sound.catalogVersion,
        sourceKey: sound.previewObjectKey,
        savedAt: new Date().toISOString(),
      });
    }
    if (controller.signal.aborted) throw new DOMException('Cancelado', 'AbortError');
    if (this.downloadAbort === controller) this.downloadAbort = null;
    this.objectUrl = URL.createObjectURL(file);
    this.audio.src = this.objectUrl;
    this.audio.currentTime = 0;
    await this.audio.play();
    this.stopTimer = window.setTimeout(() => this.stop(), PREVIEW_LIMIT_SECONDS * 1000);
  }

  stop(): void {
    this.clearStopTimer();
    this.downloadAbort?.abort();
    this.downloadAbort = null;
    this.audio.pause();
    this.audio.currentTime = 0;
    this.audio.removeAttribute('src');
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
  }

  destroy(): void {
    this.stop();
    this.audio.removeAttribute('src');
    this.audio.load();
  }

  private clearStopTimer(): void {
    if (this.stopTimer !== null) window.clearTimeout(this.stopTimer);
    this.stopTimer = null;
  }
}

export { PREVIEW_LIMIT_SECONDS };
