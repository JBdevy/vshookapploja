export type PatternDivision = '1/4' | '1/8' | '1/16' | '1/32' | '1/4 T' | '1/8 T' | '1/16 T' | '1/32 T';
export type ArpeggiatorMode = 'up' | 'down' | 'up-down' | 'played' | 'random';

export interface ArpeggiatorSettings {
  enabled: boolean;
  mode: ArpeggiatorMode;
  division: PatternDivision;
  octaves: number;
  gate: number;
  swing: number;
  autoFaderEnabled: boolean;
  autoFaderDivision: '1/4' | '1/8';
  autoFaderDepthDb: number;
}

export interface SequencerStep {
  enabled: boolean;
  semitone: number;
  velocity: number;
  gate: number;
}

export interface SequencerSettings {
  enabled: boolean;
  division: PatternDivision;
  length: number;
  swing: number;
  steps: SequencerStep[];
}

export const PATTERN_DIVISIONS: readonly PatternDivision[] = ['1/4', '1/8', '1/16', '1/32'];
export const ARPEGGIATOR_DIVISIONS: readonly PatternDivision[] = [
  '1/4', '1/8', '1/16', '1/32', '1/4 T', '1/8 T', '1/16 T', '1/32 T',
];
export const ARPEGGIATOR_MODES: readonly ArpeggiatorMode[] = ['up', 'down', 'up-down', 'played', 'random'];

export const DEFAULT_ARPEGGIATOR_SETTINGS: Readonly<ArpeggiatorSettings> = Object.freeze({
  enabled: false,
  mode: 'up',
  division: '1/16',
  octaves: 1,
  gate: 72,
  swing: 0,
  autoFaderEnabled: false,
  autoFaderDivision: '1/4',
  autoFaderDepthDb: 5,
});

const DEFAULT_STEP_NOTES = [0, 2, 4, 7, 0, 2, 4, 7, 0, 2, 4, 7, 12, 7, 4, 2] as const;

export const DEFAULT_SEQUENCER_SETTINGS: Readonly<SequencerSettings> = Object.freeze({
  enabled: false,
  division: '1/16',
  length: 16,
  swing: 0,
  steps: Object.freeze(DEFAULT_STEP_NOTES.map((semitone) => Object.freeze({
    enabled: true,
    semitone,
    velocity: 110,
    gate: 72,
  }))) as unknown as SequencerStep[],
});

export function readArpeggiatorSettings(value: unknown): ArpeggiatorSettings {
  const source = record(value);
  return {
    enabled: source.enabled === true,
    mode: isArpeggiatorMode(source.mode) ? source.mode : DEFAULT_ARPEGGIATOR_SETTINGS.mode,
    division: isPatternDivision(source.division) ? source.division : DEFAULT_ARPEGGIATOR_SETTINGS.division,
    octaves: integerInRange(source.octaves, 1, 4, DEFAULT_ARPEGGIATOR_SETTINGS.octaves),
    gate: numberInRange(source.gate, 10, 100, DEFAULT_ARPEGGIATOR_SETTINGS.gate),
    swing: numberInRange(source.swing, 0, 75, DEFAULT_ARPEGGIATOR_SETTINGS.swing),
    autoFaderEnabled: source.autoFaderEnabled === true,
    autoFaderDivision: source.autoFaderDivision === '1/8' ? '1/8' : '1/4',
    autoFaderDepthDb: numberInRange(source.autoFaderDepthDb, 0, 40, 5),
  };
}

// Auto Fader do arpeggiator: o volume desce autoFaderDepthDb a partir do
// volume atual do módulo e volta, uma volta por tempo (1/4) ou colcheia (1/8).
export function readModuleAutoFaderSettings(value: unknown): {
  enabled: boolean;
  division: '1/4' | '1/8';
  depthDb: number;
} {
  const settings = readArpeggiatorSettings(value);
  return {
    enabled: settings.autoFaderEnabled,
    division: settings.autoFaderDivision,
    depthDb: settings.autoFaderDepthDb,
  };
}

export function readSequencerSettings(value: unknown): SequencerSettings {
  const source = record(value);
  const sourceSteps = Array.isArray(source.steps) ? source.steps : [];
  const defaults = DEFAULT_SEQUENCER_SETTINGS.steps;
  return {
    enabled: source.enabled === true,
    division: isPatternDivision(source.division) ? source.division : DEFAULT_SEQUENCER_SETTINGS.division,
    length: integerInRange(source.length, 1, 16, DEFAULT_SEQUENCER_SETTINGS.length),
    swing: numberInRange(source.swing, 0, 75, DEFAULT_SEQUENCER_SETTINGS.swing),
    steps: Array.from({ length: 16 }, (_, index) => {
      const step = record(sourceSteps[index]);
      const fallback = defaults[index] ?? { enabled: true, semitone: 0, velocity: 110, gate: 72 };
      return {
        enabled: typeof step.enabled === 'boolean' ? step.enabled : fallback.enabled,
        semitone: integerInRange(step.semitone, -24, 24, fallback.semitone),
        velocity: integerInRange(step.velocity, 1, 127, fallback.velocity),
        gate: numberInRange(step.gate, 10, 100, fallback.gate),
      };
    }),
  };
}

