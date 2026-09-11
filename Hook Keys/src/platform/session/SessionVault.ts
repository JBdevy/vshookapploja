export interface StoredSession {
  token: string;
  expiresAt?: string;
  account: { email: string; name?: string };
}

export interface SessionVault {
  readSession(): Promise<StoredSession | null>;
  writeSession(session: StoredSession): Promise<void>;
  clearToken(): Promise<void>;
}
