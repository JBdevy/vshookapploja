import { type LocalTrack, TrackLibraryStore } from './TrackLibraryStore';
import { LongPressGesture } from '../../shared/gestures/LongPressGesture';
import { isDesktopRuntime } from '../../platform/runtime';

export type TrackPlaybackState = 'empty' | 'loading' | 'stopped' | 'playing' | 'paused';
export type TrackQueueSource = 'manual' | 'auto';

export interface TrackPlaybackSnapshot {
  progress: number;
  queueProgress: number;
  queuedTrackId: string | null;
  queuedTrackName: string | null;
  queueSource: TrackQueueSource | null;
  selectedTrackId: string | null;
  playingTrackId: string | null;
  state: TrackPlaybackState;
}

export function createTrackTransportMarkup(): string {
  return `
    <section class="track-transport" aria-label="Transporte da música">
      <button type="button" data-transport-action="play-stop" disabled>Play</button>
      <button class="track-transport__name" type="button" data-transport-track-name disabled><span>Nenhuma música selecionada</span></button>
      <output data-transport-remaining aria-label="Tempo restante">00:00</output>
    </section>
  `;
}

export class TrackTransportController {
  private audio = new Audio();
  private readonly handleClick = (event: Event) => this.onClick(event);
  private readonly handleInput = (event: Event) => this.onInput(event);
  private readonly handleLoadedMetadata = () => this.onLoadedMetadata();
  private readonly handleTimeUpdate = () => this.renderTimeline();
  private readonly handleEnded = () => this.onEnded();
  private readonly handleError = () => this.onAudioError();
  private readonly handlePointerDown = (event: PointerEvent) => this.onPointerDown(event);
  private readonly handlePointerMove = (event: PointerEvent) => this.nameHoldGesture.move(event);
  private readonly handlePointerEnd = (event: PointerEvent) => this.nameHoldGesture.end(event);
  private readonly handleContextMenu = (event: MouseEvent) => this.onContextMenu(event);
  private readonly nameHoldGesture = new LongPressGesture(620);
  private objectUrl: string | null = null;
  private queuedAudio: HTMLAudioElement | null = null;
  private queuedObjectUrl: string | null = null;
  private selectedTrack: LocalTrack | null = null;
  private queuedTrack: LocalTrack | null = null;
  private queueSource: TrackQueueSource | null = null;
  private autoQueueSuppressedForTrackId: string | null = null;
  private state: TrackPlaybackState = 'empty';
  private loadSequence = 0;
  private queueSequence = 0;
  private autoplayPending = false;
  private outputDb = 0;
  private outputEnabled = true;
  private audioContext: AudioContext | null = null;
  private outputGain: GainNode | null = null;
  private readonly connectedAudio = new WeakSet<HTMLAudioElement>();
  private renderedTrackName = '';

  constructor(
    private readonly root: HTMLElement,
    private readonly library: TrackLibraryStore,
    private readonly onPlaybackChanged: (snapshot: TrackPlaybackSnapshot) => void,
    private readonly onMessage: (message: string) => void,
    private readonly onPositionRequested: (trigger: HTMLElement) => void,
  ) {
    this.audio.preload = 'metadata';
  }

  mount(): void {
    this.root.addEventListener('click', this.handleClick);
    this.root.addEventListener('input', this.handleInput);
    this.root.addEventListener('pointerdown', this.handlePointerDown);
    this.root.addEventListener('pointermove', this.handlePointerMove);
    this.root.addEventListener('pointerup', this.handlePointerEnd);
    this.root.addEventListener('pointercancel', this.handlePointerEnd);
    this.root.addEventListener('contextmenu', this.handleContextMenu);
    this.bindCurrentAudio();
    this.render();
  }

  destroy(): void {
    this.loadSequence += 1;
    this.queueSequence += 1;
    this.unbindCurrentAudio();
    this.audio.pause();
    this.root.removeEventListener('click', this.handleClick);
    this.root.removeEventListener('input', this.handleInput);
    this.root.removeEventListener('pointerdown', this.handlePointerDown);
    this.root.removeEventListener('pointermove', this.handlePointerMove);
    this.root.removeEventListener('pointerup', this.handlePointerEnd);
    this.root.removeEventListener('pointercancel', this.handlePointerEnd);
    this.root.removeEventListener('contextmenu', this.handleContextMenu);
    this.nameHoldGesture.cancel();
    this.releaseCurrentSource();
    this.clearQueuedTrack();
    this.outputGain?.disconnect();
    void this.audioContext?.close();
    this.outputGain = null;
    this.audioContext = null;
  }

