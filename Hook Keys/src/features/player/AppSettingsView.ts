import type { MidiInputDevice } from '../midi/MidiInputService';
import type { PerformanceKeyboardStyle, PlayerBottomView } from './PerformanceKeyboard';
import { createAudioRouteOptions, type AudioBusRouting, type AudioOutputDevice } from '../audio/AudioOutputService';

export const BUFFER_SIZES = [64, 128, 256, 512] as const;
export type BufferSize = (typeof BUFFER_SIZES)[number];
// 128 quadros sao 2,7 ms a 48 kHz: uma unica falta de pagina ou um bloco no
// nucleo eficiente ja estoura o prazo. 256 da o dobro de folga e continua
// abaixo de 6 ms de latencia, imperceptivel ao tocar.
export const DEFAULT_BUFFER_SIZE: BufferSize = 256;
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

// No desktop os presets e o teclado convivem, entao a barra Mostrar nao
// aparece - e era so por ela que se chegava ao estilo do teclado. Sem isto o
// aparelho ficava preso no ultimo estilo salvo, sem nenhum caminho de volta.
const KEYBOARD_STYLE_CHOICES: ReadonlyArray<readonly [PerformanceKeyboardStyle, string]> = [
  ['standard', 'Default'],
  ['black', 'Black'],
  ['neon', 'Neon'],
];

export function createAppSettingsMarkup(
  compatibilityMode: boolean,
  seamlessPresetSwitching: boolean,
  bottomView: PlayerBottomView,
  allowKeyboardView: boolean,
  keyboardMidiSlot: number = 1,
  keyboardStyle: PerformanceKeyboardStyle = 'standard',
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

      <label class="app-settings-toggle app-settings-toggle--seamless-presets">
        <span>
          <strong>Troca de preset sem corte</strong>
          <small>Maior consumo de RAM.</small>
        </span>
        <input type="checkbox" data-setting="seamless-preset-switching"${seamlessPresetSwitching ? ' checked' : ''}>
        <i aria-hidden="true"></i>
      </label>

      ${allowKeyboardView ? `<article class="app-settings-display-card">
        <strong>Mostrar</strong>
        <div role="group" aria-label="Conteúdo exibido abaixo dos módulos">
          <button type="button" data-setting-view="presets" class="${bottomView === 'presets' ? 'is-selected' : ''}" aria-pressed="${bottomView === 'presets'}">Presets</button>
          <button type="button" data-setting-view="keyboard" class="${bottomView === 'keyboard' ? 'is-selected' : ''}" aria-pressed="${bottomView === 'keyboard'}">Keyboard</button>
        </div>
      </article>` : `<article class="app-settings-display-card app-settings-display-card--desktop-keyboard">
        <strong>Keyboard</strong>
        <div role="group" aria-label="Entrada MIDI que toca e ilumina o teclado">
          ${[1, 2, 3].map((slot) => `<button type="button" data-desktop-keyboard-midi-slot="${slot}" class="${slot === keyboardMidiSlot ? 'is-selected' : ''}" aria-pressed="${slot === keyboardMidiSlot}">MIDI ${slot}</button>`).join('')}
        </div>
        <strong>Estilo</strong>
        <div role="group" aria-label="Estilo visual do teclado">
          ${KEYBOARD_STYLE_CHOICES.map(([style, label]) => `<button type="button" data-keyboard-style="${style}" class="${style === keyboardStyle ? 'is-selected' : ''}" aria-pressed="${style === keyboardStyle}">${label}</button>`).join('')}
        </div>
      </article>`}
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
        ['metronome', 'Saídas - Metrônomo'],
      ] as const).map(([bus, label]) => `
        <label class="app-settings-field app-settings-field--audio-route" data-audio-route-field="${bus}">
          <span>${label}</span>
          <select data-setting="audio-route" data-audio-bus="${bus}">
            ${createAudioRouteOptions(channelCount, audioRouting[bus])}
          </select>
        </label>
      `).join('')}

      <!-- Músicas saem sempre em 1+2: o seletor só mostra a saída. -->
      <label class="app-settings-field app-settings-field--audio-route" data-audio-route-field="music">
        <span>Saídas - Músicas</span>
        <select data-setting="music-route" disabled aria-disabled="true">
          <option value="stereo:0" selected>1+2</option>
        </select>
      </label>

    </section>
  `;
}
