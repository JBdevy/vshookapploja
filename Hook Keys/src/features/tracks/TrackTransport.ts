import { type LocalTrack, TrackLibraryStore } from './TrackLibraryStore';
import { LongPressGesture } from '../../shared/gestures/LongPressGesture';
import { isDesktopRuntime } from '../../platform/runtime';
import type { NativeTrackPlayer, NativeTrackSource } from './NativeTrackPlayer';
import { isTempoSyncedLoopTrack } from './BundledLoops';

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
  loopPlaying: boolean;
  state: TrackPlaybackState;
}

export const TRACK_WAVEFORM_BARS = 96;
export const SEEK_LOCKED_MESSAGE = 'Não é possível mover a posição com a música reproduzindo.';

// Picos normalizados (0-1) de cada faixa da música, para desenhar a waveform.
export function waveformPeaksFromChannels(channels: readonly Float32Array[], count: number): number[] {
  const length = channels[0]?.length ?? 0;
  if (!length || count <= 0) return [];
  const bucket = Math.max(1, Math.floor(length / count));
  // Ler cada amostra de uma música inteira pesa no aparelho antigo; umas
  // centenas por faixa já desenham o mesmo contorno.
  const stride = Math.max(1, Math.floor(bucket / 256));
  const peaks = Array.from({ length: count }, (_, index) => {
    const start = index * bucket;
    const end = Math.min(length, start + bucket);
    let peak = 0;
    for (const channel of channels) {
      for (let sample = start; sample < end; sample += stride) {
        const value = Math.abs(channel[sample] ?? 0);
        if (value > peak) peak = value;
      }
    }
    return peak;
  });
  const loudest = Math.max(...peaks);
  return loudest > 0 ? peaks.map((peak) => Math.round((peak / loudest) * 1000) / 1000) : peaks.map(() => 0);
}

export function createTrackTransportMarkup(): string {
  return `
    <section class="track-transport" aria-label="Transporte da música">
      <button type="button" data-transport-action="play-stop" disabled>Play</button>
      <button class="track-transport__name" type="button" data-transport-track-name disabled><span>Nenhuma música selecionada</span></button>
      <output data-transport-remaining aria-label="Tempo restante">00:00</output>
      <span class="track-transport__progress" data-top-transport-progress aria-hidden="true"><i></i></span>
    </section>
  `;
}

// Web: HTMLAudioElement. App iOS: a mesma interface tocando dentro do motor.
type TrackAudio = HTMLAudioElement | NativeTrackSource;

