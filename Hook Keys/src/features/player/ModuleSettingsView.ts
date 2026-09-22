import type { MidiInputDevice } from '../midi/MidiInputService';
import {
  createModuleChorusMarkup,
  createModuleCompressorMarkup,
  createModuleDelayMarkup,
  createModuleReverbMarkup,
  createModuleRotaryMarkup,
  readModuleChorusSettings,
  readModuleCompressorSettings,
  readModuleCutoffEnvelopeSettings,
  readModuleDelaySettings,
  readModuleReverbSettings,
  readModuleRotarySettings,
  readCutoffFilterType,
  type ModuleProcessorReplacement,
} from './ModuleEffectsView';
import { createArpeggiatorMarkup, readArpeggiatorSettings } from './PatternModulesView';
import { createTranceGateMarkup, readTranceGateSettings } from './TranceGateView';
import { createAudioRouteOptions, type ModuleOutputRoute } from '../audio/AudioOutputService';
import { createVelocityCardMarkup, readVelocityLimit } from './VelocityCurveView';
import { createParameterKnobMarkup } from './ParameterKnobView';
import { createGlideCardMarkup } from './GlideView';

export type ModuleEnvelopeParameter = 'attackMs' | 'releaseMs' | 'holdMs' | 'decayMs';

export const MODULE_ENVELOPE_LIMITS: Readonly<Record<ModuleEnvelopeParameter, number>> = {
  attackMs: 15_000,
  releaseMs: 25_000,
  holdMs: 15_000,
  decayMs: 25_000,
};

export const MODULE_ENVELOPE_DEFAULTS: Readonly<Record<ModuleEnvelopeParameter, number>> = {
  attackMs: 0,
  releaseMs: 300,
  holdMs: MODULE_ENVELOPE_LIMITS.holdMs,
  decayMs: MODULE_ENVELOPE_LIMITS.decayMs,
};

export type ModuleModulationMode = 'user' | 'rotary' | 'lfo' | 'tremolo' | 'pan';

export function readModuleModulationMode(settings: Readonly<Record<string, unknown>>): ModuleModulationMode {
  if (settings.modulationMode === 'user') return 'user';
  if (settings.modulationMode === 'rotary') return 'rotary';
  if (settings.modulationMode === 'tremolo') return 'tremolo';
  if (settings.modulationMode === 'pan') return 'pan';
  return 'lfo';
}

// O motor recebe o modo como número: 0 User, 1 LFO de pitch, 2 Tremolo.
export function moduleModulationEngineMode(mode: ModuleModulationMode): number {
  if (mode === 'user' || mode === 'rotary') return 0;
  if (mode === 'tremolo') return 2;
  return mode === 'pan' ? 3 : 1;
}

// Rate padrão do LFO do card Mod, o mesmo do LFO do Synth.
export const DEFAULT_MODULE_MODULATION_RATE_HZ = 6.85;

export function readModuleModulationRate(settings: Readonly<Record<string, unknown>>): number {
  const value = Number(settings.modulationRateHz);
  return Number.isFinite(value) ? Math.min(20, Math.max(0.1, value)) : DEFAULT_MODULE_MODULATION_RATE_HZ;
}

export type ModuleModulationIntensityMode = 'tremolo' | 'pan';

export function readModuleModulationIntensity(
  settings: Readonly<Record<string, unknown>>,
  mode: ModuleModulationIntensityMode,
): number {
  const value = Number(settings[mode === 'pan' ? 'panIntensity' : 'tremoloIntensity']);
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 100;
}

function createModuleModulationIntensityControl(
  settings: Readonly<Record<string, unknown>>,
  mode: ModuleModulationIntensityMode,
): string {
  const value = readModuleModulationIntensity(settings, mode);
  const label = mode === 'pan' ? 'Intensidade do Pan' : 'Intensidade do Tremolo';
  const accent = mode === 'pan' ? '#25b9ff' : '#ff4d67';
  return `
    <label class="module-effect-knob module-mod-card__intensity-control"
      data-module-modulation-intensity-control="${mode}"
      style="--knob-accent:${accent};--knob-angle:${-135 + value * 2.7}deg;--knob-progress:${value / 100}"
      hidden>
      <span>${label}</span>
      <input type="range" min="0" max="100" step="1" value="${value}"
        data-module-modulation-intensity="${mode}" aria-label="${label}"
        aria-valuetext="${Math.round(value)}%">
      <output>${Math.round(value)}%</output>
    </label>
  `;
}

