import { formatMidiNote } from '../midi/MidiInputService';

export type PlayerBottomView = 'presets' | 'keyboard';
export type PerformanceKeyboardStyle = 'standard' | 'black' | 'hook';

const FIRST_NOTE = 9;
const NOTE_COUNT = 88;
const BLACK_NOTE_OFFSETS = new Set([1, 3, 6, 8, 10]);
// Quatro oitavas: um teclado próprio de C2 a C5, com as teclas mais largas.
const SHORT_FIRST_NOTE = 36;
const SHORT_NOTE_COUNT = 37;
// A tecla preta tem 62% da largura da branca, como no teclado inteiro.
const BLACK_KEY_RATIO = 0.62;

export type PerformanceKeyboardSpan = 'full' | 'four';

export interface PerformanceNoteDetail {
  channel: number;
  inputId: string | null;
  noteNumber: number;
  pressed: boolean;
  velocity: number;
}

// Só as teclas: o mesmo bloco serve para o teclado inteiro e para o de cinco
// oitavas, e é ele que o botão Keyboard troca no toque longo.
export function createPerformanceKeysMarkup(span: PerformanceKeyboardSpan = 'full'): string {
  const short = span === 'four';
  const firstNote = short ? SHORT_FIRST_NOTE : FIRST_NOTE;
  const noteCount = short ? SHORT_NOTE_COUNT : NOTE_COUNT;
  let whiteKeyCount = 0;
  for (let noteNumber = firstNote; noteNumber < firstNote + noteCount; noteNumber += 1) {
    if (!BLACK_NOTE_OFFSETS.has(noteNumber % 12)) whiteKeyCount += 1;
  }
  const whiteKeyWidth = 100 / whiteKeyCount;
  const whiteKeys: string[] = [];
  const blackKeys: string[] = [];
  let whiteIndex = 0;
  for (let noteNumber = firstNote; noteNumber < firstNote + noteCount; noteNumber += 1) {
    const black = BLACK_NOTE_OFFSETS.has(noteNumber % 12);
    // Cada dó leva o nome escrito na tecla, e o lá mais grave do teclado
    // inteiro também: é por eles que a pessoa se localiza.
    const named = !black && (noteNumber % 12 === 0 || noteNumber === firstNote);
    const key = `
      <button
        class="performance-keyboard__key performance-keyboard__key--${black ? 'black' : 'white'}"
        type="button"
        data-keyboard-note="${noteNumber}"
        aria-label="${formatMidiNote(noteNumber)}"
        ${black ? `style="--black-key-left:${((whiteIndex / whiteKeyCount) * 100).toFixed(5)}%"` : ''}
      >${named ? `<span>${formatMidiNote(noteNumber)}</span>` : ''}</button>
    `;
    if (black) blackKeys.push(key);
    else {
      whiteKeys.push(key);
      whiteIndex += 1;
    }
  }
  return `
    <div
      class="performance-keyboard__keys"
      style="--white-key-width:${whiteKeyWidth.toFixed(6)}%;--black-key-width:${(whiteKeyWidth * BLACK_KEY_RATIO).toFixed(6)}%"
    >
      <div class="performance-keyboard__white-keys">${whiteKeys.join('')}</div>
      <div class="performance-keyboard__black-keys">${blackKeys.join('')}</div>
    </div>
  `;
}

