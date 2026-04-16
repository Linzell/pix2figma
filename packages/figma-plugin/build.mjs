/**
 * @pix2figma/figma-plugin — esbuild script
 *
 * Bundles the TypeScript source into a single `dist/code.js` file
 * suitable for Figma's plugin sandbox. Figma expects a single JS file
 * with no ES module imports.
 *
 * The UI HTML is read from `ui.html` and injected via esbuild's `define`
 * as the global `__html__` constant that `main.ts` declares.
 */

import * as esbuild from 'esbuild';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');

// Read ui.html and prepare it as a JSON string literal for `define`
const uiHtml = readFileSync(resolve(__dirname, 'ui.html'), 'utf-8');

const buildOptions = {
  entryPoints: [resolve(__dirname, 'src/main.ts')],
  bundle: true,
  outfile: resolve(__dirname, 'dist/code.js'),
  format: 'iife',
  target: 'es2017', // Figma sandbox doesn't support optional chaining (?.) or nullish coalescing (??)
  platform: 'neutral', // Figma sandbox is not node or browser
  banner: {
    js: '// @pix2figma/figma-plugin — Generated code. Do not edit.\n',
  },
  // Inject the UI HTML as the __html__ global
  define: {
    __html__: JSON.stringify(uiHtml),
  },
  logLevel: 'info',
};

// Ensure dist directory exists
mkdirSync(resolve(__dirname, 'dist'), { recursive: true });

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('[figma-plugin] Watching for changes...');
} else {
  await esbuild.build(buildOptions);

  // Copy ui.html and manifest.json to dist for direct use from the dist folder
  const copies = ['ui.html', 'manifest.json'];
  for (const file of copies) {
    const src = resolve(__dirname, file);
    const dst = resolve(__dirname, 'dist', file);
    writeFileSync(dst, readFileSync(src, 'utf-8'));
  }

  console.log('[figma-plugin] Build complete: dist/code.js, dist/ui.html, dist/manifest.json');
}
