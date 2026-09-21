import { createParameterKnobMarkup } from './ParameterKnobView';
import {
  createGlideCardMarkup,
  DEFAULT_GLIDE_VELOCITY_THRESHOLD,
  readGlideMode,
  readGlideVelocity,
  type GlideMode,
} from './GlideView';

export type SynthOscillator = 'sine' | 'saw' | 'square' | 'triangle';
export type SynthVoiceMode = 'mono' | 'poly';
export type SynthLfoTarget = 'pitch' | 'filter' | 'volume';

export interface SynthModuleSettings {
  oscillator1: SynthOscillator;
  oscillator2: SynthOscillator;
  oscillator3: SynthOscillator;
  oscillator1Enabled: boolean;
  oscillator2Enabled: boolean;
  oscillator3Enabled: boolean;
  voiceMode: SynthVoiceMode;
  legato: boolean;
  // No Sens: the key velocity does not change the Synth volume.
  noVelocitySensitivity: boolean;
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
  lfoTarget: SynthLfoTarget;
  lfoRateHz: number;
  lfoDepth: number;
  glideMs: number;
  glideSync: boolean;
  glideMode: GlideMode;
  glideVelocityEnabled: boolean;
  glideVelocityInverted: boolean;
  glideVelocityThreshold: number;
  oscillator1Octave: number;
  oscillator2Octave: number;
  oscillator3Octave: number;
  // Limite de velocity de cada OSC: acima dele, aquele oscilador não soa.
  oscillator1VelocityLimit: number;
  oscillator2VelocityLimit: number;
  oscillator3VelocityLimit: number;
}

export const DEFAULT_SYNTH_SETTINGS: Readonly<SynthModuleSettings> = Object.freeze({
  oscillator1: 'saw',
  oscillator2: 'square',
  oscillator3: 'saw',
  oscillator1Enabled: true,
  oscillator2Enabled: true,
  oscillator3Enabled: true,
  voiceMode: 'mono',
  legato: true,
  noVelocitySensitivity: true,
  oscillator1Volume: 100,
  oscillator2Volume: 100,
  oscillator3Volume: 100,
  oscillator1DetuneCents: 0,
  oscillator2DetuneCents: 7,
  oscillator3DetuneCents: -7,
  attackMs: 0,
  holdMs: 15000,
  decayMs: 25000,
  sustain: 100,
  releaseMs: 300,
  filterCutoffHz: 20000,
  filterResonance: 18,
  filterEnvelope: 24,
  lfoTarget: 'filter',
  lfoRateHz: 6.85,
  lfoDepth: 0,
  glideMs: 45,
  glideSync: false,
  glideMode: 'auto',
  glideVelocityEnabled: false,
  glideVelocityInverted: false,
  glideVelocityThreshold: DEFAULT_GLIDE_VELOCITY_THRESHOLD,
  oscillator1Octave: 0,
  oscillator2Octave: 0,
  oscillator3Octave: 0,
  oscillator1VelocityLimit: 127,
  oscillator2VelocityLimit: 127,
  oscillator3VelocityLimit: 127,
});

export const SYNTH_PRESET_COUNT = 5;

// Factory sounds for the five Synth preset slots. Oscillator volumes are knob
// positions (see oscillatorVolumeGain); cutoff is stored in Hz.
const FACTORY_PRESET_BASE: Readonly<SynthModuleSettings> = Object.freeze({
  ...DEFAULT_SYNTH_SETTINGS,
  oscillator1Enabled: true,
  oscillator2Enabled: true,
  oscillator3Enabled: true,
  oscillator1DetuneCents: 0,
  oscillator2DetuneCents: 0,
  oscillator3DetuneCents: 0,
  holdMs: 15000,
  decayMs: 25000,
  sustain: 100,
  filterCutoffHz: 20000,
  lfoTarget: 'pitch',
  lfoRateHz: 6.85,
  lfoDepth: 0,
  glideSync: false,
  oscillator1Octave: 0,
  oscillator2Octave: 0,
  oscillator3Octave: 0,
});

