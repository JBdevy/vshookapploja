import { createParameterKnobMarkup } from './ParameterKnobView';
import { ARPEGGIATOR_DIVISIONS, type PatternDivision } from './PatternModulesView';

export const TRANCE_GATE_RATE_MIN_MS = 20;
export const TRANCE_GATE_RATE_MAX_MS = 2000;

export interface TranceGateSettings {
  enabled: boolean;
  // Sync ligado: o passo anda pela divisão do andamento. Desligado: anda pelo
  // tempo em ms do knob, solto do BPM.
  sync: boolean;
  rateMs: number;
  division: PatternDivision;
  length: number;
  gate: number;
  depth: number;
  attackMs: number;
  releaseMs: number;
  swing: number;
  steps: boolean[];
}

export function readTranceGateSettings(value: unknown): TranceGateSettings {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const bounded = (key: string, min: number, max: number, fallback: number) => {
    const value = source[key];
    return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  };
  const steps = Array.isArray(source.steps) ? source.steps : [];
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : true,
    sync: typeof source.sync === 'boolean' ? source.sync : true,
    rateMs: Math.round(bounded('rateMs', TRANCE_GATE_RATE_MIN_MS, TRANCE_GATE_RATE_MAX_MS, 125)),
    division: ARPEGGIATOR_DIVISIONS.includes(source.division as PatternDivision) ? source.division as PatternDivision : '1/16',
    length: Math.round(bounded('length', 1, 16, 16)),
    gate: bounded('gate', 5, 100, 50),
    depth: bounded('depth', 0, 100, 100),
    attackMs: bounded('attackMs', 0.1, 100, 3),
    releaseMs: bounded('releaseMs', 0.1, 100, 3),
    swing: bounded('swing', 0, 75, 0),
    steps: Array.from({ length: 16 }, (_, index) => typeof steps[index] === 'boolean' ? steps[index] : true),
  };
}

export function tranceGateBeatMultiplier(division: PatternDivision): number {
  return ({ '1/4': 1, '1/8': 0.5, '1/16': 0.25, '1/32': 0.125,
    '1/4 T': 2 / 3, '1/8 T': 1 / 3, '1/16 T': 1 / 6, '1/32 T': 1 / 12 })[division];
}

// Sem Sync o motor continua contando em batidas: o tempo em ms do knob vira o
// tanto de batida que ele vale no andamento de agora.
export function tranceGateStepBeats(settings: TranceGateSettings, bpm: number): number {
  if (settings.sync) return tranceGateBeatMultiplier(settings.division);
  const safeBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : 120;
  return Math.max(0.001, settings.rateMs * safeBpm / 60_000);
}

export function createTranceGateMarkup(value: unknown, bpm = 120): string {
  const settings = readTranceGateSettings(value);
  const rateProgress = (settings.rateMs - TRANCE_GATE_RATE_MIN_MS)
    / (TRANCE_GATE_RATE_MAX_MS - TRANCE_GATE_RATE_MIN_MS);
  const rateLabel = settings.sync
    ? `${Math.round(bpm)} BPM`
    : `${settings.rateMs} ms`;
  const options = (key: string, values: readonly (number | string)[], current: number | string) => values.map(value =>
    `<button type="button" data-trance-gate-${key}="${value}" class="${value === current ? 'is-selected' : ''}" aria-pressed="${value === current}">${value}</button>`).join('');
  return `<section class="pattern-editor trance-gate-editor" data-trance-gate-editor>
    <div class="pattern-editor__toolbar">
      <div class="pattern-option-group pattern-option-group--division" role="group" aria-label="Divisão do Trance Gate">${options('division', ARPEGGIATOR_DIVISIONS, settings.division)}</div>
      <div class="pattern-option-group pattern-option-group--length" role="group" aria-label="Quantidade de passos">${options('length', [4, 8, 16], settings.length)}</div>
      <div class="trance-gate-rate">
        <button type="button" data-trance-gate-sync
          class="${settings.sync ? 'is-selected' : ''}" aria-pressed="${settings.sync}">Sync</button>
        <label class="pattern-knob module-effect-knob${settings.sync ? ' is-locked' : ''}">
          <span>Rate</span>${createParameterKnobMarkup(settings.sync ? 0.5 : rateProgress,
  `<input type="range" min="${TRANCE_GATE_RATE_MIN_MS}" max="${TRANCE_GATE_RATE_MAX_MS}" step="1"
            value="${settings.rateMs}" data-trance-gate-parameter="rateMs" aria-label="Rate"
            aria-valuetext="${rateLabel}"${settings.sync ? ' disabled' : ''}>`)}<output>${rateLabel}</output>
        </label>
      </div>
    </div>
    <div class="trance-gate-steps" role="group" aria-label="Passos do Trance Gate">${settings.steps.map((enabled, index) =>
      `<button type="button" class="trance-gate-step ${enabled ? 'is-enabled' : 'is-disabled'}${index >= settings.length ? ' is-outside' : ''}" data-trance-gate-step="${index}" aria-label="Passo ${index + 1}" aria-pressed="${enabled}" ${index >= settings.length ? 'disabled' : ''}><span>${String(index + 1).padStart(2, '0')}</span><strong>${enabled ? 'ON' : 'OFF'}</strong><i></i></button>`).join('')}</div>
    <div class="pattern-knob-grid">${([
      ['gate', 'Gate', 5, 100, 1, '%'], ['depth', 'Depth', 0, 100, 1, '%'],
      ['attackMs', 'Attack', 0.1, 100, 0.1, ' ms'], ['releaseMs', 'Release', 0.1, 100, 0.1, ' ms'],
      ['swing', 'Swing', 0, 75, 1, '%'],
    ] as const).map(([key, label, min, max, step, suffix]) => {
      const value = settings[key];
      return `<div class="pattern-knob module-effect-knob"><span>${label}</span>${createParameterKnobMarkup((value - min) / (max - min),
        `<input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-trance-gate-parameter="${key}" aria-label="${label}" aria-valuetext="${value}${suffix}">`)}<output>${value}${suffix}</output></div>`;
    }).join('')}</div>
  </section>`;
}
