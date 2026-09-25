import { KeepAwake } from '@capacitor-community/keep-awake';
import { Capacitor } from '@capacitor/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { installDesktopBrowserShortcutBlocker } from './desktop/installDesktopBrowserShortcutBlocker';
import { hookKeysNative } from './native/HookKeysNative';

let initialized = false;
export type AppOrientationMode = 'login' | 'tablet';
let currentMode: AppOrientationMode = 'login';
let notchRefreshTimers: number[] = [];

type TauriRuntimeWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
  orientation?: number;
};

async function updateNativeNotchSide(): Promise<void> {
  const nativeSide = await hookKeysNative.displayCutoutSide();
  if (nativeSide) {
    document.documentElement.dataset.notchSide = nativeSide;
    return;
  }

  const orientation = window.screen.orientation;
  const rawAngle = Number.isFinite(orientation?.angle)
    ? orientation.angle
    : Number((window as TauriRuntimeWindow).orientation ?? 0);
  const angle = ((rawAngle % 360) + 360) % 360;

  // Celulares têm orientação natural em retrato. A orientação da tela informa
  // a rotação do conteúdo, por isso o recorte físico fica no lado oposto ao
  // que uma leitura direta do ângulo sugeriria: em 90° o notch está à esquerda
  // e em 270° à direita. O lado livre é justamente o da porta de carregamento.
  const side = angle === 90 || orientation?.type === 'landscape-primary'
    ? 'left'
    : angle === 270 || orientation?.type === 'landscape-secondary'
      ? 'right'
      : 'top';
  document.documentElement.dataset.notchSide = side;
}

// Durante a rotação, WKWebView pode emitir orientationchange antes de o
// UIWindowScene publicar a nova interfaceOrientation. Releia depois dos
// frames da animação para não manter o lado anterior do notch na build nativa.
function refreshNotchSideAfterOrientationChange(): void {
  for (const timer of notchRefreshTimers) window.clearTimeout(timer);
  notchRefreshTimers = [];
  void updateNativeNotchSide();
  for (const delay of [100, 300, 700]) {
    notchRefreshTimers.push(window.setTimeout(() => void updateNativeNotchSide(), delay));
  }
}

export async function refreshNativeNotchSide(): Promise<void> {
  await updateNativeNotchSide();
}

export function isDesktopRuntime(): boolean {
  return Boolean((window as TauriRuntimeWindow).__TAURI_INTERNALS__);
}

async function reinforceNativeRuntime(): Promise<void> {
  const keepScreenAwake = async () => {
    const support = await KeepAwake.isSupported();
    if (support.isSupported) await KeepAwake.keepAwake();
  };

  // No player, paisagem dos dois lados: o plugin de orientação só trava uma
  // paisagem, então a trava própria do app vem primeiro.
  const lockOrientation = async () => {
    const mode = currentMode === 'tablet' ? 'landscape' : 'portrait';
    if (await hookKeysNative.lockOrientation(mode)) return;
    await ScreenOrientation.lock({ orientation: mode });
  };

  await Promise.allSettled([
    lockOrientation(),
    keepScreenAwake(),
  ]);
  await updateNativeNotchSide();
}

export async function initializePlatformRuntime(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const isDesktop = isDesktopRuntime();
  const isNative = Capacitor.isNativePlatform();
  document.documentElement.dataset.runtime = isDesktop ? 'desktop' : isNative ? 'native' : 'web';
  document.documentElement.dataset.platform = isNative ? Capacitor.getPlatform() : isDesktop ? 'desktop' : 'web';
  document.documentElement.dataset.appMode = currentMode;
  if (isDesktop) {
    // O WebView do desktop não deve expor o menu de navegador em um app
    // comercial. Os controles que usam o botão direito continuam recebendo o
    // evento e tratam suas próprias ações antes que o menu pudesse aparecer.
    document.addEventListener('contextmenu', (event) => event.preventDefault());
    installDesktopBrowserShortcutBlocker();
    return;
  }
  if (!isNative) {
    // A prévia aberta diretamente no navegador do celular também precisa
    // escolher um único lado para o notch; antes este cálculo só rodava dentro
    // do APK/IPA e a versão web ficava com 1 px nos dois lados.
    await updateNativeNotchSide();
    window.screen.orientation?.addEventListener('change', refreshNotchSideAfterOrientationChange);
    window.addEventListener('orientationchange', refreshNotchSideAfterOrientationChange);
    window.addEventListener('resize', refreshNotchSideAfterOrientationChange);
    return;
  }

  await reinforceNativeRuntime();
  window.screen.orientation?.addEventListener('change', refreshNotchSideAfterOrientationChange);
  window.addEventListener('orientationchange', refreshNotchSideAfterOrientationChange);
  window.addEventListener('resize', refreshNotchSideAfterOrientationChange);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void reinforceNativeRuntime();
  });
}

export async function setAppOrientationMode(mode: AppOrientationMode): Promise<void> {
  currentMode = mode;
  document.documentElement.dataset.appMode = mode;
  if (Capacitor.isNativePlatform()) await reinforceNativeRuntime();
}
