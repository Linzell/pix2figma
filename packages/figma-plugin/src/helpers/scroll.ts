/**
 * @pix2figma/figma-plugin — Scroll helpers
 *
 * Handles scroll-container capping, fold-marker drawing, and
 * post-build ancestor propagation so scroll content is visible.
 */

declare const figma: any;

import type { ScrollInfo } from './types';
import {
  MAX_SCROLL_FACTOR,
  SCROLL_FOLD_DASH,
  FOLD_LABEL_RIGHT_OFFSET,
  Colors,
  FOLD_OPACITY,
} from './constants';
import { ensureFont } from './fonts';

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Caps oversized children inside a scroll container frame.
 *
 * When the total scroll height exceeds `visibleHeight * MAX_SCROLL_FACTOR`,
 * child frames are resized down and internal content is "scrolled" up so
 * the bottom-most (usually most recent) content remains visible.
 *
 * After capping, the scroll container itself is resized to tightly fit
 * its children (plus a small margin for the fold label).
 *
 * @param frame      - The Figma frame acting as the scroll container.
 * @param scrollInfo - Visible and total scroll heights from the extractor.
 * @param frameWidth - The frame's width (used for fold marker sizing).
 * @returns `true` if any child was capped, `false` otherwise.
 */
export function capScrollContent(
  frame: any,
  scrollInfo: ScrollInfo,
  frameWidth: number,
): boolean {
  const { visibleHeight, totalHeight } = scrollInfo;
  const cappedContentH = Math.round(visibleHeight * MAX_SCROLL_FACTOR);

  if (totalHeight <= cappedContentH || !frame.children?.length) {
    return false;
  }

  let shiftAmount = 0;
  let wasCapped = false;

  for (const child of frame.children) {
    // Only process frame-type children (skip fold markers, labels, etc.)
    if (child.type !== 'FRAME') continue;

    // Shift this child up by the cumulative amount removed above
    if (shiftAmount > 0) {
      child.y -= shiftAmount;
    }

    // Cap oversized children
    if (child.height > cappedContentH) {
      const oldH = child.height;
      const newH = cappedContentH;
      const scrollUpBy = oldH - newH;

      // Scroll internal content up so the bottom portion is visible
      if (child.children?.length) {
        for (const grandChild of child.children) {
          grandChild.y -= scrollUpBy;
        }
      }

      try {
        child.resize(child.width, newH);
        child.clipsContent = true;
      } catch {
        // Resize may fail on some node types
      }

      shiftAmount += oldH - newH;
      wasCapped = true;
    }
  }

  // Resize the scroll container to fit capped content
  let maxBottom = 0;
  for (const child of frame.children) {
    const childBottom = child.y + child.height;
    if (childBottom > maxBottom) {
      maxBottom = childBottom;
    }
  }

  // Extra room for the fold label
  const newFrameH = Math.max(maxBottom + 20, visibleHeight);
  try {
    frame.resize(frame.width, newFrameH);
  } catch {
    // Resize may fail
  }

  // Don't clip the scroll container itself — show the fold marker
  frame.clipsContent = false;

  return wasCapped;
}

/**
 * Draws a scroll-fold marker (dashed line + label) at the visible boundary.
 *
 * Placed at `foldY` (the original visible height) inside the scroll frame.
 * When content was capped, the label includes the original and capped sizes.
 *
 * @param frame     - The scroll container frame.
 * @param foldY     - Y position for the fold line (= `scrollInfo.visibleHeight`).
 * @param foldWidth - Width of the fold line (= frame width).
 * @param wasCapped - Whether `capScrollContent` actually capped anything.
 * @param totalH    - Original total scroll height.
 * @param cappedH   - The height content was capped to.
 */
export async function drawFoldMarker(
  frame: any,
  foldY: number,
  foldWidth: number,
  wasCapped: boolean,
  totalH: number,
  cappedH: number,
): Promise<void> {
  // ── Dashed fold line ────────────────────────────────────────────────
  const foldLine = figma.createLine();
  foldLine.name = 'Scroll fold';
  foldLine.resize(foldWidth, 0);
  foldLine.strokes = [
    { type: 'SOLID', color: Colors.FOLD_LINE, opacity: FOLD_OPACITY },
  ];
  foldLine.strokeWeight = 1.5;
  foldLine.dashPattern = [...SCROLL_FOLD_DASH];

  frame.appendChild(foldLine);
  try {
    foldLine.layoutPositioning = 'ABSOLUTE';
  } catch {
    // Not in auto-layout
  }
  foldLine.x = 0;
  foldLine.y = foldY;

  // ── Fold label ──────────────────────────────────────────────────────
  await ensureFont('Inter', 'Semi Bold');

  const foldLabel = figma.createText();
  foldLabel.fontName = { family: 'Inter', style: 'Semi Bold' };
  foldLabel.fontSize = 11;

  const labelText = wasCapped
    ? `Scroll fold (${totalH}px total, capped to ${cappedH}px)`
    : 'Scroll fold';

  foldLabel.characters = labelText;
  foldLabel.fills = [
    { type: 'SOLID', color: Colors.FOLD_LABEL, opacity: FOLD_OPACITY },
  ];
  foldLabel.textAutoResize = 'WIDTH_AND_HEIGHT';
  foldLabel.name = 'Scroll fold label';

  frame.appendChild(foldLabel);
  try {
    foldLabel.layoutPositioning = 'ABSOLUTE';
  } catch {
    // Not in auto-layout
  }
  foldLabel.x = Math.max(0, foldWidth - FOLD_LABEL_RIGHT_OFFSET);
  foldLabel.y = foldY - 16;
}

