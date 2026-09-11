import { hookKeysNative } from '../../platform/native/HookKeysNative';

export type MetronomeClickSound = 1 | 2 | 3;

const MIN_BPM = 60;
const MAX_BPM = 600;
const LOOK_AHEAD_SECONDS = 0.75;
const SCHEDULER_INTERVAL_MS = 20;

export class MetronomeEngine {
  private audioContext: AudioContext | null = null;
  private clickBuffers: Record<MetronomeClickSound, AudioBuffer> | null = null;
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
  private nativeSyncTimer: number | null = null;

  constructor(private readonly onStateChanged: () => void = () => {}) {}

  getBpm(): number { return this.bpm; }
  getVolume(): number { return this.volume; }
  getClickSound(): MetronomeClickSound { return this.clickSound; }
  isAccentEnabled(): boolean { return this.accentEnabled; }
  isDoubleTimeEnabled(): boolean { return this.doubleTimeEnabled; }
  getTimeSignatureNumerator(): number { return this.timeSignatureNumerator; }
  getTimeSignatureDenominator(): number { return this.timeSignatureDenominator; }
  isRunning(): boolean { return this.running; }

  syncNativeState(): void {
    this.scheduleNativeSync(true);
  }

  setBpm(value: number): void {
    this.bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(value)));
    this.scheduleNativeSync();
    this.onStateChanged();
  }

  setVolume(value: number): void {
    this.volume = Math.min(1, Math.max(0, value));
    if (this.audioContext && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.volume * 0.42, this.audioContext.currentTime, 0.008);
    }
    this.scheduleNativeSync();
    this.onStateChanged();
  }

  setClickSound(value: MetronomeClickSound): void {
    this.clickSound = value;
    if (!this.running && !hookKeysNative.isAvailable()) this.previewClick();
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
    if (hookKeysNative.isAvailable()) {
      this.running = true;
      this.beatIndex = 0;
      this.scheduleNativeSync(true);
      this.onStateChanged();
      return;
    }
    const context = this.getAudioContext();
    void context.resume();
    this.running = true;
    this.beatIndex = 0;
    this.nextBeatTime = context.currentTime + 0.03;
    this.schedule();
    this.timer = window.setInterval(() => this.schedule(), SCHEDULER_INTERVAL_MS);
    this.onStateChanged();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.scheduleNativeSync(true);
    this.onStateChanged();
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
    this.bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
    this.volume = Math.min(1, Math.max(0, volume));
    this.clickSound = clickSound;
    this.accentEnabled = accentEnabled;
    this.doubleTimeEnabled = doubleTimeEnabled;
    this.timeSignatureNumerator = Math.min(16, Math.max(1, Math.round(numerator)));
    this.timeSignatureDenominator = [2, 4, 8, 16].includes(Math.round(denominator))
      ? Math.round(denominator)
      : 4;
    if (this.audioContext && this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.volume * 0.42, this.audioContext.currentTime);
    }
    this.scheduleNativeSync();
    this.onStateChanged();
  }

  destroy(): void {
    this.stop();
    if (this.nativeSyncTimer !== null) window.clearTimeout(this.nativeSyncTimer);
    this.nativeSyncTimer = null;
    if (hookKeysNative.isAvailable()) {
      void hookKeysNative.configureMetronome(this.nativeConfig(false));
    }
    if (this.audioContext) void this.audioContext.close();
    this.audioContext = null;
    this.clickBuffers = null;
    this.masterGain = null;
  }

  private scheduleNativeSync(immediate = false): void {
    if (!hookKeysNative.isAvailable()) return;
    if (this.nativeSyncTimer !== null) window.clearTimeout(this.nativeSyncTimer);
    this.nativeSyncTimer = window.setTimeout(() => {
      this.nativeSyncTimer = null;
      void hookKeysNative.configureMetronome(this.nativeConfig());
    }, immediate ? 0 : 32);
  }

  private nativeConfig(enabled = this.running) {
    return {
      enabled,
      bpm: this.bpm,
      volume: this.volume,
      clickSound: this.clickSound,
      accentEnabled: this.accentEnabled,
      doubleTimeEnabled: this.doubleTimeEnabled,
      timeSignatureNumerator: this.timeSignatureNumerator,
    };
  }

  private previewClick(): void {
    const context = this.getAudioContext();
    void context.resume();
    this.createClick(context.currentTime + 0.01);
  }

  private schedule(): void {
    if (!this.running) return;
    const context = this.getAudioContext();
    while (this.nextBeatTime < context.currentTime + LOOK_AHEAD_SECONDS) {
      this.createClick(this.nextBeatTime, this.accentEnabled && this.beatIndex === 0);
      this.nextBeatTime += 60 / this.bpm / (this.doubleTimeEnabled ? 2 : 1);
      const beatsPerMeasure = this.timeSignatureNumerator * (this.doubleTimeEnabled ? 2 : 1);
      this.beatIndex = (this.beatIndex + 1) % beatsPerMeasure;
    }
  }

  private createClick(at: number, accented = false): void {
    const context = this.getAudioContext();
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = this.getClickBuffers()[this.clickSound];
    source.playbackRate.setValueAtTime(accented ? 1.28 : 1, at);
    gain.gain.setValueAtTime(accented ? 1.33 : 1, at);
    source.connect(gain).connect(this.getMasterGain());
    source.start(at);
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ latencyHint: 'interactive' });
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.setValueAtTime(this.volume * 0.42, this.audioContext.currentTime);
      this.masterGain.connect(this.audioContext.destination);
    }
    return this.audioContext;
  }

  private getMasterGain(): GainNode {
    this.getAudioContext();
    if (!this.masterGain) throw new Error('Metronome gain unavailable.');
    return this.masterGain;
  }

  private getClickBuffers(): Record<MetronomeClickSound, AudioBuffer> {
    if (this.clickBuffers) return this.clickBuffers;
    const context = this.getAudioContext();
    this.clickBuffers = {
      1: createClickBuffer(context, 1_350, 0.045, 'sine'),
      2: createClickBuffer(context, 1_900, 0.032, 'square'),
      3: createClickBuffer(context, 760, 0.072, 'triangle'),
    };
    return this.clickBuffers;
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
