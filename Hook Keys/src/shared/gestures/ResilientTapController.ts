interface PendingTap {
  control: HTMLElement;
  pointerId: number;
  scrolled: boolean;
}

const EXCLUDED_CONTROLS = [
  '[data-keyboard-note]',
  '[data-performance-kind]',
  '[data-module-fader]',
  '[data-horizontal-output-fader]',
  '[data-metronome-output-fader]',
  '[data-output-fader]',
  '.module-envelope-knob',
  '.module-effect-knob',
  '.player-output-knob',
  '.module-eq-q-control',
  '.effect-pad-volume__control',
].join(',');

/**
 * Mobile WebViews can cancel a button click after a few pixels of finger
 * drift, even when the finger is released over the same control. Dispatch the
 * action from the trusted pointerup and suppress the browser's duplicate click.
 * Real scrolling still wins over the button action.
 */
export class ResilientTapController {
  private pending: PendingTap | null = null;
  private duplicateControl: HTMLElement | null = null;
  private duplicateUntil = 0;
  private dispatching = false;

  constructor(private readonly root: HTMLElement) {}

  mount(): void {
    this.root.addEventListener('pointerdown', this.onPointerDown, true);
    this.root.addEventListener('pointerup', this.onPointerUp, true);
    this.root.addEventListener('pointercancel', this.onPointerCancel, true);
    this.root.addEventListener('scroll', this.onScroll, true);
    this.root.addEventListener('click', this.onClick, true);
  }

  destroy(): void {
    this.root.removeEventListener('pointerdown', this.onPointerDown, true);
    this.root.removeEventListener('pointerup', this.onPointerUp, true);
    this.root.removeEventListener('pointercancel', this.onPointerCancel, true);
    this.root.removeEventListener('scroll', this.onScroll, true);
    this.root.removeEventListener('click', this.onClick, true);
    this.pending = null;
    this.duplicateControl = null;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.pending = null;
    if (event.pointerType === 'mouse' || !event.isPrimary) return;
    const target = event.target instanceof Element ? event.target : null;
    const control = target?.closest<HTMLElement>('button, [role="button"]') ?? null;
    if (!control || !this.root.contains(control) || this.isUnavailable(control)) return;
    if (control.matches(EXCLUDED_CONTROLS) || control.closest(EXCLUDED_CONTROLS)) return;
    this.pending = { control, pointerId: event.pointerId, scrolled: false };
  };

  private readonly onScroll = (): void => {
    if (this.pending) this.pending.scrolled = true;
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const pending = this.pending;
    this.pending = null;
    if (!pending || pending.pointerId !== event.pointerId || pending.scrolled) return;
    if (!pending.control.isConnected || this.isUnavailable(pending.control)) return;
    const released = this.root.ownerDocument.elementFromPoint(event.clientX, event.clientY);
    if (!released || (released !== pending.control && !pending.control.contains(released))) return;

    // Run while pointerup still owns transient user activation. This is
    // required by actions that immediately open a native file chooser.
    this.duplicateControl = pending.control;
    this.duplicateUntil = performance.now() + 700;
    this.dispatching = true;
    pending.control.click();
    this.dispatching = false;
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (this.pending?.pointerId === event.pointerId) this.pending = null;
  };

  private readonly onClick = (event: MouseEvent): void => {
    if (this.dispatching || !event.isTrusted || performance.now() > this.duplicateUntil) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!this.duplicateControl || !target ||
        (target !== this.duplicateControl && !this.duplicateControl.contains(target))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.duplicateControl = null;
  };

  private isUnavailable(control: HTMLElement): boolean {
    return control.matches(':disabled, [aria-disabled="true"]');
  }
}