export function createArpeggiatorMarkup(value: unknown): string {
  const settings = readArpeggiatorSettings(value);
  return `
    <section class="pattern-editor arpeggiator-editor" data-arpeggiator-editor>
      <header class="pattern-editor__header">
        <div><span>Módulo 06</span><strong>Arpeggiator</strong></div>
        <output class="pattern-editor__summary">${settings.division} · ${settings.octaves} oitava${settings.octaves === 1 ? '' : 's'}</output>
      </header>
      <div class="pattern-option-group" role="group" aria-label="Direção do arpejo">
        ${ARPEGGIATOR_MODES.map((mode) => optionButton('arpeggiator-mode', mode, arpeggiatorModeLabel(mode), settings.mode === mode)).join('')}
      </div>
      <div class="pattern-option-group pattern-option-group--division" role="group" aria-label="Divisão do arpejo">
        ${ARPEGGIATOR_DIVISIONS.map((division) => optionButton('arpeggiator-division', division, division, settings.division === division)).join('')}
      </div>
      <div class="arpeggiator-live-strip" aria-hidden="true">${Array.from({ length: 16 }, () => '<i></i>').join('')}</div>
      <div class="pattern-knob-grid">
        <section class="arpeggiator-octaves" aria-label="Oitavas">
          <span>Oitavas</span>
          <div role="radiogroup">
            ${[1, 2, 3, 4].map((octaves) => optionButton('arpeggiator-octaves', String(octaves), String(octaves), settings.octaves === octaves)).join('')}
          </div>
        </section>
        ${patternKnob('arpeggiator', 'gate', 'Gate', settings.gate, 10, 100, 1, `${Math.round(settings.gate)}%`)}
        <section class="arpeggiator-auto-fader${settings.autoFaderEnabled ? ' is-enabled' : ''}" aria-label="Auto Fader">
          <button type="button" data-arpeggiator-auto-fader="power"
            class="${settings.autoFaderEnabled ? 'is-selected' : ''}"
            aria-pressed="${settings.autoFaderEnabled}">Auto Fader</button>
          <div role="group" aria-label="Tempo do Auto Fader">
            ${(['1/4', '1/8'] as const).map((division) => `
              <button type="button" data-arpeggiator-auto-fader="${division}"
                class="${settings.autoFaderDivision === division ? 'is-selected' : ''}"
                aria-pressed="${settings.autoFaderDivision === division}">${division}</button>
            `).join('')}
          </div>
          ${patternKnob('arpeggiator', 'autoFaderDepthDb', 'dB', settings.autoFaderDepthDb, 0, 40, 0.5,
            `-${settings.autoFaderDepthDb.toFixed(1)} dB`)}
        </section>
        ${patternKnob('arpeggiator', 'swing', 'Swing', settings.swing, 0, 75, 1, `${Math.round(settings.swing)}%`)}
      </div>
    </section>
  `;
}

export function createSequencerMarkup(value: unknown): string {
  const settings = readSequencerSettings(value);
  const selectedStep = 0;
  return `
    <section class="pattern-editor sequencer-editor" data-sequencer-editor data-sequencer-selected-step="${selectedStep}">
      <header class="pattern-editor__header">
        <div><span>Módulo 07</span><strong>Sequencer</strong></div>
        <output>${settings.length} passos · ${settings.division}</output>
      </header>
      <div class="pattern-editor__toolbar">
        <div class="pattern-option-group pattern-option-group--division" role="group" aria-label="Divisão do sequenciador">
          ${PATTERN_DIVISIONS.map((division) => optionButton('sequencer-division', division, division, settings.division === division)).join('')}
        </div>
        <div class="pattern-option-group pattern-option-group--length" role="group" aria-label="Tamanho da sequência">
          ${[4, 8, 16].map((length) => optionButton('sequencer-length', String(length), `${length} passos`, settings.length === length)).join('')}
        </div>
      </div>
      <div class="sequencer-steps" role="listbox" aria-label="Passos do sequenciador">
        ${settings.steps.map((step, index) => `
          <button
            class="sequencer-step${step.enabled ? ' is-enabled' : ' is-disabled'}${index === selectedStep ? ' is-selected' : ''}${index >= settings.length ? ' is-outside' : ''}"
            type="button"
            data-sequencer-step="${index}"
            role="option"
            aria-selected="${index === selectedStep}"
            ${index >= settings.length ? 'disabled' : ''}
          ><span>${String(index + 1).padStart(2, '0')}</span><strong>${formatSemitone(step.semitone)}</strong><i></i></button>
        `).join('')}
      </div>
      ${createSequencerStepEditor(settings, selectedStep)}
    </section>
  `;
}

