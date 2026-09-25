export interface AudioOutputDevice {
  id: string;
  name: string;
  channels: number;
}

export type AudioBusRoute = `mono:${number}` | `stereo:${number}`;

export interface AudioBusRouting {
  timbres: AudioBusRoute;
  pads: AudioBusRoute;
  effects: AudioBusRoute;
  metronome: AudioBusRoute;
}

export const DEFAULT_AUDIO_ROUTING: AudioBusRouting = {
  timbres: 'stereo:0',
  pads: 'stereo:0',
  effects: 'stereo:0',
  metronome: 'stereo:0',
};

export class AudioOutputService {
  async listDevices(): Promise<AudioOutputDevice[]> {
    const desktopInvoke = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: (command: string) => Promise<AudioOutputDevice[]> } }).__TAURI_INTERNALS__?.invoke;
    if (desktopInvoke) {
      const devices = await desktopInvoke('list_audio_output_devices');
      return devices.map((device) => ({ ...device, channels: Math.max(1, Math.min(32, Math.trunc(device.channels))) }));
    }
    if (hookKeysNative.isAvailable()) {
      const devices = await hookKeysNative.listAudioOutputDevices();
      return devices.map((device) => ({
        id: device.id,
        name: device.name,
        channels: Math.max(1, Math.min(32, Math.trunc(device.channels))),
      }));
    }
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter(({ kind, deviceId }) => kind === 'audiooutput' && deviceId !== 'default')
      .map((device, index) => ({
        id: device.deviceId,
        name: device.label.trim() || `Saída de áudio ${index + 1}`,
        channels: 2,
      }));
  }
}

// Os módulos aceitam "default": a saída segue o que estiver em Saídas - Módulos.
export type ModuleOutputRoute = AudioBusRoute | 'default';

export function createAudioRouteOptions(channelCount: number, selected: ModuleOutputRoute): string {
  const channels = Math.max(1, Math.min(32, Math.trunc(channelCount)));
  const options: Array<{ value: AudioBusRoute; label: string }> = [];
  for (let channel = 0; channel < channels; channel += 2) {
    if (channel + 1 < channels) options.push({ value: `stereo:${channel}`, label: `${channel + 1}+${channel + 2}` });
    options.push({ value: `mono:${channel}`, label: String(channel + 1) });
    if (channel + 1 < channels) options.push({ value: `mono:${channel + 1}`, label: String(channel + 2) });
  }
  return options.map(({ value, label }) => `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`).join('');
}

export function isAudioBusRoute(value: unknown, channelCount = 32): value is AudioBusRoute {
  if (typeof value !== 'string') return false;
  const match = /^(mono|stereo):(\d+)$/.exec(value);
  if (!match) return false;
  const start = Number(match[2]);
  return start >= 0 && start < channelCount && (match[1] === 'mono' || start + 1 < channelCount);
}
import { hookKeysNative } from '../../platform/native/HookKeysNative';
