# @pix2figma/figma-plugin

Figma plugin that renders extracted DOM trees as native editable Figma layers. Part of [pix2figma](../../README.md).

## What it does

- Fetches extractions from the pix2figma Vite dev server.
- Creates native Figma frames, text nodes, images, and SVGs with proper auto-layout, colors, borders, shadows, and typography.
- Each screen gets its own Figma page; multiple states appear side by side with labels.
- Re-importing the same state replaces the previous version.
- Scroll containers are unrolled with a dashed fold marker line.

## Build

```bash
bun run build
```

Produces `dist/code.js`, `dist/ui.html`, and `dist/manifest.json`.

## Install in Figma

1. Copy the `dist/` contents into a `figma-plugin/` directory in your project.
2. In Figma desktop: **Plugins > Development > Import plugin from manifest**.
3. Update `manifest.json` `networkAccess.allowedDomains` if your dev server runs on a non-default port.

## Network access

The plugin needs to reach your Vite dev server. The default `manifest.json` allows ports 1420, 3000, 4321, 5173, and 5174. Edit as needed.

## Supported node types

- Frames (div, section, header, nav, etc.) with auto-layout
- Text nodes with font family, size, weight, color, line-height, letter-spacing, decoration
- Images (loaded via Figma `figma.createImage`)
- Inline SVGs (flattened to Figma vector nodes)
- Input fields (text inputs, checkboxes, radios with visual rendering)
- Embedded text (badges/pills with background + border-radius)
- List markers (bullets, numbered items)
