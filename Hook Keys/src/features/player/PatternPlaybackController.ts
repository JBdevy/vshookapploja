import {
  patternStepMilliseconds,
  readArpeggiatorSettings,
  readSequencerSettings,
  type ArpeggiatorSettings,
} from './PatternModulesView';

export const ARPEGGIATOR_ENGINE_INPUT = 4;
export const SEQUENCER_ENGINE_INPUT = 5;

export interface PatternInput {
  inputId: string | null;
  noteNumber: number;
  pressed: boolean;
  velocity: number;
}

export interface PatternPlaybackSnapshot {
  bpm: number;
  arpeggiator: {
    moduleEnabled: boolean;
    hasSound: boolean;
    midiInputId: string | null;
    lowNote: number;
    highNote: number;
    settings: unknown;
  };
  sequencer: {
    moduleEnabled: boolean;
    hasSound: boolean;
    midiInputId: string | null;
    lowNote: number;
    highNote: number;
    settings: unknown;
  };
}

interface HeldNote {
  inputId: string | null;
  noteNumber: number;
  velocity: number;
  order: number;
}

interface PlaybackState {
  held: HeldNote[];
  timer: number | null;
  releaseTimer: number | null;
  playingNote: number | null;
  step: number;
  nextAt: number | null;
}

type PatternKind = 'arpeggiator' | 'sequencer';

export class PatternPlaybackController {
  private order = 0;
  private readonly arpeggiator = createPlaybackState();
  private readonly sequencer = createPlaybackState();

  constructor(
    private readonly snapshot: () => PatternPlaybackSnapshot,
    private readonly send: (slot: number, status: number, note: number, velocity: number) => void,
    private readonly pulse: (kind: PatternKind, step: number | null) => void = () => {},
  ) {}

  handleInput(input: PatternInput): void {
    const snapshot = this.snapshot();
    this.handleForKind('arpeggiator', this.arpeggiator, snapshot.arpeggiator, input);
    this.handleForKind('sequencer', this.sequencer, snapshot.sequencer, input);
  }

  settingsChanged(): void {
    const snapshot = this.snapshot();
    this.reconcile('arpeggiator', this.arpeggiator, isArpeggiatorActive(snapshot));
    this.reconcile('sequencer', this.sequencer, isSequencerActive(snapshot));
  }

  reset(): void {
    this.stop('arpeggiator', this.arpeggiator, true);
    this.stop('sequencer', this.sequencer, true);
  }

  destroy(): void {
    this.reset();
  }

  private handleForKind(
    kind: PatternKind,
    state: PlaybackState,
    config: PatternPlaybackSnapshot[PatternKind],
    input: PatternInput,
  ): void {
    if (!config.moduleEnabled || !config.hasSound || !patternEnabled(kind, config.settings)) {
      if (state.held.length > 0 || state.timer !== null) this.stop(kind, state, true);
      return;
    }
    if (!acceptsInput(config.midiInputId, input.inputId)) return;
    const existing = state.held.findIndex((held) => held.noteNumber === input.noteNumber && held.inputId === input.inputId);
    if (input.pressed) {
      if (input.noteNumber < config.lowNote || input.noteNumber > config.highNote) return;
      const note: HeldNote = {
        inputId: input.inputId,
        noteNumber: clampMidi(input.noteNumber),
        velocity: Math.min(127, Math.max(1, Math.round(input.velocity))),
        order: ++this.order,
      };
      if (existing >= 0) state.held.splice(existing, 1);
      state.held.push(note);
      if (state.timer === null) {
        state.step = 0;
        this.tick(kind, state);
      }
      return;
    }
    if (existing >= 0) state.held.splice(existing, 1);
    if (state.held.length === 0) this.stop(kind, state, false);
  }

  private reconcile(kind: PatternKind, state: PlaybackState, active: boolean): void {
    if (!active) this.stop(kind, state, true);
    else if (state.held.length > 0 && state.timer === null) this.tick(kind, state);
  }

  private tick(kind: PatternKind, state: PlaybackState): void {
    state.timer = null;
    const snapshot = this.snapshot();
    const active = kind === 'arpeggiator' ? isArpeggiatorActive(snapshot) : isSequencerActive(snapshot);
    if (!active || state.held.length === 0) {
      this.stop(kind, state, !active);
      return;
    }

    if (state.playingNote !== null) this.noteOff(kind, state);
    if (kind === 'arpeggiator') {
      const settings = readArpeggiatorSettings(snapshot.arpeggiator.settings);
      const notes = arpeggiatorNotes(state.held, settings);
      if (notes.length > 0) {
        const note = notes[state.step % notes.length];
        if (note !== undefined) {
          const velocity = velocityForNote(state.held, note);
          this.noteOn(kind, state, note, velocity, settings.gate, patternStepMilliseconds(snapshot.bpm, settings.division, settings.swing, state.step));
        }
      }
      this.pulse(kind, state.step % Math.max(1, notes.length));
      const duration = patternStepMilliseconds(snapshot.bpm, settings.division, settings.swing, state.step);
      state.step = (state.step + 1) % Math.max(1, notes.length);
      this.scheduleNext(kind, state, duration);
      return;
    }

    const settings = readSequencerSettings(snapshot.sequencer.settings);
    const stepIndex = state.step % settings.length;
    const step = settings.steps[stepIndex];
    const root = newestHeldNote(state.held);
    const duration = patternStepMilliseconds(snapshot.bpm, settings.division, settings.swing, stepIndex);
    if (step?.enabled && root) {
      const note = clampMidi(root.noteNumber + step.semitone);
      const velocity = Math.max(1, Math.round((root.velocity * step.velocity) / 127));
      this.noteOn(kind, state, note, velocity, step.gate, duration);
    }
    this.pulse(kind, stepIndex);
    state.step = (stepIndex + 1) % settings.length;
    this.scheduleNext(kind, state, duration);
  }

