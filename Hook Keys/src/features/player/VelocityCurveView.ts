export type VelocityCurveMode = 'soft' | 'middle' | 'hard' | 'fixed' | 'user';

export interface VelocityCurveSettings {
  mode: VelocityCurveMode;
  points: [number, number, number, number, number];
}

export const DEFAULT_VELOCITY_CURVE: VelocityCurveSettings = {
  mode: 'soft',
  points: [0, 8, 32, 72, 127],
};

const VELOCITY_CURVES: Record<Exclude<VelocityCurveMode, 'user'>, VelocityCurveSettings['points']> = {
  soft: [0, 8, 32, 72, 127],
  middle: [0, 32, 64, 96, 127],
  hard: [0, 52, 84, 108, 127],
  fixed: [100, 100, 100, 100, 100],
};

const MODE_LABELS: Record<VelocityCurveMode, string> = {
  soft: 'Soft',
  middle: 'Middle',
  hard: 'Hard',
  fixed: 'Fixed',
  user: 'User',
};

export function readVelocityCurveSettings(value: unknown): VelocityCurveSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_VELOCITY_CURVE, points: [...DEFAULT_VELOCITY_CURVE.points] };
  }
  const record = value as Record<string, unknown>;
  const mode = isVelocityCurveMode(record.mode) ? record.mode : 'soft';
  const source = Array.isArray(record.points) ? record.points : [];
  if (source.length !== 5 || source.some((point) => !Number.isFinite(Number(point)))) {
    return velocityCurvePreset(mode);
  }
  return {
    mode,
    points: source.map(clampVelocity) as VelocityCurveSettings['points'],
  };
}

export function velocityCurvePreset(
  mode: VelocityCurveMode,
  current?: VelocityCurveSettings,
): VelocityCurveSettings {
  if (mode === 'user') {
    return {
      mode,
      points: [...(current?.points ?? DEFAULT_VELOCITY_CURVE.points)],
    };
  }
  if (mode === 'fixed' && current?.mode === 'fixed') {
    const value = clampVelocity(current.points[0]);
    return { mode, points: [value, value, value, value, value] };
  }
  return { mode, points: [...VELOCITY_CURVES[mode]] };
}

export function createVelocityCardMarkup(settings: Readonly<Record<string, unknown>>): string {
  const velocity = readVelocityCurveSettings(settings.velocityCurve);
  return `
    <button class="module-velocity-card" type="button" data-module-setting-action="open-velocity">
      <span>Velocity</span>
      <strong>${MODE_LABELS[velocity.mode]}</strong>
      <svg viewBox="0 0 240 52" aria-hidden="true">
        <path d="${velocityCurvePath(velocity.points, 240, 52, 3)}" />
      </svg>
    </button>
  `;
}

export function createVelocityCurveMarkup(settings: Readonly<Record<string, unknown>>): string {
  const velocity = readVelocityCurveSettings(settings.velocityCurve);
  return `
    <section class="velocity-curve-editor" data-velocity-mode="${velocity.mode}">
      <div class="velocity-curve-modes" role="radiogroup" aria-label="Curva de velocity">
        ${(Object.keys(MODE_LABELS) as VelocityCurveMode[]).map((mode) => `
          <button
            class="${velocity.mode === mode ? 'is-selected' : ''}"
            type="button"
            data-velocity-mode-option="${mode}"
            role="radio"
            aria-checked="${velocity.mode === mode}"
          >${MODE_LABELS[mode]}</button>
        `).join('')}
      </div>
      <div class="velocity-curve-plot" data-velocity-curve-plot>
        <svg viewBox="0 0 640 260" preserveAspectRatio="none" aria-label="Entrada e saída da curva de velocity">
          <g class="velocity-curve-grid">
            <path d="M0 65H640M0 130H640M0 195H640M160 0V260M320 0V260M480 0V260" />
            <path class="velocity-curve-reference" d="M0 260L640 0" />
          </g>
          <path class="velocity-curve-line" data-velocity-curve-line d="${velocityCurvePath(velocity.points)}" />
          <g class="velocity-curve-handles" data-velocity-curve-handles>
            ${velocity.points.map((point, index) => velocityHandleMarkup(index, point)).join('')}
          </g>
        </svg>
      </div>
      <label class="velocity-fixed-control" data-velocity-fixed-control${velocity.mode === 'fixed' ? '' : ' hidden'}>
        <span>Velocity fixa</span>
        <input type="range" min="0" max="127" step="1" value="${velocity.points[0]}" data-velocity-fixed-value>
        <output data-velocity-fixed-output>${velocity.points[0]}</output>
      </label>
      <p data-velocity-user-help${velocity.mode === 'user' ? '' : ' hidden'}>Arraste os pontos para desenhar livremente a resposta do toque.</p>
    </section>
  `;
}

