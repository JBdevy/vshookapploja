const DEVICE_KEY = 'hookkeys.device.key';
const DEVICE_NAME_KEY = 'hookkeys.device.name';

function createDeviceKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const values = new Uint32Array(5);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(36).padStart(7, '0')).join('');
}

export class DeviceIdentityStore {
  private memoryKey = '';
  private memoryName = '';

  getKey(): string {
    if (this.memoryKey) return this.memoryKey;
    try {
      const saved = window.localStorage.getItem(DEVICE_KEY)?.trim();
      if (saved) return (this.memoryKey = saved);
      const created = createDeviceKey();
      window.localStorage.setItem(DEVICE_KEY, created);
      return (this.memoryKey = created);
    } catch {
      return (this.memoryKey ||= createDeviceKey());
    }
  }

  getName(): string {
    if (this.memoryName) return this.memoryName;
    try {
      return (this.memoryName = window.localStorage.getItem(DEVICE_NAME_KEY)?.trim() ?? '');
    } catch {
      return this.memoryName;
    }
  }

  setName(name: string): void {
    this.memoryName = name.trim().slice(0, 80);
    try {
      window.localStorage.setItem(DEVICE_NAME_KEY, this.memoryName);
    } catch {
      // A identidade continua disponível enquanto o aplicativo estiver aberto.
    }
  }
}
