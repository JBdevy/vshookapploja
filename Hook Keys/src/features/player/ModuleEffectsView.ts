export type ModuleEffectKind = 'compressor' | 'reverb' | 'delay';
export type ModuleProcessorReplacement = 'compressor' | 'arpeggiator' | 'sequencer' | 'synth';

export interface ModuleCompressorSettings {
  enabled: boolean;
  thresholdDb: number;
  ratio: number;
  gainDb: number;
  attackMs: number;
  releaseMs: number;
  mix: number;
}

export interface ModuleReverbSettings {
  enabled: boolean;
  decay: number;
  dampen: number;
  size: number;
  mix: number;
}

export interface ModuleDelaySettings {
  enabled: boolean;
  feedback: number;
  mix: number;
  division: string;
  milliseconds: number;
  sync: boolean;
}

export const DELAY_DIVISIONS = ['1/1', '1/2', '1/4', '1/8', '1/16', '1/8 D', '1/8 T'] as const;

const DEFAULT_COMPRESSOR: ModuleCompressorSettings = {
  enabled: false,
  thresholdDb: -18,
  ratio: 4,
  gainDb: 0,
  attackMs: 16,
  releaseMs: 160,
  mix: 100,
};

const DEFAULT_REVERB: ModuleReverbSettings = {
  enabled: false,
  decay: 2.5,
  dampen: 50,
  size: 60,
  mix: 25,
};

const DEFAULT_DELAY: ModuleDelaySettings = {
  enabled: false,
  feedback: 35,
  mix: 25,
  division: '1/4',
  milliseconds: 500,
  sync: false,
};

interface EffectControlDefinition {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  formatted: string;
}

export function createModuleEffectCardsMarkup(
  settings: Readonly<Record<string, unknown>>,
  bpm: number,
  replacement: ModuleProcessorReplacement = 'compressor',
): string {
  const compressor = readModuleCompressorSettings(settings.compressor);
  const reverb = readModuleReverbSettings(settings.reverb);
  const delay = readModuleDelaySettings(settings.delay);
  const delayMilliseconds = delay.sync ? delayMillisecondsForBpm(bpm, delay.division) : delay.milliseconds;
  return `
      ${replacement === 'compressor' ? `
      <article class="module-effect-card module-effect-card--compressor${compressor.enabled ? ' is-enabled' : ' is-disabled'}">
        <button type="button" data-module-setting-action="open-compressor">Compressor</button>
        <div class="module-compressor-preview" aria-label="Prévia do compressor">
          <span class="module-compressor-preview__meter"><i style="--effect-meter:0%"></i></span>
          <strong>${compressor.ratio.toFixed(1)}:1</strong>
          <span class="module-compressor-preview__meter module-compressor-preview__meter--output"><i style="--effect-meter:0%"></i></span>
          <small>${formatSignedDb(compressor.thresholdDb)}</small>
          <small>Ratio</small>
          <small>${formatSignedDb(compressor.gainDb)}</small>
        </div>
      </article>
      ` : createProcessorShortcutCard(replacement)}

      <article class="module-effect-card module-effect-card--reverb${reverb.enabled ? ' is-enabled' : ' is-disabled'}">
        <button type="button" data-module-setting-action="open-reverb">Reverb</button>
        <div class="module-reverb-preview" aria-label="Prévia do reverb">
          ${createPreviewKnob('Decay', compressorRatio(reverb.decay, 0.1, 20))}
          ${createPreviewKnob('Dampen', reverb.dampen / 100)}
          ${createPreviewKnob('Size', reverb.size / 100)}
          ${createPreviewKnob('Mix', reverb.mix / 100)}
        </div>
      </article>

      <article class="module-effect-card module-effect-card--delay${delay.enabled ? ' is-enabled' : ' is-disabled'}">
        <button type="button" data-module-setting-action="open-delay">Delay</button>
        <div class="module-delay-preview" aria-label="Prévia do delay">
          <span><strong>${delay.division}</strong><small>Divisão</small></span>
          <span><strong>${delay.sync ? `${Math.round(bpm)} BPM` : Math.round(delayMilliseconds)}</strong><small>${delay.sync ? 'Sync' : 'ms'}</small></span>
          <span><strong>${Math.round(delay.feedback)}%</strong><small>Feedback</small></span>
          <span><strong>${Math.round(delay.mix)}%</strong><small>Mix</small></span>
        </div>
      </article>
  `;
}

function createProcessorShortcutCard(replacement: Exclude<ModuleProcessorReplacement, 'compressor'>): string {
  const label = replacement === 'arpeggiator'
    ? 'Arpeggiator'
    : replacement === 'sequencer' ? 'Sequencer' : 'Synth';
  return `
    <article class="module-effect-card module-effect-card--processor-shortcuts" aria-label="Processadores do módulo">
      <button class="module-processor-shortcut module-processor-shortcut--compressor" type="button" data-module-setting-action="open-compressor">Compressor</button>
      <button class="module-processor-shortcut module-processor-shortcut--${replacement}" type="button" data-module-setting-action="open-${replacement}">${label}</button>
    </article>
  `;
}

