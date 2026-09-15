import {
  applyOnScreenKey,
  createOnScreenKeyboardMarkup,
  resolveOnScreenKey,
} from '../../shared/ui/OnScreenKeyboard';
import {
  TrackLibraryStore,
  type LocalPlaylist,
  type LocalTrack,
  type LocalTrackBlock,
} from './TrackLibraryStore';
import type { TrackPlaybackSnapshot } from './TrackTransport';
import { Capacitor } from '@capacitor/core';
import { isDesktopRuntime } from '../../platform/runtime';

interface PlaylistDraft {
  id: string | null;
  name: string;
  trackIds: Set<string>;
}

interface HoldGesture {
  target: HTMLElement;
  pointerId: number;
  startX: number;
  startY: number;
  timer: number;
}

interface TrackReorderGesture {
  card: HTMLElement;
  grid: HTMLElement;
  pointerId: number;
}

type TrackListItem =
  | { kind: 'track'; id: string; track: LocalTrack }
  | { kind: 'block'; id: string; block: LocalTrackBlock };

interface TracksPanelOptions {
  autoEnabled?: boolean;
  loopEnabled?: boolean;
  getPlaybackSnapshot?: () => TrackPlaybackSnapshot;
  onAutoEnabledChanged?: (enabled: boolean) => void;
  onLoopEnabledChanged?: (enabled: boolean) => void;
  // Devolve true quando o app abre o próprio gerenciador de arquivos.
  onAddMusicRequested?: (trigger: HTMLElement) => boolean;
  onTrackSelected?: (track: LocalTrack) => void;
  onVisibleTracksChanged?: (tracks: LocalTrack[]) => void;
}

const PLAYLIST_NAME_LIMIT = 40;
const TRACK_FILE_EXTENSIONS = ['.mp3', '.wav', '.wave', '.m4a', '.aac', '.flac', '.ogg', '.aif', '.aiff'];

// No iOS/Android, o curinga audio/* abre o menu de câmera e fotos. Pedir um
// documento (octet-stream) abre direto o seletor de arquivos, como no SF2.
export function trackFileAccept(native = Capacitor.isNativePlatform()): string {
  return `${native ? 'application/octet-stream' : 'audio/*'},${TRACK_FILE_EXTENSIONS.join(',')}`;
}

const TRACK_AUDIO_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg', wav: 'audio/wav', wave: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac',
  flac: 'audio/flac', ogg: 'audio/ogg', aif: 'audio/aiff', aiff: 'audio/aiff',
};

