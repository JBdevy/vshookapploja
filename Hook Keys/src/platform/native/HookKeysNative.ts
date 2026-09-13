import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface NativeMidiDevice {
  id: string;
  name: string;
}

export interface NativeAudioOutputDevice {
  id: string;
  name: string;
  channels: number;
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
  polyphony: number;
  velocityCurve0: number;
  velocityCurve1: number;
  velocityCurve2: number;
  velocityCurve3: number;
  velocityCurve4: number;
  outputChannelStart: number;
  outputChannelCount: 1 | 2;
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
  rotaryEnabled: boolean;
  rotarySpeed: number;
  rotarySlowHz: number;
  rotaryFastHz: number;
  rotaryRampSeconds: number;
  rotaryDepth: number;
  rotaryMix: number;
  rotaryModulationEnabled: boolean;
}

export interface NativeModuleEnvelopeConfig {
  moduleIndex: number;
  attackMs: number;
  holdMs: number;
  decayMs: number;
  releaseMs: number;
}

export interface NativeSynthConfig {
  oscillator1: number;
  oscillator2: number;
  oscillator1Enabled: boolean;
  oscillator2Enabled: boolean;
  voiceMode: number;
  lfoTarget: number;
  oscillator1Volume: number;
  oscillator2Volume: number;
  detuneCents: number;
  attackMs: number;
  holdMs: number;
  decayMs: number;
  sustain: number;
  releaseMs: number;
  filterCutoffHz: number;
  filterResonance: number;
  filterEnvelope: number;
  lfoRateHz: number;
  lfoDepth: number;
  glideMs: number;
  oscillator1Octave: number;
  oscillator2Octave: number;
}

export interface NativeMetronomeConfig {
  enabled: boolean;
  bpm: number;
  volume: number;
  clickSound: 1 | 2 | 3;
  accentEnabled: boolean;
  doubleTimeEnabled: boolean;
  timeSignatureNumerator: number;
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

interface NativeMidiPitchBendEvent {
  channel: number;
  inputId: string;
  value: number;
}

interface HookKeysNativePlugin {
  initialize(options: { bufferSize: number }): Promise<{ ready: boolean }>;
  listMidiDevices(): Promise<{ devices: NativeMidiDevice[] }>;
  listAudioOutputDevices(): Promise<{ devices: NativeAudioOutputDevice[] }>;
  setAudioOutputDevice(options: { deviceId: string; channels: number; bufferSize: number }): Promise<void>;
  setMidiInputs(options: { deviceIds: Array<string | null> }): Promise<void>;
  configureModule(options: NativeModuleConfig): Promise<void>;
  configureModuleEffects(options: NativeModuleEffectsConfig): Promise<void>;
  configureModuleEnvelope(options: NativeModuleEnvelopeConfig): Promise<void>;
  configureSynth(options: NativeSynthConfig): Promise<void>;
  sendMidi(options: { inputSlot: number; status: number; data1: number; data2: number }): Promise<void>;
  setTempo(options: { bpm: number }): Promise<void>;
  configureMetronome(options: NativeMetronomeConfig): Promise<void>;
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
  addListener(eventName: 'midiPitchBend', listener: (event: NativeMidiPitchBendEvent) => void): Promise<PluginListenerHandle>;
}

const plugin = registerPlugin<HookKeysNativePlugin>('HookKeysNative');
const SOUNDFONT_CHUNK_BYTES = 384 * 1024;

class HookKeysNativeBridge {
  private initializePromise: Promise<boolean> | null = null;
  private listenersPromise: Promise<void> | null = null;
  private readonly moduleConfigKeys: (string | null)[] = Array.from({ length: 8 }, () => null);
  private readonly moduleEffectsKeys: (string | null)[] = Array.from({ length: 8 }, () => null);
  private readonly moduleEnvelopeKeys: (string | null)[] = Array.from({ length: 8 }, () => null);
  private lastSynthKey: string | null = null;
  private lastTempo: number | null = null;
  private lastMetronomeKey: string | null = null;
  private lastOutputGainKey: string | null = null;
  private lastCompatibilityMode: boolean | null = null;
  private lastAudioDeviceKey: string | null = null;

  isAvailable(): boolean {
    return Capacitor.isNativePlatform() || this.tauriInvoke() !== null;
  }

  initialize(bufferSize = 128): Promise<boolean> {
    if (!this.isAvailable()) return Promise.resolve(false);
    if (!this.initializePromise) {
      this.initializePromise = this.call<{ ready: boolean }>('initialize', { bufferSize }, () => plugin.initialize({ bufferSize }))
        .then(({ ready }) => {
          // initialize já abre a saída padrão com dois canais. Registrar essa
          // rota evita destruir e recriar o stream imediatamente durante o
          // boot — em Android, iOS e drivers exclusivos do desktop essa
          // segunda abertura podia deixar o motor sem uma saída ativa.
          if (ready && this.lastAudioDeviceKey === null) {
            this.lastAudioDeviceKey = `:2:${bufferSize}`;
          }
          return ready;
        })
        .catch(() => {
          // Uma saída de áudio pode estar temporariamente ocupada durante o
          // boot. Não memorize a falha: a próxima nota/alteração pode tentar
          // iniciar o motor novamente.
          this.initializePromise = null;
          return false;
        });
      void this.attachEventForwarders();
    }
    return this.initializePromise;
  }

