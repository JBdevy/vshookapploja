type BrowserShortcutEvent = Pick<KeyboardEvent,
  'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>;

const FUNCTION_KEYS = new Set(['F1', 'F3', 'F5', 'F6', 'F7', 'F11', 'F12']);
const BROWSER_KEYS = new Set([
  'BrowserBack',
  'BrowserFavorites',
  'BrowserForward',
  'BrowserHome',
  'BrowserRefresh',
  'BrowserSearch',
  'BrowserStop',
]);
const MODIFIER_BROWSER_KEYS = new Set([
  '0', '+', '-', '=',
  'd', 'f', 'g', 'h', 'j', 'k', 'l', 'n', 'o', 'p', 'r', 's', 't', 'u', 'w',
]);

/**
 * Bloqueia apenas comandos que pertencem ao navegador/WebView. Atalhos de
 * edição (Ctrl/Cmd+A, C, V, X, Y e Z) ficam livres nos inputs do aplicativo.
 */
export function isDesktopBrowserShortcut(event: BrowserShortcutEvent): boolean {
  if (BROWSER_KEYS.has(event.key) || FUNCTION_KEYS.has(event.key)) return true;
  if (event.shiftKey && event.key === 'F10') return true;

  const key = event.key.toLowerCase();
  const command = event.ctrlKey || event.metaKey;
  if (command && MODIFIER_BROWSER_KEYS.has(key)) return true;
  if (command && event.key === 'Tab') return true;
  if (command && event.shiftKey && (key === 'c' || key === 'i')) return true;

  // Histórico no Windows/Linux e no macOS, respectivamente.
  if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home')) return true;
  if (event.metaKey && (event.key === '[' || event.key === ']')) return true;
  return false;
}

export function installDesktopBrowserShortcutBlocker(): void {
  document.addEventListener('keydown', (event) => {
    if (!isDesktopBrowserShortcut(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true });
}