export function audioTypeForFileName(name: string): string {
  return TRACK_AUDIO_TYPES[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
}

export function isTrackAudioFile(file: Pick<File, 'name' | 'type'>): boolean {
  const name = file.name.toLowerCase();
  return file.type.startsWith('audio/') || TRACK_FILE_EXTENSIONS.some((extension) => name.endsWith(extension));
}
const BLOCK_NAME_LIMIT = 12;

function createTrackImportLoadingMarkup(): string {
  return `
    <div class="tracks-import-loading" data-tracks-import-loading role="status" aria-live="polite" hidden>
      <strong data-tracks-import-loading-label>Adicionando músicas...</strong>
      <span class="tracks-import-loading__bar" aria-hidden="true"><i></i></span>
    </div>
  `;
}

export function createTracksPanelMarkup(): string {
  return `
    <section class="tracks-tools-panel" aria-label="Opções de músicas">
      <div class="tracks-browser" data-tracks-browser>
        <nav class="tracks-playlists" aria-label="Playlists">
          <button class="is-selected" type="button" data-tracks-action="show-all" aria-pressed="true">All</button>
          <span class="tracks-playlists__divider" aria-hidden="true"></span>
          <div data-track-playlists></div>
        </nav>
        <div class="tracks-library-grid" data-tracks-library aria-label="Músicas adicionadas"></div>
      </div>
      <input type="file" accept="${trackFileAccept()}" multiple="multiple" data-tracks-file hidden>
      <p class="tracks-tools-panel__message" data-tracks-message role="status" aria-live="polite"></p>
      <section class="tracks-playlist-editor" data-playlist-editor aria-live="polite" hidden></section>
      ${createTrackImportLoadingMarkup()}
    </section>
  `;
}

export function createTracksSplitPanelMarkup(): string {
  return `
    <aside class="tracks-split-panel" aria-label="Playlist">
      <div class="tracks-split-panel__top">
        <button class="tracks-split-active-set" type="button" data-tracks-active-set data-tracks-action="toggle-set-menu" aria-expanded="false">All</button>
        <div class="tracks-split-controls" aria-label="Controles da lista">
          <button type="button" data-tracks-action="toggle-loop" aria-pressed="false" aria-label="Repetir música"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg></button>
          <button type="button" data-tracks-action="toggle-auto" aria-pressed="false">Auto</button>
          <button type="button" data-tracks-action="add-bl">Add-BL</button>
          <button type="button" data-tracks-action="toggle-edit" aria-pressed="false">Edit</button>
        </div>
      </div>
      <nav class="tracks-playlists" data-tracks-set-menu aria-label="Sets" hidden>
        <button class="is-selected" type="button" data-tracks-action="show-all" aria-pressed="true">All</button>
        <span class="tracks-playlists__divider" aria-hidden="true"></span>
        <div data-track-playlists></div>
      </nav>
      <div class="tracks-library-grid" data-tracks-library aria-label="Músicas"></div>
      <p class="tracks-tools-panel__message" data-tracks-message role="status" aria-live="polite"></p>
      <section class="tracks-playlist-editor" data-playlist-editor aria-live="polite" hidden></section>
      ${createTrackImportLoadingMarkup()}
    </aside>
  `;
}

export class TracksPanelController {
  private readonly handleClick = (event: Event) => this.onClick(event);
  private readonly handleChange = (event: Event) => this.onChange(event);
  private readonly handleInput = (event: Event) => this.onInput(event);
  private readonly handlePointerDown = (event: PointerEvent) => this.onPointerDown(event);
  private readonly handlePointerMove = (event: PointerEvent) => this.onPointerMove(event);
  private readonly handlePointerEnd = (event: PointerEvent) => this.onPointerEnd(event);
  private readonly handleContextMenu = (event: MouseEvent) => this.onContextMenu(event);
  private activePlaylistId: string | null = null;
  private draft: PlaylistDraft | null = null;
  private holdGesture: HoldGesture | null = null;
  private reorderGesture: TrackReorderGesture | null = null;
  private suppressNextPlaylistClick = false;
  private managedBlockId: string | null = null;
  private managedBlockNameDraft = '';
  private autoEnabled: boolean;
  private loopEnabled: boolean;
  private editMode = false;
  private setMenuOpen = false;
  private tracks: LocalTrack[] = [];
  private playlists: LocalPlaylist[] = [];
  private readonly blocksByScope = new Map<string, LocalTrackBlock[]>();
  private readonly layoutsByScope = new Map<string, string[]>();

  constructor(
    private readonly root: HTMLElement,
    private readonly library: TrackLibraryStore,
    private readonly options: TracksPanelOptions = {},
  ) {
    this.autoEnabled = options.autoEnabled ?? false;
    this.loopEnabled = options.loopEnabled ?? false;
  }

  mount(): void {
    this.root.addEventListener('click', this.handleClick);
    this.root.addEventListener('change', this.handleChange);
    this.root.addEventListener('input', this.handleInput);
    this.root.addEventListener('pointerdown', this.handlePointerDown);
    this.root.addEventListener('pointermove', this.handlePointerMove);
    this.root.addEventListener('pointerup', this.handlePointerEnd);
    this.root.addEventListener('pointercancel', this.handlePointerEnd);
    this.root.addEventListener('contextmenu', this.handleContextMenu);
    void this.refresh();
  }

  destroy(): void {
    this.clearHoldGesture();
    this.clearReorderGesture();
    this.root.removeEventListener('click', this.handleClick);
    this.root.removeEventListener('change', this.handleChange);
    this.root.removeEventListener('input', this.handleInput);
    this.root.removeEventListener('pointerdown', this.handlePointerDown);
    this.root.removeEventListener('pointermove', this.handlePointerMove);
    this.root.removeEventListener('pointerup', this.handlePointerEnd);
    this.root.removeEventListener('pointercancel', this.handlePointerEnd);
    this.root.removeEventListener('contextmenu', this.handleContextMenu);
  }

  private onClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const keyButton = target.closest<HTMLButtonElement>('button[data-on-screen-key]');
    const nameField = target.closest<HTMLElement>('[data-playlist-name-field], [data-block-name-field]');
    if (nameField && this.root.contains(nameField)) {
      this.setNameKeyboardOpen(true, nameField);
      return;
    }
    if (!keyButton) this.setNameKeyboardOpen(false);

    const rawKey = keyButton?.dataset.onScreenKey;
    if (keyButton && rawKey && (this.draft || this.managedBlockId)) {
      const key = resolveOnScreenKey(keyButton, rawKey);
      if (this.managedBlockId && !this.draft) {
        if (key === 'enter') void this.saveManagedBlockName();
        else if (key) {
          this.managedBlockNameDraft = applyOnScreenKey(this.managedBlockNameDraft, key, BLOCK_NAME_LIMIT);
          this.renderManagedBlockName();
          this.clearMessage();
        }
      } else if (key === 'enter') {
        this.setNameKeyboardOpen(false);
        this.openTrackSelector();
      }
      else if (key) {
        const draft = this.draft;
        if (!draft) return;
        draft.name = applyOnScreenKey(draft.name, key, PLAYLIST_NAME_LIMIT);
        this.renderDraftName();
        this.clearMessage();
      }
      return;
    }

    const trackToggle = target.closest<HTMLButtonElement>('button[data-playlist-track-id]');
    if (trackToggle && this.draft) {
      const trackId = trackToggle.dataset.playlistTrackId;
      if (!trackId) return;
      if (this.draft.trackIds.has(trackId)) this.draft.trackIds.delete(trackId);
      else this.draft.trackIds.add(trackId);
      const selected = this.draft.trackIds.has(trackId);
      trackToggle.classList.toggle('is-selected', selected);
      trackToggle.setAttribute('aria-pressed', String(selected));
      return;
    }

    const trackButton = target.closest<HTMLButtonElement>('button[data-track-id]');
    if (trackButton) {
      if (this.editMode && this.root.matches('.tracks-split-panel')) return;
      const track = this.tracks.find(({ id }) => id === trackButton.dataset.trackId);
      if (!track) return;
      this.options.onTrackSelected?.(track);
      return;
    }

    const playlistButton = target.closest<HTMLButtonElement>('button[data-playlist-id]');
    if (playlistButton) {
      if (this.suppressNextPlaylistClick) {
        this.suppressNextPlaylistClick = false;
        return;
      }
      this.activePlaylistId = playlistButton.dataset.playlistId ?? null;
      this.setSetMenuOpen(false);
      this.renderLibrary();
      this.renderPlaylists();
      return;
    }

    const action = target.closest<HTMLButtonElement>('button[data-tracks-action]')?.dataset.tracksAction;
    if (!action) return;
    if (action === 'add-music') {
      const trigger = target.closest<HTMLElement>('[data-tracks-action="add-music"]');
      if (trigger && this.options.onAddMusicRequested?.(trigger)) return;
      this.root.querySelector<HTMLInputElement>('[data-tracks-file]')?.click();
    } else if (action === 'create-playlist') {
      this.openNameEditor(null);
    } else if (action === 'show-all') {
      this.activePlaylistId = null;
      this.setSetMenuOpen(false);
      this.renderLibrary();
      this.renderPlaylists();
    } else if (action === 'toggle-set-menu') {
      this.setSetMenuOpen(!this.setMenuOpen);
    } else if (action === 'add-bl') {
      void this.addBlock();
    } else if (action === 'toggle-loop') {
      this.loopEnabled = !this.loopEnabled;
      this.renderSplitControlState();
      this.options.onLoopEnabledChanged?.(this.loopEnabled);
    } else if (action === 'toggle-auto') {
      this.autoEnabled = !this.autoEnabled;
      this.renderSplitControlState();
      this.options.onAutoEnabledChanged?.(this.autoEnabled);
    } else if (action === 'toggle-edit') {
      this.editMode = !this.editMode;
      this.root.classList.toggle('is-track-editing', this.editMode);
      this.renderSplitControlState();
      this.renderLibrary();
    } else if (action === 'playlist-editor-cancel') {
      this.closeEditor();
    } else if (action === 'playlist-name-next') {
      this.openTrackSelector();
    } else if (action === 'playlist-selector-back') {
      this.renderNameEditor();
    } else if (action === 'playlist-save') {
      void this.saveDraft();
    } else if (action === 'playlist-manage-edit') {
      this.openTrackSelector();
    } else if (action === 'playlist-manage-delete') {
      this.renderDeleteConfirmation();
    } else if (action === 'playlist-delete-cancel' && this.draft?.id) {
      this.openPlaylistManager(this.draft.id);
    } else if (action === 'playlist-delete-confirm') {
      void this.deleteDraftPlaylist();
    } else if (action === 'block-delete-cancel') {
      this.closeEditor();
    } else if (action === 'block-delete-confirm') {
      void this.deleteManagedBlock();
    } else if (action === 'block-rename') {
      this.renderBlockNameEditor();
    } else if (action === 'block-rename-cancel') {
      if (this.managedBlockId) this.openBlockManager(this.managedBlockId);
    } else if (action === 'block-rename-save') {
      void this.saveManagedBlockName();
    }
  }

  private onChange(event: Event): void {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.matches('[data-tracks-file]')) {
      void this.importTracks(input);
    }
  }

  private onInput(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !isDesktopRuntime()) return;
    if (input.matches('[data-playlist-name-input]') && this.draft) {
      this.draft.name = input.value.slice(0, PLAYLIST_NAME_LIMIT);
      return;
    }
    if (input.matches('[data-block-name-input]') && this.managedBlockId) {
      this.managedBlockNameDraft = input.value.slice(0, BLOCK_NAME_LIMIT);
    }
  }

  private onPointerDown(event: PointerEvent): void {
    const target = event.target;
    const track = target instanceof Element
      ? target.closest<HTMLElement>('[data-list-item-id]')
      : null;
    if (track && this.editMode && this.root.matches('.tracks-split-panel')) {
      const grid = track.closest<HTMLElement>('[data-tracks-library]');
      if (!grid) return;
      event.preventDefault();
      this.clearHoldGesture();
      this.clearReorderGesture();
      track.setPointerCapture(event.pointerId);
      track.classList.add('is-dragging');
      this.reorderGesture = { card: track, grid, pointerId: event.pointerId };
      return;
    }
    const button = target instanceof Element
      ? target.closest<HTMLButtonElement>('button[data-playlist-id]')
      : null;
    const block = target instanceof Element
      ? target.closest<HTMLElement>('.track-block[data-list-item-id]')
      : null;
    const holdTarget = button ?? block;
    if (!holdTarget) return;
    if (isDesktopRuntime()) return;
    this.clearHoldGesture();
    const timer = window.setTimeout(() => {
      this.holdGesture = null;
      if (button) {
        this.suppressNextPlaylistClick = true;
        const id = button.dataset.playlistId;
        if (id) this.openPlaylistManager(id);
        return;
      }
      const id = block?.dataset.listItemId;
      if (id) this.openBlockManager(id);
    }, 560);
    this.holdGesture = {
      target: holdTarget,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      timer,
    };
  }

  private onContextMenu(event: MouseEvent): void {
    if (!isDesktopRuntime()) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const playlistButton = target.closest<HTMLButtonElement>('button[data-playlist-id]');
    if (playlistButton) {
      const id = playlistButton.dataset.playlistId;
      if (!id) return;
      event.preventDefault();
      event.stopPropagation();
      this.clearHoldGesture();
      this.openPlaylistManager(id);
      return;
    }
    const block = target.closest<HTMLElement>('.track-block[data-list-item-id]');
    const blockId = block?.dataset.listItemId;
    if (!block || !blockId) return;
    event.preventDefault();
    event.stopPropagation();
    this.clearHoldGesture();
    this.openBlockManager(blockId);
  }

  private onPointerMove(event: PointerEvent): void {
    const reorder = this.reorderGesture;
    if (reorder?.pointerId === event.pointerId) {
      event.preventDefault();
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const targetCard = element instanceof Element
        ? element.closest<HTMLElement>('[data-list-item-id]')
        : null;
      if (!targetCard || targetCard === reorder.card || targetCard.parentElement !== reorder.grid) return;
      const bounds = targetCard.getBoundingClientRect();
      const insertBefore = event.clientY < bounds.top + bounds.height / 2;
      reorder.grid.insertBefore(reorder.card, insertBefore ? targetCard : targetCard.nextSibling);
      return;
    }
    const gesture = this.holdGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 10) {
      this.clearHoldGesture();
    }
  }

  private clearHoldGesture(): void {
    if (!this.holdGesture) return;
    window.clearTimeout(this.holdGesture.timer);
    this.holdGesture = null;
  }

  private onPointerEnd(event: PointerEvent): void {
    if (this.reorderGesture?.pointerId === event.pointerId) {
      const gesture = this.reorderGesture;
      const orderedIds = Array.from(
        gesture.grid.querySelectorAll<HTMLElement>('[data-list-item-id]'),
        (item) => item.dataset.listItemId,
      ).filter((itemId): itemId is string => Boolean(itemId));
      this.clearReorderGesture();
      void this.persistVisibleOrder(orderedIds);
    }
    this.clearHoldGesture();
  }

  private clearReorderGesture(): void {
    const gesture = this.reorderGesture;
    if (!gesture) return;
    gesture.card.classList.remove('is-dragging');
    if (gesture.card.hasPointerCapture(gesture.pointerId)) {
      gesture.card.releasePointerCapture(gesture.pointerId);
    }
    this.reorderGesture = null;
  }

  private async persistVisibleOrder(orderedIds: string[]): Promise<void> {
    try {
      const scopeId = this.activeScopeId();
      const trackIds = orderedIds.filter((itemId) => this.tracks.some((track) => track.id === itemId));
      if (this.activePlaylistId) {
        const playlist = this.playlists.find(({ id }) => id === this.activePlaylistId);
        if (!playlist) return;
        const updated = await this.library.updatePlaylist(playlist.id, playlist.name, trackIds);
        this.playlists = this.playlists.map((item) => item.id === updated.id ? updated : item);
      } else {
        await this.library.saveTrackOrder(trackIds);
        const byId = new Map(this.tracks.map((track) => [track.id, track]));
        this.tracks = trackIds.map((trackId) => byId.get(trackId)).filter((track): track is LocalTrack => Boolean(track));
      }
      await this.library.saveListLayout(scopeId, orderedIds);
      const orderedBlocks = await this.library.saveBlockOrder(scopeId, orderedIds);
      this.blocksByScope.set(scopeId, orderedBlocks);
      this.layoutsByScope.set(scopeId, [...orderedIds]);
      this.renderLibrary();
    } catch {
      this.setMessage('Não foi possível salvar a nova ordem.');
      await this.refresh();
    }
  }

  refreshLibrary(): Promise<void> {
    return this.refresh();
  }

  showMessage(message: string): void {
    this.setMessage(message);
  }

  setImportLoading(loading: boolean, label = 'Adicionando músicas...'): void {
    const overlay = this.root.querySelector<HTMLElement>('[data-tracks-import-loading]');
    const owner = overlay?.parentElement;
    if (!overlay || !owner) return;
    overlay.hidden = !loading;
    owner.classList.toggle('is-importing-tracks', loading);
    if (loading) owner.setAttribute('aria-busy', 'true');
    else owner.removeAttribute('aria-busy');
    const output = overlay.querySelector<HTMLElement>('[data-tracks-import-loading-label]');
    if (output) output.textContent = label;
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-tracks-action="add-music"]')) {
      button.disabled = loading;
    }
  }

  private waitForImportLoadingPaint(): Promise<void> {
    return new Promise((resolve) => {
      window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
    });
  }

  private async refresh(): Promise<void> {
    try {
      [this.tracks, this.playlists] = await Promise.all([
        this.library.list(),
        this.library.listPlaylists(),
      ]);
      if (!this.root.isConnected) return;
      if (this.activePlaylistId && !this.playlists.some(({ id }) => id === this.activePlaylistId)) {
        this.activePlaylistId = null;
      }
      const scopes = ['all', ...this.playlists.map(({ id }) => id)];
      const storedLists = await Promise.all(scopes.map(async (scopeId) => ({
        scopeId,
        blocks: await this.library.listBlocks(scopeId),
        layout: await this.library.getListLayout(scopeId),
      })));
      this.blocksByScope.clear();
      this.layoutsByScope.clear();
      storedLists.forEach(({ scopeId, blocks, layout }) => {
        this.blocksByScope.set(scopeId, blocks);
        this.layoutsByScope.set(scopeId, layout);
      });
      if (!this.root.isConnected) return;
      this.renderPlaylists();
      this.renderSplitControlState();
      this.renderLibrary();
    } catch {
      const grid = this.root.querySelector<HTMLElement>('[data-tracks-library]');
      if (grid) grid.innerHTML = '<p class="tracks-library-grid__empty">Não foi possível carregar suas músicas.</p>';
    }
  }

  private renderPlaylists(): void {
    const list = this.root.querySelector<HTMLElement>('[data-track-playlists]');
    const allButton = this.root.querySelector<HTMLButtonElement>('[data-tracks-action="show-all"]');
    if (!list || !allButton) return;
    const allSelected = this.activePlaylistId === null;
    allButton.classList.toggle('is-selected', allSelected);
    allButton.setAttribute('aria-pressed', String(allSelected));
    const activeSetLabel = this.root.querySelector<HTMLElement>('[data-tracks-active-set]');
    if (activeSetLabel) {
      activeSetLabel.textContent = allSelected
        ? 'All'
        : this.playlists.find(({ id }) => id === this.activePlaylistId)?.name ?? 'All';
    }
    list.innerHTML = this.playlists.map((playlist) => {
      const selected = playlist.id === this.activePlaylistId;
      return `
        <button type="button" data-playlist-id="${playlist.id}" class="${selected ? 'is-selected' : ''}" aria-pressed="${selected}" title="${escapeMarkup(playlist.name)}">
          <span class="track-name">${escapeMarkup(playlist.name)}</span>
        </button>
      `;
    }).join('');
    this.syncMarqueeLabels(list);
  }

  private renderLibrary(): void {
    const grid = this.root.querySelector<HTMLElement>('[data-tracks-library]');
    if (!grid) return;
    const active = this.activePlaylistId
      ? this.playlists.find(({ id }) => id === this.activePlaylistId)
      : null;
    const visibleTracks = active
      ? active.trackIds
        .map((trackId) => this.tracks.find(({ id }) => id === trackId))
        .filter((track): track is LocalTrack => Boolean(track))
      : this.tracks;
    const visibleItems = this.orderVisibleItems(visibleTracks);
    const orderedTracks = visibleItems
      .filter((item): item is Extract<TrackListItem, { kind: 'track' }> => item.kind === 'track')
      .map(({ track }) => track);
    this.options.onVisibleTracksChanged?.(orderedTracks);
    if (visibleItems.length === 0) {
      grid.innerHTML = `<p class="tracks-library-grid__empty">${active ? 'Esta playlist ainda não possui músicas.' : 'Nenhuma música adicionada.'}</p>`;
      return;
    }
    grid.classList.toggle('is-editing', this.editMode && this.root.matches('.tracks-split-panel'));
    const showListNumbers = this.root.matches('.tracks-split-panel');
    let musicNumber = 0;
    grid.innerHTML = visibleItems
      .map((item) => {
        if (item.kind === 'block') return createTrackBlock(item.block, showListNumbers ? '–' : null);
        musicNumber += 1;
        return createTrackButton(item.track, false, false, showListNumbers ? String(musicNumber) : null);
      })
      .join('');
    this.syncMarqueeLabels(grid);
    const snapshot = this.options.getPlaybackSnapshot?.();
    if (snapshot) this.syncPlayback(snapshot);
  }

  private activeScopeId(): string {
    return this.activePlaylistId ?? 'all';
  }

  private syncMarqueeLabels(container: HTMLElement): void {
    for (const label of container.querySelectorAll<HTMLElement>('.track-name')) {
      label.classList.remove('is-marquee');
      const viewport = label.parentElement;
      if (viewport && label.scrollWidth > viewport.clientWidth + 2) {
        label.classList.add('is-marquee');
      }
    }
  }

  private orderVisibleItems(visibleTracks: readonly LocalTrack[]): TrackListItem[] {
    const scopeId = this.activeScopeId();
    const items: TrackListItem[] = [
      ...visibleTracks.map((track): TrackListItem => ({ kind: 'track', id: track.id, track })),
      ...(this.blocksByScope.get(scopeId) ?? []).map((block): TrackListItem => ({ kind: 'block', id: block.id, block })),
    ];
    const itemById = new Map(items.map((item) => [item.id, item]));
    const ordered = (this.layoutsByScope.get(scopeId) ?? [])
      .map((itemId) => itemById.get(itemId))
      .filter((item): item is TrackListItem => Boolean(item));
    const orderedIds = new Set(ordered.map(({ id }) => id));
    const newTracks = items.filter((item) => item.kind === 'track' && !orderedIds.has(item.id));
    const newBlocks = items.filter((item) => item.kind === 'block' && !orderedIds.has(item.id));
    return [...newTracks, ...ordered, ...newBlocks];
  }

  private async addBlock(): Promise<void> {
    const scopeId = this.activeScopeId();
    const button = this.root.querySelector<HTMLButtonElement>('[data-tracks-action="add-bl"]');
    if (button) button.disabled = true;
    try {
      const currentItems = this.orderVisibleItems(
        this.activePlaylistId
          ? (this.playlists.find(({ id }) => id === this.activePlaylistId)?.trackIds ?? [])
            .map((trackId) => this.tracks.find(({ id }) => id === trackId))
            .filter((track): track is LocalTrack => Boolean(track))
          : this.tracks,
      );
      const block = await this.library.addBlock(scopeId);
      const previousBlocks = this.blocksByScope.get(scopeId) ?? [];
      this.blocksByScope.set(scopeId, [...previousBlocks, block]);
      const itemIds = currentItems.map(({ id }) => id);
      const previousBlock = previousBlocks.reduce<LocalTrackBlock | null>(
        (latest, item) => !latest || item.sequence > latest.sequence ? item : latest,
        null,
      );
      const previousIndex = previousBlock ? itemIds.indexOf(previousBlock.id) : -1;
      itemIds.splice(previousIndex >= 0 ? previousIndex + 1 : 0, 0, block.id);
      await this.library.saveListLayout(scopeId, itemIds);
      this.layoutsByScope.set(scopeId, itemIds);
      this.renderLibrary();
      this.setMessage(`${block.name} adicionado.`);
    } catch {
      this.setMessage('Não foi possível adicionar o bloco.');
    } finally {
      if (button) button.disabled = false;
    }
  }

  private renderSplitControlState(): void {
    const states: Record<string, boolean> = {
      'toggle-loop': this.loopEnabled,
      'toggle-auto': this.autoEnabled,
      'toggle-edit': this.editMode,
    };
    for (const [action, selected] of Object.entries(states)) {
      const button = this.root.querySelector<HTMLButtonElement>(`[data-tracks-action="${action}"]`);
      if (!button) continue;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
  }

  private setSetMenuOpen(open: boolean): void {
    this.setMenuOpen = open;
    const menu = this.root.querySelector<HTMLElement>('[data-tracks-set-menu]');
    const button = this.root.querySelector<HTMLButtonElement>('[data-tracks-action="toggle-set-menu"]');
    if (menu) menu.hidden = !open;
    button?.setAttribute('aria-expanded', String(open));
    button?.classList.toggle('is-selected', open);
  }

  syncPlayback(snapshot: TrackPlaybackSnapshot): void {
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('button[data-track-id]')) {
      const trackId = button.dataset.trackId;
      const playing = trackId === snapshot.playingTrackId;
      const queued = trackId === snapshot.queuedTrackId;
      const selected = trackId === snapshot.selectedTrackId && !playing && !queued;
      button.classList.toggle('is-selected', selected);
      button.classList.toggle('is-playing', playing);
      button.classList.toggle('is-queued', queued);
      button.setAttribute('aria-pressed', String(selected || playing || queued));
      button.style.setProperty('--track-play-progress', String(playing ? snapshot.progress : 0));
      button.style.setProperty('--track-queue-progress', String(queued ? snapshot.queueProgress : 0));
    }
  }

  private async importTracks(input: HTMLInputElement): Promise<void> {
    const selected = Array.from(input.files ?? []);
    input.value = '';
    if (selected.length === 0) return;
    // O seletor de documentos deixa escolher qualquer arquivo: só áudio entra.
    const files = selected.filter(isTrackAudioFile);
    const ignored = selected.length - files.length;
    const ignoredNote = ignored > 0
      ? ` ${ignored} ${ignored === 1 ? 'arquivo ignorado' : 'arquivos ignorados'} (não é áudio).`
      : '';
    if (files.length === 0) {
      this.setMessage(`Nenhuma música adicionada.${ignoredNote}`);
      return;
    }
    this.setMessage('Adicionando músicas...');
    this.setImportLoading(true, files.length === 1 ? 'Adicionando música...' : `Adicionando ${files.length} músicas...`);
    try {
      await this.waitForImportLoadingPaint();
      await this.library.addFiles(files);
      await this.refresh();
      this.setMessage(`${files.length} ${files.length === 1 ? 'música adicionada' : 'músicas adicionadas'}.${ignoredNote}`);
    } catch {
      this.setMessage('Não foi possível adicionar as músicas.');
    } finally {
      this.setImportLoading(false);
    }
  }

  private openNameEditor(playlistId: string | null): void {
    const playlist = playlistId ? this.playlists.find(({ id }) => id === playlistId) : null;
    this.draft = {
      id: playlist?.id ?? null,
      name: playlist?.name ?? '',
      trackIds: new Set(playlist?.trackIds ?? []),
    };
    this.renderNameEditor();
  }

  private renderNameEditor(): void {
    if (!this.draft) return;
    const editor = this.getEditor();
    editor.hidden = false;
    editor.innerHTML = `
      <div class="tracks-playlist-name-stage">
        <label>
          <span>${this.draft.id ? 'Nome da playlist' : 'Nova playlist'}</span>
          ${this.createPlaylistNameFieldMarkup(this.draft.name)}
        </label>
        <p data-playlist-message role="alert"></p>
        <div class="tracks-playlist-editor__actions">
          <button type="button" data-tracks-action="playlist-editor-cancel">Cancelar</button>
          <button type="button" data-tracks-action="playlist-name-next">Continuar</button>
        </div>
        ${isDesktopRuntime() ? '' : createOnScreenKeyboardMarkup('Teclado para o nome da playlist', true)}
      </div>
    `;
    this.renderDraftName();
  }

  private renderDraftName(): void {
    const value = this.root.querySelector<HTMLElement>('[data-playlist-name-value]');
    if (value) value.textContent = this.draft?.name ?? '';
    const input = this.root.querySelector<HTMLInputElement>('[data-playlist-name-input]');
    if (input && input.value !== (this.draft?.name ?? '')) input.value = this.draft?.name ?? '';
  }

  private openTrackSelector(): void {
    if (!this.draft) return;
    this.draft.name = this.draft.name.trim().replace(/\s+/g, ' ').slice(0, PLAYLIST_NAME_LIMIT);
    if (!this.draft.name) {
      this.setEditorMessage('Digite um nome para a playlist.');
      return;
    }
    const editor = this.getEditor();
    editor.innerHTML = `
      <div class="tracks-playlist-selection-stage">
        <header><span>${this.draft.id ? 'Editar playlist' : 'Criar playlist'}</span><strong>${escapeMarkup(this.draft.name)}</strong></header>
        <div class="tracks-playlist-selection-grid" data-playlist-track-grid>
          ${this.tracks.length > 0
            ? this.tracks.map((track) => createTrackButton(track, this.draft?.trackIds.has(track.id) ?? false, true)).join('')
            : '<p class="tracks-library-grid__empty">Nenhuma música adicionada. Você pode criar a playlist vazia.</p>'}
        </div>
        <p data-playlist-message role="alert"></p>
        <div class="tracks-playlist-editor__actions">
          <button type="button" data-tracks-action="playlist-selector-back">Voltar</button>
          <button type="button" data-tracks-action="playlist-save">Salvar</button>
        </div>
      </div>
    `;
  }

  private async saveDraft(): Promise<void> {
    if (!this.draft) return;
    const editor = this.getEditor();
    const saveButton = editor.querySelector<HTMLButtonElement>('[data-tracks-action="playlist-save"]');
    if (saveButton) saveButton.disabled = true;
    try {
      const playlist = this.draft.id
        ? await this.library.updatePlaylist(this.draft.id, this.draft.name, [...this.draft.trackIds])
        : await this.library.createPlaylist(this.draft.name, [...this.draft.trackIds]);
      this.activePlaylistId = playlist.id;
      this.closeEditor();
      await this.refresh();
      this.setMessage('Playlist salva.');
    } catch {
      this.setEditorMessage('Não foi possível salvar a playlist.');
      if (saveButton) saveButton.disabled = false;
    }
  }

  private openPlaylistManager(playlistId: string): void {
    const playlist = this.playlists.find(({ id }) => id === playlistId);
    if (!playlist) return;
    this.draft = { id: playlist.id, name: playlist.name, trackIds: new Set(playlist.trackIds) };
    const editor = this.getEditor();
    editor.hidden = false;
    editor.innerHTML = `
      <div class="tracks-playlist-name-stage tracks-playlist-manage-stage">
        <label>
          <span>Nome da playlist</span>
          ${this.createPlaylistNameFieldMarkup(playlist.name)}
        </label>
        <p data-playlist-message role="alert"></p>
        <div class="tracks-playlist-editor__actions">
          <button type="button" data-tracks-action="playlist-editor-cancel">Cancelar</button>
          <button type="button" data-tracks-action="playlist-manage-edit">Editar</button>
          <button class="is-danger" type="button" data-tracks-action="playlist-manage-delete">Apagar playlist</button>
        </div>
        ${isDesktopRuntime() ? '' : createOnScreenKeyboardMarkup('Teclado para o nome da playlist', true)}
      </div>
    `;
  }

  private setNameKeyboardOpen(open: boolean, requestedField?: HTMLElement): void {
    if (isDesktopRuntime()) return;
    const editor = this.getEditor();
    const field = requestedField ?? editor.querySelector<HTMLElement>('[data-playlist-name-field]');
    const keyboard = editor.querySelector<HTMLElement>('.on-screen-keyboard');
    if (field) {
      field.classList.toggle('is-input-active', open);
      if (open) field.focus({ preventScroll: true });
      else field.blur();
    }
    if (keyboard) keyboard.hidden = !open;
  }

  private renderDeleteConfirmation(): void {
    if (!this.draft?.id) return;
    const editor = this.getEditor();
    editor.innerHTML = `
      <div class="tracks-playlist-manager">
        <span>Apagar playlist</span>
        <h3>${escapeMarkup(this.draft.name)}</h3>
        <p>A playlist será apagada. As músicas continuarão na biblioteca.</p>
        <div class="tracks-playlist-editor__actions">
          <button type="button" data-tracks-action="playlist-delete-cancel">Cancelar</button>
          <button class="is-danger" type="button" data-tracks-action="playlist-delete-confirm">Apagar</button>
        </div>
      </div>
    `;
  }

  private async deleteDraftPlaylist(): Promise<void> {
    const playlistId = this.draft?.id;
    if (!playlistId) return;
    try {
      await this.library.deletePlaylist(playlistId);
      if (this.activePlaylistId === playlistId) this.activePlaylistId = null;
      this.closeEditor();
      await this.refresh();
      this.setMessage('Playlist apagada.');
    } catch {
      this.setEditorMessage('Não foi possível apagar a playlist.');
    }
  }

  private openBlockManager(blockId: string): void {
    const scopeId = this.activeScopeId();
    const block = (this.blocksByScope.get(scopeId) ?? []).find(({ id }) => id === blockId);
    if (!block) return;
    this.managedBlockId = block.id;
    this.managedBlockNameDraft = block.name.slice(0, BLOCK_NAME_LIMIT);
    const editor = this.getEditor();
    editor.hidden = false;
    editor.innerHTML = `
      <div class="tracks-playlist-manager">
        <span>Organização da lista</span>
        <h3>${escapeMarkup(block.name)}</h3>
        <p>Renomeie o bloco ou apague apenas esta divisão da lista.</p>
        <p data-playlist-message role="alert"></p>
        <div class="tracks-playlist-editor__actions">
          <button type="button" data-tracks-action="block-delete-cancel">Voltar</button>
          <button type="button" data-tracks-action="block-rename">Renomear</button>
          <button class="is-danger" type="button" data-tracks-action="block-delete-confirm">Apagar</button>
        </div>
      </div>
    `;
  }

  private renderBlockNameEditor(): void {
    if (!this.managedBlockId) return;
    const editor = this.getEditor();
    editor.hidden = false;
    editor.innerHTML = `
      <div class="tracks-playlist-name-stage tracks-block-name-stage">
        <label>
          <span>Nome do bloco · máximo ${BLOCK_NAME_LIMIT} caracteres</span>
          ${isDesktopRuntime()
            ? `<input type="text" maxlength="${BLOCK_NAME_LIMIT}" value="${escapeMarkup(this.managedBlockNameDraft)}" data-block-name-input autofocus>`
            : `<span class="on-screen-text-field is-input-active" role="textbox" tabindex="0" aria-label="Nome do bloco" aria-readonly="true" data-block-name-field>
                <span data-block-name-value>${escapeMarkup(this.managedBlockNameDraft)}</span><i aria-hidden="true"></i>
              </span>`}
        </label>
        <p data-playlist-message role="alert"></p>
        <div class="tracks-playlist-editor__actions">
          <button type="button" data-tracks-action="block-rename-cancel">Voltar</button>
          <button type="button" data-tracks-action="block-rename-save">Salvar</button>
        </div>
        ${isDesktopRuntime() ? '' : createOnScreenKeyboardMarkup('Teclado para o nome do bloco', true)}
      </div>
    `;
  }

  private renderManagedBlockName(): void {
    const value = this.getEditor().querySelector<HTMLElement>('[data-block-name-value]');
    if (value) value.textContent = this.managedBlockNameDraft;
    const input = this.getEditor().querySelector<HTMLInputElement>('[data-block-name-input]');
    if (input && input.value !== this.managedBlockNameDraft) input.value = this.managedBlockNameDraft;
  }

  private createPlaylistNameFieldMarkup(value: string): string {
    if (isDesktopRuntime()) {
      return `<input type="text" maxlength="${PLAYLIST_NAME_LIMIT}" value="${escapeMarkup(value)}" data-playlist-name-input autofocus>`;
    }
    return `<span class="on-screen-text-field" role="textbox" tabindex="0" aria-label="Nome da playlist" aria-readonly="true" data-playlist-name-field>
      <span data-playlist-name-value>${escapeMarkup(value)}</span><i aria-hidden="true"></i>
    </span>`;
  }

  private async saveManagedBlockName(): Promise<void> {
    const blockId = this.managedBlockId;
    const name = this.managedBlockNameDraft.trim().slice(0, BLOCK_NAME_LIMIT);
    if (!blockId || !name) {
      this.setEditorMessage('Digite um nome para o bloco.');
      return;
    }
    try {
      const updated = await this.library.renameBlock(blockId, name);
      const scopeBlocks = this.blocksByScope.get(updated.scopeId) ?? [];
      this.blocksByScope.set(updated.scopeId, scopeBlocks.map((block) => block.id === updated.id ? updated : block));
      this.closeEditor();
      this.renderLibrary();
      this.setMessage('Bloco renomeado.');
    } catch {
      this.setEditorMessage('Não foi possível renomear o bloco.');
    }
  }

  private async deleteManagedBlock(): Promise<void> {
    const blockId = this.managedBlockId;
    if (!blockId) return;
    const scopeId = this.activeScopeId();
    const currentItems = this.orderVisibleItems(
      this.activePlaylistId
        ? (this.playlists.find(({ id }) => id === this.activePlaylistId)?.trackIds ?? [])
          .map((trackId) => this.tracks.find(({ id }) => id === trackId))
          .filter((track): track is LocalTrack => Boolean(track))
        : this.tracks,
    );
    const remainingItemIds = currentItems.map(({ id }) => id).filter((id) => id !== blockId);
    try {
      const deleted = await this.library.deleteBlock(blockId);
      if (!deleted) throw new Error('block_not_found');
      await this.library.saveListLayout(scopeId, remainingItemIds);
      const orderedBlocks = await this.library.saveBlockOrder(scopeId, remainingItemIds);
      this.blocksByScope.set(scopeId, orderedBlocks);
      this.layoutsByScope.set(scopeId, remainingItemIds);
      this.closeEditor();
      this.renderLibrary();
      this.setMessage('Bloco apagado.');
    } catch {
      this.setEditorMessage('Não foi possível apagar o bloco.');
    }
  }

  private closeEditor(): void {
    const editor = this.getEditor();
    editor.hidden = true;
    editor.innerHTML = '';
    this.draft = null;
    this.managedBlockId = null;
    this.managedBlockNameDraft = '';
  }

  private getEditor(): HTMLElement {
    const editor = this.root.querySelector<HTMLElement>('[data-playlist-editor]');
    if (!editor) throw new Error('Editor de playlist não encontrado.');
    return editor;
  }

  private clearMessage(): void {
    this.setEditorMessage('');
  }

  private setEditorMessage(message: string): void {
    const target = this.root.querySelector<HTMLElement>('[data-playlist-message]');
    if (target) target.textContent = message;
  }

  private setMessage(message: string): void {
    const target = this.root.querySelector<HTMLElement>('[data-tracks-message]');
    if (target) target.textContent = message;
  }
}

