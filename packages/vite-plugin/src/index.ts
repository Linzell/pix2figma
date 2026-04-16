/**
 * @pix2figma/vite-plugin
 *
 * Vite plugin that adds Figma export capability to any Vite project.
 *
 * Usage:
 *   import pix2figma from '@pix2figma/vite-plugin';
 *   export default defineConfig({ plugins: [pix2figma()] });
 *
 * In dev mode this plugin:
 *   1. Injects the pix2figma client bootstrap + extractor bundle via
 *      transformIndexHtml.
 *   2. Registers Connect middleware on the Vite dev server for the
 *      /__figma/* endpoints (health, dom, screens).
 */

import type { Plugin, ViteDevServer } from 'vite';
import type { Pix2FigmaOptions } from '@pix2figma/extractor';
import type { ResolvedOptions } from './types';
import { createFigmaMiddleware } from './server';
import { getClientScript } from './client';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';

// ─── Defaults ─────────────────────────────────────────────────────────────

const DEFAULT_MAX_EXTRACTIONS = 20;
const DEFAULT_MAX_BODY_SIZE = 50 * 1024 * 1024; // 50 MB

function resolveOptions(opts?: Pix2FigmaOptions): ResolvedOptions {
  return {
    maxExtractions: opts?.maxExtractions ?? DEFAULT_MAX_EXTRACTIONS,
    maxBodySize: opts?.maxBodySize ?? DEFAULT_MAX_BODY_SIZE,
    excludeSelectors: opts?.excludeSelectors ?? [],
  };
}

/**
 * Locate the extractor IIFE bundle.
 *
 * The `@pix2figma/extractor` package builds an IIFE bundle at
 * `dist/extractor.iife.js`. We find it by resolving the package
 * and reading the file from its dist directory.
 */
function loadExtractorBundle(): string {
  try {
    const require = createRequire(import.meta.url);
    const extractorPkg = require.resolve('@pix2figma/extractor/package.json');
    const extractorDir = dirname(extractorPkg);
    const iifePath = resolve(extractorDir, 'dist', 'extractor.iife.global.js');
    return readFileSync(iifePath, 'utf-8');
  } catch {
    // Fallback: try relative path within the monorepo
    try {
      const fallbackPath = resolve(
        dirname(new URL(import.meta.url).pathname),
        '../../extractor/dist/extractor.iife.global.js',
      );
      return readFileSync(fallbackPath, 'utf-8');
    } catch {
      console.warn(
        '[pix2figma] Could not load extractor IIFE bundle. ' +
        'Make sure @pix2figma/extractor is built first.',
      );
      return '// ERROR: @pix2figma/extractor IIFE bundle not found\n';
    }
  }
}

// ─── Plugin factory ───────────────────────────────────────────────────────

/**
 * Create the pix2figma Vite plugin.
 *
 * @param options - Optional configuration
 * @returns A Vite plugin instance (dev-only)
 */
export default function pix2figma(options?: Pix2FigmaOptions): Plugin {
  const resolved = resolveOptions(options);

  // Lazily loaded on first request, cached afterwards
  let extractorBundle: string | null = null;

  return {
    name: 'pix2figma',
    apply: 'serve', // dev only

    /**
     * Inject the client-side scripts into the HTML.
     *
     * Two script tags are injected (order matters):
     *   1. The extractor IIFE bundle (registers `window.__pix2figma_init`).
     *   2. The bootstrap script that calls `__pix2figma_init` with config.
     */
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { src: '/__figma/extractor.js' },
          injectTo: 'body' as const,
        },
        {
          tag: 'script',
          attrs: { src: '/__figma/client.js' },
          injectTo: 'body' as const,
        },
      ];
    },

    /**
     * Register the middleware on the Vite dev server.
     */
    configureServer(server: ViteDevServer) {
      const middleware = createFigmaMiddleware(resolved);

      // Serve the extractor IIFE bundle
      server.middlewares.use('/__figma/extractor.js', (_req, res) => {
        if (!extractorBundle) {
          extractorBundle = loadExtractorBundle();
        }
        res.setHeader('Content-Type', 'application/javascript');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(extractorBundle);
      });

      // Serve the client bootstrap script
      server.middlewares.use('/__figma/client.js', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(getClientScript('', resolved.excludeSelectors));
      });

      // Register the API middleware
      server.middlewares.use(middleware);
    },
  };
}

// ─── Re-exports ───────────────────────────────────────────────────────────

export type { Pix2FigmaOptions } from '@pix2figma/extractor';
export type {
  StoredExtractionWithCount,
  ExtractionSummary,
  ResolvedOptions,
} from './types';
export { createFigmaMiddleware } from './server';
export { getClientScript } from './client';
