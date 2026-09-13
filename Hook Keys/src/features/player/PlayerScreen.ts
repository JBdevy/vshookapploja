import type { HookKeysAccount } from '../auth/types';
import type { DeviceOverviewResponse, PasswordResetTokenResponse, RequestCodeResponse } from '../auth/types';
import type { PlayerStateService } from '../account/PlayerStateService';
import { KeyboardMidiRouter, keyboardMidiRoute } from './KeyboardMidiRouter';
import type { PlayerBackupService } from '../account/PlayerBackupService';
import type { AccountProfile } from '../account/AccountApi';
import {
  formatMidiNote,
  MidiInputService,
  type MidiControlChangeInput,
  type MidiNoteInput,
} from '../midi/MidiInputService';
import { createModuleFaderMarkup, ModuleFader, visualPositionToFaderDb } from './ModuleFader';
import {
  createAudioSettingsMarkup,
  createAppSettingsMarkup,
  createMidiSettingsMarkup,
  DEFAULT_BUFFER_SIZE,
  isBufferSize,
  type BufferSize,
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
  createModuleSettingsMarkup,
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
  type ModuleEqBand,
  type ModuleEnvelopeParameter,
} from './ModuleSettingsView';
import {
  createModuleCompressorMarkup,
  createModuleDelayMarkup,
  createModuleReverbMarkup,
  DELAY_DIVISIONS,
  delayMillisecondsForBpm,
  formatModuleEffectValue,
  readModuleCompressorSettings,
  readModuleDelaySettings,
  readModuleReverbSettings,
  type ModuleEffectKind,
} from './ModuleEffectsView';
import {
  createVelocityCurveMarkup,
  DEFAULT_VELOCITY_CURVE,
  isVelocityCurveMode,
  readVelocityCurveSettings,
  updateVelocityCurveMarkup,
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
  OUTPUTS,
  outputDbFromPosition,
  outputPosition,
  type OutputBus,
  type OutputLevels,
  type OutputEnabledState,
} from './OutputControls';
import { createOutputFaderPanelMarkup, OutputFaderPanelController } from './OutputFaderPanel';
import {
  createTrackTransportMarkup,
  TrackTransportController,
  type TrackPlaybackSnapshot,
} from '../tracks/TrackTransport';
import type { LocalTrack } from '../tracks/TrackLibraryStore';
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
import {
  createPerformanceKeyboardMarkup,
  createPerformanceKeyboardSettingsMarkup,
  PerformanceKeyboardController,
  type PerformanceKeyboardStyle,
  type PlayerBottomView,
} from './PerformanceKeyboard';
import { ComputerKeyboardController } from './ComputerKeyboardController';
import {
  createSynthModuleMarkup,
  DEFAULT_SYNTH_SETTINGS,
  readSynthSettings,
  synthLfoTargetIndex,
  synthOscillatorIndex,
  updateSynthRangeOutput,
  type SynthLfoTarget,
  type SynthModuleSettings,
  type SynthOscillator,
} from './SynthModuleView';
import {
  ARPEGGIATOR_MODES,
  createArpeggiatorMarkup,
  createSequencerMarkup,
  createSequencerStepEditor,
  DEFAULT_ARPEGGIATOR_SETTINGS,
  DEFAULT_SEQUENCER_SETTINGS,
  PATTERN_DIVISIONS,
  readArpeggiatorSettings,
  readSequencerSettings,
  updatePatternRangeOutput,
  type ArpeggiatorMode,
  type PatternDivision,
  type SequencerSettings,
} from './PatternModulesView';
import {
  ARPEGGIATOR_ENGINE_INPUT,
  PatternPlaybackController,
  SEQUENCER_ENGINE_INPUT,
  type PatternPlaybackSnapshot,
} from './PatternPlaybackController';

type LogoutCallback = () => Promise<void>;
type ModalKind = 'module-settings' | 'module-polyphony' | 'module-velocity' | 'module-arpeggiator' | 'module-sequencer' | 'module-synth' | 'module-eq' | 'module-compressor' | 'module-reverb' | 'module-delay' | 'sound-selection' | 'sound-download' | 'performance-download' | 'backup-download' | 'about' | 'app-settings' | 'app-settings-midi' | 'app-settings-audio' | 'keyboard-settings' | 'password-reset' | 'preset-name' | 'effect-pad' | 'user' | 'tracks' | 'output-volume' | 'cc-learn' | 'metronome' | 'tempo-edit' | 'track-position' | 'compatibility-mode';
type BankId = 'A' | 'B';
type PlayerView = 'bank' | 'pads-effects';

interface ModalRoute {
  kind: ModalKind;
  moduleNumber: number | null;
  trigger: HTMLElement;
}

interface BankState {
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
  pointerId: number;
  startValue: number;
  startY: number;
  travelPixels: number;
  moved: boolean;
}

type CcLearnTarget =
  | { kind: 'module-volume'; moduleNumber: number }
  | { kind: 'module-control'; moduleNumber: number; control: string; label: string }
  | { kind: 'module-octave'; moduleNumber: number; direction: -1 | 1 }
  | { kind: 'output-volume'; bus: OutputBus }
  | { kind: 'metronome-volume' }
  | { kind: 'tap-tempo' }
  | { kind: 'bank'; bank: BankId }
  | { kind: 'preset'; presetNumber: number }
  | { kind: 'pad'; bank: PadBankId; note: string }
  | { kind: 'effect'; bank: EffectBankId; effectNumber: number };

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
  getProfile: () => Promise<AccountProfile>;
  saveProfilePhoto: (imageDataUrl: string) => Promise<AccountProfile>;
  confirmDeviceRemoval: (deviceId: string, password: string) => Promise<{ ok: true; currentDeviceRemoved: boolean }>;
  requestPasswordReset: () => Promise<RequestCodeResponse>;
  verifyPasswordResetCode: (challengeId: string, code: string) => Promise<PasswordResetTokenResponse>;
  completePasswordReset: (passwordToken: string, password: string) => Promise<{ ok: true }>;
  finishCurrentDeviceRemoval: () => Promise<void>;
}

const MODULE_COUNT = 8;
const PRESET_COUNT = 16;
const PRESETS_PER_ROW = 8;
const EFFECT_PAD_MIN_DB = -60;
const EFFECT_PAD_MAX_DB = 0;
const BANK_IDS: readonly BankId[] = ['A', 'B'];
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
  if (target.kind === 'output-volume') return `output:${target.bus}`;
  if (target.kind === 'metronome-volume') return 'metronome:volume';
  if (target.kind === 'tap-tempo') return 'metronome:tap';
  if (target.kind === 'bank') return `bank:${target.bank}`;
  if (target.kind === 'preset') return `preset:${target.presetNumber}`;
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
  if (target.kind === 'metronome-volume') return 'Volume do metrônomo';
  if (target.kind === 'tap-tempo') return 'Tap Tempo';
  if (target.kind === 'bank') return `Banco ${target.bank}`;
  if (target.kind === 'preset') {
    return `Preset ${target.presetNumber.toString().padStart(2, '0')} do banco ativo`;
  }
  if (target.kind === 'pad') return `Pads ${PAD_BANK_IDS.indexOf(target.bank) + 1} · ${target.note}`;
  return `FX ${target.bank} · Efeito ${target.effectNumber}`;
}