export function createModuleCompressorMarkup(settings: Readonly<Record<string, unknown>>): string {
  const value = readModuleCompressorSettings(settings.compressor);
  const controls: EffectControlDefinition[] = [
    control('thresholdDb', 'Threshold', -60, 0, 0.1, value.thresholdDb, formatSignedDb(value.thresholdDb)),
    control('ratio', 'Ratio', 1, 20, 0.1, value.ratio, `${value.ratio.toFixed(1)}:1`),
    control('gainDb', 'Gain', 0, 24, 0.1, value.gainDb, formatSignedDb(value.gainDb)),
    control('attackMs', 'Attack', 0.1, 100, 0.1, value.attackMs, `${formatNumber(value.attackMs)} ms`),
    control('releaseMs', 'Release', 10, 1_000, 1, value.releaseMs, `${Math.round(value.releaseMs)} ms`),
    control('mix', 'Mix', 0, 100, 1, value.mix, `${Math.round(value.mix)}%`),
  ];
  return `
    <section class="module-effect-editor module-compressor-editor" data-module-effect-editor="compressor">
      <div class="module-compressor-editor__meters" aria-label="Medidores do compressor">
        ${createVerticalMeter('Input')}
        <div class="module-compressor-editor__ratio">
          <span>Ratio</span>
          <strong data-compressor-ratio>${value.ratio.toFixed(1)}:1</strong>
          <i aria-hidden="true"></i>
        </div>
        ${createVerticalMeter('Output')}
      </div>
      <div class="module-effect-controls module-effect-controls--compressor">
        ${controls.map((item) => createEffectKnob('compressor', item)).join('')}
      </div>
    </section>
  `;
}

export function createModuleReverbMarkup(settings: Readonly<Record<string, unknown>>): string {
  const value = readModuleReverbSettings(settings.reverb);
  const controls: EffectControlDefinition[] = [
    control('decay', 'Decay', 0.1, 20, 0.1, value.decay, `${formatNumber(value.decay)} s`),
    control('dampen', 'Dampen', 0, 100, 1, value.dampen, `${Math.round(value.dampen)}%`),
    control('size', 'Size', 0, 100, 1, value.size, `${Math.round(value.size)}%`),
    control('mix', 'Mix', 0, 100, 1, value.mix, `${Math.round(value.mix)}%`),
  ];
  return `
    <section class="module-effect-editor module-reverb-editor" data-module-effect-editor="reverb">
      <div class="module-effect-controls module-effect-controls--reverb">
        ${controls.map((item) => createEffectKnob('reverb', item)).join('')}
      </div>
    </section>
  `;
}

export function createModuleDelayMarkup(settings: Readonly<Record<string, unknown>>, bpm: number): string {
  const value = readModuleDelaySettings(settings.delay);
  const milliseconds = value.sync ? delayMillisecondsForBpm(bpm, value.division) : value.milliseconds;
  const controls: EffectControlDefinition[] = [
    control('feedback', 'Feedback', 0, 95, 1, value.feedback, `${Math.round(value.feedback)}%`),
    control('mix', 'Mix', 0, 100, 1, value.mix, `${Math.round(value.mix)}%`),
    control('milliseconds', 'Delay', 1, 2_000, 1, milliseconds, value.sync ? `${Math.round(bpm)} BPM` : `${Math.round(milliseconds)} ms`),
  ];
  return `
    <section class="module-effect-editor module-delay-editor" data-module-effect-editor="delay">
      <div class="module-delay-editor__display">
        <button type="button" data-module-delay-tap${value.sync ? ' disabled' : ''}>Tap</button>
        <output data-module-delay-display>${value.sync ? `${Math.round(bpm)} BPM` : `${Math.round(milliseconds)} ms`}</output>
      </div>
      <div class="module-delay-editor__divisions" role="group" aria-label="Divisão do delay">
        ${DELAY_DIVISIONS.map((division) => `
          <button type="button" data-module-delay-division="${division}" class="${division === value.division ? 'is-selected' : ''}" aria-pressed="${division === value.division}">${division}</button>
        `).join('')}
        <button type="button" data-module-delay-sync class="${value.sync ? 'is-selected' : ''}" aria-pressed="${value.sync}">Sync</button>
      </div>
      <div class="module-effect-controls module-effect-controls--delay">
        ${controls.map((item) => createEffectKnob('delay', item, item.key === 'milliseconds' && value.sync)).join('')}
      </div>
    </section>
  `;
}

