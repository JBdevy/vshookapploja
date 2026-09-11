import type { FixedSoundDefinition } from './SoundCatalog';

export interface SoundDownloadResponse {
  body: ReadableStream<Uint8Array> | null;
  byteSize: number | null;
  mimeType: string;
}

export interface SoundAssetGateway {
  downloadPreview(sound: FixedSoundDefinition, signal: AbortSignal): Promise<Blob>;
  openSoundfont(sound: FixedSoundDefinition, signal: AbortSignal): Promise<SoundDownloadResponse>;
}

export type SoundAssetUrlResolver = (
  objectKey: string,
  kind: 'preview' | 'sf2',
) => Promise<string>;

export class HttpSoundAssetGateway implements SoundAssetGateway {
  constructor(private readonly resolveUrl: SoundAssetUrlResolver) {}

  async downloadPreview(sound: FixedSoundDefinition, signal: AbortSignal): Promise<Blob> {
    const url = await this.resolveUrl(sound.previewObjectKey, 'preview');
    const response = await fetch(url, { method: 'GET', signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`sound_preview_download_failed:${response.status}`);
    const file = await response.blob();
    if (file.size === 0) throw new Error('sound_preview_download_empty');
    return file;
  }

  async openSoundfont(
    sound: FixedSoundDefinition,
    signal: AbortSignal,
  ): Promise<SoundDownloadResponse> {
    const url = await this.resolveUrl(sound.sf2ObjectKey, 'sf2');
    const response = await fetch(url, { method: 'GET', signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`sound_download_failed:${response.status}`);
    const rawSize = Number(response.headers.get('content-length'));
    return {
      body: response.body,
      byteSize: Number.isSafeInteger(rawSize) && rawSize > 0 ? rawSize : null,
      mimeType: response.headers.get('content-type') || 'application/octet-stream',
    };
  }
}
