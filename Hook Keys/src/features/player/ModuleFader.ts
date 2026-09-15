import { LongPressGesture } from '../../shared/gestures/LongPressGesture';
import { DoubleTapTracker } from '../../shared/gestures/DoubleTapTracker';
import { isDesktopRuntime } from '../../platform/runtime';

// Below -60 dB the fader keeps a short tail down to -90 dB, so the last step
// into silence (-inf) is inaudible.
export const MODULE_FADER_MIN_DB = -90;
const MIN_DB = MODULE_FADER_MIN_DB;
const MAX_DB = 6;
const DEFAULT_DB = 0;
const POINTER_STEP_DB = 0.1;
const KEY_STEP_DB = 0.5;
const PAGE_STEP_DB = 3;
const HANDLE_SAFE_AREA_PERCENT = 6;

interface CurvePoint {
  position: number;
  db: number;
}

const FADER_CURVE: readonly CurvePoint[] = [
  { position: 0, db: MIN_DB },
  { position: 0.06, db: -60 },
  { position: 0.18, db: -36 },
  { position: 0.37, db: -18 },
  { position: 0.56, db: -9 },
  { position: 0.8, db: 0 },
  { position: 1, db: MAX_DB },
];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function interpolate(value: number, inputStart: number, inputEnd: number, outputStart: number, outputEnd: number): number {
  if (inputStart === inputEnd) return outputStart;
  const progress = (value - inputStart) / (inputEnd - inputStart);
  return outputStart + (outputEnd - outputStart) * progress;
}

function findCurveSegment(value: number, key: keyof CurvePoint): readonly [CurvePoint, CurvePoint] {
  for (let index = 1; index < FADER_CURVE.length; index += 1) {
    const previous = FADER_CURVE[index - 1];
    const current = FADER_CURVE[index];
    if (previous && current && value <= current[key]) return [previous, current];
  }

  const last = FADER_CURVE[FADER_CURVE.length - 1];
  const previous = FADER_CURVE[FADER_CURVE.length - 2];
  if (!last || !previous) throw new Error('Curva do fader inválida.');
  return [previous, last];
}

function dbToPosition(db: number): number {
  const safeDb = clamp(db, MIN_DB, MAX_DB);
  const [start, end] = findCurveSegment(safeDb, 'db');
  return interpolate(safeDb, start.db, end.db, start.position, end.position);
}

function positionToDb(position: number): number {
  const safePosition = clamp(position, 0, 1);
  const [start, end] = findCurveSegment(safePosition, 'position');
  return interpolate(safePosition, start.position, end.position, start.db, end.db);
}

export function formatFaderDb(db: number): string {
  if (db <= MIN_DB) return '−∞ dB';
  const normalized = Math.abs(db) < 0.05 ? 0 : db;
  const prefix = normalized > 0 ? '+' : '';
  return `${prefix}${normalized.toFixed(1)} dB`;
}

export function faderDbToVisualPosition(db: number): number {
  const usableRange = 100 - HANDLE_SAFE_AREA_PERCENT * 2;
  return HANDLE_SAFE_AREA_PERCENT + dbToPosition(db) * usableRange;
}

export function visualPositionToFaderDb(position: number): number {
  const usableRange = 1 - (HANDLE_SAFE_AREA_PERCENT / 100) * 2;
  const normalized = clamp((position - HANDLE_SAFE_AREA_PERCENT / 100) / usableRange, 0, 1);
  return roundTo(positionToDb(normalized), POINTER_STEP_DB);
}

export function createModuleFaderMarkup(moduleNumber: number): string {
  const labelId = `module-volume-label-${moduleNumber}`;
  const outputId = `module-volume-output-${moduleNumber}`;

  return `
    <div
      class="player-module__fader"
      data-module-fader="${moduleNumber}"
      style="--module-zero-position: ${faderDbToVisualPosition(0).toFixed(2)}%"
    >
      <span id="${labelId}" class="player-module__fader-label">Volume</span>
      <div
        class="player-module__fader-rail"
        role="slider"
        tabindex="0"
        aria-labelledby="${labelId}"
        aria-describedby="${outputId}"
        aria-orientation="vertical"
        aria-valuemin="${MIN_DB}"
        aria-valuemax="${MAX_DB}"
        aria-valuenow="${DEFAULT_DB}"
        aria-valuetext="${formatFaderDb(DEFAULT_DB)}"
      >
        <span class="player-module__meter" aria-hidden="true">
          <span class="player-module__meter-fill player-module__meter-fill--left"><i></i></span>
          <span class="player-module__meter-fill player-module__meter-fill--right"><i></i></span>
        </span>
        <span class="player-module__zero-line" aria-hidden="true"></span>
        <span class="player-module__fader-handle" aria-hidden="true"></span>
      </div>
      <output id="${outputId}" class="player-module__fader-output">${formatFaderDb(DEFAULT_DB)}</output>
    </div>
  `;
}

