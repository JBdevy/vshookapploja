import './styles.css';
import { HookKeysApp } from './app/HookKeysApp';
import { AuthApi } from './features/auth/AuthApi';
import { AuthSessionService } from './features/auth/AuthSessionService';
import { AccountApi } from './features/account/AccountApi';
import { DeviceIdentityStore } from './platform/device/DeviceIdentityStore';
import { initializePlatformRuntime } from './platform/runtime';
import { initializeKeyboardExperience } from './platform/keyboard';
import { createSessionVault } from './platform/session/createSessionVault';
import { HttpClient } from './shared/api/HttpClient';

const PRODUCTION_API_URL = 'https://hookupdate7.up.railway.app';

async function bootstrap(): Promise<void> {
  const root = document.querySelector<HTMLElement>('#app');
  if (!root) throw new Error('Raiz do aplicativo não encontrada.');

  await initializePlatformRuntime();
  await initializeKeyboardExperience();

  const configuredApiUrl = import.meta.env.VITE_HOOK_KEYS_API_URL?.trim();
  const apiUrl = configuredApiUrl || (import.meta.env.PROD ? PRODUCTION_API_URL : '');
  const http = new HttpClient(apiUrl);
  const authApi = new AuthApi(http);
  const sessions = new AuthSessionService(authApi, createSessionVault(), new DeviceIdentityStore());
  const app = new HookKeysApp(root, sessions, new AccountApi(http));
  app.start();
}

void bootstrap();
