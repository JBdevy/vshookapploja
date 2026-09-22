import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { NativeTrackAction, NativeTrackBridge, NativeTrackStatus } from '../../features/tracks/NativeTrackPlayer';

export interface NativeMidiDevice {
  id: string;
  name: string;
}

export interface NativeAudioOutputDevice {
  id: string;
  name: string;
  channels: number;
}

export interface NativeAudioOutputStatus {
  ready: boolean;
  failed: boolean;
  error?: string;
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
  gmDrumHiHatChoke: boolean;
  drumZeroReleaseMask0: number;
  drumZeroReleaseMask1: number;
  drumZeroReleaseMask2: number;
  drumZeroReleaseMask3: number;
  volumeDb: number;
  polyphony: number;
  velocityCurve0: number;
  velocityCurve1: number;
  velocityCurve2: number;
  velocityCurve3: number;
  velocityCurve4: number;
  // No Sens: toda nota soa no ganho pleno da wave, ignorando o velocity da
  // tecla. É retroativo no motor — muda o ganho de notas já soando na hora.
  noVelocitySensitivity: boolean;
  // Mono: uma nota nova substitui a que estiver soando; soltar volta pra
  // tecla anterior ainda presa. Legato: só a primeira nota depois do
  // silêncio reinicia o envelope.
  mono: boolean;
  legato: boolean;
  outputChannelStart: number;
  outputChannelCount: 1 | 2;
  // Soma L+R e envia a mesma soma a cada canal da rota do módulo.
  outputDualMono: boolean;
}

export interface NativeModuleEffectsConfig {
  moduleIndex: number;
  cutoffHz: number;
  cutoffVelocity0: number;
  cutoffVelocity1: number;
  cutoffVelocity2: number;
  cutoffVelocity3: number;
  cutoffVelocity4: number;
  // 0 Lowpass 2, 1 Lowpass 4, 2 Highpass 2, 3 Highpass 4.
  cutoffFilterType: number;
  cutoffEnvelopeEnabled: boolean;
  cutoffEnvelopeAttackMs: number;
  cutoffEnvelopeDecayMs: number;
  cutoffEnvelopeSustain: number;
  cutoffEnvelopeReleaseMs: number;
  cutoffEnvelopeDepthOctaves: number;
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
  reverbMod: number;
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
  chorusEnabled: boolean;
  chorusRateHz: number;
  chorusDepth: number;
  chorusMix: number;
  autoFaderEnabled: boolean;
  // 1 = 1/4 do compasso por volta, 0,5 = 1/8.
  autoFaderBeats: number;
  autoFaderDepthDb: number;
  // Gain de entrada do módulo, antes dos processadores.
  inputGainDb: number;
}

export interface NativeModuleEnvelopeConfig {
  moduleIndex: number;
  attackMs: number;
  holdMs: number;
  decayMs: number;
  releaseMs: number;
  glideMs: number;
  // 0 dB segura o som cheio depois do Decay.
  sustainDb: number;
}

export interface NativeVelocityLimitsConfig {
  moduleIndex: number;
  ignoreAbove: number;
  ceiling: number;
  oscillator1Limit: number;
  oscillator2Limit: number;
  oscillator3Limit: number;
}

export interface NativePickedAudioFile {
  path: string;
  name: string;
  size: number;
}

export interface NativeGlideConfig {
  moduleIndex: number;
  portamento: boolean;
  velocityGateEnabled: boolean;
  velocityGateInverted: boolean;
  velocityThreshold: number;
}

export interface NativeModuleModulationConfig {
  moduleIndex: number;
  // 0 User, 1 LFO de pitch, 2 Tremolo, 3 Pan.
  mode: number;
  rateHz: number;
  intensity: number;
}

export interface NativeTranceGateConfig {
  moduleIndex: number;
  enabled: boolean;
  steps: number;
  length: number;
  beatMultiplier: number;
  gate: number;
  depth: number;
  attackMs: number;
  releaseMs: number;
  swing: number;
}

export interface NativeSynthConfig {
  oscillator1: number;
  oscillator2: number;
  oscillator3: number;
  oscillator1Enabled: boolean;
  oscillator2Enabled: boolean;
  oscillator3Enabled: boolean;
  voiceMode: number;
  lfoTarget: number;
  oscillator1Volume: number;
  oscillator2Volume: number;
  oscillator3Volume: number;
  oscillator1DetuneCents: number;
  oscillator2DetuneCents: number;
  oscillator3DetuneCents: number;
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
  oscillator3Octave: number;
}

