const KEY_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'backspace'],
] as const;

const EMOJI_CATEGORIES = {
  rostos: ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😋','😎','🤩','🥳','😏','😒','😔','😢','😭','😤','😡','🤯','😱','😴','🤔','🤗','🤫','🤭','🫠'],
  gestos: ['👍','👎','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','👇','☝️','✋','🤚','🖐️','🖖','👋','👏','🙌','🫶','🙏','💪','🫵'],
  pessoas: ['👶','🧒','👦','👧','🧑','👨','👩','🧔','👴','👵','👮','👷','💂','🕵️','👩‍⚕️','👨‍🎓','👩‍🏫','👨‍🎤','👩‍🎨','👨‍🚀','🧙','🦸','🥷'],
  animais: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦄','🐝','🦋','🐢','🐍','🐬','🐳'],
  comida: ['🍎','🍊','🍋','🍉','🍇','🍓','🍒','🥭','🍍','🥥','🥑','🍅','🥕','🌽','🍞','🧀','🍔','🍟','🍕','🌭','🌮','🍿','🍩','🍪','🎂','☕','🥤'],
  musica: ['🎹','🎵','🎶','🎤','🎧','🎸','🥁','🎺','🎷','🪗','🎻','🪕','🪘','🎼','🔊','🔉','🔈','📻','💿','🎙️','🎚️','🎛️'],
  objetos: ['⌚','📱','💻','⌨️','🖥️','📷','💡','🔦','🔋','🔌','🧰','🔧','🔨','⚙️','🧲','📌','📍','✂️','📝','📁','🔒','🔑','🎁','🎈'],
  simbolos: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❣️','💕','💯','💥','✨','🔥','⚡','⭐','🌟','✅','❌','⚠️','🚨','♻️','➕','➖','➡️','⬅️'],
  bandeiras: ['🇧🇷','🇵🇹','🇺🇸','🇦🇷','🇨🇱','🇨🇴','🇲🇽','🇨🇦','🇬🇧','🇫🇷','🇩🇪','🇮🇹','🇪🇸','🇯🇵','🇰🇷','🇨🇳','🇮🇳','🇦🇺'],
} as const;

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
  const rows = KEY_ROWS.map((row) => `
    <div class="on-screen-keyboard__row">
      ${row.map((key) => {
        if (key === 'backspace') {
          return '<button type="button" data-on-screen-key="backspace" aria-label="Apagar último caractere">⌫</button>';
        }
        if (key === 'shift') {
          return '<button type="button" data-on-screen-key="shift" aria-label="Ativar maiúscula" aria-pressed="false">⇧</button>';
        }
        const isLetter = /^[A-Z]$/.test(key);
        return `<button type="button" data-on-screen-key="${key}"${isLetter ? ` data-on-screen-character="${key}"` : ''}>${key}</button>`;
      }).join('')}
    </div>
  `).join('');

  return `
    <div class="on-screen-keyboard is-lowercase" data-shift-mode="off" aria-label="${escapeAttribute(label)}"${initiallyHidden ? ' hidden' : ''}>
      ${rows}
      <div class="on-screen-keyboard__row on-screen-keyboard__row--actions">
        <button type="button" data-on-screen-key="emoji" aria-label="Abrir emojis">☺</button>
        <button type="button" data-on-screen-key="space">Espaço</button>
        <button type="button" data-on-screen-key="enter" aria-label="Enter">Enter</button>
      </div>
      <div class="on-screen-keyboard__emojis" data-on-screen-emojis hidden>
        <nav class="on-screen-keyboard__emoji-categories" aria-label="Categorias de emoji">
          ${Object.keys(EMOJI_CATEGORIES).map((category, index) => `
            <button class="${index === 0 ? 'is-selected' : ''}" type="button" data-on-screen-key="emoji-category" data-emoji-category="${category}">${emojiCategoryIcon(category)}</button>
          `).join('')}
        </nav>
        ${Object.entries(EMOJI_CATEGORIES).map(([category, emojis], index) => `
          <div class="on-screen-keyboard__emoji-grid" data-emoji-panel="${category}"${index === 0 ? '' : ' hidden'}>
            ${emojis.map((emoji) => `<button type="button" data-on-screen-key="${emoji}" aria-label="Emoji ${emoji}">${emoji}</button>`).join('')}
          </div>
        `).join('')}
      </div>
    </div>
  `;
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
  if (key === 'emoji' || key === 'enter' || key === 'shift') return currentValue;
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
  if (rawKey === 'emoji') {
    const emojis = keyboard.querySelector<HTMLElement>('[data-on-screen-emojis]');
    if (emojis) emojis.hidden = !emojis.hidden;
    return null;
  }
  if (rawKey === 'emoji-category') {
    const category = button.dataset.emojiCategory;
    for (const option of keyboard.querySelectorAll<HTMLButtonElement>('[data-emoji-category]')) {
      option.classList.toggle('is-selected', option === button);
    }
    for (const panel of keyboard.querySelectorAll<HTMLElement>('[data-emoji-panel]')) {
      panel.hidden = panel.dataset.emojiPanel !== category;
    }
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

function emojiCategoryIcon(category: string): string {
  return ({
    rostos: '😀', gestos: '👋', pessoas: '🧑', animais: '🐶', comida: '🍕',
    musica: '🎹', objetos: '💡', simbolos: '✨', bandeiras: '🇧🇷',
  } as Record<string, string>)[category] ?? '•';
}

function escapeAttribute(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] ?? character);
}
