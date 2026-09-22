import { formatFaderDb } from './ModuleFader';

export type OutputBus = 'music' | 'pads' | 'effects' | 'master';
export const MAX_OUTPUT_DB = 0;
// Output levels share the fader tail: -60 dB continues down to -90 dB before -inf.
export const OUTPUT_MIN_DB = -90;
export const MAX_OUTPUT_GAIN = 10 ** (MAX_OUTPUT_DB / 20);

export interface OutputLevels {
  music: number;
  pads: number;
  effects: number;
  master: number;
}

export interface OutputEnabledState {
  music: boolean;
  pads: boolean;
  effects: boolean;
  master: boolean;
}

export const DEFAULT_OUTPUT_LEVELS: OutputLevels = {
  music: 0,
  pads: 0,
  effects: 0,
  master: 0,
};

export const DEFAULT_OUTPUT_ENABLED: OutputEnabledState = {
  music: true,
  pads: true,
  effects: true,
  master: true,
};

export const OUTPUTS: readonly { id: OutputBus; label: string }[] = [
  { id: 'music', label: 'Músicas' },
  { id: 'pads', label: 'Pads' },
  { id: 'effects', label: 'Efects' },
  { id: 'master', label: 'Módulos' },
];

interface OutputControlMarkupOptions {
  className?: string;
  showPower?: boolean;
}

const OUTPUT_KNOB_COLORS: Record<OutputBus, string> = {
  music: '#ff3b5c',
  pads: '#35d36f',
  effects: '#a855f7',
  master: '#ff8a1f',
};

function createOutputMiniMeter(id: string, label: string): string {
  return `<span class="player-output-mini-meter" data-output-meter="${id}" role="img" aria-label="Nível de ${label}">
    <i aria-hidden="true"><b data-output-meter-channel="0"></b></i>
    <i aria-hidden="true"><b data-output-meter-channel="1"></b></i>
  </span>`;
}

export function createOutputKnobMarkup(
  id: OutputBus,
  label: string,
  level: number,
): string {
  const position = outputPosition(level);
  const angle = -135 + (position / 100) * 270;
  return `
    <label class="player-output-knob" data-output-knob="${id}" style="--knob-angle:${angle}deg;--knob-progress:${position / 100};--knob-accent:${OUTPUT_KNOB_COLORS[id]}">
      <span>${label}</span>
      <span class="player-output-knob__control">
        <span class="player-output-knob__face" aria-hidden="true"><i></i></span>
        ${createOutputMiniMeter(id === 'master' ? 'modules' : id, label)}
      </span>
      <input type="range" min="0" max="100" step="0.1" value="${position}" data-output-level="${id}" aria-label="Volume ${label}" aria-valuetext="${formatOutputDb(level)}">
      <output data-output-value="${id}">${formatOutputDb(level)}</output>
    </label>
  `;
}

export function createMetronomeKnobMarkup(volume: number): string {
  const levelDb = volume <= 0 ? OUTPUT_MIN_DB : Math.max(OUTPUT_MIN_DB, Math.min(MAX_OUTPUT_DB, 20 * Math.log10(volume)));
  const position = outputPosition(levelDb);
  const angle = -135 + (position / 100) * 270;
  return `
    <label class="player-output-knob" data-output-knob="metronome" style="--knob-angle:${angle}deg;--knob-progress:${position / 100};--knob-accent:#24b8ff">
      <span>Click</span>
      <span class="player-output-knob__control">
        <span class="player-output-knob__face" aria-hidden="true"><i></i></span>
        ${createOutputMiniMeter('click', 'Click')}
      </span>
      <input type="range" min="0" max="100" step="0.1" value="${position}" data-metronome-output-volume aria-label="Volume do Click" aria-valuetext="${formatOutputDb(levelDb)}">
      <output data-metronome-output-value>${formatOutputDb(levelDb)}</output>
    </label>
  `;
}

export function createOutputControlMarkup(
  id: OutputBus,
  label: string,
  level: number,
  enabled: boolean,
  options: OutputControlMarkupOptions = {},
): string {
  const showPower = options.showPower ?? true;
  return `
    <div class="player-output-control${options.className ? ` ${options.className}` : ''}">
      <span>${label}</span>
      <div
        class="player-output-control__slider"
        data-horizontal-output-fader="${id}"
        style="--output-position: ${outputPosition(level)}%; --output-zero-position: ${outputPosition(0)}%"
      >
        <i aria-hidden="true"></i>
        <input
          type="range"
          min="0"
          max="100"
          step="0.1"
          value="${outputPosition(level)}"
          data-output-level="${id}"
          aria-label="Volume ${label}"
          aria-valuetext="${formatOutputDb(level)}"
        >
      </div>
      <output data-output-value="${id}">${formatOutputDb(level)}</output>
      ${showPower ? `
        <button
          class="player-output-control__power ${enabled ? 'is-on' : 'is-off'}"
          type="button"
          data-action="toggle-output"
          data-output-bus="${id}"
          aria-pressed="${enabled}"
        >${enabled ? 'ON' : 'OFF'}</button>
      ` : ''}
    </div>
  `;
}

export function isOutputBus(value: string | undefined): value is OutputBus {
  return value === 'music' || value === 'pads' || value === 'effects' || value === 'master';
}

export function formatOutputDb(value: number): string {
  const normalized = Math.min(MAX_OUTPUT_DB, value);
  return normalized <= OUTPUT_MIN_DB ? '−∞ dB' : formatFaderDb(normalized);
}

export function outputPosition(value: number): number {
  const db = Math.min(MAX_OUTPUT_DB, Math.max(OUTPUT_MIN_DB, value));
  const points = [
    { db: OUTPUT_MIN_DB, position: 0 },
    { db: -60, position: 6 },
    { db: -36, position: 23 },
    { db: -18, position: 49 },
    { db: -9, position: 75 },
    { db: MAX_OUTPUT_DB, position: 100 },
  ];
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!;
    const end = points[index]!;
    if (db <= end.db) return start.position + ((db - start.db) / (end.db - start.db)) * (end.position - start.position);
  }
  return 100;
}

export function outputDbFromPosition(positionPercent: number): number {
  const position = Math.min(100, Math.max(0, positionPercent));
  const points = [
    { position: 0, db: OUTPUT_MIN_DB },
    { position: 6, db: -60 },
    { position: 23, db: -36 },
    { position: 49, db: -18 },
    { position: 75, db: -9 },
    { position: 100, db: MAX_OUTPUT_DB },
  ];
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!;
    const end = points[index]!;
    if (position <= end.position) {
      const db = start.db + ((position - start.position) / (end.position - start.position)) * (end.db - start.db);
      return Math.round(db * 10) / 10;
    }
  }
  return MAX_OUTPUT_DB;
}