export interface NativeOrganConfig {
  drawbars: number[];
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
  setMidiInputEnabled(options: { enabled: boolean }): Promise<void>;
  initialize(options: { bufferSize: number; sampleRate: number }): Promise<{ ready: boolean }>;
  listMidiDevices(): Promise<{ devices: NativeMidiDevice[] }>;
  listAudioOutputDevices(): Promise<{ devices: NativeAudioOutputDevice[] }>;
  setAudioOutputDevice(options: {
    deviceId: string;
    channels: number;
    bufferSize: number;
    sampleRate: number;
    preserveEngine?: boolean;
  }): Promise<void>;
  audioOutputStatus(): Promise<NativeAudioOutputStatus>;
  memoryUsage(): Promise<{ percent: number; usedBytes: number; limitBytes: number }>;
  lockOrientation(options: { mode: 'landscape' | 'portrait' }): Promise<void>;
  moduleMeterLevels(): Promise<{ levels: number[] }>;
  moduleAnalysis(options: { moduleIndex: number }): Promise<{ values: number[] }>;
  setMidiInputs(options: { deviceIds: Array<string | null> }): Promise<void>;
  configureModule(options: NativeModuleConfig): Promise<void>;
  beginPresetTransition(): Promise<void>;
  commitPresetTransition(): Promise<void>;
  setModuleGain(options: { moduleIndex: number; db: number }): Promise<void>;
  configureModuleEffects(options: NativeModuleEffectsConfig): Promise<void>;
  configureTranceGate(options: NativeTranceGateConfig): Promise<void>;
  configureModuleEnvelope(options: NativeModuleEnvelopeConfig): Promise<void>;
  configureModuleModulation(options: NativeModuleModulationConfig): Promise<void>;
  configureGlide(options: NativeGlideConfig): Promise<void>;
  configureVelocityLimits(options: NativeVelocityLimitsConfig): Promise<void>;
  configureSynth(options: NativeSynthConfig): Promise<void>;
  configureOrgan(options: NativeOrganConfig): Promise<void>;
  sendMidi(options: { inputSlot: number; status: number; data1: number; data2: number }): Promise<void>;
  setTempo(options: { bpm: number }): Promise<void>;
  setGlobalTranspose(options: { semitones: number }): Promise<void>;
  configureMetronome(options: NativeMetronomeConfig): Promise<void>;
  setMetronomeOutput(options: { channelStart: number; channelCount: number }): Promise<void>;
  setOutputGain(options: { db: number; enabled: boolean; channelStart: number; channelCount: number }): Promise<void>;
  setCompatibilityMode(options: { enabled: boolean }): Promise<void>;
  setSeamlessPresetSwitching(options: { enabled: boolean }): Promise<void>;
  stopAllNotes(): Promise<void>;
  performHaptic(options: { strength: 'light' | 'medium' }): Promise<void>;
  beginSoundFontUpload(options: { moduleIndex: number; assetKey: string }): Promise<{ cached: boolean }>;
  appendSoundFontChunk(options: { moduleIndex: number; base64: string }): Promise<void>;
  finishSoundFontUpload(options: { moduleIndex: number }): Promise<void>;
  cloneSoundFont(options: { sourceModuleIndex: number; targetModuleIndex: number }): Promise<void>;
  unloadSoundFont(options: { moduleIndex: number }): Promise<void>;
  saveBackup(options: { fileName: string; content: string }): Promise<{ saved: boolean }>;
  pickAudioFiles(): Promise<{ files: NativePickedAudioFile[] }>;
  releasePickedAudioFile(options: { path: string }): Promise<void>;
  adoptPickedAudioFile(options: { path: string; key: string; extension: string }): Promise<void>;
  deleteTrackFile(options: { key: string; extension: string }): Promise<void>;
  beginTrackUpload(options: { key: string; extension: string }): Promise<{ cached: boolean }>;
  appendTrackChunk(options: { key: string; base64: string }): Promise<void>;
  finishTrackUpload(options: { key: string }): Promise<void>;
  loadTrack(options: { sourceId: number; key: string; extension: string }): Promise<{ durationSeconds: number }>;
  controlTrack(options: { sourceId: number; action: NativeTrackAction; seconds?: number; loop?: boolean }): Promise<void>;
  trackStatus(): Promise<NativeTrackStatus>;
  configureTrackOutput(options: { channelStart: number; channelCount: number; db: number; enabled: boolean }): Promise<void>;
  addListener(eventName: 'midiNote', listener: (event: NativeMidiNoteEvent) => void): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'midiControlChange',
    listener: (event: NativeMidiControlChangeEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(eventName: 'midiDevicesChanged', listener: () => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'midiPitchBend', listener: (event: NativeMidiPitchBendEvent) => void): Promise<PluginListenerHandle>;
}

const plugin = registerPlugin<HookKeysNativePlugin>('HookKeysNative');
const SOUNDFONT_CHUNK_BYTES = 4 * 1024 * 1024;

class HookKeysNativeBridge {
  private initializePromise: Promise<boolean> | null = null;
  private initialized = false;
  private lastInitializationError: unknown = null;
  private listenersPromise: Promise<void> | null = null;
  private readonly moduleConfigKeys: (string | null)[] = Array.from({ length: 8 }, () => null);
  private readonly tranceGateKeys: (string | null)[] = Array.from({ length: 8 }, () => null);
  private readonly moduleEffectsKeys: (string | null)[] = Array.from({ length: 8 }, () => null);
  private readonly moduleEnvelopeKeys: (string | null)[] = Array.from({ length: 8 }, () => null);
  private readonly moduleModulationKeys: (string | null)[] = Array.from({ length: 8 }, () => null);
  private readonly glideKeys: (string | null)[] = Array.from({ length: 8 }, () => null);
  private readonly velocityLimitKeys: (string | null)[] = Array.from({ length: 8 }, () => null);
  private lastSynthKey: string | null = null;
  private lastOrganKey: string | null = null;
  private lastTempo: number | null = null;
  private lastGlobalTranspose: number | null = null;
  private lastMetronomeKey: string | null = null;
  private lastMetronomeOutputKey: string | null = null;
  private lastTrackOutputKey: string | null = null;
  private lastOutputGainKey: string | null = null;
  private lastCompatibilityMode: boolean | null = null;
  private lastSeamlessPresetSwitching: boolean | null = null;
  private lastAudioDeviceKey: string | null = null;

