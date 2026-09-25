import { hookKeysNative } from '../../platform/native/HookKeysNative';

export type MetronomeClickSound = 1 | 2 | 3 | 4 | 5;

const MIN_BPM = 60;
const MAX_BPM = 300;
const BPM_STEP = 0.5;
const MAX_VOLUME = 1;
const LOOK_AHEAD_SECONDS = 0.75;
const SCHEDULER_INTERVAL_MS = 20;

export class MetronomeEngine {
  private audioContext: AudioContext | null = null;
  private clickBuffers: Record<1 | 2 | 3, AudioBuffer> | null = null;
  private click4Buffer: AudioBuffer | null = null;
  private click5Buffer: AudioBuffer | null = null;
  private click4Loading: Promise<AudioBuffer | null> | null = null;
  private click5Loading: Promise<AudioBuffer | null> | null = null;
  private masterGain: GainNode | null = null;
  private timer: number | null = null;
  private nextBeatTime = 0;
  private tapTimes: number[] = [];
  private bpm = 120;
  private volume = 1;
  private clickSound: MetronomeClickSound = 1;
  private accentEnabled = false;
  private doubleTimeEnabled = false;
  private timeSignatureNumerator = 4;
  private timeSignatureDenominator = 4;
  private beatIndex = 0;
  private running = false;
  private loopClockActive = false;
  private nativeSyncTimer: number | null = null;
  // Configurações do metrônomo precisam chegar ao motor na mesma ordem em que
  // foram produzidas. Sem esta fila, o comando mudo que inicia o relógio do
  // loop podia terminar depois do comando que libera o volume do Click.
  private nativeSyncQueue: Promise<void> = Promise.resolve();

  constructor(private readonly onStateChanged: () => void = () => {}) {}

  getBpm(): number { return this.bpm; }
  getVolume(): number { return this.volume; }
  getClickSound(): MetronomeClickSound { return this.clickSound; }
  isAccentEnabled(): boolean { return this.accentEnabled; }
  isDoubleTimeEnabled(): boolean { return this.doubleTimeEnabled; }
  getTimeSignatureNumerator(): number { return this.timeSignatureNumerator; }
  getTimeSignatureDenominator(): number { return this.timeSignatureDenominator; }
  isRunning(): boolean { return this.running; }

  syncNativeState(): Promise<void> {
    if (!hookKeysNative.isAvailable()) return Promise.resolve();
    if (this.nativeSyncTimer !== null) window.clearTimeout(this.nativeSyncTimer);
    this.nativeSyncTimer = null;
    return this.enqueueNativeConfig(this.nativeConfig());
  }