  private scheduleNext(kind: PatternKind, state: PlaybackState, duration: number): void {
    const now = Date.now();
    state.nextAt = (state.nextAt ?? now) + duration;
    state.timer = window.setTimeout(() => this.tick(kind, state), Math.max(0, state.nextAt - now));
  }

  private noteOn(kind: PatternKind, state: PlaybackState, note: number, velocity: number, gate: number, duration: number): void {
    const slot = kind === 'arpeggiator' ? ARPEGGIATOR_ENGINE_INPUT : SEQUENCER_ENGINE_INPUT;
    state.playingNote = note;
    this.send(slot, 0x90, note, velocity);
    if (state.releaseTimer !== null) window.clearTimeout(state.releaseTimer);
    state.releaseTimer = window.setTimeout(() => this.noteOff(kind, state), Math.max(8, duration * Math.min(1, Math.max(0.1, gate / 100))));
  }

  private noteOff(kind: PatternKind, state: PlaybackState): void {
    if (state.releaseTimer !== null) window.clearTimeout(state.releaseTimer);
    state.releaseTimer = null;
    if (state.playingNote === null) return;
    const slot = kind === 'arpeggiator' ? ARPEGGIATOR_ENGINE_INPUT : SEQUENCER_ENGINE_INPUT;
    this.send(slot, 0x80, state.playingNote, 0);
    state.playingNote = null;
  }

  private stop(kind: PatternKind, state: PlaybackState, clearHeld: boolean): void {
    if (state.timer !== null) window.clearTimeout(state.timer);
    state.timer = null;
    this.noteOff(kind, state);
    state.step = 0;
    state.nextAt = null;
    if (clearHeld) state.held = [];
    this.pulse(kind, null);
  }
}

function createPlaybackState(): PlaybackState {
  return { held: [], timer: null, releaseTimer: null, playingNote: null, step: 0, nextAt: null };
}

function isArpeggiatorActive(snapshot: PatternPlaybackSnapshot): boolean {
  return snapshot.arpeggiator.moduleEnabled && snapshot.arpeggiator.hasSound
    && readArpeggiatorSettings(snapshot.arpeggiator.settings).enabled;
}

function isSequencerActive(snapshot: PatternPlaybackSnapshot): boolean {
  return snapshot.sequencer.moduleEnabled && snapshot.sequencer.hasSound
    && readSequencerSettings(snapshot.sequencer.settings).enabled;
}

function patternEnabled(kind: PatternKind, settings: unknown): boolean {
  return kind === 'arpeggiator' ? readArpeggiatorSettings(settings).enabled : readSequencerSettings(settings).enabled;
}

function acceptsInput(configured: string | null, incoming: string | null): boolean {
  return configured === null || incoming === null || configured === incoming;
}

function arpeggiatorNotes(held: readonly HeldNote[], settings: ArpeggiatorSettings): number[] {
  const played = [...held].sort((left, right) => left.order - right.order);
  const base = settings.mode === 'played' ? played : [...held].sort((left, right) => left.noteNumber - right.noteNumber);
  const expanded = Array.from({ length: settings.octaves }, (_, octave) => (
    base.map(({ noteNumber }) => clampMidi(noteNumber + octave * 12))
  )).flat();
  if (settings.mode === 'down') return expanded.reverse();
  if (settings.mode === 'up-down' && expanded.length > 1) return [...expanded, ...expanded.slice(1, -1).reverse()];
  if (settings.mode === 'random') {
    const random = [...expanded];
    for (let index = random.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      const current = random[index];
      const other = random[swap];
      if (current !== undefined && other !== undefined) [random[index], random[swap]] = [other, current];
    }
    return random;
  }
  return expanded;
}

function newestHeldNote(held: readonly HeldNote[]): HeldNote | null {
  return held.reduce<HeldNote | null>((latest, note) => latest === null || note.order > latest.order ? note : latest, null);
}

function velocityForNote(held: readonly HeldNote[], target: number): number {
  const source = held.find(({ noteNumber }) => target % 12 === noteNumber % 12) ?? newestHeldNote(held);
  return source?.velocity ?? 110;
}

function clampMidi(note: number): number {
  return Math.min(127, Math.max(0, Math.round(note)));
}
