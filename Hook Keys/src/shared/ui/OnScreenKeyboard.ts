const KEY_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'backspace'],
] as const;

const SYMBOL_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['@', '#', '$', '%', '&', '*', '-', '+', '(', ')'],
  ['!', '"', "'", ':', ';', '/', '?', '_', '='],
  ['\\', '|', '~', '<', '>', '[', ']', '{', '}', 'backspace'],
] as const;

const ACCENTS: Record<string, readonly string[]> = {
  A: ['Á', 'À', 'Â', 'Ã', 'Ä', 'Å'],
  C: ['Ç'],
  E: ['É', 'È', 'Ê', 'Ë'],
  I: ['Í', 'Ì', 'Î', 'Ï'],
  N: ['Ñ'],
  O: ['Ó', 'Ò', 'Ô', 'Õ', 'Ö'],
  U: ['Ú', 'Ù', 'Û', 'Ü'],
  Y: ['Ý', 'Ÿ'],
};

export function createOnScreenKeyboardMarkup(label: string, initiallyHidden = false): string {
  const letterRows = KEY_ROWS.map((row) => `
    <div class="on-screen-keyboard__row">
      ${row.map((key) => createKeyboardKeyMarkup(key, true)).join('')}
    </div>
  `).join('');
  const symbolRows = SYMBOL_ROWS.map((row) => `
    <div class="on-screen-keyboard__row">
      ${row.map((key) => createKeyboardKeyMarkup(key, false)).join('')}
    </div>
  `).join('');

  return `
    <div class="on-screen-keyboard" data-shift-mode="once" data-character-layout="letters" aria-label="${escapeAttribute(label)}"${initiallyHidden ? ' hidden' : ''}>
      <div class="on-screen-keyboard__layout" data-keyboard-layout-panel="letters">
        ${letterRows}
      </div>
      <div class="on-screen-keyboard__layout" data-keyboard-layout-panel="symbols" hidden>
        ${symbolRows}
      </div>
      <div class="on-screen-keyboard__row on-screen-keyboard__row--actions">
        <button type="button" data-on-screen-key="symbols" aria-label="Abrir caracteres especiais">#+=</button>
        <button type="button" data-on-screen-key="space">Espaço</button>
        <button type="button" data-on-screen-key="enter" aria-label="Enter">Enter</button>
      </div>
    </div>
  `;
}

function createKeyboardKeyMarkup(key: string, allowShift: boolean): string {
        if (key === 'backspace') {
          return '<button type="button" data-on-screen-key="backspace" aria-label="Apagar último caractere">⌫</button>';
        }
        if (key === 'shift') {
          if (!allowShift) return '';
          // O teclado abre com a primeira letra maiúscula, como no celular:
          // o Shift já nasce aceso para combinar com o que se vê nas teclas.
          return '<button class="is-active" type="button" data-on-screen-key="shift" aria-label="Ativar maiúscula" aria-pressed="true">⇧</button>';
        }
        const isLetter = /^[A-Z]$/.test(key);
        const escapedKey = escapeAttribute(key);
        return `<button type="button" data-on-screen-key="${escapedKey}"${isLetter ? ` data-on-screen-character="${escapedKey}"` : ''}>${escapedKey}</button>`;
}

export function createNumericOnScreenKeyboardMarkup(label: string, allowDecimal = false): string {
  return `<div class="on-screen-keyboard on-screen-keyboard--numeric" aria-label="${escapeAttribute(label)}">
    ${[['1', '2', '3', '4', '5'], ['6', '7', '8', '9', '0']].map(row => `
      <div class="on-screen-keyboard__row">${row.map(key =>
        `<button type="button" data-on-screen-key="${key}">${key}</button>`).join('')}</div>
    `).join('')}
    <div class="on-screen-keyboard__row">
      ${allowDecimal ? '<button type="button" data-on-screen-key=".">.</button>' : ''}
      <button type="button" data-on-screen-key="backspace" aria-label="Apagar">⌫</button>
      <button type="button" data-on-screen-key="enter">Concluir</button>
    </div>
  </div>`;
}

export function applyOnScreenKey(currentValue: string, key: string, maximumLength: number): string {
  const characters = Array.from(currentValue);
  if (key === 'backspace') return characters.slice(0, -1).join('');
  if (key === 'enter' || key === 'shift' || key === 'symbols') return currentValue;
  if (key === 'space') {
    if (characters.length === 0 || currentValue.endsWith(' ') || characters.length >= maximumLength) {
      return currentValue;
    }
    return `${currentValue} `;
  }
  return characters.length + Array.from(key).length <= maximumLength
    ? `${currentValue}${key}`
    : currentValue;
}