export const FACTORY_SYNTH_PRESETS: readonly Readonly<SynthModuleSettings>[] = Object.freeze([
  Object.freeze({
    ...FACTORY_PRESET_BASE,
    oscillator1: 'sine', oscillator2: 'sine', voiceMode: 'poly', legato: false,
    oscillator1Volume: 89, oscillator2Volume: 60,
    attackMs: 8, releaseMs: 85,
    filterResonance: 0, filterEnvelope: 100,
    glideMs: 205, oscillator2Octave: 1,
  }),
  Object.freeze({
    ...FACTORY_PRESET_BASE,
    oscillator1: 'saw', oscillator2: 'saw', voiceMode: 'poly', legato: false,
    oscillator1Volume: 89, oscillator2Volume: 60,
    attackMs: 8, releaseMs: 85,
    filterCutoffHz: 49.09, filterResonance: 0, filterEnvelope: 100,
    glideMs: 205,
  }),
  Object.freeze({
    ...FACTORY_PRESET_BASE,
    oscillator1: 'sine', oscillator2: 'sine', voiceMode: 'mono', legato: true,
    oscillator1Volume: 100, oscillator2Volume: 100,
    attackMs: 0, releaseMs: 25,
    filterResonance: 18, filterEnvelope: 24,
    glideMs: 0, oscillator2Octave: 1,
  }),
  Object.freeze({
    ...FACTORY_PRESET_BASE,
    oscillator1: 'saw', oscillator2: 'saw', voiceMode: 'poly', legato: false,
    oscillator1Volume: 100, oscillator2Volume: 100,
    attackMs: 0, releaseMs: 49,
    filterCutoffHz: 308.3, filterResonance: 31, filterEnvelope: 14,
    lfoTarget: 'filter', glideMs: 129,
  }),
  Object.freeze({
    ...FACTORY_PRESET_BASE,
    oscillator1: 'sine', oscillator2: 'square', oscillator2Enabled: false,
    voiceMode: 'mono', legato: true,
    oscillator1Volume: 100, oscillator2Volume: 100,
    attackMs: 0, releaseMs: 47,
    filterResonance: 0, filterEnvelope: 24,
    glideMs: 0,
  }),
] satisfies SynthModuleSettings[]);

/** A fresh, editable copy of a factory preset (slot is 1-based). */
export function factorySynthPreset(slot: number): SynthModuleSettings {
  const index = Math.min(SYNTH_PRESET_COUNT, Math.max(1, Math.round(slot))) - 1;
  return { ...FACTORY_SYNTH_PRESETS[index]! };
}

const OSCILLATORS: readonly SynthOscillator[] = ['sine', 'saw', 'square', 'triangle'];
const LFO_TARGETS: readonly SynthLfoTarget[] = ['pitch', 'filter', 'volume'];

