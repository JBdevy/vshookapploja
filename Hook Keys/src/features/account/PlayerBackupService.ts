import type { AccountApi } from './AccountApi';

interface CachedBackup {
  createdAt: string;
  pending: boolean;
  state: unknown;
}

export interface BackupResult {
  createdAt: string;
  savedOnline: boolean;
}

const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export class PlayerBackupService {
  private readonly storageKey: string;
  private readonly handleOnline = () => void this.syncPendingBackup();
  private snapshotProvider: (() => unknown) | null = null;
  private timer: number | null = null;
  private syncing = false;
  private destroyed = false;

  constructor(
    private readonly api: AccountApi,
    private readonly token: string,
    accountEmail: string,
  ) {
    this.storageKey = `hookkeys.player-backup.${accountEmail.trim().toLowerCase()}`;
  }

  start(snapshotProvider: () => unknown): void {
    if (this.destroyed || this.snapshotProvider) return;
    this.snapshotProvider = snapshotProvider;
    window.addEventListener('online', this.handleOnline);
    const cached = this.readCache();
    if (cached?.pending) void this.syncPendingBackup();
    this.scheduleNextBackup(cached?.createdAt ?? null);
  }

  async backupNow(state?: unknown): Promise<BackupResult> {
    const snapshot = state ?? this.snapshotProvider?.();
    if (!snapshot || typeof snapshot !== 'object') throw new Error('backup_state_unavailable');
    const createdAt = new Date().toISOString();
    const cached: CachedBackup = { createdAt, pending: true, state: snapshot };
    this.writeCache(cached);
    this.scheduleNextBackup(createdAt);
    if (!navigator.onLine) return { createdAt, savedOnline: false };
    const savedOnline = await this.syncBackup(cached);
    return { createdAt, savedOnline };
  }

  async restore(): Promise<unknown | null> {
    const cached = this.readCache();
    if (!navigator.onLine) return cached?.state ?? null;
    if (cached?.pending) {
      const synced = await this.syncBackup(cached);
      if (synced) return cached.state;
    }
    try {
      const remote = await this.api.getPlayerBackup(this.token);
      if (!remote.state) return cached?.state ?? null;
      this.writeCache({
        createdAt: remote.updatedAt ?? remote.createdAt ?? new Date().toISOString(),
        pending: false,
        state: remote.state,
      });
      return remote.state;
    } catch {
      return cached?.state ?? null;
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.snapshotProvider = null;
    window.removeEventListener('online', this.handleOnline);
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  private async syncPendingBackup(): Promise<void> {
    const cached = this.readCache();
    if (!cached?.pending || !navigator.onLine) return;
    await this.syncBackup(cached);
  }

  private async syncBackup(cached: CachedBackup): Promise<boolean> {
    if (this.syncing || this.destroyed || !navigator.onLine) return false;
    this.syncing = true;
    try {
      const response = await this.api.savePlayerBackup(this.token, cached.state);
      const current = this.readCache();
      if (current?.createdAt === cached.createdAt) {
        this.writeCache({
          ...cached,
          createdAt: response.updatedAt ?? cached.createdAt,
          pending: false,
        });
      }
      return true;
    } catch {
      return false;
    } finally {
      this.syncing = false;
      const current = this.readCache();
      if (current?.pending && current.createdAt !== cached.createdAt) {
        void this.syncPendingBackup();
      }
    }
  }

  private scheduleNextBackup(previousBackupAt: string | null): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    if (this.destroyed || !this.snapshotProvider) return;
    const previousTime = previousBackupAt ? Date.parse(previousBackupAt) : Number.NaN;
    const elapsed = Number.isFinite(previousTime) ? Date.now() - previousTime : 0;
    const delay = Math.max(1_000, BACKUP_INTERVAL_MS - Math.max(0, elapsed));
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.backupNow().finally(() => {
        if (this.timer === null) this.scheduleNextBackup(new Date().toISOString());
      });
    }, delay);
  }

  private readCache(): CachedBackup | null {
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<CachedBackup>;
      return typeof parsed.createdAt === 'string' && parsed.state && typeof parsed.state === 'object'
        ? { createdAt: parsed.createdAt, pending: parsed.pending === true, state: parsed.state }
        : null;
    } catch {
      return null;
    }
  }

  private writeCache(backup: CachedBackup): void {
    try {
      window.localStorage.setItem(this.storageKey, JSON.stringify(backup));
    } catch {
      // A cópia em nuvem ainda será tentada quando houver conexão.
    }
  }
}
