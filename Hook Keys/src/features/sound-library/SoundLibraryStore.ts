export interface UserSoundfont {
  id: string;
  name: string;
  fileName: string;
  size: number;
  createdAt: string;
  colorIndex: number;
}

export interface InstalledFixedSound {
  soundId: string;
  file: Blob;
  byteSize: number;
  sha256: string;
  catalogVersion: number;
  installedAt: string;
}

export interface CachedSoundPreview {
  soundId: string;
  file: Blob;
  catalogVersion: number;
  sourceKey: string;
  savedAt: string;
}

interface StoredUserSoundfont extends UserSoundfont {
  accountKey: string;
  file: Blob;
  createdOrder?: number;
}

interface StoredFixedSound extends InstalledFixedSound {
  storageKey: string;
  accountKey: string;
}

interface StoredSoundPreview extends CachedSoundPreview {
  storageKey: string;
  accountKey: string;
}

const DATABASE_NAME = 'hookkeys-user-audio';
const DATABASE_VERSION = 3;
const USER_STORE_NAME = 'soundfonts';
const FIXED_STORE_NAME = 'fixed-soundfonts';
const PREVIEW_STORE_NAME = 'sound-previews';
export const USER_SOUNDFONT_COLOR_COUNT = 16;

export class SoundLibraryStore {
  private databasePromise: Promise<IDBDatabase> | null = null;
  private readonly accountKey: string;

  constructor(accountEmail: string) {
    this.accountKey = accountEmail.trim().toLowerCase();
  }

  async listUser(): Promise<UserSoundfont[]> {
    const records = await this.readAll<StoredUserSoundfont>(USER_STORE_NAME);
    return records
      .filter((record) => record.accountKey === this.accountKey)
      // Novos SF2 entram depois dos já existentes, preservando a ordem em que
      // o usuário montou a biblioteca.
      .sort((left, right) => storedCreationOrder(left) - storedCreationOrder(right) || left.id.localeCompare(right.id))
      .map(({ id, name, fileName, size, createdAt, colorIndex }) => ({
        id,
        name,
        fileName,
        size,
        createdAt,
        colorIndex: Number.isInteger(colorIndex)
          ? Math.abs(colorIndex) % USER_SOUNDFONT_COLOR_COUNT
          : stableColorIndex(id),
      }));
  }

  async addUser(name: string, file: File, restoredId?: string): Promise<UserSoundfont> {
    const existing = (await this.readAll<StoredUserSoundfont>(USER_STORE_NAME))
      .filter((record) => record.accountKey === this.accountKey);
    const createdOrder = Math.max(
      Date.now() * 1000,
      existing.reduce((latest, record) => Math.max(latest, storedCreationOrder(record) + 1), 0),
    );
    const soundfont: StoredUserSoundfont = {
      id: restoredId?.trim().slice(0, 200) || createId(),
      accountKey: this.accountKey,
      name: name.trim().slice(0, 120),
      fileName: file.name,
      size: file.size,
      createdAt: new Date().toISOString(),
      createdOrder,
      colorIndex: randomColorIndex(),
      file,
    };
    await this.put(USER_STORE_NAME, soundfont);
    return soundfont;
  }

  async getUserFile(id: string): Promise<Blob | null> {
    const database = await this.openDatabase();
    const record = await requestResult<StoredUserSoundfont | undefined>(
      database.transaction(USER_STORE_NAME, 'readonly').objectStore(USER_STORE_NAME).get(id),
    );
    return record?.accountKey === this.accountKey ? record.file : null;
  }

  async removeUser(id: string): Promise<boolean> {
    const database = await this.openDatabase();
    const existing = await requestResult<StoredUserSoundfont | undefined>(
      database.transaction(USER_STORE_NAME, 'readonly').objectStore(USER_STORE_NAME).get(id),
    );
    if (!existing || existing.accountKey !== this.accountKey) return false;
    await transactionComplete(database, USER_STORE_NAME, 'readwrite', (store) => store.delete(id));
    return true;
  }

  async listInstalledFixedIds(): Promise<Set<string>> {
    const records = await this.readAll<StoredFixedSound>(FIXED_STORE_NAME);
    return new Set(
      records.filter((record) => record.accountKey === this.accountKey).map((record) => record.soundId),
    );
  }

