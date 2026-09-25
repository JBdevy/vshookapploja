import { createParameterKnobMarkup } from './ParameterKnobView';

const MIN_GLIDE_BPM = 60;
const MAX_GLIDE_BPM = 600;

// Sem botão ON/OFF: 0 ms é o Glide desligado, e é o padrão dos módulos.
export const DEFAULT_MODULE_GLIDE_MS = 0;

export function readGlideMs(settings: Readonly<Record<string, unknown>>): number {
  const value = Number(settings.glideMs ?? DEFAULT_MODULE_GLIDE_MS);
  return Number.isFinite(value) ? Math.min(5000, Math.max(0, value)) : DEFAULT_MODULE_GLIDE_MS;
}

// No Sens: o volume não segue a velocity. O Synth nasce ligado; timbres, desligados.
export function readNoVelocitySensitivity(
  settings: Readonly<Record<string, unknown>>,
  owner: 'module' | 'synth' = 'module',
) {
  return typeof settings.noVelocitySensitivity === 'boolean' ? settings.noVelocitySensitivity : owner === 'synth';
}

export function readGlideSync(settings: Readonly<Record<string, unknown>>): boolean {
  return settings.glideSync === true;
}

// Legato: só a primeira nota depois do silêncio ataca o envelope; as demais,
// em Mono, só deslizam o pitch da voz que já está soando.
export function readLegato(settings: Readonly<Record<string, unknown>>): boolean {
  return settings.legato === true;
}

export function readGlideBpm(bpm: number): number {
  return Math.round(Math.min(MAX_GLIDE_BPM, Math.max(
    MIN_GLIDE_BPM,
    Number.isFinite(bpm) ? bpm : 120,
  )));
}

// Glide sincronizado acompanha diretamente a duração de uma batida do BPM
// global. Não existe divisão musical própria: 120 BPM = 500 ms, 60 BPM = 1 s.
export function glideMillisecondsForBpm(bpm: number): number {
  return Math.round(60_000 / readGlideBpm(bpm));
}

export function effectiveGlideMs(settings: Readonly<Record<string, unknown>>, bpm: number): number {
  return readGlideSync(settings)
    ? glideMillisecondsForBpm(bpm)
    : readGlideMs(settings);
}

export type GlideMode = 'auto' | 'portamento';

export interface GlideVelocitySettings {
  enabled: boolean;
  inverted: boolean;
  threshold: number;
}

export const DEFAULT_GLIDE_VELOCITY_THRESHOLD = 64;

// Auto: cada nota sobe de um tom abaixo dela mesma. Portamento: desliza a partir
// da nota anterior.
export function readGlideMode(settings: Readonly<Record<string, unknown>>): GlideMode {
  return settings.glideMode === 'portamento' ? 'portamento' : 'auto';
}

// O Glide deixa de atuar a partir do limite de velocity (ou abaixo dele, invertido).
export function readGlideVelocity(settings: Readonly<Record<string, unknown>>): GlideVelocitySettings {
  const threshold = Number(settings.glideVelocityThreshold);
  return {
    enabled: settings.glideVelocityEnabled === true,
    inverted: settings.glideVelocityInverted === true,
    threshold: Number.isFinite(threshold)
      ? Math.round(Math.min(127, Math.max(0, threshold)))
      : DEFAULT_GLIDE_VELOCITY_THRESHOLD,
  };
}

export function glideVelocityDescription(velocity: GlideVelocitySettings): string {
  if (!velocity.enabled) return 'Desligado: o Glide atua em todas as notas.';
  return velocity.inverted
    ? `Notas com velocity abaixo de ${velocity.threshold} tocam sem Glide.`
    : `Notas com velocity ${velocity.threshold} ou mais tocam sem Glide.`;
}

export function createGlideVelocityMarkup(settings: Readonly<Record<string, unknown>>): string {
  const velocity = readGlideVelocity(settings);
  return `
    <section class="glide-velocity-editor" data-glide-velocity-editor data-enabled="${velocity.enabled}" data-inverted="${velocity.inverted}" style="--glide-threshold:${(velocity.threshold / 127) * 100}%">
      <div class="glide-velocity-editor__switches">
        <button type="button" class="module-glide-power" data-glide-velocity-power aria-pressed="${velocity.enabled}">${velocity.enabled ? 'ON' : 'OFF'}</button>
        <button type="button" class="module-glide-sync" data-glide-velocity-invert aria-pressed="${velocity.inverted}">Inverter</button>
      </div>
      <div class="glide-velocity-meter" aria-hidden="true">
        <span class="glide-velocity-meter__low"></span>
        <span class="glide-velocity-meter__high"></span>
        <i></i>
      </div>
      <div class="glide-velocity-meter__labels" aria-hidden="true"><span>0</span><span>127</span></div>
      <label class="velocity-fixed-control">
        <span>Limite de velocity</span>
        <input type="range" min="0" max="127" step="1" value="${velocity.threshold}" data-glide-velocity-threshold aria-label="Limite de velocity do Glide">
        <output data-glide-velocity-output>${velocity.threshold}</output>
      </label>
      <p data-glide-velocity-help>${glideVelocityDescription(velocity)}</p>
    </section>
  `;
}