// Synth: LFO aciona o LFO do editor do Synth e User deixa a roda sem efeito,
// por isso o card do Synth não tem Rate próprio.
export function createModuleModulationCardMarkup(
  settings: Readonly<Record<string, unknown>>,
  owner: 'sf2' | 'synth' | 'organ' = 'sf2',
): string {
  const rawMode = readModuleModulationMode(settings);
  // O Synth não tem Tremolo próprio da roda; lá o card fica só com User/LFO.
  // O Synth não tem Tremolo nem Pan próprios da roda.
  const mode = owner === 'synth' && rawMode !== 'user' ? 'lfo' : rawMode;
  const rate = readModuleModulationRate(settings);
  const modes = owner === 'synth'
    ? (['user', 'lfo'] as const)
    : owner === 'organ'
      ? (['rotary', 'tremolo', 'pan'] as const)
      : (['user', 'lfo', 'tremolo', 'pan'] as const);
  const labels: Record<ModuleModulationMode, string> = {
    user: 'User', rotary: 'Rotary', lfo: 'LFO', tremolo: 'Tremolo', pan: 'Pan',
  };
  return `
    <article class="module-mod-card${owner === 'synth' ? ' module-mod-card--synth' : ''}" data-module-mod-card>
      <header>
        <strong>Mod</strong>
      </header>
      <div role="group" aria-label="Modo da roda Mod" data-module-modulation-modes="${owner === 'organ' ? 4 : modes.length}">
        ${modes.map((value, index) => `
          <button type="button" data-module-modulation-mode="${value}"
            class="${mode === value ? 'is-selected' : ''}"
            aria-pressed="${mode === value}">${owner === 'organ' && value === 'rotary' ? 'M-RT' : labels[value]}</button>
          ${owner === 'organ' && index === 0 ? `<button type="button" data-module-rotary-toggle
            class="${readModuleRotarySettings(settings.rotary).speed === 'fast' ? 'is-selected' : ''}"
            aria-pressed="${readModuleRotarySettings(settings.rotary).speed === 'fast'}"
            aria-label="Alternar Rotary entre Slow e Fast">R-TG</button>` : ''}
        `).join('')}
      </div>
      ${owner === 'synth' ? '' : `<label class="module-mod-card__rate">
        ${createParameterKnobMarkup((rate - 0.1) / 19.9, `
          <input type="range" min="0.1" max="20" step="0.01" value="${rate}"
            data-module-modulation-rate aria-label="Rate do LFO"
            aria-valuetext="${rate.toFixed(2)} Hz"${mode === 'user' || mode === 'rotary' ? ' disabled' : ''}>
        `)}
        <output data-module-modulation-rate-value>${rate.toFixed(2)} Hz</output>
      </label>`}
      ${owner === 'synth' ? '' : `
        ${createModuleModulationIntensityControl(settings, 'tremolo')}
        ${createModuleModulationIntensityControl(settings, 'pan')}
      `}
    </article>
  `;
}

export const MODULE_SUSTAIN_MIN_DB = -60;

export function readModuleSustainDb(settings: Readonly<Record<string, unknown>>): number {
  const value = Number(settings.sustainDb);
  if (!Number.isFinite(value)) return 0;
  return Math.min(0, Math.max(MODULE_SUSTAIN_MIN_DB, value));
}

export function formatModuleSustainDb(value: number): string {
  return value <= MODULE_SUSTAIN_MIN_DB ? '-inf' : `${value.toFixed(1)} dB`;
}

function createSustainControl(settings: Readonly<Record<string, unknown>>): string {
  const sustain = readModuleSustainDb(settings);
  const progress = (sustain - MODULE_SUSTAIN_MIN_DB) / -MODULE_SUSTAIN_MIN_DB;
  return `
    <article class="module-envelope-control">
      <h3>Sustain</h3>
      ${createParameterKnobMarkup(progress, `
        <input type="range" min="${MODULE_SUSTAIN_MIN_DB}" max="0" step="0.5" value="${sustain}"
          data-module-sustain aria-label="Sustain do envelope"
          aria-valuetext="${formatModuleSustainDb(sustain)}">
      `)}
      <output data-module-sustain-value>${formatModuleSustainDb(sustain)}</output>
    </article>
  `;
}

// Gain do módulo: ganho de entrada, antes do EQ e do compressor. Serve para
// empurrar o sinal nos processadores; o volume de saída continua sendo só do
// fader da tela principal. Nasce em 0 dB, ou seja, sem mudar nada.
export const MODULE_GAIN_MIN_DB = -24;
export const MODULE_GAIN_MAX_DB = 12;

export function readModuleGainDb(settings: Readonly<Record<string, unknown>>): number {
  const value = Number(settings.gainDb);
  if (!Number.isFinite(value)) return 0;
  return Math.min(MODULE_GAIN_MAX_DB, Math.max(MODULE_GAIN_MIN_DB, value));
}

