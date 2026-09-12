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

type OctaveTransitionDirection = 'enter' | 'exit';

function createOctaveTransitionMarkup(direction: OctaveTransitionDirection): string {
  const blackKeyAfter = new Set([0, 1, 3, 4, 5]);
  const keys = Array.from({ length: 28 }, (_, keyIndex) => `
    <i class="octave-transition__white-key" style="--key-index:${keyIndex}">
      ${blackKeyAfter.has(keyIndex % 7) ? '<b aria-hidden="true"></b>' : ''}
    </i>
  `).join('');
  const meter = Array.from({ length: 19 }, (_, index) => (
    `<i style="--meter-index:${index};--meter-height:${34 + ((index * 29) % 63)}%"></i>`
  )).join('');
  const entering = direction === 'enter';
  return `
    <div class="octave-transition octave-transition--${direction}" data-octave-transition aria-hidden="true">
      <div class="octave-transition__atmosphere">
        <i></i><i></i><i></i>
      </div>
      <div class="octave-transition__deck">
        <header class="octave-transition__header">
          <div class="octave-transition__identity">
            <img src="/assets/icons/icon-256.webp" alt="">
            <div><span>HOOK KEYS</span><small>PERFORMANCE INSTRUMENT</small></div>
          </div>
          <span class="octave-transition__engine-state"><i></i>${entering ? 'ENGINE ONLINE' : 'FINALIZANDO'}</span>
        </header>
        <div class="octave-transition__stage">
          <div class="octave-transition__meter">${meter}</div>
          <div class="octave-transition__keyboard-shell">
            <div class="octave-transition__keyboard">${keys}</div>
            <div class="octave-transition__keyboard-glow"></div>
          </div>
          <div class="octave-transition__title">
            <span>${entering ? 'INICIALIZANDO' : 'ENCERRANDO SESSÃO'}</span>
            <strong><b>HOOK</b> KEYS</strong>
            <small>${entering ? 'Preparando sua performance' : 'Salvando sua performance'}</small>
          </div>
        </div>
        <footer class="octave-transition__footer">
          <div class="octave-transition__progress"><i></i></div>
          <span>HOOK AUDIO ENGINE</span>
          <strong>${entering ? 'READY' : 'SAFE EXIT'}</strong>
        </footer>
      </div>
      <div class="octave-transition__scan"></div>
    </div>
  `;
}

export class HookKeysApp {
  private readonly screenRoot: HTMLElement;
  private playerScreen: PlayerScreen | null = null;
  private stopLicenseMonitoring: (() => void) | null = null;
  private octaveTransition: HTMLElement | null = null;

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
      () => this.accountApi.getPublicAppSettings(),
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
    void this.playOctaveTransition('enter');
  }

  private async logout(session: AuthenticatedSession): Promise<void> {
    await this.sessions.logout(session);
    await this.playOctaveTransition('exit', () => this.showLogin());
  }

  private playOctaveTransition(
    direction: OctaveTransitionDirection,
    swapScreen?: () => void,
  ): Promise<void> {
    this.octaveTransition?.remove();
    const holder = document.createElement('div');
    holder.innerHTML = createOctaveTransitionMarkup(direction).trim();
    const overlay = holder.firstElementChild as HTMLElement | null;
    if (!overlay) {
      swapScreen?.();
      return Promise.resolve();
    }
    this.octaveTransition = overlay;
    document.body.append(overlay);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const totalDuration = reducedMotion ? 260 : 3000;
    const swapDelay = reducedMotion ? 100 : 2200;
    window.requestAnimationFrame(() => overlay.classList.add('is-running'));

    return new Promise((resolve) => {
      let swapped = false;
      const swap = () => {
        if (swapped) return;
        swapped = true;
        swapScreen?.();
      };
      if (swapScreen) window.setTimeout(swap, swapDelay);
      window.setTimeout(() => {
        swap();
        overlay.remove();
        if (this.octaveTransition === overlay) this.octaveTransition = null;
        resolve();
      }, totalDuration);
    });
  }
}
