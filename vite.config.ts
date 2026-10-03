import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';

/** Single-file build: inline the PWA manifest and icons as data: URLs so one HTML file is the whole app. */
function inlinePwa(): Plugin {
  const b64 = (buf: Buffer | string) => Buffer.from(buf).toString('base64');
  return {
    name: 'inline-pwa',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const svg = `data:image/svg+xml;base64,${b64(readFileSync('public/icon.svg'))}`;
        const png = `data:image/png;base64,${b64(readFileSync('public/icon-192.png'))}`;
        const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
        manifest.icons = [{ src: png, sizes: '192x192', type: 'image/png' }, { src: svg, sizes: 'any', type: 'image/svg+xml' }];
        return html
          .replace('href="manifest.webmanifest"', `href="data:application/manifest+json;base64,${b64(JSON.stringify(manifest))}"`)
          .replace('href="icon.svg"', `href="${svg}"`)
          .replace('href="icon-192.png"', `href="${png}"`);
      },
    },
  };
}

// Modes: default (multi-file, Capacitor/web), "single" (one self-contained HTML for hosted
// playtests), "simtest" (adds the window.__BR sim hook for Playwright — never ship it).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [preact(), ...(mode === 'single' ? [viteSingleFile(), inlinePwa()] : [])],
  publicDir: mode === 'single' ? false : 'public',
  define: { __SIM_HOOK__: JSON.stringify(mode === 'simtest') },
  build: {
    outDir: mode === 'single' ? 'dist-single' : mode === 'simtest' ? 'dist-test' : 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
  },
  test: { include: ['tests/**/*.test.ts'], environment: 'node', testTimeout: 180_000 },
}));
