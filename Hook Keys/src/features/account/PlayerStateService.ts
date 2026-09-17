interface CachedPlayerState {
  state: unknown;
}

export class PlayerStateService {
  private readonly storageKey: string;
  private pendingState: unknown = null;
  private saveTimer: number | null = null;
  private readonly pageHideHandler = () => this.persistPendingLocally();

  constructor(accountEmail: string) {
    this.storageKey = `hookkeys.player-state.${accountEmail.trim().toLowerCase()}`;
    window.addEventListener('pagehide', this.pageHideHandler);
  }

  async load(): Promise<unknown> {
    return this.readCache()?.state ?? null;
  }

  save(state: unknown): void {
    this.pendingState = state;
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      this.persistPendingLocally();
    }, 500);
  }

  // Writes to the local cache before returning, for the moments where the app is
  // going away and a debounced save would never run.
  saveNow(state: unknown): void {
    this.pendingState = state;
    this.persistNow();
  }

  // Drains whatever a debounced save still holds. Cheap when nothing is queued.
  persistNow(): void {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.persistPendingLocally();
  }

  destroy(): void {
    this.persistPendingLocally();
    window.removeEventListener('pagehide', this.pageHideHandler);
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = null;
  }

  private persistPendingLocally(): void {
    if (this.pendingState !== null) {
      this.writeCache({ state: this.pendingState });
      this.pendingState = null;
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
