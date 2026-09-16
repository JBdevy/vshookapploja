import type { SoundCatalogCategory } from '../sound-library/SoundCatalog';
import type { SoundCategoryId } from '../sound-library/SoundCategories';
import { createOnScreenKeyboardMarkup } from '../../shared/ui/OnScreenKeyboard';

function soundButtonStyle(color: string): string {
  return `--sound-button-color:${color}`;
}

export function createSoundSelectionMarkup(
  selectedCategory: SoundCategoryId,
  categories: readonly SoundCatalogCategory[],
  useTabletKeyboard = false,
  installedSoundIds: ReadonlySet<string> = new Set(),
  selectedTimbreId: string | null = null,
): string {
  const activeCategory = selectedCategory === 'user' || categories.some(({ id }) => id === selectedCategory)
    ? selectedCategory
    : categories[0]?.id ?? '';
  const categoryButtons = categories.map((category, index) => {
    const isSelected = category.id === activeCategory;
    return `
      <button
        class="sound-category-button${isSelected ? ' is-selected' : ''}"
        type="button"
        data-sound-category="${escapeMarkup(category.id)}"
        aria-pressed="${isSelected}"
        style="${soundButtonStyle(category.color)}"
      >${index + 1} - ${escapeMarkup(category.name)}</button>
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
        ${activeCategory ? createSoundCategoryContentMarkup(activeCategory, categories, useTabletKeyboard, installedSoundIds, selectedTimbreId) : createEmptyCatalogMarkup()}
      </div>
    </section>
  `;
}

export function createSoundCategoryContentMarkup(
  categoryId: SoundCategoryId,
  categories: readonly SoundCatalogCategory[],
  useTabletKeyboard = false,
  installedSoundIds: ReadonlySet<string> = new Set(),
  selectedTimbreId: string | null = null,
): string {
  if (categoryId !== 'user') {
    const category = categories.find(({ id }) => id === categoryId);
    if (!category) return createEmptyCatalogMarkup();
    return `
      <section class="fixed-sound-panel">
        <header class="fixed-sound-panel__header">
          <h3>${escapeMarkup(category.name)}</h3>
          <button class="fixed-sound-clean" type="button" data-sound-clean
            aria-label="Deixar o modulo sem timbre selecionado">Clean</button>
        </header>
        <div class="fixed-sound-grid">
          ${category.sounds.map((sound) => {
            const installed = installedSoundIds.has(sound.id);
            const selected = selectedTimbreId === `fixed:${sound.id}`;
            return `
              <button class="${installed ? 'is-installed' : 'is-downloadable'}${selected ? ' is-current-timbre' : ''}" type="button" data-fixed-sound-id="${escapeMarkup(sound.id)}" style="${soundButtonStyle(sound.color)}" aria-current="${selected}" aria-label="${escapeMarkup(sound.name)}. ${installed ? 'Baixado' : 'Não baixado'}${selected ? '. Selecionado neste módulo' : ''}">
                <span>${escapeMarkup(sound.name)}</span><small>${installed ? 'No dispositivo' : 'Baixar'}</small>
              </button>
            `;
          }).join('') || '<p class="sound-browser__empty">Nenhum timbre cadastrado nesta categoria.</p>'}
        </div>
      </section>
    `;
  }
  return createUserSoundfontMarkup(useTabletKeyboard);
}

export function createUserSoundfontMarkup(useTabletKeyboard: boolean): string {
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
      <button class="user-sf2-add" type="button" data-user-sf2-action="name"><span>Add SF2</span><strong aria-hidden="true">+</strong></button>
      <input
        class="user-sf2-file"
        type="file"
        accept=".sf2"
        data-user-sf2-file
        hidden
      >
      <div class="user-sf2-name user-sf2-name--${useTabletKeyboard ? 'custom' : 'system'}" data-user-sf2-name hidden>
        <label>
          <span>Nome do timbre</span>
          ${useTabletKeyboard
            ? `<span class="on-screen-text-field" role="textbox" tabindex="0" aria-label="Nome do timbre" aria-readonly="true" data-user-sf2-name-field><span data-user-sf2-name-value></span><i aria-hidden="true"></i></span><input type="hidden" data-user-sf2-name-input>`
            : '<input type="text" maxlength="12" autocomplete="off" autocapitalize="words" data-user-sf2-name-input>'}
        </label>
        ${useTabletKeyboard ? createOnScreenKeyboardMarkup('Teclado para o nome do timbre', true) : ''}
        <p data-user-sf2-message role="alert"></p>
        <div class="user-sf2-name__actions">
          <button type="button" data-user-sf2-action="cancel">Cancelar</button>
          <button type="button" data-user-sf2-action="choose-file">Confirmar</button>
        </div>
      </div>
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
