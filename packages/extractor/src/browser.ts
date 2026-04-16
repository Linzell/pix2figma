/**
 * @pix2figma/extractor — Browser entry point
 *
 * This module is the entry point for the IIFE bundle served to the browser.
 * It registers `window.__pix2figma_init` which the client bootstrap script
 * calls to set up the overlay + extraction.
 *
 * It's also importable as `@pix2figma/extractor/browser` for programmatic use.
 */

import { createOverlay } from './overlay/overlay';

// ─── Global types ─────────────────────────────────────────────────────────

declare global {
  interface Window {
    __pix2figma_init?: (
      serverUrl: string,
      options?: { excludeSelectors?: string[] },
    ) => void;
    __pix2figma_loaded?: boolean;
  }
}

// ─── Init function ────────────────────────────────────────────────────────

/**
 * Initialise pix2figma in the current page.
 *
 * Called by the bootstrap script injected by the Vite plugin.
 * Sets up the floating overlay button that triggers DOM extraction.
 *
 * @param serverUrl  Base URL for the dev server (empty string = same origin)
 * @param options    Optional config (exclude selectors, etc.)
 */
export function init(
  serverUrl: string,
  _options?: { excludeSelectors?: string[] },
): void {
  createOverlay(serverUrl);
}

// ─── Auto-register on window ──────────────────────────────────────────────

if (typeof window !== 'undefined') {
  window.__pix2figma_init = init;
}