export function createPerformanceKeyboardMarkup(
  style: PerformanceKeyboardStyle,
  span: PerformanceKeyboardSpan = 'full',
): string {
  return `
    <div class="performance-keyboard performance-keyboard--${style}" data-performance-keyboard hidden>
      <div class="performance-keyboard__expression" aria-label="Controles de expressão do teclado">
        ${(['pitch', 'mod'] as const).map((kind) => `
          <label class="keyboard-expression keyboard-expression--${kind}" style="--wheel-position:${kind === 'pitch' ? 50 : 0}%">
            <span>${kind === 'pitch' ? 'Pitch' : 'Mod'}</span>
            <span class="keyboard-expression__track" aria-hidden="true"><i><b>${kind === 'pitch' ? 'H' : 'K'}</b></i></span>
            <input type="range" min="0" max="${kind === 'pitch' ? 16383 : 127}" step="1" value="${kind === 'pitch' ? 8192 : 0}" data-keyboard-expression="${kind}" aria-label="${kind === 'pitch' ? 'Pitch bend' : 'Modulação'}" aria-valuetext="${kind === 'pitch' ? '0%' : '0'}">
          </label>
        `).join('')}
      </div>
      <div class="performance-keyboard__scroller" data-keyboard-span="${span}">
        ${createPerformanceKeysMarkup(span)}
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
        <div role="group" aria-label="Dispositivo MIDI para tocar e iluminar o teclado">
          ${[1, 2, 3].map((slot) => createChoiceButton('keyboard-midi-slot', String(slot), `MIDI ${slot}`, slot === midiSlot)).join('')}
        </div>
      </article>
      <article>
        <strong>Estilo do teclado</strong>
        <div role="group" aria-label="Estilo visual do teclado">
          ${createChoiceButton('keyboard-style', 'standard', 'Default', style === 'standard')}
          ${createChoiceButton('keyboard-style', 'black', 'Black', style === 'black')}
          ${createChoiceButton('keyboard-style', 'hook', 'Hook', style === 'hook')}
        </div>
      </article>
    </section>
  `;
}

export class PerformanceKeyboardController {
  private readonly activePointers = new Map<number, number | null>();
  private readonly noteKeys = new Map<number, HTMLButtonElement>();
  private readonly pointerStartedAt = new Map<number, number>();
  private readonly pointerStartX = new Map<number, number>();
  private readonly pointerCurrentX = new Map<number, number>();
  private readonly twoFingerGesturePointers = new Set<number>();
  private twoFingerGestureTriggered = false;
  private keyLighting = true;
  private spreadCommitTimer: number | null = null;

  private readonly handlePointerDown = (event: PointerEvent) => this.onPointerDown(event);
  private readonly handlePointerMove = (event: PointerEvent) => this.onPointerMove(event);
  private readonly handlePointerEnd = (event: PointerEvent) => this.onPointerEnd(event);

  constructor(
    private readonly root: HTMLElement,
    private readonly onTwoFingerSpread: () => void = () => {},
    private readonly onNote: (noteNumber: number, pressed: boolean, velocity: number) => string | null | void = () => {},
  ) {}

  // Depois de trocar o teclado (88 teclas <-> cinco oitavas) as teclas são
  // outras: o mapa de notas precisa apontar para os botões novos.
  refreshKeys(): void {
    this.noteKeys.clear();
    for (const key of this.root.querySelectorAll<HTMLButtonElement>('[data-keyboard-note]')) {
      const noteNumber = Number(key.dataset.keyboardNote);
      if (Number.isInteger(noteNumber)) this.noteKeys.set(noteNumber, key);
    }
  }

  mount(): void {
    this.refreshKeys();
    this.root.addEventListener('pointerdown', this.handlePointerDown);
    this.root.addEventListener('pointermove', this.handlePointerMove);
    this.root.addEventListener('pointerup', this.handlePointerEnd);
    this.root.addEventListener('pointercancel', this.handlePointerEnd);
    this.root.addEventListener('lostpointercapture', this.handlePointerEnd);
  }

  destroy(): void {
    this.root.removeEventListener('pointerdown', this.handlePointerDown);
    this.root.removeEventListener('pointermove', this.handlePointerMove);
    this.root.removeEventListener('pointerup', this.handlePointerEnd);
    this.root.removeEventListener('pointercancel', this.handlePointerEnd);
    this.root.removeEventListener('lostpointercapture', this.handlePointerEnd);
    for (const pointerId of this.activePointers.keys()) {
      this.changePointerNote(pointerId, null);
      if (this.root.hasPointerCapture(pointerId)) this.root.releasePointerCapture(pointerId);
    }
    this.activePointers.clear();
    this.pointerStartedAt.clear();
    this.pointerStartX.clear();
    this.pointerCurrentX.clear();
    this.twoFingerGesturePointers.clear();
    this.noteKeys.clear();
    if (this.spreadCommitTimer !== null) window.clearTimeout(this.spreadCommitTimer);
    this.spreadCommitTimer = null;
  }

