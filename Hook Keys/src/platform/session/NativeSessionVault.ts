import { registerPlugin } from '@capacitor/core';
import type { SessionVault, StoredSession } from './SessionVault';

interface NativeSessionVaultPlugin {
  read(): Promise<{ value: string | null }>;
  write(options: { value: string }): Promise<void>;
  clear(): Promise<void>;
}

const plugin = registerPlugin<NativeSessionVaultPlugin>('SessionVault');

// Keychain no iOS, SharedPreferences com backup no Android: os dois sobrevivem
// a desinstalar e reinstalar o app, diferente do localStorage da WebView.
export class NativeSessionVault implements SessionVault {
  private memoryFallback: StoredSession | null = null;

  async readSession(): Promise<StoredSession | null> {
    try {
      const { value } = await plugin.read();
      if (!value) return this.memoryFallback;
      const parsed = JSON.parse(value) as StoredSession;
      return parsed?.token && parsed?.account?.email ? parsed : this.memoryFallback;
    } catch {
      return this.memoryFallback;
    }
  }

  async writeSession(session: StoredSession): Promise<void> {
    this.memoryFallback = session;
    try {
      await plugin.write({ value: JSON.stringify(session) });
    } catch {
      // O token continua válido somente durante esta execução.
    }
  }

  async clearToken(): Promise<void> {
    this.memoryFallback = null;
    try {
      await plugin.clear();
    } catch {
      // O fallback em memória já foi removido.
    }
  }
}
