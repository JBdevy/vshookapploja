import { bundledLoopBlob } from './BundledLoops';

export interface LocalTrack {
  id: string;
  name: string;
  fileName: string;
  mimeType: string;
  size: number;
  addedAt: string;
  fixedLoop?: true;
  // Versão do arquivo fixo usada pelo cache do player nativo. Ela muda quando
  // o MP3 empacotado é substituído, sem alterar o id exibido pela playlist.
  nativeAssetKey?: string;
  // Presente somente durante a reprodução por uma playlist de loop. O arquivo
  // foi preparado neste BPM e acompanha o BPM global sem afetar músicas comuns.
  loopSourceBpm?: number;
}

export type LocalPlaylistKind = 'normal' | 'loop';

export interface LocalPlaylist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: string;
  updatedAt: string;
  kind: LocalPlaylistKind;
}

export interface LocalTrackBlock {
  id: string;
  name: string;
  scopeId: string;
  sequence: number;
  createdAt: string;
}

interface StoredLocalTrack extends LocalTrack {
  accountKey: string;
  // Ausente quando o áudio vive no armazenamento nativo (storage: 'native').
  file?: Blob;
  storage?: 'native';
}

interface StoredLocalPlaylist extends LocalPlaylist {
  accountKey: string;
}

interface StoredTrackOrder {
  accountKey: string;
  trackIds: string[];
  updatedAt: string;
}

interface StoredTrackBlock extends LocalTrackBlock {
  accountKey: string;
}

interface StoredListLayout {
  id: string;
  accountKey: string;
  scopeId: string;
  itemIds: string[];
  updatedAt: string;
}

const DATABASE_NAME = 'hookkeys-track-library';
const DATABASE_VERSION = 4;
const STORE_NAME = 'tracks';
const PLAYLIST_STORE_NAME = 'playlists';
const ORDER_STORE_NAME = 'track-orders';
const BLOCK_STORE_NAME = 'track-blocks';
const LAYOUT_STORE_NAME = 'track-list-layouts';

export class TrackLibraryStore {
  private databasePromise: Promise<IDBDatabase> | null = null;
  private readonly accountKey: string;

  constructor(accountEmail: string) {
    this.accountKey = accountEmail.trim().toLowerCase();
  }

  async list(): Promise<LocalTrack[]> {
    const database = await this.openDatabase();
    const transaction = database.transaction([STORE_NAME, ORDER_STORE_NAME], 'readonly');
    const [records, savedOrder] = await Promise.all([
      requestResult<StoredLocalTrack[]>(transaction.objectStore(STORE_NAME).getAll()),
      requestResult<StoredTrackOrder | undefined>(
        transaction.objectStore(ORDER_STORE_NAME).get(this.accountKey),
      ),
    ]);
    const tracks = records
      .filter((track) => track.accountKey === this.accountKey)
      .sort((left, right) => right.addedAt.localeCompare(left.addedAt))
      .map(({ id, name, fileName, mimeType, size, addedAt }) => ({
        id, name, fileName, mimeType, size, addedAt,
      }));
    if (!savedOrder) return tracks;
    const order = new Map(savedOrder.trackIds.map((trackId, index) => [trackId, index]));
    return tracks.sort((left, right) => {
      const leftIndex = order.get(left.id);
      const rightIndex = order.get(right.id);
      if (leftIndex === undefined && rightIndex === undefined) return right.addedAt.localeCompare(left.addedAt);
      if (leftIndex === undefined) return -1;
      if (rightIndex === undefined) return 1;
      return leftIndex - rightIndex;
    });
  }

  async saveTrackOrder(trackIds: readonly string[]): Promise<void> {
    const database = await this.openDatabase();
    const order: StoredTrackOrder = {
      accountKey: this.accountKey,
      trackIds: uniqueTrackIds(trackIds),
      updatedAt: new Date().toISOString(),
    };
    await requestResult(
      database.transaction(ORDER_STORE_NAME, 'readwrite').objectStore(ORDER_STORE_NAME).put(order),
    );
  }

  async deleteAllTracks(): Promise<LocalTrack[]> {
    const tracks = await this.list();
    if (tracks.length === 0) return [];
    const deletedIds = new Set(tracks.map(({ id }) => id));
    const database = await this.openDatabase();
    const [playlists, layouts] = await Promise.all([
      requestResult<StoredLocalPlaylist[]>(
        database.transaction(PLAYLIST_STORE_NAME, 'readonly').objectStore(PLAYLIST_STORE_NAME).getAll(),
      ),
      requestResult<StoredListLayout[]>(
        database.transaction(LAYOUT_STORE_NAME, 'readonly').objectStore(LAYOUT_STORE_NAME).getAll(),
      ),
    ]);
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        [STORE_NAME, PLAYLIST_STORE_NAME, ORDER_STORE_NAME, LAYOUT_STORE_NAME],
        'readwrite',
      );
      const trackStore = transaction.objectStore(STORE_NAME);
      tracks.forEach(({ id }) => trackStore.delete(id));

