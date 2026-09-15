import type { MidiInputDevice } from '../midi/MidiInputService';
import { createModuleEffectCardsMarkup, type ModuleProcessorReplacement } from './ModuleEffectsView';
import { createAudioRouteOptions, type AudioBusRoute } from '../audio/AudioOutputService';
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

export type ModuleModulationMode = 'user' | 'lfo';

export function readModuleModulationMode(settings: Readonly<Record<string, unknown>>): ModuleModulationMode {
  return settings.modulationMode === 'user' ? 'user' : 'lfo';
}

// Rate padrão do LFO do card Mod, o mesmo do LFO do Synth.
export const DEFAULT_MODULE_MODULATION_RATE_HZ = 6.85;

export function readModuleModulationRate(settings: Readonly<Record<string, unknown>>): number {
  const value = Number(settings.modulationRateHz);
  return Number.isFinite(value) ? Math.min(20, Math.max(0.1, value)) : DEFAULT_MODULE_MODULATION_RATE_HZ;
}

// Synth: LFO aciona o LFO do editor do Synth e User deixa a roda sem efeito,
// por isso o card do Synth não tem Rate próprio.
export function createModuleModulationCardMarkup(
  settings: Readonly<Record<string, unknown>>,
  owner: 'sf2' | 'synth' = 'sf2',
): string {
  const mode = readModuleModulationMode(settings);
  const rate = readModuleModulationRate(settings);
  const status = owner === 'synth'
    ? mode === 'lfo' ? 'LFO do Synth' : 'Roda sem efeito'
    : mode === 'lfo' ? `Pitch · ${rate.toFixed(2)} Hz` : 'SF2 · User';
  return `
    <article class="module-mod-card${owner === 'synth' ? ' module-mod-card--synth' : ''}" data-module-mod-card>
      <header>
        <strong>Mod</strong>
        <small>${status}</small>
      </header>
      <div role="group" aria-label="Modo da roda Mod">
        ${(['user', 'lfo'] as const).map((value) => `
          <button type="button" data-module-modulation-mode="${value}"
            class="${mode === value ? 'is-selected' : ''}"
            aria-pressed="${mode === value}">${value === 'lfo' ? 'LFO' : 'User'}</button>
        `).join('')}
      </div>
      ${owner === 'synth' ? '' : `<label class="module-mod-card__rate">
        ${createParameterKnobMarkup((rate - 0.1) / 19.9, `
          <input type="range" min="0.1" max="20" step="0.01" value="${rate}"
            data-module-modulation-rate aria-label="Rate do LFO"
            aria-valuetext="${rate.toFixed(2)} Hz"${mode === 'user' ? ' disabled' : ''}>
        `)}
        <output data-module-modulation-rate-value>${rate.toFixed(2)} Hz</output>
      </label>`}
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

export function createModuleSettingsMarkup(
  devices: readonly MidiInputDevice[],
  activeDeviceIds: readonly (string | null)[],
  selectedDeviceId: string | null,
  settings: Readonly<Record<string, unknown>>,
  bpm: number,
  audioChannelCount: number,
  audioRoute: AudioBusRoute,
  processorReplacement: ModuleProcessorReplacement = 'compressor',
): string {
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
  const eqBands = readModuleEqBands(settings.eqBands);
  const voiceMode = settings.voiceMode === 'mono' ? 'mono' : 'poly';
  // Modo Poly/Mono ao lado da Polifonia nos módulos 1 a 7; o Synth tem o dele no editor.
  const hasVoiceSwitch = processorReplacement !== 'synth';

  return `
    <section class="module-settings-panel${processorReplacement === 'synth' ? ' module-settings-panel--synth' : ''}${hasVoiceSwitch ? ' module-settings-panel--voice-switch' : ''}" aria-label="Configurações do timbre">
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
            ${createAudioRouteOptions(audioChannelCount, audioRoute)}
          </select>
        </label>

        <!-- Reset de todos os parâmetros do módulo: acima do Modo Poly/Mono, ou
             acima da Polifonia no Synth (8), que não tem Modo aqui. -->
        <div class="module-settings-control-stack">
          ${hasVoiceSwitch ? '' : '<button class="module-settings-reset-button" type="button" data-module-setting-action="reset-module">Reset</button>'}
          <button class="module-polyphony-button" type="button" data-module-setting-action="open-polyphony">
            <span>Polifonia</span>
            <strong>${Math.round(Math.min(128, Math.max(1, Number(settings.polyphony) || 128)))}</strong>
          </button>
        </div>

        ${hasVoiceSwitch ? `
          <div class="module-settings-control-stack">
            <button class="module-settings-reset-button" type="button" data-module-setting-action="reset-module">Reset</button>
            <button class="module-voice-mode-button is-${voiceMode}" type="button" data-module-setting-action="toggle-voice-mode" aria-pressed="${voiceMode === 'mono'}">
              <span>Modo</span>
              <strong>${voiceMode === 'mono' ? 'Mono' : 'Poly'}</strong>
            </button>
          </div>
        ` : ''}
      </div>

      <div class="module-settings-workspace">
        ${processorReplacement === 'synth' ? '' : `<div class="module-envelope-grid" aria-label="Envelope do timbre">
          ${ENVELOPE_CONTROLS.map(({ parameter, label }) => createEnvelopeControl(
            parameter,
            label,
            readEnvelopeTime(
              settings[parameter],
              MODULE_ENVELOPE_LIMITS[parameter],
              MODULE_ENVELOPE_DEFAULTS[parameter],
            ),
          )).join('')}
          ${createCutoffControl(readModuleCutoffFrequency(settings.cutoffHz), readFilterVelocityEnabled(settings))}
          ${createVelocityLimitCardMarkup(settings)}
        </div>`}

        <div class="module-processors-grid">
          <article class="module-eq-card">
            <button type="button" data-module-setting-action="open-eq">EQ</button>
            <div class="module-eq-preview" aria-label="Prévia do equalizador de cinco bandas">
              <svg viewBox="0 0 420 170" role="img" aria-label="Equalizador de 10 Hz a 20 kHz com cinco bandas">
                <defs>
                  <linearGradient id="module-eq-preview-shadow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#ffab32" stop-opacity="0.28" />
                    <stop offset="100%" stop-color="#ff7a18" stop-opacity="0.03" />
                  </linearGradient>
                </defs>
                <g class="module-eq-preview__grid">
                  <path d="M0 28H420M0 57H420M0 85H420M0 113H420M0 142H420" />
                  <path d="M35 0V170M70 0V170M105 0V170M140 0V170M175 0V170M210 0V170M245 0V170M280 0V170M315 0V170M350 0V170M385 0V170" />
                </g>
                <path class="module-eq-preview__curve-shadow" d="${createEqShadowPath(eqBands, 420, 170)}" />
                <path class="module-eq-preview__curve" d="${createEqCurve(eqBands, 420, 170)}" />
                <g class="module-eq-preview__bands">
                  ${eqBands.map((band, index) => `<circle cx="${eqXFromFrequency(band.frequency, 420)}" cy="${eqYFromGain(band.gain, 170)}" r="5" style="--eq-band-color:${EQ_BAND_COLORS[index]}" />`).join('')}
                </g>
              </svg>
              <span>10 Hz</span>
              <span>20 kHz</span>
            </div>
          </article>
          ${createModuleEffectCardsMarkup(settings, bpm, processorReplacement)}
        </div>
      </div>
      <div class="module-settings-bottom-row">
        ${createVelocityCardMarkup(settings)}
        ${processorReplacement === 'synth' ? '' : createGlideCardMarkup(settings, bpm)}
        ${createModuleModulationCardMarkup(settings, processorReplacement === 'synth' ? 'synth' : 'sf2')}
      </div>
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

function createCutoffControl(frequency: number, velocityEnabled: boolean): string {
  const ratio = cutoffRatioFromFrequency(frequency);
  return `
    <article class="module-envelope-control module-cutoff-control">
      <button type="button" class="${velocityEnabled ? 'is-active' : ''}" data-module-setting-action="open-filter-velocity" aria-label="Velocity do filtro${velocityEnabled ? ', ligado' : ', desligado'}">Velocity</button>
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