export function resolveOnScreenKey(button: HTMLButtonElement, rawKey: string): string | null {
  const keyboard = button.closest<HTMLElement>('.on-screen-keyboard');
  if (!keyboard) return rawKey;
  if (rawKey !== 'shift') keyboard.querySelector('[data-on-screen-accents]')?.remove();
  if (rawKey === 'symbols') {
    const symbolsVisible = keyboard.dataset.characterLayout === 'symbols';
    const nextLayout = symbolsVisible ? 'letters' : 'symbols';
    keyboard.dataset.characterLayout = nextLayout;
    for (const panel of keyboard.querySelectorAll<HTMLElement>('[data-keyboard-layout-panel]')) {
      panel.hidden = panel.dataset.keyboardLayoutPanel !== nextLayout;
    }
    button.textContent = symbolsVisible ? '#+=' : 'ABC';
    button.setAttribute('aria-label', symbolsVisible
      ? 'Abrir caracteres especiais'
      : 'Voltar para letras');
    return null;
  }
  if (rawKey === 'shift') {
    const currentMode = keyboard.dataset.shiftMode ?? 'off';
    const now = Date.now();
    const lastTapAt = Number(keyboard.dataset.shiftTapAt ?? 0);
    const nextMode = currentMode === 'off'
      ? 'once'
      : currentMode === 'once' && now - lastTapAt <= 350
        ? 'locked'
        : 'off';
    keyboard.dataset.shiftTapAt = String(now);
    setKeyboardShiftMode(keyboard, nextMode);
    return null;
  }
  const resolvedKey = keyboard.classList.contains('is-lowercase') && /^[A-Z]$/.test(rawKey)
    ? rawKey.toLowerCase()
    : rawKey;
  if (keyboard.dataset.shiftMode === 'once' && /^\p{L}$/u.test(resolvedKey)) {
    setKeyboardShiftMode(keyboard, 'off');
  }
  return resolvedKey;
}

function setKeyboardShiftMode(keyboard: HTMLElement, mode: 'off' | 'once' | 'locked'): void {
  keyboard.dataset.shiftMode = mode;
  const lowercase = mode === 'off';
  keyboard.classList.toggle('is-lowercase', lowercase);
  const shift = keyboard.querySelector<HTMLButtonElement>('[data-on-screen-key="shift"]');
  if (shift) {
    shift.classList.toggle('is-active', mode !== 'off');
    shift.classList.toggle('is-locked', mode === 'locked');
    shift.setAttribute('aria-pressed', String(mode !== 'off'));
    shift.setAttribute('aria-label', mode === 'locked' ? 'Desativar maiúsculas fixas' : 'Ativar maiúscula');
  }
  for (const keyButton of keyboard.querySelectorAll<HTMLButtonElement>('[data-on-screen-character]')) {
    const character = keyButton.dataset.onScreenCharacter ?? '';
    keyButton.textContent = lowercase ? character.toLowerCase() : character;
  }
}

export function openOnScreenAccentOptions(button: HTMLButtonElement): boolean {
  const keyboard = button.closest<HTMLElement>('.on-screen-keyboard');
  const character = button.dataset.onScreenCharacter;
  const variants = character ? ACCENTS[character] : undefined;
  if (!keyboard || !variants) return false;
  keyboard.querySelector('[data-on-screen-accents]')?.remove();
  const lowercase = keyboard.classList.contains('is-lowercase');
  const options = document.createElement('div');
  options.className = 'on-screen-keyboard__accents';
  options.dataset.onScreenAccents = '';
  options.innerHTML = variants.map((variant) => {
    const value = lowercase ? variant.toLocaleLowerCase('pt-BR') : variant;
    return `<button type="button" data-on-screen-key="${value}">${value}</button>`;
  }).join('');
  const keyboardBounds = keyboard.getBoundingClientRect();
  const buttonBounds = button.getBoundingClientRect();
  options.style.setProperty('--accent-left', `${buttonBounds.left - keyboardBounds.left + buttonBounds.width / 2}px`);
  options.style.setProperty('--accent-bottom', `${keyboardBounds.bottom - buttonBounds.top + 7}px`);
  keyboard.append(options);
  return true;
}

function escapeAttribute(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] ?? character);
}