export class TrackTransportController {
  private audio: TrackAudio;
  private readonly handleClick = (event: Event) => this.onClick(event);
  private readonly handleInput = (event: Event) => this.onInput(event);
  private readonly handleLoadedMetadata = () => this.onLoadedMetadata();
  private readonly handleTimeUpdate = () => this.renderTimeline();
  private readonly handleEnded = () => this.onEnded();
  private readonly handleError = () => this.onAudioError();
  private readonly handlePointerDown = (event: PointerEvent) => this.onPointerDown(event);
  private readonly handlePointerMove = (event: PointerEvent) => {
    this.nameHoldGesture.move(event);
    this.moveNeedleDrag(event);
  };
  private readonly handlePointerEnd = (event: PointerEvent) => {
    this.nameHoldGesture.end(event);
    this.endNeedleDrag(event);
  };
  private needleDrag: { pointerId: number; waveform: HTMLElement } | null = null;
  private readonly handleContextMenu = (event: MouseEvent) => this.onContextMenu(event);
  private readonly nameHoldGesture = new LongPressGesture(620);
  private objectUrl: string | null = null;
  private queuedAudio: TrackAudio | null = null;
  private queuedObjectUrl: string | null = null;
  private selectedTrack: LocalTrack | null = null;
  private queuedTrack: LocalTrack | null = null;
  private queueSource: TrackQueueSource | null = null;
  private autoQueueSuppressedForTrackId: string | null = null;
  private state: TrackPlaybackState = 'empty';
  private loadSequence = 0;
  private queueSequence = 0;
  private autoplayPending = false;
  private loopEnabled = false;
  private tempoBpm = 120;
  private outputDb = 0;
  private outputEnabled = true;
  private audioContext: AudioContext | null = null;
  private outputGain: GainNode | null = null;
  private outputAnalysers: readonly [AnalyserNode, AnalyserNode] | null = null;
  private readonly meterBuffers: readonly [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] = [
    new Float32Array(new ArrayBuffer(2048 * 4)), new Float32Array(new ArrayBuffer(2048 * 4)),
  ];
  private readonly connectedAudio = new WeakSet<HTMLAudioElement>();
  private renderedTrackName = '';
  private readonly waveformPeaks = new Map<string, Promise<number[] | null>>();
  private seekNoticeTimer: number | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly library: TrackLibraryStore,
    private readonly onPlaybackChanged: (snapshot: TrackPlaybackSnapshot) => void,
    private readonly onMessage: (message: string) => void,
    private readonly onPositionRequested: (trigger: HTMLElement) => void,
    private readonly nativeTracks: NativeTrackPlayer | null = null,
    private readonly onLoopPlaybackStarting: () => void = () => {},
  ) {
    this.audio = this.createAudio();
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
    this.outputAnalysers = null;
    this.audioContext = null;
  }

  setOutputLevel(db: number, enabled: boolean): void {
    this.outputDb = Math.min(0, Math.max(-90, db));
    this.outputEnabled = enabled;
    this.applyOutputGain();
  }

  // Repetir: a música atual volta ao início e ganha do Auto. Uma próxima
  // escolhida à mão continua entrando quando a atual acaba.
  setLoopEnabled(enabled: boolean): void {
    this.loopEnabled = enabled;
    this.applyLoop();
  }

  setTempoBpm(bpm: number): void {
    this.tempoBpm = Math.min(300, Math.max(60, Math.round(bpm * 2) / 2));
    this.applyPlaybackRate(this.audio, this.selectedTrack);
    if (this.queuedAudio) this.applyPlaybackRate(this.queuedAudio, this.queuedTrack);
  }

  private applyLoop(): void {
    this.audio.loop = isTempoSyncedLoopTrack(this.selectedTrack)
      || (this.loopEnabled && this.queueSource !== 'manual');
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
      loopPlaying: this.state === 'playing' && isTempoSyncedLoopTrack(this.selectedTrack),
      state: this.state,
    };
  }

  refreshView(): void {
    this.render();
  }

  async selectTrack(track: LocalTrack): Promise<void> {
    if (track.id === this.selectedTrack?.id && this.state !== 'empty') {
      this.selectedTrack = track;
      this.applyPlaybackRate(this.audio, track);
      this.render();
      return;
    }
    // Loop é acompanhamento imediato, não uma próxima música. Entrar ou sair
    // de uma playlist de loop troca a fonte agora, inclusive se o mesmo item
    // já tiver sido preparado como próximo; assim ele não pisca e volta.
    if (isTempoSyncedLoopTrack(track) || isTempoSyncedLoopTrack(this.selectedTrack)) {
      await this.loadCurrentTrack(track, this.state === 'playing' || this.state === 'paused');
      return;
    }
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
      this.queuedAudio = this.createAudio();
      this.queuedAudio.preload = 'auto';
      this.queuedObjectUrl = this.attachFile(this.queuedAudio, track, file);
      this.applyPlaybackRate(this.queuedAudio, track);
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
    const lockedWaveform = target instanceof Element
      ? target.closest<HTMLElement>('.waveform-position.is-locked')
      : null;
    if (lockedWaveform) {
      event.preventDefault();
      this.showSeekLockedNotice(lockedWaveform);
      return;
    }
    // A agulha segue o dedo pela waveform inteira: no iOS o cursor nativo do
    // range só arrastava acertando em cheio o traço invisível.
    const waveform = target instanceof Element
      ? target.closest<HTMLElement>('.waveform-position')
      : null;
    if (waveform && this.selectedTrack && this.hasDuration() && this.state !== 'loading') {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      this.needleDrag = { pointerId: event.pointerId, waveform };
      try {
        waveform.setPointerCapture(event.pointerId);
      } catch {
        // Sem captura o arraste continua pelos eventos da raiz.
      }
      this.seekToWaveformPoint(waveform, event.clientX);
      return;
    }
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
      if (this.state === 'playing') {
        const waveform = input.closest<HTMLElement>('.waveform-position');
        if (waveform) this.showSeekLockedNotice(waveform);
      }
      this.renderTimeline();
      return;
    }
    this.audio.currentTime = (Number(input.value) / 1000) * this.audio.duration;
    this.renderTimeline();
  }

  async togglePlayStop(): Promise<void> {
    if (!this.selectedTrack || this.state === 'loading' || !this.audio.src) return;
    if (this.state === 'playing' || this.state === 'paused') {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.state = 'stopped';
      this.clearQueuedTrack();
      this.render();
      return;
    }
    await this.startPlayback();
  }

  async playFromCurrentPosition(): Promise<void> {
    if (!this.selectedTrack || this.state === 'loading' || this.state === 'playing' || !this.audio.src) return;
    await this.startPlayback();
  }

  // Desktop/Android tocam a Playlist no WebAudio, não no motor nativo.
  // Cada canal mede o sinal após o ganho sem mexer no caminho audível.
  getOutputPeaks(): [number, number] {
    if (!this.outputAnalysers || this.audioContext?.state !== 'running') return [0, 0];
    return this.outputAnalysers.map((analyser, channel) => {
      const samples = this.meterBuffers[channel]!;
      analyser.getFloatTimeDomainData(samples);
      let peak = 0;
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
      return peak;
    }) as [number, number];
  }

  stop(): void {
    this.autoplayPending = false;
    this.loadSequence += 1;
    this.audio.pause();
    if (this.audio.src) this.audio.currentTime = 0;
    if (this.selectedTrack) this.state = 'stopped';
    this.clearQueuedTrack();
    this.render();
  }

  removeTracks(trackIds: readonly string[]): void {
    const removed = new Set(trackIds);
    if (this.queuedTrack && removed.has(this.queuedTrack.id)) this.clearQueuedTrack();
    if (!this.selectedTrack || !removed.has(this.selectedTrack.id)) {
      this.render();
      return;
    }
    this.autoplayPending = false;
    this.loadSequence += 1;
    this.audio.pause();
    this.releaseCurrentSource();
    this.selectedTrack = null;
    this.autoQueueSuppressedForTrackId = null;
    this.state = 'empty';
    this.render();
  }

  private async startPlayback(): Promise<void> {
    if (this.hasDuration() && this.audio.currentTime >= this.audio.duration) this.audio.currentTime = 0;
    try {
      await this.prepareAudioOutput(this.audio);
      if (isTempoSyncedLoopTrack(this.selectedTrack)) this.onLoopPlaybackStarting();
      await this.audio.play();
      this.state = 'playing';
      this.render();
    } catch {
      this.onMessage('Não foi possível reproduzir essa música.');
      this.render();
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
      this.objectUrl = this.attachFile(this.audio, track, file);
      this.applyPlaybackRate(this.audio, track);
      if (autoplay) {
        if (isTempoSyncedLoopTrack(track)) this.onLoopPlaybackStarting();
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

    if (!preparedAudio || (!preparedUrl && !this.nativeTracks)) {
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
    this.applyPlaybackRate(this.audio, track);
    this.render();
    try {
      await this.prepareAudioOutput(this.audio);
      if (isTempoSyncedLoopTrack(track)) this.onLoopPlaybackStarting();
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
    this.applyLoop();
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
    this.applyLoop();
    const progress = this.root.querySelector<HTMLInputElement>('[data-transport-progress]');
    const remaining = this.root.querySelector<HTMLOutputElement>('[data-transport-remaining]');
    const ready = Boolean(this.selectedTrack) && this.state !== 'loading' && this.hasDuration();
    const ratio = this.currentProgress();
    this.root.querySelector<HTMLElement>('[data-top-transport-progress]')
      ?.style.setProperty('--track-progress-ratio', String(ratio));
    if (progress) {
      progress.value = String(Math.round(ratio * 1000));
      // Tocando, a agulha fica travada mas o toque continua chegando: quem
      // tenta mover recebe o aviso em vez de um controle mudo.
      progress.disabled = !ready;
      progress.setAttribute('aria-disabled', String(this.state === 'playing'));
      progress.style.setProperty('--track-progress', `${ratio * 100}%`);
      const waveform = progress.closest<HTMLElement>('.waveform-position');
      waveform?.style.setProperty('--track-progress', `${ratio * 100}%`);
      waveform?.style.setProperty('--track-ratio', String(ratio));
      waveform?.classList.toggle('is-locked', this.state === 'playing');
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

  // Picos da música selecionada. Decodificar a música inteira é o trabalho
  // pesado, então roda uma vez por música e o resultado fica guardado.
  loadWaveformPeaks(count = TRACK_WAVEFORM_BARS): Promise<number[] | null> {
    const track = this.selectedTrack;
    if (!track) return Promise.resolve(null);
    const key = `${track.id}:${count}`;
    let pending = this.waveformPeaks.get(key);
    if (!pending) {
      pending = this.decodeWaveformPeaks(track.id, count).catch(() => null);
      this.waveformPeaks.set(key, pending);
    }
    return pending;
  }

  private async decodeWaveformPeaks(trackId: string, count: number): Promise<number[] | null> {
    const storageKey = `hookkeys.waveform.${trackId}.${count}`;
    try {
      const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? 'null') as unknown;
      if (Array.isArray(stored) && stored.length === count) return stored.map(Number);
    } catch {
      // Sem cache: decodifica abaixo.
    }
    const OfflineContext = (window as unknown as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext;
    if (!OfflineContext) return null;
    const file = await this.library.getFile(trackId);
    if (!file) return null;
    // Offline: decodificar não mexe na sessão de áudio que toca a música.
    const decoded = await new OfflineContext(1, 1, 44_100).decodeAudioData(await file.arrayBuffer());
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index));
    const peaks = waveformPeaksFromChannels(channels, count);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(peaks));
    } catch {
      // Sem espaço: a waveform continua valendo nesta sessão.
    }
    return peaks;
  }

  private moveNeedleDrag(event: PointerEvent): void {
    if (this.needleDrag?.pointerId !== event.pointerId) return;
    event.preventDefault();
    this.seekToWaveformPoint(this.needleDrag.waveform, event.clientX);
  }

  private endNeedleDrag(event: PointerEvent): void {
    const drag = this.needleDrag;
    if (drag?.pointerId !== event.pointerId) return;
    this.needleDrag = null;
    try {
      if (drag.waveform.hasPointerCapture(event.pointerId)) drag.waveform.releasePointerCapture(event.pointerId);
    } catch {
      // Captura já liberada.
    }
  }

  // Mesma geometria da agulha: 12 px de margem de cada lado.
  private seekToWaveformPoint(waveform: HTMLElement, clientX: number): void {
    if (this.state === 'playing') {
      this.needleDrag = null;
      this.showSeekLockedNotice(waveform);
      return;
    }
    if (!this.hasDuration()) return;
    const rect = waveform.getBoundingClientRect();
    const usable = rect.width - 24;
    if (usable <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left - 12) / usable));
    this.audio.currentTime = ratio * this.audio.duration;
    this.renderTimeline();
  }

  private showSeekLockedNotice(waveform: HTMLElement): void {
    let notice = waveform.querySelector<HTMLElement>('[data-waveform-notice]');
    if (!notice) {
      notice = document.createElement('div');
      notice.className = 'waveform-position__notice';
      notice.dataset.waveformNotice = '';
      notice.setAttribute('role', 'status');
      waveform.append(notice);
    }
    notice.textContent = SEEK_LOCKED_MESSAGE;
    notice.hidden = false;
    if (this.seekNoticeTimer !== null) window.clearTimeout(this.seekNoticeTimer);
    this.seekNoticeTimer = window.setTimeout(() => {
      this.seekNoticeTimer = null;
      if (notice) notice.hidden = true;
    }, 2_200);
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

  private createAudio(): TrackAudio {
    return this.nativeTracks?.createSource() ?? new Audio();
  }

  // Web: devolve a URL do arquivo para liberar depois. Nativo: o motor lê o arquivo.
  private attachFile(audio: TrackAudio, track: LocalTrack, file: Blob): string | null {
    if (!(audio instanceof HTMLAudioElement)) {
      audio.open(track, file);
      return null;
    }
    const url = URL.createObjectURL(file);
    audio.src = url;
    audio.load();
    return url;
  }

  private applyPlaybackRate(audio: TrackAudio, track: LocalTrack | null): void {
    const sourceBpm = track?.loopSourceBpm;
    const tempoSynced = Number.isFinite(sourceBpm) && (sourceBpm ?? 0) > 0;
    const rate = tempoSynced
      ? this.tempoBpm / (sourceBpm ?? 120)
      : 1;
    // Varispeed mantém navegador/Android e o motor nativo do iOS com o mesmo
    // resultado; músicas normais nunca saem de 1x.
    if (audio instanceof HTMLAudioElement) audio.preservesPitch = !tempoSynced;
    audio.playbackRate = Math.min(2.5, Math.max(0.5, rate));
  }

  private async prepareAudioOutput(audio: TrackAudio): Promise<void> {
    // No motor, volume e saída das músicas são configurados pelo PlayerScreen.
    if (!(audio instanceof HTMLAudioElement)) return;
    try {
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
        this.outputGain = this.audioContext.createGain();
        this.outputGain.connect(this.audioContext.destination);
        const splitter = this.audioContext.createChannelSplitter(2);
        const silentTap = this.audioContext.createGain();
        silentTap.gain.value = 0;
        const left = this.audioContext.createAnalyser();
        const right = this.audioContext.createAnalyser();
        left.fftSize = right.fftSize = 2048;
        this.outputGain.connect(splitter);
        splitter.connect(left, 0);
        splitter.connect(right, 1);
        left.connect(silentTap);
        right.connect(silentTap);
        silentTap.connect(this.audioContext.destination);
        this.outputAnalysers = [left, right];
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
    if (this.nativeTracks) return;
    const gain = this.outputEnabled ? dbToGain(this.outputDb) : 0;
    if (this.outputGain && this.audioContext) {
      this.outputGain.gain.cancelScheduledValues(this.audioContext.currentTime);
      this.outputGain.gain.setTargetAtTime(gain, this.audioContext.currentTime, 0.005);
      return;
    }
    this.applyFallbackVolume(this.audio);
    if (this.queuedAudio) this.applyFallbackVolume(this.queuedAudio);
  }

  private applyFallbackVolume(audio: TrackAudio): void {
    audio.volume = this.outputEnabled ? Math.min(1, dbToGain(this.outputDb)) : 0;
  }
}

function dbToGain(db: number): number {
  return db <= -90 ? 0 : 10 ** (db / 20);
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(total / 60);
  const remainingSeconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}
