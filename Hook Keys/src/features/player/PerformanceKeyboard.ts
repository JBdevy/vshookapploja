import { formatMidiNote } from '../midi/MidiInputService';

export type PlayerBottomView = 'presets' | 'keyboard';
export type PerformanceKeyboardStyle = 'standard' | 'black' | 'neon';

const FIRST_NOTE = 9;
const NOTE_COUNT = 88;
const WHITE_KEY_COUNT = 52;
const BLACK_NOTE_OFFSETS = new Set([1, 3, 6, 8, 10]);

export interface PerformanceNoteDetail {
  channel: number;
  inputId: string | null;
  noteNumber: number;
  pressed: boolean;
  velocity: number;
}

export function createPerformanceKeyboardMarkup(style: PerformanceKeyboardStyle): string {
  const whiteKeys: string[] = [];
  const blackKeys: string[] = [];
  let whiteIndex = 0;
  for (let noteNumber = FIRST_NOTE; noteNumber < FIRST_NOTE + NOTE_COUNT; noteNumber += 1) {
    const black = BLACK_NOTE_OFFSETS.has(noteNumber % 12);
    const key = `
      <button
        class="performance-keyboard__key performance-keyboard__key--${black ? 'black' : 'white'}"
        type="button"
        data-keyboard-note="${noteNumber}"
        aria-label="${formatMidiNote(noteNumber)}"
        ${black ? `style="--black-key-left:${((whiteIndex / WHITE_KEY_COUNT) * 100).toFixed(5)}%"` : ''}
      ><span>${formatMidiNote(noteNumber)}</span></button>
    `;
    if (black) blackKeys.push(key);
    else {
      whiteKeys.push(key);
      whiteIndex += 1;
    }
  }
  return `
    <div class="performance-keyboard performance-keyboard--${style}" data-performance-keyboard hidden>
      <div class="performance-keyboard__scroller">
        <div class="performance-keyboard__keys">
          <div class="performance-keyboard__white-keys">${whiteKeys.join('')}</div>
          <div class="performance-keyboard__black-keys">${blackKeys.join('')}</div>
        </div>
      </div>
    </div>
  `;
}

export function createPerformanceKeyboardSettingsMarkup(
  midiSlot: number,
  style: PerformanceKeyboardStyle,
): string {
  return `
    <section class="performance-keyboard-settings">
      <article>
        <strong>Dispositivo</strong>
        <div role="group" aria-label="Dispositivo MIDI que ilumina o teclado">
          ${[1, 2, 3].map((slot) => createChoiceButton('keyboard-midi-slot', String(slot), `MIDI ${slot}`, slot === midiSlot)).join('')}
        </div>
      </article>
      <article>
        <strong>Estilo do teclado</strong>
        <div role="group" aria-label="Estilo visual do teclado">
          ${createChoiceButton('keyboard-style', 'standard', 'Padrão', style === 'standard')}
          ${createChoiceButton('keyboard-style', 'black', 'Black', style === 'black')}
          ${createChoiceButton('keyboard-style', 'neon', 'Neon', style === 'neon')}
        </div>
      </article>
    </section>
  `;
}

export class PerformanceKeyboardController {
  private readonly activePointers = new Map<number, number>();
  private readonly pointerStartedAt = new Map<number, number>();
  private readonly pointerStartX = new Map<number, number>();
  private readonly pointerCurrentX = new Map<number, number>();
  private readonly twoFingerGesturePointers = new Set<number>();
  private twoFingerGestureTriggered = false;
  private spreadCommitTimer: number | null = null;

  private readonly handlePointerDown = (event: PointerEvent) => this.onPointerDown(event);
  private readonly handlePointerMove = (event: PointerEvent) => this.onPointerMove(event);
  private readonly handlePointerEnd = (event: PointerEvent) => this.onPointerEnd(event);

  constructor(
    private readonly root: HTMLElement,
    private readonly onTwoFingerSpread: () => void = () => {},
    private readonly onNote: (noteNumber: number, pressed: boolean, velocity: number) => void = () => {},
  ) {}

  mount(): void {
    this.root.addEventListener('pointerdown', this.handlePointerDown);
    this.root.addEventListener('pointermove', this.handlePointerMove);
    this.root.addEventListener('pointerup', this.handlePointerEnd);
    this.root.addEventListener('pointercancel', this.handlePointerEnd);
  }

  destroy(): void {
    this.root.removeEventListener('pointerdown', this.handlePointerDown);
    this.root.removeEventListener('pointermove', this.handlePointerMove);
    this.root.removeEventListener('pointerup', this.handlePointerEnd);
    this.root.removeEventListener('pointercancel', this.handlePointerEnd);
    for (const note of this.activePointers.values()) this.setPressed(note, false);
    this.activePointers.clear();
    this.pointerStartedAt.clear();
    this.pointerStartX.clear();
    this.pointerCurrentX.clear();
    this.twoFingerGesturePointers.clear();
    if (this.spreadCommitTimer !== null) window.clearTimeout(this.spreadCommitTimer);
    this.spreadCommitTimer = null;
  }

  setStyle(style: PerformanceKeyboardStyle): void {
    this.root.classList.remove('performance-keyboard--standard', 'performance-keyboard--black', 'performance-keyboard--neon');
    this.root.classList.add(`performance-keyboard--${style}`);
  }