  setOutputLevel(db: number, enabled: boolean): void {
    this.outputDb = Math.min(6, Math.max(-60, db));
    this.outputEnabled = enabled;
    this.applyOutputGain();
  }

  getSelectedTrackId(): string | null {
    return this.selectedTrack?.id ?? null;
  }

  getSnapshot(): TrackPlaybackSnapshot {
    const progress = this.currentProgress();
    const playingTrackId = this.state === 'playing' || this.state === 'paused'
      ? this.selectedTrack?.id ?? null
      : null;
    return {
      progress,
      queueProgress: this.queuedTrack ? 1 - progress : 0,
      queuedTrackId: this.queuedTrack?.id ?? null,
      queuedTrackName: this.queuedTrack?.name ?? null,
      queueSource: this.queueSource,
      selectedTrackId: this.selectedTrack?.id ?? null,
      playingTrackId,
      state: this.state,
    };
  }

  refreshView(): void {
    this.render();
  }

  async selectTrack(track: LocalTrack): Promise<void> {
    if (track.id === this.selectedTrack?.id && this.state !== 'empty') return;
    if (track.id === this.queuedTrack?.id) {
      this.autoQueueSuppressedForTrackId = this.selectedTrack?.id ?? null;
      this.clearQueuedTrack();
      this.renderTimeline();
      return;
    }
    if (this.state === 'playing' || this.state === 'paused') {
      await this.queueTrack(track, 'manual');
      return;
    }
    await this.loadCurrentTrack(track, false);
  }

  async setAutoQueue(track: LocalTrack | null): Promise<void> {
    if (this.queueSource === 'manual') return;
    if (this.autoQueueSuppressedForTrackId === this.selectedTrack?.id) return;
    if (!track || track.id === this.selectedTrack?.id) {
      this.clearAutoQueue();
      return;
    }
    if (this.queuedTrack?.id === track.id && this.queueSource === 'auto') return;
    await this.queueTrack(track, 'auto');
  }

  clearAutoQueue(): void {
    this.autoQueueSuppressedForTrackId = null;
    if (this.queueSource !== 'auto') return;
    this.clearQueuedTrack();
    this.renderTimeline();
  }

  private async queueTrack(track: LocalTrack, source: TrackQueueSource): Promise<void> {
    if (track.id === this.selectedTrack?.id) return;
    if (source === 'manual') this.autoQueueSuppressedForTrackId = null;
    const sequence = ++this.queueSequence;
    this.clearQueuedTrack(false);
    this.queuedTrack = track;
    this.queueSource = source;
    this.renderTimeline();

    try {
      const file = await this.library.getFile(track.id);
      if (sequence !== this.queueSequence || this.queuedTrack?.id !== track.id) return;
      if (!file) throw new Error('track_file_not_found');
      this.queuedObjectUrl = URL.createObjectURL(file);
      this.queuedAudio = new Audio(this.queuedObjectUrl);
      this.queuedAudio.preload = 'auto';
      this.queuedAudio.load();
    } catch {
      if (sequence !== this.queueSequence || this.queuedTrack?.id !== track.id) return;
      this.clearQueuedTrack();
      this.onMessage('Não foi possível preparar a próxima música.');
      this.renderTimeline();
    }
  }

  private onClick(event: Event): void {
    const target = event.target;
    const action = target instanceof Element
      ? target.closest<HTMLButtonElement>('[data-transport-action]')?.dataset.transportAction
      : undefined;
    if (action === 'play-stop') void this.togglePlayStop();
  }

  private onPointerDown(event: PointerEvent): void {
    const target = event.target;
    const nameButton = target instanceof Element
      ? target.closest<HTMLButtonElement>('[data-transport-track-name]')
      : null;
    if (!nameButton || nameButton.disabled || !this.selectedTrack) return;
    event.preventDefault();
    if (!isDesktopRuntime()) {
      this.nameHoldGesture.start(event, () => this.onPositionRequested(nameButton));
    }
  }

  private onContextMenu(event: MouseEvent): void {
    if (!isDesktopRuntime()) return;
    const nameButton = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>('[data-transport-track-name]')
      : null;
    if (!nameButton || nameButton.disabled || !this.selectedTrack) return;
    event.preventDefault();
    event.stopPropagation();
    this.nameHoldGesture.cancel();
    this.onPositionRequested(nameButton);
  }

