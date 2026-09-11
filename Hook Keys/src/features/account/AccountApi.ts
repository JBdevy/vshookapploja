import type { HttpClient } from '../../shared/api/HttpClient';
import type { SoundCatalogPayload } from '../sound-library/SoundCatalog';

export interface PlayerStateResponse {
  ok: true;
  state: unknown;
  revision: number;
  updatedAt?: string;
}

export interface AppSettingsResponse {
  ok: true;
  acquireLicenseUrl: string;
  compatibilityVideoUrl: string;
  supportUrl: string;
}

export interface PublicAppSettingsResponse {
  ok: true;
  supportUrl: string;
}

export interface SoundCatalogResponse {
  ok: true;
  catalog: SoundCatalogPayload;
}

export interface AccountProfile {
  id: number;
  email: string;
  name: string;
  createdAt: string | null;
  photoDataUrl: string;
}

export class AccountApi {
  constructor(private readonly http: HttpClient) {}

  getPlayerState(token: string): Promise<PlayerStateResponse> {
    return this.http.request('/api/orangekey/account/player-state', {
      method: 'GET',
      token,
    });
  }

  savePlayerState(token: string, state: unknown): Promise<{ ok: true }> {
    return this.http.request('/api/orangekey/account/player-state', {
      method: 'PUT',
      token,
      body: { state },
    });
  }

  emailPlayerBackup(token: string, state: unknown): Promise<{ ok: true; createdAt: string; emailedTo: string }> {
    return this.http.request('/api/orangekey/account/player-backup/email', {
      method: 'POST',
      token,
      body: { state },
    });
  }

  getAppSettings(token: string): Promise<AppSettingsResponse> {
    return this.http.request('/api/orangekey/account/app-settings', {
      method: 'GET',
      token,
    });
  }

  getSoundCatalog(token: string): Promise<SoundCatalogResponse> {
    return this.http.request('/api/orangekey/account/sound-catalog', {
      method: 'GET',
      token,
    });
  }

  getPublicAppSettings(): Promise<PublicAppSettingsResponse> {
    return this.http.request('/api/orangekey/public/app-settings', {
      method: 'GET',
    });
  }

  getProfile(token: string): Promise<{ ok: true; profile: AccountProfile }> {
    return this.http.request('/api/orangekey/account/profile', {
      method: 'GET',
      token,
    });
  }

  saveProfilePhoto(token: string, imageDataUrl: string): Promise<{ ok: true; profile: AccountProfile }> {
    return this.http.request('/api/orangekey/account/profile/photo', {
      method: 'PUT',
      token,
      body: { imageDataUrl },
    });
  }
}
