import type { EffectBankId } from '../player/PadsEffectsView';

interface StoredEffectAudio {
  id: string;
  accountKey: string;
  bank: EffectBankId;
  effectNumber: number;
  fileName: string;
  mimeType: string;
  file: Blob;
}

const DATABASE_NAME = 'hookkeys-effect-audio';
const DATABASE_VERSION = 1;
const STORE_NAME = 'effects';

export class EffectAudioStore {
  private databasePromise: Promise<IDBDatabase> | null = null;
  private readonly accountKey: string;

  constructor(accountEmail: string) {
    this.accountKey = accountEmail.trim().toLowerCase();
  }

  async save(bank: EffectBankId, effectNumber: number, file: File): Promise<void> {
    if (!isSupportedEffectFile(file)) throw new Error('unsupported_effect_file');
    const record: StoredEffectAudio = {
      id: this.idFor(bank, effectNumber),
      accountKey: this.accountKey,
      bank,
      effectNumber,
      fileName: file.name.slice(0, 180),
      mimeType: file.type || 'application/octet-stream',
      file,
    };
    const database = await this.openDatabase();
    await transactionComplete(database, (store) => store.put(record));
  }

  async get(bank: EffectBankId, effectNumber: number): Promise<Blob | null> {
    const database = await this.openDatabase();
    const record = await requestResult<StoredEffectAudio | undefined>(
      database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(this.idFor(bank, effectNumber)),
    );
    return record?.accountKey === this.accountKey ? record.file : null;
  }

  private idFor(bank: EffectBankId, effectNumber: number): string {
    return `${this.accountKey}:${bank}:${effectNumber}`;
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('effect_audio_database_failed'));
      request.onblocked = () => reject(new Error('effect_audio_database_blocked'));
    });
    return this.databasePromise;
  }
}

export function isSupportedEffectFile(file: File): boolean {
  const extension = file.name.split('.').pop()?.toLowerCase();
  return extension === 'wav' || extension === 'wave' || extension === 'aif'
    || extension === 'aiff' || extension === 'mp3';
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('effect_audio_read_failed'));
  });
}

function transactionComplete(
  database: IDBDatabase,
  operation: (store: IDBObjectStore) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    operation(transaction.objectStore(STORE_NAME));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('effect_audio_write_failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('effect_audio_write_failed'));
  });
}
