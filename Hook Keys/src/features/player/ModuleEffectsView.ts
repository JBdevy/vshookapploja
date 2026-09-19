import { createParameterKnobMarkup } from './ParameterKnobView';

export type ModuleEffectKind = 'compressor' | 'reverb' | 'delay' | 'rotary' | 'chorus' | 'cutoffEnvelope';
export type ModuleProcessorReplacement =
  'compressor' | 'chorus' | 'rotary' | 'arpeggiator' | 'trance-gate' | 'organ' | 'synth';

export type RotarySpeed = 'brake' | 'slow' | 'fast';
export interface ModuleRotarySettings {
  enabled: boolean;
  modulationEnabled: boolean;
  speed: RotarySpeed;
  slowHz: number;
  fastHz: number;
  rampSeconds: number;
  depth: number;
  mix: number;
}

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
  // Balança a leitura das linhas de atraso numa taxa fixa: dá o "shimmer" de
  // reverbs de sala/prato de verdade. 0 desliga.
  mod: number;
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

// LP2/HP2: um estágio (12 dB/oitava), o filtro de sempre. LP4/HP4: dois em
// série (24 dB/oitava, curva mais íngreme). Lowpass corta os agudos; Highpass
// é o mesmo filtro ao contrário, cortando os graves.
export const CUTOFF_FILTER_TYPES = ['lowpass2', 'lowpass4', 'highpass2', 'highpass4'] as const;
export type CutoffFilterType = typeof CUTOFF_FILTER_TYPES[number];

export interface ModuleCutoffEnvelopeSettings {
  enabled: boolean;
  attackMs: number;
  decayMs: number;
  sustain: number;
  releaseMs: number;
  depthOctaves: number;
}

// Attack abaixo de 1 ms faz o compressor sujar o som, então 1 ms é o mínimo
// do knob e também do que se lê de um preset salvo.
const MIN_COMPRESSOR_ATTACK_MS = 1;

const DEFAULT_COMPRESSOR: ModuleCompressorSettings = {
  enabled: false,
  thresholdDb: -30,
  ratio: 4,
  gainDb: 6,
  attackMs: MIN_COMPRESSOR_ATTACK_MS,
  releaseMs: 10,
  mix: 100,
};

const DEFAULT_REVERB: ModuleReverbSettings = {
  enabled: false,
  decay: 2.5,
  dampen: 50,
  mod: 0,
  size: 60,
  mix: 25,
};

// Reverb com que todo módulo nasce (e para onde o Reset do Reverb volta).
export const FACTORY_MODULE_REVERB: ModuleReverbSettings = {
  enabled: true,
  decay: 10,
  dampen: 50,
  mod: 0,
  size: 0,
  mix: 50,
};

const DEFAULT_DELAY: ModuleDelaySettings = {
  enabled: false,
  feedback: 35,
  mix: 25,
  division: '1/4',
  milliseconds: 500,
  sync: false,
};

const DEFAULT_ROTARY: ModuleRotarySettings = {
  enabled: false,
  modulationEnabled: false,
  speed: 'slow',
  slowHz: 0.8,
  fastHz: 6.4,
  rampSeconds: 1.2,
  depth: 70,
  mix: 100,
};

