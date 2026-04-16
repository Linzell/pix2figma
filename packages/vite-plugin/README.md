# @pix2figma/vite-plugin

Vite plugin that adds Figma export capability to any Vite project. Part of [pix2figma](../../README.md).

## What it does

In dev mode, this plugin:

1. Injects `<script>` tags for the extractor IIFE bundle and a bootstrap client into your app's HTML.
2. Registers Connect middleware on the Vite dev server for the `/__figma/*` endpoints.
3. Stores extractions in memory so the Figma plugin can fetch them.

## Install

```bash
bun link @pix2figma/vite-plugin
bun link @pix2figma/extractor     # peer dependency
bun link @pix2figma/figma-plugin  # for Figma plugin files
```

## Usage

```ts
// vite.config.ts
import pix2figma from '@pix2figma/vite-plugin';

export default defineConfig({
  plugins: [pix2figma()],
});
```

## CLI

This package includes a CLI to scaffold the Figma plugin manifest:

```bash
npx @pix2figma/vite-plugin init
```

Auto-detects project name from `package.json` and dev server port from `vite.config.ts`.

```bash
npx @pix2figma/vite-plugin init --name "My Plugin" --port 3000 --force
```

| Flag | Description |
|------|-------------|
| `--name <name>` | Plugin display name in Figma |
| `--port <port>` | Dev server port (auto-detected) |
| `--dir <dir>` | Output directory (default: `figma-plugin`) |
| `--force` | Overwrite existing manifest |

## Options

```ts
pix2figma({
  maxExtractions: 20,       // max stored extractions (default: 20)
  maxBodySize: 50_000_000,  // max POST body in bytes (default: 50MB)
  excludeSelectors: [],     // CSS selectors to exclude from extraction
})
```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/__figma/health` | GET | Returns `{ status: "ok" }` |
| `/__figma/dom` | POST | Store an extraction |
| `/__figma/dom` | GET | Get latest extraction |
| `/__figma/dom/:id` | GET | Get extraction by ID |
| `/__figma/screens` | GET | List stored extractions (summary with node counts) |
| `/__figma/extractor.js` | GET | Serve the IIFE extractor bundle |
| `/__figma/client.js` | GET | Serve the bootstrap script |

## Build

```bash
bun run build
```
