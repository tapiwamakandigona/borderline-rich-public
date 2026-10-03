// Entry: 3D canvas underneath, Preact UI overlay on top, one Session gluing them together.
import { render } from 'preact';
import { Session } from './app/session';
import { setSession } from './ui/kit';
import { App } from './ui/App';
import './ui/styles.css';
import textFont from '@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2?url';
import display600 from '@fontsource/unbounded/files/unbounded-latin-600-normal.woff2?url';
import display800 from '@fontsource/unbounded/files/unbounded-latin-800-normal.woff2?url';

function loadFonts(): void {
  const faces = [
    new FontFace('Bricolage', `url(${textFont})`, { weight: '200 800' }),
    new FontFace('Unbounded', `url(${display600})`, { weight: '600' }),
    new FontFace('Unbounded', `url(${display800})`, { weight: '800' }),
  ];
  for (const f of faces) { document.fonts.add(f); f.load().catch(() => undefined); }
}

loadFonts();
const root = document.getElementById('app')!;
const canvas = document.createElement('canvas');
canvas.className = 'world';
// The joystick gets its own layer. Preact must render into an EMPTY container: given existing
// children it adopts them, and the joystick div once became the UI root, so every joystick drag
// translated the whole HUD off-screen (critic finding #1).
const joyLayer = document.createElement('div');
joyLayer.className = 'layer joy-layer';
const layer = document.createElement('div');
layer.className = 'layer';
root.append(canvas, joyLayer, layer);

const session = new Session(canvas, joyLayer);
setSession(session);
render(<App />, layer);

if (__SIM_HOOK__) {
  void import('./app/testHook').then((m) => m.installTestHook(session));
}

// Android/iOS shell: back button + pause/resume. Checked inline so web builds never load the chunk.
if ((globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) {
  void import('./app/native').then((m) => m.installNativeShell(session));
}