export function formatModuleGainDb(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`;
}

export function createModuleGainCardMarkup(settings: Readonly<Record<string, unknown>>): string {
  const gain = readModuleGainDb(settings);
  const progress = (gain - MODULE_GAIN_MIN_DB) / (MODULE_GAIN_MAX_DB - MODULE_GAIN_MIN_DB);
  return `
    <article class="module-envelope-control module-gain-card" data-module-gain-card>
      <strong>Gain</strong>
      ${createParameterKnobMarkup(progress, `
        <input type="range" min="${MODULE_GAIN_MIN_DB}" max="${MODULE_GAIN_MAX_DB}" step="0.5" value="${gain}"
          data-module-gain aria-label="Gain do módulo"
          aria-valuetext="${formatModuleGainDb(gain)}">
      `)}
      <output data-module-gain-value>${formatModuleGainDb(gain)}</output>
    </article>
  `;
}

// Limite Velocity: a tecla tocada acima do limite não toca nota nenhuma.
export function createVelocityLimitCardMarkup(settings: Readonly<Record<string, unknown>>): string {
  const limit = readVelocityLimit(settings.velocityLimit);
  return `
    <article class="module-envelope-control module-velocity-limit-card" data-module-velocity-limit-card>
      <h3>Limite Velocity</h3>
      ${createParameterKnobMarkup(limit / 127, `
        <input type="range" min="0" max="127" step="1" value="${limit}"
          data-module-velocity-limit aria-label="Limite de velocity" aria-valuetext="${limit}">
      `)}
      <output data-module-velocity-limit-value>${limit}</output>
    </article>
  `;
}

export type ModuleEqBandType = 'band' | 'low-cut' | 'low-shelf' | 'high-cut' | 'high-shelf';

export interface ModuleEqBand {
  frequency: number;
  gain: number;
  q: number;
  cutSlope: number;
  type: ModuleEqBandType;
}

export const MODULE_EQ_WIDTH = 1_000;
export const MODULE_EQ_HEIGHT = 400;
const MODULE_EQ_MIN_FREQUENCY = 10;
const MODULE_EQ_MAX_FREQUENCY = 20_000;
const MODULE_EQ_MAX_GAIN = 24;
const MODULE_EQ_MIN_CUT_SLOPE = 1;
const MODULE_EQ_MAX_CUT_SLOPE = 8;
const MODULE_CUTOFF_MIN_FREQUENCY = 20;
const MODULE_CUTOFF_MAX_FREQUENCY = 20_000;
const EQ_BAND_COLORS = ['#62dc6f', '#4da7f4', '#d95cef', '#ff5757', '#8d63f6'] as const;
const DEFAULT_EQ_BANDS: readonly ModuleEqBand[] = [
  // Shelf com Q 1 = inclinação padrão (S = 1), a mais firme sem ressonância.
  { frequency: 80, gain: 0, q: 1, cutSlope: 1, type: 'low-shelf' },
  { frequency: 300, gain: 0, q: 1, cutSlope: 1, type: 'band' },
  { frequency: 1_000, gain: 0, q: 1, cutSlope: 1, type: 'band' },
  { frequency: 4_000, gain: 0, q: 1, cutSlope: 1, type: 'band' },
  { frequency: 12_000, gain: 0, q: 1, cutSlope: 1, type: 'high-shelf' },
];

const ENVELOPE_CONTROLS: readonly {
  parameter: ModuleEnvelopeParameter;
  label: string;
}[] = [
  { parameter: 'attackMs', label: 'Attack' },
  { parameter: 'releaseMs', label: 'Release' },
  { parameter: 'holdMs', label: 'Hold' },
  { parameter: 'decayMs', label: 'Decay' },
];

// Páginas do Config. O topo (MIDI, saída, Polifonia, Modo) e o rodapé (Gain,
// Velocity, Glide, Mod) ficam sempre na tela; só o miolo troca de página.
export type ModuleSettingsPage =
  'envelope' | 'eq' | 'compressor' | 'chorus' | 'reverb' | 'delay'
  | 'rotary' | 'arpeggiator' | 'trance-gate';
export type ModuleSettingsMode = 'default' | 'user';

const MODULE_SETTINGS_PAGE_LABELS: Readonly<Record<ModuleSettingsPage, string>> = {
  envelope: 'Envelope',
  eq: 'EQ',
  compressor: 'Compressor',
  chorus: 'Chorus',
  reverb: 'Reverb',
  delay: 'Delay',
  rotary: 'Rotary',
  arpeggiator: 'Arpeggiator',
  'trance-gate': 'Pulse',
};

export function moduleSettingsPages(
  processorReplacement: ModuleProcessorReplacement,
): readonly ModuleSettingsPage[] {
  const pages: ModuleSettingsPage[] = processorReplacement === 'synth'
    ? ['eq', 'compressor', 'chorus', 'reverb', 'delay']
    : ['envelope', 'eq', 'compressor', 'chorus', 'reverb', 'delay'];
  // O processador próprio do módulo (se houver) vem depois do Delay.
  if (processorReplacement === 'rotary') pages.push('rotary');
  // Todo módulo tem seu próprio Arpeggiator e Pulse, independente dos demais.
  pages.push('arpeggiator', 'trance-gate');
  return pages;
}

export function isModuleSettingsPage(value: string | undefined): value is ModuleSettingsPage {
  return value !== undefined && value in MODULE_SETTINGS_PAGE_LABELS;
}

// ON/OFF da página: o Envelope não tem; o EQ e os processadores têm.
export function moduleSettingsPagePower(
  page: ModuleSettingsPage,
  settings: Readonly<Record<string, unknown>>,
): boolean | null {
  if (page === 'eq') return settings.eqEnabled !== false;
  if (page === 'compressor') return readModuleCompressorSettings(settings.compressor).enabled;
  if (page === 'chorus') return readModuleChorusSettings(settings.chorus).enabled;
  if (page === 'reverb') return readModuleReverbSettings(settings.reverb).enabled;
  if (page === 'delay') return readModuleDelaySettings(settings.delay).enabled;
  if (page === 'rotary') return readModuleRotarySettings(settings.rotary).enabled;
  if (page === 'arpeggiator') return readArpeggiatorSettings(settings.arpeggiator).enabled;
  if (page === 'trance-gate') return readTranceGateSettings(settings.tranceGate).enabled;
  return null;
}

export function createModuleSettingsPageMarkup(
  page: ModuleSettingsPage,
  settings: Readonly<Record<string, unknown>>,
  bpm: number,
  processorReplacement: ModuleProcessorReplacement = 'compressor',
): string {
  if (page === 'eq') return createModuleEqMarkup(settings);
  if (page === 'compressor') return createModuleCompressorMarkup(settings);
  if (page === 'chorus') return createModuleChorusMarkup(settings);
  if (page === 'reverb') return createModuleReverbMarkup(settings);
  if (page === 'delay') return createModuleDelayMarkup(settings, bpm);
  if (page === 'rotary') return createModuleRotaryMarkup(settings);
  if (page === 'arpeggiator') return createArpeggiatorMarkup(settings.arpeggiator);
  if (page === 'trance-gate') return createTranceGateMarkup(settings.tranceGate, bpm);
  const organ = processorReplacement === 'organ';
  return `
    <div class="module-envelope-grid" aria-label="Envelope do timbre">
      ${ENVELOPE_CONTROLS.map(({ parameter, label }) => createEnvelopeControl(
        parameter,
        label,
        readEnvelopeTime(
          settings[parameter],
          MODULE_ENVELOPE_LIMITS[parameter],
          MODULE_ENVELOPE_DEFAULTS[parameter],
        ),
      )).join('')}
      ${createSustainControl(settings)}
      ${organ ? createModuleModulationCardMarkup(settings, 'organ') : createCutoffControl(readModuleCutoffFrequency(settings.cutoffHz), readFilterVelocityEnabled(settings), settings)}
      ${organ ? '<article class="module-envelope-control module-envelope-placeholder" aria-hidden="true"></article>' : createVelocityLimitCardMarkup(settings)}
      ${createModuleGainCardMarkup(settings)}
    </div>
  `;
}

export function createModuleSettingsMarkup(
  devices: readonly MidiInputDevice[],
  activeDeviceIds: readonly (string | null)[],
  selectedDeviceId: string | null,
  settings: Readonly<Record<string, unknown>>,
  bpm: number,
  audioChannelCount: number,
  audioRoute: ModuleOutputRoute,
  processorReplacement: ModuleProcessorReplacement = 'compressor',
  activePage: ModuleSettingsPage = 'envelope',
  settingsMode: ModuleSettingsMode = 'user',
): string {
  const pages = moduleSettingsPages(processorReplacement);
  const page = pages.includes(activePage) ? activePage : pages[0] as ModuleSettingsPage;
  const deviceNames = new Map(devices.map((device) => [device.id, device.name]));
  const options = activeDeviceIds.map((deviceId, index) => {
    if (!deviceId) return '';
    const name = deviceNames.get(deviceId) ?? 'Dispositivo indisponível';
    return `
      <option value="${escapeHtml(deviceId)}"${deviceId === selectedDeviceId ? ' selected' : ''}>
        MIDI ${index + 1} · ${escapeHtml(name)}
      </option>
    `;
  }).join('');
  const voiceMode = settings.voiceMode === 'mono' ? 'mono' : 'poly';
  // Modo Poly/Mono ao lado da Polifonia nos módulos 1 a 7; o Synth tem o dele no editor.
  const hasVoiceSwitch = processorReplacement !== 'synth';
  const hasSettingsSource = processorReplacement !== 'synth' && processorReplacement !== 'organ';

  return `
    <section class="module-settings-panel${processorReplacement === 'synth' ? ' module-settings-panel--synth' : ''}${hasVoiceSwitch ? ' module-settings-panel--voice-switch' : ''}${settingsMode === 'default' && hasSettingsSource ? ' is-default-mode' : ''}" aria-label="Configurações do timbre" data-module-settings-mode-active="${settingsMode}">
      <div class="module-settings-io-row">
        <label class="app-settings-field module-settings-device">
          <span>Dispositivo MIDI</span>
          <select data-module-setting="midi-device">
            <option value=""${selectedDeviceId === null ? ' selected' : ''}>Todos os dispositivos ativos</option>
            ${options}
          </select>
        </label>

        <label class="app-settings-field module-settings-audio-route">
          <span>Saída do módulo</span>
          <select data-module-setting="audio-route">
            <!-- Padrão segue Saídas - Módulos: trocar lá move todos os módulos
                 que ficaram no padrão. -->
            <option value="default"${audioRoute === 'default' ? ' selected' : ''}>Padrão</option>
            ${createAudioRouteOptions(audioChannelCount, audioRoute)}
          </select>
        </label>

        <div class="module-settings-control-stack">
          ${hasSettingsSource ? `<button class="module-settings-source-button${settingsMode === 'default' ? ' is-selected' : ''}" type="button"
            data-module-settings-mode="default" aria-pressed="${settingsMode === 'default'}">Default</button>` : ''}
          <button class="module-polyphony-button" type="button" data-module-setting-action="open-polyphony">
            <span>Polifonia</span>
            <strong>${Math.round(Math.min(128, Math.max(1, Number(settings.polyphony) || 128)))}</strong>
          </button>
        </div>

        ${hasVoiceSwitch ? `
          <div class="module-settings-control-stack">
            ${hasSettingsSource ? `<button class="module-settings-source-button${settingsMode === 'user' ? ' is-selected' : ''}" type="button"
              data-module-settings-mode="user" aria-pressed="${settingsMode === 'user'}">User</button>` : ''}
            <button class="module-voice-mode-button is-${voiceMode}" type="button" data-module-setting-action="toggle-voice-mode" aria-pressed="${voiceMode === 'mono'}">
              <span>Modo</span>
              <strong>${voiceMode === 'mono' ? 'Mono' : 'Poly'}</strong>
            </button>
          </div>
        ` : ''}
      </div>

      <div class="module-settings-pages">
        <div role="tablist" aria-label="Páginas da configuração">
          ${pages.map((item) => `
            <button type="button" role="tab" data-module-settings-page="${item}"
              class="${item === page ? 'is-selected' : ''}"
              aria-selected="${item === page}">${MODULE_SETTINGS_PAGE_LABELS[item]}</button>
          `).join('')}
        </div>
      </div>

      <div class="module-settings-workspace" data-module-settings-workspace data-page="${page}">
        ${createModuleSettingsPageMarkup(page, settings, bpm, processorReplacement)}
      </div>
      ${processorReplacement === 'organ' ? '' : `<div class="module-settings-bottom-row">
        ${createVelocityCardMarkup(settings)}
        ${processorReplacement === 'synth' ? '' : createGlideCardMarkup(settings, bpm)}
        ${createModuleModulationCardMarkup(settings, processorReplacement === 'synth' ? 'synth' : 'sf2')}
      </div>`}
    </section>
  `;
}

export function createModuleEqMarkup(settings: Readonly<Record<string, unknown>>): string {
  const bands = readModuleEqBands(settings.eqBands);
  return `
    <section class="module-eq-editor" aria-label="Equalizador de cinco bandas">
      <div class="module-eq-editor__plot" data-module-eq-plot>
        <svg viewBox="0 0 ${MODULE_EQ_WIDTH} ${MODULE_EQ_HEIGHT}" preserveAspectRatio="none" aria-label="Cinco bandas ajustáveis de 10 Hz a 20 kHz">
          <defs>
            <linearGradient id="module-eq-editor-shadow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#ffad35" stop-opacity="0.3" />
              <stop offset="100%" stop-color="#ff7117" stop-opacity="0.035" />
            </linearGradient>
          </defs>
          <g class="module-eq-editor__grid">
            <path d="M0 50H1000M0 100H1000M0 150H1000M0 200H1000M0 250H1000M0 300H1000M0 350H1000" />
            <path d="M91 0V400M182 0V400M273 0V400M364 0V400M455 0V400M546 0V400M637 0V400M728 0V400M819 0V400M910 0V400" />
          </g>
          <path class="module-eq-editor__curve-shadow" data-module-eq-curve-shadow d="${createEqShadowPath(bands, MODULE_EQ_WIDTH, MODULE_EQ_HEIGHT)}" />
          <path class="module-eq-editor__curve" data-module-eq-curve d="${createEqCurve(bands, MODULE_EQ_WIDTH, MODULE_EQ_HEIGHT)}" />
          <g class="module-eq-editor__bands">
            ${bands.map((band, index) => `
              <g class="module-eq-editor__handle" style="--eq-band-color:${EQ_BAND_COLORS[index]}" transform="translate(${eqXFromFrequency(band.frequency)} ${eqYFromGain(band.gain)})" data-module-eq-band="${index}" aria-label="Banda ${index + 1}">
                <circle class="module-eq-editor__handle-hit" r="24" />
                <circle class="module-eq-editor__handle-halo" r="10" />
                <circle class="module-eq-editor__handle-core" r="6" />
              </g>
            `).join('')}
          </g>
        </svg>
        <span class="module-eq-editor__frequency module-eq-editor__frequency--low">10 Hz</span>
        <span class="module-eq-editor__frequency module-eq-editor__frequency--high">20 kHz</span>
        <span class="module-eq-editor__gain module-eq-editor__gain--high">+24 dB</span>
        <span class="module-eq-editor__gain module-eq-editor__gain--zero">0 dB</span>
        <span class="module-eq-editor__gain module-eq-editor__gain--low">−24 dB</span>
      </div>
      <div class="module-eq-editor__readouts">
        ${bands.map((band, index) => `
          <div class="${index === 0 || index === 4 ? 'has-type' : ''}" data-module-eq-readout="${index}">
            <strong>${index + 1}</strong>
            <span data-eq-frequency>${formatEqFrequency(band.frequency)}</span>
            <span data-eq-gain>${formatEqGain(band.gain)}</span>
            ${createEqShapeControl(band, index)}
            ${index === 0 ? `
              <div class="module-eq-type-picker" role="group" aria-label="Formato da primeira banda">
                ${createEqTypeButton(0, 'band', 'Band', band.type)}
                ${createEqTypeButton(0, 'low-cut', 'Low Cut', band.type)}
                ${createEqTypeButton(0, 'low-shelf', 'Shelf', band.type)}
              </div>
            ` : index === 4 ? `
              <div class="module-eq-type-picker" role="group" aria-label="Formato da última banda">
                ${createEqTypeButton(4, 'band', 'Band', band.type)}
                ${createEqTypeButton(4, 'high-cut', 'High Cut', band.type)}
                ${createEqTypeButton(4, 'high-shelf', 'Shelf', band.type)}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function createEqTypeButton(index: number, value: ModuleEqBandType, label: string, selected: ModuleEqBandType): string {
  return `<button type="button" data-module-eq-type="${index}" data-module-eq-type-value="${value}" class="${selected === value ? 'is-selected' : ''}" aria-pressed="${selected === value}">${label}</button>`;
}

export function readModuleEqBands(value: unknown): ModuleEqBand[] {
  const source = Array.isArray(value) ? value : [];
  return DEFAULT_EQ_BANDS.map((fallback, index) => {
    const candidate = source[index];
    if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) return { ...fallback };
    const record = candidate as Record<string, unknown>;
    const frequency = Number(record.frequency);
    const gain = Number(record.gain);
    const q = Number(record.q);
    const cutSlope = Number(record.cutSlope);
    const requestedType = typeof record.type === 'string' ? record.type : 'band';
    return {
      frequency: Number.isFinite(frequency)
        ? Math.min(MODULE_EQ_MAX_FREQUENCY, Math.max(MODULE_EQ_MIN_FREQUENCY, frequency))
        : fallback.frequency,
      gain: Number.isFinite(gain)
        ? Math.min(MODULE_EQ_MAX_GAIN, Math.max(-MODULE_EQ_MAX_GAIN, gain))
        : fallback.gain,
      q: Number.isFinite(q) ? Math.min(12, Math.max(0.1, q)) : fallback.q,
      cutSlope: Number.isFinite(cutSlope)
        ? Math.round(Math.min(MODULE_EQ_MAX_CUT_SLOPE, Math.max(MODULE_EQ_MIN_CUT_SLOPE, cutSlope)))
        : fallback.cutSlope,
      type: isAllowedEqBandType(index, requestedType) ? requestedType : fallback.type,
    };
  });
}

export function isAllowedEqBandType(index: number, value: string): value is ModuleEqBandType {
  if (value === 'band') return true;
  if (index === 0) return value === 'low-cut' || value === 'low-shelf';
  if (index === 4) return value === 'high-cut' || value === 'high-shelf';
  return false;
}

export function eqXFromFrequency(frequency: number, width = MODULE_EQ_WIDTH): number {
  const ratio = Math.log(frequency / MODULE_EQ_MIN_FREQUENCY)
    / Math.log(MODULE_EQ_MAX_FREQUENCY / MODULE_EQ_MIN_FREQUENCY);
  return Math.round(Math.min(1, Math.max(0, ratio)) * width * 10) / 10;
}

export function eqYFromGain(gain: number, height = MODULE_EQ_HEIGHT): number {
  return Math.round(((MODULE_EQ_MAX_GAIN - gain) / (MODULE_EQ_MAX_GAIN * 2)) * height * 10) / 10;
}

export function eqFrequencyFromRatio(ratio: number): number {
  return Math.round(MODULE_EQ_MIN_FREQUENCY * Math.pow(
    MODULE_EQ_MAX_FREQUENCY / MODULE_EQ_MIN_FREQUENCY,
    Math.min(1, Math.max(0, ratio)),
  ));
}

export function eqGainFromRatio(ratio: number): number {
  return Math.round((MODULE_EQ_MAX_GAIN - (Math.min(1, Math.max(0, ratio)) * MODULE_EQ_MAX_GAIN * 2)) * 10) / 10;
}

export function formatEqFrequency(frequency: number): string {
  return frequency >= 1_000 ? `${(frequency / 1_000).toFixed(1)} kHz` : `${Math.round(frequency)} Hz`;
}

export function formatEqGain(gain: number): string {
  return `${gain > 0 ? '+' : ''}${gain.toFixed(1)} dB`;
}

export function readModuleCutoffFrequency(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return MODULE_CUTOFF_MAX_FREQUENCY;
  return Math.min(MODULE_CUTOFF_MAX_FREQUENCY, Math.max(MODULE_CUTOFF_MIN_FREQUENCY, parsed));
}

export function cutoffFrequencyFromRatio(ratio: number): number {
  const normalized = Math.min(1, Math.max(0, ratio));
  return Math.round(MODULE_CUTOFF_MIN_FREQUENCY * Math.pow(
    MODULE_CUTOFF_MAX_FREQUENCY / MODULE_CUTOFF_MIN_FREQUENCY,
    normalized,
  ));
}

export function cutoffRatioFromFrequency(frequency: number): number {
  const normalized = readModuleCutoffFrequency(frequency);
  return Math.log(normalized / MODULE_CUTOFF_MIN_FREQUENCY)
    / Math.log(MODULE_CUTOFF_MAX_FREQUENCY / MODULE_CUTOFF_MIN_FREQUENCY);
}

// Velocity do filtro: tem ON/OFF e um Cutoff próprio, que é onde a curva
// começa. Com 400 Hz, a nota mais fraca fecha em 400 Hz e a mais forte abre
// até o Cutoff do Config. Nasce desligado e em 100 Hz.
export const DEFAULT_FILTER_VELOCITY_CUTOFF_HZ = 100;

export function readFilterVelocityEnabled(settings: Readonly<Record<string, unknown>>): boolean {
  return settings.filterVelocityEnabled === true;
}

export function readFilterVelocityCutoffHz(settings: Readonly<Record<string, unknown>>): number {
  const parsed = Number(settings.filterVelocityCutoffHz);
  return Number.isFinite(parsed)
    ? Math.min(MODULE_CUTOFF_MAX_FREQUENCY, Math.max(MODULE_CUTOFF_MIN_FREQUENCY, parsed))
    : DEFAULT_FILTER_VELOCITY_CUTOFF_HZ;
}

// O motor calcula o corte de cada nota como 20 Hz × (Cutoff/20)^(ponto/127).
// Cada ponto da curva vira o expoente que dá a mesma frequência entre o Cutoff
// do Velocity (ponto 0) e o Cutoff do Config (ponto 127). Assim nada muda no
// motor nativo. Desligado, todos os pontos em 127: o corte é o do Config.
export function filterVelocityEnginePoints(
  points: readonly number[],
  floorHz: number,
  cutoffHz: number,
): [number, number, number, number, number] {
  const top = Math.min(MODULE_CUTOFF_MAX_FREQUENCY, Math.max(MODULE_CUTOFF_MIN_FREQUENCY, cutoffHz));
  const floor = Math.min(top, Math.max(MODULE_CUTOFF_MIN_FREQUENCY, floorHz));
  const span = Math.log(top / MODULE_CUTOFF_MIN_FREQUENCY);
  return Array.from({ length: 5 }, (_, index) => {
    if (span <= 0) return 127;
    const point = Math.min(127, Math.max(0, Number(points[index]) || 0));
    const frequency = floor * Math.pow(top / floor, point / 127);
    const exponent = 127 * Math.log(frequency / MODULE_CUTOFF_MIN_FREQUENCY) / span;
    return Math.round(Math.min(127, Math.max(0, exponent)));
  }) as [number, number, number, number, number];
}

// Coluna à direita da curva: Cutoff do Velocity em cima, ON/OFF embaixo.
export function createFilterVelocityCutoffMarkup(settings: Readonly<Record<string, unknown>>): string {
  const enabled = readFilterVelocityEnabled(settings);
  const frequency = readFilterVelocityCutoffHz(settings);
  const ratio = cutoffRatioFromFrequency(frequency);
  return `
    <div class="filter-velocity-cutoff" data-filter-velocity-column>
      <strong>Cutoff</strong>
      ${createParameterKnobMarkup(ratio, `
        <input
          type="range"
          min="0"
          max="1"
          step="0.001"
          value="${ratio}"
          data-filter-velocity-cutoff
          aria-label="Cutoff do Velocity: a curva trabalha a partir desta frequência"
          aria-valuetext="${formatCutoffFrequency(frequency)}"
        >
      `)}
      <output data-filter-velocity-cutoff-value>${formatCutoffFrequency(frequency)}</output>
      <button
        type="button"
        class="filter-velocity-power module-effect-power ${enabled ? 'is-on' : 'is-off'}"
        data-filter-velocity-power
        aria-pressed="${enabled}"
      >${enabled ? 'ON' : 'OFF'}</button>
    </div>
  `;
}

export function updateFilterVelocityPowerMarkup(container: HTMLElement, enabled: boolean): void {
  container.querySelector('.velocity-curve-editor')?.classList.toggle('is-off', !enabled);
  const power = container.querySelector<HTMLButtonElement>('[data-filter-velocity-power]');
  if (!power) return;
  power.classList.toggle('is-on', enabled);
  power.classList.toggle('is-off', !enabled);
  power.setAttribute('aria-pressed', String(enabled));
  power.textContent = enabled ? 'ON' : 'OFF';
}

export function formatCutoffFrequency(frequency: number): string {
  return frequency >= 1_000
    ? `${(frequency / 1_000).toFixed(frequency >= 10_000 ? 0 : 1)} kHz`
    : `${Math.round(frequency)} Hz`;
}

export function createEqCurve(
  bands: readonly ModuleEqBand[],
  width = MODULE_EQ_WIDTH,
  height = MODULE_EQ_HEIGHT,
): string {
  const points: string[] = [];
  const sampleRate = 48_000;
  const steps = Math.max(120, Math.round(width / 4));
  const ratios = Array.from({ length: steps + 1 }, (_, index) => index / steps);
  for (const band of bands) {
    if (!isEqCutType(band.type)) continue;
    const cutoffRatio = Math.log(band.frequency / MODULE_EQ_MIN_FREQUENCY)
      / Math.log(MODULE_EQ_MAX_FREQUENCY / MODULE_EQ_MIN_FREQUENCY);
    ratios.push(Math.min(1, Math.max(0, cutoffRatio)));
    if (band.cutSlope >= MODULE_EQ_MAX_CUT_SLOPE) {
      const edgeOffset = 0.01 / width;
      ratios.push(Math.min(1, Math.max(0, cutoffRatio + (band.type === 'low-cut' ? -edgeOffset : edgeOffset))));
    }
  }
  ratios.sort((left, right) => left - right);
  for (const ratio of ratios) {
    const frequency = MODULE_EQ_MIN_FREQUENCY * Math.pow(MODULE_EQ_MAX_FREQUENCY / MODULE_EQ_MIN_FREQUENCY, ratio);
    const gain = bands.reduce((sum, band) => sum + filterMagnitudeDb(band, frequency, sampleRate), 0);
    points.push(`${Math.round(ratio * width * 10) / 10} ${eqYFromGain(Math.min(24, Math.max(-24, gain)), height)}`);
  }
  return `M${points.join(' L')}`;
}

export function createEqShadowPath(
  bands: readonly ModuleEqBand[],
  width = MODULE_EQ_WIDTH,
  height = MODULE_EQ_HEIGHT,
): string {
  return `${createEqCurve(bands, width, height)} L${width} ${height} L0 ${height} Z`;
}

function filterMagnitudeDb(band: ModuleEqBand, frequency: number, sampleRate: number): number {
  if (band.type === 'low-cut') {
    if (band.cutSlope >= MODULE_EQ_MAX_CUT_SLOPE) return frequency < band.frequency ? -240 : 0;
    return cutCurveGainDb(band.frequency / frequency, band.cutSlope);
  }
  if (band.type === 'high-cut') {
    if (band.cutSlope >= MODULE_EQ_MAX_CUT_SLOPE) return frequency > band.frequency ? -240 : 0;
    return cutCurveGainDb(frequency / band.frequency, band.cutSlope);
  }
  const omega = (2 * Math.PI * frequency) / sampleRate;
  const center = (2 * Math.PI * Math.min(sampleRate * 0.49, band.frequency)) / sampleRate;
  const amplitude = 10 ** (band.gain / 40);
  const alpha = Math.sin(center) / (2 * band.q);
  const cosine = Math.cos(center);
  let b0 = 1; let b1 = 0; let b2 = 0; let a0 = 1; let a1 = 0; let a2 = 0;
  if (band.type === 'low-shelf' || band.type === 'high-shelf') {
    const rootA = Math.sqrt(amplitude);
    // Mesma inclinação do motor (Q vira o slope S, limitado a 1): a curva
    // desenhada é a que se ouve.
    const slope = Math.min(1, Math.max(0.1, band.q));
    const shelfAlpha = Math.sin(center) * 0.5 * Math.sqrt((amplitude + 1 / amplitude) * (1 / slope - 1) + 2);
    const twiceRootAlpha = 2 * rootA * shelfAlpha;
    if (band.type === 'low-shelf') {
      b0 = amplitude * ((amplitude + 1) - (amplitude - 1) * cosine + twiceRootAlpha);
      b1 = 2 * amplitude * ((amplitude - 1) - (amplitude + 1) * cosine);
      b2 = amplitude * ((amplitude + 1) - (amplitude - 1) * cosine - twiceRootAlpha);
      a0 = (amplitude + 1) + (amplitude - 1) * cosine + twiceRootAlpha;
      a1 = -2 * ((amplitude - 1) + (amplitude + 1) * cosine);
      a2 = (amplitude + 1) + (amplitude - 1) * cosine - twiceRootAlpha;
    } else {
      b0 = amplitude * ((amplitude + 1) + (amplitude - 1) * cosine + twiceRootAlpha);
      b1 = -2 * amplitude * ((amplitude - 1) + (amplitude + 1) * cosine);
      b2 = amplitude * ((amplitude + 1) + (amplitude - 1) * cosine - twiceRootAlpha);
      a0 = (amplitude + 1) - (amplitude - 1) * cosine + twiceRootAlpha;
      a1 = 2 * ((amplitude - 1) - (amplitude + 1) * cosine);
      a2 = (amplitude + 1) - (amplitude - 1) * cosine - twiceRootAlpha;
    }
  } else {
    b0 = 1 + alpha * amplitude; b1 = -2 * cosine; b2 = 1 - alpha * amplitude;
    a0 = 1 + alpha / amplitude; a1 = -2 * cosine; a2 = 1 - alpha / amplitude;
  }
  const cosW = Math.cos(omega);
  const sinW = Math.sin(omega);
  const cos2W = Math.cos(omega * 2);
  const sin2W = Math.sin(omega * 2);
  const numerator = Math.hypot(b0 + b1 * cosW + b2 * cos2W, -b1 * sinW - b2 * sin2W);
  const denominator = Math.hypot(a0 + a1 * cosW + a2 * cos2W, -a1 * sinW - a2 * sin2W);
  return 20 * Math.log10(Math.max(1e-8, numerator / Math.max(1e-8, denominator)));
}

function cutCurveGainDb(stopBandRatio: number, stages: number): number {
  const order = Math.max(2, Math.min(14, Math.round(stages) * 2));
  const exponent = 2 * order * Math.log(Math.max(1e-8, stopBandRatio));
  const logDenominator = exponent > 50 ? exponent : Math.log1p(Math.exp(exponent));
  return -(10 / Math.LN10) * logDenominator;
}

export function isEqCutType(type: ModuleEqBandType): boolean {
  return type === 'low-cut' || type === 'high-cut';
}

export function formatEqCutSlope(stages: number): string {
  return stages >= MODULE_EQ_MAX_CUT_SLOPE ? 'Brickwall' : `${Math.round(stages) * 12} dB/oct`;
}

function createEqShapeControl(band: ModuleEqBand, index: number): string {
  const cut = isEqCutType(band.type);
  const value = cut ? band.cutSlope : band.q;
  return `
    <label class="module-eq-q-control${cut ? ' is-cut-slope' : ''}">
      <span data-eq-shape-label>${cut ? 'Curva' : 'Q'}</span>
      <input
        type="range"
        min="${cut ? MODULE_EQ_MIN_CUT_SLOPE : 0.1}"
        max="${cut ? MODULE_EQ_MAX_CUT_SLOPE : 12}"
        step="${cut ? 1 : 0.1}"
        value="${value}"
        data-module-eq-q="${index}"
        aria-label="${cut ? 'Inclinação do corte' : 'Fator Q'} da banda ${index + 1}"
      >
      <output data-eq-q-value>${cut ? formatEqCutSlope(band.cutSlope) : band.q.toFixed(1)}</output>
    </label>
  `;
}

export function formatEnvelopeTime(milliseconds: number): string {
  if (milliseconds < 1_000) {
    return `${milliseconds < 10 ? milliseconds.toFixed(2) : milliseconds.toFixed(1)} ms`;
  }
  return `${(milliseconds / 1_000).toFixed(1)}k ms`;
}

function createEnvelopeControl(
  parameter: ModuleEnvelopeParameter,
  label: string,
  value: number,
): string {
  const maximum = MODULE_ENVELOPE_LIMITS[parameter];
  return `
    <article class="module-envelope-control">
      <h3>${label}</h3>
      ${createParameterKnobMarkup(value / maximum, `
        <input
          type="range"
          min="0"
          max="${maximum}"
          step="1"
          value="${value}"
          data-module-envelope="${parameter}"
          aria-label="${label}"
          aria-valuetext="${formatEnvelopeTime(value)}"
        >
      `)}
      <output data-module-envelope-value="${parameter}">${formatEnvelopeTime(value)}</output>
    </article>
  `;
}

export function createCutoffControl(
  frequency: number, velocityEnabled: boolean, settings: Readonly<Record<string, unknown>>,
  showConfigButton = true,
): string {
  const ratio = cutoffRatioFromFrequency(frequency);
  const envelopeEnabled = readModuleCutoffEnvelopeSettings(settings.cutoffEnvelope).enabled;
  const filterType = readCutoffFilterType(settings.cutoffFilterType);
  const customized = velocityEnabled || envelopeEnabled || filterType !== 'lowpass2';
  return `
    <article class="module-envelope-control module-cutoff-control">
      ${showConfigButton ? `<button type="button" class="${customized ? 'is-active' : ''}" data-module-setting-action="open-filter-velocity" aria-label="Config do Cutoff${customized ? ', personalizado' : ''}">Config</button>` : ''}
      <h3>Cutoff</h3>
      ${createParameterKnobMarkup(ratio, `
        <input
          type="range"
          min="0"
          max="1"
          step="0.001"
          value="${ratio}"
          data-module-cutoff
          aria-label="Cutoff"
          aria-valuetext="${formatCutoffFrequency(frequency)}"
        >
      `)}
      <output data-module-cutoff-value>${formatCutoffFrequency(frequency)}</output>
    </article>
  `;
}

function readEnvelopeTime(value: unknown, maximum: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(0, parsed));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
