import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize, KeyboardStyle } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'com.hookdeveloper.hookkeys',
  appName: 'Hook Keys',
  webDir: 'dist',
  backgroundColor: '#070504',
  loggingBehavior: 'none',
  android: {
    backgroundColor: '#070504',
  },
  ios: {
    backgroundColor: '#070504',
    // O layout ja reserva a safe area no CSS (viewport-fit=cover + env()).
    // Com 'always' a WKWebView reservava a mesma margem de novo e o app
    // ficava afastado das bordas nos dois lados.
    contentInset: 'never',
  },
  plugins: {
    Keyboard: {
      resize: KeyboardResize.Native,
      style: KeyboardStyle.Dark,
      resizeOnFullScreen: true,
      autoBackdropColor: 'auto',
    },
  },
};

export default config;