  setMidiNote(noteNumber: number, pressed: boolean): void {
    this.setPressed(noteNumber, pressed);
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const target = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>('[data-keyboard-note]')
      : null;
    const noteNumber = Number(target?.dataset.keyboardNote);
    if (!target || !Number.isInteger(noteNumber)) return;
    event.preventDefault();
    target.setPointerCapture(event.pointerId);
    this.activePointers.set(event.pointerId, noteNumber);
    this.pointerStartedAt.set(event.pointerId, event.timeStamp);
    this.pointerStartX.set(event.pointerId, event.clientX);
    this.pointerCurrentX.set(event.pointerId, event.clientX);
    this.setPressed(noteNumber, true);
    this.dispatchNote(noteNumber, true);
    if (event.pointerType === 'touch' && this.activePointers.size === 2) {
      const pointerIds = [...this.activePointers.keys()];
      const firstStartedAt = this.pointerStartedAt.get(pointerIds[0] ?? -1) ?? 0;
      const secondStartedAt = this.pointerStartedAt.get(pointerIds[1] ?? -1) ?? 0;
      if (Math.abs(firstStartedAt - secondStartedAt) <= 160) {
        this.twoFingerGesturePointers.clear();
        this.twoFingerGestureTriggered = false;
        for (const pointerId of pointerIds) {
          this.twoFingerGesturePointers.add(pointerId);
          const activeNote = this.activePointers.get(pointerId);
          if (activeNote !== undefined) {
            this.setPressed(activeNote, false);
            this.dispatchNote(activeNote, false);
          }
        }
      }
    }
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.activePointers.has(event.pointerId)) return;
    this.pointerCurrentX.set(event.pointerId, event.clientX);
    if (this.twoFingerGestureTriggered || this.twoFingerGesturePointers.size !== 2) return;
    const pointers = [...this.twoFingerGesturePointers];
    const firstId = pointers[0];
    const secondId = pointers[1];
    if (firstId === undefined || secondId === undefined) return;
    const firstStart = this.pointerStartX.get(firstId);
    const secondStart = this.pointerStartX.get(secondId);
    const firstCurrent = this.pointerCurrentX.get(firstId);
    const secondCurrent = this.pointerCurrentX.get(secondId);
    if (firstStart === undefined || secondStart === undefined || firstCurrent === undefined || secondCurrent === undefined) return;
    const leftId = firstStart <= secondStart ? firstId : secondId;
    const rightId = leftId === firstId ? secondId : firstId;
    const leftStart = this.pointerStartX.get(leftId) ?? 0;
    const rightStart = this.pointerStartX.get(rightId) ?? 0;
    const leftCurrent = this.pointerCurrentX.get(leftId) ?? leftStart;
    const rightCurrent = this.pointerCurrentX.get(rightId) ?? rightStart;
    const openingDistance = (rightCurrent - leftCurrent) - (rightStart - leftStart);
    if (leftCurrent <= leftStart - 24 && rightCurrent >= rightStart + 24 && openingDistance >= 64) {
      event.preventDefault();
      this.twoFingerGestureTriggered = true;
    }
  }

  private onPointerEnd(event: PointerEvent): void {
    const noteNumber = this.activePointers.get(event.pointerId);
    if (noteNumber === undefined) return;
    event.preventDefault();
    this.activePointers.delete(event.pointerId);
    this.pointerStartedAt.delete(event.pointerId);
    this.pointerStartX.delete(event.pointerId);
    this.pointerCurrentX.delete(event.pointerId);
    if (this.twoFingerGesturePointers.has(event.pointerId)) {
      this.twoFingerGesturePointers.delete(event.pointerId);
      if (this.twoFingerGesturePointers.size === 0) {
        const shouldCommitSpread = this.twoFingerGestureTriggered;
        this.twoFingerGestureTriggered = false;
        if (shouldCommitSpread) {
          // Espera o click sintetizado terminar antes de revelar os presets que
          // ficam fisicamente sob os dedos. Assim o pointerup não os seleciona.
          this.spreadCommitTimer = window.setTimeout(() => {
            this.spreadCommitTimer = null;
            this.onTwoFingerSpread();
          }, 0);
        }
      }
      return;
    }
    this.setPressed(noteNumber, false);
    this.dispatchNote(noteNumber, false);
  }

  private setPressed(noteNumber: number, pressed: boolean): void {
    const key = this.root.querySelector<HTMLButtonElement>(`[data-keyboard-note="${noteNumber}"]`);
    key?.classList.toggle('is-pressed', pressed);
    key?.setAttribute('aria-pressed', String(pressed));
  }

  private dispatchNote(noteNumber: number, pressed: boolean): void {
    this.onNote(noteNumber, pressed, pressed ? 110 : 0);
    window.dispatchEvent(new CustomEvent<PerformanceNoteDetail>('hookkeys:performance-note', {
      detail: {
        channel: 1,
        inputId: null,
        noteNumber,
        pressed,
        velocity: pressed ? 110 : 0,
      },
    }));
  }
}

function createChoiceButton(group: string, value: string, label: string, selected: boolean): string {
  return `<button type="button" data-${group}="${value}" class="${selected ? 'is-selected' : ''}" aria-pressed="${selected}">${label}</button>`;
}