  async getFixed(soundId: string): Promise<InstalledFixedSound | null> {
    const database = await this.openDatabase();
    const record = await requestResult<StoredFixedSound | undefined>(
      database.transaction(FIXED_STORE_NAME, 'readonly')
        .objectStore(FIXED_STORE_NAME)
        .get(this.fixedStorageKey(soundId)),
    );
    if (!record) return null;
    const { file, byteSize, sha256, catalogVersion, installedAt } = record;
    return { soundId, file, byteSize, sha256, catalogVersion, installedAt };
  }

  async installFixed(sound: InstalledFixedSound): Promise<void> {
    const record: StoredFixedSound = {
      ...sound,
      storageKey: this.fixedStorageKey(sound.soundId),
      accountKey: this.accountKey,
    };
    await this.put(FIXED_STORE_NAME, record);
  }

  async removeFixed(soundId: string): Promise<boolean> {
    const database = await this.openDatabase();
    const storageKey = this.fixedStorageKey(soundId);
    const existing = await requestResult<StoredFixedSound | undefined>(
      database.transaction(FIXED_STORE_NAME, 'readonly').objectStore(FIXED_STORE_NAME).get(storageKey),
    );
    if (!existing) return false;
    await transactionComplete(database, FIXED_STORE_NAME, 'readwrite', (store) => store.delete(storageKey));
    return true;
  }

  async getPreview(soundId: string): Promise<CachedSoundPreview | null> {
    const database = await this.openDatabase();
    const record = await requestResult<StoredSoundPreview | undefined>(
      database.transaction(PREVIEW_STORE_NAME, 'readonly')
        .objectStore(PREVIEW_STORE_NAME)
        .get(this.fixedStorageKey(soundId)),
    );
    if (!record || record.accountKey !== this.accountKey) return null;
    const { file, catalogVersion, sourceKey, savedAt } = record;
    return { soundId, file, catalogVersion, sourceKey, savedAt };
  }

  async savePreview(preview: CachedSoundPreview): Promise<void> {
    const record: StoredSoundPreview = {
      ...preview,
      storageKey: this.fixedStorageKey(preview.soundId),
      accountKey: this.accountKey,
    };
    await this.put(PREVIEW_STORE_NAME, record);
  }

  private fixedStorageKey(soundId: string): string {
    return `${this.accountKey}\u0000${soundId}`;
  }

  private async readAll<T>(storeName: string): Promise<T[]> {
    const database = await this.openDatabase();
    return requestResult<T[]>(database.transaction(storeName, 'readonly').objectStore(storeName).getAll());
  }

  private async put(storeName: string, value: unknown): Promise<void> {
    const database = await this.openDatabase();
    await transactionComplete(database, storeName, 'readwrite', (store) => store.put(value));
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(USER_STORE_NAME)) {
          request.result.createObjectStore(USER_STORE_NAME, { keyPath: 'id' });
        }
        if (!request.result.objectStoreNames.contains(FIXED_STORE_NAME)) {
          request.result.createObjectStore(FIXED_STORE_NAME, { keyPath: 'storageKey' });
        }
        if (!request.result.objectStoreNames.contains(PREVIEW_STORE_NAME)) {
          request.result.createObjectStore(PREVIEW_STORE_NAME, { keyPath: 'storageKey' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Falha ao abrir a biblioteca local.'));
      request.onblocked = () => reject(new Error('A biblioteca local está ocupada.'));
    });
    return this.databasePromise;
  }
}

function storedCreationOrder(soundfont: Pick<StoredUserSoundfont, 'createdAt' | 'createdOrder'>): number {
  if (Number.isSafeInteger(soundfont.createdOrder) && (soundfont.createdOrder ?? 0) > 0) {
    return soundfont.createdOrder!;
  }
  const timestamp = Date.parse(soundfont.createdAt);
  return Number.isFinite(timestamp) ? timestamp * 1000 : 0;
}

function transactionComplete(
  database: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    action(transaction.objectStore(storeName));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Falha ao salvar a biblioteca.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Falha ao salvar a biblioteca.'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Falha ao ler a biblioteca.'));
  });
}

function createId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `sf2-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function randomColorIndex(): number {
  const random = new Uint32Array(1);
  globalThis.crypto?.getRandomValues?.(random);
  return (random[0] ?? Math.floor(Math.random() * 0xffffffff)) % USER_SOUNDFONT_COLOR_COUNT;
}

function stableColorIndex(id: string): number {
  let hash = 2166136261;
  for (const character of id) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % USER_SOUNDFONT_COLOR_COUNT;
}