export function readSynthSettings(value: unknown): SynthModuleSettings {
  const source = isRecord(value) ? value : {};
  // Preserve the sound of older presets/backups that stored a crossfade.
  const legacyMix = typeof source.oscillatorMix === 'number' && Number.isFinite(source.oscillatorMix)
    ? bounded(source.oscillatorMix, 0, 100, 35) : null;
  // The old single Detune kept OSC 1 centered, raised OSC 2 and lowered OSC 3.
  // Preserve that sound while migrating each preset to independent tuning.
  const legacyDetune = typeof source.detuneCents === 'number' && Number.isFinite(source.detuneCents)
    ? bounded(source.detuneCents, -100, 100, 7) : null;
  const glideVelocity = readGlideVelocity(source);
  return {
    oscillator1: isOscillator(source.oscillator1) ? source.oscillator1 : DEFAULT_SYNTH_SETTINGS.oscillator1,
    oscillator2: isOscillator(source.oscillator2) ? source.oscillator2 : DEFAULT_SYNTH_SETTINGS.oscillator2,
    oscillator3: isOscillator(source.oscillator3) ? source.oscillator3 : DEFAULT_SYNTH_SETTINGS.oscillator3,
    oscillator1Enabled: typeof source.oscillator1Enabled === 'boolean'
      ? source.oscillator1Enabled : DEFAULT_SYNTH_SETTINGS.oscillator1Enabled,
    oscillator2Enabled: typeof source.oscillator2Enabled === 'boolean'
      ? source.oscillator2Enabled : DEFAULT_SYNTH_SETTINGS.oscillator2Enabled,
    oscillator3Enabled: typeof source.oscillator3Enabled === 'boolean'
      ? source.oscillator3Enabled : DEFAULT_SYNTH_SETTINGS.oscillator3Enabled,
    voiceMode: source.voiceMode === 'poly' ? 'poly' : 'mono',
    legato: typeof source.legato === 'boolean' ? source.legato : DEFAULT_SYNTH_SETTINGS.legato,
    noVelocitySensitivity: typeof source.noVelocitySensitivity === 'boolean'
      ? source.noVelocitySensitivity : DEFAULT_SYNTH_SETTINGS.noVelocitySensitivity,
    oscillator1Volume: bounded(source.oscillator1Volume, 0, 100,
      legacyMix !== null && source.oscillator2Enabled !== false ? 100 - legacyMix : DEFAULT_SYNTH_SETTINGS.oscillator1Volume),
    oscillator2Volume: bounded(source.oscillator2Volume, 0, 100,
      legacyMix !== null && source.oscillator1Enabled !== false ? legacyMix : DEFAULT_SYNTH_SETTINGS.oscillator2Volume),
    oscillator3Volume: bounded(source.oscillator3Volume, 0, 100, DEFAULT_SYNTH_SETTINGS.oscillator3Volume),
    oscillator1DetuneCents: bounded(source.oscillator1DetuneCents, -100, 100,
      legacyDetune === null ? DEFAULT_SYNTH_SETTINGS.oscillator1DetuneCents : 0),
    oscillator2DetuneCents: bounded(source.oscillator2DetuneCents, -100, 100,
      legacyDetune ?? DEFAULT_SYNTH_SETTINGS.oscillator2DetuneCents),
    oscillator3DetuneCents: bounded(source.oscillator3DetuneCents, -100, 100,
      legacyDetune === null ? DEFAULT_SYNTH_SETTINGS.oscillator3DetuneCents : -legacyDetune),
    attackMs: bounded(source.attackMs, 0, 15000, DEFAULT_SYNTH_SETTINGS.attackMs),
    holdMs: bounded(source.holdMs, 0, 15000, DEFAULT_SYNTH_SETTINGS.holdMs),
    decayMs: bounded(source.decayMs, 0, 25000, DEFAULT_SYNTH_SETTINGS.decayMs),
    sustain: DEFAULT_SYNTH_SETTINGS.sustain,
    releaseMs: bounded(source.releaseMs, 0, 25000, DEFAULT_SYNTH_SETTINGS.releaseMs),
    filterCutoffHz: bounded(source.filterCutoffHz, 20, 20000, DEFAULT_SYNTH_SETTINGS.filterCutoffHz),
    filterResonance: bounded(source.filterResonance, 0, 98, DEFAULT_SYNTH_SETTINGS.filterResonance),
    filterEnvelope: bounded(source.filterEnvelope, -100, 100, DEFAULT_SYNTH_SETTINGS.filterEnvelope),
    lfoTarget: isLfoTarget(source.lfoTarget) ? source.lfoTarget : DEFAULT_SYNTH_SETTINGS.lfoTarget,
    lfoRateHz: bounded(source.lfoRateHz, 0.05, 30, DEFAULT_SYNTH_SETTINGS.lfoRateHz),
    lfoDepth: bounded(source.lfoDepth, 0, 100, DEFAULT_SYNTH_SETTINGS.lfoDepth),
    glideMs: bounded(source.glideMs, 0, 5000, DEFAULT_SYNTH_SETTINGS.glideMs),
    glideSync: source.glideSync === true,
    glideMode: readGlideMode(source),
    glideVelocityEnabled: glideVelocity.enabled,
    glideVelocityInverted: glideVelocity.inverted,
    glideVelocityThreshold: glideVelocity.threshold,
    oscillator1Octave: Math.round(bounded(source.oscillator1Octave, -3, 3, 0)),
    oscillator2Octave: Math.round(bounded(source.oscillator2Octave, -3, 3, 0)),
    oscillator3Octave: Math.round(bounded(source.oscillator3Octave, -3, 3, 0)),
    oscillator1VelocityLimit: Math.round(bounded(source.oscillator1VelocityLimit, 0, 127, 127)),
    oscillator2VelocityLimit: Math.round(bounded(source.oscillator2VelocityLimit, 0, 127, 127)),
    oscillator3VelocityLimit: Math.round(bounded(source.oscillator3VelocityLimit, 0, 127, 127)),
  };
}

