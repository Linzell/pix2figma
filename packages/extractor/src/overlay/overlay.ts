/**
 * @pix2figma/extractor — Overlay UI
 *
 * Creates a floating overlay button + panel that lets users:
 *  1. Name the page and (optionally) the state
 *  2. Extract the current DOM
 *  3. POST the result to the dev server
 *
 * Security notes:
 *  - Uses `textContent` (not `innerHTML`) for user-facing error messages
 *  - Guards `__figmaExtractorLoaded` on `window` to prevent duplicate overlays
 *  - SVG logo is stored once as a constant, not duplicated in every state change
 */

import { extractDOM } from '../extract';
import './overlay.css';

// ─── Duplicate guard ─────────────────────────────────────────────────────

declare global {
  interface Window {
    __figmaExtractorLoaded?: boolean;
  }
}

// ─── Figma logo SVG (single source of truth) ─────────────────────────────

const FIGMA_LOGO_SVG = `<svg class="figma-logo" viewBox="0 0 38 57" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path fill="#F24E1E" d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z"/>
  <path fill="#FF7262" d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z"/>
  <path fill="#A259FF" d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z"/>
  <path fill="#1ABCFE" d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z"/>
  <path fill="#0ACF83" d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z"/>
</svg>`;

// ─── Helper: set toggle button content ───────────────────────────────────

function setToggleContent(btn: HTMLButtonElement, label: string): void {
  // Clear existing children
  while (btn.firstChild) {
    btn.removeChild(btn.firstChild);
  }

  // Add SVG logo
  const template = document.createElement('template');
  template.innerHTML = FIGMA_LOGO_SVG.trim();
  const svgEl = template.content.firstChild;
  if (svgEl) btn.appendChild(svgEl);

  // Add text label
  const textSpan = document.createElement('span');
  textSpan.textContent = label;
  btn.appendChild(textSpan);
}

// ─── Helper: auto-fill page name from route ──────────────────────────────

function guessPageName(): string {
  const path = window.location.pathname;
  if (path === '/') return 'Home';
  return path
    .split('/')
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' '))
    .join(' > ');
}

// ─── Helper: create result display elements ──────────────────────────────

function showSuccess(
  resultDiv: HTMLDivElement,
  nodeCount: number,
): void {
  resultDiv.style.display = 'block';
  // Clear previous content
  resultDiv.textContent = '';

  const successSpan = document.createElement('span');
  successSpan.className = 'success';
  successSpan.textContent = 'Done!';
  resultDiv.appendChild(successSpan);

  resultDiv.appendChild(document.createTextNode(` ${nodeCount} nodes extracted.`));
  resultDiv.appendChild(document.createElement('br'));

  const hintSpan = document.createElement('span');
  hintSpan.className = 'muted';
  hintSpan.textContent = 'Open the Figma plugin and click "Import from Dev Server" to create layers.';
  resultDiv.appendChild(hintSpan);
}

function showError(
  resultDiv: HTMLDivElement,
  message: string,
): void {
  resultDiv.style.display = 'block';
  resultDiv.textContent = '';

  const errorSpan = document.createElement('span');
  errorSpan.className = 'error-text';
  errorSpan.textContent = 'Error: ';
  resultDiv.appendChild(errorSpan);

  // Use textContent to prevent XSS from error messages
  resultDiv.appendChild(document.createTextNode(message));
}

// ─── Main entry point ────────────────────────────────────────────────────

/**
 * Create the floating overlay UI for DOM extraction.
 *
 * @param serverUrl  Base URL of the dev server (e.g. `http://localhost:5173`).
 *                   The extraction result is POSTed to `serverUrl + '/__figma/dom'`.
 */
