// Hook B3: o módulo 7 toca órgão. No lugar da Biblioteca ele abre esta tela,
// com o Rotary em cima e os nove drawbars embaixo. Cada drawbar tem um SF2
// próprio e o quanto ele está puxado para baixo vira o volume daquela barra.
import { createModuleRotaryMarkup } from './ModuleEffectsView';
import { createParameterKnobMarkup } from './ParameterKnobView';

export interface OrganSettings {
  drawbars: number[];
  // Com o som do drawbar desligado, cada estágio arrastado toca um clique no
  // lugar do timbre — o Volume é só desse clique.
  soundEnabled: boolean;
  clickVolumeDb: number;
}

export const ORGAN_CLICK_VOLUME_MIN_DB = -40;
export const ORGAN_CLICK_VOLUME_MAX_DB = 0;

// Pés de cada barra, na ordem do Hammond. O rótulo de cima é o harmônico.
export const ORGAN_DRAWBARS: readonly { feet: string; name: string; tone: 'red' | 'white' | 'black' }[] = [
  { feet: '16', name: 'Bass 16', tone: 'red' },
  { feet: '5 1/3', name: 'Quint 5 1/3', tone: 'red' },
  { feet: '8', name: 'Flutes 8', tone: 'white' },
  { feet: '4', name: 'Oboes 4', tone: 'white' },
  { feet: '2 2/3', name: 'Tramp 2 2/3', tone: 'black' },
  { feet: '2', name: 'Str 2', tone: 'white' },
  { feet: '1 3/5', name: 'Flutes 1 3/5', tone: 'black' },
  { feet: '1 1/3', name: 'Str 1 1/3', tone: 'black' },
  { feet: '1', name: 'Str 1', tone: 'white' },
];

export const ORGAN_DRAWBAR_MAX = 8;
// Dois LEDs acendem por estágio: 16 quadrados no total, não 8.
const ORGAN_LED_SEGMENTS_PER_STAGE = 2;

// Registro clássico de partida: os três primeiros pés abertos.
const DEFAULT_DRAWBARS = [8, 8, 8, 0, 0, 0, 0, 0, 0];

export function readOrganSettings(value: unknown): OrganSettings {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const stored = Array.isArray(source.drawbars) ? source.drawbars : [];
  const clickVolumeDb = Number(source.clickVolumeDb);
  return {
    drawbars: ORGAN_DRAWBARS.map((_, index) => {
      const bar = Number(stored[index]);
      if (!Number.isFinite(bar)) return DEFAULT_DRAWBARS[index] ?? 0;
      return Math.min(ORGAN_DRAWBAR_MAX, Math.max(0, Math.round(bar)));
    }),
    soundEnabled: typeof source.soundEnabled === 'boolean' ? source.soundEnabled : true,
    clickVolumeDb: Number.isFinite(clickVolumeDb)
      ? Math.min(ORGAN_CLICK_VOLUME_MAX_DB, Math.max(ORGAN_CLICK_VOLUME_MIN_DB, clickVolumeDb))
      : -12,
  };
}

// Quanto cada barra soa, de 0 (fechada, em cima) a 1 (toda puxada, embaixo).
export function organDrawbarGain(position: number): number {
  return Math.min(ORGAN_DRAWBAR_MAX, Math.max(0, position)) / ORGAN_DRAWBAR_MAX;
}

function drawbarMarkup(index: number, position: number): string {
  const drawbar = ORGAN_DRAWBARS[index] ?? ORGAN_DRAWBARS[0]!;
  return `
    <div class="organ-drawbar organ-drawbar--${drawbar.tone}" style="--drawbar-position:${position}">
      <span class="organ-drawbar__feet">${drawbar.feet}</span>
      <div class="organ-drawbar__body">
        <div class="organ-drawbar__track" data-organ-drawbar-track="${index}"
          role="slider" tabindex="0" aria-label="${drawbar.name}"
          aria-valuemin="0" aria-valuemax="${ORGAN_DRAWBAR_MAX}" aria-valuenow="${position}"
          aria-valuetext="${position} de ${ORGAN_DRAWBAR_MAX}">
          <span class="organ-drawbar__ticks" aria-hidden="true">${
            Array.from({ length: ORGAN_DRAWBAR_MAX }, (_, i) => ORGAN_DRAWBAR_MAX - i)
              .map((step) => `<span>${step}</span>`).join('')}</span>
          <b class="organ-drawbar__grip" aria-hidden="true"></b>
        </div>
        <span class="organ-drawbar__leds" aria-hidden="true">${
          Array.from({ length: ORGAN_DRAWBAR_MAX * ORGAN_LED_SEGMENTS_PER_STAGE }, (_, i) => i + 1)
            .map((step) => `<i class="${step <= position * ORGAN_LED_SEGMENTS_PER_STAGE ? 'is-lit' : ''}"></i>`).join('')}</span>
      </div>
      <input type="range" min="0" max="${ORGAN_DRAWBAR_MAX}" step="1" value="${position}"
        data-organ-drawbar="${index}" aria-hidden="true" tabindex="-1">
      <output data-organ-drawbar-value="${index}">${position}</output>
    </div>
  `;
}

// Knob do clique + o toggle Drawbar Sound: ficam na mesma linha do título
// Hook B3, no cabeçalho do modal — não dentro do painel.
export function createOrganHeaderControlsMarkup(moduleSettings: Readonly<Record<string, unknown>>): string {
  const settings = readOrganSettings(moduleSettings.organ);
  const progress = (settings.clickVolumeDb - ORGAN_CLICK_VOLUME_MIN_DB)
    / (ORGAN_CLICK_VOLUME_MAX_DB - ORGAN_CLICK_VOLUME_MIN_DB);
  return `
    <div class="organ-header-controls">
      <label class="pattern-knob module-effect-knob organ-header-controls__volume">
        <span>Volume</span>
        ${createParameterKnobMarkup(progress,
    `<input type="range" min="${ORGAN_CLICK_VOLUME_MIN_DB}" max="${ORGAN_CLICK_VOLUME_MAX_DB}" step="1"
              value="${settings.clickVolumeDb}" data-organ-click-volume aria-label="Volume do clique"
              aria-valuetext="${settings.clickVolumeDb.toFixed(0)} dB">`)}
        <output>${settings.clickVolumeDb.toFixed(0)} dB</output>
      </label>
      <button class="organ-header-controls__toggle ${settings.soundEnabled ? 'is-on' : 'is-off'}" type="button"
        data-organ-sound-toggle aria-pressed="${settings.soundEnabled}">
        Drawbar Sound
      </button>
    </div>
  `;
}

export function createOrganMarkup(moduleSettings: Readonly<Record<string, unknown>>): string {
  const settings = readOrganSettings(moduleSettings.organ);
  return `
    <section class="organ-panel" data-organ-panel>
      ${createModuleRotaryMarkup(moduleSettings)}
      <div class="organ-drawbars" role="group" aria-label="Drawbars">
        ${settings.drawbars.map((position, index) => drawbarMarkup(index, position)).join('')}
      </div>
    </section>
  `;
}