export function updateGlideVelocityMarkup(container: HTMLElement, velocity: GlideVelocitySettings): void {
  container.dataset.enabled = String(velocity.enabled);
  container.dataset.inverted = String(velocity.inverted);
  container.style.setProperty('--glide-threshold', `${(velocity.threshold / 127) * 100}%`);
  const power = container.querySelector<HTMLButtonElement>('[data-glide-velocity-power]');
  if (power) {
    power.setAttribute('aria-pressed', String(velocity.enabled));
    power.textContent = velocity.enabled ? 'ON' : 'OFF';
  }
  container.querySelector('[data-glide-velocity-invert]')?.setAttribute('aria-pressed', String(velocity.inverted));
  const input = container.querySelector<HTMLInputElement>('[data-glide-velocity-threshold]');
  if (input && input.value !== String(velocity.threshold)) input.value = String(velocity.threshold);
  const output = container.querySelector<HTMLOutputElement>('[data-glide-velocity-output]');
  if (output) output.value = String(velocity.threshold);
  const help = container.querySelector<HTMLElement>('[data-glide-velocity-help]');
  if (help) help.textContent = glideVelocityDescription(velocity);
}

function glideDialMarkup(
  settings: Readonly<Record<string, unknown>>,
  bpm: number,
  ownerAttribute: string,
  label: string,
): string {
  const synchronized = readGlideSync(settings);
  const manualMilliseconds = readGlideMs(settings);
  const synchronizedBpm = readGlideBpm(bpm);
  const value = synchronized ? synchronizedBpm : manualMilliseconds;
  const minimum = synchronized ? MIN_GLIDE_BPM : 0;
  const maximum = synchronized ? MAX_GLIDE_BPM : 5000;
  const progress = (value - minimum) / (maximum - minimum);
  const valueText = synchronized ? `${synchronizedBpm} BPM` : formatGlideMs(manualMilliseconds);
  return `<div class="module-glide-card__dial">
      <strong>${label}</strong>
    ${createParameterKnobMarkup(progress,
      `<input type="range" min="${minimum}" max="${maximum}" step="1" value="${value}" data-glide-time data-glide-synced="${synchronized}"${ownerAttribute}${synchronized ? ' disabled' : ''} aria-label="${synchronized ? 'BPM sincronizado do Glide' : 'Tempo do Glide'}" aria-valuetext="${valueText}">`)}
      <output data-glide-value>${valueText}</output>
    </div>`;
}

export function createGlideCardMarkup(
  settings: Readonly<Record<string, unknown>>,
  bpm: number,
  owner: 'module' | 'synth' = 'module',
): string {
  const synchronized = readGlideSync(settings);
  const ownerAttribute = owner === 'synth' ? ' data-synth-parameter="glideMs"' : '';
  const mode = readGlideMode(settings);
  const velocity = readGlideVelocity(settings);
  const noSens = readNoVelocitySensitivity(settings, owner);

  // Os 4 botões ocupam a esquerda do card em 2x2; à direita, o nome do modo
  // fica em cima do knob e o valor embaixo.
  return `<article class="module-glide-card${owner === 'synth' ? ' synth-card' : ''}" data-module-glide-card data-glide-owner="${owner}">
    <div class="module-glide-card__buttons" role="group" aria-label="Opções do Glide">
        <button type="button" class="module-glide-sync" data-glide-sync aria-pressed="${synchronized}">Sync</button>
        <button type="button" class="module-glide-mode is-${mode}" data-glide-mode="${mode}" aria-label="Modo do Glide: ${mode === 'portamento' ? 'Portamento, a partir da nota anterior' : 'Auto, um tom abaixo'}. Alternar">${mode === 'portamento' ? 'Portamento' : 'Auto'}</button>
        <button type="button" class="module-glide-config${velocity.enabled ? ' is-active' : ''}" data-glide-config aria-label="Configurar velocity do Glide${velocity.enabled ? ', ativo' : ''}">Config</button>
        <button type="button" class="module-glide-no-sens" data-glide-no-sens aria-pressed="${noSens}" aria-label="No Sens: volume ${noSens ? 'igual em qualquer toque' : 'segue o velocity'}">No Sens</button>
    </div>
    ${glideDialMarkup(settings, bpm, ownerAttribute, mode === 'portamento' ? 'Portamento' : 'Glide')}
  </article>`;
}

// Toque longo no botão Mono/Poly: legato liga/desliga e o tempo do
// portamento (o mesmo Glide do card principal, só que em foco aqui).
export function createVoiceModeMarkup(
  settings: Readonly<Record<string, unknown>>,
  bpm: number,
  owner: 'module' | 'synth' = 'module',
): string {
  const synchronized = readGlideSync(settings);
  const legato = readLegato(settings);
  const ownerAttribute = owner === 'synth' ? ' data-synth-parameter="glideMs"' : '';
  return `<article class="module-glide-card module-voice-mode-editor" data-module-glide-card data-glide-owner="${owner}">
    <div class="module-glide-card__buttons module-glide-card__buttons--voice-mode" role="group" aria-label="Opções do Mono">
        <button type="button" class="module-glide-sync" data-glide-sync aria-pressed="${synchronized}">Sync</button>
        <button type="button" class="module-glide-mode is-${legato ? 'portamento' : 'auto'}" data-voice-mode-legato aria-pressed="${legato}" aria-label="Legato: ${legato ? 'ligado, só a primeira nota ataca o envelope' : 'desligado, toda nota ataca de novo'}. Alternar">Legato</button>
    </div>
    ${glideDialMarkup(settings, bpm, ownerAttribute, 'Portamento')}
  </article>`;
}

export function formatGlideMs(milliseconds: number): string {
  const value = Math.round(Math.min(5000, Math.max(0, milliseconds)));
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k ms` : `${value} ms`;
}