  setBpm(value: number): void {
    this.bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(value / BPM_STEP) * BPM_STEP));
    this.scheduleNativeSync();
    this.onStateChanged();
  }

  setVolume(value: number): void {
    this.volume = Math.min(MAX_VOLUME, Math.max(0, value));
    if (this.audioContext && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.audibleVolume(), this.audioContext.currentTime, 0.008);
    }
    this.scheduleNativeSync();
    this.onStateChanged();
  }

  setClickSound(value: MetronomeClickSound): void {
    this.clickSound = value;
    if ((value === 4 || value === 5) && !hookKeysNative.isAvailable()) {
      void this.loadSampledClickBuffer(value).then((buffer) => {
        if (buffer && this.clickSound === value && !this.clockActive()) this.previewClick();
      });
    } else if (!this.clockActive() && !hookKeysNative.isAvailable()) {
      this.previewClick();
    }
    this.scheduleNativeSync();
    this.onStateChanged();
  }

  setAccentEnabled(enabled: boolean): void {
    this.accentEnabled = enabled;
    this.scheduleNativeSync();
    this.onStateChanged();
  }

  setDoubleTimeEnabled(enabled: boolean): void {
    this.doubleTimeEnabled = enabled;
    this.beatIndex = 0;
    this.scheduleNativeSync();
    this.onStateChanged();
  }

  setTimeSignature(numerator: number, denominator: number): void {
    this.timeSignatureNumerator = Math.min(16, Math.max(1, Math.round(numerator)));
    this.timeSignatureDenominator = [2, 4, 8, 16].includes(Math.round(denominator))
      ? Math.round(denominator)
      : 4;
    this.beatIndex %= this.timeSignatureNumerator;
    this.scheduleNativeSync();
    this.onStateChanged();
  }

  tap(timestamp = performance.now()): number {
    const previous = this.tapTimes.at(-1);
    if (previous === undefined || timestamp - previous > 2_000) this.tapTimes = [];
    this.tapTimes.push(timestamp);
    this.tapTimes = this.tapTimes.slice(-6);
    if (this.tapTimes.length < 2) return this.bpm;
    const intervals = this.tapTimes.slice(1).map((time, index) => time - (this.tapTimes[index] ?? time));
    const average = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    this.setBpm(60_000 / average);
    return this.bpm;
  }

  toggle(): void {
    if (this.running) this.stop();
    else this.start();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    if (this.loopClockActive) {
      this.applyWebVolume();
      this.scheduleNativeSync(true);
      this.onStateChanged();
      return;
    }
    if (hookKeysNative.isAvailable()) {
      this.beatIndex = 0;
      this.scheduleNativeSync(true, true);
      this.onStateChanged();
      return;
    }
    this.restartWebClock();
    this.onStateChanged();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.loopClockActive) {
      this.applyWebVolume();
      this.scheduleNativeSync(true);
      this.onStateChanged();
      return;
    }
    this.stopClock();
    this.onStateChanged();
  }

  setLoopPlaybackActive(active: boolean, restart = false): void {
    if (this.loopClockActive === active && !(active && restart)) return;
    this.loopClockActive = active;
    if (active) {
      if (hookKeysNative.isAvailable()) this.scheduleNativeSync(true, true);
      else this.restartWebClock();
    } else if (this.running) {
      this.applyWebVolume();
      this.scheduleNativeSync(true);
    } else {
      this.stopClock();
    }
    this.onStateChanged();
  }

  /**
   * Arma e reinicia o relógio do loop sem passar pelo debounce normal das
   * alterações de configuração. O transporte aguarda esta Promise no player
   * nativo; no player web ela é chamada assim que o play foi confirmado.
   */
  async startLoopPlaybackClock(): Promise<void> {
    this.loopClockActive = true;
    if (hookKeysNative.isAvailable()) {
      if (this.nativeSyncTimer !== null) window.clearTimeout(this.nativeSyncTimer);
      this.nativeSyncTimer = null;
      await this.enqueueNativeConfig(this.nativeConfig(undefined, true));
    } else {
      this.restartWebClock();
    }
    this.onStateChanged();
  }

  private stopClock(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.scheduleNativeSync(true);
  }

  applySavedSettings(
    bpm: number,
    volume: number,
    clickSound: MetronomeClickSound,
    accentEnabled = false,
    doubleTimeEnabled = false,
    numerator = 4,
    denominator = 4,
  ): void {
    this.bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm / BPM_STEP) * BPM_STEP));
    this.volume = Math.min(MAX_VOLUME, Math.max(0, volume));
    this.clickSound = clickSound;
    if ((clickSound === 4 || clickSound === 5) && !hookKeysNative.isAvailable()) {
      void this.loadSampledClickBuffer(clickSound);
    }
    this.accentEnabled = accentEnabled;
    this.doubleTimeEnabled = doubleTimeEnabled;
    this.timeSignatureNumerator = Math.min(16, Math.max(1, Math.round(numerator)));
    this.timeSignatureDenominator = [2, 4, 8, 16].includes(Math.round(denominator))
      ? Math.round(denominator)
      : 4;
    if (this.audioContext && this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.audibleVolume(), this.audioContext.currentTime);
    }
    this.scheduleNativeSync();
    this.onStateChanged();
  }

  destroy(): void {
    // O desligamento precisa entrar depois de qualquer configuração nativa já
    // em voo. Enviá-lo diretamente deixava um comando antigo reativar o Click
    // depois de logout/troca de tela.
    this.running = false;
    this.loopClockActive = false;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    if (this.nativeSyncTimer !== null) window.clearTimeout(this.nativeSyncTimer);
    this.nativeSyncTimer = null;
    if (hookKeysNative.isAvailable()) {
      void this.enqueueNativeConfig(this.nativeConfig(false)).catch(() => undefined);
    }
    if (this.audioContext) void this.audioContext.close();
    this.audioContext = null;
    this.clickBuffers = null;
    this.click4Buffer = null;
    this.click5Buffer = null;
    this.click4Loading = null;
    this.click5Loading = null;
    this.masterGain = null;
  }

  private enqueueNativeConfig(config: ReturnType<MetronomeEngine['nativeConfig']>): Promise<void> {
    const result = this.nativeSyncQueue
      .catch(() => undefined)
      .then(() => hookKeysNative.configureMetronome(config));
    this.nativeSyncQueue = result.catch(() => undefined);
    return result;
  }

  private scheduleNativeSync(immediate = false, restart = false): void {
    if (!hookKeysNative.isAvailable()) return;
    if (this.nativeSyncTimer !== null) window.clearTimeout(this.nativeSyncTimer);
    this.nativeSyncTimer = window.setTimeout(() => {
      this.nativeSyncTimer = null;
      void this.enqueueNativeConfig(this.nativeConfig(undefined, restart)).catch(() => undefined);
    }, immediate ? 0 : 32);
  }

  private nativeConfig(enabled = this.clockActive(), restart = false) {
    return {
      enabled,
      bpm: this.bpm,
      volume: this.audibleVolume(),
      clickSound: this.clickSound,
      // Loops já trazem o próprio compasso. Durante a reprodução deles o
      // metrônomo é sempre reto; A-B volta a valer ao sair do loop.
      accentEnabled: this.accentEnabled && !this.loopClockActive,
      doubleTimeEnabled: this.doubleTimeEnabled,
      timeSignatureNumerator: this.timeSignatureNumerator,
      timeSignatureDenominator: this.timeSignatureDenominator,
      restart,
    };
  }

  private clockActive(): boolean { return this.running || this.loopClockActive; }

  private audibleVolume(): number { return this.running ? this.volume : 0; }

  private applyWebVolume(): void {
    if (this.audioContext && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.audibleVolume(), this.audioContext.currentTime, 0.008);
    }
  }

  private restartWebClock(): void {
    const context = this.getAudioContext();
    void context.resume();
    if (this.timer !== null) window.clearInterval(this.timer);
    this.beatIndex = 0;
    this.nextBeatTime = context.currentTime + 0.005;
    this.schedule();
    this.timer = window.setInterval(() => this.schedule(), SCHEDULER_INTERVAL_MS);
  }

  private previewClick(): void {
    const context = this.getAudioContext();
    void context.resume();
    this.createClick(context.currentTime + 0.01);
  }

  private schedule(): void {
    if (!this.clockActive()) return;
    const context = this.getAudioContext();
    while (this.nextBeatTime < context.currentTime + LOOK_AHEAD_SECONDS) {
      this.createClick(
        this.nextBeatTime,
        !this.loopClockActive && this.accentEnabled && this.beatIndex === 0,
      );
      this.nextBeatTime += 60 / this.bpm * (4 / this.timeSignatureDenominator)
        / (this.doubleTimeEnabled ? 2 : 1);
      const beatsPerMeasure = this.timeSignatureNumerator * (this.doubleTimeEnabled ? 2 : 1);
      this.beatIndex = (this.beatIndex + 1) % beatsPerMeasure;
    }
  }

  private createClick(at: number, accented = false): void {
    const context = this.getAudioContext();
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = this.clickSound === 5
      ? this.click5Buffer ?? this.getClickBuffers()[1]
      : this.clickSound === 4 ? this.click4Buffer ?? this.getClickBuffers()[1]
      : this.getClickBuffers()[this.clickSound];
    source.playbackRate.setValueAtTime(accented ? 1.28 : 1, at);
    gain.gain.setValueAtTime(accented ? 1.33 : 1, at);
    source.connect(gain).connect(this.getMasterGain());
    source.start(at);
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ latencyHint: 'interactive' });
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.setValueAtTime(this.audibleVolume(), this.audioContext.currentTime);
      this.masterGain.connect(this.audioContext.destination);
    }
    return this.audioContext;
  }

  private getMasterGain(): GainNode {
    this.getAudioContext();
    if (!this.masterGain) throw new Error('Metronome gain unavailable.');
    return this.masterGain;
  }

  private getClickBuffers(): Record<1 | 2 | 3, AudioBuffer> {
    if (this.clickBuffers) return this.clickBuffers;
    const context = this.getAudioContext();
    this.clickBuffers = {
      1: createClickBuffer(context, 1_350, 0.045, 'sine'),
      2: createClickBuffer(context, 1_900, 0.032, 'square'),
      3: createClickBuffer(context, 760, 0.072, 'triangle'),
    };
    return this.clickBuffers;
  }

  private loadClick4Buffer(): Promise<AudioBuffer | null> {
    if (this.click4Buffer) return Promise.resolve(this.click4Buffer);
    if (this.click4Loading) return this.click4Loading;
    const context = this.getAudioContext();
    const url = new URL('assets/loops/Click%204.wav', document.baseURI).toString();
    this.click4Loading = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`click_4_http_${response.status}`);
        return response.arrayBuffer();
      })
      .then((bytes) => context.decodeAudioData(bytes))
      .then((buffer) => {
        this.click4Buffer = buffer;
        return buffer;
      })
      .catch(() => null)
      .finally(() => { this.click4Loading = null; });
    return this.click4Loading;
  }

  private loadClick5Buffer(): Promise<AudioBuffer | null> {
    if (this.click5Buffer) return Promise.resolve(this.click5Buffer);
    if (this.click5Loading) return this.click5Loading;
    const context = this.getAudioContext();
    const url = new URL('assets/loops/Click%205.wav', document.baseURI).toString();
    this.click5Loading = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`click_5_http_${response.status}`);
        return response.arrayBuffer();
      })
      .then((bytes) => context.decodeAudioData(bytes))
      .then((buffer) => {
        this.click5Buffer = buffer;
        return buffer;
      })
      .catch(() => null)
      .finally(() => { this.click5Loading = null; });
    return this.click5Loading;
  }

  private loadSampledClickBuffer(sound: 4 | 5): Promise<AudioBuffer | null> {
    return sound === 4 ? this.loadClick4Buffer() : this.loadClick5Buffer();
  }
}

function createClickBuffer(
  context: AudioContext,
  frequency: number,
  duration: number,
  waveform: 'sine' | 'square' | 'triangle',
): AudioBuffer {
  const length = Math.max(1, Math.ceil(context.sampleRate * duration));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const samples = buffer.getChannelData(0);
  const attackSamples = Math.max(1, Math.floor(context.sampleRate * 0.0015));
  for (let index = 0; index < length; index += 1) {
    const time = index / context.sampleRate;
    const phase = 2 * Math.PI * frequency * time;
    const oscillator = waveform === 'sine'
      ? Math.sin(phase)
      : waveform === 'square'
        ? (Math.sin(phase) >= 0 ? 1 : -1)
        : (2 / Math.PI) * Math.asin(Math.sin(phase));
    const attack = Math.min(1, index / attackSamples);
    const decay = Math.exp(-7 * index / length);
    samples[index] = oscillator * attack * decay;
  }
  return buffer;
}
