/** Referência de um SF2 disponibilizado ao motor nativo. */
export interface SoundFontReference {
  id: string;
  localUri: string;
  checksum: string;
}

/** Mensagem MIDI normalizada sem dependência de APIs do navegador. */
export interface SamplerMidiMessage {
  status: number;
  data1: number;
  data2: number;
  timestampNanoseconds?: bigint;
}

/**
 * Contrato de domínio do motor SF2/MIDI.
 *
 * A implementação de produção é nativa em cada plataforma e não deve
 * depender da árvore visual, de Web MIDI ou de Web Audio. Carregamento de SF2,
 * MIDI em tempo real e áudio permanecem fora da thread da interface.
 */
export interface SamplerEngine {
  initialize(): Promise<void>;
  loadSoundFont(soundFont: SoundFontReference): Promise<void>;
  selectPreset(bank: number, program: number): Promise<void>;
  sendMidi(message: SamplerMidiMessage): void;
  stopAllNotes(): void;
  dispose(): Promise<void>;
}
