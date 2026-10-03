// Capacitor native shell. Android is built in CI (.github/workflows/ci.yml → apk job):
//   npm run build && npx cap sync android && (cd android && ./gradlew assembleRelease)
// iOS is not added yet (needs macOS + Xcode). See docs/IAP.md for wiring real in-app purchases.
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.borderlinerich.game',
  appName: 'Borderline Rich',
  webDir: 'dist',
  backgroundColor: '#14161b',
  ios: { contentInset: 'never', scrollEnabled: false },
  android: { allowMixedContent: false, captureInput: true },
  plugins: {
    // Fullscreen game: status + navigation bars hidden (MainActivity makes a swipe show them
    // transiently). index.html uses viewport-fit=cover, so the notch arrives as env(safe-area-*).
    SystemBars: { hidden: true, style: 'DARK', insetsHandling: 'css', initialViewportFitValueHint: 'cover' },
  },
};

export default config;
