// Capacitor native shell (milestone M3). Not installed yet, so this file is plain data; to build:
//   npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios @capacitor/preferences
//   npm run build && npx cap add android && npx cap add ios && npx cap sync
// See docs/IAP.md for wiring real in-app purchases (cordova-plugin-purchase or RevenueCat).
const config = {
  appId: 'com.borderlinerich.game',
  appName: 'Borderline Rich',
  webDir: 'dist',
  backgroundColor: '#14161b',
  ios: { contentInset: 'never', scrollEnabled: false },
  android: { allowMixedContent: false, captureInput: true },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#14161b', showSpinner: false },
  },
};

export default config;
