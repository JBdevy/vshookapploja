import type { SoundAssetGateway, SoundDownloadResponse } from './SoundAssetGateway';
import { SoundCatalog, type FixedSoundDefinition } from './SoundCatalog';
import { SoundLibraryStore, type InstalledFixedSound } from './SoundLibraryStore';
import { SoundPreviewPlayer } from './SoundPreviewPlayer';

export type SoundInstallPhase = 'downloading' | 'verifying' | 'saving' | 'complete';

export interface SoundInstallProgress {
  soundId: string;
  phase: SoundInstallPhase;
  receivedBytes: number;
  totalBytes: number | null;
  percentage: number | null;
}

export type SoundInstallProgressListener = (progress: SoundInstallProgress) => void;

const MAX_SOUND_FILE_BYTES = 1024 * 1024 * 1024;
const DOWNLOAD_FLUSH_BYTES = 8 * 1024 * 1024;

export class SoundLibraryEngine {
  readonly preview: SoundPreviewPlayer;
  private readonly activeDownloads = new Map<string, Promise<InstalledFixedSound>>();

  constructor(
    readonly catalog: SoundCatalog,
    private readonly store: SoundLibraryStore,
    private readonly gateway: SoundAssetGateway,
  ) {
    this.preview = new SoundPreviewPlayer(gateway, store);
  }

  async isInstalled(soundId: string): Promise<boolean> {
    return (await this.store.getFixed(soundId)) !== null;
  }

  getInstalled(soundId: string): Promise<InstalledFixedSound | null> {
    return this.store.getFixed(soundId);
  }

  install(
    soundId: string,
    onProgress?: SoundInstallProgressListener,
    signal?: AbortSignal,
  ): Promise<InstalledFixedSound> {
    const running = this.activeDownloads.get(soundId);
    if (running) return running;
    const task = this.installOnce(soundId, onProgress, signal)
      .finally(() => this.activeDownloads.delete(soundId));
    this.activeDownloads.set(soundId, task);
    return task;
  }

  remove(soundId: string): Promise<boolean> {
    return this.store.removeFixed(soundId);
  }

  destroy(): void {
    this.preview.destroy();
  }

  private async installOnce(
    soundId: string,
    onProgress?: SoundInstallProgressListener,
    externalSignal?: AbortSignal,
  ): Promise<InstalledFixedSound> {
    const sound = this.requireSound(soundId);
    const existing = await this.store.getFixed(soundId);
    if (existing && existing.catalogVersion >= sound.catalogVersion) return existing;

    const controller = new AbortController();
    const abort = () => controller.abort(externalSignal?.reason);
    externalSignal?.addEventListener('abort', abort, { once: true });
    if (externalSignal?.aborted) abort();
    try {
      const response = await this.gateway.openSoundfont(sound, controller.signal);
      const file = await readDownload(sound, response, onProgress, controller.signal);
      let sha256 = '';
      if (sound.sha256) {
        reportProgress(onProgress, soundId, 'verifying', file.size, response.byteSize);
        sha256 = await calculateSha256(file);
        if (sha256 !== sound.sha256.toLowerCase()) {
          throw new Error('sound_integrity_failed');
        }
      }
      reportProgress(onProgress, soundId, 'saving', file.size, response.byteSize);
      const installed: InstalledFixedSound = {
        soundId,
        file,
        byteSize: file.size,
        sha256,
        catalogVersion: sound.catalogVersion,
        installedAt: new Date().toISOString(),
      };
      await this.store.installFixed(installed);
      reportProgress(onProgress, soundId, 'complete', file.size, file.size);
      return installed;
    } finally {
      externalSignal?.removeEventListener('abort', abort);
    }
  }

  private requireSound(soundId: string): FixedSoundDefinition {
    const sound = this.catalog.get(soundId);
    if (!sound) throw new Error(`sound_not_found:${soundId}`);
    return sound;
  }
}

async function readDownload(
  sound: FixedSoundDefinition,
  response: SoundDownloadResponse,
  onProgress: SoundInstallProgressListener | undefined,
  signal: AbortSignal,
): Promise<Blob> {
  if (response.byteSize && response.byteSize > MAX_SOUND_FILE_BYTES) throw new Error('sound_too_large');
  if (sound.byteSize && response.byteSize && sound.byteSize !== response.byteSize) {
    throw new Error('sound_size_mismatch');
  }
  if (!response.body) throw new Error('sound_download_body_missing');

  const reader = response.body.getReader();
  // Um SF2 grande (o Astoria Grand tem ~490 MB) não cabe inteiro na memória do
  // celular como pedaços soltos: a cada 8 MB os pedaços viram um Blob, que o
  // sistema guarda fora da memória do JavaScript.
  const parts: BlobPart[] = [];
  let pending: BlobPart[] = [];
  let pendingBytes = 0;
  let receivedBytes = 0;
  const flushPending = () => {
    if (pending.length === 0) return;
    parts.push(new Blob(pending));
    pending = [];
    pendingBytes = 0;
  };
  try {
    while (true) {
      if (signal.aborted) throw signal.reason ?? new DOMException('Cancelado', 'AbortError');
      const result = await reader.read();
      if (result.done) break;
      receivedBytes += result.value.byteLength;
      if (receivedBytes > MAX_SOUND_FILE_BYTES) throw new Error('sound_too_large');
      // O fetch já entrega um Uint8Array independente. Guardá-lo diretamente
      // evita manter uma segunda cópia de todo o SF2 na memória. O TS tipa o
      // buffer como ArrayBufferLike (poderia ser compartilhado); aqui é sempre
      // um ArrayBuffer comum.
      pending.push(result.value as unknown as BlobPart);
      pendingBytes += result.value.byteLength;
      if (pendingBytes >= DOWNLOAD_FLUSH_BYTES) flushPending();
      reportProgress(onProgress, sound.id, 'downloading', receivedBytes, response.byteSize);
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  flushPending();

  if (receivedBytes === 0) throw new Error('sound_download_empty');
  if (sound.byteSize && receivedBytes !== sound.byteSize) throw new Error('sound_size_mismatch');
  if (response.byteSize && receivedBytes !== response.byteSize) throw new Error('sound_download_incomplete');
  return new Blob(parts, { type: response.mimeType });
}

async function calculateSha256(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function reportProgress(
  listener: SoundInstallProgressListener | undefined,
  soundId: string,
  phase: SoundInstallPhase,
  receivedBytes: number,
  totalBytes: number | null,
): void {
  listener?.({
    soundId,
    phase,
    receivedBytes,
    totalBytes,
    percentage: totalBytes ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100)) : null,
  });
}

export { MAX_SOUND_FILE_BYTES };
