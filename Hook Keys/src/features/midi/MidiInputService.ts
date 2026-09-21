import { hookKeysNative, type NativeMidiDevice } from '../../platform/native/HookKeysNative';
import { isDesktopRuntime } from '../../platform/runtime';

export interface MidiNoteInput {
  channel: number;
  inputId: string | null;
  noteNumber: number;
  pressed: boolean;
  velocity: number;
}

export interface MidiInputDevice {
  id: string;
  name: string;
}

export interface MidiControlChangeInput {
  channel: number;
  controller: number;
  inputId: string | null;
  value: number;
}

type MidiNoteHandler = (input: MidiNoteInput) => void;
type MidiControlChangeHandler = (input: MidiControlChangeInput) => void;
export interface MidiPitchBendInput {
  channel: number;
  inputId: string | null;
  value: number;
}

interface NativeMidiNoteDetail {
  channel?: number;
  deviceId?: string;
  inputId?: string;
  noteNumber?: number;
  velocity?: number;
}

interface NativeMidiControlChangeDetail {
  channel?: number;
  controller?: number;
  deviceId?: string;
  inputId?: string;
  value?: number;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function formatMidiNote(noteNumber: number): string {
  const safeNote = Math.min(127, Math.max(0, Math.round(noteNumber)));
  const noteName = NOTE_NAMES[safeNote % NOTE_NAMES.length] ?? 'C';
  // O teclado físico chama a nota MIDI 60 de C3. A faixa completa de 88
  // teclas é MIDI 21..108, exibida de A-1 a C7 nessa convenção.
  const octave = Math.floor(safeNote / NOTE_NAMES.length) - 2;
  return `${noteName}${octave}`;
}

export class MidiInputService {
  private access: MIDIAccess | null = null;
  private accessRequest: Promise<boolean> | null = null;
  private selectedInputIds = new Set<string>();
  private selectedInputOrder: (string | null)[] = [null, null, null];
  private compatibilityMode = false;
  private nativeDevices: NativeMidiDevice[] = [];
  private nativeRefreshTimer: number | null = null;

  private readonly handleNativeDevicesChanged = () => {
    void this.refreshNativeDevices(true);
  };

  private readonly handleNativeNote = (event: Event) => {
    const detail = (event as CustomEvent<NativeMidiNoteDetail>).detail;
    if (!detail || !Number.isFinite(detail.noteNumber)) return;
    this.emitNote({
      channel: Number.isFinite(detail.channel) ? Number(detail.channel) : 1,
      inputId: typeof detail.inputId === 'string'
        ? detail.inputId
        : typeof detail.deviceId === 'string' ? detail.deviceId : null,
      noteNumber: Number(detail.noteNumber),
      pressed: Number.isFinite(detail.velocity) ? Number(detail.velocity) > 0 : true,
      velocity: Number.isFinite(detail.velocity) ? Number(detail.velocity) : 127,
    });
  };

  private readonly handleNativeControlChange = (event: Event) => {
    const detail = (event as CustomEvent<NativeMidiControlChangeDetail>).detail;
    if (!detail || !Number.isFinite(detail.controller) || !Number.isFinite(detail.value)) return;
    this.emitControlChange({
      channel: Number.isFinite(detail.channel) ? Number(detail.channel) : 1,
      controller: Number(detail.controller),
      inputId: typeof detail.inputId === 'string'
        ? detail.inputId
        : typeof detail.deviceId === 'string' ? detail.deviceId : null,
      value: Number(detail.value),
    });
  };

  private readonly handleNativePitchBend = (event: Event) => {
    const detail = (event as CustomEvent<NativeMidiControlChangeDetail>).detail;
    if (!detail || !Number.isFinite(detail.value)) return;
    this.emitPitchBend({
      channel: Number.isFinite(detail.channel) ? Number(detail.channel) : 1,
      inputId: typeof detail.inputId === 'string' ? detail.inputId
        : typeof detail.deviceId === 'string' ? detail.deviceId : null,
      value: Number(detail.value),
    });
  };

  constructor(
    private readonly onNote: MidiNoteHandler,
    private readonly onControlChange: MidiControlChangeHandler = () => {},
    private readonly onDevicesChanged: () => void = () => {},
    private readonly onPitchBend: (input: MidiPitchBendInput) => void = () => {},
  ) {}

