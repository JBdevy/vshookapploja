import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface NativeMidiDevice {
  id: string;
  name: string;
}

export interface NativeModuleConfig {
  moduleIndex: number;
  enabled: boolean;
  inputSlot: number;
  lowNote: number;
  highNote: number;
  octave: number;
  sustain: boolean;
  modulation: boolean;
  volumeDb: number;
}

export interface NativeModuleEffectsConfig {
  moduleIndex: number;
  cutoffHz: number;
  eqTypes: number[];
  eqFrequencies: number[];
  eqGains: number[];
  eqQualities: number[];
  eqCutStages: number[];
  compressorThresholdDb: number;
  compressorRatio: number;
  compressorAttackMs: number;
  compressorReleaseMs: number;
  compressorGainDb: number;
  compressorMix: number;
  delaySync: boolean;
  delayMs: number;
  delayBeatMultiplier: number;
  delayFeedback: number;
  delayMix: number;
  reverbDecay: number;
  reverbDampen: number;
  reverbSize: number;
  reverbMix: number;
}

export interface NativeModuleEnvelopeConfig {
  moduleIndex: number;
  attackMs: number;
  holdMs: number;
  decayMs: number;
  releaseMs: number;
}

interface NativeMidiNoteEvent {
  channel: number;
  inputId: string;
  noteNumber: number;
  velocity: number;
}

interface NativeMidiControlChangeEvent {
  channel: number;
  inputId: string;
  controller: number;
  value: number;
}

interface HookKeysNativePlugin {
  initialize(options: { bufferSize: number }): Promise<{ ready: boolean }>;
  listMidiDevices(): Promise<{ devices: NativeMidiDevice[] }>;
  setMidiInputs(options: { deviceIds: Array<string | null> }): Promise<void>;
  configureModule(options: NativeModuleConfig): Promise<void>;
  configureModuleEffects(options: NativeModuleEffectsConfig): Promise<void>;
  configureModuleEnvelope(options: NativeModuleEnvelopeConfig): Promise<void>;
  sendMidi(options: { inputSlot: number; status: number; data1: number; data2: number }): Promise<void>;
  setTempo(options: { bpm: number }): Promise<void>;
  setOutputGain(options: { db: number; enabled: boolean }): Promise<void>;
  setCompatibilityMode(options: { enabled: boolean }): Promise<void>;
  stopAllNotes(): Promise<void>;
  performHaptic(options: { strength: 'light' | 'medium' }): Promise<void>;
  beginSoundFontUpload(options: { moduleIndex: number }): Promise<void>;
  appendSoundFontChunk(options: { moduleIndex: number; base64: string }): Promise<void>;
  finishSoundFontUpload(options: { moduleIndex: number }): Promise<void>;
  addListener(eventName: 'midiNote', listener: (event: NativeMidiNoteEvent) => void): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'midiControlChange',
    listener: (event: NativeMidiControlChangeEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(eventName: 'midiDevicesChanged', listener: () => void): Promise<PluginListenerHandle>;
}

const plugin = registerPlugin<HookKeysNativePlugin>('HookKeysNative');
const SOUNDFONT_CHUNK_BYTES = 384 * 1024;

class HookKeysNativeBridge {
  private initializePromise: Promise<boolean> | null = null;
  private listenersPromise: Promise<void> | null = null;
  private readonly moduleConfigKeys: (string | null)[] = Array.from({ length: 8 }, () => null);
  private readonly moduleEffectsKeys: (string | null)[] = Array.from({ length: 8 }, () => null);
  private readonly moduleEnvelopeKeys: (string | null)[] = Array.from({ length: 8 }, () => null);
  private lastTempo: number | null = null;
  private lastOutputGainKey: string | null = null;
  private lastCompatibilityMode: boolean | null = null;

  isAvailable(): boolean {
    return Capacitor.isNativePlatform();
  }

  initialize(bufferSize = 128): Promise<boolean> {
    if (!this.isAvailable()) return Promise.resolve(false);
    if (!this.initializePromise) {
      this.initializePromise = plugin.initialize({ bufferSize })
        .then(({ ready }) => ready)
        .catch(() => false);
      void this.attachEventForwarders();
    }
    return this.initializePromise;
  }

