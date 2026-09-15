import { detect } from '@tonaljs/chord-detect';
import { formatMidiNote } from '../midi/MidiInputService';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const COMMON_CHORD_TYPES = new Set([
  'M', 'm', '7', 'maj7', 'm7', 'm/maj7', 'mMaj7', 'dim', 'dim7', 'm7b5',
  'aug', '+', 'sus2', 'sus4', '5', '6', 'm6', '6/9', 'Madd9', 'add9', 'madd9',
  '9', 'maj9', 'm9', '11', 'maj11', 'm11', '13', 'maj13', 'm13',
  '7sus4', '9sus4', '7b5', '7#5', '7b9', '7#9', '7#11', '7b13',
]);

function chordParts(symbol: string): RegExpMatchArray | null {
  return symbol.match(/^([A-G](?:#|b)?)(.*?)(?:\/([A-G](?:#|b)?))?$/);
}

function displayChord(symbol: string): string {
  const parts = chordParts(symbol);
  if (!parts) return symbol;
  const [, root, type, bass] = parts;
  const suffix = type === 'M' ? (bass ? '' : 'major') : type === 'Madd9' ? 'add9' : type;
  return `${root}${suffix}${bass ? `/${bass}` : ''}`;
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
    const chord = candidates.find(candidate => COMMON_CHORD_TYPES.has(chordParts(candidate)?.[2] ?? ''))
      ?? candidates[0];
    if (chord) return displayChord(chord);
  }

  // Unrecognized/ambiguous clusters remain notes instead of inventing a chord.
  const visibleNotes = sortedNotes.slice(0, 6).map(formatMidiNote).join(' · ');
  return sortedNotes.length > 6 ? `${visibleNotes} +${sortedNotes.length - 6}` : visibleNotes;
}