  mount(): void {
    window.addEventListener('hookkeys:native-midi-note', this.handleNativeNote);
    window.addEventListener('hookkeys:native-midi-control-change', this.handleNativeControlChange);
    window.addEventListener('hookkeys:native-midi-pitch-bend', this.handleNativePitchBend);
    window.addEventListener('hookkeys:native-midi-devices-changed', this.handleNativeDevicesChanged);
    if (hookKeysNative.isAvailable()) {
      void this.requestAccess();
      // Tauri/midir não oferece uma notificação uniforme de hot-plug em todos
      // os backends. Android e iOS já enviam midiDevicesChanged nativamente;
      // não ocupe a ponte móvel enumerando dispositivos continuamente.
      if (isDesktopRuntime()) {
        this.nativeRefreshTimer = window.setInterval(() => {
          void this.refreshNativeDevices(true);
        }, 1_500);
      }
    }
  }

  destroy(): void {
    window.removeEventListener('hookkeys:native-midi-note', this.handleNativeNote);
    window.removeEventListener('hookkeys:native-midi-control-change', this.handleNativeControlChange);
    window.removeEventListener('hookkeys:native-midi-pitch-bend', this.handleNativePitchBend);
    window.removeEventListener('hookkeys:native-midi-devices-changed', this.handleNativeDevicesChanged);
    if (this.access) {
      this.access.onstatechange = null;
      this.access.inputs.forEach((input) => {
        input.onmidimessage = null;
      });
    }
    this.access = null;
    this.accessRequest = null;
    if (this.nativeRefreshTimer !== null) window.clearInterval(this.nativeRefreshTimer);
    this.nativeRefreshTimer = null;
  }

  requestAccess(): Promise<boolean> {
    if (hookKeysNative.isAvailable()) {
      if (this.accessRequest) return this.accessRequest;
      this.accessRequest = this.refreshNativeDevices(false)
        .then(async () => {
          await hookKeysNative.setMidiInputs(this.selectedInputOrder);
          // MIDI continua disponível mesmo se o dispositivo de áudio estiver
          // ocupado. A inicialização sonora acontece em paralelo e pode tentar
          // novamente depois.
          void hookKeysNative.initialize();
          return true;
        })
        .catch(() => false)
        .finally(() => {
          this.accessRequest = null;
        });
      return this.accessRequest;
    }
    if (this.access) return Promise.resolve(true);
    if (this.accessRequest) return this.accessRequest;

    const requestMidiAccess = navigator.requestMIDIAccess;
    if (typeof requestMidiAccess !== 'function') return Promise.resolve(false);

    this.accessRequest = requestMidiAccess.call(navigator, { sysex: false })
      .then((access) => {
        this.access = access;
        this.connectInputs();
        access.onstatechange = () => this.connectInputs();
        return true;
      })
      .catch(() => false)
      .finally(() => {
        this.accessRequest = null;
      });
    return this.accessRequest;
  }

  receiveNativeNote(noteNumber: number, velocity = 127, channel = 1, inputId: string | null = null): void {
    this.emitNote({ channel, inputId, noteNumber, pressed: velocity > 0, velocity });
  }

  receiveNativeControlChange(
    controller: number,
    value: number,
    channel = 1,
    inputId: string | null = null,
  ): void {
    this.emitControlChange({ channel, controller, inputId, value });
  }

  getInputDevices(): MidiInputDevice[] {
    if (hookKeysNative.isAvailable()) {
      return this.nativeDevices
        .map(({ id, name }) => ({ id, name }))
        .sort((first, second) => first.name.localeCompare(second.name));
    }
    const devices: MidiInputDevice[] = [];
    this.access?.inputs.forEach((input) => {
      if (input.state === 'disconnected') return;
      devices.push({
        id: input.id,
        name: input.name?.trim() || input.manufacturer?.trim() || 'Controlador MIDI',
      });
    });
    return devices.sort((first, second) => first.name.localeCompare(second.name));
  }