export function createSynthModuleMarkup(
  value: unknown,
  occupiedPresets: readonly boolean[] = [],
  activePreset = 1,
  bpm = 120,
  presetNames: readonly string[] = [],
): string {
  const settings = readSynthSettings(value);
  return `
    <section class="synth-editor" data-synth-editor>
      <header class="synth-editor__header">
        <nav class="synth-oscillator-tabs" role="tablist" aria-label="Osciladores">
          ${([1, 2, 3] as const).map((oscillator) => `<button type="button" role="tab"
            data-synth-oscillator-tab="${oscillator}" aria-selected="${oscillator === 1}"
            class="${oscillator === 1 ? 'is-selected' : ''}">OSC ${oscillator}</button>`).join('')}
        </nav>
        <div class="synth-editor__header-controls">
          <div class="synth-preset-group">
            ${Array.from({ length: SYNTH_PRESET_COUNT }, (_, index) => {
              const slot = index + 1;
              const name = presetNames[index]?.trim().slice(0, 20) || `Preset ${slot}`;
              const safeName = escapeSynthMarkup(name);
              return `<button class="synth-preset-button ${activePreset === slot ? 'is-selected' : ''} ${occupiedPresets[index] ? 'is-saved' : 'is-empty'}" type="button" data-synth-preset="${slot}" aria-pressed="${activePreset === slot}" aria-label="${safeName}${occupiedPresets[index] ? ', salvo' : ', vazio'}. Toque para carregar; segure para editar.">${safeName}</button>`;
            }).join('')}
          </div>
          <div class="synth-mode-controls">
            <button class="synth-voice-mode-button is-${settings.voiceMode}" type="button" data-synth-voice-mode aria-pressed="${settings.voiceMode === 'poly'}" aria-label="Synth em ${settings.voiceMode === 'mono' ? 'Mono' : 'Poly'}. Alternar para ${settings.voiceMode === 'mono' ? 'Poly' : 'Mono'}">${settings.voiceMode === 'mono' ? 'Mono' : 'Poly'}</button>
            <button class="synth-legato-button ${settings.legato ? 'is-selected' : ''}" type="button" data-synth-toggle="legato" aria-pressed="${settings.legato}">Legato</button>
          </div>
        </div>
      </header>
      <div class="synth-editor__grid">
        ${([1, 2, 3] as const).map((oscillator) => {
          const prefix = `oscillator${oscillator}` as 'oscillator1' | 'oscillator2' | 'oscillator3';
          const enabled = `${prefix}Enabled` as 'oscillator1Enabled' | 'oscillator2Enabled' | 'oscillator3Enabled';
          const volume = `${prefix}Volume` as 'oscillator1Volume' | 'oscillator2Volume' | 'oscillator3Volume';
          const velocity = `${prefix}VelocityLimit` as 'oscillator1VelocityLimit' | 'oscillator2VelocityLimit' | 'oscillator3VelocityLimit';
          const octave = `${prefix}Octave` as 'oscillator1Octave' | 'oscillator2Octave' | 'oscillator3Octave';
          const detune = `${prefix}DetuneCents` as 'oscillator1DetuneCents' | 'oscillator2DetuneCents' | 'oscillator3DetuneCents';
          return `<section class="synth-oscillator-page${oscillator === 1 ? ' is-selected' : ''}" data-synth-oscillator-page="${oscillator}"${oscillator === 1 ? '' : ' hidden'}>
            ${oscillatorCard(`OSC ${oscillator}`, prefix, settings[prefix], settings[enabled], settings[velocity])}
            ${rangeCard(`Volume OSC ${oscillator}`, volume, settings[volume], 0, 100, 1, formatOscillatorVolume(settings[volume]))}
            ${rangeCard(`Detune OSC ${oscillator}`, detune, settings[detune], -100, 100, 1, `${Math.round(settings[detune])} cent`)}
            <article class="synth-card synth-card--octaves">
              <div class="synth-octave-row"><span>OSC ${oscillator} <strong data-synth-octave-value="${octave}">${settings[octave] > 0 ? '+' : ''}${settings[octave]}</strong></span>
                <button class="${settings[octave] < 0 ? 'is-selected' : ''}" type="button" data-synth-octave="${octave}" data-synth-octave-direction="-1" aria-pressed="${settings[octave] < 0}" ${settings[octave] <= -3 ? 'disabled' : ''}>OCT −</button>
                <button class="${settings[octave] > 0 ? 'is-selected' : ''}" type="button" data-synth-octave="${octave}" data-synth-octave-direction="1" aria-pressed="${settings[octave] > 0}" ${settings[octave] >= 3 ? 'disabled' : ''}>OCT +</button>
              </div>
            </article>
          </section>`;
        }).join('')}
        ${rangeCard('Attack', 'attackMs', settings.attackMs, 0, 15000, 1, formatMs(settings.attackMs))}
        ${rangeCard('Hold', 'holdMs', settings.holdMs, 0, 15000, 1, formatMs(settings.holdMs))}
        ${rangeCard('Decay', 'decayMs', settings.decayMs, 0, 25000, 1, formatMs(settings.decayMs))}
        ${rangeCard('Release', 'releaseMs', settings.releaseMs, 0, 25000, 1, formatMs(settings.releaseMs))}
        ${rangeCard('Cutoff', 'filterCutoffHz', cutoffPosition(settings.filterCutoffHz), 0, 100, 0.1, formatHz(settings.filterCutoffHz), 'cutoff')}
        ${rangeCard('Resonance', 'filterResonance', settings.filterResonance, 0, 98, 1, `${Math.round(settings.filterResonance)}%`)}
        ${rangeCard('Filter Env', 'filterEnvelope', settings.filterEnvelope, -100, 100, 1, `${Math.round(settings.filterEnvelope)}%`)}
        <article class="synth-card synth-card--target">
          <span>LFO destino</span>
          <div class="synth-option-row">
            ${LFO_TARGETS.map((target) => `<button class="${settings.lfoTarget === target ? 'is-selected' : ''}" type="button" data-synth-lfo-target="${target}" aria-pressed="${settings.lfoTarget === target}">${lfoTargetLabel(target)}</button>`).join('')}
          </div>
        </article>
        ${rangeCard('LFO Rate', 'lfoRateHz', settings.lfoRateHz, 0.05, 30, 0.05, `${settings.lfoRateHz.toFixed(2)} Hz`)}
        ${rangeCard('LFO Depth', 'lfoDepth', settings.lfoDepth, 0, 100, 1, `${Math.round(settings.lfoDepth)}%`)}
        ${createGlideCardMarkup(settings as unknown as Readonly<Record<string, unknown>>, bpm, 'synth')}
      </div>
    </section>
  `;
}