function isCcMappingKey(value: string): boolean {
  if (/^module:[1-8]$/.test(value)) return true;
  if (/^module-control:[1-8]:(attackMs|releaseMs|holdMs|decayMs|cutoff|compressor:[A-Za-z]+|reverb:[A-Za-z]+|delay:[A-Za-z]+|synth:[A-Za-z]+|arpeggiator:(octaves|gate|swing)|sequencer:(swing|([0-9]|1[0-5]):(semitone|velocity|gate)))$/.test(value)) return true;
  if (/^octave:[1-8]:(up|down)$/.test(value)) return true;
  if (/^output:(music|pads|effects|master)$/.test(value)) return true;
  if (value === 'metronome:volume' || value === 'metronome:tap') return true;
  if (/^bank:[AB]$/.test(value)) return true;
  if (/^pad:[ABCD]:(C|C#|D|D#|E|F|F#|G|G#|A|A#|B)$/.test(value)) return true;
  if (/^effect:[1-4]:([1-9]|1[0-2])$/.test(value)) return true;
  return /^preset:([1-9]|1[0-6])$/.test(value) || /^preset:[AB]:([1-9]|1[0-6])$/.test(value);
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
  const namedModule = moduleNumber >= 6;
  const synthModule = moduleNumber === 8;
  return `
    <article class="player-module${namedModule ? ' player-module--named' : ''}" data-module="${moduleNumber}" aria-label="Módulo ${displayName}">
      <span class="player-module__number${namedModule ? ' player-module__number--named' : ''}" aria-hidden="true">${displayName}</span>
      <button
        class="player-module__settings-button"
        type="button"
        data-action="open-module-settings"
        data-module="${moduleNumber}"
        aria-label="Parâmetros do módulo ${moduleNumber}"
      >Param</button>

      <button
        class="player-module__sound-button${synthModule ? ' player-module__synth-mode is-mono' : ''}"
        type="button"
        data-action="${synthModule ? 'toggle-synth-mode' : 'open-sound-selection'}"
        data-module="${moduleNumber}"
        aria-label="${synthModule ? 'Alternar Synth de Mono para Poly' : `Escolher timbre do módulo ${moduleNumber}. Atual: ${emptySoundName}`}"
      >
        <span class="player-module__sound-label">${synthModule ? 'Mono' : emptySoundName}</span>
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
            >A-1</button>
            <button
              class="player-module__action-button player-module__range-button"
              type="button"
              data-action="learn-note-range"
              data-bound="high"
              data-module="${moduleNumber}"
              aria-pressed="false"
              aria-label="Definir nota final do módulo ${moduleNumber}"
            >C7</button>
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

function createWaveformBarsMarkup(): string {
  return Array.from({ length: 80 }, (_, index) => {
    const primary = Math.abs(Math.sin(index * 0.73));
    const secondary = Math.abs(Math.cos(index * 0.29));
    const height = Math.round(18 + (primary * 52) + (secondary * 24));
    return `<i style="--wave-height:${Math.min(94, height)}%"></i>`;
  }).join('');
}

function createPasswordResetCodeMarkup(email: string): string {
  return `
    <section class="user-password-reset">
      <strong>Confirme seu e-mail</strong>
      <p>Digite o código de 6 dígitos enviado para ${escapeMarkup(email)}.</p>
      <label>
        <span>Código</span>
        <span class="user-password-reset__input-shell">
          <input type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-label="Código de redefinição" data-password-reset-code>
          <span class="user-password-reset__code-caret" aria-hidden="true"><i></i></span>
        </span>
      </label>
      <p class="user-device-message is-error" role="alert" aria-live="polite"></p>
      <button type="button" data-modal-action="verify-password-reset" disabled>Continuar</button>
    </section>
  `;
}

function positionPasswordResetCodeCaret(input: HTMLInputElement): void {
  const length = input.value.length;
  const shell = input.parentElement;
  shell?.style.setProperty('--password-reset-code-length', String(length));
  shell?.style.setProperty('--password-reset-code-caret-gap', length > 0 ? '4px' : '0px');
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

function createSoundDownloadMarkup(sound: FixedSoundDefinition | null, installed: boolean): string {
  if (!sound) {
    return '<section class="sound-download"><p>Este timbre não está mais disponível na biblioteca.</p></section>';
  }
  return `
    <section class="sound-download" style="--sound-button-color:${escapeMarkup(sound.color)}">
      <div class="sound-download__identity">
        <span aria-hidden="true"></span>
        <div><small>${installed ? 'Salvo neste dispositivo' : 'Disponível para download'}</small><strong>${escapeMarkup(sound.name)}</strong></div>
      </div>
      ${installed ? `
        <button class="sound-download__remove" type="button" data-modal-action="uninstall-sound">Desinstalar</button>
      ` : `
        <div class="sound-download__buttons">
          <button class="sound-download__preview" type="button" data-modal-action="preview-sound"${sound.previewObjectKey ? '' : ' disabled'}><b aria-hidden="true">▶</b><span>Ouvir preview</span></button>
          <button class="sound-download__install" type="button" data-modal-action="download-sound"${sound.sf2ObjectKey ? '' : ' disabled'}>Baixar</button>
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
              : sound.byteSize ? formatBytes(sound.byteSize) : ''
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
    selectedPreset,
    presets: Array.from({ length: PRESET_COUNT }, () => ({
      name: 'Preset',
      modules: Array.from({ length: MODULE_COUNT }, (_, moduleIndex) => ({
        category: '',
        enabled: true,
        highNote: 96,
        lowNote: 9,
        modulationInputEnabled: true,
        midiInputId: null,
        octaveShift: 0,
        sustainInputEnabled: true,
        timbreId: null,
        timbreName: moduleEmptySoundName(moduleIndex + 1),
        timbreColor: null,
        volumeDb: 0,
        settings: createDefaultModuleSettings(),
      })),
    })),
  };
}

function createBankNavigationMarkup(): string {
  return BANK_IDS.map((bank) => `
    <button
      class="player-navigation__button player-navigation__bank-button${bank === 'A' ? ' is-selected' : ''}"
      type="button"
      data-action="show-bank"
      data-bank="${bank}"
      aria-pressed="${bank === 'A'}"
    >Banco ${bank}</button>
  `).join('');
}

export class PlayerScreen {
  private readonly instanceId = ++playerScreenSequence;
  private readonly desktopRuntime = isDesktopRuntime();
  private readonly handleRootClick = (event: Event) => this.onRootClick(event);
  private readonly handleRootPointerDown = (event: PointerEvent) => this.onRootPointerDown(event);
  private readonly handleRootPointerMove = (event: PointerEvent) => this.onRootPointerMove(event);
  private readonly handleRootPointerEnd = (event: PointerEvent) => this.onRootPointerEnd(event);
  private readonly handleRootContextMenu = (event: Event) => this.onRootContextMenu(event);
  private readonly handleRootInput = (event: Event) => this.onRootInput(event);
  private readonly handlePageHide = () => this.flushPlayerStateSave(true);
  private readonly handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') this.flushPlayerStateSave(true);
  };
  private readonly handleModalKeydown = (event: KeyboardEvent) => this.onModalKeydown(event);
  private modal: HTMLElement | null = null;
  private modalTrigger: HTMLElement | null = null;
  private tracksPanelController: TracksPanelController | null = null;
  private tabletInputKeyboardController: TabletInputKeyboardController | null = null;
  private splitTracksController: TracksPanelController | null = null;
  private outputFaderController: OutputFaderPanelController | null = null;
  private trackTransport: TrackTransportController | null = null;
  private tracksAutoEnabled = false;
  private visibleTrackSequence: LocalTrack[] = [];
  private renderedQueuedTrackName = '';
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
  private selectedCatalogSoundId: string | null = null;
  private selectedPerformanceAsset: PerformanceAssetDefinition | null = null;
  private pendingBackupDownloads: FixedSoundDefinition[] = [];
  private backupDownloadLimit = 0;
  private soundDownloadAbort: AbortController | null = null;
  private readonly fixedSoundHoldGesture = new LongPressGesture(700, 10);
  private readonly userSoundfontHoldGesture = new LongPressGesture(700, 10);
  private suppressNextFixedSoundClick = false;
  private suppressNextUserSoundfontClick = false;
  private missingUserSoundfonts: MissingUserSoundfont[] = [];
  private readonly trackLibrary: TrackLibraryStore;
  private readonly effectAudioLibrary: EffectAudioStore;
  private readonly metronome = new MetronomeEngine(() => this.renderMetronomeState());
  private readonly patternPlayback = new PatternPlaybackController(
    () => this.createPatternPlaybackSnapshot(),
    (slot, status, note, velocity) => { void hookKeysNative.sendMidi(slot, status, note, velocity); },
    (kind, step) => this.renderPatternPulse(kind, step),
  );
  private readonly midiInput = new MidiInputService((input) => {
    this.handleMidiNote(input);
  }, (input) => {
    this.handleMidiControlChange(input);
  }, () => {
    if (this.currentModalKind === 'app-settings-midi' && this.modal) {
      this.refreshMidiDeviceOptions(this.modal);
    } else if (this.currentModalKind === 'module-settings' && this.modal) {
      this.refreshModuleMidiOptions(this.modal, this.currentModalModuleNumber);
    }
  });
  private mounted = false;
  private logoutBusy = false;
  private pendingNoteLearn: PendingNoteLearn | null = null;
  private presetHoldGesture: PresetHoldGesture | null = null;
  private tracksHoldGesture: TracksHoldGesture | null = null;
  private capturedTracksPointer: { button: HTMLButtonElement; pointerId: number } | null = null;
  private outputFaderDrag: OutputFaderDrag | null = null;
  private metronomeFaderDrag: MetronomeFaderDrag | null = null;
  private eqBandDrag: EqBandDrag | null = null;
  private knobDrag: KnobDrag | null = null;
  private lastDelayTapAt: number | null = null;
  private performanceKeyboard: PerformanceKeyboardController | null = null;
  private computerKeyboard: ComputerKeyboardController | null = null;
  private keyboardMidiRouter: KeyboardMidiRouter | null = null;
  private readonly keyboardSettingsHoldGesture = new LongPressGesture();
  private suppressNextKeyboardViewClick = false;
  private readonly outputFaderLearnGesture = new LongPressGesture(2_000);
  private readonly metronomeFaderLearnGesture = new LongPressGesture(2_000);
  private readonly ccControlHoldGesture = new LongPressGesture();
  private readonly knobCcLearnGesture = new LongPressGesture(2_000, 8);
  private readonly faderDoubleTap = new DoubleTapTracker();
  private readonly bankKeyboardDoubleTap = new DoubleTapTracker();
  private readonly metronomeHoldGesture = new LongPressGesture();
  private readonly tempoHoldGesture = new LongPressGesture();
  private readonly keyboardAccentGesture = new LongPressGesture(520, 8);
  private pendingCcLearn: CcLearnTarget | null = null;
  private readonly ccMappings = new Map<string, number>();
  private readonly lastCcValues = new Map<number, number>();
  private effectEditHoldGesture: EffectEditHoldGesture | null = null;
  private effectEditMode = false;
  private pressedKeyboardKey: { button: HTMLButtonElement; pointerId: number } | null = null;
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
  private playerStateSaveTimer: number | null = null;
  private playerStateDirty = false;
  private nativeSoundfontSync: Promise<void> = Promise.resolve();
  private nativeAudioOutputSync: Promise<void> = Promise.resolve();
  private readonly nativeLoadedTimbres: (string | null)[] = Array.from({ length: MODULE_COUNT }, () => null);
  private selectedMidiInputIds: (string | null)[] = [null, null, null];
  private readonly audioOutput = new AudioOutputService();
  private audioDevices: AudioOutputDevice[] = [];
  private selectedAudioDeviceId = '';
  private audioRouting: AudioBusRouting = { ...DEFAULT_AUDIO_ROUTING };
  private bufferSize: BufferSize = DEFAULT_BUFFER_SIZE;
  private compatibilityMode = false;
  private bottomView: PlayerBottomView = 'presets';
  private keyboardMidiSlot = 1;
  private keyboardStyle: PerformanceKeyboardStyle = 'standard';
  private passwordResetChallenge: RequestCodeResponse | null = null;
  private passwordResetToken: string | null = null;
  private pendingCompatibilityMode: boolean | null = null;
  private compatibilityVideoUrl = '';
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
      <main class="app-screen player-screen player-screen--tablet is-bank-view" data-player-screen="${this.instanceId}">
        <div class="player-primary">
          <div class="player-top-transport">
            <div class="player-top-brand-actions">
              <button
                class="player-brand"
                type="button"
                data-action="open-about"
                aria-label="Sobre o Hook Keys"
              >
                <img class="player-brand__image" src="/assets/icons/icon-256.webp" alt="">
                <span class="player-brand__name"><strong>Hook</strong> Keys</span>
              </button>
              <button
                class="player-navigation__button player-navigation__tracks-button"
                type="button"
                data-action="open-tracks"
              >Playlist</button>
            </div>
            ${createTrackTransportMarkup()}
            <div class="player-next-field" aria-label="Próxima música">
              <span>Próxima</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12h13M13 6l6 6-6 6"></path>
              </svg>
              <strong class="player-next-field__track" data-next-track-name hidden><span></span></strong>
            </div>
            <div class="player-top-actions">
              <button
                class="player-navigation__button player-navigation__settings-button"
                type="button"
                data-action="open-app-settings"
                aria-label="Configurações"
              >Settings</button>
              <button class="player-account__user-button" type="button" data-action="open-user">User</button>
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
              ${createOutputKnobMarkup('master', 'Master', this.outputLevels.master)}
            </section>
          </nav>

          <div class="player-account">
            <span class="player-navigation__divider player-account__divider" aria-hidden="true">|</span>
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

          <div class="player-bank-view" data-player-view="bank">
            <section class="player-workspace" aria-label="Módulos de timbre do Banco A">
              <div class="player-modules-row">${modules}</div>
            </section>

            <section class="player-presets" data-player-bottom-panel aria-label="Presets">
              <nav class="player-presets__header" aria-label="Escolher banco de presets">
                ${createBankNavigationMarkup()}
              </nav>
              <div class="player-presets__grid">${createPresetRowsMarkup(1)}</div>
              ${this.desktopRuntime ? '' : createPerformanceKeyboardMarkup(this.keyboardStyle)}
            </section>
          </div>

          ${createPadsEffectsMarkup()}

        </div>

        <p class="player-screen__status" role="status" aria-live="polite"></p>
      </main>
      <div class="knob-focus" data-knob-focus aria-hidden="true">
        <div class="knob-focus__card">
          <strong data-knob-focus-label></strong>
          <span class="knob-focus__face"><i></i></span>
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
        () => {
          this.saveActivePresetState();
          this.markPlayerStateChanged();
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
      (slot, status, note, velocity) => { void hookKeysNative.sendMidi(slot, status, note, velocity); },
    );
    const keyboardRoot = this.root.querySelector<HTMLElement>('[data-performance-keyboard]');
    if (keyboardRoot) {
      this.performanceKeyboard = new PerformanceKeyboardController(
        keyboardRoot,
        () => this.selectBottomView('presets'),
        (noteNumber, pressed, velocity) => {
          const inputId = this.keyboardMidiRouter?.note(noteNumber, pressed, velocity) ?? null;
          this.patternPlayback.handleInput({ inputId, noteNumber, pressed, velocity });
          return inputId;
        },
      );
      this.performanceKeyboard.mount();
    }
    if (this.desktopRuntime) {
      this.bottomView = 'presets';
      this.computerKeyboard = new ComputerKeyboardController((noteNumber, pressed, velocity) => {
        const inputId = this.keyboardMidiRouter?.note(noteNumber, pressed, velocity) ?? null;
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
    );
    this.trackTransport.mount();
    this.applyMusicOutput();
    this.root.addEventListener('click', this.handleRootClick);
    this.root.addEventListener('pointerdown', this.handleRootPointerDown);
    this.root.addEventListener('pointermove', this.handleRootPointerMove);
    this.root.addEventListener('pointerup', this.handleRootPointerEnd);
    this.root.addEventListener('pointercancel', this.handleRootPointerEnd);
    this.root.addEventListener('contextmenu', this.handleRootContextMenu);
    this.root.addEventListener('input', this.handleRootInput);
    window.addEventListener('pagehide', this.handlePageHide);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.midiInput.mount();
    void hookKeysNative.initialize(this.bufferSize).then(async (ready) => {
      if (!ready || !this.mounted) return;
      await this.applyNativeAudioOutput();
      this.applySelectedMidiInputs();
      this.syncNativeEngine();
    });
    void this.loadCompatibilityVideoUrl();
    void this.refreshSoundCatalog();
    this.renderMetronomeState();
    this.renderBottomView();
    void this.restoreSavedPlayerState().finally(() => {
      this.playerBackup.start(() => this.createSavedPlayerState());
    });
  }

  setModuleMeterLevel(moduleNumber: number, db: number): void {
    this.faders.get(moduleNumber)?.setMeterLevel(db);
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
    this.closeModal(false);
    this.closeTracksSplitView();
    this.performanceKeyboard?.destroy();
    this.performanceKeyboard = null;
    this.computerKeyboard?.destroy();
    this.computerKeyboard = null;
    this.keyboardMidiRouter = null;
    this.patternPlayback.destroy();
    this.keyboardSettingsHoldGesture.cancel();
    this.clearPresetHoldGesture();
    this.clearTracksHoldGesture();
    this.releaseCapturedTracksPointer();
    this.clearEffectEditHoldGesture();
    this.outputFaderLearnGesture.cancel();
    this.metronomeFaderLearnGesture.cancel();
    this.ccControlHoldGesture.cancel();
    this.knobCcLearnGesture.cancel();
    this.metronomeHoldGesture.cancel();
    this.tempoHoldGesture.cancel();
    this.keyboardAccentGesture.cancel();
    this.fixedSoundHoldGesture.cancel();
    this.userSoundfontHoldGesture.cancel();
    this.soundDownloadAbort?.abort();
    this.soundDownloadAbort = null;
    this.soundLibraryEngine.destroy();
    this.outputFaderDrag = null;
    this.metronomeFaderDrag = null;
    this.faderDoubleTap.reset();
    this.releasePressedKeyboardKey();
    this.cancelNoteLearn();
    this.midiInput.destroy();
    if (this.nativeSyncTimer !== null) window.clearTimeout(this.nativeSyncTimer);
    this.nativeSyncTimer = null;
    window.removeEventListener('pagehide', this.handlePageHide);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.flushPlayerStateSave(true);
    void hookKeysNative.stopAllNotes();
    this.metronome.destroy();
    this.playerState.destroy();
    this.playerBackup.destroy();
    this.trackTransport?.destroy();
    this.trackTransport = null;
    for (const fader of this.faders.values()) fader.destroy();
    this.faders.clear();
    this.root.removeEventListener('click', this.handleRootClick);
    this.root.removeEventListener('pointerdown', this.handleRootPointerDown);
    this.root.removeEventListener('pointermove', this.handleRootPointerMove);
    this.root.removeEventListener('pointerup', this.handleRootPointerEnd);
    this.root.removeEventListener('pointercancel', this.handleRootPointerEnd);
    this.root.removeEventListener('contextmenu', this.handleRootContextMenu);
    this.root.removeEventListener('input', this.handleRootInput);
    this.root.replaceChildren();
    this.mounted = false;
  }

  private createSoundLibraryEngine(catalog: SoundCatalog): SoundLibraryEngine {
    return new SoundLibraryEngine(
      catalog,
      this.soundLibrary,
      new HttpSoundAssetGateway(async (url) => url),
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
      this.metronome.toggle();
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

    if (action === 'show-bank') {
      const bank = actionButton.dataset.bank;
      if (this.isBankId(bank)) {
        this.showBank(bank);
      }
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
      if (this.isEffectBankId(bank)) this.selectEffectBank(bank);
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

    if (action === 'toggle-synth-mode') {
      this.toggleSynthMode(actionButton);
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
      this.openModal('about', null, actionButton);
      return;
    }

    if (action === 'open-app-settings') {
      this.openModal('app-settings', null, actionButton);
      return;
    }

    if (action === 'open-user') {
      this.openModal('user', null, actionButton);
      return;
    }

    if (action === 'open-tracks') {
      if (this.suppressNextTracksClick) {
        this.suppressNextTracksClick = false;
        return;
      }
      if (this.splitTracksController) {
        this.closeTracksSplitView();
        return;
      }
      this.openModal('tracks', null, actionButton);
      return;
    }

    if (action === 'open-module-settings' || action === 'open-sound-selection') {
      const moduleNumber = Number.parseInt(actionButton.dataset.module ?? '', 10);
      if (!Number.isInteger(moduleNumber)) return;

      const kind: ModalKind =
        action === 'open-module-settings' ? 'module-settings' : 'sound-selection';
      this.openModal(kind, moduleNumber, actionButton);
      if (kind === 'sound-selection') void this.refreshSoundCatalog();
      return;
    }

    if (action === 'logout') void this.logout(actionButton);
  }

  private onRootInput(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
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
      const value = Math.min(0, this.outputLevels[outputBus]);
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
  }

  private renderMetronomeState(): void {
    const tempoButton = this.root.querySelector<HTMLButtonElement>('[data-action="tap-tempo"]');
    const bpm = this.metronome.getBpm();
    const bpmLabel = tempoButton?.querySelector<HTMLElement>('[data-metronome-bpm]');
    if (bpmLabel) bpmLabel.textContent = String(bpm);
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
    const levelDb = linearVolume <= 0 ? -60 : Math.max(-60, Math.min(0, 20 * Math.log10(linearVolume)));
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
  }

  private commitTempo(modal: HTMLElement): void {
    const input = modal.querySelector<HTMLInputElement>('[data-tempo-input]');
    if (!input) return;
    const value = Number(input.value);
    if (!Number.isFinite(value)) return;
    this.metronome.setBpm(value);
    this.markPlayerStateChanged();
  }

  private commitModulePolyphony(modal: HTMLElement, moduleNumber: number): void {
    const input = modal.querySelector<HTMLInputElement>('[data-module-polyphony-input]');
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!input || !moduleState) return;
    const parsed = Math.round(Number(input.value));
    const polyphony = Number.isFinite(parsed) ? Math.min(128, Math.max(1, parsed)) : 64;
    input.value = String(polyphony);
    moduleState.settings.polyphony = polyphony;
    this.markPlayerStateChanged();
  }

  private selectModuleVelocityMode(modal: HTMLElement, moduleNumber: number, mode: VelocityCurveMode): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    const editor = modal.querySelector<HTMLElement>('.velocity-curve-editor');
    if (!editor) return;
    const current = readVelocityCurveSettings(moduleState?.settings.velocityCurve);
    const next = velocityCurvePreset(mode, current);
    updateVelocityCurveMarkup(editor, next);
    if (!moduleState) return;
    moduleState.settings.velocityCurve = next;
    this.markPlayerStateChanged();
  }

  private setModuleVelocityPoint(
    modal: HTMLElement,
    moduleNumber: number,
    pointIndex: number,
    clientY: number,
    persist: boolean,
  ): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    const editor = modal.querySelector<HTMLElement>('.velocity-curve-editor');
    const plot = modal.querySelector<HTMLElement>('[data-velocity-curve-plot]');
    if (!moduleState || !editor || !plot || pointIndex < 0 || pointIndex > 4) return;
    const current = readVelocityCurveSettings(moduleState.settings.velocityCurve);
    if (current.mode !== 'user') return;
    current.points[pointIndex] = velocityFromClientY(plot, clientY);
    current.userPoints = [...current.points];
    moduleState.settings.velocityCurve = current;
    updateVelocityCurveMarkup(editor, current);
    this.scheduleNativeEngineSync();
    if (persist) this.markPlayerStateChanged();
  }

  private setFixedModuleVelocity(modal: HTMLElement, moduleNumber: number, value: number): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    const editor = modal.querySelector<HTMLElement>('.velocity-curve-editor');
    if (!moduleState || !editor) return;
    const current = readVelocityCurveSettings(moduleState.settings.velocityCurve);
    if (current.mode !== 'fixed' || editor.dataset.velocityMode !== 'fixed') return;
    const fixed = Math.round(Math.min(127, Math.max(0, value)));
    const next = {
      ...current,
      mode: 'fixed' as const,
      points: [fixed, fixed, fixed, fixed, fixed] as [number, number, number, number, number],
      fixedValue: fixed,
    };
    moduleState.settings.velocityCurve = next;
    updateVelocityCurveMarkup(editor, next);
    this.scheduleNativeEngineSync();
  }

  private onRootPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const eventTarget = event.target;
    if (!(eventTarget instanceof Element)) return;

    const outputKnob = eventTarget.closest<HTMLInputElement>('.player-output-knob input[type="range"]');
    if (outputKnob && this.root.contains(outputKnob)) {
      this.startKnobDrag(event, null);
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

    const bankButton = eventTarget.closest<HTMLButtonElement>('[data-action="show-bank"]');
    const bank = bankButton?.dataset.bank;
    if (bankButton && this.root.contains(bankButton) && this.isBankId(bank)) {
      this.startCcControlLearn(event, bankButton, { kind: 'bank', bank });
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
      this.metronome.tap(event.timeStamp);
      this.markPlayerStateChanged();
      if (!this.desktopRuntime) {
        this.tempoHoldGesture.start(event, () => {
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

    const tracksButton = eventTarget.closest<HTMLButtonElement>('[data-action="open-tracks"]');
    if (tracksButton && this.root.contains(tracksButton)) {
      if (!this.splitTracksController) this.startTracksHoldGesture(tracksButton, event);
      return;
    }

    const effectBankButton = eventTarget.closest<HTMLButtonElement>('[data-action="select-effect-bank"]');
    if (effectBankButton && this.root.contains(effectBankButton)) {
      this.startEffectEditHoldGesture(effectBankButton, event);
      return;
    }

    const presetButton = eventTarget.closest<HTMLButtonElement>('.player-preset-button');
    if (presetButton && this.root.contains(presetButton)) {
      this.startPresetHoldGesture(presetButton, event);
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
    const gesture = this.presetHoldGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 10) {
      this.clearPresetHoldGesture();
    }
  }

  private onRootPointerEnd(event: PointerEvent): void {
    this.keyboardAccentGesture.end(event);
    if (this.pressedKeyboardKey?.pointerId === event.pointerId) this.releasePressedKeyboardKey();
    this.metronomeHoldGesture.end(event);
    this.tempoHoldGesture.end(event);
    this.ccControlHoldGesture.end(event);
    if (this.knobDrag?.pointerId === event.pointerId) {
      this.knobCcLearnGesture.end(event);
      this.endKnobDrag(event);
      return;
    }
    const bankButton = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>('[data-action="show-bank"]')
      : null;
    const bank = bankButton?.dataset.bank;
    if (
      bankButton
      && this.isBankId(bank)
      && this.bankKeyboardDoubleTap.register(`keyboard-bank:${bank}`, event.timeStamp)
    ) {
      this.showBank(bank);
      this.selectBottomView('keyboard');
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
    if (outputBus === 'music') this.applyMusicOutput();
  }

  private updateMetronomeFaderFromPointer(drag: MetronomeFaderDrag, clientX: number): void {
    const bounds = drag.fader.getBoundingClientRect();
    if (bounds.width <= 0) return;
    const volume = Math.min(100, Math.max(0, ((clientX - bounds.left) / bounds.width) * 100));
    this.metronome.setVolume(volume / 100);
    drag.input.value = String(volume);
    drag.input.setAttribute('aria-valuetext', `${Math.round(volume)}%`);
    drag.fader.style.setProperty('--output-position', `${volume}%`);
    const output = drag.fader.parentElement?.querySelector<HTMLOutputElement>('[data-metronome-output-value]');
    if (output) output.value = `${Math.round(volume)}%`;
  }

  private onRootContextMenu(event: Event): void {
    const target = event.target;
    if (!this.desktopRuntime || !(target instanceof Element)) return;
    event.preventDefault();

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

    const knobInput = target instanceof Element
      ? target.closest<HTMLInputElement>('.module-envelope-knob input[type="range"], .module-effect-knob input[type="range"], .player-output-knob input[type="range"]')
      : null;
    if (knobInput) {
      const learnTarget = this.currentModalModuleNumber === null
        ? this.ccLearnTargetForOutputKnob(knobInput)
        : this.ccLearnTargetForKnob(knobInput, this.currentModalModuleNumber);
      if (learnTarget) this.openCcLearn(learnTarget, knobInput);
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

    const bankButton = target.closest<HTMLButtonElement>('[data-action="show-bank"]');
    const bank = bankButton?.dataset.bank;
    if (bankButton && this.isBankId(bank)) {
      this.openCcLearn({ kind: 'bank', bank }, bankButton);
      return;
    }

    const tempoButton = target.closest<HTMLButtonElement>('[data-action="tap-tempo"], [data-modal-action="learn-tempo-cc"]');
    if (tempoButton) {
      this.openCcLearn({ kind: 'tap-tempo' }, tempoButton);
      return;
    }

    const metronomeButton = target.closest<HTMLButtonElement>('[data-action="toggle-metronome"]');
    if (metronomeButton) {
      this.openModal('metronome', null, metronomeButton);
      return;
    }

    const tracksButton = target.closest<HTMLButtonElement>('[data-action="open-tracks"]');
    if (tracksButton) {
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
    screen.insertAdjacentHTML('beforeend', createTracksSplitPanelMarkup());
    screen.insertAdjacentHTML('beforeend', `
      <div class="tracks-horizontal-scroll-guide" aria-label="Área para rolagem horizontal">
        <span aria-hidden="true">←</span>
        <small>Deslize aqui</small>
        <span aria-hidden="true">→</span>
      </div>
    `);
    const panel = screen.querySelector<HTMLElement>('.tracks-split-panel');
    if (!panel) return;
    screen.classList.add('is-tracks-split');
    this.mountTracksHorizontalScrollGuide(screen);
    this.splitTracksController = new TracksPanelController(
      panel,
      this.trackLibrary,
      {
        autoEnabled: this.tracksAutoEnabled,
        getPlaybackSnapshot: () => this.trackTransport?.getSnapshot() ?? this.trackPlaybackSnapshot,
        onAutoEnabledChanged: (enabled) => this.setTracksAutoEnabled(enabled),
        onTrackSelected: (track) => this.selectTrack(track),
        onVisibleTracksChanged: (tracks) => this.updateVisibleTrackSequence(tracks),
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
    screen?.querySelector('.tracks-horizontal-scroll-guide')?.remove();
  }

  private mountTracksHorizontalScrollGuide(screen: HTMLElement): void {
    const guide = screen.querySelector<HTMLElement>('.tracks-horizontal-scroll-guide');
    const primary = screen.querySelector<HTMLElement>('.player-primary');
    if (!guide || !primary) return;

    let activePointerId: number | null = null;
    let startX = 0;
    let startScrollLeft = 0;
    guide.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      activePointerId = event.pointerId;
      startX = event.clientX;
      startScrollLeft = primary.scrollLeft;
      guide.setPointerCapture(event.pointerId);
      guide.classList.add('is-dragging');
      event.preventDefault();
    });
    guide.addEventListener('pointermove', (event) => {
      if (activePointerId !== event.pointerId) return;
      primary.scrollLeft = startScrollLeft - (event.clientX - startX);
      event.preventDefault();
    });
    const finish = (event: PointerEvent) => {
      if (activePointerId !== event.pointerId) return;
      if (guide.hasPointerCapture(event.pointerId)) guide.releasePointerCapture(event.pointerId);
      activePointerId = null;
      guide.classList.remove('is-dragging');
    };
    guide.addEventListener('pointerup', finish);
    guide.addEventListener('pointercancel', finish);
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
    const keyboardVisible = this.bottomView === 'keyboard';
    panel.classList.toggle('is-keyboard', keyboardVisible);
    panel.setAttribute('aria-label', keyboardVisible ? 'Keyboard' : 'Presets');
    const header = panel.querySelector<HTMLElement>('.player-presets__header');
    const presets = panel.querySelector<HTMLElement>('.player-presets__grid');
    const keyboard = panel.querySelector<HTMLElement>('[data-performance-keyboard]');
    if (header) header.hidden = keyboardVisible;
    if (presets) presets.hidden = keyboardVisible;
    if (keyboard) keyboard.hidden = !keyboardVisible;
  }

  private selectKeyboardMidiSlot(modal: HTMLElement, slot: 1 | 2 | 3): void {
    this.keyboardMidiSlot = slot;
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
      button.classList.toggle(
        'is-editing',
        this.effectEditMode && button.dataset.effectBank === this.activeEffectBank,
      );
      button.setAttribute('aria-pressed', String(isSelected));
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
    this.cancelNoteLearn();
    this.patternPlayback.reset();
    if (this.activeView === 'bank') this.saveActivePresetState();
    this.activeBank = bank;
    this.activeView = 'bank';
    this.restoreActivePresetState();
    this.updateVisibleView();
    this.markPlayerStateChanged();
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
      button.classList.toggle('is-selected', isSelected);
      button.setAttribute('aria-pressed', String(isSelected));
    }
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
    if (!preset) return;
    for (const [moduleNumber, fader] of this.faders) {
      const moduleState = preset.modules[moduleNumber - 1];
      if (moduleState) moduleState.volumeDb = fader.getValueDb();
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
        fader.setValueDb(moduleState?.volumeDb ?? 0);

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
          this.renderSynthModeButton(soundButton, moduleState);
        } else {
          const displayedTimbreName = moduleState.timbreId
            ? moduleState.timbreName
            : moduleEmptySoundName(moduleNumber);
          soundLabel.textContent = displayedTimbreName;
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
    if (moduleNumber === 6 || moduleNumber === 7) this.patternPlayback.settingsChanged();
    this.markPlayerStateChanged();
  }

  private toggleSynthMode(button: HTMLButtonElement): void {
    const moduleState = this.ensureActivePresetState()?.modules[7];
    if (!moduleState) return;
    const settings = readSynthSettings(moduleState.settings.synth);
    settings.voiceMode = settings.voiceMode === 'mono' ? 'poly' : 'mono';
    moduleState.settings.synth = settings;
    this.renderSynthModeButton(button, moduleState);
    this.markPlayerStateChanged();
  }

  private toggleModuleVoiceMode(button: HTMLButtonElement, moduleNumber: number): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState || moduleNumber < 1 || moduleNumber > 5) return;
    const mono = moduleState.settings.voiceMode !== 'mono';
    moduleState.settings.voiceMode = mono ? 'mono' : 'poly';
    button.classList.toggle('is-mono', mono);
    button.classList.toggle('is-poly', !mono);
    button.setAttribute('aria-pressed', String(mono));
    const label = button.querySelector<HTMLElement>('strong');
    if (label) label.textContent = mono ? 'Mono' : 'Poly';
    this.markPlayerStateChanged();
  }

  private createPatternPlaybackSnapshot(): PatternPlaybackSnapshot {
    const modules = this.getActivePresetState()?.modules;
    const arpeggiator = modules?.[5];
    const sequencer = modules?.[6];
    return {
      bpm: this.metronome.getBpm(),
      arpeggiator: {
        moduleEnabled: arpeggiator?.enabled === true,
        hasSound: Boolean(arpeggiator?.timbreId),
        midiInputId: arpeggiator?.midiInputId ?? null,
        lowNote: arpeggiator?.lowNote ?? 0,
        highNote: arpeggiator?.highNote ?? 127,
        settings: arpeggiator?.settings.arpeggiator,
      },
      sequencer: {
        moduleEnabled: sequencer?.enabled === true,
        hasSound: Boolean(sequencer?.timbreId),
        midiInputId: sequencer?.midiInputId ?? null,
        lowNote: sequencer?.lowNote ?? 0,
        highNote: sequencer?.highNote ?? 127,
        settings: sequencer?.settings.sequencer,
      },
    };
  }

  private renderPatternPulse(kind: 'arpeggiator' | 'sequencer', step: number | null): void {
    const modal = this.modal;
    if (!modal || this.currentModalKind !== `module-${kind}`) return;
    for (const element of modal.querySelectorAll<HTMLElement>('[data-sequencer-step], .arpeggiator-live-strip i')) {
      element.classList.remove('is-playing');
    }
    if (step === null) return;
    if (kind === 'sequencer') {
      modal.querySelector<HTMLElement>(`[data-sequencer-step="${step}"]`)?.classList.add('is-playing');
    } else {
      const lights = modal.querySelectorAll<HTMLElement>('.arpeggiator-live-strip i');
      lights[step % Math.max(1, lights.length)]?.classList.add('is-playing');
    }
  }

  private renderSynthModeButton(button: HTMLButtonElement, moduleState: ModulePresetState): void {
    const mode = readSynthSettings(moduleState.settings.synth).voiceMode;
    const mono = mode === 'mono';
    button.classList.toggle('is-mono', mono);
    button.classList.toggle('is-poly', !mono);
    button.setAttribute('aria-pressed', String(!mono));
    button.setAttribute('aria-label', `Synth em ${mono ? 'Mono' : 'Poly'}. Alternar para ${mono ? 'Poly' : 'Mono'}`);
    const label = button.querySelector<HTMLElement>('.player-module__sound-label');
    if (label) label.textContent = mono ? 'Mono' : 'Poly';
  }

  private updateSynthParameter(input: HTMLInputElement): void {
    const parameter = input.dataset.synthParameter as keyof SynthModuleSettings | undefined;
    const moduleState = this.getActivePresetState()?.modules[7];
    if (!parameter || !moduleState) return;
    const settings = readSynthSettings(moduleState.settings.synth);
    const value = updateSynthRangeOutput(input);
    if (parameter === 'oscillatorMix' || parameter === 'detuneCents'
        || parameter === 'attackMs' || parameter === 'holdMs' || parameter === 'decayMs'
        || parameter === 'sustain' || parameter === 'releaseMs' || parameter === 'filterCutoffHz'
        || parameter === 'filterResonance' || parameter === 'filterEnvelope'
        || parameter === 'lfoRateHz' || parameter === 'lfoDepth' || parameter === 'glideMs') {
      settings[parameter] = value;
      moduleState.settings.synth = settings;
      this.markPlayerStateChanged();
    }
  }

  private selectSynthOscillator(
    modal: HTMLElement,
    parameter: 'oscillator1' | 'oscillator2',
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

  private toggleSynthLegato(button: HTMLButtonElement): void {
    const moduleState = this.getActivePresetState()?.modules[7];
    if (!moduleState) return;
    const settings = readSynthSettings(moduleState.settings.synth);
    settings.legato = !settings.legato;
    moduleState.settings.synth = settings;
    button.classList.toggle('is-selected', settings.legato);
    button.setAttribute('aria-pressed', String(settings.legato));
    this.markPlayerStateChanged();
  }

  private selectArpeggiatorMode(modal: HTMLElement, mode: ArpeggiatorMode): void {
    const moduleState = this.getActivePresetState()?.modules[5];
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

  private selectArpeggiatorDivision(modal: HTMLElement, division: PatternDivision): void {
    const moduleState = this.getActivePresetState()?.modules[5];
    if (!moduleState) return;
    const settings = readArpeggiatorSettings(moduleState.settings.arpeggiator);
    settings.division = division;
    moduleState.settings.arpeggiator = settings;
    this.selectPatternButton(modal, '[data-arpeggiator-division]', 'arpeggiatorDivision', division);
    this.renderArpeggiatorSummary(modal, settings);
    this.commitPatternChange();
  }

  private updateArpeggiatorParameter(input: HTMLInputElement): void {
    const moduleState = this.getActivePresetState()?.modules[5];
    const parameter = input.dataset.patternParameter;
    if (!moduleState || (parameter !== 'octaves' && parameter !== 'gate' && parameter !== 'swing')) return;
    const settings = readArpeggiatorSettings(moduleState.settings.arpeggiator);
    const value = updatePatternRangeOutput(input);
    if (parameter === 'octaves') settings.octaves = Math.round(value);
    else settings[parameter] = value;
    moduleState.settings.arpeggiator = settings;
    const modal = input.closest<HTMLElement>('.player-modal');
    if (modal) this.renderArpeggiatorSummary(modal, settings);
    this.commitPatternChange();
  }

  private selectSequencerDivision(modal: HTMLElement, division: PatternDivision): void {
    const moduleState = this.getActivePresetState()?.modules[6];
    if (!moduleState) return;
    const settings = readSequencerSettings(moduleState.settings.sequencer);
    settings.division = division;
    moduleState.settings.sequencer = settings;
    this.selectPatternButton(modal, '[data-sequencer-division]', 'sequencerDivision', division);
    this.renderSequencerSummary(modal, settings);
    this.commitPatternChange();
  }

  private selectSequencerLength(modal: HTMLElement, length: number): void {
    if (length !== 4 && length !== 8 && length !== 16) return;
    const moduleState = this.getActivePresetState()?.modules[6];
    if (!moduleState) return;
    const settings = readSequencerSettings(moduleState.settings.sequencer);
    settings.length = length;
    moduleState.settings.sequencer = settings;
    this.selectPatternButton(modal, '[data-sequencer-length]', 'sequencerLength', String(length));
    for (const button of modal.querySelectorAll<HTMLButtonElement>('[data-sequencer-step]')) {
      const index = Number(button.dataset.sequencerStep);
      const outside = index >= length;
      button.disabled = outside;
      button.classList.toggle('is-outside', outside);
    }
    const editor = modal.querySelector<HTMLElement>('[data-sequencer-editor]');
    const selected = Math.min(length - 1, Math.max(0, Number(editor?.dataset.sequencerSelectedStep) || 0));
    this.selectSequencerStep(modal, selected);
    this.renderSequencerSummary(modal, settings);
    this.commitPatternChange();
  }

  private selectSequencerStep(modal: HTMLElement, stepIndex: number): void {
    const moduleState = this.getActivePresetState()?.modules[6];
    if (!moduleState || !Number.isInteger(stepIndex)) return;
    const settings = readSequencerSettings(moduleState.settings.sequencer);
    if (stepIndex < 0 || stepIndex >= settings.length) return;
    const editor = modal.querySelector<HTMLElement>('[data-sequencer-editor]');
    if (editor) editor.dataset.sequencerSelectedStep = String(stepIndex);
    for (const button of modal.querySelectorAll<HTMLButtonElement>('[data-sequencer-step]')) {
      const selected = Number(button.dataset.sequencerStep) === stepIndex;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-selected', String(selected));
    }
    const current = modal.querySelector<HTMLElement>('[data-sequencer-step-editor]');
    if (current) current.outerHTML = createSequencerStepEditor(settings, stepIndex);
  }

  private toggleSequencerStep(modal: HTMLElement, button: HTMLButtonElement): void {
    const moduleState = this.getActivePresetState()?.modules[6];
    const editor = modal.querySelector<HTMLElement>('[data-sequencer-editor]');
    const index = Number(editor?.dataset.sequencerSelectedStep);
    if (!moduleState || !Number.isInteger(index) || index < 0 || index > 15) return;
    const settings = readSequencerSettings(moduleState.settings.sequencer);
    const step = settings.steps[index];
    if (!step) return;
    step.enabled = !step.enabled;
    moduleState.settings.sequencer = settings;
    button.classList.toggle('is-on', step.enabled);
    button.classList.toggle('is-off', !step.enabled);
    button.setAttribute('aria-pressed', String(step.enabled));
    const stateLabel = button.querySelector<HTMLElement>('strong');
    if (stateLabel) stateLabel.textContent = step.enabled ? 'ON' : 'OFF';
    modal.querySelector<HTMLElement>(`[data-sequencer-step="${index}"]`)
      ?.classList.toggle('is-enabled', step.enabled);
    modal.querySelector<HTMLElement>(`[data-sequencer-step="${index}"]`)
      ?.classList.toggle('is-disabled', !step.enabled);
    this.commitPatternChange();
  }

  private updateSequencerParameter(input: HTMLInputElement): void {
    const moduleState = this.getActivePresetState()?.modules[6];
    const parameter = input.dataset.patternParameter;
    if (!moduleState || !parameter) return;
    const settings = readSequencerSettings(moduleState.settings.sequencer);
    const value = updatePatternRangeOutput(input);
    if (parameter === 'swing') {
      settings.swing = value;
    } else {
      const index = Number(input.dataset.sequencerStepIndex);
      const step = settings.steps[index];
      if (!step) return;
      if (parameter === 'semitone') step.semitone = Math.round(value);
      else if (parameter === 'velocity') step.velocity = Math.round(value);
      else if (parameter === 'gate') step.gate = value;
      else return;
      if (parameter === 'semitone') {
        const label = input.closest<HTMLElement>('[data-sequencer-editor]')
          ?.querySelector<HTMLElement>(`[data-sequencer-step="${index}"] strong`);
        const output = input.closest<HTMLElement>('.pattern-knob')?.querySelector<HTMLOutputElement>('output');
        if (label && output) label.textContent = output.value;
      }
    }
    moduleState.settings.sequencer = settings;
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

  private renderArpeggiatorSummary(modal: HTMLElement, settings: ReturnType<typeof readArpeggiatorSettings>): void {
    const output = modal.querySelector<HTMLOutputElement>('.pattern-editor__header output');
    if (output) output.value = `${settings.division} · ${settings.octaves} oitava${settings.octaves === 1 ? '' : 's'}`;
  }

  private renderSequencerSummary(modal: HTMLElement, settings: SequencerSettings): void {
    const output = modal.querySelector<HTMLOutputElement>('.pattern-editor__header output');
    if (output) output.value = `${settings.length} passos · ${settings.division}`;
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
    const keyboardInputId = this.selectedMidiInputIds[this.keyboardMidiSlot - 1] ?? null;
    const matchesKeyboard = keyboardInputId === null || input.inputId === null || input.inputId === keyboardInputId;
    if (this.bottomView === 'keyboard' && matchesKeyboard) {
      this.performanceKeyboard?.setMidiNote(input.noteNumber, input.pressed);
    }
    window.dispatchEvent(new CustomEvent('hookkeys:performance-note', { detail: input }));
    this.patternPlayback.handleInput(input);
    if (!input.pressed) return;
    const pending = this.pendingNoteLearn;
    if (!pending) return;
    const moduleState = this.getActivePresetState()?.modules[pending.moduleNumber - 1];
    if (!moduleState) return;
    if (moduleState.midiInputId && input.inputId && moduleState.midiInputId !== input.inputId) return;
    this.applyLearnedMidiNote(input.noteNumber);
  }

  private openCcLearn(target: CcLearnTarget, trigger: HTMLElement): void {
    this.pendingCcLearn = target;
    if (this.modal) this.openChildModal('cc-learn', null, trigger);
    else this.openModal('cc-learn', null, trigger);
    void this.midiInput.requestAccess();
  }

  private ccMappingLabel(target: CcLearnTarget): string {
    const controller = this.ccMappings.get(ccMappingKey(target));
    return controller === undefined ? 'Ainda não mapeado' : `CC ${controller}`;
  }

  private handleMidiControlChange(input: MidiControlChangeInput): void {
    const previousValue = this.lastCcValues.get(input.controller) ?? 0;
    this.lastCcValues.set(input.controller, input.value);

    const pending = this.pendingCcLearn;
    if (pending && this.modal?.classList.contains('player-modal--cc-learn')) {
      this.ccMappings.set(ccMappingKey(pending), input.controller);
      const status = this.modal.querySelector<HTMLElement>('[data-cc-learn-status]');
      if (status) {
        status.textContent = `CC ${input.controller} mapeado`;
        status.classList.add('is-complete');
      }
      const current = this.modal.querySelector<HTMLElement>('[data-cc-learn-current]');
      if (current) current.textContent = `Mapeamento atual: CC ${input.controller}`;
      this.pendingCcLearn = null;
      this.markPlayerStateChanged();
      return;
    }

    const risingEdge = previousValue < 64 && input.value >= 64;
    let outputChanged = false;
    let metronomeVolumeChanged = false;
    for (const [targetKey, controller] of this.ccMappings) {
      if (controller !== input.controller) continue;
      const moduleMatch = /^module:([1-8])$/.exec(targetKey);
      if (moduleMatch) {
        const moduleNumber = Number(moduleMatch[1]);
        this.faders.get(moduleNumber)?.setValueDb(visualPositionToFaderDb(input.value / 127), true);
        continue;
      }

      const moduleControlMatch = /^module-control:([1-8]):(.+)$/.exec(targetKey);
      if (moduleControlMatch) {
        const moduleNumber = Number(moduleControlMatch[1]);
        const control = moduleControlMatch[2] ?? '';
        if (control === 'delay:tap') {
          if (risingEdge) this.tapMappedModuleDelay(moduleNumber);
        } else {
          this.applyMappedModuleControl(moduleNumber, control, input.value / 127);
        }
        continue;
      }

      const octaveMatch = /^octave:([1-8]):(up|down)$/.exec(targetKey);
      if (octaveMatch && risingEdge) {
        this.shiftModuleOctave(Number(octaveMatch[1]), octaveMatch[2] === 'up' ? 1 : -1);
        continue;
      }

      const outputMatch = /^output:(music|pads|effects|master)$/.exec(targetKey);
      if (outputMatch && isOutputBus(outputMatch[1])) {
        this.outputLevels[outputMatch[1]] = visualPositionToFaderDb(input.value / 127);
        outputChanged = true;
        continue;
      }

      if (targetKey === 'metronome:volume') {
        this.metronome.setVolume(input.value / 127);
        metronomeVolumeChanged = true;
        continue;
      }

      if (targetKey === 'metronome:tap' && risingEdge) {
        this.metronome.tap(performance.now());
        this.renderMetronomeState();
        this.markPlayerStateChanged();
        continue;
      }

      const bankMatch = /^bank:([AB])$/.exec(targetKey);
      if (bankMatch && risingEdge && this.isBankId(bankMatch[1])) {
        this.showBank(bankMatch[1]);
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

      const presetMatch = /^preset:([1-9]|1[0-6])$/.exec(targetKey);
      if (presetMatch && risingEdge) {
        this.activateMappedPreset(Number(presetMatch[1]));
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
    this.dispatchPerformanceTrigger({
      kind: 'effect',
      value: String(effectNumber),
      label: effectState.name,
      active: effectState.active,
      effectBank: bank,
      volumeDb: effectState.volumeDb,
    });
  }

  private activateMappedPreset(presetNumber: number): void {
    if (presetNumber < 1 || presetNumber > PRESET_COUNT) return;
    const bank = this.bankStates.get(this.activeBank);
    if (!bank || bank.selectedPreset === presetNumber) return;
    this.cancelNoteLearn();
    this.saveActivePresetState();
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
    const moduleKinds: readonly ModalKind[] = ['sound-selection', 'sound-download', 'module-settings', 'module-polyphony', 'module-velocity', 'module-arpeggiator', 'module-sequencer', 'module-synth', 'module-eq', 'module-compressor', 'module-reverb', 'module-delay'];
    const moduleState = !moduleKinds.includes(kind) || moduleNumber === null
      ? null
      : this.ensureActivePresetState()?.modules[moduleNumber - 1] ?? null;
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
      );
    } else if (kind === 'sound-download') {
      const sound = this.selectedCatalogSoundId ? this.soundCatalog.get(this.selectedCatalogSoundId) : null;
      bodyMarkup = createSoundDownloadMarkup(sound, sound ? this.installedFixedSoundIds.has(sound.id) : false);
    } else if (kind === 'performance-download') {
      bodyMarkup = createPerformanceDownloadMarkup(this.selectedPerformanceAsset);
    } else if (kind === 'backup-download') {
      bodyMarkup = createBackupDownloadMarkup(this.pendingBackupDownloads);
    } else if (kind === 'module-settings') {
      bodyMarkup = createModuleSettingsMarkup(
        this.midiInput.getInputDevices(),
        this.selectedMidiInputIds,
        moduleState?.midiInputId ?? null,
        moduleState?.settings ?? {},
        this.metronome.getBpm(),
        this.activeAudioChannelCount(),
        isAudioBusRoute(moduleState?.settings.outputRoute, this.activeAudioChannelCount())
          ? moduleState.settings.outputRoute as AudioBusRoute
          : 'stereo:0',
        moduleNumber === 6 ? 'arpeggiator'
          : moduleNumber === 7 ? 'sequencer'
            : moduleNumber === 8 ? 'synth' : 'compressor',
      );
    } else if (kind === 'module-polyphony') {
      const polyphony = Math.round(Math.min(128, Math.max(1, Number(moduleState?.settings.polyphony) || 64)));
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
      bodyMarkup = createVelocityCurveMarkup(moduleState?.settings ?? {});
    } else if (kind === 'module-arpeggiator') {
      bodyMarkup = createArpeggiatorMarkup(moduleState?.settings.arpeggiator);
    } else if (kind === 'module-sequencer') {
      bodyMarkup = createSequencerMarkup(moduleState?.settings.sequencer);
    } else if (kind === 'module-synth') {
      bodyMarkup = createSynthModuleMarkup(moduleState?.settings.synth);
    } else if (kind === 'module-eq') {
      bodyMarkup = createModuleEqMarkup(moduleState?.settings ?? {});
    } else if (kind === 'module-compressor') {
      bodyMarkup = createModuleCompressorMarkup(moduleState?.settings ?? {});
    } else if (kind === 'module-reverb') {
      bodyMarkup = createModuleReverbMarkup(moduleState?.settings ?? {});
    } else if (kind === 'module-delay') {
      bodyMarkup = createModuleDelayMarkup(moduleState?.settings ?? {}, this.metronome.getBpm());
    } else if (kind === 'app-settings') {
      bodyMarkup = createAppSettingsMarkup(
        this.compatibilityMode,
        this.bottomView,
        !this.desktopRuntime,
        this.keyboardMidiSlot,
      );
    } else if (kind === 'app-settings-midi') {
      bodyMarkup = createMidiSettingsMarkup(this.midiInput.getInputDevices(), this.selectedMidiInputIds);
    } else if (kind === 'app-settings-audio') {
      bodyMarkup = createAudioSettingsMarkup(this.audioDevices, this.selectedAudioDeviceId, this.audioRouting, this.bufferSize);
    } else if (kind === 'keyboard-settings') {
      bodyMarkup = createPerformanceKeyboardSettingsMarkup(this.keyboardMidiSlot, this.keyboardStyle);
    } else if (kind === 'password-reset') {
      bodyMarkup = this.passwordResetToken
        ? createNewPasswordMarkup(!this.desktopRuntime)
        : createPasswordResetCodeMarkup(this.account.email);
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
          <button class="preset-name-editor__learn" type="button" data-modal-action="learn-preset-cc">
            <span>Learn CC</span>
            <small>${this.ccMappingLabel({ kind: 'preset', presetNumber: moduleNumber })}</small>
          </button>
        </section>
      `;
    } else if (kind === 'cc-learn' && this.pendingCcLearn) {
      const currentController = this.ccMappings.get(ccMappingKey(this.pendingCcLearn));
      bodyMarkup = `
        <section class="cc-learn-panel">
          <div class="cc-learn-panel__badge" aria-hidden="true">CC</div>
          <strong>Learn CC</strong>
          <p data-cc-learn-status>Mova o controle MIDI que deseja usar.</p>
          <small data-cc-learn-current>${currentController === undefined ? 'Ainda não mapeado' : `Mapeamento atual: CC ${currentController}`}</small>
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
        </section>
      `;
    } else if (kind === 'tempo-edit') {
      bodyMarkup = `
        <section class="tempo-editor">
          <label>
            <span>Tempo</span>
            <input type="number" min="60" max="600" step="1" inputmode="numeric" value="${this.metronome.getBpm()}" data-tempo-input>
            <small>60 a 600 BPM</small>
          </label>
        </section>
      `;
    } else if (kind === 'track-position') {
      const snapshot = this.trackTransport?.getSnapshot() ?? this.trackPlaybackSnapshot;
      const canSeek = snapshot.selectedTrackId !== null && snapshot.state !== 'playing' && snapshot.state !== 'loading';
      bodyMarkup = `
        <section class="track-position-panel">
          <div class="waveform-position" style="--track-progress:${snapshot.progress * 100}%">
            <div class="waveform-position__bars" aria-hidden="true">
              ${createWaveformBarsMarkup()}
            </div>
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
          class="effect-pad-editor${supportsAudioAssignment ? ' has-audio-options' : ''}"
          data-effect-color-index="${activeColorIndex}"
          data-effect-mode="${effectPadState?.triggerMode ?? 'toggle'}"
          data-effect-gate-release="${effectPadState?.gateRelease ?? 'infinite'}"
        >
          <label class="effect-pad-editor__field">
            <span>Nome do efeito</span>
            <input type="text" maxlength="12" autocomplete="off" data-effect-name-input>
          </label>
          <div class="effect-pad-editor__preview" aria-label="Prévia do pad">
            <button
              class="performance-pad performance-pad--effect effect-pad-editor__preview-button"
              type="button"
              disabled
              style="--effect-accent: ${activeColors[0]}; --effect-dark: ${activeColors[1]}"
            ><span></span></button>
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
          <button class="effect-pad-editor__learn" type="button" data-modal-action="learn-effect-cc">
            <span>Learn CC</span>
            <small>${this.ccMappingLabel({ kind: 'effect', bank: this.activeEffectBank, effectNumber: moduleNumber })}</small>
          </button>
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
              <strong data-user-name></strong>
              <small data-user-created>Carregando data da conta...</small>
            </div>
            <input type="file" accept="image/*" data-user-profile-file hidden>
          </div>
          <div class="user-panel__profile-body">
            <nav class="user-panel__buttons" aria-label="Opções da conta">
              <button class="user-panel__action-button" type="button" data-modal-action="make-backup">Fazer backup</button>
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
        </section>
      `;
    } else if (kind === 'tracks') {
      bodyMarkup = createTracksPanelMarkup();
    }
    const processorKind = kind === 'module-eq' ? 'eq'
      : kind === 'module-compressor' ? 'compressor'
        : kind === 'module-reverb' ? 'reverb'
          : kind === 'module-delay' ? 'delay' : null;
    const patternKind = kind === 'module-arpeggiator' ? 'arpeggiator'
      : kind === 'module-sequencer' ? 'sequencer' : null;
    const processorEnabled = patternKind === 'arpeggiator'
      ? readArpeggiatorSettings(moduleState?.settings.arpeggiator).enabled
      : patternKind === 'sequencer'
        ? readSequencerSettings(moduleState?.settings.sequencer).enabled
      : processorKind === 'eq'
      ? moduleState?.settings.eqEnabled !== false
      : processorKind === 'compressor'
        ? readModuleCompressorSettings(moduleState?.settings.compressor).enabled
        : processorKind === 'reverb'
          ? readModuleReverbSettings(moduleState?.settings.reverb).enabled
          : processorKind === 'delay'
            ? readModuleDelaySettings(moduleState?.settings.delay).enabled
            : false;
    const footerMarkup = kind === 'user'
      ? `
          <button class="player-modal__back-button" type="button" data-modal-action="cancel">Voltar</button>
          <button class="player-modal__logout-button" type="button" data-action="logout">Sair</button>
        `
      : kind === 'password-reset'
        ? `<button class="player-modal__back-button" type="button" data-modal-action="cancel">Voltar</button>`
      : kind === 'tracks'
        ? `
          <button class="player-modal__back-button" type="button" data-modal-action="cancel">Voltar</button>
          <button class="tracks-footer-button tracks-footer-button--add" type="button" data-tracks-action="add-music">Add música</button>
          <button class="tracks-footer-button tracks-footer-button--create" type="button" data-tracks-action="create-playlist">Create playlist</button>
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
        ? `<button class="player-modal__back-button" type="button" data-modal-action="cancel">Voltar</button>`
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
            <button class="sound-library-download-all" type="button" data-modal-action="download-all-sounds" aria-live="polite">Baixar tudo</button>
          ` : ''}
          ${kind === 'tempo-edit' ? `
            <button class="player-modal__header-action" type="button" data-modal-action="learn-tempo-cc">
              <span>Learn CC</span>
              <small>${this.ccMappingLabel({ kind: 'tap-tempo' })}</small>
            </button>
          ` : ''}
          ${processorKind ? `
            <button class="module-processor-reset-button" type="button" data-modal-action="reset-processor" data-reset-processor="${processorKind}">Reset</button>
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
        : moduleNumber === 7 ? 'Sequencer'
          : moduleNumber === 6 ? 'Arpeggiator'
        : moduleState?.timbreId && moduleState.timbreName !== 'Sem timbre'
        ? moduleState.timbreName
        : 'Timbre';
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
    } else if (kind === 'module-arpeggiator') {
      eyebrow.textContent = 'Módulo 06';
      title.textContent = 'Arpeggiator';
    } else if (kind === 'module-sequencer') {
      eyebrow.textContent = 'Módulo 07';
      title.textContent = 'Sequencer';
    } else if (kind === 'module-synth') {
      eyebrow.textContent = 'Módulo 08';
      title.textContent = 'Synth';
    } else if (kind === 'module-eq') {
      eyebrow.textContent = moduleState?.timbreId && moduleState.timbreName !== 'Sem timbre'
        ? moduleState.timbreName
        : 'Timbre';
      title.textContent = 'EQ';
    } else if (kind === 'module-compressor' || kind === 'module-reverb' || kind === 'module-delay') {
      eyebrow.textContent = moduleState?.timbreId && moduleState.timbreName !== 'Sem timbre'
        ? moduleState.timbreName
        : 'Timbre';
      title.textContent = kind === 'module-compressor'
        ? 'Compressor'
        : kind === 'module-reverb' ? 'Reverb' : 'Delay';
    } else if (kind === 'sound-selection') {
      eyebrow.textContent = `Módulo ${(moduleNumber ?? 0).toString().padStart(2, '0')}`;
      title.textContent = 'Escolher timbre';
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
      title.textContent = this.passwordResetToken ? 'Nova senha' : 'Redefinir senha';
    } else if (kind === 'user') {
      eyebrow.textContent = 'Hook Keys';
      title.textContent = 'Usuário';
    } else if (kind === 'tracks') {
      eyebrow.textContent = 'Hook Keys';
      title.textContent = 'Playlist';
    } else if (kind === 'output-volume') {
      eyebrow.textContent = 'Hook Keys';
      title.textContent = 'Volume';
    } else if (kind === 'effect-pad') {
      eyebrow.textContent = `FX ${this.activeEffectBank} · Pad ${(moduleNumber ?? 0).toString().padStart(2, '0')}`;
      title.textContent = 'Editar efeito';
    } else if (kind === 'cc-learn' && this.pendingCcLearn) {
      eyebrow.textContent = ccLearnTargetLabel(this.pendingCcLearn);
      title.textContent = 'Learn CC';
    } else if (kind === 'metronome') {
      eyebrow.textContent = `${this.metronome.getBpm()} BPM`;
      title.textContent = 'Metrônomo';
    } else if (kind === 'tempo-edit') {
      eyebrow.textContent = 'Tap Tempo';
      title.textContent = 'Definir tempo';
    } else if (kind === 'track-position') {
      eyebrow.textContent = 'Playlist';
      title.textContent = 'Posição da música';
    } else if (kind === 'compatibility-mode') {
      eyebrow.textContent = 'Hook Keys';
      title.textContent = this.pendingCompatibilityMode ? 'Modo compatibilidade' : 'Confirmar alteração';
    } else {
      eyebrow.textContent = `Banco ${this.activeBank} · Preset ${(moduleNumber ?? 0).toString().padStart(2, '0')}`;
      title.textContent = 'Nome do preset';
    }

    modal.addEventListener('click', (event) => {
      const target = event.target;
      const customSelectOption = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-app-select-value]')
        : null;
      if (customSelectOption) {
        const customSelect = customSelectOption.closest<HTMLElement>('.app-select');
        const select = customSelect?.parentElement?.querySelector<HTMLSelectElement>('select[data-setting]');
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
      if (kind === 'app-settings' && this.desktopRuntime && desktopKeyboardButton) {
        const slot = Number(desktopKeyboardButton.dataset.desktopKeyboardMidiSlot);
        if (slot === 1 || slot === 2 || slot === 3) {
          this.keyboardMidiSlot = slot;
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
      if (kind === 'keyboard-settings' && keyboardStyleButton) {
        const style = keyboardStyleButton.dataset.keyboardStyle;
        if (style === 'standard' || style === 'black' || style === 'neon') {
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
        if (moduleSettingAction === 'toggle-voice-mode' && moduleNumber >= 1 && moduleNumber <= 5) {
          const button = target instanceof Element
            ? target.closest<HTMLButtonElement>('button[data-module-setting-action="toggle-voice-mode"]')
            : null;
          if (button) this.toggleModuleVoiceMode(button, moduleNumber);
          return;
        }
        const childKind = moduleSettingAction === 'open-compressor'
          ? 'module-compressor'
          : moduleSettingAction === 'open-arpeggiator'
            ? 'module-arpeggiator'
            : moduleSettingAction === 'open-sequencer'
              ? 'module-sequencer'
          : moduleSettingAction === 'open-synth'
            ? 'module-synth'
          : moduleSettingAction === 'open-reverb'
            ? 'module-reverb'
            : moduleSettingAction === 'open-delay' ? 'module-delay'
              : moduleSettingAction === 'open-polyphony' ? 'module-polyphony'
                : moduleSettingAction === 'open-velocity' ? 'module-velocity' : null;
        const button = childKind && target instanceof Element
          ? target.closest<HTMLButtonElement>('button[data-module-setting-action]')
          : null;
        if (childKind && button) this.openChildModal(childKind, moduleNumber, button);
        if (childKind) return;
      }
      if (kind === 'module-synth' && moduleNumber === 8) {
        const oscillatorButton = target instanceof Element
          ? target.closest<HTMLButtonElement>('[data-synth-oscillator]')
          : null;
        if (oscillatorButton?.dataset.synthOscillator) {
          const [parameter, oscillator] = oscillatorButton.dataset.synthOscillator.split(':');
          if ((parameter === 'oscillator1' || parameter === 'oscillator2')
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
          this.toggleSynthLegato(toggleButton);
          return;
        }
      }
      if (kind === 'module-arpeggiator' && moduleNumber === 6) {
        const modeButton = target instanceof Element
          ? target.closest<HTMLButtonElement>('[data-arpeggiator-mode]')
          : null;
        const mode = modeButton?.dataset.arpeggiatorMode;
        if (modeButton && isArpeggiatorModeValue(mode)) {
          this.selectArpeggiatorMode(modal, mode);
          return;
        }
        const divisionButton = target instanceof Element
          ? target.closest<HTMLButtonElement>('[data-arpeggiator-division]')
          : null;
        const division = divisionButton?.dataset.arpeggiatorDivision;
        if (divisionButton && isPatternDivisionValue(division)) {
          this.selectArpeggiatorDivision(modal, division);
          return;
        }
      }
      if (kind === 'module-sequencer' && moduleNumber === 7) {
        const stepButton = target instanceof Element
          ? target.closest<HTMLButtonElement>('[data-sequencer-step]')
          : null;
        if (stepButton) {
          this.selectSequencerStep(modal, Number(stepButton.dataset.sequencerStep));
          return;
        }
        const stepPower = target instanceof Element
          ? target.closest<HTMLButtonElement>('[data-sequencer-step-power]')
          : null;
        if (stepPower) {
          this.toggleSequencerStep(modal, stepPower);
          return;
        }
        const divisionButton = target instanceof Element
          ? target.closest<HTMLButtonElement>('[data-sequencer-division]')
          : null;
        const division = divisionButton?.dataset.sequencerDivision;
        if (divisionButton && isPatternDivisionValue(division)) {
          this.selectSequencerDivision(modal, division);
          return;
        }
        const lengthButton = target instanceof Element
          ? target.closest<HTMLButtonElement>('[data-sequencer-length]')
          : null;
        if (lengthButton) {
          this.selectSequencerLength(modal, Number(lengthButton.dataset.sequencerLength));
          return;
        }
      }
      const velocityModeButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-velocity-mode-option]')
        : null;
      if (kind === 'module-velocity' && moduleNumber !== null && velocityModeButton) {
        const mode = velocityModeButton.dataset.velocityModeOption;
        if (isVelocityCurveMode(mode)) this.selectModuleVelocityMode(modal, moduleNumber, mode);
        return;
      }
      const effectPowerButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-module-effect-power]')
        : null;
      if (
        moduleNumber !== null
        && (kind === 'module-eq' || kind === 'module-compressor' || kind === 'module-reverb' || kind === 'module-delay' || kind === 'module-arpeggiator' || kind === 'module-sequencer')
        && effectPowerButton
      ) {
        this.toggleModuleEffectPower(effectPowerButton, moduleNumber);
        return;
      }
      const delayDivisionButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-module-delay-division]')
        : null;
      if (kind === 'module-delay' && moduleNumber !== null && delayDivisionButton) {
        this.selectModuleDelayDivision(modal, delayDivisionButton, moduleNumber);
        return;
      }
      const delaySyncButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-module-delay-sync]')
        : null;
      if (kind === 'module-delay' && moduleNumber !== null && delaySyncButton) {
        this.toggleModuleDelaySync(modal, delaySyncButton, moduleNumber);
        return;
      }
      const eqTypeButton = target instanceof Element
        ? target.closest<HTMLButtonElement>('button[data-module-eq-type]')
        : null;
      if (kind === 'module-eq' && moduleNumber !== null && eqTypeButton) {
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
        if (this.installedFixedSoundIds.has(soundId)) {
          this.selectFixedSound(moduleNumber, soundId);
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
        if (button) void this.downloadAllOfficialSounds(modal, button);
        return;
      }
      if (processorKind && moduleNumber !== null && modalAction === 'reset-processor') {
        this.showProcessorResetConfirmation(modal, moduleNumber, processorKind);
        return;
      }
      const processorResetChoice = target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-processor-reset-choice]')?.dataset.processorResetChoice
        : null;
      if (processorKind && moduleNumber !== null && processorResetChoice) {
        if (processorResetChoice === 'confirm') this.confirmProcessorReset(moduleNumber, processorKind);
        else modal.querySelector('[data-processor-reset-confirmation]')?.remove();
        return;
      }
      if (modalAction === 'learn-preset-cc' && kind === 'preset-name' && moduleNumber !== null) {
        this.commitPresetName(modal, moduleNumber);
        const button = target instanceof Element
          ? target.closest<HTMLButtonElement>('button[data-modal-action="learn-preset-cc"]')
          : null;
        if (button) {
          this.openCcLearn(
            { kind: 'preset', presetNumber: moduleNumber },
            button,
          );
        }
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
      if (modalAction === 'learn-tempo-cc' && kind === 'tempo-edit') {
        this.commitTempo(modal);
        const button = target instanceof Element
          ? target.closest<HTMLButtonElement>('[data-modal-action="learn-tempo-cc"]')
          : null;
        if (button) this.openCcLearn({ kind: 'tap-tempo' }, button);
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
      if (modalAction === 'confirm' || modalAction === 'cancel') {
        if (modalAction === 'cancel' && kind === 'password-reset') {
          this.passwordResetChallenge = null;
          this.passwordResetToken = null;
          if (this.modalHistory.length > 0) this.returnToPreviousModal();
          else this.closeModal();
          return;
        }
        if (modalAction === 'confirm' && kind === 'preset-name' && moduleNumber !== null) {
          this.commitPresetName(modal, moduleNumber);
        }
        if (modalAction === 'confirm' && kind === 'effect-pad' && moduleNumber !== null) {
          this.commitEffectPad(modal, moduleNumber);
        }
        if (modalAction === 'confirm' && kind === 'tempo-edit') this.commitTempo(modal);
        if (modalAction === 'confirm' && kind === 'module-polyphony' && moduleNumber !== null) {
          this.commitModulePolyphony(modal, moduleNumber);
        }
        if ((modalAction === 'cancel' || modalAction === 'confirm') && ((kind === 'module-polyphony' || kind === 'module-velocity' || kind === 'module-arpeggiator' || kind === 'module-sequencer' || kind === 'module-synth') || (modalAction === 'cancel' && (kind === 'sound-download' || kind === 'cc-learn' || kind === 'keyboard-settings' || kind === 'app-settings-midi' || kind === 'app-settings-audio' || kind === 'module-eq' || kind === 'module-compressor' || kind === 'module-reverb' || kind === 'module-delay'))) && this.modalHistory.length > 0) {
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

      if (kind === 'password-reset' && modalAction === 'verify-password-reset') {
        const button = target instanceof Element ? target.closest<HTMLButtonElement>('button') : null;
        if (button) void this.verifyPasswordResetCode(modal, button);
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
    if (kind === 'module-eq' && moduleNumber !== null) {
      modal.addEventListener('pointerdown', (event) => this.startEqBandDrag(event, moduleNumber));
      modal.addEventListener('pointermove', (event) => this.moveEqBandDrag(event));
      modal.addEventListener('pointerup', (event) => this.endEqBandDrag(event));
      modal.addEventListener('pointercancel', (event) => this.endEqBandDrag(event));
    }
    if (kind === 'module-velocity' && moduleNumber !== null) {
      for (const button of modal.querySelectorAll<HTMLButtonElement>('[data-velocity-mode-option]')) {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          const mode = button.dataset.velocityModeOption;
          if (isVelocityCurveMode(mode)) this.selectModuleVelocityMode(modal, moduleNumber, mode);
        });
      }
      const fixedInput = modal.querySelector<HTMLInputElement>('[data-velocity-fixed-value]');
      fixedInput?.addEventListener('input', (event) => {
        event.stopPropagation();
        this.setFixedModuleVelocity(modal, moduleNumber, Number(fixedInput.value));
      });
      fixedInput?.addEventListener('change', (event) => {
        event.stopPropagation();
        this.setFixedModuleVelocity(modal, moduleNumber, Number(fixedInput.value));
        this.markPlayerStateChanged();
      });
      modal.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        const handle = event.target instanceof Element
          ? event.target.closest<SVGCircleElement>('[data-velocity-point]')
          : null;
        const plot = handle?.closest<HTMLElement>('[data-velocity-curve-plot]');
        const editor = plot?.closest<HTMLElement>('.velocity-curve-editor');
        const pointIndex = Number(handle?.dataset.velocityPoint);
        if (!handle || !plot || editor?.dataset.velocityMode !== 'user' || !Number.isInteger(pointIndex)) return;
        event.preventDefault();
        plot.setPointerCapture(event.pointerId);
        velocityCurveDrag = { pointerId: event.pointerId, pointIndex, plot };
        this.setModuleVelocityPoint(modal, moduleNumber, pointIndex, event.clientY, false);
      });
      modal.addEventListener('pointermove', (event) => {
        if (velocityCurveDrag?.pointerId !== event.pointerId) return;
        event.preventDefault();
        this.setModuleVelocityPoint(modal, moduleNumber, velocityCurveDrag.pointIndex, event.clientY, false);
      });
      const endVelocityDrag = (event: PointerEvent) => {
        if (velocityCurveDrag?.pointerId !== event.pointerId) return;
        // A cancelled pointer carries no meaningful position: keep the point
        // where the last move left it and just persist that.
        if (event.type === 'pointercancel') this.markPlayerStateChanged();
        else this.setModuleVelocityPoint(modal, moduleNumber, velocityCurveDrag.pointIndex, event.clientY, true);
        if (velocityCurveDrag.plot.hasPointerCapture(event.pointerId)) {
          velocityCurveDrag.plot.releasePointerCapture(event.pointerId);
        }
        velocityCurveDrag = null;
      };
      modal.addEventListener('pointerup', endVelocityDrag);
      modal.addEventListener('pointercancel', endVelocityDrag);
    }
    modal.addEventListener('pointerdown', (event) => this.startKnobDrag(event, moduleNumber));
    modal.addEventListener('pointermove', (event) => {
      this.knobCcLearnGesture.move(event);
      this.moveKnobDrag(event);
    });
    modal.addEventListener('pointerup', (event) => {
      this.knobCcLearnGesture.end(event);
      this.endKnobDrag(event);
    });
    modal.addEventListener('pointercancel', (event) => {
      this.knobCcLearnGesture.end(event);
      this.endKnobDrag(event);
    });
    if (kind === 'module-delay' && moduleNumber !== null) {
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
        void this.uploadUserProfilePhoto(modal, input);
        return;
      }
      if (kind === 'user' && input instanceof HTMLInputElement && input.matches('[data-player-backup-file]')) {
        const file = input.files?.[0];
        if (file) void this.restorePlayerBackup(modal, file);
        return;
      }
      if (kind === 'module-velocity' && moduleNumber !== null && input instanceof HTMLInputElement && input.matches('[data-velocity-fixed-value]')) {
        this.setFixedModuleVelocity(modal, moduleNumber, Number(input.value));
        this.markPlayerStateChanged();
        return;
      }
      if (kind === 'app-settings' || kind === 'app-settings-midi' || kind === 'app-settings-audio') this.handleAppSettingsChange(event);
      if (kind === 'module-settings' && moduleNumber !== null) {
        this.handleModuleSettingsChange(event, moduleNumber);
      }
    });
    modal.addEventListener('input', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (kind === 'module-synth' && moduleNumber === 8 && input.matches('[data-synth-parameter]')) {
        this.updateSynthParameter(input);
      } else if (kind === 'module-arpeggiator' && moduleNumber === 6 && input.matches('[data-pattern-kind="arpeggiator"]')) {
        this.updateArpeggiatorParameter(input);
      } else if (kind === 'module-sequencer' && moduleNumber === 7 && input.matches('[data-pattern-kind="sequencer"]')) {
        this.updateSequencerParameter(input);
      } else if (kind === 'module-settings' && moduleNumber !== null && input.matches('[data-module-envelope]')) {
        this.updateModuleEnvelopeControl(modal, input, moduleNumber);
      } else if (kind === 'module-settings' && moduleNumber !== null && input.matches('[data-module-cutoff]')) {
        this.updateModuleCutoffControl(modal, input, moduleNumber);
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
      } else if (kind === 'module-velocity' && moduleNumber !== null && input.matches('[data-velocity-fixed-value]')) {
        this.setFixedModuleVelocity(modal, moduleNumber, Number(input.value));
      } else if (kind === 'password-reset' && input.matches('[data-password-reset-code]')) {
        input.value = input.value.replace(/\D/g, '').slice(0, 6);
        positionPasswordResetCodeCaret(input);
        const verify = modal.querySelector<HTMLButtonElement>('[data-modal-action="verify-password-reset"]');
        if (verify) verify.disabled = input.value.length !== 6;
      } else if (kind === 'password-reset' && input.matches('[data-new-password], [data-confirm-new-password]')) {
        const password = modal.querySelector<HTMLInputElement>('[data-new-password]');
        const confirmation = modal.querySelector<HTMLInputElement>('[data-confirm-new-password]');
        const save = modal.querySelector<HTMLButtonElement>('[data-modal-action="save-password-reset"]');
        if (save) save.disabled = !password || !confirmation || password.value.length < 8 || confirmation.value.length < 8;
      }
      if (kind === 'module-eq' && moduleNumber !== null && input.matches('[data-module-eq-q]')) {
        this.updateModuleEqQ(modal, input, moduleNumber);
      }
      if ((kind === 'module-compressor' || kind === 'module-reverb' || kind === 'module-delay') && moduleNumber !== null && input.matches('[data-module-effect-control]')) {
        this.updateModuleEffectControl(modal, input, moduleNumber);
      }
    });
    modal.addEventListener('keydown', this.handleModalKeydown);

    const screen = requiredElement<HTMLElement>(this.root, '.player-screen');
    screen.setAttribute('aria-hidden', 'true');
    this.root.append(modal);
    this.modal = modal;
    if (kind === 'app-settings-midi' || kind === 'app-settings-audio') {
      this.enhanceAppSelects(modal);
    }
    if (!this.desktopRuntime) {
      this.tabletInputKeyboardController = new TabletInputKeyboardController(modal);
      this.tabletInputKeyboardController.mount();
    }
    if (kind === 'tracks') {
      this.tracksPanelController = new TracksPanelController(
        modal,
        this.trackLibrary,
        {
          getPlaybackSnapshot: () => this.trackTransport?.getSnapshot() ?? this.trackPlaybackSnapshot,
          onTrackSelected: (track) => this.selectTrack(track),
        },
      );
      this.tracksPanelController.mount();
    } else if (kind === 'track-position') {
      this.trackTransport?.refreshView();
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
    if (kind === 'sound-selection') void this.renderSoundLibraryTotals(modal);
    const userName = modal.querySelector<HTMLElement>('[data-user-name]');
    const immediateUserName = this.account.name?.trim() || this.account.email;
    if (userName) userName.textContent = immediateUserName;
    const userPhotoFallback = modal.querySelector<HTMLElement>('[data-user-photo-fallback]');
    if (userPhotoFallback) userPhotoFallback.textContent = initialsFor(immediateUserName);
    if (kind === 'preset-name') {
      const input = requiredElement<HTMLInputElement>(modal, '[data-preset-name-input]');
      input.value = presetState?.name ?? 'Preset';
      const preview = requiredElement<HTMLElement>(modal, '.preset-name-editor__preview .player-preset-button__label');
      preview.textContent = input.value;
    } else if (kind === 'effect-pad') {
      const input = requiredElement<HTMLInputElement>(modal, '[data-effect-name-input]');
      input.value = effectPadState?.name ?? `Efeito ${moduleNumber ?? ''}`;
      const preview = requiredElement<HTMLElement>(modal, '.effect-pad-editor__preview-button span');
      preview.textContent = input.value;
      const volumeInput = modal.querySelector<HTMLInputElement>('[data-effect-pad-volume]');
      volumeInput?.addEventListener('dblclick', () => {
        volumeInput.value = String(EFFECT_PAD_MAX_DB);
        this.updateEffectPadVolumeControl(modal, volumeInput);
      });
    } else {
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
    if (message) message.textContent = 'Fazendo backup...';
    this.saveActivePresetState();
    try {
      const result = await this.playerBackup.backupNow(this.createSavedPlayerState());
      if (!modal.isConnected) return;
      if (message) {
        message.textContent = `Backup enviado para ${result.emailedTo}.`;
      }
    } catch {
      if (message) message.textContent = 'Não foi possível fazer o backup agora.';
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
    if (image && profile.photoDataUrl) {
      image.src = profile.photoDataUrl;
      image.hidden = false;
      if (fallback) fallback.hidden = true;
    }
  }

  private async uploadUserProfilePhoto(modal: HTMLElement, input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const message = modal.querySelector<HTMLElement>('[data-user-profile-message]');
    if (message) message.textContent = 'Salvando foto...';
    try {
      const imageDataUrl = await resizeProfilePhoto(file);
      const profile = await this.accountControls.saveProfilePhoto(imageDataUrl);
      if (!modal.isConnected) return;
      this.renderUserProfile(modal, profile);
      if (message) message.textContent = 'Foto atualizada.';
    } catch {
      if (message) message.textContent = 'Não foi possível atualizar a foto.';
    }
  }

  private handleUserSoundfontAction(modal: HTMLElement, action: string): void {
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
    try {
      await this.soundLibrary.addUser(name, file, restoredId);
      if (restoredId) {
        this.missingUserSoundfonts = this.missingUserSoundfonts.filter(({ id }) => id !== restoredId);
      }
      if (!modal.isConnected) return;
      const namePanel = modal.querySelector<HTMLElement>('[data-user-sf2-name]');
      if (namePanel) namePanel.hidden = true;
      await this.renderUserSoundfonts(modal);
      if (message) message.textContent = `${name} adicionado. Toque no timbre para selecionar neste módulo.`;
    } catch {
      if (message) message.textContent = 'Não foi possível adicionar este SF2.';
    }
  }

  private async renderUserSoundfonts(modal: HTMLElement): Promise<void> {
    const list = modal.querySelector<HTMLElement>('[data-user-sf2-list]');
    if (!list) return;
    try {
      const soundfonts = await this.soundLibrary.listUser();
      if (!modal.isConnected) return;
      this.renderSoundLibraryTotals(modal, soundfonts);
      const installedMarkup = soundfonts.map((soundfont) => `
            <button type="button" data-user-soundfont-id="${escapeMarkup(soundfont.id)}" data-user-soundfont-name="${escapeMarkup(soundfont.name)}" data-user-soundfont-color="${PRESET_COLORS[soundfont.colorIndex]?.[0] ?? PRESET_COLORS[0]?.[0]}" style="--user-sf2-color-a:${PRESET_COLORS[soundfont.colorIndex]?.[0] ?? PRESET_COLORS[0]?.[0]};--user-sf2-color-b:${PRESET_COLORS[soundfont.colorIndex]?.[1] ?? PRESET_COLORS[0]?.[1]}">
              <strong>${escapeMarkup(soundfont.name)}</strong>
              <small>${escapeMarkup(soundfont.fileName)}</small>
            </button>
          `).join('');
      const missingMarkup = this.missingUserSoundfonts.map((soundfont) => `
        <button class="is-missing" type="button" data-missing-user-soundfont-id="${escapeMarkup(soundfont.id)}" data-missing-user-soundfont-name="${escapeMarkup(soundfont.name)}">
          <strong>${escapeMarkup(soundfont.name)}</strong>
          <small>null</small>
        </button>
      `).join('');
      list.innerHTML = installedMarkup || missingMarkup
        ? installedMarkup + missingMarkup
        : '<p>Nenhum SF2 adicionado.</p>';
    } catch {
      list.innerHTML = '<p>Não foi possível carregar seus SF2.</p>';
    }
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
      const downloadAll = modal.querySelector<HTMLButtonElement>('[data-modal-action="download-all-sounds"]');
      if (downloadAll) {
        const downloadable = this.soundCatalog.sounds.filter((sound) => Boolean(sound.sf2ObjectKey));
        const remaining = downloadable.filter((sound) => !this.installedFixedSoundIds.has(sound.id));
        const allDownloaded = downloadable.length > 0 && remaining.length === 0;
        downloadAll.disabled = allDownloaded || downloadable.length === 0;
        downloadAll.textContent = allDownloaded ? 'Tudo baixado' : 'Baixar tudo';
      }
    } catch {
      // Mantém o valor visual inicial quando o armazenamento local não responder.
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

    const knownTotalBytes = sounds.reduce((total, sound) => total + (sound.byteSize ?? 0), 0);
    if (!(await hasStorageFor(knownTotalBytes || undefined))) {
      button.textContent = 'Sem espaço';
      return;
    }

    button.disabled = true;
    this.soundDownloadAbort?.abort();
    this.soundDownloadAbort = new AbortController();
    let completed = 0;
    try {
      for (const sound of sounds) {
        button.textContent = `Baixando ${completed + 1}/${sounds.length}`;
        await this.soundLibraryEngine.install(sound.id, undefined, this.soundDownloadAbort.signal);
        this.installedFixedSoundIds.add(sound.id);
        completed += 1;
        const soundButton = Array.from(modal.querySelectorAll<HTMLButtonElement>('[data-fixed-sound-id]'))
          .find((candidate) => candidate.dataset.fixedSoundId === sound.id);
        if (soundButton) {
          soundButton.classList.remove('is-downloadable');
          soundButton.classList.add('is-installed');
          soundButton.setAttribute('aria-label', `${sound.name}. Baixado`);
          const state = soundButton.querySelector<HTMLElement>('small');
          if (state) state.textContent = 'No dispositivo';
        }
      }
      button.textContent = 'Tudo baixado';
      void this.syncNativeEngine();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError') && button.isConnected) {
        button.textContent = completed > 0 ? `Continuar (${sounds.length - completed})` : 'Tentar novamente';
        button.disabled = false;
      }
    } finally {
      this.soundDownloadAbort = null;
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
    };
    moduleState.category = 'user';
    moduleState.timbreId = `user:${id}`;
    moduleState.timbreName = name;
    moduleState.timbreColor = normalizeSoundColor(button.dataset.userSoundfontColor);
    this.restoreActivePresetState();
    this.markPlayerStateChanged();
    if (!hookKeysNative.isAvailable()) {
      this.closeModal();
      return;
    }
    const message = this.modal?.querySelector<HTMLElement>('[data-user-sf2-message]');
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    if (message) message.textContent = `Carregando ${name} no módulo ${moduleNumber}...`;
    if (this.nativeSyncTimer !== null) {
      window.clearTimeout(this.nativeSyncTimer);
      this.nativeSyncTimer = null;
    }
    this.nativeLoadedTimbres[moduleNumber - 1] = null;
    await this.syncNativeEngine();
    if (!button.isConnected) return;
    button.disabled = false;
    button.removeAttribute('aria-busy');
    if (this.nativeLoadedTimbres[moduleNumber - 1] !== moduleState.timbreId) {
      Object.assign(moduleState, previousSelection);
      this.restoreActivePresetState();
      this.markPlayerStateChanged();
      if (message) message.textContent = `Não foi possível carregar ${name}. Confira se o arquivo SF2 é válido.`;
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

  private async beginPasswordReset(button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    const userModal = this.modal;
    const message = userModal?.querySelector<HTMLElement>('[data-user-profile-message]');
    if (message) message.textContent = 'Enviando código...';
    try {
      this.passwordResetChallenge = await this.accountControls.requestPasswordReset();
      this.passwordResetToken = null;
      if (button.isConnected) this.openChildModal('password-reset', null, button);
    } catch {
      if (message) message.textContent = 'Não foi possível enviar o código agora.';
      button.disabled = false;
    }
  }

  private async verifyPasswordResetCode(modal: HTMLElement, button: HTMLButtonElement): Promise<void> {
    const input = modal.querySelector<HTMLInputElement>('[data-password-reset-code]');
    const challenge = this.passwordResetChallenge;
    if (!input || !challenge || input.value.length !== 6) return;
    button.disabled = true;
    const message = modal.querySelector<HTMLElement>('.user-device-message');
    try {
      const result = await this.accountControls.verifyPasswordResetCode(challenge.challengeId, input.value);
      this.passwordResetToken = result.passwordToken;
      if (modal.isConnected) this.openModal('password-reset', null, this.modalTrigger ?? this.root, true);
    } catch {
      if (message) message.textContent = 'Código incorreto ou expirado. Tente novamente.';
      input.value = '';
      positionPasswordResetCodeCaret(input);
      button.disabled = true;
    }
  }

  private async saveNewPassword(modal: HTMLElement, button: HTMLButtonElement): Promise<void> {
    const password = modal.querySelector<HTMLInputElement>('[data-new-password]');
    const confirmation = modal.querySelector<HTMLInputElement>('[data-confirm-new-password]');
    const token = this.passwordResetToken;
    const message = modal.querySelector<HTMLElement>('.user-device-message');
    if (!password || !confirmation || !token) return;
    if (password.value !== confirmation.value) {
      if (message) message.textContent = 'As senhas não são iguais.';
      return;
    }
    if (password.value.length < 8) return;
    button.disabled = true;
    try {
      await this.accountControls.completePasswordReset(token, password.value);
      this.passwordResetChallenge = null;
      this.passwordResetToken = null;
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
        void this.applyNativeAudioOutput();
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
      if ((bus === 'timbres' || bus === 'pads' || bus === 'effects') && isAudioBusRoute(select.value, channels)) {
        this.audioRouting[bus] = select.value;
        this.markPlayerStateChanged();
      }
    }
  }

  private handleModuleSettingsChange(event: Event, moduleNumber: number): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return;
    const target = event.target;
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
      if (isAudioBusRoute(select.value, this.activeAudioChannelCount())) {
        moduleState.settings.outputRoute = select.value;
        this.markPlayerStateChanged();
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

  private startKnobDrag(event: PointerEvent, moduleNumber: number | null): void {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const input = event.target instanceof Element
      ? event.target.closest<HTMLInputElement>('.module-envelope-knob input[type="range"], .module-effect-knob input[type="range"], .player-output-knob input[type="range"]')
      : null;
    if (!input || input.disabled) return;
    const startValue = Number(input.value);
    const minimum = Number(input.min);
    const maximum = Number(input.max);
    if (![startValue, minimum, maximum].every(Number.isFinite) || maximum <= minimum) return;

    event.preventDefault();
    input.focus({ preventScroll: true });
    input.setPointerCapture(event.pointerId);
    this.knobDrag = {
      input,
      pointerId: event.pointerId,
      startValue,
      startY: event.clientY,
      travelPixels: Math.max(140, Math.min(260, window.innerHeight * 0.42)),
      moved: false,
    };
    this.showKnobFocus(input);
    const learnTarget = moduleNumber === null ? this.ccLearnTargetForOutputKnob(input) : this.ccLearnTargetForKnob(input, moduleNumber);
    if (!this.desktopRuntime && learnTarget) {
      this.knobCcLearnGesture.start(event, () => {
        if (input.hasPointerCapture(event.pointerId)) input.releasePointerCapture(event.pointerId);
        this.knobDrag = null;
        this.hideKnobFocus();
        this.openCcLearn(learnTarget, input);
      });
    }
  }

  private moveKnobDrag(event: PointerEvent): void {
    const drag = this.knobDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();

    const minimum = Number(drag.input.min);
    const maximum = Number(drag.input.max);
    const step = Number(drag.input.step);
    const verticalDelta = drag.startY - event.clientY;
    const rawValue = drag.startValue + (verticalDelta / drag.travelPixels) * (maximum - minimum);
    const steppedValue = Number.isFinite(step) && step > 0
      ? minimum + Math.round((rawValue - minimum) / step) * step
      : rawValue;
    const value = Math.min(maximum, Math.max(minimum, steppedValue));
    const serializedValue = String(Number(value.toFixed(6)));
    if (drag.input.value === serializedValue) return;

    drag.moved = true;
    drag.input.value = serializedValue;
    drag.input.dispatchEvent(new Event('input', { bubbles: true }));
    this.syncKnobFocus(drag.input);
  }

  private endKnobDrag(event: PointerEvent): void {
    const drag = this.knobDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (drag.input.hasPointerCapture(event.pointerId)) drag.input.releasePointerCapture(event.pointerId);
    if (drag.moved) drag.input.dispatchEvent(new Event('change', { bubbles: true }));
    this.knobDrag = null;
    this.hideKnobFocus();
  }

  private ccLearnTargetForOutputKnob(input: HTMLInputElement): CcLearnTarget | null {
    const bus = input.dataset.outputLevel;
    if (isOutputBus(bus)) return { kind: 'output-volume', bus };
    if (input.matches('[data-metronome-output-volume]')) return { kind: 'metronome-volume' };
    return null;
  }

  private showKnobFocus(input: HTMLInputElement): void {
    const overlay = this.root.querySelector<HTMLElement>('[data-knob-focus]');
    const knob = input.closest<HTMLElement>('.module-envelope-knob, .module-effect-knob, .player-output-knob');
    if (!overlay || !knob) return;
    const label = knob.querySelector<HTMLElement>(':scope > span:not([class$="__face"])');
    const accent = getComputedStyle(knob).getPropertyValue('--knob-accent').trim();
    if (accent) overlay.style.setProperty('--knob-accent', accent);
    overlay.querySelector<HTMLElement>('[data-knob-focus-label]')!.textContent = label?.textContent?.trim() || input.ariaLabel || '';
    overlay.classList.add('is-visible');
    this.syncKnobFocus(input);
  }

  private syncKnobFocus(input: HTMLInputElement): void {
    const overlay = this.root.querySelector<HTMLElement>('[data-knob-focus]');
    const knob = input.closest<HTMLElement>('.module-envelope-knob, .module-effect-knob, .player-output-knob');
    if (!overlay || !knob) return;
    overlay.style.setProperty('--knob-angle', getComputedStyle(knob).getPropertyValue('--knob-angle'));
    overlay.style.setProperty('--knob-progress', getComputedStyle(knob).getPropertyValue('--knob-progress'));
    const sourceOutput = knob.querySelector<HTMLOutputElement>('output');
    overlay.querySelector<HTMLOutputElement>('[data-knob-focus-value]')!.value = sourceOutput?.value || input.getAttribute('aria-valuetext') || input.value;
  }

  private hideKnobFocus(): void {
    this.root.querySelector<HTMLElement>('[data-knob-focus]')?.classList.remove('is-visible');
  }

  private ccLearnTargetForKnob(input: HTMLInputElement, moduleNumber: number): CcLearnTarget | null {
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
    if (moduleNumber === 6 && patternKind === 'arpeggiator' && patternParameter) {
      return {
        kind: 'module-control',
        moduleNumber,
        control: `arpeggiator:${patternParameter}`,
        label: input.ariaLabel || patternParameter,
      };
    }
    if (moduleNumber === 7 && patternKind === 'sequencer' && patternParameter) {
      const stepIndex = input.dataset.sequencerStepIndex;
      return {
        kind: 'module-control',
        moduleNumber,
        control: patternParameter === 'swing'
          ? 'sequencer:swing'
          : `sequencer:${stepIndex ?? '0'}:${patternParameter}`,
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

    if (moduleNumber === 8 && control.startsWith('synth:')) {
      const parameter = control.slice('synth:'.length);
      const ranges: Record<string, readonly [number, number]> = {
        oscillatorMix: [0, 100],
        detuneCents: [-100, 100],
        attackMs: [0, 15_000],
        holdMs: [0, 15_000],
        decayMs: [0, 25_000],
        sustain: [0, 100],
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
      const value = parameter === 'filterCutoffHz'
        ? 20 * (1_000 ** progress)
        : range[0] + (range[1] - range[0]) * progress;
      (synth as unknown as Record<string, number | string | boolean>)[parameter] = value;
      moduleState.settings.synth = synth;
      this.markPlayerStateChanged();
      return;
    }

    if (moduleNumber === 6 && control.startsWith('arpeggiator:')) {
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

    if (moduleNumber === 7 && control.startsWith('sequencer:')) {
      const settings = readSequencerSettings(moduleState.settings.sequencer);
      if (control === 'sequencer:swing') {
        settings.swing = 75 * progress;
      } else {
        const match = /^sequencer:([0-9]|1[0-5]):(semitone|velocity|gate)$/.exec(control);
        if (!match) return;
        const index = Number(match[1]);
        const parameter = match[2];
        const step = settings.steps[index];
        if (!step) return;
        if (parameter === 'semitone') step.semitone = Math.round(-24 + 48 * progress);
        else if (parameter === 'velocity') step.velocity = Math.round(1 + 126 * progress);
        else step.gate = 10 + 90 * progress;
      }
      moduleState.settings.sequencer = settings;
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
    };
    const range = ranges[control];
    if (!range) return;
    const value = range[0] + (range[1] - range[0]) * progress;
    const settings = effectKind === 'compressor'
      ? readModuleCompressorSettings(moduleState.settings.compressor)
      : effectKind === 'reverb'
        ? readModuleReverbSettings(moduleState.settings.reverb)
        : readModuleDelaySettings(moduleState.settings.delay);
    (settings as unknown as Record<string, number | string | boolean>)[effectControl] = value;
    moduleState.settings[effectKind] = settings;
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

  private updateModuleEffectControl(modal: HTMLElement, input: HTMLInputElement, moduleNumber: number): void {
    const kind = input.dataset.moduleEffectKind;
    const key = input.dataset.moduleEffectControl;
    const value = Number(input.value);
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState || !isModuleEffectKind(kind) || !key || !Number.isFinite(value)) return;

    const settings = kind === 'compressor'
      ? readModuleCompressorSettings(moduleState.settings.compressor)
      : kind === 'reverb'
        ? readModuleReverbSettings(moduleState.settings.reverb)
        : readModuleDelaySettings(moduleState.settings.delay);
    if (!(key in settings)) return;
    (settings as unknown as Record<string, number | string>)[key] = value;
    moduleState.settings[kind] = settings;

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
    if (kind === 'arpeggiator' || kind === 'sequencer') {
      const settings = kind === 'arpeggiator'
        ? readArpeggiatorSettings(moduleState.settings.arpeggiator)
        : readSequencerSettings(moduleState.settings.sequencer);
      settings.enabled = !settings.enabled;
      moduleState.settings[kind] = settings;
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
    const settings = kind === 'compressor'
      ? readModuleCompressorSettings(moduleState.settings.compressor)
      : kind === 'reverb'
        ? readModuleReverbSettings(moduleState.settings.reverb)
        : readModuleDelaySettings(moduleState.settings.delay);
    settings.enabled = !settings.enabled;
    moduleState.settings[kind] = settings;
    button.classList.toggle('is-on', settings.enabled);
    button.classList.toggle('is-off', !settings.enabled);
    button.textContent = settings.enabled ? 'ON' : 'OFF';
    button.setAttribute('aria-pressed', String(settings.enabled));
    button.closest<HTMLElement>('[data-module-effect-editor]')?.classList.toggle('is-disabled', !settings.enabled);
    this.markPlayerStateChanged();
  }

  private showProcessorResetConfirmation(
    modal: HTMLElement,
    moduleNumber: number,
    processor: 'eq' | ModuleEffectKind,
  ): void {
    if (modal.querySelector('[data-processor-reset-confirmation]')) return;
    const label = processor === 'eq' ? 'EQ'
      : processor === 'compressor' ? 'Compressor'
        : processor === 'reverb' ? 'Reverb' : 'Delay';
    const confirmation = document.createElement('div');
    confirmation.className = 'module-processor-reset-confirmation';
    confirmation.dataset.processorResetConfirmation = '';
    confirmation.setAttribute('role', 'alertdialog');
    confirmation.setAttribute('aria-modal', 'true');
    confirmation.setAttribute('aria-label', `Confirmar reset de ${label} do módulo ${moduleNumber}`);
    confirmation.innerHTML = `
      <div>
        <span>${label}</span>
        <strong>Resetar ${label}?</strong>
        <p>${processor === 'eq' ? 'Todas as cinco bandas voltarão para flat.' : 'Todos os parâmetros voltarão aos valores iniciais e o processador será desligado.'}</p>
        <footer>
          <button type="button" data-processor-reset-choice="cancel">Cancelar</button>
          <button class="is-danger" type="button" data-processor-reset-choice="confirm">Resetar</button>
        </footer>
      </div>
    `;
    modal.querySelector('.player-modal__surface')?.append(confirmation);
    confirmation.querySelector<HTMLButtonElement>('[data-processor-reset-choice="cancel"]')?.focus();
  }

  private confirmProcessorReset(moduleNumber: number, processor: 'eq' | ModuleEffectKind): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return;
    if (processor === 'eq') moduleState.settings.eqBands = readModuleEqBands(undefined);
    else if (processor === 'compressor') moduleState.settings.compressor = readModuleCompressorSettings(undefined);
    else if (processor === 'reverb') moduleState.settings.reverb = readModuleReverbSettings(undefined);
    else moduleState.settings.delay = readModuleDelaySettings(undefined);
    const trigger = this.modalTrigger ?? this.root;
    this.markPlayerStateChanged();
    const modalKind: ModalKind = processor === 'eq' ? 'module-eq'
      : processor === 'compressor' ? 'module-compressor'
        : processor === 'reverb' ? 'module-reverb' : 'module-delay';
    this.openModal(modalKind, moduleNumber, trigger, true);
    this.setStatus(`${processor === 'eq' ? 'EQ resetado para flat' : `${processor} resetado`} no módulo ${moduleNumber}.`);
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
    if (settings.sync) {
      settings.milliseconds = delayMillisecondsForBpm(this.metronome.getBpm(), settings.division);
      moduleState.settings.delay = settings;
      this.renderModuleDelaySyncState(modal, moduleNumber);
    }
    this.markPlayerStateChanged();
  }

  private toggleModuleDelaySync(modal: HTMLElement, button: HTMLButtonElement, moduleNumber: number): void {
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!moduleState) return;
    const settings = readModuleDelaySettings(moduleState.settings.delay);
    settings.sync = !settings.sync;
    if (settings.sync) {
      settings.milliseconds = delayMillisecondsForBpm(this.metronome.getBpm(), settings.division);
    }
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
      ? delayMillisecondsForBpm(bpm, settings.division)
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
    this.midiInput.setSelectedInputIds(this.selectedMidiInputIds);
  }

  private applyNativeAudioOutput(): Promise<void> {
    if (!hookKeysNative.isAvailable()) return Promise.resolve();
    this.nativeAudioOutputSync = this.nativeAudioOutputSync.then(async () => {
      if (this.selectedAudioDeviceId && this.audioDevices.length === 0) {
        this.audioDevices = await this.audioOutput.listDevices();
      }
      const device = this.audioDevices.find(({ id }) => id === this.selectedAudioDeviceId);
      if (this.selectedAudioDeviceId && !device) this.selectedAudioDeviceId = '';
      const restarted = await hookKeysNative.setAudioOutputDevice(
        device?.id ?? '',
        device?.channels ?? 2,
        this.bufferSize,
      );
      if (!restarted || !this.mounted) return;
      this.nativeLoadedTimbres.fill(null);
      this.applySelectedMidiInputs();
      this.metronome.syncNativeState();
      this.syncNativeEngine();
    }).catch(() => {
      this.nativeLoadedTimbres.fill(null);
      this.metronome.syncNativeState();
      this.syncNativeEngine();
      this.setStatus('Não foi possível aplicar a saída de áudio selecionada.');
    });
    return this.nativeAudioOutputSync;
  }

  private activeAudioChannelCount(): number {
    return this.audioDevices.find(({ id }) => id === this.selectedAudioDeviceId)?.channels ?? 2;
  }

  private enhanceAppSelects(modal: HTMLElement): void {
    for (const select of modal.querySelectorAll<HTMLSelectElement>('select[data-setting]')) {
      if (select.dataset.appSelectEnhanced === 'true') continue;
      select.dataset.appSelectEnhanced = 'true';
      select.classList.add('app-select__native');
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
    const channels = this.activeAudioChannelCount();
    for (const bus of ['timbres', 'pads', 'effects'] as const) {
      if (!isAudioBusRoute(this.audioRouting[bus], channels)) this.audioRouting[bus] = 'stereo:0';
    }
  }

  private async refreshAudioDeviceOptions(modal: HTMLElement): Promise<void> {
    try {
      this.audioDevices = await this.audioOutput.listDevices();
      if (!modal.isConnected) return;
      if (this.selectedAudioDeviceId && !this.audioDevices.some(({ id }) => id === this.selectedAudioDeviceId)) {
        this.selectedAudioDeviceId = '';
      }
      this.normalizeAudioRoutes();
      const select = modal.querySelector<HTMLSelectElement>('[data-setting="audio-device"]');
      if (select) {
        select.innerHTML = `<option value="">Padrão</option>${this.audioDevices.map((device) => `<option value="${escapeMarkup(device.id)}">${escapeMarkup(device.name)} · ${device.channels} canais</option>`).join('')}`;
        select.value = this.selectedAudioDeviceId;
        this.syncAppSelect(select);
      }
      this.refreshAudioRoutingSelects(modal);
    } catch {
      // Mantém a saída padrão se o ambiente não permitir enumerar dispositivos.
    }
  }

  private refreshAudioRoutingSelects(modal: HTMLElement | null): void {
    if (!modal) return;
    const channels = this.activeAudioChannelCount();
    for (const select of modal.querySelectorAll<HTMLSelectElement>('[data-setting="audio-route"]')) {
      const bus = select.dataset.audioBus;
      if (bus !== 'timbres' && bus !== 'pads' && bus !== 'effects') continue;
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
  }

  private commitPresetName(modal: HTMLElement, presetNumber: number): void {
    const input = modal.querySelector<HTMLInputElement>('[data-preset-name-input]');
    const preset = this.bankStates.get(this.activeBank)?.presets[presetNumber - 1];
    if (!input || !preset) return;
    preset.name = input.value.trim().slice(0, 20) || 'Preset';
    this.restoreActivePresetState();
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
    if (!input || !editor || !effect) return;
    const requestedColorIndex = Number.parseInt(editor.dataset.effectColorIndex ?? '', 10);
    effect.name = input.value.trim().slice(0, 12) || `Efeito ${effectNumber}`;
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
        true,
        this.installedFixedSoundIds,
      );
      if (category === 'user') void this.renderUserSoundfonts(modal);
    }
  }

  private selectFixedSound(moduleNumber: number, soundId: string): void {
    const sound = this.soundCatalog.get(soundId);
    const moduleState = this.getActivePresetState()?.modules[moduleNumber - 1];
    if (!sound || !moduleState || !this.installedFixedSoundIds.has(soundId)) return;
    moduleState.category = sound.category;
    moduleState.timbreId = `fixed:${sound.id}`;
    moduleState.timbreName = sound.name;
    moduleState.timbreColor = sound.color;
    this.restoreActivePresetState();
    this.markPlayerStateChanged();
    this.closeModal();
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

  private async downloadSelectedSound(modal: HTMLElement, moduleNumber: number, button: HTMLButtonElement): Promise<void> {
    const sound = this.selectedCatalogSoundId ? this.soundCatalog.get(this.selectedCatalogSoundId) : null;
    if (!sound) return;
    if (!(await hasStorageFor(sound.byteSize))) {
      this.updateSoundDownloadMessage('Armazenamento insuficiente para baixar este timbre.');
      return;
    }
    button.disabled = true;
    this.soundDownloadAbort?.abort();
    this.soundDownloadAbort = new AbortController();
    try {
      await this.soundLibraryEngine.install(sound.id, (progress) => {
        if (!modal.isConnected) return;
        const label = progress.percentage === null
          ? `${formatBytes(progress.receivedBytes)} baixados`
          : `${progress.percentage}%`;
        this.updateSoundDownloadProgress(progress.percentage ?? 0, label);
      }, this.soundDownloadAbort.signal);
      this.installedFixedSoundIds.add(sound.id);
      this.updateSoundDownloadProgress(100, 'Download concluído');
      this.selectFixedSound(moduleNumber, sound.id);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        this.updateSoundDownloadMessage('Não foi possível baixar este timbre. Confira a conexão e tente novamente.');
      }
    } finally {
      this.soundDownloadAbort = null;
      if (button.isConnected) button.disabled = false;
    }
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

    this.eqBandDrag = null;
    this.knobDrag = null;
    if (this.currentModalKind === 'sound-download' || this.currentModalKind === 'performance-download' || this.currentModalKind === 'backup-download') {
      this.soundLibraryEngine.preview.stop();
      this.soundDownloadAbort?.abort();
      this.soundDownloadAbort = null;
    }

    if (this.modal.classList.contains('player-modal--cc-learn')) this.pendingCcLearn = null;
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
    this.root.querySelector<HTMLElement>('.player-screen')?.removeAttribute('aria-hidden');

    if (restoreFocus && this.modalTrigger?.isConnected) this.modalTrigger.focus();
    this.modalTrigger = null;
    if (!preserveHistory) this.modalHistory = [];
  }

  private onModalKeydown(event: KeyboardEvent): void {
    if (!this.modal) return;

    if (event.key === 'Escape') {
      event.preventDefault();
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
      if (!saved || this.stateChangedBeforeRestore) return;
      this.applySavedPlayerState(saved);
      this.restoreActivePresetState();
      this.renderActivePadBank();
      this.renderActiveEffectBank();
      this.updateVisibleView();
      void this.applyNativeAudioOutput();
    } catch {
      this.setStatus('Suas configurações serão sincronizadas quando houver conexão.');
    }
  }

  private markPlayerStateChanged(): void {
    this.stateChangedBeforeRestore = true;
    this.playerStateDirty = true;
    this.saveActivePresetState();
    if (this.playerStateSaveTimer !== null) window.clearTimeout(this.playerStateSaveTimer);
    this.playerStateSaveTimer = window.setTimeout(() => this.flushPlayerStateSave(), 180);
    this.scheduleNativeEngineSync();
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

  private scheduleNativeEngineSync(): void {
    if (!hookKeysNative.isAvailable()) return;
    if (this.nativeSyncTimer !== null) window.clearTimeout(this.nativeSyncTimer);
    this.nativeSyncTimer = window.setTimeout(() => {
      this.nativeSyncTimer = null;
      this.syncNativeEngine();
    }, 48);
  }

  private syncNativeEngine(): Promise<void> {
    if (!hookKeysNative.isAvailable()) return Promise.resolve();
    const preset = this.getActivePresetState();
    const moduleConfigurationTasks: Promise<void>[] = [];
    for (let moduleIndex = 0; moduleIndex < MODULE_COUNT; moduleIndex += 1) {
      const moduleState = preset?.modules[moduleIndex];
      const selectedSlot = moduleState?.midiInputId
        ? this.selectedMidiInputIds.indexOf(moduleState.midiInputId)
        : -1;
      const outputRoute = isAudioBusRoute(moduleState?.settings.outputRoute, this.activeAudioChannelCount())
        ? moduleState.settings.outputRoute as AudioBusRoute
        : 'stereo:0';
      const nativeOutputRoute = parseAudioBusRoute(outputRoute);
      const velocityCurve = readVelocityCurveSettings(moduleState?.settings.velocityCurve);
      const synthSettings = moduleIndex === 7 ? readSynthSettings(moduleState?.settings.synth) : null;
      const arpeggiatorSettings = moduleIndex === 5
        ? readArpeggiatorSettings(moduleState?.settings.arpeggiator) : null;
      const sequencerSettings = moduleIndex === 6
        ? readSequencerSettings(moduleState?.settings.sequencer) : null;
      const patternInputSlot = arpeggiatorSettings?.enabled
        ? ARPEGGIATOR_ENGINE_INPUT
        : sequencerSettings?.enabled ? SEQUENCER_ENGINE_INPUT : null;
      moduleConfigurationTasks.push(hookKeysNative.configureModule({
        moduleIndex,
        enabled: Boolean(moduleState?.enabled && (moduleIndex === 7 || moduleState.timbreId)),
        inputSlot: patternInputSlot ?? (selectedSlot >= 0 ? selectedSlot : 3),
        lowNote: moduleState?.lowNote ?? 0,
        highNote: moduleState?.highNote ?? 127,
        octave: moduleState?.octaveShift ?? 0,
        sustain: moduleState?.sustainInputEnabled ?? true,
        modulation: moduleState?.modulationInputEnabled ?? true,
        volumeDb: moduleState?.volumeDb ?? 0,
        // O próprio sintetizador administra Mono/Poly. O roteador precisa
        // encaminhar todas as notas para preservar prioridade e legato no Mono.
        polyphony: moduleIndex < 5 && moduleState?.settings.voiceMode === 'mono'
          ? 1
          : Math.round(Math.min(128, Math.max(1, Number(moduleState?.settings.polyphony) || 64))),
        velocityCurve0: velocityCurve.points[0],
        velocityCurve1: velocityCurve.points[1],
        velocityCurve2: velocityCurve.points[2],
        velocityCurve3: velocityCurve.points[3],
        velocityCurve4: velocityCurve.points[4],
        outputChannelStart: nativeOutputRoute.start,
        outputChannelCount: nativeOutputRoute.count,
      }));
      if (moduleState) {
        if (moduleIndex === 7 && synthSettings) {
          void hookKeysNative.configureSynth({
            oscillator1: synthOscillatorIndex(synthSettings.oscillator1),
            oscillator2: synthOscillatorIndex(synthSettings.oscillator2),
            voiceMode: synthSettings.voiceMode === 'poly' ? 0 : synthSettings.legato ? 2 : 1,
            lfoTarget: synthLfoTargetIndex(synthSettings.lfoTarget),
            oscillatorMix: synthSettings.oscillatorMix / 100,
            detuneCents: synthSettings.detuneCents,
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
            glideMs: synthSettings.glideMs,
          });
        } else {
          void hookKeysNative.configureModuleEnvelope({
            moduleIndex,
            attackMs: optionalBoundedNumber(moduleState.settings.attackMs, 0, 15_000),
            holdMs: optionalBoundedNumber(moduleState.settings.holdMs, 0, 15_000),
            decayMs: optionalBoundedNumber(moduleState.settings.decayMs, 0, 25_000),
            releaseMs: optionalBoundedNumber(moduleState.settings.releaseMs, 0, 25_000),
          });
        }
        const eqBands = readModuleEqBands(moduleState.settings.eqBands);
        const eqEnabled = moduleState.settings.eqEnabled !== false;
        const compressor = readModuleCompressorSettings(moduleState.settings.compressor);
        const delay = readModuleDelaySettings(moduleState.settings.delay);
        const reverb = readModuleReverbSettings(moduleState.settings.reverb);
        void hookKeysNative.configureModuleEffects({
          moduleIndex,
          cutoffHz: readModuleCutoffFrequency(moduleState.settings.cutoffHz),
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
          reverbSize: reverb.size / 100,
          reverbMix: reverb.enabled ? reverb.mix / 100 : 0,
        });
      }
    }
    void hookKeysNative.setTempo(this.metronome.getBpm());
    void hookKeysNative.setOutputGain(this.outputLevels.master, this.outputEnabled.master);
    void hookKeysNative.setCompatibilityMode(this.compatibilityMode);
    this.nativeSoundfontSync = this.nativeSoundfontSync
      .then(async () => {
        // A selected SF2 must never become available before its module is
        // enabled/routed in the native engine.
        await Promise.all(moduleConfigurationTasks);
        await this.syncNativeSoundfonts();
      })
      .catch(() => undefined);
    return this.nativeSoundfontSync;
  }

  private async syncNativeSoundfonts(): Promise<void> {
    const preset = this.getActivePresetState();
    for (let moduleIndex = 0; moduleIndex < MODULE_COUNT; moduleIndex += 1) {
      if (moduleIndex === 7) continue;
      const timbreId = preset?.modules[moduleIndex]?.timbreId ?? null;
      if (!timbreId || timbreId === this.nativeLoadedTimbres[moduleIndex]) continue;
      const blob = timbreId.startsWith('user:')
        ? await this.soundLibrary.getUserFile(timbreId.slice(5))
        : (await this.soundLibrary.getFixed(timbreId.replace(/^fixed:/, '')))?.file ?? null;
      if (!blob) continue;
      try {
        await hookKeysNative.loadSoundFont(moduleIndex, blob);
        this.nativeLoadedTimbres[moduleIndex] = timbreId;
      } catch {
        this.setStatus(`Não foi possível carregar o timbre do módulo ${moduleIndex + 1}.`);
      }
    }
  }

  private createSavedPlayerState(): object {
    return {
      version: 1,
      velocityCurveDefault: 'soft-v2',
      activeBank: this.activeBank,
      activePadBank: this.activePadBank,
      activeEffectBank: this.activeEffectBank,
      bufferSize: this.bufferSize,
      compatibilityMode: this.compatibilityMode,
      bottomView: this.bottomView,
      keyboardMidiSlot: this.keyboardMidiSlot,
      keyboardStyle: this.keyboardStyle,
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
      padBankSelections: Object.fromEntries(this.padBankSelections),
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
    };
  }

  private applySavedPlayerState(value: unknown): void {
    if (!isRecord(value) || value.version !== 1) return;
    const migrateLegacyVelocityDefault = value.velocityCurveDefault !== 'soft-v2';
    const savedMidiInputIds = Array.isArray(value.midiInputIds) ? value.midiInputIds : [];
    this.selectedMidiInputIds = Array.from({ length: 3 }, (_, index) => {
      const deviceId = savedMidiInputIds[index];
      return typeof deviceId === 'string' && deviceId.length > 0 ? deviceId.slice(0, 300) : null;
    });
    const savedBufferSize = Number(value.bufferSize);
    if (isBufferSize(savedBufferSize)) this.bufferSize = savedBufferSize;
    this.selectedAudioDeviceId = asString(value.audioDeviceId).slice(0, 500);
    const savedAudioRouting = isRecord(value.audioRouting) ? value.audioRouting : {};
    this.audioRouting = {
      timbres: isAudioBusRoute(savedAudioRouting.timbres) ? savedAudioRouting.timbres : 'stereo:0',
      pads: isAudioBusRoute(savedAudioRouting.pads) ? savedAudioRouting.pads : 'stereo:0',
      effects: isAudioBusRoute(savedAudioRouting.effects) ? savedAudioRouting.effects : 'stereo:0',
    };
    this.compatibilityMode = value.compatibilityMode === true;
    this.midiInput.setCompatibilityMode(this.compatibilityMode);
    this.bottomView = !this.desktopRuntime && value.bottomView === 'keyboard' ? 'keyboard' : 'presets';
    const savedKeyboardMidiSlot = Number(value.keyboardMidiSlot);
    this.keyboardMidiSlot = savedKeyboardMidiSlot === 2 || savedKeyboardMidiSlot === 3 ? savedKeyboardMidiSlot : 1;
    const savedKeyboardStyle = asString(value.keyboardStyle);
    this.keyboardStyle = savedKeyboardStyle === 'black' || savedKeyboardStyle === 'neon' ? savedKeyboardStyle : 'standard';
    this.performanceKeyboard?.setStyle(this.keyboardStyle);
    const savedOutputLevels = isRecord(value.outputLevels) ? value.outputLevels : {};
    this.outputLevels = {
      music: boundedNumber(savedOutputLevels.music, -60, 6, DEFAULT_OUTPUT_LEVELS.music),
      pads: boundedNumber(savedOutputLevels.pads, -60, 6, DEFAULT_OUTPUT_LEVELS.pads),
      effects: boundedNumber(savedOutputLevels.effects, -60, 6, DEFAULT_OUTPUT_LEVELS.effects),
      master: boundedNumber(savedOutputLevels.master, -60, 6, DEFAULT_OUTPUT_LEVELS.master),
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
      boundedNumber(savedMetronome.volume, 0, 1, 0.7),
      (savedClickSound === 2 || savedClickSound === 3 ? savedClickSound : 1) as MetronomeClickSound,
      savedMetronome.accentEnabled === true,
      savedMetronome.doubleTimeEnabled === true,
      boundedNumber(savedMetronome.timeSignatureNumerator, 1, 16, 4),
      boundedNumber(savedMetronome.timeSignatureDenominator, 2, 16, 4),
    );
    this.ccMappings.clear();
    const savedCcMappings = isRecord(value.ccMappings) ? value.ccMappings : {};
    for (const [targetKey, controllerValue] of Object.entries(savedCcMappings)) {
      const controller = Number(controllerValue);
      if (isCcMappingKey(targetKey) && Number.isInteger(controller) && controller >= 0 && controller <= 127) {
        const oldPresetMapping = /^preset:[AB]:([1-9]|1[0-6])$/.exec(targetKey);
        const normalizedKey = oldPresetMapping ? `preset:${oldPresetMapping[1]}` : targetKey;
        if (!this.ccMappings.has(normalizedKey)) this.ccMappings.set(normalizedKey, controller);
      }
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
            name: typeof source.name === 'string'
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
      const selectedPreset = sourceBank.selectedPreset;
      defaults.selectedPreset = typeof selectedPreset === 'number' && Number.isInteger(selectedPreset)
        ? Math.min(PRESET_COUNT, Math.max(1, selectedPreset))
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
              volumeDb: boundedNumber(source.volumeDb, -60, 6, module.volumeDb),
              settings: restoredSettings,
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

  private setStatus(message: string): void {
    const status = this.root.querySelector<HTMLElement>('.player-screen__status');
    if (status) status.textContent = message;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isModuleEnvelopeParameter(value: string | undefined): value is ModuleEnvelopeParameter {
  return value !== undefined && Object.prototype.hasOwnProperty.call(MODULE_ENVELOPE_LIMITS, value);
}

function isModuleEffectKind(value: string | undefined): value is ModuleEffectKind {
  return value === 'compressor' || value === 'reverb' || value === 'delay';
}

function isArpeggiatorModeValue(value: string | undefined): value is ArpeggiatorMode {
  return value !== undefined && (ARPEGGIATOR_MODES as readonly string[]).includes(value);
}

function isPatternDivisionValue(value: string | undefined): value is PatternDivision {
  return value !== undefined && (PATTERN_DIVISIONS as readonly string[]).includes(value);
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
  return 'Sem timbre';
}

function createDefaultModuleSettings(): Record<string, unknown> {
  return {
    ...MODULE_ENVELOPE_DEFAULTS,
    cutoffHz: 20_000,
    eqEnabled: true,
    polyphony: 64,
    voiceMode: 'poly',
    synth: { ...DEFAULT_SYNTH_SETTINGS },
    arpeggiator: { ...DEFAULT_ARPEGGIATOR_SETTINGS },
    sequencer: {
      ...DEFAULT_SEQUENCER_SETTINGS,
      steps: DEFAULT_SEQUENCER_SETTINGS.steps.map((step) => ({ ...step })),
    },
    velocityCurve: {
      ...DEFAULT_VELOCITY_CURVE,
      points: [...DEFAULT_VELOCITY_CURVE.points],
      userPoints: [...DEFAULT_VELOCITY_CURVE.userPoints],
    },
  };
}

function moduleDisplayName(moduleNumber: number): string {
  if (moduleNumber === 6) return 'Arpeggiator';
  if (moduleNumber === 7) return 'Sequencer';
  if (moduleNumber === 8) return 'Synth';
  return String(moduleNumber);
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

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes >= 1024 ** 3) return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
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

async function resizeProfilePhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('invalid_image');
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('invalid_image'));
      element.src = sourceUrl;
    });
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    if (!side) throw new Error('invalid_image');
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas_unavailable');
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      256,
      256,
    );
    return canvas.toDataURL('image/jpeg', 0.78);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
