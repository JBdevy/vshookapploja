// Hook B3: o módulo 7 toca órgão. No lugar da Biblioteca ele abre esta tela,
// com cinco presets e os nove drawbars. Cada drawbar tem um SF2 próprio e o
// quanto ele está puxado para baixo vira o volume daquela barra.
import { createModuleRotaryMarkup } from './ModuleEffectsView';

export interface OrganSettings {
  preset: number;
  drawbars: number[];
}

// Pés de cada barra, na ordem do Hammond. O rótulo de cima é o harmônico.
export const ORGAN_DRAWBARS: readonly { feet: string; name: string; tone: 'brown' | 'white' | 'black' }[] = [
  { feet: '16', name: 'Bass 16', tone: 'brown' },
  { feet: '5 1/3', name: 'Quint 5 1/3', tone: 'brown' },
  { feet: '8', name: 'Flutes 8', tone: 'white' },
  { feet: '4', name: 'Oboes 4', tone: 'white' },
  { feet: '2 2/3', name: 'Tramp 2 2/3', tone: 'black' },
  { feet: '2', name: 'Str 2', tone: 'white' },
  { feet: '1 3/5', name: 'Flutes 1 3/5', tone: 'black' },
  { feet: '1 1/3', name: 'Str 1 1/3', tone: 'black' },
  { feet: '1', name: 'Str 1', tone: 'white' },
];

export const ORGAN_PRESET_COUNT = 5;
export const ORGAN_DRAWBAR_MAX = 8;

// Registro clássico de partida: os três primeiros pés abertos.
const DEFAULT_DRAWBARS = [8, 8, 8, 0, 0, 0, 0, 0, 0];

export function readOrganSettings(value: unknown): OrganSettings {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const stored = Array.isArray(source.drawbars) ? source.drawbars : [];
  const preset = Number(source.preset);
  return {
    preset: Number.isInteger(preset) && preset >= 1 && preset <= ORGAN_PRESET_COUNT ? preset : 1,
    drawbars: ORGAN_DRAWBARS.map((_, index) => {
      const bar = Number(stored[index]);
      if (!Number.isFinite(bar)) return DEFAULT_DRAWBARS[index] ?? 0;
      return Math.min(ORGAN_DRAWBAR_MAX, Math.max(0, Math.round(bar)));
    }),
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
      <div class="organ-drawbar__track" data-organ-drawbar-track="${index}"
        role="slider" tabindex="0" aria-label="${drawbar.name}"
        aria-valuemin="0" aria-valuemax="${ORGAN_DRAWBAR_MAX}" aria-valuenow="${position}"
        aria-valuetext="${position} de ${ORGAN_DRAWBAR_MAX}">
        <i class="organ-drawbar__stem" aria-hidden="true"></i>
        <b class="organ-drawbar__grip" aria-hidden="true"><s></s><s></s><s></s></b>
      </div>
      <input type="range" min="0" max="${ORGAN_DRAWBAR_MAX}" step="1" value="${position}"
        data-organ-drawbar="${index}" aria-hidden="true" tabindex="-1">
      <output data-organ-drawbar-value="${index}">${position}</output>
    </div>
  `;
}

export function createOrganMarkup(moduleSettings: Readonly<Record<string, unknown>>): string {
  const settings = readOrganSettings(moduleSettings.organ);
  return `
    <section class="organ-panel" data-organ-panel>
      <div class="organ-presets" role="group" aria-label="Presets do órgão">
        ${Array.from({ length: ORGAN_PRESET_COUNT }, (_, index) => index + 1).map((preset) => `
          <button type="button" data-organ-preset="${preset}"
            class="${settings.preset === preset ? 'is-selected' : ''}"
            aria-pressed="${settings.preset === preset}">Preset ${preset}</button>
        `).join('')}
      </div>
      <div class="organ-drawbars" role="group" aria-label="Drawbars">
        ${settings.drawbars.map((position, index) => drawbarMarkup(index, position)).join('')}
      </div>
      ${createModuleRotaryMarkup(moduleSettings)}
    </section>
  `;
}
