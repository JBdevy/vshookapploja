import { ApiError } from '../../shared/api/ApiError';
import { isWhatsAppSupportUrl, openWhatsAppSupport } from '../../shared/platform/WhatsAppSupport';
import type { AuthSessionService } from './AuthSessionService';
import type { PublicAppSettingsResponse } from '../account/AccountApi';
import type {
  AuthenticatedSession,
  DeviceRemovalRequiredResponse,
  RequestCodeResponse,
} from './types';

interface ActiveChallenge {
  data: RequestCodeResponse;
  expiresAt: number;
  resendAt: number;
}

function select<T extends Element>(parent: ParentNode, selector: string): T {
  const element = parent.querySelector<T>(selector);
  if (!element) throw new Error(`Elemento obrigatório não encontrado: ${selector}`);
  return element;
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export class AuthScreen {
  private readonly content: HTMLElement;
  private email = '';
  private deviceName = '';
  private challenge: ActiveChallenge | null = null;
  private replacement: { access: DeviceRemovalRequiredResponse } | null = null;
  private countdownTimer: number | null = null;
  private resendBusy = false;
  private supportUrl = '';
  private purchaseUrl = '';
  private readonly supportButton: HTMLButtonElement;
  private readonly purchaseButton: HTMLButtonElement;

  constructor(
    root: HTMLElement,
    private readonly sessions: AuthSessionService,
    private readonly onAuthenticated: (session: AuthenticatedSession) => void,
    private readonly getPublicAppSettings: () => Promise<PublicAppSettingsResponse>,
  ) {
    this.deviceName = sessions.getDeviceName();
    root.innerHTML = `
      <main class="app-screen app-shell">
        <section class="brand-stage" aria-labelledby="brand-title">
          <div class="brand-lockup">
            <img
              class="brand-symbol-image"
              src="/assets/icons/icon-256.webp"
              alt=""
              aria-hidden="true"
            >
            <p class="brand-kicker">ReiVs apresenta</p>
            <h1 id="brand-title"><span>Hook</span> Keys</h1>
            <p class="brand-line">Seu instrumento. Em qualquer palco.</p>
          </div>

          <div class="brand-notes" aria-label="Vantagens do acesso Hook Keys">
            <p><span aria-hidden="true"></span>Acesso vinculado ao e-mail da sua compra</p>
            <p><span aria-hidden="true"></span>Seus sons prontos para acompanhar você</p>
          </div>
        </section>

        <section class="access-stage" aria-label="Acesso ao Hook Keys">
          <div class="access-glow" aria-hidden="true"></div>
          <div class="access-card">
            <div class="access-card__topline">
              <span class="status-light" aria-hidden="true"></span>
              <span>Hook Keys</span>
            </div>
            <div id="auth-content" class="auth-content"></div>
            <div class="login-access-actions">
              <button class="login-purchase-button" type="button" disabled>Comprar acesso</button>
              <button class="login-support-button" type="button" disabled>Suporte</button>
            </div>
          </div>
          <p class="access-footer">Acesso protegido pela sua senha</p>
        </section>
      </main>
    `;

    this.content = select(root, '#auth-content');
    this.purchaseButton = select(root, '.login-purchase-button');
    this.supportButton = select(root, '.login-support-button');
    this.purchaseButton.addEventListener('click', () => this.openPurchasePage());
    this.supportButton.addEventListener('click', () => this.openSupport());
  }

  async start(): Promise<void> {
    void this.loadPublicAppSettings();
    this.renderLoading();
    try {
      const session = await this.sessions.restoreSession();
      if (session) {
        this.finishAuthentication(session);
        return;
      }
      this.renderEmail();
    } catch {
      this.renderConnectionError();
    }
  }

  private async loadPublicAppSettings(): Promise<void> {
    try {
      const settings = await this.getPublicAppSettings();
      if (isWhatsAppSupportUrl(settings.supportUrl)) {
        this.supportUrl = settings.supportUrl;
        this.supportButton.disabled = false;
      }
      if (this.isPublicHttpUrl(settings.acquireLicenseUrl)) {
        this.purchaseUrl = settings.acquireLicenseUrl;
        this.purchaseButton.disabled = false;
      }
    } catch {
      this.supportUrl = '';
      this.purchaseUrl = '';
      this.supportButton.disabled = true;
      this.purchaseButton.disabled = true;
    }
  }

  private openPurchasePage(): void {
    if (!this.purchaseUrl) return;
    window.open(this.purchaseUrl, '_blank', 'noopener,noreferrer');
  }

  private isPublicHttpUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      return false;
    }
  }

  private openSupport(): void {
    if (!this.supportUrl) return;
    void openWhatsAppSupport(this.supportUrl);
  }

  private renderLoading(): void {
    this.replaceContent(`
      <div class="loading-state" role="status">
        <span class="loading-orbit" aria-hidden="true"></span>
        <p>Preparando seu acesso...</p>
      </div>
    `);
  }

  private renderEmail(): void {
    this.challenge = null;
    this.replaceContent(`
      <header class="form-heading">
        <p class="eyebrow">Bem-vindo</p>
        <h2>Acessar Hook Keys</h2>
        <p>Informe o e-mail usado na compra para acessar sua conta.</p>
      </header>

      <form class="auth-form" novalidate>
        <label class="field-label" for="purchase-email">E-mail da compra</label>
        <div class="input-shell">
          <span class="mail-icon" aria-hidden="true"></span>
          <input
            id="purchase-email"
            name="email"
            type="email"
            inputmode="email"
            autocomplete="email"
            autocapitalize="none"
            spellcheck="false"
            placeholder="seuemail@exemplo.com"
            required
          >
        </div>
        <p class="form-error" role="alert" aria-live="polite"></p>
        <button class="primary-button" type="submit">Entrar</button>
      </form>

      <p class="form-footnote">No primeiro acesso, você confirmará o e-mail e criará sua senha.</p>
    `);

    const form = select<HTMLFormElement>(this.content, 'form');
    const input = select<HTMLInputElement>(form, '#purchase-email');
    const button = select<HTMLButtonElement>(form, 'button[type="submit"]');
    input.value = this.email;
    window.setTimeout(() => input.focus({ preventScroll: true }), 0);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      this.setError('');
      if (!input.checkValidity()) {
        input.reportValidity();
        return;
      }

      this.email = input.value.trim().toLowerCase();
      this.setButtonBusy(button, true, 'Continuando...');
      input.disabled = true;
      try {
        const response = await this.sessions.startLogin(this.email);
        if ('passwordRequired' in response) {
          this.renderPasswordLogin();
        } else {
          this.activateChallenge(response);
          this.renderCode();
        }
      } catch (error) {
        this.setError(this.toUserMessage(error));
        input.disabled = false;
        this.setButtonBusy(button, false);
        input.focus({ preventScroll: true });
      }
    });
  }

  private renderPasswordLogin(): void {
    this.replaceContent(`
      <header class="form-heading form-heading--compact form-heading--with-back">
        <button class="back-button" type="button" aria-label="Voltar para o e-mail">←</button>
        <p class="eyebrow">Bem-vindo de volta</p>
        <h2>Digite sua senha</h2>
        <p>${this.escape(this.email)}</p>
      </header>
      <form class="auth-form" novalidate>
        <label class="field-label" for="account-password">Senha</label>
        <div class="input-shell">
          <span class="password-icon" aria-hidden="true"></span>
          <input id="account-password" type="password" minlength="8" maxlength="128" autocomplete="current-password" required>
        </div>
        <p class="form-error" role="alert" aria-live="polite"></p>
        <button class="primary-button" type="submit">Entrar</button>
      </form>
    `);
    const form = select<HTMLFormElement>(this.content, 'form');
    const input = select<HTMLInputElement>(form, '#account-password');
    const button = select<HTMLButtonElement>(form, '.primary-button');
    select<HTMLButtonElement>(this.content, '.back-button').addEventListener('click', () => this.renderEmail());
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!input.checkValidity()) return input.reportValidity();
      this.setError('');
      this.setButtonBusy(button, true, 'Entrando...');
      input.disabled = true;
      try {
        const result = await this.sessions.loginWithPassword(this.email, input.value);
        input.value = '';
        if ('registrationId' in result) this.renderDeviceName(result.registrationId);
        else this.finishAuthentication(result);
      } catch (error) {
        input.disabled = false;
        input.value = '';
        this.setButtonBusy(button, false);
        this.setError(this.toUserMessage(error, 'E-mail ou senha incorretos.'));
        input.focus({ preventScroll: true });
      }
    });
    window.setTimeout(() => input.focus({ preventScroll: true }), 0);
  }

  private renderPasswordSetup(passwordToken: string): void {
    this.replaceContent(`
      <header class="form-heading form-heading--compact">
        <p class="eyebrow">Primeiro acesso</p>
        <h2>Crie sua senha</h2>
        <p>Use pelo menos 8 caracteres. Não é obrigatório usar letra maiúscula ou caractere especial.</p>
      </header>
      <form class="auth-form" novalidate>
        <label class="field-label" for="new-account-password">Nova senha</label>
        <div class="input-shell">
          <span class="password-icon" aria-hidden="true"></span>
          <input id="new-account-password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required>
        </div>
        <label class="field-label" for="confirm-account-password">Confirme a senha</label>
        <div class="input-shell">
          <span class="password-icon" aria-hidden="true"></span>
          <input id="confirm-account-password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required>
        </div>
        <p class="form-error" role="alert" aria-live="polite"></p>
        <button class="primary-button" type="submit">Criar senha</button>
      </form>
    `);
    const form = select<HTMLFormElement>(this.content, 'form');
    const password = select<HTMLInputElement>(form, '#new-account-password');
    const confirmation = select<HTMLInputElement>(form, '#confirm-account-password');
    const button = select<HTMLButtonElement>(form, '.primary-button');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!password.checkValidity() || !confirmation.checkValidity()) return password.reportValidity();
      if (password.value !== confirmation.value) {
        this.setError('As senhas não são iguais.');
        return;
      }
      this.setButtonBusy(button, true, 'Criando...');
      password.disabled = true;
      confirmation.disabled = true;
      try {
        const result = await this.sessions.completePasswordSetup(passwordToken, password.value);
        password.value = '';
        confirmation.value = '';
        if ('registrationId' in result) this.renderDeviceName(result.registrationId);
        else this.finishAuthentication(result);
      } catch (error) {
        password.disabled = false;
        confirmation.disabled = false;
        this.setButtonBusy(button, false);
        this.setError(this.toUserMessage(error));
        password.focus({ preventScroll: true });
      }
    });
    window.setTimeout(() => password.focus({ preventScroll: true }), 0);
  }

  private renderCode(): void {
    if (!this.challenge) {
      this.renderEmail();
      return;
    }

    this.replaceContent(`
      <header class="form-heading form-heading--code form-heading--with-back">
        <button class="back-button" type="button" aria-label="Voltar para o e-mail">←</button>
        <p class="eyebrow">Confirme seu acesso</p>
        <h2>Confira seu e-mail</h2>
        <p>Digite o código de 6 dígitos enviado para <strong id="confirmation-email"></strong>.</p>
      </header>

      <form class="auth-form" novalidate>
        <label class="field-label" for="access-code">Código de acesso</label>
        <input
          class="code-input"
          id="access-code"
          name="code"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          pattern="[0-9]{6}"
          maxlength="6"
          aria-describedby="code-expiration"
          required
        >
        <div class="code-meta">
          <span id="code-expiration"></span>
          <button id="resend-button" class="text-button" type="button"></button>
        </div>
        <p class="form-error" role="alert" aria-live="polite"></p>
        <button class="primary-button" type="submit" disabled>Entrar</button>
      </form>
    `);

    const confirmationEmail = select<HTMLElement>(this.content, '#confirmation-email');
    const backButton = select<HTMLButtonElement>(this.content, '.back-button');
    const form = select<HTMLFormElement>(this.content, 'form');
    const codeInput = select<HTMLInputElement>(form, '#access-code');
    const submitButton = select<HTMLButtonElement>(form, 'button[type="submit"]');
    const resendButton = select<HTMLButtonElement>(form, '#resend-button');
    const expiration = select<HTMLElement>(form, '#code-expiration');

    confirmationEmail.textContent = this.email;
    backButton.addEventListener('click', () => this.renderEmail());
    codeInput.addEventListener('input', () => {
      codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
      this.setError('');
      this.refreshChallengeControls(codeInput, submitButton, resendButton, expiration);
    });
    resendButton.addEventListener('click', () => {
      void this.resendCode(codeInput, submitButton, resendButton, expiration);
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!this.challenge || codeInput.value.length !== 6 || Date.now() >= this.challenge.expiresAt) {
        return;
      }

      this.setError('');
      this.setButtonBusy(submitButton, true, 'Confirmando...');
      codeInput.disabled = true;
      resendButton.disabled = true;
      try {
        const result = await this.sessions.verifyCode(
          this.challenge.data.challengeId,
          codeInput.value,
        );
        this.renderPasswordSetup(result.passwordToken);
      } catch (error) {
        this.setError(this.toUserMessage(error, 'Código inválido ou expirado. Tente novamente.'));
        codeInput.disabled = false;
        codeInput.value = '';
        this.setButtonBusy(submitButton, false);
        this.refreshChallengeControls(codeInput, submitButton, resendButton, expiration);
        codeInput.focus({ preventScroll: true });
      }
    });

    this.startChallengeCountdown(codeInput, submitButton, resendButton, expiration);
    window.setTimeout(() => codeInput.focus({ preventScroll: true }), 0);
  }

  private renderDeviceName(registrationId: string): void {
    this.replaceContent(`
      <div class="device-name-stage">
        <span class="device-name-stage__pulse" aria-hidden="true"></span>
        <header class="form-heading form-heading--compact">
          <p class="eyebrow">Novo dispositivo</p>
          <h2>Escolha um nome para este dispositivo</h2>
          <p>Esse nome ajudará você a identificar e gerenciar seus acessos.</p>
        </header>
        <form class="auth-form" novalidate>
          <label class="field-label" for="new-device-name">Nome do dispositivo</label>
          <div class="input-shell">
            <span class="device-icon" aria-hidden="true"></span>
            <input id="new-device-name" type="text" maxlength="80" autocomplete="off" placeholder="Ex:Ipad Banda" required>
          </div>
          <p class="form-error" role="alert" aria-live="polite"></p>
          <button class="primary-button" type="submit">Continuar</button>
        </form>
      </div>
    `);
    const form = select<HTMLFormElement>(this.content, 'form');
    const input = select<HTMLInputElement>(form, '#new-device-name');
    const button = select<HTMLButtonElement>(form, '.primary-button');
    input.value = this.deviceName;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = input.value.trim();
      if (!name) {
        input.reportValidity();
        return;
      }
      this.deviceName = name;
      this.setButtonBusy(button, true, 'Continuando...');
      input.disabled = true;
      try {
        const result = await this.sessions.completeDeviceRegistration(registrationId, name);
        if (!('token' in result)) {
          this.replacement = { access: result };
          this.renderDeviceReplacement();
        } else {
          this.finishAuthentication(result);
        }
      } catch (error) {
        input.disabled = false;
        this.setButtonBusy(button, false);
        this.setError(this.toUserMessage(error));
        input.focus({ preventScroll: true });
      }
    });
    window.setTimeout(() => input.focus({ preventScroll: true }), 0);
  }

  private renderDeviceReplacement(): void {
    if (!this.replacement) return this.renderEmail();
    const { access } = this.replacement;
    const devices = access.devices.map((device, index) => `
      <label class="device-choice">
        <input type="radio" name="removeDevice" value="${device.id}" ${index === 0 ? 'checked' : ''}>
        <span><strong>${this.escape(device.name)}</strong><small>${this.escape(device.platform || 'Dispositivo')}</small></span>
      </label>
    `).join('');
    this.replaceContent(`
      <header class="form-heading form-heading--compact">
        <p class="eyebrow">Licenças em uso</p>
        <h2>Escolha um dispositivo</h2>
        <p>${this.escape(access.message)}</p>
      </header>
      <form class="auth-form auth-form--devices" novalidate>
        <div class="license-usage"><strong>${access.licenses.used} de ${access.licenses.total}</strong><span>licenças utilizadas</span></div>
        <div class="device-choice-list">${devices}</div>
        <label class="field-label" for="replacement-password">Confirme sua senha</label>
        <div class="input-shell">
          <span class="password-icon" aria-hidden="true"></span>
          <input id="replacement-password" type="password" minlength="8" maxlength="128" autocomplete="current-password" required>
        </div>
        <p class="form-error" role="alert" aria-live="polite"></p>
        <button class="primary-button" type="submit">Remover</button>
        <button class="text-button" type="button" data-back-login>Voltar</button>
      </form>
    `);
    const form = select<HTMLFormElement>(this.content, 'form');
    const button = select<HTMLButtonElement>(form, '.primary-button');
    const password = select<HTMLInputElement>(form, '#replacement-password');
    select<HTMLButtonElement>(form, '[data-back-login]').addEventListener('click', () => this.renderEmail());
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const selected = form.querySelector<HTMLInputElement>('input[name="removeDevice"]:checked');
      if (!selected) return this.setError('Escolha o dispositivo que deseja remover.');
      this.setButtonBusy(button, true, 'Removendo...');
      try {
        const session = await this.sessions.confirmLoginReplacement(
          access.replacementId,
          selected.value,
          this.deviceName,
          password.value,
        );
        password.value = '';
        this.finishAuthentication(session);
      } catch (error) {
        this.setError(this.toUserMessage(error));
        this.setButtonBusy(button, false);
        password.value = '';
        password.focus({ preventScroll: true });
      }
    });
  }

  private async resendCode(
    codeInput: HTMLInputElement,
    submitButton: HTMLButtonElement,
    resendButton: HTMLButtonElement,
    expiration: HTMLElement,
  ): Promise<void> {
    if (!this.challenge || Date.now() < this.challenge.resendAt || this.resendBusy) return;

    this.resendBusy = true;
    this.setError('');
    this.refreshChallengeControls(codeInput, submitButton, resendButton, expiration);
    try {
      const response = await this.sessions.startLogin(this.email);
      if ('passwordRequired' in response) this.renderPasswordLogin();
      else {
        this.activateChallenge(response);
        this.renderCode();
      }
    } catch (error) {
      this.resendBusy = false;
      this.setError(this.toUserMessage(error));
      this.refreshChallengeControls(codeInput, submitButton, resendButton, expiration);
    }
  }

  private renderConnectionError(): void {
    this.replaceContent(`
      <div class="connection-state">
        <div class="connection-mark" aria-hidden="true">!</div>
        <p class="eyebrow">Tente novamente</p>
        <h2>Não foi possível abrir seu acesso</h2>
        <p>Confira sua conexão e tente mais uma vez.</p>
        <button class="primary-button" type="button">Tentar novamente</button>
        <button class="text-button use-another-email" type="button">Entrar com outro e-mail</button>
      </div>
    `);

    select<HTMLButtonElement>(this.content, '.primary-button').addEventListener('click', () => {
      void this.start();
    });
    select<HTMLButtonElement>(this.content, '.use-another-email').addEventListener('click', () => {
      this.renderEmail();
    });
  }

  private activateChallenge(response: RequestCodeResponse): void {
    const now = Date.now();
    this.resendBusy = false;
    this.challenge = {
      data: response,
      expiresAt: now + Math.max(0, response.expiresInSeconds) * 1000,
      resendAt: now + Math.max(0, response.resendAfterSeconds) * 1000,
    };
  }

  private startChallengeCountdown(
    codeInput: HTMLInputElement,
    submitButton: HTMLButtonElement,
    resendButton: HTMLButtonElement,
    expiration: HTMLElement,
  ): void {
    const update = () => {
      this.refreshChallengeControls(codeInput, submitButton, resendButton, expiration);
    };
    update();
    this.countdownTimer = window.setInterval(update, 1000);
  }

  private refreshChallengeControls(
    codeInput: HTMLInputElement,
    submitButton: HTMLButtonElement,
    resendButton: HTMLButtonElement,
    expiration: HTMLElement,
  ): void {
    if (!this.challenge) return;

    const now = Date.now();
    const expiresIn = Math.max(0, Math.ceil((this.challenge.expiresAt - now) / 1000));
    const resendIn = Math.max(0, Math.ceil((this.challenge.resendAt - now) / 1000));
    const isExpired = expiresIn === 0;

    expiration.textContent = isExpired
      ? 'Este código expirou.'
      : `Expira em ${formatCountdown(expiresIn)}`;
    submitButton.disabled = codeInput.disabled || codeInput.value.length !== 6 || isExpired;
    resendButton.disabled = this.resendBusy || resendIn > 0;
    resendButton.textContent = this.resendBusy
      ? 'Enviando...'
      : resendIn > 0
        ? `Reenviar em ${resendIn}s`
        : 'Reenviar código';
  }

  private replaceContent(markup: string): void {
    if (this.countdownTimer !== null) {
      window.clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.content.innerHTML = markup;
  }

  private finishAuthentication(session: AuthenticatedSession): void {
    if (this.countdownTimer !== null) {
      window.clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.onAuthenticated(session);
  }

  private setError(message: string): void {
    const error = this.content.querySelector<HTMLElement>('.form-error');
    if (error) error.textContent = message;
  }

  private setButtonBusy(button: HTMLButtonElement, busy: boolean, busyLabel = ''): void {
    if (!button.dataset.defaultLabel) button.dataset.defaultLabel = button.textContent ?? '';
    button.disabled = busy;
    button.classList.toggle('is-busy', busy);
    button.textContent = busy ? busyLabel : button.dataset.defaultLabel;
  }

  private toUserMessage(
    error: unknown,
    fallback = 'Não foi possível concluir agora. Tente novamente.',
  ): string {
    return error instanceof ApiError && error.message.trim() ? error.message : fallback;
  }

  private escape(value: string): string {
    return value.replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    })[character] ?? character);
  }
}
