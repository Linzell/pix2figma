import { defineConfig } from 'tsup';

export default defineConfig([
  // Library build (plugin + server + client)
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
    external: ['vite', '@pix2figma/extractor', /^node:/],
  },
  // CLI build (init command)
  {
    entry: ['src/init.ts'],
    format: ['esm'],
    sourcemap: false,
    banner: { js: '#!/usr/bin/env node' },
    external: [/^node:/],
  },
]);
