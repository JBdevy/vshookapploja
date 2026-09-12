export type SynthOscillator = 'sine' | 'saw' | 'square' | 'triangle';
export type SynthVoiceMode = 'mono' | 'poly';
export type SynthLfoTarget = 'pitch' | 'filter' | 'volume';

export interface SynthModuleSettings {
  oscillator1: SynthOscillator;
  oscillator2: SynthOscillator;
  voiceMode: SynthVoiceMode;
  legato: boolean;
  oscillatorMix: number;
  detuneCents: number;
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
}

export const DEFAULT_SYNTH_SETTINGS: Readonly<SynthModuleSettings> = Object.freeze({
  oscillator1: 'saw',
  oscillator2: 'square',
  voiceMode: 'mono',
  legato: true,
  oscillatorMix: 35,
  detuneCents: 7,
  attackMs: 0,
  holdMs: 15000,
  decayMs: 25000,
  sustain: 100,
  releaseMs: 100,
  filterCutoffHz: 20000,
  filterResonance: 18,
  filterEnvelope: 24,
  lfoTarget: 'filter',
  lfoRateHz: 4,
  lfoDepth: 0,
  glideMs: 45,
});

const OSCILLATORS: readonly SynthOscillator[] = ['sine', 'saw', 'square', 'triangle'];
const LFO_TARGETS: readonly SynthLfoTarget[] = ['pitch', 'filter', 'volume'];

export function readSynthSettings(value: unknown): SynthModuleSettings {
  const source = isRecord(value) ? value : {};
  return {
    oscillator1: isOscillator(source.oscillator1) ? source.oscillator1 : DEFAULT_SYNTH_SETTINGS.oscillator1,
    oscillator2: isOscillator(source.oscillator2) ? source.oscillator2 : DEFAULT_SYNTH_SETTINGS.oscillator2,
    voiceMode: source.voiceMode === 'poly' ? 'poly' : 'mono',
    legato: typeof source.legato === 'boolean' ? source.legato : DEFAULT_SYNTH_SETTINGS.legato,
    oscillatorMix: bounded(source.oscillatorMix, 0, 100, DEFAULT_SYNTH_SETTINGS.oscillatorMix),
    detuneCents: bounded(source.detuneCents, -100, 100, DEFAULT_SYNTH_SETTINGS.detuneCents),
    attackMs: bounded(source.attackMs, 0, 15000, DEFAULT_SYNTH_SETTINGS.attackMs),
    holdMs: bounded(source.holdMs, 0, 15000, DEFAULT_SYNTH_SETTINGS.holdMs),
    decayMs: bounded(source.decayMs, 0, 25000, DEFAULT_SYNTH_SETTINGS.decayMs),
    sustain: bounded(source.sustain, 0, 100, DEFAULT_SYNTH_SETTINGS.sustain),
    releaseMs: bounded(source.releaseMs, 0, 25000, DEFAULT_SYNTH_SETTINGS.releaseMs),
    filterCutoffHz: bounded(source.filterCutoffHz, 20, 20000, DEFAULT_SYNTH_SETTINGS.filterCutoffHz),
    filterResonance: bounded(source.filterResonance, 0, 98, DEFAULT_SYNTH_SETTINGS.filterResonance),
    filterEnvelope: bounded(source.filterEnvelope, -100, 100, DEFAULT_SYNTH_SETTINGS.filterEnvelope),
    lfoTarget: isLfoTarget(source.lfoTarget) ? source.lfoTarget : DEFAULT_SYNTH_SETTINGS.lfoTarget,
    lfoRateHz: bounded(source.lfoRateHz, 0.05, 30, DEFAULT_SYNTH_SETTINGS.lfoRateHz),
    lfoDepth: bounded(source.lfoDepth, 0, 100, DEFAULT_SYNTH_SETTINGS.lfoDepth),
    glideMs: bounded(source.glideMs, 0, 5000, DEFAULT_SYNTH_SETTINGS.glideMs),
  };
}