  async listMidiDevices(): Promise<NativeMidiDevice[]> {
    if (!this.isAvailable()) return [];
    await this.attachEventForwarders().catch(() => undefined);
    const result = await this.call<{ devices: NativeMidiDevice[] } | NativeMidiDevice[]>(
      'list_midi_devices', {}, () => plugin.listMidiDevices(),
    );
    const devices = Array.isArray(result) ? result : result.devices;
    return Array.isArray(devices) ? devices : [];
  }

  async listAudioOutputDevices(): Promise<NativeAudioOutputDevice[]> {
    if (!await this.initialize()) return [];
    const result = await this.call<{ devices: NativeAudioOutputDevice[] } | NativeAudioOutputDevice[]>(
      'list_audio_output_devices', {}, () => plugin.listAudioOutputDevices(),
    );
    const devices = Array.isArray(result) ? result : result.devices;
    return Array.isArray(devices) ? devices : [];
  }

  async setAudioOutputDevice(deviceId: string, channels: number, bufferSize: number): Promise<boolean> {
    if (!await this.initialize(bufferSize)) return false;
    const key = `${deviceId}:${channels}:${bufferSize}`;
    if (key === this.lastAudioDeviceKey) return false;
    try {
      await this.call('set_audio_output_device', { deviceId, channels, bufferSize }, () => (
        plugin.setAudioOutputDevice({ deviceId, channels, bufferSize })
      ));
      this.lastAudioDeviceKey = key;
      return true;
    } finally {
      this.resetSynchronizationCache();
    }
  }

  async audioOutputFailed(): Promise<boolean> {
    const invoke = this.tauriInvoke();
    if (!invoke) return false;
    try {
      const result = await invoke('audio_output_status') as { failed?: boolean };
      return result.failed === true;
    } catch {
      return false;
    }
  }

  async recoverDefaultAudioOutput(bufferSize: number): Promise<boolean> {
    this.lastAudioDeviceKey = null;
    return this.setAudioOutputDevice('', 2, bufferSize);
  }

  async setMidiInputs(deviceIds: readonly (string | null)[]): Promise<void> {
    if (!this.isAvailable()) return;
    await this.attachEventForwarders().catch(() => undefined);
    const normalized = [...deviceIds].slice(0, 3);
    await this.call('set_midi_inputs', { deviceIds: normalized }, () => plugin.setMidiInputs({ deviceIds: normalized }));
  }

  async sendMidi(inputSlot: number, status: number, data1: number, data2: number): Promise<void> {
    if (!await this.initialize()) return;
    await this.call('send_midi', { inputSlot, status, data1, data2 }, () => (
      plugin.sendMidi({ inputSlot, status, data1, data2 })
    ));
  }

  async configureModule(config: NativeModuleConfig): Promise<void> {
    if (!await this.initialize()) return;
    const key = JSON.stringify(config);
    if (this.moduleConfigKeys[config.moduleIndex] === key) return;
    await this.call('configure_module', { config }, () => plugin.configureModule(config));
    this.moduleConfigKeys[config.moduleIndex] = key;
  }

  async configureModuleEffects(config: NativeModuleEffectsConfig): Promise<void> {
    if (!await this.initialize()) return;
    const key = JSON.stringify(config);
    if (this.moduleEffectsKeys[config.moduleIndex] === key) return;
    await this.call('configure_module_effects', { config }, () => plugin.configureModuleEffects(config));
    this.moduleEffectsKeys[config.moduleIndex] = key;
  }

  async configureModuleEnvelope(config: NativeModuleEnvelopeConfig): Promise<void> {
    if (!await this.initialize()) return;
    const key = JSON.stringify(config);
    if (this.moduleEnvelopeKeys[config.moduleIndex] === key) return;
    await this.call('configure_module_envelope', { config }, () => plugin.configureModuleEnvelope(config));
    this.moduleEnvelopeKeys[config.moduleIndex] = key;
  }

  async configureSynth(config: NativeSynthConfig): Promise<void> {
    if (!await this.initialize()) return;
    const key = JSON.stringify(config);
    if (this.lastSynthKey === key) return;
    await this.call('configure_synth', { config }, () => plugin.configureSynth(config));
    this.lastSynthKey = key;
  }

  async setTempo(bpm: number): Promise<void> {
    if (!await this.initialize()) return;
    if (this.lastTempo === bpm) return;
    await this.call('set_tempo', { bpm }, () => plugin.setTempo({ bpm }));
    this.lastTempo = bpm;
  }

