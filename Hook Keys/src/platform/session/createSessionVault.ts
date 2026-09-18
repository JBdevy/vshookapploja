import { Capacitor } from '@capacitor/core';
import { BrowserSessionVault } from './BrowserSessionVault';
import { NativeSessionVault } from './NativeSessionVault';
import type { SessionVault } from './SessionVault';

export function createSessionVault(): SessionVault {
  // No app nativo (iOS/Android) a sessão mora no Keychain/SharedPreferences,
  // que sobrevivem a desinstalar e reinstalar; no browser e no desktop Tauri
  // continua no localStorage, que é o que existe nesses ambientes.
  if (Capacitor.isNativePlatform()) return new NativeSessionVault();
  return new BrowserSessionVault();
}