export function createOverlay(serverUrl: string): void {
  // Prevent duplicate overlays
  if (window.__figmaExtractorLoaded) return;
  window.__figmaExtractorLoaded = true;

  // ── Container ───────────────────────────────────────────────────────
  const container = document.createElement('div');
  container.id = '__figma-overlay';

  // ── Panel ───────────────────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.className = 'figma-panel';

  const infoDiv = document.createElement('div');
  infoDiv.className = 'info';
  infoDiv.textContent = "Extract the current page's DOM tree as native Figma layers.";
  panel.appendChild(infoDiv);

  // Page name input
  const pageLabel = document.createElement('label');
  pageLabel.textContent = 'Page name:';
  panel.appendChild(pageLabel);

  const pageInput = document.createElement('input');
  pageInput.type = 'text';
  pageInput.placeholder = 'e.g. Login, Dashboard...';
  panel.appendChild(pageInput);

  // State name input
  const stateLabel = document.createElement('label');
  stateLabel.textContent = 'State name ';
  const optionalSpan = document.createElement('span');
  optionalSpan.className = 'optional';
  optionalSpan.textContent = '(optional)';
  stateLabel.appendChild(optionalSpan);
  stateLabel.appendChild(document.createTextNode(':'));
  panel.appendChild(stateLabel);

  const stateInput = document.createElement('input');
  stateInput.type = 'text';
  stateInput.placeholder = 'e.g. Default, MFA, Dev Panel...';
  panel.appendChild(stateInput);

  const hintDiv = document.createElement('div');
  hintDiv.className = 'hint';
  hintDiv.textContent = 'Multiple states of the same page appear side by side on one Figma page.';
  panel.appendChild(hintDiv);

  // Extract button
  const extractBtn = document.createElement('button');
  extractBtn.className = 'extract-btn';
  extractBtn.textContent = 'Extract & Send to Server';
  panel.appendChild(extractBtn);

  // Result area
  const resultDiv = document.createElement('div') as HTMLDivElement;
  resultDiv.className = 'result';
  resultDiv.style.display = 'none';
  panel.appendChild(resultDiv);

  container.appendChild(panel);

  // ── Toggle button ───────────────────────────────────────────────────
  const toggleBtn = document.createElement('button') as HTMLButtonElement;
  toggleBtn.className = 'figma-btn';
  setToggleContent(toggleBtn, 'Figma Export');
  container.appendChild(toggleBtn);

  // ── Mount ───────────────────────────────────────────────────────────
  document.body.appendChild(container);

  // ── Toggle panel ────────────────────────────────────────────────────
  toggleBtn.addEventListener('click', () => {
    panel.classList.toggle('open');

    // Auto-fill page name from route on first open
    if (!pageInput.value) {
      pageInput.value = guessPageName();
    }
  });

  // ── Extract handler ─────────────────────────────────────────────────
  extractBtn.addEventListener('click', async () => {
    const pageName = pageInput.value.trim() || 'Untitled Page';
    const stateName = stateInput.value.trim() || 'Default';

    // Update UI to extracting state
    extractBtn.textContent = 'Extracting...';
    extractBtn.disabled = true;
    toggleBtn.className = 'figma-btn extracting';
    setToggleContent(toggleBtn, 'Extracting...');

    try {
      // Extract the DOM
      const extraction = extractDOM();

      // Build the ID
      const id =
        pageName.toLowerCase().replace(/[^a-z0-9]+/g, '-') +
        '--' +
        stateName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      // POST to dev server
      const url = serverUrl.replace(/\/$/, '') + '/__figma/dom';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          name: pageName,
          stateName,
          viewport: extraction.viewport,
          tree: extraction.tree,
        }),
      });

      const data: { nodeCount?: number } = await res.json();

      // Success feedback
      showSuccess(resultDiv, data.nodeCount ?? 0);
      extractBtn.textContent = 'Extract Again';
      toggleBtn.className = 'figma-btn done';
      setToggleContent(toggleBtn, 'Done!');

      // Reset toggle after 3s
      setTimeout(() => {
        toggleBtn.className = 'figma-btn';
        setToggleContent(toggleBtn, 'Figma Export');
      }, 3000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      showError(resultDiv, message);
      extractBtn.textContent = 'Retry';
      toggleBtn.className = 'figma-btn error';
      setToggleContent(toggleBtn, 'Error');
    }

    extractBtn.disabled = false;
  });
}