  private onInput(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.matches('[data-transport-progress]')) return;
    if (this.state === 'playing' || !this.hasDuration()) {
      this.renderTimeline();
      return;
    }
    this.audio.currentTime = (Number(input.value) / 1000) * this.audio.duration;
    this.renderTimeline();
  }

  private async togglePlayStop(): Promise<void> {
    if (!this.selectedTrack || this.state === 'loading' || !this.audio.src) return;
    if (this.state === 'playing' || this.state === 'paused') {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.state = 'stopped';
      this.clearQueuedTrack();
      this.render();
      return;
    }
    if (this.hasDuration() && this.audio.currentTime >= this.audio.duration) this.audio.currentTime = 0;
    try {
      await this.prepareAudioOutput(this.audio);
      await this.audio.play();
      this.state = 'playing';
      this.render();
    } catch {
      this.onMessage('Não foi possível reproduzir essa música.');
    }
  }

  private onLoadedMetadata(): void {
    if (!this.selectedTrack || !this.hasDuration()) return;
    if (this.state === 'loading' && !this.autoplayPending) this.state = 'stopped';
    this.render();
  }

  private onEnded(): void {
    if (this.queuedTrack) {
      void this.promoteQueuedTrack();
      return;
    }
    this.state = 'stopped';
    this.render();
  }

  private onAudioError(): void {
    if (this.state === 'empty' || this.autoplayPending) return;
    this.state = 'stopped';
    this.onMessage('Não foi possível reproduzir essa música.');
    this.render();
  }

  private async loadCurrentTrack(track: LocalTrack, autoplay: boolean): Promise<void> {
    const sequence = ++this.loadSequence;
    this.audio.pause();
    this.releaseCurrentSource();
    this.clearQueuedTrack();
    this.selectedTrack = track;
    this.autoQueueSuppressedForTrackId = null;
    this.state = 'loading';
    this.autoplayPending = autoplay;
    this.render();

    try {
      const file = await this.library.getFile(track.id);
      if (sequence !== this.loadSequence) return;
      if (!file) throw new Error('track_file_not_found');
      this.objectUrl = URL.createObjectURL(file);
      this.audio.src = this.objectUrl;
      this.audio.load();
      if (autoplay) {
        await this.audio.play();
        if (sequence !== this.loadSequence) return;
        this.state = 'playing';
      }
      this.autoplayPending = false;
      this.render();
    } catch {
      if (sequence !== this.loadSequence) return;
      this.autoplayPending = false;
      this.state = 'empty';
      this.selectedTrack = null;
      this.onMessage('Não foi possível abrir essa música.');
      this.render();
    }
  }

  private async promoteQueuedTrack(): Promise<void> {
    const track = this.queuedTrack;
    const preparedAudio = this.queuedAudio;
    const preparedUrl = this.queuedObjectUrl;
    if (!track) return;

    this.queueSequence += 1;
    this.queuedTrack = null;
    this.queueSource = null;
    this.queuedAudio = null;
    this.queuedObjectUrl = null;

    if (!preparedAudio || !preparedUrl) {
      await this.loadCurrentTrack(track, true);
      return;
    }

    this.loadSequence += 1;
    this.unbindCurrentAudio();
    this.audio.pause();
    this.releaseCurrentSource();
    this.audio = preparedAudio;
    this.objectUrl = preparedUrl;
    this.selectedTrack = track;
    this.autoQueueSuppressedForTrackId = null;
    this.state = 'loading';
    this.autoplayPending = true;
    this.bindCurrentAudio();
    this.render();
    try {
      await this.prepareAudioOutput(this.audio);
      await this.audio.play();
      this.state = 'playing';
      this.autoplayPending = false;
      this.render();
    } catch {
      this.autoplayPending = false;
      this.state = 'stopped';
      this.onMessage('Não foi possível iniciar a próxima música.');
      this.render();
    }
  }

  private render(): void {
    const playStop = this.root.querySelector<HTMLButtonElement>('[data-transport-action="play-stop"]');
    const trackName = this.root.querySelector<HTMLButtonElement>('[data-transport-track-name]');
    const trackNameLabel = trackName?.querySelector<HTMLElement>('span');
    const ready = Boolean(this.selectedTrack) && this.state !== 'loading' && this.hasDuration();
    if (playStop) {
      playStop.disabled = !ready;
      playStop.textContent = this.state === 'playing' || this.state === 'paused' ? 'Stop' : 'Play';
      playStop.classList.toggle('is-playing', this.state === 'playing' || this.state === 'paused');
    }
    if (trackName) {
      const nextName = this.selectedTrack?.name ?? 'Nenhuma música selecionada';
      trackName.disabled = !this.selectedTrack;
      trackName.title = this.selectedTrack?.name ?? '';
      if (trackNameLabel && nextName !== this.renderedTrackName) {
        this.renderedTrackName = nextName;
        trackNameLabel.textContent = nextName;
        trackNameLabel.classList.remove('is-marquee');
        trackName.style.setProperty('--transport-name-viewport-width', `${Math.max(0, trackName.clientWidth - 12)}px`);
        if (trackNameLabel.scrollWidth > trackName.clientWidth - 12) {
          trackNameLabel.classList.add('is-marquee');
        }
      }
    }
    this.renderTimeline();
  }

  private renderTimeline(): void {
    const progress = this.root.querySelector<HTMLInputElement>('[data-transport-progress]');
    const remaining = this.root.querySelector<HTMLOutputElement>('[data-transport-remaining]');
    const ready = Boolean(this.selectedTrack) && this.state !== 'loading' && this.hasDuration();
    const ratio = this.currentProgress();
    if (progress) {
      progress.value = String(Math.round(ratio * 1000));
      progress.disabled = !ready || this.state === 'playing';
      progress.style.setProperty('--track-progress', `${ratio * 100}%`);
      progress.closest<HTMLElement>('.waveform-position')?.style.setProperty('--track-progress', `${ratio * 100}%`);
      progress.title = this.state === 'playing'
        ? 'Pare ou pause a música para mover a posição'
        : 'Mover posição da música';
    }
    if (remaining) {
      const seconds = ready ? Math.max(0, this.audio.duration - this.audio.currentTime) : 0;
      remaining.value = formatTime(seconds);
    }
    this.onPlaybackChanged(this.getSnapshot());
  }

  private currentProgress(): number {
    return this.hasDuration()
      ? Math.min(1, Math.max(0, this.audio.currentTime / this.audio.duration))
      : 0;
  }

  private hasDuration(): boolean {
    return Number.isFinite(this.audio.duration) && this.audio.duration > 0;
  }

  private bindCurrentAudio(): void {
    this.audio.addEventListener('loadedmetadata', this.handleLoadedMetadata);
    this.audio.addEventListener('durationchange', this.handleLoadedMetadata);
    this.audio.addEventListener('timeupdate', this.handleTimeUpdate);
    this.audio.addEventListener('ended', this.handleEnded);
    this.audio.addEventListener('error', this.handleError);
  }

  private unbindCurrentAudio(): void {
    this.audio.removeEventListener('loadedmetadata', this.handleLoadedMetadata);
    this.audio.removeEventListener('durationchange', this.handleLoadedMetadata);
    this.audio.removeEventListener('timeupdate', this.handleTimeUpdate);
    this.audio.removeEventListener('ended', this.handleEnded);
    this.audio.removeEventListener('error', this.handleError);
  }

  private releaseCurrentSource(): void {
    this.audio.removeAttribute('src');
    this.audio.load();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
  }

  private clearQueuedTrack(incrementSequence = true): void {
    if (incrementSequence) this.queueSequence += 1;
    this.queuedAudio?.pause();
    this.queuedAudio?.removeAttribute('src');
    this.queuedAudio?.load();
    if (this.queuedObjectUrl) URL.revokeObjectURL(this.queuedObjectUrl);
    this.queuedAudio = null;
    this.queuedObjectUrl = null;
    this.queuedTrack = null;
    this.queueSource = null;
  }

  private async prepareAudioOutput(audio: HTMLAudioElement): Promise<void> {
    try {
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
        this.outputGain = this.audioContext.createGain();
        this.outputGain.connect(this.audioContext.destination);
      }
      if (!this.connectedAudio.has(audio)) {
        this.audioContext.createMediaElementSource(audio).connect(this.outputGain!);
        this.connectedAudio.add(audio);
      }
      audio.volume = 1;
      this.applyOutputGain();
      if (this.audioContext.state === 'suspended') await this.audioContext.resume();
    } catch {
      this.applyFallbackVolume(audio);
    }
  }

  private applyOutputGain(): void {
    const gain = this.outputEnabled ? dbToGain(this.outputDb) : 0;
    if (this.outputGain && this.audioContext) {
      this.outputGain.gain.setValueAtTime(gain, this.audioContext.currentTime);
      return;
    }
    this.applyFallbackVolume(this.audio);
    if (this.queuedAudio) this.applyFallbackVolume(this.queuedAudio);
  }

  private applyFallbackVolume(audio: HTMLAudioElement): void {
    audio.volume = this.outputEnabled ? Math.min(1, dbToGain(this.outputDb)) : 0;
  }
}

function dbToGain(db: number): number {
  return db <= -60 ? 0 : 10 ** (db / 20);
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(total / 60);
  const remainingSeconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}
