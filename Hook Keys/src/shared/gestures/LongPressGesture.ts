interface PendingLongPress {
  onActivate: () => void;
  pointerId: number;
  startX: number;
  startY: number;
  timer: number;
}

export class LongPressGesture {
  private pending: PendingLongPress | null = null;

  constructor(
    private readonly delayMs = 560,
    private readonly movementTolerance = 10,
  ) {}

  start(event: PointerEvent, onActivate: () => void): void {
    this.cancel();
    const timer = window.setTimeout(() => {
      const pending = this.pending;
      if (!pending || pending.pointerId !== event.pointerId) return;
      this.pending = null;
      pending.onActivate();
    }, this.delayMs);
    this.pending = {
      onActivate,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      timer,
    };
  }

  move(event: PointerEvent): void {
    const pending = this.pending;
    if (!pending || pending.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) > this.movementTolerance) {
      this.cancel();
    }
  }

  end(event: PointerEvent): void {
    if (this.pending?.pointerId === event.pointerId) this.cancel();
  }

  cancel(): void {
    if (!this.pending) return;
    window.clearTimeout(this.pending.timer);
    this.pending = null;
  }
}