const DEFAULT_CUTOFF_ENVELOPE: ModuleCutoffEnvelopeSettings = {
  enabled: false,
  attackMs: 5,
  decayMs: 200,
  sustain: 100,
  releaseMs: 200,
  depthOctaves: 4,
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
  const delayMilliseconds = delay.sync ? delayMillisecondsForBpm(bpm, '1/4') : delay.milliseconds;
  return `
      ${createProcessorShortcutCard(
        replacement === 'compressor' || replacement === 'synth' ? 'chorus' : replacement,
        compressor.enabled,
        readModuleChorusSettings(settings.chorus).enabled,
      )}

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

// O compressor não tem prévia em lugar nenhum: é só o botão, com o segundo
// processador do módulo logo abaixo.
function createProcessorShortcutCard(
  replacement: Exclude<ModuleProcessorReplacement, 'compressor' | 'synth'>,
  compressorEnabled: boolean,
  chorusEnabled: boolean,
): string {
  const label = replacement === 'arpeggiator'
    ? 'Arpeggiator'
    : replacement === 'trance-gate' ? 'Pulse'
      : replacement === 'organ' ? 'Organ'
      : replacement === 'rotary' ? 'Rotary' : 'Chorus';
  const secondEnabled = replacement === 'chorus' ? chorusEnabled : null;
  return `
    <article class="module-effect-card module-effect-card--processor-shortcuts" aria-label="Processadores do módulo">
      <button class="module-processor-shortcut module-processor-shortcut--compressor${compressorEnabled ? ' is-enabled' : ''}" type="button" data-module-setting-action="open-compressor">Compressor</button>
      <button class="module-processor-shortcut module-processor-shortcut--${replacement}${secondEnabled ? ' is-enabled' : ''}" type="button" data-module-setting-action="open-${replacement}">${label}</button>
    </article>
  `;
}

export function createModuleCompressorMarkup(settings: Readonly<Record<string, unknown>>): string {
  const value = readModuleCompressorSettings(settings.compressor);
  const controls: EffectControlDefinition[] = [
    control('thresholdDb', 'Threshold', -60, 0, 0.1, value.thresholdDb, formatSignedDb(value.thresholdDb)),
    control('ratio', 'Ratio', 1, 20, 0.1, value.ratio, `${value.ratio.toFixed(1)}:1`),
    control('gainDb', 'Gain', 0, 24, 0.1, value.gainDb, formatSignedDb(value.gainDb)),
    control('attackMs', 'Attack', MIN_COMPRESSOR_ATTACK_MS, 100, 0.1, value.attackMs, `${formatNumber(value.attackMs)} ms`),
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

// Três ambientes prontos: o botão só escreve Decay, Dampen e Size; o Mix
// continua sendo escolha de quem toca.
export const REVERB_SPACES = {
  room: { decay: 1.2, dampen: 62, size: 18 },
  hall: { decay: 4.5, dampen: 34, size: 78 },
  stage: { decay: 2.2, dampen: 48, size: 46 },
} as const;

export type ReverbSpace = keyof typeof REVERB_SPACES;

export function isReverbSpace(value: string | undefined): value is ReverbSpace {
  return value === 'room' || value === 'hall' || value === 'stage';
}

function currentReverbSpace(value: ModuleReverbSettings): ReverbSpace | null {
  for (const [name, space] of Object.entries(REVERB_SPACES) as [ReverbSpace, typeof REVERB_SPACES.room][]) {
    if (Math.abs(value.decay - space.decay) < 0.05
      && Math.round(value.dampen) === space.dampen
      && Math.round(value.size) === space.size) return name;
  }
  return null;
}

export function createModuleReverbMarkup(settings: Readonly<Record<string, unknown>>): string {
  const value = readModuleReverbSettings(settings.reverb);
  const space = currentReverbSpace(value);
  const controls: EffectControlDefinition[] = [
    control('decay', 'Decay', 0.1, 20, 0.1, value.decay, `${formatNumber(value.decay)} s`),
    control('dampen', 'Dampen', 0, 100, 1, value.dampen, `${Math.round(value.dampen)}%`),
    control('mod', 'Mod', 0, 100, 1, value.mod, `${Math.round(value.mod)}%`),
    control('size', 'Size', 0, 100, 1, value.size, `${Math.round(value.size)}%`),
    control('mix', 'Mix', 0, 100, 1, value.mix, `${Math.round(value.mix)}%`),
  ];
  return `
    <div class="module-reverb-page">
      <div class="module-reverb-spaces" role="group" aria-label="Ambiente do reverb">
        ${(['room', 'hall', 'stage'] as const).map((item) => `
          <button type="button" data-module-reverb-space="${item}"
            class="${item === space ? 'is-selected' : ''}"
            aria-pressed="${item === space}">${item === 'room' ? 'Room' : item === 'hall' ? 'Hall' : 'Stage'}</button>
        `).join('')}
      </div>
      <section class="module-effect-editor module-reverb-editor" data-module-effect-editor="reverb">
        <div class="module-effect-controls module-effect-controls--reverb">
          ${controls.map((item) => createEffectKnob('reverb', item)).join('')}
        </div>
      </section>
    </div>
  `;
}

export interface ModuleChorusSettings {
  enabled: boolean;
  rateHz: number;
  depth: number;
  mix: number;
}

const DEFAULT_CHORUS: ModuleChorusSettings = {
  enabled: false,
  rateHz: 0.6,
  depth: 50,
  mix: 35,
};

export function readModuleChorusSettings(value: unknown): ModuleChorusSettings {
  const source = record(value);
  return {
    enabled: source.enabled === true,
    rateHz: numberInRange(source.rateHz, 0.05, 8, DEFAULT_CHORUS.rateHz),
    depth: numberInRange(source.depth, 0, 100, DEFAULT_CHORUS.depth),
    mix: numberInRange(source.mix, 0, 100, DEFAULT_CHORUS.mix),
  };
}

export function createModuleChorusMarkup(settings: Readonly<Record<string, unknown>>): string {
  const value = readModuleChorusSettings(settings.chorus);
  const controls: EffectControlDefinition[] = [
    control('rateHz', 'Rate', 0.05, 8, 0.01, value.rateHz, `${value.rateHz.toFixed(2)} Hz`),
    control('depth', 'Depth', 0, 100, 1, value.depth, `${Math.round(value.depth)}%`),
    control('mix', 'Mix', 0, 100, 1, value.mix, `${Math.round(value.mix)}%`),
  ];
  return `
    <section class="module-effect-editor module-chorus-editor" data-module-effect-editor="chorus">
      <div class="module-effect-controls module-effect-controls--chorus">
        ${controls.map((item) => createEffectKnob('chorus', item)).join('')}
      </div>
    </section>
  `;
}

export function createModuleRotaryMarkup(settings: Readonly<Record<string, unknown>>): string {
  const value = readModuleRotarySettings(settings.rotary);
  const controls = [
    control('slowHz', 'Slow', 0.2, 2, 0.01, value.slowHz, `${value.slowHz.toFixed(2)} Hz`),
    control('fastHz', 'Fast', 2, 10, 0.01, value.fastHz, `${value.fastHz.toFixed(2)} Hz`),
    control('rampSeconds', 'Acceleration', 0.1, 10, 0.1, value.rampSeconds, `${value.rampSeconds.toFixed(1)} s`),
    control('depth', 'Depth', 0, 100, 1, value.depth, `${Math.round(value.depth)}%`),
  ];
  return `
    <section class="module-effect-editor module-rotary-editor" data-module-effect-editor="rotary">
      <div class="module-rotary-speed" role="group" aria-label="Velocidade do Rotary">
        ${(['brake', 'slow', 'fast'] as const).map((speed) => `<button type="button" data-module-rotary-speed="${speed}" class="${value.speed === speed ? 'is-selected' : ''}" aria-pressed="${value.speed === speed}">${speed === 'brake' ? 'Brake' : speed === 'slow' ? 'Slow' : 'Fast'}</button>`).join('')}
      </div>
      <div class="module-rotary-modulation-row">
        <button type="button" class="module-effect-power module-rotary-modulation ${value.modulationEnabled ? 'is-on' : 'is-off'}" data-module-rotary-modulation aria-pressed="${value.modulationEnabled}">Modulation ${value.modulationEnabled ? 'On' : 'Off'}</button>
      </div>
      <div class="module-effect-controls module-effect-controls--rotary">
        ${controls.map((item) => createEffectKnob('rotary', item)).join('')}
      </div>
    </section>
  `;
}

export function createModuleEnvFilterMarkup(settings: Readonly<Record<string, unknown>>): string {
  const value = readModuleCutoffEnvelopeSettings(settings.cutoffEnvelope);
  const filterType = readCutoffFilterType(settings.cutoffFilterType);
  const controls = [
    control('attackMs', 'Attack', 0, 5_000, 1, value.attackMs, `${Math.round(value.attackMs)} ms`),
    control('decayMs', 'Decay', 0, 5_000, 1, value.decayMs, `${Math.round(value.decayMs)} ms`),
    control('sustain', 'Sustain', 0, 100, 1, value.sustain, `${Math.round(value.sustain)}%`),
    control('releaseMs', 'Release', 0, 5_000, 1, value.releaseMs, `${Math.round(value.releaseMs)} ms`),
    control('depthOctaves', 'Depth', 0, 8, 0.1, value.depthOctaves, `${value.depthOctaves.toFixed(1)} oct`),
  ];
  const filterTypeLabels: Record<CutoffFilterType, string> = {
    lowpass2: 'Lowpass 2', lowpass4: 'Lowpass 4', highpass2: 'Highpass 2', highpass4: 'Highpass 4',
  };
  return `
    <section class="module-effect-editor module-env-filter-editor" data-module-effect-editor="cutoffEnvelope">
      <div class="module-env-filter-type" role="group" aria-label="Tipo do filtro">
        ${CUTOFF_FILTER_TYPES.map((type) => `<button type="button" data-cutoff-filter-type="${type}" class="${filterType === type ? 'is-selected' : ''}" aria-pressed="${filterType === type}">${filterTypeLabels[type]}</button>`).join('')}
      </div>
      <div class="module-effect-controls module-effect-controls--cutoff-envelope">
        ${controls.map((item) => createEffectKnob('cutoffEnvelope', item)).join('')}
      </div>
    </section>
  `;
}

export function createModuleDelayMarkup(settings: Readonly<Record<string, unknown>>, bpm: number): string {
  const value = readModuleDelaySettings(settings.delay);
  // O knob é uma batida (1/4): o BPM com Sync, ou os ms escolhidos sem ele.
  const milliseconds = value.sync ? delayMillisecondsForBpm(bpm, '1/4') : value.milliseconds;
  const controls: EffectControlDefinition[] = [
    control('feedback', 'Feedback', 0, 95, 1, value.feedback, `${Math.round(value.feedback)}%`),
    control('mix', 'Mix', 0, 100, 1, value.mix, `${Math.round(value.mix)}%`),
    control('milliseconds', 'Delay', 1, 2_000, 1, milliseconds, value.sync ? `${Math.round(bpm)} BPM` : `${Math.round(milliseconds)} ms`),
  ];
  return `
    <div class="module-delay-page">
      <div class="module-delay-editor__divisions" role="group" aria-label="Divisão do delay">
        ${DELAY_DIVISIONS.map((division) => `
          <button type="button" data-module-delay-division="${division}" class="${division === value.division ? 'is-selected' : ''}" aria-pressed="${division === value.division}">${division}</button>
        `).join('')}
        <button type="button" data-module-delay-sync class="${value.sync ? 'is-selected' : ''}" aria-pressed="${value.sync}">Sync</button>
      </div>
      <section class="module-effect-editor module-delay-editor" data-module-effect-editor="delay">
        <div class="module-delay-editor__display">
          <button type="button" data-module-delay-tap${value.sync ? ' disabled' : ''}>Tap</button>
          <output data-module-delay-display>${value.sync ? `${Math.round(bpm)} BPM` : `${Math.round(milliseconds)} ms`}</output>
        </div>
        <div class="module-effect-controls module-effect-controls--delay">
          ${controls.map((item) => createEffectKnob('delay', item, item.key === 'milliseconds' && value.sync)).join('')}
        </div>
      </section>
    </div>
  `;
}

export function readModuleCompressorSettings(value: unknown): ModuleCompressorSettings {
  const source = record(value);
  return {
    enabled: source.enabled === true,
    thresholdDb: numberInRange(source.thresholdDb, -60, 0, DEFAULT_COMPRESSOR.thresholdDb),
    ratio: numberInRange(source.ratio, 1, 20, DEFAULT_COMPRESSOR.ratio),
    gainDb: numberInRange(source.gainDb, 0, 24, DEFAULT_COMPRESSOR.gainDb),
    attackMs: numberInRange(source.attackMs, MIN_COMPRESSOR_ATTACK_MS, 100, DEFAULT_COMPRESSOR.attackMs),
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
    mod: numberInRange(source.mod, 0, 100, DEFAULT_REVERB.mod),
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

export function readModuleRotarySettings(value: unknown): ModuleRotarySettings {
  const source = record(value);
  return {
    enabled: source.enabled === true,
    modulationEnabled: source.modulationEnabled === true,
    speed: source.speed === 'brake' || source.speed === 'fast' ? source.speed : 'slow',
    slowHz: numberInRange(source.slowHz, 0.2, 2, DEFAULT_ROTARY.slowHz),
    fastHz: numberInRange(source.fastHz, 2, 10, DEFAULT_ROTARY.fastHz),
    rampSeconds: numberInRange(source.rampSeconds, 0.1, 10, DEFAULT_ROTARY.rampSeconds),
    depth: numberInRange(source.depth, 0, 100, DEFAULT_ROTARY.depth),
    // O Rotary não tem Mix: a caixa toca inteira, sempre em 100%.
    mix: 100,
  };
}

export function readModuleCutoffEnvelopeSettings(value: unknown): ModuleCutoffEnvelopeSettings {
  const source = record(value);
  return {
    enabled: source.enabled === true,
    attackMs: numberInRange(source.attackMs, 0, 15_000, DEFAULT_CUTOFF_ENVELOPE.attackMs),
    decayMs: numberInRange(source.decayMs, 0, 15_000, DEFAULT_CUTOFF_ENVELOPE.decayMs),
    sustain: numberInRange(source.sustain, 0, 100, DEFAULT_CUTOFF_ENVELOPE.sustain),
    releaseMs: numberInRange(source.releaseMs, 0, 15_000, DEFAULT_CUTOFF_ENVELOPE.releaseMs),
    depthOctaves: numberInRange(source.depthOctaves, 0, 8, DEFAULT_CUTOFF_ENVELOPE.depthOctaves),
  };
}

export function readCutoffFilterType(value: unknown): CutoffFilterType {
  return (CUTOFF_FILTER_TYPES as readonly string[]).includes(value as string)
    ? value as CutoffFilterType : 'lowpass2';
}

export function readModuleEffectSettings(kind: ModuleEffectKind, value: unknown) {
  if (kind === 'compressor') return readModuleCompressorSettings(value);
  if (kind === 'reverb') return readModuleReverbSettings(value);
  if (kind === 'rotary') return readModuleRotarySettings(value);
  if (kind === 'chorus') return readModuleChorusSettings(value);
  if (kind === 'cutoffEnvelope') return readModuleCutoffEnvelopeSettings(value);
  return readModuleDelaySettings(value);
}

export function formatModuleEffectValue(kind: ModuleEffectKind, key: string, value: number): string {
  if (kind === 'rotary') {
    if (key === 'slowHz' || key === 'fastHz') return `${value.toFixed(2)} Hz`;
    if (key === 'rampSeconds') return `${value.toFixed(1)} s`;
    return `${Math.round(value)}%`;
  }
  if (kind === 'compressor') {
    if (key === 'ratio') return `${value.toFixed(1)}:1`;
    if (key === 'thresholdDb' || key === 'gainDb') return formatSignedDb(value);
    if (key === 'mix') return `${Math.round(value)}%`;
    return `${key === 'releaseMs' ? Math.round(value) : formatNumber(value)} ms`;
  }
  if (kind === 'chorus') return key === 'rateHz' ? `${value.toFixed(2)} Hz` : `${Math.round(value)}%`;
  if (kind === 'reverb') return key === 'decay' ? `${formatNumber(value)} s` : `${Math.round(value)}%`;
  if (kind === 'cutoffEnvelope') {
    if (key === 'depthOctaves') return `${value.toFixed(1)} oct`;
    if (key === 'sustain') return `${Math.round(value)}%`;
    return `${Math.round(value)} ms`;
  }
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
  return `<div class="module-compressor-meter" data-compressor-meter="${label.toLowerCase()}"><span>${label}</span><i><b></b></i><small>−∞ dB</small></div>`;
}

function createPreviewKnob(label: string, progress: number): string {
  return `<span class="module-effect-preview-knob">${createParameterKnobMarkup(progress, '')}<small>${label}</small></span>`;
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
