const COMPUTER_KEY_NOTES: Readonly<Record<string, number>> = {
  KeyZ: 48,
  KeyS: 49,
  KeyX: 50,
  KeyD: 51,
  KeyC: 52,
  KeyV: 53,
  KeyG: 54,
  KeyB: 55,
  KeyH: 56,
  KeyN: 57,
  KeyJ: 58,
  KeyM: 59,
  KeyQ: 60,
  Digit2: 61,
  KeyW: 62,
  Digit3: 63,
  KeyE: 64,
  KeyR: 65,
  Digit5: 66,
  KeyT: 67,
  Digit6: 68,
  KeyY: 69,
  Digit7: 70,
  KeyU: 71,
  KeyI: 72,
  Digit9: 73,
  KeyO: 74,
  Digit0: 75,
  KeyP: 76,
};

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

export class ComputerKeyboardController {
  private readonly heldCodes = new Map<string, number>();
  private readonly handleKeyDown = (event: KeyboardEvent) => this.onKeyDown(event);
  private readonly handleKeyUp = (event: KeyboardEvent) => this.onKeyUp(event);
  private readonly handleBlur = () => this.releaseAll();
  private readonly handleVisibility = () => {
    if (document.visibilityState === 'hidden') this.releaseAll();
  };

  constructor(
    private readonly onNote: (noteNumber: number, pressed: boolean, velocity: number) => void,
  ) {}

  mount(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('visibilitychange', this.handleVisibility);
  }

  destroy(): void {
    this.releaseAll();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('visibilitychange', this.handleVisibility);
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || isEditableTarget(event.target)) return;
    const note = COMPUTER_KEY_NOTES[event.code];
    if (note === undefined || this.heldCodes.has(event.code)) return;
    event.preventDefault();
    this.heldCodes.set(event.code, note);
    this.onNote(note, true, 110);
  }

  private onKeyUp(event: KeyboardEvent): void {
    const note = this.heldCodes.get(event.code);
    if (note === undefined) return;
    event.preventDefault();
    this.heldCodes.delete(event.code);
    this.onNote(note, false, 0);
  }

  private releaseAll(): void {
    for (const note of this.heldCodes.values()) this.onNote(note, false, 0);
    this.heldCodes.clear();
  }
}

export { COMPUTER_KEY_NOTES };
