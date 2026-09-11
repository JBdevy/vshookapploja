import type { SessionVault, StoredSession } from './SessionVault';

// Mantido para preservar sessões criadas antes da troca do nome comercial.
const SESSION_KEY = 'orangekey.session';

/**
 * Armazenamento persistente da etapa de preview, necessário para abrir sem internet.
 *
 * Bloqueio de release: a fábrica deve substituir esta classe por uma
 * implementação protegida pelo Keychain (iOS) e Keystore (Android) antes da
 * distribuição nas lojas. O contrato evita mudanças no fluxo de autenticação.
 * A implementação nativa segura substituirá esta classe pela fábrica existente.
 */
export class BrowserSessionVault implements SessionVault {
  private memoryFallback: StoredSession | null = null;

  async readSession(): Promise<StoredSession | null> {
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      if (!raw) return this.memoryFallback;
      const parsed = JSON.parse(raw) as StoredSession;
      return parsed?.token && parsed?.account?.email ? parsed : this.memoryFallback;
    } catch {
      return this.memoryFallback;
    }
  }

  async writeSession(session: StoredSession): Promise<void> {
    this.memoryFallback = session;
    try {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      // O token continua válido somente durante esta execução.
    }
  }

  async clearToken(): Promise<void> {
    this.memoryFallback = null;
    try {
      window.localStorage.removeItem(SESSION_KEY);
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // O fallback em memória já foi removido.
    }
  }
}
