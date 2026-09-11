import { hookKeysNative } from '../../platform/native/HookKeysNative';

type HapticStrength = 'light' | 'medium';

interface DragFeedback {
  pointerId: number;
  lastX: number;
  lastY: number;
  lastAt: number;
}

const DRAG_CONTROL_SELECTOR = [
  '.player-module__fader-rail',
  '[data-horizontal-output-fader]',
  '[data-metronome-output-fader]',
  '[data-output-fader]',
  '.module-envelope-knob',
  '.module-effect-knob',
  '.module-eq-q-control',
  '.effect-pad-volume__control',
].join(',');

const LIST_SELECTION_SELECTOR = [
  '.track-card[data-track-id]',
  '.track-card[data-playlist-track-id]',
  'button[data-playlist-id]',
  'button[data-tracks-action="show-all"]',
].join(',');

export class UiFeedback {
  private root: HTMLElement | null = null;
  private audioContext: AudioContext | null = null;
  private drag: DragFeedback | null = null;
  private soundEnabled = false;
  private vibrationEnabled = false;

  private readonly handlePointerDown = (event: PointerEvent) => this.onPointerDown(event);
  private readonly handlePointerMove = (event: PointerEvent) => this.onPointerMove(event);
  private readonly handlePointerEnd = (event: PointerEvent) => this.onPointerEnd(event);
  private readonly handleClick = (event: Event) => this.onClick(event);

  mount(root: HTMLElement): void {
    this.destroy();
    this.root = root;
    root.addEventListener('pointerdown', this.handlePointerDown, true);
    root.addEventListener('pointermove', this.handlePointerMove, true);
    root.addEventListener('pointerup', this.handlePointerEnd, true);
    root.addEventListener('pointercancel', this.handlePointerEnd, true);
    root.addEventListener('click', this.handleClick, true);
  }

  destroy(): void {
    this.root?.removeEventListener('pointerdown', this.handlePointerDown, true);
    this.root?.removeEventListener('pointermove', this.handlePointerMove, true);
    this.root?.removeEventListener('pointerup', this.handlePointerEnd, true);
    this.root?.removeEventListener('pointercancel', this.handlePointerEnd, true);
    this.root?.removeEventListener('click', this.handleClick, true);
    this.root = null;
    this.drag = null;
    void this.audioContext?.close().catch(() => undefined);
    this.audioContext = null;
  }

  isSoundEnabled(): boolean { return this.soundEnabled; }
  isVibrationEnabled(): boolean { return this.vibrationEnabled; }

  setSoundEnabled(enabled: boolean, acknowledge = true): void {
    this.soundEnabled = enabled;
    if (enabled && acknowledge) this.playTone(760, 1_080, 0.055, 0.045);
  }

  setVibrationEnabled(enabled: boolean, acknowledge = true): void {
    this.vibrationEnabled = enabled;
    if (enabled && acknowledge) this.vibrate('medium');
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const dragControl = target.closest<HTMLElement>(DRAG_CONTROL_SELECTOR);
    if (dragControl && !this.isDisabled(dragControl)) {
      this.drag = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY, lastAt: 0 };
      this.tick(true);
      return;
    }

    const interactive = target.closest<HTMLElement>('button, [role="button"], input[type="checkbox"], select');
    if (!interactive || this.isDisabled(interactive) || interactive.matches(LIST_SELECTION_SELECTOR)) return;
    this.press();
  }

  private onPointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.lastX, event.clientY - drag.lastY) < 11) return;
    const now = performance.now();
    if (now - drag.lastAt < 42) return;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.lastAt = now;
    this.tick(false);
  }

  private onPointerEnd(event: PointerEvent): void {
    if (this.drag?.pointerId === event.pointerId) this.drag = null;
  }

  private onClick(event: Event): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>(LIST_SELECTION_SELECTOR) : null;
    if (!target || this.isDisabled(target)) return;
    this.playTone(940, null, 0.02, 0.04);
    this.vibrate('light');
  }

  private press(): void {
    this.playTone(1_500, null, 0.014, 0.04);
    this.vibrate('light');
  }

  private tick(includeVibration: boolean): void {
    this.playTone(2_150, null, 0.008, 0.014);
    if (includeVibration) this.vibrate('light');
    else if (this.vibrationEnabled) this.vibrate('light');
  }

  private playTone(from: number, to: number | null, duration: number, peak: number): void {
    if (!this.soundEnabled) return;
    try {
      const context = this.audioContext ?? new AudioContext({ latencyHint: 'interactive' });
      this.audioContext = context;
      if (context.state === 'suspended') void context.resume();
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(from, now);
      if (to) oscillator.frequency.exponentialRampToValueAtTime(to, now + duration);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak, now + Math.min(0.004, duration / 3));
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.01);
    } catch {
      // Retorno de interface nunca deve interromper o uso do app.
    }
  }

  private vibrate(strength: HapticStrength): void {
    if (!this.vibrationEnabled) return;
    void hookKeysNative.performHaptic(strength).then((handled) => {
      if (handled) return;
      try { navigator.vibrate?.(strength === 'medium' ? 14 : 8); } catch { /* sem suporte */ }
    });
  }

  private isDisabled(element: HTMLElement): boolean {
    return (element instanceof HTMLButtonElement || element instanceof HTMLInputElement || element instanceof HTMLSelectElement)
      ? element.disabled
      : element.getAttribute('aria-disabled') === 'true';
  }
}
