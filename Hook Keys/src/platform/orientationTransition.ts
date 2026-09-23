import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { refreshNativeNotchSide, setAppOrientationMode, type AppOrientationMode } from './runtime';

export function coverOrientationChange(): HTMLElement {
  const cover = document.createElement('div');
  cover.className = 'orientation-transition-cover';
  cover.setAttribute('aria-hidden', 'true');
  document.body.append(cover);
  return cover;
}

export function nextPaint(): Promise<void> {
  return new Promise(resolve => window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => resolve());
  }));
}

export async function prepareScreenOrientation(mode: AppOrientationMode): Promise<void> {
  // O preto precisa ser desenhado ANTES de pedir ao sistema para girar.
  await nextPaint();
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  if (Capacitor.isNativePlatform()) await Keyboard.hide().catch(() => undefined);
  await setAppOrientationMode(mode);
  if (!Capacitor.isNativePlatform()) return;
  const started = performance.now();
  let previous = '';
  let stableSince = started;
  while (performance.now() - started < 3000) {
    const dimensions = `${window.innerWidth}:${window.innerHeight}`;
    if (dimensions !== previous) {
      previous = dimensions;
      stableSince = performance.now();
    }
    const landscape = window.innerWidth > window.innerHeight;
    if (landscape === (mode === 'tablet') && performance.now() - stableSince >= 250) break;
    await new Promise(resolve => window.setTimeout(resolve, 50));
  }
  // setAppOrientationMode dispara a rotação, mas o lado do recorte só é
  // confiável depois que a nova geometria estabiliza.
  await refreshNativeNotchSide();
  await nextPaint();
}
