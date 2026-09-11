import {
  formatOutputDb,
  OUTPUTS,
  outputPosition,
  type OutputBus,
  type OutputEnabledState,
  type OutputLevels,
} from './OutputControls';
import { visualPositionToFaderDb } from './ModuleFader';
import { LongPressGesture } from '../../shared/gestures/LongPressGesture';
import { DoubleTapTracker } from '../../shared/gestures/DoubleTapTracker';

type OutputChangeHandler = (bus: OutputBus, db: number, enabled: boolean) => void;

interface ActiveDrag {
  bus: OutputBus;
  pointerId: number;
  rail: HTMLElement;
  startX: number;
  startY: number;
  moved: boolean;
}

export function createOutputFaderPanelMarkup(
  levels: OutputLevels,
  enabled: OutputEnabledState,
  outputs = OUTPUTS,
): string {
  return `
    <section class="output-fader-panel" aria-label="Volumes">
      ${outputs.map(({ id, label }) => `
        <article class="output-fader-channel" data-output-channel="${id}">
          <h3>${label}</h3>
          <output data-output-fader-value="${id}">${formatOutputDb(levels[id])}</output>
          <div class="output-fader-rail" data-output-fader="${id}" role="slider" tabindex="0" aria-label="Volume ${label}" aria-valuemin="-60" aria-valuemax="6" aria-valuenow="${levels[id]}" style="--output-zero-position:${outputPosition(0)}%">
            <span class="output-fader-fill" style="height:${outputPosition(levels[id])}%"></span>
            <i class="output-fader-zero" aria-hidden="true"></i>
            <b class="output-fader-handle" style="bottom:${outputPosition(levels[id])}%" aria-hidden="true"></b>
          </div>
          <button class="output-fader-power ${enabled[id] ? 'is-on' : 'is-off'}" type="button" data-output-power="${id}" aria-pressed="${enabled[id]}">${enabled[id] ? 'ON' : 'OFF'}</button>
        </article>
      `).join('')}
    </section>
  `;
}

export class OutputFaderPanelController {
  private activeDrag: ActiveDrag | null = null;
  private readonly learnGesture = new LongPressGesture(2_000);
  private readonly doubleTap = new DoubleTapTracker();
  private readonly handlePointerDown = (event: PointerEvent) => this.onPointerDown(event);
  private readonly handlePointerMove = (event: PointerEvent) => this.onPointerMove(event);
  private readonly handlePointerEnd = (event: PointerEvent) => this.onPointerEnd(event);
  private readonly handleClick = (event: Event) => this.onClick(event);

  constructor(
    private readonly root: HTMLElement,
    private readonly levels: OutputLevels,
    private readonly enabled: OutputEnabledState,
    private readonly onChange: OutputChangeHandler,
    private readonly onLearnRequested: (bus: OutputBus, trigger: HTMLElement) => void = () => {},
  ) {}

  mount(): void {
    this.root.addEventListener('pointerdown', this.handlePointerDown);
    this.root.addEventListener('pointermove', this.handlePointerMove);
    this.root.addEventListener('pointerup', this.handlePointerEnd);
    this.root.addEventListener('pointercancel', this.handlePointerEnd);
    this.root.addEventListener('click', this.handleClick);
  }

  destroy(): void {
    this.root.removeEventListener('pointerdown', this.handlePointerDown);
    this.root.removeEventListener('pointermove', this.handlePointerMove);
    this.root.removeEventListener('pointerup', this.handlePointerEnd);
    this.root.removeEventListener('pointercancel', this.handlePointerEnd);
    this.root.removeEventListener('click', this.handleClick);
    this.learnGesture.cancel();
    this.doubleTap.reset();
    this.activeDrag = null;
  }

  private onPointerDown(event: PointerEvent): void {
    const target = event.target;
    const rail = target instanceof Element
      ? target.closest<HTMLElement>('[data-output-fader]')
      : null;
    const bus = rail?.dataset.outputFader;
    if (!rail || !isBus(bus)) return;
    event.preventDefault();
    rail.setPointerCapture(event.pointerId);
    this.activeDrag = {
      bus,
      pointerId: event.pointerId,
      rail,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    this.learnGesture.start(event, () => {
      if (rail.hasPointerCapture(event.pointerId)) rail.releasePointerCapture(event.pointerId);
      this.activeDrag = null;
      this.onLearnRequested(bus, rail);
    });
    this.updateFromPointer(this.activeDrag, event.clientY);
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.activeDrag || this.activeDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (Math.hypot(event.clientX - this.activeDrag.startX, event.clientY - this.activeDrag.startY) > 8) {
      this.activeDrag.moved = true;
    }
    this.learnGesture.move(event);
    this.updateFromPointer(this.activeDrag, event.clientY);
  }

  private onPointerEnd(event: PointerEvent): void {
    if (!this.activeDrag || this.activeDrag.pointerId !== event.pointerId) return;
    this.learnGesture.end(event);
    if (this.activeDrag.rail.hasPointerCapture(event.pointerId)) {
      this.activeDrag.rail.releasePointerCapture(event.pointerId);
    }
    if (!this.activeDrag.moved && this.doubleTap.register(`output:${this.activeDrag.bus}`, event.timeStamp)) {
      this.setValue(this.activeDrag, 0);
    }
    this.activeDrag = null;
  }

  private onClick(event: Event): void {
    const target = event.target;
    const button = target instanceof Element
      ? target.closest<HTMLButtonElement>('[data-output-power]')
      : null;
    const bus = button?.dataset.outputPower;
    if (!button || !isBus(bus)) return;
    this.enabled[bus] = !this.enabled[bus];
    button.classList.toggle('is-on', this.enabled[bus]);
    button.classList.toggle('is-off', !this.enabled[bus]);
    button.textContent = this.enabled[bus] ? 'ON' : 'OFF';
    button.setAttribute('aria-pressed', String(this.enabled[bus]));
    this.onChange(bus, this.levels[bus], this.enabled[bus]);
  }

  private updateFromPointer(drag: ActiveDrag, clientY: number): void {
    const bounds = drag.rail.getBoundingClientRect();
    if (bounds.height <= 0) return;
    const ratio = Math.min(1, Math.max(0, (bounds.bottom - clientY) / bounds.height));
    const db = visualPositionToFaderDb(ratio);
    this.setValue(drag, db);
  }

  private setValue(drag: ActiveDrag, db: number): void {
    this.levels[drag.bus] = db;
    const position = outputPosition(db);
    const channel = drag.rail.closest<HTMLElement>('[data-output-channel]');
    const fill = channel?.querySelector<HTMLElement>('.output-fader-fill');
    const handle = channel?.querySelector<HTMLElement>('.output-fader-handle');
    const output = channel?.querySelector<HTMLOutputElement>('[data-output-fader-value]');
    drag.rail.setAttribute('aria-valuenow', String(db));
    if (fill) fill.style.height = `${position}%`;
    if (handle) handle.style.bottom = `${position}%`;
    if (output) output.value = formatOutputDb(db);
    this.onChange(drag.bus, db, this.enabled[drag.bus]);
  }
}

function isBus(value: string | undefined): value is OutputBus {
  return value === 'music' || value === 'pads' || value === 'effects' || value === 'master';
}
