import type { LocalTrack } from './TrackLibraryStore';

export type NativeTrackAction = 'play' | 'pause' | 'seek' | 'loop' | 'rate' | 'unload';

export interface NativeTrackStatus {
  activeId: number;
  playing: boolean;
  ended: boolean;
  positionSeconds: number;
}

export interface NativeTrackBridge {
  storeTrackFile(key: string, extension: string, file: Blob): Promise<void>;
  loadTrack(sourceId: number, key: string, extension: string): Promise<number>;
  controlTrack(sourceId: number, action: NativeTrackAction, options?: {
    seconds?: number;
    loop?: boolean;
    playbackRate?: number;
    syncMetronome?: boolean;
  }): Promise<void>;
  trackStatus(): Promise<NativeTrackStatus>;
}

export function trackFileExtension(fileName: string): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec(fileName.trim());
  return match?.[1]?.toLowerCase() ?? 'audio';
}

const STATUS_POLL_MS = 200;

// Músicas tocando no motor nativo. Cada fonte imita o pedaço do HTMLAudioElement
// que o transporte usa (play, pause, currentTime, duration, loop e os eventos),
// então fila, repetir e agulha continuam com a mesma lógica da web.
export class NativeTrackPlayer {
  private readonly playing = new Set<NativeTrackSource>();
  private pollTimer: number | null = null;
  private polling = false;
  private nextSourceId = 0;

  constructor(private readonly bridge: NativeTrackBridge) {}

  createSource(): NativeTrackSource {
    return new NativeTrackSource(this.bridge, ++this.nextSourceId, this);
  }

