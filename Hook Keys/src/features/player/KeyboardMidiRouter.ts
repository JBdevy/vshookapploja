export interface KeyboardMidiRoute {
  inputSlot: number;
  inputId: string | null;
}

// Slot 3 is the engine's virtual keyboard broadcast input (physical: 0..2).
export function keyboardMidiRoute(slot: number, selectedIds: readonly (string | null)[], connectedCount: number): KeyboardMidiRoute {
  const inputSlot = Math.min(2, Math.max(0, slot - 1));
  return connectedCount === 0
    ? { inputSlot: 3, inputId: null }
    : { inputSlot, inputId: selectedIds[inputSlot] ?? null };
}

export class KeyboardMidiRouter {
  private readonly heldRoutes = new Map<number, KeyboardMidiRoute>();

  constructor(
    private readonly currentRoute: () => KeyboardMidiRoute,
    private readonly send: (slot: number, status: number, note: number, velocity: number) => void,
  ) {}

  note(note: number, pressed: boolean, velocity: number): string | null {
    // A setting change or device disconnect while holding a key must not send
    // its note-off to a different input and leave the original note sounding.
    const route = this.heldRoutes.get(note) ?? this.currentRoute();
    if (pressed) this.heldRoutes.set(note, route);
    else this.heldRoutes.delete(note);
    this.send(route.inputSlot, pressed ? 0x90 : 0x80, note, pressed ? velocity : 0);
    return route.inputId;
  }
}
