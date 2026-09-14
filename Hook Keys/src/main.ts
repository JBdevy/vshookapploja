import './styles.css';
import { HookKeysApp } from './app/HookKeysApp';
import { AuthApi } from './features/auth/AuthApi';
import { AuthSessionService } from './features/auth/AuthSessionService';
import { AccountApi } from './features/account/AccountApi';
import { DeviceIdentityStore } from './platform/device/DeviceIdentityStore';
import { initializePlatformRuntime } from './platform/runtime';
import { initializeKeyboardExperience } from './platform/keyboard';
import { createSessionVault } from './platform/session/createSessionVault';
import { installDesktopCloseConfirmation } from './platform/desktop/installDesktopCloseConfirmation';
import { HttpClient } from './shared/api/HttpClient';
import { ResilientTapController } from './shared/gestures/ResilientTapController';

const PRODUCTION_API_URL = 'https://hookupdate7.up.railway.app';

async function bootstrap(): Promise<void> {
  const root = document.querySelector<HTMLElement>('#app');
  if (!root) throw new Error('Raiz do aplicativo não encontrada.');

  await initializePlatformRuntime();
  await initializeKeyboardExperience();
  await installDesktopCloseConfirmation();

  const resilientTaps = new ResilientTapController(root);
  resilientTaps.mount();

  const configuredApiUrl = import.meta.env.VITE_HOOK_KEYS_API_URL?.trim();
  const apiUrl = configuredApiUrl || (import.meta.env.PROD ? PRODUCTION_API_URL : '');
  const http = new HttpClient(apiUrl);
  const authApi = new AuthApi(http);
  const sessions = new AuthSessionService(authApi, createSessionVault(), new DeviceIdentityStore());
  const app = new HookKeysApp(root, sessions, new AccountApi(http));
  app.start();
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const root = document.querySelector<HTMLElement>('#app') ?? document.body;
  root.innerHTML = `<main role="alert" style="box-sizing:border-box;display:grid;place-items:center;width:100%;height:100%;padding:24px;color:#fff;background:#000;font:700 15px/1.45 system-ui,sans-serif;text-align:center"><section><h1 style="color:#ff8b2c">O Hook Keys não conseguiu iniciar</h1><p></p><button type="button" style="padding:12px 20px;color:#140700;border:1px solid #ffb269;border-radius:9px;background:#ff8a25;font-weight:900">Tentar novamente</button></section></main>`;
  root.querySelector('p')!.textContent = message;
  root.querySelector('button')!.addEventListener('click', () => window.location.reload());
});
