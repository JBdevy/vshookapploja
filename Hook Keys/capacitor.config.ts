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
    contentInset: 'always',
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
