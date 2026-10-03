import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Modes: default (multi-file, Capacitor/web), "single" (one self-contained HTML for hosted
// playtests), "simtest" (adds the window.__BR sim hook for Playwright — never ship it).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [preact(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  define: { __SIM_HOOK__: JSON.stringify(mode === 'simtest') },
  build: {
    outDir: mode === 'single' ? 'dist-single' : mode === 'simtest' ? 'dist-test' : 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
  },
  test: { include: ['tests/**/*.test.ts'], environment: 'node', testTimeout: 180_000 },
}));
