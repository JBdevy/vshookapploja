import { KeepAwake } from '@capacitor-community/keep-awake';
import { Capacitor } from '@capacitor/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';

let initialized = false;
export type AppOrientationMode = 'login' | 'tablet';
let currentMode: AppOrientationMode = 'login';

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

  const isNative = Capacitor.isNativePlatform();
  document.documentElement.dataset.runtime = isNative ? 'native' : 'web';
  document.documentElement.dataset.appMode = currentMode;
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
