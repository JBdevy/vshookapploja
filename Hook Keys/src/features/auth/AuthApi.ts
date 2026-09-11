import type { HttpClient } from '../../shared/api/HttpClient';
import type {
  AuthMeResponse,
  AuthenticatedResponse,
  DeviceOverviewResponse,
  DeviceRegistrationResponse,
  InitialDeviceLoginResponse,
  RequestCodeResponse,
  StartLoginResponse,
  PasswordResetTokenResponse,
  VerifyCodeResponse,
} from './types';

export class AuthApi {
  constructor(private readonly http: HttpClient) {}

  startLogin(email: string): Promise<StartLoginResponse> {
    return this.http.request('/api/orangekey/auth/start', {
      method: 'POST',
      body: { email },
    });
  }

  loginWithPassword(email: string, password: string, deviceKey: string): Promise<InitialDeviceLoginResponse> {
    return this.http.request('/api/orangekey/auth/password/login', {
      method: 'POST',
      body: { email, password, deviceKey, platform: this.platformName() },
    });
  }

  verifyCode(challengeId: string, code: string, deviceKey: string): Promise<VerifyCodeResponse> {
    return this.http.request('/api/orangekey/auth/verify-code', {
      method: 'POST',
      body: { challengeId, code, deviceKey, platform: this.platformName() },
    });
  }

  completePasswordSetup(passwordToken: string, password: string, deviceKey: string): Promise<InitialDeviceLoginResponse> {
    return this.http.request('/api/orangekey/auth/password/setup', {
      method: 'POST',
      body: { passwordToken, password, deviceKey, platform: this.platformName() },
    });
  }

  completeDeviceRegistration(registrationId: string, deviceName: string): Promise<DeviceRegistrationResponse> {
    return this.http.request('/api/orangekey/auth/device-registration/complete', {
      method: 'POST',
      body: { registrationId, deviceName },
    });
  }

  confirmLoginReplacement(replacementId: string, targetDeviceId: string, deviceName: string, password: string): Promise<AuthenticatedResponse> {
    return this.http.request('/api/orangekey/auth/device-replacement/confirm-password', {
      method: 'POST',
      body: { replacementId, targetDeviceId, deviceName, password },
    });
  }

  devices(token: string): Promise<DeviceOverviewResponse> {
    return this.http.request('/api/orangekey/account/devices', { method: 'GET', token });
  }

  confirmDeviceRemoval(token: string, targetDeviceId: string, password: string): Promise<{ ok: true; currentDeviceRemoved: boolean }> {
    return this.http.request('/api/orangekey/account/devices/removal/confirm', {
      method: 'POST', token, body: { targetDeviceId, password },
    });
  }

  requestPasswordReset(token: string): Promise<RequestCodeResponse> {
    return this.http.request('/api/orangekey/account/password/reset/request-code', { method: 'POST', token });
  }

  verifyPasswordResetCode(token: string, challengeId: string, code: string): Promise<PasswordResetTokenResponse> {
    return this.http.request('/api/orangekey/account/password/reset/verify-code', {
      method: 'POST', token, body: { challengeId, code },
    });
  }

  completePasswordReset(token: string, passwordToken: string, password: string): Promise<{ ok: true }> {
    return this.http.request('/api/orangekey/account/password/reset/complete', {
      method: 'POST', token, body: { passwordToken, password },
    });
  }

  me(token: string): Promise<AuthMeResponse> {
    return this.http.request('/api/orangekey/auth/me', {
      method: 'GET',
      token,
    });
  }

  async logout(token: string): Promise<void> {
    await this.http.request('/api/orangekey/auth/logout', {
      method: 'POST',
      token,
    });
  }

  private platformName(): string {
    const userAgent = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(userAgent)) return 'iOS';
    if (/android/.test(userAgent)) return 'Android';
    return 'Navegador';
  }
}
