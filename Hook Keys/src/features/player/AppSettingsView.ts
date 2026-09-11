import type { MidiInputDevice } from '../midi/MidiInputService';
import type { PlayerBottomView } from './PerformanceKeyboard';

export const BUFFER_SIZES = [32, 64, 128, 256, 512] as const;
export type BufferSize = (typeof BUFFER_SIZES)[number];
export const DEFAULT_BUFFER_SIZE: BufferSize = 128;

export function isBufferSize(value: number): value is BufferSize {
  return BUFFER_SIZES.some((bufferSize) => bufferSize === value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function createDeviceOptions(
  devices: readonly MidiInputDevice[],
  selectedDeviceId: string | null,
): string {
  const options = devices.map((device) => `
    <option value="${escapeHtml(device.id)}"${device.id === selectedDeviceId ? ' selected' : ''}>
      ${escapeHtml(device.name)}
    </option>
  `).join('');
  return `<option value=""${selectedDeviceId === null ? ' selected' : ''}>Nenhum</option>${options}`;
}

export function createAppSettingsMarkup(
  devices: readonly MidiInputDevice[],
  selectedDeviceIds: readonly (string | null)[],
  bufferSize: BufferSize,
  compatibilityMode: boolean,
  bottomView: PlayerBottomView,
  allowKeyboardView: boolean,
  uiSoundEnabled: boolean,
  uiVibrationEnabled: boolean,
): string {
  const bufferOptions = BUFFER_SIZES.map((size) =>
    `<option value="${size}"${size === bufferSize ? ' selected' : ''}>${size}</option>`,
  ).join('');

  return `
    <section class="app-settings-panel" aria-label="Configurações">
      ${Array.from({ length: 3 }, (_, index) => `
        <label class="app-settings-field">
          <span>Dispositivo MIDI ${index + 1}</span>
          <select data-setting="midi-device" data-midi-slot="${index}">
            ${createDeviceOptions(devices, selectedDeviceIds[index] ?? null)}
          </select>
        </label>
      `).join('')}

      <label class="app-settings-field">
        <span>Buffer Size</span>
        <select data-setting="buffer-size">
          ${bufferOptions}
        </select>
      </label>

      <label class="app-settings-toggle">
        <span>
          <strong>Modo compatibilidade</strong>
          <small>Para teclados que não são controladores MIDI.</small>
        </span>
        <input type="checkbox" data-setting="compatibility-mode"${compatibilityMode ? ' checked' : ''}>
        <i aria-hidden="true"></i>
      </label>

      <label class="app-settings-toggle">
        <span>
          <strong>Som da interface</strong>
          <small>Som ao tocar em botões, músicas e controles.</small>
        </span>
        <input type="checkbox" data-setting="ui-sound"${uiSoundEnabled ? ' checked' : ''}>
        <i aria-hidden="true"></i>
      </label>

      <label class="app-settings-toggle">
        <span>
          <strong>Vibração da interface</strong>
          <small>Resposta tátil ao tocar e mover controles.</small>
        </span>
        <input type="checkbox" data-setting="ui-vibration"${uiVibrationEnabled ? ' checked' : ''}>
        <i aria-hidden="true"></i>
      </label>

      ${allowKeyboardView ? `<article class="app-settings-display-card">
        <strong>Mostrar</strong>
        <div role="group" aria-label="Conteúdo exibido abaixo dos módulos">
          <button type="button" data-setting-view="presets" class="${bottomView === 'presets' ? 'is-selected' : ''}" aria-pressed="${bottomView === 'presets'}">Presets</button>
          <button type="button" data-setting-view="keyboard" class="${bottomView === 'keyboard' ? 'is-selected' : ''}" aria-pressed="${bottomView === 'keyboard'}">Keyboard</button>
        </div>
      </article>` : ''}
    </section>
  `;
}
