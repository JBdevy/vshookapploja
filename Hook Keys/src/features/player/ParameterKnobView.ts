/** Shared parameter knob: Synth and timbre parameters use the same face and track. */
export function createParameterKnobMarkup(progressValue: number, inputMarkup: string): string {
  const progress = Number.isFinite(progressValue) ? Math.min(1, Math.max(0, progressValue)) : 0;
  const angle = -135 + progress * 270;
  return `
    <label class="module-envelope-knob" style="--knob-angle:${angle}deg;--knob-progress:${progress}">
      <span class="module-envelope-knob__face" aria-hidden="true"><i></i></span>
      ${inputMarkup}
    </label>
  `;
}
