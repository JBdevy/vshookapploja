import type { SessionVault } from '../../platform/session/SessionVault';
import type { DeviceIdentityStore } from '../../platform/device/DeviceIdentityStore';
import { ApiError } from '../../shared/api/ApiError';
import type { AuthApi } from './AuthApi';
import type {
  AuthenticatedSession,
  AuthenticatedResponse,
  DeviceOverviewResponse,
  DeviceNameRequiredResponse,
  DeviceRemovalRequiredResponse,
  StartLoginResponse,
  VerifyCodeResponse,
} from './types';

export class AuthSessionService {
  constructor(
    private readonly api: AuthApi,
    private readonly vault: SessionVault,
    private readonly deviceIdentity: DeviceIdentityStore,
  ) {}

  startLogin(email: string): Promise<StartLoginResponse> {
    return this.api.startLogin(email.trim().toLowerCase());
  }

  getDeviceName(): string {
    return this.deviceIdentity.getName();
  }

  async verifyCode(
    challengeId: string,
    code: string,
  ): Promise<VerifyCodeResponse> {
    return this.api.verifyCode(
      challengeId,
      code,
      this.deviceIdentity.getKey(),
    );
  }

  async loginWithPassword(email: string, password: string): Promise<AuthenticatedSession | DeviceNameRequiredResponse> {
    const result = await this.api.loginWithPassword(
      email.trim().toLowerCase(), password, this.deviceIdentity.getKey(),
    );
    if (!('sessionToken' in result)) return result;
    return this.storeAuthenticatedResult(result, this.deviceIdentity.getName());
  }

  async completePasswordSetup(passwordToken: string, password: string): Promise<AuthenticatedSession | DeviceNameRequiredResponse> {
    const result = await this.api.completePasswordSetup(passwordToken, password, this.deviceIdentity.getKey());
    if (!('sessionToken' in result)) return result;
    return this.storeAuthenticatedResult(result, this.deviceIdentity.getName());
  }

  async completeDeviceRegistration(
    registrationId: string,
    deviceName: string,
  ): Promise<AuthenticatedSession | DeviceRemovalRequiredResponse> {
    const result = await this.api.completeDeviceRegistration(registrationId, deviceName);
    if (!('sessionToken' in result)) return result;
    return this.storeAuthenticatedResult(result, deviceName);
  }

  async confirmLoginReplacement(
    replacementId: string,
    targetDeviceId: string,
    deviceName: string,
    password: string,
  ): Promise<AuthenticatedSession> {
    const result = await this.api.confirmLoginReplacement(replacementId, targetDeviceId, deviceName, password);
    return this.storeAuthenticatedResult(result, deviceName);
  }

  private async storeAuthenticatedResult(
    result: AuthenticatedResponse,
    deviceName: string,
  ): Promise<AuthenticatedSession> {
    this.deviceIdentity.setName(deviceName);
    const session = {
      token: result.sessionToken,
      expiresAt: result.sessionExpiresAt,
      account: result.account,
    };
    await this.vault.writeSession(session);
    return {
      ...session,
    };
  }

  async restoreSession(): Promise<AuthenticatedSession | null> {
    const cached = await this.vault.readSession();
    if (!cached?.token) return null;

    try {
      const result = await this.api.me(cached.token);
      const session = {
        token: cached.token,
        expiresAt: result.sessionExpiresAt,
        account: result.account,
      };
      await this.vault.writeSession(session);
      return session;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        await this.vault.clearToken();
        return null;
      }
      if (error instanceof ApiError && error.status === 0) return cached;
      throw error;
    }
  }

  devices(session: AuthenticatedSession): Promise<DeviceOverviewResponse> {
    const cacheKey = `hookkeys.devices.${session.account.email.trim().toLowerCase()}`;
    if (!navigator.onLine) {
      try {
        const cached = window.localStorage.getItem(cacheKey);
        if (cached) return Promise.resolve(JSON.parse(cached) as DeviceOverviewResponse);
      } catch {
        // Continua para a resposta normal de conexão quando não há cache válido.
      }
    }
    return this.api.devices(session.token).then((overview) => {
      try {
        window.localStorage.setItem(cacheKey, JSON.stringify(overview));
      } catch {
        // A lista atual continua disponível enquanto o modal estiver aberto.
      }
      return overview;
    }).catch((error) => {
      if (error instanceof ApiError && error.status === 0) {
        try {
          const cached = window.localStorage.getItem(cacheKey);
          if (cached) return JSON.parse(cached) as DeviceOverviewResponse;
        } catch {
          // Sem uma cópia local válida, mantém o erro de conexão original.
        }
      }
      throw error;
    });
  }

  confirmDeviceRemoval(session: AuthenticatedSession, targetDeviceId: string, password: string) {
    return this.api.confirmDeviceRemoval(session.token, targetDeviceId, password);
  }

  requestTemporaryPassword(email: string): Promise<{ ok: true; temporaryPasswordSent: true; message: string }> {
    return this.api.requestTemporaryPassword(email.trim().toLowerCase());
  }

  changePassword(session: AuthenticatedSession, password: string, passwordConfirmation: string): Promise<{ ok: true }> {
    return this.api.changePassword(session.token, password, passwordConfirmation);
  }

  async updateCachedAccountName(session: AuthenticatedSession, name: string): Promise<void> {
    session.account.name = name;
    await this.vault.writeSession({
      token: session.token,
      expiresAt: session.expiresAt,
      account: session.account,
    });
  }

  startLicenseMonitoring(
    session: AuthenticatedSession,
    onAccessRemoved: () => void,
  ): () => void {
    let checking = false;
    const verify = async () => {
      if (checking || !navigator.onLine) return;
      checking = true;
      try {
        const result = await this.api.me(session.token);
        await this.vault.writeSession({
          token: session.token,
          expiresAt: result.sessionExpiresAt,
          account: result.account,
        });
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          await this.vault.clearToken();
          onAccessRemoved();
        }
      } finally {
        checking = false;
      }
    };
    const onOnline = () => void verify();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void verify();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => void verify(), 10 * 60 * 1000);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }

  async logout(session: AuthenticatedSession): Promise<void> {
    if (!navigator.onLine) {
      throw new ApiError('Conecte este dispositivo à internet para sair da conta.', 0);
    }
    await this.api.logout(session.token);
    await this.vault.clearToken();
  }

  clearLocalSession(): Promise<void> {
    return this.vault.clearToken();
  }
}
