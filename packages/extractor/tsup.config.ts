import { defineConfig } from 'tsup';

export default defineConfig([
  // ── Library builds (ESM + CJS) for use by vite-plugin & figma-plugin ──
  {
    entry: {
      index: 'src/index.ts',
      types: 'src/types.ts',
      browser: 'src/browser.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
  },
  // ── IIFE bundle for injection into the browser page ────────────────────
  // This is what the Vite plugin serves as `/__figma/extractor.js`.
  // It self-executes and registers `window.__pix2figma_init`.
  {
    entry: { 'extractor.iife': 'src/browser.ts' },
    format: ['iife'],
    outDir: 'dist',
    sourcemap: true,
    minify: false, // keep readable for debugging during dev
    // Inject CSS into the JS bundle so a single <script> tag suffices
    injectStyle: true,
  },
]);
