// Regenerates the Android launcher icons and splash logo from public/icon.svg (the PWA icon), so
// the APK and the web build share one mark. Run after changing the icon:
//   node scripts/android-icons.mjs
// Uses Playwright's Chromium (already a dev dependency) to rasterise with a transparent background.
import { readFileSync, mkdirSync, rmSync, rmdirSync, existsSync, readdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const RES = 'android/app/src/main/res';
const src = readFileSync('public/icon.svg', 'utf8');
const defs = src.match(/<defs>[\s\S]*?<\/defs>/)[0];
// Everything drawn on top of the rounded-square background.
const art = src.replace(/<svg[^>]*>/, '').replace('</svg>', '').replace(defs, '')
  .replace(/<rect width="512" height="512"[^>]*\/>/, '').trim();
const CX = 256, CY = 252; // visual centre of the coin + chart

const svg = (view, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view} ${view}">${defs}${body}</svg>`;
const place = (tx, ty, k) => `<g transform="translate(${tx} ${ty}) scale(${k}) translate(${-CX} ${-CY})">${art}</g>`;

const VARIANTS = {
  // Legacy (API 24-25) square icon: the PWA icon as is.
  ic_launcher: { dp: 48, svg: src },
  // Legacy round icon: circular plate, art scaled to stay inside it.
  ic_launcher_round: { dp: 48, svg: svg(512, `<circle cx="256" cy="256" r="256" fill="url(#bg)"/>${place(256, 256, 0.8)}`) },
  // Adaptive foreground (108 dp canvas, 72 dp visible, 66 dp safe circle): art within r ≈ 35 dp.
  ic_launcher_foreground: { dp: 108, svg: svg(108, place(54, 54, 0.15)) },
};
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const browser = await chromium.launch();
const page = await browser.newPage();
async function render(markup, px, out) {
  await page.setViewportSize({ width: px, height: px });
  const sized = markup.replace('<svg ', `<svg width="${px}" height="${px}" `);
  await page.setContent(`<html><body style="margin:0;background:transparent">${sized}</body></html>`);
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: px, height: px } });
}
for (const [dens, k] of Object.entries(DENSITIES)) {
  for (const [name, v] of Object.entries(VARIANTS)) {
    await render(v.svg, Math.round(v.dp * k), `${RES}/mipmap-${dens}/${name}.png`);
  }
  // Splash logo (pre-Android-12 launch window): 120 dp mark, drawn by drawable/splash.xml.
  mkdirSync(`${RES}/drawable-${dens}`, { recursive: true });
  await render(svg(512, place(256, 256, 0.95)), Math.round(120 * k), `${RES}/drawable-${dens}/splash_logo.png`);
}
await browser.close();

// The Capacitor template ships its own splash bitmaps and robot icon layers; ours are above.
for (const f of ['drawable-v24/ic_launcher_foreground.xml', 'drawable/ic_launcher_background.xml']) {
  if (existsSync(`${RES}/${f}`)) rmSync(`${RES}/${f}`);
}
if (existsSync(`${RES}/drawable-v24`) && readdirSync(`${RES}/drawable-v24`).length === 0) rmdirSync(`${RES}/drawable-v24`);
for (const d of ['drawable', ...Object.keys(DENSITIES).flatMap((x) => [`drawable-port-${x}`, `drawable-land-${x}`])]) {
  const f = `${RES}/${d}/splash.png`;
  if (existsSync(f)) rmSync(f);
  if (d !== 'drawable' && existsSync(`${RES}/${d}`) && readdirSync(`${RES}/${d}`).length === 0) rmdirSync(`${RES}/${d}`);
}
console.log('android icons: ok');
