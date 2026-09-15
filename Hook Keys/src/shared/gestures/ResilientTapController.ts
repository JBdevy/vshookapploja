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
  // Onde o dedo encostou. Um clique de verdade sempre cai nesse elemento (ou
  // num parente/filho dele); se ele sumiu ou foi coberto por outra tela, o
  // clique é resto do toque anterior e não pode acionar a tela nova.
  private touchDownTarget: Element | null = null;

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
    // Um toque novo começou: o clique atrasado do toque anterior já passou.
    this.duplicateControl = null;
    this.touchDownTarget = null;
    if (event.pointerType === 'mouse' || !event.isPrimary) return;
    const target = event.target instanceof Element ? event.target : null;
    this.touchDownTarget = target;
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
    if (this.dispatching || !event.isTrusted) return;
    if (this.isLeakedTouchClick(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.touchDownTarget = null;
      this.duplicateControl = null;
      return;
    }
    this.touchDownTarget = null;
    if (performance.now() > this.duplicateUntil) return;
    if (!this.duplicateControl) return;
    // A ação deste toque já rodou no pointerup. O clique nativo que o WebView
    // gera depois é sempre duplicado, mesmo que caia em outro elemento: quando
    // a ação abre uma tela, o botão novo que ficou sob o dedo recebia esse
    // clique e já aparecia acionado/selecionado.
    event.preventDefault();
    event.stopImmediatePropagation();
    this.duplicateControl = null;
  };

  private isLeakedTouchClick(event: MouseEvent): boolean {
    const down = this.touchDownTarget;
    const target = event.target instanceof Element ? event.target : null;
    // detail 0 = clique de teclado/acessibilidade, que não vem de um toque.
    if (!down || !target || event.detail === 0) return false;
    if (!down.isConnected) return true;
    if (target === down || target.contains(down) || down.contains(target)) return false;
    // Tocar no texto de um <label> repassa o clique para o input dele.
    const labels = (target as Partial<HTMLInputElement>).labels;
    return !(labels && Array.from(labels).some((label) => label.contains(down)));
  }

  private isUnavailable(control: HTMLElement): boolean {
    return control.matches(':disabled, [aria-disabled="true"]');
  }
}
