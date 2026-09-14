import { AuthScreen } from '../features/auth/AuthScreen';
import type { AuthSessionService } from '../features/auth/AuthSessionService';
import type { AuthenticatedSession } from '../features/auth/types';
import { PlayerScreen } from '../features/player/PlayerScreen';
import type { AccountApi } from '../features/account/AccountApi';
import { PlayerStateService } from '../features/account/PlayerStateService';
import { PlayerBackupService } from '../features/account/PlayerBackupService';
import { coverOrientationChange, nextPaint, prepareScreenOrientation } from '../platform/orientationTransition';

function requiredElement<T extends Element>(parent: ParentNode, selector: string): T {
  const element = parent.querySelector<T>(selector);
  if (!element) throw new Error(`Elemento obrigatório não encontrado: ${selector}`);
  return element;
}

type OctaveTransitionDirection = 'enter' | 'exit';

function createOctaveTransitionMarkup(direction: OctaveTransitionDirection): string {
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
            <img src="/assets/icons/256x256.png" alt="">
            <div><span>HOOK KEYS</span><small>PERFORMANCE INSTRUMENT</small></div>
          </div>
          <span class="octave-transition__engine-state"><i></i>${entering ? 'PREPARANDO MOTOR' : 'FINALIZANDO'}</span>
        </header>
        <div class="octave-transition__stage">
          <div class="octave-transition__meter">${meter}</div>
          <div class="octave-transition__title">
            <span>${entering ? 'INICIALIZANDO' : 'ENCERRANDO SESSÃO'}</span>
            <strong><b>HOOK</b> KEYS</strong>
            <small>${entering ? 'Preparando sua performance' : 'Salvando sua performance'}</small>
          </div>
        </div>
        <footer class="octave-transition__footer">
          <div class="octave-transition__progress"><i></i></div>
          <span>HOOK AUDIO ENGINE</span>
          <strong>${entering ? 'CARREGANDO' : 'SAFE EXIT'}</strong>
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
  private screenChangeId = 0;

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
    void this.showLogin();
  }

  private async showLogin(): Promise<void> {
    const changeId = ++this.screenChangeId;
    const cover = coverOrientationChange();
    this.octaveTransition?.remove();
    this.stopLicenseMonitoring?.();
    this.stopLicenseMonitoring = null;
    this.playerScreen?.destroy();
    this.playerScreen = null;
    this.screenRoot.replaceChildren();
    await prepareScreenOrientation('login');
    if (changeId !== this.screenChangeId) { cover.remove(); return; }
    const authScreen = new AuthScreen(
      this.screenRoot,
      this.sessions,
      (session) => { void this.showPlayer(session); },
      () => this.accountApi.getPublicAppSettings(),
    );
    void authScreen.start();
    await nextPaint();
    cover.remove();
  }

  private async showPlayer(session: AuthenticatedSession): Promise<void> {
    const changeId = ++this.screenChangeId;
    const cover = coverOrientationChange();
    this.octaveTransition?.remove();
    this.playerScreen?.destroy();
    this.playerScreen = null;
    this.screenRoot.replaceChildren();
    this.stopLicenseMonitoring?.();
    try {
    await prepareScreenOrientation('tablet');
    if (changeId !== this.screenChangeId) return;
    this.stopLicenseMonitoring = this.sessions.startLicenseMonitoring(session, () => { void this.showLogin(); });
    const playerState = new PlayerStateService(this.accountApi, session.token, session.account.email);
    const playerBackup = new PlayerBackupService(session.account.email);
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
          await this.showLogin();
        },
      },
      playerState,
      playerBackup,
    );
    this.playerScreen.mount();
    const loading = this.playOctaveTransition('enter', undefined, this.playerScreen.waitUntilReady());
    // O overlay de carregamento já cobre o player quando o preto é retirado.
    cover.remove();
    await loading;
    if (changeId === this.screenChangeId) await this.playerScreen?.activateLiveMidi();
    } catch (error) {
      if (changeId === this.screenChangeId) this.showStartupError(session, error);
    } finally {
      cover.remove();
    }
  }

  private showStartupError(session: AuthenticatedSession, error: unknown): void {
    this.octaveTransition?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'startup-error';
    overlay.innerHTML = '<section role="alert"><h2>Não foi possível preparar o Hook Keys</h2><p></p><button type="button">Tentar novamente</button><button type="button">Voltar</button></section>';
    requiredElement(overlay, 'p').textContent = error instanceof Error ? error.message : String(error);
    const buttons = overlay.querySelectorAll('button');
    buttons[0]?.addEventListener('click', () => { void this.showPlayer(session); });
    buttons[1]?.addEventListener('click', () => { void this.showLogin(); });
    document.body.append(overlay);
    this.octaveTransition = overlay;
  }

  private async logout(session: AuthenticatedSession): Promise<void> {
    await this.playerScreen?.suspendLiveMidi();
    await this.sessions.logout(session);
    // A despedida inteira continua em paisagem. Só depois que ela some a tela
    // de autenticação volta e o sistema trava novamente em retrato.
    await this.playOctaveTransition('exit');
    await this.showLogin();
  }

  private playOctaveTransition(
    direction: OctaveTransitionDirection,
    swapScreen?: () => void,
    readiness: Promise<void> = Promise.resolve(),
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
    // Carregamento mínimo de 3 s (a animação de entrada termina em ~2,2 s); a
    // despedida do logout mantém os 6 s da própria animação.
    const totalDuration = direction === 'enter' ? 3000 : 6000;
    const swapDelay = reducedMotion ? 100 : 4400;
    return new Promise((resolve, reject) => {
      let swapped = false;
      const swap = () => {
        if (swapped) return;
        swapped = true;
        swapScreen?.();
      };
      // Anexa já o tratamento de rejeição: um erro rápido não fica sem handler.
      const prepared = readiness.then(() => null, error => ({ error }));
      window.requestAnimationFrame(() => {
        overlay.classList.add('is-running');
        if (swapScreen) window.setTimeout(swap, swapDelay);
        const minimum = new Promise<void>(done => window.setTimeout(done, totalDuration));
        void Promise.all([minimum, prepared]).then(async ([, failure]) => {
          if (failure) { reject(failure.error); return; }
          swap();
          if (direction === 'enter') {
            overlay.classList.add('is-complete');
            await new Promise(done => window.setTimeout(done, reducedMotion ? 0 : 180));
          }
          overlay.remove();
          if (this.octaveTransition === overlay) this.octaveTransition = null;
          resolve();
        });
      });
    });
  }
}