  /** @internal */
  setPlaying(source: NativeTrackSource, playing: boolean): void {
    if (playing) this.playing.add(source);
    else this.playing.delete(source);
    if (this.playing.size > 0 && this.pollTimer === null) {
      this.pollTimer = window.setInterval(() => void this.poll(), STATUS_POLL_MS);
    } else if (this.playing.size === 0 && this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async poll(): Promise<void> {
    if (this.polling || this.playing.size === 0) return;
    this.polling = true;
    try {
      const status = await this.bridge.trackStatus();
      for (const source of [...this.playing]) source.applyStatus(status);
    } catch {
      // Uma leitura perdida só atrasa a agulha até a próxima.
    } finally {
      this.polling = false;
    }
  }
}

export class NativeTrackSource extends EventTarget {
  preload = 'auto';
  volume = 1;
  private file: { key: string; extension: string; blob: Blob } | null = null;
  private durationSeconds = Number.NaN;
  private position = 0;
  private positionAt = 0;
  private playing = false;
  private loopEnabled = false;
  private playbackRateValue = 1;
  private loaded: Promise<boolean> | null = null;
  private engineLoaded = false;
  private openSerial = 0;
  private commands: Promise<unknown> = Promise.resolve();
  private pendingCommands = 0;

  constructor(
    private readonly bridge: NativeTrackBridge,
    readonly id: number,
    private readonly player: NativeTrackPlayer,
  ) {
    super();
  }

  get src(): string {
    return this.file ? `native-track:${this.file.key}` : '';
  }

  get duration(): number {
    return this.durationSeconds;
  }

  get paused(): boolean {
    return !this.playing;
  }

  get currentTime(): number {
    if (!this.playing) return this.position;
    const elapsed = this.position
      + ((performance.now() - this.positionAt) / 1000) * this.playbackRateValue;
    const duration = this.durationSeconds;
    if (!Number.isFinite(duration) || duration <= 0) return elapsed;
    return this.loopEnabled ? elapsed % duration : Math.min(duration, elapsed);
  }

  set currentTime(value: number) {
    const duration = Number.isFinite(this.durationSeconds) ? this.durationSeconds : Number.POSITIVE_INFINITY;
    const seconds = Math.min(duration, Math.max(0, Number.isFinite(value) ? value : 0));
    this.position = seconds;
    this.positionAt = performance.now();
    if (!this.engineLoaded) return;
    void this.enqueue(() => this.bridge.controlTrack(this.id, 'seek', { seconds })).catch(() => undefined);
  }

  get loop(): boolean {
    return this.loopEnabled;
  }

  set loop(value: boolean) {
    if (value === this.loopEnabled) return;
    this.loopEnabled = value;
    if (!this.engineLoaded) return;
    void this.enqueue(() => this.bridge.controlTrack(this.id, 'loop', { loop: value })).catch(() => undefined);
  }

  get playbackRate(): number {
    return this.playbackRateValue;
  }

  set playbackRate(value: number) {
    const normalized = Math.min(2.5, Math.max(0.5, Number.isFinite(value) ? value : 1));
    if (normalized === this.playbackRateValue) return;
    this.position = this.currentTime;
    this.positionAt = performance.now();
    this.playbackRateValue = normalized;
    if (!this.engineLoaded) return;
    void this.enqueue(() => this.bridge.controlTrack(this.id, 'rate', { playbackRate: normalized }))
      .catch(() => undefined);
  }

  open(track: LocalTrack, blob: Blob): void {
    const serial = ++this.openSerial;
    this.file = { key: track.nativeAssetKey ?? track.id, extension: trackFileExtension(track.fileName), blob };
    this.durationSeconds = Number.NaN;
    this.position = 0;
    this.engineLoaded = false;
    this.loaded = this.enqueue(() => this.loadIntoEngine(serial)).then(
      () => serial === this.openSerial,
      () => {
        if (serial === this.openSerial) this.dispatchEvent(new Event('error'));
        return false;
      },
    );
  }

  load(): void {
    // O arquivo já começou a subir para o motor em open().
  }

  removeAttribute(name: string): void {
    if (name !== 'src' || !this.file) return;
    this.openSerial += 1;
    this.file = null;
    this.loaded = null;
    this.engineLoaded = false;
    this.setPlaying(false);
    this.durationSeconds = Number.NaN;
    this.position = 0;
    void this.enqueue(() => this.bridge.controlTrack(this.id, 'unload')).catch(() => undefined);
  }

  async play(syncMetronome = false): Promise<void> {
    if (!this.loaded || !await this.loaded) throw new Error('track_not_ready');
    if (this.durationSeconds > 0 && this.position >= this.durationSeconds) this.position = 0;
    this.setPlaying(true);
    try {
      await this.enqueue(async () => {
        try {
          await this.bridge.controlTrack(this.id, 'play', { syncMetronome });
        } catch (error) {
          // O motor foi recriado (troca de saída): carrega de novo e retoma.
          if (!isTrackNotLoaded(error)) throw error;
          await this.loadIntoEngine(this.openSerial);
          await this.bridge.controlTrack(this.id, 'play', { syncMetronome });
        }
      });
      this.positionAt = performance.now();
    } catch (error) {
      this.setPlaying(false);
      throw error;
    }
  }

  pause(): void {
    if (!this.playing) return;
    this.position = this.currentTime;
    this.setPlaying(false);
    if (!this.engineLoaded) return;
    void this.enqueue(() => this.bridge.controlTrack(this.id, 'pause')).catch(() => undefined);
  }

  /** @internal */
  applyStatus(status: NativeTrackStatus): void {
    // Com um comando a caminho, o estado lido ainda pode ser o anterior.
    if (!this.playing || this.pendingCommands > 0 || status.activeId !== this.id) return;
    if (status.ended) {
      this.position = Number.isFinite(this.durationSeconds) ? this.durationSeconds : status.positionSeconds;
      this.setPlaying(false);
      // O motor também precisa saber que parou; senão a agulha o faz tocar.
      void this.enqueue(() => this.bridge.controlTrack(this.id, 'pause')).catch(() => undefined);
      this.dispatchEvent(new Event('timeupdate'));
      this.dispatchEvent(new Event('ended'));
      return;
    }
    this.position = status.positionSeconds;
    this.positionAt = performance.now();
    this.dispatchEvent(new Event('timeupdate'));
  }

  private async loadIntoEngine(serial: number): Promise<void> {
    const file = this.file;
    if (!file || serial !== this.openSerial) return;
    await this.bridge.storeTrackFile(file.key, file.extension, file.blob);
    if (serial !== this.openSerial) return;
    const duration = await this.bridge.loadTrack(this.id, file.key, file.extension);
    if (serial !== this.openSerial) return;
    this.engineLoaded = true;
    if (this.loopEnabled) await this.bridge.controlTrack(this.id, 'loop', { loop: true });
    if (this.playbackRateValue !== 1) {
      await this.bridge.controlTrack(this.id, 'rate', { playbackRate: this.playbackRateValue });
    }
    if (this.position > 0) await this.bridge.controlTrack(this.id, 'seek', { seconds: this.position });
    const changed = this.durationSeconds !== duration;
    this.durationSeconds = duration;
    if (changed) {
      this.dispatchEvent(new Event('loadedmetadata'));
      this.dispatchEvent(new Event('durationchange'));
    }
  }

  private setPlaying(playing: boolean): void {
    this.playing = playing;
    this.player.setPlaying(this, playing);
  }

  // Os comandos de uma fonte chegam ao motor na ordem em que foram dados.
  private enqueue<T>(command: () => Promise<T>): Promise<T> {
    this.pendingCommands += 1;
    const result = this.commands.then(command);
    this.commands = result.catch(() => undefined).finally(() => {
      this.pendingCommands -= 1;
    });
    return result;
  }
}

function isTrackNotLoaded(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'track_not_loaded';
}