  setStyle(style: PerformanceKeyboardStyle): void {
    this.root.classList.remove('performance-keyboard--standard', 'performance-keyboard--black', 'performance-keyboard--hook');
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
    this.root.setPointerCapture(event.pointerId);
    this.activePointers.set(event.pointerId, null);
    this.pointerStartedAt.set(event.pointerId, event.timeStamp);
    this.pointerStartX.set(event.pointerId, event.clientX);
    this.pointerCurrentX.set(event.pointerId, event.clientX);
    this.changePointerNote(event.pointerId, noteNumber);
    if (event.pointerType === 'touch' && this.activePointers.size === 2) {
      const pointerIds = [...this.activePointers.keys()];
      const firstStartedAt = this.pointerStartedAt.get(pointerIds[0] ?? -1) ?? 0;
      const secondStartedAt = this.pointerStartedAt.get(pointerIds[1] ?? -1) ?? 0;
      if (Math.abs(firstStartedAt - secondStartedAt) <= 160) {
        this.twoFingerGesturePointers.clear();
        this.twoFingerGestureTriggered = false;
        for (const pointerId of pointerIds) {
          this.twoFingerGesturePointers.add(pointerId);
        }
      }
    }
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.activePointers.has(event.pointerId)) return;
    event.preventDefault();
    this.pointerCurrentX.set(event.pointerId, event.clientX);
    if (this.twoFingerGestureTriggered) return;
    // Pointer capture keeps the original event target while dragging. Hit-test
    // the visible key instead so black keys and movement outside the keyboard
    // release/retrigger the correct notes.
    const target = this.root.ownerDocument.elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLButtonElement>('[data-keyboard-note]');
    const noteNumber = target && this.root.contains(target) ? Number(target.dataset.keyboardNote) : null;
    this.changePointerNote(event.pointerId, noteNumber !== null && Number.isInteger(noteNumber) ? noteNumber : null);
    if (this.twoFingerGesturePointers.size !== 2) return;
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
      for (const pointerId of this.twoFingerGesturePointers) this.changePointerNote(pointerId, null);
    }
  }

  private onPointerEnd(event: PointerEvent): void {
    if (!this.activePointers.has(event.pointerId)) return;
    event.preventDefault();
    this.changePointerNote(event.pointerId, null);
    this.activePointers.delete(event.pointerId);
    if (this.root.hasPointerCapture(event.pointerId)) this.root.releasePointerCapture(event.pointerId);
    this.pointerStartedAt.delete(event.pointerId);
    this.pointerStartX.delete(event.pointerId);
    this.pointerCurrentX.delete(event.pointerId);
    if (this.twoFingerGesturePointers.has(event.pointerId)) {
      if (event.type !== 'pointerup') this.twoFingerGestureTriggered = false;
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
  }

  private changePointerNote(pointerId: number, noteNumber: number | null): void {
    const previous = this.activePointers.get(pointerId);
    if (previous === noteNumber) return;
    this.activePointers.set(pointerId, noteNumber);
    // Two fingers on the same key share one held note. Lifting or moving one
    // finger must not silence the note still held by the other.
    if (previous !== undefined && previous !== null && ![...this.activePointers.values()].includes(previous)) {
      this.setPressed(previous, false);
      this.dispatchNote(previous, false);
    }
    if (noteNumber !== null && ![...this.activePointers].some(([id, note]) => id !== pointerId && note === noteNumber)) {
      this.setPressed(noteNumber, true);
      this.dispatchNote(noteNumber, true);
    }
  }

  // Modo Lite: sem acender a tecla não há repintura nenhuma no toque, que é
  // o que engasgava a interface nos aparelhos antigos.
  setKeyLighting(enabled: boolean): void {
    this.keyLighting = enabled;
    if (enabled) return;
    for (const key of this.root.querySelectorAll('.performance-keyboard__key.is-pressed')) {
      key.classList.remove('is-pressed');
    }
  }

  private setPressed(noteNumber: number, pressed: boolean): void {
    const key = this.noteKeys.get(noteNumber)
      ?? this.root.querySelector<HTMLButtonElement>(`[data-keyboard-note="${noteNumber}"]`);
    if (this.keyLighting) key?.classList.toggle('is-pressed', pressed);
    key?.setAttribute('aria-pressed', String(pressed));
  }

  private dispatchNote(noteNumber: number, pressed: boolean): void {
    const inputId = this.onNote(noteNumber, pressed, pressed ? 110 : 0) ?? null;
    window.dispatchEvent(new CustomEvent<PerformanceNoteDetail>('hookkeys:performance-note', {
      detail: {
        channel: 1,
        inputId,
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
