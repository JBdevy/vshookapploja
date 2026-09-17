import {
  patternStepMilliseconds,
  readArpeggiatorSettings,
  type ArpeggiatorSettings,
} from './PatternModulesView';

export const ARPEGGIATOR_ENGINE_INPUT = 4;

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

export class PatternPlaybackController {
  private order = 0;
  private readonly state = createPlaybackState();

  constructor(
    private readonly snapshot: () => PatternPlaybackSnapshot,
    private readonly send: (slot: number, status: number, note: number, velocity: number) => void,
    private readonly pulse: (step: number | null) => void = () => {},
  ) {}

  handleInput(input: PatternInput): void {
    const config = this.snapshot().arpeggiator;
    const state = this.state;
    if (!config.moduleEnabled || !config.hasSound || !readArpeggiatorSettings(config.settings).enabled) {
      if (state.held.length > 0 || state.timer !== null) this.stop(true);
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
        this.tick();
      }
      return;
    }
    if (existing >= 0) state.held.splice(existing, 1);
    if (state.held.length === 0) this.stop(false);
  }

  settingsChanged(): void {
    const active = isArpeggiatorActive(this.snapshot());
    if (!active) this.stop(true);
    else if (this.state.held.length > 0 && this.state.timer === null) this.tick();
  }

  reset(): void {
    this.stop(true);
  }

  destroy(): void {
    this.reset();
  }

  private tick(): void {
    const state = this.state;
    state.timer = null;
    const snapshot = this.snapshot();
    if (!isArpeggiatorActive(snapshot) || state.held.length === 0) {
      this.stop(!isArpeggiatorActive(snapshot));
      return;
    }

    if (state.playingNote !== null) this.noteOff();
    const settings = readArpeggiatorSettings(snapshot.arpeggiator.settings);
    const notes = arpeggiatorNotes(state.held, settings);
    if (notes.length > 0) {
      const note = notes[state.step % notes.length];
      if (note !== undefined) {
        const velocity = velocityForNote(state.held, note);
        this.noteOn(note, velocity, settings.gate, patternStepMilliseconds(snapshot.bpm, settings.division, settings.swing, state.step));
      }
    }
    this.pulse(state.step % Math.max(1, notes.length));
    const duration = patternStepMilliseconds(snapshot.bpm, settings.division, settings.swing, state.step);
    state.step = (state.step + 1) % Math.max(1, notes.length);
    this.scheduleNext(duration);
  }

  private scheduleNext(duration: number): void {
    const state = this.state;
    const now = Date.now();
    state.nextAt = (state.nextAt ?? now) + duration;
    state.timer = window.setTimeout(() => this.tick(), Math.max(0, state.nextAt - now));
  }

  private noteOn(note: number, velocity: number, gate: number, duration: number): void {
    const state = this.state;
    state.playingNote = note;
    this.send(ARPEGGIATOR_ENGINE_INPUT, 0x90, note, velocity);
    if (state.releaseTimer !== null) window.clearTimeout(state.releaseTimer);
    state.releaseTimer = window.setTimeout(() => this.noteOff(), Math.max(8, duration * Math.min(1, Math.max(0.1, gate / 100))));
  }

  private noteOff(): void {
    const state = this.state;
    if (state.releaseTimer !== null) window.clearTimeout(state.releaseTimer);
    state.releaseTimer = null;
    if (state.playingNote === null) return;
    this.send(ARPEGGIATOR_ENGINE_INPUT, 0x80, state.playingNote, 0);
    state.playingNote = null;
  }

  private stop(clearHeld: boolean): void {
    const state = this.state;
    if (state.timer !== null) window.clearTimeout(state.timer);
    state.timer = null;
    this.noteOff();
    state.step = 0;
    state.nextAt = null;
    if (clearHeld) state.held = [];
    this.pulse(null);
  }
}

function createPlaybackState(): PlaybackState {
  return { held: [], timer: null, releaseTimer: null, playingNote: null, step: 0, nextAt: null };
}

function isArpeggiatorActive(snapshot: PatternPlaybackSnapshot): boolean {
  return snapshot.arpeggiator.moduleEnabled && snapshot.arpeggiator.hasSound
    && readArpeggiatorSettings(snapshot.arpeggiator.settings).enabled;
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
