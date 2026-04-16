/**
 * @pix2figma/extractor — Element exclusion filters
 *
 * Runs in the browser. Determines whether a given HTML element should be
 * excluded from the Figma DOM extraction tree.
 *
 * ## Critical fixes vs. the original implementation:
 *
 * 1. **rect before TanStack check** — The original code referenced `rect`
 *    inside the TanStack text-content heuristic before `getBoundingClientRect`
 *    was called, causing a ReferenceError. This version requires `rect` as a
 *    parameter so it is always available.
 *
 * 2. **Cached TanStack ancestor detection** — The original called
 *    `el.closest('[class*="tsrd"], …')` on *every* element, which is O(depth)
 *    per call and involves expensive attribute-substring selectors.
 *    This version caches known TanStack roots in a `WeakSet` and walks up
 *    manually (once) to populate the cache.
 *
 * 3. **Off-screen filter respects scroll containers** — Children inside an
 *    expanded scroll container may have viewport-relative positions far below
 *    the fold. When `isInsideScrollContainer` is true, the off-screen check
 *    is skipped so these children are retained.
 */

// ─── TanStack ancestor cache ─────────────────────────────────────────────

/**
 * WeakSet of elements that are (or are inside) a TanStack devtools subtree.
 * Once an ancestor is identified, all its descendants are implicitly excluded
 * by the parent returning `null` during tree traversal, so in practice only
 * the root of each TanStack subtree ends up in the set.
 */
const tanstackRoots = new WeakSet<Element>();

/**
 * Pre-compiled class-name substrings that identify TanStack devtools elements.
 */
const TANSTACK_CLASS_TOKENS = ['tsrd', 'TanStackRouter'] as const;

/**
 * Check whether `el` itself looks like a TanStack devtools element
 * (class name, data attributes, or aria-label).
 */
function isTanStackElement(el: Element): boolean {
  // Class name checks
  const cn = el.className;
  if (typeof cn === 'string' && cn.length > 0) {
    for (const token of TANSTACK_CLASS_TOKENS) {
      if (cn.includes(token)) return true;
    }
  }

  // data-* attribute checks
  if (el instanceof HTMLElement && el.dataset) {
    const keys = Object.keys(el.dataset);
    for (let i = 0; i < keys.length; i++) {
      if (keys[i].toLowerCase().includes('tanstack')) return true;
    }
  }

  // aria-label check
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.toLowerCase().includes('tanstack')) return true;

  return false;
}

/**
 * Walk ancestors of `el` to find a TanStack devtools root.
 * Results are cached in `tanstackRoots` so repeated calls for elements
 * in the same subtree are O(1).
 *
 * @returns `true` if `el` or any ancestor is a TanStack devtools element
 */
function isInsideTanStack(el: Element): boolean {
  // Fast path: already known
  if (tanstackRoots.has(el)) return true;

  // Walk up the tree — stop at <body> / <html>
  let current: Element | null = el;
  const visited: Element[] = [];

  while (current && current !== document.documentElement) {
    if (tanstackRoots.has(current)) {
      // Cache all elements we visited on the way up
      for (const v of visited) tanstackRoots.add(v);
      return true;
    }

    if (isTanStackElement(current)) {
      tanstackRoots.add(current);
      for (const v of visited) tanstackRoots.add(v);
      return true;
    }

    visited.push(current);
    current = current.parentElement;
  }

  return false;
}

// ─── Options ──────────────────────────────────────────────────────────────

export interface ExcludeOptions {
  /** Additional CSS selectors to exclude (e.g. `['#my-debug-panel']`) */
  excludeSelectors?: string[];
  /**
   * When `true`, the off-screen check is skipped.
   * Set this for children whose nearest scroll-container ancestor was
   * expanded to its full `scrollHeight`, because their viewport-relative
   * `rect` may be far below the visible fold.
   */
  isInsideScrollContainer?: boolean;
}

// ─── Main filter ──────────────────────────────────────────────────────────

/**
 * Determine whether an element should be excluded from the Figma extraction.
 *
 * Checks (in order):
 * 1. CSS `display:none`, `visibility:hidden`, `opacity:0`
 * 2. Zero-size element (< 1px in both dimensions), except `<html>` / `<body>`
 * 3. Off-screen element (unless inside a scroll container)
 * 4. TanStack devtools subtree (cached ancestor detection)
 * 5. Pix2Figma overlay UI (`#__figma-overlay`)
 * 6. Custom `excludeSelectors`
 *
 * @param el      The HTML element to test
 * @param rect    The element's `getBoundingClientRect()` result — **must** be
 *                computed before calling this function
 * @param cs      The element's computed style declaration
 * @param options Additional filter options
 * @returns `true` if the element should be excluded from extraction
 */
export function shouldExcludeElement(
  el: HTMLElement,
  rect: DOMRect,
  cs: CSSStyleDeclaration,
  options: ExcludeOptions = {},
): boolean {
  // ── 1. Hidden via CSS ───────────────────────────────────────────────
  if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') {
    return true;
  }

  // ── 2. Zero-size element ────────────────────────────────────────────
  const tag = el.tagName;
  const MIN_SIZE = 1;
  if (rect.width < MIN_SIZE && rect.height < MIN_SIZE && tag !== 'HTML' && tag !== 'BODY') {
    return true;
  }

  // ── 3. Off-screen element ───────────────────────────────────────────
  // Skip this check for children inside an expanded scroll container —
  // their rects are relative to the viewport and may be hundreds of px
  // below the fold even though they are valid content.
  if (!options.isInsideScrollContainer) {
    if (
      rect.bottom < 0 ||
      rect.top > window.innerHeight * 2 ||
      rect.right < 0 ||
      rect.left > window.innerWidth * 2
    ) {
      return true;
    }
  }

  // ── 4. TanStack devtools ────────────────────────────────────────────
  // Text-content heuristic for small TanStack elements (e.g. floating button).
  // `rect` is guaranteed to be available here (parameter, not local variable).
  if (
    el.textContent &&
    el.textContent.includes('TanStack') &&
    rect.height < 100
  ) {
    return true;
  }

  // Full ancestor check (cached via WeakSet — no el.closest with attribute selectors)
  if (isInsideTanStack(el)) {
    return true;
  }

  // ── 5. Pix2Figma overlay ────────────────────────────────────────────
  if (el.id === '__figma-overlay') return true;
  try {
    if (el.closest('#__figma-overlay')) return true;
  } catch {
    // closest can throw on detached nodes
  }

  // ── 6. Custom selectors ─────────────────────────────────────────────
  if (options.excludeSelectors && options.excludeSelectors.length > 0) {
    for (const selector of options.excludeSelectors) {
      try {
        if (el.matches(selector)) return true;
      } catch {
        // Invalid selector — skip
      }
    }
  }

  return false;
}
