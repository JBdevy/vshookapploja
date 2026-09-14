import {
  createOnScreenKeyboardMarkup,
  createNumericOnScreenKeyboardMarkup,
  resolveOnScreenKey,
} from './OnScreenKeyboard';

type EditableInput = HTMLInputElement | HTMLTextAreaElement;

const EDITABLE_INPUT_SELECTOR = [
  'textarea',
  'input:not([type="hidden"]):not([type="file"]):not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"])',
].join(',');

export class TabletInputKeyboardController {
  private activeInput: EditableInput | null = null;
  private keyboard: HTMLElement | null = null;
  private caret: HTMLElement | null = null;
  private observer: MutationObserver | null = null;
  private readonly handlePointerDown = (event: PointerEvent) => this.onPointerDown(event);
  private readonly handleClick = (event: Event) => this.onClick(event);
  private readonly handleInput = () => this.scheduleCaretPosition();
  private readonly handleViewportChange = () => this.scheduleCaretPosition();

  constructor(private readonly modal: HTMLElement) {}

  mount(): void {
    this.prepareInputs(this.modal);
    this.modal.addEventListener('pointerdown', this.handlePointerDown, true);
    this.modal.addEventListener('click', this.handleClick);
    this.modal.addEventListener('input', this.handleInput);
    window.addEventListener('resize', this.handleViewportChange);
    window.addEventListener('scroll', this.handleViewportChange, true);
    this.observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement) this.prepareInputs(node);
        }
      }
    });
    this.observer.observe(this.modal, { childList: true, subtree: true });
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.modal.removeEventListener('pointerdown', this.handlePointerDown, true);
    this.modal.removeEventListener('click', this.handleClick);
    this.modal.removeEventListener('input', this.handleInput);
    window.removeEventListener('resize', this.handleViewportChange);
    window.removeEventListener('scroll', this.handleViewportChange, true);
    this.close();
  }

  openFor(input: EditableInput): void {
    if (!this.isEditableInput(input)) return;
    this.prepareInput(input);
    this.activeInput?.classList.remove('is-tablet-input-active');
    this.activeInput = input;
    input.classList.add('is-tablet-input-active');
    input.focus({ preventScroll: true });
    this.moveCaretToEnd(input);

    const numeric = this.isNumericInput(input);
    const decimal = this.acceptsDecimal(input);
    const layout = numeric ? (decimal ? 'decimal' : 'numeric') : 'text';
    if (this.keyboard?.dataset.inputLayout !== layout) {
      this.keyboard?.remove();
      this.keyboard = null;
    }
    if (!this.keyboard) {
      const body = this.modal.querySelector<HTMLElement>('.player-modal__body');
      if (!body) return;
      body.insertAdjacentHTML(
        'beforeend',
        numeric
          ? createNumericOnScreenKeyboardMarkup(
              this.keyboardLabel(input), decimal)
          : createOnScreenKeyboardMarkup(this.keyboardLabel(input)),
      );
      this.keyboard = body.lastElementChild instanceof HTMLElement
        ? body.lastElementChild
        : null;
      this.keyboard?.classList.add('player-modal__tablet-keyboard');
      if (this.keyboard) this.keyboard.dataset.inputLayout = layout;
    }
    this.updateKeyboardAvailability(input);
    this.modal.classList.add('is-tablet-keyboard-open');
    this.showCaretFor(input);
  }

  private close(): void {
    this.activeInput?.classList.remove('is-tablet-input-active');
    this.activeInput?.blur();
    this.activeInput = null;
    this.keyboard?.remove();
    this.keyboard = null;
    this.caret?.remove();
    this.caret = null;
    this.modal.classList.remove('is-tablet-keyboard-open');
  }

  private onPointerDown(event: PointerEvent): void {
    const target = event.target;
    const input = target instanceof Element
      ? target.closest<EditableInput>(EDITABLE_INPUT_SELECTOR)
      : null;
    if (input && this.modal.contains(input) && this.isEditableInput(input)) {
      event.preventDefault();
      this.openFor(input);
    }
  }

  private onClick(event: Event): void {
    const target = event.target;
    const input = target instanceof Element
      ? target.closest<EditableInput>(EDITABLE_INPUT_SELECTOR)
      : null;
    if (input && this.modal.contains(input) && this.isEditableInput(input)) return;

    const button = target instanceof Element
      ? target.closest<HTMLButtonElement>('.player-modal__tablet-keyboard button[data-on-screen-key]')
      : null;
    const rawKey = button?.dataset.onScreenKey;
    if (!button || !rawKey || !this.activeInput) {
      if (!(target instanceof Element) || !target.closest('.player-modal__tablet-keyboard')) {
        this.close();
      }
      return;
    }

    const key = resolveOnScreenKey(button, rawKey);
    if (key === null) return;
    if (key === 'enter') {
      this.activeInput.dispatchEvent(new Event('change', { bubbles: true }));
      this.close();
      return;
    }
    this.applyKey(this.activeInput, key);
  }

  private applyKey(input: EditableInput, key: string): void {
    const currentValue = input.value;
    const numeric = this.isNumericInput(input);
    const decimal = this.acceptsDecimal(input);
    if (numeric && key !== 'backspace' && !/^\d$/.test(key) && !(decimal && key === '.')) return;

    const selectionStart = input.selectionStart ?? currentValue.length;
    const selectionEnd = input.selectionEnd ?? selectionStart;
    let before = currentValue.slice(0, selectionStart);
    const after = currentValue.slice(selectionEnd);

    if (key === 'backspace') {
      if (selectionStart !== selectionEnd) {
        before = currentValue.slice(0, selectionStart);
      } else {
        before = Array.from(before).slice(0, -1).join('');
      }
    } else {
      const value = key === 'space' ? ' ' : key;
      if (decimal && value === '.' && currentValue.includes('.')) return;
      const maximumLength = this.maximumLength(input);
      const candidate = `${before}${value}${after}`;
      if (Array.from(candidate).length > maximumLength) return;
      before += value;
    }

    const nextValue = `${before}${after}`;
    if (numeric && input instanceof HTMLInputElement && !this.isAllowedNumericValue(input, nextValue)) return;
    input.value = nextValue;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus({ preventScroll: true });
    try {
      input.setSelectionRange(before.length, before.length);
    } catch {
      // Inputs numéricos não expõem seleção de texto em todos os navegadores.
    }
    this.scheduleCaretPosition();
  }

  private prepareInputs(container: HTMLElement): void {
    if (container.matches(EDITABLE_INPUT_SELECTOR)) this.prepareInput(container as EditableInput);
    for (const input of container.querySelectorAll<EditableInput>(EDITABLE_INPUT_SELECTOR)) {
      this.prepareInput(input);
    }
  }

  private prepareInput(input: EditableInput): void {
    if (!this.isEditableInput(input) || input.dataset.tabletKeyboardManaged === 'true') return;
    input.dataset.tabletKeyboardManaged = 'true';
    if (input instanceof HTMLInputElement && ['numeric', 'decimal'].includes(input.inputMode)) {
      input.dataset.keyboardNumeric = 'true';
      if (input.inputMode === 'decimal') input.dataset.keyboardDecimal = 'true';
    }
    input.readOnly = true;
    input.setAttribute('inputmode', 'none');
    input.setAttribute('autocomplete', 'off');
  }

  private isEditableInput(input: EditableInput): boolean {
    return !input.disabled && !input.hidden && input.getAttribute('aria-hidden') !== 'true';
  }

  private isNumericInput(input: EditableInput): boolean {
    return input instanceof HTMLInputElement
      && (input.type === 'number' || input.dataset.keyboardNumeric === 'true');
  }

  private acceptsDecimal(input: EditableInput): boolean {
    if (!(input instanceof HTMLInputElement)) return false;
    if (input.dataset.keyboardDecimal === 'true') return true;
    if (input.type !== 'number') return false;
    if (input.step === 'any') return true;
    const step = Number(input.step);
    return Number.isFinite(step) && step > 0 && !Number.isInteger(step);
  }

  private maximumLength(input: EditableInput): number {
    if (input instanceof HTMLInputElement && input.maxLength > 0) return input.maxLength;
    if (input instanceof HTMLInputElement && input.type === 'number') {
      const maximum = input.max ? Number(input.max) : NaN;
      const digits = Number.isFinite(maximum) ? String(Math.abs(Math.trunc(maximum))).length : 6;
      return digits + (this.acceptsDecimal(input) ? 4 : 0);
    }
    return 64;
  }

  private isAllowedNumericValue(input: HTMLInputElement, value: string): boolean {
    if (value === '') return true;
    const number = Number(value);
    if (!Number.isFinite(number)) return false;
    const maximum = input.max ? Number(input.max) : NaN;
    return !Number.isFinite(maximum) || number <= maximum;
  }

  private moveCaretToEnd(input: EditableInput): void {
    try {
      input.setSelectionRange(input.value.length, input.value.length);
    } catch {
      // Inputs numéricos não expõem seleção de texto em todos os navegadores.
    }
  }

  private keyboardLabel(input: EditableInput): string {
    const explicitLabel = input.getAttribute('aria-label');
    if (explicitLabel) return `Teclado para ${explicitLabel}`;
    const label = input.closest('label')?.querySelector<HTMLElement>('span')?.textContent?.trim();
    return label ? `Teclado para ${label}` : 'Teclado do Hook Keys';
  }

  private updateKeyboardAvailability(input: EditableInput): void {
    const passwordField = input instanceof HTMLInputElement && input.type === 'password';
    const emojiButton = this.keyboard?.querySelector<HTMLButtonElement>('[data-on-screen-key="emoji"]');
    if (emojiButton) {
      emojiButton.disabled = passwordField;
      emojiButton.setAttribute('aria-disabled', String(passwordField));
    }
    if (passwordField) {
      const emojis = this.keyboard?.querySelector<HTMLElement>('[data-on-screen-emojis]');
      if (emojis) emojis.hidden = true;
    }
  }

  private showCaretFor(input: EditableInput): void {
    this.caret?.remove();
    this.caret = null;
    if (input.matches('[data-password-reset-code]')) return;
    const caret = document.createElement('i');
    caret.className = 'tablet-input-caret';
    caret.setAttribute('aria-hidden', 'true');
    document.body.append(caret);
    this.caret = caret;
    this.scheduleCaretPosition();
  }

  private scheduleCaretPosition(): void {
    window.requestAnimationFrame(() => this.positionCaret());
  }

  private positionCaret(): void {
    const input = this.activeInput;
    const caret = this.caret;
    if (!input || !caret || !input.isConnected) return;
    const bounds = input.getBoundingClientRect();
    const style = window.getComputedStyle(input);
    const fontSize = Number.parseFloat(style.fontSize) || 16;
    const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(style.paddingRight) || 0;
    const selection = input.selectionStart ?? input.value.length;
    const rawValue = input.value.slice(0, selection);
    const visibleValue = input instanceof HTMLInputElement && input.type === 'password'
      ? '•'.repeat(Array.from(rawValue).length)
      : rawValue;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (context) context.font = style.font;
    const letterSpacing = Number.parseFloat(style.letterSpacing) || 0;
    const textWidth = (context?.measureText(visibleValue).width ?? 0)
      + Math.max(0, Array.from(visibleValue).length - 1) * letterSpacing;
    const availableWidth = Math.max(0, bounds.width - paddingLeft - paddingRight - 2);
    let offset = Math.min(textWidth, availableWidth);
    if (style.textAlign === 'right' || style.textAlign === 'end') offset = availableWidth;
    else if (style.textAlign === 'center') offset = Math.min(availableWidth, (availableWidth + textWidth) / 2);
    const height = Math.min(bounds.height - 8, Math.max(16, fontSize * 1.18));
    caret.style.left = `${Math.round(bounds.left + paddingLeft + offset + 3)}px`;
    caret.style.top = `${Math.round(bounds.top + (bounds.height - height) / 2)}px`;
    caret.style.height = `${Math.round(height)}px`;
  }
}