function setMeterWindow(window: HTMLElement, gradient: HTMLElement, level: number): void {
  const hidden = ((1 - level) * 100).toFixed(2);
  window.style.transform = `translate3d(0, ${hidden}%, 0)`;
  gradient.style.transform = `translate3d(0, -${hidden}%, 0)`;
}

export class ModuleFader {
  private readonly rail: HTMLElement;
  private readonly output: HTMLOutputElement;
  private readonly leftMeter: HTMLElement;
  private readonly rightMeter: HTMLElement;
  private readonly leftMeterGradient: HTMLElement;
  private readonly rightMeterGradient: HTMLElement;
  private lastLeftMeterScale = -1;
  private lastRightMeterScale = -1;
  private clipping = false;
  private activePointerId: number | null = null;
  private pointerStartX = 0;
  private pointerStartY = 0;
  private pointerMoved = false;
  private valueDb = DEFAULT_DB;
  private readonly learnGesture = new LongPressGesture(2_000);
  private readonly doubleTap = new DoubleTapTracker();

  private readonly handlePointerDown = (event: PointerEvent) => this.onPointerDown(event);
  private readonly handlePointerMove = (event: PointerEvent) => this.onPointerMove(event);
  private readonly handlePointerEnd = (event: PointerEvent) => this.onPointerEnd(event);
  private readonly handleKeyDown = (event: KeyboardEvent) => this.onKeyDown(event);
  private readonly handleContextMenu = (event: MouseEvent) => this.onContextMenu(event);

  constructor(
    private readonly root: HTMLElement,
    readonly moduleNumber: number,
    private readonly onValueChanged: (valueDb: number) => void = () => {},
    private readonly onLearnRequested: (moduleNumber: number, trigger: HTMLElement) => void = () => {},
  ) {
    const rail = root.querySelector<HTMLElement>('.player-module__fader-rail');
    const output = root.querySelector<HTMLOutputElement>('.player-module__fader-output');
    const leftMeter = root.querySelector<HTMLElement>('.player-module__meter-fill--left');
    const rightMeter = root.querySelector<HTMLElement>('.player-module__meter-fill--right');
    const leftMeterGradient = leftMeter?.querySelector<HTMLElement>('i');
    const rightMeterGradient = rightMeter?.querySelector<HTMLElement>('i');
    if (!rail || !output || !leftMeter || !rightMeter || !leftMeterGradient || !rightMeterGradient) {
      throw new Error(`Fader do módulo ${moduleNumber} incompleto.`);
    }
    this.rail = rail;
    this.output = output;
    this.leftMeter = leftMeter;
    this.rightMeter = rightMeter;
    this.leftMeterGradient = leftMeterGradient;
    this.rightMeterGradient = rightMeterGradient;
    this.rail.setAttribute('aria-orientation', 'vertical');
  }

  mount(): void {
    this.rail.addEventListener('pointerdown', this.handlePointerDown);
    this.rail.addEventListener('pointermove', this.handlePointerMove);
    this.rail.addEventListener('pointerup', this.handlePointerEnd);
    this.rail.addEventListener('pointercancel', this.handlePointerEnd);
    this.rail.addEventListener('keydown', this.handleKeyDown);
    this.rail.addEventListener('contextmenu', this.handleContextMenu);
    this.renderValue();
    this.setMeterLevels(MIN_DB, MIN_DB);
  }

  destroy(): void {
    this.rail.removeEventListener('pointerdown', this.handlePointerDown);
    this.rail.removeEventListener('pointermove', this.handlePointerMove);
    this.rail.removeEventListener('pointerup', this.handlePointerEnd);
    this.rail.removeEventListener('pointercancel', this.handlePointerEnd);
    this.rail.removeEventListener('keydown', this.handleKeyDown);
    this.rail.removeEventListener('contextmenu', this.handleContextMenu);
    this.learnGesture.cancel();
    this.doubleTap.reset();
    this.activePointerId = null;
  }

  setMeterLevel(db: number): void {
    this.setMeterLevels(db, db);
  }