  async configureMetronome(config: NativeMetronomeConfig): Promise<void> {
    if (!await this.initialize()) return;
    const normalized: NativeMetronomeConfig = {
      enabled: Boolean(config.enabled),
      bpm: Math.min(600, Math.max(60, Math.round(config.bpm))),
      volume: Math.min(1, Math.max(0, config.volume)),
      clickSound: Math.min(3, Math.max(1, Math.round(config.clickSound))) as 1 | 2 | 3,
      accentEnabled: Boolean(config.accentEnabled),
      doubleTimeEnabled: Boolean(config.doubleTimeEnabled),
      timeSignatureNumerator: Math.min(16, Math.max(1, Math.round(config.timeSignatureNumerator))),
    };
    const key = JSON.stringify(normalized);
    if (key === this.lastMetronomeKey) return;
    await this.call('configure_metronome', { ...normalized }, () => plugin.configureMetronome(normalized));
    this.lastMetronomeKey = key;
  }

  async setOutputGain(db: number, enabled: boolean): Promise<void> {
    if (!await this.initialize()) return;
    const key = `${db}:${enabled}`;
    if (this.lastOutputGainKey === key) return;
    await this.call('set_output_gain', { db, enabled }, () => plugin.setOutputGain({ db, enabled }));
    this.lastOutputGainKey = key;
  }

  async setCompatibilityMode(enabled: boolean): Promise<void> {
    if (!await this.initialize()) return;
    if (this.lastCompatibilityMode === enabled) return;
    await this.call('set_compatibility_mode', { enabled }, () => plugin.setCompatibilityMode({ enabled }));
    this.lastCompatibilityMode = enabled;
  }

  async stopAllNotes(): Promise<void> {
    if (!this.isAvailable()) return;
    await this.call('stop_all_notes', {}, () => plugin.stopAllNotes());
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
    await this.call('begin_sound_font_upload', { moduleIndex }, () => plugin.beginSoundFontUpload({ moduleIndex }));
    for (let offset = 0; offset < file.size; offset += SOUNDFONT_CHUNK_BYTES) {
      const bytes = new Uint8Array(await file.slice(offset, offset + SOUNDFONT_CHUNK_BYTES).arrayBuffer());
      const base64 = bytesToBase64(bytes);
      await this.call('append_sound_font_chunk', { moduleIndex, base64 }, () => (
        plugin.appendSoundFontChunk({ moduleIndex, base64 })
      ));
    }
    await this.call('finish_sound_font_upload', { moduleIndex }, () => plugin.finishSoundFontUpload({ moduleIndex }));
  }

  private attachEventForwarders(): Promise<void> {
    if (this.listenersPromise) return this.listenersPromise;
    if (this.tauriInvoke()) {
      this.listenersPromise = import('@tauri-apps/api/event').then(async ({ listen }) => {
        await Promise.all([
          listen<NativeMidiNoteEvent>('midiNote', ({ payload }) => {
            window.dispatchEvent(new CustomEvent('hookkeys:native-midi-note', { detail: payload }));
          }),
          listen<NativeMidiControlChangeEvent>('midiControlChange', ({ payload }) => {
            window.dispatchEvent(new CustomEvent('hookkeys:native-midi-control-change', { detail: payload }));
          }),
          listen('midiDevicesChanged', () => {
            window.dispatchEvent(new Event('hookkeys:native-midi-devices-changed'));
          }),
          listen<NativeMidiPitchBendEvent>('midiPitchBend', ({ payload }) => {
            window.dispatchEvent(new CustomEvent('hookkeys:native-midi-pitch-bend', { detail: payload }));
          }),
        ]);
      }).catch((error) => {
        this.listenersPromise = null;
        throw error;
      });
      return this.listenersPromise;
    }
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
      plugin.addListener('midiPitchBend', (event) => {
        window.dispatchEvent(new CustomEvent('hookkeys:native-midi-pitch-bend', { detail: event }));
      }),
    ]).then(() => undefined).catch((error) => {
      this.listenersPromise = null;
      throw error;
    });
    return this.listenersPromise;
  }

  private tauriInvoke(): ((command: string, args?: Record<string, unknown>) => Promise<unknown>) | null {
    return (window as unknown as {
      __TAURI_INTERNALS__?: { invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown> };
    }).__TAURI_INTERNALS__?.invoke ?? null;
  }

  private call<T>(
    command: string,
    args: Record<string, unknown>,
    capacitorCall: () => Promise<T>,
  ): Promise<T> {
    const invoke = this.tauriInvoke();
    return invoke ? invoke(command, args) as Promise<T> : capacitorCall();
  }

  private resetSynchronizationCache(): void {
    this.moduleConfigKeys.fill(null);
    this.moduleEffectsKeys.fill(null);
    this.moduleEnvelopeKeys.fill(null);
    this.lastSynthKey = null;
    this.lastTempo = null;
    this.lastMetronomeKey = null;
    this.lastOutputGainKey = null;
    this.lastCompatibilityMode = null;
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
