# pix2figma

Transfer React / TypeScript / Vite app UIs into Figma as **native editable layers** (frames, text, auto-layout) -- not flat screenshots.

## Packages

| Package | Description |
|---------|-------------|
| [`@pix2figma/extractor`](./packages/extractor) | Browser-side DOM extraction + floating overlay UI |
| [`@pix2figma/vite-plugin`](./packages/vite-plugin) | Vite dev-server plugin (middleware + script injection) |
| [`@pix2figma/figma-plugin`](./packages/figma-plugin) | Figma plugin that renders extracted DOM as native layers |

## How it works

1. Add the Vite plugin to your project.
2. Open your app in a browser -- a floating overlay button appears.
3. Navigate to any page/state, click the overlay, name the page + state.
4. The DOM tree (with computed styles) is extracted and POSTed to the Vite dev server.
5. In Figma, run the pix2figma plugin -- it fetches the extraction and creates native editable layers.

Each screen gets its own Figma page. Multiple states of the same screen appear side by side with labels. Re-importing the same state replaces the previous one.

## Quick start

### Prerequisites

- [Bun](https://bun.sh) >= 1.3
- Node.js >= 18
- Figma desktop app (Enterprise plan for Variables API)

### Install & build

```bash
cd pix2figma
bun install
bun run build
```

### Link into a consumer project

```bash
# In the monorepo -- register packages globally
cd packages/extractor && bun link
cd ../vite-plugin && bun link
cd ../figma-plugin && bun link

# In your Vite project
bun link @pix2figma/extractor
bun link @pix2figma/vite-plugin
bun link @pix2figma/figma-plugin
```

### Add to vite.config.ts

```ts
import pix2figma from '@pix2figma/vite-plugin';

export default defineConfig({
  plugins: [
    // ...your other plugins
    pix2figma(),
  ],
});
```

### Scaffold the Figma plugin manifest

```bash
npx @pix2figma/vite-plugin init
```

This creates `figma-plugin/manifest.json` that points to the installed
`@pix2figma/figma-plugin` dist files in `node_modules`. It auto-detects:
- **Project name** from `package.json` (e.g. `maiia-frontflow` -> `Maiia Frontflow Screen Importer`)
- **Dev server port** from `vite.config.ts` (e.g. `port: 1420`)

You can override with flags:

```bash
npx @pix2figma/vite-plugin init --name "My App Importer" --port 3000
```

Then in Figma: **Plugins > Development > Import plugin from manifest** and point it to the generated `figma-plugin/manifest.json`.

> Only the `manifest.json` lives in your project. `code.js` and `ui.html`
> are resolved from `node_modules` -- rebuilding the monorepo updates all
> consumer projects automatically.

### Options

```ts
pix2figma({
  maxExtractions: 20,    // max stored extractions (default: 20)
  maxBodySize: 50_000_000, // max POST body in bytes (default: 50MB)
  excludeSelectors: [],  // CSS selectors to exclude from extraction
})
```

## Dev server endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/__figma/health` | GET | Health check |
| `/__figma/dom` | POST | Store an extraction |
| `/__figma/dom` | GET | Get latest extraction |
| `/__figma/dom/:id` | GET | Get extraction by ID |
| `/__figma/screens` | GET | List all stored extractions |
| `/__figma/extractor.js` | GET | Serve the IIFE extractor bundle |
| `/__figma/client.js` | GET | Serve the bootstrap script |

## Architecture

```
Browser                    Vite Dev Server              Figma Plugin
---------                  ---------------              ------------
overlay click
  -> extractDOM()
  -> POST /__figma/dom  -> store in memory
                                                        fetch /__figma/screens
                                                        fetch /__figma/dom/:id
                                                        -> create Figma layers
```

## Key design decisions

- **Full DOM unrolling**: Scroll containers are unrolled to show full content, capped at ~3x visible height. A dashed fold marker line shows the viewport boundary.
- **Modern JS**: The Figma plugin sandbox supports ES2020+. All code uses modern syntax.
- **Deterministic IDs**: Extraction ID = `pageName--stateName`, so re-importing the same state replaces the old one.
- **No external dependencies** in the Figma plugin (runs in a sandboxed environment).

## License

MIT
