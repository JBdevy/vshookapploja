import { formatFaderDb } from './ModuleFader';

export type OutputBus = 'music' | 'pads' | 'effects' | 'master';

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
  { id: 'master', label: 'Master' },
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
      <span class="player-output-knob__face" aria-hidden="true"><i></i></span>
      <input type="range" min="0" max="100" step="0.1" value="${position}" data-output-level="${id}" aria-label="Volume ${label}" aria-valuetext="${formatOutputDb(level)}">
      <output data-output-value="${id}">${formatOutputDb(level)}</output>
    </label>
  `;
}

export function createMetronomeKnobMarkup(volume: number): string {
  const levelDb = volume <= 0 ? -60 : Math.max(-60, Math.min(0, 20 * Math.log10(volume)));
  const position = outputPosition(levelDb);
  const angle = -135 + (position / 100) * 270;
  return `
    <label class="player-output-knob" data-output-knob="metronome" style="--knob-angle:${angle}deg;--knob-progress:${position / 100};--knob-accent:#24b8ff">
      <span>Metrônomo</span>
      <span class="player-output-knob__face" aria-hidden="true"><i></i></span>
      <input type="range" min="0" max="100" step="0.1" value="${position}" data-metronome-output-volume aria-label="Volume do metrônomo" aria-valuetext="${formatOutputDb(levelDb)}">
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
  const normalized = Math.min(0, value);
  return normalized <= -60 ? '−∞ dB' : formatFaderDb(normalized);
}

export function outputPosition(value: number): number {
  const db = Math.min(0, Math.max(-60, value));
  const points = [
    { db: -60, position: 0 },
    { db: -36, position: 18 },
    { db: -18, position: 41 },
    { db: -9, position: 66 },
    { db: 0, position: 100 },
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
    { position: 0, db: -60 },
    { position: 18, db: -36 },
    { position: 41, db: -18 },
    { position: 66, db: -9 },
    { position: 100, db: 0 },
  ];
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!;
    const end = points[index]!;
    if (position <= end.position) {
      const db = start.db + ((position - start.position) / (end.position - start.position)) * (end.db - start.db);
      return Math.round(db * 10) / 10;
    }
  }
  return 0;
}
