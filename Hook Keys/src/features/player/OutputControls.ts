import {
  faderDbToVisualPosition,
  formatFaderDb,
  visualPositionToFaderDb,
} from './ModuleFader';

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
  return value <= -60 ? '−∞ dB' : formatFaderDb(value);
}

export function outputPosition(value: number): number {
  return faderDbToVisualPosition(value);
}

export function outputDbFromPosition(positionPercent: number): number {
  return visualPositionToFaderDb(Math.min(100, Math.max(0, positionPercent)) / 100);
}
