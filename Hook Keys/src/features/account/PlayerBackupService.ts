import { hookKeysNative } from '../../platform/native/HookKeysNative';

interface BackupDocument {
  format: 'hook-keys-backup';
  version: number;
  createdAt: string;
  accountEmail?: string;
  state: unknown;
}

export interface BackupResult {
  createdAt: string;
  fileName: string;
  saved: boolean;
}

const MAX_BACKUP_FILE_BYTES = 16 * 1024 * 1024;

export class PlayerBackupService {
  private snapshotProvider: (() => unknown) | null = null;
  private readonly accountEmail: string;

  constructor(
    accountEmail: string,
    private readonly accountName?: string | (() => string | undefined),
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
    const createdAt = new Date().toISOString();
    const fileName = `${this.backupUserName()}HK.json`;
    const content = JSON.stringify({
      format: 'hook-keys-backup', version: 2, createdAt, state: snapshot,
    } satisfies BackupDocument, null, 2);
    if (new TextEncoder().encode(content).byteLength > MAX_BACKUP_FILE_BYTES) {
      throw new Error('backup_file_too_large');
    }
    const nativeSaved = await hookKeysNative.saveBackup(fileName, content);
    if (nativeSaved !== null) return { createdAt, fileName, saved: nativeSaved };
    return { createdAt, fileName, saved: await saveBackupInBrowser(fileName, content) };
  }

  async restore(file: File): Promise<unknown> {
    if (!file.name.toLowerCase().endsWith('.json') || file.size <= 0 || file.size > MAX_BACKUP_FILE_BYTES) {
      throw new Error('invalid_backup_file');
    }
    const parsed = JSON.parse(await file.text()) as Partial<BackupDocument>;
    if (
      parsed.format !== 'hook-keys-backup'
      || (parsed.version !== 1 && parsed.version !== 2)
      || typeof parsed.createdAt !== 'string'
      || (parsed.version === 1 && (
        typeof parsed.accountEmail !== 'string'
        || parsed.accountEmail.trim().toLowerCase() !== this.accountEmail
      ))
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

  private backupUserName(): string {
    const suppliedName = typeof this.accountName === 'function' ? this.accountName() : this.accountName;
    const emailName = this.accountEmail.split('@')[0] ?? '';
    const candidate = suppliedName?.trim() || emailName.trim() || 'User';
    // Mantém letras, espaços e acentos, removendo somente caracteres proibidos
    // em nomes de arquivo no Windows e caracteres de controle.
    const safeName = candidate
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
      .replace(/[. ]+$/g, '')
      .slice(0, 100)
      .trim();
    return safeName || 'User';
  }
}

async function saveBackupInBrowser(fileName: string, content: string): Promise<boolean> {
  const picker = (window as Window & {
    showSaveFilePicker?: (options: unknown) => Promise<{
      createWritable(): Promise<{ write(value: string): Promise<void>; close(): Promise<void> }>;
    }>;
  }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: fileName,
        types: [{ description: 'Backup Hook Keys', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return false;
      throw error;
    }
  }
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  return true;
}