function createTrackButton(
  track: LocalTrack,
  selected = false,
  selectable = false,
  listNumber: string | null = null,
): string {
  return `
    <button
      class="track-card${selected ? ' is-selected' : ''}"
      type="button"
      ${selectable ? `data-playlist-track-id="${track.id}" aria-pressed="${selected}"` : `data-track-id="${track.id}" data-list-item-id="${track.id}" aria-pressed="${selected}"`}
      title="${escapeMarkup(track.name)}"
    >
      ${listNumber === null ? '' : `<span class="track-list-number" aria-hidden="true">${listNumber}</span>`}
      <strong><span class="track-name">${escapeMarkup(track.name)}</span></strong>
      ${selectable ? '' : '<span class="track-card__progress" aria-hidden="true"><i></i></span>'}
    </button>
  `;
}

function createTrackBlock(block: LocalTrackBlock, listNumber: string | null = null): string {
  return `
    <div class="track-block" data-list-item-id="${block.id}" role="separator" aria-label="${escapeMarkup(block.name)}">
      ${listNumber === null ? '' : `<span class="track-list-number" aria-hidden="true">${listNumber}</span>`}
      <span class="track-block__label">${escapeMarkup(block.name)}</span>
    </div>
  `;
}

function escapeMarkup(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] ?? character);
}