  setMeterLevels(leftDb: number, rightDb: number): void {
    if (!Number.isFinite(leftDb) || !Number.isFinite(rightDb)) return;
    const left = dbToPosition(clamp(leftDb, MIN_DB, MAX_DB));
    const right = dbToPosition(clamp(rightDb, MIN_DB, MAX_DB));
    // O gradiente permanece na altura total do medidor e apenas a janela
    // visivel sobe. Escalar o gradiente inteiro comprimia amarelo/vermelho na
    // base, fazendo um sinal baixo parecer clipado. Janela e gradiente andam
    // em sentidos opostos só com transform: a GPU anima sem repintar.
    if (Math.abs(left - this.lastLeftMeterScale) >= 0.002) {
      setMeterWindow(this.leftMeter, this.leftMeterGradient, left);
      this.lastLeftMeterScale = left;
    }
    if (Math.abs(right - this.lastRightMeterScale) >= 0.002) {
      setMeterWindow(this.rightMeter, this.rightMeterGradient, right);
      this.lastRightMeterScale = right;
    }
    const clipping = leftDb > 0 || rightDb > 0;
    if (clipping !== this.clipping) {
      this.root.classList.toggle('is-clipping', clipping);
      this.clipping = clipping;
    }
  }

  getValueDb(): number {
    return this.valueDb;
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    this.activePointerId = event.pointerId;
    this.pointerStartX = event.clientX;
    this.pointerStartY = event.clientY;
    this.pointerMoved = false;
    this.rail.setPointerCapture(event.pointerId);
    this.rail.focus({ preventScroll: true });
    if (!isDesktopRuntime()) {
      this.learnGesture.start(event, () => {
        if (this.rail.hasPointerCapture(event.pointerId)) this.rail.releasePointerCapture(event.pointerId);
        this.activePointerId = null;
        this.onLearnRequested(this.moduleNumber, this.rail);
      });
    }
    this.updateFromPointer(event);
  }

  private onContextMenu(event: MouseEvent): void {
    if (!isDesktopRuntime()) return;
    event.preventDefault();
    event.stopPropagation();
    this.learnGesture.cancel();
    this.onLearnRequested(this.moduleNumber, this.rail);
  }

  private onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.activePointerId) return;
    event.preventDefault();
    if (Math.hypot(event.clientX - this.pointerStartX, event.clientY - this.pointerStartY) > 8) {
      this.pointerMoved = true;
    }
    this.learnGesture.move(event);
    this.updateFromPointer(event);
  }

  private onPointerEnd(event: PointerEvent): void {
    if (event.pointerId !== this.activePointerId) return;
    this.learnGesture.end(event);
    if (this.rail.hasPointerCapture(event.pointerId)) this.rail.releasePointerCapture(event.pointerId);
    this.activePointerId = null;
    if (!this.pointerMoved && this.doubleTap.register(`module:${this.moduleNumber}`, event.timeStamp)) {
      this.setValueDb(DEFAULT_DB, true);
      return;
    }
    this.onValueChanged(this.valueDb);
  }

  private updateFromPointer(event: PointerEvent): void {
    const bounds = this.rail.getBoundingClientRect();
    const axisSize = bounds.height;
    if (axisSize <= 0) return;
    const safeArea = axisSize * (HANDLE_SAFE_AREA_PERCENT / 100);
    const usableSize = axisSize - safeArea * 2;
    const position = clamp((bounds.bottom - safeArea - event.clientY) / usableSize, 0, 1);
    this.setValueDb(roundTo(positionToDb(position), POINTER_STEP_DB), true);
  }

  private onKeyDown(event: KeyboardEvent): void {
    let nextValue: number | null = null;
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') nextValue = this.valueDb + KEY_STEP_DB;
    if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') nextValue = this.valueDb - KEY_STEP_DB;
    if (event.key === 'PageUp') nextValue = this.valueDb + PAGE_STEP_DB;
    if (event.key === 'PageDown') nextValue = this.valueDb - PAGE_STEP_DB;
    if (event.key === 'Home') nextValue = MIN_DB;
    if (event.key === 'End') nextValue = MAX_DB;
    if (nextValue === null) return;

    event.preventDefault();
    this.setValueDb(roundTo(nextValue, KEY_STEP_DB), true);
  }

  setValueDb(db: number, notify = false): void {
    if (!Number.isFinite(db)) return;
    const clamped = clamp(db, MIN_DB, MAX_DB);
    const nextValue = Math.abs(clamped) < 0.05 ? 0 : clamped;
    if (nextValue === this.valueDb) return;
    this.valueDb = nextValue;
    this.renderValue();
    if (notify) this.onValueChanged(this.valueDb);
  }

  private renderValue(): void {
    const label = formatFaderDb(this.valueDb);
    this.root.style.setProperty(
      '--module-fader-position',
      `${faderDbToVisualPosition(this.valueDb).toFixed(2)}%`,
    );
    this.rail.setAttribute('aria-valuenow', this.valueDb.toFixed(1));
    this.rail.setAttribute('aria-valuetext', label);
    this.output.value = label;
  }
}