export function updateVelocityCurveMarkup(container: HTMLElement, settings: VelocityCurveSettings): void {
  container.dataset.velocityMode = settings.mode;
  for (const button of container.querySelectorAll<HTMLButtonElement>('[data-velocity-mode-option]')) {
    const selected = button.dataset.velocityModeOption === settings.mode;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-checked', String(selected));
  }
  const line = container.querySelector<SVGPathElement>('[data-velocity-curve-line]');
  if (line) line.setAttribute('d', velocityCurvePath(settings.points));
  for (const handle of container.querySelectorAll<SVGCircleElement>('[data-velocity-point]')) {
    const index = Number(handle.dataset.velocityPoint);
    const value = settings.points[index];
    if (value === undefined) continue;
    handle.setAttribute('cy', String(velocityPointY(value)));
  }
  const fixedControl = container.querySelector<HTMLElement>('[data-velocity-fixed-control]');
  if (fixedControl) fixedControl.hidden = settings.mode !== 'fixed';
  const fixedInput = container.querySelector<HTMLInputElement>('[data-velocity-fixed-value]');
  if (fixedInput) fixedInput.value = String(settings.points[0]);
  const fixedOutput = container.querySelector<HTMLOutputElement>('[data-velocity-fixed-output]');
  if (fixedOutput) {
    fixedOutput.value = String(settings.points[0]);
    fixedOutput.textContent = String(settings.points[0]);
  }
  const userHelp = container.querySelector<HTMLElement>('[data-velocity-user-help]');
  if (userHelp) userHelp.hidden = settings.mode !== 'user';
}

export function velocityCurvePath(
  points: readonly number[],
  width = 640,
  height = 260,
  padding = 0,
): string {
  const usableWidth = Math.max(1, width - padding * 2);
  const usableHeight = Math.max(1, height - padding * 2);
  return points.map((value, index) => {
    const x = padding + (index / Math.max(1, points.length - 1)) * usableWidth;
    const y = padding + (1 - clampVelocity(value) / 127) * usableHeight;
    return `${index === 0 ? 'M' : 'L'}${round(x)} ${round(y)}`;
  }).join(' ');
}

export function velocityFromClientY(plot: HTMLElement, clientY: number): number {
  const rect = plot.getBoundingClientRect();
  if (rect.height <= 0) return 0;
  return clampVelocity((1 - ((clientY - rect.top) / rect.height)) * 127);
}

export function isVelocityCurveMode(value: unknown): value is VelocityCurveMode {
  return value === 'soft' || value === 'middle' || value === 'hard' || value === 'fixed' || value === 'user';
}

function velocityHandleMarkup(index: number, value: number): string {
  return `<circle cx="${index * 160}" cy="${velocityPointY(value)}" r="11" data-velocity-point="${index}" />`;
}

function velocityPointY(value: number): number {
  return round((1 - clampVelocity(value) / 127) * 260);
}

function clampVelocity(value: unknown): number {
  const parsed = Number(value);
  return Math.round(Math.min(127, Math.max(0, Number.isFinite(parsed) ? parsed : 0)));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
