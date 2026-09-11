import type { MidiInputDevice } from '../midi/MidiInputService';
import type { PlayerBottomView } from './PerformanceKeyboard';
import { createAudioRouteOptions, type AudioBusRouting, type AudioOutputDevice } from '../audio/AudioOutputService';

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
  compatibilityMode: boolean,
  bottomView: PlayerBottomView,
  allowKeyboardView: boolean,
): string {
  return `
    <section class="app-settings-panel app-settings-panel--main" aria-label="Configurações">
      <button class="app-settings-navigation-card" type="button" data-settings-page="midi">
        <strong>Dispositivos MIDI</strong>
        <small>Entradas MIDI e tamanho do buffer</small>
      </button>

      <button class="app-settings-navigation-card" type="button" data-settings-page="audio">
        <strong>Dispositivo de áudio</strong>
        <small>Placa de áudio e canais de saída</small>
      </button>

      <label class="app-settings-toggle app-settings-toggle--compatibility">
        <span>
          <strong>Modo compatibilidade</strong>
          <small>Para teclados que não são controladores MIDI.</small>
        </span>
        <input type="checkbox" data-setting="compatibility-mode"${compatibilityMode ? ' checked' : ''}>
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

export function createMidiSettingsMarkup(
  devices: readonly MidiInputDevice[],
  selectedDeviceIds: readonly (string | null)[],
): string {
  return `
    <section class="app-settings-panel app-settings-panel--devices" aria-label="Dispositivos MIDI">
      ${Array.from({ length: 3 }, (_, index) => `
        <label class="app-settings-field app-settings-field--midi" data-midi-field="${index + 1}">
          <span>Dispositivo MIDI ${index + 1}</span>
          <select data-setting="midi-device" data-midi-slot="${index}">
            ${createDeviceOptions(devices, selectedDeviceIds[index] ?? null)}
          </select>
        </label>
      `).join('')}

    </section>
  `;
}

export function createAudioSettingsMarkup(
  audioDevices: readonly AudioOutputDevice[],
  selectedAudioDeviceId: string,
  audioRouting: AudioBusRouting,
  bufferSize: BufferSize,
): string {
  const bufferOptions = BUFFER_SIZES.map((size) =>
    `<option value="${size}"${size === bufferSize ? ' selected' : ''}>${size}</option>`,
  ).join('');
  const selectedAudioDevice = audioDevices.find(({ id }) => id === selectedAudioDeviceId);
  const channelCount = selectedAudioDevice?.channels ?? 2;
  const audioDeviceOptions = audioDevices.map((device) => `
    <option value="${escapeHtml(device.id)}"${device.id === selectedAudioDeviceId ? ' selected' : ''}>${escapeHtml(device.name)} · ${device.channels} canais</option>
  `).join('');

  return `
    <section class="app-settings-panel app-settings-panel--devices" aria-label="Dispositivo de áudio">
      <label class="app-settings-field app-settings-field--audio-device">
        <span>Dispositivo de áudio</span>
        <select data-setting="audio-device">
          <option value=""${selectedAudioDeviceId === '' ? ' selected' : ''}>Padrão</option>
          ${audioDeviceOptions}
        </select>
      </label>

      <label class="app-settings-field app-settings-field--buffer">
        <span>Buffer Size</span>
        <select data-setting="buffer-size">${bufferOptions}</select>
      </label>

      ${([
        ['pads', 'Saídas - Pads'],
        ['effects', 'Saídas - Effects'],
      ] as const).map(([bus, label]) => `
        <label class="app-settings-field app-settings-field--audio-route" data-audio-route-field="${bus}">
          <span>${label}</span>
          <select data-setting="audio-route" data-audio-bus="${bus}">
            ${createAudioRouteOptions(channelCount, audioRouting[bus])}
          </select>
        </label>
      `).join('')}

    </section>
  `;
}