/**
 * Propagates scroll-container unrolling up the ancestor chain.
 *
 * After building the Figma tree, scroll containers are unrolled (full height,
 * no clip). But their ancestor frames may still clip at their original CSS
 * height. This function finds scroll containers (frames containing a child
 * named `"Scroll fold"`), walks up the parent chain, and grows + unclips
 * each ancestor so the full scroll content is visible.
 *
 * Stops at `stopFrame` (typically the page-level frame).
 *
 * @param frame     - The root frame to search for scroll containers.
 * @param stopFrame - The topmost frame to propagate to (exclusive).
 */
export function propagateScrollUnroll(frame: any, stopFrame: any): void {
  const scrollFrames: any[] = [];
  collectScrollFrames(frame, scrollFrames);

  for (const scrollFrame of scrollFrames) {
    growAncestors(scrollFrame, stopFrame);
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────

/**
 * Recursively collects frames that contain a "Scroll fold" child.
 */
function collectScrollFrames(node: any, result: any[]): void {
  if (!node?.children) return;

  const hasScrollFold = node.children.some(
    (child: any) => child.name === 'Scroll fold',
  );

  if (hasScrollFold) {
    result.push(node);
  }

  for (const child of node.children) {
    if (
      child.type === 'FRAME' ||
      child.type === 'COMPONENT' ||
      child.type === 'INSTANCE'
    ) {
      collectScrollFrames(child, result);
    }
  }
}

/**
 * Walks up from a scroll frame to the stop frame, growing and unclipping
 * each ancestor so the expanded scroll content remains visible.
 */
function growAncestors(scrollFrame: any, stopFrame: any): void {
  let current = scrollFrame;
  let ancestor = current.parent;

  while (ancestor && ancestor.id !== stopFrame.id) {
    // Only process frame-type nodes
    if (
      ancestor.type !== 'FRAME' &&
      ancestor.type !== 'COMPONENT' &&
      ancestor.type !== 'INSTANCE'
    ) {
      break;
    }

    // Remove clip so expanded content is visible
    try {
      ancestor.clipsContent = false;
    } catch {
      // Ignore
    }

    let hasLayout = false;
    try {
      hasLayout = !!ancestor.layoutMode && ancestor.layoutMode !== 'NONE';
    } catch {
      // Ignore
    }

    if (hasLayout) {
      // Auto-layout parent: switch to HUG so it naturally grows
      let isVertical = false;
      try {
        isVertical = ancestor.layoutMode === 'VERTICAL';
      } catch {
        // Ignore
      }

      if (isVertical) {
        try {
          ancestor.primaryAxisSizingMode = 'AUTO';
        } catch {
          // Ignore
        }
      } else {
        try {
          ancestor.counterAxisSizingMode = 'AUTO';
        } catch {
          // Ignore
        }
      }

      // Make the current child fill available space on the primary axis
      try {
        if (isVertical && 'layoutSizingVertical' in current) {
          current.layoutSizingVertical = 'FILL';
        } else if (!isVertical && 'layoutSizingHorizontal' in current) {
          current.layoutSizingHorizontal = 'FILL';
        }
      } catch {
        // Ignore
      }
    } else {
      // No auto-layout: manually resize to fit children
      let maxBottom = 0;
      for (const child of ancestor.children) {
        const childBottom = child.y + child.height;
        if (childBottom > maxBottom) {
          maxBottom = childBottom;
        }
      }

      const paddingBottom = ancestor.paddingBottom ?? 0;
      const neededHeight = maxBottom + paddingBottom;

      if (neededHeight > ancestor.height) {
        try {
          ancestor.resize(ancestor.width, neededHeight);
        } catch {
          // Ignore
        }
      }
    }

    current = ancestor;
    ancestor = ancestor.parent;
  }

  // Unclip the stop frame itself, just in case
  if (ancestor?.id === stopFrame.id) {
    try {
      ancestor.clipsContent = false;
    } catch {
      // Ignore
    }
  }
}
