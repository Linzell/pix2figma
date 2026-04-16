# @pix2figma/extractor

Browser-side DOM extraction and overlay UI for [pix2figma](../../README.md).

## What it does

- Walks the DOM tree and extracts computed styles, layout info, text content, images, and SVGs into a serializable JSON structure.
- Provides a floating overlay UI that lets users name pages/states and trigger extraction.
- Handles scroll containers, inline text measurement, gradients, shadows, borders, and modern color formats (`oklab`, `oklch`).

## Exports

| Entry | Description |
|-------|-------------|
| `@pix2figma/extractor` | `extractDOM()`, `extractNode()`, `createOverlay()`, and all types |
| `@pix2figma/extractor/types` | Type-only exports (interfaces) |
| `@pix2figma/extractor/browser` | IIFE entry point that registers `window.__pix2figma_init` |

## Build

```bash
bun run build
```

Produces:
- `dist/index.js` / `dist/index.cjs` -- ESM/CJS library
- `dist/extractor.iife.global.js` -- Self-contained IIFE bundle (~36KB) with inline CSS
- `dist/*.d.ts` -- TypeScript declarations

## Usage (library)

```ts
import { extractDOM, createOverlay } from '@pix2figma/extractor';

const result = await extractDOM(document.body, {
  excludeSelectors: ['#__figma-overlay'],
});
```

## Usage (browser bundle)

The IIFE bundle is served by `@pix2figma/vite-plugin` at `/__figma/extractor.js`. It registers `window.__pix2figma_init(options)` which creates the overlay and wires up extraction + POST to the dev server.