      const playlistStore = transaction.objectStore(PLAYLIST_STORE_NAME);
      playlists
        .filter(({ accountKey }) => accountKey === this.accountKey)
        .forEach((playlist) => playlistStore.put({
          ...playlist,
          trackIds: playlist.trackIds.filter((trackId) => !deletedIds.has(trackId)),
          updatedAt: new Date().toISOString(),
        }));

      transaction.objectStore(ORDER_STORE_NAME).delete(this.accountKey);
      const layoutStore = transaction.objectStore(LAYOUT_STORE_NAME);
      layouts
        .filter(({ accountKey }) => accountKey === this.accountKey)
        .forEach((layout) => layoutStore.put({
          ...layout,
          itemIds: layout.itemIds.filter((itemId) => !deletedIds.has(itemId)),
          updatedAt: new Date().toISOString(),
        }));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Falha ao apagar as músicas.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Falha ao apagar as músicas.'));
    });
    return tracks;
  }

  async listBlocks(scopeId: string): Promise<LocalTrackBlock[]> {
    const database = await this.openDatabase();
    const records = await requestResult<StoredTrackBlock[]>(
      database.transaction(BLOCK_STORE_NAME, 'readonly').objectStore(BLOCK_STORE_NAME).getAll(),
    );
    return records
      .filter((block) => block.accountKey === this.accountKey && block.scopeId === scopeId)
      .sort((left, right) => left.sequence - right.sequence)
      .map(({ id, name, scopeId: storedScopeId, sequence, createdAt }) => ({
        id,
        name,
        scopeId: storedScopeId,
        sequence,
        createdAt,
      }));
  }

  async addBlock(scopeId: string): Promise<LocalTrackBlock> {
    const blocks = await this.listBlocks(scopeId);
    const sequence = blocks.reduce((highest, block) => Math.max(highest, block.sequence), 0) + 1;
    const block: StoredTrackBlock = {
      id: createId('block'),
      accountKey: this.accountKey,
      scopeId,
      sequence,
      name: `Bloco ${sequence.toString().padStart(2, '0')}`,
      createdAt: new Date().toISOString(),
    };
    const database = await this.openDatabase();
    await requestResult(
      database.transaction(BLOCK_STORE_NAME, 'readwrite').objectStore(BLOCK_STORE_NAME).put(block),
    );
    const { accountKey: _accountKey, ...localBlock } = block;
    return localBlock;
  }

  async deleteBlock(id: string): Promise<boolean> {
    const database = await this.openDatabase();
    const current = await requestResult<StoredTrackBlock | undefined>(
      database.transaction(BLOCK_STORE_NAME, 'readonly').objectStore(BLOCK_STORE_NAME).get(id),
    );
    if (!current || current.accountKey !== this.accountKey) return false;
    await requestResult(
      database.transaction(BLOCK_STORE_NAME, 'readwrite').objectStore(BLOCK_STORE_NAME).delete(id),
    );
    return true;
  }

  async renameBlock(id: string, name: string): Promise<LocalTrackBlock> {
    const normalizedName = name.trim().slice(0, 12);
    if (!normalizedName) throw new Error('block_name_required');
    const database = await this.openDatabase();
    const store = database.transaction(BLOCK_STORE_NAME, 'readonly').objectStore(BLOCK_STORE_NAME);
    const current = await requestResult<StoredTrackBlock | undefined>(store.get(id));
    if (!current || current.accountKey !== this.accountKey) throw new Error('block_not_found');
    const updated: StoredTrackBlock = { ...current, name: normalizedName };
    await requestResult(
      database.transaction(BLOCK_STORE_NAME, 'readwrite').objectStore(BLOCK_STORE_NAME).put(updated),
    );
    const { accountKey: _accountKey, ...localBlock } = updated;
    return localBlock;
  }

  async saveBlockOrder(scopeId: string, orderedItemIds: readonly string[]): Promise<LocalTrackBlock[]> {
    const blocks = await this.listBlocks(scopeId);
    const order = new Map(orderedItemIds.map((itemId, index) => [itemId, index]));
    const orderedBlocks = [...blocks].sort((left, right) => {
      const leftIndex = order.get(left.id);
      const rightIndex = order.get(right.id);
      if (leftIndex === undefined && rightIndex === undefined) return left.sequence - right.sequence;
      if (leftIndex === undefined) return 1;
      if (rightIndex === undefined) return -1;
      return leftIndex - rightIndex;
    });
    const updatedBlocks = orderedBlocks.map((block, index) => ({
      ...block,
      sequence: index + 1,
    }));
    if (updatedBlocks.length === 0) return [];

    const database = await this.openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(BLOCK_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(BLOCK_STORE_NAME);
      updatedBlocks.forEach((block) => store.put({ ...block, accountKey: this.accountKey }));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Falha ao ordenar os blocos.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Falha ao ordenar os blocos.'));
    });
    return updatedBlocks;
  }

  async getListLayout(scopeId: string): Promise<string[]> {
    const database = await this.openDatabase();
    const record = await requestResult<StoredListLayout | undefined>(
      database.transaction(LAYOUT_STORE_NAME, 'readonly').objectStore(LAYOUT_STORE_NAME).get(this.layoutId(scopeId)),
    );
    return record?.accountKey === this.accountKey ? [...record.itemIds] : [];
  }

  async saveListLayout(scopeId: string, itemIds: readonly string[]): Promise<void> {
    const record: StoredListLayout = {
      id: this.layoutId(scopeId),
      accountKey: this.accountKey,
      scopeId,
      itemIds: uniqueTrackIds(itemIds),
      updatedAt: new Date().toISOString(),
    };
    const database = await this.openDatabase();
    await requestResult(
      database.transaction(LAYOUT_STORE_NAME, 'readwrite').objectStore(LAYOUT_STORE_NAME).put(record),
    );
  }

  async addFiles(files: readonly File[]): Promise<LocalTrack[]> {
    if (files.length === 0) return [];
    const now = Date.now();
    const records: StoredLocalTrack[] = files.map((file, index) => ({
      id: createId(),
      accountKey: this.accountKey,
      name: trackNameFromFile(file.name),
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      addedAt: new Date(now + index).toISOString(),
      file,
    }));
    const database = await this.openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      records.forEach((record) => store.put(record));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Falha ao adicionar músicas.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Falha ao adicionar músicas.'));
    });
    return records;
  }

  /**
   * Registra uma música que já foi guardada pelo motor nativo.
   * No iOS o áudio real fica em Application Support/Tracks e o registro não
   * leva Blob nenhum: gravar Blob no IndexedDB do WKWebView é o ponto que
   * falha em alguns aparelhos e fazia a música sumir da lista.
   */
  async addNativeFile(file: {
    id: string;
    name: string;
    mimeType: string;
    size: number;
  }): Promise<LocalTrack> {
    const record: StoredLocalTrack = {
      id: file.id,
      accountKey: this.accountKey,
      name: trackNameFromFile(file.name),
      fileName: file.name,
      mimeType: file.mimeType || 'application/octet-stream',
      size: Math.max(0, file.size),
      addedAt: new Date().toISOString(),
      storage: 'native',
    };
    const database = await this.openDatabase();
    await requestResult(
      database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(record),
    );
    const { accountKey: _accountKey, storage: _storage, ...track } = record;
    return track;
  }

  async getFile(trackId: string): Promise<Blob | null> {
    const bundledLoop = await bundledLoopBlob(trackId);
    if (bundledLoop) return bundledLoop;
    const database = await this.openDatabase();
    const record = await requestResult<StoredLocalTrack | undefined>(
      database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(trackId),
    );
    if (record?.accountKey !== this.accountKey) return null;
    // O motor nativo lê o arquivo pelo id; o Blob vazio só cumpre o contrato.
    if (record.storage === 'native') return new Blob([], { type: record.mimeType });
    return record.file ?? null;
  }

  async listPlaylists(): Promise<LocalPlaylist[]> {
    const database = await this.openDatabase();
    const records = await requestResult<StoredLocalPlaylist[]>(
      database.transaction(PLAYLIST_STORE_NAME, 'readonly').objectStore(PLAYLIST_STORE_NAME).getAll(),
    );
    return records
      .filter((playlist) => playlist.accountKey === this.accountKey)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(({ id, name, trackIds, createdAt, updatedAt, kind }) => ({
        id, name, trackIds: [...trackIds], createdAt, updatedAt,
        kind: kind === 'loop' ? 'loop' : 'normal',
      }));
  }

  async createPlaylist(
    name: string,
    trackIds: readonly string[],
    kind: LocalPlaylistKind = 'normal',
  ): Promise<LocalPlaylist> {
    const now = new Date().toISOString();
    const playlist: StoredLocalPlaylist = {
      id: createId('playlist'),
      accountKey: this.accountKey,
      name: normalizePlaylistName(name),
      trackIds: uniqueTrackIds(trackIds),
      createdAt: now,
      updatedAt: now,
      kind,
    };
    await this.putPlaylist(playlist);
    return playlist;
  }

  async updatePlaylist(
    id: string,
    name: string,
    trackIds: readonly string[],
    kind: LocalPlaylistKind = 'normal',
  ): Promise<LocalPlaylist> {
    const playlists = await this.listPlaylists();
    const current = playlists.find((playlist) => playlist.id === id);
    if (!current) throw new Error('playlist_not_found');
    const playlist: StoredLocalPlaylist = {
      ...current,
      accountKey: this.accountKey,
      name: normalizePlaylistName(name),
      trackIds: uniqueTrackIds(trackIds),
      updatedAt: new Date().toISOString(),
      kind,
    };
    await this.putPlaylist(playlist);
    return playlist;
  }

  async deletePlaylist(id: string): Promise<boolean> {
    const database = await this.openDatabase();
    const current = await requestResult<StoredLocalPlaylist | undefined>(
      database.transaction(PLAYLIST_STORE_NAME, 'readonly').objectStore(PLAYLIST_STORE_NAME).get(id),
    );
    if (!current || current.accountKey !== this.accountKey) return false;
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(PLAYLIST_STORE_NAME, 'readwrite');
      transaction.objectStore(PLAYLIST_STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Falha ao apagar a playlist.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Falha ao apagar a playlist.'));
    });
    await this.deletePlaylistLayout(id);
    return true;
  }

  private async deletePlaylistLayout(scopeId: string): Promise<void> {
    const database = await this.openDatabase();
    const blocks = await requestResult<StoredTrackBlock[]>(
      database.transaction(BLOCK_STORE_NAME, 'readonly').objectStore(BLOCK_STORE_NAME).getAll(),
    );
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([BLOCK_STORE_NAME, LAYOUT_STORE_NAME], 'readwrite');
      const blockStore = transaction.objectStore(BLOCK_STORE_NAME);
      blocks
        .filter((block) => block.accountKey === this.accountKey && block.scopeId === scopeId)
        .forEach((block) => blockStore.delete(block.id));
      transaction.objectStore(LAYOUT_STORE_NAME).delete(this.layoutId(scopeId));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Falha ao limpar a playlist.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Falha ao limpar a playlist.'));
    });
  }

  private layoutId(scopeId: string): string {
    return `${this.accountKey}::${scopeId}`;
  }

  private async putPlaylist(playlist: StoredLocalPlaylist): Promise<void> {
    const database = await this.openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(PLAYLIST_STORE_NAME, 'readwrite');
      transaction.objectStore(PLAYLIST_STORE_NAME).put(playlist);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Falha ao salvar a playlist.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Falha ao salvar a playlist.'));
    });
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
        if (!request.result.objectStoreNames.contains(PLAYLIST_STORE_NAME)) {
          request.result.createObjectStore(PLAYLIST_STORE_NAME, { keyPath: 'id' });
        }
        if (!request.result.objectStoreNames.contains(ORDER_STORE_NAME)) {
          request.result.createObjectStore(ORDER_STORE_NAME, { keyPath: 'accountKey' });
        }
        if (!request.result.objectStoreNames.contains(BLOCK_STORE_NAME)) {
          request.result.createObjectStore(BLOCK_STORE_NAME, { keyPath: 'id' });
        }
        if (!request.result.objectStoreNames.contains(LAYOUT_STORE_NAME)) {
          request.result.createObjectStore(LAYOUT_STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Falha ao abrir a biblioteca de músicas.'));
      request.onblocked = () => reject(new Error('A biblioteca de músicas está ocupada.'));
    });
    return this.databasePromise;
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Falha ao ler a biblioteca de músicas.'));
  });
}

function trackNameFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim().slice(0, 80) || 'Música';
}

function normalizePlaylistName(name: string): string {
  const normalized = name.trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!normalized) throw new Error('playlist_name_required');
  return normalized;
}

function uniqueTrackIds(trackIds: readonly string[]): string[] {
  return [...new Set(trackIds.filter((id) => typeof id === 'string' && id.length > 0))];
}

function createId(prefix = 'track'): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
