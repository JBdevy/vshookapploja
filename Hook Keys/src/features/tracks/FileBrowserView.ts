import type { NativeFileBrowserEntry, NativeFileBrowserRoot } from '../../platform/native/HookKeysNative';

// Gerenciador de arquivos próprio do app (iOS). O seletor do sistema só aparece
// para liberar uma pasta nova; navegar e escolher músicas acontece aqui.
export interface FileBrowserNative {
  roots(): Promise<NativeFileBrowserRoot[]>;
  addFolder(): Promise<NativeFileBrowserRoot | null>;
  removeFolder(rootId: string): Promise<void>;
  list(rootId: string, path: string): Promise<NativeFileBrowserEntry[]>;
  importFile(rootId: string, path: string): Promise<{ path: string; name: string; size: number }>;
  release(path: string): Promise<void>;
  fileUrl(path: string): string;
}

export interface FileBrowserState {
  selectedCount: number;
  busy: boolean;
}

const AUDIO_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  wave: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
};

const FOLDER_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>';
const MUSIC_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>';
const CHECK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>';

export function audioTypeForFileName(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  return AUDIO_TYPES[extension] ?? 'application/octet-stream';
}

export function formatFileSize(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function createFileBrowserMarkup(): string {
  return `
    <section class="file-browser" data-file-browser>
      <nav class="file-browser__roots" data-file-browser-roots aria-label="Locais"></nav>
      <div class="file-browser__main">
        <div class="file-browser__path">
          <button type="button" data-file-browser-up aria-label="Voltar para a pasta anterior" disabled>‹</button>
          <strong data-file-browser-location>Hook Keys</strong>
          <button type="button" data-file-browser-select-all hidden>Selecionar todas</button>
        </div>
        <div class="file-browser__list" data-file-browser-list role="list"></div>
        <p class="file-browser__status" data-file-browser-status role="status" aria-live="polite"></p>
      </div>
    </section>
  `;
}

export class FileBrowserController {
  private readonly handleClick = (event: Event) => this.onClick(event);
  private roots: NativeFileBrowserRoot[] = [];
  private rootId = 'app';
  private path: string[] = [];
  private entries: NativeFileBrowserEntry[] = [];
  private readonly selected = new Set<string>();
  private busy = false;
  private listSequence = 0;
  private destroyed = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly native: FileBrowserNative,
    private readonly importTrack: (file: File) => Promise<void>,
    private readonly onStateChanged: (state: FileBrowserState) => void,
  ) {}

  mount(): void {
    this.root.addEventListener('click', this.handleClick);
    void this.loadRoots();
  }

  destroy(): void {
    this.destroyed = true;
    this.root.removeEventListener('click', this.handleClick);
  }

  // Copia cada música escolhida para dentro do app, uma de cada vez: no
  // aparelho antigo várias músicas grandes na memória ao mesmo tempo pesam.
  async importSelected(): Promise<number> {
    if (this.busy || this.selected.size === 0) return 0;
    const paths = [...this.selected].sort((left, right) => left.localeCompare(right));
    const rootId = this.rootId;
    this.setBusy(true);
    let added = 0;
    let failed = 0;
    for (const [index, path] of paths.entries()) {
      if (this.destroyed) break;
      const name = path.split('/').pop() ?? path;
      this.setStatus(`Adicionando ${index + 1} de ${paths.length}: ${name}`);
      let copiedPath: string | null = null;
      try {
        const copied = await this.native.importFile(rootId, path);
        copiedPath = copied.path;
        const response = await fetch(this.native.fileUrl(copied.path));
        if (!response.ok) throw new Error('file_read_failed');
        const blob = await response.blob();
        await this.importTrack(new File([blob], copied.name, { type: audioTypeForFileName(copied.name) }));
        added += 1;
        this.selected.delete(path);
      } catch {
        failed += 1;
      } finally {
        if (copiedPath) void this.native.release(copiedPath).catch(() => undefined);
      }
    }
    this.setBusy(false);
    this.renderList();
    const addedText = `${added} ${added === 1 ? 'música adicionada' : 'músicas adicionadas'}`;
    this.setStatus(failed > 0 ? `${addedText}. ${failed} não ${failed === 1 ? 'pôde' : 'puderam'} ser lida${failed === 1 ? '' : 's'}.` : `${addedText}.`);
    return added;
  }

  private async loadRoots(): Promise<void> {
    try {
      this.roots = await this.native.roots();
    } catch {
      this.roots = [{ id: 'app', name: 'Hook Keys', removable: false }];
    }
    if (this.destroyed) return;
    if (!this.roots.some(({ id }) => id === this.rootId)) this.rootId = this.roots[0]?.id ?? 'app';
    this.renderRoots();
    await this.openDirectory(this.rootId, []);
  }

  private async openDirectory(rootId: string, path: string[]): Promise<void> {
    const sequence = ++this.listSequence;
    this.rootId = rootId;
    this.path = path;
    this.selected.clear();
    this.entries = [];
    this.renderRoots();
    this.renderLocation();
    this.renderList(true);
    try {
      const entries = await this.native.list(rootId, path.join('/'));
      if (this.destroyed || sequence !== this.listSequence) return;
      this.entries = [...entries].sort((left, right) => (
        Number(right.isDirectory) - Number(left.isDirectory) || left.name.localeCompare(right.name, undefined, { numeric: true })
      ));
      this.setStatus('');
    } catch {
      if (this.destroyed || sequence !== this.listSequence) return;
      this.setStatus('Não foi possível abrir essa pasta. Se ela foi movida ou apagada, remova o atalho e adicione de novo.');
    }
    this.renderList();
  }

  private async addFolder(): Promise<void> {
    if (this.busy) return;
    try {
      const added = await this.native.addFolder();
      if (!added || this.destroyed) return;
      this.roots = [...this.roots.filter(({ id }) => id !== added.id), added];
      await this.openDirectory(added.id, []);
    } catch {
      this.setStatus('Não foi possível liberar essa pasta.');
    }
  }

  private async removeFolder(rootId: string): Promise<void> {
    if (this.busy) return;
    try {
      await this.native.removeFolder(rootId);
    } catch {
      this.setStatus('Não foi possível remover o atalho.');
      return;
    }
    this.roots = this.roots.filter(({ id }) => id !== rootId);
    if (this.rootId === rootId) await this.openDirectory('app', []);
    else this.renderRoots();
  }

  private onClick(event: Event): void {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || this.busy) return;
    const remove = target.closest<HTMLElement>('[data-file-browser-remove]');
    if (remove) {
      void this.removeFolder(remove.dataset.fileBrowserRemove ?? '');
      return;
    }
    const rootButton = target.closest<HTMLElement>('[data-file-browser-root]');
    if (rootButton) {
      void this.openDirectory(rootButton.dataset.fileBrowserRoot ?? 'app', []);
      return;
    }
    if (target.closest('[data-file-browser-add]')) {
      void this.addFolder();
      return;
    }
    if (target.closest('[data-file-browser-up]')) {
      if (this.path.length > 0) void this.openDirectory(this.rootId, this.path.slice(0, -1));
      return;
    }
    if (target.closest('[data-file-browser-select-all]')) {
      const files = this.entries.filter(({ isDirectory }) => !isDirectory).map(({ name }) => this.entryPath(name));
      const allSelected = files.every((path) => this.selected.has(path));
      for (const path of files) {
        if (allSelected) this.selected.delete(path);
        else this.selected.add(path);
      }
      this.renderList();
      return;
    }
    const folder = target.closest<HTMLElement>('[data-file-browser-folder]');
    if (folder) {
      void this.openDirectory(this.rootId, [...this.path, folder.dataset.fileBrowserFolder ?? '']);
      return;
    }
    const file = target.closest<HTMLElement>('[data-file-browser-file]');
    if (file) {
      const path = this.entryPath(file.dataset.fileBrowserFile ?? '');
      if (this.selected.has(path)) this.selected.delete(path);
      else this.selected.add(path);
      this.renderList();
    }
  }

  private entryPath(name: string): string {
    return [...this.path, name].join('/');
  }

  private renderRoots(): void {
    const container = this.root.querySelector<HTMLElement>('[data-file-browser-roots]');
    if (!container) return;
    container.innerHTML = `
      ${this.roots.map((root) => `
        <div class="file-browser__root${root.id === this.rootId ? ' is-selected' : ''}">
          <button type="button" data-file-browser-root="${escapeAttribute(root.id)}" aria-pressed="${root.id === this.rootId}">
            ${FOLDER_ICON}<span>${escapeMarkup(root.name)}</span>
          </button>
          ${root.removable ? `<button class="file-browser__remove" type="button" data-file-browser-remove="${escapeAttribute(root.id)}" aria-label="Remover atalho ${escapeAttribute(root.name)}">×</button>` : ''}
        </div>
      `).join('')}
      <button class="file-browser__add" type="button" data-file-browser-add>+ Adicionar pasta</button>
    `;
  }

  private renderLocation(): void {
    const rootName = this.roots.find(({ id }) => id === this.rootId)?.name ?? 'Hook Keys';
    const location = this.root.querySelector<HTMLElement>('[data-file-browser-location]');
    if (location) location.textContent = [rootName, ...this.path].join(' / ');
    const up = this.root.querySelector<HTMLButtonElement>('[data-file-browser-up]');
    if (up) up.disabled = this.path.length === 0;
  }

  private renderList(loading = false): void {
    const list = this.root.querySelector<HTMLElement>('[data-file-browser-list]');
    if (!list) return;
    const files = this.entries.filter(({ isDirectory }) => !isDirectory);
    const selectAll = this.root.querySelector<HTMLButtonElement>('[data-file-browser-select-all]');
    if (selectAll) {
      selectAll.hidden = files.length === 0;
      selectAll.textContent = files.length > 0 && files.every(({ name }) => this.selected.has(this.entryPath(name)))
        ? 'Desmarcar todas' : 'Selecionar todas';
    }
    if (loading) {
      list.innerHTML = '<p class="file-browser__empty">Abrindo pasta...</p>';
    } else if (this.entries.length === 0) {
      list.innerHTML = `<p class="file-browser__empty">${this.rootId === 'app' && this.path.length === 0
        ? 'A pasta Hook Keys está vazia. Copie músicas para ela pelo app Arquivos, pelo Finder do Mac ou por AirDrop.'
        : 'Nenhuma música ou pasta aqui.'}</p>`;
    } else {
      list.innerHTML = this.entries.map((entry) => {
        if (entry.isDirectory) {
          return `<button class="file-browser__row is-folder" type="button" role="listitem" data-file-browser-folder="${escapeAttribute(entry.name)}">${FOLDER_ICON}<span>${escapeMarkup(entry.name)}</span><b aria-hidden="true">›</b></button>`;
        }
        const selected = this.selected.has(this.entryPath(entry.name));
        const details = [formatFileSize(entry.size), entry.inCloud ? 'iCloud' : ''].filter(Boolean).join(' · ');
        return `<button class="file-browser__row${selected ? ' is-selected' : ''}" type="button" role="listitem" data-file-browser-file="${escapeAttribute(entry.name)}" aria-pressed="${selected}"><i class="file-browser__check">${CHECK_ICON}</i>${MUSIC_ICON}<span>${escapeMarkup(entry.name)}</span><small>${escapeMarkup(details)}</small></button>`;
      }).join('');
    }
    this.onStateChanged({ selectedCount: this.selected.size, busy: this.busy });
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.root.querySelector<HTMLElement>('[data-file-browser]')?.classList.toggle('is-busy', busy);
    this.onStateChanged({ selectedCount: this.selected.size, busy });
  }

  private setStatus(message: string): void {
    const status = this.root.querySelector<HTMLElement>('[data-file-browser-status]');
    if (status) status.textContent = message;
  }
}

function escapeMarkup(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeMarkup(value).replaceAll('"', '&quot;');
}
