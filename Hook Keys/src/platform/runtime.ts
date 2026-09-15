import { KeepAwake } from '@capacitor-community/keep-awake';
import { Capacitor } from '@capacitor/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';

let initialized = false;
export type AppOrientationMode = 'login' | 'tablet';
let currentMode: AppOrientationMode = 'login';

type TauriRuntimeWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
};

export function isDesktopRuntime(): boolean {
  return Boolean((window as TauriRuntimeWindow).__TAURI_INTERNALS__);
}

async function reinforceNativeRuntime(): Promise<void> {
  const keepScreenAwake = async () => {
    const support = await KeepAwake.isSupported();
    if (support.isSupported) await KeepAwake.keepAwake();
  };

  await Promise.allSettled([
    ScreenOrientation.lock({ orientation: currentMode === 'tablet' ? 'landscape' : 'portrait' }),
    keepScreenAwake(),
  ]);
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
    return;
  }
  if (!isNative) return;

  await reinforceNativeRuntime();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void reinforceNativeRuntime();
  });
}

export async function setAppOrientationMode(mode: AppOrientationMode): Promise<void> {
  currentMode = mode;
  document.documentElement.dataset.appMode = mode;
  if (Capacitor.isNativePlatform()) await reinforceNativeRuntime();
}
