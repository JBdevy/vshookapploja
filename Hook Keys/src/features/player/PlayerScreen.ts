import type { HookKeysAccount } from '../auth/types';
import {
  createGlideCardMarkup,
  createGlideVelocityMarkup,
  createVoiceModeMarkup,
  DEFAULT_MODULE_GLIDE_MS,
  effectiveGlideMs,
  formatGlideMs,
  readGlideMode,
  readGlideVelocity,
  readLegato,
  readNoVelocitySensitivity,
  updateGlideVelocityMarkup,
} from './GlideView';
import type { DeviceOverviewResponse } from '../auth/types';
import type { PlayerStateService } from '../account/PlayerStateService';
import { KeyboardMidiRouter, keyboardMidiRoute } from './KeyboardMidiRouter';
import { KeyboardExpressionController } from './KeyboardExpressionController';
import type { PlayerBackupService } from '../account/PlayerBackupService';
import type { AccountProfile } from '../account/AccountApi';
import {
  formatMidiNote,
  MidiInputService,
  type MidiControlChangeInput,
  type MidiNoteInput,
  type MidiPitchBendInput,
} from '../midi/MidiInputService';
import { createModuleFaderMarkup, formatFaderDb, MODULE_FADER_MAX_DB, MODULE_FADER_MIN_DB, ModuleFader, visualPositionToFaderDb } from './ModuleFader';
import {
  createAudioSettingsMarkup,
  createAppSettingsMarkup,
  createMidiSettingsMarkup,
  DEFAULT_BUFFER_SIZE,
  DEFAULT_SAMPLE_RATE,
  isBufferSize,
  isSampleRate,
  type BufferSize,
  type SampleRate,
} from './AppSettingsView';
import {
  createPadsEffectsMarkup,
  EFFECT_BANK_IDS,
  EFFECT_COUNT,
  EFFECT_PAD_COLORS,
  PAD_BANK_IDS,
  readPerformanceTrigger,
  type EffectBankId,
  type PadBankId,
  type PerformanceTrigger,
} from './PadsEffectsView';
import {
  createSoundCategoryContentMarkup,
  createSoundSelectionMarkup,
  type SoundCategoryId,
} from './SoundSelectionView';
import { isSoundCategoryId } from '../sound-library/SoundCategories';
import { SoundLibraryStore } from '../sound-library/SoundLibraryStore';
import { SoundCatalog, type FixedSoundDefinition, type PerformanceAssetDefinition, type SoundCatalogPayload } from '../sound-library/SoundCatalog';
import { SoundCatalogCache } from '../sound-library/SoundCatalogCache';
import { HttpSoundAssetGateway } from '../sound-library/SoundAssetGateway';
import { SoundLibraryEngine } from '../sound-library/SoundLibraryEngine';
import { PresetBackupPlanner, type MissingUserSoundfont } from '../sound-library/PresetBackupPlanner';
import { TrackLibraryStore } from '../tracks/TrackLibraryStore';
import {
  createTracksPanelMarkup,
  createTracksSplitPanelMarkup,
  TracksPanelController,
  audioTypeForFileName,
} from '../tracks/TracksPanelController';
import {
  applyOnScreenKey,
  openOnScreenAccentOptions,
  resolveOnScreenKey,
} from '../../shared/ui/OnScreenKeyboard';
import {
  createEqCurve,
  createEqShadowPath,
  cutoffFrequencyFromRatio,
  createModuleEqMarkup,
  createModuleModulationCardMarkup,
  DEFAULT_MODULE_MODULATION_RATE_HZ,
  createModuleSettingsMarkup,
  createModuleSettingsPageMarkup,
  isModuleSettingsPage,
  moduleSettingsPagePower,
  moduleSettingsPages,
  createFilterVelocityCutoffMarkup,
  DEFAULT_FILTER_VELOCITY_CUTOFF_HZ,
  filterVelocityEnginePoints,
  readFilterVelocityCutoffHz,
  readFilterVelocityEnabled,
  updateFilterVelocityPowerMarkup,
  eqFrequencyFromRatio,
  eqGainFromRatio,
  eqXFromFrequency,
  eqYFromGain,
  formatEqFrequency,
  formatEqGain,
  formatEqCutSlope,
  formatCutoffFrequency,
  formatEnvelopeTime,
  isAllowedEqBandType,
  isEqCutType,
  MODULE_EQ_HEIGHT,
  MODULE_EQ_WIDTH,
  MODULE_ENVELOPE_DEFAULTS,
  MODULE_ENVELOPE_LIMITS,
  readModuleEqBands,
  readModuleCutoffFrequency,
  createCutoffControl,
  formatModuleGainDb,
  moduleModulationEngineMode,
  MODULE_GAIN_MAX_DB,
  MODULE_GAIN_MIN_DB,
  readModuleGainDb,
  formatModuleSustainDb,
  MODULE_SUSTAIN_MIN_DB,
  readModuleSustainDb,
  readModuleModulationIntensity,
  readModuleModulationMode,
  readModuleModulationRate,
  type ModuleEqBand,
  type ModuleEnvelopeParameter,
  type ModuleModulationMode,
  type ModuleSettingsMode,
  type ModuleSettingsPage,
} from './ModuleSettingsView';
import {
  createModuleCompressorMarkup,
  createModuleDelayMarkup,
  createModuleReverbMarkup,
  isReverbSpace,
  readReverbSpace,
  readReverbSpaceMix,
  REVERB_SPACES,
  createModuleChorusMarkup,
  createModuleRotaryMarkup,
  createModuleEnvFilterMarkup,
  CUTOFF_FILTER_TYPES,
  DELAY_DIVISIONS,
  delayMillisecondsForBpm,
  formatModuleEffectValue,
  readModuleCompressorSettings,
  readModuleDelaySettings,
  readModuleReverbSettings,
  FACTORY_MODULE_REVERB,
  readModuleChorusSettings,
  readModuleRotarySettings,
  readModuleCutoffEnvelopeSettings,
  readCutoffFilterType,
  readModuleEffectSettings,
  type ModuleEffectKind,
  type CutoffFilterType,
} from './ModuleEffectsView';
import {
  createVelocityCurveMarkup,
  DEFAULT_VELOCITY_CURVE,
  isVelocityCurveMode,
  readVelocityCurveSettings,
  readVelocityLimit,
  updateVelocityCeilingMarkup,
  updateVelocityCurveMarkup,
  velocityCeilingFromClientY,
  velocityCurvePreset,
  velocityFromClientY,
  type VelocityCurveMode,
} from './VelocityCurveView';
import {
  createOutputKnobMarkup,
  createMetronomeKnobMarkup,
  DEFAULT_OUTPUT_ENABLED,
  DEFAULT_OUTPUT_LEVELS,
  formatOutputDb,
  isOutputBus,
  MAX_OUTPUT_DB,
  OUTPUTS,
  OUTPUT_MIN_DB,
  outputDbFromPosition,
  outputPosition,
  type OutputBus,
  type OutputLevels,
  type OutputEnabledState,
} from './OutputControls';
import { createOutputFaderPanelMarkup, OutputFaderPanelController } from './OutputFaderPanel';
import {
  createTrackTransportMarkup,
  TRACK_WAVEFORM_BARS,
  TrackTransportController,
  type TrackPlaybackSnapshot,
} from '../tracks/TrackTransport';
import type { LocalTrack } from '../tracks/TrackLibraryStore';
import { NativeTrackPlayer, trackFileExtension } from '../tracks/NativeTrackPlayer';
import { LongPressGesture } from '../../shared/gestures/LongPressGesture';
import { DoubleTapTracker } from '../../shared/gestures/DoubleTapTracker';
import { EffectAudioStore, isSupportedEffectFile } from '../effects/EffectAudioStore';
import { MetronomeEngine, type MetronomeClickSound } from '../metronome/MetronomeEngine';
import { TabletInputKeyboardController } from '../../shared/ui/TabletInputKeyboardController';
import {
  AudioOutputService,
  createAudioRouteOptions,
  DEFAULT_AUDIO_ROUTING,
  isAudioBusRoute,
  type AudioBusRoute,
  type AudioBusRouting,
  type AudioOutputDevice,
} from '../audio/AudioOutputService';
import { hookKeysNative } from '../../platform/native/HookKeysNative';
import { isDesktopRuntime } from '../../platform/runtime';
import { Capacitor } from '@capacitor/core';
import { isWhatsAppSupportUrl, openWhatsAppSupport } from '../../shared/platform/WhatsAppSupport';
import { ApiError } from '../../shared/api/ApiError';
import {
  createPerformanceKeyboardMarkup,
  createPerformanceKeysMarkup,
  createPerformanceKeyboardSettingsMarkup,
  PerformanceKeyboardController,
  type PerformanceKeyboardStyle,
  type PlayerBottomView,
} from './PerformanceKeyboard';
import { ComputerKeyboardController } from './ComputerKeyboardController';
import { performanceNotesLabel } from './PerformanceChordDisplay';
import {
  createOrganMarkup, ORGAN_DRAWBAR_MAX, ORGAN_DRAWBARS, readOrganSettings,
} from './OrganView';
import { createTranceGateMarkup, readTranceGateSettings, tranceGateStepBeats } from './TranceGateView';
import {
  createSynthModuleMarkup,
  FACTORY_SYNTH_PRESETS,
  factorySynthPreset,
  formatOscillatorVolume,
  oscillatorVolumeGain,
  readSynthSettings,
  SYNTH_PRESET_COUNT,
  synthLfoTargetIndex,
  synthOscillatorIndex,
  updateSynthRangeOutput,
  type SynthLfoTarget,
  type SynthModuleSettings,
  type SynthOscillator,
} from './SynthModuleView';
import {
  ARPEGGIATOR_MODES,
  ARPEGGIATOR_DIVISIONS,
  createArpeggiatorMarkup,
  DEFAULT_ARPEGGIATOR_SETTINGS,
  readArpeggiatorSettings,
  readModuleAutoFaderSettings,
  updatePatternRangeOutput,
  type ArpeggiatorMode,
  type PatternDivision,
} from './PatternModulesView';
import {
  arpeggiatorInputSlotForModule,
  PatternPlaybackController,
  type PatternPlaybackSnapshot,
} from './PatternPlaybackController';

type LogoutCallback = () => Promise<void>;
type ModalKind = 'module-settings' | 'module-polyphony' | 'module-velocity' | 'module-filter-velocity' | 'module-env-filter' | 'glide-config' | 'module-voice-mode' | 'module-arpeggiator' | 'module-trance-gate' | 'module-synth' | 'synth-preset-name' | 'module-eq' | 'module-compressor' | 'module-reverb' | 'module-delay' | 'module-rotary' | 'module-chorus' | 'module-organ' | 'sound-selection' | 'sound-download' | 'performance-download' | 'backup-download' | 'about' | 'app-settings' | 'app-settings-midi' | 'app-settings-audio' | 'keyboard-settings' | 'password-reset' | 'preset-name' | 'bank-name' | 'effect-bank-name' | 'bank-advanced' | 'effect-pad' | 'user' | 'user-name' | 'tracks' | 'output-volume' | 'cc-learn' | 'cc-clear-confirm' | 'metronome' | 'tempo-edit' | 'track-position' | 'compatibility-mode' | 'preset-paste-confirm' | 'module-config-copy-confirm';
type BankId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
type FaderBehaviorMode = 'default' | 'master' | 'bank' | 'bank2';
type PlayerView = 'bank' | 'pads-effects';

function faderModeUsesPersistentVolumes(mode: FaderBehaviorMode): boolean {
  return mode === 'master' || mode === 'bank';
}

function faderModeUsesPresetMappings(mode: FaderBehaviorMode): boolean {
  return mode === 'bank' || mode === 'bank2';
}

function faderModeLabel(mode: FaderBehaviorMode): string {
  return mode === 'master' ? 'Master' : mode === 'bank' ? 'Bank 1' : mode === 'bank2' ? 'Bank 2' : 'Default';
}

interface ModalRoute {
  kind: ModalKind;
  moduleNumber: number | null;
  trigger: HTMLElement;
}

interface BankState {
  faderMode: FaderBehaviorMode;
  masterVolumes: number[];
  name: string;
  selectedPreset: number | null;
  presets: PresetState[];
}

interface PresetState {
  modules: ModulePresetState[];
  name: string;
}

interface ModulePresetState {
  category: SoundCategoryId;
  enabled: boolean;
  highNote: number;
  lowNote: number;
  modulationInputEnabled: boolean;
  midiInputId: string | null;
  octaveShift: number;
  sustainInputEnabled: boolean;
  timbreId: string | null;
  timbreName: string;
  timbreColor: string | null;
  volumeDb: number;
  settings: Record<string, unknown>;
  settingsMode: ModuleSettingsMode;
  userSettings: Record<string, unknown> | null;
}

type NoteRangeBound = 'low' | 'high';

interface PendingNoteLearn {
  bound: NoteRangeBound;
  moduleNumber: number;
}

interface PresetHoldGesture {
  button: HTMLButtonElement;
  pointerId: number;
  startX: number;
  startY: number;
  timer: number;
}

interface TracksHoldGesture {
  button: HTMLButtonElement;
  pointerId: number;
  startX: number;
  startY: number;
  timer: number;
}

interface ModuleSoloHoldGesture {
  button: HTMLButtonElement;
  pointerId: number;
  startX: number;
  startY: number;
  timer: number;
}

interface OutputFaderDrag {
  fader: HTMLElement;
  input: HTMLInputElement;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
}

interface MetronomeFaderDrag {
  fader: HTMLElement;
  input: HTMLInputElement;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
}

interface EqBandDrag {
  bandIndex: number;
  moduleNumber: number;
  plot: HTMLElement;
  pointerId: number;
}

interface KnobDrag {
  input: HTMLInputElement;
  captureElement: HTMLElement;
  pointerId: number;
  startY: number;
  startX: number;
  moved: boolean;
}

type CcLearnTarget =
  | { kind: 'module-volume'; moduleNumber: number }
  | { kind: 'module-control'; moduleNumber: number; control: string; label: string }
  | { kind: 'module-octave'; moduleNumber: number; direction: -1 | 1 }
  | { kind: 'module-power'; moduleNumber: number }
  | { kind: 'module-input'; moduleNumber: number; input: 'sustain' | 'modulation' }
  | { kind: 'output-volume'; bus: OutputBus }
  | { kind: 'metronome-volume' }
  | { kind: 'metronome-toggle' }
  | { kind: 'tap-tempo' }
  | { kind: 'synth-preset'; presetNumber: number }
  // Banco A e Banco B são independentes: cada um tem os seus 8 presets mapeáveis.
  | { kind: 'preset'; bank: BankId; presetNumber: number }
  | { kind: 'pad'; bank: PadBankId; note: string }
  | { kind: 'effect'; bank: EffectBankId; effectNumber: number };

interface CcMappingOptions {
  inverted: boolean;
  limitPercent: number;
}

const DEFAULT_CC_MAPPING_OPTIONS: Readonly<CcMappingOptions> = {
  inverted: false,
  limitPercent: 100,
};

function isContinuousCcTarget(target: CcLearnTarget): boolean {
  if (target.kind === 'module-volume' || target.kind === 'output-volume' ||
      target.kind === 'metronome-volume') return true;
  return target.kind === 'module-control' &&
    target.control !== 'delay:tap' && target.control !== 'rotary:toggle'
    && !target.control.startsWith('rotary:speed:');
}

function normalizeCcMappingOptions(value: unknown): CcMappingOptions {
  const record = isRecord(value) ? value : {};
  return {
    inverted: record.inverted === true,
    limitPercent: Math.round(boundedNumber(record.limitPercent, 0, 100, 100) * 10) / 10,
  };
}

// O limite continua salvo como uma fração neutra (para manter backups
// compatíveis), mas o músico vê o ponto final real do controle que mapeou.
function formatCcLimit(target: CcLearnTarget, limitPercent: number): string {
  const progress = Math.min(1, Math.max(0, limitPercent / 100));
  if (target.kind === 'module-volume') {
    return formatFaderDb(visualPositionToFaderDb(progress));
  }
  if (target.kind === 'output-volume' || target.kind === 'metronome-volume') {
    return formatOutputDb(outputDbFromPosition(progress * 100));
  }
  if (target.kind !== 'module-control') return `${limitPercent}%`;

  const control = target.control;
  if (isModuleEnvelopeParameter(control)) {
    return formatEnvelopeTime(MODULE_ENVELOPE_LIMITS[control] * progress);
  }
  if (control === 'cutoff') return formatCutoffFrequency(cutoffFrequencyFromRatio(progress));
  if (control.startsWith('organ:drawbar:')) return String(Math.round(ORGAN_DRAWBAR_MAX * progress));

  if (control.startsWith('synth:')) {
    const parameter = control.slice('synth:'.length);
    const ranges: Record<string, readonly [number, number]> = {
      oscillator1Volume: [0, 100], oscillator2Volume: [0, 100], oscillator3Volume: [0, 100],
      oscillator1DetuneCents: [-100, 100], oscillator2DetuneCents: [-100, 100], oscillator3DetuneCents: [-100, 100],
      attackMs: [0, 15_000], holdMs: [0, 15_000], decayMs: [0, 25_000], releaseMs: [0, 25_000],
      filterCutoffHz: [20, 20_000], filterResonance: [0, 98], filterEnvelope: [-100, 100],
      lfoRateHz: [0.05, 30], lfoDepth: [0, 100], glideMs: [0, 5_000],
    };
    const range = ranges[parameter];
    if (!range) return `${limitPercent}%`;
    const value = parameter === 'filterCutoffHz'
      ? 20 * (1_000 ** progress)
      : range[0] + (range[1] - range[0]) * progress;
    if (parameter === 'oscillator1Volume' || parameter === 'oscillator2Volume' || parameter === 'oscillator3Volume') {
      return formatOscillatorVolume(value);
    }
    if (parameter.endsWith('Ms')) return formatEnvelopeTime(value);
    if (parameter === 'filterCutoffHz') return formatCutoffFrequency(value);
    if (parameter === 'lfoRateHz') return `${value.toFixed(2)} Hz`;
    if (parameter.endsWith('DetuneCents')) return `${Math.round(value)} cent`;
    return `${Math.round(value)}%`;
  }

  if (control.startsWith('arpeggiator:')) {
    const parameter = control.slice('arpeggiator:'.length);
    const ranges: Record<string, readonly [number, number]> = {
      octaves: [1, 4], gate: [10, 100], swing: [0, 75],
    };
    const range = ranges[parameter];
    if (!range) return `${limitPercent}%`;
    const value = range[0] + (range[1] - range[0]) * progress;
    return parameter === 'octaves' ? String(Math.round(value)) : `${Math.round(value)}%`;
  }

  if (control.startsWith('tranceGate:')) {
    const parameter = control.slice('tranceGate:'.length);
    const ranges: Record<string, readonly [number, number]> = {
      gate: [5, 100], depth: [0, 100], attackMs: [0.1, 100], releaseMs: [0.1, 100], swing: [0, 75],
    };
    const range = ranges[parameter];
    if (!range) return `${limitPercent}%`;
    const value = range[0] + (range[1] - range[0]) * progress;
    return parameter.endsWith('Ms') ? `${value.toFixed(value < 10 ? 1 : 0)} ms` : `${Math.round(value)}%`;
  }

  const separator = control.indexOf(':');
  const effectKind = control.slice(0, separator);
  const effectControl = control.slice(separator + 1);
  if (!isModuleEffectKind(effectKind) || !effectControl) return `${limitPercent}%`;
  const ranges: Record<string, readonly [number, number]> = {
    'compressor:thresholdDb': [-60, 0], 'compressor:ratio': [1, 20], 'compressor:gainDb': [0, 24],
    'compressor:attackMs': [0.1, 100], 'compressor:releaseMs': [10, 1_000], 'compressor:mix': [0, 100],
    'reverb:decay': [0.1, 20], 'reverb:dampen': [0, 100], 'reverb:size': [0, 100], 'reverb:mix': [0, 100],
    'delay:feedback': [0, 95], 'delay:mix': [0, 100], 'delay:milliseconds': [1, 2_000],
    'rotary:slowHz': [0.2, 2], 'rotary:fastHz': [2, 10], 'rotary:rampSeconds': [0.1, 10],
    'rotary:depth': [0, 100], 'rotary:mix': [0, 100],
    'chorus:rateHz': [0.05, 8], 'chorus:depth': [0, 100], 'chorus:mix': [0, 100],
    'cutoffEnvelope:attackMs': [0, 5_000], 'cutoffEnvelope:decayMs': [0, 5_000],
    'cutoffEnvelope:sustain': [0, 100], 'cutoffEnvelope:releaseMs': [0, 5_000],
    'cutoffEnvelope:depthOctaves': [0, 8],
  };
  const range = ranges[control];
  if (!range) return `${limitPercent}%`;
  return formatModuleEffectValue(
    effectKind,
    effectControl,
    range[0] + (range[1] - range[0]) * progress,
  );
}

interface EffectEditHoldGesture {
  button: HTMLButtonElement;
  pointerId: number;
  startX: number;
  startY: number;
  timer: number;
}

interface EffectPadState {
  active: boolean;
  audioFileName: string | null;
  colorIndex: number;
  gateRelease: 'infinite' | 'continue-press';
  name: string;
  triggerMode: 'toggle' | 'gate';
  volumeDb: number;
}

interface AccountControls {
  listDevices: () => Promise<DeviceOverviewResponse>;
  getAcquireLicenseUrl: () => Promise<string>;
  getCompatibilityVideoUrl: () => Promise<string>;
  getSupportUrl: () => Promise<string>;
  getSoundCatalog: () => Promise<SoundCatalogPayload>;
  getSoundAssetUrl: (objectKey: string, kind: 'sf2' | 'preview') => Promise<string>;
  getProfile: () => Promise<AccountProfile>;
  saveProfilePhoto: (imageDataUrl: string) => Promise<AccountProfile>;
  saveProfileName: (name: string) => Promise<AccountProfile>;
  confirmDeviceRemoval: (deviceId: string, password: string) => Promise<{ ok: true; currentDeviceRemoved: boolean }>;
  changePassword: (password: string, passwordConfirmation: string) => Promise<{ ok: true }>;
  finishCurrentDeviceRemoval: () => Promise<void>;
}

const MODULE_COUNT = 8;
// Faixa completa padrão de um piano de 88 teclas. Nesta interface a nota MIDI
// 60 é C3, portanto MIDI 21..108 aparece como A-1..C7.
const DEFAULT_MODULE_LOW_NOTE = 21;
const DEFAULT_MODULE_HIGH_NOTE = 108;
// Dezesseis presets por banco, em duas fileiras de oito, nos seis bancos.
const PRESET_COUNT = 16;
const PRESETS_PER_ROW = 8;
const EFFECT_PAD_MIN_DB = -60;
// Longest a knob or button change waits before it reaches the audio engine.
const NATIVE_SYNC_INTERVAL_MS = 24;
const DESKTOP_MODULE_METER_INTERVAL_MS = 50;
// Todo <select> dos modais vira o seletor próprio do app; o do sistema abre
// uma roda/lista nativa diferente em cada plataforma.
const APP_SELECT_QUERY = 'select[data-setting], select[data-module-setting]';
const MOBILE_MODULE_METER_INTERVAL_MS = 90;
const EFFECT_PAD_MAX_DB = 0;
const KNOB_FOCUS_IDLE_MS = 2_000;
const BANK_IDS: readonly BankId[] = ['A', 'B', 'C', 'D', 'E', 'F'];

function isHttpAssetReference(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

const PRESET_COLORS = [
  ['#ff5b38', '#65170b'],
  ['#ff8a22', '#6c2c06'],
  ['#ffc329', '#6b4a04'],
  ['#a8d82e', '#384f08'],
  ['#35d273', '#0a4f29'],
  ['#19c9aa', '#075147'],
  ['#19bfe8', '#07495f'],
  ['#3288ff', '#0a3269'],
  ['#5b68ff', '#202768'],
  ['#8957f2', '#342168'],
  ['#b84ce8', '#4d1764'],
  ['#e649ba', '#611546'],
  ['#ff4777', '#6c142d'],
  ['#ff684e', '#701f13'],
  ['#e89b31', '#62400d'],
  ['#57c957', '#174f1a'],
] as const;

function ccMappingKey(target: CcLearnTarget): string {
  if (target.kind === 'module-volume') return `module:${target.moduleNumber}`;
  if (target.kind === 'module-control') return `module-control:${target.moduleNumber}:${target.control}`;
  if (target.kind === 'module-octave') return `octave:${target.moduleNumber}:${target.direction > 0 ? 'up' : 'down'}`;
  if (target.kind === 'module-power') return `power:${target.moduleNumber}`;
  if (target.kind === 'module-input') return `input:${target.moduleNumber}:${target.input}`;
  if (target.kind === 'output-volume') return `output:${target.bus}`;
  if (target.kind === 'metronome-volume') return 'metronome:volume';
  if (target.kind === 'metronome-toggle') return 'metronome:toggle';
  if (target.kind === 'tap-tempo') return 'metronome:tap';
  if (target.kind === 'synth-preset') return `synth-preset:${target.presetNumber}`;
  if (target.kind === 'preset') return `preset:${target.bank}:${target.presetNumber}`;
  if (target.kind === 'pad') return `pad:${target.bank}:${target.note}`;
  return `effect:${target.bank}:${target.effectNumber}`;
}

function ccLearnTargetLabel(target: CcLearnTarget): string {
  if (target.kind === 'module-volume') return `Volume do módulo ${target.moduleNumber}`;
  if (target.kind === 'module-control') return `Módulo ${target.moduleNumber} · ${target.label}`;
  if (target.kind === 'output-volume') {
    const label = target.bus === 'effects'
      ? 'Efects'
      : target.bus === 'music'
        ? 'Músicas'
        : `${target.bus[0]?.toUpperCase() ?? ''}${target.bus.slice(1)}`;
    return `Volume ${label}`;
  }
  if (target.kind === 'module-octave') {
    return `Módulo ${target.moduleNumber} · OCT ${target.direction > 0 ? '+' : '-'}`;
  }
  if (target.kind === 'module-power') return `Módulo ${target.moduleNumber} · ON/OFF`;
  if (target.kind === 'module-input') {
    return `Módulo ${target.moduleNumber} · ${target.input === 'sustain' ? 'HLD' : 'MOD'}`;
  }
  if (target.kind === 'metronome-volume') return 'Volume do metrônomo';
  if (target.kind === 'metronome-toggle') return 'Ligar / desligar metrônomo';
  if (target.kind === 'tap-tempo') return 'Tap Tempo';
  if (target.kind === 'synth-preset') return `Synth · Preset ${target.presetNumber}`;
  if (target.kind === 'preset') {
    return `Banco ${target.bank} · Preset ${target.presetNumber.toString().padStart(2, '0')}`;
  }
  if (target.kind === 'pad') return `Pads ${PAD_BANK_IDS.indexOf(target.bank) + 1} · ${target.note}`;
  return `FX ${target.bank} · Efeito ${target.effectNumber}`;
}

function isCcMappingKey(value: string): boolean {
  if (/^module-bank:[A-F]:([1-9]|1[0-6]):[1-8]$/.test(value)) return true;
  if (/^module-control:[1-8]:tranceGate:(gate|depth|attackMs|releaseMs|swing)$/.test(value)) return true;
  if (/^module-control:[1-8]:synth:sustain$/.test(value)) return false;
  if (/^module:[1-8]$/.test(value)) return true;
  if (/^module-control:7:rotary:(slowHz|fastHz|rampSeconds|depth|mix|toggle|speed:(brake|slow|fast))$/.test(value)) return true;
  if (/^module-control:7:organ:drawbar:[0-8]$/.test(value)) return true;
  if (/^module-control:[1-8]:(attackMs|releaseMs|holdMs|decayMs|cutoff|(compressor|reverb|delay|chorus|cutoffEnvelope):[A-Za-z]+|synth:[A-Za-z]+|arpeggiator:(octaves|gate|swing))$/.test(value)) return true;
  if (/^octave:[1-8]:(up|down)$/.test(value)) return true;
  if (/^power:[1-8]$/.test(value)) return true;
  if (/^input:[1-8]:(sustain|modulation)$/.test(value)) return true;
  if (/^output:(music|pads|effects|master)$/.test(value)) return true;
  if (value === 'metronome:volume' || value === 'metronome:tap' || value === 'metronome:toggle') return true;
  if (/^synth-preset:[1-5]$/.test(value)) return true;
  if (/^pad:[ABCD]:(C|C#|D|D#|E|F|F#|G|G#|A|A#|B)$/.test(value)) return true;
  if (/^effect:[1-8]:([1-9]|1[0-2])$/.test(value)) return true;
  return /^preset:[A-F]:([1-9]|1[0-6])$/.test(value);
}

function ccMappingConflictScope(key: string): string {
  const bankFader = /^module-bank:([A-F]):([1-9]|1[0-6]):[1-8]$/.exec(key);
  return bankFader ? `bank-faders:${bankFader[1]}:${bankFader[2]}` : 'global';
}

function createEffectPadStates(): EffectPadState[] {
  return Array.from({ length: EFFECT_COUNT }, (_, index) => ({
    active: false,
    audioFileName: null,
    colorIndex: index % EFFECT_PAD_COLORS.length,
    gateRelease: 'infinite',
    name: `Efeito ${index + 1}`,
    triggerMode: 'toggle',
    volumeDb: EFFECT_PAD_MAX_DB,
  }));
}

let playerScreenSequence = 0;

function requiredElement<T extends Element>(parent: ParentNode, selector: string): T {
  const element = parent.querySelector<T>(selector);
  if (!element) throw new Error(`Elemento obrigatório não encontrado: ${selector}`);
  return element;
}

function createModuleMarkup(moduleNumber: number): string {
  const emptySoundName = moduleEmptySoundName(moduleNumber);
  const displayName = moduleDisplayName(moduleNumber);
  const synthModule = moduleNumber === 8;
  const organModule = moduleNumber === 7;
  return `
    <article class="player-module" data-module="${moduleNumber}" aria-label="Módulo ${displayName}">
      <span class="player-module__number" aria-hidden="true">${displayName}</span>
      <button
        class="player-module__settings-button"
        type="button"
        data-action="open-module-settings"
        data-module="${moduleNumber}"
        aria-label="Parâmetros do módulo ${moduleNumber}"
      >Config</button>

      <button
        class="player-module__sound-button"
        type="button"
        data-action="${synthModule ? 'open-synth' : organModule ? 'open-organ' : 'open-sound-selection'}"
        data-module="${moduleNumber}"
        aria-label="${synthModule ? 'Abrir editor do Synth'
          : organModule ? 'Abrir os drawbars do Organ'
          : `Escolher timbre do módulo ${moduleNumber}. Atual: ${emptySoundName}`}"
      >
        <span class="player-module__sound-label${synthModule || organModule ? '' : ' is-empty'}">${
          synthModule ? 'Synth' : organModule ? 'Organ' : '+'}</span>
      </button>

      <div class="player-module__control-body">
        <div class="player-module__fader-stack">
          ${createModuleFaderMarkup(moduleNumber)}
          <button
            class="player-module__power-button is-on"
            type="button"
            data-action="toggle-module"
            data-module="${moduleNumber}"
            aria-pressed="true"
            aria-label="Desligar módulo ${moduleNumber}"
          >ON</button>
        </div>
        <div class="player-module__actions" aria-label="Controles do módulo ${moduleNumber}">
          <div class="player-module__action-pair">
            <button
              class="player-module__action-button player-module__range-button"
              type="button"
              data-action="learn-note-range"
              data-bound="low"
              data-module="${moduleNumber}"
              aria-pressed="false"
              aria-label="Definir nota inicial do módulo ${moduleNumber}"
            >${formatMidiNote(DEFAULT_MODULE_LOW_NOTE)}</button>
            <button
              class="player-module__action-button player-module__range-button"
              type="button"
              data-action="learn-note-range"
              data-bound="high"
              data-module="${moduleNumber}"
              aria-pressed="false"
              aria-label="Definir nota final do módulo ${moduleNumber}"
            >${formatMidiNote(DEFAULT_MODULE_HIGH_NOTE)}</button>
          </div>
          <div class="player-module__action-pair">
            <button
              class="player-module__action-button"
              type="button"
              data-action="octave-up"
              data-module="${moduleNumber}"
              aria-label="Subir uma oitava no módulo ${moduleNumber}"
            >OCT +</button>
            <button
              class="player-module__action-button"
              type="button"
              data-action="octave-down"
              data-module="${moduleNumber}"
              aria-label="Descer uma oitava no módulo ${moduleNumber}"
            >OCT -</button>
          </div>
          <div class="player-module__action-pair">
            <button
              class="player-module__action-button player-module__filter-button"
              type="button"
              data-action="toggle-sustain-input"
              data-module="${moduleNumber}"
              aria-pressed="false"
              aria-label="Desativar pedal sustain no módulo ${moduleNumber}"
            >HLD</button>
            <button
              class="player-module__action-button player-module__filter-button"
              type="button"
              data-action="toggle-modulation-input"
              data-module="${moduleNumber}"
              aria-pressed="false"
              aria-label="Desativar modulation CC1 no módulo ${moduleNumber}"
            >MOD</button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function createPresetMarkup(
  presetNumber: number,
  isSelected: boolean,
  presetName = 'Preset',
): string {
  const colors = PRESET_COLORS[presetNumber - 1] ?? PRESET_COLORS[0];
  return `
    <button
      class="player-preset-button${isSelected ? ' is-selected' : ''}"
      type="button"
      data-action="select-preset"
      data-preset="${presetNumber}"
      aria-label="Preset ${presetNumber}: ${presetName}"
      aria-pressed="${isSelected}"
      style="--preset-accent: ${colors[0]}; --preset-dark: ${colors[1]}"
    >
      <span class="player-preset-button__number">${presetNumber.toString().padStart(2, '0')}</span>
      <span class="player-preset-button__label">${presetName}</span>
    </button>
  `;
}

function createPresetRowsMarkup(selectedPreset: number | null): string {
  return Array.from({ length: PRESET_COUNT / PRESETS_PER_ROW }, (_, rowIndex) => {
    const firstPreset = rowIndex * PRESETS_PER_ROW + 1;
    const row = Array.from(
      { length: PRESETS_PER_ROW },
      (_, index) => {
        const presetNumber = firstPreset + index;
        return createPresetMarkup(presetNumber, presetNumber === selectedPreset);
      },
    ).join('');

    return `<div class="player-presets__row">${row}</div>`;
  }).join('');
}

// Barras baixas enquanto a música decodifica; a waveform real chega depois
// que o modal já apareceu.
function createWaveformBarsMarkup(): string {
  return Array.from({ length: TRACK_WAVEFORM_BARS }, () => '<i style="--wave-height:8%"></i>').join('');
}

function createNewPasswordMarkup(useTabletKeyboard: boolean): string {
  const tabletInputAttributes = useTabletKeyboard ? ' readonly inputmode="none"' : '';
  return `
    <section class="user-password-reset">
      <strong>Crie uma nova senha</strong>
      <p>Use pelo menos 8 caracteres.</p>
      <label>
        <span>Nova senha</span>
        <input type="password" minlength="8" maxlength="128" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" aria-label="Nova senha" data-new-password${tabletInputAttributes}>
      </label>
      <label>
        <span>Confirme a senha</span>
        <input type="password" minlength="8" maxlength="128" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" aria-label="Confirmar nova senha" data-confirm-new-password${tabletInputAttributes}>
      </label>
      <p class="user-device-message is-error" role="alert" aria-live="polite"></p>
      <button type="button" data-modal-action="save-password-reset" disabled>Salvar senha</button>
    </section>
  `;
}

function createSoundDownloadMarkup(sound: FixedSoundDefinition | null, installed: boolean, downloading = false): string {
  if (!sound) {
    return '<section class="sound-download"><p>Este timbre não está mais disponível na biblioteca.</p></section>';
  }
  const sizeLabel = sound.byteSize ? formatBytes(sound.byteSize) : null;
  const dateLabel = formatPublishedDate(sound.publishedAt);
  return `
    <section class="sound-download" style="--sound-button-color:${escapeMarkup(sound.color)}">
      <div class="sound-download__identity">
        <span aria-hidden="true"></span>
        <div><small>${installed ? 'Salvo neste dispositivo' : 'Disponível para download'}</small><strong>${escapeMarkup(sound.name)}</strong></div>
      </div>
      ${sizeLabel || dateLabel ? `
        <div class="sound-download__meta">
          ${sizeLabel ? `<span data-sound-download-size>${sizeLabel}</span>` : ''}
          ${dateLabel ? `<span data-sound-download-date>${dateLabel}</span>` : ''}
        </div>
      ` : ''}
      ${installed ? `
        <button class="sound-download__remove" type="button" data-modal-action="uninstall-sound">Desinstalar</button>
      ` : `
        <div class="sound-download__buttons">
          <button class="sound-download__preview" type="button" data-modal-action="preview-sound"${sound.previewObjectKey ? '' : ' disabled'}><b aria-hidden="true">▶</b><span>Ouvir preview</span></button>
          <button class="sound-download__install" type="button" data-modal-action="download-sound"${sound.sf2ObjectKey && !downloading ? '' : ' disabled'}>${downloading ? 'Baixando…' : 'Baixar'}</button>
        </div>
        <div class="sound-download__progress" data-sound-download-progress aria-hidden="true"><i></i></div>
      `}
      <p class="sound-download__message" data-sound-download-message role="status" aria-live="polite">${
        !sound.sf2ObjectKey && !sound.previewObjectKey
          ? 'Arquivos ainda não publicados'
          : !sound.sf2ObjectKey
            ? 'SF2 ainda não publicado'
            : !sound.previewObjectKey
              ? 'Preview ainda não publicado'
              : downloading
                ? 'Baixando… acompanhe o progresso no topo da tela.'
                : ''
      }</p>
    </section>
  `;
}

function createPerformanceDownloadMarkup(asset: PerformanceAssetDefinition | null): string {
  if (!asset) return '<section class="sound-download"><p>Este som não está mais disponível.</p></section>';
  return `
    <section class="sound-download">
      <div class="sound-download__identity">
        <span aria-hidden="true"></span>
        <div><small>${asset.kind === 'pad' ? `Pads ${asset.bank}` : `FX ${asset.bank}`}</small><strong>${escapeMarkup(asset.name)}</strong></div>
      </div>
      <button class="sound-download__install" type="button" data-modal-action="download-performance"${asset.assetUrl ? '' : ' disabled'}>Baixar</button>
      <div class="sound-download__progress" data-sound-download-progress aria-hidden="true"><i></i></div>
      <p class="sound-download__message" data-sound-download-message role="status" aria-live="polite">${asset.assetUrl ? (asset.byteSize ? formatBytes(asset.byteSize) : 'Pronto para baixar') : 'Arquivo ainda não publicado'}</p>
    </section>
  `;
}

function cutoffConfigTabsMarkup(active: 'velocity' | 'env-filter'): string {
  return `
    <div class="cutoff-config-tabs" role="tablist" aria-label="Config do Cutoff">
      <button type="button" data-cutoff-config-tab="velocity" class="${active === 'velocity' ? 'is-selected' : ''}" role="tab" aria-selected="${active === 'velocity'}">Velocity</button>
      <button type="button" data-cutoff-config-tab="env-filter" class="${active === 'env-filter' ? 'is-selected' : ''}" role="tab" aria-selected="${active === 'env-filter'}">Env-Filter</button>
    </div>
  `;
}

function createBackupDownloadMarkup(sounds: readonly FixedSoundDefinition[]): string {
  const knownBytes = sounds.reduce((total, sound) => total + (sound.byteSize ?? 0), 0);
  return `
    <section class="backup-download">
      <p data-backup-download-message>
        As configurações já foram aplicadas. ${sounds.length} timbre(s) usado(s) no backup ainda não estão neste dispositivo.
        ${knownBytes > 0 ? `Download estimado: ${formatBytes(knownBytes)}.` : ''}
      </p>
      <div class="backup-download__list">
        ${sounds.map((sound) => `<span style="--sound-button-color:${escapeMarkup(sound.color)}"><i></i>${escapeMarkup(sound.name)}</span>`).join('')}
      </div>
    </section>
  `;
}

function createBankState(selectedPreset: number | null = null): BankState {
  return {
    faderMode: 'default',
    masterVolumes: Array.from({ length: MODULE_COUNT }, () => 0),
    name: '',
    selectedPreset,
    presets: Array.from({ length: PRESET_COUNT }, () => ({
      name: 'Preset',
      modules: Array.from({ length: MODULE_COUNT }, (_, moduleIndex) => ({
        category: '',
        // Todo módulo nasce desligado: o usuário liga o que for usar.
        enabled: false,
        highNote: DEFAULT_MODULE_HIGH_NOTE,
        lowNote: DEFAULT_MODULE_LOW_NOTE,
        modulationInputEnabled: true,
        midiInputId: null,
        octaveShift: 0,
        sustainInputEnabled: true,
        timbreId: null,
        timbreName: moduleEmptySoundName(moduleIndex + 1),
        timbreColor: null,
        volumeDb: 0,
        settings: createDefaultModuleSettings(moduleIndex),
        settingsMode: moduleIndex < 6 ? 'default' : 'user',
        userSettings: null,
      })),
    })),
  };
}

// Uma linha só: Copy/Paste, os seis bancos e, no app, o botão que troca os
// presets pelo Keyboard. No desktop o Keyboard fica sempre à mostra, então lá
// esse botão não existe.
function createBankNavigationMarkup(withViewToggle: boolean): string {
  const banks = BANK_IDS.map((bank) => `
    <button
      class="player-navigation__button player-navigation__bank-button${bank === 'A' ? ' is-selected' : ''}"
      type="button"
      data-action="show-bank"
      data-bank="${bank}"
      data-bank-mode-label="Default"
      aria-label="Banco ${bank}"
      aria-pressed="${bank === 'A'}"
    >${bank}</button>
  `).join('');
  return `
    <button
      class="player-navigation__button player-navigation__bank-button player-preset-copy-button"
      type="button"
      data-action="copy-preset"
      data-copy-state="idle"
      aria-label="Copiar o preset selecionado"
    >Copy</button>
    ${banks}
    ${withViewToggle ? `
      <button
        class="player-navigation__button player-presets__view-button"
        type="button"
        data-action="toggle-bottom-view"
        data-bottom-view="presets"
        aria-label="Mostrando os presets. Tocar para mostrar o Keyboard"
      >Presets</button>
    ` : ''}
  `;
}

export function isCellularPlayerViewport(width: number, height: number, desktopRuntime: boolean): boolean {
  // O player nativo abre em paisagem. Usar o menor lado separa celulares de
  // tablets e continua correto durante a transicao de orientacao do login.
  return !desktopRuntime && Math.min(width, height) <= 520;
}

export class PlayerScreen {
  private readonly instanceId = ++playerScreenSequence;
  private readonly desktopRuntime = isDesktopRuntime();
  private readonly cellularLayout = isCellularPlayerViewport(window.innerWidth, window.innerHeight, this.desktopRuntime);
  private readonly iosRuntime = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  private readonly handleRootClick = (event: Event) => this.onRootClick(event);
  private readonly handleRootPointerDown = (event: PointerEvent) => this.onRootPointerDown(event);
  private readonly handleRootPointerMove = (event: PointerEvent) => this.onRootPointerMove(event);
  private readonly handleRootPointerEnd = (event: PointerEvent) => this.onRootPointerEnd(event);
  private readonly handleKnobFocusOutsidePointerDown = (event: PointerEvent) => {
    const overlay = this.root.querySelector<HTMLElement>('[data-knob-focus]');
    if (!overlay?.classList.contains('is-visible')) return;
    const target = event.target;
    if (target instanceof Element && target.closest('.knob-focus__card')) return;
    this.hideKnobFocus();
  };
  private readonly handleRootContextMenu = (event: Event) => this.onRootContextMenu(event);
  private readonly handleRootInput = (event: Event) => this.onRootInput(event);
  private readonly handlePageHide = () => this.flushPlayerStateSave(true);
  private readonly handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      this.flushPlayerStateSave(true);
      return;
    }
    // iOS/Android podem suspender a rota enquanto o app fica em segundo plano.
    // Ao voltar, valide e recupere antes do próximo toque do músico.
    this.nativeEngineReady = false;
    void this.ensureNativeAudioReady().catch(() => undefined);
  };
  private readonly handleModalKeydown = (event: KeyboardEvent) => this.onModalKeydown(event);
  private readonly handleDesktopPlaylistKeydown = (event: KeyboardEvent) => this.onDesktopPlaylistKeydown(event);
  private modal: HTMLElement | null = null;
  private modalTrigger: HTMLElement | null = null;
  private userPhotoCrop: {
    image: HTMLImageElement;
    canvas: HTMLCanvasElement;
    zoom: number;
    offsetX: number;
    offsetY: number;
    drag: { pointerId: number; x: number; y: number } | null;
  } | null = null;
  private tracksPanelController: TracksPanelController | null = null;
  private tabletInputKeyboardController: TabletInputKeyboardController | null = null;
  private splitTracksController: TracksPanelController | null = null;
  private outputFaderController: OutputFaderPanelController | null = null;
  private trackTransport: TrackTransportController | null = null;
  private tracksAutoEnabled = false;
  private tracksLoopEnabled = false;
  private visibleTrackSequence: LocalTrack[] = [];
  private renderedQueuedTrackName = '';
  private readonly displayedPerformanceNotes = new Map<string, number>();
  private readonly pendingKeyboardNoteStates = new Map<number, boolean>();
  private performanceDisplayFrame: number | null = null;
  private trackPlaybackSnapshot: TrackPlaybackSnapshot = {
    progress: 0,
    queueProgress: 0,
    queuedTrackId: null,
    queuedTrackName: null,
    queueSource: null,
    selectedTrackId: null,
    playingTrackId: null,
    state: 'empty',
  };
  private readonly faders = new Map<number, ModuleFader>();
  private readonly soundLibrary: SoundLibraryStore;
  private readonly soundCatalogCache: SoundCatalogCache;
  private soundCatalog: SoundCatalog;
  private soundLibraryEngine: SoundLibraryEngine;
  private installedFixedSoundIds = new Set<string>();
  // Timbres que o usuário já abriu ao menos uma vez: perdem a faixa RGB e o
  // rótulo "new". Sincroniza com a conta, então some em todos os aparelhos.
  private seenSoundIds = new Set<string>();
  private selectedCatalogSoundId: string | null = null;
  private selectedPerformanceAsset: PerformanceAssetDefinition | null = null;
  private pendingBackupDownloads: FixedSoundDefinition[] = [];
  private backupDownloadLimit = 0;
  private soundDownloadAbort: AbortController | null = null;
  // Downloads individuais entram numa fila única. Só o primeiro usa rede e
  // atualiza o banner; os demais aguardam sem fazer o nome do topo oscilar.
  private readonly activeSoundDownloads = new Map<string, {
    sound: FixedSoundDefinition;
    percentage: number | null;
    abort: AbortController;
    state: 'queued' | 'downloading';
  }>();
  private soundDownloadQueueRunning = false;
  private soundDownloadBatchIds: Set<string> | null = null;
  private readonly fixedSoundHoldGesture = new LongPressGesture(700, 10);
  private readonly userSoundfontHoldGesture = new LongPressGesture(700, 10);
  private readonly synthPresetHoldGesture = new LongPressGesture(700, 10);
  private readonly bankHoldGesture = new LongPressGesture(560, 10);
  private readonly moduleConfigHoldGesture = new LongPressGesture(560, 10);
  private readonly moduleModulationIntensityHoldGesture = new LongPressGesture(560, 10);
  private suppressNextFixedSoundClick = false;
  private suppressNextUserSoundfontClick = false;
  private suppressNextSynthPresetClick = 0;
  private missingUserSoundfonts: MissingUserSoundfont[] = [];
  private readonly trackLibrary: TrackLibraryStore;
  private readonly effectAudioLibrary: EffectAudioStore;
  // Cada pad reaproveita a URL do arquivo, mas pode ter várias vozes tocando
  // juntas no Gate + Infinite Release.
  private readonly effectPadAudio = new Map<string, { url: string; voices: Set<HTMLAudioElement> }>();
  private readonly effectAudioBaseGain = new WeakMap<HTMLAudioElement, number>();
  private effectAudioContext: AudioContext | null = null;
  private effectMeterSilentTap: GainNode | null = null;
  private readonly effectAudioAnalysers = new Map<HTMLAudioElement, {
    source: MediaElementAudioSourceNode;
    splitter: ChannelSplitterNode;
    analysers: [AnalyserNode, AnalyserNode];
  }>();
  private readonly effectMeterBuffers: [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] = [
    new Float32Array(2048), new Float32Array(2048),
  ];
  private readonly metronome = new MetronomeEngine(() => this.renderMetronomeState());
  private readonly patternPlayback = new PatternPlaybackController(
    (moduleNumber) => this.createPatternPlaybackSnapshot(moduleNumber),
    (_moduleNumber, slot, status, note, velocity) => this.sendNativeMidi(slot, status, note, velocity),
    (moduleNumber, step) => this.renderPatternPulse(moduleNumber, step),
  );
  private readonly midiInput = new MidiInputService((input) => {
    this.handleMidiNote(input);
  }, (input) => {
    this.handleMidiControlChange(input);
  }, () => {
    this.syncKeyboardExpressionInput();
    if (this.currentModalKind === 'app-settings-midi' && this.modal) {
      this.refreshMidiDeviceOptions(this.modal);
    } else if (this.currentModalKind === 'module-settings' && this.modal) {
      this.refreshModuleMidiOptions(this.modal, this.currentModalModuleNumber);
    }
  }, (input) => {
    this.handleMidiPitchBend(input);
  });
  private mounted = false;
  private logoutBusy = false;
  private pendingNoteLearn: PendingNoteLearn | null = null;
  private pendingBankEdit: BankId | null = null;
  private pendingEffectBankEdit: EffectBankId | null = null;
  private moduleConfigCopySource: number | null = null;
  private suppressNextBankClick = false;
  private suppressNextModuleConfigClick = false;
  private suppressNextModuleModulationClick: HTMLButtonElement | null = null;
  private presetHoldGesture: PresetHoldGesture | null = null;
  private tracksHoldGesture: TracksHoldGesture | null = null;
  private capturedTracksPointer: { button: HTMLButtonElement; pointerId: number } | null = null;
  private outputFaderDrag: OutputFaderDrag | null = null;
  private metronomeFaderDrag: MetronomeFaderDrag | null = null;
  private eqBandDrag: EqBandDrag | null = null;
  private knobDrag: KnobDrag | null = null;
  // Um por dedo: no Hammond de verdade dá pra puxar vários drawbars ao mesmo
  // tempo, então isPrimary não vale aqui — cada ponteiro tem sua própria entrada.
  private readonly organDrawbarDrags = new Map<number, { track: HTMLElement; moduleNumber: number }>();
  // Página aberta no Config. O topo e o rodapé do painel não mudam; só o miolo.
  // Cada módulo lembra a própria página; abrir outro módulo começa na primeira.
  private moduleConfigPage: ModuleSettingsPage = 'envelope';
  private readonly moduleConfigPages = new Map<number, ModuleSettingsPage>();
  // O visor flutuante do knob fica mais um instante depois que o dedo sai:
  // dá para soltar e voltar a arrastar sem recomeçar o gesto.
  private knobFocusHideTimer: number | null = null;
  private knobFocusInput: HTMLInputElement | null = null;
  private tempoDrag: { button: HTMLButtonElement; pointerId: number; startY: number; startX: number;
    startBpm: number; moved: boolean; held: boolean } | null = null;
  private lastDelayTapAt: number | null = null;
  private performanceKeyboard: PerformanceKeyboardController | null = null;
  private computerKeyboard: ComputerKeyboardController | null = null;
  private keyboardMidiRouter: KeyboardMidiRouter | null = null;
  private keyboardExpression: KeyboardExpressionController | null = null;
  private keyboardExpressionRouteKey = '';
  private readonly keyboardSettingsHoldGesture = new LongPressGesture();
  // Toque longo no botão Mono/Poly: abre Legato + tempo do Portamento.
  private readonly voiceModeHoldGesture = new LongPressGesture();
  private suppressNextVoiceModeClick = false;
  private suppressNextKeyboardViewClick = false;
  // Toque longo no botão Keyboard: quatro oitavas com teclas mais largas.
  private readonly bottomViewHoldGesture = new LongPressGesture();
  private suppressNextBottomViewClick = false;
  private keyboardOctaveSpan: 'full' | 'four' = 'full';
  private readonly outputFaderLearnGesture = new LongPressGesture(2_000);
  private readonly metronomeFaderLearnGesture = new LongPressGesture(2_000);
  private readonly ccControlHoldGesture = new LongPressGesture();
  private readonly knobCcLearnGesture = new LongPressGesture(2_000, 8);
  private readonly faderDoubleTap = new DoubleTapTracker();
  // Preset copiado pelo Copy, esperando o Paste. declinedTarget: o preset em
  // que o usuário cancelou a confirmação; tocar Paste de novo nele cancela tudo.
  private presetClipboard: {
    preset: PresetState;
    bank: BankId;
    presetNumber: number;
    declinedTarget: string | null;
  } | null = null;
  private readonly metronomeHoldGesture = new LongPressGesture();
  private readonly tempoHoldGesture = new LongPressGesture();
  private readonly keyboardAccentGesture = new LongPressGesture(520, 8);
  private pendingCcLearn: CcLearnTarget | null = null;
  private pendingCcController: number | null = null;
  private pendingCcInverted = false;
  private pendingCcLimitPercent = 100;
  private pendingCcClear: CcLearnTarget | null = null;
  private readonly ccMappings = new Map<string, number>();
  private readonly ccMappingOptions = new Map<string, CcMappingOptions>();
  private readonly lastCcValues = new Map<string, { value: number; receivedAt: number }>();
  private effectEditHoldGesture: EffectEditHoldGesture | null = null;
  private effectEditMode = false;
  private pressedKeyboardKey: { button: HTMLButtonElement; pointerId: number } | null = null;
  // Toque longo no botão que abre a biblioteca/organ/synth de um módulo:
  // solo único, o módulo soado ganha contorno RGB e os outros ficam P&B.
  private moduleSoloHoldGesture: ModuleSoloHoldGesture | null = null;
  private soloedModuleNumber: number | null = null;
  private suppressNextModuleSoundClick = false;
  private suppressNextPresetClick = false;
  private suppressNextTracksClick = false;
  private suppressNextEffectBankClick = false;
  private suppressNextMetronomeClick = false;
  private suppressNextTempoClick = false;
  private suppressNextCcControlClick: HTMLElement | null = null;
  private modalHistory: ModalRoute[] = [];
  private currentModalKind: ModalKind | null = null;
  private currentModalModuleNumber: number | null = null;
  private stateChangedBeforeRestore = false;
  private nativeSyncTimer: number | null = null;
  private nativeSyncInFlight = false;
  private nativeSyncRequested = false;
  private audioDeviceMonitorTimer: number | null = null;
  private selectedAudioDeviceMissCount = 0;
  private moduleMeterTimer: number | null = null;
  private ramMeterTimer: number | null = null;
  private readonly moduleMeterDb = Array.from({ length: 8 }, () => [MODULE_FADER_MIN_DB, MODULE_FADER_MIN_DB]);
  private readonly outputMeterDb: Record<string, number[]> = {
    music: [-60, -60], pads: [-60, -60], effects: [-60, -60], click: [-60, -60], modules: [-60, -60],
  };
  private readonly compressorMeterDb = [-60, -60];
  private renderedAnalysisModuleIndex: number | null = null;
  private playerStateSaveTimer: number | null = null;
  private playerStateDirty = false;
  private nativeEngineSyncQueue: Promise<void> = Promise.resolve();
  private liveMidiEnabled = false;
  private nativeRecoveryPromise: Promise<void> | null = null;
  private nativeSoundfontSyncQueue: Promise<void> = Promise.resolve();
  private soundfontSelectionRevision = 0;
  private nativeBootPromise: Promise<void> = Promise.resolve();
  private catalogReady: Promise<void> = Promise.resolve();
  private nativeEngineReady = false;
  private nativeEngineSyncError: unknown = null;
  private nativeAudioOutputSync: Promise<void> = Promise.resolve();
  private audioRestartOverlay: HTMLElement | null = null;
  private audioRestartFeedbackDepth = 0;
  private readonly nativeLoadedTimbres: (string | null)[] = Array.from({ length: MODULE_COUNT }, () => null);
  private nativePresetTransitionPending = false;
  private nativePresetTransitionInFlight = false;
  private selectedMidiInputIds: (string | null)[] = [null, null, null];
  private readonly audioOutput = new AudioOutputService();
  private audioDevices: AudioOutputDevice[] = [];
  private selectedAudioDeviceId = '';
  private audioRouting: AudioBusRouting = { ...DEFAULT_AUDIO_ROUTING };
  private bufferSize: BufferSize = DEFAULT_BUFFER_SIZE;
  private sampleRate: SampleRate = DEFAULT_SAMPLE_RATE;
  private audioLoadPercent = 0;
  private audioLoadAlarmUntil = 0;
  private compatibilityMode = false;
  private seamlessPresetSwitching = false;
  // Modo Lite: as teclas do teclado param de acender ao toque. É o que pesa
  // num iPad antigo, e ele não convive com a troca de preset sem corte.
  private liteMode = false;
  private bottomView: PlayerBottomView = 'presets';
  private keyboardMidiSlot = 1;
  private keyboardStyle: PerformanceKeyboardStyle = 'standard';
  private pendingCompatibilityMode: boolean | null = null;
  private compatibilityVideoUrl = '';
  // Controles de entrada globais: são somados antes da distribuição para os
  // módulos e nunca alteram o Oct particular salvo em cada um.
  private globalOctaveShift = 0;
  private globalTransposeSemitones = 0;
  // Somente os oito módulos: Mono soma L+R e duplica a soma em cada canal da
  // rota escolhida. Playlist, pads, efeitos e metrônomo não usam este estado.
  private moduleOutputMono = false;
  private outputLevels: OutputLevels = { ...DEFAULT_OUTPUT_LEVELS };
  private outputEnabled: OutputEnabledState = { ...DEFAULT_OUTPUT_ENABLED };
  private activeView: PlayerView = 'bank';
  private activeBank: BankId = 'A';
  private activePadBank: PadBankId = 'A';
  private activeEffectBank: EffectBankId = '1';
  private readonly padBankSelections = new Map<PadBankId, string | null>(
    PAD_BANK_IDS.map((bank) => [bank, null]),
  );
  private readonly effectPadStates = new Map<EffectBankId, EffectPadState[]>(
    EFFECT_BANK_IDS.map((bank) => [bank, createEffectPadStates()]),
  );
  private readonly effectBankNames = new Map<EffectBankId, string>(
    EFFECT_BANK_IDS.map((bank) => [bank, `FX ${bank}`]),
  );
  private readonly bankStates = new Map<BankId, BankState>(
    BANK_IDS.map((bank) => [bank, createBankState(bank === 'A' ? 1 : null)]),
  );

  constructor(
    private readonly root: HTMLElement,
    private readonly account: HookKeysAccount,
    private readonly onLogout: LogoutCallback,
    private readonly accountControls: AccountControls,
    private readonly playerState: PlayerStateService,
    private readonly playerBackup: PlayerBackupService,
  ) {
    this.soundLibrary = new SoundLibraryStore(account.email);
    this.soundCatalogCache = new SoundCatalogCache(account.email);
    this.soundCatalog = new SoundCatalog(this.soundCatalogCache.read());
    this.soundLibraryEngine = this.createSoundLibraryEngine(this.soundCatalog);
    this.trackLibrary = new TrackLibraryStore(account.email);
    this.effectAudioLibrary = new EffectAudioStore(account.email);
  }

  mount(): void {
    if (this.mounted) return;
    this.mounted = true;

    const modules = Array.from(
      { length: MODULE_COUNT },
      (_, index) => createModuleMarkup(index + 1),
    ).join('');

    this.root.innerHTML = `
      <main class="app-screen player-screen player-screen--tablet${this.cellularLayout ? ' player-screen--cellular' : ''} is-bank-view" data-player-screen="${this.instanceId}">
        <div class="player-primary">
          <div class="player-top-transport">
            <div class="player-top-brand-actions">
              <button
                class="player-brand"
                type="button"
                data-action="open-about"
                aria-label="Sobre o Hook Keys"
              >
                <img class="player-brand__image" src="/assets/icons/256x256.png" alt="">
                <span class="player-brand__name"><strong>Hook</strong> Keys</span>
              </button>
            </div>
            ${createTrackTransportMarkup()}
            <section class="track-download" data-track-download role="status" aria-live="polite" hidden>
              <strong>Baixando pacote</strong>
              <span data-track-download-name></span>
              <div class="track-download__progress" aria-hidden="true"><i></i></div>
              <output data-track-download-percent>0%</output>
            </section>
            <div class="player-global-pitch" role="group" aria-label="Oitava e transpose gerais">
              <div class="player-global-pitch__group" aria-label="Oitava geral">
                <button
                  class="player-global-pitch__button"
                  type="button"
                  data-action="global-octave-down"
                  aria-label="Descer uma oitava na entrada geral. Ajuste atual: ${this.globalOctaveShift}"
                >${this.globalOctaveShift < 0 ? `OCT − ${Math.abs(this.globalOctaveShift)}` : 'OCT −'}</button>
                <button
                  class="player-global-pitch__button"
                  type="button"
                  data-action="global-octave-up"
                  aria-label="Subir uma oitava na entrada geral. Ajuste atual: ${this.globalOctaveShift}"
                >${this.globalOctaveShift > 0 ? `OCT + ${this.globalOctaveShift}` : 'OCT +'}</button>
              </div>
              <span class="player-global-pitch__separator" aria-hidden="true">|</span>
              <div class="player-global-pitch__group" aria-label="Transpose geral">
                <button
                  class="player-global-pitch__button"
                  type="button"
                  data-action="global-transpose-down"
                  aria-label="Descer um semitom o transpose geral. Ajuste atual: ${this.globalTransposeSemitones}"
                >${this.globalTransposeSemitones < 0 ? `TRS − ${Math.abs(this.globalTransposeSemitones)}` : 'TRS −'}</button>
                <button
                  class="player-global-pitch__button"
                  type="button"
                  data-action="global-transpose-up"
                  aria-label="Subir um semitom o transpose geral. Ajuste atual: ${this.globalTransposeSemitones}"
                >${this.globalTransposeSemitones > 0 ? `TRS + ${this.globalTransposeSemitones}` : 'TRS +'}</button>
              </div>
              <span class="player-global-pitch__separator" aria-hidden="true">|</span>
              <button
                class="player-global-pitch__button player-global-pitch__output-mode${this.moduleOutputMono ? ' is-mono' : ''}"
                type="button"
                data-action="toggle-module-output-mode"
                aria-pressed="${this.moduleOutputMono}"
                aria-label="Saída dos módulos em ${this.moduleOutputMono ? 'Mono dual' : 'Stereo'}. Alternar para ${this.moduleOutputMono ? 'Stereo' : 'Mono dual'}"
              >${this.moduleOutputMono ? 'MONO' : 'STEREO'}</button>
              <span class="player-global-pitch__separator" aria-hidden="true">|</span>
              <button
                class="player-global-pitch__button player-panic-button"
                type="button"
                data-action="panic"
                aria-label="Panic: interromper imediatamente todas as notas"
              >PANIC</button>
            </div>
            <div class="player-top-actions">
              <button
                class="player-navigation__button player-navigation__settings-button"
                type="button"
                data-action="open-app-settings"
                aria-label="Configurações"
              ><svg class="player-header-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Z"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4.9a7.5 7.5 0 0 0-2.6-1.5L14 2.4h-4l-.4 2.5a7.5 7.5 0 0 0-2.6 1.5l-2.4-.9-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-.9a7.5 7.5 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.5 7.5 0 0 0 2.6-1.5l2.4.9 2-3.4-2-1.6Z"/></svg></button>
              <button class="player-account__user-button" type="button" data-action="open-user" aria-label="Conta"><svg class="player-header-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg></button>
              ${this.desktopRuntime ? `
              <div class="player-cpu-meter" role="status" data-cpu-meter
                title="Custo do callback de audio contra o prazo do buffer. Vermelho no teto e onde o som corta.">
                <small>CPU</small>
                <strong data-cpu-meter-value>--</strong>
              </div>` : ''}
              ${this.desktopRuntime || Capacitor.isNativePlatform() ? `
              <div class="player-cpu-meter player-ram-meter" role="status" data-ram-meter
                title="Memória usada no aparelho">
                <small>RAM</small>
                <strong data-ram-meter-value>--</strong>
              </div>` : ''}
            </div>
          </div>

          <header class="player-header">
          <nav class="player-navigation" aria-label="Áreas e bancos">
            <button
              class="player-navigation__button player-navigation__pads-button"
              type="button"
              data-action="show-pads-effects"
              aria-pressed="false"
            >Pads - Efects</button>
            <section class="player-header-knobs" aria-label="Volumes principais">
              ${createOutputKnobMarkup('music', 'Playlist', this.outputLevels.music)}
              ${createOutputKnobMarkup('pads', 'Pads', this.outputLevels.pads)}
              ${createOutputKnobMarkup('effects', 'Efects', this.outputLevels.effects)}
              ${createMetronomeKnobMarkup(this.metronome.getVolume())}
              ${createOutputKnobMarkup('master', 'Módulos', this.outputLevels.master)}
            </section>
          </nav>

          <div class="player-account">
            <button class="player-metronome-button" type="button" data-action="toggle-metronome" aria-pressed="false" aria-label="Ligar metrônomo">
              <svg viewBox="0 0 32 32" aria-hidden="true">
                <path d="M10 27h12L19 5h-6L10 27Z"></path>
                <path d="m16 9-3 12"></path>
                <path d="M7 27h18"></path>
              </svg>
            </button>
            <button class="player-tempo-button" type="button" data-action="tap-tempo" aria-label="Tap Tempo. 120 BPM">
              <strong data-metronome-bpm>120</strong><span>BPM</span>
            </button>
          </div>
          </header>

          <div class="player-bank-view player-bank-view--combined${this.cellularLayout ? ' player-bank-view--cellular' : ''}" data-player-view="bank">
            <section class="player-workspace" aria-label="Módulos de timbre do Banco A">
              <div class="player-modules-row">${modules}</div>
            </section>

            <section class="player-presets player-presets--combined${this.desktopRuntime ? ' player-presets--desktop' : ''}${this.cellularLayout ? ' player-presets--cellular' : ''}" data-player-bottom-panel aria-label="${this.cellularLayout ? 'Presets' : 'Presets e Keyboard'}">
              <nav class="player-presets__header" aria-label="Bancos e presets">
                ${createBankNavigationMarkup(!this.desktopRuntime)}
              </nav>
              <div class="player-presets__grid">${createPresetRowsMarkup(1)}</div>
              ${createPerformanceKeyboardMarkup(this.keyboardStyle, this.keyboardOctaveSpan)}
            </section>
          </div>

          ${createPadsEffectsMarkup()}

        </div>

        <p class="player-screen__status" role="status" aria-live="polite"></p>
      </main>
      <div class="knob-focus" data-knob-focus aria-hidden="true">
        <div class="knob-focus__card">
          <strong data-knob-focus-label></strong>
          <div class="knob-focus__controls">
            <span class="knob-focus__face"><i></i></span>
            <div class="knob-focus__fader" aria-label="Ajuste vertical do parâmetro">
              <input type="range" min="0" max="100" step="1" value="0" data-knob-focus-fader>
            </div>
          </div>
          <output data-knob-focus-value></output>
        </div>
      </div>
    `;
    for (const faderRoot of this.root.querySelectorAll<HTMLElement>('[data-module-fader]')) {
      const moduleNumber = Number.parseInt(faderRoot.dataset.moduleFader ?? '', 10);
      if (!Number.isInteger(moduleNumber)) continue;
      const fader = new ModuleFader(
        faderRoot,
        moduleNumber,
        (valueDb) => {
          this.saveActivePresetState();
          this.markPlayerStateChanged(false);
          if (this.nativePresetTransitionPending || this.nativePresetTransitionInFlight) {
            this.scheduleNativeEngineSync();
            return;
          }
          void hookKeysNative.setModuleGain(moduleNumber - 1, valueDb).catch(() => {
            this.scheduleNativeEngineSync();
          });
        },
        (targetModuleNumber, trigger) => {
          this.openCcLearn({ kind: 'module-volume', moduleNumber: targetModuleNumber }, trigger);
        },
      );
      fader.mount();
      this.faders.set(moduleNumber, fader);
    }
    this.keyboardMidiRouter = new KeyboardMidiRouter(
      () => keyboardMidiRoute(this.keyboardMidiSlot, this.selectedMidiInputIds, this.midiInput.getInputDevices().length),
      (slot, status, note, velocity) => {
        this.sendNativeMidi(slot, status, note, velocity);
        if ((status & 0xf0) === 0xb0 && note === 1) {
          this.receiveRotaryModulation(velocity, slot === 3 ? null : this.selectedMidiInputIds[slot] ?? null);
        }
      },
    );
    const keyboardRoot = this.root.querySelector<HTMLElement>('[data-performance-keyboard]');
    if (keyboardRoot) {
      this.performanceKeyboard = new PerformanceKeyboardController(
        keyboardRoot,
        () => this.selectBottomView('presets'),
        (noteNumber, pressed, velocity) => {
          const inputId = this.keyboardMidiRouter?.note(noteNumber, pressed, velocity) ?? null;
          this.updatePerformanceNoteDisplay(`touch:${noteNumber}`, noteNumber, pressed);
          this.patternPlayback.handleInput({ inputId, noteNumber, pressed, velocity });
          if (pressed) this.learnNoteRangeFrom(noteNumber, inputId);
          return inputId;
        },
      );
      this.performanceKeyboard.mount();
      this.keyboardExpression = new KeyboardExpressionController(keyboardRoot, (kind, value, active) => {
        if (kind === 'pitch') this.keyboardMidiRouter?.pitchBend(value, active);
        else this.keyboardMidiRouter?.modulation(value, active);
      });
      this.keyboardExpression.mount();
      this.syncKeyboardExpressionInput();
    }
    if (this.desktopRuntime) {
      this.bottomView = 'presets';
      this.computerKeyboard = new ComputerKeyboardController((noteNumber, pressed, velocity) => {
        const inputId = this.keyboardMidiRouter?.note(noteNumber, pressed, velocity) ?? null;
        this.updatePerformanceNoteDisplay(`computer:${noteNumber}`, noteNumber, pressed);
        const detail = { channel: 1, inputId, noteNumber, pressed, velocity };
        this.patternPlayback.handleInput(detail);
        window.dispatchEvent(new CustomEvent('hookkeys:performance-note', { detail }));
      });
      this.computerKeyboard.mount();
    }
    this.trackTransport = new TrackTransportController(
      this.root,
      this.trackLibrary,
      (snapshot) => this.handleTrackPlaybackSnapshot(snapshot),
      (message) => this.setStatus(message),
      (trigger) => this.openModal('track-position', null, trigger),
      hookKeysNative.tracksAvailable() ? new NativeTrackPlayer(hookKeysNative.trackBridge) : null,
    );
    this.trackTransport.mount();
    if (this.desktopRuntime) {
      document.addEventListener('keydown', this.handleDesktopPlaylistKeydown);
    }
    this.applyMusicOutput();
    this.root.addEventListener('click', this.handleRootClick);
    this.root.addEventListener('pointerdown', this.handleRootPointerDown);
    this.root.addEventListener('pointermove', this.handleRootPointerMove);
    this.root.addEventListener('pointerup', this.handleRootPointerEnd);
    this.root.addEventListener('pointercancel', this.handleRootPointerEnd);
    document.addEventListener('pointerdown', this.handleKnobFocusOutsidePointerDown, true);
    this.root.addEventListener('contextmenu', this.handleRootContextMenu);
    this.root.addEventListener('input', this.handleRootInput);
    window.addEventListener('pagehide', this.handlePageHide);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.midiInput.mount();
    void this.loadCompatibilityVideoUrl();
    this.catalogReady = this.refreshSoundCatalog();
    void this.catalogReady.catch(() => undefined);
    this.renderMetronomeState();
    this.renderBottomView();
    const restorePromise = this.restoreSavedPlayerState();
    void restorePromise.finally(() => {
      this.playerBackup.start(() => this.createSavedPlayerState());
    });
    const initializePromise = restorePromise.then(() => hookKeysNative.initialize(this.bufferSize, this.sampleRate));
    this.nativeBootPromise = Promise.all([
      initializePromise,
      restorePromise.catch(() => undefined),
    ]).then(async ([ready]) => {
      if (!ready || !this.mounted) {
        if (this.mounted && hookKeysNative.isAvailable()) {
          this.setStatus('A saída de áudio ainda não ficou disponível. Tentando recuperar...');
        }
        return;
      }
      await this.applyNativeAudioOutput();
      if (!this.mounted) return;
      this.applySelectedMidiInputs();
      await this.syncNativeEngine();
    });
    this.scheduleAudioDeviceMonitor();
    this.scheduleModuleMeters();
    this.scheduleRamMeter(0);
  }

  // A RAM muda devagar (carregar SF2, músicas): uma leitura a cada 2 s basta e
  // não disputa a thread com os medidores de nível.
  private scheduleRamMeter(delay = 2_000): void {
    if (!this.mounted || (!this.desktopRuntime && !Capacitor.isNativePlatform())) return;
    if (this.ramMeterTimer !== null) window.clearTimeout(this.ramMeterTimer);
    this.ramMeterTimer = window.setTimeout(async () => {
      this.ramMeterTimer = null;
      if (document.visibilityState !== 'hidden') {
        const usage = await hookKeysNative.memoryUsage();
        if (!this.mounted) return;
        if (usage) this.renderRamMeter(usage);
      }
      this.scheduleRamMeter();
    }, delay);
  }

  // A RAM do aparelho vive alta (o sistema usa de sobra o que está livre), por
  // isso o amarelo e o vermelho só aparecem bem no fim.
  private renderRamMeter(usage: { percent: number; usedBytes: number; limitBytes: number }): void {
    const meter = this.root.querySelector<HTMLElement>('[data-ram-meter]');
    const value = meter?.querySelector<HTMLElement>('[data-ram-meter-value]');
    if (!meter || !value) return;
    const percent = Math.min(100, Math.max(0, usage.percent));
    const text = `${Math.round(percent)}%`;
    if (value.textContent !== text) value.textContent = text;
    const label = usage.limitBytes > 0
      ? `Memória usada no aparelho: ${formatGigabytes(usage.usedBytes)} de ${formatGigabytes(usage.limitBytes)}`
      : 'Memória usada no aparelho';
    meter.title = label;
    meter.setAttribute('aria-label', `${label} (${text})`);
    meter.classList.toggle('is-critical', percent >= 95);
    meter.classList.toggle('is-warning', percent >= 85 && percent < 95);
  }

  private scheduleModuleMeters(): void {
    if (!this.mounted || !hookKeysNative.isAvailable()) return;
    this.moduleMeterTimer = window.setTimeout(async () => {
      this.moduleMeterTimer = null;
      try {
        if (document.visibilityState !== 'hidden' && this.nativeEngineReady) {
          const analysisModuleIndex = this.getCompressorAnalysisModuleIndex();
          const [peaks, analysis] = await Promise.all([
            hookKeysNative.moduleMeterLevels(),
            analysisModuleIndex === null
              ? Promise.resolve<number[]>([])
              : hookKeysNative.moduleAnalysis(analysisModuleIndex),
          ]);
          if (!this.mounted) return;
          for (let index = 0; index < 8; index += 1) {
            const displayed = [0, 1].map((channel) => {
              const peak = peaks[index * 2 + channel] ?? 0;
              // O preenchimento é limitado a 0 dB no fader, mas o valor bruto
              // precisa continuar disponível para detectar clipping real.
              const db = peak > 0 ? Math.max(MODULE_FADER_MIN_DB, 20 * Math.log10(peak)) : MODULE_FADER_MIN_DB;
              // Fast attack, smooth release; only the UI is smoothed.
              const previous = this.moduleMeterDb[index]?.[channel] ?? MODULE_FADER_MIN_DB;
              return Math.max(db, previous - 3);
            });
            this.moduleMeterDb[index] = displayed;
            this.setModuleMeterLevel(index + 1, displayed[0] ?? MODULE_FADER_MIN_DB, displayed[1] ?? MODULE_FADER_MIN_DB);
          }
          this.renderOutputMeter('modules', peaks.slice(16, 18));
          this.renderOutputMeter('music', hookKeysNative.tracksAvailable()
            ? peaks.slice(18, 20) : this.trackTransport?.getOutputPeaks() ?? [0, 0]);
          this.renderOutputMeter('click', peaks.slice(20, 22));
          this.renderOutputMeter('effects', this.effectMeterPeaks());
          // O estado selecionado do pad não é sinal de áudio: não inventar nível.
          this.renderOutputMeter('pads', [0, 0]);
          if (analysisModuleIndex === this.getCompressorAnalysisModuleIndex()) {
            this.renderModuleAnalysis(analysis);
          } else if (this.getCompressorAnalysisModuleIndex() === null) {
            this.renderModuleAnalysis([]);
          }
          if (this.desktopRuntime) {
            const load = await hookKeysNative.audioLoad();
            if (load && this.mounted) this.renderAudioLoad(load);
          }
        }
        } catch {
        for (let index = 0; index < 8; index += 1) {
          this.moduleMeterDb[index] = [MODULE_FADER_MIN_DB, MODULE_FADER_MIN_DB];
          this.setModuleMeterLevel(index + 1, MODULE_FADER_MIN_DB, MODULE_FADER_MIN_DB);
        }
        for (const levels of Object.values(this.outputMeterDb)) levels.fill(-60);
        for (const bus of Object.keys(this.outputMeterDb)) this.renderOutputMeter(bus, [0, 0]);
      } finally {
        this.scheduleModuleMeters();
      }
    // O Lite não desacelera o meter: com menos quadros ele andava em degraus e
    // parecia a tela inteira travando, sem economia perceptível.
    }, this.desktopRuntime ? DESKTOP_MODULE_METER_INTERVAL_MS : MOBILE_MODULE_METER_INTERVAL_MS);
  }

  // O unico numero que denuncia um estouro. A CPU total da maquina nao serve:
  // uma thread de audio saturada aparece como 8% em doze processadores
  // logicos, e como 0% quando esta travada esperando uma pagina voltar do
  // disco. Aqui 100% significa que o bloco consumiu o prazo inteiro.
  private renderAudioLoad(load: { peak: number; smoothed: number; overruns: number }): void {
    const meter = this.root.querySelector<HTMLElement>('[data-cpu-meter]');
    const value = meter?.querySelector<HTMLElement>('[data-cpu-meter-value]');
    if (!meter || !value) return;
    // Ataque imediato e queda lenta: o bloco ruim precisa aparecer, mas o
    // numero nao pode piscar a cada leitura.
    const measured = Math.max(load.peak, load.smoothed) * 100;
    this.audioLoadPercent = Math.min(999, Math.max(measured, this.audioLoadPercent - 4));
    value.textContent = `${Math.round(this.audioLoadPercent)}%`;
    // Um estouro dura um bloco so. Segure o alarme para ele ser visto.
    if (load.overruns > 0) this.audioLoadAlarmUntil = Date.now() + 2000;
    const critical = this.audioLoadPercent >= 90 || Date.now() < this.audioLoadAlarmUntil;
    meter.classList.toggle('is-critical', critical);
    meter.classList.toggle('is-warning', !critical && this.audioLoadPercent >= 70);
  }

  setModuleMeterLevel(moduleNumber: number, leftDb: number, rightDb = leftDb): void {
    this.faders.get(moduleNumber)?.setMeterLevels(leftDb, rightDb);
  }

  private renderOutputMeter(bus: string, peaks: readonly number[]): void {
    const meter = this.root.querySelector<HTMLElement>(`[data-output-meter="${bus}"]`);
    if (!meter) return;
    const held = this.outputMeterDb[bus] ?? (this.outputMeterDb[bus] = [-60, -60]);
    for (let channel = 0; channel < 2; channel += 1) {
      const peak = peaks[channel] ?? 0;
      const db = peak > 0 ? Math.max(-60, Math.min(0, 20 * Math.log10(peak))) : -60;
      const displayed = Math.max(db, (held[channel] ?? -60) - 4);
      held[channel] = displayed;
      const fill = meter.querySelector<HTMLElement>(`[data-output-meter-channel="${channel}"]`);
      fill?.style.setProperty('--output-meter-level', `${(displayed + 60) / 60 * 100}%`);
    }
  }

  private effectMeterPeaks(): [number, number] {
    if (!this.desktopRuntime) {
      // O medidor nativo mantém o comportamento anterior até os pads de áudio
      // passarem por um barramento medido pelo motor da plataforma.
      let level = 0;
      for (const pool of this.effectPadAudio.values()) {
        for (const audio of pool.voices) {
          if (!audio.paused && !audio.ended) level = Math.max(level, audio.volume);
        }
      }
      return [level, level];
    }
    const peaks: [number, number] = [0, 0];
    for (const [audio, { analysers }] of this.effectAudioAnalysers) {
      if (audio.paused || audio.ended) continue;
      analysers.forEach((analyser, channel) => {
        const samples = this.effectMeterBuffers[channel]!;
        analyser.getFloatTimeDomainData(samples);
        for (const sample of samples) peaks[channel] = Math.max(peaks[channel] ?? 0, Math.abs(sample));
      });
    }
    return peaks;
  }

  private async attachEffectMeter(audio: HTMLAudioElement): Promise<void> {
    if (!this.desktopRuntime) return;
    try {
      if (!this.effectAudioContext) {
        this.effectAudioContext = new AudioContext();
        this.effectMeterSilentTap = this.effectAudioContext.createGain();
        this.effectMeterSilentTap.gain.value = 0;
        this.effectMeterSilentTap.connect(this.effectAudioContext.destination);
      }
      if (this.effectAudioContext.state === 'suspended') await this.effectAudioContext.resume();
      const source = this.effectAudioContext.createMediaElementSource(audio);
      const splitter = this.effectAudioContext.createChannelSplitter(2);
      const left = this.effectAudioContext.createAnalyser();
      const right = this.effectAudioContext.createAnalyser();
      left.fftSize = right.fftSize = 2048;
      source.connect(this.effectAudioContext.destination);
      source.connect(splitter);
      splitter.connect(left, 0);
      splitter.connect(right, 1);
      left.connect(this.effectMeterSilentTap!);
      right.connect(this.effectMeterSilentTap!);
      this.effectAudioAnalysers.set(audio, { source, splitter, analysers: [left, right] });
    } catch {
      // Sem WebAudio, o efeito continua reproduzindo pelo elemento original.
    }
  }

  private detachEffectMeter(audio: HTMLAudioElement): void {
    const graph = this.effectAudioAnalysers.get(audio);
    if (!graph) return;
    graph.source.disconnect();
    graph.splitter.disconnect();
    for (const analyser of graph.analysers) analyser.disconnect();
    this.effectAudioAnalysers.delete(audio);
  }

  private getCompressorAnalysisModuleIndex(): number | null {
    const moduleNumber = this.currentModalModuleNumber;
    if (moduleNumber === null || !this.modal?.querySelector('[data-compressor-meter]')) return null;
    const module = this.getActivePresetState()?.modules[moduleNumber - 1];
    return module?.enabled && readModuleCompressorSettings(module.settings.compressor).enabled
      ? moduleNumber - 1 : null;
  }

  private renderModuleAnalysis(values: readonly number[]): void {
    if (!this.modal) return;
    const enabled = this.getCompressorAnalysisModuleIndex() !== null;
    const moduleIndex = this.currentModalModuleNumber === null
      ? null : this.currentModalModuleNumber - 1;
    if (!enabled || moduleIndex !== this.renderedAnalysisModuleIndex) {
      this.compressorMeterDb.fill(-60);
      this.renderedAnalysisModuleIndex = moduleIndex;
    }
    [enabled ? values[0] ?? 0 : 0, enabled ? values[1] ?? 0 : 0].forEach((linear, index) => {
      const db = linear > 0 ? Math.max(-60, Math.min(6, 20 * Math.log10(linear))) : -60;
      const displayed = Math.max(db, (this.compressorMeterDb[index] ?? -60) - 3);
      this.compressorMeterDb[index] = displayed;
      const meterName = index === 0 ? 'input' : 'output';
      const meter = this.modal?.querySelector<HTMLElement>(`[data-compressor-meter="${meterName}"]`);
      const fill = meter?.querySelector<HTMLElement>('i > b');
      const output = meter?.querySelector<HTMLElement>('small');
      if (fill) fill.style.height = `${Math.max(0, Math.min(100, (displayed + 60) / 66 * 100))}%`;
      if (output) output.textContent = displayed <= -59.9 ? '−∞ dB' : `${displayed.toFixed(1)} dB`;
    });
  }

  async waitUntilReady(): Promise<void> {
    await Promise.all([this.nativeBootPromise, this.catalogReady]);
    if (!this.mounted) return;
    if (!hookKeysNative.isAvailable()) return;
    await this.ensureNativeAudioReady();
    // Configuração enviada não equivale a callback de áudio funcionando.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if ((await hookKeysNative.audioOutputStatus()).ready) return;
      await new Promise(resolve => window.setTimeout(resolve, 100));
    }
    throw new Error('A saída de áudio não iniciou. Verifique o dispositivo de áudio e tente novamente.');
  }

  async activateLiveMidi(): Promise<void> {
    if (!this.mounted) return;
    this.patternPlayback.reset();
    await hookKeysNative.setMidiInputEnabled(true);
    if (this.mounted) this.liveMidiEnabled = true;
  }

  async suspendLiveMidi(): Promise<void> {
    this.liveMidiEnabled = false;
    this.patternPlayback.reset();
    this.clearPerformanceNoteDisplay();
    await hookKeysNative.setMidiInputEnabled(false);
  }

  receiveMidiNote(
    noteNumber: number,
    velocity = 127,
    channel = 1,
    inputId: string | null = null,
  ): void {
    this.midiInput.receiveNativeNote(noteNumber, velocity, channel, inputId);
  }

  receiveMidiControlChange(
    controller: number,
    value: number,
    channel = 1,
    inputId: string | null = null,
  ): void {
    this.midiInput.receiveNativeControlChange(controller, value, channel, inputId);
  }

  destroy(): void {
    if (!this.mounted) return;
    this.liveMidiEnabled = false;
    this.clearPerformanceNoteDisplay();
    this.soundfontSelectionRevision += 1;
    void hookKeysNative.setMidiInputEnabled(false);
    this.closeModal(false);
    this.closeTracksSplitView();
    this.performanceKeyboard?.destroy();
    this.keyboardExpression?.destroy();
    this.keyboardExpression = null;
    this.keyboardMidiRouter?.resetExpression();
    this.keyboardExpressionRouteKey = '';
    this.performanceKeyboard = null;
    this.computerKeyboard?.destroy();
    this.computerKeyboard = null;
    this.keyboardMidiRouter = null;
    this.patternPlayback.destroy();
    this.keyboardSettingsHoldGesture.cancel();
    this.bottomViewHoldGesture.cancel();
    this.clearPresetHoldGesture();
    this.clearTracksHoldGesture();
    this.releaseCapturedTracksPointer();
    this.clearEffectEditHoldGesture();
    this.clearModuleSoloHoldGesture();
    this.outputFaderLearnGesture.cancel();
    this.metronomeFaderLearnGesture.cancel();
    this.ccControlHoldGesture.cancel();
    this.knobCcLearnGesture.cancel();
    this.metronomeHoldGesture.cancel();
    this.tempoHoldGesture.cancel();
    this.keyboardAccentGesture.cancel();
    this.fixedSoundHoldGesture.cancel();
    this.userSoundfontHoldGesture.cancel();
    this.synthPresetHoldGesture.cancel();
    this.voiceModeHoldGesture.cancel();
    this.bankHoldGesture.cancel();
    this.moduleConfigHoldGesture.cancel();
    this.soundDownloadAbort?.abort();
    this.soundDownloadAbort = null;
    for (const { abort } of this.activeSoundDownloads.values()) abort.abort();
    this.activeSoundDownloads.clear();
    this.soundLibraryEngine.destroy();
    this.outputFaderDrag = null;
    this.metronomeFaderDrag = null;
    if (this.tempoDrag?.button.hasPointerCapture(this.tempoDrag.pointerId)) {
      this.tempoDrag.button.releasePointerCapture(this.tempoDrag.pointerId);
    }
    this.tempoDrag = null;
    this.faderDoubleTap.reset();
    this.releasePressedKeyboardKey();
    this.cancelNoteLearn();
    this.midiInput.destroy();
    if (this.nativeSyncTimer !== null) window.clearTimeout(this.nativeSyncTimer);
    this.nativeSyncTimer = null;
    if (this.audioDeviceMonitorTimer !== null) window.clearTimeout(this.audioDeviceMonitorTimer);
    this.audioDeviceMonitorTimer = null;
    if (this.moduleMeterTimer !== null) window.clearTimeout(this.moduleMeterTimer);
    this.moduleMeterTimer = null;
    if (this.ramMeterTimer !== null) window.clearTimeout(this.ramMeterTimer);
    this.ramMeterTimer = null;
    window.removeEventListener('pagehide', this.handlePageHide);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    document.removeEventListener('keydown', this.handleDesktopPlaylistKeydown);
    this.flushPlayerStateSave(true);
    void hookKeysNative.stopAllNotes();
    this.metronome.destroy();
    this.playerState.destroy();
    this.playerBackup.destroy();
    this.trackTransport?.destroy();
    this.trackTransport = null;
    for (const key of [...this.effectPadAudio.keys()]) this.disposeEffectPadAudio(key);
    for (const audio of this.effectAudioAnalysers.keys()) this.detachEffectMeter(audio);
    void this.effectAudioContext?.close();
    this.effectAudioContext = null;
    this.effectMeterSilentTap = null;
    for (const fader of this.faders.values()) fader.destroy();
    this.faders.clear();
    this.root.removeEventListener('click', this.handleRootClick);
    this.root.removeEventListener('pointerdown', this.handleRootPointerDown);
    this.root.removeEventListener('pointermove', this.handleRootPointerMove);
    this.root.removeEventListener('pointerup', this.handleRootPointerEnd);
    this.root.removeEventListener('pointercancel', this.handleRootPointerEnd);
    document.removeEventListener('pointerdown', this.handleKnobFocusOutsidePointerDown, true);
    this.root.removeEventListener('contextmenu', this.handleRootContextMenu);
    this.root.removeEventListener('input', this.handleRootInput);
    this.root.classList.remove('hook-keys-lite');
    this.root.replaceChildren();
    this.mounted = false;
  }

  private onDesktopPlaylistKeydown(event: KeyboardEvent): void {
    if (
      !this.desktopRuntime
      || event.code !== 'Space'
      || event.repeat
      || event.defaultPrevented
      || event.ctrlKey
      || event.metaKey
      || event.altKey
      || this.modal
      || document.querySelector('.desktop-close-confirmation')
    ) return;

    // Range knobs can keep focus after a modal closes; Space is still the
    // transport shortcut there. Only controls that actually receive typed text
    // retain the character instead of controlling the playlist.
    const editableSelector = 'input:not([type="range"]), textarea, select, [contenteditable="true"]';
    const target = event.target;
    const activeElement = document.activeElement;
    if (
      (target instanceof Element && target.closest(editableSelector))
      || (activeElement instanceof Element && activeElement.closest(editableSelector))
    ) return;

    event.preventDefault();
    event.stopPropagation();
    void this.trackTransport?.togglePlayStop();
  }

  private createSoundLibraryEngine(catalog: SoundCatalog): SoundLibraryEngine {
    return new SoundLibraryEngine(
      catalog,
      this.soundLibrary,
      new HttpSoundAssetGateway(async (assetReference, kind) => (
        isHttpAssetReference(assetReference)
          ? assetReference
          : this.accountControls.getSoundAssetUrl(assetReference, kind)
      )),
    );
  }

  private soundCategoriesForModule(moduleNumber: number | null) {
    return this.soundCatalog.categoriesForModule(moduleNumber);
  }

  private moduleDefaultSoundCategory(moduleNumber: number): SoundCategoryId {
    return this.soundCategoriesForModule(moduleNumber)[0]?.id ?? '';
  }

  private async refreshSoundCatalog(): Promise<void> {
    if (!navigator.onLine) return;
    try {
      const payload = await this.accountControls.getSoundCatalog();
      if (!this.mounted) return;
      const catalog = new SoundCatalog(payload);
      this.soundCatalogCache.write(payload);
      this.soundLibraryEngine.destroy();
      this.soundCatalog = catalog;
      this.soundLibraryEngine = this.createSoundLibraryEngine(catalog);
      this.refreshDefaultSettingsFromCatalog();
      this.installedFixedSoundIds = await this.soundLibrary.listInstalledFixedIds();
      this.applyCatalogPerformanceLabels();
      if (this.currentModalKind === 'sound-selection' && this.currentModalModuleNumber !== null && this.modalTrigger) {
        this.openModal('sound-selection', this.currentModalModuleNumber, this.modalTrigger);
      }
    } catch {
      this.installedFixedSoundIds = await this.soundLibrary.listInstalledFixedIds().catch(() => new Set<string>());
    }
  }

  private applyCatalogPerformanceLabels(): void {
    this.renderActivePadBank();
    this.renderActiveEffectBank();
  }

  private onRootClick(event: Event): void {
    const eventTarget = event.target;
    if (!(eventTarget instanceof Element)) return;
    if (this.suppressNextCcControlClick?.contains(eventTarget)) {
      this.suppressNextCcControlClick = null;
      return;
    }
    const performanceButton = eventTarget.closest<HTMLButtonElement>('button[data-performance-kind]');
    if (
      performanceButton &&
      this.root.contains(performanceButton) &&
      event instanceof MouseEvent &&
      event.detail === 0
    ) {
      if (this.effectEditMode && performanceButton.dataset.performanceKind === 'effect') {
        this.openEffectPadEditor(performanceButton);
        return;
      }
      if (this.openPerformanceDownloadIfNeeded(performanceButton)) return;
      this.activatePerformanceButton(performanceButton);
      return;
    }

    const actionButton = eventTarget.closest<HTMLButtonElement>('button[data-action]');
    if (!actionButton || !this.root.contains(actionButton)) return;

    const action = actionButton.dataset.action;
    if (action === 'toggle-metronome') {
      if (this.suppressNextMetronomeClick) {
        this.suppressNextMetronomeClick = false;
        return;
      }
      this.toggleMetronome();
      return;
    }

    if (action === 'tap-tempo') {
      if (this.suppressNextTempoClick) {
        this.suppressNextTempoClick = false;
      }
      return;
    }

    if (action === 'show-pads-effects') {
      this.showPadsEffects();
      return;
    }

    if (action === 'toggle-output') {
      const outputBus = actionButton.dataset.outputBus;
      if (!isOutputBus(outputBus)) return;
      this.outputEnabled[outputBus] = !this.outputEnabled[outputBus];
      this.renderOutputLevels();
      this.applyMusicOutput();
      this.markPlayerStateChanged();
      return;
    }

    if (action === 'toggle-bottom-view') {
      // O toque longo já trocou as oitavas: o clique que vem junto não troca a view.
      if (this.suppressNextBottomViewClick) {
        this.suppressNextBottomViewClick = false;
        return;
      }
      this.selectBottomView(this.bottomView === 'keyboard' ? 'presets' : 'keyboard');
      return;
    }

    // Com o Keyboard à mostra, Copy e bancos ficam apagados e sem ação.
    if (actionButton.getAttribute('aria-disabled') === 'true') return;

    if (action === 'show-bank') {
      if (this.suppressNextBankClick) {
        this.suppressNextBankClick = false;
        return;
      }
      const bank = actionButton.dataset.bank;
      if (this.isBankId(bank)) this.showBank(bank);
      return;
    }

    if (action === 'copy-preset') {
      this.pressPresetCopyButton(actionButton);
      return;
    }

    if (action === 'select-pad-bank') {
      const bank = actionButton.dataset.padBank;
      if (this.isPadBankId(bank)) this.selectPadBank(bank);
      return;
    }

    if (action === 'select-effect-bank') {
      if (this.suppressNextEffectBankClick) {
        this.suppressNextEffectBankClick = false;
        return;
      }
      const bank = actionButton.dataset.effectBank;
      if (this.isEffectBankId(bank)) {
        if (this.effectEditMode) {
          this.activeEffectBank = bank;
          this.renderActiveEffectBank();
          // FX 1 e FX 2 são bancos de fábrica. Entram no modo Edit para
          // configurar pads, mas seus nomes permanecem definidos pelo app.
          if (bank !== '1' && bank !== '2') {
            this.pendingEffectBankEdit = bank;
            this.openModal('effect-bank-name', null, actionButton);
          }
        } else {
          this.selectEffectBank(bank);
        }
      }
      return;
    }

    if (action === 'select-preset') {
      this.selectPreset(actionButton);
      return;
    }

    if (action === 'toggle-module') {
      const moduleNumber = Number.parseInt(actionButton.dataset.module ?? '', 10);
      if (Number.isInteger(moduleNumber)) this.toggleModule(moduleNumber, actionButton);
      return;
    }

    if (action === 'open-synth' || action === 'open-organ') {
      // Toque longo nesse mesmo botão soa/tira o solo do módulo; o clique que
      // vem junto não deve abrir o editor por cima.
      if (this.suppressNextModuleSoundClick) {
        this.suppressNextModuleSoundClick = false;
        return;
      }
      this.openModal(action === 'open-synth' ? 'module-synth' : 'module-organ', action === 'open-synth' ? 8 : 7, actionButton);
      return;
    }

    if (action === 'learn-note-range') {
      const moduleNumber = Number.parseInt(actionButton.dataset.module ?? '', 10);
      const bound = actionButton.dataset.bound;
      if (Number.isInteger(moduleNumber) && (bound === 'low' || bound === 'high')) {
        this.toggleNoteLearn(moduleNumber, bound);
      }
      return;
    }

    if (action === 'octave-up' || action === 'octave-down') {
      const moduleNumber = Number.parseInt(actionButton.dataset.module ?? '', 10);
      if (Number.isInteger(moduleNumber)) {
        this.shiftModuleOctave(moduleNumber, action === 'octave-up' ? 1 : -1);
      }
      return;
    }

    if (action === 'global-octave-up' || action === 'global-octave-down') {
      this.shiftGlobalOctave(action === 'global-octave-up' ? 1 : -1);
      return;
    }

    if (action === 'global-transpose-up' || action === 'global-transpose-down') {
      this.shiftGlobalTranspose(action === 'global-transpose-up' ? 1 : -1);
      return;
    }

    if (action === 'toggle-module-output-mode') {
      this.toggleModuleOutputMode();
      return;
    }

    if (action === 'toggle-sustain-input' || action === 'toggle-modulation-input') {
      const moduleNumber = Number.parseInt(actionButton.dataset.module ?? '', 10);
      if (Number.isInteger(moduleNumber)) {
        this.toggleModuleInput(
          moduleNumber,
          action === 'toggle-sustain-input' ? 'sustain' : 'modulation',
        );
      }
      return;
    }

    if (action === 'open-about') {
      // Long press no Hook Keys abre a Playlist 30%; o clique que o mesmo toque
      // gera depois não abre o modal por cima. Com os 30% abertos, um toque
      // simples só fecha a Playlist; o modal (Modo Lite) abre com ela fechada.
      if (this.suppressNextTracksClick) {
        this.suppressNextTracksClick = false;
        return;
      }
      if (this.splitTracksController) {
        this.closeTracksSplitView();
        return;
      }
      this.openModal('about', null, actionButton);
      return;
    }

    if (action === 'open-app-settings') {
      this.openModal('app-settings', null, actionButton);
      return;
    }

    if (action === 'panic') {
      this.triggerPanic();
      return;
    }

    if (action === 'open-user') {
      this.openModal('user', null, actionButton);
      return;
    }

    if (action === 'open-module-settings' || action === 'open-sound-selection') {
      if (action === 'open-module-settings' && this.suppressNextModuleConfigClick) {
        this.suppressNextModuleConfigClick = false;
        return;
      }
      // Toque longo no botão de abrir a biblioteca soa/tira o solo do módulo;
      // o clique que vem junto não deve abrir a biblioteca por cima.
      if (action === 'open-sound-selection' && this.suppressNextModuleSoundClick) {
        this.suppressNextModuleSoundClick = false;
        return;
      }
      const moduleNumber = Number.parseInt(actionButton.dataset.module ?? '', 10);
      if (!Number.isInteger(moduleNumber)) return;

      if (action === 'open-module-settings' && this.moduleConfigCopySource !== null) {
        if (moduleNumber === this.moduleConfigCopySource) {
          this.cancelModuleConfigCopy('Cópia de Config cancelada.');
        } else if (moduleNumber >= 1 && moduleNumber <= 6) {
          this.openModal('module-config-copy-confirm', moduleNumber, actionButton);
        } else {
          this.setStatus('A cópia de Config funciona somente entre os módulos 1 a 6.');
        }
        return;
      }

      const kind: ModalKind =
        action === 'open-module-settings' ? 'module-settings' : 'sound-selection';
      this.openModal(kind, moduleNumber, actionButton);
      return;
    }

    if (action === 'logout') {
      this.showLogoutConfirmation();
      return;
    }

    if (action === 'cancel-logout') {
      this.modal?.querySelector('[data-logout-confirmation]')?.remove();
      return;
    }

    if (action === 'confirm-logout') {
      const logoutButton = this.modal?.querySelector<HTMLButtonElement>('[data-action="logout"]');
      this.modal?.querySelector('[data-logout-confirmation]')?.remove();
      if (logoutButton) void this.logout(logoutButton);
    }
  }

  private onRootInput(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (input.matches('[data-knob-focus-fader]')) {
      const source = this.knobFocusInput;
      if (!source?.isConnected || source.disabled) return;
      source.value = input.value;
      source.dispatchEvent(new Event('input', { bubbles: true }));
      this.syncKnobFocus(source);
      return;
    }
    if (input.matches('[data-metronome-output-volume]')) {
      const position = Math.min(100, Math.max(0, Number(input.value)));
      if (!Number.isFinite(position)) return;
      const levelDb = outputDbFromPosition(position);
      this.metronome.setVolume(position <= 0 ? 0 : 10 ** (levelDb / 20));
      input.parentElement?.style.setProperty('--output-position', `${position}%`);
      input.closest<HTMLElement>('.player-output-knob')?.style.setProperty('--knob-angle', `${-135 + (position / 100) * 270}deg`);
      input.closest<HTMLElement>('.player-output-knob')?.style.setProperty('--knob-progress', String(position / 100));
      input.setAttribute('aria-valuetext', formatOutputDb(levelDb));
      const output = this.root.querySelector<HTMLOutputElement>('[data-metronome-output-value]');
      if (output) output.value = formatOutputDb(levelDb);
      this.markPlayerStateChanged();
      return;
    }
    if (!input.matches('[data-output-level]')) return;
    const outputBus = input.dataset.outputLevel;
    if (!isOutputBus(outputBus)) return;
    const position = Number(input.value);
    if (!Number.isFinite(position)) return;
    const value = outputDbFromPosition(position);
    this.outputLevels[outputBus] = value;
    input.parentElement?.style.setProperty('--output-position', `${outputPosition(value)}%`);
    input.closest<HTMLElement>('.player-output-knob')?.style.setProperty('--knob-angle', `${-135 + (outputPosition(value) / 100) * 270}deg`);
    input.closest<HTMLElement>('.player-output-knob')?.style.setProperty('--knob-progress', String(outputPosition(value) / 100));
    input.setAttribute('aria-valuetext', formatOutputDb(value));
    const output = this.root.querySelector<HTMLOutputElement>(`[data-output-value="${outputBus}"]`);
    if (output) output.value = formatOutputDb(value);
    this.applyMusicOutput();
    this.markPlayerStateChanged();
  }

  private renderOutputLevels(): void {
    for (const outputBus of ['music', 'pads', 'effects', 'master'] as const) {
      const value = Math.min(MAX_OUTPUT_DB, this.outputLevels[outputBus]);
      this.outputLevels[outputBus] = value;
      const input = this.root.querySelector<HTMLInputElement>(`[data-output-level="${outputBus}"]`);
      const output = this.root.querySelector<HTMLOutputElement>(`[data-output-value="${outputBus}"]`);
      const power = this.root.querySelector<HTMLButtonElement>(
        `[data-action="toggle-output"][data-output-bus="${outputBus}"]`,
      );
      if (input) {
        input.value = String(outputPosition(value));
        input.parentElement?.style.setProperty('--output-position', `${outputPosition(value)}%`);
        input.closest<HTMLElement>('.player-output-knob')?.style.setProperty('--knob-angle', `${-135 + (outputPosition(value) / 100) * 270}deg`);
        input.closest<HTMLElement>('.player-output-knob')?.style.setProperty('--knob-progress', String(outputPosition(value) / 100));
        input.setAttribute('aria-valuetext', formatOutputDb(value));
      }
      if (output) output.value = formatOutputDb(value);
      if (power) {
        const enabled = this.outputEnabled[outputBus];
        power.classList.toggle('is-on', enabled);
        power.classList.toggle('is-off', !enabled);
        power.textContent = enabled ? 'ON' : 'OFF';
        power.setAttribute('aria-pressed', String(enabled));
      }
    }
  }

  private applyMusicOutput(): void {
    this.trackTransport?.setOutputLevel(this.outputLevels.music, this.outputEnabled.music);
    const effectsGain = this.outputEnabled.effects ? Math.pow(10, this.outputLevels.effects / 20) : 0;
    for (const pool of this.effectPadAudio.values()) {
      for (const audio of pool.voices) {
        audio.volume = Math.min(1, Math.max(0, (this.effectAudioBaseGain.get(audio) ?? 1) * effectsGain));
      }
    }
    // Arrastar o fader manda um comando por sincronização, não um por pixel.
    if (hookKeysNative.tracksAvailable()) this.scheduleNativeEngineSync();
  }

  // Músicas no motor: sempre em 1+2, com o volume do fader Music.
  private applyNativeMusicOutput(): Promise<void> {
    if (!hookKeysNative.tracksAvailable()) return Promise.resolve();
    return hookKeysNative.configureTrackOutput(0, 2, this.outputLevels.music, this.outputEnabled.music)
      .catch(() => undefined);
  }

  private renderMetronomeState(): void {
    const tempoButton = this.root.querySelector<HTMLButtonElement>('[data-action="tap-tempo"]');
    const bpm = this.metronome.getBpm();
    const bpmLabel = tempoButton?.querySelector<HTMLElement>('[data-metronome-bpm]');
    if (bpmLabel) bpmLabel.textContent = formatBpm(bpm);
    if (tempoButton) tempoButton.setAttribute('aria-label', `Tap Tempo. ${bpm} BPM`);
    const running = this.metronome.isRunning();
    for (const metronomeButton of this.root.querySelectorAll<HTMLButtonElement>('[data-action="toggle-metronome"]')) {
      metronomeButton.classList.toggle('is-active', running);
      metronomeButton.setAttribute('aria-pressed', String(running));
      metronomeButton.setAttribute('aria-label', `${running ? 'Desligar' : 'Ligar'} metrônomo`);
      if (metronomeButton.matches('.player-output-control__power')) {
        metronomeButton.classList.toggle('is-on', running);
        metronomeButton.classList.toggle('is-off', !running);
        metronomeButton.textContent = running ? 'ON' : 'OFF';
      }
    }
    const linearVolume = this.metronome.getVolume();
    const levelDb = linearVolume <= 0 ? OUTPUT_MIN_DB : Math.max(OUTPUT_MIN_DB, Math.min(MAX_OUTPUT_DB, 20 * Math.log10(linearVolume)));
    const volume = outputPosition(levelDb);
    const volumeInput = this.root.querySelector<HTMLInputElement>('[data-metronome-output-volume]');
    const volumeOutput = this.root.querySelector<HTMLOutputElement>('[data-metronome-output-value]');
    if (volumeInput) {
      volumeInput.value = String(volume);
      volumeInput.parentElement?.style.setProperty('--output-position', `${volume}%`);
      volumeInput.closest<HTMLElement>('.player-output-knob')?.style.setProperty('--knob-angle', `${-135 + (volume / 100) * 270}deg`);
      volumeInput.closest<HTMLElement>('.player-output-knob')?.style.setProperty('--knob-progress', String(volume / 100));
      volumeInput.setAttribute('aria-valuetext', formatOutputDb(levelDb));
    }
    if (volumeOutput) volumeOutput.value = formatOutputDb(levelDb);
    if (this.currentModalKind === 'module-delay' && this.currentModalModuleNumber !== null && this.modal) {
      this.renderModuleDelaySyncState(this.modal, this.currentModalModuleNumber);
    }
    if ((this.currentModalKind === 'module-settings' || this.currentModalKind === 'module-synth')
        && this.currentModalModuleNumber !== null && this.modal
        && this.modal.querySelector('[data-glide-sync][aria-pressed="true"]')) {
      this.renderGlideCard(this.modal, this.currentModalModuleNumber);
    }
  }

  private commitTempo(modal: HTMLElement): void {
    const input = modal.querySelector<HTMLInputElement>('[data-tempo-input]');
    if (!input || !input.value.trim()) return;
    const value = Number(input.value.replace(',', '.'));
    if (!Number.isFinite(value)) return;
    this.metronome.setBpm(value);
    this.markPlayerStateChanged();
  }

  private toggleMetronome(): void {
    this.metronome.toggle();
    this.markPlayerStateChanged();
    if (this.metronome.isRunning()) {
      void this.ensureNativeAudioReady()
        .then(() => this.metronome.syncNativeState())
        .catch(() => this.setStatus('Não foi possível iniciar a saída de áudio.'));
    }
  }

  private commitModulePolyphony(modal: HTMLElement, moduleNumber: number): void {
    const input = modal.querySelector<HTMLInputElement>('[data-module-polyphony-input]');
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!input || !moduleState) return;
    const parsed = Math.round(Number(input.value));
    const polyphony = Number.isFinite(parsed) ? Math.min(128, Math.max(1, parsed)) : 128;
    input.value = String(polyphony);
    moduleState.settings.polyphony = polyphony;
    this.markPlayerStateChanged();
  }

  private selectModuleVelocityMode(
    modal: HTMLElement,
    moduleNumber: number,
    mode: VelocityCurveMode,
    settingKey: 'velocityCurve' | 'filterVelocityCurve' = 'velocityCurve',
  ): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    const editor = modal.querySelector<HTMLElement>('.velocity-curve-editor');
    if (!editor) return;
    const current = settingKey === 'filterVelocityCurve'
      ? readFilterVelocityCurve(moduleState?.settings[settingKey])
      : readVelocityCurveSettings(moduleState?.settings[settingKey]);
    const next = velocityCurvePreset(mode, current);
    updateVelocityCurveMarkup(editor, next);
    if (!moduleState) return;
    moduleState.settings[settingKey] = next;
    this.markPlayerStateChanged();
  }

  private setModuleVelocityPoint(
    modal: HTMLElement,
    moduleNumber: number,
    pointIndex: number,
    clientY: number,
    persist: boolean,
    settingKey: 'velocityCurve' | 'filterVelocityCurve' = 'velocityCurve',
  ): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    const editor = modal.querySelector<HTMLElement>('.velocity-curve-editor');
    const plot = modal.querySelector<HTMLElement>('[data-velocity-curve-plot]');
    if (!moduleState || !editor || !plot || pointIndex < 0 || pointIndex > 4) return;
    const current = settingKey === 'filterVelocityCurve'
      ? readFilterVelocityCurve(moduleState.settings[settingKey])
      : readVelocityCurveSettings(moduleState.settings[settingKey]);
    if (current.mode !== 'user') return;
    current.points[pointIndex] = velocityFromClientY(plot, clientY);
    current.userPoints = [...current.points];
    moduleState.settings[settingKey] = current;
    updateVelocityCurveMarkup(editor, current);
    this.scheduleNativeEngineSync();
    if (persist) this.markPlayerStateChanged();
  }

  private setFixedModuleVelocity(
    modal: HTMLElement,
    moduleNumber: number,
    value: number,
    settingKey: 'velocityCurve' | 'filterVelocityCurve' = 'velocityCurve',
  ): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    const editor = modal.querySelector<HTMLElement>('.velocity-curve-editor');
    if (!moduleState || !editor) return;
    const current = settingKey === 'filterVelocityCurve'
      ? readFilterVelocityCurve(moduleState.settings[settingKey])
      : readVelocityCurveSettings(moduleState.settings[settingKey]);
    if (current.mode !== 'fixed' || editor.dataset.velocityMode !== 'fixed') return;
    const fixed = Math.round(Math.min(127, Math.max(0, value)));
    const next = {
      ...current,
      mode: 'fixed' as const,
      points: [fixed, fixed, fixed, fixed, fixed] as [number, number, number, number, number],
      fixedValue: fixed,
    };
    moduleState.settings[settingKey] = next;
    updateVelocityCurveMarkup(editor, next);
    this.scheduleNativeEngineSync();
  }

  private onRootPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const eventTarget = event.target;
    if (!(eventTarget instanceof Element)) return;

    const outputKnob = eventTarget.closest('.player-output-knob') ? this.knobInputForTarget(eventTarget) : null;
    if (outputKnob && this.root.contains(outputKnob)) {
      this.startKnobDrag(event, null);
      return;
    }

    // Toque longo no botão Presets/Keyboard, só com o Keyboard à mostra.
    const bottomViewButton = eventTarget.closest<HTMLButtonElement>('[data-action="toggle-bottom-view"]');
    if (bottomViewButton && this.root.contains(bottomViewButton) && this.bottomView === 'keyboard') {
      this.bottomViewHoldGesture.start(event, () => {
        this.suppressNextBottomViewClick = true;
        window.setTimeout(() => { this.suppressNextBottomViewClick = false; }, 700);
        this.toggleKeyboardOctaveSpan();
      });
      return;
    }

    const inputButton = eventTarget.closest<HTMLButtonElement>(
      '[data-action="toggle-sustain-input"], [data-action="toggle-modulation-input"]',
    );
    if (inputButton && this.root.contains(inputButton)) {
      const moduleNumber = Number.parseInt(inputButton.dataset.module ?? '', 10);
      const input = inputButton.dataset.action === 'toggle-sustain-input' ? 'sustain' : 'modulation';
      if (Number.isInteger(moduleNumber)) {
        this.startCcControlLearn(event, inputButton, { kind: 'module-input', moduleNumber, input });
      }
      return;
    }

    const powerButton = eventTarget.closest<HTMLButtonElement>('[data-action="toggle-module"]');
    if (powerButton && this.root.contains(powerButton)) {
      const moduleNumber = Number.parseInt(powerButton.dataset.module ?? '', 10);
      if (Number.isInteger(moduleNumber)) {
        this.startCcControlLearn(event, powerButton, { kind: 'module-power', moduleNumber });
      }
      return;
    }

    const octaveButton = eventTarget.closest<HTMLButtonElement>('[data-action="octave-up"], [data-action="octave-down"]');
    if (octaveButton && this.root.contains(octaveButton)) {
      const moduleNumber = Number.parseInt(octaveButton.dataset.module ?? '', 10);
      const direction = octaveButton.dataset.action === 'octave-up' ? 1 : -1;
      if (Number.isInteger(moduleNumber)) {
        this.startCcControlLearn(
          event,
          octaveButton,
          { kind: 'module-octave', moduleNumber, direction },
        );
      }
      return;
    }

    const keyboardKey = eventTarget.closest<HTMLButtonElement>('[data-on-screen-key]');
    if (keyboardKey && this.root.contains(keyboardKey)) {
      this.releasePressedKeyboardKey();
      keyboardKey.classList.add('is-pressed');
      this.pressedKeyboardKey = { button: keyboardKey, pointerId: event.pointerId };
      if (keyboardKey.dataset.onScreenCharacter) {
        this.keyboardAccentGesture.start(event, () => {
          if (!openOnScreenAccentOptions(keyboardKey)) return;
          const blockClick = (clickEvent: Event) => {
            clickEvent.preventDefault();
            clickEvent.stopImmediatePropagation();
          };
          keyboardKey.addEventListener('click', blockClick, { capture: true, once: true });
          window.setTimeout(() => keyboardKey.removeEventListener('click', blockClick, true), 900);
        });
      }
    }

    const metronomeButton = eventTarget.closest<HTMLButtonElement>('.player-metronome-button[data-action="toggle-metronome"]');
    if (metronomeButton) {
      if (!this.desktopRuntime) {
        this.metronomeHoldGesture.start(event, () => {
          this.suppressNextMetronomeClick = true;
          window.setTimeout(() => { this.suppressNextMetronomeClick = false; }, 900);
          this.openModal('metronome', null, metronomeButton);
        });
      }
      return;
    }

    const tempoButton = eventTarget.closest<HTMLButtonElement>('[data-action="tap-tempo"]');
    if (tempoButton) {
      event.preventDefault();
      tempoButton.setPointerCapture(event.pointerId);
      this.tempoDrag = { button: tempoButton, pointerId: event.pointerId, startY: event.clientY,
        startX: event.clientX, startBpm: this.metronome.getBpm(), moved: false, held: false };
      if (!this.desktopRuntime) {
        this.tempoHoldGesture.start(event, () => {
          if (this.tempoDrag) this.tempoDrag.held = true;
          this.suppressNextTempoClick = true;
          window.setTimeout(() => { this.suppressNextTempoClick = false; }, 900);
          this.openModal('tempo-edit', null, tempoButton);
        });
      }
      return;
    }

    const outputFader = eventTarget.closest<HTMLElement>('[data-horizontal-output-fader]');
    if (outputFader && this.root.contains(outputFader)) {
      const input = outputFader.querySelector<HTMLInputElement>('[data-output-level]');
      if (!input) return;
      event.preventDefault();
      this.outputFaderDrag = {
        fader: outputFader,
        input,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };
      outputFader.setPointerCapture(event.pointerId);
      input.focus({ preventScroll: true });
      const outputBus = input.dataset.outputLevel;
      if (!this.desktopRuntime && isOutputBus(outputBus)) {
        this.outputFaderLearnGesture.start(event, () => {
          if (outputFader.hasPointerCapture(event.pointerId)) outputFader.releasePointerCapture(event.pointerId);
          this.outputFaderDrag = null;
          this.openCcLearn({ kind: 'output-volume', bus: outputBus }, outputFader);
        });
      }
      this.updateOutputFaderFromPointer(this.outputFaderDrag, event.clientX);
      return;
    }

    const metronomeFader = eventTarget.closest<HTMLElement>('[data-metronome-output-fader]');
    if (metronomeFader && this.root.contains(metronomeFader)) {
      const input = metronomeFader.querySelector<HTMLInputElement>('[data-metronome-output-volume]');
      if (!input) return;
      event.preventDefault();
      this.metronomeFaderDrag = {
        fader: metronomeFader,
        input,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };
      metronomeFader.setPointerCapture(event.pointerId);
      input.focus({ preventScroll: true });
      if (!this.desktopRuntime) {
        this.metronomeFaderLearnGesture.start(event, () => {
          if (metronomeFader.hasPointerCapture(event.pointerId)) metronomeFader.releasePointerCapture(event.pointerId);
          this.metronomeFaderDrag = null;
          this.openCcLearn({ kind: 'metronome-volume' }, metronomeFader);
        });
      }
      this.updateMetronomeFaderFromPointer(this.metronomeFaderDrag, event.clientX);
      return;
    }

    const brandButton = eventTarget.closest<HTMLButtonElement>('[data-action="open-about"]');
    if (brandButton && this.root.contains(brandButton)) {
      // O long press só abre; fechar é com um toque simples.
      if (!this.splitTracksController) this.startTracksHoldGesture(brandButton, event);
      return;
    }

    const effectBankButton = eventTarget.closest<HTMLButtonElement>('[data-action="select-effect-bank"]');
    if (effectBankButton && this.root.contains(effectBankButton)) {
      this.startEffectEditHoldGesture(effectBankButton, event);
      return;
    }

    const bankButton = eventTarget.closest<HTMLButtonElement>('[data-action="show-bank"]');
    if (bankButton && this.root.contains(bankButton)) {
      const bank = bankButton.dataset.bank;
      if (this.isBankId(bank) && !this.desktopRuntime) {
        this.bankHoldGesture.start(event, () => {
          this.suppressNextBankClick = true;
          window.setTimeout(() => { this.suppressNextBankClick = false; }, 900);
          this.openBankNameEditor(bank, bankButton);
        });
      }
      return;
    }

    const configButton = eventTarget.closest<HTMLButtonElement>('[data-action="open-module-settings"]');
    if (configButton && this.root.contains(configButton)) {
      const moduleNumber = Number(configButton.dataset.module);
      if (Number.isInteger(moduleNumber) && !this.desktopRuntime) {
        this.moduleConfigHoldGesture.start(event, () => {
          this.suppressNextModuleConfigClick = true;
          window.setTimeout(() => { this.suppressNextModuleConfigClick = false; }, 900);
          this.beginModuleConfigCopy(moduleNumber);
        });
      }
      return;
    }

    const presetButton = eventTarget.closest<HTMLButtonElement>('.player-preset-button');
    if (presetButton && this.root.contains(presetButton)) {
      this.startPresetHoldGesture(presetButton, event);
      return;
    }

    const moduleSoundButton = eventTarget.closest<HTMLButtonElement>('.player-module__sound-button');
    if (moduleSoundButton && this.root.contains(moduleSoundButton)) {
      if (!this.desktopRuntime) event.preventDefault();
      this.startModuleSoloHoldGesture(moduleSoundButton, event);
      return;
    }

    const triggerButton = eventTarget.closest<HTMLButtonElement>('button[data-performance-kind]');
    if (!triggerButton || !this.root.contains(triggerButton)) return;

    if (this.effectEditMode && triggerButton.dataset.performanceKind === 'effect') {
      this.openEffectPadEditor(triggerButton);
      return;
    }

    if (this.openPerformanceDownloadIfNeeded(triggerButton)) {
      event.preventDefault();
      return;
    }

    if (triggerButton.dataset.performanceKind === 'note') {
      const note = triggerButton.dataset.performanceValue;
      if (note) {
        this.startCcControlLearn(event, triggerButton, { kind: 'pad', bank: this.activePadBank, note }, false);
      }
    }

    this.activatePerformanceButton(triggerButton);
  }

  private onRootPointerMove(event: PointerEvent): void {
    this.keyboardAccentGesture.move(event);
    this.metronomeHoldGesture.move(event);
    this.tempoHoldGesture.move(event);
    this.ccControlHoldGesture.move(event);
    this.bottomViewHoldGesture.move(event);
    this.bankHoldGesture.move(event);
    this.moduleConfigHoldGesture.move(event);
    if (this.tempoDrag?.pointerId === event.pointerId) {
      const drag = this.tempoDrag;
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= (this.desktopRuntime ? 3 : 8)) {
        drag.moved = true;
        this.tempoHoldGesture.cancel();
      }
      if (drag.moved && this.desktopRuntime) {
        event.preventDefault();
        this.metronome.setBpm(drag.startBpm + Math.round((drag.startY - event.clientY) / 3) * 0.5);
        this.markPlayerStateChanged();
      }
      return;
    }
    if (this.knobDrag?.pointerId === event.pointerId) {
      this.knobCcLearnGesture.move(event);
      this.moveKnobDrag(event);
      return;
    }
    if (this.outputFaderDrag?.pointerId === event.pointerId) {
      event.preventDefault();
      if (Math.hypot(event.clientX - this.outputFaderDrag.startX, event.clientY - this.outputFaderDrag.startY) > 8) {
        this.outputFaderDrag.moved = true;
      }
      this.outputFaderLearnGesture.move(event);
      this.updateOutputFaderFromPointer(this.outputFaderDrag, event.clientX);
      return;
    }
    if (this.metronomeFaderDrag?.pointerId === event.pointerId) {
      event.preventDefault();
      if (Math.hypot(event.clientX - this.metronomeFaderDrag.startX, event.clientY - this.metronomeFaderDrag.startY) > 8) {
        this.metronomeFaderDrag.moved = true;
      }
      this.metronomeFaderLearnGesture.move(event);
      this.updateMetronomeFaderFromPointer(this.metronomeFaderDrag, event.clientX);
      return;
    }
    const tracksGesture = this.tracksHoldGesture;
    if (tracksGesture?.pointerId === event.pointerId) {
      if (Math.hypot(event.clientX - tracksGesture.startX, event.clientY - tracksGesture.startY) > 10) {
        this.clearTracksHoldGesture();
      }
      return;
    }
    const effectEditGesture = this.effectEditHoldGesture;
    if (effectEditGesture?.pointerId === event.pointerId) {
      if (Math.hypot(event.clientX - effectEditGesture.startX, event.clientY - effectEditGesture.startY) > 10) {
        this.clearEffectEditHoldGesture();
      }
      return;
    }
    const soloGesture = this.moduleSoloHoldGesture;
    if (soloGesture?.pointerId === event.pointerId) {
      if (Math.hypot(event.clientX - soloGesture.startX, event.clientY - soloGesture.startY) > 10) {
        this.clearModuleSoloHoldGesture();
      }
      return;
    }
    const gesture = this.presetHoldGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 10) {
      this.clearPresetHoldGesture();
    }
  }

  private onRootPointerEnd(event: PointerEvent): void {
    // Pad de efeito em Gate com Continue Press: sai o dedo, para o som.
    this.releaseHeldEffectPads();
    this.keyboardAccentGesture.end(event);
    if (this.pressedKeyboardKey?.pointerId === event.pointerId) this.releasePressedKeyboardKey();
    this.metronomeHoldGesture.end(event);
    this.tempoHoldGesture.end(event);
    this.ccControlHoldGesture.end(event);
    this.bottomViewHoldGesture.end(event);
    this.bankHoldGesture.end(event);
    this.moduleConfigHoldGesture.end(event);
    if (this.tempoDrag?.pointerId === event.pointerId) {
      const drag = this.tempoDrag;
      this.tempoDrag = null;
      if (drag.button.hasPointerCapture(event.pointerId)) drag.button.releasePointerCapture(event.pointerId);
      if (event.type === 'pointerup' && !drag.moved && !drag.held && !this.suppressNextTempoClick) {
        this.metronome.tap(event.timeStamp);
        this.markPlayerStateChanged();
      }
      this.suppressNextTempoClick = false;
      return;
    }
    if (this.knobDrag?.pointerId === event.pointerId) {
      this.knobCcLearnGesture.end(event);
      this.endKnobDrag(event);
      return;
    }
    if (this.outputFaderDrag?.pointerId === event.pointerId) {
      this.outputFaderLearnGesture.end(event);
      const drag = this.outputFaderDrag;
      const { fader } = drag;
      if (fader.hasPointerCapture(event.pointerId)) fader.releasePointerCapture(event.pointerId);
      const outputBus = drag.input.dataset.outputLevel;
      if (
        !drag.moved
        && isOutputBus(outputBus)
        && this.faderDoubleTap.register(`output:${outputBus}`, event.timeStamp)
      ) {
        this.outputLevels[outputBus] = 0;
        this.renderOutputLevels();
        this.applyMusicOutput();
      }
      this.outputFaderDrag = null;
      this.markPlayerStateChanged();
    }
    if (this.metronomeFaderDrag?.pointerId === event.pointerId) {
      this.metronomeFaderLearnGesture.end(event);
      const drag = this.metronomeFaderDrag;
      const { fader } = drag;
      if (fader.hasPointerCapture(event.pointerId)) fader.releasePointerCapture(event.pointerId);
      if (!drag.moved && this.faderDoubleTap.register('metronome', event.timeStamp)) {
        this.metronome.setVolume(1);
        this.renderMetronomeState();
      }
      this.metronomeFaderDrag = null;
      this.markPlayerStateChanged();
    }
    if (this.tracksHoldGesture?.pointerId === event.pointerId) this.clearTracksHoldGesture();
    if (this.capturedTracksPointer?.pointerId === event.pointerId) {
      this.releaseCapturedTracksPointer();
    }
    if (this.effectEditHoldGesture?.pointerId === event.pointerId) this.clearEffectEditHoldGesture();
    if (this.presetHoldGesture?.pointerId === event.pointerId) this.clearPresetHoldGesture();
    if (this.moduleSoloHoldGesture?.pointerId === event.pointerId) this.clearModuleSoloHoldGesture();
  }

  private startCcControlLearn(
    event: PointerEvent,
    trigger: HTMLElement,
    target: CcLearnTarget,
    suppressClick = true,
  ): void {
    if (this.desktopRuntime) return;
    this.ccControlHoldGesture.start(event, () => {
      if (suppressClick) {
        this.suppressNextCcControlClick = trigger;
        window.setTimeout(() => {
          if (this.suppressNextCcControlClick === trigger) this.suppressNextCcControlClick = null;
        }, 900);
      }
      this.openCcLearn(target, trigger);
    });
  }

  private releasePressedKeyboardKey(): void {
    this.pressedKeyboardKey?.button.classList.remove('is-pressed');
    this.pressedKeyboardKey = null;
  }

  private updateOutputFaderFromPointer(drag: OutputFaderDrag, clientX: number): void {
    const outputBus = drag.input.dataset.outputLevel;
    const bounds = drag.fader.getBoundingClientRect();
    if (!isOutputBus(outputBus) || bounds.width <= 0) return;
    const position = Math.min(100, Math.max(0, ((clientX - bounds.left) / bounds.width) * 100));
    const value = outputDbFromPosition(position);
    this.outputLevels[outputBus] = value;
    drag.input.value = String(outputPosition(value));
    drag.input.setAttribute('aria-valuetext', formatOutputDb(value));
    drag.fader.style.setProperty('--output-position', `${outputPosition(value)}%`);
    const output = drag.fader.parentElement?.querySelector<HTMLOutputElement>('[data-output-value]');
    if (output) output.value = formatOutputDb(value);
    if (outputBus === 'music' || outputBus === 'effects') this.applyMusicOutput();
  }

  private updateMetronomeFaderFromPointer(drag: MetronomeFaderDrag, clientX: number): void {
    const bounds = drag.fader.getBoundingClientRect();
    if (bounds.width <= 0) return;
    const volume = Math.min(100, Math.max(0, ((clientX - bounds.left) / bounds.width) * 100));
    const db = outputDbFromPosition(volume);
    this.metronome.setVolume(volume <= 0 ? 0 : 10 ** (db / 20));
    drag.input.value = String(volume);
    drag.input.setAttribute('aria-valuetext', formatOutputDb(db));
    drag.fader.style.setProperty('--output-position', `${volume}%`);
    const output = drag.fader.parentElement?.querySelector<HTMLOutputElement>('[data-metronome-output-value]');
    if (output) output.value = formatOutputDb(db);
  }

  private onRootContextMenu(event: Event): void {
    const target = event.target;
    if (!this.desktopRuntime || !(target instanceof Element)) return;
    event.preventDefault();

    const voiceModeButton = target.closest<HTMLButtonElement>('button[data-module-setting-action="toggle-voice-mode"]');
    if (voiceModeButton && this.modal && this.currentModalKind === 'module-settings' && this.currentModalModuleNumber !== null) {
      this.openChildModal('module-voice-mode', this.currentModalModuleNumber, voiceModeButton);
      return;
    }

    const bankButton = target.closest<HTMLButtonElement>('[data-action="show-bank"]');
    const bank = bankButton?.dataset.bank;
    if (bankButton && this.isBankId(bank)) {
      this.openBankNameEditor(bank, bankButton);
      return;
    }

    const configButton = target.closest<HTMLButtonElement>('[data-action="open-module-settings"]');
    if (configButton) {
      const moduleNumber = Number(configButton.dataset.module);
      if (Number.isInteger(moduleNumber)) this.beginModuleConfigCopy(moduleNumber);
      return;
    }

    const moduleSoundButton = target.closest<HTMLButtonElement>('.player-module__sound-button');
    if (moduleSoundButton) {
      const soloModuleNumber = Number.parseInt(moduleSoundButton.dataset.module ?? '', 10);
      if (Number.isInteger(soloModuleNumber)) this.toggleModuleSolo(soloModuleNumber);
      return;
    }

    const synthPresetButton = target.closest<HTMLButtonElement>('[data-synth-preset]');
    const synthPresetSlot = Number(synthPresetButton?.dataset.synthPreset);
    if (synthPresetButton && Number.isInteger(synthPresetSlot)
        && this.modal && this.currentModalKind === 'module-synth') {
      this.openChildModal('synth-preset-name', synthPresetSlot, synthPresetButton);
      return;
    }

    const userSoundfont = target.closest<HTMLButtonElement>('[data-user-soundfont-id]');
    if (userSoundfont && this.modal && this.currentModalKind === 'sound-selection') {
      this.showUserSoundfontRemoveConfirmation(this.modal, userSoundfont);
      return;
    }

    const fixedSound = target.closest<HTMLButtonElement>('[data-fixed-sound-id]');
    const fixedSoundId = fixedSound?.dataset.fixedSoundId;
    if (
      fixedSound
      && fixedSoundId
      && this.installedFixedSoundIds.has(fixedSoundId)
      && this.modal
      && this.currentModalKind === 'sound-selection'
    ) {
      this.selectedCatalogSoundId = fixedSoundId;
      this.openChildModal('sound-download', this.currentModalModuleNumber, fixedSound);
      return;
    }

    const organDrawbar = target.closest<HTMLElement>('[data-organ-drawbar-track]');
    if (organDrawbar && this.currentModalKind === 'module-organ' && this.currentModalModuleNumber === 7) {
      const learnTarget = this.ccLearnTargetForOrganDrawbar(organDrawbar, this.currentModalModuleNumber);
      if (learnTarget) this.openCcLearn(learnTarget, organDrawbar);
      return;
    }

    const knobInput = this.knobInputForTarget(target);
    if (knobInput) {
      const learnTarget = this.currentModalModuleNumber === null
        ? this.ccLearnTargetForOutputKnob(knobInput)
        : this.ccLearnTargetForKnob(knobInput, this.currentModalModuleNumber);
      if (learnTarget) this.openCcLearn(learnTarget, knobInput);
      return;
    }

    const rotaryToggleButton = target.closest<HTMLButtonElement>('[data-module-rotary-toggle]');
    if (rotaryToggleButton && this.currentModalKind === 'module-settings' && this.currentModalModuleNumber === 7) {
      this.openCcLearn(this.ccLearnTargetForRotaryToggle(), rotaryToggleButton);
      return;
    }

    const rotarySpeedButton = target.closest<HTMLButtonElement>('[data-module-rotary-speed]');
    const rotaryLearnTarget = rotarySpeedButton ? this.ccLearnTargetForRotarySpeed(rotarySpeedButton) : null;
    if (rotarySpeedButton && rotaryLearnTarget) {
      this.openCcLearn(rotaryLearnTarget, rotarySpeedButton);
      return;
    }

    const moduleFader = target.closest<HTMLElement>('[data-module-fader]');
    const moduleNumber = Number(moduleFader?.dataset.moduleFader);
    if (moduleFader && Number.isInteger(moduleNumber)) {
      this.openCcLearn({ kind: 'module-volume', moduleNumber }, moduleFader);
      return;
    }

    const outputFader = target.closest<HTMLElement>('[data-horizontal-output-fader], [data-output-fader]');
    const outputBus = outputFader?.dataset.horizontalOutputFader ?? outputFader?.dataset.outputFader;
    if (outputFader && isOutputBus(outputBus)) {
      this.openCcLearn({ kind: 'output-volume', bus: outputBus }, outputFader);
      return;
    }

    const metronomeFader = target.closest<HTMLElement>('[data-metronome-output-fader]');
    if (metronomeFader) {
      this.openCcLearn({ kind: 'metronome-volume' }, metronomeFader);
      return;
    }

    const delayTap = target.closest<HTMLElement>('[data-module-delay-tap]');
    if (delayTap && this.currentModalModuleNumber !== null) {
      this.openCcLearn({
        kind: 'module-control',
        moduleNumber: this.currentModalModuleNumber,
        control: 'delay:tap',
        label: 'Tap do Delay',
      }, delayTap);
      return;
    }

    const inputToggle = target.closest<HTMLButtonElement>(
      '[data-action="toggle-sustain-input"], [data-action="toggle-modulation-input"]',
    );
    if (inputToggle) {
      const inputModule = Number(inputToggle.dataset.module);
      const input = inputToggle.dataset.action === 'toggle-sustain-input' ? 'sustain' : 'modulation';
      if (Number.isInteger(inputModule)) {
        this.openCcLearn({ kind: 'module-input', moduleNumber: inputModule, input }, inputToggle);
      }
      return;
    }

    const power = target.closest<HTMLButtonElement>('[data-action="toggle-module"]');
    if (power) {
      const powerModule = Number(power.dataset.module);
      if (Number.isInteger(powerModule)) this.openCcLearn({ kind: 'module-power', moduleNumber: powerModule }, power);
      return;
    }

    const octave = target.closest<HTMLButtonElement>('[data-action="octave-up"], [data-action="octave-down"]');
    if (octave) {
      const octaveModule = Number(octave.dataset.module);
      if (Number.isInteger(octaveModule)) {
        this.openCcLearn({
          kind: 'module-octave',
          moduleNumber: octaveModule,
          direction: octave.dataset.action === 'octave-up' ? 1 : -1,
        }, octave);
      }
      return;
    }

    const tempoButton = target.closest<HTMLButtonElement>('[data-action="tap-tempo"]');
    if (tempoButton) {
      this.openModal('tempo-edit', null, tempoButton);
      return;
    }

    const metronomeButton = target.closest<HTMLButtonElement>('[data-action="toggle-metronome"]');
    if (metronomeButton) {
      this.openModal('metronome', null, metronomeButton);
      return;
    }

    const brandButton = target.closest<HTMLButtonElement>('[data-action="open-about"]');
    if (brandButton) {
      if (!this.splitTracksController) this.openTracksSplitView();
      return;
    }

    const trackName = target.closest<HTMLButtonElement>('[data-transport-track-name]');
    if (trackName && !trackName.disabled) {
      this.openModal('track-position', null, trackName);
      return;
    }

    const effectBankButton = target.closest<HTMLButtonElement>('[data-action="select-effect-bank"]');
    const effectBank = effectBankButton?.dataset.effectBank;
    if (effectBankButton && this.isEffectBankId(effectBank)) {
      this.activeEffectBank = effectBank;
      this.effectEditMode = !this.effectEditMode;
      this.renderActiveEffectBank();
      this.setStatus(this.effectEditMode ? 'Modo de edição dos efeitos ativado.' : 'Modo de edição dos efeitos desativado.');
      return;
    }

    const presetButton = target.closest<HTMLButtonElement>('.player-preset-button');
    const presetNumber = Number(presetButton?.dataset.preset);
    if (presetButton && Number.isInteger(presetNumber)) {
      this.openModal('preset-name', presetNumber, presetButton);
      return;
    }

    const performanceButton = target.closest<HTMLButtonElement>('[data-performance-kind]');
    const performance = performanceButton ? readPerformanceTrigger(performanceButton) : null;
    if (performanceButton && performance?.kind === 'note') {
      this.openCcLearn({ kind: 'pad', bank: this.activePadBank, note: performance.value }, performanceButton);
    } else if (
      performanceButton
      && performance?.kind === 'effect'
      && Number.isInteger(Number(performance.value))
    ) {
      this.openCcLearn({
        kind: 'effect',
        bank: this.activeEffectBank,
        effectNumber: Number(performance.value),
      }, performanceButton);
    }
  }

  private startEffectEditHoldGesture(button: HTMLButtonElement, event: PointerEvent): void {
    if (this.desktopRuntime) return;
    this.clearEffectEditHoldGesture();
    const bank = button.dataset.effectBank;
    if (!this.isEffectBankId(bank)) return;
    const timer = window.setTimeout(() => {
      this.effectEditHoldGesture = null;
      this.suppressNextEffectBankClick = true;
      window.setTimeout(() => {
        this.suppressNextEffectBankClick = false;
      }, 900);
      this.activeEffectBank = bank;
      this.effectEditMode = !this.effectEditMode;
      this.renderActiveEffectBank();
      this.setStatus(this.effectEditMode ? 'Modo de edição dos efeitos ativado.' : 'Modo de edição dos efeitos desativado.');
    }, 560);
    this.effectEditHoldGesture = {
      button,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      timer,
    };
  }

  private clearEffectEditHoldGesture(): void {
    if (!this.effectEditHoldGesture) return;
    window.clearTimeout(this.effectEditHoldGesture.timer);
    this.effectEditHoldGesture = null;
  }

  private startTracksHoldGesture(button: HTMLButtonElement, event: PointerEvent): void {
    if (this.desktopRuntime) return;
    this.clearTracksHoldGesture();
    this.releaseCapturedTracksPointer();
    button.setPointerCapture(event.pointerId);
    this.capturedTracksPointer = { button, pointerId: event.pointerId };
    const timer = window.setTimeout(() => {
      this.tracksHoldGesture = null;
      this.suppressNextTracksClick = true;
      window.setTimeout(() => {
        this.suppressNextTracksClick = false;
      }, 700);
      this.openTracksSplitView();
    }, 560);
    this.tracksHoldGesture = {
      button,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      timer,
    };
  }

  private clearTracksHoldGesture(): void {
    if (!this.tracksHoldGesture) return;
    window.clearTimeout(this.tracksHoldGesture.timer);
    this.tracksHoldGesture = null;
  }

  private releaseCapturedTracksPointer(): void {
    if (!this.capturedTracksPointer) return;
    const { button, pointerId } = this.capturedTracksPointer;
    if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
    this.capturedTracksPointer = null;
  }

  private openTracksSplitView(): void {
    this.closeModal(false);
    this.closeTracksSplitView();
    const screen = this.root.querySelector<HTMLElement>('.player-screen');
    if (!screen) return;
    // Com a playlist aberta os módulos ficam compactos e tudo cabe nos 70%:
    // não há mais barra de arraste horizontal.
    screen.insertAdjacentHTML('beforeend', createTracksSplitPanelMarkup());
    const panel = screen.querySelector<HTMLElement>('.tracks-split-panel');
    if (!panel) return;
    screen.classList.add('is-tracks-split');
    this.splitTracksController = new TracksPanelController(
      panel,
      this.trackLibrary,
      {
        autoEnabled: this.tracksAutoEnabled,
        loopEnabled: this.tracksLoopEnabled,
        getPlaybackSnapshot: () => this.trackTransport?.getSnapshot() ?? this.trackPlaybackSnapshot,
        onAutoEnabledChanged: (enabled) => this.setTracksAutoEnabled(enabled),
        onLoopEnabledChanged: (enabled) => {
          this.tracksLoopEnabled = enabled;
          this.trackTransport?.setLoopEnabled(enabled);
        },
        onTrackSelected: (track) => this.selectTrack(track),
        onVisibleTracksChanged: (tracks) => this.updateVisibleTrackSequence(tracks),
        onTracksDeleting: (tracks) => this.deleteStoredTracks(tracks),
      },
    );
    this.splitTracksController.mount();
  }

  private closeTracksSplitView(): void {
    this.splitTracksController?.destroy();
    this.splitTracksController = null;
    const screen = this.root.querySelector<HTMLElement>('.player-screen');
    screen?.classList.remove('is-tracks-split');
    screen?.querySelector('.tracks-split-panel')?.remove();
  }

  private selectTrack(track: LocalTrack): void {
    void this.trackTransport?.selectTrack(track);
  }

  private handleTrackPlaybackSnapshot(snapshot: TrackPlaybackSnapshot): void {
    this.trackPlaybackSnapshot = snapshot;
    this.renderQueuedTrackName(snapshot.queuedTrackName);
    this.tracksPanelController?.syncPlayback(snapshot);
    this.splitTracksController?.syncPlayback(snapshot);
    this.ensureAutomaticQueue();
  }

  private renderQueuedTrackName(trackName: string | null): void {
    const viewport = this.root.querySelector<HTMLElement>('[data-next-track-name]');
    const label = viewport?.querySelector<HTMLElement>('span');
    if (!viewport || !label) return;
    const normalizedName = trackName?.trim() ?? '';
    if (normalizedName === this.renderedQueuedTrackName) return;
    this.renderedQueuedTrackName = normalizedName;
    viewport.hidden = normalizedName.length === 0;
    label.textContent = normalizedName;
    label.classList.remove('is-marquee');
    viewport.style.setProperty('--next-track-viewport-width', `${viewport.clientWidth}px`);
    if (normalizedName && label.scrollWidth > viewport.clientWidth + 2) {
      label.classList.add('is-marquee');
    }
    viewport.closest<HTMLElement>('.player-next-field')?.setAttribute(
      'aria-label',
      normalizedName ? `Próxima música: ${normalizedName}` : 'Próxima música',
    );
  }

  private setTracksAutoEnabled(enabled: boolean): void {
    this.tracksAutoEnabled = enabled;
    if (!enabled) {
      this.trackTransport?.clearAutoQueue();
      return;
    }
    this.ensureAutomaticQueue();
  }

  private updateVisibleTrackSequence(tracks: LocalTrack[]): void {
    this.visibleTrackSequence = [...tracks];
    this.ensureAutomaticQueue();
  }

  private ensureAutomaticQueue(): void {
    const transport = this.trackTransport;
    if (!transport || !this.tracksAutoEnabled) return;
    const snapshot = transport.getSnapshot();
    if (!snapshot.playingTrackId || snapshot.queueSource === 'manual') return;
    const currentIndex = this.visibleTrackSequence.findIndex(({ id }) => id === snapshot.playingTrackId);
    const nextTrack = currentIndex >= 0 ? this.visibleTrackSequence[currentIndex + 1] ?? null : null;
    void transport.setAutoQueue(nextTrack);
  }

  private startPresetHoldGesture(button: HTMLButtonElement, event: PointerEvent): void {
    if (this.desktopRuntime) return;
    this.clearPresetHoldGesture();
    const presetNumber = Number.parseInt(button.dataset.preset ?? '', 10);
    if (!Number.isInteger(presetNumber)) return;

    const timer = window.setTimeout(() => {
      this.presetHoldGesture = null;
      this.suppressNextPresetClick = true;
      window.setTimeout(() => {
        this.suppressNextPresetClick = false;
      }, 900);
      this.openModal('preset-name', presetNumber, button);
    }, 560);
    this.presetHoldGesture = {
      button,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      timer,
    };
  }

  private clearPresetHoldGesture(): void {
    if (!this.presetHoldGesture) return;
    window.clearTimeout(this.presetHoldGesture.timer);
    this.presetHoldGesture = null;
  }

  private startModuleSoloHoldGesture(button: HTMLButtonElement, event: PointerEvent): void {
    if (this.desktopRuntime) return;
    this.clearModuleSoloHoldGesture();
    const moduleNumber = Number.parseInt(button.dataset.module ?? '', 10);
    if (!Number.isInteger(moduleNumber)) return;
    // Prende o ponteiro no próprio botão: sem isso, em alguns navegadores um
    // toque longo sem o dedo se mover perfeitamente parado ainda soltava um
    // clique solto que caía em outro elemento por baixo.
    button.setPointerCapture(event.pointerId);
    const timer = window.setTimeout(() => {
      this.moduleSoloHoldGesture = null;
      if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
      this.suppressNextModuleSoundClick = true;
      window.setTimeout(() => {
        this.suppressNextModuleSoundClick = false;
      }, 900);
      // Bloqueio direto no próprio botão, na fase de captura: o toque longo
      // solta o dedo bem em cima do clique que ele mesmo gera, e a flag de
      // supressão sozinha corria risco de perder essa corrida.
      const blockClick = (clickEvent: Event) => {
        clickEvent.preventDefault();
        clickEvent.stopImmediatePropagation();
      };
      button.addEventListener('click', blockClick, { capture: true, once: true });
      window.setTimeout(() => button.removeEventListener('click', blockClick, true), 900);
      this.toggleModuleSolo(moduleNumber);
    }, 560);
    this.moduleSoloHoldGesture = {
      button,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      timer,
    };
  }

  private clearModuleSoloHoldGesture(): void {
    if (!this.moduleSoloHoldGesture) return;
    const { button, pointerId, timer } = this.moduleSoloHoldGesture;
    window.clearTimeout(timer);
    if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
    this.moduleSoloHoldGesture = null;
  }

  private toggleModuleSolo(moduleNumber: number): void {
    // Solo único: soar outro módulo substitui o anterior, sem acumular.
    this.soloedModuleNumber = this.soloedModuleNumber === moduleNumber ? null : moduleNumber;
    this.renderModuleSoloState();
  }

  private renderModuleSoloState(): void {
    const row = this.root.querySelector<HTMLElement>('.player-modules-row');
    if (!row) return;
    row.classList.toggle('has-soloed-module', this.soloedModuleNumber !== null);
    for (const moduleElement of row.querySelectorAll<HTMLElement>('.player-module')) {
      const moduleNumber = Number.parseInt(moduleElement.dataset.module ?? '', 10);
      moduleElement.classList.toggle('is-soloed', moduleNumber === this.soloedModuleNumber);
    }
  }

  private activatePerformanceButton(button: HTMLButtonElement): void {
    const trigger = readPerformanceTrigger(button);
    if (!trigger) return;

    if (trigger.kind === 'note') {
      const previousPads = Array.from(this.padBankSelections.entries())
        .filter((entry): entry is [PadBankId, string] => entry[1] !== null);
      for (const [padBank, note] of previousPads) {
        if (padBank === this.activePadBank && note === trigger.value) continue;
        this.dispatchPerformanceTrigger({
          kind: 'note',
          value: note,
          label: note,
          active: false,
          padBank,
        });
      }
      const active = this.toggleNotePad(trigger.value);
      this.dispatchPerformanceTrigger({
        ...trigger,
        active,
        padBank: this.activePadBank,
      });
      return;
    }

    const effectNumber = Number.parseInt(trigger.value, 10);
    this.triggerEffect(this.activeEffectBank, effectNumber);
  }

  // Infinite Release é polifônico: cada toque ganha seu próprio player e não
  // reinicia as instâncias que ainda estão tocando.
  private async playEffectPadAudio(
    bank: EffectBankId,
    effectNumber: number,
    state: EffectPadState,
  ): Promise<void> {
    if (!state.audioFileName) return;
    const key = `${bank}:${effectNumber}`;
    let pool = this.effectPadAudio.get(key);
    if (!pool) {
      const file = await this.effectAudioLibrary.get(bank, effectNumber).catch(() => null);
      if (!file || !this.mounted) return;
      // Dois toques muito rápidos podem terminar a leitura juntos. Só o
      // primeiro cria a URL; o segundo usa o pool que acabou de ser publicado.
      pool = this.effectPadAudio.get(key);
      if (!pool) {
        pool = { url: URL.createObjectURL(file), voices: new Set() };
        this.effectPadAudio.set(key, pool);
      }
    }
    const audio = new Audio(pool.url);
    pool.voices.add(audio);
    audio.preload = 'auto';
    const baseGain = Math.pow(10, state.volumeDb / 20);
    const effectsGain = this.outputEnabled.effects ? Math.pow(10, this.outputLevels.effects / 20) : 0;
    this.effectAudioBaseGain.set(audio, baseGain);
    audio.volume = Math.min(1, Math.max(0, baseGain * effectsGain));
    audio.addEventListener('ended', () => this.finishEffectPadAudioVoice(key, audio), { once: true });
    await this.attachEffectMeter(audio);
    await audio.play().catch(() => {
      this.finishEffectPadAudioVoice(key, audio);
      this.setStatus('Não foi possível tocar o áudio deste efeito.');
    });
  }

  private stopEffectPadAudio(bank: EffectBankId, effectNumber: number): void {
    const pool = this.effectPadAudio.get(`${bank}:${effectNumber}`);
    if (!pool) return;
    for (const audio of pool.voices) {
      this.detachEffectMeter(audio);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    pool.voices.clear();
  }

  private finishEffectPadAudioVoice(key: string, audio: HTMLAudioElement): void {
    this.detachEffectMeter(audio);
    const pool = this.effectPadAudio.get(key);
    if (!pool || !pool.voices.delete(audio)) return;
    audio.removeAttribute('src');
    audio.load();
    if (pool.voices.size > 0) return;
    const [bank, effectText] = key.split(':');
    const effectNumber = Number.parseInt(effectText ?? '', 10);
    if (!this.isEffectBankId(bank) || !Number.isInteger(effectNumber)) return;
    const state = this.effectPadStates.get(bank)?.[effectNumber - 1];
    if (!state?.active) return;
    state.active = false;
    if (bank === this.activeEffectBank) this.renderActiveEffectBank();
  }

  private disposeEffectPadAudio(key: string): void {
    const pool = this.effectPadAudio.get(key);
    if (!pool) return;
    const [bank, effectText] = key.split(':');
    const effectNumber = Number.parseInt(effectText ?? '', 10);
    if (this.isEffectBankId(bank) && Number.isInteger(effectNumber)) {
      this.stopEffectPadAudio(bank, effectNumber);
    }
    URL.revokeObjectURL(pool.url);
    this.effectPadAudio.delete(key);
  }

  // Solta o pad: para o som e apaga a luz do botão.
  private releaseEffectPad(bank: EffectBankId, effectNumber: number): void {
    const state = this.effectPadStates.get(bank)?.[effectNumber - 1];
    this.stopEffectPadAudio(bank, effectNumber);
    if (!state || !state.active) return;
    state.active = false;
    if (bank === this.activeEffectBank) this.renderActiveEffectBank();
  }

  // Gate com Continue Press: o som acompanha o dedo e para quando ele sai.
  private releaseHeldEffectPads(): void {
    for (const [bank, states] of this.effectPadStates) {
      states.forEach((state, index) => {
        if (state.active && state.triggerMode === 'gate' && state.gateRelease === 'continue-press') {
          this.releaseEffectPad(bank, index + 1);
        }
      });
    }
  }

  private performanceAssetForButton(button: HTMLButtonElement): PerformanceAssetDefinition | null {
    if (button.dataset.performanceKind === 'effect') {
      if (this.activeEffectBank !== '1' && this.activeEffectBank !== '2') return null;
      const slot = Number.parseInt(button.dataset.performanceValue ?? '', 10);
      return Number.isInteger(slot)
        ? this.soundCatalog.getPerformanceAsset('fx', this.activeEffectBank, slot)
        : null;
    }
    if (button.dataset.performanceKind !== 'note') return null;
    const buttons = Array.from(this.root.querySelectorAll<HTMLButtonElement>('.performance-pad--note'));
    const slot = buttons.indexOf(button) + 1;
    return slot > 0 ? this.soundCatalog.getPerformanceAsset('pad', this.activePadBank, slot) : null;
  }

  private openPerformanceDownloadIfNeeded(button: HTMLButtonElement): boolean {
    const asset = this.performanceAssetForButton(button);
    if (!asset || this.installedFixedSoundIds.has(performanceStorageId(asset.id))) return false;
    this.selectedPerformanceAsset = asset;
    this.openModal('performance-download', null, button);
    return true;
  }

  private toggleNotePad(note: string): boolean {
    const activeNote = this.padBankSelections.get(this.activePadBank) ?? null;
    const nextNote = activeNote === note ? null : note;
    for (const padBank of PAD_BANK_IDS) this.padBankSelections.set(padBank, null);
    this.padBankSelections.set(this.activePadBank, nextNote);
    this.renderActivePadBank();
    this.markPlayerStateChanged();
    return nextNote === note;
  }

  private dispatchPerformanceTrigger(trigger: PerformanceTrigger): void {
    this.root.dispatchEvent(new CustomEvent<PerformanceTrigger>('hookkeys:performance-trigger', {
      bubbles: true,
      detail: trigger,
    }));
    const action = trigger.kind === 'note'
      ? trigger.active ? 'ativada' : 'desativada'
      : 'acionado';
    this.setStatus(`${trigger.label} ${action}.`);
  }

  private isBankId(value: string | undefined): value is BankId {
    return value !== undefined && BANK_IDS.some((bank) => bank === value);
  }

  private selectBottomView(view: PlayerBottomView, settingsModal?: HTMLElement): void {
    this.bottomView = view;
    this.renderBottomView();
    for (const button of settingsModal?.querySelectorAll<HTMLButtonElement>('[data-setting-view]') ?? []) {
      const selected = button.dataset.settingView === view;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    if (view === 'keyboard') void this.midiInput.requestAccess();
    this.markPlayerStateChanged();
  }

  private renderBottomView(): void {
    const panel = this.root.querySelector<HTMLElement>('[data-player-bottom-panel]');
    if (!panel) return;
    // No desktop o Keyboard fica fixo embaixo dos presets. No app os dois
    // dividem o mesmo espaço: o botão Presets/Keyboard troca quem aparece.
    const showingKeyboard = !this.desktopRuntime && this.bottomView === 'keyboard';
    panel.classList.toggle('is-keyboard', showingKeyboard);
    panel.setAttribute('aria-label', this.desktopRuntime
      ? 'Presets e Keyboard'
      : showingKeyboard ? 'Keyboard' : 'Presets');
    const presets = panel.querySelector<HTMLElement>('.player-presets__grid');
    const keyboard = panel.querySelector<HTMLElement>('[data-performance-keyboard]');
    if (presets) presets.hidden = showingKeyboard;
    if (keyboard) keyboard.hidden = !this.desktopRuntime && !showingKeyboard;
    const viewButton = panel.querySelector<HTMLButtonElement>('[data-action="toggle-bottom-view"]');
    if (viewButton) {
      viewButton.dataset.bottomView = showingKeyboard ? 'keyboard' : 'presets';
      viewButton.textContent = showingKeyboard ? 'Keyboard' : 'Presets';
      viewButton.setAttribute('aria-label', showingKeyboard
        ? 'Mostrando o Keyboard. Tocar para mostrar os presets'
        : 'Mostrando os presets. Tocar para mostrar o Keyboard');
    }
    for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-action="copy-preset"]')) {
      button.setAttribute('aria-disabled', String(showingKeyboard));
      button.tabIndex = showingKeyboard ? -1 : 0;
    }
    for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-action="show-bank"]')) {
      button.removeAttribute('aria-disabled');
      button.tabIndex = 0;
    }
    this.renderKeyboardOctaveSpan();
    if (!showingKeyboard && !this.desktopRuntime) this.keyboardExpression?.cancelGestures();
  }

  // Quatro oitavas: troca o teclado inteiro por um de C2 a C5, com as teclas
  // mais largas. É outro teclado, não um pedaço do de 88.
  private renderKeyboardOctaveSpan(): void {
    const scroller = this.root.querySelector<HTMLElement>('.performance-keyboard__scroller');
    if (!scroller || scroller.dataset.keyboardSpan === this.keyboardOctaveSpan) return;
    scroller.dataset.keyboardSpan = this.keyboardOctaveSpan;
    scroller.innerHTML = createPerformanceKeysMarkup(this.keyboardOctaveSpan);
    scroller.scrollLeft = 0;
    this.performanceKeyboard?.refreshKeys();
  }

  private toggleKeyboardOctaveSpan(): void {
    this.keyboardOctaveSpan = this.keyboardOctaveSpan === 'four' ? 'full' : 'four';
    this.renderKeyboardOctaveSpan();
    this.setStatus(this.keyboardOctaveSpan === 'four'
      ? 'Keyboard em quatro oitavas, de C2 a C5.'
      : 'Keyboard inteiro, 88 teclas.');
    this.markPlayerStateChanged();
  }

  private selectKeyboardMidiSlot(modal: HTMLElement, slot: 1 | 2 | 3): void {
    this.keyboardMidiSlot = slot;
    this.syncKeyboardExpressionInput();
    for (const button of modal.querySelectorAll<HTMLButtonElement>('[data-keyboard-midi-slot]')) {
      const selected = Number(button.dataset.keyboardMidiSlot) === slot;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    this.markPlayerStateChanged();
  }

  private selectKeyboardStyle(modal: HTMLElement, style: PerformanceKeyboardStyle): void {
    this.keyboardStyle = style;
    this.performanceKeyboard?.setStyle(style);
    for (const button of modal.querySelectorAll<HTMLButtonElement>('[data-keyboard-style]')) {
      const selected = button.dataset.keyboardStyle === style;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    this.markPlayerStateChanged();
  }

  private isPadBankId(value: string | undefined): value is PadBankId {
    return value !== undefined && PAD_BANK_IDS.some((bank) => bank === value);
  }

  private isEffectBankId(value: string | undefined): value is EffectBankId {
    return value !== undefined && EFFECT_BANK_IDS.some((bank) => bank === value);
  }

  private selectPadBank(bank: PadBankId): void {
    if (bank === this.activePadBank) return;
    this.activePadBank = bank;
    this.renderActivePadBank();
    this.markPlayerStateChanged();
  }

  private selectEffectBank(bank: EffectBankId): void {
    if (bank === this.activeEffectBank) return;
    this.activeEffectBank = bank;
    this.renderActiveEffectBank();
    this.markPlayerStateChanged();
  }

  private renderActiveEffectBank(): void {
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-action="select-effect-bank"]')) {
      const isSelected = button.dataset.effectBank === this.activeEffectBank;
      button.classList.toggle('is-selected', isSelected);
      // O selo pertence ao banco que está sendo editado, não ao seletor inteiro.
      button.classList.toggle('is-editing', this.effectEditMode && isSelected);
      button.setAttribute('aria-pressed', String(isSelected));
      const bank = button.dataset.effectBank;
      const label = button.querySelector<HTMLElement>('span');
      if (label && this.isEffectBankId(bank)) label.textContent = this.effectBankNames.get(bank) ?? `FX ${bank}`;
    }
    const effectsSection = this.root.querySelector<HTMLElement>('.performance-grid--effects')
      ?.closest<HTMLElement>('.performance-section');
    effectsSection?.classList.toggle('is-editing', this.effectEditMode);

    const effectStates = this.effectPadStates.get(this.activeEffectBank) ?? createEffectPadStates();
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('.performance-pad--effect')) {
      const effectIndex = Number.parseInt(button.dataset.performanceValue ?? '', 10) - 1;
      const state = effectStates[effectIndex];
      const colors = EFFECT_PAD_COLORS[state?.colorIndex ?? effectIndex % EFFECT_PAD_COLORS.length]
        ?? EFFECT_PAD_COLORS[0];
      const catalogAsset = this.soundCatalog.getPerformanceAsset('fx', this.activeEffectBank, effectIndex + 1);
      const name = (this.activeEffectBank === '1' || this.activeEffectBank === '2')
        ? catalogAsset?.name ?? state?.name ?? `Efeito ${effectIndex + 1}`
        : state?.name ?? `Efeito ${effectIndex + 1}`;
      const label = button.querySelector<HTMLElement>('span');
      if (label) label.textContent = name;
      button.style.setProperty('--effect-accent', colors[0]);
      button.style.setProperty('--effect-dark', colors[1]);
      button.setAttribute('aria-label', name);
      button.classList.toggle('is-active', state?.active === true);
      button.setAttribute('aria-pressed', String(state?.active === true));
    }
  }

  private openEffectPadEditor(button: HTMLButtonElement): void {
    const effectNumber = Number.parseInt(button.dataset.performanceValue ?? '', 10);
    if (!Number.isInteger(effectNumber) || effectNumber < 1 || effectNumber > EFFECT_COUNT) return;
    this.openModal('effect-pad', effectNumber, button);
  }

  private renderActivePadBank(): void {
    const selectedNote = this.padBankSelections.get(this.activePadBank) ?? null;
    const notesSection = this.root.querySelector<HTMLElement>('.performance-section--notes');
    if (notesSection) notesSection.dataset.activePadBank = this.activePadBank;
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-action="select-pad-bank"]')) {
      const isSelected = button.dataset.padBank === this.activePadBank;
      button.classList.toggle('is-selected', isSelected);
      button.setAttribute('aria-pressed', String(isSelected));
    }

    const noteButtons = Array.from(this.root.querySelectorAll<HTMLButtonElement>('.performance-pad--note'));
    for (const [index, button] of noteButtons.entries()) {
      const catalogAsset = this.soundCatalog.getPerformanceAsset('pad', this.activePadBank, index + 1);
      const label = button.querySelector<HTMLElement>('span');
      if (label && catalogAsset) label.textContent = catalogAsset.name;
      if (catalogAsset) button.setAttribute('aria-label', catalogAsset.name);
      const isActive = button.dataset.performanceValue === selectedNote;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    }
  }

  private showPadsEffects(): void {
    this.cancelNoteLearn();
    this.patternPlayback.reset();
    if (this.activeView === 'pads-effects') {
      this.effectEditMode = false;
      this.activeView = 'bank';
      this.restoreActivePresetState();
      this.updateVisibleView();
      this.markPlayerStateChanged();
      return;
    }
    this.saveActivePresetState();
    this.activeView = 'pads-effects';
    this.updateVisibleView();
    this.markPlayerStateChanged();
  }

  private showBank(bank: BankId): void {
    if (this.activeView === 'bank' && bank === this.activeBank) return;
    if (bank !== this.activeBank && this.liveMidiEnabled && this.seamlessPresetSwitching) {
      this.nativePresetTransitionPending = true;
    } else if (bank !== this.activeBank && this.liveMidiEnabled) {
      this.nativePresetTransitionPending = false;
      void hookKeysNative.stopAllNotes();
    }
    this.soundfontSelectionRevision += 1;
    this.cancelNoteLearn();
    this.patternPlayback.reset();
    if (this.activeView === 'bank') this.saveActivePresetState();
    this.activeBank = bank;
    this.activeView = 'bank';
    this.restoreActivePresetState();
    this.updateVisibleView();
    this.markPlayerStateChanged();
  }

  private openBankNameEditor(bank: BankId, trigger: HTMLElement): void {
    this.pendingBankEdit = bank;
    this.openModal('bank-name', null, trigger);
  }

  private beginModuleConfigCopy(moduleNumber: number): void {
    if (moduleNumber < 1 || moduleNumber > 6) {
      this.setStatus('A cópia de Config funciona somente entre os módulos 1 a 6.');
      return;
    }
    this.moduleConfigCopySource = moduleNumber;
    this.renderModuleConfigCopyState();
    this.setStatus(`Config do módulo ${moduleNumber} copiado. Toque no Config de outro módulo de 1 a 6.`);
  }

  private cancelModuleConfigCopy(message?: string): void {
    this.moduleConfigCopySource = null;
    this.renderModuleConfigCopyState();
    if (message) this.setStatus(message);
  }

  private renderModuleConfigCopyState(): void {
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-action="open-module-settings"]')) {
      const source = Number(button.dataset.module) === this.moduleConfigCopySource;
      button.classList.toggle('is-config-copy-source', source);
      button.setAttribute('aria-pressed', String(source));
    }
  }

  private copyModuleConfiguration(sourceNumber: number, targetNumber: number): void {
    const preset = this.getActivePresetState();
    const source = preset?.modules[sourceNumber - 1];
    const target = preset?.modules[targetNumber - 1];
    if (!preset || !source || !target || sourceNumber > 6 || targetNumber > 6) return;
    const preservedMidiInputId = target.midiInputId;
    const copied = JSON.parse(JSON.stringify(source)) as ModulePresetState;
    copied.midiInputId = preservedMidiInputId;
    preset.modules[targetNumber - 1] = copied;
    // Os mapas CC ficam fora do estado do módulo e, portanto, continuam
    // exatamente como estavam no destino.
    this.nativeLoadedTimbres[targetNumber - 1] = null;
    this.soundfontSelectionRevision += 1;
    this.cancelModuleConfigCopy();
    this.restoreActivePresetState();
    this.markPlayerStateChanged();
    this.setStatus(`Config e timbre do módulo ${sourceNumber} copiados para o módulo ${targetNumber}. MIDI preservado.`);
  }

  private updateVisibleView(): void {
    const bankView = requiredElement<HTMLElement>(this.root, '[data-player-view="bank"]');
    const padsView = requiredElement<HTMLElement>(this.root, '[data-player-view="pads-effects"]');
    const showingBank = this.activeView === 'bank';
    bankView.hidden = !showingBank;
    padsView.hidden = showingBank;
    const screen = requiredElement<HTMLElement>(this.root, '.player-screen');
    screen.classList.toggle('is-bank-view', showingBank);
    screen.classList.toggle('is-pads-view', !showingBank);
    const padsButton = requiredElement<HTMLButtonElement>(
      this.root,
      '[data-action="show-pads-effects"]',
    );
    padsButton.classList.toggle('is-selected', !showingBank);
    padsButton.setAttribute('aria-pressed', String(!showingBank));

    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-action="show-bank"]')) {
      const isSelected = button.dataset.bank === this.activeBank;
      const bankId = button.dataset.bank;
      const bankState = this.isBankId(bankId) ? this.bankStates.get(bankId) : null;
      button.textContent = bankState?.name || bankId || '';
      button.dataset.bankModeLabel = faderModeLabel(bankState?.faderMode ?? 'default');
      button.setAttribute('aria-label', `Banco ${bankId}${bankState?.name ? `: ${bankState.name}` : ''}`);
      button.classList.toggle('is-selected', isSelected);
      button.setAttribute('aria-pressed', String(isSelected));
    }
    this.renderPresetCopyButton();
    this.renderModuleConfigCopyState();
  }

  private getActivePresetState(): PresetState | null {
    const bank = this.bankStates.get(this.activeBank);
    if (!bank || bank.selectedPreset === null) return null;
    return bank.presets[bank.selectedPreset - 1] ?? null;
  }

  private ensureActivePresetState(): PresetState | null {
    const active = this.getActivePresetState();
    if (active) return active;
    const bank = this.bankStates.get(this.activeBank);
    if (!bank) return null;
    for (const state of this.bankStates.values()) state.selectedPreset = null;
    bank.selectedPreset = 1;
    this.restoreActivePresetState();
    return bank.presets[0] ?? null;
  }

  private saveActivePresetState(): void {
    const preset = this.getActivePresetState();
    const bank = this.bankStates.get(this.activeBank);
    if (!preset || !bank) return;
    for (const [moduleNumber, fader] of this.faders) {
      const moduleState = preset.modules[moduleNumber - 1];
      if (!moduleState) continue;
      if (faderModeUsesPersistentVolumes(bank.faderMode)) {
        bank.masterVolumes[moduleNumber - 1] = fader.getValueDb();
      } else {
        moduleState.volumeDb = fader.getValueDb();
      }
    }
  }

  private restoreActivePresetState(): void {
    this.patternPlayback.reset();
    const bank = this.bankStates.get(this.activeBank);
    const preset = this.getActivePresetState();
    if (!bank) return;

    if (preset) {
      for (const [moduleNumber, fader] of this.faders) {
        const moduleState = preset.modules[moduleNumber - 1];
        fader.setValueDb(faderModeUsesPersistentVolumes(bank.faderMode)
          ? bank.masterVolumes[moduleNumber - 1] ?? 0
          : moduleState?.volumeDb ?? 0);

        const moduleElement = this.root.querySelector<HTMLElement>(
          `.player-module[data-module="${moduleNumber}"]`,
        );
        if (!moduleElement || !moduleState) continue;

        if (!moduleState.category && !moduleState.timbreId) {
          moduleState.category = this.moduleDefaultSoundCategory(moduleNumber);
        }

        const soundLabel = requiredElement<HTMLElement>(moduleElement, '.player-module__sound-label');
        const soundButton = requiredElement<HTMLButtonElement>(moduleElement, '.player-module__sound-button');
        const powerButton = requiredElement<HTMLButtonElement>(moduleElement, '.player-module__power-button');
        if (moduleNumber === 8) {
          soundLabel.textContent = 'Synth';
          soundButton.setAttribute('aria-label', 'Abrir editor do Synth');
        } else if (moduleNumber === 7) {
          soundLabel.textContent = 'Organ';
          soundLabel.classList.remove('is-empty');
          soundButton.setAttribute('aria-label', 'Abrir os drawbars do Organ');
          soundButton.classList.remove('has-selected-timbre');
          soundButton.style.removeProperty('--module-sound-color');
        } else {
          const displayedTimbreName = moduleState.timbreId
            ? moduleState.timbreName
            : moduleEmptySoundName(moduleNumber);
          // Sem timbre, o botão mostra só um + (o nome continua no aria-label).
          soundLabel.textContent = moduleState.timbreId ? displayedTimbreName : '+';
          soundLabel.classList.toggle('is-empty', !moduleState.timbreId);
          soundButton.setAttribute(
            'aria-label',
            `Escolher timbre do módulo ${moduleNumber}. Atual: ${displayedTimbreName}`,
          );
          const fixedTimbreColor = moduleState.timbreId?.startsWith('fixed:')
            ? this.soundCatalog.get(moduleState.timbreId.slice(6))?.color ?? null
            : null;
          const timbreColor = normalizeSoundColor(moduleState.timbreColor) ?? fixedTimbreColor;
          soundButton.classList.toggle('has-selected-timbre', Boolean(moduleState.timbreId && timbreColor));
          if (moduleState.timbreId && timbreColor) soundButton.style.setProperty('--module-sound-color', timbreColor);
          else soundButton.style.removeProperty('--module-sound-color');
        }
        this.renderModulePowerButton(powerButton, moduleNumber, moduleState.enabled);
        this.renderModuleActionState(moduleElement, moduleNumber, moduleState);
      }
    }

    for (const button of this.root.querySelectorAll<HTMLButtonElement>('.player-preset-button')) {
      const presetNumber = Number.parseInt(button.dataset.preset ?? '', 10);
      const isSelected = presetNumber === bank.selectedPreset;
      const presetState = bank.presets[presetNumber - 1];
      const presetName = presetState?.name ?? 'Preset';
      button.classList.toggle('is-selected', isSelected);
      button.setAttribute('aria-pressed', String(isSelected));
      button.setAttribute('aria-label', `Preset ${presetNumber}: ${presetName}`);
      const label = button.querySelector<HTMLElement>('.player-preset-button__label');
      if (label) label.textContent = presetName;
    }

    const workspace = requiredElement<HTMLElement>(this.root, '.player-workspace');
    workspace.setAttribute('aria-label', `Módulos de timbre do Banco ${this.activeBank}`);
    this.renderPresetCopyButton();
  }

  private activePresetKey(): string | null {
    const selected = this.bankStates.get(this.activeBank)?.selectedPreset ?? null;
    return selected === null ? null : `${this.activeBank}:${selected}`;
  }

  // Copy (vermelho) -> copiado (amarelo piscando) -> outro preset escolhido:
  // Paste (piscando mais rápido). Copy de novo cancela; Paste abre a confirmação.
  private pressPresetCopyButton(trigger: HTMLElement): void {
    const clipboard = this.presetClipboard;
    const bank = this.bankStates.get(this.activeBank);
    const presetNumber = bank?.selectedPreset ?? null;
    if (!clipboard) {
      const preset = this.getActivePresetState();
      if (!preset || presetNumber === null) {
        this.setStatus('Escolha um preset para copiar.');
        return;
      }
      this.saveActivePresetState();
      this.presetClipboard = {
        preset: JSON.parse(JSON.stringify(preset)) as PresetState,
        bank: this.activeBank,
        presetNumber,
        declinedTarget: null,
      };
      this.renderPresetCopyButton();
      this.setStatus(`${presetSlotLabel(this.activeBank, presetNumber)} copiado. Escolha o preset que vai receber a cópia.`);
      return;
    }
    const target = this.activePresetKey();
    const pasteReady = target !== null && target !== `${clipboard.bank}:${clipboard.presetNumber}`;
    if (!pasteReady || clipboard.declinedTarget === target || presetNumber === null) {
      this.presetClipboard = null;
      this.renderPresetCopyButton();
      this.setStatus('Cópia de preset cancelada.');
      return;
    }
    // Cancelar a confirmação guarda a cópia; tocar Paste de novo neste mesmo
    // preset é que cancela tudo.
    clipboard.declinedTarget = target;
    this.openModal('preset-paste-confirm', presetNumber, trigger);
  }

  private pastePresetClipboard(): void {
    const clipboard = this.presetClipboard;
    const bank = this.bankStates.get(this.activeBank);
    const presetNumber = bank?.selectedPreset ?? null;
    if (!clipboard || !bank || presetNumber === null) return;
    // Um CC mapeado pode ter trocado o preset com a confirmação aberta: não cola
    // num preset diferente do que a pergunta mostrou.
    if (clipboard.declinedTarget !== `${this.activeBank}:${presetNumber}`) {
      clipboard.declinedTarget = null;
      this.renderPresetCopyButton();
      this.setStatus('O preset mudou antes de colar. Toque em Paste de novo.');
      return;
    }
    if (this.liveMidiEnabled && this.seamlessPresetSwitching) {
      this.nativePresetTransitionPending = true;
    } else if (this.liveMidiEnabled) {
      this.nativePresetTransitionPending = false;
      void hookKeysNative.stopAllNotes();
    }
    this.soundfontSelectionRevision += 1;
    this.cancelNoteLearn();
    this.patternPlayback.reset();
    bank.presets[presetNumber - 1] = JSON.parse(JSON.stringify(clipboard.preset)) as PresetState;
    this.presetClipboard = null;
    this.restoreActivePresetState();
    this.markPlayerStateChanged();
    this.setStatus(`${presetSlotLabel(clipboard.bank, clipboard.presetNumber)} colado em ${presetSlotLabel(this.activeBank, presetNumber)}.`);
  }

  private renderPresetCopyButton(): void {
    const button = this.root.querySelector<HTMLButtonElement>('[data-action="copy-preset"]');
    const clipboard = this.presetClipboard;
    const target = this.activePresetKey();
    if (clipboard?.declinedTarget && clipboard.declinedTarget !== target) clipboard.declinedTarget = null;
    if (!button) return;
    const state = !clipboard
      ? 'idle'
      : target !== null && target !== `${clipboard.bank}:${clipboard.presetNumber}` ? 'paste' : 'copied';
    button.dataset.copyState = state;
    button.textContent = state === 'paste' ? 'Paste' : 'Copy';
    button.setAttribute('aria-label', state === 'idle'
      ? 'Copiar o preset selecionado'
      : state === 'paste'
        ? `Colar ${clipboard ? presetSlotLabel(clipboard.bank, clipboard.presetNumber) : 'o preset copiado'} neste preset`
        : 'Cancelar a cópia do preset');
  }

  private selectPreset(selectedButton: HTMLButtonElement): void {
    if (this.suppressNextPresetClick) {
      this.suppressNextPresetClick = false;
      return;
    }
    if (selectedButton.getAttribute('aria-pressed') === 'true') return;

    const presetNumber = Number.parseInt(selectedButton.dataset.preset ?? '', 10);
    const bank = this.bankStates.get(this.activeBank);
    if (!bank || !Number.isInteger(presetNumber)) return;
    if (this.liveMidiEnabled && this.seamlessPresetSwitching) {
      this.nativePresetTransitionPending = true;
    } else if (this.liveMidiEnabled) {
      this.nativePresetTransitionPending = false;
      void hookKeysNative.stopAllNotes();
    }
    this.soundfontSelectionRevision += 1;
    this.cancelNoteLearn();
    this.patternPlayback.reset();
    this.saveActivePresetState();
    for (const state of this.bankStates.values()) state.selectedPreset = null;
    bank.selectedPreset = presetNumber;
    this.restoreActivePresetState();
    this.markPlayerStateChanged();
  }

  private toggleModule(moduleNumber: number, button: HTMLButtonElement): void {
    const moduleState = this.ensureActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return;
    moduleState.enabled = !moduleState.enabled;
    this.renderModulePowerButton(button, moduleNumber, moduleState.enabled);
    // Todo módulo pode ter seu próprio Arpeggiator/Pulse ligado ou desligado.
    this.patternPlayback.settingsChanged();
    this.markPlayerStateChanged();
  }

  private toggleSynthMode(modal: HTMLElement, button: HTMLButtonElement): void {
    const moduleState = this.ensureActivePresetState()?.modules[7];
    if (!moduleState) return;
    const settings = readSynthSettings(moduleState.settings.synth);
    settings.voiceMode = settings.voiceMode === 'mono' ? 'poly' : 'mono';
    // Mono e Portamento andam sempre juntos, nos dois sentidos.
    const mono = settings.voiceMode === 'mono';
    settings.glideMode = mono ? 'portamento' : 'auto';
    moduleState.settings.synth = settings;
    this.renderSynthModeButton(button, moduleState);
    // O card de Glide (Auto/Porta) do Synth pode estar na mesma tela.
    this.renderGlideCard(modal, 8);
    this.markPlayerStateChanged();
  }

  private toggleModuleVoiceMode(modal: HTMLElement, button: HTMLButtonElement, moduleNumber: number): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState || moduleNumber < 1 || moduleNumber > 7) return;
    const mono = moduleState.settings.voiceMode !== 'mono';
    moduleState.settings.voiceMode = mono ? 'mono' : 'poly';
    // Mono e Portamento andam sempre juntos, nos dois sentidos.
    // O Organ nao possui Glide: Mono troca apenas a prioridade das vozes.
    moduleState.settings.glideMode = moduleNumber === 7 ? 'auto' : mono ? 'portamento' : 'auto';
    this.renderModuleVoiceModeButtonDisplay(button, mono);
    // O card de Glide (Auto/Porta) pode estar na tela ao mesmo tempo: se
    // estiver, precisa refletir a troca na hora.
    if (moduleNumber !== 7) this.renderGlideCard(modal, moduleNumber);
    this.markPlayerStateChanged();
  }

  private renderModuleVoiceModeButtonDisplay(button: HTMLButtonElement, mono: boolean): void {
    button.classList.toggle('is-mono', mono);
    button.classList.toggle('is-poly', !mono);
    button.setAttribute('aria-pressed', String(mono));
    const label = button.querySelector<HTMLElement>('strong');
    if (label) label.textContent = mono ? 'Mono' : 'Poly';
  }

  // Mono/Poly e Auto/Porta ficam trancados juntos: o botão do Modo já mudou
  // de valor no updateGlideSettings acima, só falta refletir na tela.
  private syncVoiceModeFromGlideMode(modal: HTMLElement, moduleNumber: number): void {
    if (moduleNumber === 8) {
      const moduleState = this.getActivePresetState()?.modules[7];
      const button = modal.querySelector<HTMLButtonElement>('[data-synth-voice-mode]');
      if (moduleState && button) this.renderSynthModeButton(button, moduleState);
      return;
    }
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    const button = modal.querySelector<HTMLButtonElement>('button[data-module-setting-action="toggle-voice-mode"]');
    if (moduleState && button) this.renderModuleVoiceModeButtonDisplay(button, moduleState.settings.voiceMode === 'mono');
  }

  private refreshDefaultSettingsFromCatalog(): void {
    for (const bank of this.bankStates.values()) {
      for (const preset of bank.presets) {
        preset.modules.forEach((moduleState, index) => {
          if (index < 6 && moduleState.settingsMode === 'default') {
            moduleState.settings = this.defaultSettingsForModule(index + 1, moduleState);
          }
        });
      }
    }
    this.restoreActivePresetState();
  }

  private setModuleSettingsMode(
    modal: HTMLElement,
    moduleNumber: number,
    mode: ModuleSettingsMode,
  ): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState || moduleNumber < 1 || moduleNumber > 6 || moduleState.settingsMode === mode) return;
    if (mode === 'default') {
      moduleState.userSettings = cloneSettings(moduleState.settings);
      moduleState.settings = this.defaultSettingsForModule(moduleNumber, moduleState);
    } else {
      moduleState.settings = cloneSettings(moduleState.userSettings ?? moduleState.settings);
    }
    moduleState.settingsMode = mode;
    this.markPlayerStateChanged();
    const trigger = modal.querySelector<HTMLElement>(`[data-module-settings-mode="${mode}"]`) ?? this.modalTrigger ?? this.root;
    this.openModal('module-settings', moduleNumber, trigger, true);
  }

  private defaultSettingsForModule(moduleNumber: number, moduleState: ModulePresetState): Record<string, unknown> {
    const scope = moduleSettingsScope(moduleNumber);
    if (!scope) return createDefaultModuleSettings(moduleNumber - 1);
    const sound = moduleState.timbreId?.startsWith('fixed:')
      ? this.soundCatalog.get(moduleState.timbreId.slice(6)) : null;
    const categorySettings = sound
      ? this.soundCatalog.getCategory(sound.category)?.defaultSettings[scope] ?? {}
      : this.soundCatalog.defaultSettings[scope];
    const soundSettings = sound?.moduleSettings?.[scope] ?? {};
    return mergeSettings(
      mergeSettings(createDefaultModuleSettings(moduleNumber - 1), categorySettings),
      soundSettings,
    );
  }

  private showDefaultSettingsNotice(modal: HTMLElement): void {
    if (modal.querySelector('[data-default-settings-notice]')) return;
    const notice = document.createElement('div');
    notice.className = 'module-default-settings-notice';
    notice.dataset.defaultSettingsNotice = '';
    notice.setAttribute('role', 'alertdialog');
    notice.setAttribute('aria-modal', 'true');
    notice.setAttribute('aria-label', 'Parâmetros bloqueados no modo Default');
    notice.innerHTML = `
      <div>
        <strong>Configuração Default</strong>
        <p>Mude para User para configurar.</p>
        <button type="button" data-default-settings-notice-close>Entendi</button>
      </div>
    `;
    modal.querySelector('.player-modal__surface')?.append(notice);
    notice.querySelector<HTMLButtonElement>('button')?.focus();
  }

  private createPatternPlaybackSnapshot(moduleNumber: number): PatternPlaybackSnapshot {
    // Cada módulo tem seu próprio Arpeggiator, lido do seu próprio índice.
    const arpeggiator = this.getActivePresetState()?.modules[moduleNumber - 1];
    return {
      bpm: this.metronome.getBpm(),
      arpeggiator: {
        moduleEnabled: arpeggiator?.enabled === true,
        // Organ e Synth sao internos e nao possuem timbreId da biblioteca.
        hasSound: moduleNumber >= 7 || Boolean(arpeggiator?.timbreId),
        midiInputId: arpeggiator?.midiInputId ?? null,
        lowNote: arpeggiator?.lowNote ?? 0,
        highNote: arpeggiator?.highNote ?? 127,
        settings: arpeggiator?.settings.arpeggiator,
      },
    };
  }

  private renderPatternPulse(moduleNumber: number, step: number | null): void {
    const modal = this.modal;
    if (!modal || this.currentModalKind !== 'module-arpeggiator' || this.currentModalModuleNumber !== moduleNumber) return;
    const lights = modal.querySelectorAll<HTMLElement>('.arpeggiator-live-strip i');
    for (const light of lights) light.classList.remove('is-playing');
    if (step === null) return;
    lights[step % Math.max(1, lights.length)]?.classList.add('is-playing');
  }

  private renderSynthModeButton(button: HTMLButtonElement, moduleState: ModulePresetState): void {
    const mode = readSynthSettings(moduleState.settings.synth).voiceMode;
    const mono = mode === 'mono';
    button.classList.toggle('is-mono', mono);
    button.classList.toggle('is-poly', !mono);
    button.setAttribute('aria-pressed', String(!mono));
    button.setAttribute('aria-label', `Synth em ${mono ? 'Mono' : 'Poly'}. Alternar para ${mono ? 'Poly' : 'Mono'}`);
    button.textContent = mono ? 'Mono' : 'Poly';
  }

  private updateSynthParameter(input: HTMLInputElement): void {
    const parameter = input.dataset.synthParameter as keyof SynthModuleSettings | undefined;
    const moduleState = this.getActivePresetState()?.modules[7];
    if (!parameter || !moduleState) return;
    const settings = readSynthSettings(moduleState.settings.synth);
    const value = updateSynthRangeOutput(input);
    if (parameter === 'oscillator1Volume' || parameter === 'oscillator2Volume' || parameter === 'oscillator3Volume'
        || parameter === 'oscillator1DetuneCents' || parameter === 'oscillator2DetuneCents' || parameter === 'oscillator3DetuneCents'
        || parameter === 'attackMs' || parameter === 'holdMs' || parameter === 'decayMs'
        || parameter === 'releaseMs' || parameter === 'filterCutoffHz'
        || parameter === 'filterResonance' || parameter === 'filterEnvelope'
        || parameter === 'lfoRateHz' || parameter === 'lfoDepth' || parameter === 'glideMs'
        || parameter === 'oscillator1VelocityLimit' || parameter === 'oscillator2VelocityLimit' || parameter === 'oscillator3VelocityLimit') {
      settings[parameter] = value;
      moduleState.settings.synth = settings;
      this.markPlayerStateChanged();
    }
  }

  private shiftSynthOctave(
    modal: HTMLElement,
    parameter: 'oscillator1Octave' | 'oscillator2Octave' | 'oscillator3Octave',
    direction: -1 | 1,
  ): void {
    const moduleState = this.getActivePresetState()?.modules[7];
    if (!moduleState) return;
    const settings = readSynthSettings(moduleState.settings.synth);
    const value = Math.min(3, Math.max(-3, settings[parameter] + direction));
    if (value === settings[parameter]) return;
    settings[parameter] = value;
    moduleState.settings.synth = settings;
    const output = modal.querySelector<HTMLElement>(`[data-synth-octave-value="${parameter}"]`);
    if (output) output.textContent = `${value > 0 ? '+' : ''}${value}`;
    for (const button of modal.querySelectorAll<HTMLButtonElement>(`[data-synth-octave="${parameter}"]`)) {
      const lower = Number(button.dataset.synthOctaveDirection) < 0;
      const selected = lower ? value < 0 : value > 0;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = lower ? value <= -3 : value >= 3;
    }
    this.markPlayerStateChanged();
  }

  private selectSynthOscillator(
    modal: HTMLElement,
    parameter: 'oscillator1' | 'oscillator2' | 'oscillator3',
    oscillator: SynthOscillator,
  ): void {
    const moduleState = this.getActivePresetState()?.modules[7];
    if (!moduleState) return;
    const settings = readSynthSettings(moduleState.settings.synth);
    settings[parameter] = oscillator;
    moduleState.settings.synth = settings;
    for (const button of modal.querySelectorAll<HTMLButtonElement>(`[data-synth-oscillator^="${parameter}:"]`)) {
      const selected = button.dataset.synthOscillator === `${parameter}:${oscillator}`;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    this.markPlayerStateChanged();
  }

  private toggleSynthOscillator(
    button: HTMLButtonElement,
    parameter: 'oscillator1Enabled' | 'oscillator2Enabled' | 'oscillator3Enabled',
  ): void {
    const moduleState = this.getActivePresetState()?.modules[7];
    if (!moduleState) return;
    const settings = readSynthSettings(moduleState.settings.synth);
    settings[parameter] = !settings[parameter];
    moduleState.settings.synth = settings;
    button.classList.toggle('is-on', settings[parameter]);
    button.classList.toggle('is-off', !settings[parameter]);
    button.textContent = settings[parameter] ? 'ON' : 'OFF';
    button.setAttribute('aria-pressed', String(settings[parameter]));
    const oscillator = parameter === 'oscillator1Enabled' ? 1 : parameter === 'oscillator2Enabled' ? 2 : 3;
    button.setAttribute('aria-label', `${settings[parameter] ? 'Desativar' : 'Ativar'} OSC ${oscillator}`);
    this.markPlayerStateChanged();
  }

  private synthPresetSlots(moduleState: ModulePresetState): Array<SynthModuleSettings | null> {
    const source = Array.isArray(moduleState.settings.synthPresets)
      ? moduleState.settings.synthPresets
      : [];
    return Array.from({ length: SYNTH_PRESET_COUNT }, (_, index) => {
      const entry = source[index];
      if (index === 0 && !isRecord(entry)) return { ...readSynthSettings(moduleState.settings.synth) };
      return isRecord(entry) ? readSynthSettings(entry) : null;
    });
  }

  private synthPresetNames(moduleState: ModulePresetState): string[] {
    const source = Array.isArray(moduleState.settings.synthPresetNames)
      ? moduleState.settings.synthPresetNames : [];
    return Array.from({ length: SYNTH_PRESET_COUNT }, (_, index) => {
      const name = typeof source[index] === 'string' ? source[index].trim().slice(0, 20) : '';
      return name || `Preset ${index + 1}`;
    });
  }

  private persistActiveSynthPreset(): void {
    const moduleState = this.getActivePresetState()?.modules[7];
    if (!moduleState) return;
    const slot = boundedNumber(moduleState.settings.synthActivePreset, 1, SYNTH_PRESET_COUNT, 1);
    const slots = this.synthPresetSlots(moduleState);
    // Every Synth edit belongs to the selected slot. Keeping the slot snapshot
    // current here also covers controls shared with other Config pages (Glide,
    // Mono/Poly, CC Learn), instead of relying on a manual Save button.
    slots[slot - 1] = { ...readSynthSettings(moduleState.settings.synth) };
    moduleState.settings.synthPresets = slots;
  }

  private renderSynthEditor(modal: HTMLElement, moduleState: ModulePresetState): void {
    const slots = this.synthPresetSlots(moduleState);
    const activePreset = boundedNumber(moduleState.settings.synthActivePreset, 1, SYNTH_PRESET_COUNT, 1);
    const editor = modal.querySelector<HTMLElement>('[data-synth-editor]');
    if (!editor) return;
    editor.outerHTML = createSynthModuleMarkup(
      moduleState.settings.synth,
      slots.map(Boolean),
      activePreset,
      this.metronome.getBpm(),
      this.synthPresetNames(moduleState),
    );
  }

  private saveSynthPreset(modal: HTMLElement | null, slot: number): void {
    const moduleState = this.getActivePresetState()?.modules[7];
    if (!moduleState || slot < 1 || slot > SYNTH_PRESET_COUNT) return;
    const slots = this.synthPresetSlots(moduleState);
    slots[slot - 1] = { ...readSynthSettings(moduleState.settings.synth) };
    moduleState.settings.synthPresets = slots;
    moduleState.settings.synthActivePreset = slot;
    if (modal) this.renderSynthEditor(modal, moduleState);
    this.markPlayerStateChanged();
    this.setStatus(`Preset ${slot} do Synth salvo.`);
  }

  private loadSynthPreset(modal: HTMLElement | null, slot: number): void {
    const moduleState = this.getActivePresetState()?.modules[7];
    if (!moduleState || slot < 1 || slot > SYNTH_PRESET_COUNT) return;
    const saved = this.synthPresetSlots(moduleState)[slot - 1];
    if (!saved) {
      this.saveSynthPreset(modal, slot);
      return;
    }
    moduleState.settings.synth = { ...saved };
    moduleState.settings.synthActivePreset = slot;
    if (modal) this.renderSynthEditor(modal, moduleState);
    this.markPlayerStateChanged();
    this.setStatus(`Preset ${slot} do Synth carregado.`);
  }

  private showSynthPresetResetConfirmation(modal: HTMLElement): void {
    const moduleState = this.getActivePresetState()?.modules[7];
    if (!moduleState || modal.querySelector('[data-synth-reset-confirmation]')) return;
    const slot = boundedNumber(moduleState.settings.synthActivePreset, 1, SYNTH_PRESET_COUNT, 1);
    const confirmation = document.createElement('div');
    confirmation.className = 'module-processor-reset-confirmation';
    confirmation.dataset.synthResetConfirmation = '';
    confirmation.setAttribute('role', 'alertdialog');
    confirmation.setAttribute('aria-modal', 'true');
    confirmation.setAttribute('aria-label', `Confirmar reset do Preset ${slot} do Synth`);
    confirmation.innerHTML = `
      <div>
        <span>Synth</span>
        <strong>Resetar Preset ${slot}?</strong>
        <p>Todas as configurações do Preset ${slot} voltarão às de fábrica.</p>
        <footer>
          <button type="button" data-synth-reset-choice="cancel">Cancelar</button>
          <button class="is-danger" type="button" data-synth-reset-choice="confirm">Resetar</button>
        </footer>
      </div>
    `;
    modal.querySelector('.player-modal__surface')?.append(confirmation);
    confirmation.querySelector<HTMLButtonElement>('[data-synth-reset-choice="cancel"]')?.focus();
  }

  private resetSynthPresetToFactory(modal: HTMLElement): void {
    const moduleState = this.getActivePresetState()?.modules[7];
    modal.querySelector('[data-synth-reset-confirmation]')?.remove();
    if (!moduleState) return;
    const slot = boundedNumber(moduleState.settings.synthActivePreset, 1, SYNTH_PRESET_COUNT, 1);
    const slots = this.synthPresetSlots(moduleState);
    slots[slot - 1] = factorySynthPreset(slot);
    moduleState.settings.synthPresets = slots;
    moduleState.settings.synth = factorySynthPreset(slot);
    moduleState.settings.synthActivePreset = slot;
    this.renderSynthEditor(modal, moduleState);
    this.markPlayerStateChanged();
    this.setStatus(`Preset ${slot} do Synth voltou à configuração de fábrica.`);
  }

  private selectSynthLfoTarget(modal: HTMLElement, target: SynthLfoTarget): void {
    const moduleState = this.getActivePresetState()?.modules[7];
    if (!moduleState) return;
    const settings = readSynthSettings(moduleState.settings.synth);
    settings.lfoTarget = target;
    moduleState.settings.synth = settings;
    for (const button of modal.querySelectorAll<HTMLButtonElement>('[data-synth-lfo-target]')) {
      const selected = button.dataset.synthLfoTarget === target;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    this.markPlayerStateChanged();
  }

  private toggleSynthFlag(button: HTMLButtonElement): void {
    const moduleState = this.getActivePresetState()?.modules[7];
    if (!moduleState) return;
    const settings = readSynthSettings(moduleState.settings.synth);
    settings.legato = !settings.legato;
    moduleState.settings.synth = settings;
    button.classList.toggle('is-selected', settings.legato);
    button.setAttribute('aria-pressed', String(settings.legato));
    this.markPlayerStateChanged();
  }

  private selectArpeggiatorMode(modal: HTMLElement, moduleNumber: number, mode: ArpeggiatorMode): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return;
    const settings = readArpeggiatorSettings(moduleState.settings.arpeggiator);
    settings.mode = mode;
    moduleState.settings.arpeggiator = settings;
    for (const button of modal.querySelectorAll<HTMLButtonElement>('[data-arpeggiator-mode]')) {
      const selected = button.dataset.arpeggiatorMode === mode;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    this.commitPatternChange();
  }

  private selectArpeggiatorDivision(modal: HTMLElement, moduleNumber: number, division: PatternDivision): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return;
    const settings = readArpeggiatorSettings(moduleState.settings.arpeggiator);
    settings.division = division;
    moduleState.settings.arpeggiator = settings;
    this.selectPatternButton(modal, '[data-arpeggiator-division]', 'arpeggiatorDivision', division);
    this.commitPatternChange();
  }

  private selectArpeggiatorOctaves(modal: HTMLElement, moduleNumber: number, octaves: number): void {
    if (!Number.isInteger(octaves) || octaves < 1 || octaves > 4) return;
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return;
    const settings = readArpeggiatorSettings(moduleState.settings.arpeggiator);
    settings.octaves = octaves;
    moduleState.settings.arpeggiator = settings;
    this.selectPatternButton(modal, '[data-arpeggiator-octaves]', 'arpeggiatorOctaves', String(octaves));
    this.commitPatternChange();
  }

  private updateArpeggiatorParameter(input: HTMLInputElement, moduleNumber: number): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    const parameter = input.dataset.patternParameter;
    if (!moduleState) return;
    if (parameter !== 'gate' && parameter !== 'swing' && parameter !== 'autoFaderDepthDb') return;
    const settings = readArpeggiatorSettings(moduleState.settings.arpeggiator);
    const value = updatePatternRangeOutput(input);
    settings[parameter] = value;
    moduleState.settings.arpeggiator = settings;
    this.commitPatternChange();
    if (parameter === 'autoFaderDepthDb') void this.syncNativeEngine();
  }

  // Auto Fader: liga/desliga, escolhe entre 1/4 e 1/8 e o resto é o knob de dB.
  private selectArpeggiatorAutoFader(modal: HTMLElement, moduleNumber: number, choice: string): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return;
    const settings = readArpeggiatorSettings(moduleState.settings.arpeggiator);
    if (choice === 'power') settings.autoFaderEnabled = !settings.autoFaderEnabled;
    else if (choice === '1/2' || choice === '1/4') settings.autoFaderDivision = choice;
    else return;
    moduleState.settings.arpeggiator = settings;
    const card = modal.querySelector<HTMLElement>('.arpeggiator-auto-fader');
    card?.classList.toggle('is-enabled', settings.autoFaderEnabled);
    for (const button of modal.querySelectorAll<HTMLButtonElement>('[data-arpeggiator-auto-fader]')) {
      const value = button.dataset.arpeggiatorAutoFader;
      const selected = value === 'power'
        ? settings.autoFaderEnabled
        : value === settings.autoFaderDivision;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    this.commitPatternChange();
    void this.syncNativeEngine();
  }

  private setTranceGateOption(modal: HTMLElement, moduleNumber: number, key: 'division' | 'length', value: string): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return;
    const settings = readTranceGateSettings(moduleState.settings.tranceGate);
    if (key === 'division') {
      if (!ARPEGGIATOR_DIVISIONS.includes(value as PatternDivision)) return;
      settings.division = value as PatternDivision;
    } else {
      const length = Number(value);
      if (![4, 8, 16].includes(length)) return;
      settings.length = length;
    }
    moduleState.settings.tranceGate = settings;
    const editor = modal.querySelector<HTMLElement>('[data-trance-gate-editor]');
    if (editor) editor.outerHTML = createTranceGateMarkup(settings, this.metronome.getBpm());
    this.commitPatternChange();
  }

  // Sync do Trance Gate: liga e desliga o passo preso ao andamento.
  private toggleTranceGateSync(modal: HTMLElement, moduleNumber: number): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return;
    const settings = readTranceGateSettings(moduleState.settings.tranceGate);
    settings.sync = !settings.sync;
    moduleState.settings.tranceGate = settings;
    const editor = modal.querySelector<HTMLElement>('[data-trance-gate-editor]');
    if (editor) editor.outerHTML = createTranceGateMarkup(settings, this.metronome.getBpm());
    this.commitPatternChange();
  }

  private toggleTranceGateStep(button: HTMLButtonElement, moduleNumber: number): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return;
    const settings = readTranceGateSettings(moduleState.settings.tranceGate);
    const index = Number(button.dataset.tranceGateStep);
    if (!Number.isInteger(index) || index < 0 || index >= settings.length) return;
    const enabled = !settings.steps[index];
    settings.steps[index] = enabled;
    moduleState.settings.tranceGate = settings;
    button.classList.toggle('is-enabled', enabled);
    button.classList.toggle('is-disabled', !enabled);
    button.setAttribute('aria-pressed', String(enabled));
    const label = button.querySelector('strong');
    if (label) label.textContent = enabled ? 'ON' : 'OFF';
    this.commitPatternChange();
  }

  private updateTranceGateParameter(input: HTMLInputElement, moduleNumber: number): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    const parameter = input.dataset.tranceGateParameter;
    if (!moduleState || !parameter
      || !['gate', 'depth', 'attackMs', 'releaseMs', 'swing', 'rateMs'].includes(parameter)) return;
    const settings = readTranceGateSettings({
      ...readTranceGateSettings(moduleState.settings.tranceGate), [parameter]: Number(input.value),
    });
    moduleState.settings.tranceGate = settings;
    const progress = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min));
    const knob = input.closest<HTMLElement>('.module-envelope-knob');
    knob?.style.setProperty('--knob-progress', String(progress));
    knob?.style.setProperty('--knob-angle', `${-135 + progress * 270}deg`);
    const formatted = `${Number(input.value)}${parameter.endsWith('Ms') ? ' ms' : '%'}`;
    // Com o Sync ligado o knob fica travado e o rodapé mostra o andamento.
    if (parameter === 'rateMs' && settings.sync) return;
    input.setAttribute('aria-valuetext', formatted);
    const output = input.closest('.pattern-knob')?.querySelector<HTMLOutputElement>('output');
    if (output) output.value = formatted;
    this.commitPatternChange();
  }

  private selectPatternButton(
    modal: HTMLElement,
    selector: string,
    datasetKey: string,
    value: string,
  ): void {
    for (const button of modal.querySelectorAll<HTMLButtonElement>(selector)) {
      const selected = button.dataset[datasetKey] === value;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
  }

  private commitPatternChange(): void {
    this.patternPlayback.settingsChanged();
    this.markPlayerStateChanged();
  }

  private renderModulePowerButton(
    button: HTMLButtonElement,
    moduleNumber: number,
    enabled: boolean,
  ): void {
    button.classList.toggle('is-on', enabled);
    button.classList.toggle('is-off', !enabled);
    button.textContent = enabled ? 'ON' : 'OFF';
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', `${enabled ? 'Desligar' : 'Ligar'} módulo ${moduleNumber}`);
  }

  private toggleNoteLearn(moduleNumber: number, bound: NoteRangeBound): void {
    const isSameTarget =
      this.pendingNoteLearn?.moduleNumber === moduleNumber &&
      this.pendingNoteLearn.bound === bound;
    this.cancelNoteLearn();
    if (isSameTarget) return;

    const button = this.root.querySelector<HTMLButtonElement>(
      `.player-module[data-module="${moduleNumber}"] [data-action="learn-note-range"][data-bound="${bound}"]`,
    );
    if (!button) return;

    this.pendingNoteLearn = { moduleNumber, bound };
    button.classList.add('is-learning');
    button.setAttribute('aria-pressed', 'true');
    button.setAttribute('aria-label', `${button.textContent?.trim() ?? ''}. Aguardando uma tecla MIDI`);
    void this.midiInput.requestAccess();
  }

  private cancelNoteLearn(): void {
    this.pendingNoteLearn = null;
    for (const button of this.root.querySelectorAll<HTMLButtonElement>(
      '.player-module__range-button.is-learning',
    )) {
      button.classList.remove('is-learning');
      button.setAttribute('aria-pressed', 'false');
    }
  }

  private handleMidiNote(input: MidiNoteInput): void {
    if (!this.liveMidiEnabled) return;
    const keyboardInputId = this.selectedMidiInputIds[this.keyboardMidiSlot - 1] ?? null;
    const matchesKeyboard = keyboardInputId === null || input.inputId === null || input.inputId === keyboardInputId;
    if (matchesKeyboard) {
      if (this.iosRuntime) this.pendingKeyboardNoteStates.set(input.noteNumber, input.pressed);
      else this.performanceKeyboard?.setMidiNote(input.noteNumber, input.pressed);
      this.updatePerformanceNoteDisplay(
        `midi:${input.inputId ?? 'virtual'}:${input.channel}:${input.noteNumber}`,
        input.noteNumber,
        input.pressed,
      );
    }
    window.dispatchEvent(new CustomEvent('hookkeys:performance-note', { detail: input }));
    this.patternPlayback.handleInput(input);
    if (input.pressed) this.learnNoteRangeFrom(input.noteNumber, input.inputId);
  }

  // O limite de notas do módulo também se aprende tocando no teclado da tela,
  // do A-1 ao C7, e não só num teclado MIDI ligado.
  private learnNoteRangeFrom(noteNumber: number, inputId: string | null): void {
    const pending = this.pendingNoteLearn;
    if (!pending) return;
    const moduleState = this.getActivePresetState()?.modules[pending.moduleNumber - 1];
    if (!moduleState) return;
    if (moduleState.midiInputId && inputId && moduleState.midiInputId !== inputId) return;
    this.applyLearnedMidiNote(noteNumber);
  }

  private updatePerformanceNoteDisplay(source: string, noteNumber: number, pressed: boolean): void {
    if (!Number.isInteger(noteNumber) || noteNumber < 0 || noteNumber > 127) return;
    if (pressed) this.displayedPerformanceNotes.set(source, noteNumber);
    else this.displayedPerformanceNotes.delete(source);
    if (this.iosRuntime) {
      if (this.performanceDisplayFrame !== null) return;
      this.performanceDisplayFrame = window.requestAnimationFrame(() => {
        this.performanceDisplayFrame = null;
        if (this.mounted) this.renderPerformanceNoteDisplay();
      });
    } else this.renderPerformanceNoteDisplay();
  }

  private renderPerformanceNoteDisplay(): void {
    for (const [note, pressed] of this.pendingKeyboardNoteStates) {
      this.performanceKeyboard?.setMidiNote(note, pressed);
    }
    this.pendingKeyboardNoteStates.clear();
    const output = this.root.querySelector<HTMLElement>('[data-note-chord-display]');
    if (output) {
      const label = performanceNotesLabel([...this.displayedPerformanceNotes.values()]);
      if (output.textContent !== label) output.textContent = label;
    }
  }

  private clearPerformanceNoteDisplay(): void {
    if (this.performanceDisplayFrame !== null) window.cancelAnimationFrame(this.performanceDisplayFrame);
    this.performanceDisplayFrame = null;
    this.pendingKeyboardNoteStates.clear();
    this.displayedPerformanceNotes.clear();
    const output = this.root.querySelector<HTMLElement>('[data-note-chord-display]');
    if (output) output.textContent = '—';
  }

  private triggerPanic(): void {
    this.patternPlayback.reset();
    this.trackTransport?.stop();
    this.metronome.stop();
    this.releasePressedKeyboardKey();
    this.keyboardMidiRouter?.resetExpression();
    for (const bank of PAD_BANK_IDS) this.padBankSelections.set(bank, null);
    for (const [bank, states] of this.effectPadStates) {
      states.forEach((state, index) => {
        state.active = false;
        this.stopEffectPadAudio(bank, index + 1);
      });
    }
    this.renderActivePadBank();
    this.renderActiveEffectBank();
    this.clearPerformanceNoteDisplay();
    void hookKeysNative.stopAllNotes();
    this.setStatus('Panic: notas, pads, efeitos, música e metrônomo interrompidos.');
  }

  // Leaving the Clean confirmation goes back to where it came from. Opening it
  // closed the Learn CC screen, so that screen gets its target back.
  private leaveCcClearConfirmation(): void {
    if (this.modalHistory.at(-1)?.kind === 'cc-learn') this.pendingCcLearn = this.pendingCcClear;
    this.pendingCcClear = null;
    this.returnToPreviousModal();
  }

  private openCcLearn(target: CcLearnTarget, trigger: HTMLElement): void {
    this.pendingCcLearn = target;
    const key = this.ccMappingKeyForTarget(target);
    this.pendingCcController = this.ccMappings.get(key) ?? null;
    const options = this.ccMappingOptions.get(key) ?? DEFAULT_CC_MAPPING_OPTIONS;
    this.pendingCcInverted = options.inverted;
    this.pendingCcLimitPercent = options.limitPercent;
    if (this.modal) this.openChildModal('cc-learn', null, trigger);
    else this.openModal('cc-learn', null, trigger);
    void this.midiInput.requestAccess();
  }

  private ccMappingLabel(target: CcLearnTarget): string {
    const controller = this.ccMappings.get(this.ccMappingKeyForTarget(target));
    return controller === undefined ? 'Ainda não mapeado' : `CC ${controller}`;
  }

  private ccMappingKeyForTarget(target: CcLearnTarget): string {
    if (target.kind !== 'module-volume') return ccMappingKey(target);
    const bank = this.bankStates.get(this.activeBank);
    const presetNumber = bank?.selectedPreset ?? null;
    return bank && faderModeUsesPresetMappings(bank.faderMode) && presetNumber !== null
      ? `module-bank:${this.activeBank}:${presetNumber}:${target.moduleNumber}`
      : ccMappingKey(target);
  }

  private mappedCcRatio(targetKey: string, value: number): number {
    const options = this.ccMappingOptions?.get(targetKey) ?? { inverted: false, limitPercent: 100 };
    const input = Math.min(1, Math.max(0, value / 127));
    const direction = options.inverted ? 1 - input : input;
    return direction * (options.limitPercent / 100);
  }

  private syncKeyboardExpressionInput(): void {
    const route = keyboardMidiRoute(this.keyboardMidiSlot, this.selectedMidiInputIds, this.midiInput.getInputDevices().length);
    const key = JSON.stringify(route);
    if (key === this.keyboardExpressionRouteKey || !this.keyboardExpression) return;
    this.keyboardExpression.cancelGestures();
    this.keyboardMidiRouter?.resetExpression();
    this.keyboardExpression.setInputId(route.inputId);
    this.keyboardExpressionRouteKey = key;
  }

  private handleMidiPitchBend(input: MidiPitchBendInput): void {
    if (!this.liveMidiEnabled) return;
    this.keyboardExpression?.receiveMidi('pitch', input.value, input.inputId);
  }

  private handleMidiControlChange(input: MidiControlChangeInput): void {
    if (!this.liveMidiEnabled) return;
    // Raw CC7 is discarded. Reverb CC91 values 1..16 arrive as synthetic
    // CC102..117 and remain available to Learn CC.
    if (this.compatibilityMode && input.controller === 7) return;
    if (input.controller === 1) {
      this.keyboardExpression?.receiveMidi('mod', input.value, input.inputId);
      this.receiveRotaryModulation(input.value, input.inputId);
    }
    const ccSourceKey = `${input.inputId ?? 'virtual'}:${input.channel}:${input.controller}`;
    // Date.now also works in the native/webview and in the isolated desktop
    // controller used by the MIDI mapping tests.
    const receivedAt = Date.now();
    const previous = this.lastCcValues.get(ccSourceKey);
    const previousValue = previous?.value ?? 0;
    this.lastCcValues.set(ccSourceKey, { value: input.value, receivedAt });

    const pending = this.pendingCcLearn;
    if (pending && this.modal?.classList.contains('player-modal--cc-learn')) {
      // A tela continua escutando. Cada mensagem substitui apenas a escolha
      // temporaria; o ultimo CC so e gravado quando o usuario toca em OK.
      this.pendingCcController = input.controller;
      const status = this.modal.querySelector<HTMLElement>('[data-cc-learn-status]');
      if (status) {
        status.textContent = `Último controle: CC ${input.controller}. Continue movendo ou toque em OK.`;
        status.classList.add('is-complete');
      }
      const current = this.modal.querySelector<HTMLElement>('[data-cc-learn-current]');
      if (current) current.textContent = `Selecionado: CC ${input.controller}`;
      this.modal.querySelector<HTMLButtonElement>('[data-modal-action="confirm-cc-learn"]')?.removeAttribute('disabled');
      return;
    }

    // Alguns teclados mandam apenas 127 a cada toque (sem o 0 de soltura).
    // Depois do debounce, outro 127 é uma nova pressão válida. A chave inclui
    // dispositivo e canal para o CC de um teclado não travar o de outro.
    const risingEdge = input.value >= 64 && (
      previousValue < 64 || previous === undefined || receivedAt - previous.receivedAt >= 160
    );
    let outputChanged = false;
    let metronomeVolumeChanged = false;
    for (const [targetKey, controller] of this.ccMappings) {
      if (controller !== input.controller) continue;
      const continuousRatio = this.mappedCcRatio(targetKey, input.value);
      const bankModuleMatch = /^module-bank:([A-F]):([1-9]|1[0-6]):([1-8])$/.exec(targetKey);
      if (bankModuleMatch) {
        const bank = bankModuleMatch[1];
        const presetNumber = Number(bankModuleMatch[2]);
        const moduleNumber = Number(bankModuleMatch[3]);
        const activeBank = this.bankStates.get(this.activeBank);
        if (bank === this.activeBank && activeBank && faderModeUsesPresetMappings(activeBank.faderMode)
            && presetNumber === activeBank.selectedPreset) {
          this.faders.get(moduleNumber)?.setValueDb(visualPositionToFaderDb(continuousRatio), true);
        }
        continue;
      }
      const moduleMatch = /^module:([1-8])$/.exec(targetKey);
      if (moduleMatch) {
        const activeFaderMode = this.bankStates.get(this.activeBank)?.faderMode;
        if (activeFaderMode && faderModeUsesPresetMappings(activeFaderMode)) continue;
        const moduleNumber = Number(moduleMatch[1]);
        this.faders.get(moduleNumber)?.setValueDb(visualPositionToFaderDb(continuousRatio), true);
        continue;
      }

      const moduleControlMatch = /^module-control:([1-8]):(.+)$/.exec(targetKey);
      if (moduleControlMatch) {
        const moduleNumber = Number(moduleControlMatch[1]);
        const control = moduleControlMatch[2] ?? '';
        if (control === 'delay:tap') {
          if (risingEdge) this.tapMappedModuleDelay(moduleNumber);
        } else if (moduleNumber === 7 && control === 'rotary:toggle') {
          if (risingEdge) this.toggleModuleRotarySpeed();
        } else if (moduleNumber === 7 && control.startsWith('rotary:speed:')) {
          const speed = control.slice('rotary:speed:'.length);
          if (risingEdge && (speed === 'brake' || speed === 'slow' || speed === 'fast')) {
            this.setModuleRotarySpeed(speed);
          }
        } else {
          this.applyMappedModuleControl(moduleNumber, control, continuousRatio);
        }
        continue;
      }

      const inputMatch = /^input:([1-8]):(sustain|modulation)$/.exec(targetKey);
      if (inputMatch) {
        if (risingEdge) this.toggleModuleInput(Number(inputMatch[1]), inputMatch[2] === 'sustain' ? 'sustain' : 'modulation');
        continue;
      }

      const powerMatch = /^power:([1-8])$/.exec(targetKey);
      if (powerMatch) {
        const powerButton = risingEdge
          ? this.root.querySelector<HTMLButtonElement>(`[data-action="toggle-module"][data-module="${powerMatch[1]}"]`)
          : null;
        if (powerButton) this.toggleModule(Number(powerMatch[1]), powerButton);
        continue;
      }

      const octaveMatch = /^octave:([1-8]):(up|down)$/.exec(targetKey);
      if (octaveMatch && risingEdge) {
        this.shiftModuleOctave(Number(octaveMatch[1]), octaveMatch[2] === 'up' ? 1 : -1);
        continue;
      }

      const outputMatch = /^output:(music|pads|effects|master)$/.exec(targetKey);
      if (outputMatch && isOutputBus(outputMatch[1])) {
        this.outputLevels[outputMatch[1]] = outputDbFromPosition(continuousRatio * 100);
        outputChanged = true;
        continue;
      }

      if (targetKey === 'metronome:volume') {
        const db = outputDbFromPosition(continuousRatio * 100);
        this.metronome.setVolume(continuousRatio <= 0 ? 0 : 10 ** (db / 20));
        metronomeVolumeChanged = true;
        continue;
      }

      if (targetKey === 'metronome:tap' && risingEdge) {
        this.metronome.tap(performance.now());
        this.renderMetronomeState();
        this.markPlayerStateChanged();
        continue;
      }

      if (targetKey === 'metronome:toggle' && risingEdge) {
        this.toggleMetronome();
        continue;
      }

      const synthPresetMatch = /^synth-preset:([1-5])$/.exec(targetKey);
      if (synthPresetMatch && risingEdge) {
        const synthModal = this.currentModalKind === 'module-synth' ? this.modal : null;
        this.loadSynthPreset(synthModal, Number(synthPresetMatch[1]));
        continue;
      }

      const padMatch = /^pad:([ABCD]):(C|C#|D|D#|E|F|F#|G|G#|A|A#|B)$/.exec(targetKey);
      if (padMatch && risingEdge && this.isPadBankId(padMatch[1])) {
        this.activateMappedPad(padMatch[1], padMatch[2] ?? 'C');
        continue;
      }

      const effectMatch = /^effect:([1-4]):([1-9]|1[0-2])$/.exec(targetKey);
      if (effectMatch && risingEdge && this.isEffectBankId(effectMatch[1])) {
        this.activateMappedEffect(effectMatch[1], Number(effectMatch[2]));
        continue;
      }

      const presetMatch = /^preset:([A-F]):([1-9]|1[0-6])$/.exec(targetKey);
      if (presetMatch && risingEdge && this.isBankId(presetMatch[1])) {
        this.activateMappedPreset(presetMatch[1], Number(presetMatch[2]));
      }
    }

    if (outputChanged) {
      this.renderOutputLevels();
      this.applyMusicOutput();
      this.markPlayerStateChanged();
    }
    if (metronomeVolumeChanged) {
      this.renderMetronomeState();
      this.markPlayerStateChanged();
    }
  }

  private activateMappedPad(bank: PadBankId, note: string): void {
    this.activePadBank = bank;
    const active = this.toggleNotePad(note);
    this.dispatchPerformanceTrigger({
      kind: 'note',
      value: note,
      label: `Nota ${note}`,
      active,
      padBank: bank,
    });
  }

  private activateMappedEffect(bank: EffectBankId, effectNumber: number): void {
    this.activeEffectBank = bank;
    this.triggerEffect(bank, effectNumber);
  }

  private triggerEffect(bank: EffectBankId, effectNumber: number): void {
    const effectState = this.effectPadStates.get(bank)?.[effectNumber - 1];
    if (!effectState) return;
    effectState.active = effectState.triggerMode === 'toggle' ? !effectState.active : true;
    if (bank === this.activeEffectBank) this.renderActiveEffectBank();
    // Toggle desligando para o som; nos outros casos o arquivo toca do começo.
    if (effectState.active) void this.playEffectPadAudio(bank, effectNumber, effectState);
    else this.stopEffectPadAudio(bank, effectNumber);
    this.dispatchPerformanceTrigger({
      kind: 'effect',
      value: String(effectNumber),
      label: effectState.name,
      active: effectState.active,
      effectBank: bank,
      volumeDb: effectState.volumeDb,
    });
  }

  // O controle mapeado leva direto ao banco do preset: o Preset 3 do Banco B
  // tocado com a tela no Banco A já abre o Banco B com ele selecionado.
  private activateMappedPreset(bankId: BankId, presetNumber: number): void {
    if (presetNumber < 1 || presetNumber > PRESET_COUNT) return;
    const bank = this.bankStates.get(bankId);
    if (!bank || (bankId === this.activeBank && bank.selectedPreset === presetNumber)) return;
    if (this.liveMidiEnabled) this.nativePresetTransitionPending = true;
    this.soundfontSelectionRevision += 1;
    this.cancelNoteLearn();
    this.patternPlayback.reset();
    this.saveActivePresetState();
    this.activeBank = bankId;
    for (const state of this.bankStates.values()) state.selectedPreset = null;
    bank.selectedPreset = presetNumber;
    this.restoreActivePresetState();
    this.updateVisibleView();
    this.markPlayerStateChanged();
  }

  private applyLearnedMidiNote(noteNumber: number): void {
    const pending = this.pendingNoteLearn;
    if (!pending) return;

    const moduleState = this.getActivePresetState()?.modules[pending.moduleNumber - 1];
    if (!moduleState) {
      this.cancelNoteLearn();
      return;
    }

    if (pending.bound === 'low') {
      moduleState.lowNote = noteNumber;
      if (moduleState.lowNote > moduleState.highNote) moduleState.highNote = noteNumber;
    } else {
      moduleState.highNote = noteNumber;
      if (moduleState.highNote < moduleState.lowNote) moduleState.lowNote = noteNumber;
    }

    const moduleNumber = pending.moduleNumber;
    this.cancelNoteLearn();
    const moduleElement = this.root.querySelector<HTMLElement>(
      `.player-module[data-module="${moduleNumber}"]`,
    );
    if (moduleElement) this.renderModuleActionState(moduleElement, moduleNumber, moduleState);
    this.markPlayerStateChanged();
    this.setStatus(`Nota ${formatMidiNote(noteNumber)} aplicada ao módulo ${moduleNumber}.`);
  }

  private shiftModuleOctave(moduleNumber: number, direction: -1 | 1): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    const moduleElement = this.root.querySelector<HTMLElement>(
      `.player-module[data-module="${moduleNumber}"]`,
    );
    if (!moduleState || !moduleElement) return;
    moduleState.octaveShift = Math.min(3, Math.max(-3, moduleState.octaveShift + direction));
    this.renderModuleOctaveButtons(moduleElement, moduleNumber, moduleState.octaveShift);
    this.markPlayerStateChanged();
    this.setStatus(`Módulo ${moduleNumber}: oitava ${moduleState.octaveShift}.`);
  }

  private shiftGlobalOctave(direction: -1 | 1): void {
    this.globalOctaveShift = Math.min(3, Math.max(-3, this.globalOctaveShift + direction));
    this.renderGlobalOctaveButtons();
    this.markPlayerStateChanged();
    void this.syncGlobalTranspose();
    this.setStatus(`Oitava geral de entrada: ${this.globalOctaveShift}.`);
  }

  private renderGlobalOctaveButtons(): void {
    const downButton = this.root.querySelector<HTMLButtonElement>('[data-action="global-octave-down"]');
    const upButton = this.root.querySelector<HTMLButtonElement>('[data-action="global-octave-up"]');
    const value = this.globalOctaveShift;
    if (downButton) {
      downButton.textContent = value < 0 ? `OCT − ${Math.abs(value)}` : 'OCT −';
      downButton.classList.toggle('is-octave-active', value < 0);
      downButton.disabled = value <= -3;
      downButton.setAttribute('aria-label', `Descer uma oitava na entrada geral. Ajuste atual: ${value}`);
    }
    if (upButton) {
      upButton.textContent = value > 0 ? `OCT + ${value}` : 'OCT +';
      upButton.classList.toggle('is-octave-active', value > 0);
      upButton.disabled = value >= 3;
      upButton.setAttribute('aria-label', `Subir uma oitava na entrada geral. Ajuste atual: ${value}`);
    }
  }

  private shiftGlobalTranspose(direction: -1 | 1): void {
    this.globalTransposeSemitones = Math.min(24, Math.max(-24, this.globalTransposeSemitones + direction));
    this.renderGlobalTransposeButtons();
    this.markPlayerStateChanged();
    void this.syncGlobalTranspose();
    this.setStatus(`Transpose geral: ${this.globalTransposeSemitones} semitom(ns).`);
  }

  private renderGlobalTransposeButtons(): void {
    const downButton = this.root.querySelector<HTMLButtonElement>('[data-action="global-transpose-down"]');
    const upButton = this.root.querySelector<HTMLButtonElement>('[data-action="global-transpose-up"]');
    const value = this.globalTransposeSemitones;
    if (downButton) {
      downButton.textContent = value < 0 ? `TRS − ${Math.abs(value)}` : 'TRS −';
      downButton.classList.toggle('is-octave-active', value < 0);
      downButton.setAttribute('aria-label', `Descer um semitom o transpose geral. Ajuste atual: ${value}`);
    }
    if (upButton) {
      upButton.textContent = value > 0 ? `TRS + ${value}` : 'TRS +';
      upButton.classList.toggle('is-octave-active', value > 0);
      upButton.setAttribute('aria-label', `Subir um semitom o transpose geral. Ajuste atual: ${value}`);
    }
  }

  private async syncGlobalTranspose(): Promise<void> {
    if (!hookKeysNative.isAvailable()) return;
    await hookKeysNative.setGlobalTranspose(this.globalOctaveShift * 12 + this.globalTransposeSemitones);
  }

  private toggleModuleOutputMode(): void {
    this.moduleOutputMono = !this.moduleOutputMono;
    this.renderModuleOutputModeButton();
    this.markPlayerStateChanged();
    this.setStatus(this.moduleOutputMono
      ? 'Módulos em Mono dual: soma L+R sem redução em todos os canais escolhidos.'
      : 'Módulos em Stereo: L e R separados nas rotas de dois canais.');
  }

  private renderModuleOutputModeButton(): void {
    const button = this.root.querySelector<HTMLButtonElement>('[data-action="toggle-module-output-mode"]');
    if (!button) return;
    button.textContent = this.moduleOutputMono ? 'MONO' : 'STEREO';
    button.classList.toggle('is-mono', this.moduleOutputMono);
    button.setAttribute('aria-pressed', String(this.moduleOutputMono));
    button.setAttribute('aria-label',
      `Saída dos módulos em ${this.moduleOutputMono ? 'Mono dual' : 'Stereo'}. Alternar para ${this.moduleOutputMono ? 'Stereo' : 'Mono dual'}`);
  }

  private toggleModuleInput(
    moduleNumber: number,
    input: 'sustain' | 'modulation',
  ): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    const moduleElement = this.root.querySelector<HTMLElement>(
      `.player-module[data-module="${moduleNumber}"]`,
    );
    if (!moduleState || !moduleElement) return;

    if (input === 'sustain') {
      moduleState.sustainInputEnabled = !moduleState.sustainInputEnabled;
    } else {
      moduleState.modulationInputEnabled = !moduleState.modulationInputEnabled;
    }
    this.renderModuleActionState(moduleElement, moduleNumber, moduleState);
    this.markPlayerStateChanged();
  }

  private renderModuleActionState(
    moduleElement: HTMLElement,
    moduleNumber: number,
    state: ModulePresetState,
  ): void {
    const lowButton = requiredElement<HTMLButtonElement>(
      moduleElement,
      '[data-action="learn-note-range"][data-bound="low"]',
    );
    const highButton = requiredElement<HTMLButtonElement>(
      moduleElement,
      '[data-action="learn-note-range"][data-bound="high"]',
    );
    lowButton.textContent = formatMidiNote(state.lowNote);
    highButton.textContent = formatMidiNote(state.highNote);
    lowButton.setAttribute('aria-label', `Definir nota inicial do módulo ${moduleNumber}. Atual: ${lowButton.textContent}`);
    highButton.setAttribute('aria-label', `Definir nota final do módulo ${moduleNumber}. Atual: ${highButton.textContent}`);
    this.renderModuleOctaveButtons(moduleElement, moduleNumber, state.octaveShift);

    const sustainButton = requiredElement<HTMLButtonElement>(
      moduleElement,
      '[data-action="toggle-sustain-input"]',
    );
    const modulationButton = requiredElement<HTMLButtonElement>(
      moduleElement,
      '[data-action="toggle-modulation-input"]',
    );
    this.renderInputFilterButton(
      sustainButton,
      'pedal sustain',
      moduleNumber,
      state.sustainInputEnabled,
    );
    this.renderInputFilterButton(
      modulationButton,
      'modulation CC1',
      moduleNumber,
      state.modulationInputEnabled,
    );
  }

  private renderModuleOctaveButtons(
    moduleElement: HTMLElement,
    moduleNumber: number,
    octaveShift: number,
  ): void {
    const upButton = requiredElement<HTMLButtonElement>(moduleElement, '[data-action="octave-up"]');
    const downButton = requiredElement<HTMLButtonElement>(moduleElement, '[data-action="octave-down"]');
    upButton.textContent = octaveShift > 0 ? `OCT + ${octaveShift}` : 'OCT +';
    downButton.textContent = octaveShift < 0 ? `OCT - ${Math.abs(octaveShift)}` : 'OCT -';
    upButton.classList.toggle('is-octave-active', octaveShift > 0);
    downButton.classList.toggle('is-octave-active', octaveShift < 0);
    upButton.setAttribute(
      'aria-label',
      `Subir uma oitava no módulo ${moduleNumber}. Ajuste atual: ${octaveShift}`,
    );
    downButton.setAttribute(
      'aria-label',
      `Descer uma oitava no módulo ${moduleNumber}. Ajuste atual: ${octaveShift}`,
    );
  }

  private renderInputFilterButton(
    button: HTMLButtonElement,
    inputName: string,
    moduleNumber: number,
    enabled: boolean,
  ): void {
    button.classList.toggle('is-blocked', !enabled);
    button.setAttribute('aria-pressed', String(!enabled));
    button.setAttribute(
      'aria-label',
      `${enabled ? 'Desativar' : 'Ativar'} ${inputName} no módulo ${moduleNumber}`,
    );
  }

  private openModal(
    kind: ModalKind,
    moduleNumber: number | null,
    trigger: HTMLElement,
    preserveHistory = false,
  ): void {
    this.cancelNoteLearn();
    if (kind === 'module-delay') this.lastDelayTapAt = null;
    if (!preserveHistory) this.modalHistory = [];
    this.closeModal(false, preserveHistory);
    this.modalTrigger = trigger;
    this.currentModalKind = kind;
    this.currentModalModuleNumber = moduleNumber;

    const titleId = `player-modal-title-${this.instanceId}`;
    const modal = document.createElement('section');
    let velocityCurveDrag: { pointerId: number; pointIndex: number; plot: HTMLElement } | null = null;
    const settingsDetail = kind === 'app-settings-midi' || kind === 'app-settings-audio';
    modal.className = `player-modal player-modal--${kind}${settingsDetail ? ' player-modal--app-settings' : ''}`;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', titleId);
    const moduleKinds: readonly ModalKind[] = ['sound-selection', 'sound-download', 'module-settings', 'module-polyphony', 'module-velocity', 'module-filter-velocity', 'module-env-filter', 'module-arpeggiator', 'module-trance-gate', 'module-synth', 'module-eq', 'module-compressor', 'module-reverb', 'module-delay', 'module-rotary', 'module-chorus', 'module-organ'];
    const moduleState = !moduleKinds.includes(kind) || moduleNumber === null
      ? null
      : this.ensureActivePresetState()?.modules[moduleNumber - 1] ?? null;
    if (kind === 'module-settings' && moduleState?.settingsMode === 'default') {
      modal.classList.add('is-default-settings');
    }
    const presetState = kind !== 'preset-name' || moduleNumber === null
      ? null
      : this.bankStates.get(this.activeBank)?.presets[moduleNumber - 1] ?? null;
    const presetColors = moduleNumber === null
      ? PRESET_COLORS[0]
      : PRESET_COLORS[moduleNumber - 1] ?? PRESET_COLORS[0];
    const effectPadState = kind !== 'effect-pad' || moduleNumber === null
      ? null
      : this.effectPadStates.get(this.activeEffectBank)?.[moduleNumber - 1] ?? null;
    let bodyMarkup = '';
    if (kind === 'sound-selection') {
      const allowedCategories = this.soundCategoriesForModule(moduleNumber);
      bodyMarkup = createSoundSelectionMarkup(
        moduleState && (moduleState.category === 'user' || allowedCategories.some(({ id }) => id === moduleState.category))
          ? moduleState.category
          : allowedCategories[0]?.id ?? 'user',
        allowedCategories,
        !this.desktopRuntime,
        this.installedFixedSoundIds,
        moduleState?.timbreId ?? null,
        this.seenSoundIds,
      );
    } else if (kind === 'sound-download') {
      const sound = this.selectedCatalogSoundId ? this.soundCatalog.get(this.selectedCatalogSoundId) : null;
      bodyMarkup = createSoundDownloadMarkup(
        sound,
        sound ? this.installedFixedSoundIds.has(sound.id) : false,
        sound ? this.activeSoundDownloads.has(sound.id) : false,
      );
    } else if (kind === 'performance-download') {
      bodyMarkup = createPerformanceDownloadMarkup(this.selectedPerformanceAsset);
    } else if (kind === 'backup-download') {
      bodyMarkup = createBackupDownloadMarkup(this.pendingBackupDownloads);
    } else if (kind === 'about') {
      bodyMarkup = `
        <section class="about-panel">
          <button class="player-navigation__button about-panel__playlist" type="button" data-about-action="open-tracks">
            Playlist
          </button>
        </section>
      `;
    } else if (kind === 'module-settings') {
      // Módulos 5 e 6 voltaram a ser módulos normais: Arpeggiator e Pulse
      // agora são abas de qualquer módulo (ver moduleSettingsPages).
      const replacement = moduleNumber === 7 ? 'organ'
        : moduleNumber === 8 ? 'synth' : 'chorus';
      const pages = moduleSettingsPages(replacement);
      const remembered = moduleNumber === null ? undefined : this.moduleConfigPages.get(moduleNumber);
      this.moduleConfigPage = remembered && pages.includes(remembered)
        ? remembered : pages[0] ?? 'envelope';
      bodyMarkup = createModuleSettingsMarkup(
        this.midiInput.getInputDevices(),
        this.selectedMidiInputIds,
        moduleState?.midiInputId ?? null,
        moduleState?.settings ?? {},
        this.metronome.getBpm(),
        this.activeAudioChannelCount(),
        isAudioBusRoute(moduleState?.settings.outputRoute, this.activeAudioChannelCount())
          ? moduleState.settings.outputRoute as AudioBusRoute
          : 'default',
        replacement,
        this.moduleConfigPage,
        moduleState?.settingsMode ?? (moduleNumber !== null && moduleNumber <= 7 ? 'default' : 'user'),
      );
    } else if (kind === 'module-polyphony') {
      const polyphony = Math.round(Math.min(128, Math.max(1, Number(moduleState?.settings.polyphony) || 128)));
      bodyMarkup = `
        <section class="module-polyphony-panel">
          <label>
            <span>Quantidade máxima de vozes</span>
            <input type="number" min="1" max="128" step="1" inputmode="numeric" value="${polyphony}" data-module-polyphony-input>
          </label>
          <p>Escolha entre 1 e 128 vozes simultâneas para este módulo.</p>
        </section>
      `;
    } else if (kind === 'module-velocity') {
      bodyMarkup = createVelocityCurveMarkup(moduleState?.settings ?? {}, moduleNumber !== null && moduleNumber <= 7
        ? { ceiling: readVelocityLimit(moduleState?.settings.velocityCeiling) } : {});
    } else if (kind === 'module-filter-velocity') {
      const filterSettings = moduleState?.settings ?? {};
      bodyMarkup = cutoffConfigTabsMarkup('velocity') + createVelocityCurveMarkup(
        { velocityCurve: readFilterVelocityCurve(filterSettings.filterVelocityCurve) },
        {
          side: createFilterVelocityCutoffMarkup(filterSettings),
          variant: 'filter',
          dimmed: !readFilterVelocityEnabled(filterSettings),
        },
      );
    } else if (kind === 'module-env-filter') {
      const envFilterSettings = moduleState?.settings ?? {};
      // O mesmo knob de Cutoff de fora, sem o botão Config (já estamos dentro
      // dele): dá pra ajustar sem sair da aba Env-Filter.
      bodyMarkup = cutoffConfigTabsMarkup('env-filter')
        + createCutoffControl(readModuleCutoffFrequency(envFilterSettings.cutoffHz), false, envFilterSettings, false)
        + createModuleEnvFilterMarkup(envFilterSettings);
    } else if (kind === 'glide-config') {
      bodyMarkup = createGlideVelocityMarkup(moduleNumber === null ? {} : this.glideSettings(moduleNumber));
    } else if (kind === 'module-voice-mode') {
      bodyMarkup = createVoiceModeMarkup(
        moduleNumber === null ? {} : this.glideSettings(moduleNumber),
        this.metronome.getBpm(),
        moduleNumber === 8 ? 'synth' : 'module',
      );
    } else if (kind === 'module-arpeggiator') {
      bodyMarkup = createArpeggiatorMarkup(moduleState?.settings.arpeggiator);
    } else if (kind === 'module-trance-gate') {
      bodyMarkup = createTranceGateMarkup(moduleState?.settings.tranceGate);
    } else if (kind === 'module-synth') {
      const synthPresets = moduleState ? this.synthPresetSlots(moduleState) : [];
      bodyMarkup = createSynthModuleMarkup(
        moduleState?.settings.synth,
        synthPresets.map(Boolean),
        moduleState ? boundedNumber(moduleState.settings.synthActivePreset, 1, SYNTH_PRESET_COUNT, 1) : 1,
        this.metronome.getBpm(),
        moduleState ? this.synthPresetNames(moduleState) : [],
      );
    } else if (kind === 'synth-preset-name' && moduleNumber !== null) {
      const synthModule = this.getActivePresetState()?.modules[7];
      const name = synthModule ? this.synthPresetNames(synthModule)[moduleNumber - 1] : `Preset ${moduleNumber}`;
      bodyMarkup = `
        <section class="preset-name-editor synth-preset-name-editor">
          <label class="preset-name-editor__field">
            <span>Nome do preset do Synth</span>
            <input type="text" maxlength="20" autocomplete="off" data-synth-preset-name-input
              value="${escapeMarkup(name ?? `Preset ${moduleNumber}`)}">
          </label>
          <div class="cc-action-pair preset-name-editor__cc-actions">
            <button class="preset-name-editor__learn" type="button" data-modal-action="learn-synth-preset-cc">
              <span>Learn CC</span>
              <small>${this.ccMappingLabel({ kind: 'synth-preset', presetNumber: moduleNumber })}</small>
            </button>
            <button class="cc-action-pair__clean" type="button" data-modal-action="clean-synth-preset-cc">Clean</button>
          </div>
        </section>
      `;
    } else if (kind === 'module-eq') {
      bodyMarkup = createModuleEqMarkup(moduleState?.settings ?? {});
    } else if (kind === 'module-compressor') {
      bodyMarkup = createModuleCompressorMarkup(moduleState?.settings ?? {});
    } else if (kind === 'module-organ') {
      bodyMarkup = createOrganMarkup(moduleState?.settings ?? {});
    } else if (kind === 'module-rotary') {
      bodyMarkup = createModuleRotaryMarkup(moduleState?.settings ?? {});
    } else if (kind === 'module-chorus') {
      bodyMarkup = createModuleChorusMarkup(moduleState?.settings ?? {});
    } else if (kind === 'module-reverb') {
      bodyMarkup = createModuleReverbMarkup(moduleState?.settings ?? {});
    } else if (kind === 'module-delay') {
      bodyMarkup = createModuleDelayMarkup(moduleState?.settings ?? {}, this.metronome.getBpm());
    } else if (kind === 'app-settings') {
      bodyMarkup = createAppSettingsMarkup(
        this.compatibilityMode,
        this.seamlessPresetSwitching,
        this.bottomView,
        false,
        this.keyboardMidiSlot,
        this.keyboardStyle,
        // O celular também escolhe o MIDI e o estilo do teclado.
        true,
        this.liteMode,
        !this.desktopRuntime,
      );
    } else if (kind === 'app-settings-midi') {
      bodyMarkup = createMidiSettingsMarkup(this.midiInput.getInputDevices(), this.selectedMidiInputIds);
    } else if (kind === 'app-settings-audio') {
      bodyMarkup = createAudioSettingsMarkup(
        this.audioDevices, this.selectedAudioDeviceId, this.audioRouting, this.bufferSize, this.sampleRate,
      );
    } else if (kind === 'keyboard-settings') {
      bodyMarkup = createPerformanceKeyboardSettingsMarkup(this.keyboardMidiSlot, this.keyboardStyle);
    } else if (kind === 'password-reset') {
      bodyMarkup = createNewPasswordMarkup(!this.desktopRuntime);
    } else if (kind === 'compatibility-mode' && this.pendingCompatibilityMode !== null) {
      bodyMarkup = this.pendingCompatibilityMode
        ? `
          <section class="compatibility-confirmation">
            <strong>Modo compatibilidade</strong>
            <p>Esse modo é específico para quem usa teclados que não são controladores e deseja usar os botões para trocar de timbre.</p>
            <button type="button" data-modal-action="open-compatibility-video"${this.compatibilityVideoUrl ? '' : ' disabled'}>Assista aqui como programar o seu teclado para funcionar corretamente</button>
          </section>
        `
        : `
          <section class="compatibility-confirmation">
            <strong>Desativar modo compatibilidade?</strong>
            <p>Deseja desativar o modo compatibilidade?</p>
          </section>
        `;
    } else if (kind === 'output-volume') {
      bodyMarkup = createOutputFaderPanelMarkup(this.outputLevels, this.outputEnabled, OUTPUTS);
    } else if (kind === 'preset-paste-confirm' && moduleNumber !== null && this.presetClipboard) {
      bodyMarkup = `
        <section class="cc-clear-confirmation preset-paste-confirmation">
          <strong>Deseja colar o ${presetSlotLabel(this.presetClipboard.bank, this.presetClipboard.presetNumber)} em cima do ${presetSlotLabel(this.activeBank, moduleNumber)}?</strong>
          <p>Toda a configuração do ${presetSlotLabel(this.activeBank, moduleNumber)} será substituída.</p>
        </section>
      `;
    } else if (kind === 'module-config-copy-confirm' && moduleNumber !== null
        && this.moduleConfigCopySource !== null) {
      bodyMarkup = `
        <section class="cc-clear-confirmation preset-paste-confirmation">
          <strong>Copiar o Config do módulo ${this.moduleConfigCopySource} para o módulo ${moduleNumber}?</strong>
          <p>Toda a configuração e o timbre do módulo ${moduleNumber} serão substituídos. O MIDI mapeado e a entrada MIDI do destino serão preservados.</p>
        </section>
      `;
    } else if (kind === 'bank-name' && this.pendingBankEdit) {
      const bankState = this.bankStates.get(this.pendingBankEdit);
      bodyMarkup = `
        <section class="preset-name-editor bank-name-editor">
          <label class="preset-name-editor__field">
            <span>Nome do banco</span>
            <input type="text" maxlength="12" autocomplete="off" data-bank-name-input
              value="${escapeMarkup(bankState?.name || this.pendingBankEdit)}">
          </label>
          <button class="bank-name-editor__advanced" type="button" data-modal-action="open-bank-advanced">Advanced</button>
        </section>
      `;
    } else if (kind === 'effect-bank-name' && this.pendingEffectBankEdit) {
      bodyMarkup = `
        <section class="preset-name-editor bank-name-editor">
          <label class="preset-name-editor__field">
            <span>Nome do FX</span>
            <input type="text" maxlength="12" autocomplete="off" data-effect-bank-name-input
              value="${escapeMarkup(this.effectBankNames.get(this.pendingEffectBankEdit) ?? `FX ${this.pendingEffectBankEdit}`)}">
          </label>
        </section>
      `;
    } else if (kind === 'bank-advanced' && this.pendingBankEdit) {
      const mode = this.bankStates.get(this.pendingBankEdit)?.faderMode ?? 'default';
      bodyMarkup = `
        <section class="bank-advanced-panel">
          <div class="bank-advanced-panel__modes" role="radiogroup" aria-label="Comportamento dos faders">
            ${(['default', 'master', 'bank', 'bank2'] as const).map((option) => `
              <button class="${mode === option ? 'is-selected' : ''}" type="button"
                data-bank-fader-mode="${option}" role="radio" aria-checked="${mode === option}">${
                  faderModeLabel(option)
                }</button>
            `).join('')}
          </div>
          <p><b>Default:</b> o mesmo Learn CC vale em todos os presets e cada preset restaura sua posição de volume.</p>
          <p><b>Master:</b> o mesmo Learn CC vale em todos os presets e os volumes permanecem onde estão ao trocar de preset.</p>
          <p><b>Bank 1:</b> os volumes permanecem como no Master, mas o Learn CC dos faders é individual em cada preset.</p>
          <p><b>Bank 2:</b> o Learn CC dos faders é individual e cada preset restaura sua própria posição de volume.</p>
        </section>
      `;
    } else if (kind === 'preset-name' && moduleNumber !== null) {
      bodyMarkup = `
        <section class="preset-name-editor">
          <label class="preset-name-editor__field">
            <span>Nome do preset</span>
            <input type="text" maxlength="20" autocomplete="off" data-preset-name-input>
          </label>
          <div class="preset-name-editor__preview" aria-label="Prévia do botão">
            <button
              class="player-preset-button is-selected preset-name-editor__preview-button"
              type="button"
              disabled
              style="--preset-accent: ${presetColors[0]}; --preset-dark: ${presetColors[1]}"
            >
              <span class="player-preset-button__number">${moduleNumber.toString().padStart(2, '0')}</span>
              <span class="player-preset-button__label"></span>
            </button>
          </div>
          <div class="cc-action-pair preset-name-editor__cc-actions">
            <button class="preset-name-editor__learn" type="button" data-modal-action="learn-preset-cc">
              <span>Learn CC</span>
              <small>${this.ccMappingLabel({ kind: 'preset', bank: this.activeBank, presetNumber: moduleNumber })}</small>
            </button>
            <button class="cc-action-pair__clean" type="button" data-modal-action="clean-preset-cc">Clean</button>
          </div>
        </section>
      `;
    } else if (kind === 'cc-learn' && this.pendingCcLearn) {
      const currentController = this.ccMappings.get(this.ccMappingKeyForTarget(this.pendingCcLearn));
      const continuous = isContinuousCcTarget(this.pendingCcLearn);
      const ccLimit = formatCcLimit(this.pendingCcLearn, this.pendingCcLimitPercent);
      bodyMarkup = `
        <section class="cc-learn-panel">
          <div class="cc-learn-panel__badge" aria-hidden="true">CC</div>
          <strong>Learn CC</strong>
          <p data-cc-learn-status>Mova o controle MIDI que deseja usar.</p>
          <small data-cc-learn-current>${currentController === undefined ? 'Ainda não mapeado' : `Mapeamento atual: CC ${currentController}`}</small>
          ${continuous ? `
            <div class="cc-learn-curve" aria-label="Curva do controle contínuo">
              <button class="${this.pendingCcInverted ? 'is-selected' : ''}" type="button"
                data-modal-action="toggle-cc-invert" aria-pressed="${this.pendingCcInverted}">Inverter</button>
              <label>
                <span>Limite CC <output data-cc-limit-output>${ccLimit}</output></span>
                <input type="range" min="0" max="100" step="0.1" value="${this.pendingCcLimitPercent}"
                  data-cc-limit aria-label="Limite CC" aria-valuetext="${ccLimit}">
              </label>
              <small>O curso completo do controle físico termina neste ponto do knob ou fader.</small>
            </div>
          ` : ''}
        </section>
      `;
    } else if (kind === 'cc-clear-confirm' && this.pendingCcClear) {
      const controller = this.ccMappings.get(this.ccMappingKeyForTarget(this.pendingCcClear));
      bodyMarkup = `
        <section class="cc-clear-confirmation">
          <strong>Limpar mapeamento?</strong>
          <p>${controller === undefined ? 'Este controle ainda não possui CC mapeado.' : `O CC ${controller} será removido de ${ccLearnTargetLabel(this.pendingCcClear)}.`}</p>
        </section>
      `;
    } else if (kind === 'metronome') {
      bodyMarkup = `
        <section class="metronome-panel">
          <div class="metronome-panel__meter-options">
            <button class="${this.metronome.isAccentEnabled() ? 'is-selected' : ''}" type="button" data-modal-action="toggle-metronome-accent" aria-pressed="${this.metronome.isAccentEnabled()}">A-B</button>
            <label class="metronome-signature" aria-label="Compasso">
              <input type="number" min="1" max="16" step="1" inputmode="numeric" value="${this.metronome.getTimeSignatureNumerator()}" data-metronome-signature="numerator">
              <span>/</span>
              <input type="number" min="2" max="16" step="2" inputmode="numeric" value="${this.metronome.getTimeSignatureDenominator()}" data-metronome-signature="denominator">
            </label>
            <button class="${this.metronome.isDoubleTimeEnabled() ? 'is-selected' : ''}" type="button" data-modal-action="toggle-metronome-double" aria-pressed="${this.metronome.isDoubleTimeEnabled()}">2x</button>
          </div>
          <div class="metronome-panel__sounds" aria-label="Som do metrônomo">
            ${([1, 2, 3] as const).map((sound) => `
              <button class="${this.metronome.getClickSound() === sound ? 'is-selected' : ''}" type="button" data-metronome-sound="${sound}">Click ${sound}</button>
            `).join('')}
          </div>
          <div class="player-modal__inline-cc-actions">
            <button type="button" data-modal-action="learn-metronome-cc">
              <span>Learn CC · ON / OFF</span>
              <small>${this.ccMappingLabel({ kind: 'metronome-toggle' })}</small>
            </button>
            <button type="button" data-modal-action="clean-metronome-cc">Clean</button>
          </div>
        </section>
      `;
    } else if (kind === 'tempo-edit') {
      bodyMarkup = `
        <section class="tempo-editor">
          <label>
            <span>Tempo</span>
            <input type="${this.desktopRuntime ? 'number' : 'text'}" min="60" max="600" maxlength="5" step="0.5" inputmode="decimal" aria-label="BPM" value="${formatBpm(this.metronome.getBpm())}" data-tempo-input data-keyboard-numeric="true" data-keyboard-decimal="true">
            <small>60 a 600 BPM</small>
          </label>
          <div class="player-modal__inline-cc-actions">
            <button type="button" data-modal-action="learn-tempo-cc">
              <span>Learn CC · Tap Tempo</span>
              <small>${this.ccMappingLabel({ kind: 'tap-tempo' })}</small>
            </button>
            <button type="button" data-modal-action="clean-tempo-cc">Clean</button>
          </div>
        </section>
      `;
    } else if (kind === 'track-position') {
      const snapshot = this.trackTransport?.getSnapshot() ?? this.trackPlaybackSnapshot;
      const canSeek = snapshot.selectedTrackId !== null && snapshot.state !== 'loading';
      bodyMarkup = `
        <section class="track-position-panel">
          <div class="waveform-position${snapshot.state === 'playing' ? ' is-locked' : ''}" style="--track-progress:${snapshot.progress * 100}%;--track-ratio:${snapshot.progress}">
            <div class="waveform-position__bars is-loading" data-waveform-bars aria-hidden="true">
              ${createWaveformBarsMarkup()}
            </div>
            <span class="waveform-position__played" aria-hidden="true"></span>
            <span class="waveform-position__needle" aria-hidden="true"></span>
            <span class="waveform-position__progress" aria-hidden="true"></span>
            <input
              type="range"
              min="0"
              max="1000"
              step="1"
              value="${Math.round(snapshot.progress * 1000)}"
              data-transport-progress
              aria-label="Posição da música"
              style="--track-progress:${snapshot.progress * 100}%"
              ${canSeek ? '' : 'disabled'}
            >
          </div>
        </section>
      `;
    } else if (kind === 'effect-pad' && moduleNumber !== null) {
      const activeColorIndex = effectPadState?.colorIndex ?? (moduleNumber - 1) % EFFECT_PAD_COLORS.length;
      const activeColors = EFFECT_PAD_COLORS[activeColorIndex] ?? EFFECT_PAD_COLORS[0];
      const hasFixedEffectName = this.activeEffectBank === '1' || this.activeEffectBank === '2';
      const effectName = hasFixedEffectName
        ? this.soundCatalog.getPerformanceAsset('fx', this.activeEffectBank, moduleNumber)?.name
          ?? effectPadState?.name
          ?? `Efeito ${moduleNumber}`
        : effectPadState?.name ?? `Efeito ${moduleNumber}`;
      const supportsAudioAssignment = this.activeEffectBank === '3' || this.activeEffectBank === '4';
      const effectVolumeDb = boundedNumber(
        effectPadState?.volumeDb,
        EFFECT_PAD_MIN_DB,
        EFFECT_PAD_MAX_DB,
        EFFECT_PAD_MAX_DB,
      );
      const effectVolumePosition = ((effectVolumeDb - EFFECT_PAD_MIN_DB) / (EFFECT_PAD_MAX_DB - EFFECT_PAD_MIN_DB)) * 100;
      bodyMarkup = `
        <section
          class="effect-pad-editor${supportsAudioAssignment ? ' has-audio-options' : ''}${hasFixedEffectName ? ' has-fixed-name' : ''}"
          data-effect-color-index="${activeColorIndex}"
          data-effect-mode="${effectPadState?.triggerMode ?? 'toggle'}"
          data-effect-gate-release="${effectPadState?.gateRelease ?? 'infinite'}"
        >
          ${hasFixedEffectName ? '' : `
            <label class="effect-pad-editor__field">
              <span>Nome do efeito</span>
              <input type="text" maxlength="12" autocomplete="off" data-effect-name-input>
            </label>
          `}
          <div class="effect-pad-editor__preview" aria-label="Prévia do pad">
            <button
              class="performance-pad performance-pad--effect effect-pad-editor__preview-button"
              type="button"
              disabled
              style="--effect-accent: ${activeColors[0]}; --effect-dark: ${activeColors[1]}"
            ><span>${escapeMarkup(effectName)}</span></button>
          </div>
          <div class="effect-color-palette" role="radiogroup" aria-label="Cor do efeito">
            ${EFFECT_PAD_COLORS.map((colors, colorIndex) => `
              <button
                class="effect-color-option${colorIndex === activeColorIndex ? ' is-selected' : ''}"
                type="button"
                data-effect-color-index="${colorIndex}"
                role="radio"
                aria-checked="${colorIndex === activeColorIndex}"
                aria-label="Cor ${colorIndex + 1}"
                style="--effect-accent: ${colors[0]}; --effect-dark: ${colors[1]}"
              ></button>
            `).join('')}
          </div>
          <label class="effect-pad-volume">
            <span>Volume do pad</span>
            <div class="effect-pad-volume__control" style="--effect-pad-volume-position:${effectVolumePosition}%">
              <input
                type="range"
                min="${EFFECT_PAD_MIN_DB}"
                max="${EFFECT_PAD_MAX_DB}"
                step="0.1"
                value="${effectVolumeDb}"
                data-effect-pad-volume
                aria-label="Volume individual do pad"
                aria-valuetext="${formatOutputDb(effectVolumeDb)}"
              >
            </div>
            <output data-effect-pad-volume-value>${formatOutputDb(effectVolumeDb)}</output>
          </label>
          <div class="cc-action-pair effect-pad-editor__cc-actions">
            <button class="effect-pad-editor__learn" type="button" data-modal-action="learn-effect-cc">
              <span>Learn CC</span>
              <small>${this.ccMappingLabel({ kind: 'effect', bank: this.activeEffectBank, effectNumber: moduleNumber })}</small>
            </button>
            <button class="cc-action-pair__clean" type="button" data-modal-action="clean-effect-cc">Clean</button>
          </div>
          ${supportsAudioAssignment ? `
            <div class="effect-pad-editor__options">
              <button type="button" data-modal-action="toggle-effect-mode-options">
                <span>Modo</span>
                <small data-effect-mode-label>${effectPadState?.triggerMode === 'gate' ? 'Gate' : 'Toggle'}</small>
              </button>
              <button type="button" data-modal-action="choose-effect-audio">
                <span>Escolher FX</span>
                <small data-effect-audio-label>${escapeMarkup(effectPadState?.audioFileName ?? 'Nenhum arquivo')}</small>
              </button>
              <input
                type="file"
                accept="audio/wav,audio/x-wav,audio/aiff,audio/x-aiff,audio/mpeg,.wav,.wave,.aif,.aiff,.mp3"
                data-effect-audio-file
                hidden
              >
            </div>
            <div class="effect-mode-options" data-effect-mode-options hidden>
              <div class="effect-mode-options__primary">
                <button class="${effectPadState?.triggerMode === 'toggle' ? 'is-selected' : ''}" type="button" data-effect-mode="toggle">Toggle</button>
                <button class="${effectPadState?.triggerMode === 'gate' ? 'is-selected' : ''}" type="button" data-effect-mode="gate">Gate</button>
              </div>
              <div class="effect-mode-options__gate" data-effect-gate-options ${effectPadState?.triggerMode === 'gate' ? '' : 'hidden'}>
                <button class="${effectPadState?.gateRelease === 'infinite' ? 'is-selected' : ''}" type="button" data-effect-gate-release="infinite">Infinite Release</button>
                <button class="${effectPadState?.gateRelease === 'continue-press' ? 'is-selected' : ''}" type="button" data-effect-gate-release="continue-press">Continue Press</button>
              </div>
            </div>
          ` : ''}
        </section>
      `;
    } else if (kind === 'user') {
      bodyMarkup = `
        <section class="user-panel">
          <div class="user-panel__identity">
            <button class="user-profile-photo" type="button" data-user-profile-action="choose-photo" aria-label="Escolher foto do perfil">
              <span data-user-photo-fallback aria-hidden="true"></span>
              <img data-user-photo alt="Foto do perfil" hidden>
              <b aria-hidden="true">+</b>
            </button>
            <div class="user-panel__identity-copy">
              <span>Perfil</span>
              <div class="user-panel__name-row">
                <strong data-user-name></strong>
                <button class="user-profile-edit-name" type="button" data-user-profile-action="edit-name" aria-label="Editar nome">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16.5V20h3.5L18.8 8.7l-3.5-3.5L4 16.5Zm17-10.6a1 1 0 0 0 0-1.4l-1.5-1.5a1 1 0 0 0-1.4 0l-1.7 1.7 3.5 3.5L21 5.9Z"/></svg>
                </button>
              </div>
              <small data-user-created>Carregando data da conta...</small>
            </div>
            <input type="file" accept="image/*" data-user-profile-file hidden>
          </div>
          <div class="user-panel__profile-body">
            <nav class="user-panel__buttons" aria-label="Opções da conta">
              <button class="user-panel__action-button" type="button" data-modal-action="make-backup">Salvar backup</button>
              <button class="user-panel__action-button" type="button" data-modal-action="restore-backup">Restaurar backup</button>
              <input type="file" accept="application/json,.json" data-player-backup-file hidden>
              <button class="user-panel__action-button" type="button" data-modal-action="reset-password">Redefinir senha</button>
              <button class="user-panel__action-button" type="button" data-modal-action="show-devices">Dispositivos</button>
              <button class="user-panel__action-button" type="button" data-modal-action="acquire-license" disabled>Adquirir mais licença</button>
              <button class="user-panel__action-button" type="button" data-modal-action="open-support" disabled>Suporte</button>
            </nav>
            <div class="user-panel__licenses" data-user-licenses>
              <span class="loading-orbit" aria-hidden="true"></span>
              <p>Carregando suas licenças...</p>
            </div>
          </div>
          <p class="user-profile-message" data-user-profile-message role="status" aria-live="polite"></p>
          <div class="user-photo-preview" data-user-photo-preview hidden>
            <div class="user-photo-preview__dialog" role="dialog" aria-modal="true" aria-labelledby="user-photo-preview-title">
              <strong id="user-photo-preview-title">Prévia da foto</strong>
              <div class="user-photo-preview__editor" data-user-photo-crop>
                <canvas width="720" height="405" data-user-photo-canvas aria-label="Ajuste da foto do perfil"></canvas>
                <span class="user-photo-preview__mask" aria-hidden="true"></span>
                <div class="user-photo-preview__zoom" aria-label="Zoom da foto">
                  <button type="button" data-user-photo-zoom="in" aria-label="Aumentar foto">+</button>
                  <button type="button" data-user-photo-zoom="out" aria-label="Diminuir foto">−</button>
                </div>
              </div>
              <p>Arraste a imagem e ajuste o zoom. A área dentro do círculo será usada no perfil.</p>
              <div class="user-photo-preview__actions">
                <button type="button" data-modal-action="cancel-user-photo">Escolher outra</button>
                <button type="button" data-modal-action="save-user-photo">Usar esta foto</button>
              </div>
            </div>
          </div>
        </section>
      `;
    } else if (kind === 'user-name') {
      bodyMarkup = `
        <section class="user-name-editor">
          <label>
            <span>Nome do usuário</span>
            <input type="text" maxlength="80" autocomplete="name" autocapitalize="words" spellcheck="false" data-user-name-input>
          </label>
          <p data-user-name-message role="alert" aria-live="polite"></p>
        </section>
      `;
    } else if (kind === 'tracks') {
      bodyMarkup = createTracksPanelMarkup();
    }
    const processorKind = kind === 'module-eq' ? 'eq'
      : kind === 'module-compressor' ? 'compressor'
        : kind === 'module-reverb' ? 'reverb'
          : kind === 'module-delay' ? 'delay'
            : kind === 'module-rotary' ? 'rotary'
              : kind === 'module-chorus' ? 'chorus'
                : kind === 'module-env-filter' ? 'cutoffEnvelope' : null;
    const patternKind = kind === 'module-arpeggiator' ? 'arpeggiator'
      : kind === 'module-trance-gate' ? 'trance-gate' : null;
    const processorEnabled = patternKind === 'arpeggiator'
      ? readArpeggiatorSettings(moduleState?.settings.arpeggiator).enabled
      : patternKind === 'trance-gate'
        ? readTranceGateSettings(moduleState?.settings.tranceGate).enabled
      : processorKind === 'eq'
      ? moduleState?.settings.eqEnabled !== false
      : processorKind === 'compressor'
        ? readModuleCompressorSettings(moduleState?.settings.compressor).enabled
        : processorKind === 'reverb'
          ? readModuleReverbSettings(moduleState?.settings.reverb).enabled
          : processorKind === 'delay'
            ? readModuleDelaySettings(moduleState?.settings.delay).enabled
            : processorKind === 'rotary'
              ? readModuleRotarySettings(moduleState?.settings.rotary).enabled
              : processorKind === 'chorus'
                ? readModuleChorusSettings(moduleState?.settings.chorus).enabled
                : processorKind === 'cutoffEnvelope'
                  ? readModuleCutoffEnvelopeSettings(moduleState?.settings.cutoffEnvelope).enabled : false;
    const settingsPagePower = kind === 'module-settings'
      ? moduleSettingsPagePower(this.moduleConfigPage, moduleState?.settings ?? {})
      : null;
    const footerMarkup = kind === 'user'
      ? `
          <button class="player-modal__back-button" type="button" data-modal-action="cancel">Voltar</button>
        `
      : kind === 'user-name'
        ? `
          <button class="player-modal__back-button" type="button" data-modal-action="cancel">Cancelar</button>
          <button class="player-modal__confirm-button" type="button" data-modal-action="save-user-name">Aplicar</button>
        `
      : kind === 'password-reset'
        ? `<button class="player-modal__back-button" type="button" data-modal-action="cancel">Voltar</button>`
      : kind === 'tracks'
        ? `
          <button class="player-modal__back-button" type="button" data-modal-action="cancel">Voltar</button>
          <button class="tracks-footer-button tracks-footer-button--delete-all" type="button" data-tracks-action="delete-all" disabled aria-disabled="true">Delete All</button>
          <button class="tracks-footer-button tracks-footer-button--add" type="button" data-tracks-action="add-music">Add música</button>
          <button class="tracks-footer-button tracks-footer-button--create" type="button" data-tracks-action="create-playlist">Create playlist</button>
        `
      : kind === 'track-position'
        ? `
          <button class="player-modal__back-button" type="button" data-modal-action="play-track-position"${
            this.trackTransport?.getSnapshot().selectedTrackId && this.trackTransport.getSnapshot().state !== 'loading'
              ? '' : ' disabled'}>Play</button>
          <button class="player-modal__confirm-button" type="button" data-modal-action="confirm">OK</button>
        `
      : kind === 'compatibility-mode'
        ? `
          <button class="player-modal__back-button" type="button" data-modal-action="cancel-compatibility">Cancelar</button>
          <button class="player-modal__confirm-button" type="button" data-modal-action="apply-compatibility">${this.pendingCompatibilityMode ? 'Aplicar' : 'Sim'}</button>
        `
      : kind === 'backup-download'
        ? `
          <button class="player-modal__back-button" type="button" data-modal-action="skip-backup-download">Agora não</button>
          <button class="player-modal__confirm-button" type="button" data-modal-action="download-backup-sounds">Baixar timbres</button>
        `
      : kind === 'sound-download' || kind === 'performance-download'
        ? `<button class="player-modal__back-button" type="button" data-modal-action="cancel">Voltar</button>`
      : kind === 'cc-learn'
        ? `
          <button class="player-modal__back-button" type="button" data-modal-action="cancel">Voltar</button>
          <button class="player-modal__clean-button" type="button" data-modal-action="open-cc-clear">Clean</button>
          <button class="player-modal__confirm-button" type="button" data-modal-action="confirm-cc-learn"${
            this.pendingCcController === null ? ' disabled' : ''
          }>OK</button>
        `
      : kind === 'synth-preset-name'
        ? `
          <button class="player-modal__back-button" type="button" data-modal-action="cancel">Voltar</button>
          <button class="player-modal__confirm-button" type="button" data-modal-action="confirm">OK</button>
        `
      : kind === 'preset-paste-confirm'
        ? `
          <button class="player-modal__back-button" type="button" data-modal-action="cancel-preset-paste">Cancelar</button>
          <button class="player-modal__confirm-button" type="button" data-modal-action="confirm-preset-paste">Colar</button>
        `
      : kind === 'module-config-copy-confirm'
        ? `
          <button class="player-modal__back-button" type="button" data-modal-action="cancel">Cancelar</button>
          <button class="player-modal__confirm-button" type="button" data-modal-action="confirm-module-config-copy">Copiar</button>
        `
      : kind === 'cc-clear-confirm'
        ? `
          <button class="player-modal__back-button" type="button" data-modal-action="cancel-cc-clear">Cancelar</button>
          <button class="player-modal__confirm-button is-danger" type="button" data-modal-action="confirm-cc-clear">Limpar</button>
        `
      : kind === 'module-organ'
        ? `
          <button class="player-modal__back-button" type="button" data-modal-action="cancel">Voltar</button>
          ${this.desktopRuntime ? `<button class="module-effect-power ${readModuleRotarySettings(moduleState?.settings.rotary).enabled ? 'is-on' : 'is-off'}" type="button"
            data-module-effect-power="rotary" aria-pressed="${readModuleRotarySettings(moduleState?.settings.rotary).enabled}">${
              readModuleRotarySettings(moduleState?.settings.rotary).enabled ? 'ON' : 'OFF'}</button>` : ''}
        `
      : kind === 'module-synth'
        ? `
          <button class="player-modal__back-button" type="button" data-modal-action="cancel">Voltar</button>
          <button class="player-modal__reset-button" type="button" data-modal-action="reset-synth-preset">Reset</button>
          <button class="player-modal__confirm-button" type="button" data-modal-action="confirm">OK</button>
        `
      : kind === 'module-settings'
        ? `
          <button class="player-modal__back-button" type="button" data-modal-action="cancel">Voltar</button>
          <button class="module-effect-power ${settingsPagePower ? 'is-on' : 'is-off'}" type="button"
            data-module-effect-power="${this.moduleConfigPage}"
            aria-pressed="${settingsPagePower === true}"${settingsPagePower === null ? ' hidden' : ''}>${
  settingsPagePower ? 'ON' : 'OFF'}</button>
          <button class="player-modal__reset-button" type="button"
            data-modal-action="reset-processor" data-reset-processor="${this.moduleConfigPage}"${
  moduleState?.settingsMode === 'default' ? ' hidden' : ''}>Reset</button>
        `
      : processorKind || patternKind
        ? `
          <button class="player-modal__back-button" type="button" data-modal-action="cancel">Voltar</button>
          <button class="module-effect-power ${processorEnabled ? 'is-on' : 'is-off'}" type="button" data-module-effect-power="${processorKind ?? patternKind}" aria-pressed="${processorEnabled}">${processorEnabled ? 'ON' : 'OFF'}</button>
          <button class="player-modal__confirm-button" type="button" data-modal-action="confirm">OK</button>
        `
      : `
          <button class="player-modal__back-button" type="button" data-modal-action="cancel">Voltar</button>
          <button class="player-modal__confirm-button" type="button" data-modal-action="confirm">OK</button>
        `;

    modal.innerHTML = `
      <div class="player-modal__surface">
        <header class="player-modal__header">
          <p class="player-modal__eyebrow"></p>
          <h2 id="${titleId}"></h2>
          ${kind === 'sound-selection' ? `
            <span class="sound-library-total">Total - ${formatSoundfontTotal(
              this.soundCatalog.sounds.reduce(
                (total, sound) => total + (sound.sf2ObjectKey ? sound.byteSize ?? 0 : 0),
                0,
              ),
            )}</span>
            ${(() => {
              const downloadable = this.soundCatalog.sounds.filter((sound) => Boolean(sound.sf2ObjectKey));
              const done = downloadable.length > 0
                && downloadable.every((sound) => this.installedFixedSoundIds.has(sound.id));
              // Tudo já baixado: o mesmo botão vira "Apagar biblioteca" em vez
              // de ficar travado sem fazer mais nada.
              return `<button class="sound-library-download-all${done ? ' is-delete' : ''}" type="button" data-modal-action="${
                done ? 'delete-all-sounds' : 'download-all-sounds'
              }" aria-live="polite"${downloadable.length === 0 ? ' disabled' : ''
              }>${done ? 'Apagar biblioteca' : 'Baixar tudo'}</button>`;
            })()}
          ` : ''}
          ${processorKind ? `
            <button class="module-processor-reset-button" type="button" data-modal-action="reset-processor" data-reset-processor="${processorKind}">Reset</button>
          ` : ''}
          ${kind === 'user' ? `
            <button class="player-modal__logout-button player-modal__logout-button--top" type="button" data-action="logout">Sair</button>
          ` : ''}
          <p class="player-modal__description"></p>
        </header>

        <div class="player-modal__body">
          ${bodyMarkup}
        </div>

        <footer class="player-modal__actions">
          ${footerMarkup}
        </footer>
      </div>
    `;

    const eyebrow = requiredElement<HTMLElement>(modal, '.player-modal__eyebrow');
    const title = requiredElement<HTMLElement>(modal, `#${titleId}`);
    const description = requiredElement<HTMLElement>(modal, '.player-modal__description');
    if (kind === 'module-settings') {
      eyebrow.textContent = '';
      title.textContent = moduleNumber === 8
        ? 'Synth'
        : moduleNumber === 7 ? 'Organ'
        : moduleState?.timbreId && moduleState.timbreName !== 'Sem timbre'
        ? moduleState.timbreName
        : 'Empty';
    } else if (kind === 'module-polyphony') {
      eyebrow.textContent = moduleState?.timbreId && moduleState.timbreName !== 'Sem timbre'
        ? moduleState.timbreName
        : 'Timbre';
      title.textContent = 'Polifonia';
    } else if (kind === 'module-velocity') {
      eyebrow.textContent = moduleState?.timbreId && moduleState.timbreName !== 'Sem timbre'
        ? moduleState.timbreName
        : 'Timbre';
      title.textContent = 'Velocity';
    } else if (kind === 'glide-config') {
      eyebrow.textContent = moduleNumber === 8 ? 'Synth' : `Módulo ${(moduleNumber ?? 0).toString().padStart(2, '0')}`;
      title.textContent = 'Glide · Velocity';
    } else if (kind === 'module-voice-mode') {
      eyebrow.textContent = moduleNumber === 8 ? 'Synth' : `Módulo ${(moduleNumber ?? 0).toString().padStart(2, '0')}`;
      title.textContent = 'Mono · Legato';
    } else if (kind === 'module-filter-velocity') {
      eyebrow.textContent = 'Cutoff';
      title.textContent = 'Velocity do filtro';
    } else if (kind === 'module-env-filter') {
      eyebrow.textContent = 'Cutoff';
      title.textContent = 'Env-Filter';
    } else if (kind === 'module-arpeggiator') {
      eyebrow.textContent = `Módulo ${(moduleNumber ?? 0).toString().padStart(2, '0')}`;
      title.textContent = 'Arpeggiator';
    } else if (kind === 'module-trance-gate') {
      eyebrow.textContent = `Módulo ${(moduleNumber ?? 0).toString().padStart(2, '0')}`;
      title.textContent = 'Pulse';
    } else if (kind === 'module-synth') {
      eyebrow.textContent = 'Módulo 08';
      title.textContent = 'Synth';
    } else if (kind === 'synth-preset-name') {
      eyebrow.textContent = 'Synth';
      title.textContent = `Preset ${moduleNumber ?? ''}`;
    } else if (kind === 'module-eq') {
      eyebrow.textContent = moduleState?.timbreId && moduleState.timbreName !== 'Sem timbre'
        ? moduleState.timbreName
        : 'Timbre';
      title.textContent = 'EQ';
    } else if (kind === 'module-compressor' || kind === 'module-reverb' || kind === 'module-delay' || kind === 'module-rotary' || kind === 'module-chorus') {
      eyebrow.textContent = moduleState?.timbreId && moduleState.timbreName !== 'Sem timbre'
        ? moduleState.timbreName
        : 'Timbre';
      title.textContent = kind === 'module-compressor'
        ? 'Compressor'
        : kind === 'module-reverb' ? 'Reverb'
          : kind === 'module-rotary' ? 'Rotary Speaker'
            : kind === 'module-chorus' ? 'Chorus' : 'Delay';
    } else if (kind === 'module-organ') {
      eyebrow.textContent = `Módulo ${(moduleNumber ?? 0).toString().padStart(2, '0')}`;
      title.textContent = 'Hook B3';
    } else if (kind === 'sound-selection') {
      eyebrow.textContent = `Módulo ${(moduleNumber ?? 0).toString().padStart(2, '0')}`;
      title.textContent = 'Library';
    } else if (kind === 'sound-download') {
      eyebrow.textContent = 'Biblioteca';
      title.textContent = this.installedFixedSoundIds.has(this.selectedCatalogSoundId ?? '')
        ? 'Timbre instalado' : 'Baixar timbre';
    } else if (kind === 'performance-download') {
      eyebrow.textContent = this.selectedPerformanceAsset?.kind === 'pad' ? 'Pads' : 'Efeitos';
      title.textContent = 'Baixar som';
    } else if (kind === 'backup-download') {
      eyebrow.textContent = 'Backup restaurado';
      title.textContent = 'Baixar timbres usados?';
    } else if (kind === 'about') {
      eyebrow.textContent = 'Version 1.0.0';
      title.textContent = 'ReiVs';
      description.textContent = 'Copyright 2026';
    } else if (kind === 'app-settings') {
      eyebrow.textContent = 'Hook Keys';
      title.textContent = 'Configurações';
    } else if (kind === 'app-settings-midi') {
      eyebrow.textContent = 'Configurações';
      title.textContent = 'Dispositivos MIDI';
    } else if (kind === 'app-settings-audio') {
      eyebrow.textContent = 'Configurações';
      title.textContent = 'Dispositivo de áudio';
    } else if (kind === 'keyboard-settings') {
      eyebrow.textContent = 'Keyboard';
      title.textContent = 'Configurar teclado';
    } else if (kind === 'password-reset') {
      eyebrow.textContent = 'Conta';
      title.textContent = 'Redefinir senha';
    } else if (kind === 'user') {
      eyebrow.textContent = 'Hook Keys';
      title.textContent = 'Usuário';
    } else if (kind === 'user-name') {
      eyebrow.textContent = 'Perfil';
      title.textContent = 'Editar nome';
    } else if (kind === 'tracks') {
      eyebrow.textContent = 'Hook Keys';
      title.textContent = 'Playlist';
    } else if (kind === 'output-volume') {
      eyebrow.textContent = 'Hook Keys';
      title.textContent = 'Volume';
    } else if (kind === 'effect-pad') {
      eyebrow.textContent = `FX ${this.activeEffectBank} · Pad ${(moduleNumber ?? 0).toString().padStart(2, '0')}`;
      title.textContent = 'Editar efeito';
    } else if (kind === 'bank-name' && this.pendingBankEdit) {
      eyebrow.textContent = `Banco ${this.pendingBankEdit}`;
      title.textContent = 'Nome do banco';
    } else if (kind === 'effect-bank-name' && this.pendingEffectBankEdit) {
      eyebrow.textContent = `FX ${this.pendingEffectBankEdit}`;
      title.textContent = 'Nome do FX';
    } else if (kind === 'bank-advanced' && this.pendingBankEdit) {
      eyebrow.textContent = `Banco ${this.pendingBankEdit}`;
      title.textContent = 'Advanced';
    } else if (kind === 'cc-learn' && this.pendingCcLearn) {
      eyebrow.textContent = ccLearnTargetLabel(this.pendingCcLearn);
      title.textContent = 'Learn CC';
    } else if (kind === 'cc-clear-confirm' && this.pendingCcClear) {
      eyebrow.textContent = ccLearnTargetLabel(this.pendingCcClear);
      title.textContent = 'Clean CC';
    } else if (kind === 'metronome') {
      eyebrow.textContent = `${this.metronome.getBpm()} BPM`;
      title.textContent = 'Metrônomo';
    } else if (kind === 'tempo-edit') {
      eyebrow.textContent = 'Tap Tempo';
      title.textContent = 'Definir tempo';
    } else if (kind === 'track-position') {
      eyebrow.textContent = 'Playlist';
      title.textContent = 'Posição da música';
    } else if (kind === 'preset-paste-confirm') {
      eyebrow.textContent = 'Copy · Paste';
      title.textContent = 'Colar preset';
    } else if (kind === 'module-config-copy-confirm') {
      eyebrow.textContent = 'Config · Copy';
      title.textContent = 'Confirmar cópia';
    } else if (kind === 'compatibility-mode') {
      eyebrow.textContent = 'Hook Keys';
      title.textContent = this.pendingCompatibilityMode ? 'Modo compatibilidade' : 'Confirmar alteração';
    } else {
      eyebrow.textContent = `Banco ${this.activeBank} · Preset ${(moduleNumber ?? 0).toString().padStart(2, '0')}`;
      title.textContent = 'Nome do preset';
    }

    // Cada página do Config é o mesmo editor que antes abria numa janela: os
    // controles continuam sendo roteados como se aquela janela estivesse aberta,
    // enquanto o topo e o rodapé do painel seguem respondendo como Config.
    const pageKind = (): ModalKind => kind !== 'module-settings' || this.moduleConfigPage === 'envelope'
      ? kind
      : `module-${this.moduleConfigPage}` as ModalKind;

    const defaultSettingsTarget = (target: EventTarget | null): Element | null => {
      if (kind !== 'module-settings' || !modal.classList.contains('is-default-settings') || !(target instanceof Element)) return null;
      return target.closest(
        '.module-settings-workspace, .module-settings-bottom-row, .module-polyphony-button, '
        + '.module-voice-mode-button, .module-settings-reset-button, .player-modal__actions .module-effect-power',
      );
    };
    modal.addEventListener('pointerdown', (event) => {
      if (!defaultSettingsTarget(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.showDefaultSettingsNotice(modal);
    }, true);
    modal.addEventListener('keydown', (event) => {
      if (event.key === 'Tab' || !defaultSettingsTarget(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.showDefaultSettingsNotice(modal);
    }, true);

    modal.addEventListener('click', (event) => {
      const target = event.target;
      const noticeClose = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-default-settings-notice-close]') : null;
      if (noticeClose) {
        noticeClose.closest('[data-default-settings-notice]')?.remove();
        return;
      }
      const bankAdvanced = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-modal-action="open-bank-advanced"]') : null;
      if (kind === 'bank-name' && bankAdvanced && this.pendingBankEdit) {
        this.commitBankName(modal);
        this.openChildModal('bank-advanced', null, bankAdvanced);
        return;
      }
      const bankModeButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-bank-fader-mode]') : null;
      if (kind === 'bank-advanced' && bankModeButton && this.pendingBankEdit) {
        const mode = bankModeButton.dataset.bankFaderMode;
        if (mode === 'default' || mode === 'master' || mode === 'bank' || mode === 'bank2') {
          this.setBankFaderMode(this.pendingBankEdit, mode, modal);
        }
        return;
      }
      const settingsModeButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-module-settings-mode]') : null;
      if (kind === 'module-settings' && moduleNumber !== null && settingsModeButton) {
        const mode = settingsModeButton.dataset.moduleSettingsMode;
        if (mode === 'default' || mode === 'user') this.setModuleSettingsMode(modal, moduleNumber, mode);
        return;
      }
      if (defaultSettingsTarget(target)) {
        this.showDefaultSettingsNotice(modal);
        return;
      }
      // Troca de página do Config.
      if (kind === 'module-settings' && moduleNumber !== null && target instanceof Element) {
        const pageButton = target.closest<HTMLButtonElement>('[data-module-settings-page]');
        const page = pageButton?.dataset.moduleSettingsPage;
        if (pageButton && isModuleSettingsPage(page)) {
          this.selectModuleSettingsPage(modal, moduleNumber, page);
          return;
        }
      }
      if ((kind === 'module-settings' || kind === 'module-synth' || kind === 'module-voice-mode')
          && moduleNumber !== null && target instanceof Element) {
        const noSens = target.closest<HTMLButtonElement>('[data-glide-no-sens]');
        if (noSens) {
          this.updateGlideSettings(moduleNumber, (settings) => {
            settings.noVelocitySensitivity = !readNoVelocitySensitivity(settings, moduleNumber === 8 ? 'synth' : 'module');
          });
          this.renderGlideCard(modal, moduleNumber);
          return;
        }
        const glideSync = target.closest<HTMLButtonElement>('[data-glide-sync]');
        if (glideSync) {
          this.toggleGlideSync(modal, moduleNumber);
          return;
        }
        if (target.closest('[data-glide-mode]')) {
          this.updateGlideSettings(moduleNumber, (settings) => {
            const nextMode = readGlideMode(settings) === 'portamento' ? 'auto' : 'portamento';
            settings.glideMode = nextMode;
            // Porta e Mono andam sempre juntos, nos dois sentidos: Porta liga
            // o Mono, Auto devolve pro Poly.
            settings.voiceMode = nextMode === 'portamento' ? 'mono' : 'poly';
          });
          this.renderGlideCard(modal, moduleNumber);
          this.syncVoiceModeFromGlideMode(modal, moduleNumber);
          return;
        }
        const glideConfig = target.closest<HTMLButtonElement>('[data-glide-config]');
        if (glideConfig) {
          this.openChildModal('glide-config', moduleNumber, glideConfig);
          return;
        }
        const legatoButton = target.closest<HTMLButtonElement>('[data-voice-mode-legato]');
        if (legatoButton) {
          this.updateGlideSettings(moduleNumber, (settings) => {
            settings.legato = !readLegato(settings);
          });
          this.renderGlideCard(modal, moduleNumber);
          this.markPlayerStateChanged();
          return;
        }
      }
      if (kind === 'module-settings' && moduleNumber !== null && target instanceof Element) {
        const modulationModeButton = target.closest<HTMLButtonElement>('[data-module-modulation-mode]');
        if (modulationModeButton) {
          if (this.suppressNextModuleModulationClick === modulationModeButton) {
            this.suppressNextModuleModulationClick = null;
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          const mode = modulationModeButton.dataset.moduleModulationMode;
          if (mode === 'user' || mode === 'rotary' || mode === 'lfo' || mode === 'tremolo' || mode === 'pan') {
            const nextMode = moduleNumber === 7 && mode === 'rotary'
              && readModuleModulationMode(this.getActivePresetState()?.modules[6]?.settings ?? {}) === 'rotary'
              ? 'user' : mode;
            this.selectModuleModulationMode(modal, moduleNumber, nextMode);
          }
          return;
        }
      }
      if (target instanceof Element && this.suppressNextCcControlClick?.contains(target)) {
        this.suppressNextCcControlClick = null;
        event.stopPropagation();
        return;
      }
      const rotaryToggleButton = kind === 'module-settings' && moduleNumber === 7 && target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-module-rotary-toggle]') : null;
      if (rotaryToggleButton) {
        this.toggleModuleRotarySpeed(modal);
        return;
      }
      const aboutTracksButton = kind === 'about' && target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-about-action="open-tracks"]')
        : null;
      if (aboutTracksButton) {
        const brand = this.root.querySelector<HTMLElement>('[data-action="open-about"]') ?? aboutTracksButton;
        this.openModal('tracks', null, brand);
        return;
      }
      const customSelectOption = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-app-select-value]')
        : null;
      if (customSelectOption) {
        const customSelect = customSelectOption.closest<HTMLElement>('.app-select');
        const select = customSelect?.parentElement?.querySelector<HTMLSelectElement>(APP_SELECT_QUERY);
        if (select && !customSelectOption.disabled) {
          select.value = customSelectOption.dataset.appSelectValue ?? '';
          this.syncAppSelect(select);
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        this.closeAppSelectMenus(modal);
        return;
      }
      const customSelectToggle = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-app-select-toggle]')
        : null;
      if (customSelectToggle) {
        const customSelect = customSelectToggle.closest<HTMLElement>('.app-select');
        const menu = customSelect?.querySelector<HTMLElement>('.app-select__menu');
        const opening = menu?.hidden ?? false;
        this.closeAppSelectMenus(modal);
        if (menu && opening) {
          menu.hidden = false;
          customSelectToggle.setAttribute('aria-expanded', 'true');
        }
        return;
      }
      this.closeAppSelectMenus(modal);
      const viewButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-setting-view]')
        : null;
      if (kind === 'app-settings' && viewButton) {
        const view = viewButton.dataset.settingView;
        if (view === 'keyboard' && this.suppressNextKeyboardViewClick) {
          this.suppressNextKeyboardViewClick = false;
          return;
        }
        if (view === 'presets' || view === 'keyboard') {
          this.selectBottomView(view, modal);
        }
        return;
      }
      const desktopKeyboardButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-desktop-keyboard-midi-slot]')
        : null;
      if (kind === 'app-settings' && desktopKeyboardButton) {
        const slot = Number(desktopKeyboardButton.dataset.desktopKeyboardMidiSlot);
        if (slot === 1 || slot === 2 || slot === 3) {
          this.keyboardMidiSlot = slot;
          this.syncKeyboardExpressionInput();
          for (const button of modal.querySelectorAll<HTMLButtonElement>('[data-desktop-keyboard-midi-slot]')) {
            const selected = Number(button.dataset.desktopKeyboardMidiSlot) === slot;
            button.classList.toggle('is-selected', selected);
            button.setAttribute('aria-pressed', String(selected));
          }
          this.markPlayerStateChanged();
        }
        return;
      }
      const settingsPageButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-settings-page]')
        : null;
      if (kind === 'app-settings' && settingsPageButton) {
        const page = settingsPageButton.dataset.settingsPage;
        if (page === 'midi') this.openChildModal('app-settings-midi', null, settingsPageButton);
        if (page === 'audio') this.openChildModal('app-settings-audio', null, settingsPageButton);
        return;
      }
      const keyboardMidiButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-keyboard-midi-slot]')
        : null;
      if (kind === 'keyboard-settings' && keyboardMidiButton) {
        const slot = Number(keyboardMidiButton.dataset.keyboardMidiSlot);
        if (slot === 1 || slot === 2 || slot === 3) this.selectKeyboardMidiSlot(modal, slot);
        return;
      }
      const keyboardStyleButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-keyboard-style]')
        : null;
      if ((kind === 'keyboard-settings' || kind === 'app-settings') && keyboardStyleButton) {
        const style = keyboardStyleButton.dataset.keyboardStyle;
        if (style === 'standard' || style === 'black' || style === 'hook') {
          this.selectKeyboardStyle(modal, style);
        }
        return;
      }
      const moduleSettingAction = target instanceof Element
        ? target.closest<HTMLButtonElement>('button[data-module-setting-action]')?.dataset.moduleSettingAction
        : null;
      if (kind === 'module-settings' && moduleSettingAction === 'open-eq' && moduleNumber !== null) {
        const button = target instanceof Element
          ? target.closest<HTMLButtonElement>('button[data-module-setting-action="open-eq"]')
          : null;
        if (button) this.openChildModal('module-eq', moduleNumber, button);
        return;
      }
      if (kind === 'module-settings' && moduleNumber !== null && moduleSettingAction) {
        if (moduleSettingAction === 'reset-module') {
          this.showModuleResetConfirmation(modal, moduleNumber);
          return;
        }
        if (moduleSettingAction === 'toggle-voice-mode' && moduleNumber >= 1 && moduleNumber <= 7) {
          // O toque longo já abriu o Legato/Portamento; o clique que vem
          // junto não deve alternar Mono/Poly por cima.
          if (this.suppressNextVoiceModeClick) {
            this.suppressNextVoiceModeClick = false;
            return;
          }
          const button = target instanceof Element
            ? target.closest<HTMLButtonElement>('button[data-module-setting-action="toggle-voice-mode"]')
            : null;
          if (button) this.toggleModuleVoiceMode(modal, button, moduleNumber);
          return;
        }
        const childKind = moduleSettingAction === 'open-compressor'
          ? 'module-compressor'
          : moduleSettingAction === 'open-arpeggiator'
            ? 'module-arpeggiator'
            : moduleSettingAction === 'open-trance-gate'
              ? 'module-trance-gate'
          : moduleSettingAction === 'open-synth'
            ? 'module-synth'
          : moduleSettingAction === 'open-rotary' && moduleNumber === 7
            ? 'module-rotary'
          : moduleSettingAction === 'open-chorus'
            ? 'module-chorus'
          : moduleSettingAction === 'open-reverb'
            ? 'module-reverb'
            : moduleSettingAction === 'open-delay' ? 'module-delay'
              : moduleSettingAction === 'open-polyphony' ? 'module-polyphony'
                : moduleSettingAction === 'open-velocity' ? 'module-velocity'
                  : moduleSettingAction === 'open-filter-velocity' ? 'module-filter-velocity' : null;
        const button = childKind && target instanceof Element
          ? target.closest<HTMLButtonElement>('button[data-module-setting-action]')
          : null;
        if (childKind && button) this.openChildModal(childKind, moduleNumber, button);
        if (childKind) return;
      }
      if (kind === 'module-synth' && moduleNumber === 8) {
        const voiceModeButton = target instanceof Element
          ? target.closest<HTMLButtonElement>('[data-synth-voice-mode]')
          : null;
        if (voiceModeButton) {
          this.toggleSynthMode(modal, voiceModeButton);
          return;
        }
        const presetButton = target instanceof Element
          ? target.closest<HTMLButtonElement>('[data-synth-preset]')
          : null;
        const synthPreset = Number(presetButton?.dataset.synthPreset);
        if (presetButton && Number.isInteger(synthPreset)) {
          if (this.suppressNextSynthPresetClick === synthPreset) {
            this.suppressNextSynthPresetClick = 0;
            return;
          }
          this.loadSynthPreset(modal, synthPreset);
          return;
        }
        const oscillatorTab = target instanceof Element
          ? target.closest<HTMLButtonElement>('[data-synth-oscillator-tab]') : null;
        if (oscillatorTab) {
          const selectedTab = Number(oscillatorTab.dataset.synthOscillatorTab);
          if (selectedTab >= 1 && selectedTab <= 3) {
            for (const button of modal.querySelectorAll<HTMLButtonElement>('[data-synth-oscillator-tab]')) {
              const selected = Number(button.dataset.synthOscillatorTab) === selectedTab;
              button.classList.toggle('is-selected', selected);
              button.setAttribute('aria-selected', String(selected));
            }
            for (const page of modal.querySelectorAll<HTMLElement>('[data-synth-oscillator-page]')) {
              const selected = Number(page.dataset.synthOscillatorPage) === selectedTab;
              page.hidden = !selected;
              page.classList.toggle('is-selected', selected);
            }
          }
          return;
        }
        const oscillatorPowerButton = target instanceof Element
          ? target.closest<HTMLButtonElement>('[data-synth-oscillator-power]')
          : null;
        const oscillatorPower = oscillatorPowerButton?.dataset.synthOscillatorPower;
        if (oscillatorPowerButton
            && (oscillatorPower === 'oscillator1Enabled' || oscillatorPower === 'oscillator2Enabled' || oscillatorPower === 'oscillator3Enabled')) {
          this.toggleSynthOscillator(oscillatorPowerButton, oscillatorPower);
          return;
        }
        const octaveButton = target instanceof Element
          ? target.closest<HTMLButtonElement>('[data-synth-octave]') : null;
        if (octaveButton) {
          const parameter = octaveButton.dataset.synthOctave;
          const direction = Number(octaveButton.dataset.synthOctaveDirection);
          if ((parameter === 'oscillator1Octave' || parameter === 'oscillator2Octave' || parameter === 'oscillator3Octave')
              && (direction === -1 || direction === 1)) {
            this.shiftSynthOctave(modal, parameter, direction);
          }
          return;
        }
        const oscillatorButton = target instanceof Element
          ? target.closest<HTMLButtonElement>('[data-synth-oscillator]')
          : null;
        if (oscillatorButton?.dataset.synthOscillator) {
          const [parameter, oscillator] = oscillatorButton.dataset.synthOscillator.split(':');
          if ((parameter === 'oscillator1' || parameter === 'oscillator2' || parameter === 'oscillator3')
              && (oscillator === 'sine' || oscillator === 'saw' || oscillator === 'square' || oscillator === 'triangle')) {
            this.selectSynthOscillator(modal, parameter, oscillator);
          }
          return;
        }
        const targetButton = target instanceof Element
          ? target.closest<HTMLButtonElement>('[data-synth-lfo-target]')
          : null;
        const lfoTarget = targetButton?.dataset.synthLfoTarget;
        if (targetButton && (lfoTarget === 'pitch' || lfoTarget === 'filter' || lfoTarget === 'volume')) {
          this.selectSynthLfoTarget(modal, lfoTarget);
          return;
        }
        const toggleButton = target instanceof Element
          ? target.closest<HTMLButtonElement>('[data-synth-toggle="legato"]')
          : null;
        if (toggleButton) {
          this.toggleSynthFlag(toggleButton);
          return;
        }
      }
      if (pageKind() === 'module-arpeggiator' && moduleNumber !== null) {
        const modeButton = target instanceof Element
          ? target.closest<HTMLButtonElement>('[data-arpeggiator-mode]')
          : null;
        const mode = modeButton?.dataset.arpeggiatorMode;
        if (modeButton && isArpeggiatorModeValue(mode)) {
          this.selectArpeggiatorMode(modal, moduleNumber, mode);
          return;
        }
        const divisionButton = target instanceof Element
          ? target.closest<HTMLButtonElement>('[data-arpeggiator-division]')
          : null;
        const division = divisionButton?.dataset.arpeggiatorDivision;
        if (divisionButton && isArpeggiatorDivisionValue(division)) {
          this.selectArpeggiatorDivision(modal, moduleNumber, division);
          return;
        }
        const octavesButton = target instanceof Element
          ? target.closest<HTMLButtonElement>('[data-arpeggiator-octaves]')
          : null;
        if (octavesButton) {
          this.selectArpeggiatorOctaves(modal, moduleNumber, Number(octavesButton.dataset.arpeggiatorOctaves));
          return;
        }
      }
      if (pageKind() === 'module-trance-gate' && moduleNumber !== null) {
        const gateStep = target instanceof Element ? target.closest<HTMLButtonElement>('[data-trance-gate-step]') : null;
        if (gateStep) { this.toggleTranceGateStep(gateStep, moduleNumber); return; }
        const gateDivision = target instanceof Element ? target.closest<HTMLButtonElement>('[data-trance-gate-division]') : null;
        if (gateDivision) { this.setTranceGateOption(modal, moduleNumber, 'division', gateDivision.dataset.tranceGateDivision ?? ''); return; }
        if (target instanceof Element && target.closest('[data-trance-gate-sync]')) {
          this.toggleTranceGateSync(modal, moduleNumber);
          return;
        }
        const gateLength = target instanceof Element ? target.closest<HTMLButtonElement>('[data-trance-gate-length]') : null;
        if (gateLength) { this.setTranceGateOption(modal, moduleNumber, 'length', gateLength.dataset.tranceGateLength ?? ''); return; }
      }
      if (kind === 'glide-config' && moduleNumber !== null && target instanceof Element) {
        const power = target.closest('[data-glide-velocity-power]');
        const invert = target.closest('[data-glide-velocity-invert]');
        if (power || invert) {
          this.updateGlideVelocity(modal, moduleNumber, (settings) => {
            if (power) settings.glideVelocityEnabled = !readGlideVelocity(settings).enabled;
            else settings.glideVelocityInverted = !readGlideVelocity(settings).inverted;
          });
          return;
        }
      }
      const velocityModeButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-velocity-mode-option]')
        : null;
      if ((kind === 'module-velocity' || kind === 'module-filter-velocity') && moduleNumber !== null && velocityModeButton) {
        const mode = velocityModeButton.dataset.velocityModeOption;
        if (isVelocityCurveMode(mode)) this.selectModuleVelocityMode(
          modal, moduleNumber, mode,
          kind === 'module-filter-velocity' ? 'filterVelocityCurve' : 'velocityCurve',
        );
        return;
      }
      const effectPowerButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-module-effect-power]')
        : null;
      if (
        moduleNumber !== null
        && (pageKind() === 'module-eq' || pageKind() === 'module-compressor' || pageKind() === 'module-reverb' || pageKind() === 'module-delay' || pageKind() === 'module-rotary' || pageKind() === 'module-chorus' || pageKind() === 'module-arpeggiator' || pageKind() === 'module-trance-gate' || pageKind() === 'module-env-filter' || kind === 'module-organ')
        && effectPowerButton
      ) {
        this.toggleModuleEffectPower(effectPowerButton, moduleNumber);
        return;
      }
      const autoFaderButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-arpeggiator-auto-fader]') : null;
      if (pageKind() === 'module-arpeggiator' && moduleNumber !== null && autoFaderButton) {
        this.selectArpeggiatorAutoFader(modal, moduleNumber, autoFaderButton.dataset.arpeggiatorAutoFader ?? '');
        return;
      }
      const reverbSpaceButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-module-reverb-space]') : null;
      if (pageKind() === 'module-reverb' && moduleNumber !== null && reverbSpaceButton) {
        this.selectReverbSpace(modal, moduleNumber, reverbSpaceButton.dataset.moduleReverbSpace);
        return;
      }
      const cutoffConfigTabButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-cutoff-config-tab]') : null;
      if ((kind === 'module-filter-velocity' || kind === 'module-env-filter') && moduleNumber !== null && cutoffConfigTabButton) {
        const targetKind = cutoffConfigTabButton.dataset.cutoffConfigTab === 'env-filter'
          ? 'module-env-filter' : 'module-filter-velocity';
        if (targetKind !== kind) this.openModal(targetKind, moduleNumber, cutoffConfigTabButton, true);
        return;
      }
      const cutoffFilterTypeButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-cutoff-filter-type]') : null;
      if (kind === 'module-env-filter' && moduleNumber !== null && cutoffFilterTypeButton) {
        this.selectCutoffFilterType(modal, moduleNumber, cutoffFilterTypeButton.dataset.cutoffFilterType);
        return;
      }
      const rotarySpeedButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-module-rotary-speed]') : null;
      if ((pageKind() === 'module-rotary' || kind === 'module-organ') && moduleNumber === 7 && rotarySpeedButton) {
        this.selectModuleRotarySpeed(modal, rotarySpeedButton);
        return;
      }
      const delayDivisionButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-module-delay-division]')
        : null;
      if (pageKind() === 'module-delay' && moduleNumber !== null && delayDivisionButton) {
        this.selectModuleDelayDivision(modal, delayDivisionButton, moduleNumber);
        return;
      }
      const delaySyncButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-module-delay-sync]')
        : null;
      if (pageKind() === 'module-delay' && moduleNumber !== null && delaySyncButton) {
        this.toggleModuleDelaySync(modal, delaySyncButton, moduleNumber);
        return;
      }
      const eqTypeButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('button[data-module-eq-type]')
        : null;
      if (pageKind() === 'module-eq' && moduleNumber !== null && eqTypeButton) {
        this.handleModuleEqTypeButton(eqTypeButton, moduleNumber);
        return;
      }
      const effectColorButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('button[data-effect-color-index]')
        : null;
      if (kind === 'effect-pad' && effectColorButton) {
        this.selectEffectPadColor(modal, effectColorButton);
        return;
      }
      const effectModeButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('button[data-effect-mode]')
        : null;
      if (kind === 'effect-pad' && effectModeButton) {
        this.selectEffectMode(modal, effectModeButton);
        return;
      }
      const effectGateButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('button[data-effect-gate-release]')
        : null;
      if (kind === 'effect-pad' && effectGateButton) {
        this.selectEffectGateRelease(modal, effectGateButton);
        return;
      }
      const metronomeSoundButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('button[data-metronome-sound]')
        : null;
      if (kind === 'metronome' && metronomeSoundButton) {
        const sound = Number(metronomeSoundButton.dataset.metronomeSound);
        if (sound === 1 || sound === 2 || sound === 3) {
          this.metronome.setClickSound(sound);
          for (const option of modal.querySelectorAll<HTMLButtonElement>('[data-metronome-sound]')) {
            option.classList.toggle('is-selected', option === metronomeSoundButton);
          }
          this.markPlayerStateChanged();
        }
        return;
      }
      const userSoundfontNameField = target instanceof Element
        ? target.closest<HTMLElement>('[data-user-sf2-name-field]')
        : null;
      const userSoundfontInlineKey = target instanceof Element
        ? target.closest<HTMLButtonElement>('.user-sf2-name button[data-on-screen-key]')
        : null;
      if (kind === 'sound-selection' && userSoundfontNameField) {
        this.setUserSoundfontKeyboardOpen(modal, true, userSoundfontNameField);
        return;
      }
      if (kind === 'sound-selection' && !userSoundfontInlineKey) {
        this.setUserSoundfontKeyboardOpen(modal, false);
      }
      const userSoundfontRemoveChoice = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-user-sf2-remove-choice]')
        : null;
      if (kind === 'sound-selection' && userSoundfontRemoveChoice) {
        const confirmation = userSoundfontRemoveChoice.closest<HTMLElement>('[data-user-sf2-remove-confirmation]');
        if (userSoundfontRemoveChoice.dataset.userSf2RemoveChoice === 'confirm') {
          const id = confirmation?.dataset.userSoundfontId;
          if (id) void this.removeUserSoundfont(modal, id, userSoundfontRemoveChoice);
        } else {
          confirmation?.remove();
        }
        return;
      }
      const categoryButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('button[data-sound-category]')
        : null;
      if (categoryButton && moduleNumber !== null) {
        const category = categoryButton.dataset.soundCategory;
        if (typeof category === 'string' && category.length > 0) {
          this.selectSoundCategory(modal, moduleNumber, category);
        }
        return;
      }

      if (kind === 'sound-selection' && moduleNumber !== null &&
          target instanceof Element && target.closest('[data-sound-clean]')) {
        void this.clearModuleTimbre(moduleNumber);
        return;
      }

      const fixedSoundButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('button[data-fixed-sound-id]')
        : null;
      if (kind === 'sound-selection' && moduleNumber !== null && fixedSoundButton) {
        if (this.suppressNextFixedSoundClick) {
          this.suppressNextFixedSoundClick = false;
          return;
        }
        const soundId = fixedSoundButton.dataset.fixedSoundId;
        if (!soundId) return;
        // A fila já é o estado desse timbre. Não reabre a tela de download ao
        // tocar em um item que está baixando ou aguardando.
        if (this.activeSoundDownloads.has(soundId)) return;
        this.markSoundSeen(soundId, fixedSoundButton, modal);
        if (this.installedFixedSoundIds.has(soundId)) {
          void this.selectFixedSound(moduleNumber, soundId, fixedSoundButton);
        } else {
          this.selectedCatalogSoundId = soundId;
          this.openChildModal('sound-download', moduleNumber, fixedSoundButton);
        }
        return;
      }

      const userSoundfontKeyButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('button[data-on-screen-key]')
        : null;
      if (kind === 'sound-selection' && userSoundfontKeyButton?.dataset.onScreenKey) {
        const key = resolveOnScreenKey(userSoundfontKeyButton, userSoundfontKeyButton.dataset.onScreenKey);
        if (key === 'enter') {
          this.setUserSoundfontKeyboardOpen(modal, false);
          this.handleUserSoundfontAction(modal, 'choose-file');
        }
        else if (key) this.updateUserSoundfontName(modal, key);
        return;
      }

      const userProfileAction = target instanceof Element
        ? target.closest<HTMLButtonElement>('button[data-user-profile-action]')?.dataset.userProfileAction
        : null;
      if (kind === 'user' && userProfileAction === 'choose-photo') {
        modal.querySelector<HTMLInputElement>('[data-user-profile-file]')?.click();
        return;
      }
      if (kind === 'user' && userProfileAction === 'edit-name') {
        const button = target instanceof Element ? target.closest<HTMLButtonElement>('[data-user-profile-action="edit-name"]') : null;
        if (button) this.openChildModal('user-name', null, button);
        return;
      }

      const userSoundfontAction = target instanceof Element
        ? target.closest<HTMLButtonElement>('button[data-user-sf2-action]')?.dataset.userSf2Action
        : null;
      if (kind === 'sound-selection' && userSoundfontAction) {
        this.handleUserSoundfontAction(modal, userSoundfontAction);
        return;
      }

      const userSoundfontButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('button[data-user-soundfont-id]')
        : null;
      if (kind === 'sound-selection' && moduleNumber !== null && userSoundfontButton) {
        void this.selectUserSoundfont(moduleNumber, userSoundfontButton);
        return;
      }

      const missingUserSoundfontButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('button[data-missing-user-soundfont-id]')
        : null;
      if (kind === 'sound-selection' && missingUserSoundfontButton) {
        const input = modal.querySelector<HTMLInputElement>('[data-user-sf2-file]');
        const id = missingUserSoundfontButton.dataset.missingUserSoundfontId;
        const name = missingUserSoundfontButton.dataset.missingUserSoundfontName;
        if (input && id && name) {
          input.accept = Capacitor.isNativePlatform() ? 'application/octet-stream,.sf2' : '.sf2';
          input.dataset.restoreSoundfontId = id;
          input.dataset.soundfontName = name;
          input.click();
        }
        return;
      }

      const modalAction = target instanceof Element
        ? target.closest<HTMLButtonElement>('button[data-modal-action]')?.dataset.modalAction
        : null;
      if (kind === 'sound-selection' && modalAction === 'download-all-sounds') {
        const button = target instanceof Element ? target.closest<HTMLButtonElement>('button') : null;
        if (button) void this.showDownloadAllConfirmation(modal, button);
        return;
      }
      if (kind === 'sound-selection' && modalAction === 'delete-all-sounds') {
        this.showDeleteAllConfirmation(modal);
        return;
      }
      const deleteAllChoice = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-delete-all-choice]')?.dataset.deleteAllChoice
        : null;
      if (kind === 'sound-selection' && deleteAllChoice) {
        const confirmation = modal.querySelector<HTMLElement>('[data-delete-all-confirmation]');
        if (deleteAllChoice === 'confirm') {
          const button = modal.querySelector<HTMLButtonElement>('[data-modal-action="delete-all-sounds"]');
          confirmation?.remove();
          if (button) void this.deleteAllOfficialSounds(modal, button);
        } else {
          confirmation?.remove();
        }
        return;
      }
      const downloadAllChoice = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-download-all-choice]')?.dataset.downloadAllChoice
        : null;
      if (kind === 'sound-selection' && downloadAllChoice) {
        const confirmation = modal.querySelector<HTMLElement>('[data-download-all-confirmation]');
        if (downloadAllChoice === 'confirm') {
          const button = modal.querySelector<HTMLButtonElement>('[data-modal-action="download-all-sounds"]');
          confirmation?.remove();
          if (button) void this.downloadAllOfficialSounds(modal, button);
        } else {
          confirmation?.remove();
        }
        return;
      }
      if (kind === 'module-synth' && modalAction === 'reset-synth-preset') {
        this.showSynthPresetResetConfirmation(modal);
        return;
      }
      const synthResetChoice = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-synth-reset-choice]')?.dataset.synthResetChoice
        : null;
      if (kind === 'module-synth' && synthResetChoice) {
        if (synthResetChoice === 'confirm') this.resetSynthPresetToFactory(modal);
        else modal.querySelector('[data-synth-reset-confirmation]')?.remove();
        return;
      }
      if (moduleNumber !== null && modalAction === 'reset-processor') {
        const requested = target instanceof Element
          ? target.closest<HTMLElement>('[data-reset-processor]')?.dataset.resetProcessor
          : undefined;
        const processor = requested === 'eq' || requested === 'envelope' || isModuleEffectKind(requested)
          ? requested : processorKind;
        if (processor) {
          this.showProcessorResetConfirmation(modal, moduleNumber, processor);
          return;
        }
      }
      const moduleResetChoice = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-module-reset-choice]')?.dataset.moduleResetChoice
        : null;
      if (kind === 'module-settings' && moduleNumber !== null && moduleResetChoice) {
        if (moduleResetChoice === 'confirm') this.confirmModuleReset(moduleNumber);
        else modal.querySelector('[data-module-reset-confirmation]')?.remove();
        return;
      }
      const processorResetChoice = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-processor-reset-choice]')?.dataset.processorResetChoice
        : null;
      if (processorResetChoice && moduleNumber !== null) {
        // No Config em páginas, processorKind não segue a aba (fica preso ao
        // "kind" do modal, sempre 'module-settings'): o processador certo é o
        // que ficou guardado na própria confirmação ao abrir.
        const confirmationProcessor = target instanceof Element
          ? target.closest<HTMLElement>('[data-processor-reset-confirmation]')?.dataset.processorResetConfirmation
          : undefined;
        const processor = confirmationProcessor === 'eq' || confirmationProcessor === 'envelope'
          || isModuleEffectKind(confirmationProcessor)
          ? confirmationProcessor : processorKind;
        if (processor) {
          if (processorResetChoice === 'confirm') this.confirmProcessorReset(moduleNumber, processor);
          else modal.querySelector('[data-processor-reset-confirmation]')?.remove();
          return;
        }
      }
      if (modalAction === 'learn-preset-cc' && kind === 'preset-name' && moduleNumber !== null) {
        this.commitPresetName(modal, moduleNumber);
        const button = target instanceof Element
          ? target.closest<HTMLButtonElement>('button[data-modal-action="learn-preset-cc"]')
          : null;
        if (button) {
          this.openCcLearn(
            { kind: 'preset', bank: this.activeBank, presetNumber: moduleNumber },
            button,
          );
        }
        return;
      }
      if (modalAction === 'learn-synth-preset-cc' && kind === 'synth-preset-name' && moduleNumber !== null) {
        this.commitSynthPresetName(modal, moduleNumber);
        const button = target instanceof Element
          ? target.closest<HTMLButtonElement>('[data-modal-action="learn-synth-preset-cc"]') : null;
        if (button) this.openCcLearn({ kind: 'synth-preset', presetNumber: moduleNumber }, button);
        return;
      }
      if (modalAction === 'learn-effect-cc' && kind === 'effect-pad' && moduleNumber !== null) {
        this.commitEffectPad(modal, moduleNumber);
        const button = target instanceof Element
          ? target.closest<HTMLButtonElement>('[data-modal-action="learn-effect-cc"]')
          : null;
        if (button) {
          this.openCcLearn(
            { kind: 'effect', bank: this.activeEffectBank, effectNumber: moduleNumber },
            button,
          );
        }
        return;
      }
      if (modalAction === 'clean-preset-cc' && kind === 'preset-name' && moduleNumber !== null) {
        this.commitPresetName(modal, moduleNumber);
        const button = target instanceof Element
          ? target.closest<HTMLButtonElement>('[data-modal-action="clean-preset-cc"]') : null;
        if (button) {
          this.pendingCcClear = { kind: 'preset', bank: this.activeBank, presetNumber: moduleNumber };
          this.openChildModal('cc-clear-confirm', null, button);
        }
        return;
      }
      if (modalAction === 'clean-synth-preset-cc' && kind === 'synth-preset-name' && moduleNumber !== null) {
        this.commitSynthPresetName(modal, moduleNumber);
        const button = target instanceof Element
          ? target.closest<HTMLButtonElement>('[data-modal-action="clean-synth-preset-cc"]') : null;
        if (button) {
          this.pendingCcClear = { kind: 'synth-preset', presetNumber: moduleNumber };
          this.openChildModal('cc-clear-confirm', null, button);
        }
        return;
      }
      if (modalAction === 'clean-effect-cc' && kind === 'effect-pad' && moduleNumber !== null) {
        this.commitEffectPad(modal, moduleNumber);
        const button = target instanceof Element
          ? target.closest<HTMLButtonElement>('[data-modal-action="clean-effect-cc"]') : null;
        if (button) {
          this.pendingCcClear = { kind: 'effect', bank: this.activeEffectBank, effectNumber: moduleNumber };
          this.openChildModal('cc-clear-confirm', null, button);
        }
        return;
      }
      if (modalAction === 'learn-tempo-cc' && kind === 'tempo-edit') {
        this.commitTempo(modal);
        const button = target instanceof Element
          ? target.closest<HTMLButtonElement>('[data-modal-action="learn-tempo-cc"]')
          : null;
        if (button) this.openCcLearn({ kind: 'tap-tempo' }, button);
        return;
      }
      if (modalAction === 'clean-tempo-cc' && kind === 'tempo-edit') {
        const button = target instanceof Element
          ? target.closest<HTMLButtonElement>('[data-modal-action="clean-tempo-cc"]') : null;
        if (button) {
          this.pendingCcClear = { kind: 'tap-tempo' };
          this.openChildModal('cc-clear-confirm', null, button);
        }
        return;
      }
      if (modalAction === 'learn-metronome-cc' && kind === 'metronome') {
        const button = target instanceof Element
          ? target.closest<HTMLButtonElement>('[data-modal-action="learn-metronome-cc"]') : null;
        if (button) this.openCcLearn({ kind: 'metronome-toggle' }, button);
        return;
      }
      if (modalAction === 'clean-metronome-cc' && kind === 'metronome') {
        const button = target instanceof Element
          ? target.closest<HTMLButtonElement>('[data-modal-action="clean-metronome-cc"]') : null;
        if (button) {
          this.pendingCcClear = { kind: 'metronome-toggle' };
          this.openChildModal('cc-clear-confirm', null, button);
        }
        return;
      }
      if (kind === 'cc-learn' && modalAction === 'toggle-cc-invert' && this.pendingCcLearn &&
          isContinuousCcTarget(this.pendingCcLearn)) {
        this.pendingCcInverted = !this.pendingCcInverted;
        const button = target instanceof Element
          ? target.closest<HTMLButtonElement>('[data-modal-action="toggle-cc-invert"]') : null;
        button?.classList.toggle('is-selected', this.pendingCcInverted);
        button?.setAttribute('aria-pressed', String(this.pendingCcInverted));
        return;
      }
      if (kind === 'cc-learn' && modalAction === 'open-cc-clear' && this.pendingCcLearn) {
        this.pendingCcClear = this.pendingCcLearn;
        this.openChildModal('cc-clear-confirm', null,
          target instanceof HTMLElement ? target : this.modal ?? this.root);
        return;
      }
      if (kind === 'cc-learn' && modalAction === 'confirm-cc-learn') {
        if (this.pendingCcLearn && this.pendingCcController !== null) {
          // Um CC comanda um unico controle: ao confirmar no novo alvo, ele
          // deixa qualquer alvo anterior que usava o mesmo numero.
          const pendingKey = this.ccMappingKeyForTarget(this.pendingCcLearn);
          for (const [targetKey, controller] of this.ccMappings) {
            if (controller === this.pendingCcController && targetKey !== pendingKey
                && ccMappingConflictScope(targetKey) === ccMappingConflictScope(pendingKey)) {
              this.ccMappings.delete(targetKey);
              this.ccMappingOptions.delete(targetKey);
            }
          }
          this.ccMappings.set(pendingKey, this.pendingCcController);
          if (isContinuousCcTarget(this.pendingCcLearn)) {
            this.ccMappingOptions.set(pendingKey, {
              inverted: this.pendingCcInverted,
              limitPercent: this.pendingCcLimitPercent,
            });
          } else this.ccMappingOptions.delete(pendingKey);
          this.markPlayerStateChanged(false);
        }
        if (this.modalHistory.length > 0) this.returnToPreviousModal();
        else this.closeModal();
        return;
      }
      if (kind === 'preset-paste-confirm' && modalAction === 'cancel-preset-paste') {
        this.closeModal();
        this.renderPresetCopyButton();
        return;
      }
      if (kind === 'preset-paste-confirm' && modalAction === 'confirm-preset-paste') {
        this.closeModal(false);
        this.pastePresetClipboard();
        return;
      }
      if (kind === 'module-config-copy-confirm' && modalAction === 'confirm-module-config-copy'
          && moduleNumber !== null && this.moduleConfigCopySource !== null) {
        const sourceNumber = this.moduleConfigCopySource;
        this.closeModal(false);
        this.copyModuleConfiguration(sourceNumber, moduleNumber);
        return;
      }
      if (kind === 'cc-clear-confirm' && modalAction === 'cancel-cc-clear') {
        this.leaveCcClearConfirmation();
        return;
      }
      if (kind === 'cc-clear-confirm' && modalAction === 'confirm-cc-clear') {
        if (this.pendingCcClear) {
          const key = this.ccMappingKeyForTarget(this.pendingCcClear);
          this.ccMappings.delete(key);
          this.ccMappingOptions.delete(key);
          this.markPlayerStateChanged(false);
        }
        this.leaveCcClearConfirmation();
        return;
      }
      if (kind === 'sound-download' && modalAction === 'preview-sound') {
        const button = target instanceof Element ? target.closest<HTMLButtonElement>('button') : null;
        if (button) void this.toggleSoundPreview(button);
        return;
      }
      if (kind === 'sound-download' && modalAction === 'download-sound' && moduleNumber !== null) {
        const button = target instanceof Element ? target.closest<HTMLButtonElement>('button') : null;
        if (button) void this.downloadSelectedSound(modal, moduleNumber, button);
        return;
      }
      if (kind === 'sound-download' && modalAction === 'uninstall-sound') {
        const button = target instanceof Element ? target.closest<HTMLButtonElement>('button') : null;
        if (button) void this.uninstallSelectedSound(button);
        return;
      }
      if (kind === 'performance-download' && modalAction === 'download-performance') {
        const button = target instanceof Element ? target.closest<HTMLButtonElement>('button') : null;
        if (button) void this.downloadSelectedPerformanceAsset(button);
        return;
      }
      if (kind === 'backup-download' && modalAction === 'skip-backup-download') {
        this.returnToPreviousModal();
        return;
      }
      if (kind === 'backup-download' && modalAction === 'download-backup-sounds') {
        const button = target instanceof Element ? target.closest<HTMLButtonElement>('button') : null;
        if (button) void this.downloadBackupSounds(modal, button);
        return;
      }
      if (kind === 'effect-pad' && modalAction === 'toggle-effect-mode-options') {
        const options = modal.querySelector<HTMLElement>('[data-effect-mode-options]');
        if (options) options.hidden = !options.hidden;
        return;
      }
      if (kind === 'effect-pad' && modalAction === 'choose-effect-audio') {
        modal.querySelector<HTMLInputElement>('[data-effect-audio-file]')?.click();
        return;
      }
      if (kind === 'compatibility-mode' && modalAction === 'open-compatibility-video') {
        if (this.compatibilityVideoUrl) window.open(this.compatibilityVideoUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      if (kind === 'compatibility-mode' && modalAction === 'cancel-compatibility') {
        this.pendingCompatibilityMode = null;
        this.returnToPreviousModal();
        return;
      }
      if (kind === 'compatibility-mode' && modalAction === 'apply-compatibility') {
        if (this.pendingCompatibilityMode !== null) {
          this.compatibilityMode = this.pendingCompatibilityMode;
          this.midiInput.setCompatibilityMode(this.compatibilityMode);
          // A entrada MIDI nativa alimenta o DSP diretamente antes de avisar a
          // interface. Portanto, atualizar apenas o filtro da interface deixa
          // o motor usando o modo anterior até a próxima reinicialização do
          // áudio. Propague a escolha imediatamente para todas as plataformas.
          void hookKeysNative.setCompatibilityMode(this.compatibilityMode).catch(() => undefined);
          this.pendingCompatibilityMode = null;
          this.markPlayerStateChanged();
        }
        this.returnToPreviousModal();
        return;
      }
      if (kind === 'metronome' && modalAction === 'toggle-metronome-accent') {
        this.metronome.setAccentEnabled(!this.metronome.isAccentEnabled());
        const button = target instanceof Element ? target.closest<HTMLButtonElement>('button') : null;
        button?.classList.toggle('is-selected', this.metronome.isAccentEnabled());
        button?.setAttribute('aria-pressed', String(this.metronome.isAccentEnabled()));
        this.markPlayerStateChanged();
        return;
      }
      if (kind === 'metronome' && modalAction === 'toggle-metronome-double') {
        this.metronome.setDoubleTimeEnabled(!this.metronome.isDoubleTimeEnabled());
        const button = target instanceof Element ? target.closest<HTMLButtonElement>('button') : null;
        button?.classList.toggle('is-selected', this.metronome.isDoubleTimeEnabled());
        button?.setAttribute('aria-pressed', String(this.metronome.isDoubleTimeEnabled()));
        this.markPlayerStateChanged();
        return;
      }
      if (kind === 'user-name' && modalAction === 'save-user-name') {
        const button = target instanceof Element ? target.closest<HTMLButtonElement>('button') : null;
        if (button) void this.saveUserProfileName(modal, button);
        return;
      }
      if (kind === 'user' && modalAction === 'cancel-user-photo') {
        this.closeUserProfilePhotoPreview(modal, true);
        return;
      }
      if (kind === 'user' && modalAction === 'save-user-photo') {
        const button = target instanceof Element ? target.closest<HTMLButtonElement>('button') : null;
        if (button) void this.saveUserProfilePhoto(modal, button);
        return;
      }
      if (kind === 'track-position' && modalAction === 'play-track-position') {
        void this.trackTransport?.playFromCurrentPosition();
        this.closeModal();
        return;
      }
      if (modalAction === 'confirm' || modalAction === 'cancel') {
        if (modalAction === 'cancel' && kind === 'password-reset') {
          if (this.modalHistory.length > 0) this.returnToPreviousModal();
          else this.closeModal();
          return;
        }
        if (modalAction === 'confirm' && kind === 'preset-name' && moduleNumber !== null) {
          this.commitPresetName(modal, moduleNumber);
        }
        if (modalAction === 'confirm' && kind === 'synth-preset-name' && moduleNumber !== null) {
          this.commitSynthPresetName(modal, moduleNumber);
        }
        if (modalAction === 'confirm' && kind === 'bank-name') this.commitBankName(modal);
        if (modalAction === 'confirm' && kind === 'effect-bank-name') this.commitEffectBankName(modal);
        if (modalAction === 'confirm' && kind === 'effect-pad' && moduleNumber !== null) {
          this.commitEffectPad(modal, moduleNumber);
        }
        if (modalAction === 'confirm' && kind === 'tempo-edit') this.commitTempo(modal);
        if (modalAction === 'confirm' && kind === 'module-polyphony' && moduleNumber !== null) {
          this.commitModulePolyphony(modal, moduleNumber);
        }
        if ((modalAction === 'cancel' || modalAction === 'confirm') && ((kind === 'bank-advanced' || kind === 'synth-preset-name' || kind === 'module-polyphony' || kind === 'module-velocity' || kind === 'module-filter-velocity' || kind === 'module-env-filter' || kind === 'glide-config' || kind === 'module-voice-mode' || kind === 'module-arpeggiator' || kind === 'module-trance-gate' || kind === 'module-synth' || kind === 'module-rotary') || (modalAction === 'cancel' && (kind === 'user-name' || kind === 'sound-download' || kind === 'cc-learn' || kind === 'keyboard-settings' || kind === 'app-settings-midi' || kind === 'app-settings-audio' || kind === 'module-eq' || kind === 'module-compressor' || kind === 'module-reverb' || kind === 'module-delay' || kind === 'module-chorus'))) && this.modalHistory.length > 0) {
          this.returnToPreviousModal();
        } else {
          this.closeModal();
        }
        return;
      }

      if (modalAction === 'show-devices') {
        modal.dataset.showDevices = 'true';
        if (target instanceof Element) target.closest<HTMLButtonElement>('button')?.setAttribute('hidden', '');
        const deviceList = modal.querySelector<HTMLElement>('.user-device-list');
        if (deviceList) deviceList.hidden = false;
        return;
      }

      if (kind === 'user' && modalAction === 'make-backup') {
        const button = target instanceof Element ? target.closest<HTMLButtonElement>('button') : null;
        if (button) void this.makePlayerBackup(modal, button);
        return;
      }

      if (kind === 'user' && modalAction === 'restore-backup') {
        const input = modal.querySelector<HTMLInputElement>('[data-player-backup-file]');
        if (input) {
          input.value = '';
          input.click();
        }
        return;
      }

      if (kind === 'user' && modalAction === 'reset-password') {
        const button = target instanceof Element ? target.closest<HTMLButtonElement>('button') : null;
        if (button) void this.beginPasswordReset(button);
        return;
      }

      if (kind === 'password-reset' && modalAction === 'save-password-reset') {
        const button = target instanceof Element ? target.closest<HTMLButtonElement>('button') : null;
        if (button) void this.saveNewPassword(modal, button);
        return;
      }

      if (modalAction === 'acquire-license') {
        const button = target instanceof Element ? target.closest<HTMLButtonElement>('button') : null;
        const url = button?.dataset.purchaseUrl;
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }

      if (modalAction === 'open-support') {
        const button = target instanceof Element ? target.closest<HTMLButtonElement>('button') : null;
        const url = button?.dataset.supportUrl;
        if (url) void openWhatsAppSupport(url);
        return;
      }

      const removeDeviceButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-remove-device]')
        : null;
      if (kind === 'user' && removeDeviceButton?.dataset.removeDevice) {
        void this.requestUserDeviceRemoval(modal, removeDeviceButton.dataset.removeDevice, removeDeviceButton);
        return;
      }

      const confirmRemovalButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-confirm-device-removal]')
        : null;
      if (kind === 'user' && confirmRemovalButton?.dataset.confirmDeviceRemoval) {
        void this.confirmUserDeviceRemoval(
          modal,
          confirmRemovalButton.dataset.confirmDeviceRemoval,
          confirmRemovalButton,
        );
      }
    });
    // Config troca as abas dentro deste mesmo modal. Registre o arrasto desde
    // a abertura; fora da aba EQ nao existem handles e o handler nao age.
    if ((kind === 'module-settings' || pageKind() === 'module-eq') && moduleNumber !== null) {
      modal.addEventListener('pointerdown', (event) => this.startEqBandDrag(event, moduleNumber));
      modal.addEventListener('pointermove', (event) => this.moveEqBandDrag(event));
      modal.addEventListener('pointerup', (event) => this.endEqBandDrag(event));
      modal.addEventListener('pointercancel', (event) => this.endEqBandDrag(event));
    }
    if (kind === 'module-filter-velocity' && moduleNumber !== null) {
      modal.querySelector<HTMLButtonElement>('[data-filter-velocity-power]')?.addEventListener('click', (event) => {
        event.stopPropagation();
        this.toggleFilterVelocity(modal, moduleNumber);
      });
    }
    if ((kind === 'module-velocity' || kind === 'module-filter-velocity') && moduleNumber !== null) {
      const velocitySettingKey = kind === 'module-filter-velocity' ? 'filterVelocityCurve' : 'velocityCurve';
      for (const button of modal.querySelectorAll<HTMLButtonElement>('[data-velocity-mode-option]')) {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          const mode = button.dataset.velocityModeOption;
          if (isVelocityCurveMode(mode)) this.selectModuleVelocityMode(modal, moduleNumber, mode, velocitySettingKey);
        });
      }
      const fixedInput = modal.querySelector<HTMLInputElement>('[data-velocity-fixed-value]');
      fixedInput?.addEventListener('input', (event) => {
        event.stopPropagation();
        this.setFixedModuleVelocity(modal, moduleNumber, Number(fixedInput.value), velocitySettingKey);
      });
      fixedInput?.addEventListener('change', (event) => {
        event.stopPropagation();
        this.setFixedModuleVelocity(modal, moduleNumber, Number(fixedInput.value), velocitySettingKey);
        this.markPlayerStateChanged();
      });
      modal.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        const target = event.target instanceof Element ? event.target : null;
        const plot = target?.closest<HTMLElement>('[data-velocity-curve-plot]');
        const editor = plot?.closest<HTMLElement>('.velocity-curve-editor');
        if (!plot || editor?.dataset.velocityMode !== 'user') return;
        // O primeiro e o último ponto ficam nos cantos e a borda da curva corta
        // quase todo o círculo: tocar só nele era impossível. Qualquer toque na
        // curva pega o ponto mais próximo na horizontal (5 faixas iguais).
        const handle = target?.closest<SVGCircleElement>('[data-velocity-point]');
        const bounds = plot.getBoundingClientRect();
        const pointIndex = handle
          ? Number(handle.dataset.velocityPoint)
          : Math.round(Math.min(1, Math.max(0, (event.clientX - bounds.left) / Math.max(1, bounds.width))) * 4);
        if (!Number.isInteger(pointIndex)) return;
        event.preventDefault();
        capturePointer(plot, event.pointerId);
        velocityCurveDrag = { pointerId: event.pointerId, pointIndex, plot };
        this.setModuleVelocityPoint(modal, moduleNumber, pointIndex, event.clientY, false, velocitySettingKey);
      });
      modal.addEventListener('pointermove', (event) => {
        if (velocityCurveDrag?.pointerId !== event.pointerId) return;
        event.preventDefault();
        this.setModuleVelocityPoint(modal, moduleNumber, velocityCurveDrag.pointIndex, event.clientY, false, velocitySettingKey);
      });
      const endVelocityDrag = (event: PointerEvent) => {
        if (velocityCurveDrag?.pointerId !== event.pointerId) return;
        // A cancelled pointer carries no meaningful position: keep the point
        // where the last move left it and just persist that.
        if (event.type === 'pointercancel') this.markPlayerStateChanged();
        else this.setModuleVelocityPoint(modal, moduleNumber, velocityCurveDrag.pointIndex, event.clientY, true, velocitySettingKey);
        releasePointer(velocityCurveDrag.plot, event.pointerId);
        velocityCurveDrag = null;
      };
      modal.addEventListener('pointerup', endVelocityDrag);
      modal.addEventListener('pointercancel', endVelocityDrag);
      const ceilingSlider = modal.querySelector<HTMLElement>('[data-velocity-ceiling]');
      const ceilingTrack = ceilingSlider?.querySelector<HTMLElement>('[data-velocity-ceiling-track]');
      if (kind === 'module-velocity' && moduleNumber <= 7 && ceilingSlider && ceilingTrack) {
        let ceilingPointer: number | null = null;
        const setCeiling = (value: number) => this.setModuleVelocityCeiling(modal, moduleNumber, value);
        ceilingSlider.addEventListener('pointerdown', (event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          ceilingPointer = event.pointerId;
          ceilingSlider.setPointerCapture(event.pointerId);
          setCeiling(velocityCeilingFromClientY(ceilingTrack, event.clientY));
        });
        ceilingSlider.addEventListener('pointermove', (event) => {
          if (ceilingPointer !== event.pointerId) return;
          event.preventDefault();
          setCeiling(velocityCeilingFromClientY(ceilingTrack, event.clientY));
        });
        const endCeiling = (event: PointerEvent) => {
          if (ceilingPointer !== event.pointerId) return;
          if (ceilingSlider.hasPointerCapture(event.pointerId)) ceilingSlider.releasePointerCapture(event.pointerId);
          ceilingPointer = null;
        };
        ceilingSlider.addEventListener('pointerup', endCeiling);
        ceilingSlider.addEventListener('pointercancel', endCeiling);
        ceilingSlider.addEventListener('keydown', (event) => {
          const step = event.key === 'ArrowUp' || event.key === 'ArrowRight' ? 1
            : event.key === 'ArrowDown' || event.key === 'ArrowLeft' ? -1
              : event.key === 'PageUp' ? 10 : event.key === 'PageDown' ? -10 : 0;
          if (!step) return;
          event.preventDefault();
          event.stopPropagation();
          const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
          setCeiling(readVelocityLimit(moduleState?.settings.velocityCeiling) + step);
        });
      }
    }
    modal.addEventListener('pointerdown', (event) => {
      if (this.startOrganDrawbarDrag(event, moduleNumber)) return;
      this.startKnobDrag(event, moduleNumber);
    });
    modal.addEventListener('pointermove', (event) => {
      // Sempre primeiro: se não, o Learn no drawbar nunca era cancelado por
      // um arrasto de verdade, já que o retorno antecipado pulava esta linha.
      this.knobCcLearnGesture.move(event);
      if (this.moveOrganDrawbarDrag(event)) return;
      this.moveKnobDrag(event);
    });
    modal.addEventListener('pointerup', (event) => {
      this.endOrganDrawbarDrag(event);
      this.knobCcLearnGesture.end(event);
      this.endKnobDrag(event);
    });
    modal.addEventListener('pointercancel', (event) => {
      this.endOrganDrawbarDrag(event);
      this.knobCcLearnGesture.end(event);
      this.endKnobDrag(event);
    });
    if ((pageKind() === 'module-rotary' || kind === 'module-organ') && moduleNumber === 7) {
      modal.addEventListener('pointerdown', (event) => {
        const button = event.target instanceof Element
          ? event.target.closest<HTMLButtonElement>('[data-module-rotary-speed]') : null;
        const learnTarget = button ? this.ccLearnTargetForRotarySpeed(button) : null;
        if (button && learnTarget) this.startRotarySpeedLearn(event, button, learnTarget);
      });
    }
    if (kind === 'module-settings' && moduleNumber !== null) {
      modal.addEventListener('pointerdown', (event) => {
        const button = event.target instanceof Element
          ? event.target.closest<HTMLButtonElement>(
            '[data-module-modulation-mode="pan"], [data-module-modulation-mode="tremolo"]',
          ) : null;
        if (!button || (event.pointerType === 'mouse' && event.button !== 0)) return;
        const mode = button.dataset.moduleModulationMode;
        if (mode !== 'pan' && mode !== 'tremolo') return;
        this.moduleModulationIntensityHoldGesture.start(event, () => {
          this.suppressNextModuleModulationClick = button;
          window.setTimeout(() => {
            if (this.suppressNextModuleModulationClick === button) {
              this.suppressNextModuleModulationClick = null;
            }
          }, 900);
          const input = modal.querySelector<HTMLInputElement>(
            `[data-module-modulation-intensity="${mode}"]`,
          );
          if (input) this.showKnobFocus(input);
        });
      });
      modal.addEventListener('pointermove', (event) => this.moduleModulationIntensityHoldGesture.move(event));
      modal.addEventListener('pointerup', (event) => this.moduleModulationIntensityHoldGesture.end(event));
      modal.addEventListener('pointercancel', (event) => this.moduleModulationIntensityHoldGesture.end(event));
      modal.addEventListener('pointerdown', (event) => {
        const button = moduleNumber === 7 && event.target instanceof Element
          ? event.target.closest<HTMLButtonElement>('[data-module-rotary-toggle]') : null;
        if (!button || (event.pointerType === 'mouse' && event.button !== 0)) return;
        this.startCcControlLearn(event, button, this.ccLearnTargetForRotaryToggle(), true);
      });
      modal.addEventListener('pointerdown', (event) => {
        const button = event.target instanceof Element
          ? event.target.closest<HTMLButtonElement>('button[data-module-setting-action="toggle-voice-mode"]')
          : null;
        if (!button || (event.pointerType === 'mouse' && event.button !== 0)) return;
        if (!this.desktopRuntime) {
          this.voiceModeHoldGesture.start(event, () => {
            this.suppressNextVoiceModeClick = true;
            window.setTimeout(() => { this.suppressNextVoiceModeClick = false; }, 900);
            this.openChildModal('module-voice-mode', moduleNumber, button);
          });
        }
      });
      modal.addEventListener('pointermove', (event) => this.voiceModeHoldGesture.move(event));
      modal.addEventListener('pointerup', (event) => this.voiceModeHoldGesture.end(event));
      modal.addEventListener('pointercancel', (event) => this.voiceModeHoldGesture.end(event));
    }
    if (kind === 'module-synth' && moduleNumber === 8) {
      modal.addEventListener('pointerdown', (event) => {
        const button = event.target instanceof Element
          ? event.target.closest<HTMLButtonElement>('[data-synth-preset]')
          : null;
        const slot = Number(button?.dataset.synthPreset);
        if (!button || !Number.isInteger(slot) || (event.pointerType === 'mouse' && event.button !== 0)) return;
        if (!this.desktopRuntime) {
          this.synthPresetHoldGesture.start(event, () => {
            this.suppressNextSynthPresetClick = slot;
            window.setTimeout(() => {
              if (this.suppressNextSynthPresetClick === slot) this.suppressNextSynthPresetClick = 0;
            }, 900);
            this.openChildModal('synth-preset-name', slot, button);
          });
        }
      });
      modal.addEventListener('pointermove', (event) => this.synthPresetHoldGesture.move(event));
      modal.addEventListener('pointerup', (event) => this.synthPresetHoldGesture.end(event));
      modal.addEventListener('pointercancel', (event) => this.synthPresetHoldGesture.end(event));
    }
    if (pageKind() === 'module-delay' && moduleNumber !== null) {
      modal.addEventListener('pointerdown', (event) => {
        const target = event.target;
        const button = target instanceof Element ? target.closest<HTMLButtonElement>('[data-module-delay-tap]') : null;
        if (!button || (event.pointerType === 'mouse' && event.button !== 0)) return;
        event.preventDefault();
        this.tapModuleDelay(modal, moduleNumber, event.timeStamp);
        if (!this.desktopRuntime) {
          this.knobCcLearnGesture.start(event, () => {
            this.openCcLearn({ kind: 'module-control', moduleNumber, control: 'delay:tap', label: 'Tap do Delay' }, button);
          });
        }
      });
    }
    if (kind === 'app-settings') {
      modal.addEventListener('pointerdown', (event) => {
        const target = event.target instanceof Element
          ? event.target.closest<HTMLButtonElement>('[data-setting-view="keyboard"]')
          : null;
        if (!target || (event.pointerType === 'mouse' && event.button !== 0)) return;
        if (!this.desktopRuntime) {
          this.keyboardSettingsHoldGesture.start(event, () => {
            this.suppressNextKeyboardViewClick = true;
            window.setTimeout(() => { this.suppressNextKeyboardViewClick = false; }, 500);
            this.openChildModal('keyboard-settings', null, target);
          });
        }
      });
      modal.addEventListener('pointermove', (event) => this.keyboardSettingsHoldGesture.move(event));
      modal.addEventListener('pointerup', (event) => this.keyboardSettingsHoldGesture.end(event));
      modal.addEventListener('pointercancel', (event) => this.keyboardSettingsHoldGesture.end(event));
    }
    if (kind === 'sound-selection' && moduleNumber !== null) {
      modal.addEventListener('pointerdown', (event) => {
        const button = event.target instanceof Element
          ? event.target.closest<HTMLButtonElement>('button[data-fixed-sound-id]')
          : null;
        const soundId = button?.dataset.fixedSoundId;
        if (!button || !soundId || !this.installedFixedSoundIds.has(soundId)) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (!this.desktopRuntime) {
          this.fixedSoundHoldGesture.start(event, () => {
            this.suppressNextFixedSoundClick = true;
            window.setTimeout(() => { this.suppressNextFixedSoundClick = false; }, 650);
            this.selectedCatalogSoundId = soundId;
            this.openChildModal('sound-download', moduleNumber, button);
          });
        }
      });
      modal.addEventListener('pointermove', (event) => this.fixedSoundHoldGesture.move(event));
      modal.addEventListener('pointerup', (event) => this.fixedSoundHoldGesture.end(event));
      modal.addEventListener('pointercancel', (event) => this.fixedSoundHoldGesture.end(event));

      modal.addEventListener('pointerdown', (event) => {
        const button = event.target instanceof Element
          ? event.target.closest<HTMLButtonElement>('button[data-user-soundfont-id]')
          : null;
        if (!button || (event.pointerType === 'mouse' && event.button !== 0)) return;
        if (!this.desktopRuntime) {
          this.userSoundfontHoldGesture.start(event, () => {
            this.suppressNextUserSoundfontClick = true;
            window.setTimeout(() => { this.suppressNextUserSoundfontClick = false; }, 900);
            this.showUserSoundfontRemoveConfirmation(modal, button);
          });
        }
      });
      modal.addEventListener('pointermove', (event) => this.userSoundfontHoldGesture.move(event));
      modal.addEventListener('pointerup', (event) => this.userSoundfontHoldGesture.end(event));
      modal.addEventListener('pointercancel', (event) => this.userSoundfontHoldGesture.end(event));
    }
    modal.addEventListener('change', (event) => {
      const input = event.target;
      if (kind === 'sound-selection' && input instanceof HTMLInputElement && input.matches('[data-user-sf2-file]')) {
        void this.importUserSoundfont(modal, input);
        return;
      }
      if (kind === 'effect-pad' && moduleNumber !== null && input instanceof HTMLInputElement && input.matches('[data-effect-audio-file]')) {
        void this.importEffectAudio(modal, moduleNumber, input);
        return;
      }
      if (kind === 'user' && input instanceof HTMLInputElement && input.matches('[data-user-profile-file]')) {
        void this.previewUserProfilePhoto(modal, input);
        return;
      }
      if (kind === 'user' && input instanceof HTMLInputElement && input.matches('[data-player-backup-file]')) {
        const file = input.files?.[0];
        if (file) void this.restorePlayerBackup(modal, file);
        return;
      }
      if ((kind === 'module-velocity' || kind === 'module-filter-velocity') && moduleNumber !== null && input instanceof HTMLInputElement && input.matches('[data-velocity-fixed-value]')) {
        this.setFixedModuleVelocity(
          modal, moduleNumber, Number(input.value),
          kind === 'module-filter-velocity' ? 'filterVelocityCurve' : 'velocityCurve',
        );
        this.markPlayerStateChanged();
        return;
      }
      if (kind === 'module-filter-velocity' && moduleNumber !== null && input instanceof HTMLInputElement && input.matches('[data-filter-velocity-cutoff]')) {
        this.updateFilterVelocityCutoff(modal, input, moduleNumber);
        this.markPlayerStateChanged();
        return;
      }
      if (kind === 'about' || kind === 'app-settings' || kind === 'app-settings-midi' || kind === 'app-settings-audio') this.handleAppSettingsChange(event);
      if ((kind === 'module-settings' || kind === 'module-voice-mode') && moduleNumber !== null) {
        this.handleModuleSettingsChange(event, moduleNumber);
      }
    });
    modal.addEventListener('input', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (kind === 'cc-learn' && input.matches('[data-cc-limit]')) {
        this.pendingCcLimitPercent = Math.round(boundedNumber(input.value, 0, 100, 100) * 10) / 10;
        const output = modal.querySelector<HTMLOutputElement>('[data-cc-limit-output]');
        const formatted = this.pendingCcLearn
          ? formatCcLimit(this.pendingCcLearn, this.pendingCcLimitPercent)
          : `${this.pendingCcLimitPercent}%`;
        if (output) output.value = formatted;
        input.setAttribute('aria-valuetext', formatted);
        return;
      }
      if ((kind === 'module-settings' || kind === 'module-synth' || kind === 'module-voice-mode')
          && moduleNumber !== null && input.matches('[data-glide-time]')) {
        this.updateGlideControl(modal, input, moduleNumber);
        return;
      }
      if (kind === 'module-settings' && moduleNumber !== null && moduleNumber <= 7 && input.matches('[data-module-velocity-limit]')) {
        this.updateModuleVelocityLimit(input, moduleNumber);
      }
      if (kind === 'module-settings' && moduleNumber !== null && input.matches('[data-module-modulation-rate]')) {
        this.updateModuleModulationRate(input, moduleNumber);
        return;
      }
      if (kind === 'module-settings' && moduleNumber !== null
          && input.matches('[data-module-modulation-intensity]')) {
        this.updateModuleModulationIntensity(input, moduleNumber);
        return;
      }
      if (kind === 'module-settings' && moduleNumber !== null && input.matches('[data-module-gain]')) {
        this.updateModuleGain(input, moduleNumber);
        return;
      }
      if (kind === 'module-settings' && moduleNumber !== null && input.matches('[data-module-sustain]')) {
        this.updateModuleSustain(input, moduleNumber);
        return;
      }
      if (kind === 'module-synth' && moduleNumber === 8 && input.matches('[data-synth-parameter]')) {
        this.updateSynthParameter(input);
      } else if (pageKind() === 'module-arpeggiator' && moduleNumber !== null && input.matches('[data-pattern-kind="arpeggiator"]')) {
        this.updateArpeggiatorParameter(input, moduleNumber);
      } else if (pageKind() === 'module-trance-gate' && moduleNumber !== null && input.matches('[data-trance-gate-parameter]')) {
        this.updateTranceGateParameter(input, moduleNumber);
      } else if (kind === 'module-settings' && moduleNumber !== null && input.matches('[data-module-envelope]')) {
        this.updateModuleEnvelopeControl(modal, input, moduleNumber);
      } else if ((kind === 'module-settings' || kind === 'module-env-filter') && moduleNumber !== null && input.matches('[data-module-cutoff]')) {
        this.updateModuleCutoffControl(modal, input, moduleNumber);
      } else if (kind === 'module-filter-velocity' && moduleNumber !== null && input.matches('[data-filter-velocity-cutoff]')) {
        this.updateFilterVelocityCutoff(modal, input, moduleNumber);
        this.scheduleNativeEngineSync();
      } else if (kind === 'metronome' && input.matches('[data-metronome-signature]')) {
        const numeratorInput = modal.querySelector<HTMLInputElement>('[data-metronome-signature="numerator"]');
        const denominatorInput = modal.querySelector<HTMLInputElement>('[data-metronome-signature="denominator"]');
        const numerator = Number(numeratorInput?.value);
        const denominator = Number(denominatorInput?.value);
        if (Number.isFinite(numerator) && Number.isFinite(denominator)) {
          this.metronome.setTimeSignature(numerator, denominator);
          this.markPlayerStateChanged();
        }
      } else if (input.matches('[data-preset-name-input]')) {
        const preview = modal.querySelector<HTMLElement>('.preset-name-editor__preview .player-preset-button__label');
        if (preview) preview.textContent = input.value || 'Preset';
      } else if (input.matches('[data-effect-name-input]')) {
        const preview = modal.querySelector<HTMLElement>('.effect-pad-editor__preview-button span');
        if (preview) preview.textContent = input.value || `Efeito ${moduleNumber ?? ''}`;
      } else if (kind === 'effect-pad' && input.matches('[data-effect-pad-volume]')) {
        this.updateEffectPadVolumeControl(modal, input);
      } else if (kind === 'glide-config' && moduleNumber !== null && input.matches('[data-glide-velocity-threshold]')) {
        this.updateGlideVelocity(modal, moduleNumber, (settings) => {
          settings.glideVelocityThreshold = Number(input.value);
        });
      } else if ((kind === 'module-velocity' || kind === 'module-filter-velocity') && moduleNumber !== null && input.matches('[data-velocity-fixed-value]')) {
        this.setFixedModuleVelocity(
          modal, moduleNumber, Number(input.value),
          kind === 'module-filter-velocity' ? 'filterVelocityCurve' : 'velocityCurve',
        );
      } else if (kind === 'password-reset' && input.matches('[data-new-password], [data-confirm-new-password]')) {
        const password = modal.querySelector<HTMLInputElement>('[data-new-password]');
        const confirmation = modal.querySelector<HTMLInputElement>('[data-confirm-new-password]');
        const save = modal.querySelector<HTMLButtonElement>('[data-modal-action="save-password-reset"]');
        if (save) save.disabled = !password || !confirmation || password.value.length < 8 || confirmation.value.length < 8;
      } else if (kind === 'user-name' && input.matches('[data-user-name-input]')) {
        const save = modal.querySelector<HTMLButtonElement>('[data-modal-action="save-user-name"]');
        if (save) save.disabled = input.value.trim().length === 0;
      }
      if (pageKind() === 'module-eq' && moduleNumber !== null && input.matches('[data-module-eq-q]')) {
        this.updateModuleEqQ(modal, input, moduleNumber);
      }
      if ((pageKind() === 'module-compressor' || pageKind() === 'module-reverb' || pageKind() === 'module-delay' || pageKind() === 'module-rotary' || pageKind() === 'module-organ' || pageKind() === 'module-chorus' || pageKind() === 'module-env-filter') && moduleNumber !== null && input.matches('[data-module-effect-control]')) {
        this.updateModuleEffectControl(modal, input, moduleNumber);
      }
    });
    modal.addEventListener('keydown', this.handleModalKeydown);

    const screen = requiredElement<HTMLElement>(this.root, '.player-screen');
    screen.setAttribute('aria-hidden', 'true');
    this.root.append(modal);
    this.modal = modal;
    if (kind === 'app-settings-midi' || kind === 'app-settings-audio' || kind === 'module-settings') {
      this.enhanceAppSelects(modal);
    }
    if (!this.desktopRuntime) {
      this.tabletInputKeyboardController = new TabletInputKeyboardController(modal);
      this.tabletInputKeyboardController.mount();
      if (kind === 'tempo-edit') {
        const input = modal.querySelector<HTMLInputElement>('[data-tempo-input]');
        if (input) this.tabletInputKeyboardController.openFor(input);
      }
      if (kind === 'user-name') {
        const input = modal.querySelector<HTMLInputElement>('[data-user-name-input]');
        if (input) this.tabletInputKeyboardController.openFor(input);
      }
      if (kind === 'bank-name') {
        const input = modal.querySelector<HTMLInputElement>('[data-bank-name-input]');
        if (input) this.tabletInputKeyboardController.openFor(input);
      }
      if (kind === 'effect-bank-name') {
        const input = modal.querySelector<HTMLInputElement>('[data-effect-bank-name-input]');
        if (input) this.tabletInputKeyboardController.openFor(input);
      }
    }
    if (kind === 'tracks') {
      this.tracksPanelController = new TracksPanelController(
        modal,
        this.trackLibrary,
        {
          getPlaybackSnapshot: () => this.trackTransport?.getSnapshot() ?? this.trackPlaybackSnapshot,
          onTrackSelected: (track) => this.selectTrack(track),
          onTracksDeleting: (tracks) => this.deleteStoredTracks(tracks),
          onAddMusicRequested: () => {
            if (!hookKeysNative.audioPicker.isAvailable()) return false;
            void this.importTracksFromNativePicker();
            return true;
          },
        },
      );
      this.tracksPanelController.mount();
    } else if (kind === 'track-position') {
      this.trackTransport?.refreshView();
      this.renderTrackWaveform(modal);
    } else if (kind === 'output-volume') {
      this.outputFaderController = new OutputFaderPanelController(
        modal,
        this.outputLevels,
        this.outputEnabled,
        () => {
          this.renderOutputLevels();
          this.applyMusicOutput();
          this.markPlayerStateChanged();
        },
        (bus, trigger) => this.openCcLearn({ kind: 'output-volume', bus }, trigger),
      );
      this.outputFaderController.mount();
    }
    if (kind === 'sound-selection') {
      this.syncSoundDownloadButtons(modal);
      void this.renderSoundLibraryTotals(modal);
    }
    const userName = modal.querySelector<HTMLElement>('[data-user-name]');
    const immediateUserName = this.account.name?.trim() || this.account.email;
    if (userName) userName.textContent = immediateUserName;
    const userPhotoFallback = modal.querySelector<HTMLElement>('[data-user-photo-fallback]');
    if (userPhotoFallback) userPhotoFallback.textContent = initialsFor(immediateUserName);
    if (kind === 'user-name') {
      const input = requiredElement<HTMLInputElement>(modal, '[data-user-name-input]');
      input.value = this.account.name?.trim() || '';
      const apply = modal.querySelector<HTMLButtonElement>('[data-modal-action="save-user-name"]');
      if (apply) apply.disabled = input.value.length === 0;
      if (this.desktopRuntime) input.focus();
      else this.tabletInputKeyboardController?.openFor(input);
    }
    if (kind === 'preset-name') {
      const input = requiredElement<HTMLInputElement>(modal, '[data-preset-name-input]');
      input.value = presetState?.name ?? 'Preset';
      const preview = requiredElement<HTMLElement>(modal, '.preset-name-editor__preview .player-preset-button__label');
      preview.textContent = input.value;
    } else if (kind === 'synth-preset-name') {
      const input = requiredElement<HTMLInputElement>(modal, '[data-synth-preset-name-input]');
      if (this.desktopRuntime) input.focus();
    } else if (kind === 'bank-name') {
      const input = requiredElement<HTMLInputElement>(modal, '[data-bank-name-input]');
      if (this.desktopRuntime) input.focus();
    } else if (kind === 'effect-bank-name') {
      const input = requiredElement<HTMLInputElement>(modal, '[data-effect-bank-name-input]');
      if (this.desktopRuntime) input.focus();
    } else if (kind === 'effect-pad') {
      const preview = requiredElement<HTMLElement>(modal, '.effect-pad-editor__preview-button span');
      const input = modal.querySelector<HTMLInputElement>('[data-effect-name-input]');
      if (input) {
        input.value = effectPadState?.name ?? `Efeito ${moduleNumber ?? ''}`;
        preview.textContent = input.value;
      }
      const volumeInput = modal.querySelector<HTMLInputElement>('[data-effect-pad-volume]');
      volumeInput?.addEventListener('dblclick', () => {
        volumeInput.value = String(EFFECT_PAD_MAX_DB);
        this.updateEffectPadVolumeControl(modal, volumeInput);
      });
    } else if (kind === 'cc-learn') {
      modal.querySelector<HTMLButtonElement>('[data-modal-action="confirm-cc-learn"]')?.focus();
    } else if (kind !== 'tempo-edit' || this.desktopRuntime) {
      requiredElement<HTMLButtonElement>(modal, '.player-modal__back-button').focus();
    }
    if (kind === 'app-settings') {
      void this.loadCompatibilityVideoUrl();
    } else if (kind === 'app-settings-midi') {
      void this.midiInput.requestAccess().then(() => this.refreshMidiDeviceOptions(modal));
    } else if (kind === 'app-settings-audio') {
      void this.refreshAudioDeviceOptions(modal);
    } else if (kind === 'module-settings') {
      void this.midiInput.requestAccess().then(() => this.refreshModuleMidiOptions(modal, moduleNumber));
    } else if (kind === 'sound-selection' && moduleState?.category === 'user') {
      void this.renderUserSoundfonts(modal);
    } else if (kind === 'user') {
      void this.loadUserDevices(modal);
      void this.loadAcquireLicenseUrl(modal);
      void this.loadSupportUrl(modal);
      void this.loadUserProfile(modal);
    } else if (kind === 'backup-download') {
      void this.prepareBackupDownloadCapacity(modal);
    }
  }

  private async loadUserProfile(modal: HTMLElement): Promise<void> {
    try {
      const profile = await this.accountControls.getProfile();
      if (modal.isConnected) this.renderUserProfile(modal, profile);
    } catch {
      const created = modal.querySelector<HTMLElement>('[data-user-created]');
      if (created) created.textContent = 'Data da conta indisponível sem conexão.';
    }
  }

  private async makePlayerBackup(modal: HTMLElement, button: HTMLButtonElement): Promise<void> {
    const message = modal.querySelector<HTMLElement>('[data-user-profile-message]');
    button.disabled = true;
    if (message) message.textContent = 'Preparando backup...';
    this.saveActivePresetState();
    try {
      const result = await this.playerBackup.backupNow(this.createSavedPlayerState());
      if (!modal.isConnected) return;
      if (message) message.textContent = result.saved
        ? `Backup salvo em ${result.fileName}.`
        : 'Salvamento do backup cancelado.';
    } catch (error) {
      const detail = nativeErrorMessage(error);
      if (message) {
        message.textContent = detail === 'backup_file_too_large'
          ? 'O backup ficou maior que 16 MB.'
          : detail && !detail.includes('_')
            ? detail
            : 'Não foi possível salvar o backup.';
      }
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  }

  private async restorePlayerBackup(modal: HTMLElement, file: File): Promise<void> {
    const message = modal.querySelector<HTMLElement>('[data-user-profile-message]');
    const button = modal.querySelector<HTMLButtonElement>('[data-modal-action="restore-backup"]');
    if (!button) return;
    button.disabled = true;
    if (message) message.textContent = 'Restaurando backup...';
    try {
      const state = await this.playerBackup.restore(file);
      if (!modal.isConnected) return;
      this.applySavedPlayerState(state);
      const restorePlan = await new PresetBackupPlanner(this.soundCatalog, this.soundLibrary).createPlan(state);
      this.missingUserSoundfonts = restorePlan.missingUserSoundfonts;
      this.restoreActivePresetState();
      this.renderActivePadBank();
      this.renderActiveEffectBank();
      this.updateVisibleView();
      this.syncNativeEngine();
      this.markPlayerStateChanged();
      this.pendingBackupDownloads = restorePlan.fixedSoundsToDownload;
      if (message) {
        const missingUserCount = restorePlan.missingUserSoundfonts.length;
        message.textContent = missingUserCount > 0
          ? `Backup restaurado. Ainda faltam ${missingUserCount} timbre(s) User; abra um módulo e adicione os arquivos novamente.`
          : 'Backup restaurado.';
      }
      if (restorePlan.fixedSoundsToDownload.length > 0) {
        this.openChildModal('backup-download', null, button);
      }
    } catch {
      if (message) message.textContent = 'Não foi possível restaurar o backup agora.';
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  }

  private renderUserProfile(modal: HTMLElement, profile: AccountProfile): void {
    const name = profile.name.trim() || profile.email;
    this.account.name = profile.name.trim();
    const nameElement = modal.querySelector<HTMLElement>('[data-user-name]');
    const createdElement = modal.querySelector<HTMLElement>('[data-user-created]');
    const fallback = modal.querySelector<HTMLElement>('[data-user-photo-fallback]');
    const image = modal.querySelector<HTMLImageElement>('[data-user-photo]');
    if (nameElement) nameElement.textContent = name;
    if (createdElement) {
      const date = profile.createdAt ? new Date(profile.createdAt) : null;
      createdElement.textContent = date && !Number.isNaN(date.getTime())
        ? `Conta criada em ${date.toLocaleDateString('pt-BR')}`
        : 'Data de criação indisponível';
    }
    if (fallback) fallback.textContent = initialsFor(name);
    if (image) {
      image.src = profile.photoDataUrl || '';
      image.hidden = !profile.photoDataUrl;
    }
    if (fallback) fallback.hidden = Boolean(profile.photoDataUrl);
  }

  private async saveUserProfileName(modal: HTMLElement, button: HTMLButtonElement): Promise<void> {
    const input = modal.querySelector<HTMLInputElement>('[data-user-name-input]');
    const message = modal.querySelector<HTMLElement>('[data-user-name-message]');
    const name = input?.value.replace(/\s+/g, ' ').trim() ?? '';
    if (!input || !name) {
      if (message) message.textContent = 'Digite o nome do usuário.';
      return;
    }
    if (!navigator.onLine) {
      if (message) message.textContent = 'Sem conexão com a internet.';
      return;
    }
    button.disabled = true;
    if (message) message.textContent = 'Salvando nome...';
    try {
      const profile = await this.accountControls.saveProfileName(name);
      this.account.name = profile.name;
      if (!modal.isConnected) return;
      this.returnToPreviousModal();
    } catch (error) {
      if (message) {
        message.textContent = !navigator.onLine || (error instanceof ApiError && error.status === 0)
          ? 'Sem conexão com a internet.'
          : 'Não foi possível atualizar o nome.';
      }
      if (button.isConnected) button.disabled = false;
    }
  }

  private async previewUserProfilePhoto(modal: HTMLElement, input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const message = modal.querySelector<HTMLElement>('[data-user-profile-message]');
    if (message) message.textContent = 'Preparando prévia...';
    try {
      const image = await loadProfilePhoto(file);
      if (!modal.isConnected) return;
      const preview = modal.querySelector<HTMLElement>('[data-user-photo-preview]');
      const canvas = modal.querySelector<HTMLCanvasElement>('[data-user-photo-canvas]');
      const editor = modal.querySelector<HTMLElement>('[data-user-photo-crop]');
      if (!preview || !canvas || !editor) return;
      this.userPhotoCrop = { image, canvas, zoom: 1, offsetX: 0, offsetY: 0, drag: null };
      this.bindUserProfilePhotoCrop(editor);
      this.renderUserProfilePhotoCrop();
      preview.hidden = false;
      if (message) message.textContent = '';
      modal.querySelector<HTMLButtonElement>('[data-modal-action="save-user-photo"]')?.focus();
    } catch {
      if (message) message.textContent = 'Não foi possível abrir esta imagem.';
    }
  }

  private closeUserProfilePhotoPreview(modal: HTMLElement, chooseAgain = false): void {
    const preview = modal.querySelector<HTMLElement>('[data-user-photo-preview]');
    if (preview) preview.hidden = true;
    this.userPhotoCrop = null;
    if (chooseAgain) modal.querySelector<HTMLInputElement>('[data-user-profile-file]')?.click();
  }

  private bindUserProfilePhotoCrop(editor: HTMLElement): void {
    const canvas = this.userPhotoCrop?.canvas;
    if (!canvas) return;
    canvas.onpointerdown = (event) => {
      if (!this.userPhotoCrop) return;
      canvas.setPointerCapture(event.pointerId);
      this.userPhotoCrop.drag = { pointerId:event.pointerId, x:event.clientX, y:event.clientY };
      canvas.classList.add('is-dragging');
    };
    canvas.onpointermove = (event) => {
      const state = this.userPhotoCrop;
      if (!state?.drag || state.drag.pointerId !== event.pointerId) return;
      const rect = canvas.getBoundingClientRect();
      state.offsetX += (event.clientX - state.drag.x) * canvas.width / Math.max(1, rect.width);
      state.offsetY += (event.clientY - state.drag.y) * canvas.height / Math.max(1, rect.height);
      state.drag.x = event.clientX;
      state.drag.y = event.clientY;
      this.renderUserProfilePhotoCrop();
    };
    const endDrag = (event: PointerEvent) => {
      if (this.userPhotoCrop?.drag?.pointerId !== event.pointerId) return;
      this.userPhotoCrop.drag = null;
      canvas.classList.remove('is-dragging');
    };
    canvas.onpointerup = endDrag;
    canvas.onpointercancel = endDrag;
    editor.querySelectorAll<HTMLButtonElement>('[data-user-photo-zoom]').forEach((button) => {
      button.onclick = () => {
        const state = this.userPhotoCrop;
        if (!state) return;
        const previous = state.zoom;
        state.zoom = button.dataset.userPhotoZoom === 'in'
          ? Math.min(4, state.zoom * 1.18)
          : Math.max(1, state.zoom / 1.18);
        const ratio = state.zoom / previous;
        state.offsetX *= ratio;
        state.offsetY *= ratio;
        this.renderUserProfilePhotoCrop();
      };
    });
  }

  private renderUserProfilePhotoCrop(): void {
    const state = this.userPhotoCrop;
    if (!state) return;
    const { canvas, image } = state;
    const context = canvas.getContext('2d');
    if (!context) return;
    const diameter = canvas.height * .68;
    const radius = diameter / 2;
    const scale = Math.max(diameter / image.naturalWidth, diameter / image.naturalHeight) * state.zoom;
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    state.offsetX = Math.min(Math.max(state.offsetX, radius - width / 2), width / 2 - radius);
    state.offsetY = Math.min(Math.max(state.offsetY, radius - height / 2), height / 2 - radius);
    context.fillStyle = '#090604';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      image,
      canvas.width / 2 + state.offsetX - width / 2,
      canvas.height / 2 + state.offsetY - height / 2,
      width,
      height,
    );
  }

  private async saveUserProfilePhoto(modal: HTMLElement, button: HTMLButtonElement): Promise<void> {
    const imageDataUrl = createProfilePhotoCrop(this.userPhotoCrop);
    const message = modal.querySelector<HTMLElement>('[data-user-profile-message]');
    if (!imageDataUrl.startsWith('data:image/')) return;
    if (!navigator.onLine) {
      if (message) message.textContent = 'Sem conexão com a internet.';
      return;
    }
    const cancel = modal.querySelector<HTMLButtonElement>('[data-modal-action="cancel-user-photo"]');
    button.disabled = true;
    if (cancel) cancel.disabled = true;
    button.textContent = 'Salvando...';
    if (message) message.textContent = 'Salvando foto...';
    try {
      const profile = await this.accountControls.saveProfilePhoto(imageDataUrl);
      if (!modal.isConnected) return;
      this.renderUserProfile(modal, profile);
      this.closeUserProfilePhotoPreview(modal);
      if (message) message.textContent = 'Foto atualizada.';
    } catch (error) {
      if (message) {
        message.textContent = !navigator.onLine || (error instanceof ApiError && error.status === 0)
          ? 'Sem conexão com a internet.'
          : 'Não foi possível atualizar a foto.';
      }
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = 'Usar esta foto';
      }
      if (cancel?.isConnected) cancel.disabled = false;
    }
  }

  private handleUserSoundfontAction(modal: HTMLElement, action: string): void {
    if (modal.dataset.userSf2Importing === 'true') return;
    const namePanel = modal.querySelector<HTMLElement>('[data-user-sf2-name]');
    const nameInput = modal.querySelector<HTMLInputElement>('[data-user-sf2-name-input]');
    const message = modal.querySelector<HTMLElement>('[data-user-sf2-message]');
    if (!namePanel || !nameInput) return;

    if (action === 'name') {
      namePanel.hidden = false;
      nameInput.value = '';
      this.renderUserSoundfontName(modal);
      if (message) message.textContent = '';
      this.setUserSoundfontKeyboardOpen(modal, false);
      return;
    }
    if (action === 'cancel') {
      this.setUserSoundfontKeyboardOpen(modal, false);
      namePanel.hidden = true;
      nameInput.value = '';
      const fileInput = modal.querySelector<HTMLInputElement>('[data-user-sf2-file]');
      if (fileInput) {
        fileInput.value = '';
        delete fileInput.dataset.soundfontName;
        delete fileInput.dataset.restoreSoundfontId;
      }
      this.renderUserSoundfontName(modal);
      if (message) message.textContent = '';
      return;
    }
    if (action !== 'choose-file') return;

    const name = nameInput.value.trim().slice(0, 12);
    if (!name) {
      if (message) message.textContent = 'Digite um nome para o timbre.';
      return;
    }
    const fileInput = modal.querySelector<HTMLInputElement>('[data-user-sf2-file]');
    if (!fileInput) return;
    this.setUserSoundfontKeyboardOpen(modal, false);
    fileInput.value = '';
    delete fileInput.dataset.restoreSoundfontId;
    fileInput.dataset.soundfontName = name;
    // iOS only skips Foto/Tirar foto when `accept` resolves to a non-media
    // document type. Android then opens its document picker as well. Keep the
    // strict extension-only filter on desktop, where octet-stream is displayed
    // as unrelated executable extensions by the Windows picker.
    fileInput.accept = Capacitor.isNativePlatform() ? 'application/octet-stream,.sf2' : '.sf2';
    fileInput.click();
  }

  private updateUserSoundfontName(modal: HTMLElement, key: string): void {
    const input = modal.querySelector<HTMLInputElement>('[data-user-sf2-name-input]');
    const message = modal.querySelector<HTMLElement>('[data-user-sf2-message]');
    if (!input) return;
    input.value = applyOnScreenKey(input.value, key, 12);
    this.renderUserSoundfontName(modal);
    if (message) message.textContent = '';
  }

  private renderUserSoundfontName(modal: HTMLElement): void {
    const input = modal.querySelector<HTMLInputElement>('[data-user-sf2-name-input]');
    const value = modal.querySelector<HTMLElement>('[data-user-sf2-name-value]');
    if (input && value) value.textContent = input.value;
  }

  private setUserSoundfontKeyboardOpen(
    modal: HTMLElement,
    open: boolean,
    requestedField?: HTMLElement,
  ): void {
    const field = requestedField ?? modal.querySelector<HTMLElement>('[data-user-sf2-name-field]');
    const keyboard = modal.querySelector<HTMLElement>('.user-sf2-name .on-screen-keyboard');
    if (field) {
      field.classList.toggle('is-input-active', open);
      if (open) field.focus({ preventScroll: true });
      else field.blur();
    }
    if (keyboard) keyboard.hidden = !open;
  }

  private async importUserSoundfont(modal: HTMLElement, input: HTMLInputElement): Promise<void> {
    if (modal.dataset.userSf2Importing === 'true') return;
    const file = input.files?.[0];
    const name = input.dataset.soundfontName?.trim().slice(0, 12) ?? '';
    const restoredId = input.dataset.restoreSoundfontId;
    input.value = '';
    delete input.dataset.restoreSoundfontId;
    delete input.dataset.soundfontName;
    if (!file || !name) return;
    const message = modal.querySelector<HTMLElement>('[data-user-sf2-message]');
    if (!file.name.toLowerCase().endsWith('.sf2')) {
      if (message) message.textContent = 'Escolha um arquivo SF2.';
      return;
    }
    modal.dataset.userSf2Importing = 'true';
    const buttons = [...modal.querySelectorAll<HTMLButtonElement>('[data-user-sf2-action]')];
    const previouslyDisabled = buttons.map(button => button.disabled);
    buttons.forEach(button => { button.disabled = true; });
    const namePanel = modal.querySelector<HTMLElement>('[data-user-sf2-name]');
    namePanel?.setAttribute('aria-busy', 'true');
    if (message) message.textContent = 'Adicionando SF2… Aguarde.';
    try {
      await this.soundLibrary.addUser(name, file, restoredId);
      if (restoredId) {
        this.missingUserSoundfonts = this.missingUserSoundfonts.filter(({ id }) => id !== restoredId);
      }
      if (!modal.isConnected) return;
      this.setUserSoundfontKeyboardOpen(modal, false);
      if (namePanel) namePanel.hidden = true;
      const nameInput = modal.querySelector<HTMLInputElement>('[data-user-sf2-name-input]');
      if (nameInput) nameInput.value = '';
      this.renderUserSoundfontName(modal);
      await this.renderUserSoundfonts(modal);
      const libraryMessage = modal.querySelector<HTMLElement>('[data-user-sf2-load-status]');
      if (libraryMessage) libraryMessage.textContent = `${name} adicionado. Toque no timbre para selecionar neste módulo.`;
      if (message) message.textContent = '';
    } catch {
      if (message) message.textContent = 'Não foi possível adicionar este SF2.';
    } finally {
      delete modal.dataset.userSf2Importing;
      namePanel?.removeAttribute('aria-busy');
      buttons.forEach((button, index) => { button.disabled = previouslyDisabled[index] ?? false; });
    }
  }

  private async renderUserSoundfonts(modal: HTMLElement): Promise<void> {
    const list = modal.querySelector<HTMLElement>('[data-user-sf2-list]');
    if (!list) return;
    try {
      const soundfonts = await this.soundLibrary.listUser();
      if (!modal.isConnected) return;
      this.renderSoundLibraryTotals(modal, soundfonts);
      const selectedTimbreId = this.currentModalModuleNumber === null
        ? null
        : this.getActivePresetState()?.modules[this.currentModalModuleNumber - 1]?.timbreId ?? null;
      const installedMarkup = soundfonts.map((soundfont) => {
        const selected = selectedTimbreId === `user:${soundfont.id}`;
        return `
            <button class="${selected ? 'is-current-timbre' : ''}" type="button" data-user-soundfont-id="${escapeMarkup(soundfont.id)}" data-user-soundfont-name="${escapeMarkup(soundfont.name)}" data-user-soundfont-color="${PRESET_COLORS[soundfont.colorIndex]?.[0] ?? PRESET_COLORS[0]?.[0]}" style="--user-sf2-color-a:${PRESET_COLORS[soundfont.colorIndex]?.[0] ?? PRESET_COLORS[0]?.[0]};--user-sf2-color-b:${PRESET_COLORS[soundfont.colorIndex]?.[1] ?? PRESET_COLORS[0]?.[1]}" aria-current="${selected}">
              <strong>${escapeMarkup(soundfont.name)}</strong>
              <small>${escapeMarkup(withoutSoundfontExtension(soundfont.fileName))}</small>
            </button>
          `;
      }).join('');
      const missingMarkup = this.missingUserSoundfonts.map((soundfont) => `
        <button class="is-missing" type="button" data-missing-user-soundfont-id="${escapeMarkup(soundfont.id)}" data-missing-user-soundfont-name="${escapeMarkup(soundfont.name)}">
          <strong>${escapeMarkup(soundfont.name)}</strong>
          <small>Arquivo não encontrado</small>
        </button>
      `).join('');
      list.innerHTML = installedMarkup || missingMarkup
        ? installedMarkup + missingMarkup
        : '<p>Nenhum SF2 adicionado.</p>';
    } catch {
      list.innerHTML = '<p>Não foi possível carregar seus SF2.</p>';
    }
  }

  // Sair da conta pede confirmação: o botão fica no alto da janela do User e
  // um toque errado tirava a pessoa do app no meio do show.
  private showLogoutConfirmation(): void {
    const modal = this.modal;
    if (!modal) return;
    modal.querySelector('[data-logout-confirmation]')?.remove();
    const confirmation = document.createElement('section');
    confirmation.className = 'user-sf2-remove-confirmation logout-confirmation';
    confirmation.dataset.logoutConfirmation = '';
    confirmation.setAttribute('role', 'alertdialog');
    confirmation.setAttribute('aria-modal', 'true');
    confirmation.setAttribute('aria-label', 'Confirmar saída da conta');
    confirmation.innerHTML = `
      <div>
        <small>Hook Keys</small>
        <strong>Sair da conta?</strong>
        <p>Os timbres baixados e os presets continuam neste aparelho. Para voltar, é só entrar de novo.</p>
        <span>
          <button type="button" data-action="cancel-logout">Cancelar</button>
          <button type="button" data-action="confirm-logout">Sair</button>
        </span>
      </div>
    `;
    modal.append(confirmation);
    confirmation.querySelector<HTMLButtonElement>('[data-action="cancel-logout"]')?.focus();
  }

  private showUserSoundfontRemoveConfirmation(modal: HTMLElement, button: HTMLButtonElement): void {
    const id = button.dataset.userSoundfontId;
    const name = button.dataset.userSoundfontName;
    if (!id || !name) return;
    modal.querySelector('[data-user-sf2-remove-confirmation]')?.remove();
    const confirmation = document.createElement('section');
    confirmation.className = 'user-sf2-remove-confirmation';
    confirmation.dataset.userSf2RemoveConfirmation = '';
    confirmation.dataset.userSoundfontId = id;
    confirmation.setAttribute('role', 'alertdialog');
    confirmation.setAttribute('aria-modal', 'true');
    confirmation.innerHTML = `
      <div>
        <small>SF2 do usuário</small>
        <strong>Remover ${escapeMarkup(name)}?</strong>
        <p>O timbre será apagado deste dispositivo e retirado dos presets que o utilizam.</p>
        <span>
          <button type="button" data-user-sf2-remove-choice="cancel">Cancelar</button>
          <button type="button" data-user-sf2-remove-choice="confirm">Remover</button>
        </span>
      </div>
    `;
    modal.append(confirmation);
    confirmation.querySelector<HTMLButtonElement>('[data-user-sf2-remove-choice="cancel"]')?.focus();
  }

  private async removeUserSoundfont(modal: HTMLElement, id: string, button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    try {
      if (!await this.soundLibrary.removeUser(id)) throw new Error('soundfont_not_found');
      const reference = `user:${id}`;
      for (const bank of this.bankStates.values()) {
        for (const preset of bank.presets) {
          for (let moduleIndex = 0; moduleIndex < preset.modules.length; moduleIndex += 1) {
            const module = preset.modules[moduleIndex];
            if (!module || module.timbreId !== reference) continue;
            module.timbreId = null;
            module.timbreName = moduleEmptySoundName(moduleIndex + 1);
            module.timbreColor = null;
          }
        }
      }
      this.nativeLoadedTimbres.fill(null);
      modal.querySelector('[data-user-sf2-remove-confirmation]')?.remove();
      this.restoreActivePresetState();
      this.markPlayerStateChanged();
      await this.renderUserSoundfonts(modal);
    } catch {
      button.disabled = false;
      const message = modal.querySelector<HTMLElement>('[data-user-sf2-message]');
      if (message) message.textContent = 'Não foi possível remover este SF2.';
    }
  }

  private async renderSoundLibraryTotals(
    modal: HTMLElement,
    knownUserSoundfonts?: Awaited<ReturnType<SoundLibraryStore['listUser']>>,
  ): Promise<void> {
    try {
      const userSoundfonts = knownUserSoundfonts ?? await this.soundLibrary.listUser();
      if (!modal.isConnected) return;
      const userBytes = userSoundfonts.reduce((total, soundfont) => total + soundfont.size, 0);
      const officialBytes = this.soundCatalog.sounds.reduce(
        (total, sound) => total + (sound.sf2ObjectKey ? sound.byteSize ?? 0 : 0),
        0,
      );
      const libraryTotal = modal.querySelector<HTMLElement>('.sound-library-total');
      if (libraryTotal) libraryTotal.textContent = `Total - ${formatSoundfontTotal(officialBytes + userBytes)}`;
      const userTotal = modal.querySelector<HTMLElement>('[data-user-sf2-total]');
      if (userTotal) userTotal.textContent = `Total - ${formatSoundfontTotal(userBytes)}`;
      const downloadAll = modal.querySelector<HTMLButtonElement>('.sound-library-download-all');
      if (downloadAll) {
        const downloadable = this.soundCatalog.sounds.filter((sound) => Boolean(sound.sf2ObjectKey));
        const remaining = downloadable.filter((sound) => !this.installedFixedSoundIds.has(sound.id));
        const allDownloaded = downloadable.length > 0 && remaining.length === 0;
        downloadAll.disabled = downloadable.length === 0;
        downloadAll.classList.toggle('is-delete', allDownloaded);
        downloadAll.dataset.modalAction = allDownloaded ? 'delete-all-sounds' : 'download-all-sounds';
        if (this.soundDownloadBatchIds) this.syncDownloadAllButton(modal);
        else downloadAll.textContent = allDownloaded ? 'Apagar biblioteca' : 'Baixar tudo';
      }
    } catch {
      // Mantém o valor visual inicial quando o armazenamento local não responder.
    }
  }

  // Andamento do download na faixa do topo. Vale para um timbre sozinho e
  // para a biblioteca inteira do "Baixar tudo".
  private showBackgroundDownload(name: string, percent: number | null): void {
    const banner = this.root.querySelector<HTMLElement>('[data-track-download]');
    const transport = this.root.querySelector<HTMLElement>('.track-transport');
    if (!banner || !transport) return;
    banner.hidden = false;
    transport.hidden = true;
    const label = banner.querySelector<HTMLElement>('[data-track-download-name]');
    if (label && label.textContent !== name) label.textContent = name;
    const bounded = percent === null ? null : Math.max(0, Math.min(100, Math.round(percent)));
    banner.style.setProperty('--download-progress', `${bounded ?? 0}%`);
    const output = banner.querySelector<HTMLOutputElement>('[data-track-download-percent]');
    const text = bounded === null ? '...' : `${bounded}%`;
    if (output && output.value !== text) output.value = text;
  }

  private hideBackgroundDownload(): void {
    const banner = this.root.querySelector<HTMLElement>('[data-track-download]');
    const transport = this.root.querySelector<HTMLElement>('.track-transport');
    if (banner) banner.hidden = true;
    if (transport) transport.hidden = false;
  }

  private renderActiveSoundDownloadsBanner(): void {
    const entries = [...this.activeSoundDownloads.values()];
    const active = entries.find((entry) => entry.state === 'downloading') ?? entries[0];
    if (!active) {
      this.hideBackgroundDownload();
      return;
    }
    const label = entries.length > 1 ? `${active.sound.name} (1/${entries.length})` : active.sound.name;
    this.showBackgroundDownload(label, active.percentage);
  }

  private syncSoundDownloadButtons(container: ParentNode = this.root): void {
    for (const button of container.querySelectorAll<HTMLButtonElement>('[data-fixed-sound-id]')) {
      const soundId = button.dataset.fixedSoundId ?? '';
      const entry = this.activeSoundDownloads.get(soundId);
      const downloading = entry?.state === 'downloading';
      const queued = entry?.state === 'queued';
      button.classList.toggle('is-downloading', downloading);
      button.classList.toggle('is-download-queued', queued);
      button.style.setProperty('--fixed-sound-progress', String((entry?.percentage ?? 0) / 100));
      if (entry) {
        const status = button.querySelector<HTMLElement>('small');
        if (status) status.textContent = downloading ? 'Baixando' : 'Aguardando';
      } else {
        const installed = this.installedFixedSoundIds.has(soundId);
        button.classList.toggle('is-installed', installed);
        button.classList.toggle('is-downloadable', !installed);
        button.setAttribute('aria-label', `${this.soundCatalog.get(soundId)?.name ?? 'Timbre'}. ${installed ? 'Baixado' : 'Não baixado'}`);
        const status = button.querySelector<HTMLElement>('small');
        if (status) status.textContent = installed ? 'No dispositivo' : 'Baixar';
      }
    }
  }

  private syncDownloadAllButton(container: ParentNode = this.root): void {
    const button = container.querySelector<HTMLButtonElement>('.sound-library-download-all');
    const batch = this.soundDownloadBatchIds;
    if (!button || !batch) return;
    const completed = [...batch].filter((id) => this.installedFixedSoundIds.has(id)).length;
    button.disabled = this.activeSoundDownloads.size > 0 || completed >= batch.size;
    button.textContent = `Baixado ${completed}/${batch.size}`;
    button.setAttribute('aria-label', `${completed} de ${batch.size} timbres baixados`);
  }

  private async processSoundDownloadQueue(): Promise<void> {
    if (this.soundDownloadQueueRunning) return;
    this.soundDownloadQueueRunning = true;
    try {
      while (this.activeSoundDownloads.size > 0 && this.mounted) {
        const pair = [...this.activeSoundDownloads.entries()].find(([, entry]) => entry.state === 'queued');
        if (!pair) break;
        const [soundId, entry] = pair;
        let installed = false;
        entry.state = 'downloading';
        entry.percentage = 0;
        this.renderActiveSoundDownloadsBanner();
        this.syncSoundDownloadButtons();
        try {
          await this.soundLibraryEngine.install(soundId, (progress) => {
            entry.percentage = progress.percentage;
            this.renderActiveSoundDownloadsBanner();
            this.syncSoundDownloadButtons();
            if (this.currentModalKind === 'sound-download' && this.selectedCatalogSoundId === soundId) {
              const label = progress.percentage === null
                ? `${formatBytes(progress.receivedBytes)} baixados`
                : `${progress.percentage}%`;
              this.updateSoundDownloadProgress(progress.percentage ?? 0, label);
            }
          }, entry.abort.signal);
          this.installedFixedSoundIds.add(soundId);
          installed = true;
          if (this.currentModalKind === 'sound-download' && this.selectedCatalogSoundId === soundId) {
            this.updateSoundDownloadProgress(100, 'Download concluído. Volte e escolha o timbre para usá-lo.');
            const installButton = this.modal?.querySelector<HTMLButtonElement>('[data-modal-action="download-sound"]');
            if (installButton) {
              installButton.disabled = true;
              installButton.textContent = 'Baixado';
            }
          }
        } catch (error) {
          if (!(error instanceof DOMException && error.name === 'AbortError')) {
            console.error('[Hook Keys] Falha ao baixar timbre', soundId, entry.sound.sf2ObjectKey, error);
            if (this.selectedCatalogSoundId === soundId) {
              this.updateSoundDownloadMessage(soundDownloadErrorMessage(error));
              const installButton = this.modal?.querySelector<HTMLButtonElement>('[data-modal-action="download-sound"]');
              if (installButton) {
                installButton.disabled = false;
                installButton.textContent = 'Tentar novamente';
              }
            }
          }
        } finally {
          this.activeSoundDownloads.delete(soundId);
          this.syncSoundDownloadButtons();
          this.syncDownloadAllButton();
          this.renderActiveSoundDownloadsBanner();
          if (installed) void this.syncNativeEngine();
        }
      }
    } finally {
      this.soundDownloadQueueRunning = false;
      if (this.activeSoundDownloads.size === 0) this.hideBackgroundDownload();
    }
  }

  private async downloadAllOfficialSounds(modal: HTMLElement, button: HTMLButtonElement): Promise<void> {
    const sounds = this.soundCatalog.sounds.filter(
      (sound) => Boolean(sound.sf2ObjectKey) && !this.installedFixedSoundIds.has(sound.id),
    );
    if (sounds.length === 0) {
      const hasPublishedSounds = this.soundCatalog.sounds.some((sound) => Boolean(sound.sf2ObjectKey));
      button.textContent = hasPublishedSounds ? 'Tudo baixado' : 'Baixar tudo';
      button.disabled = true;
      return;
    }

    const notQueued = sounds.filter((sound) => !this.activeSoundDownloads.has(sound.id));
    const knownTotalBytes = notQueued.reduce((total, sound) => total + (sound.byteSize ?? 0), 0);
    if (!(await hasStorageFor(knownTotalBytes || undefined))) {
      button.textContent = 'Sem espaço';
      this.updateSoundDownloadMessage('Armazenamento insuficiente para baixar todos os timbres restantes.');
      return;
    }

    this.soundDownloadBatchIds = new Set(sounds.map((sound) => sound.id));
    for (const sound of notQueued) {
      this.activeSoundDownloads.set(sound.id, {
        sound, percentage: 0, abort: new AbortController(), state: 'queued',
      });
    }
    this.syncSoundDownloadButtons(modal);
    this.syncDownloadAllButton(modal);
    this.renderActiveSoundDownloadsBanner();
    void this.processSoundDownloadQueue();
  }

  private async showDownloadAllConfirmation(modal: HTMLElement, button: HTMLButtonElement): Promise<void> {
    const sounds = this.soundCatalog.sounds.filter(
      (sound) => Boolean(sound.sf2ObjectKey) && !this.installedFixedSoundIds.has(sound.id),
    );
    if (sounds.length === 0) {
      button.textContent = 'Tudo baixado';
      button.disabled = true;
      return;
    }

    const toQueue = sounds.filter((sound) => !this.activeSoundDownloads.has(sound.id));
    const knownTotalBytes = toQueue.reduce((total, sound) => total + (sound.byteSize ?? 0), 0);
    button.disabled = true;
    const hasSpace = await hasStorageFor(knownTotalBytes || undefined);
    if (!button.isConnected) return;
    button.disabled = false;
    if (!hasSpace) {
      button.textContent = 'Sem espaço';
      this.updateSoundDownloadMessage(
        `Espaço insuficiente. Os ${toQueue.length} timbres que faltam na fila precisam de ${formatBytes(knownTotalBytes)}.`,
      );
      return;
    }

    modal.querySelector('[data-download-all-confirmation]')?.remove();
    const confirmation = document.createElement('section');
    confirmation.className = 'user-sf2-remove-confirmation sound-library-download-confirmation';
    confirmation.dataset.downloadAllConfirmation = '';
    confirmation.setAttribute('role', 'alertdialog');
    confirmation.setAttribute('aria-modal', 'true');
    confirmation.setAttribute('aria-label', 'Confirmar download de todos os timbres');
    confirmation.innerHTML = `
      <div>
        <small>Biblioteca Hook Keys</small>
        <strong>Baixar todos os timbres?</strong>
        <p>${toQueue.length} timbres serão adicionados à fila (${formatBytes(knownTotalBytes)}). O download atual continuará normalmente.</p>
        <span>
          <button type="button" data-download-all-choice="cancel">Cancelar</button>
          <button type="button" data-download-all-choice="confirm">Baixar</button>
        </span>
      </div>
    `;
    modal.append(confirmation);
    confirmation.querySelector<HTMLButtonElement>('[data-download-all-choice="cancel"]')?.focus();
  }

  private showDeleteAllConfirmation(modal: HTMLElement): void {
    const installedOfficial = this.soundCatalog.sounds.filter(
      (sound) => Boolean(sound.sf2ObjectKey) && this.installedFixedSoundIds.has(sound.id),
    );
    if (installedOfficial.length === 0) return;
    const knownBytes = installedOfficial.reduce((total, sound) => total + (sound.byteSize ?? 0), 0);
    modal.querySelector('[data-delete-all-confirmation]')?.remove();
    const confirmation = document.createElement('section');
    confirmation.className = 'user-sf2-remove-confirmation sound-library-download-confirmation';
    confirmation.dataset.deleteAllConfirmation = '';
    confirmation.setAttribute('role', 'alertdialog');
    confirmation.setAttribute('aria-modal', 'true');
    confirmation.setAttribute('aria-label', 'Confirmar apagar toda a biblioteca');
    confirmation.innerHTML = `
      <div>
        <small>Biblioteca Hook Keys</small>
        <strong>Apagar todos os timbres baixados?</strong>
        <p>Serão apagados ${installedOfficial.length} timbres (${formatBytes(knownBytes)}) deste aparelho. Módulos que os usam ficam sem timbre.</p>
        <span>
          <button type="button" data-delete-all-choice="cancel">Cancelar</button>
          <button type="button" data-delete-all-choice="confirm">Apagar</button>
        </span>
      </div>
    `;
    modal.append(confirmation);
    confirmation.querySelector<HTMLButtonElement>('[data-delete-all-choice="cancel"]')?.focus();
  }

  private async deleteAllOfficialSounds(modal: HTMLElement, button: HTMLButtonElement): Promise<void> {
    const installedOfficial = this.soundCatalog.sounds.filter(
      (sound) => Boolean(sound.sf2ObjectKey) && this.installedFixedSoundIds.has(sound.id),
    );
    if (installedOfficial.length === 0) return;
    button.disabled = true;
    let removed = 0;
    try {
      for (const sound of installedOfficial) {
        if (button.isConnected) button.textContent = `Apagando ${removed + 1}/${installedOfficial.length}`;
        await this.soundLibraryEngine.remove(sound.id);
        this.installedFixedSoundIds.delete(sound.id);
        const reference = `fixed:${sound.id}`;
        for (const bank of this.bankStates.values()) {
          for (const preset of bank.presets) {
            for (let moduleIndex = 0; moduleIndex < preset.modules.length; moduleIndex += 1) {
              const module = preset.modules[moduleIndex];
              if (!module || module.timbreId !== reference) continue;
              module.timbreId = null;
              module.timbreName = moduleEmptySoundName(moduleIndex + 1);
              module.timbreColor = null;
            }
          }
        }
        removed += 1;
        const soundButton = Array.from(modal.querySelectorAll<HTMLButtonElement>('[data-fixed-sound-id]'))
          .find((candidate) => candidate.dataset.fixedSoundId === sound.id);
        if (soundButton) {
          soundButton.classList.remove('is-installed');
          soundButton.classList.add('is-downloadable');
          soundButton.setAttribute('aria-label', `${sound.name}. Não baixado`);
          const state = soundButton.querySelector<HTMLElement>('small');
          if (state) state.textContent = 'Baixar';
        }
      }
      this.nativeLoadedTimbres.fill(null);
      this.restoreActivePresetState();
      this.markPlayerStateChanged();
      void this.syncNativeEngine();
      await this.renderSoundLibraryTotals(modal);
    } catch {
      this.updateSoundDownloadMessage('Não foi possível apagar toda a biblioteca.');
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = 'Apagar biblioteca';
      }
    }
  }

  private async selectUserSoundfont(moduleNumber: number, button: HTMLButtonElement): Promise<void> {
    if (this.suppressNextUserSoundfontClick) {
      this.suppressNextUserSoundfontClick = false;
      return;
    }
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    const id = button.dataset.userSoundfontId;
    const name = button.dataset.userSoundfontName;
    if (!moduleState || !id || !name) return;
    const previousSelection = {
      category: moduleState.category,
      timbreId: moduleState.timbreId,
      timbreName: moduleState.timbreName,
      timbreColor: moduleState.timbreColor,
      settings: cloneSettings(moduleState.settings),
      settingsMode: moduleState.settingsMode,
      userSettings: moduleState.userSettings ? cloneSettings(moduleState.userSettings) : null,
    };
    const selectionRevision = ++this.soundfontSelectionRevision;
    moduleState.category = 'user';
    moduleState.timbreId = `user:${id}`;
    moduleState.timbreName = name;
    moduleState.timbreColor = normalizeSoundColor(button.dataset.userSoundfontColor);
    // User nasce a partir do Default somente na primeira vez. Depois disso a
    // troca de SF2 altera apenas o timbre: se User está ativo, todos os ajustes
    // continuam ativos; se Default está ativo, só ele acompanha o novo timbre
    // e o User já criado permanece guardado para quando o músico voltar nele.
    if (moduleState.settingsMode === 'user') {
      moduleState.userSettings = cloneSettings(moduleState.settings);
    } else {
      moduleState.settings = this.defaultSettingsForModule(moduleNumber, moduleState);
    }
    // O carregamento nativo pode levar alguns instantes. Marque a escolha no
    // DOM antes de desabilitar o botão para o usuário nunca enxergar um card
    // cinza enquanto o SF2 é preparado.
    for (const candidate of button.parentElement?.querySelectorAll<HTMLButtonElement>('[data-user-soundfont-id]') ?? []) {
      const selected = candidate === button;
      candidate.classList.toggle('is-current-timbre', selected);
      candidate.setAttribute('aria-current', String(selected));
    }
    this.restoreActivePresetState();
    this.markPlayerStateChanged();
    if (!hookKeysNative.isAvailable()) {
      this.closeModal();
      return;
    }
    const message = this.modal?.querySelector<HTMLElement>('[data-user-sf2-load-status]');
    const loading = this.showSoundLoadingOverlay(this.modal, name, moduleNumber);
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    if (message) message.textContent = `Carregando ${name} no módulo ${moduleNumber}...`;
    if (this.nativeSyncTimer !== null) {
      window.clearTimeout(this.nativeSyncTimer);
      this.nativeSyncTimer = null;
    }
    await this.syncNativeEngine();
    if (selectionRevision !== this.soundfontSelectionRevision) {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      return;
    }
    if (!button.isConnected) return;
    button.disabled = false;
    button.removeAttribute('aria-busy');
    if (this.nativeLoadedTimbres[moduleNumber - 1] !== moduleState.timbreId) {
      Object.assign(moduleState, previousSelection);
      this.restoreActivePresetState();
      this.markPlayerStateChanged();
      if (message) message.textContent = `Não foi possível carregar ${name}. Confira se o arquivo SF2 é válido.`;
      this.showSoundLoadingError(loading, `Não foi possível carregar ${name}. Confira se o arquivo SF2 é válido.`);
      return;
    }
    this.setStatus(`${name} carregado no módulo ${moduleNumber}.`);
    this.closeModal();
  }

  private async loadAcquireLicenseUrl(modal: HTMLElement): Promise<void> {
    const button = modal.querySelector<HTMLButtonElement>('[data-modal-action="acquire-license"]');
    if (!button) return;
    try {
      const url = await this.accountControls.getAcquireLicenseUrl();
      if (!modal.isConnected || !url) return;
      button.dataset.purchaseUrl = url;
      button.disabled = false;
    } catch {
      // O botão permanece indisponível até que a conexão volte.
    }
  }

  private async loadSupportUrl(modal: HTMLElement): Promise<void> {
    const button = modal.querySelector<HTMLButtonElement>('[data-modal-action="open-support"]');
    if (!button) return;
    try {
      const url = await this.accountControls.getSupportUrl();
      if (!modal.isConnected || !isWhatsAppSupportUrl(url)) return;
      button.dataset.supportUrl = url;
      button.disabled = false;
    } catch {
      // O botão permanece indisponível até que a conexão volte.
    }
  }

  private async loadCompatibilityVideoUrl(): Promise<void> {
    try {
      this.compatibilityVideoUrl = await this.accountControls.getCompatibilityVideoUrl();
    } catch {
      this.compatibilityVideoUrl = '';
    }
  }

  private beginPasswordReset(button: HTMLButtonElement): void {
    this.openChildModal('password-reset', null, button);
  }

  private async saveNewPassword(modal: HTMLElement, button: HTMLButtonElement): Promise<void> {
    const password = modal.querySelector<HTMLInputElement>('[data-new-password]');
    const confirmation = modal.querySelector<HTMLInputElement>('[data-confirm-new-password]');
    const message = modal.querySelector<HTMLElement>('.user-device-message');
    if (!password || !confirmation) return;
    if (password.value !== confirmation.value) {
      if (message) message.textContent = 'As senhas não são iguais.';
      return;
    }
    if (password.value.length < 8) return;
    button.disabled = true;
    try {
      await this.accountControls.changePassword(password.value, confirmation.value);
      if (message) {
        message.classList.remove('is-error');
        message.textContent = 'Senha alterada com sucesso.';
      }
      window.setTimeout(() => {
        if (this.currentModalKind === 'password-reset') this.returnToPreviousModal();
      }, 650);
    } catch {
      if (message) message.textContent = 'Não foi possível alterar a senha. Tente novamente.';
      button.disabled = false;
    }
  }

  private async loadUserDevices(modal: HTMLElement): Promise<void> {
    const container = modal.querySelector<HTMLElement>('[data-user-licenses]');
    if (!container) return;
    try {
      const overview = await this.accountControls.listDevices();
      if (!modal.isConnected) return;
      const items = overview.devices.map((device) => `
        <article class="user-device${device.current ? ' is-current' : ''}">
          <span><strong>${escapeMarkup(device.name)}</strong><small>${device.current ? 'Este dispositivo' : escapeMarkup(device.platform || 'Dispositivo')}</small></span>
          <button type="button" data-remove-device="${device.id}">Remover</button>
        </article>
      `).join('');
      container.innerHTML = `
        <div class="user-license-summary">
          <strong>${overview.usedLicenses} de ${overview.totalLicenses}</strong>
          <span>licenças utilizadas</span>
        </div>
        <div class="user-device-list"${modal.dataset.showDevices === 'true' ? '' : ' hidden'}>${items || '<p>Nenhum dispositivo conectado.</p>'}</div>
        <p class="user-device-message" role="status" aria-live="polite"></p>
      `;
    } catch {
      container.innerHTML = `
        <p class="user-device-message is-error">Conecte-se à internet para carregar e gerenciar seus dispositivos.</p>
        <button class="user-device-retry" type="button" data-action="reload-devices">Tentar novamente</button>
      `;
      container.querySelector<HTMLButtonElement>('[data-action="reload-devices"]')?.addEventListener('click', () => {
        void this.loadUserDevices(modal);
      });
    }
  }

  private async requestUserDeviceRemoval(
    modal: HTMLElement,
    deviceId: string,
    button: HTMLButtonElement,
  ): Promise<void> {
    button.disabled = true;
    const message = modal.querySelector<HTMLElement>('.user-device-message');
    if (message) message.textContent = '';
    const container = requiredElement<HTMLElement>(modal, '[data-user-licenses]');
    container.innerHTML = `
      <div class="user-removal-confirmation">
        <strong>Remover dispositivo?</strong>
        <p>Digite sua senha para confirmar a remoção.</p>
        <input type="password" minlength="8" maxlength="128" autocomplete="current-password" data-device-removal-password>
        <p class="user-device-message is-error" role="alert" aria-live="polite"></p>
        <button type="button" data-confirm-device-removal="${deviceId}" disabled>Confirmar remoção</button>
        <button type="button" class="user-device-cancel" data-action="reload-devices">Cancelar</button>
      </div>
    `;
    const input = requiredElement<HTMLInputElement>(container, '[data-device-removal-password]');
    const confirm = requiredElement<HTMLButtonElement>(container, '[data-confirm-device-removal]');
    input.addEventListener('input', () => { confirm.disabled = input.value.length < 8; });
    container.querySelector<HTMLButtonElement>('[data-action="reload-devices"]')?.addEventListener('click', () => {
      void this.loadUserDevices(modal);
    });
  }

  private async confirmUserDeviceRemoval(
    modal: HTMLElement,
    deviceId: string,
    button: HTMLButtonElement,
  ): Promise<void> {
    const input = modal.querySelector<HTMLInputElement>('[data-device-removal-password]');
    const message = modal.querySelector<HTMLElement>('.user-device-message');
    if (!input || input.value.length < 8) return;
    button.disabled = true;
    try {
      const result = await this.accountControls.confirmDeviceRemoval(deviceId, input.value);
      input.value = '';
      if (result.currentDeviceRemoved) {
        await this.accountControls.finishCurrentDeviceRemoval();
        return;
      }
      await this.loadUserDevices(modal);
    } catch {
      if (message) message.textContent = 'Senha incorreta. Tente novamente.';
      input.value = '';
      input.disabled = false;
      button.disabled = true;
    }
  }

  private handleAppSettingsChange(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.dataset.setting === 'compatibility-mode') {
      const requestedMode = target.checked;
      target.checked = this.compatibilityMode;
      this.pendingCompatibilityMode = requestedMode;
      this.openChildModal('compatibility-mode', null, target);
      return;
    }
    if (target instanceof HTMLInputElement && target.dataset.setting === 'lite-mode') {
      this.liteMode = target.checked;
      const seamless = this.modal?.querySelector<HTMLInputElement>('[data-setting="seamless-preset-switching"]');
      if (seamless) seamless.disabled = this.liteMode;
      if (this.liteMode && this.seamlessPresetSwitching) {
        this.seamlessPresetSwitching = false;
        if (seamless) seamless.checked = false;
        this.nativePresetTransitionPending = false;
        void hookKeysNative.stopAllNotes();
        void hookKeysNative.setSeamlessPresetSwitching(false);
      }
      this.applyLiteMode();
      this.markPlayerStateChanged();
      return;
    }
    if (target instanceof HTMLInputElement && target.dataset.setting === 'seamless-preset-switching') {
      if (this.liteMode) {
        target.checked = false;
        return;
      }
      this.seamlessPresetSwitching = target.checked;
      if (!target.checked) {
        this.nativePresetTransitionPending = false;
        void hookKeysNative.stopAllNotes();
      }
      this.markPlayerStateChanged();
      void hookKeysNative.setSeamlessPresetSwitching(target.checked);
      return;
    }
    const select = target;
    if (!(select instanceof HTMLSelectElement)) return;
    if (select.dataset.setting === 'midi-device') {
      const slot = Number.parseInt(select.dataset.midiSlot ?? '', 10);
      if (!Number.isInteger(slot) || slot < 0 || slot > 2) return;
      const selectedId = select.value || null;
      this.selectedMidiInputIds = this.selectedMidiInputIds.map((deviceId, index) => (
        index !== slot && selectedId !== null && deviceId === selectedId ? null : deviceId
      ));
      this.selectedMidiInputIds[slot] = selectedId;
      this.applySelectedMidiInputs();
      if (this.modal) this.refreshMidiDeviceOptions(this.modal);
      this.markPlayerStateChanged();
      return;
    }
    if (select.dataset.setting === 'buffer-size') {
      const value = Number.parseInt(select.value, 10);
      if (isBufferSize(value)) {
        this.bufferSize = value;
        this.markPlayerStateChanged();
        void this.applyNativeAudioOutputWithFeedback(true);
      }
      return;
    }
    if (select.dataset.setting === 'sample-rate') {
      const value = Number.parseInt(select.value, 10);
      if (isSampleRate(value) && value !== this.sampleRate) {
        this.sampleRate = value;
        this.markPlayerStateChanged();
        void this.applyNativeAudioOutputWithFeedback(false);
      }
      return;
    }
    if (select.dataset.setting === 'audio-device') {
      this.selectedAudioDeviceId = select.value;
      this.normalizeAudioRoutes();
      this.refreshAudioRoutingSelects(this.modal);
      this.markPlayerStateChanged();
      void this.applyNativeAudioOutput();
      return;
    }
    if (select.dataset.setting === 'audio-route') {
      const bus = select.dataset.audioBus;
      const channels = this.activeAudioChannelCount();
      if (isAudioRoutingBus(bus) && isAudioBusRoute(select.value, channels)) {
        this.audioRouting[bus] = select.value;
        this.markPlayerStateChanged();
        if (bus === 'metronome') void this.applyMetronomeOutput();
        // Os módulos que ficaram no Padrão seguem esta saída.
        if (bus === 'timbres') void this.syncNativeEngine();
      }
    }
  }

  private handleModuleSettingsChange(event: Event, moduleNumber: number): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return;
    const target = event.target;
    if (target instanceof HTMLInputElement && target.matches('[data-glide-time]')) {
      this.updateGlideControl(this.modal, target, moduleNumber);
      return;
    }
    if (target instanceof HTMLInputElement && target.matches('[data-module-envelope]')) {
      this.updateModuleEnvelopeControl(this.modal, target, moduleNumber);
      this.markPlayerStateChanged();
      return;
    }
    if (target instanceof HTMLInputElement && target.matches('[data-module-cutoff]')) {
      this.updateModuleCutoffControl(this.modal, target, moduleNumber);
      this.markPlayerStateChanged();
      return;
    }
    const select = target;
    if (!(select instanceof HTMLSelectElement)) return;
    if (select.dataset.moduleSetting === 'audio-route') {
      // Padrão não guarda saída: o módulo passa a seguir Saídas - Módulos.
      if (select.value === 'default') {
        delete moduleState.settings.outputRoute;
        this.markPlayerStateChanged();
        void this.syncNativeEngine();
        return;
      }
      if (isAudioBusRoute(select.value, this.activeAudioChannelCount())) {
        moduleState.settings.outputRoute = select.value;
        this.markPlayerStateChanged();
        void this.syncNativeEngine();
      }
      return;
    }
    if (select.dataset.moduleSetting !== 'midi-device') return;
    const deviceId = select.value || null;
    moduleState.midiInputId = deviceId && this.selectedMidiInputIds.includes(deviceId)
      ? deviceId
      : null;
    this.markPlayerStateChanged();
  }

  // O perfil leve (menos sombra, menos transição) vale sempre: no iPad antigo
  // é ele que mantém a interface fluida e no aparelho novo não faz falta.
  private applyLiteMode(): void {
    this.root.classList.add('hook-keys-lite');
    // A tecla acesa é a única parte do Lite que se liga e desliga por aqui.
    this.root.classList.toggle('hook-keys-lite-keys', this.liteMode);
    this.performanceKeyboard?.setKeyLighting(!this.liteMode);
  }

  private updateModuleEnvelopeControl(
    modal: HTMLElement | null,
    input: HTMLInputElement,
    moduleNumber: number,
  ): void {
    const parameter = input.dataset.moduleEnvelope;
    if (!isModuleEnvelopeParameter(parameter)) return;
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return;
    const maximum = MODULE_ENVELOPE_LIMITS[parameter];
    const parsed = Number(input.value);
    if (!Number.isFinite(parsed)) return;
    const value = Math.min(maximum, Math.max(0, parsed));
    moduleState.settings[parameter] = value;
    const angle = -135 + ((value / maximum) * 270);
    input.closest<HTMLElement>('.module-envelope-knob')?.style.setProperty('--knob-angle', `${angle}deg`);
    input.closest<HTMLElement>('.module-envelope-knob')?.style.setProperty('--knob-progress', String(value / maximum));
    input.setAttribute('aria-valuetext', formatEnvelopeTime(value));
    const output = modal?.querySelector<HTMLOutputElement>(`[data-module-envelope-value="${parameter}"]`);
    if (output) output.value = formatEnvelopeTime(value);
  }

  private updateModuleCutoffControl(
    modal: HTMLElement | null,
    input: HTMLInputElement,
    moduleNumber: number,
  ): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return;
    const parsed = Number(input.value);
    if (!Number.isFinite(parsed)) return;
    const ratio = Math.min(1, Math.max(0, parsed));
    const frequency = cutoffFrequencyFromRatio(ratio);
    moduleState.settings.cutoffHz = frequency;
    const angle = -135 + ratio * 270;
    input.closest<HTMLElement>('.module-envelope-knob')?.style.setProperty('--knob-angle', `${angle}deg`);
    input.closest<HTMLElement>('.module-envelope-knob')?.style.setProperty('--knob-progress', String(ratio));
    const formatted = formatCutoffFrequency(frequency);
    input.setAttribute('aria-valuetext', formatted);
    const output = modal?.querySelector<HTMLOutputElement>('[data-module-cutoff-value]');
    if (output) output.value = formatted;
  }

  private updateFilterVelocityCutoff(modal: HTMLElement, input: HTMLInputElement, moduleNumber: number): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    const parsed = Number(input.value);
    if (!moduleState || !Number.isFinite(parsed)) return;
    const ratio = Math.min(1, Math.max(0, parsed));
    const frequency = cutoffFrequencyFromRatio(ratio);
    moduleState.settings.filterVelocityCutoffHz = frequency;
    const knob = input.closest<HTMLElement>('.module-envelope-knob');
    knob?.style.setProperty('--knob-angle', `${-135 + ratio * 270}deg`);
    knob?.style.setProperty('--knob-progress', String(ratio));
    const formatted = formatCutoffFrequency(frequency);
    input.setAttribute('aria-valuetext', formatted);
    const output = modal.querySelector<HTMLOutputElement>('[data-filter-velocity-cutoff-value]');
    if (output) output.value = formatted;
  }

  private toggleFilterVelocity(modal: HTMLElement, moduleNumber: number): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return;
    const enabled = !readFilterVelocityEnabled(moduleState.settings);
    moduleState.settings.filterVelocityEnabled = enabled;
    updateFilterVelocityPowerMarkup(modal, enabled);
    this.markPlayerStateChanged();
  }

  private updateModuleVelocityLimit(input: HTMLInputElement, moduleNumber: number): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return;
    const limit = readVelocityLimit(input.value);
    moduleState.settings.velocityLimit = limit;
    input.closest<HTMLElement>('.module-envelope-knob')?.style.setProperty('--knob-angle', `${-135 + (limit / 127) * 270}deg`);
    input.closest<HTMLElement>('.module-envelope-knob')?.style.setProperty('--knob-progress', String(limit / 127));
    input.setAttribute('aria-valuetext', String(limit));
    const output = input.closest<HTMLElement>('[data-module-velocity-limit-card]')
      ?.querySelector<HTMLOutputElement>('[data-module-velocity-limit-value]');
    if (output) output.value = String(limit);
    this.markPlayerStateChanged();
  }

  private setModuleVelocityCeiling(modal: HTMLElement, moduleNumber: number, value: number): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    const editor = modal.querySelector<HTMLElement>('.velocity-curve-editor');
    if (!moduleState || !editor) return;
    const ceiling = Math.max(1, readVelocityLimit(value));
    if (readVelocityLimit(moduleState.settings.velocityCeiling) === ceiling && moduleState.settings.velocityCeiling !== undefined) return;
    moduleState.settings.velocityCeiling = ceiling;
    updateVelocityCeilingMarkup(editor, ceiling);
    this.markPlayerStateChanged();
  }

  private selectReverbSpace(modal: HTMLElement, moduleNumber: number, name: string | undefined): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState || !isReverbSpace(name)) return;
    const mixes = ensureReverbMixPresets(moduleState.settings);
    moduleState.settings.reverbSpace = name;
    moduleState.settings.reverb = { ...readModuleReverbSettings(moduleState.settings.reverb), mix: mixes[name].mix };
    const page = modal.querySelector<HTMLElement>('.module-reverb-page');
    if (page) page.outerHTML = createModuleReverbMarkup(moduleState.settings);
    this.markPlayerStateChanged();
    void this.syncNativeEngine();
  }

  private selectModuleSettingsPage(
    modal: HTMLElement,
    moduleNumber: number,
    page: ModuleSettingsPage,
  ): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    const workspace = modal.querySelector<HTMLElement>('[data-module-settings-workspace]');
    const row = modal.querySelector<HTMLElement>('.module-settings-pages');
    if (!moduleState || !workspace || !row || this.moduleConfigPage === page) return;
    this.moduleConfigPage = page;
    this.moduleConfigPages.set(moduleNumber, page);
    workspace.dataset.page = page;
    workspace.innerHTML = createModuleSettingsPageMarkup(
      page,
      moduleState.settings,
      this.metronome.getBpm(),
      moduleNumber === 7 ? 'organ' : moduleNumber === 8 ? 'synth' : 'chorus',
    );
    for (const button of row.querySelectorAll<HTMLButtonElement>('[data-module-settings-page]')) {
      const selected = button.dataset.moduleSettingsPage === page;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-selected', String(selected));
    }
    this.renderModuleSettingsPagePower(modal, moduleNumber);
  }

  // O ON/OFF do rodapé e o Reset das abas seguem o processador aberto.
  private renderModuleSettingsPagePower(modal: HTMLElement, moduleNumber: number): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    const power = modal.querySelector<HTMLButtonElement>('.player-modal__actions [data-module-effect-power]');
    const reset = modal.querySelector<HTMLButtonElement>('.player-modal__actions [data-reset-processor]');
    const inDefaultMode = moduleState?.settingsMode === 'default';
    if (reset) {
      reset.hidden = inDefaultMode;
      reset.dataset.resetProcessor = this.moduleConfigPage;
    }
    const page = this.moduleConfigPage;
    if (!moduleState) return;
    // O Envelope não tem ON/OFF: a vaga do meio fica vazia e o Reset continua
    // na direita.
    if (page === 'envelope') {
      if (power) power.hidden = true;
      return;
    }
    const enabled = page === 'eq'
      ? moduleState.settings.eqEnabled !== false
      : page === 'arpeggiator'
        ? readArpeggiatorSettings(moduleState.settings.arpeggiator).enabled
        : page === 'trance-gate'
          ? readTranceGateSettings(moduleState.settings.tranceGate).enabled
          : readModuleEffectSettings(page, moduleState.settings[page]).enabled;
    if (power) {
      power.hidden = false;
      power.dataset.moduleEffectPower = page;
      power.classList.toggle('is-on', enabled);
      power.classList.toggle('is-off', !enabled);
      power.textContent = enabled ? 'ON' : 'OFF';
      power.setAttribute('aria-pressed', String(enabled));
    }
  }

  private selectModuleModulationMode(
    modal: HTMLElement,
    moduleNumber: number,
    mode: ModuleModulationMode,
  ): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    const card = modal.querySelector<HTMLElement>('[data-module-mod-card]');
    if (!moduleState || !card || readModuleModulationMode(moduleState.settings) === mode) return;
    moduleState.settings.modulationMode = mode;
    if (moduleNumber === 7) {
      const rotary = readModuleRotarySettings(moduleState.settings.rotary);
      rotary.modulationEnabled = mode === 'rotary';
      moduleState.settings.rotary = rotary;
    }
    card.outerHTML = createModuleModulationCardMarkup(
      moduleState.settings, moduleNumber === 8 ? 'synth' : moduleNumber === 7 ? 'organ' : 'sf2');
    this.markPlayerStateChanged();
    void this.syncNativeEngine();
  }

  private updateModuleModulationIntensity(input: HTMLInputElement, moduleNumber: number): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    const mode = input.dataset.moduleModulationIntensity;
    if (!moduleState || (mode !== 'pan' && mode !== 'tremolo')) return;
    const value = Math.round(boundedNumber(input.value, 0, 100, 100));
    moduleState.settings[mode === 'pan' ? 'panIntensity' : 'tremoloIntensity'] = value;
    input.value = String(value);
    input.setAttribute('aria-valuetext', `${value}%`);
    const control = input.closest<HTMLElement>('.module-effect-knob');
    control?.style.setProperty('--knob-angle', `${-135 + value * 2.7}deg`);
    control?.style.setProperty('--knob-progress', String(value / 100));
    const output = control?.querySelector<HTMLOutputElement>('output');
    if (output) output.value = `${value}%`;
    this.syncKnobFocus(input);
    this.markPlayerStateChanged();
    this.scheduleNativeEngineSync();
  }

  // Drawbars do Hook B3: são faders. O dedo cai na calha e a barra vai para
  // onde ele está; quanto mais para baixo, mais aquela voz entra.
  private organDrawbarPositionAt(track: HTMLElement, clientY: number): number {
    const rect = track.getBoundingClientRect();
    const grip = Number.parseFloat(getComputedStyle(track.closest<HTMLElement>('.organ-drawbar') ?? track)
      .getPropertyValue('--drawbar-grip')) || 16;
    const travel = Math.max(1, rect.height - grip);
    const offset = clientY - rect.top - grip / 2;
    return Math.min(ORGAN_DRAWBAR_MAX, Math.max(0, Math.round(offset / travel * ORGAN_DRAWBAR_MAX)));
  }

  // A régua também é mapeável: cada drawbar vira um module-control próprio,
  // do mesmo jeito que os knobs comuns.
  private ccLearnTargetForOrganDrawbar(track: HTMLElement, moduleNumber: number): CcLearnTarget | null {
    const index = Number(track.dataset.organDrawbarTrack);
    if (!Number.isInteger(index)) return null;
    const drawbar = ORGAN_DRAWBARS[index];
    if (!drawbar) return null;
    return {
      kind: 'module-control', moduleNumber, control: `organ:drawbar:${index}`,
      label: `Drawbar ${drawbar.feet}`,
    };
  }

  private startOrganDrawbarDrag(event: PointerEvent, moduleNumber: number | null): boolean {
    // Sem isPrimary: cada dedo é um pointerId próprio, e todos precisam poder
    // começar um arrasto — só o botão do mouse continua exigido fora do touch.
    if (event.pointerType === 'mouse' && event.button !== 0) return false;
    if (!(event.target instanceof Element) || moduleNumber === null) return false;
    const track = event.target.closest<HTMLElement>('[data-organ-drawbar-track]');
    if (!track) return false;
    event.preventDefault();
    capturePointer(track, event.pointerId);
    this.organDrawbarDrags.set(event.pointerId, { track, moduleNumber });
    this.applyOrganDrawbar(track, moduleNumber, this.organDrawbarPositionAt(track, event.clientY));
    const learnTarget = this.ccLearnTargetForOrganDrawbar(track, moduleNumber);
    if (!this.desktopRuntime && learnTarget) {
      this.knobCcLearnGesture.start(event, () => {
        releasePointer(track, event.pointerId);
        this.organDrawbarDrags.delete(event.pointerId);
        this.openCcLearn(learnTarget, track);
      });
    }
    return true;
  }

  private moveOrganDrawbarDrag(event: PointerEvent): boolean {
    const drag = this.organDrawbarDrags.get(event.pointerId);
    if (!drag) return false;
    event.preventDefault();
    this.applyOrganDrawbar(
      drag.track, drag.moduleNumber, this.organDrawbarPositionAt(drag.track, event.clientY));
    return true;
  }

  private endOrganDrawbarDrag(event: PointerEvent): void {
    const drag = this.organDrawbarDrags.get(event.pointerId);
    if (!drag) return;
    releasePointer(drag.track, event.pointerId);
    this.organDrawbarDrags.delete(event.pointerId);
    void this.syncNativeEngine();
  }

  private applyOrganDrawbar(track: HTMLElement, moduleNumber: number, position: number): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    const index = Number(track.dataset.organDrawbarTrack);
    if (!moduleState || !Number.isInteger(index)) return;
    const settings = readOrganSettings(moduleState.settings.organ);
    if (settings.drawbars[index] === position) return;
    settings.drawbars[index] = position;
    moduleState.settings.organ = settings;
    const bar = track.closest<HTMLElement>('.organ-drawbar');
    bar?.style.setProperty('--drawbar-position', String(position));
    track.setAttribute('aria-valuenow', String(position));
    track.setAttribute('aria-valuetext', `${position} de ${ORGAN_DRAWBAR_MAX}`);
    const input = bar?.querySelector<HTMLInputElement>('[data-organ-drawbar]');
    if (input) input.value = String(position);
    const output = bar?.querySelector<HTMLOutputElement>('[data-organ-drawbar-value]');
    if (output) output.value = String(position);
    // Dois LEDs por estágio: o mesmo cálculo do createOrganMarkup.
    bar?.querySelectorAll('.organ-drawbar__leds i').forEach((led, ledIndex) => {
      led.classList.toggle('is-lit', ledIndex + 1 <= position * 2);
    });
    this.markPlayerStateChanged();
  }

  // Sustain: o nível em que a nota segura enquanto a tecla está presa.
  private updateModuleSustain(input: HTMLInputElement, moduleNumber: number): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return;
    const value = Math.min(0, Math.max(MODULE_SUSTAIN_MIN_DB, Number(input.value) || 0));
    moduleState.settings.sustainDb = value;
    const progress = (value - MODULE_SUSTAIN_MIN_DB) / -MODULE_SUSTAIN_MIN_DB;
    const knob = input.closest<HTMLElement>('.module-envelope-knob');
    knob?.style.setProperty('--knob-angle', `${-135 + progress * 270}deg`);
    knob?.style.setProperty('--knob-progress', String(progress));
    const label = formatModuleSustainDb(value);
    input.setAttribute('aria-valuetext', label);
    const output = input.closest<HTMLElement>('.module-envelope-control')
      ?.querySelector<HTMLOutputElement>('[data-module-sustain-value]');
    if (output) output.value = label;
    this.markPlayerStateChanged();
    void this.syncNativeEngine();
  }

  // Gain do módulo: ganho de entrada, antes dos processadores.
  private updateModuleGain(input: HTMLInputElement, moduleNumber: number): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return;
    const value = Math.min(MODULE_GAIN_MAX_DB, Math.max(MODULE_GAIN_MIN_DB, Number(input.value) || 0));
    moduleState.settings.gainDb = value;
    const progress = (value - MODULE_GAIN_MIN_DB) / (MODULE_GAIN_MAX_DB - MODULE_GAIN_MIN_DB);
    const knob = input.closest<HTMLElement>('.module-envelope-knob');
    knob?.style.setProperty('--knob-angle', `${-135 + progress * 270}deg`);
    knob?.style.setProperty('--knob-progress', String(progress));
    const label = formatModuleGainDb(value);
    input.setAttribute('aria-valuetext', label);
    const output = input.closest<HTMLElement>('[data-module-gain-card]')
      ?.querySelector<HTMLOutputElement>('[data-module-gain-value]');
    if (output) output.value = label;
    this.markPlayerStateChanged();
    void this.syncNativeEngine();
  }

  private updateModuleModulationRate(input: HTMLInputElement, moduleNumber: number): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return;
    const value = Math.min(20, Math.max(0.1, Number(input.value) || DEFAULT_MODULE_MODULATION_RATE_HZ));
    moduleState.settings.modulationRateHz = value;
    const progress = (value - 0.1) / 19.9;
    input.closest<HTMLElement>('.module-envelope-knob')?.style.setProperty('--knob-angle', `${-135 + progress * 270}deg`);
    input.closest<HTMLElement>('.module-envelope-knob')?.style.setProperty('--knob-progress', String(progress));
    input.setAttribute('aria-valuetext', `${value.toFixed(2)} Hz`);
    const output = input.closest<HTMLElement>('[data-module-mod-card]')
      ?.querySelector<HTMLOutputElement>('[data-module-modulation-rate-value]');
    if (output) output.value = `${value.toFixed(2)} Hz`;
    this.markPlayerStateChanged();
  }

  private toggleGlideSync(modal: HTMLElement, moduleNumber: number): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return;
    if (moduleNumber === 8) {
      const settings = readSynthSettings(moduleState.settings.synth);
      settings.glideSync = !settings.glideSync;
      moduleState.settings.synth = settings;
    } else {
      moduleState.settings.glideSync = moduleState.settings.glideSync !== true;
    }
    this.renderGlideCard(modal, moduleNumber);
    this.markPlayerStateChanged();
  }

  // Glide lives in the module settings, or inside the Synth preset for module 8.
  private glideSettings(moduleNumber: number): Record<string, unknown> {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return {};
    return moduleNumber === 8
      ? readSynthSettings(moduleState.settings.synth) as unknown as Record<string, unknown>
      : moduleState.settings;
  }

  private updateGlideSettings(moduleNumber: number, change: (settings: Record<string, unknown>) => void): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return;
    if (moduleNumber === 8) {
      const settings = readSynthSettings(moduleState.settings.synth) as unknown as Record<string, unknown>;
      change(settings);
      moduleState.settings.synth = readSynthSettings(settings);
    } else {
      change(moduleState.settings);
    }
    this.markPlayerStateChanged();
  }

  private updateGlideVelocity(
    modal: HTMLElement,
    moduleNumber: number,
    change: (settings: Record<string, unknown>) => void,
  ): void {
    this.updateGlideSettings(moduleNumber, change);
    const editor = modal.querySelector<HTMLElement>('[data-glide-velocity-editor]');
    if (editor) updateGlideVelocityMarkup(editor, readGlideVelocity(this.glideSettings(moduleNumber)));
  }

  private renderGlideCard(modal: HTMLElement, moduleNumber: number): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    const card = modal.querySelector<HTMLElement>('[data-module-glide-card]');
    if (!moduleState || !card) return;
    const owner = moduleNumber === 8 ? 'synth' : 'module';
    const settings = moduleNumber === 8
      ? readSynthSettings(moduleState.settings.synth) as unknown as Readonly<Record<string, unknown>>
      : moduleState.settings;
    // O toque longo no Mono/Poly abre o mesmo card, só que com o Legato no
    // lugar dos botões de sempre — precisa saber qual modal está aberto.
    card.outerHTML = this.currentModalKind === 'module-voice-mode'
      ? createVoiceModeMarkup(settings, this.metronome.getBpm(), owner)
      : createGlideCardMarkup(settings, this.metronome.getBpm(), owner);
  }

  private updateGlideControl(modal: HTMLElement | null, input: HTMLInputElement, moduleNumber: number): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return;
    const synchronized = input.dataset.glideSynced === 'true';
    const parsed = Number(input.value);
    if (!Number.isFinite(parsed)) return;
    let settings: Record<string, unknown>;
    if (moduleNumber === 8) {
      const synth = readSynthSettings(moduleState.settings.synth);
      settings = synth as unknown as Record<string, unknown>;
      if (!synchronized) synth.glideMs = Math.min(5000, Math.max(0, parsed));
      moduleState.settings.synth = synth;
    } else {
      settings = moduleState.settings;
      if (!synchronized) settings.glideMs = Math.min(5000, Math.max(0, parsed));
    }
    if (synchronized) {
      const currentModal = modal ?? this.modal;
      if (currentModal) this.renderGlideCard(currentModal, moduleNumber);
      return;
    }
    const label = formatGlideMs(effectiveGlideMs(settings, this.metronome.getBpm()));
    const minimum = Number(input.min) || 0;
    const maximum = Number(input.max) || 1;
    const progress = Math.min(1, Math.max(0, (Number(input.value) - minimum) / (maximum - minimum)));
    input.closest<HTMLElement>('.module-envelope-knob')?.style.setProperty('--knob-angle', `${-135 + progress * 270}deg`);
    input.closest<HTMLElement>('.module-envelope-knob')?.style.setProperty('--knob-progress', String(progress));
    input.setAttribute('aria-valuetext', label);
    const output = input.closest<HTMLElement>('[data-module-glide-card]')
      ?.querySelector<HTMLOutputElement>('[data-glide-value]')
      ?? modal?.querySelector<HTMLOutputElement>('[data-glide-value]');
    if (output) output.value = label;
    this.markPlayerStateChanged();
  }

  private knobInputForTarget(target: EventTarget | null): HTMLInputElement | null {
    if (!(target instanceof Element) || target.closest('button, select, a')) return null;
    return target.closest<HTMLElement>('.module-envelope-knob, .module-effect-knob, .player-output-knob')
      ?.querySelector<HTMLInputElement>('input[type="range"]') ?? null;
  }

  private startKnobDrag(event: PointerEvent, moduleNumber: number | null): void {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    // O knob apenas abre o fader. Nenhum gesto nele muda o parâmetro.
    if (this.knobDrag) {
      releasePointer(this.knobDrag.captureElement, this.knobDrag.pointerId);
      this.knobDrag = null;
    }
    const input = this.knobInputForTarget(event.target);
    if (!input || input.disabled) return;

    event.preventDefault();
    input.focus({ preventScroll: true });
    const captureElement = input.closest<HTMLElement>('.module-envelope-knob, .module-effect-knob, .player-output-knob') ?? input;
    capturePointer(captureElement, event.pointerId);
    this.knobDrag = {
      input,
      captureElement,
      pointerId: event.pointerId,
      startY: event.clientY,
      startX: event.clientX,
      moved: false,
    };
    this.showKnobFocus(input);
    const learnTarget = moduleNumber === null ? this.ccLearnTargetForOutputKnob(input) : this.ccLearnTargetForKnob(input, moduleNumber);
    if (!this.desktopRuntime && learnTarget) {
      this.knobCcLearnGesture.start(event, () => {
        releasePointer(captureElement, event.pointerId);
        this.knobDrag = null;
        this.hideKnobFocus();
        this.openCcLearn(learnTarget, input);
      });
    }
  }

  private moveKnobDrag(event: PointerEvent): void {
    const drag = this.knobDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 8) return;
    drag.moved = true;
    this.knobCcLearnGesture.cancel();
  }

  private endKnobDrag(event: PointerEvent): void {
    const drag = this.knobDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    this.knobDrag = null;
    event.preventDefault();
    releasePointer(drag.captureElement, event.pointerId);
    // Enquanto o visor estiver na tela, encostar de novo continua o ajuste do
    // ponto onde parou, sem recomeçar o valor.
    this.hideKnobFocus(KNOB_FOCUS_IDLE_MS);
  }

  private ccLearnTargetForOutputKnob(input: HTMLInputElement): CcLearnTarget | null {
    const bus = input.dataset.outputLevel;
    if (isOutputBus(bus)) return { kind: 'output-volume', bus };
    if (input.matches('[data-metronome-output-volume]')) return { kind: 'metronome-volume' };
    return null;
  }

  private showKnobFocus(input: HTMLInputElement): void {
    if (this.knobFocusHideTimer !== null) {
      window.clearTimeout(this.knobFocusHideTimer);
      this.knobFocusHideTimer = null;
    }
    const overlay = this.root.querySelector<HTMLElement>('[data-knob-focus]');
    const knob = input.closest<HTMLElement>('.module-envelope-knob, .module-effect-knob, .player-output-knob');
    if (!overlay || !knob) return;
    this.knobFocusInput = input;
    const label = knob.querySelector<HTMLElement>(':scope > span:not([class$="__face"])');
    const accent = getComputedStyle(knob).getPropertyValue('--knob-accent').trim();
    if (accent) overlay.style.setProperty('--knob-accent', accent);
    overlay.querySelector<HTMLElement>('[data-knob-focus-label]')!.textContent = label?.textContent?.trim() || input.ariaLabel || '';
    const fader = overlay.querySelector<HTMLInputElement>('[data-knob-focus-fader]');
    if (fader) {
      fader.min = input.min;
      fader.max = input.max;
      fader.step = input.step;
      fader.disabled = input.disabled;
      fader.setAttribute('aria-label', input.ariaLabel || label?.textContent?.trim() || 'Parâmetro');
      const faderTrack = fader.parentElement;
      if (!faderTrack) return;
      let activePointerId: number | null = null;
      let pointerStartY = 0;
      let pointerStartValue = 0;
      const updateFromPointer = (event: PointerEvent): void => {
        const bounds = faderTrack.getBoundingClientRect();
        const minimum = Number(fader.min) || 0;
        const maximum = Number(fader.max) || 100;
        const rawStep = Number(fader.step);
        const step = Number.isFinite(rawStep) && rawStep > 0 ? rawStep : 1;
        const rawValue = pointerStartValue +
          (pointerStartY - event.clientY) / Math.max(1, bounds.height - 20) * (maximum - minimum);
        const stepped = minimum + Math.round((rawValue - minimum) / step) * step;
        const nextValue = String(Math.min(maximum, Math.max(minimum, stepped)));
        if (fader.value === nextValue) return;
        fader.value = nextValue;
        fader.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const finishPointer = (event: PointerEvent): void => {
        if (activePointerId !== event.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        if (faderTrack.hasPointerCapture(event.pointerId)) faderTrack.releasePointerCapture(event.pointerId);
        activePointerId = null;
        const source = this.knobFocusInput;
        if (source?.isConnected) source.dispatchEvent(new Event('change', { bubbles: true }));
        this.hideKnobFocus(KNOB_FOCUS_IDLE_MS);
      };
      faderTrack.onpointerdown = (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        if (this.knobFocusHideTimer !== null) window.clearTimeout(this.knobFocusHideTimer);
        this.knobFocusHideTimer = null;
        activePointerId = event.pointerId;
        pointerStartY = event.clientY;
        pointerStartValue = Number(fader.value);
        faderTrack.setPointerCapture(event.pointerId);
        fader.focus({ preventScroll: true });
      };
      faderTrack.onpointermove = (event) => {
        if (activePointerId !== event.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        updateFromPointer(event);
      };
      faderTrack.onpointerup = finishPointer;
      faderTrack.onpointercancel = finishPointer;
      fader.onchange = () => {
        if (activePointerId !== null) return;
        const source = this.knobFocusInput;
        if (source?.isConnected) source.dispatchEvent(new Event('change', { bubbles: true }));
        this.hideKnobFocus(KNOB_FOCUS_IDLE_MS);
      };
    }
    overlay.classList.add('is-visible');
    overlay.setAttribute('aria-hidden', 'false');
    this.syncKnobFocus(input);
    this.hideKnobFocus(KNOB_FOCUS_IDLE_MS);
  }

  private syncKnobFocus(input: HTMLInputElement): void {
    const overlay = this.root.querySelector<HTMLElement>('[data-knob-focus]');
    const knob = input.closest<HTMLElement>('.module-envelope-knob, .module-effect-knob, .player-output-knob');
    if (!overlay || !knob) return;
    overlay.style.setProperty('--knob-angle', getComputedStyle(knob).getPropertyValue('--knob-angle'));
    overlay.style.setProperty('--knob-progress', getComputedStyle(knob).getPropertyValue('--knob-progress'));
    const fader = overlay.querySelector<HTMLInputElement>('[data-knob-focus-fader]');
    if (fader) {
      fader.value = input.value;
      fader.setAttribute('aria-valuetext', input.getAttribute('aria-valuetext') || input.value);
      const minimum = Number(fader.min);
      const maximum = Number(fader.max);
      const current = Number(fader.value);
      const progress = Number.isFinite(minimum) && Number.isFinite(maximum) && maximum > minimum
        ? Math.min(1, Math.max(0, (current - minimum) / (maximum - minimum)))
        : 0;
      fader.parentElement?.style.setProperty('--focus-fader-progress', String(progress));
    }
    const sourceOutput = knob.querySelector<HTMLOutputElement>('output');
    overlay.querySelector<HTMLOutputElement>('[data-knob-focus-value]')!.value = sourceOutput?.value || input.getAttribute('aria-valuetext') || input.value;
  }

  private hideKnobFocus(delayMs = 0): void {
    if (this.knobFocusHideTimer !== null) {
      window.clearTimeout(this.knobFocusHideTimer);
      this.knobFocusHideTimer = null;
    }
    if (delayMs > 0) {
      this.knobFocusHideTimer = window.setTimeout(() => {
        this.knobFocusHideTimer = null;
        const overlay = this.root.querySelector<HTMLElement>('[data-knob-focus]');
        overlay?.classList.remove('is-visible');
        overlay?.setAttribute('aria-hidden', 'true');
        this.knobFocusInput = null;
      }, delayMs);
      return;
    }
    const overlay = this.root.querySelector<HTMLElement>('[data-knob-focus]');
    overlay?.classList.remove('is-visible');
    overlay?.setAttribute('aria-hidden', 'true');
    this.knobFocusInput = null;
  }

  private ccLearnTargetForKnob(input: HTMLInputElement, moduleNumber: number): CcLearnTarget | null {
    const tranceGateParameter = input.dataset.tranceGateParameter;
    if (tranceGateParameter) {
      return { kind: 'module-control', moduleNumber, control: `tranceGate:${tranceGateParameter}`,
        label: input.ariaLabel || tranceGateParameter };
    }
    const envelope = input.dataset.moduleEnvelope;
    if (isModuleEnvelopeParameter(envelope)) {
      return { kind: 'module-control', moduleNumber, control: envelope, label: input.ariaLabel || envelope };
    }
    if (input.matches('[data-module-cutoff]')) {
      return { kind: 'module-control', moduleNumber, control: 'cutoff', label: 'Cutoff' };
    }
    const synthParameter = input.dataset.synthParameter;
    if (moduleNumber === 8 && synthParameter) {
      return {
        kind: 'module-control',
        moduleNumber,
        control: `synth:${synthParameter}`,
        label: input.ariaLabel || synthParameter,
      };
    }
    const patternKind = input.dataset.patternKind;
    const patternParameter = input.dataset.patternParameter;
    if (patternKind === 'arpeggiator' && patternParameter) {
      return {
        kind: 'module-control',
        moduleNumber,
        control: `arpeggiator:${patternParameter}`,
        label: input.ariaLabel || patternParameter,
      };
    }
    const effectKind = input.dataset.moduleEffectKind;
    const effectControl = input.dataset.moduleEffectControl;
    if (isModuleEffectKind(effectKind) && effectControl) {
      return {
        kind: 'module-control',
        moduleNumber,
        control: `${effectKind}:${effectControl}`,
        label: input.ariaLabel || effectControl,
      };
    }
    return null;
  }

  private applyMappedModuleControl(moduleNumber: number, control: string, ratio: number): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return;
    const progress = Math.min(1, Math.max(0, ratio));
    if (isModuleEnvelopeParameter(control)) {
      moduleState.settings[control] = MODULE_ENVELOPE_LIMITS[control] * progress;
      this.markPlayerStateChanged();
      return;
    }
    if (control === 'cutoff') {
      moduleState.settings.cutoffHz = cutoffFrequencyFromRatio(progress);
      this.markPlayerStateChanged();
      return;
    }

    if (moduleNumber === 7 && control.startsWith('organ:drawbar:')) {
      const index = Number(control.slice('organ:drawbar:'.length));
      if (!Number.isInteger(index)) return;
      const settings = readOrganSettings(moduleState.settings.organ);
      const position = Math.round(progress * ORGAN_DRAWBAR_MAX);
      if (settings.drawbars[index] === position) return;
      settings.drawbars[index] = position;
      moduleState.settings.organ = settings;
      if (this.currentModalKind === 'module-organ') {
        const panel = this.modal?.querySelector<HTMLElement>('[data-organ-panel]');
        if (panel) panel.outerHTML = createOrganMarkup(moduleState.settings);
      }
      this.markPlayerStateChanged();
      return;
    }

    if (moduleNumber === 8 && control.startsWith('synth:')) {
      const parameter = control.slice('synth:'.length);
      const ranges: Record<string, readonly [number, number]> = {
        oscillator1Volume: [0, 100],
        oscillator2Volume: [0, 100],
        oscillator3Volume: [0, 100],
        oscillator1DetuneCents: [-100, 100],
        oscillator2DetuneCents: [-100, 100],
        oscillator3DetuneCents: [-100, 100],
        attackMs: [0, 15_000],
        holdMs: [0, 15_000],
        decayMs: [0, 25_000],
        releaseMs: [0, 25_000],
        filterCutoffHz: [20, 20_000],
        filterResonance: [0, 98],
        filterEnvelope: [-100, 100],
        lfoRateHz: [0.05, 30],
        lfoDepth: [0, 100],
        glideMs: [0, 5_000],
      };
      const range = ranges[parameter];
      if (!range) return;
      const synth = readSynthSettings(moduleState.settings.synth);
      if (parameter === 'glideMs' && synth.glideSync) {
        // Em Sync o tempo vem exclusivamente do BPM global; o CC do tempo
        // manual não cria uma segunda escala nem divisões de sequenciador.
        return;
      }
      const value = parameter === 'filterCutoffHz'
        ? 20 * (1_000 ** progress)
        : range[0] + (range[1] - range[0]) * progress;
      (synth as unknown as Record<string, number | string | boolean>)[parameter] = value;
      moduleState.settings.synth = synth;
      this.markPlayerStateChanged();
      return;
    }

    if (control.startsWith('arpeggiator:')) {
      const parameter = control.slice('arpeggiator:'.length);
      const ranges: Record<string, readonly [number, number]> = {
        octaves: [1, 4],
        gate: [10, 100],
        swing: [0, 75],
      };
      const range = ranges[parameter];
      if (!range) return;
      const settings = readArpeggiatorSettings(moduleState.settings.arpeggiator);
      const value = range[0] + (range[1] - range[0]) * progress;
      if (parameter === 'octaves') settings.octaves = Math.round(value);
      else if (parameter === 'gate' || parameter === 'swing') settings[parameter] = value;
      moduleState.settings.arpeggiator = settings;
      this.commitPatternChange();
      return;
    }

    if (control.startsWith('tranceGate:')) {
      const parameter = control.slice('tranceGate:'.length);
      const ranges: Record<string, readonly [number, number]> = {
        gate: [5, 100], depth: [0, 100], attackMs: [0.1, 100], releaseMs: [0.1, 100], swing: [0, 75],
      };
      const range = ranges[parameter];
      if (!range) return;
      const settings = readTranceGateSettings({ ...readTranceGateSettings(moduleState.settings.tranceGate),
        [parameter]: range[0] + (range[1] - range[0]) * progress });
      moduleState.settings.tranceGate = settings;
      if (this.currentModalKind === 'module-trance-gate' && this.currentModalModuleNumber === moduleNumber) {
        const editor = this.modal?.querySelector<HTMLElement>('[data-trance-gate-editor]');
        if (editor) editor.outerHTML = createTranceGateMarkup(settings);
      }
      this.commitPatternChange();
      return;
    }

    const separator = control.indexOf(':');
    const effectKind = control.slice(0, separator);
    const effectControl = control.slice(separator + 1);
    if (!isModuleEffectKind(effectKind) || !effectControl) return;
    const ranges: Record<string, readonly [number, number]> = {
      'compressor:thresholdDb': [-60, 0],
      'compressor:ratio': [1, 20],
      'compressor:gainDb': [0, 24],
      'compressor:attackMs': [0.1, 100],
      'compressor:releaseMs': [10, 1_000],
      'compressor:mix': [0, 100],
      'reverb:decay': [0.1, 20],
      'reverb:dampen': [0, 100],
      'reverb:size': [0, 100],
      'reverb:mix': [0, 100],
      'delay:feedback': [0, 95],
      'delay:mix': [0, 100],
      'delay:milliseconds': [1, 2_000],
      'rotary:slowHz': [0.2, 2],
      'rotary:fastHz': [2, 10],
      'rotary:rampSeconds': [0.1, 10],
      'rotary:depth': [0, 100],
      'rotary:mix': [0, 100],
      'chorus:rateHz': [0.05, 8],
      'chorus:depth': [0, 100],
      'chorus:mix': [0, 100],
      'cutoffEnvelope:attackMs': [0, 5_000],
      'cutoffEnvelope:decayMs': [0, 5_000],
      'cutoffEnvelope:sustain': [0, 100],
      'cutoffEnvelope:releaseMs': [0, 5_000],
      'cutoffEnvelope:depthOctaves': [0, 8],
    };
    const range = ranges[control];
    if (!range) return;
    const value = range[0] + (range[1] - range[0]) * progress;
    const settings = readModuleEffectSettings(effectKind, moduleState.settings[effectKind]);
    const reverbMixes = effectKind === 'reverb' && effectControl === 'mix'
      ? ensureReverbMixPresets(moduleState.settings) : null;
    (settings as unknown as Record<string, number | string | boolean>)[effectControl] = value;
    moduleState.settings[effectKind] = settings;
    if (reverbMixes) reverbMixes[readReverbSpace(moduleState.settings.reverbSpace)].mix = value;
    this.markPlayerStateChanged();
  }

  private tapMappedModuleDelay(moduleNumber: number): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return;
    const settings = readModuleDelaySettings(moduleState.settings.delay);
    if (settings.sync) return;
    const timestamp = performance.now();
    const previousTap = this.lastDelayTapAt;
    this.lastDelayTapAt = timestamp;
    if (previousTap === null) return;
    const interval = Math.round(timestamp - previousTap);
    if (interval < 120 || interval > 2_000) return;
    settings.milliseconds = interval;
    moduleState.settings.delay = settings;
    this.markPlayerStateChanged();
  }

  private handleModuleEqTypeButton(button: HTMLButtonElement, moduleNumber: number): void {
    const bandIndex = Number.parseInt(button.dataset.moduleEqType ?? '', 10);
    const requestedType = button.dataset.moduleEqTypeValue ?? '';
    if (!Number.isInteger(bandIndex) || !isAllowedEqBandType(bandIndex, requestedType)) return;
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return;
    const bands = readModuleEqBands(moduleState.settings.eqBands);
    const band = bands[bandIndex];
    if (!band) return;
    band.type = requestedType;
    if (requestedType === 'low-cut' || requestedType === 'high-cut') band.gain = 0;
    moduleState.settings.eqBands = bands;
    if (this.modal) this.updateModuleEqCurve(this.modal, bands);
    const point = this.modal?.querySelector<SVGGElement>(`[data-module-eq-band="${bandIndex}"]`);
    point?.setAttribute('transform', `translate(${eqXFromFrequency(band.frequency)} ${eqYFromGain(band.gain)})`);
    const readout = this.modal?.querySelector<HTMLElement>(`[data-module-eq-readout="${bandIndex}"]`);
    const gain = readout?.querySelector<HTMLElement>('[data-eq-gain]');
    if (gain) gain.textContent = formatEqGain(band.gain);
    if (readout) this.updateEqShapeControl(readout, band, bandIndex);
    for (const option of button.parentElement?.querySelectorAll<HTMLButtonElement>('button[data-module-eq-type]') ?? []) {
      const selected = option === button;
      option.classList.toggle('is-selected', selected);
      option.setAttribute('aria-pressed', String(selected));
    }
    this.markPlayerStateChanged();
  }

  private startEqBandDrag(event: PointerEvent, moduleNumber: number): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const target = event.target;
    const band = target instanceof Element
      ? target.closest<SVGGElement>('[data-module-eq-band]')
      : null;
    const plot = band?.closest<HTMLElement>('[data-module-eq-plot]');
    const bandIndex = Number.parseInt(band?.dataset.moduleEqBand ?? '', 10);
    if (!band || !plot || !Number.isInteger(bandIndex) || bandIndex < 0 || bandIndex > 4) return;
    event.preventDefault();
    plot.setPointerCapture(event.pointerId);
    this.eqBandDrag = { bandIndex, moduleNumber, plot, pointerId: event.pointerId };
    band.classList.add('is-dragging');
    this.updateEqBandFromPointer(this.eqBandDrag, event.clientX, event.clientY);
  }

  private moveEqBandDrag(event: PointerEvent): void {
    const drag = this.eqBandDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    this.updateEqBandFromPointer(drag, event.clientX, event.clientY);
  }

  private endEqBandDrag(event: PointerEvent): void {
    const drag = this.eqBandDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    this.updateEqBandFromPointer(drag, event.clientX, event.clientY);
    drag.plot.querySelector<SVGGElement>(`[data-module-eq-band="${drag.bandIndex}"]`)
      ?.classList.remove('is-dragging');
    if (drag.plot.hasPointerCapture(event.pointerId)) drag.plot.releasePointerCapture(event.pointerId);
    this.eqBandDrag = null;
    this.markPlayerStateChanged();
  }

  private updateEqBandFromPointer(drag: EqBandDrag, clientX: number, clientY: number): void {
    const bounds = drag.plot.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const xRatio = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width));
    const yRatio = Math.min(1, Math.max(0, (clientY - bounds.top) / bounds.height));
    const moduleState = this.getActivePresetState()?.modules[drag.moduleNumber - 1];
    if (!moduleState) return;
    const bands = readModuleEqBands(moduleState.settings.eqBands);
    const band = bands[drag.bandIndex];
    if (!band) return;
    band.frequency = eqFrequencyFromRatio(xRatio);
    band.gain = band.type === 'low-cut' || band.type === 'high-cut' ? 0 : eqGainFromRatio(yRatio);
    moduleState.settings.eqBands = bands;

    const point = drag.plot.querySelector<SVGGElement>(`[data-module-eq-band="${drag.bandIndex}"]`);
    point?.setAttribute('transform', `translate(${eqXFromFrequency(band.frequency)} ${eqYFromGain(band.gain)})`);
    this.updateModuleEqCurve(drag.plot, bands);
    const readout = this.modal?.querySelector<HTMLElement>(`[data-module-eq-readout="${drag.bandIndex}"]`);
    const frequency = readout?.querySelector<HTMLElement>('[data-eq-frequency]');
    const gain = readout?.querySelector<HTMLElement>('[data-eq-gain]');
    if (frequency) frequency.textContent = formatEqFrequency(band.frequency);
    if (gain) gain.textContent = formatEqGain(band.gain);
  }

  private updateModuleEqQ(modal: HTMLElement, input: HTMLInputElement, moduleNumber: number): void {
    const bandIndex = Number.parseInt(input.dataset.moduleEqQ ?? '', 10);
    const requestedValue = Number(input.value);
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState || !Number.isInteger(bandIndex) || !Number.isFinite(requestedValue)) return;
    const bands = readModuleEqBands(moduleState.settings.eqBands);
    const band = bands[bandIndex];
    if (!band) return;
    const cut = isEqCutType(band.type);
    const value = cut
      ? Math.round(Math.min(8, Math.max(1, requestedValue)))
      : Math.min(12, Math.max(0.1, requestedValue));
    if (cut) band.cutSlope = value;
    else band.q = value;
    moduleState.settings.eqBands = bands;
    const output = input.closest<HTMLElement>('.module-eq-q-control')?.querySelector<HTMLOutputElement>('[data-eq-q-value]');
    if (output) output.value = cut ? formatEqCutSlope(value) : value.toFixed(1);
    this.updateModuleEqCurve(modal, bands);
    this.markPlayerStateChanged();
  }

  private updateModuleEqCurve(container: ParentNode, bands: readonly ModuleEqBand[]): void {
    container.querySelector<SVGPathElement>('[data-module-eq-curve]')
      ?.setAttribute('d', createEqCurve(bands, MODULE_EQ_WIDTH, MODULE_EQ_HEIGHT));
    container.querySelector<SVGPathElement>('[data-module-eq-curve-shadow]')
      ?.setAttribute('d', createEqShadowPath(bands, MODULE_EQ_WIDTH, MODULE_EQ_HEIGHT));
  }

  private updateEqShapeControl(readout: HTMLElement, band: ModuleEqBand, bandIndex: number): void {
    const control = readout.querySelector<HTMLElement>('.module-eq-q-control');
    const label = control?.querySelector<HTMLElement>('[data-eq-shape-label]');
    const input = control?.querySelector<HTMLInputElement>('[data-module-eq-q]');
    const output = control?.querySelector<HTMLOutputElement>('[data-eq-q-value]');
    if (!control || !label || !input || !output) return;
    const cut = isEqCutType(band.type);
    control.classList.toggle('is-cut-slope', cut);
    label.textContent = cut ? 'Curva' : 'Q';
    input.min = cut ? '1' : '0.1';
    input.max = cut ? '8' : '12';
    input.step = cut ? '1' : '0.1';
    input.value = String(cut ? band.cutSlope : band.q);
    input.setAttribute('aria-label', `${cut ? 'Inclinação do corte' : 'Fator Q'} da banda ${bandIndex + 1}`);
    output.value = cut ? formatEqCutSlope(band.cutSlope) : band.q.toFixed(1);
  }

  private selectCutoffFilterType(modal: HTMLElement, moduleNumber: number, type: string | undefined): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState || !CUTOFF_FILTER_TYPES.includes(type as CutoffFilterType)) return;
    moduleState.settings.cutoffFilterType = type;
    for (const button of modal.querySelectorAll<HTMLButtonElement>('[data-cutoff-filter-type]')) {
      const selected = button.dataset.cutoffFilterType === type;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    this.markPlayerStateChanged();
    void this.syncNativeEngine();
  }

  private updateModuleEffectControl(modal: HTMLElement, input: HTMLInputElement, moduleNumber: number): void {
    const kind = input.dataset.moduleEffectKind;
    const key = input.dataset.moduleEffectControl;
    const value = Number(input.value);
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState || !isModuleEffectKind(kind) || !key || !Number.isFinite(value)) return;

    const settings = readModuleEffectSettings(kind, moduleState.settings[kind]);
    if (!(key in settings)) return;
    const reverbMixes = kind === 'reverb' && key === 'mix' ? ensureReverbMixPresets(moduleState.settings) : null;
    (settings as unknown as Record<string, number | string>)[key] = value;
    moduleState.settings[kind] = settings;
    if (reverbMixes) reverbMixes[readReverbSpace(moduleState.settings.reverbSpace)].mix = value;

    const minimum = Number(input.min);
    const maximum = Number(input.max);
    const progress = maximum > minimum ? (value - minimum) / (maximum - minimum) : 0;
    input.closest<HTMLElement>('.module-effect-knob')
      ?.style.setProperty('--knob-angle', `${-135 + Math.min(1, Math.max(0, progress)) * 270}deg`);
    input.closest<HTMLElement>('.module-effect-knob')
      ?.style.setProperty('--knob-progress', String(Math.min(1, Math.max(0, progress))));
    const formatted = formatModuleEffectValue(kind, key, value);
    input.setAttribute('aria-valuetext', formatted);
    const output = input.closest<HTMLElement>('.module-effect-knob')
      ?.querySelector<HTMLOutputElement>(`[data-module-effect-output="${key}"]`);
    if (output) output.value = formatted;
    if (kind === 'compressor' && key === 'ratio') {
      const ratio = modal.querySelector<HTMLElement>('[data-compressor-ratio]');
      if (ratio) ratio.textContent = `${value.toFixed(1)}:1`;
    }
    if (kind === 'delay' && key === 'milliseconds') {
      const display = modal.querySelector<HTMLOutputElement>('[data-module-delay-display]');
      if (display) display.value = `${Math.round(value)} ms`;
    }
    this.markPlayerStateChanged();
  }

  private toggleModuleEffectPower(button: HTMLButtonElement, moduleNumber: number): void {
    const kind = button.dataset.moduleEffectPower;
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState || !kind) return;
    if (kind === 'arpeggiator' || kind === 'trance-gate') {
      const settings = kind === 'arpeggiator'
        ? readArpeggiatorSettings(moduleState.settings.arpeggiator)
        : readTranceGateSettings(moduleState.settings.tranceGate);
      settings.enabled = !settings.enabled;
      moduleState.settings[kind === 'trance-gate' ? 'tranceGate' : kind] = settings;
      button.classList.toggle('is-on', settings.enabled);
      button.classList.toggle('is-off', !settings.enabled);
      button.textContent = settings.enabled ? 'ON' : 'OFF';
      button.setAttribute('aria-pressed', String(settings.enabled));
      this.commitPatternChange();
      return;
    }
    if (kind === 'eq') {
      const enabled = moduleState.settings.eqEnabled === false;
      moduleState.settings.eqEnabled = enabled;
      button.classList.toggle('is-on', enabled);
      button.classList.toggle('is-off', !enabled);
      button.textContent = enabled ? 'ON' : 'OFF';
      button.setAttribute('aria-pressed', String(enabled));
      this.markPlayerStateChanged();
      return;
    }
    if (!isModuleEffectKind(kind)) return;
    const settings = readModuleEffectSettings(kind, moduleState.settings[kind]);
    settings.enabled = !settings.enabled;
    moduleState.settings[kind] = settings;
    if (kind === 'compressor' && !settings.enabled) this.renderModuleAnalysis([]);
    button.classList.toggle('is-on', settings.enabled);
    button.classList.toggle('is-off', !settings.enabled);
    button.textContent = settings.enabled ? 'ON' : 'OFF';
    button.setAttribute('aria-pressed', String(settings.enabled));
    button.closest<HTMLElement>('[data-module-effect-editor]')?.classList.toggle('is-disabled', !settings.enabled);
    this.markPlayerStateChanged();
  }

  private showModuleResetConfirmation(modal: HTMLElement, moduleNumber: number): void {
    if (modal.querySelector('[data-module-reset-confirmation]')) return;
    const confirmation = document.createElement('div');
    confirmation.className = 'module-processor-reset-confirmation';
    confirmation.dataset.moduleResetConfirmation = '';
    confirmation.setAttribute('role', 'alertdialog');
    confirmation.setAttribute('aria-modal', 'true');
    confirmation.setAttribute('aria-label', `Confirmar reset do módulo ${moduleNumber}`);
    confirmation.innerHTML = `
      <div>
        <span>Módulo ${moduleNumber}</span>
        <strong>Resetar o módulo?</strong>
        <p>Todos os parâmetros deste módulo voltarão aos valores iniciais. O timbre e o volume continuam.</p>
        <footer>
          <button type="button" data-module-reset-choice="cancel">Cancelar</button>
          <button class="is-danger" type="button" data-module-reset-choice="confirm">Resetar</button>
        </footer>
      </div>
    `;
    modal.querySelector('.player-modal__surface')?.append(confirmation);
    confirmation.querySelector<HTMLButtonElement>('[data-module-reset-choice="cancel"]')?.focus();
  }

  // Volta todos os parâmetros do Config ao padrão de fábrica. O timbre, o
  // volume, o ON e a oitava ficam no módulo; os presets salvos do Synth
  // (slots 1-5) são do usuário e continuam.
  private confirmModuleReset(moduleNumber: number): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return;
    const defaults = createDefaultModuleSettings(moduleNumber - 1);
    moduleState.settings = {
      ...defaults,
      synthPresets: moduleState.settings.synthPresets ?? defaults.synthPresets,
    };
    moduleState.midiInputId = null;
    const trigger = this.modalTrigger ?? this.root;
    this.markPlayerStateChanged();
    this.openModal('module-settings', moduleNumber, trigger, true);
    this.setStatus(`Módulo ${moduleNumber} resetado.`);
  }

  private showProcessorResetConfirmation(
    modal: HTMLElement,
    moduleNumber: number,
    processor: 'eq' | 'envelope' | ModuleEffectKind,
  ): void {
    if (modal.querySelector('[data-processor-reset-confirmation]')) return;
    const label = processor === 'eq' ? 'EQ'
      : processor === 'envelope' ? 'Envelope'
        : processor === 'compressor' ? 'Compressor'
          : processor === 'reverb' ? 'Reverb'
            : processor === 'rotary' ? 'Rotary'
              : processor === 'chorus' ? 'Chorus'
                : processor === 'cutoffEnvelope' ? 'Env-Filter' : 'Delay';
    const confirmation = document.createElement('div');
    confirmation.className = 'module-processor-reset-confirmation';
    // Guarda o processador desta confirmação: dentro do Config em páginas o
    // Cancelar/Resetar do rodapé precisa saber de qual aba ela veio, já que
    // o fechamento não é reaberto por aba (processorKind fica fixo em
    // 'module-settings').
    confirmation.dataset.processorResetConfirmation = processor;
    confirmation.setAttribute('role', 'alertdialog');
    confirmation.setAttribute('aria-modal', 'true');
    confirmation.setAttribute('aria-label', `Confirmar reset de ${label} do módulo ${moduleNumber}`);
    confirmation.innerHTML = `
      <div>
        <span>${label}</span>
        <strong>Resetar ${label}?</strong>
        <p>${processor === 'eq' ? 'Todas as cinco bandas voltarão para flat.'
          : processor === 'envelope' ? 'Attack, Release, Hold, Decay, Cutoff e o limite de velocity voltarão aos valores iniciais.'
            : 'Todos os parâmetros voltarão aos valores iniciais e o processador será desligado.'}</p>
        <footer>
          <button type="button" data-processor-reset-choice="cancel">Cancelar</button>
          <button class="is-danger" type="button" data-processor-reset-choice="confirm">Resetar</button>
        </footer>
      </div>
    `;
    modal.querySelector('.player-modal__surface')?.append(confirmation);
    confirmation.querySelector<HTMLButtonElement>('[data-processor-reset-choice="cancel"]')?.focus();
  }

  private confirmProcessorReset(moduleNumber: number, processor: ModuleSettingsPage | 'eq' | ModuleEffectKind): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return;
    // O Reset de uma página devolve só ela ao Default daquele timbre, e sem
    // ligar nem desligar o processador.
    const reference = this.defaultSettingsForModule(moduleNumber, moduleState);
    const restore = <T>(key: string, read: (value: unknown) => T, enabled?: boolean) => {
      const value = read(reference[key]) as T & { enabled?: boolean };
      if (enabled !== undefined) value.enabled = enabled;
      moduleState.settings[key] = value;
    };
    if (processor === 'eq') moduleState.settings.eqBands = readModuleEqBands(reference.eqBands);
    else if (processor === 'envelope') {
      for (const key of ['attackMs', 'releaseMs', 'holdMs', 'decayMs', 'cutoffHz', 'velocityLimit']) {
        moduleState.settings[key] = reference[key];
      }
    } else if (processor === 'arpeggiator') {
      restore('arpeggiator', readArpeggiatorSettings,
        readArpeggiatorSettings(moduleState.settings.arpeggiator).enabled);
    } else if (processor === 'trance-gate') {
      restore('tranceGate', readTranceGateSettings,
        readTranceGateSettings(moduleState.settings.tranceGate).enabled);
    } else if (processor === 'compressor') {
      restore('compressor', readModuleCompressorSettings,
        readModuleCompressorSettings(moduleState.settings.compressor).enabled);
    } else if (processor === 'reverb') {
      restore('reverb', readModuleReverbSettings,
        readModuleReverbSettings(moduleState.settings.reverb).enabled);
      moduleState.settings.reverbSpace = reference.reverbSpace;
      moduleState.settings.reverbSpaces = reference.reverbSpaces
        ? cloneSettings(reference.reverbSpaces as Record<string, unknown>) : undefined;
    } else if (processor === 'rotary') {
      restore('rotary', readModuleRotarySettings,
        readModuleRotarySettings(moduleState.settings.rotary).enabled);
    } else if (processor === 'chorus') {
      restore('chorus', readModuleChorusSettings,
        readModuleChorusSettings(moduleState.settings.chorus).enabled);
    } else if (processor === 'cutoffEnvelope') {
      restore('cutoffEnvelope', readModuleCutoffEnvelopeSettings,
        readModuleCutoffEnvelopeSettings(moduleState.settings.cutoffEnvelope).enabled);
      moduleState.settings.cutoffFilterType = reference.cutoffFilterType;
    } else {
      restore('delay', readModuleDelaySettings,
        readModuleDelaySettings(moduleState.settings.delay).enabled);
    }
    const trigger = this.modalTrigger ?? this.root;
    this.markPlayerStateChanged();
    void this.syncNativeEngine();
    this.openModal(this.currentModalKind === 'module-settings' ? 'module-settings'
      : processor === 'eq' ? 'module-eq'
        : processor === 'compressor' ? 'module-compressor'
          : processor === 'reverb' ? 'module-reverb'
            : processor === 'rotary' ? 'module-rotary'
              : processor === 'chorus' ? 'module-chorus'
                : processor === 'cutoffEnvelope' ? 'module-env-filter' : 'module-delay',
      moduleNumber, trigger, true);
    this.setStatus(`${processor === 'eq' ? 'EQ resetado para flat' : `${processor} resetado`} no módulo ${moduleNumber}.`);
  }

  private selectModuleRotarySpeed(modal: HTMLElement, button: HTMLButtonElement): void {
    const speed = button.dataset.moduleRotarySpeed;
    if (speed !== 'brake' && speed !== 'slow' && speed !== 'fast') return;
    this.setModuleRotarySpeed(speed, modal);
  }

  private ccLearnTargetForRotarySpeed(button: HTMLButtonElement): CcLearnTarget | null {
    const speed = button.dataset.moduleRotarySpeed;
    if ((this.currentModalKind !== 'module-rotary' && this.currentModalKind !== 'module-organ')
        || this.currentModalModuleNumber !== 7
        || (speed !== 'brake' && speed !== 'slow' && speed !== 'fast')) return null;
    return { kind: 'module-control', moduleNumber: 7, control: `rotary:speed:${speed}`, label: `Rotary ${speed === 'brake' ? 'Brake' : speed === 'fast' ? 'Fast' : 'Slow'}` };
  }

  private ccLearnTargetForRotaryToggle(): CcLearnTarget {
    return { kind: 'module-control', moduleNumber: 7, control: 'rotary:toggle', label: 'R-TG Slow/Fast' };
  }

  private startRotarySpeedLearn(event: PointerEvent, button: HTMLButtonElement, target: CcLearnTarget): void {
    if (!event.isPrimary || this.desktopRuntime || (event.pointerType === 'mouse' && event.button !== 0)) return;
    this.knobCcLearnGesture.start(event, () => {
      this.suppressNextCcControlClick = button;
      window.setTimeout(() => {
        if (this.suppressNextCcControlClick === button) this.suppressNextCcControlClick = null;
      }, 900);
      this.openCcLearn(target, button);
    });
  }

  private setModuleRotarySpeed(speed: 'brake' | 'slow' | 'fast', modal: HTMLElement | null = this.modal): void {
    // Índice 6 = módulo 7, o Organ — o único que o motor liga (ver
    // rotaryEnabled em performNativeEngineSync). Lia o índice 4 (módulo 5) e
    // os botões de velocidade não alcançavam o Leslie de verdade.
    const moduleState = this.getActivePresetState()?.modules[6];
    if (!moduleState) return;
    const settings = readModuleRotarySettings(moduleState.settings.rotary);
    const changed = settings.speed !== speed;
    settings.speed = speed;
    moduleState.settings.rotary = settings;
    for (const option of modal?.querySelectorAll<HTMLButtonElement>('[data-module-rotary-speed]') ?? []) {
      const selected = option.dataset.moduleRotarySpeed === speed;
      option.classList.toggle('is-selected', selected);
      option.setAttribute('aria-pressed', String(selected));
    }
    const toggle = modal?.querySelector<HTMLButtonElement>('[data-module-rotary-toggle]');
    if (toggle) {
      const fast = speed === 'fast';
      toggle.classList.toggle('is-selected', fast);
      toggle.setAttribute('aria-pressed', String(fast));
    }
    if (changed) {
      this.markPlayerStateChanged();
      this.scheduleNativeEngineSync();
    }
  }

  private toggleModuleRotarySpeed(modal: HTMLElement | null = this.modal): void {
    const moduleState = this.getActivePresetState()?.modules[6];
    if (!moduleState) return;
    const speed = readModuleRotarySettings(moduleState.settings.rotary).speed;
    this.setModuleRotarySpeed(speed === 'fast' ? 'slow' : 'fast', modal);
  }

  private receiveRotaryModulation(value: number, inputId: string | null): void {
    const normalized = Math.round(Math.min(127, Math.max(0, value)));
    const moduleState = this.getActivePresetState()?.modules[6];
    if (!moduleState?.enabled || !moduleState.modulationInputEnabled
        || (inputId !== null && moduleState.midiInputId && moduleState.midiInputId !== inputId)) return;
    if (readModuleModulationMode(moduleState.settings) === 'rotary') {
      this.setModuleRotarySpeed(normalized >= 64 ? 'fast' : 'slow');
    }
  }

  private selectModuleDelayDivision(modal: HTMLElement, button: HTMLButtonElement, moduleNumber: number): void {
    const division = button.dataset.moduleDelayDivision;
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState || !division || !(DELAY_DIVISIONS as readonly string[]).includes(division)) return;
    const settings = readModuleDelaySettings(moduleState.settings.delay);
    settings.division = division;
    moduleState.settings.delay = settings;
    for (const option of modal.querySelectorAll<HTMLButtonElement>('[data-module-delay-division]')) {
      const selected = option === button;
      option.classList.toggle('is-selected', selected);
      option.setAttribute('aria-pressed', String(selected));
    }
    // A divisão vale sobre uma batida: o BPM com Sync, ou os ms do knob sem ele.
    this.markPlayerStateChanged();
  }

  private toggleModuleDelaySync(modal: HTMLElement, button: HTMLButtonElement, moduleNumber: number): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return;
    const settings = readModuleDelaySettings(moduleState.settings.delay);
    settings.sync = !settings.sync;
    // Ligar ou desligar o Sync não muda o eco: o knob guarda a batida do BPM.
    if (settings.sync) settings.milliseconds = delayMillisecondsForBpm(this.metronome.getBpm(), '1/4');
    moduleState.settings.delay = settings;
    button.classList.toggle('is-selected', settings.sync);
    button.setAttribute('aria-pressed', String(settings.sync));
    this.renderModuleDelaySyncState(modal, moduleNumber);
    this.markPlayerStateChanged();
  }

  private renderModuleDelaySyncState(modal: HTMLElement, moduleNumber: number): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return;
    const settings = readModuleDelaySettings(moduleState.settings.delay);
    const bpm = this.metronome.getBpm();
    const milliseconds = settings.sync
      ? delayMillisecondsForBpm(bpm, '1/4')
      : settings.milliseconds;
    if (settings.sync && settings.milliseconds !== milliseconds) {
      settings.milliseconds = milliseconds;
      moduleState.settings.delay = settings;
    }
    const tap = modal.querySelector<HTMLButtonElement>('[data-module-delay-tap]');
    const sync = modal.querySelector<HTMLButtonElement>('[data-module-delay-sync]');
    const input = modal.querySelector<HTMLInputElement>('[data-module-effect-control="milliseconds"]');
    const display = modal.querySelector<HTMLOutputElement>('[data-module-delay-display]');
    if (tap) tap.disabled = settings.sync;
    if (sync) {
      sync.classList.toggle('is-selected', settings.sync);
      sync.setAttribute('aria-pressed', String(settings.sync));
    }
    if (input) {
      input.disabled = settings.sync;
      input.value = String(milliseconds);
      const minimum = Number(input.min);
      const maximum = Number(input.max);
      const progress = maximum > minimum ? (milliseconds - minimum) / (maximum - minimum) : 0;
      input.closest<HTMLElement>('.module-effect-knob')
        ?.style.setProperty('--knob-angle', `${-135 + Math.min(1, Math.max(0, progress)) * 270}deg`);
      const output = input.closest<HTMLElement>('.module-effect-knob')
        ?.querySelector<HTMLOutputElement>('[data-module-effect-output="milliseconds"]');
      if (output) output.value = settings.sync ? `${Math.round(bpm)} BPM` : `${Math.round(milliseconds)} ms`;
    }
    if (display) {
      display.value = settings.sync
        ? `${Math.round(bpm)} BPM`
        : `${Math.round(milliseconds)} ms`;
    }
  }

  private tapModuleDelay(modal: HTMLElement, moduleNumber: number, timestamp: number): void {
    const previousTap = this.lastDelayTapAt;
    this.lastDelayTapAt = timestamp;
    const button = modal.querySelector<HTMLButtonElement>('[data-module-delay-tap]');
    if (button?.disabled) return;
    button?.classList.add('is-tapped');
    window.setTimeout(() => button?.classList.remove('is-tapped'), 110);
    if (previousTap === null) return;
    const interval = Math.round(timestamp - previousTap);
    if (interval < 120 || interval > 2_000) return;
    const input = modal.querySelector<HTMLInputElement>('[data-module-effect-control="milliseconds"]');
    if (!input) return;
    input.value = String(interval);
    this.updateModuleEffectControl(modal, input, moduleNumber);
  }

  private applySelectedMidiInputs(): void {
    this.syncKeyboardExpressionInput();
    this.midiInput.setSelectedInputIds(this.selectedMidiInputIds);
  }

  private scheduleAudioDeviceMonitor(): void {
    if (this.audioDeviceMonitorTimer !== null) window.clearTimeout(this.audioDeviceMonitorTimer);
    this.audioDeviceMonitorTimer = window.setTimeout(() => {
      this.audioDeviceMonitorTimer = null;
      void this.monitorSelectedAudioDevice()
        .catch(() => this.setStatus('A saída padrão será restaurada assim que estiver disponível.'))
        .finally(() => {
          if (this.mounted) this.scheduleAudioDeviceMonitor();
        });
    }, 500);
  }

  private async monitorSelectedAudioDevice(): Promise<void> {
    await this.nativeBootPromise.catch(() => undefined);
    if (!this.mounted) return;
    const selectedId = this.selectedAudioDeviceId;
    if (!hookKeysNative.isAvailable()) return;
    if (await hookKeysNative.audioOutputFailed()) {
      // No iOS, a troca USB interrompe o callback por alguns instantes. Forçar
      // fallback aqui reinicia a AVAudioSession repetidamente e faz a interface
      // conectar/desconectar em ciclo. O observador nativo recupera o motor uma
      // única vez quando a rota estabiliza.
      if (this.iosRuntime) return;
      this.selectedAudioDeviceMissCount += 1;
      if (this.selectedAudioDeviceMissCount < 3) return;
      this.selectedAudioDeviceMissCount = 0;
      await this.fallbackToDefaultAudioOutput(true);
      return;
    }
    try {
      const devices = await this.audioOutput.listDevices();
      if (!this.mounted || selectedId !== this.selectedAudioDeviceId) return;
      const deviceListChanged = JSON.stringify(this.audioDevices) !== JSON.stringify(devices);
      this.audioDevices = devices;
      if (deviceListChanged && this.currentModalKind === 'app-settings-audio' && this.modal) {
        this.renderAudioDeviceOptions(this.modal);
      }
      if (!selectedId || devices.some(({ id }) => id === selectedId)) {
        this.selectedAudioDeviceMissCount = 0;
        return;
      }
      // No iOS quem escolhe a saída é o sistema: uma interface USB some da
      // rota por alguns instantes ao renegociar canais/taxa. Voltar para
      // "Padrão" aqui reiniciava a sessão, derrubava a interface de novo e
      // apagava a escolha. Mantém a seleção ("reconectando") até ela voltar.
      if (this.iosRuntime) return;
      // O Windows pode entregar uma enumeração incompleta durante o hot-plug.
      // Só tratamos como queda depois de três leituras consecutivas.
      this.selectedAudioDeviceMissCount += 1;
      if (this.selectedAudioDeviceMissCount < 3) return;
      this.selectedAudioDeviceMissCount = 0;
      await this.fallbackToDefaultAudioOutput();
    } catch {
      // Uma falha transitória na enumeração não significa que o dispositivo
      // saiu. Só fazemos o fallback quando uma lista válida confirma a queda.
    }
  }

  private async fallbackToDefaultAudioOutput(forceRestart = false): Promise<void> {
    if (!this.selectedAudioDeviceId && !forceRestart) return;
    this.selectedAudioDeviceId = '';
    this.normalizeAudioRoutes();
    this.nativeLoadedTimbres.fill(null);
    this.markPlayerStateChanged();
    if (forceRestart) {
      this.soundfontSelectionRevision += 1;
      await this.nativeSoundfontSyncQueue.catch(() => undefined);
      const restarted = await hookKeysNative.recoverDefaultAudioOutput(this.bufferSize, this.sampleRate);
      if (restarted) {
        this.nativeEngineReady = false;
        this.applySelectedMidiInputs();
        await this.syncNativeEngine();
        if (this.liveMidiEnabled) await hookKeysNative.setMidiInputEnabled(true);
      }
    } else {
      await this.applyNativeAudioOutput();
    }
    if (this.currentModalKind === 'app-settings-audio' && this.modal) {
      await this.refreshAudioDeviceOptions(this.modal);
    }
    this.setStatus('A saída de áudio foi desconectada. Usando o dispositivo padrão.');
  }

  private applyNativeAudioOutputWithFeedback(preserveEngine: boolean): Promise<void> {
    const shownAt = performance.now();
    this.showAudioRestartFeedback();
    return this.applyNativeAudioOutput(preserveEngine).finally(async () => {
      const remaining = Math.max(0, 260 - (performance.now() - shownAt));
      if (remaining > 0) await new Promise(resolve => window.setTimeout(resolve, remaining));
      this.hideAudioRestartFeedback();
    });
  }

  private showAudioRestartFeedback(): void {
    this.audioRestartFeedbackDepth += 1;
    if (this.audioRestartOverlay?.isConnected) return;
    const overlay = document.createElement('section');
    overlay.className = 'player-audio-restart';
    overlay.dataset.audioRestart = '';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'assertive');
    overlay.innerHTML = `
      <span class="loading-orbit" aria-hidden="true"></span>
      <strong>Aguarde</strong>
      <small>Reiniciando o áudio…</small>
    `;
    this.audioRestartOverlay = overlay;
    this.root.setAttribute('aria-busy', 'true');
    this.root.append(overlay);
  }

  private hideAudioRestartFeedback(): void {
    this.audioRestartFeedbackDepth = Math.max(0, this.audioRestartFeedbackDepth - 1);
    if (this.audioRestartFeedbackDepth > 0) return;
    this.audioRestartOverlay?.remove();
    this.audioRestartOverlay = null;
    this.root.removeAttribute('aria-busy');
  }

  private applyNativeAudioOutput(preserveEngine = false): Promise<void> {
    if (!hookKeysNative.isAvailable()) return Promise.resolve();
    this.nativeAudioOutputSync = this.nativeAudioOutputSync.catch(() => undefined).then(async () => {
      if (this.selectedAudioDeviceId && this.audioDevices.length === 0) {
        this.audioDevices = await this.audioOutput.listDevices();
      }
      const device = this.audioDevices.find(({ id }) => id === this.selectedAudioDeviceId);
      if (this.selectedAudioDeviceId && !device && !this.iosRuntime) this.selectedAudioDeviceId = '';
      // Nenhuma configuração pode atravessar a troca do stream: aguarde o
      // lote anterior e só então crie o runtime seguinte.
      await this.nativeEngineSyncQueue.catch(() => undefined);
      this.soundfontSelectionRevision += 1;
      await this.nativeSoundfontSyncQueue.catch(() => undefined);
      this.nativeEngineReady = false;
      await hookKeysNative.setMidiInputEnabled(false);
      if (!preserveEngine) this.nativeLoadedTimbres.fill(null);
      const restarted = await hookKeysNative.setAudioOutputDevice(
        device?.id ?? '',
        device?.channels ?? 2,
        this.bufferSize,
        this.sampleRate,
        preserveEngine,
      );
      if (!this.mounted) return;
      this.applySelectedMidiInputs();
      if (restarted && !preserveEngine) await this.syncNativeEngine();
      // Só anuncie o runtime como pronto depois de o stream novo realmente
      // entregar callback. Isso evita notas irem para uma troca de buffer que
      // ainda não chegou à placa de áudio.
      let lastStatus = await hookKeysNative.audioOutputStatus();
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (lastStatus.ready) {
          if (preserveEngine || !restarted) this.nativeEngineReady = true;
          if (this.liveMidiEnabled) await hookKeysNative.setMidiInputEnabled(true);
          return;
        }
        await new Promise(resolve => window.setTimeout(resolve, 25));
        lastStatus = await hookKeysNative.audioOutputStatus();
      }
      throw new Error(lastStatus.error ?? 'audio_callback_not_ready_after_restart');
    }).catch((error) => {
      this.nativeEngineReady = false;
      this.nativeEngineSyncError = error;
      this.nativeLoadedTimbres.fill(null);
      this.setStatus('Não foi possível aplicar a saída de áudio selecionada.');
    });
    return this.nativeAudioOutputSync;
  }

  private activeAudioChannelCount(): number {
    return this.audioDevices.find(({ id }) => id === this.selectedAudioDeviceId)?.channels ?? 2;
  }

  private enhanceAppSelects(modal: HTMLElement): void {
    for (const select of modal.querySelectorAll<HTMLSelectElement>(APP_SELECT_QUERY)) {
      if (select.dataset.appSelectEnhanced === 'true') continue;
      select.dataset.appSelectEnhanced = 'true';
      select.classList.add('app-select__native');
      select.tabIndex = -1;
      // Um <select> dentro de <label> pode ser ativado pelo gesto no botão
      // customizado antes mesmo do click/preventDefault (especialmente no
      // WKWebView). Trocar somente o contêiner por <div> remove de vez essa
      // ação nativa, sem mudar classes, layout ou o select usado pelo estado.
      const label = select.closest<HTMLLabelElement>('label');
      if (label) {
        const container = document.createElement('div');
        for (const attribute of Array.from(label.attributes)) {
          if (attribute.name !== 'for') container.setAttribute(attribute.name, attribute.value);
        }
        while (label.firstChild) container.append(label.firstChild);
        label.replaceWith(container);
      }
      const custom = document.createElement('div');
      custom.className = 'app-select';
      custom.innerHTML = `
        <button class="app-select__toggle" type="button" data-app-select-toggle aria-haspopup="listbox" aria-expanded="false">
          <span></span><i aria-hidden="true"></i>
        </button>
        <div class="app-select__menu" role="listbox" hidden></div>
      `;
      select.insertAdjacentElement('afterend', custom);
      this.syncAppSelect(select);
    }
  }

  private syncAppSelect(select: HTMLSelectElement): void {
    const custom = select.parentElement?.querySelector<HTMLElement>('.app-select');
    const label = custom?.querySelector<HTMLElement>('.app-select__toggle span');
    const menu = custom?.querySelector<HTMLElement>('.app-select__menu');
    if (!custom || !label || !menu) return;
    label.textContent = select.selectedOptions[0]?.textContent?.trim() || 'Selecionar';
    custom.querySelector<HTMLButtonElement>('[data-app-select-toggle]')!.disabled = select.disabled;
    menu.replaceChildren(...Array.from(select.options, (option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.appSelectValue = option.value;
      button.textContent = option.textContent?.trim() || option.value;
      button.disabled = option.disabled;
      button.classList.toggle('is-selected', option.value === select.value);
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(option.value === select.value));
      return button;
    }));
  }

  private closeAppSelectMenus(modal: HTMLElement): void {
    for (const menu of modal.querySelectorAll<HTMLElement>('.app-select__menu')) menu.hidden = true;
    for (const toggle of modal.querySelectorAll<HTMLButtonElement>('[data-app-select-toggle]')) {
      toggle.setAttribute('aria-expanded', 'false');
    }
  }

  private normalizeAudioRoutes(): void {
    // Interface do iOS reconectando: sem a contagem real de canais, não
    // reduza as saídas escolhidas para 1+2.
    if (this.iosRuntime && this.selectedAudioDeviceId
      && !this.audioDevices.some(({ id }) => id === this.selectedAudioDeviceId)) return;
    const channels = this.activeAudioChannelCount();
    for (const bus of AUDIO_ROUTING_BUSES) {
      if (!isAudioBusRoute(this.audioRouting[bus], channels)) this.audioRouting[bus] = 'stereo:0';
    }
  }

  private applyMetronomeOutput(): Promise<void> {
    const route = parseAudioBusRoute(this.audioRouting.metronome);
    return hookKeysNative.setMetronomeOutput(route.start, route.count).catch(() => undefined);
  }

  private async refreshAudioDeviceOptions(modal: HTMLElement): Promise<void> {
    try {
      this.audioDevices = await this.audioOutput.listDevices();
      if (!modal.isConnected) return;
      this.normalizeAudioRoutes();
      this.renderAudioDeviceOptions(modal);
      this.refreshAudioRoutingSelects(modal);
    } catch {
      // Mantém a saída padrão se o ambiente não permitir enumerar dispositivos.
    }
  }

  private renderAudioDeviceOptions(modal: HTMLElement): void {
    if (!modal.isConnected) return;
    const select = modal.querySelector<HTMLSelectElement>('[data-setting="audio-device"]');
    if (!select) return;
    const selectedIsMissing = this.selectedAudioDeviceId
      && !this.audioDevices.some(({ id }) => id === this.selectedAudioDeviceId);
    select.innerHTML = `<option value="">Padrão</option>${this.audioDevices.map((device) => (
      `<option value="${escapeMarkup(device.id)}">${escapeMarkup(device.name)} · ${device.channels} canais</option>`
    )).join('')}${selectedIsMissing ? (
      `<option value="${escapeMarkup(this.selectedAudioDeviceId)}">Dispositivo reconectando…</option>`
    ) : ''}`;
    select.value = this.selectedAudioDeviceId;
    this.syncAppSelect(select);
  }

  private refreshAudioRoutingSelects(modal: HTMLElement | null): void {
    if (!modal) return;
    const channels = this.activeAudioChannelCount();
    for (const select of modal.querySelectorAll<HTMLSelectElement>('[data-setting="audio-route"]')) {
      const bus = select.dataset.audioBus;
      if (!isAudioRoutingBus(bus)) continue;
      select.innerHTML = createAudioRouteOptions(channels, this.audioRouting[bus]);
      this.syncAppSelect(select);
    }
  }

  private refreshMidiDeviceOptions(modal: HTMLElement): void {
    if (!modal.isConnected) return;
    const devices = this.midiInput.getInputDevices();
    for (const select of modal.querySelectorAll<HTMLSelectElement>('[data-setting="midi-device"]')) {
      const slot = Number.parseInt(select.dataset.midiSlot ?? '', 10);
      if (!Number.isInteger(slot) || slot < 0 || slot > 2) continue;
      const selectedId = this.selectedMidiInputIds[slot] ?? null;
      select.replaceChildren(new Option('Nenhum', ''));
      for (const device of devices) {
        const option = new Option(device.name, device.id);
        option.disabled = this.selectedMidiInputIds.some((id, index) => index !== slot && id === device.id);
        select.append(option);
      }
      if (selectedId && !devices.some(({ id }) => id === selectedId)) {
        select.append(new Option('Dispositivo indisponível', selectedId));
      }
      select.value = selectedId ?? '';
      this.syncAppSelect(select);
    }
  }

  private refreshModuleMidiOptions(modal: HTMLElement, moduleNumber: number | null): void {
    if (!modal.isConnected || moduleNumber === null) return;
    const select = modal.querySelector<HTMLSelectElement>('[data-module-setting="midi-device"]');
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!select || !moduleState) return;
    const devices = new Map(this.midiInput.getInputDevices().map((device) => [device.id, device.name]));
    select.replaceChildren(new Option('Todos os dispositivos ativos', ''));
    this.selectedMidiInputIds.forEach((deviceId, index) => {
      if (!deviceId) return;
      select.append(new Option(`MIDI ${index + 1} · ${devices.get(deviceId) ?? 'Dispositivo indisponível'}`, deviceId));
    });
    select.value = moduleState.midiInputId ?? '';
    this.syncAppSelect(select);
  }

  private commitPresetName(modal: HTMLElement, presetNumber: number): void {
    const input = modal.querySelector<HTMLInputElement>('[data-preset-name-input]');
    const preset = this.bankStates.get(this.activeBank)?.presets[presetNumber - 1];
    if (!input || !preset) return;
    preset.name = input.value.trim().slice(0, 20) || 'Preset';
    this.restoreActivePresetState();
    this.markPlayerStateChanged();
  }

  private commitSynthPresetName(modal: HTMLElement, presetNumber: number): void {
    const input = modal.querySelector<HTMLInputElement>('[data-synth-preset-name-input]');
    const moduleState = this.getActivePresetState()?.modules[7];
    if (!input || !moduleState || presetNumber < 1 || presetNumber > SYNTH_PRESET_COUNT) return;
    const names = this.synthPresetNames(moduleState);
    names[presetNumber - 1] = input.value.trim().slice(0, 20) || `Preset ${presetNumber}`;
    moduleState.settings.synthPresetNames = names;
    this.markPlayerStateChanged();
  }

  private commitBankName(modal: HTMLElement): void {
    if (!this.pendingBankEdit) return;
    const input = modal.querySelector<HTMLInputElement>('[data-bank-name-input]');
    const bank = this.bankStates.get(this.pendingBankEdit);
    if (!input || !bank) return;
    bank.name = input.value.trim().slice(0, 12) || this.pendingBankEdit;
    this.updateVisibleView();
    this.markPlayerStateChanged(false);
  }

  private commitEffectBankName(modal: HTMLElement): void {
    if (!this.pendingEffectBankEdit) return;
    if (this.pendingEffectBankEdit === '1' || this.pendingEffectBankEdit === '2') return;
    const input = modal.querySelector<HTMLInputElement>('[data-effect-bank-name-input]');
    if (!input) return;
    const bank = this.pendingEffectBankEdit;
    this.effectBankNames.set(bank, input.value.trim().slice(0, 12) || `FX ${bank}`);
    this.renderActiveEffectBank();
    this.markPlayerStateChanged();
  }

  private setBankFaderMode(bankId: BankId, mode: FaderBehaviorMode, modal: HTMLElement): void {
    const bank = this.bankStates.get(bankId);
    if (!bank || bank.faderMode === mode) return;
    this.saveActivePresetState();
    if (faderModeUsesPersistentVolumes(mode) && bankId === this.activeBank) {
      bank.masterVolumes = Array.from({ length: MODULE_COUNT }, (_, index) =>
        this.faders.get(index + 1)?.getValueDb() ?? 0);
    }
    bank.faderMode = mode;
    const bankButton = this.root.querySelector<HTMLButtonElement>(`[data-action="show-bank"][data-bank="${bankId}"]`);
    if (bankButton) bankButton.dataset.bankModeLabel = faderModeLabel(mode);
    for (const button of modal.querySelectorAll<HTMLButtonElement>('[data-bank-fader-mode]')) {
      const selected = button.dataset.bankFaderMode === mode;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-checked', String(selected));
    }
    if (bankId === this.activeBank) this.restoreActivePresetState();
    this.markPlayerStateChanged();
  }

  private selectEffectPadColor(modal: HTMLElement, button: HTMLButtonElement): void {
    const colorIndex = Number.parseInt(button.dataset.effectColorIndex ?? '', 10);
    const colors = EFFECT_PAD_COLORS[colorIndex];
    const editor = modal.querySelector<HTMLElement>('.effect-pad-editor');
    const preview = modal.querySelector<HTMLElement>('.effect-pad-editor__preview-button');
    if (!editor || !preview || !colors) return;
    editor.dataset.effectColorIndex = String(colorIndex);
    preview.style.setProperty('--effect-accent', colors[0]);
    preview.style.setProperty('--effect-dark', colors[1]);
    for (const option of modal.querySelectorAll<HTMLButtonElement>('[data-effect-color-index]')) {
      const selected = option === button;
      option.classList.toggle('is-selected', selected);
      option.setAttribute('aria-checked', String(selected));
    }
  }

  private updateEffectPadVolumeControl(modal: HTMLElement, input: HTMLInputElement): void {
    const value = boundedNumber(input.value, EFFECT_PAD_MIN_DB, EFFECT_PAD_MAX_DB, EFFECT_PAD_MAX_DB);
    const position = ((value - EFFECT_PAD_MIN_DB) / (EFFECT_PAD_MAX_DB - EFFECT_PAD_MIN_DB)) * 100;
    input.value = String(value);
    input.setAttribute('aria-valuetext', formatOutputDb(value));
    input.closest<HTMLElement>('.effect-pad-volume__control')?.style.setProperty(
      '--effect-pad-volume-position',
      `${position}%`,
    );
    const output = modal.querySelector<HTMLOutputElement>('[data-effect-pad-volume-value]');
    if (output) output.value = formatOutputDb(value);
  }

  private selectEffectMode(modal: HTMLElement, button: HTMLButtonElement): void {
    const mode = button.dataset.effectMode;
    const editor = modal.querySelector<HTMLElement>('.effect-pad-editor');
    if (!editor || (mode !== 'toggle' && mode !== 'gate')) return;
    editor.dataset.effectMode = mode;
    const label = modal.querySelector<HTMLElement>('[data-effect-mode-label]');
    if (label) label.textContent = mode === 'gate' ? 'Gate' : 'Toggle';
    for (const option of modal.querySelectorAll<HTMLButtonElement>('button[data-effect-mode]')) {
      option.classList.toggle('is-selected', option === button);
    }
    const gateOptions = modal.querySelector<HTMLElement>('[data-effect-gate-options]');
    if (gateOptions) gateOptions.hidden = mode !== 'gate';
  }

  private selectEffectGateRelease(modal: HTMLElement, button: HTMLButtonElement): void {
    const release = button.dataset.effectGateRelease;
    const editor = modal.querySelector<HTMLElement>('.effect-pad-editor');
    if (!editor || (release !== 'infinite' && release !== 'continue-press')) return;
    editor.dataset.effectGateRelease = release;
    for (const option of modal.querySelectorAll<HTMLButtonElement>('button[data-effect-gate-release]')) {
      option.classList.toggle('is-selected', option === button);
    }
  }

  private async importEffectAudio(
    modal: HTMLElement,
    effectNumber: number,
    input: HTMLInputElement,
  ): Promise<void> {
    const file = input.files?.[0];
    if (!file) return;
    const label = modal.querySelector<HTMLElement>('[data-effect-audio-label]');
    if (!isSupportedEffectFile(file)) {
      if (label) label.textContent = 'Use WAV, AIFF ou MP3';
      input.value = '';
      return;
    }
    if (label) label.textContent = 'Salvando...';
    try {
      await this.effectAudioLibrary.save(this.activeEffectBank, effectNumber, file);
      this.disposeEffectPadAudio(`${this.activeEffectBank}:${effectNumber}`);
      const effect = this.effectPadStates.get(this.activeEffectBank)?.[effectNumber - 1];
      if (effect) effect.audioFileName = file.name.slice(0, 180);
      if (modal.isConnected && label) label.textContent = file.name;
      this.markPlayerStateChanged();
    } catch {
      if (modal.isConnected && label) label.textContent = 'Não foi possível adicionar';
    } finally {
      input.value = '';
    }
  }

  private commitEffectPad(modal: HTMLElement, effectNumber: number): void {
    const input = modal.querySelector<HTMLInputElement>('[data-effect-name-input]');
    const editor = modal.querySelector<HTMLElement>('.effect-pad-editor');
    const effect = this.effectPadStates.get(this.activeEffectBank)?.[effectNumber - 1];
    if (!editor || !effect) return;
    const requestedColorIndex = Number.parseInt(editor.dataset.effectColorIndex ?? '', 10);
    if (this.activeEffectBank !== '1' && this.activeEffectBank !== '2' && input) {
      effect.name = input.value.trim().slice(0, 12) || `Efeito ${effectNumber}`;
    }
    effect.colorIndex = EFFECT_PAD_COLORS[requestedColorIndex]
      ? requestedColorIndex
      : effect.colorIndex;
    const triggerMode = editor.dataset.effectMode;
    const gateRelease = editor.dataset.effectGateRelease;
    if (triggerMode === 'toggle' || triggerMode === 'gate') {
      if (effect.triggerMode !== triggerMode) effect.active = false;
      effect.triggerMode = triggerMode;
    }
    if (gateRelease === 'infinite' || gateRelease === 'continue-press') effect.gateRelease = gateRelease;
    const volumeInput = modal.querySelector<HTMLInputElement>('[data-effect-pad-volume]');
    effect.volumeDb = boundedNumber(
      volumeInput?.value,
      EFFECT_PAD_MIN_DB,
      EFFECT_PAD_MAX_DB,
      effect.volumeDb,
    );
    this.renderActiveEffectBank();
    this.markPlayerStateChanged();
  }

  private selectSoundCategory(
    modal: HTMLElement,
    moduleNumber: number,
    category: SoundCategoryId,
  ): void {
    const categories = this.soundCategoriesForModule(moduleNumber);
    if (category !== 'user' && !categories.some(({ id }) => id === category)) return;
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (moduleState) {
      moduleState.category = category;
      this.markPlayerStateChanged();
    }

    for (const button of modal.querySelectorAll<HTMLButtonElement>('[data-sound-category]')) {
      const isSelected = button.dataset.soundCategory === category;
      button.classList.toggle('is-selected', isSelected);
      button.setAttribute('aria-pressed', String(isSelected));
    }

    const content = modal.querySelector<HTMLElement>('.sound-browser__content');
    if (content) {
      content.innerHTML = createSoundCategoryContentMarkup(
        category,
        categories,
        !this.desktopRuntime,
        this.installedFixedSoundIds,
        moduleState?.timbreId ?? null,
        this.seenSoundIds,
      );
      if (category === 'user') void this.renderUserSoundfonts(modal);
      else this.syncSoundDownloadButtons(content);
    }
  }

  // Clean: devolve o modulo ao estado sem timbre. O motor nativo desliga o
  // modulo sozinho na proxima sincronizacao, porque configureModule so o
  // habilita quando ha um timbre carregado.
  private async clearModuleTimbre(moduleNumber: number): Promise<void> {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return;
    const alreadyEmpty = !moduleState.timbreId && !moduleState.category;
    moduleState.category = '' as SoundCategoryId;
    moduleState.timbreId = null;
    moduleState.timbreName = moduleEmptySoundName(moduleNumber);
    moduleState.timbreColor = null;
    this.restoreActivePresetState();
    this.closeModal();
    if (alreadyEmpty) return;
    this.markPlayerStateChanged();
    this.setStatus(`Modulo ${moduleNumber} sem timbre selecionado.`);
    if (hookKeysNative.isAvailable()) await this.syncNativeEngine();
  }

  // Some a faixa RGB e o rótulo "new" assim que o timbre é aberto pela
  // primeira vez, mesmo que o usuário não baixe nem escute o preview. A
  // categoria segue com o "new" enquanto tiver outro timbre não visto dentro.
  private markSoundSeen(soundId: string, button: HTMLButtonElement, modal: HTMLElement): void {
    if (this.seenSoundIds.has(soundId)) return;
    this.seenSoundIds.add(soundId);
    this.markPlayerStateChanged();
    button.classList.remove('is-new');
    button.querySelector('.fixed-sound-new-badge')?.remove();
    const category = this.soundCatalog.get(soundId)?.category;
    if (!category) return;
    const stillHasNewSound = (this.soundCatalog.getCategory(category)?.sounds ?? [])
      .some((sound) => !this.seenSoundIds.has(sound.id));
    if (stillHasNewSound) return;
    const categoryButton = modal.querySelector<HTMLButtonElement>(`[data-sound-category="${category}"]`);
    categoryButton?.classList.remove('is-new');
    categoryButton?.querySelector('.fixed-sound-new-badge')?.remove();
  }

  private async selectFixedSound(moduleNumber: number, soundId: string, button?: HTMLButtonElement): Promise<void> {
    const sound = this.soundCatalog.get(soundId);
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!sound || !moduleState || !this.installedFixedSoundIds.has(soundId)) return;
    const previousSelection = {
      category: moduleState.category,
      timbreId: moduleState.timbreId,
      timbreName: moduleState.timbreName,
      timbreColor: moduleState.timbreColor,
      settings: cloneSettings(moduleState.settings),
      settingsMode: moduleState.settingsMode,
      userSettings: moduleState.userSettings ? cloneSettings(moduleState.userSettings) : null,
    };
    const selectionRevision = ++this.soundfontSelectionRevision;
    moduleState.category = sound.category;
    moduleState.timbreId = `fixed:${sound.id}`;
    moduleState.timbreName = sound.name;
    moduleState.timbreColor = sound.color;
    // O Default do novo timbre só é aplicado quando o módulo já está em
    // Default. Uma configuração User ativa pertence ao módulo/preset, não ao
    // SF2 escolhido, e portanto não pode ser substituída durante a troca.
    if (moduleState.settingsMode === 'user') {
      moduleState.userSettings = cloneSettings(moduleState.settings);
    } else {
      moduleState.settings = this.defaultSettingsForModule(moduleNumber, moduleState);
    }
    if (button) {
      for (const candidate of button.parentElement?.querySelectorAll<HTMLButtonElement>('[data-fixed-sound-id]') ?? []) {
        const selected = candidate === button;
        candidate.classList.toggle('is-current-timbre', selected);
        candidate.setAttribute('aria-current', String(selected));
      }
    }
    this.restoreActivePresetState();
    this.markPlayerStateChanged();
    if (!hookKeysNative.isAvailable()) {
      this.closeModal();
      return;
    }
    const loading = this.showSoundLoadingOverlay(this.modal, sound.name, moduleNumber);
    if (this.nativeSyncTimer !== null) {
      window.clearTimeout(this.nativeSyncTimer);
      this.nativeSyncTimer = null;
    }
    await this.syncNativeEngine();
    if (selectionRevision !== this.soundfontSelectionRevision) return;
    if (this.nativeLoadedTimbres[moduleNumber - 1] !== moduleState.timbreId) {
      Object.assign(moduleState, previousSelection);
      this.restoreActivePresetState();
      this.markPlayerStateChanged();
      this.showSoundLoadingError(loading, `Não foi possível carregar ${sound.name}. Tente novamente.`);
      return;
    }
    this.setStatus(`${sound.name} carregado no módulo ${moduleNumber}.`);
    this.closeModal();
  }

  private showSoundLoadingOverlay(modal: HTMLElement | null, name: string, moduleNumber: number): HTMLElement | null {
    if (!modal) return null;
    modal.querySelector('[data-sound-loading]')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'sound-loading-overlay';
    overlay.dataset.soundLoading = '';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.innerHTML = `
      <div>
        <span class="loading-orbit" aria-hidden="true"></span>
        <strong>Carregando timbre…</strong>
        <p>${escapeMarkup(name)} · Módulo ${moduleNumber}</p>
        <small data-sound-loading-progress>Preparando o timbre no motor…</small>
      </div>
    `;
    modal.querySelector('.player-modal__surface')?.append(overlay);
    return overlay;
  }

  private showSoundLoadingError(overlay: HTMLElement | null, message: string): void {
    if (!overlay) return;
    overlay.classList.add('is-error');
    overlay.innerHTML = `
      <div>
        <strong>O timbre não ficou pronto</strong>
        <p>${escapeMarkup(message)}</p>
        <button type="button">Entendi</button>
      </div>
    `;
    overlay.querySelector<HTMLButtonElement>('button')?.addEventListener('click', () => overlay.remove(), { once: true });
  }

  private async toggleSoundPreview(button: HTMLButtonElement): Promise<void> {
    const sound = this.selectedCatalogSoundId ? this.soundCatalog.get(this.selectedCatalogSoundId) : null;
    if (!sound) return;
    if (button.classList.contains('is-playing')) {
      this.soundLibraryEngine.preview.stop();
      button.classList.remove('is-playing');
      button.querySelector<HTMLElement>('span')!.textContent = 'Ouvir preview';
      return;
    }
    const label = button.querySelector<HTMLElement>('span');
    button.disabled = true;
    if (label) label.textContent = 'Carregando preview...';
    try {
      await this.soundLibraryEngine.preview.play(sound);
      if (!button.isConnected) return;
      button.classList.add('is-playing');
      if (label) label.textContent = 'Parar preview';
    } catch {
      if (label) label.textContent = 'Ouvir preview';
      this.updateSoundDownloadMessage('Não foi possível reproduzir o preview.');
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  }

  private async downloadSelectedSound(_modal: HTMLElement, _moduleNumber: number, button: HTMLButtonElement): Promise<void> {
    const sound = this.selectedCatalogSoundId ? this.soundCatalog.get(this.selectedCatalogSoundId) : null;
    if (!sound) return;
    // Já está baixando (por ex. o usuário voltou e entrou de novo no mesmo
    // timbre): não começa outro download por cima.
    if (this.activeSoundDownloads.has(sound.id)) return;
    if (!(await hasStorageFor(sound.byteSize))) {
      this.updateSoundDownloadMessage('Armazenamento insuficiente para baixar este timbre.');
      return;
    }
    button.disabled = true;
    const abort = new AbortController();
    this.activeSoundDownloads.set(sound.id, {
      sound, percentage: 0, abort, state: 'queued',
    });
    button.textContent = this.soundDownloadQueueRunning ? 'Na fila…' : 'Baixando…';
    this.renderActiveSoundDownloadsBanner();
    this.syncSoundDownloadButtons();
    void this.processSoundDownloadQueue();
  }

  private async uninstallSelectedSound(button: HTMLButtonElement): Promise<void> {
    const soundId = this.selectedCatalogSoundId;
    if (!soundId) return;
    button.disabled = true;
    try {
      await this.soundLibraryEngine.remove(soundId);
      this.installedFixedSoundIds.delete(soundId);
      const reference = `fixed:${soundId}`;
      for (const bank of this.bankStates.values()) {
        for (const preset of bank.presets) {
          for (let moduleIndex = 0; moduleIndex < preset.modules.length; moduleIndex += 1) {
            const module = preset.modules[moduleIndex];
            if (!module || module.timbreId !== reference) continue;
            module.timbreId = null;
            module.timbreName = moduleEmptySoundName(moduleIndex + 1);
            module.timbreColor = null;
          }
        }
      }
      this.nativeLoadedTimbres.fill(null);
      this.restoreActivePresetState();
      this.markPlayerStateChanged();
      this.returnToPreviousModal();
    } catch {
      this.updateSoundDownloadMessage('Não foi possível desinstalar este timbre.');
      button.disabled = false;
    }
  }

  private async downloadSelectedPerformanceAsset(button: HTMLButtonElement): Promise<void> {
    const asset = this.selectedPerformanceAsset;
    if (!asset) return;
    if (!asset.assetUrl) {
      this.updateSoundDownloadMessage('O arquivo ainda não foi publicado pelo administrador.');
      return;
    }
    if (!(await hasStorageFor(asset.byteSize))) {
      this.updateSoundDownloadMessage('Armazenamento insuficiente para baixar este som.');
      return;
    }
    const trigger = this.modalTrigger instanceof HTMLButtonElement ? this.modalTrigger : null;
    button.disabled = true;
    this.soundDownloadAbort?.abort();
    this.soundDownloadAbort = new AbortController();
    try {
      this.updateSoundDownloadMessage('Baixando...');
      const response = await fetch(asset.assetUrl, { signal: this.soundDownloadAbort.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`performance_download_failed:${response.status}`);
      const file = await response.blob();
      if (file.size === 0) throw new Error('performance_download_empty');
      if (asset.byteSize && file.size !== asset.byteSize) throw new Error('performance_size_mismatch');
      const sha256 = await sha256ForBlob(file);
      const storageId = performanceStorageId(asset.id);
      await this.soundLibrary.installFixed({
        soundId: storageId,
        file,
        byteSize: file.size,
        sha256,
        catalogVersion: asset.assetVersion,
        installedAt: new Date().toISOString(),
      });
      this.installedFixedSoundIds.add(storageId);
      this.updateSoundDownloadProgress(100, 'Download concluído');
      this.closeModal();
      if (trigger?.isConnected) this.activatePerformanceButton(trigger);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        this.updateSoundDownloadMessage('Não foi possível baixar este som. Confira a conexão e tente novamente.');
      }
    } finally {
      this.soundDownloadAbort = null;
      if (button.isConnected) button.disabled = false;
    }
  }

  private async prepareBackupDownloadCapacity(modal: HTMLElement): Promise<void> {
    const sounds = this.pendingBackupDownloads;
    this.backupDownloadLimit = sounds.length;
    const totalBytes = sounds.reduce((total, sound) => total + (sound.byteSize ?? 0), 0);
    const unknownSizes = sounds.some((sound) => sound.byteSize === undefined);
    const message = modal.querySelector<HTMLElement>('[data-backup-download-message]');
    const button = modal.querySelector<HTMLButtonElement>('[data-modal-action="download-backup-sounds"]');
    // No Tauri, a estimativa da WebView mede a cota da origem, não o espaço
    // livre real do disco. Não limite o backup por esse número no desktop.
    if (this.desktopRuntime) return;
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (!modal.isConnected || !estimate || estimate.quota === undefined || estimate.usage === undefined) return;
      const available = Math.max(0, estimate.quota - estimate.usage);
      if (!unknownSizes && totalBytes > available) {
        let used = 0;
        this.backupDownloadLimit = sounds.findIndex((sound) => {
          const next = used + (sound.byteSize ?? 0);
          if (next > available) return true;
          used = next;
          return false;
        });
        if (this.backupDownloadLimit < 0) this.backupDownloadLimit = sounds.length;
        if (message) {
          message.textContent = `Armazenamento insuficiente. O backup completo precisa de ${formatBytes(totalBytes)} e há cerca de ${formatBytes(available)} disponíveis. Deseja baixar parte do backup?`;
        }
        if (button) {
          button.textContent = `Baixar parte (${this.backupDownloadLimit} de ${sounds.length})`;
          button.disabled = this.backupDownloadLimit === 0;
        }
      }
    } catch {
      // O download ainda poderá ser tentado; o dispositivo informará se ficar sem espaço.
    }
  }

  private async downloadBackupSounds(modal: HTMLElement, button: HTMLButtonElement): Promise<void> {
    const sounds = this.pendingBackupDownloads.slice(0, this.backupDownloadLimit || this.pendingBackupDownloads.length);
    const message = modal.querySelector<HTMLElement>('[data-backup-download-message]');
    button.disabled = true;
    this.soundDownloadAbort?.abort();
    this.soundDownloadAbort = new AbortController();
    let completed = 0;
    try {
      for (const sound of sounds) {
        if (message) message.textContent = `Baixando ${sound.name} (${completed + 1} de ${sounds.length})...`;
        await this.soundLibraryEngine.install(sound.id, undefined, this.soundDownloadAbort.signal);
        this.installedFixedSoundIds.add(sound.id);
        completed += 1;
      }
      this.pendingBackupDownloads = this.pendingBackupDownloads.filter((sound) => !this.installedFixedSoundIds.has(sound.id));
      this.syncNativeEngine();
      this.returnToPreviousModal();
      const restoredMessage = this.modal?.querySelector<HTMLElement>('[data-user-profile-message]');
      if (restoredMessage) {
        restoredMessage.textContent = this.pendingBackupDownloads.length > 0
          ? `Backup restaurado. ${this.pendingBackupDownloads.length} timbre(s) ainda aguardam download.`
          : 'Backup restaurado e timbres baixados.';
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError') && message) {
        message.textContent = `O download parou após ${completed} de ${sounds.length} timbres. Confira a conexão ou o armazenamento.`;
      }
      if (button.isConnected) button.disabled = false;
    } finally {
      this.soundDownloadAbort = null;
    }
  }

  private updateSoundDownloadProgress(percentage: number, label: string): void {
    const progress = this.modal?.querySelector<HTMLElement>('[data-sound-download-progress]');
    const message = this.modal?.querySelector<HTMLElement>('[data-sound-download-message]');
    if (progress) progress.style.setProperty('--download-progress', `${Math.max(0, Math.min(100, percentage))}%`);
    if (message) message.textContent = label;
  }

  private updateSoundDownloadMessage(message: string): void {
    const element = this.modal?.querySelector<HTMLElement>('[data-sound-download-message]');
    if (element) element.textContent = message;
  }

  private openChildModal(kind: ModalKind, moduleNumber: number | null, trigger: HTMLElement): void {
    if (this.currentModalKind && this.modalTrigger) {
      this.modalHistory.push({
        kind: this.currentModalKind,
        moduleNumber: this.currentModalModuleNumber,
        trigger: this.modalTrigger,
      });
    }
    this.openModal(kind, moduleNumber, trigger, true);
  }

  private returnToPreviousModal(): void {
    const previous = this.modalHistory.pop();
    if (!previous) {
      this.closeModal();
      return;
    }
    this.closeModal(false, true);
    this.openModal(previous.kind, previous.moduleNumber, previous.trigger, true);
  }

  private closeModal(restoreFocus = true, preserveHistory = false): void {
    if (!this.modal) return;

    if (this.currentModalKind === 'user') this.userPhotoCrop = null;
    this.eqBandDrag = null;
    this.knobDrag = null;
    // Fechando a janela o visor do knob sai junto, sem esperar o tempo dele.
    this.hideKnobFocus();
    if (this.currentModalKind === 'sound-download' || this.currentModalKind === 'performance-download' || this.currentModalKind === 'backup-download') {
      // Sair da janela não cancela o download: ele continua e o andamento passa
      // a aparecer na faixa do topo, no lugar do nome da música.
      this.soundLibraryEngine.preview.stop();
    }

    if (this.modal.classList.contains('player-modal--cc-learn')) {
      this.pendingCcLearn = null;
      this.pendingCcController = null;
      this.pendingCcInverted = false;
      this.pendingCcLimitPercent = 100;
    }
    if (this.modal.classList.contains('player-modal--cc-clear-confirm') && !preserveHistory) {
      this.pendingCcClear = null;
    }
    if (this.modal.classList.contains('player-modal--compatibility-mode')) {
      this.pendingCompatibilityMode = null;
    }

    this.tracksPanelController?.destroy();
    this.tracksPanelController = null;
    this.outputFaderController?.destroy();
    this.outputFaderController = null;
    this.tabletInputKeyboardController?.destroy();
    this.tabletInputKeyboardController = null;
    this.modal.removeEventListener('keydown', this.handleModalKeydown);
    this.modal.remove();
    this.modal = null;
    this.currentModalKind = null;
    this.currentModalModuleNumber = null;
    this.renderedAnalysisModuleIndex = null;
    this.root.querySelector<HTMLElement>('.player-screen')?.removeAttribute('aria-hidden');

    if (restoreFocus && this.modalTrigger?.isConnected) this.modalTrigger.focus();
    this.modalTrigger = null;
    if (!preserveHistory) this.modalHistory = [];
  }

  private onModalKeydown(event: KeyboardEvent): void {
    if (!this.modal) return;

    if (
      this.desktopRuntime
      && event.key === 'Enter'
      && !event.repeat
      && !event.isComposing
      && !event.ctrlKey
      && !event.metaKey
      && !event.altKey
      && !event.shiftKey
    ) {
      const target = event.target;
      // Enter confirma campos simples no desktop. Em controles que usam Enter
      // para editar a própria opção ou inserir uma nova linha, ele permanece
      // com o comportamento nativo.
      if (!(target instanceof Element) || !target.closest('textarea, select, [contenteditable="true"]')) {
        const nestedDialog = Array.from(
          this.modal.querySelectorAll<HTMLElement>('[role="alertdialog"]'),
        ).at(-1);
        const nestedButtons = nestedDialog
          ? Array.from(nestedDialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
          : [];
        const confirmButton = nestedButtons.at(-1)
          ?? this.modal.querySelector<HTMLButtonElement>('.player-modal__confirm-button:not(:disabled)');
        if (confirmButton) {
          event.preventDefault();
          event.stopPropagation();
          confirmButton.click();
          return;
        }
      }
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.currentModalKind === 'cc-clear-confirm' && this.modalHistory.length > 0) {
        this.leaveCcClearConfirmation();
        return;
      }
      if (this.currentModalKind === 'cc-clear-confirm') this.pendingCcClear = null;
      if (this.modalHistory.length > 0) this.returnToPreviousModal();
      else this.closeModal();
      return;
    }

    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      this.modal.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
      ),
    );
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private async logout(button: HTMLButtonElement): Promise<void> {
    if (this.logoutBusy) return;
    this.logoutBusy = true;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    this.setStatus('Saindo...');

    try {
      await this.onLogout();
    } catch {
      this.logoutBusy = false;
      button.disabled = false;
      button.removeAttribute('aria-busy');
      const message = navigator.onLine
        ? 'Não foi possível sair agora. Tente novamente.'
        : 'Conecte este dispositivo à internet para sair da conta.';
      const modalMessage = this.modal?.querySelector<HTMLElement>('.user-device-message');
      if (modalMessage) {
        modalMessage.textContent = message;
        modalMessage.classList.add('is-error');
      }
      this.setStatus(message);
    }
  }

  private async restoreSavedPlayerState(): Promise<void> {
    try {
      const saved = await this.playerState.load();
      if (this.stateChangedBeforeRestore) return;
      if (saved) this.applySavedPlayerState(saved);
      await this.restoreEffectAudioAssignments();
      this.restoreActivePresetState();
      this.renderActivePadBank();
      this.renderActiveEffectBank();
      this.updateVisibleView();
    } catch {
      this.setStatus('Suas configurações serão sincronizadas quando houver conexão.');
    }
  }

  private async restoreEffectAudioAssignments(): Promise<void> {
    await Promise.all(EFFECT_BANK_IDS.flatMap((bank) => (
      (this.effectPadStates.get(bank) ?? []).map(async (effect, index) => {
        const fileName = await this.effectAudioLibrary.getFileName(bank, index + 1).catch(() => null);
        effect.audioFileName = fileName;
      })
    )));
  }

  private markPlayerStateChanged(syncNative = true): void {
    this.stateChangedBeforeRestore = true;
    this.playerStateDirty = true;
    this.persistActiveSynthPreset();
    this.saveActivePresetState();
    if (this.playerStateSaveTimer !== null) window.clearTimeout(this.playerStateSaveTimer);
    this.playerStateSaveTimer = window.setTimeout(() => this.flushPlayerStateSave(), 180);
    if (syncNative) this.scheduleNativeEngineSync();
  }

  // `immediate` is for the paths where the app is going away, so the debounced
  // writes further down the chain would never get their turn.
  private flushPlayerStateSave(immediate = false): void {
    if (this.playerStateSaveTimer !== null) window.clearTimeout(this.playerStateSaveTimer);
    this.playerStateSaveTimer = null;
    if (!this.stateChangedBeforeRestore || !this.playerStateDirty) {
      if (immediate) this.playerState.persistNow();
      return;
    }
    this.playerStateDirty = false;
    this.saveActivePresetState();
    const state = this.createSavedPlayerState();
    if (immediate) this.playerState.saveNow(state);
    else this.playerState.save(state);
  }

  // Knobs send while they move. Resetting the timer on every change (debounce)
  // held the engine back until the finger stopped; now a pending send is kept,
  // and changes made while one is still running merge into a single follow-up
  // instead of queueing a backlog on slower devices.
  private scheduleNativeEngineSync(): void {
    if (!hookKeysNative.isAvailable()) return;
    if (this.nativeSyncInFlight) {
      this.nativeSyncRequested = true;
      return;
    }
    if (this.nativeSyncTimer !== null) return;
    this.nativeSyncTimer = window.setTimeout(() => {
      this.nativeSyncTimer = null;
      this.nativeSyncInFlight = true;
      void this.syncNativeEngine().finally(() => {
        this.nativeSyncInFlight = false;
        if (!this.nativeSyncRequested || !this.mounted) return;
        this.nativeSyncRequested = false;
        this.scheduleNativeEngineSync();
      });
    }, NATIVE_SYNC_INTERVAL_MS);
  }

  private sendNativeMidi(inputSlot: number, status: number, data1: number, data2: number): void {
    if (!hookKeysNative.isAvailable() || !this.liveMidiEnabled) return;
    const type = status & 0xf0;
    const releasesHeldVoices = type === 0x80 || (type === 0x90 && data2 === 0) ||
      (type === 0xb0 && ((data1 === 64 && data2 < 64) || data1 === 120 || data1 === 123));
    if (this.nativeEngineReady || ((this.nativePresetTransitionPending || this.nativePresetTransitionInFlight) && releasesHeldVoices)) {
      // O caminho de execução ao vivo não espera round-trip da WebView: o
      // callback nativo recebe a mensagem imediatamente e o áudio continua
      // independente de qualquer trabalho da interface.
      void hookKeysNative.sendMidi(inputSlot, status, data1, data2).catch(() => {
        this.nativeEngineReady = false;
      });
      return;
    }
    // Mensagens de performance nunca são guardadas para reprodução posterior.
    // Recupere a saída uma vez, mas descarte esta nota/expressão.
    if (this.nativeRecoveryPromise) return;
    this.nativeRecoveryPromise = this.ensureNativeAudioReady()
      .catch(() => {
        this.nativeEngineReady = false;
        this.setStatus('A saída de áudio está sendo recuperada.');
      }).finally(() => { this.nativeRecoveryPromise = null; });
  }

  private async ensureNativeAudioReady(): Promise<void> {
    if (!hookKeysNative.isAvailable() || !this.mounted) return;
    await this.nativeBootPromise.catch(() => undefined);
    if (!this.mounted) return;
    // Caminho normal de performance: nenhuma consulta JS/nativa extra por
    // nota. O monitor de rota invalida esta flag quando a saída cai.
    if (this.nativeEngineReady) return;
    let status = await hookKeysNative.audioOutputStatus();
    // Na primeira abertura o AVAudioEngine pode já estar rodando enquanto o
    // primeiro callback ainda não chegou. Dê tempo à rota antes de destruí-la
    // e criar outra — especialmente após login/orientação no iPhone.
    for (let attempt = 0; !status.ready && attempt < 8; attempt += 1) {
      await new Promise(resolve => window.setTimeout(resolve, 100));
      if (!this.mounted) return;
      status = await hookKeysNative.audioOutputStatus();
    }
    if (!status.ready) {
      this.nativeEngineReady = false;
      await this.fallbackToDefaultAudioOutput(true);
    }
    if (!this.nativeEngineReady) await this.syncNativeEngine();
    if (!this.nativeEngineReady) {
      throw new Error(this.nativeStartupErrorMessage());
    }
  }

  private nativeStartupErrorMessage(): string {
    const raw = nativeErrorMessage(this.nativeEngineSyncError) ?? hookKeysNative.initializationErrorMessage();
    if (!raw || raw === 'native_audio_unavailable') {
      return 'O áudio nativo do iPhone não iniciou. Toque em Tentar novamente.';
    }
    if (/not implemented|plugin.*unavailable|not available/i.test(raw)) {
      return 'A interface e o motor nativo são de versões diferentes. Instale novamente este build.';
    }
    return raw;
  }

  private syncNativeEngine(): Promise<void> {
    if (!hookKeysNative.isAvailable()) return Promise.resolve();
    const configurationReady = this.queueNativeConfiguration();
    // A fila leve de comandos fica livre enquanto o arquivo grande é lido.
    // Quem precisa aguardar o timbre (boot/seleção) aguarda somente esta fila.
    const revision = this.soundfontSelectionRevision;
    this.nativeSoundfontSyncQueue = this.nativeSoundfontSyncQueue
      .catch(() => undefined)
      .then(async () => {
        await configurationReady;
        // Trocou de preset, a próxima nota já é dele. A camada anterior segura
        // só as notas que já estavam soando (release, sustain); nenhuma nota
        // nova vai para o timbre antigo. Módulos cujo SF2 ainda está chegando
        // ficam desligados na camada nova (enabled exige o timbre carregado)
        // e entram sozinhos na reconfiguração depois do carregamento.
        if (this.mounted && this.nativePresetTransitionInFlight) {
          await hookKeysNative.commitPresetTransition();
          this.nativePresetTransitionInFlight = false;
        }
        if (!this.mounted || revision !== this.soundfontSelectionRevision) return;
        await this.syncNativeSoundfonts(revision);
        if (this.mounted) await this.queueNativeConfiguration();
      })
      .catch(() => {
        if (this.mounted) this.setStatus('Não foi possível sincronizar os timbres. Tente novamente.');
      });
    return this.nativeSoundfontSyncQueue;
  }

  private queueNativeConfiguration(): Promise<void> {
    this.nativeEngineSyncQueue = this.nativeEngineSyncQueue
      .catch(() => undefined)
      .then(() => this.performNativeEngineSync())
      .then(() => {
        if (this.mounted) {
          this.nativeEngineReady = true;
          this.nativeEngineSyncError = null;
        }
      })
      .catch((error) => {
        this.nativeEngineReady = false;
        this.nativeEngineSyncError = error;
        this.setStatus('O motor de áudio será sincronizado novamente.');
      });
    return this.nativeEngineSyncQueue;
  }

  private async performNativeEngineSync(): Promise<void> {
    if (!await hookKeysNative.initialize(this.bufferSize, this.sampleRate)) {
      throw new Error(hookKeysNative.initializationErrorMessage() ?? 'native_audio_unavailable');
    }
    if (this.nativePresetTransitionPending || this.nativePresetTransitionInFlight) {
      this.nativePresetTransitionPending = false;
      if (!this.nativePresetTransitionInFlight) {
        this.nativePresetTransitionInFlight = true;
        try {
          await hookKeysNative.beginPresetTransition();
        } catch (error) {
          this.nativePresetTransitionInFlight = false;
          this.nativePresetTransitionPending = true;
          throw error; // never apply new settings onto the still-audible old layer
        }
      }
    }
    const preset = this.getActivePresetState();
    const configurationTasks: Promise<void>[] = [
      hookKeysNative.setGlobalTranspose(this.globalOctaveShift * 12 + this.globalTransposeSemitones),
    ];
    for (let moduleIndex = 0; moduleIndex < MODULE_COUNT; moduleIndex += 1) {
      const moduleState = preset?.modules[moduleIndex];
      const selectedSlot = moduleState?.midiInputId
        ? this.selectedMidiInputIds.indexOf(moduleState.midiInputId)
        : -1;
      const outputRoute = isAudioBusRoute(moduleState?.settings.outputRoute, this.activeAudioChannelCount())
        ? moduleState.settings.outputRoute as AudioBusRoute
        : this.audioRouting.timbres;
      const nativeOutputRoute = parseAudioBusRoute(outputRoute);
      const synthSettings = moduleIndex === 7 ? readSynthSettings(moduleState?.settings.synth) : null;
      const organSettings = moduleIndex === 6 ? readOrganSettings(moduleState?.settings.organ) : null;
      // No Sens: desliga o envelope do amplificador (o que faz o volume
      // seguir o velocity), soando sempre no ganho pleno da wave. É o motor
      // quem aplica isso agora — inclusive nas notas já soando, na hora —
      // então a curva de velocity continua valendo do jeito real.
      const noSens = moduleIndex === 6 ? true : synthSettings
        ? synthSettings.noVelocitySensitivity
        : readNoVelocitySensitivity(moduleState?.settings ?? {});
      const velocityCurve = readVelocityCurveSettings(moduleState?.settings.velocityCurve);
      // Mono/Legato agora é o motor quem decide (substitui e devolve a nota
      // anterior ainda presa): não força mais a polifonia a 1, senão o
      // roteador rouba a nota antes do motor conseguir devolvê-la.
      const mono = moduleIndex < 7 && moduleState?.settings.voiceMode === 'mono';
      const legato = mono && readLegato(moduleState?.settings ?? {});
      // Todo módulo tem seu próprio Arpeggiator: cada um escuta seu próprio
      // slot gerado (base + índice do módulo) — ver arpeggiatorInputSlotForModule.
      const arpeggiatorSettings = readArpeggiatorSettings(moduleState?.settings.arpeggiator);
      const patternInputSlot = arpeggiatorSettings.enabled
        ? arpeggiatorInputSlotForModule(moduleIndex + 1)
        : null;
      const drumSound = isDrumCatalogSound(this.soundCatalog, moduleState?.timbreId);
      const drumZeroReleaseMasks = drumSound
        ? encodeDrumZeroReleaseNotes(moduleState?.settings.drumZeroReleaseNotes)
        : [0, 0, 0, 0] as const;
      configurationTasks.push(hookKeysNative.configureModule({
        moduleIndex,
        enabled: Boolean(moduleState?.enabled && (moduleIndex === 6 || moduleIndex === 7 ||
          (moduleState.timbreId && moduleState.timbreId === this.nativeLoadedTimbres[moduleIndex]))),
        inputSlot: patternInputSlot ?? (selectedSlot >= 0 ? selectedSlot : 3),
        lowNote: moduleState?.lowNote ?? 0,
        highNote: moduleState?.highNote ?? 127,
        octave: moduleState?.octaveShift ?? 0,
        // O pedal vale também no arpeggiator: pisado, ele segura as teclas e a
        // frase continua rodando. Quem não quiser desliga no botão Sustain do
        // próprio módulo.
        sustain: moduleState?.sustainInputEnabled ?? true,
        modulation: moduleState?.modulationInputEnabled ?? true,
        gmDrumHiHatChoke: drumSound,
        drumZeroReleaseMask0: drumZeroReleaseMasks[0],
        drumZeroReleaseMask1: drumZeroReleaseMasks[1],
        drumZeroReleaseMask2: drumZeroReleaseMasks[2],
        drumZeroReleaseMask3: drumZeroReleaseMasks[3],
        volumeDb: faderModeUsesPersistentVolumes(
          this.bankStates.get(this.activeBank)?.faderMode ?? 'default',
        )
          ? this.bankStates.get(this.activeBank)?.masterVolumes[moduleIndex] ?? 0
          : moduleState?.volumeDb ?? 0,
        polyphony: Math.round(Math.min(128, Math.max(1, Number(moduleState?.settings.polyphony) || 128))),
        velocityCurve0: velocityCurve.points[0],
        velocityCurve1: velocityCurve.points[1],
        velocityCurve2: velocityCurve.points[2],
        velocityCurve3: velocityCurve.points[3],
        velocityCurve4: velocityCurve.points[4],
        noVelocitySensitivity: Boolean(noSens),
        mono,
        legato,
        outputChannelStart: nativeOutputRoute.start,
        outputChannelCount: nativeOutputRoute.count,
        outputDualMono: this.moduleOutputMono,
      }));
      if (moduleState) {
        const modulationMode = readModuleModulationMode(moduleState.settings);
        configurationTasks.push(hookKeysNative.configureModuleModulation({
          moduleIndex,
          // No Organ, Rotary usa a roda exclusivamente no processador Leslie.
          // O modo 4 bloqueia tanto o LFO interno quanto o CC1 do próprio SF2.
          mode: moduleIndex === 6 && modulationMode === 'rotary'
            ? 4 : moduleModulationEngineMode(modulationMode),
          rateHz: readModuleModulationRate(moduleState.settings),
          intensity: (modulationMode === 'pan' || modulationMode === 'tremolo'
            ? readModuleModulationIntensity(moduleState.settings, modulationMode) : 100) / 100,
        }));
        const glideSource = moduleIndex === 7 && synthSettings
          ? synthSettings as unknown as Readonly<Record<string, unknown>>
          : moduleState.settings;
        const glideVelocity = readGlideVelocity(glideSource);
        configurationTasks.push(hookKeysNative.configureVelocityLimits(moduleIndex === 6
          ? { moduleIndex, ignoreAbove: 127, ceiling: 127,
              oscillator1Limit: 127, oscillator2Limit: 127, oscillator3Limit: 127 }
          : moduleIndex === 7 && synthSettings
          ? { moduleIndex, ignoreAbove: 127, ceiling: 127,
              oscillator1Limit: synthSettings.oscillator1VelocityLimit,
              oscillator2Limit: synthSettings.oscillator2VelocityLimit,
              oscillator3Limit: synthSettings.oscillator3VelocityLimit }
          : { moduleIndex, ignoreAbove: readVelocityLimit(moduleState.settings.velocityLimit),
              ceiling: readVelocityLimit(moduleState.settings.velocityCeiling),
              oscillator1Limit: 127, oscillator2Limit: 127, oscillator3Limit: 127 }));
        configurationTasks.push(hookKeysNative.configureGlide({
          moduleIndex,
          portamento: moduleIndex === 6 ? false : readGlideMode(glideSource) === 'portamento',
          velocityGateEnabled: moduleIndex === 6 ? false : glideVelocity.enabled,
          velocityGateInverted: moduleIndex === 6 ? false : glideVelocity.inverted,
          velocityThreshold: moduleIndex === 6 ? 64 : glideVelocity.threshold,
        }));
        if (moduleIndex === 7 && synthSettings) {
          configurationTasks.push(hookKeysNative.configureSynth({
            oscillator1: synthOscillatorIndex(synthSettings.oscillator1),
            oscillator2: synthOscillatorIndex(synthSettings.oscillator2),
            oscillator3: synthOscillatorIndex(synthSettings.oscillator3),
            oscillator1Enabled: synthSettings.oscillator1Enabled,
            oscillator2Enabled: synthSettings.oscillator2Enabled,
            oscillator3Enabled: synthSettings.oscillator3Enabled,
            voiceMode: synthSettings.voiceMode === 'poly' ? 0 : synthSettings.legato ? 2 : 1,
            lfoTarget: synthLfoTargetIndex(synthSettings.lfoTarget),
            oscillator1Volume: oscillatorVolumeGain(synthSettings.oscillator1Volume),
            oscillator2Volume: oscillatorVolumeGain(synthSettings.oscillator2Volume),
            oscillator3Volume: oscillatorVolumeGain(synthSettings.oscillator3Volume),
            oscillator1DetuneCents: synthSettings.oscillator1DetuneCents,
            oscillator2DetuneCents: synthSettings.oscillator2DetuneCents,
            oscillator3DetuneCents: synthSettings.oscillator3DetuneCents,
            attackMs: synthSettings.attackMs,
            holdMs: synthSettings.holdMs,
            decayMs: synthSettings.decayMs,
            sustain: synthSettings.sustain / 100,
            releaseMs: synthSettings.releaseMs,
            filterCutoffHz: synthSettings.filterCutoffHz,
            filterResonance: synthSettings.filterResonance / 100,
            filterEnvelope: synthSettings.filterEnvelope / 100,
            lfoRateHz: synthSettings.lfoRateHz,
            lfoDepth: synthSettings.lfoDepth / 100,
            glideMs: effectiveGlideMs(
              synthSettings as unknown as Readonly<Record<string, unknown>>,
              this.metronome.getBpm(),
            ),
            oscillator1Octave: synthSettings.oscillator1Octave,
            oscillator2Octave: synthSettings.oscillator2Octave,
            oscillator3Octave: synthSettings.oscillator3Octave,
          }));
        } else {
          configurationTasks.push(hookKeysNative.configureModuleEnvelope({
            moduleIndex,
            attackMs: optionalBoundedNumber(moduleState.settings.attackMs, 0, 15_000),
            holdMs: optionalBoundedNumber(moduleState.settings.holdMs, 0, 15_000),
            decayMs: optionalBoundedNumber(moduleState.settings.decayMs, 0, 25_000),
            releaseMs: optionalBoundedNumber(moduleState.settings.releaseMs, 0, 25_000),
            glideMs: moduleIndex === 6 ? 0 : effectiveGlideMs(moduleState.settings, this.metronome.getBpm()),
            sustainDb: readModuleSustainDb(moduleState.settings),
          }));
        }
        if (moduleIndex === 6 && organSettings) {
          configurationTasks.push(hookKeysNative.configureOrgan({ drawbars: organSettings.drawbars }));
        }
        // Todo módulo tem seu próprio Pulse (Trance Gate).
        {
          const gate = readTranceGateSettings(moduleState.settings.tranceGate);
          configurationTasks.push(hookKeysNative.configureTranceGate({
            moduleIndex, enabled: gate.enabled,
            steps: gate.steps.reduce((mask, enabled, index) => enabled ? mask | (1 << index) : mask, 0),
            length: gate.length, beatMultiplier: tranceGateStepBeats(gate, this.metronome.getBpm()),
            gate: gate.gate / 100, depth: gate.depth / 100, attackMs: gate.attackMs,
            releaseMs: gate.releaseMs, swing: gate.swing / 100,
          }));
        }
        const eqBands = readModuleEqBands(moduleState.settings.eqBands);
        const filterVelocity = readFilterVelocityCurve(moduleState.settings.filterVelocityCurve);
        const moduleCutoffHz = readModuleCutoffFrequency(moduleState.settings.cutoffHz);
        const cutoffFilterType = readCutoffFilterType(moduleState.settings.cutoffFilterType);
        const cutoffEnvelope = readModuleCutoffEnvelopeSettings(moduleState.settings.cutoffEnvelope);
        // Velocity do filtro desligado: todos os pontos em 127, o corte fica no Cutoff do Config.
        const cutoffVelocity: [number, number, number, number, number] = readFilterVelocityEnabled(moduleState.settings)
          ? filterVelocityEnginePoints(filterVelocity.points, readFilterVelocityCutoffHz(moduleState.settings), moduleCutoffHz)
          : [127, 127, 127, 127, 127];
        const eqEnabled = moduleState.settings.eqEnabled !== false;
        const compressor = readModuleCompressorSettings(moduleState.settings.compressor);
        const delay = readModuleDelaySettings(moduleState.settings.delay);
        const reverb = readModuleReverbSettings(moduleState.settings.reverb);
        const rotary = readModuleRotarySettings(moduleState.settings.rotary);
        const chorus = readModuleChorusSettings(moduleState.settings.chorus);
        // O Auto Fader mora dentro dos ajustes do arpeggiator.
        const autoFader = readModuleAutoFaderSettings(moduleState.settings.arpeggiator);
        configurationTasks.push(hookKeysNative.configureModuleEffects({
          moduleIndex,
          cutoffHz: moduleIndex === 6 ? 20_000 : moduleCutoffHz,
          cutoffVelocity0: moduleIndex === 6 ? 127 : cutoffVelocity[0],
          cutoffVelocity1: moduleIndex === 6 ? 127 : cutoffVelocity[1],
          cutoffVelocity2: moduleIndex === 6 ? 127 : cutoffVelocity[2],
          cutoffVelocity3: moduleIndex === 6 ? 127 : cutoffVelocity[3],
          cutoffVelocity4: moduleIndex === 6 ? 127 : cutoffVelocity[4],
          cutoffFilterType: moduleIndex === 6 ? 0 : CUTOFF_FILTER_TYPES.indexOf(cutoffFilterType),
          cutoffEnvelopeEnabled: moduleIndex === 6 ? false : cutoffEnvelope.enabled,
          cutoffEnvelopeAttackMs: cutoffEnvelope.attackMs,
          cutoffEnvelopeDecayMs: cutoffEnvelope.decayMs,
          cutoffEnvelopeSustain: cutoffEnvelope.sustain / 100,
          cutoffEnvelopeReleaseMs: cutoffEnvelope.releaseMs,
          cutoffEnvelopeDepthOctaves: cutoffEnvelope.depthOctaves,
          eqTypes: eqBands.map(({ type }) => !eqEnabled ? 2 : type === 'low-cut' ? 0
            : type === 'low-shelf' ? 1 : type === 'high-shelf' ? 3 : type === 'high-cut' ? 4 : 2),
          eqFrequencies: eqBands.map(({ frequency }) => frequency),
          eqGains: eqBands.map(({ gain }) => eqEnabled ? gain : 0),
          eqQualities: eqBands.map(({ q }) => q),
          eqCutStages: eqBands.map(({ cutSlope }) => cutSlope),
          compressorThresholdDb: compressor.thresholdDb,
          compressorRatio: compressor.ratio,
          compressorAttackMs: compressor.attackMs,
          compressorReleaseMs: compressor.releaseMs,
          compressorGainDb: compressor.gainDb,
          compressorMix: compressor.enabled ? compressor.mix / 100 : 0,
          delaySync: delay.sync,
          delayMs: delay.milliseconds,
          delayBeatMultiplier: delayDivisionMultiplier(delay.division),
          delayFeedback: delay.feedback / 100,
          delayMix: delay.enabled ? delay.mix / 100 : 0,
          reverbDecay: (reverb.decay - 0.1) / 19.9,
          reverbDampen: reverb.dampen / 100,
          reverbMod: reverb.mod / 100,
          reverbSize: reverb.size / 100,
          reverbMix: reverb.enabled ? readReverbSpaceMix(moduleState.settings) / 100 : 0,
          reverbImpulse: REVERB_SPACES[readReverbSpace(moduleState.settings.reverbSpace)].impulse,
          rotaryEnabled: moduleIndex === 6 && rotary.enabled,
          rotarySpeed: rotary.speed === 'brake' ? 0 : rotary.speed === 'fast' ? 2 : 1,
          rotarySlowHz: rotary.slowHz,
          rotaryFastHz: rotary.fastHz,
          rotaryRampSeconds: rotary.rampSeconds,
          rotaryDepth: rotary.depth / 100,
          rotaryMix: rotary.mix / 100,
          rotaryModulationEnabled: moduleIndex === 6
            && readModuleModulationMode(moduleState.settings) === 'rotary',
          chorusEnabled: chorus.enabled,
          chorusRateHz: chorus.rateHz,
          chorusDepth: chorus.depth / 100,
          chorusMix: chorus.mix / 100,
          autoFaderEnabled: autoFader.enabled,
          autoFaderBeats: autoFader.division === '1/2' ? 2 : 1,
          autoFaderDepthDb: autoFader.depthDb,
          inputGainDb: readModuleGainDb(moduleState.settings),
        }));
      }
    }
    const masterRoute = parseAudioBusRoute(this.audioRouting.timbres);
    configurationTasks.push(
      hookKeysNative.setTempo(this.metronome.getBpm()),
      hookKeysNative.setOutputGain(
        this.outputLevels.master, this.outputEnabled.master,
        masterRoute.start, masterRoute.count,
      ),
      this.applyMetronomeOutput(),
      this.applyNativeMusicOutput(),
      hookKeysNative.setCompatibilityMode(this.compatibilityMode),
      hookKeysNative.setSeamlessPresetSwitching(this.seamlessPresetSwitching),
      this.metronome.syncNativeState(),
    );
    // Synth, master, metrônomo, módulos e efeitos pertencem ao mesmo lote.
    // Só depois desse lote os SF2 são entregues e o motor aceita notas.
    await Promise.all(configurationTasks);
  }

  private async syncNativeSoundfonts(revision = this.soundfontSelectionRevision): Promise<void> {
    const preset = this.getActivePresetState();
    const sourceByTimbre = new Map<string, number>();
    for (let index = 0; index < this.nativeLoadedTimbres.length - 1; index += 1) {
      const loaded = this.nativeLoadedTimbres[index];
      if (loaded && !sourceByTimbre.has(loaded)) sourceByTimbre.set(loaded, index);
    }
    for (let moduleIndex = 0; moduleIndex < MODULE_COUNT; moduleIndex += 1) {
      if (!this.mounted || revision !== this.soundfontSelectionRevision) return;
      if (moduleIndex === 7) continue;
      const timbreId = preset?.modules[moduleIndex]?.timbreId ?? null;
      if (!timbreId) {
        if (this.nativeLoadedTimbres[moduleIndex]) {
          await hookKeysNative.unloadSoundFont(moduleIndex).catch(() => undefined);
          this.nativeLoadedTimbres[moduleIndex] = null;
        }
        continue;
      }
      if (timbreId === this.nativeLoadedTimbres[moduleIndex]) {
        if (!sourceByTimbre.has(timbreId)) sourceByTimbre.set(timbreId, moduleIndex);
        continue;
      }
      const sharedSource = sourceByTimbre.get(timbreId);
      if (sharedSource !== undefined && sharedSource !== moduleIndex &&
          this.nativeLoadedTimbres[sharedSource] === timbreId) {
        try {
          await hookKeysNative.cloneSoundFont(sharedSource, moduleIndex);
          this.nativeLoadedTimbres[moduleIndex] = timbreId;
          continue;
        } catch {
          // An older/native bridge may not support the optimized copy yet.
          // Fall through to a complete upload so sound is never lost.
        }
      }
      const blob = timbreId.startsWith('user:')
        ? await this.soundLibrary.getUserFile(timbreId.slice(5))
        : (await this.soundLibrary.getFixed(timbreId.replace(/^fixed:/, '')))?.file ?? null;
      if (!blob) continue;
      try {
        await hookKeysNative.loadSoundFont(moduleIndex, blob,
          () => !this.mounted || revision !== this.soundfontSelectionRevision,
          (progress) => {
            const loadingProgress = this.modal?.querySelector<HTMLElement>('[data-sound-loading-progress]');
            if (loadingProgress && this.currentModalModuleNumber === moduleIndex + 1) {
              loadingProgress.textContent = progress >= 99
                ? 'Preparando o timbre no motor…'
                : `Carregando timbre: ${progress}%`;
            }
            const button = this.modal?.querySelector<HTMLButtonElement>('[data-user-soundfont-id][aria-current="true"]');
            if (button && this.currentModalModuleNumber === moduleIndex + 1) {
              button.setAttribute('aria-label', `Carregando timbre: ${progress}%`);
              const message = this.modal?.querySelector<HTMLElement>('[data-user-sf2-load-status]');
              if (message) message.textContent = progress >= 99
                ? 'Preparando o timbre no motor…'
                : `Carregando timbre: ${progress}%`;
            }
          }, `${this.account.email.toLowerCase()}:${timbreId}`);
        this.nativeLoadedTimbres[moduleIndex] = timbreId;
        if (!sourceByTimbre.has(timbreId)) sourceByTimbre.set(timbreId, moduleIndex);
      } catch {
        if (revision !== this.soundfontSelectionRevision || !this.mounted) return;
        this.setStatus(`Não foi possível carregar o timbre do módulo ${moduleIndex + 1}.`);
      }
    }
  }

  private createSavedPlayerState(): object {
    return {
      version: 1,
      velocityCurveDefault: 'soft-v2',
      fixedModuleVelocityDefault: 'v2',
      filterVelocityDefault: 'fixed-v1',
      moduleGlideDefault: 'ms-v1',
      modulationRateDefault: '6.85',
      organTranceGateDefault: 'off-v1',
      organModulationDefault: 'rotary-r-tg-v1',
      moduleReverbDefault: 'room-v1',
      activeBank: this.activeBank,
      activePadBank: this.activePadBank,
      activeEffectBank: this.activeEffectBank,
      bufferSize: this.bufferSize,
      bufferSizeDefault: 'safe-256',
      sampleRate: this.sampleRate,
      compatibilityMode: this.compatibilityMode,
      seamlessPresetSwitching: this.seamlessPresetSwitching,
      liteMode: this.liteMode,
      bottomView: this.bottomView,
      keyboardMidiSlot: this.keyboardMidiSlot,
      keyboardStyle: this.keyboardStyle,
      keyboardOctaveSpan: this.keyboardOctaveSpan,
      globalOctaveShift: this.globalOctaveShift,
      globalTransposeSemitones: this.globalTransposeSemitones,
      moduleOutputMono: this.moduleOutputMono,
      midiInputIds: [...this.selectedMidiInputIds],
      audioDeviceId: this.selectedAudioDeviceId,
      audioRouting: { ...this.audioRouting },
      outputLevels: { ...this.outputLevels },
      outputEnabled: { ...this.outputEnabled },
      metronome: {
        accentEnabled: this.metronome.isAccentEnabled(),
        bpm: this.metronome.getBpm(),
        clickSound: this.metronome.getClickSound(),
        doubleTimeEnabled: this.metronome.isDoubleTimeEnabled(),
        timeSignatureDenominator: this.metronome.getTimeSignatureDenominator(),
        timeSignatureNumerator: this.metronome.getTimeSignatureNumerator(),
        volume: this.metronome.getVolume(),
      },
      ccMappings: Object.fromEntries(this.ccMappings),
      ccMappingOptions: Object.fromEntries(this.ccMappingOptions),
      padBankSelections: Object.fromEntries(this.padBankSelections),
      effectBankNames: Object.fromEntries(this.effectBankNames),
      effectPads: Object.fromEntries(
        EFFECT_BANK_IDS.map((bank) => [bank, (this.effectPadStates.get(bank) ?? []).map((effect) => ({
          colorIndex: effect.colorIndex,
          gateRelease: effect.gateRelease,
          name: effect.name,
          triggerMode: effect.triggerMode,
          volumeDb: effect.volumeDb,
        }))]),
      ),
      banks: Object.fromEntries(
        BANK_IDS.map((bankId) => [bankId, this.bankStates.get(bankId)]),
      ),
      seenSoundIds: [...this.seenSoundIds],
    };
  }

  private applySavedPlayerState(value: unknown): void {
    if (!isRecord(value) || value.version !== 1) return;
    const migrateLegacyVelocityDefault = value.velocityCurveDefault !== 'soft-v2';
    const migrateFixedModuleVelocity = value.fixedModuleVelocityDefault !== 'v1'
      && value.fixedModuleVelocityDefault !== 'v2';
    const migrateSynthFixedVelocity = value.fixedModuleVelocityDefault !== 'v2';
    const migrateLegacyFilterVelocity = value.filterVelocityDefault !== 'fixed-v1';
    const migrateModuleGlidePower = value.moduleGlideDefault !== 'ms-v1';
    const migrateModulationRate = value.modulationRateDefault !== '6.85';
    const migrateOrganTranceGate = value.organTranceGateDefault !== 'off-v1';
    const migrateOrganModulation = value.organModulationDefault !== 'rotary-r-tg-v1';
    const migrateModuleReverbRoom = value.moduleReverbDefault !== 'room-v1';
    const savedSeenSoundIds = Array.isArray(value.seenSoundIds) ? value.seenSoundIds : [];
    this.seenSoundIds = new Set(savedSeenSoundIds.filter((id): id is string => typeof id === 'string'));
    const savedMidiInputIds = Array.isArray(value.midiInputIds) ? value.midiInputIds : [];
    this.selectedMidiInputIds = Array.from({ length: 3 }, (_, index) => {
      const deviceId = savedMidiInputIds[index];
      return typeof deviceId === 'string' && deviceId.length > 0 ? deviceId.slice(0, 300) : null;
    });
    const savedBufferSize = Number(value.bufferSize);
    if (isBufferSize(savedBufferSize)) {
      // Estados gravados antes desta versao guardaram o padrao antigo de 128
      // quadros mesmo para quem nunca abriu a tela de audio. Sobe uma unica
      // vez; quem escolher 64 ou 128 depois disso mantem a escolha.
      this.bufferSize = value.bufferSizeDefault === 'safe-256'
        ? savedBufferSize
        : (Math.max(savedBufferSize, DEFAULT_BUFFER_SIZE) as BufferSize);
    }
    const savedSampleRate = Number(value.sampleRate);
    if (isSampleRate(savedSampleRate)) this.sampleRate = savedSampleRate;
    this.selectedAudioDeviceId = asString(value.audioDeviceId).slice(0, 500);
    const savedAudioRouting = isRecord(value.audioRouting) ? value.audioRouting : {};
    this.audioRouting = {
      timbres: isAudioBusRoute(savedAudioRouting.timbres) ? savedAudioRouting.timbres : 'stereo:0',
      pads: isAudioBusRoute(savedAudioRouting.pads) ? savedAudioRouting.pads : 'stereo:0',
      effects: isAudioBusRoute(savedAudioRouting.effects) ? savedAudioRouting.effects : 'stereo:0',
      metronome: isAudioBusRoute(savedAudioRouting.metronome) ? savedAudioRouting.metronome : 'stereo:0',
    };
    this.compatibilityMode = value.compatibilityMode === true;
    this.liteMode = value.liteMode === true;
    this.seamlessPresetSwitching = !this.liteMode && value.seamlessPresetSwitching === true;
    this.applyLiteMode();
    this.midiInput.setCompatibilityMode(this.compatibilityMode);
    this.bottomView = value.bottomView === 'keyboard' ? 'keyboard' : 'presets';
    const savedKeyboardMidiSlot = Number(value.keyboardMidiSlot);
    this.keyboardMidiSlot = savedKeyboardMidiSlot === 2 || savedKeyboardMidiSlot === 3 ? savedKeyboardMidiSlot : 1;
    const savedKeyboardStyle = asString(value.keyboardStyle);
    this.keyboardStyle = savedKeyboardStyle === 'black' || savedKeyboardStyle === 'hook' ? savedKeyboardStyle : 'standard';
    this.keyboardOctaveSpan = value.keyboardOctaveSpan === 'four' ? 'four' : 'full';
    this.globalOctaveShift = boundedNumber(value.globalOctaveShift, -3, 3, 0);
    this.globalTransposeSemitones = boundedNumber(value.globalTransposeSemitones, -24, 24, 0);
    this.moduleOutputMono = value.moduleOutputMono === true;
    this.renderGlobalOctaveButtons();
    this.renderGlobalTransposeButtons();
    this.renderModuleOutputModeButton();
    this.performanceKeyboard?.setStyle(this.keyboardStyle);
    const savedOutputLevels = isRecord(value.outputLevels) ? value.outputLevels : {};
    this.outputLevels = {
      music: boundedNumber(savedOutputLevels.music, OUTPUT_MIN_DB, MAX_OUTPUT_DB, DEFAULT_OUTPUT_LEVELS.music),
      pads: boundedNumber(savedOutputLevels.pads, OUTPUT_MIN_DB, MAX_OUTPUT_DB, DEFAULT_OUTPUT_LEVELS.pads),
      effects: boundedNumber(savedOutputLevels.effects, OUTPUT_MIN_DB, MAX_OUTPUT_DB, DEFAULT_OUTPUT_LEVELS.effects),
      master: boundedNumber(savedOutputLevels.master, OUTPUT_MIN_DB, MAX_OUTPUT_DB, DEFAULT_OUTPUT_LEVELS.master),
    };
    const savedOutputEnabled = isRecord(value.outputEnabled) ? value.outputEnabled : {};
    this.outputEnabled = {
      music: typeof savedOutputEnabled.music === 'boolean' ? savedOutputEnabled.music : true,
      pads: typeof savedOutputEnabled.pads === 'boolean' ? savedOutputEnabled.pads : true,
      effects: typeof savedOutputEnabled.effects === 'boolean' ? savedOutputEnabled.effects : true,
      master: typeof savedOutputEnabled.master === 'boolean' ? savedOutputEnabled.master : true,
    };
    const savedMetronome = isRecord(value.metronome) ? value.metronome : {};
    const savedClickSound = Number(savedMetronome.clickSound);
    this.metronome.applySavedSettings(
      boundedNumber(savedMetronome.bpm, 60, 600, 120),
      boundedNumber(savedMetronome.volume, 0, 10 ** (12 / 20), 1),
      (savedClickSound === 2 || savedClickSound === 3 ? savedClickSound : 1) as MetronomeClickSound,
      savedMetronome.accentEnabled === true,
      savedMetronome.doubleTimeEnabled === true,
      boundedNumber(savedMetronome.timeSignatureNumerator, 1, 16, 4),
      boundedNumber(savedMetronome.timeSignatureDenominator, 2, 16, 4),
    );
    this.ccMappings.clear();
    this.ccMappingOptions.clear();
    const savedCcMappings = isRecord(value.ccMappings) ? value.ccMappings : {};
    for (const [targetKey, controllerValue] of Object.entries(savedCcMappings)) {
      const controller = Number(controllerValue);
      if (isCcMappingKey(targetKey) && Number.isInteger(controller) && controller >= 0 && controller <= 127) {
        this.ccMappings.set(targetKey, controller);
      }
    }
    const savedCcMappingOptions = isRecord(value.ccMappingOptions) ? value.ccMappingOptions : {};
    for (const [targetKey, optionsValue] of Object.entries(savedCcMappingOptions)) {
      if (!this.ccMappings.has(targetKey) || !isCcMappingKey(targetKey)) continue;
      this.ccMappingOptions.set(targetKey, normalizeCcMappingOptions(optionsValue));
    }
    // Estados anteriores deixavam o mesmo CC em vários controles. O Learn mais
    // recente é o último gravado, então ele fica e os antigos saem.
    const mappedTargets = new Map<string, string>();
    for (const [targetKey, controller] of this.ccMappings) {
      const scopedController = `${ccMappingConflictScope(targetKey)}:${controller}`;
      const earlier = mappedTargets.get(scopedController);
      if (earlier) {
        this.ccMappings.delete(earlier);
        this.ccMappingOptions.delete(earlier);
      }
      mappedTargets.set(scopedController, targetKey);
    }
    this.renderOutputLevels();
    this.renderBottomView();
    this.applyMusicOutput();
    this.applySelectedMidiInputs();
    if (this.isBankId(asString(value.activeBank))) this.activeBank = asString(value.activeBank) as BankId;
    if (this.isPadBankId(asString(value.activePadBank))) {
      this.activePadBank = asString(value.activePadBank) as PadBankId;
    }
    if (this.isEffectBankId(asString(value.activeEffectBank))) {
      this.activeEffectBank = asString(value.activeEffectBank) as EffectBankId;
    }
    const savedEffectBankNames = isRecord(value.effectBankNames) ? value.effectBankNames : {};
    for (const effectBank of EFFECT_BANK_IDS) {
      if (effectBank === '1' || effectBank === '2') {
        this.effectBankNames.set(effectBank, `FX ${effectBank}`);
        continue;
      }
      const name = typeof savedEffectBankNames[effectBank] === 'string'
        ? savedEffectBankNames[effectBank].trim().slice(0, 12)
        : '';
      this.effectBankNames.set(effectBank, name || `FX ${effectBank}`);
    }

    const savedSelections = isRecord(value.padBankSelections) ? value.padBankSelections : {};
    let restoredPadSelection = false;
    const padRestorationOrder = [
      this.activePadBank,
      ...PAD_BANK_IDS.filter((padBank) => padBank !== this.activePadBank),
    ];
    for (const padBank of padRestorationOrder) {
      const selection = savedSelections[padBank];
      const canRestore = !restoredPadSelection && typeof selection === 'string' && selection.length <= 12;
      this.padBankSelections.set(
        padBank,
        canRestore ? selection : null,
      );
      if (canRestore) restoredPadSelection = true;
    }

    const savedEffectPads = isRecord(value.effectPads) ? value.effectPads : {};
    for (const effectBank of EFFECT_BANK_IDS) {
      const sourceEffects = Array.isArray(savedEffectPads[effectBank])
        ? savedEffectPads[effectBank]
        : [];
      const defaults = createEffectPadStates();
      this.effectPadStates.set(
        effectBank,
        defaults.map((effect, index) => {
          const source = isRecord(sourceEffects[index]) ? sourceEffects[index] : null;
          if (!source) return effect;
          const requestedColorIndex = Number(source.colorIndex);
          return {
            active: false,
            audioFileName: null,
            colorIndex: Number.isInteger(requestedColorIndex) && EFFECT_PAD_COLORS[requestedColorIndex]
              ? requestedColorIndex
              : effect.colorIndex,
            gateRelease: source.gateRelease === 'continue-press' ? 'continue-press' : 'infinite',
            name: effectBank !== '1' && effectBank !== '2' && typeof source.name === 'string'
              ? source.name.trim().slice(0, 12) || effect.name
              : effect.name,
            triggerMode: source.triggerMode === 'gate' ? 'gate' : 'toggle',
            volumeDb: boundedNumber(source.volumeDb, EFFECT_PAD_MIN_DB, EFFECT_PAD_MAX_DB, effect.volumeDb),
          };
        }),
      );
    }

    const savedBanks = isRecord(value.banks) ? value.banks : {};
    for (const bankId of BANK_IDS) {
      const defaults = createBankState();
      const sourceBank = isRecord(savedBanks[bankId]) ? savedBanks[bankId] : null;
      if (!sourceBank) continue;
      defaults.name = typeof sourceBank.name === 'string'
        ? sourceBank.name.trim().slice(0, 12) || bankId
        : bankId;
      defaults.faderMode = sourceBank.faderMode === 'master' || sourceBank.faderMode === 'bank'
          || sourceBank.faderMode === 'bank2'
        ? sourceBank.faderMode
        : 'default';
      const savedMasterVolumes = Array.isArray(sourceBank.masterVolumes) ? sourceBank.masterVolumes : [];
      defaults.masterVolumes = Array.from({ length: MODULE_COUNT }, (_, index) =>
        boundedNumber(savedMasterVolumes[index], MODULE_FADER_MIN_DB, MODULE_FADER_MAX_DB, 0));
      const selectedPreset = sourceBank.selectedPreset;
      defaults.selectedPreset = typeof selectedPreset === 'number' && Number.isInteger(selectedPreset)
        ? selectedPreset >= 1 && selectedPreset <= PRESET_COUNT ? selectedPreset : 1
        : null;
      const sourcePresets = Array.isArray(sourceBank.presets) ? sourceBank.presets : [];
      defaults.presets = defaults.presets.map((preset, presetIndex) => {
        const sourcePreset = isRecord(sourcePresets[presetIndex]) ? sourcePresets[presetIndex] : null;
        if (!sourcePreset) return preset;
        const sourceModules = Array.isArray(sourcePreset.modules) ? sourcePreset.modules : [];
        return {
          name: typeof sourcePreset.name === 'string'
            ? sourcePreset.name.trim().slice(0, 20) || 'Preset'
            : 'Preset',
          modules: preset.modules.map((module, moduleIndex) => {
            const source = isRecord(sourceModules[moduleIndex]) ? sourceModules[moduleIndex] : null;
            if (!source) return module;
            const category = asString(source.category);
            const restoredSettings = isRecord(source.settings)
              ? { ...module.settings, ...source.settings }
              : module.settings;
            // Versões anteriores salvaram uma divisão rítmica no Glide. Ela não
            // faz parte do controle: Sync depende somente do BPM global.
            delete restoredSettings.glideDivision;
            restoredSettings.synth = readSynthSettings(restoredSettings.synth);
            if (migrateLegacyVelocityDefault) {
              const velocity = readVelocityCurveSettings(restoredSettings.velocityCurve);
              const legacyMiddle = velocity.mode === 'middle'
                && velocity.points.every((point, index) => point === [0, 32, 64, 96, 127][index]);
              const invertedSoft = velocity.mode === 'soft'
                && velocity.points.every((point, index) => point === [0, 52, 84, 108, 127][index]);
              if (legacyMiddle || invertedSoft) {
                restoredSettings.velocityCurve = {
                  ...DEFAULT_VELOCITY_CURVE,
                  points: [...DEFAULT_VELOCITY_CURVE.points],
                  userPoints: [...DEFAULT_VELOCITY_CURVE.userPoints],
                };
              }
            }
            // Antes o módulo 6 nascia em Soft como os demais. Estados desse
            // período ainda carregam esse Soft de fábrica: aplique o Fixed 80.
            if (migrateFixedModuleVelocity && moduleIndex === 5
                && readVelocityCurveSettings(restoredSettings.velocityCurve).mode === 'soft') {
              restoredSettings.velocityCurve = module.settings.velocityCurve;
            }
            // A v1 levou o Synth para Fixed 127. Com o No Sens o volume já não
            // segue o toque, então o Synth volta para o Soft de fábrica.
            if (migrateSynthFixedVelocity && moduleIndex === 7) {
              const velocity = readVelocityCurveSettings(restoredSettings.velocityCurve);
              if (velocity.mode === 'fixed' && velocity.fixedValue === 127) {
                restoredSettings.velocityCurve = module.settings.velocityCurve;
              }
            }
            // O Glide dos módulos tinha um ON/OFF. Sem ele, 0 ms é o desligado:
            // quem estava OFF passa a 0 ms (e sem Sync), quem estava ON segue igual.
            if (migrateModuleGlidePower && moduleIndex < 7) {
              if (restoredSettings.glideEnabled !== true) {
                restoredSettings.glideMs = DEFAULT_MODULE_GLIDE_MS;
                restoredSettings.glideSync = false;
              }
            }
            delete restoredSettings.glideEnabled;
            // O Rate do card Mod nascia em 7,55 Hz; o padrão agora é 6,85 Hz.
            if (migrateModulationRate && Number(restoredSettings.modulationRateHz) === 7.55) {
              restoredSettings.modulationRateHz = DEFAULT_MODULE_MODULATION_RATE_HZ;
            }
            // O Organ chegou a ser salvo com o Pulse ligado por padrão. Desliga
            // uma única vez nos estados antigos; depois a escolha do usuário é
            // preservada pelo marcador organTranceGateDefault.
            if (migrateOrganTranceGate && moduleIndex === 6) {
              restoredSettings.tranceGate = {
                ...readTranceGateSettings(restoredSettings.tranceGate),
                enabled: false,
              };
            }
            // O seletor Mod do Organ substituiu User por Rotary. Estados
            // antigos que ainda estavam no padrão User entram no Rotary; as
            // escolhas explícitas LFO/Tremolo/Pan permanecem intactas.
            if (moduleIndex === 6) {
              if (migrateOrganModulation
                  && (readModuleModulationMode(restoredSettings) === 'user'
                    || readModuleModulationMode(restoredSettings) === 'lfo')) {
                restoredSettings.modulationMode = 'rotary';
              }
              const organRotary = readModuleRotarySettings(restoredSettings.rotary);
              organRotary.modulationEnabled = readModuleModulationMode(restoredSettings) === 'rotary';
              restoredSettings.rotary = organRotary;
            }
            // Somente o antigo Reverb de fábrica vira Room. Configurações que o
            // usuário já personalizou continuam exatamente como estavam.
            if (migrateModuleReverbRoom) {
              const reverb = readModuleReverbSettings(restoredSettings.reverb);
              const wasLegacyFactory = reverb.enabled && reverb.decay === 10
                && reverb.dampen === 50 && reverb.mod === 0
                && reverb.size === 0 && reverb.mix === 50;
              if (wasLegacyFactory) restoredSettings.reverb = { ...FACTORY_MODULE_REVERB };
            }
            // O Velocity do Cutoff já nasceu em Middle. Com o Cutoff em 20 kHz
            // isso fechava o filtro nas notas fracas (~650 Hz em velocity 64) e
            // soava como sensibilidade mesmo com o volume em Fixed. Hoje ele
            // nasce desligado (filtro aberto), com a curva de fábrica.
            if (migrateLegacyFilterVelocity && isRecord(restoredSettings.filterVelocityCurve)) {
              const filterVelocity = readFilterVelocityCurve(restoredSettings.filterVelocityCurve);
              if (filterVelocity.mode === 'middle') {
                restoredSettings.filterVelocityCurve = module.settings.filterVelocityCurve;
              }
            }
            return {
              category: isSoundCategoryId(category) ? category : module.category,
              enabled: typeof source.enabled === 'boolean' ? source.enabled : module.enabled,
              highNote: boundedNumber(source.highNote, 0, 127, module.highNote),
              lowNote: boundedNumber(source.lowNote, 0, 127, module.lowNote),
              modulationInputEnabled: typeof source.modulationInputEnabled === 'boolean'
                ? source.modulationInputEnabled : module.modulationInputEnabled,
              midiInputId: typeof source.midiInputId === 'string'
                ? source.midiInputId.slice(0, 300) : null,
              octaveShift: boundedNumber(source.octaveShift, -3, 3, module.octaveShift),
              sustainInputEnabled: typeof source.sustainInputEnabled === 'boolean'
                ? source.sustainInputEnabled : module.sustainInputEnabled,
              timbreId: moduleIndex === 7
                ? null
                : typeof source.timbreId === 'string' ? source.timbreId.slice(0, 200) : null,
              timbreName: moduleIndex === 7
                ? 'Synth'
                : !source.timbreId
                ? moduleEmptySoundName(moduleIndex + 1)
                : typeof source.timbreName === 'string'
                  ? source.timbreName.slice(0, 120) : module.timbreName,
              timbreColor: moduleIndex === 7 ? null : normalizeSoundColor(source.timbreColor),
              volumeDb: boundedNumber(source.volumeDb, MODULE_FADER_MIN_DB, MODULE_FADER_MAX_DB, module.volumeDb),
              settings: restoredSettings,
              settingsMode: moduleIndex < 6 && source.settingsMode !== 'user' ? 'default' : 'user',
              userSettings: isRecord(source.userSettings) ? cloneSettings(source.userSettings) : null,
            };
          }),
        };
      });
      this.bankStates.set(bankId, defaults);
    }

    const activeBankState = this.bankStates.get(this.activeBank);
    const selectedBank = activeBankState && activeBankState.selectedPreset !== null
      ? this.activeBank
      : BANK_IDS.find((bankId) => {
        const bank = this.bankStates.get(bankId);
        return bank !== undefined && bank.selectedPreset !== null;
      }) ?? null;
    for (const bankId of BANK_IDS) {
      if (bankId !== selectedBank) {
        const bank = this.bankStates.get(bankId);
        if (bank) bank.selectedPreset = null;
      }
    }
  }

  private async deleteStoredTracks(tracks: LocalTrack[]): Promise<void> {
    this.trackTransport?.removeTracks(tracks.map(({ id }) => id));
    if (!hookKeysNative.audioPicker.isAvailable()) return;
    await Promise.all(tracks.map((track) => hookKeysNative.audioPicker.delete(
      track.id,
      trackFileExtension(track.fileName),
    )));
  }

  // iOS: "Add música" abre direto o seletor de documentos do sistema, já
  // filtrado em áudio, sem o menu de câmera e fotos do campo de arquivo da web.
  // As músicas chegam copiadas no app e entram uma de cada vez.
  private async importTracksFromNativePicker(): Promise<void> {
    const picker = hookKeysNative.audioPicker;
    const message = (text: string) => {
      this.tracksPanelController?.showMessage(text);
      this.splitTracksController?.showMessage(text);
    };
    let picked: Awaited<ReturnType<typeof picker.pick>>;
    try {
      picked = await picker.pick();
    } catch {
      message('Não foi possível abrir os arquivos.');
      return;
    }
    if (picked.length === 0) return;
    const setLoading = (loading: boolean, label?: string, progress?: number) => {
      this.tracksPanelController?.setImportLoading(loading, label, progress);
      this.splitTracksController?.setImportLoading(loading, label, progress);
    };
    setLoading(true, picked.length === 1 ? 'Adicionando música...' : `Adicionando ${picked.length} músicas...`);
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
    });
    let added = 0;
    let firstFailure = '';
    try {
      for (const [index, file] of picked.entries()) {
        const progress = `Adicionando ${index + 1} de ${picked.length}...`;
        message(progress);
        setLoading(true, progress, index / picked.length);
        let adopted = false;
        try {
          const recordId = globalThis.crypto?.randomUUID?.()
            ?? `track-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`;
          // Primeiro guarda o arquivo no armazenamento nativo. Só depois cria
          // a linha visível da biblioteca, evitando registros sem áudio.
          await picker.adopt(file.path, recordId, trackFileExtension(file.name));
          adopted = true;
          await this.trackLibrary.addNativeFile({
            id: recordId,
            name: file.name,
            mimeType: audioTypeForFileName(file.name),
            size: file.size,
          });
          added += 1;
        } catch (error) {
          // Segue com as outras músicas, mas guarda o primeiro motivo para a
          // mensagem final: sem ele a falha no aparelho não tem diagnóstico.
          if (!firstFailure) {
            const stage = adopted ? 'biblioteca' : 'arquivo';
            const detail = error instanceof Error ? error.message : String(error);
            firstFailure = `${stage}: ${detail}`.slice(0, 140);
          }
        } finally {
          if (!adopted) void picker.release(file.path).catch(() => undefined);
        }
      }
      await Promise.all([
        this.tracksPanelController?.refreshLibrary(),
        this.splitTracksController?.refreshLibrary(),
      ]);
      const failed = picked.length - added;
      const addedText = `${added} ${added === 1 ? 'música adicionada' : 'músicas adicionadas'}`;
      message(failed > 0
        ? `${addedText}. ${failed} não ${failed === 1 ? 'pôde' : 'puderam'} ser lida${failed === 1 ? '' : 's'}${firstFailure ? ` (${firstFailure})` : ''}.`
        : `${addedText}.`);
    } finally {
      setLoading(false);
    }
  }

  // Pinta o modal primeiro; decodificar a música fica para depois do quadro.
  private renderTrackWaveform(modal: HTMLElement): void {
    const transport = this.trackTransport;
    const trackId = transport?.getSelectedTrackId();
    if (!transport || !trackId) return;
    window.requestAnimationFrame(() => window.setTimeout(() => {
      void transport.loadWaveformPeaks().then((peaks) => {
        const bars = modal.querySelector<HTMLElement>('[data-waveform-bars]');
        if (!peaks || !bars || !modal.isConnected || transport.getSelectedTrackId() !== trackId) return;
        bars.querySelectorAll<HTMLElement>('i').forEach((bar, index) => {
          bar.style.setProperty('--wave-height', `${Math.max(6, Math.round((peaks[index] ?? 0) * 94))}%`);
        });
        bars.classList.remove('is-loading');
      });
    }, 0));
  }

  private setStatus(message: string): void {
    const status = this.root.querySelector<HTMLElement>('.player-screen__status');
    if (status) status.textContent = message;
  }
}

function capturePointer(element: HTMLElement, pointerId: number): void {
  try {
    element.setPointerCapture?.(pointerId);
  } catch {
    // Sem captura, o arraste segue pelos eventos do modal/raiz.
  }
}

function releasePointer(element: HTMLElement, pointerId: number): void {
  try {
    if (element.hasPointerCapture?.(pointerId)) element.releasePointerCapture(pointerId);
  } catch {
    // Captura já liberada.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function ensureReverbMixPresets(settings: Record<string, unknown>): Record<keyof typeof REVERB_SPACES, { mix: number }> {
  const existing = isRecord(settings.reverbSpaces) ? settings.reverbSpaces : {};
  const fallback = readModuleReverbSettings(settings.reverb).mix;
  const legacy: Partial<Record<keyof typeof REVERB_SPACES, string>> = { room1: 'room', room2: 'stage', hall1: 'hall' };
  const mixes = {} as Record<keyof typeof REVERB_SPACES, { mix: number }>;
  for (const key of Object.keys(REVERB_SPACES) as Array<keyof typeof REVERB_SPACES>) {
    const legacyKey = legacy[key];
    const saved = existing[key] ?? (legacyKey ? existing[legacyKey] : undefined);
    const value = isRecord(saved) ? Number(saved.mix) : Number.NaN;
    mixes[key] = { mix: Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : fallback };
  }
  settings.reverbSpaces = mixes;
  return mixes;
}

function isModuleEnvelopeParameter(value: string | undefined): value is ModuleEnvelopeParameter {
  return value !== undefined && Object.prototype.hasOwnProperty.call(MODULE_ENVELOPE_LIMITS, value);
}

function isModuleEffectKind(value: string | undefined): value is ModuleEffectKind {
  return value === 'compressor' || value === 'reverb' || value === 'delay' || value === 'rotary'
      || value === 'chorus' || value === 'cutoffEnvelope';
}

function isArpeggiatorModeValue(value: string | undefined): value is ArpeggiatorMode {
  return value !== undefined && (ARPEGGIATOR_MODES as readonly string[]).includes(value);
}

function isArpeggiatorDivisionValue(value: string | undefined): value is PatternDivision {
  return value !== undefined && (ARPEGGIATOR_DIVISIONS as readonly string[]).includes(value);
}

function delayDivisionMultiplier(division: string): number {
  if (division === '1/1') return 4;
  if (division === '1/2') return 2;
  if (division === '1/8') return 0.5;
  if (division === '1/16') return 0.25;
  if (division === '1/8 D') return 0.75;
  if (division === '1/8 T') return 1 / 3;
  return 1;
}

function moduleEmptySoundName(moduleNumber: number): string {
  if (moduleNumber === 8) return 'Synth';
  if (moduleNumber === 7) return 'Organ';
  return 'Sem timbre';
}

function createDefaultModuleSettings(moduleIndex = -1): Record<string, unknown> {
  const filterVelocityOnByDefault = moduleIndex === 0 || moduleIndex === 1;
  // Módulos 5 e 6 voltaram a ser módulos normais: sem curva de velocity fixa.
  const velocityCurve = { ...DEFAULT_VELOCITY_CURVE, points: [...DEFAULT_VELOCITY_CURVE.points] };
  return {
    ...MODULE_ENVELOPE_DEFAULTS,
    sustain: 100,
    cutoffHz: 20_000,
    eqEnabled: true,
    polyphony: 128,
    voiceMode: 'poly',
    glideMs: DEFAULT_MODULE_GLIDE_MS,
    glideSync: false,
    // O Organ nasce com a roda em Rotary; os demais módulos começam em User.
    modulationMode: moduleIndex === 6 ? 'rotary' : 'user',
    modulationRateHz: DEFAULT_MODULE_MODULATION_RATE_HZ,
    tremoloIntensity: 100,
    panIntensity: 100,
    velocityLimit: 127,
    velocityCeiling: 127,
    reverb: { ...FACTORY_MODULE_REVERB },
    rotary: {
      ...readModuleRotarySettings(undefined),
      enabled: moduleIndex === 6,
      modulationEnabled: moduleIndex === 6,
    },
    synth: factorySynthPreset(1),
    synthPresets: FACTORY_SYNTH_PRESETS.map((preset) => ({ ...preset })),
    synthActivePreset: 1,
    tranceGate: {
      ...readTranceGateSettings(undefined),
      enabled: moduleIndex !== 6,
    },
    arpeggiator: { ...DEFAULT_ARPEGGIATOR_SETTINGS },
    velocityCurve: {
      ...velocityCurve,
      points: [...velocityCurve.points],
      userPoints: [...DEFAULT_VELOCITY_CURVE.userPoints],
    },
    // Velocity do filtro: os módulos 1 e 2 já nascem com ele ligado em 110 Hz,
    // na curva Soft. Nos outros ele fica desligado, pronto para quando ligar.
    filterVelocityEnabled: filterVelocityOnByDefault,
    filterVelocityCutoffHz: filterVelocityOnByDefault ? 110 : DEFAULT_FILTER_VELOCITY_CUTOFF_HZ,
    filterVelocityCurve: {
      ...DEFAULT_VELOCITY_CURVE,
      fixedValue: 127,
      points: [...DEFAULT_VELOCITY_CURVE.points],
      userPoints: [...DEFAULT_VELOCITY_CURVE.userPoints],
    },
  };
}

// Só os módulos 1-6 escolhem timbre e têm config configurável pelo catálogo
// (Global da categoria / individual do timbre). O Organ (módulo 7) não tem.
function moduleSettingsScope(moduleNumber: number): 'modules1To6' | null {
  return moduleNumber >= 1 && moduleNumber <= 6 ? 'modules1To6' : null;
}

function isDrumCatalogSound(catalog: SoundCatalog, timbreId: string | null | undefined): boolean {
  if (!timbreId?.startsWith('fixed:')) return false;
  const sound = catalog.get(timbreId.slice(6));
  if (!sound) return false;
  const category = catalog.getCategory(sound.category);
  const categoryName = category?.name.trim().toLowerCase();
  return sound.category.toLowerCase() === 'drum' || categoryName === 'drum' || categoryName === 'bateria';
}

function encodeDrumZeroReleaseNotes(value: unknown): readonly [number, number, number, number] {
  const masks = [0, 0, 0, 0];
  if (!Array.isArray(value)) return masks as [number, number, number, number];
  for (const rawNote of value) {
    const note = Number(rawNote);
    if (!Number.isInteger(note) || note < 0 || note > 127) continue;
    const group = note >>> 5;
    masks[group] = ((masks[group] ?? 0) | (1 << (note & 31))) | 0;
  }
  return masks as [number, number, number, number];
}

function cloneSettings(value: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function mergeSettings(
  base: Readonly<Record<string, unknown>>,
  override: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const result = cloneSettings(base);
  for (const [key, value] of Object.entries(override)) {
    const current = result[key];
    if (isRecord(current) && isRecord(value)) result[key] = mergeSettings(current, value);
    else result[key] = value === undefined ? current : JSON.parse(JSON.stringify(value)) as unknown;
  }
  return result;
}

function formatGigabytes(bytes: number): string {
  const gigabytes = bytes / 1024 ** 3;
  return gigabytes >= 10 ? `${Math.round(gigabytes)} GB` : `${gigabytes.toFixed(1)} GB`;
}

// O download falhava sempre com a mesma frase. Cada erro conhecido vira uma
// mensagem que diz o que aconteceu, e o resto mostra o código real.
function soundDownloadErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  // Antes de baixar, o app pede ao backend o link assinado do arquivo. Quando é
  // esse pedido que falha, o problema não está no R2: mostre o código dele.
  if (error instanceof ApiError) {
    if (error.status === 0) return 'Sem conexão com o servidor do Hook Keys para pegar o link do timbre.';
    if (error.status === 401 || error.status === 403) {
      return `A conta não tem permissão para baixar este timbre (${error.status}).`;
    }
    if (error.status === 404) return 'O servidor não encontrou este timbre no catálogo (404).';
    return `O servidor do Hook Keys respondeu ${error.status} ao dar o link deste timbre${error.code ? ` (${error.code})` : ''}.`;
  }
  const status = /^sound_download_failed:(\d+)$/.exec(raw)?.[1];
  if (status === '401' || status === '403') {
    return `O servidor recusou o download deste timbre (${status}). Confira o link e a permissão do arquivo.`;
  }
  if (status === '404') return 'O arquivo deste timbre não está no servidor (404).';
  if (status) return `O servidor respondeu ${status} ao baixar este timbre.`;
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return isDesktopRuntime()
      ? 'A biblioteca local do desktop atingiu o limite de armazenamento. Tente liberar espaço na biblioteca e baixar novamente.'
      : 'Sem espaço neste aparelho para guardar o timbre.';
  }
  if (error instanceof RangeError || /allocation failed|out of memory|maximum size/i.test(raw)) {
    return 'O aparelho ficou sem memória para este timbre. Feche outros apps e tente de novo.';
  }
  if (raw === 'sound_too_large') return 'O arquivo do timbre é maior que o limite do app.';
  if (raw === 'sound_size_mismatch' || raw === 'sound_download_incomplete') {
    return 'O download veio incompleto. Confira a conexão e tente de novo.';
  }
  if (raw === 'sound_download_empty' || raw === 'sound_download_body_missing') {
    return 'O servidor não enviou o arquivo do timbre.';
  }
  if (raw === 'sound_integrity_failed') return 'O arquivo baixado não confere com o do servidor.';
  if (!navigator.onLine) return 'Sem conexão com a internet.';
  if (error instanceof TypeError) {
    return 'Não foi possível falar com o servidor do timbre. Confira a conexão.';
  }
  return `Não foi possível baixar este timbre (${raw || 'erro desconhecido'}).`;
}

// O ".sf2" nao diz nada para quem toca: fica so o nome do arquivo.
function withoutSoundfontExtension(fileName: string): string {
  return fileName.replace(/\.sf2$/i, '');
}

function presetSlotLabel(bank: BankId, presetNumber: number): string {
  return `Preset ${presetNumber.toString().padStart(2, '0')} do Banco ${bank}`;
}

function moduleDisplayName(moduleNumber: number): string {
  return String(moduleNumber);
}

function readFilterVelocityCurve(value: unknown) {
  return readVelocityCurveSettings(value ?? {
    mode: 'soft', fixedValue: 127,
    points: [...DEFAULT_VELOCITY_CURVE.points],
    userPoints: [...DEFAULT_VELOCITY_CURVE.userPoints],
  });
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeSoundColor(value: unknown): string | null {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

function boundedNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

async function hasStorageFor(byteSize: number | undefined): Promise<boolean> {
  // navigator.storage.estimate() no desktop/Tauri pode reportar uma cota de
  // WebView muito menor que o espaço do disco. A gravação no IndexedDB é a
  // verificação real; um QuotaExceededError será tratado no download.
  if (isDesktopRuntime()) return true;
  if (!byteSize || !navigator.storage?.estimate) return true;
  try {
    const estimate = await navigator.storage.estimate();
    if (estimate.quota === undefined || estimate.usage === undefined) return true;
    const available = Math.max(0, estimate.quota - estimate.usage);
    return available >= Math.ceil(byteSize * 1.08);
  } catch {
    return true;
  }
}

function formatBpm(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes >= 1024 ** 3) return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
}

function formatPublishedDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : `Publicado em ${date.toLocaleDateString('pt-BR')}`;
}

function formatSoundfontTotal(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 GB';
  if (bytes >= 1024 ** 3) return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
  const megabytes = bytes / (1024 ** 2);
  return `${megabytes < 10 ? megabytes.toFixed(2) : megabytes.toFixed(1)} MB`;
}

function performanceStorageId(assetId: string): string {
  return `performance:${assetId}`;
}

const AUDIO_ROUTING_BUSES = ['timbres', 'pads', 'effects', 'metronome'] as const satisfies readonly (keyof AudioBusRouting)[];

function isAudioRoutingBus(value: string | undefined): value is keyof AudioBusRouting {
  return (AUDIO_ROUTING_BUSES as readonly string[]).includes(value ?? '');
}

function parseAudioBusRoute(route: AudioBusRoute): { start: number; count: 1 | 2 } {
  const [mode, channel] = route.split(':');
  return {
    start: Math.max(0, Math.min(31, Number.parseInt(channel ?? '0', 10) || 0)),
    count: mode === 'mono' ? 1 : 2,
  };
}

async function sha256ForBlob(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function optionalBoundedNumber(value: unknown, minimum: number, maximum: number): number {
  const number = Number(value);
  return value !== null && value !== undefined && Number.isFinite(number)
    ? Math.min(maximum, Math.max(minimum, number))
    : -1;
}

function nativeErrorMessage(error: unknown): string | null {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  return null;
}

function escapeMarkup(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] ?? character);
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.length > 1
    ? `${parts[0]?.[0] ?? ''}${parts.at(-1)?.[0] ?? ''}`
    : (parts[0] ?? 'U').slice(0, 2);
  return initials.toLocaleUpperCase('pt-BR');
}

async function loadProfilePhoto(file: File): Promise<HTMLImageElement> {
  if (!file.type.startsWith('image/')) throw new Error('invalid_image');
  const sourceUrl = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('invalid_image'));
      element.src = sourceUrl;
    });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function createProfilePhotoCrop(state: {
  image: HTMLImageElement;
  canvas: HTMLCanvasElement;
  zoom: number;
  offsetX: number;
  offsetY: number;
} | null): string {
  if (!state) return '';
  const { image, canvas } = state;
  const diameter = canvas.height * .68;
  const scale = Math.max(diameter / image.naturalWidth, diameter / image.naturalHeight) * state.zoom;
  const renderedWidth = image.naturalWidth * scale;
  const renderedHeight = image.naturalHeight * scale;
  const renderedLeft = canvas.width / 2 + state.offsetX - renderedWidth / 2;
  const renderedTop = canvas.height / 2 + state.offsetY - renderedHeight / 2;
  const sourceSide = diameter / scale;
  const sourceX = (canvas.width / 2 - diameter / 2 - renderedLeft) / scale;
  const sourceY = (canvas.height / 2 - diameter / 2 - renderedTop) / scale;
  const output = document.createElement('canvas');
  output.width = 256;
  output.height = 256;
  const context = output.getContext('2d');
  if (!context) throw new Error('canvas_unavailable');
  context.drawImage(image, sourceX, sourceY, sourceSide, sourceSide, 0, 0, 256, 256);
  return output.toDataURL('image/jpeg', .82);
}
