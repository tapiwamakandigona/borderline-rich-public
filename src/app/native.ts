// Native shell glue (Capacitor Android/iOS). main.tsx imports it lazily, only when the Capacitor
// bridge (window.Capacitor, injected before our code runs) says we are inside the app. Lifecycle
// maps onto the same Session methods the browser uses, so behaviour matches the e2e-tested web.
import { App } from '@capacitor/app';
import type { Session } from './session';

export async function installNativeShell(session: Session): Promise<void> {
  // Hardware/gesture back closes the top sheet, card or modal; with nothing open it sends the
  // app to the background (state is saved on pause) instead of killing the WebView.
  await App.addListener('backButton', () => {
    if (!session.back()) void App.minimizeApp();
  });
  await App.addListener('pause', () => session.suspend());
  await App.addListener('resume', () => session.resume());
}
