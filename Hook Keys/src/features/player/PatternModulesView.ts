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
  autoFaderDivision: '1/1' | '1/2';
  autoFaderDepthDb: number;
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
  autoFaderDivision: '1/1',
  autoFaderDepthDb: 5,
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
    autoFaderDivision: source.autoFaderDivision === '1/1' || source.autoFaderDivision === '1/2'
      ? source.autoFaderDivision : DEFAULT_ARPEGGIATOR_SETTINGS.autoFaderDivision,
    autoFaderDepthDb: numberInRange(source.autoFaderDepthDb, 0, 40, 5),
  };
}

// Auto Fader do arpeggiator: 1/1 ocupa o compasso global inteiro e 1/2 ocupa
// metade dele. Cada trajeto entre os extremos ocupa metade do ciclo.
export function readModuleAutoFaderSettings(value: unknown): {
  enabled: boolean;
  division: '1/1' | '1/2';
  depthDb: number;
} {
  const settings = readArpeggiatorSettings(value);
  return {
    enabled: settings.autoFaderEnabled,
    division: settings.autoFaderDivision,
    depthDb: settings.autoFaderDepthDb,
  };
}

export function measureQuarterBeats(numerator: number, denominator: number): number {
  const roundedNumerator = Math.round(numerator);
  const safeNumerator = Number.isFinite(roundedNumerator)
    ? Math.min(16, Math.max(1, roundedNumerator)) : 4;
  const roundedDenominator = Math.round(denominator);
  const safeDenominator = [2, 4, 8, 16].includes(roundedDenominator) ? roundedDenominator : 4;
  return safeNumerator * 4 / safeDenominator;
}

export function autoFaderCycleBeats(
  numerator: number,
  denominator: number,
  division: '1/1' | '1/2',
): number {
  const measureBeats = measureQuarterBeats(numerator, denominator);
  return division === '1/1' ? measureBeats : measureBeats / 2;
}

export function patternStepsPerMeasure(numerator: number, denominator: number, division: PatternDivision): number {
  const stepBeats = division === '1/4' ? 1
    : division === '1/8' ? 0.5
    : division === '1/32' ? 0.125
    : division === '1/4 T' ? 2 / 3
    : division === '1/8 T' ? 1 / 3
    : division === '1/16 T' ? 1 / 6
    : division === '1/32 T' ? 1 / 12
    : 0.25;
  return Math.max(1, Math.round(measureQuarterBeats(numerator, denominator) / stepBeats));
}

export function createArpeggiatorMarkup(value: unknown): string {
  const settings = readArpeggiatorSettings(value);
  return `
    <section class="pattern-editor arpeggiator-editor" data-arpeggiator-editor>
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
        ${patternKnob('arpeggiator', 'swing', 'Swing', settings.swing, 0, 75, 1, `${Math.round(settings.swing)}%`)}
        <section class="arpeggiator-auto-fader${settings.autoFaderEnabled ? ' is-enabled' : ''}" aria-label="Auto Fader">
          <button type="button" data-arpeggiator-auto-fader="power"
            class="${settings.autoFaderEnabled ? 'is-selected' : ''}"
            aria-pressed="${settings.autoFaderEnabled}">Auto Fader</button>
          <div role="group" aria-label="Tempo do Auto Fader">
            ${(['1/1', '1/2'] as const).map((division) => `
              <button type="button" data-arpeggiator-auto-fader="${division}"
                class="auto-fader-choice auto-fader-choice--${division === '1/1' ? 'green' : 'blue'}${settings.autoFaderDivision === division ? ' is-selected' : ''}"
                aria-pressed="${settings.autoFaderDivision === division}">${division}</button>
            `).join('')}
          </div>
          ${patternKnob('arpeggiator', 'autoFaderDepthDb', 'dB', settings.autoFaderDepthDb, 0, 40, 0.5,
            `-${settings.autoFaderDepthDb.toFixed(1)} dB`)}
        </section>

      </div>
    </section>
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
    : parameter === 'autoFaderDepthDb' ? `-${value.toFixed(1)} dB`
    : String(Math.round(value));
  const output = knob?.querySelector<HTMLOutputElement>('output');
  if (output) output.value = formatted;
  input.setAttribute('aria-valuetext', formatted);
  return value;
}

export function patternStepMilliseconds(bpm: number, division: PatternDivision, swing: number, stepIndex: number): number {
  const quarter = 60_000 / Math.min(300, Math.max(60, Number.isFinite(bpm) ? bpm : 120));
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

function patternKnob(
  kind: 'arpeggiator',
  parameter: string,
  label: string,
  value: number,
  minimum: number,
  maximum: number,
  step: number,
  formatted: string,
): string {
  const progress = (value - minimum) / (maximum - minimum);
  return `
    <label class="pattern-knob module-effect-knob" style="--knob-angle:${-135 + progress * 270}deg;--knob-progress:${progress}">
      <span>${label}</span>
      <span class="module-effect-knob__face" aria-hidden="true"><i></i></span>
      <input type="range" min="${minimum}" max="${maximum}" step="${step}" value="${value}" data-pattern-kind="${kind}" data-pattern-parameter="${parameter}" aria-label="${label}" aria-valuetext="${formatted}">
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