  isAvailable(): boolean {
    return Capacitor.isNativePlatform() || this.tauriInvoke() !== null;
  }

  initialize(bufferSize = 256, sampleRate = 48_000): Promise<boolean> {
    if (!this.isAvailable()) return Promise.resolve(false);
    if (!this.initializePromise) {
      this.initializePromise = this.call<{ ready: boolean }>(
        'initialize', { bufferSize, sampleRate }, () => plugin.initialize({ bufferSize, sampleRate }),
      )
        .then(({ ready }) => {
          // initialize já abre a saída padrão com dois canais. Registrar essa
          // rota evita destruir e recriar o stream imediatamente durante o
          // boot — em Android, iOS e drivers exclusivos do desktop essa
          // segunda abertura podia deixar o motor sem uma saída ativa.
          if (ready && this.lastAudioDeviceKey === null) {
            this.lastAudioDeviceKey = `:2:${bufferSize}:${sampleRate}`;
          }
          if (!ready) this.initializePromise = null;
          this.initialized = ready;
          if (ready) this.lastInitializationError = null;
          return ready;
        })
        .catch((error) => {
          // Uma saída de áudio pode estar temporariamente ocupada durante o
          // boot. Não memorize a falha: a próxima nota/alteração pode tentar
          // iniciar o motor novamente.
          this.lastInitializationError = error;
          this.initialized = false;
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

  async setAudioOutputDevice(
    deviceId: string,
    channels: number,
    bufferSize: number,
    sampleRate: number,
    preserveEngine = false,
  ): Promise<boolean> {
    if (!await this.initialize(bufferSize, sampleRate)) return false;
    const key = `${deviceId}:${channels}:${bufferSize}:${sampleRate}`;
    if (key === this.lastAudioDeviceKey) return false;
    // Trocar somente o buffer mantém o mesmo motor e os SF2 já decodificados.
    // Uma mudança real de dispositivo/canais continua invalidando todos os
    // caches porque pode também alterar a taxa de amostragem.
    if (!preserveEngine) this.resetSynchronizationCache();
    try {
      await this.call('set_audio_output_device', { deviceId, channels, bufferSize, sampleRate, preserveEngine }, () => (
        plugin.setAudioOutputDevice({ deviceId, channels, bufferSize, sampleRate, preserveEngine })
      ));
      this.lastAudioDeviceKey = key;
      this.initialized = true;
      this.initializePromise = null;
      return true;
    } catch (error) {
      this.lastAudioDeviceKey = null;
      this.initialized = false;
      this.initializePromise = null;
      throw error;
    }
  }

  async audioOutputStatus(): Promise<NativeAudioOutputStatus> {
    if (!this.isAvailable()) return { ready: false, failed: false };
    try {
      const result = await this.call<Partial<NativeAudioOutputStatus>>(
        'audio_output_status', {}, () => plugin.audioOutputStatus(),
      );
      const failed = result.failed === true;
      this.initialized = result.ready === true && !failed;
      return {
        ready: result.ready === true && !failed,
        failed,
        error: typeof result.error === 'string' && result.error.trim() ? result.error.trim() : undefined,
      };
    } catch {
      // A ponte não responder também significa que não existe uma saída
      // confiável para receber Synth, SF2 e metrônomo.
      return { ready: false, failed: true };
    }
  }

  // RAM usada no aparelho inteiro, em % da RAM instalada. No desktop vem do
  // Windows; no navegador, null.
  async memoryUsage(): Promise<{ percent: number; usedBytes: number; limitBytes: number } | null> {
    const invoke = this.tauriInvoke();
    if (invoke) {
      const result = await invoke('memory_usage').catch(() => null) as
        { percent?: unknown; usedBytes?: unknown; limitBytes?: unknown } | null;
      const percent = Number(result?.percent);
      if (!Number.isFinite(percent)) return null;
      return {
        percent,
        usedBytes: Number(result?.usedBytes) || 0,
        limitBytes: Number(result?.limitBytes) || 0,
      };
    }
    if (!Capacitor.isNativePlatform()) return null;
    try {
      const result = await plugin.memoryUsage();
      return Number.isFinite(result.percent) ? result : null;
    } catch {
      return null;
    }
  }

  // Paisagem dos dois lados (iOS e Android). Devolve false quando o binário
  // nativo ainda não tem o método, para o chamador usar o plugin de orientação.
  async lockOrientation(mode: 'landscape' | 'portrait'): Promise<boolean> {
    if (!Capacitor.isNativePlatform() || this.tauriInvoke()) return false;
    try {
      await plugin.lockOrientation({ mode });
      return true;
    } catch {
      return false;
    }
  }

  async audioOutputFailed(): Promise<boolean> {
    return !(await this.audioOutputStatus()).ready;
  }

  async moduleMeterLevels(): Promise<number[]> {
    if (!this.isAvailable()) return [];
    const result = await this.call<number[] | { levels: number[] }>(
      'module_meter_levels', {}, () => plugin.moduleMeterLevels(),
    );
    const levels = Array.isArray(result) ? result : result.levels;
    // 0..15: oito módulos; 16..17: soma dos módulos; 18..19: Playlist;
    // 20..21: Click. Não trunque os dois últimos buses ao normalizar a ponte.
    return Array.from({ length: 22 }, (_, index) => {
      const value = levels?.[index];
      return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
    });
  }

  async moduleAnalysis(moduleIndex: number): Promise<number[]> {
    if (!this.isAvailable() || !Number.isInteger(moduleIndex) || moduleIndex < 0 || moduleIndex >= 8) return [];
    const result = await this.call<number[] | { values: number[] }>(
      'module_analysis', { moduleIndex }, () => plugin.moduleAnalysis({ moduleIndex }),
    );
    const values = Array.isArray(result) ? result : result.values;
    return Array.from({ length: 2 }, (_, index) => {
      const value = values?.[index];
      return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
    });
  }

  // Custo real do callback de audio contra o prazo do bloco: [0] pior bloco,
  // [1] media suavizada, [2] estouros. So o desktop mede; nas plataformas
  // moveis o comando nao existe e o medidor nao aparece.
  async audioLoad(): Promise<{ peak: number; smoothed: number; overruns: number } | null> {
    const invoke = this.tauriInvoke();
    if (!invoke) return null;
    // O medidor nao pode derrubar o laco que atualiza os VUs dos modulos.
    const result = await invoke('audio_load').catch(() => null) as unknown;
    if (!Array.isArray(result)) return null;
    const at = (index: number) => {
      const entry = result[index];
      return typeof entry === 'number' && Number.isFinite(entry) ? Math.max(0, entry) : 0;
    };
    return { peak: at(0), smoothed: at(1), overruns: at(2) };
  }

  async recoverDefaultAudioOutput(bufferSize: number, sampleRate = 48_000): Promise<boolean> {
    // Força uma abertura real mesmo que a rota padrão continue com a mesma
    // chave. Isso recupera stream interrompido e troca de placa/fone.
    this.lastAudioDeviceKey = null;
    // initialize() registra a chave padrão quando consegue reabrir uma sessão
    // que falhou no boot. Limpe novamente depois dele para que o passo seguinte
    // não confunda "inicializou" com "a recuperação forçada já foi feita".
    if (!await this.initialize(bufferSize, sampleRate)) return false;
    this.lastAudioDeviceKey = null;
    return this.setAudioOutputDevice('', 2, bufferSize, sampleRate);
  }

  initializationErrorMessage(): string | null {
    return errorMessage(this.lastInitializationError);
  }

  async setMidiInputs(deviceIds: readonly (string | null)[]): Promise<void> {
    if (!this.isAvailable()) return;
    await this.attachEventForwarders().catch(() => undefined);
    const normalized = [...deviceIds].slice(0, 3);
    await this.call('set_midi_inputs', { deviceIds: normalized }, () => plugin.setMidiInputs({ deviceIds: normalized }));
  }

  sendMidi(inputSlot: number, status: number, data1: number, data2: number): Promise<void> {
    const send = () => this.call('send_midi', { inputSlot, status, data1, data2 }, () => (
      plugin.sendMidi({ inputSlot, status, data1, data2 })
    ));
    // Com o motor confirmado, entre na ponte durante o próprio evento de
    // toque. Até um await de Promise resolvida deixa a nota atrás de uma
    // pintura/layout já pendente no WebView.
    if (this.initialized) return send();
    return this.initialize().then((ready) => ready ? send() : undefined);
  }

  async beginPresetTransition(): Promise<void> {
    if (!await this.initialize()) return;
    await this.call('begin_preset_transition', {}, () => plugin.beginPresetTransition());
    // The fresh layer needs ALL settings, including values equal to the old
    // preset. Keep file/upload caches and the running audio device intact.
    this.resetSynchronizationCache();
  }

  async commitPresetTransition(): Promise<void> {
    await this.call('commit_preset_transition', {}, () => plugin.commitPresetTransition());
  }

  async configureModule(config: NativeModuleConfig): Promise<void> {
    if (!await this.initialize()) return;
    const key = JSON.stringify(config);
    if (this.moduleConfigKeys[config.moduleIndex] === key) return;
    await this.call('configure_module', { config }, () => plugin.configureModule(config));
    this.moduleConfigKeys[config.moduleIndex] = key;
  }

  async setModuleGain(moduleIndex: number, db: number): Promise<void> {
    if (!await this.initialize()) return;
    const safeDb = Number.isFinite(db) ? Math.min(6, Math.max(-90, db)) : 0;
    await this.call('set_module_gain', { moduleIndex, db: safeDb }, () => (
      plugin.setModuleGain({ moduleIndex, db: safeDb })
    ));
  }

  async configureTranceGate(config: NativeTranceGateConfig): Promise<void> {
    if (!await this.initialize()) return;
    const key = JSON.stringify(config);
    if (this.tranceGateKeys[config.moduleIndex] === key) return;
    await this.call('configure_trance_gate', { config }, () => plugin.configureTranceGate(config));
    this.tranceGateKeys[config.moduleIndex] = key;
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

  async configureVelocityLimits(config: NativeVelocityLimitsConfig): Promise<void> {
    if (!await this.initialize()) return;
    if (!Number.isInteger(config.moduleIndex) || config.moduleIndex < 0 || config.moduleIndex >= 8) return;
    const limit = (value: number) => Number.isFinite(value) ? Math.round(Math.min(127, Math.max(0, value))) : 127;
    const normalized: NativeVelocityLimitsConfig = {
      moduleIndex: config.moduleIndex,
      ignoreAbove: limit(config.ignoreAbove),
      ceiling: limit(config.ceiling),
      oscillator1Limit: limit(config.oscillator1Limit),
      oscillator2Limit: limit(config.oscillator2Limit),
      oscillator3Limit: limit(config.oscillator3Limit),
    };
    const key = JSON.stringify(normalized);
    if (this.velocityLimitKeys[config.moduleIndex] === key) return;
    await this.call('configure_velocity_limits', { config: normalized }, () => plugin.configureVelocityLimits(normalized));
    this.velocityLimitKeys[config.moduleIndex] = key;
  }

  async configureGlide(config: NativeGlideConfig): Promise<void> {
    if (!await this.initialize()) return;
    if (!Number.isInteger(config.moduleIndex) || config.moduleIndex < 0 || config.moduleIndex >= 8) return;
    const normalized: NativeGlideConfig = {
      moduleIndex: config.moduleIndex,
      portamento: config.portamento === true,
      velocityGateEnabled: config.velocityGateEnabled === true,
      velocityGateInverted: config.velocityGateInverted === true,
      velocityThreshold: Number.isFinite(config.velocityThreshold)
        ? Math.round(Math.min(127, Math.max(0, config.velocityThreshold))) : 64,
    };
    const key = JSON.stringify(normalized);
    if (this.glideKeys[config.moduleIndex] === key) return;
    await this.call('configure_glide', { config: normalized }, () => plugin.configureGlide(normalized));
    this.glideKeys[config.moduleIndex] = key;
  }

  async configureModuleModulation(config: NativeModuleModulationConfig): Promise<void> {
    if (!await this.initialize()) return;
    if (!Number.isInteger(config.moduleIndex) || config.moduleIndex < 0 || config.moduleIndex >= 8) return;
    const normalized = {
      moduleIndex: config.moduleIndex,
      mode: Number.isInteger(config.mode) ? Math.min(4, Math.max(0, config.mode)) : 1,
      rateHz: Number.isFinite(config.rateHz) ? Math.min(20, Math.max(0.1, config.rateHz)) : 6.85,
      intensity: Number.isFinite(config.intensity) ? Math.min(1, Math.max(0, config.intensity)) : 1,
    };
    const key = JSON.stringify(normalized);
    if (this.moduleModulationKeys[config.moduleIndex] === key) return;
    await this.call('configure_module_modulation', { config: normalized }, () => (
      plugin.configureModuleModulation(normalized)
    ));
    this.moduleModulationKeys[config.moduleIndex] = key;
  }

  async configureSynth(config: NativeSynthConfig): Promise<void> {
    if (!await this.initialize()) return;
    const key = JSON.stringify(config);
    if (this.lastSynthKey === key) return;
    await this.call('configure_synth', { config }, () => plugin.configureSynth(config));
    this.lastSynthKey = key;
  }

  async configureOrgan(config: NativeOrganConfig): Promise<void> {
    if (!await this.initialize()) return;
    const normalized = {
      drawbars: Array.from({ length: 9 }, (_, index) => (
        Math.min(8, Math.max(0, Math.round(Number(config.drawbars[index]) || 0)))
      )),
    };
    const key = JSON.stringify(normalized);
    if (key === this.lastOrganKey) return;
    await this.call('configure_organ', normalized, () => plugin.configureOrgan(normalized));
    this.lastOrganKey = key;
  }

  async setTempo(bpm: number): Promise<void> {
    if (!await this.initialize()) return;
    if (this.lastTempo === bpm) return;
    await this.call('set_tempo', { bpm }, () => plugin.setTempo({ bpm }));
    this.lastTempo = bpm;
  }

  async setGlobalTranspose(semitones: number): Promise<void> {
    if (!await this.initialize()) return;
    if (this.lastGlobalTranspose === semitones) return;
    await this.call('set_global_transpose', { semitones }, () => plugin.setGlobalTranspose({ semitones }));
    this.lastGlobalTranspose = semitones;
  }

  async configureMetronome(config: NativeMetronomeConfig): Promise<void> {
    if (!await this.initialize()) return;
    const normalized: NativeMetronomeConfig = {
      enabled: Boolean(config.enabled),
      bpm: Math.min(600, Math.max(60, Math.round(config.bpm * 2) / 2)),
      volume: Math.min(10 ** (12 / 20), Math.max(0, config.volume)),
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

  async setMetronomeOutput(channelStart: number, channelCount: 1 | 2): Promise<void> {
    if (!await this.initialize()) return;
    const options = { channelStart: Math.min(31, Math.max(0, Math.round(channelStart))), channelCount };
    const key = JSON.stringify(options);
    if (key === this.lastMetronomeOutputKey) return;
    await this.call('set_metronome_output', options, () => plugin.setMetronomeOutput(options));
    this.lastMetronomeOutputKey = key;
  }

  async setOutputGain(db: number, enabled: boolean, channelStart: number, channelCount: 1 | 2): Promise<void> {
    if (!await this.initialize()) return;
    const options = {
      db, enabled,
      channelStart: Math.min(31, Math.max(0, Math.round(channelStart))),
      channelCount,
    };
    const key = JSON.stringify(options);
    if (this.lastOutputGainKey === key) return;
    await this.call('set_output_gain', options, () => plugin.setOutputGain(options));
    this.lastOutputGainKey = key;
  }

  async setCompatibilityMode(enabled: boolean): Promise<void> {
    if (!await this.initialize()) return;
    if (this.lastCompatibilityMode === enabled) return;
    await this.call('set_compatibility_mode', { enabled }, () => plugin.setCompatibilityMode({ enabled }));
    this.lastCompatibilityMode = enabled;
  }

  async setSeamlessPresetSwitching(enabled: boolean): Promise<void> {
    if (!await this.initialize()) return;
    if (this.lastSeamlessPresetSwitching === enabled) return;
    await this.call('set_seamless_preset_switching', { enabled }, () => (
      plugin.setSeamlessPresetSwitching({ enabled })
    ));
    this.lastSeamlessPresetSwitching = enabled;
  }

  async stopAllNotes(): Promise<void> {
    if (!this.isAvailable()) return;
    await this.call('stop_all_notes', {}, () => plugin.stopAllNotes());
  }

  async setMidiInputEnabled(enabled: boolean): Promise<void> {
    if (!this.isAvailable()) return;
    await this.call('set_midi_input_enabled', { enabled }, () => plugin.setMidiInputEnabled({ enabled }));
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

  async loadSoundFont(
    moduleIndex: number,
    file: Blob,
    cancelled: () => boolean = () => false,
    progress: (percent: number) => void = () => {},
    cacheKey = '',
  ): Promise<void> {
    if (!await this.initialize()) throw new Error('native_engine_unavailable');
    if (cancelled()) throw new DOMException('Seleção substituída', 'AbortError');
    const metadata = file as File;
    const identity = `${cacheKey}:${file.size}:${metadata.lastModified ?? ''}`;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
    const assetKey = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    const prepared = await this.call('begin_sound_font_upload', { moduleIndex, assetKey }, () => (
      plugin.beginSoundFontUpload({ moduleIndex, assetKey })
    ));
    if (prepared?.cached) { progress(100); return; }
    for (let offset = 0; offset < file.size; offset += SOUNDFONT_CHUNK_BYTES) {
      if (cancelled()) throw new DOMException('Seleção substituída', 'AbortError');
      const base64 = await blobToBase64(file.slice(offset, offset + SOUNDFONT_CHUNK_BYTES));
      if (cancelled()) throw new DOMException('Seleção substituída', 'AbortError');
      await this.call('append_sound_font_chunk', { moduleIndex, base64 }, () => (
        plugin.appendSoundFontChunk({ moduleIndex, base64 })
      ));
      progress(Math.min(99, Math.round((offset + SOUNDFONT_CHUNK_BYTES) / file.size * 100)));
    }
    if (cancelled()) throw new DOMException('Seleção substituída', 'AbortError');
    await this.call('finish_sound_font_upload', { moduleIndex }, () => plugin.finishSoundFontUpload({ moduleIndex }));
    progress(100);
  }

  async cloneSoundFont(sourceModuleIndex: number, targetModuleIndex: number): Promise<void> {
    if (!await this.initialize()) throw new Error('native_engine_unavailable');
    const options = { sourceModuleIndex, targetModuleIndex };
    await this.call('clone_sound_font', options, () => plugin.cloneSoundFont(options));
  }

  async unloadSoundFont(moduleIndex: number): Promise<void> {
    if (!await this.initialize()) return;
    const options = { moduleIndex };
    await this.call('unload_sound_font', options, () => plugin.unloadSoundFont(options));
  }

  async saveBackup(fileName: string, content: string): Promise<boolean | null> {
    const invoke = this.tauriInvoke();
    if (invoke) {
      const result = await invoke('save_backup', { fileName, content }) as { saved?: boolean };
      return result?.saved === true;
    }
    if (!Capacitor.isNativePlatform()) return null;
    const result = await plugin.saveBackup({ fileName, content });
    return result.saved === true;
  }

  // Músicas tocando dentro do motor, com saída própria. Por enquanto só o app
  // iOS decodifica no motor; desktop e Android seguem no player da web.
  tracksAvailable(): boolean {
    return Capacitor.getPlatform() === 'ios';
  }

  readonly trackBridge: NativeTrackBridge = {
    storeTrackFile: async (key, extension, file) => {
      if (!await this.initialize()) throw new Error('native_engine_unavailable');
      const prepared = await plugin.beginTrackUpload({ key, extension });
      if (prepared.cached) return;
      for (let offset = 0; offset < file.size; offset += SOUNDFONT_CHUNK_BYTES) {
        const base64 = await blobToBase64(file.slice(offset, offset + SOUNDFONT_CHUNK_BYTES));
        await plugin.appendTrackChunk({ key, base64 });
      }
      await plugin.finishTrackUpload({ key });
    },
    loadTrack: async (sourceId, key, extension) => {
      if (!await this.initialize()) throw new Error('native_engine_unavailable');
      return (await plugin.loadTrack({ sourceId, key, extension })).durationSeconds;
    },
    controlTrack: (sourceId, action, options = {}) => plugin.controlTrack({ sourceId, action, ...options }),
    trackStatus: () => plugin.trackStatus(),
  };

  async configureTrackOutput(channelStart: number, channelCount: 1 | 2, db: number, enabled: boolean): Promise<void> {
    if (!this.tracksAvailable() || !await this.initialize()) return;
    const options = { channelStart: Math.min(31, Math.max(0, Math.round(channelStart))), channelCount, db, enabled };
    const key = JSON.stringify(options);
    if (key === this.lastTrackOutputKey) return;
    await plugin.configureTrackOutput(options);
    this.lastTrackOutputKey = key;
  }

  // Seletor de documentos nativo para "Add música": só no app iOS/iPadOS.
  readonly audioPicker = {
    isAvailable: () => Capacitor.getPlatform() === 'ios',
    pick: async () => (await plugin.pickAudioFiles()).files,
    release: (path: string) => plugin.releasePickedAudioFile({ path }),
    // A música escolhida vira o arquivo que o motor toca, sem outra cópia.
    adopt: (path: string, key: string, extension: string) => plugin.adoptPickedAudioFile({ path, key, extension }),
    delete: (key: string, extension: string) => plugin.deleteTrackFile({ key, extension }),
    fileUrl: (path: string) => Capacitor.convertFileSrc(path.startsWith('file://') ? path : `file://${path}`),
  };

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
    this.tranceGateKeys.fill(null);
    this.moduleEffectsKeys.fill(null);
    this.moduleEnvelopeKeys.fill(null);
    this.moduleModulationKeys.fill(null);
    this.glideKeys.fill(null);
    this.velocityLimitKeys.fill(null);
    this.lastSynthKey = null;
    this.lastOrganKey = null;
    this.lastTempo = null;
    this.lastGlobalTranspose = null;
    this.lastMetronomeKey = null;
    this.lastMetronomeOutputKey = null;
    this.lastTrackOutputKey = null;
    this.lastOutputGainKey = null;
    this.lastCompatibilityMode = null;
    this.lastSeamlessPresetSwitching = null;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler o SF2'));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}

function errorMessage(error: unknown): string | null {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  return null;
}

export const hookKeysNative = new HookKeysNativeBridge();
