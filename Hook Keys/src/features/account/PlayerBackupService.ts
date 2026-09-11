import type { AccountApi } from './AccountApi';

interface BackupDocument {
  format: 'hook-keys-backup';
  version: number;
  createdAt: string;
  accountEmail: string;
  state: unknown;
}

export interface BackupResult {
  createdAt: string;
  emailedTo: string;
}

const MAX_BACKUP_FILE_BYTES = 1024 * 1024;

export class PlayerBackupService {
  private snapshotProvider: (() => unknown) | null = null;
  private readonly accountEmail: string;

  constructor(
    private readonly api: AccountApi,
    private readonly token: string,
    accountEmail: string,
  ) {
    this.accountEmail = accountEmail.trim().toLowerCase();
  }

  start(snapshotProvider: () => unknown): void {
    this.snapshotProvider = snapshotProvider;
  }

  async backupNow(state?: unknown): Promise<BackupResult> {
    const snapshot = state ?? this.snapshotProvider?.();
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      throw new Error('backup_state_unavailable');
    }
    if (!navigator.onLine) throw new Error('backup_requires_connection');
    const response = await this.api.emailPlayerBackup(this.token, snapshot);
    return { createdAt: response.createdAt, emailedTo: response.emailedTo };
  }

  async restore(file: File): Promise<unknown> {
    if (!file.name.toLowerCase().endsWith('.json') || file.size <= 0 || file.size > MAX_BACKUP_FILE_BYTES) {
      throw new Error('invalid_backup_file');
    }
    const parsed = JSON.parse(await file.text()) as Partial<BackupDocument>;
    if (
      parsed.format !== 'hook-keys-backup'
      || parsed.version !== 1
      || typeof parsed.createdAt !== 'string'
      || typeof parsed.accountEmail !== 'string'
      || parsed.accountEmail.trim().toLowerCase() !== this.accountEmail
      || !parsed.state
      || typeof parsed.state !== 'object'
      || Array.isArray(parsed.state)
    ) {
      throw new Error('invalid_backup_document');
    }
    return parsed.state;
  }

  destroy(): void {
    this.snapshotProvider = null;
  }
}
