/**
 * @pix2figma/vite-plugin — Client script injection
 *
 * Returns a self-contained script string that bootstraps the pix2figma
 * overlay in the browser. The actual extractor logic lives in
 * @pix2figma/extractor and is injected as a separate bundled script tag
 * by the Vite plugin. This script just calls the init hook.
 */

/**
 * Generate the client-side bootstrap script.
 *
 * The script calls `window.__pix2figma_init(serverUrl)` which the
 * extractor bundle will have registered. This two-phase approach lets
 * us keep the extractor as a separate, properly bundled package.
 *
 * @param serverUrl - Base URL for the /__figma/* endpoints (e.g. "")
 * @param excludeSelectors - CSS selectors to exclude from extraction
 */
export function getClientScript(
  serverUrl: string,
  excludeSelectors: string[],
): string {
  const selectorsJson = JSON.stringify(excludeSelectors);

  return `
(function () {
  'use strict';

  // Avoid double-init
  if (window.__pix2figma_loaded) return;
  window.__pix2figma_loaded = true;

  var serverUrl = ${JSON.stringify(serverUrl)};
  var excludeSelectors = ${selectorsJson};

  /**
   * Wait for the extractor bundle to register its init function,
   * then call it. If it's already there, call immediately.
   */
  function boot() {
    if (typeof window.__pix2figma_init === 'function') {
      window.__pix2figma_init(serverUrl, { excludeSelectors: excludeSelectors });
    } else {
      // Extractor bundle hasn't loaded yet — wait for it
      var attempts = 0;
      var maxAttempts = 50; // 5 seconds
      var timer = setInterval(function () {
        attempts++;
        if (typeof window.__pix2figma_init === 'function') {
          clearInterval(timer);
          window.__pix2figma_init(serverUrl, { excludeSelectors: excludeSelectors });
        } else if (attempts >= maxAttempts) {
          clearInterval(timer);
          console.warn('[pix2figma] Extractor bundle did not load within 5s. Is @pix2figma/extractor installed?');
        }
      }, 100);
    }
  }

  // Boot after the DOM is interactive
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(boot, 500);
    });
  } else {
    // Small delay to not interfere with app hydration
    setTimeout(boot, 1000);
  }
})();
`;
}
