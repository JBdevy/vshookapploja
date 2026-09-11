import { AppLauncher } from '@capacitor/app-launcher';
import { Capacitor } from '@capacitor/core';

const WHATSAPP_URL = /^https:\/\/wa\.me\/(\d{8,15})$/;

export function isWhatsAppSupportUrl(url: string): boolean {
  return WHATSAPP_URL.test(url);
}

export async function openWhatsAppSupport(url: string): Promise<void> {
  const match = WHATSAPP_URL.exec(url);
  if (!match) return;

  const nativeUrl = `whatsapp://send?phone=${match[1]}`;
  if (Capacitor.isNativePlatform()) {
    try {
      const available = await AppLauncher.canOpenUrl({ url: nativeUrl });
      if (available.value) {
        const result = await AppLauncher.openUrl({ url: nativeUrl });
        if (result.completed) return;
      }
    } catch {
      // Se o WhatsApp nao estiver disponivel, abre o endereco web abaixo.
    }
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}