  async listMidiDevices(): Promise<NativeMidiDevice[]> {
    if (!await this.initialize()) return [];
    const { devices } = await plugin.listMidiDevices();
    return Array.isArray(devices) ? devices : [];
  }

  async setMidiInputs(deviceIds: readonly (string | null)[]): Promise<void> {
    if (!await this.initialize()) return;
    await plugin.setMidiInputs({ deviceIds: [...deviceIds].slice(0, 3) });
  }

  async sendMidi(inputSlot: number, status: number, data1: number, data2: number): Promise<void> {
    if (!await this.initialize()) return;
    await plugin.sendMidi({ inputSlot, status, data1, data2 });
  }

  async configureModule(config: NativeModuleConfig): Promise<void> {
    if (!await this.initialize()) return;
    const key = JSON.stringify(config);
    if (this.moduleConfigKeys[config.moduleIndex] === key) return;
    await plugin.configureModule(config);
    this.moduleConfigKeys[config.moduleIndex] = key;
  }

  async configureModuleEffects(config: NativeModuleEffectsConfig): Promise<void> {
    if (!await this.initialize()) return;
    const key = JSON.stringify(config);
    if (this.moduleEffectsKeys[config.moduleIndex] === key) return;
    await plugin.configureModuleEffects(config);
    this.moduleEffectsKeys[config.moduleIndex] = key;
  }

  async configureModuleEnvelope(config: NativeModuleEnvelopeConfig): Promise<void> {
    if (!await this.initialize()) return;
    const key = JSON.stringify(config);
    if (this.moduleEnvelopeKeys[config.moduleIndex] === key) return;
    await plugin.configureModuleEnvelope(config);
    this.moduleEnvelopeKeys[config.moduleIndex] = key;
  }

  async setTempo(bpm: number): Promise<void> {
    if (!await this.initialize()) return;
    if (this.lastTempo === bpm) return;
    await plugin.setTempo({ bpm });
    this.lastTempo = bpm;
  }

  async setOutputGain(db: number, enabled: boolean): Promise<void> {
    if (!await this.initialize()) return;
    const key = `${db}:${enabled}`;
    if (this.lastOutputGainKey === key) return;
    await plugin.setOutputGain({ db, enabled });
    this.lastOutputGainKey = key;
  }

  async setCompatibilityMode(enabled: boolean): Promise<void> {
    if (!await this.initialize()) return;
    if (this.lastCompatibilityMode === enabled) return;
    await plugin.setCompatibilityMode({ enabled });
    this.lastCompatibilityMode = enabled;
  }

  async stopAllNotes(): Promise<void> {
    if (!this.isAvailable()) return;
    await plugin.stopAllNotes();
  }

  async performHaptic(strength: 'light' | 'medium'): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      await plugin.performHaptic({ strength });
      return true;
    } catch {
      return false;
    }
  }

  async loadSoundFont(moduleIndex: number, file: Blob): Promise<void> {
    if (!await this.initialize()) throw new Error('native_engine_unavailable');
    await plugin.beginSoundFontUpload({ moduleIndex });
    for (let offset = 0; offset < file.size; offset += SOUNDFONT_CHUNK_BYTES) {
      const bytes = new Uint8Array(await file.slice(offset, offset + SOUNDFONT_CHUNK_BYTES).arrayBuffer());
      await plugin.appendSoundFontChunk({ moduleIndex, base64: bytesToBase64(bytes) });
    }
    await plugin.finishSoundFontUpload({ moduleIndex });
  }

  private attachEventForwarders(): Promise<void> {
    if (this.listenersPromise) return this.listenersPromise;
    this.listenersPromise = Promise.all([
      plugin.addListener('midiNote', (event) => {
        window.dispatchEvent(new CustomEvent('hookkeys:native-midi-note', { detail: event }));
      }),
      plugin.addListener('midiControlChange', (event) => {
        window.dispatchEvent(new CustomEvent('hookkeys:native-midi-control-change', { detail: event }));
      }),
      plugin.addListener('midiDevicesChanged', () => {
        window.dispatchEvent(new Event('hookkeys:native-midi-devices-changed'));
      }),
    ]).then(() => undefined);
    return this.listenersPromise;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const segmentSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += segmentSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + segmentSize));
  }
  return btoa(binary);
}

export const hookKeysNative = new HookKeysNativeBridge();