export function createSynthModuleMarkup(value: unknown): string {
  const settings = readSynthSettings(value);
  return `
    <section class="synth-editor" data-synth-editor>
      <header class="synth-editor__header">
        <div><span>Sintetizador</span><strong>Dual Oscillator Synth</strong></div>
        <button class="${settings.legato ? 'is-selected' : ''}" type="button" data-synth-toggle="legato" aria-pressed="${settings.legato}">Legato</button>
      </header>
      <div class="synth-editor__grid">
        ${oscillatorCard('OSC 1', 'oscillator1', settings.oscillator1)}
        ${oscillatorCard('OSC 2', 'oscillator2', settings.oscillator2)}
        ${rangeCard('Mix OSC 2', 'oscillatorMix', settings.oscillatorMix, 0, 100, 1, `${Math.round(settings.oscillatorMix)}%`)}
        ${rangeCard('Detune', 'detuneCents', settings.detuneCents, -100, 100, 1, `${Math.round(settings.detuneCents)} cent`)}
        ${rangeCard('Attack', 'attackMs', settings.attackMs, 0, 15000, 1, formatMs(settings.attackMs))}
        ${rangeCard('Hold', 'holdMs', settings.holdMs, 0, 15000, 1, formatMs(settings.holdMs))}
        ${rangeCard('Decay', 'decayMs', settings.decayMs, 0, 25000, 1, formatMs(settings.decayMs))}
        ${rangeCard('Sustain', 'sustain', settings.sustain, 0, 100, 1, `${Math.round(settings.sustain)}%`)}
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
        ${rangeCard('Glide', 'glideMs', settings.glideMs, 0, 5000, 1, formatMs(settings.glideMs))}
      </div>
    </section>
  `;
}

export function updateSynthRangeOutput(input: HTMLInputElement): number {
  const parameter = input.dataset.synthParameter;
  const raw = Number(input.value);
  const value = input.dataset.synthScale === 'cutoff' ? cutoffFromPosition(raw) : raw;
  const knob = input.closest<HTMLElement>('.synth-card');
  const minimum = Number(input.min);
  const maximum = Number(input.max);
  const progress = Number.isFinite(minimum) && Number.isFinite(maximum) && maximum > minimum
    ? Math.min(1, Math.max(0, (raw - minimum) / (maximum - minimum)))
    : 0;
  knob?.style.setProperty('--knob-angle', `${-135 + progress * 270}deg`);
  knob?.style.setProperty('--knob-progress', String(progress));
  const output = knob?.querySelector<HTMLOutputElement>('output');
  if (output) {
    output.value = parameter === 'filterCutoffHz' ? formatHz(value)
      : parameter === 'attackMs' || parameter === 'holdMs' || parameter === 'decayMs'
        || parameter === 'releaseMs' || parameter === 'glideMs' ? formatMs(value)
        : parameter === 'detuneCents' ? `${Math.round(value)} cent`
          : parameter === 'lfoRateHz' ? `${value.toFixed(2)} Hz`
            : `${Math.round(value)}%`;
  }
  return value;
}

export function synthOscillatorIndex(value: SynthOscillator): number {
  return OSCILLATORS.indexOf(value);
}

export function synthLfoTargetIndex(value: SynthLfoTarget): number {
  return LFO_TARGETS.indexOf(value);
}

function oscillatorCard(label: string, parameter: 'oscillator1' | 'oscillator2', selected: SynthOscillator): string {
  return `
    <article class="synth-card synth-card--oscillator">
      <span>${label}</span>
      <div class="synth-option-row">
        ${OSCILLATORS.map((oscillator) => `<button class="${selected === oscillator ? 'is-selected' : ''}" type="button" data-synth-oscillator="${parameter}:${oscillator}" aria-pressed="${selected === oscillator}">${oscillatorLabel(oscillator)}</button>`).join('')}
      </div>
    </article>
  `;
}

function rangeCard(label: string, parameter: keyof SynthModuleSettings, value: number, min: number, max: number, step: number, formatted: string, scale = ''): string {
  const progress = Math.min(1, Math.max(0, (value - min) / (max - min)));
  const angle = -135 + progress * 270;
  return `
    <label class="synth-card synth-card--range module-effect-knob" style="--knob-angle:${angle}deg;--knob-progress:${progress}">
      <span>${label}</span>
      <span class="module-effect-knob__face" aria-hidden="true"><i></i></span>
      <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-synth-parameter="${parameter}"${scale ? ` data-synth-scale="${scale}"` : ''} aria-label="${label}" aria-valuetext="${formatted}">
      <output>${formatted}</output>
    </label>
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
