/**
 * @pix2figma/extractor — Text node measurement
 *
 * Runs in the browser. Uses the Range API to measure the precise bounding
 * box of individual `Text` nodes. This is critical for inline text that
 * doesn't fill its parent's bounding box (e.g. a short label inside a
 * wide flex container, or mixed text + icon children).
 *
 * The Range API gives the tightest possible rect around the rendered
 * glyphs, whereas `parentElement.getBoundingClientRect()` includes
 * padding, borders, and empty space from the parent's layout box.
 */

/**
 * Measure an inline `Text` node using the Range API.
 *
 * Falls back to the `parentRect` when the Range produces a zero-area
 * rect (which can happen for whitespace-only nodes or collapsed text).
 *
 * @param textNode   The DOM `Text` node to measure
 * @param parentRect The parent element's bounding rect (used as fallback)
 * @returns The viewport-relative position and size, rounded to integers
 */
export function measureTextNode(
  textNode: Text,
  parentRect: DOMRect,
): { x: number; y: number; width: number; height: number } {
  try {
    const range = document.createRange();
    range.selectNodeContents(textNode);
    const textRect = range.getBoundingClientRect();

    if (textRect.width > 0 && textRect.height > 0) {
      return {
        x: Math.round(textRect.left),
        y: Math.round(textRect.top),
        width: Math.round(textRect.width),
        height: Math.round(textRect.height),
      };
    }
  } catch {
    // Range API can throw on detached or invisible nodes — fall through
  }

  // Fallback: use the parent element's rect
  return {
    x: Math.round(parentRect.left),
    y: Math.round(parentRect.top),
    width: Math.round(parentRect.width),
    height: Math.round(parentRect.height),
  };
}
