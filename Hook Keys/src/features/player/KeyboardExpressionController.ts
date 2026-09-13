export type KeyboardExpressionKind = 'pitch' | 'mod';
interface ExpressionValues { pitch: number; mod: number }
interface ExpressionDrag {
  input: HTMLInputElement;
  kind: KeyboardExpressionKind;
  top: number;
  height: number;
}

// This controller only updates two small controls; MIDI audio stays in the motor.
export class KeyboardExpressionController {
  private inputId: string | null = null;
  private readonly midiValues = new Map<string, ExpressionValues>();
  private readonly drags = new Map<number, ExpressionDrag>();
  private keyboardPitchHeld = false;
  private readonly pointerDown = (event: PointerEvent) => {
    const input = event.target instanceof Element
      ? event.target.closest<HTMLInputElement>('[data-keyboard-expression]') : null;
    const kind = input?.dataset.keyboardExpression;
    if (!input || (kind !== 'pitch' && kind !== 'mod') || event.button !== 0) return;
    if ([...this.drags.values()].some((drag) => drag.kind === kind)) return;
    event.preventDefault();
    const bounds = input.getBoundingClientRect();
    if (bounds.height <= 0) return;
    this.drags.set(event.pointerId, { input, kind, top: bounds.top, height: bounds.height });
    input.setPointerCapture(event.pointerId);
    this.move(event.pointerId, event.clientY);
  };
  private readonly pointerMove = (event: PointerEvent) => {
    if (!this.drags.has(event.pointerId)) return;
    event.preventDefault();
    this.move(event.pointerId, event.clientY);
  };
  private readonly pointerEnd = (event: PointerEvent) => this.end(event.pointerId);
  private readonly inputChange = (event: Event) => {
    const input = event.target instanceof Element
      ? event.target.closest<HTMLInputElement>('[data-keyboard-expression]') : null;
    const kind = input?.dataset.keyboardExpression;
    if (!input || (kind !== 'pitch' && kind !== 'mod')) return;
    const value = this.render(kind, Number(input.value));
    if (kind === 'pitch') this.keyboardPitchHeld = true;
    this.onExpression(kind, value, kind === 'pitch');
  };
  private readonly keyUp = (event: KeyboardEvent) => {
    if (event.target instanceof Element && event.target.matches('[data-keyboard-expression="pitch"]')) {
      this.onExpression('pitch', this.render('pitch', 8192), false);
      this.keyboardPitchHeld = false;
    }
  };
  private readonly blur = () => this.cancelGestures();
  private readonly focusOut = () => {
    if (this.keyboardPitchHeld) {
      this.onExpression('pitch', this.render('pitch', 8192), false);
      this.keyboardPitchHeld = false;
    }
  };
  private readonly visibility = () => { if (document.hidden) this.cancelGestures(); };

  constructor(
    private readonly root: HTMLElement,
    private readonly onExpression: (kind: KeyboardExpressionKind, value: number, active: boolean) => void,
  ) {}

  mount(): void {
    this.root.addEventListener('pointerdown', this.pointerDown);
    this.root.addEventListener('pointermove', this.pointerMove);
    this.root.addEventListener('pointerup', this.pointerEnd);
    this.root.addEventListener('pointercancel', this.pointerEnd);
    this.root.addEventListener('lostpointercapture', this.pointerEnd);
    this.root.addEventListener('input', this.inputChange);
    this.root.addEventListener('keyup', this.keyUp);
    this.root.addEventListener('focusout', this.focusOut);
    window.addEventListener('blur', this.blur);
    window.addEventListener('resize', this.blur);
    document.addEventListener('visibilitychange', this.visibility);
    this.setInputId(this.inputId);
  }

  destroy(): void {
    this.cancelGestures();
    this.root.removeEventListener('pointerdown', this.pointerDown);
    this.root.removeEventListener('pointermove', this.pointerMove);
    this.root.removeEventListener('pointerup', this.pointerEnd);
    this.root.removeEventListener('pointercancel', this.pointerEnd);
    this.root.removeEventListener('lostpointercapture', this.pointerEnd);
    this.root.removeEventListener('input', this.inputChange);
    this.root.removeEventListener('keyup', this.keyUp);
    this.root.removeEventListener('focusout', this.focusOut);
    window.removeEventListener('blur', this.blur);
    window.removeEventListener('resize', this.blur);
    document.removeEventListener('visibilitychange', this.visibility);
  }

  setInputId(inputId: string | null): void {
    if (this.inputId !== inputId) this.cancelGestures();
    this.inputId = inputId;
    const values = inputId ? this.midiValues.get(inputId) : null;
    this.render('pitch', values?.pitch ?? 8192);
    this.render('mod', values?.mod ?? 0);
  }

  receiveMidi(kind: KeyboardExpressionKind, value: number, inputId: string | null): void {
    if (!Number.isFinite(value)) return;
    const safeValue = this.normalize(kind, value);
    if (inputId) {
      const values = this.midiValues.get(inputId) ?? { pitch: 8192, mod: 0 };
      values[kind] = safeValue;
      this.midiValues.set(inputId, values);
    }
    if (inputId !== this.inputId || [...this.drags.values()].some((drag) => drag.kind === kind)) return;
    // Feedback must never re-send the received MIDI message.
    this.render(kind, safeValue);
  }

  cancelGestures(): void {
    for (const pointerId of [...this.drags.keys()]) this.end(pointerId);
    this.focusOut();
  }

  private move(pointerId: number, clientY: number): void {
    const drag = this.drags.get(pointerId);
    if (!drag) return;
    const position = Math.min(1, Math.max(0, 1 - (clientY - drag.top) / drag.height));
    const value = this.render(drag.kind, position * (drag.kind === 'pitch' ? 16383 : 127));
    this.onExpression(drag.kind, value, true);
  }

  private end(pointerId: number): void {
    const drag = this.drags.get(pointerId);
    if (!drag) return;
    this.drags.delete(pointerId);
    const value = this.render(drag.kind, drag.kind === 'pitch' ? 8192 : Number(drag.input.value));
    this.onExpression(drag.kind, value, false);
    if (drag.input.hasPointerCapture(pointerId)) drag.input.releasePointerCapture(pointerId);
  }

  private normalize(kind: KeyboardExpressionKind, value: number): number {
    return Math.round(Math.min(kind === 'pitch' ? 16383 : 127, Math.max(0, value)));
  }

  private render(kind: KeyboardExpressionKind, value: number): number {
    const safeValue = this.normalize(kind, value);
    const input = this.root.querySelector<HTMLInputElement>(`[data-keyboard-expression="${kind}"]`);
    if (input) {
      input.value = String(safeValue);
      input.closest<HTMLElement>('.keyboard-expression')?.style.setProperty('--wheel-position', `${safeValue / (kind === 'pitch' ? 16383 : 127) * 100}%`);
      input.setAttribute('aria-valuetext', kind === 'mod' ? String(safeValue)
        : `${Math.round((safeValue - 8192) / (safeValue >= 8192 ? 8191 : 8192) * 100)}%`);
    }
    return safeValue;
  }
}
