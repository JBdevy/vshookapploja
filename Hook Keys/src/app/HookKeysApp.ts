import { AuthScreen } from '../features/auth/AuthScreen';
import type { AuthSessionService } from '../features/auth/AuthSessionService';
import type { AuthenticatedSession } from '../features/auth/types';
import { PlayerScreen } from '../features/player/PlayerScreen';
import type { AccountApi } from '../features/account/AccountApi';
import { PlayerStateService } from '../features/account/PlayerStateService';
import { PlayerBackupService } from '../features/account/PlayerBackupService';
import { setAppOrientationMode } from '../platform/runtime';

function requiredElement<T extends Element>(parent: ParentNode, selector: string): T {
  const element = parent.querySelector<T>(selector);
  if (!element) throw new Error(`Elemento obrigatório não encontrado: ${selector}`);
  return element;
}

export class HookKeysApp {
  private readonly screenRoot: HTMLElement;
  private playerScreen: PlayerScreen | null = null;
  private stopLicenseMonitoring: (() => void) | null = null;

  constructor(
    root: HTMLElement,
    private readonly sessions: AuthSessionService,
    private readonly accountApi: AccountApi,
  ) {
    root.innerHTML = `
      <aside class="orientation-guard" aria-live="polite">
        <div class="rotate-device" aria-hidden="true"><span></span></div>
        <strong>Gire o dispositivo</strong>
        <p>O Hook Keys foi feito para ser usado na horizontal.</p>
      </aside>
      <div id="screen-root" class="screen-root"></div>
    `;
    this.screenRoot = requiredElement(root, '#screen-root');
  }

  start(): void {
    this.showLogin();
  }

  private showLogin(): void {
    this.stopLicenseMonitoring?.();
    this.stopLicenseMonitoring = null;
    this.playerScreen?.destroy();
    this.playerScreen = null;
    void setAppOrientationMode('login');
    const authScreen = new AuthScreen(
      this.screenRoot,
      this.sessions,
      (session) => this.showPlayer(session),
      async () => (await this.accountApi.getPublicAppSettings()).supportUrl,
    );
    void authScreen.start();
  }

  private showPlayer(session: AuthenticatedSession): void {
    void setAppOrientationMode('tablet');
    this.stopLicenseMonitoring?.();
    this.stopLicenseMonitoring = this.sessions.startLicenseMonitoring(session, () => this.showLogin());
    const playerState = new PlayerStateService(this.accountApi, session.token, session.account.email);
    const playerBackup = new PlayerBackupService(this.accountApi, session.token, session.account.email);
    this.playerScreen = new PlayerScreen(
      this.screenRoot,
      session.account,
      async () => this.logout(session),
      {
        listDevices: () => this.sessions.devices(session),
        getAcquireLicenseUrl: async () => (await this.accountApi.getAppSettings(session.token)).acquireLicenseUrl,
        getCompatibilityVideoUrl: async () => (
          await this.accountApi.getAppSettings(session.token)
        ).compatibilityVideoUrl,
        getSupportUrl: async () => (await this.accountApi.getAppSettings(session.token)).supportUrl,
        getSoundCatalog: async () => (await this.accountApi.getSoundCatalog(session.token)).catalog,
        getProfile: async () => (await this.accountApi.getProfile(session.token)).profile,
        saveProfilePhoto: async (imageDataUrl) => (
          await this.accountApi.saveProfilePhoto(session.token, imageDataUrl)
        ).profile,
        confirmDeviceRemoval: (deviceId, password) => this.sessions.confirmDeviceRemoval(session, deviceId, password),
        requestPasswordReset: () => this.sessions.requestPasswordReset(session),
        verifyPasswordResetCode: (challengeId, code) => this.sessions.verifyPasswordResetCode(session, challengeId, code),
        completePasswordReset: (passwordToken, password) => this.sessions.completePasswordReset(session, passwordToken, password),
        finishCurrentDeviceRemoval: async () => {
          await this.sessions.clearLocalSession();
          this.showLogin();
        },
      },
      playerState,
      playerBackup,
    );
    this.playerScreen.mount();
  }

  private async logout(session: AuthenticatedSession): Promise<void> {
    await this.sessions.logout(session);
    this.showLogin();
  }
}
