const DEFAULT_MAX_INTERVAL_MS = 360;

export class DoubleTapTracker {
  private lastTapKey: string | null = null;
  private lastTapTime = 0;

  constructor(private readonly maxIntervalMs = DEFAULT_MAX_INTERVAL_MS) {}

  register(key: string, timeStamp: number): boolean {
    const isDoubleTap = this.lastTapKey === key
      && timeStamp - this.lastTapTime > 0
      && timeStamp - this.lastTapTime <= this.maxIntervalMs;
    this.lastTapKey = isDoubleTap ? null : key;
    this.lastTapTime = isDoubleTap ? 0 : timeStamp;
    return isDoubleTap;
  }

  reset(): void {
    this.lastTapKey = null;
    this.lastTapTime = 0;
  }
}
