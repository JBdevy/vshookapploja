export type PerformanceTrigger =
  | { kind: 'note'; value: string; label: string; active?: boolean; padBank?: PadBankId }
  | { kind: 'effect'; value: string; label: string; active?: boolean; effectBank?: EffectBankId; volumeDb?: number };

export const PAD_BANK_IDS = ['A', 'B'] as const;
export type PadBankId = (typeof PAD_BANK_IDS)[number];
export const EFFECT_BANK_IDS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;
export type EffectBankId = (typeof EFFECT_BANK_IDS)[number];

const CHROMATIC_NOTES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;

const RELATIVE_MINOR_BY_NOTE: Readonly<Record<(typeof CHROMATIC_NOTES)[number], string>> = {
  C: 'Am',
  'C#': 'Bbm',
  D: 'Bm',
  'D#': 'Cm',
  E: 'C#m',
  F: 'Dm',
  'F#': 'Ebm',
  G: 'Em',
  'G#': 'Fm',
  A: 'F#m',
  'A#': 'Gm',
  B: 'G#m',
};

export const EFFECT_COUNT = 12;

export const EFFECT_PAD_COLORS = [
  ['#ff5b38', '#65170b'],
  ['#ff8a22', '#6c2c06'],
  ['#ffc329', '#6b4a04'],
  ['#f3a91f', '#704005'],
  ['#ef6bd7', '#6a195c'],
  ['#35d5f2', '#075164'],
  ['#19bfe8', '#07495f'],
  ['#3288ff', '#0a3269'],
  ['#6d68ff', '#272568'],
  ['#a357f2', '#3d2168'],
  ['#e649ba', '#611546'],
  ['#ff4777', '#6c142d'],
] as const;

function createPadBankButton(bank: PadBankId): string {
  const isSelected = bank === 'A';
  const number = PAD_BANK_IDS.indexOf(bank) + 1;
  return `
    <button
      class="pad-bank-button${isSelected ? ' is-selected' : ''}"
      type="button"
      data-action="select-pad-bank"
      data-pad-bank="${bank}"
      aria-pressed="${isSelected}"
    >Pads ${number}</button>
  `;
}

function createEffectBankButton(bank: EffectBankId): string {
  const isSelected = bank === '1';
  return `
    <button
      class="pad-bank-button${isSelected ? ' is-selected' : ''}"
      type="button"
      data-action="select-effect-bank"
      data-effect-bank="${bank}"
      aria-pressed="${isSelected}"
    ><span>${bank === '1' ? 'Church' : `FX ${bank}`}</span></button>
  `;
}

function createNoteButton(note: string): string {
  const isSharp = note.endsWith('#');
  const relative = RELATIVE_MINOR_BY_NOTE[note as keyof typeof RELATIVE_MINOR_BY_NOTE] ?? '';
  const label = `${note} - ${relative}`;
  return `
    <button
      class="performance-pad performance-pad--note${isSharp ? ' is-sharp' : ''}"
      type="button"
      data-performance-kind="note"
      data-performance-value="${note}"
      aria-label="${label}"
      aria-pressed="false"
    >
      <span>${label}</span>
    </button>
  `;
}

function createEffectButton(effectNumber: number): string {
  const colors = EFFECT_PAD_COLORS[effectNumber - 1] ?? EFFECT_PAD_COLORS[0];
  return `
    <button
      class="performance-pad performance-pad--effect"
      type="button"
      data-performance-kind="effect"
      data-performance-value="${effectNumber}"
      aria-label="Efeito ${effectNumber}"
      style="--effect-accent: ${colors[0]}; --effect-dark: ${colors[1]}"
    >
      <span>Efeito ${effectNumber}</span>
    </button>
  `;
}

export function createPadsEffectsMarkup(): string {
  const notes = CHROMATIC_NOTES.map(createNoteButton).join('');
  const effects = Array.from(
    { length: EFFECT_COUNT },
    (_, index) => createEffectButton(index + 1),
  ).join('');

  return `
    <section class="pads-effects-view" data-player-view="pads-effects" hidden>
      <section class="performance-section performance-section--notes" aria-label="Pads de notas musicais">
        <nav class="pad-bank-selector" aria-label="Bancos dos pads">
          ${PAD_BANK_IDS.map(createPadBankButton).join('')}
          <label class="player-output-knob pad-cutoff-knob" data-pad-low-cut-knob style="--knob-angle:-135deg;--knob-progress:0;--knob-accent:#ffb02e">
            <span>Low</span>
            <span class="player-output-knob__control">
              <span class="player-output-knob__face" aria-hidden="true"><i></i></span>
            </span>
            <input type="range" min="0" max="100" step="0.1" value="0" data-pad-low-cut aria-label="High-pass dos Pads" aria-valuetext="20 Hz">
            <output data-pad-low-cut-value>20 Hz</output>
          </label>
          <label class="player-output-knob pad-cutoff-knob" data-pad-high-cut-knob style="--knob-angle:135deg;--knob-progress:1;--knob-accent:#ffb02e">
            <span>High</span>
            <span class="player-output-knob__control">
              <span class="player-output-knob__face" aria-hidden="true"><i></i></span>
            </span>
            <input type="range" min="0" max="100" step="0.1" value="100" data-pad-high-cut aria-label="Low-pass dos Pads" aria-valuetext="20.0 kHz">
            <output data-pad-high-cut-value>20.0 kHz</output>
          </label>
        </nav>
        <div class="performance-grid performance-grid--notes">${notes}</div>
      </section>

      <section class="performance-section performance-section--effects" aria-label="Efeitos">
        <nav class="pad-bank-selector pad-bank-selector--effects" aria-label="Bancos dos efeitos">
          ${EFFECT_BANK_IDS.map(createEffectBankButton).join('')}
        </nav>
        <div class="performance-grid performance-grid--effects">${effects}</div>
      </section>
    </section>
  `;
}

export function readPerformanceTrigger(button: HTMLButtonElement): PerformanceTrigger | null {
  const kind = button.dataset.performanceKind;
  const value = button.dataset.performanceValue;
  if (!value) return null;

  if (kind === 'note') return { kind, value, label: `Nota ${value}` };
  if (kind === 'effect') return { kind, value, label: `Efeito ${value}` };
  return null;
}