function escapeSynthMarkup(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

export function updateSynthRangeOutput(input: HTMLInputElement): number {
  const parameter = input.dataset.synthParameter;
  const raw = Number(input.value);
  const value = input.dataset.synthScale === 'cutoff' ? cutoffFromPosition(raw) : raw;
  const card = input.closest<HTMLElement>('.synth-card');
  const knob = input.closest<HTMLElement>('.module-envelope-knob');
  const minimum = Number(input.min);
  const maximum = Number(input.max);
  const progress = Number.isFinite(minimum) && Number.isFinite(maximum) && maximum > minimum
    ? Math.min(1, Math.max(0, (raw - minimum) / (maximum - minimum)))
    : 0;
  knob?.style.setProperty('--knob-angle', `${-135 + progress * 270}deg`);
  knob?.style.setProperty('--knob-progress', String(progress));
  const formatted = parameter === 'oscillator1Volume' || parameter === 'oscillator2Volume' || parameter === 'oscillator3Volume' ? formatOscillatorVolume(value)
      : parameter === 'filterCutoffHz' ? formatHz(value)
      : parameter === 'attackMs' || parameter === 'holdMs' || parameter === 'decayMs'
        || parameter === 'releaseMs' || parameter === 'glideMs' ? formatMs(value)
        : parameter === 'oscillator1VelocityLimit' || parameter === 'oscillator2VelocityLimit' || parameter === 'oscillator3VelocityLimit' ? `${Math.round(value)}`
        : parameter === 'oscillator1DetuneCents' || parameter === 'oscillator2DetuneCents' || parameter === 'oscillator3DetuneCents' ? `${Math.round(value)} cent`
          : parameter === 'lfoRateHz' ? `${value.toFixed(2)} Hz`
            : `${Math.round(value)}%`;
  input.setAttribute('aria-valuetext', formatted);
  const output = card?.querySelector<HTMLOutputElement>('output');
  if (output) output.value = formatted;
  return value;
}

export function synthOscillatorIndex(value: SynthOscillator): number {
  return OSCILLATORS.indexOf(value);
}

export function synthLfoTargetIndex(value: SynthLfoTarget): number {
  return LFO_TARGETS.indexOf(value);
}

function oscillatorCard(
  label: string,
  parameter: 'oscillator1' | 'oscillator2' | 'oscillator3',
  selected: SynthOscillator,
  enabled: boolean,
  velocityLimit: number,
): string {
  const enabledParameter = `${parameter}Enabled`;
  return `
    <article class="synth-card synth-card--oscillator">
      <span>${label}</span>
      <div class="synth-oscillator-power-row">
        <label class="synth-velocity-limit">
          ${createParameterKnobMarkup(velocityLimit / 127, `
            <input type="range" min="0" max="127" step="1" value="${velocityLimit}"
              data-synth-parameter="${parameter}VelocityLimit" aria-label="Limite de velocity do ${label}" aria-valuetext="${velocityLimit}">
          `)}
          <span>Limite Vel</span>
          <output>${velocityLimit}</output>
        </label>
        <button class="synth-oscillator-power ${enabled ? 'is-on' : 'is-off'}" type="button"
          data-synth-oscillator-power="${enabledParameter}" aria-pressed="${enabled}"
          aria-label="${enabled ? 'Desativar' : 'Ativar'} ${label}">${enabled ? 'ON' : 'OFF'}</button>
      </div>
      <div class="synth-option-row">
        ${OSCILLATORS.map((oscillator) => `<button class="${selected === oscillator ? 'is-selected' : ''}" type="button" data-synth-oscillator="${parameter}:${oscillator}" aria-pressed="${selected === oscillator}">${oscillatorLabel(oscillator)}</button>`).join('')}
      </div>
    </article>
  `;
}

function rangeCard(label: string, parameter: keyof SynthModuleSettings, value: number, min: number, max: number, step: number, formatted: string, scale = ''): string {
  const progress = Math.min(1, Math.max(0, (value - min) / (max - min)));
  return `
    <article class="synth-card synth-card--range">
      <span>${label}</span>
      ${createParameterKnobMarkup(progress, `
        <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-synth-parameter="${parameter}"${scale ? ` data-synth-scale="${scale}"` : ''} aria-label="${label}" aria-valuetext="${formatted}">
      `)}
      <output>${formatted}</output>
    </article>
  `;
}

function cutoffPosition(frequency: number): number {
  return Math.log(frequency / 20) / Math.log(1000) * 100;
}

function cutoffFromPosition(position: number): number {
  return 20 * 1000 ** (Math.min(100, Math.max(0, position)) / 100);
}

function formatMs(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 1 : 2)} s` : `${Math.round(value)} ms`;
}

function formatHz(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 1 : 2)} kHz` : `${Math.round(value)} Hz`;
}

