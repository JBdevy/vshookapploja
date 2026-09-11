import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Keyboard, type KeyboardInfo } from '@capacitor/keyboard';

const KEYBOARD_THRESHOLD_PX = 90;
const VIEWPORT_SETTLE_DELAY_MS = 80;

let initialized = false;
let largestViewportHeight = 0;
let lastViewportWidth = 0;
let nativeKeyboardOpen = false;
let nativeKeyboardHeight = 0;
let viewportFrame: number | null = null;
let revealTimer: number | null = null;
const listenerHandles: PluginListenerHandle[] = [];

function editableFromTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest<HTMLElement>('input, textarea, select, [contenteditable="true"]');
}

function activeEditable(): HTMLElement | null {
  return editableFromTarget(document.activeElement);
}

function revealFocusedField(): void {
  const field = activeEditable();
  if (!field) return;

  const viewport = window.visualViewport;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
  const safeGap = 12;
  const availableHeight = viewportBottom - viewportTop - safeGap * 2;
  const form = field.closest<HTMLElement>('form');
  const formBounds = form?.getBoundingClientRect();
  const target = form && formBounds && formBounds.height <= availableHeight ? form : field;
  const targetBounds = target.getBoundingClientRect();

  if (
    targetBounds.top < viewportTop + safeGap
    || targetBounds.bottom > viewportBottom - safeGap
  ) {
    target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  }
}

function scheduleSettledReveal(delay = VIEWPORT_SETTLE_DELAY_MS): void {
  if (revealTimer !== null) window.clearTimeout(revealTimer);
  revealTimer = window.setTimeout(() => {
    revealTimer = null;
    window.requestAnimationFrame(revealFocusedField);
  }, delay);
}

function setKeyboardState(open: boolean, keyboardHeight = 0): void {
  document.documentElement.dataset.keyboard = open ? 'open' : 'closed';
  document.documentElement.style.setProperty(
    '--keyboard-height',
    `${Math.max(0, Math.round(keyboardHeight))}px`,
  );
}

function updateVisualViewport(): void {
  const viewport = window.visualViewport;
  const height = Math.round(viewport?.height ?? window.innerHeight);
  const width = Math.round(viewport?.width ?? window.innerWidth);
  const offsetTop = Math.round(viewport?.offsetTop ?? 0);

  // Mudou a largura, a tela girou. A maior altura da orientação anterior vira
  // uma referência falsa: em paisagem ela faria o app inferir um teclado aberto
  // do tamanho da diferença entre as duas orientações. O giro do login para o
  // player é programático e nem sempre emite orientationchange, então a
  // largura é a única pista confiável.
  if (width !== lastViewportWidth) {
    lastViewportWidth = width;
    largestViewportHeight = nativeKeyboardOpen
      ? height + Math.max(0, Math.round(nativeKeyboardHeight))
      : height;
  }
  largestViewportHeight = Math.max(largestViewportHeight, height);

  document.documentElement.style.setProperty('--app-viewport-height', `${height}px`);
  document.documentElement.style.setProperty('--app-viewport-offset-top', `${offsetTop}px`);

  const inferredKeyboardHeight = Boolean(activeEditable())
    ? Math.max(0, largestViewportHeight - height)
    : 0;
  const inferredKeyboardOpen = inferredKeyboardHeight >= KEYBOARD_THRESHOLD_PX;
  setKeyboardState(
    nativeKeyboardOpen || inferredKeyboardOpen,
    nativeKeyboardHeight || inferredKeyboardHeight,
  );
  if (inferredKeyboardOpen && !nativeKeyboardOpen) scheduleSettledReveal();
}

function onOrientationChange(): void {
  // updateVisualViewport() refaz a referência de altura ao ver a largura mudar.
  window.setTimeout(() => {
    scheduleViewportUpdate();
    scheduleSettledReveal(80);
  }, 300);
}

function scheduleViewportUpdate(): void {
  if (viewportFrame !== null) return;
  viewportFrame = window.requestAnimationFrame(() => {
    viewportFrame = null;
    updateVisualViewport();
  });
}

