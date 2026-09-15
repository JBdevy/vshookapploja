import { detect } from '@tonaljs/chord-detect';
import { formatMidiNote } from '../midi/MidiInputService';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
// Menor pontuação = leitura mais comum. A detecção pode devolver várias
// grafias corretas para o mesmo pitch-class set; essa ordem evita resultados
// tecnicamente possíveis, mas pouco úteis no palco (Em#5 em vez de C/E).
const CHORD_TYPE_PRIORITY = new Map<string, number>([
  ['M', 0], ['m', 0], ['7', 0], ['maj7', 0], ['m7', 0],
  ['dim', 0], ['dim7', 0], ['m7b5', 0], ['aug', 0], ['+', 0],
  ['sus2', 0], ['sus4', 0], ['5', 0], ['6', 0], ['m6', 0],
  ['6add9', 0], ['6/9', 0], ['Madd9', 0], ['add9', 0], ['madd9', 0],
  ['9', 0], ['maj9', 0], ['m9', 0], ['11', 0], ['maj11', 0], ['m11', 0],
  ['13', 0], ['maj13', 0], ['m13', 0], ['7sus4', 0], ['9sus4', 0],
  ['m/maj7', 1], ['mMaj7', 1], ['7b5', 1], ['7#5', 1], ['7b9', 1],
  ['7#9', 1], ['7#11', 1], ['7b13', 1], ['alt7', 1],
]);

function chordParts(symbol: string): RegExpMatchArray | null {
  return symbol.match(/^([A-G](?:#|b)?)(.*?)(?:\/([A-G](?:#|b)?))?$/);
}

function displayChord(symbol: string): string {
  const parts = chordParts(symbol);
  if (!parts) return symbol;
  const [, root, type, bass] = parts;
  // Cifra internacional: tríade maior é somente “C”; qualidade menor/extensões
  // continuam explícitas (Cm, C7, Cmaj7), e inversões usam baixo após a barra.
  const suffix = type === 'M' ? '' : type === 'Madd9' ? 'add9' : type;
  return `${root}${suffix}${bass ? `/${bass}` : ''}`;
}

function preferredChord(candidates: readonly string[]): string | undefined {
  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      priority: CHORD_TYPE_PRIORITY.get(chordParts(candidate)?.[2] ?? '') ?? 50,
    }))
    .sort((left, right) => left.priority - right.priority || left.index - right.index)[0]?.candidate;
}

/** Recognize held MIDI notes, not audio; runs only in the UI, never in the audio callback. */
export function performanceNotesLabel(notes: readonly number[]): string {
  const sortedNotes = [...new Set(notes)]
    .filter(note => Number.isInteger(note) && note >= 0 && note <= 127)
    .sort((left, right) => left - right);
  if (sortedNotes.length === 0) return '—';
  if (sortedNotes.length === 1) return formatMidiNote(sortedNotes[0]!);

  // Preserve the lowest note first so detection can distinguish the bass from
  // the root, while octave doublings do not change the chord's pitch-class set.
  const pitchClasses = [...new Set(sortedNotes.map(note => note % 12))];
  if (pitchClasses.length >= 3) {
    const candidates = detect(pitchClasses.map(pitch => NOTE_NAMES[pitch]!), { assumePerfectFifth: true });
    // Prefer an ordinary triad inversion over a rarer enharmonic interpretation
    // (for example C/E, rather than Em#5, for E-G-C).
    const chord = preferredChord(candidates);
    if (chord) return displayChord(chord);
  }

  // Unrecognized/ambiguous clusters remain notes instead of inventing a chord.
  const visibleNotes = sortedNotes.slice(0, 6).map(formatMidiNote).join(' · ');
  return sortedNotes.length > 6 ? `${visibleNotes} +${sortedNotes.length - 6}` : visibleNotes;
}