// The knob stores its position (0-100). A linear gain put almost the whole
// audible change in the last tenth of the turn, so the position follows the
// module fader's dB curve instead (0 dB at the top, silence at zero). The tail
// continues down to -90 dB so the last step into silence is inaudible.
const OSCILLATOR_VOLUME_CURVE: readonly { position: number; db: number }[] = [
  { position: 0, db: -90 },
  { position: 8, db: -60 },
  { position: 24, db: -36 },
  { position: 48, db: -18 },
  { position: 72, db: -9 },
  { position: 100, db: 0 },
];

function oscillatorVolumeDb(position: number): number {
  const safe = Math.min(100, Math.max(0, position));
  for (let index = 1; index < OSCILLATOR_VOLUME_CURVE.length; index += 1) {
    const start = OSCILLATOR_VOLUME_CURVE[index - 1]!;
    const end = OSCILLATOR_VOLUME_CURVE[index]!;
    if (safe <= end.position) {
      return start.db + (safe - start.position) / (end.position - start.position) * (end.db - start.db);
    }
  }
  return 0;
}

/** Linear gain the native Synth receives for a stored OSC volume position. */
export function oscillatorVolumeGain(position: number): number {
  return position <= 0 ? 0 : 10 ** (oscillatorVolumeDb(position) / 20);
}

export function formatOscillatorVolume(value: number): string {
  if (value <= 0) return '−∞ dB';
  return `${oscillatorVolumeDb(value).toFixed(1)} dB`;
}

function oscillatorLabel(value: SynthOscillator): string {
  return value === 'sine' ? 'Sine' : value === 'saw' ? 'Saw' : value === 'square' ? 'Square' : 'Triangle';
}

function lfoTargetLabel(value: SynthLfoTarget): string {
  return value === 'pitch' ? 'Pitch' : value === 'filter' ? 'Filter' : 'Volume';
}

function isOscillator(value: unknown): value is SynthOscillator {
  return typeof value === 'string' && (OSCILLATORS as readonly string[]).includes(value);
}

function isLfoTarget(value: unknown): value is SynthLfoTarget {
  return typeof value === 'string' && (LFO_TARGETS as readonly string[]).includes(value);
}

function bounded(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
