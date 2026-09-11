import { ApiError } from '../../shared/api/ApiError';
import type { AccountApi } from './AccountApi';

interface CachedPlayerState {
  state: unknown;
  pending: boolean;
}

export class PlayerStateService {
  private readonly storageKey: string;
  private pendingState: unknown = null;
  private saveTimer: number | null = null;
  private saving = false;
  private destroyed = false;
  private readonly onlineHandler = () => void this.flush();
  private readonly pageHideHandler = () => this.persistPendingLocally();

  constructor(
    private readonly api: AccountApi,
    private readonly token: string,
    accountEmail: string,
  ) {
    this.storageKey = `hookkeys.player-state.${accountEmail.trim().toLowerCase()}`;
    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('pagehide', this.pageHideHandler);
  }

  async load(): Promise<unknown> {
    const cached = this.readCache();
    if (cached?.pending) {
      this.pendingState = cached.state;
      void this.flush();
      return cached.state;
    }
    if (!navigator.onLine) return cached?.state ?? null;
    try {
      const remote = await this.api.getPlayerState(this.token);
      if (remote.state) this.writeCache({ state: remote.state, pending: false });
      return remote.state ?? cached?.state ?? null;
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) return cached?.state ?? null;
      throw error;
    }
  }

  save(state: unknown): void {
    this.pendingState = state;
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      this.persistPendingLocally();
      void this.flush();
    }, 500);
  }

  async flush(): Promise<void> {
    if (this.destroyed || this.saving || !navigator.onLine || this.pendingState === null) return;
    const state = this.pendingState;
    this.saving = true;
    try {
      await this.api.savePlayerState(this.token, state);
      if (this.pendingState === state) {
        this.pendingState = null;
        this.writeCache({ state, pending: false });
      }
    } catch {
      // Mantém a alteração local para sincronizar quando a conexão voltar.
    } finally {
      this.saving = false;
      if (this.pendingState !== null && this.pendingState !== state) void this.flush();
    }
  }

  destroy(): void {
    this.persistPendingLocally();
    this.destroyed = true;
    window.removeEventListener('online', this.onlineHandler);
    window.removeEventListener('pagehide', this.pageHideHandler);
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = null;
  }

  private persistPendingLocally(): void {
    if (this.pendingState !== null) {
      this.writeCache({ state: this.pendingState, pending: true });
    }
  }

  private readCache(): CachedPlayerState | null {
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      return raw ? JSON.parse(raw) as CachedPlayerState : null;
    } catch {
      return null;
    }
  }

  private writeCache(cache: CachedPlayerState): void {
    try {
      window.localStorage.setItem(this.storageKey, JSON.stringify(cache));
    } catch {
      // O estado em memória continua disponível durante a execução.
    }
  }
}
