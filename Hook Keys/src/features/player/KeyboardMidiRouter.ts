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
  private pitchRoute: KeyboardMidiRoute | null = null;
  private modDragRoute: KeyboardMidiRoute | null = null;
  private modRoute: KeyboardMidiRoute | null = null;

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

  pitchBend(value: number, active: boolean): void {
    const route = this.pitchRoute ?? this.currentRoute();
    if (active) this.pitchRoute = route;
    const bend = Math.round(Math.min(16383, Math.max(0, value)));
    this.send(route.inputSlot, 0xe0, bend & 0x7f, (bend >> 7) & 0x7f);
    if (!active) this.pitchRoute = null;
  }

  modulation(value: number, active: boolean): void {
    const route = this.modDragRoute ?? this.currentRoute();
    if (active) this.modDragRoute = route;
    if (this.modRoute && this.modRoute.inputSlot !== route.inputSlot) {
      this.send(this.modRoute.inputSlot, 0xb0, 1, 0);
    }
    this.send(route.inputSlot, 0xb0, 1, Math.round(Math.min(127, Math.max(0, value))));
    this.modRoute = route;
    if (!active) this.modDragRoute = null;
  }

  resetExpression(): void {
    if (this.pitchRoute) this.send(this.pitchRoute.inputSlot, 0xe0, 0, 64);
    if (this.modRoute) this.send(this.modRoute.inputSlot, 0xb0, 1, 0);
    this.pitchRoute = this.modDragRoute = this.modRoute = null;
  }
}
