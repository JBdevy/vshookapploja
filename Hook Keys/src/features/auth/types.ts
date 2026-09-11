export interface HookKeysAccount {
  id?: number;
  email: string;
  name?: string;
}

export interface HookKeysDevice {
  id: string;
  name: string;
  platform?: string;
  current?: boolean;
  lastSeenAt?: string;
}

export interface LicenseUsage {
  total: number;
  used: number;
}

export interface RequestCodeResponse {
  ok: true;
  verificationRequired: true;
  challengeId: string;
  maskedEmail: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
  message: string;
}

export interface PasswordLoginRequiredResponse {
  ok: true;
  passwordRequired: true;
  email: string;
}

export type StartLoginResponse = RequestCodeResponse | PasswordLoginRequiredResponse;

export interface PasswordSetupRequiredResponse {
  ok: true;
  passwordSetupRequired: true;
  passwordToken: string;
}

export interface AuthenticatedResponse {
  ok: true;
  deviceRemovalRequired?: false;
  sessionToken: string;
  sessionExpiresAt: string;
  deviceId?: string;
  licenses?: LicenseUsage;
  account: HookKeysAccount;
}

export interface DeviceRemovalRequiredResponse {
  ok: true;
  deviceRemovalRequired: true;
  replacementId: string;
  devices: HookKeysDevice[];
  licenses: LicenseUsage;
  message: string;
}

export interface DeviceNameRequiredResponse {
  ok: true;
  deviceNameRequired: true;
  registrationId: string;
}

export type DeviceRegistrationResponse = AuthenticatedResponse | DeviceRemovalRequiredResponse;
export type InitialDeviceLoginResponse = AuthenticatedResponse | DeviceNameRequiredResponse;
export type VerifyCodeResponse = PasswordSetupRequiredResponse;

export interface PasswordResetTokenResponse {
  ok: true;
  passwordResetRequired: true;
  passwordToken: string;
}

export interface DeviceOverviewResponse {
  ok: true;
  totalLicenses: number;
  usedLicenses: number;
  devices: HookKeysDevice[];
}

export interface AuthMeResponse {
  ok: true;
  sessionExpiresAt?: string;
  account: HookKeysAccount;
}

export interface AuthenticatedSession {
  token: string;
  expiresAt?: string;
  account: HookKeysAccount;
}