function onFocusIn(event: FocusEvent): void {
  if (!editableFromTarget(event.target)) return;
  document.documentElement.dataset.inputFocused = 'true';
  scheduleViewportUpdate();
  // Fallback para navegadores que não avisam quando a animação termina.
  scheduleSettledReveal(320);
}

function onFocusOut(): void {
  window.setTimeout(() => {
    if (activeEditable()) return;
    document.documentElement.dataset.inputFocused = 'false';
    if (!nativeKeyboardOpen) setKeyboardState(false);
  }, 0);
}

function onDocumentClick(event: MouseEvent): void {
  if (editableFromTarget(event.target)) return;

  // Fecha o teclado somente depois que o controle tocado concluiu seu clique.
  window.setTimeout(() => {
    const focused = activeEditable();
    if (!focused) return;
    focused.blur();
    if (Capacitor.isNativePlatform()) {
      void Keyboard.hide().catch(() => {});
    }
  }, 0);
}

function onKeyboardWillShow(info: KeyboardInfo): void {
  nativeKeyboardOpen = true;
  nativeKeyboardHeight = info.keyboardHeight;
  setKeyboardState(true, info.keyboardHeight);
  scheduleViewportUpdate();
}

function onKeyboardDidShow(info: KeyboardInfo): void {
  nativeKeyboardOpen = true;
  nativeKeyboardHeight = info.keyboardHeight;
  setKeyboardState(true, info.keyboardHeight);
  scheduleViewportUpdate();
  scheduleSettledReveal(0);
}

function onKeyboardWillHide(): void {
  if (revealTimer !== null) window.clearTimeout(revealTimer);
  revealTimer = null;
}

function onKeyboardDidHide(): void {
  nativeKeyboardOpen = false;
  nativeKeyboardHeight = 0;
  setKeyboardState(false);
  scheduleViewportUpdate();
}

async function initializeNativeKeyboard(): Promise<void> {
  listenerHandles.push(
    await Keyboard.addListener('keyboardWillShow', onKeyboardWillShow),
    await Keyboard.addListener('keyboardDidShow', onKeyboardDidShow),
    await Keyboard.addListener('keyboardWillHide', onKeyboardWillHide),
    await Keyboard.addListener('keyboardDidHide', onKeyboardDidHide),
  );
  await Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});
}

export async function initializeKeyboardExperience(): Promise<void> {
  if (initialized) return;
  initialized = true;

  document.documentElement.dataset.keyboard = 'closed';
  document.documentElement.dataset.inputFocused = 'false';
  largestViewportHeight = Math.round(window.visualViewport?.height ?? window.innerHeight);
  lastViewportWidth = Math.round(window.visualViewport?.width ?? window.innerWidth);
  updateVisualViewport();

  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  document.addEventListener('click', onDocumentClick);
  window.addEventListener('resize', scheduleViewportUpdate);
  window.addEventListener('orientationchange', onOrientationChange);
  window.visualViewport?.addEventListener('resize', scheduleViewportUpdate);
  window.visualViewport?.addEventListener('scroll', scheduleViewportUpdate);

  if (Capacitor.isNativePlatform()) {
    await initializeNativeKeyboard();
  }
}

export async function destroyKeyboardExperience(): Promise<void> {
  document.removeEventListener('focusin', onFocusIn);
  document.removeEventListener('focusout', onFocusOut);
  document.removeEventListener('click', onDocumentClick);
  window.removeEventListener('resize', scheduleViewportUpdate);
  window.removeEventListener('orientationchange', onOrientationChange);
  window.visualViewport?.removeEventListener('resize', scheduleViewportUpdate);
  window.visualViewport?.removeEventListener('scroll', scheduleViewportUpdate);
  if (viewportFrame !== null) window.cancelAnimationFrame(viewportFrame);
  viewportFrame = null;
  if (revealTimer !== null) window.clearTimeout(revealTimer);
  revealTimer = null;
  await Promise.allSettled(listenerHandles.splice(0).map((handle) => handle.remove()));
  initialized = false;
}