  setSelectedInputIds(inputIds: readonly (string | null)[]): void {
    this.selectedInputOrder = Array.from({ length: 3 }, (_, index) => inputIds[index] || null);
    this.selectedInputIds = new Set(
      this.selectedInputOrder.filter((id): id is string => id !== null),
    );
    this.connectInputs();
    if (hookKeysNative.isAvailable()) void hookKeysNative.setMidiInputs(this.selectedInputOrder);
  }

  setCompatibilityMode(enabled: boolean): void {
    this.compatibilityMode = enabled;
  }

  private connectInputs(): void {
    this.access?.inputs.forEach((input) => {
      input.onmidimessage = (event) => {
        if (event.data) this.processMidiMessage(event.data, input.id);
      };
    });
  }

  private async refreshNativeDevices(reconnectSelection: boolean): Promise<void> {
    const devices = await hookKeysNative.listMidiDevices();
    const previousKey = this.nativeDevices.map(({ id, name }) => `${id}\u0000${name}`).join('\u0001');
    const nextKey = devices.map(({ id, name }) => `${id}\u0000${name}`).join('\u0001');
    this.nativeDevices = devices;
    if (previousKey === nextKey) return;
    if (reconnectSelection) await hookKeysNative.setMidiInputs(this.selectedInputOrder);
    this.onDevicesChanged();
  }

  private processMidiMessage(data: Uint8Array, inputId: string): void {
    const status = data[0];
    const data1 = data[1];
    const data2 = data[2];
    if (status === undefined || data1 === undefined || data2 === undefined) return;
    const messageType = status & 0xf0;
    if (messageType === 0xe0) {
      this.emitPitchBend({ channel: (status & 0x0f) + 1, inputId, value: (data1 & 0x7f) | ((data2 & 0x7f) << 7) });
      return;
    }
    if (messageType === 0xb0) {
      this.emitControlChange({
        channel: (status & 0x0f) + 1,
        controller: data1,
        inputId,
        value: data2,
      });
      return;
    }
    if (messageType !== 0x90 && messageType !== 0x80) return;
    const pressed = messageType === 0x90 && data2 > 0;
    this.emitNote({
      channel: (status & 0x0f) + 1,
      inputId,
      noteNumber: data1,
      pressed,
      velocity: pressed ? data2 : 0,
    });
  }

  private emitControlChange(input: MidiControlChangeInput): void {
    if (!Number.isFinite(input.controller) || !Number.isFinite(input.value)) return;
    const normalized = {
      channel: Math.min(16, Math.max(1, Math.round(input.channel))),
      controller: Math.min(127, Math.max(0, Math.round(input.controller))),
      inputId: input.inputId,
      value: Math.min(127, Math.max(0, Math.round(input.value))),
    };
    if (this.compatibilityMode) {
      if (normalized.controller === 91) {
        // Reverb 1..16 use the contiguous free CC102..117 range. The original
        // CC91 never reaches the module's reverb send in compatibility mode.
        if (normalized.value >= 1 && normalized.value <= 16) {
          this.onControlChange({ ...normalized, controller: 101 + normalized.value, value: 127 });
        }
        return;
      }
      if ([0, 6, 7, 10, 16, 32, 100, 101].includes(normalized.controller)) return;
    }
    this.onControlChange(normalized);
  }

  private emitPitchBend(input: MidiPitchBendInput): void {
    if (!Number.isFinite(input.value) || (input.inputId && !this.selectedInputIds.has(input.inputId))) return;
    this.onPitchBend({
      channel: Math.min(16, Math.max(1, Math.round(input.channel))),
      inputId: input.inputId,
      value: Math.min(16383, Math.max(0, Math.round(input.value))),
    });
  }

  private emitNote(input: MidiNoteInput): void {
    if (!Number.isFinite(input.noteNumber) || !Number.isFinite(input.velocity)) return;
    if (input.inputId && !this.selectedInputIds.has(input.inputId)) return;
    this.onNote({
      channel: Math.min(16, Math.max(1, Math.round(input.channel))),
      inputId: input.inputId,
      noteNumber: Math.min(127, Math.max(0, Math.round(input.noteNumber))),
      pressed: input.pressed,
      velocity: input.pressed ? Math.min(127, Math.max(1, Math.round(input.velocity))) : 0,
    });
  }
}