export function readModuleCompressorSettings(value: unknown): ModuleCompressorSettings {
  const source = record(value);
  return {
    enabled: source.enabled === true,
    thresholdDb: numberInRange(source.thresholdDb, -60, 0, DEFAULT_COMPRESSOR.thresholdDb),
    ratio: numberInRange(source.ratio, 1, 20, DEFAULT_COMPRESSOR.ratio),
    gainDb: numberInRange(source.gainDb, 0, 24, DEFAULT_COMPRESSOR.gainDb),
    attackMs: numberInRange(source.attackMs, 0.1, 100, DEFAULT_COMPRESSOR.attackMs),
    releaseMs: numberInRange(source.releaseMs, 10, 1_000, DEFAULT_COMPRESSOR.releaseMs),
    mix: numberInRange(source.mix, 0, 100, DEFAULT_COMPRESSOR.mix),
  };
}

export function readModuleReverbSettings(value: unknown): ModuleReverbSettings {
  const source = record(value);
  return {
    enabled: source.enabled === true,
    decay: numberInRange(source.decay, 0.1, 20, DEFAULT_REVERB.decay),
    dampen: numberInRange(source.dampen, 0, 100, DEFAULT_REVERB.dampen),
    size: numberInRange(source.size, 0, 100, DEFAULT_REVERB.size),
    mix: numberInRange(source.mix, 0, 100, DEFAULT_REVERB.mix),
  };
}

export function readModuleDelaySettings(value: unknown): ModuleDelaySettings {
  const source = record(value);
  const division = typeof source.division === 'string' && (DELAY_DIVISIONS as readonly string[]).includes(source.division)
    ? source.division
    : DEFAULT_DELAY.division;
  return {
    enabled: source.enabled === true,
    feedback: numberInRange(source.feedback, 0, 95, DEFAULT_DELAY.feedback),
    mix: numberInRange(source.mix, 0, 100, DEFAULT_DELAY.mix),
    division,
    milliseconds: numberInRange(source.milliseconds, 1, 2_000, DEFAULT_DELAY.milliseconds),
    sync: source.sync === true,
  };
}

export function formatModuleEffectValue(kind: ModuleEffectKind, key: string, value: number): string {
  if (kind === 'compressor') {
    if (key === 'ratio') return `${value.toFixed(1)}:1`;
    if (key === 'thresholdDb' || key === 'gainDb') return formatSignedDb(value);
    if (key === 'mix') return `${Math.round(value)}%`;
    return `${key === 'releaseMs' ? Math.round(value) : formatNumber(value)} ms`;
  }
  if (kind === 'reverb') return key === 'decay' ? `${formatNumber(value)} s` : `${Math.round(value)}%`;
  return key === 'milliseconds' ? `${Math.round(value)} ms` : `${Math.round(value)}%`;
}

function createEffectKnob(kind: ModuleEffectKind, item: EffectControlDefinition, disabled = false): string {
  const progress = (item.value - item.min) / (item.max - item.min);
  const angle = -135 + progress * 270;
  return `
    <label class="module-effect-knob" style="--knob-angle:${angle}deg;--knob-progress:${progress}">
      <span>${item.label}</span>
      <span class="module-effect-knob__face" aria-hidden="true"><i></i></span>
      <input type="range" min="${item.min}" max="${item.max}" step="${item.step}" value="${item.value}" data-module-effect-kind="${kind}" data-module-effect-control="${item.key}" aria-label="${item.label}" aria-valuetext="${item.formatted}"${disabled ? ' disabled' : ''}>
      <output data-module-effect-output="${item.key}">${item.formatted}</output>
    </label>
  `;
}

function createVerticalMeter(label: string): string {
  return `<div class="module-compressor-meter"><span>${label}</span><i><b></b></i><small>−∞</small></div>`;
}

function createPreviewKnob(label: string, progress: number): string {
  const angle = -135 + Math.min(1, Math.max(0, progress)) * 270;
  return `<span class="module-effect-preview-knob" style="--knob-angle:${angle}deg"><i></i><small>${label}</small></span>`;
}

function control(key: string, label: string, min: number, max: number, step: number, value: number, formatted: string): EffectControlDefinition {
  return { key, label, min, max, step, value, formatted };
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberInRange(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function formatSignedDb(value: number): string {
  return `${value > 0 ? '+' : ''}${formatNumber(value)} dB`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function compressorRatio(value: number, min: number, max: number): number {
  return (value - min) / (max - min);
}

export function delayMillisecondsForBpm(bpm: number, division: string): number {
  const safeBpm = Math.min(600, Math.max(60, Number.isFinite(bpm) ? bpm : 120));
  const multiplier = division === '1/1' ? 4
    : division === '1/2' ? 2
      : division === '1/8' ? 0.5
        : division === '1/16' ? 0.25
          : division === '1/8 D' ? 0.75
            : division === '1/8 T' ? 1 / 3
              : 1;
  return Math.min(2_000, Math.max(1, Math.round((60_000 / safeBpm) * multiplier)));
}
