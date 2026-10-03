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
const layer = document.createElement('div');
layer.className = 'layer';
root.append(canvas, layer);

const session = new Session(canvas, layer);
setSession(session);
render(<App />, layer);

if (__SIM_HOOK__) {
  void import('./app/testHook').then((m) => m.installTestHook(session));
}