export function createSequencerStepEditor(settings: SequencerSettings, index: number): string {
  const safeIndex = Math.min(15, Math.max(0, Math.round(index)));
  const step = settings.steps[safeIndex] ?? { enabled: true, semitone: 0, velocity: 110, gate: 72 };
  return `
    <div class="sequencer-step-editor" data-sequencer-step-editor>
      <button class="sequencer-step-power ${step.enabled ? 'is-on' : 'is-off'}" type="button" data-sequencer-step-power aria-pressed="${step.enabled}">
        <span>Passo ${String(safeIndex + 1).padStart(2, '0')}</span><strong>${step.enabled ? 'ON' : 'OFF'}</strong>
      </button>
      ${patternKnob('sequencer', 'semitone', 'Nota', step.semitone, -24, 24, 1, formatSemitone(step.semitone), safeIndex)}
      ${patternKnob('sequencer', 'velocity', 'Velocity', step.velocity, 1, 127, 1, String(step.velocity), safeIndex)}
      ${patternKnob('sequencer', 'gate', 'Gate', step.gate, 10, 100, 1, `${Math.round(step.gate)}%`, safeIndex)}
      ${patternKnob('sequencer', 'swing', 'Swing', settings.swing, 0, 75, 1, `${Math.round(settings.swing)}%`)}
    </div>
  `;
}

export function updatePatternRangeOutput(input: HTMLInputElement): number {
  const value = Number(input.value);
  const minimum = Number(input.min);
  const maximum = Number(input.max);
  const progress = maximum > minimum ? Math.min(1, Math.max(0, (value - minimum) / (maximum - minimum))) : 0;
  const knob = input.closest<HTMLElement>('.pattern-knob');
  knob?.style.setProperty('--knob-angle', `${-135 + progress * 270}deg`);
  knob?.style.setProperty('--knob-progress', String(progress));
  const parameter = input.dataset.patternParameter;
  const formatted = parameter === 'gate' || parameter === 'swing'
    ? `${Math.round(value)}%`
    : parameter === 'semitone' ? formatSemitone(value) : String(Math.round(value));
  const output = knob?.querySelector<HTMLOutputElement>('output');
  if (output) output.value = formatted;
  input.setAttribute('aria-valuetext', formatted);
  return value;
}

export function patternStepMilliseconds(bpm: number, division: PatternDivision, swing: number, stepIndex: number): number {
  const quarter = 60_000 / Math.min(600, Math.max(60, Number.isFinite(bpm) ? bpm : 120));
  const multiplier = division === '1/4' ? 1
    : division === '1/8' ? 0.5
    : division === '1/32' ? 0.125
    : division === '1/4 T' ? 2 / 3
    : division === '1/8 T' ? 1 / 3
    : division === '1/16 T' ? 1 / 6
    : division === '1/32 T' ? 1 / 12
    : 0.25;
  const swingAmount = Math.min(0.75, Math.max(0, swing / 100));
  return quarter * multiplier * (stepIndex % 2 === 0 ? 1 + swingAmount : 1 - swingAmount);
}

export function formatSemitone(value: number): string {
  const rounded = Math.round(Math.min(24, Math.max(-24, value)));
  return rounded === 0 ? '0' : `${rounded > 0 ? '+' : ''}${rounded}`;
}

function patternKnob(
  kind: 'arpeggiator' | 'sequencer',
  parameter: string,
  label: string,
  value: number,
  minimum: number,
  maximum: number,
  step: number,
  formatted: string,
  stepIndex?: number,
): string {
  const progress = (value - minimum) / (maximum - minimum);
  return `
    <label class="pattern-knob module-effect-knob" style="--knob-angle:${-135 + progress * 270}deg;--knob-progress:${progress}">
      <span>${label}</span>
      <span class="module-effect-knob__face" aria-hidden="true"><i></i></span>
      <input type="range" min="${minimum}" max="${maximum}" step="${step}" value="${value}" data-pattern-kind="${kind}" data-pattern-parameter="${parameter}"${stepIndex === undefined ? '' : ` data-sequencer-step-index="${stepIndex}"`} aria-label="${label}" aria-valuetext="${formatted}">
      <output>${formatted}</output>
    </label>
  `;
}

function optionButton(group: string, value: string, label: string, selected: boolean): string {
  return `<button class="${selected ? 'is-selected' : ''}" type="button" data-${group}="${value}" aria-pressed="${selected}">${label}</button>`;
}

function arpeggiatorModeLabel(mode: ArpeggiatorMode): string {
  return mode === 'up' ? 'Up' : mode === 'down' ? 'Down' : mode === 'up-down' ? 'Up/Down' : mode === 'played' ? 'Ordem' : 'Random';
}

function isArpeggiatorMode(value: unknown): value is ArpeggiatorMode {
  return typeof value === 'string' && (ARPEGGIATOR_MODES as readonly string[]).includes(value);
}

function isPatternDivision(value: unknown): value is PatternDivision {
  return typeof value === 'string' && (ARPEGGIATOR_DIVISIONS as readonly string[]).includes(value);
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberInRange(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function integerInRange(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return Math.round(numberInRange(value, minimum, maximum, fallback));
}
