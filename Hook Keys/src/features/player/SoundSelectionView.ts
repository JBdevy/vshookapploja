import type { SoundCatalogCategory } from '../sound-library/SoundCatalog';
import type { SoundCategoryId } from '../sound-library/SoundCategories';

function soundButtonStyle(color: string): string {
  return `--sound-button-color:${color}`;
}

export function createSoundSelectionMarkup(
  selectedCategory: SoundCategoryId,
  categories: readonly SoundCatalogCategory[],
  useTabletKeyboard = false,
  installedSoundIds: ReadonlySet<string> = new Set(),
  selectedTimbreId: string | null = null,
  seenSoundIds: ReadonlySet<string> = new Set(),
): string {
  const activeCategory = selectedCategory === 'user' || categories.some(({ id }) => id === selectedCategory)
    ? selectedCategory
    : categories[0]?.id ?? '';
  const categoryButtons = categories.map((category, index) => {
    const isSelected = category.id === activeCategory;
    // A categoria carrega o "new" enquanto tiver ao menos um timbre não visto
    // ainda; some sozinha quando o usuário já abriu todos os de dentro dela.
    const hasNewSound = category.sounds.some((sound) => !seenSoundIds.has(sound.id));
    return `
      <button
        class="sound-category-button${isSelected ? ' is-selected' : ''}${hasNewSound ? ' is-new' : ''}"
        type="button"
        data-sound-category="${escapeMarkup(category.id)}"
        aria-pressed="${isSelected}"
        style="${soundButtonStyle(category.color)}"
      >${index + 1} - ${escapeMarkup(category.name)}${hasNewSound ? '<i class="fixed-sound-new-badge" aria-hidden="true">new</i>' : ''}</button>
    `;
  }).join('');

  return `
    <section class="sound-browser" aria-label="Categorias de timbres">
      <nav class="sound-browser__categories" aria-label="Categorias">
        <button class="sound-category-button${activeCategory === 'user' ? ' is-selected' : ''}" type="button" data-sound-category="user" aria-pressed="${activeCategory === 'user'}">User</button>
        <span class="sound-category-divider" aria-hidden="true"></span>
        ${categoryButtons || '<p class="sound-browser__empty">Conecte-se à internet para carregar as categorias.</p>'}
      </nav>
      <div class="sound-browser__content">
        ${activeCategory ? createSoundCategoryContentMarkup(activeCategory, categories, useTabletKeyboard, installedSoundIds, selectedTimbreId, seenSoundIds) : createEmptyCatalogMarkup()}
      </div>
    </section>
  `;
}

export function createSoundCategoryContentMarkup(
  categoryId: SoundCategoryId,
  categories: readonly SoundCatalogCategory[],
  _useTabletKeyboard = false,
  installedSoundIds: ReadonlySet<string> = new Set(),
  selectedTimbreId: string | null = null,
  seenSoundIds: ReadonlySet<string> = new Set(),
): string {
  if (categoryId !== 'user') {
    const category = categories.find(({ id }) => id === categoryId);
    if (!category) return createEmptyCatalogMarkup();
    return `
      <section class="fixed-sound-panel">
        <header class="fixed-sound-panel__header">
          <h3>${escapeMarkup(category.name)}</h3>
          <div class="fixed-sound-panel__actions">
            <span class="fixed-sound-category-count">${category.sounds.length} ${category.sounds.length === 1 ? 'timbre' : 'timbres'}</span>
            <button class="fixed-sound-clean" type="button" data-sound-clean
              aria-label="Deixar o modulo sem timbre selecionado">Clean</button>
          </div>
        </header>
        <div class="fixed-sound-grid">
          ${category.sounds.map((sound) => {
            const installed = installedSoundIds.has(sound.id);
            const selected = selectedTimbreId === `fixed:${sound.id}`;
            const isNew = !seenSoundIds.has(sound.id);
            return `
              <button class="${installed ? 'is-installed' : 'is-downloadable'}${selected ? ' is-current-timbre' : ''}${isNew ? ' is-new' : ''}" type="button" data-fixed-sound-id="${escapeMarkup(sound.id)}" style="${soundButtonStyle(sound.color)}" aria-current="${selected}" aria-label="${escapeMarkup(sound.name)}. ${installed ? 'Baixado' : 'Não baixado'}${selected ? '. Selecionado neste módulo' : ''}${isNew ? '. Timbre novo' : ''}">
                <span>${escapeMarkup(sound.name)}</span><small>${installed ? 'No dispositivo' : 'Baixar'}</small>${isNew ? '<i class="fixed-sound-new-badge" aria-hidden="true">new</i>' : ''}<i class="fixed-sound-progress" data-fixed-sound-progress aria-hidden="true"></i>
              </button>
            `;
          }).join('') || '<p class="sound-browser__empty">Nenhum timbre cadastrado nesta categoria.</p>'}
        </div>
      </section>
    `;
  }
  return createUserSoundfontMarkup();
}

export function createUserSoundfontMarkup(): string {
  return `
    <section class="user-sf2-panel">
      <header class="user-sf2-panel__header">
        <h3>User</h3>
        <span data-user-sf2-total>Total - 0 GB</span>
        <button class="fixed-sound-clean" type="button" data-sound-clean
          aria-label="Deixar o modulo sem timbre selecionado">Clean</button>
        <p class="user-sf2-load-status" data-user-sf2-load-status role="status" aria-live="polite"></p>
      </header>
      <div class="user-sf2-list" data-user-sf2-list><span class="loading-orbit" aria-hidden="true"></span></div>
      <button class="user-sf2-add" type="button" data-user-sf2-action="choose-file"><span>Add SF2</span><strong aria-hidden="true">+</strong></button>
      <input
        class="user-sf2-file"
        type="file"
        accept=".sf2"
        data-user-sf2-file
        hidden
      >
    </section>
  `;
}

function createEmptyCatalogMarkup(): string {
  return '<p class="sound-browser__empty">A biblioteca ainda não possui timbres nesta área.</p>';
}

function escapeMarkup(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

export type { SoundCategoryId };
