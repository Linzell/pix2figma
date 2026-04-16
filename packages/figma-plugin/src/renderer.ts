/**
 * @pix2figma/figma-plugin — Renderer (dispatcher)
 *
 * Routes DOM nodes to the appropriate node renderer based on `domNode.type`.
 * Maintains the global node counter and reports progress to the UI.
 */

declare const figma: any;

import type { DomNode } from './helpers/types';
import { MAX_NODES } from './helpers/constants';
import { createTextNode } from './nodes/text';
import { createInputNode } from './nodes/input';
import { createImageNode } from './nodes/image';
import { createSvgNode } from './nodes/svg';
import { createFrameNode, injectCreateFigmaNode } from './nodes/frame';

// ─── Global node counter ──────────────────────────────────────────────────

let nodeCount = 0;

/**
 * Resets the node counter. Called at the start of each import.
 */
export function resetNodeCount(): void {
  nodeCount = 0;
}

/**
 * Returns the current node count.
 */
export function getNodeCount(): number {
  return nodeCount;
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Creates a Figma node from an extracted DOM node.
 *
 * Dispatches to the appropriate specialised renderer based on
 * `domNode.type` (`text`, `input`, `image`, `svg`, or `frame`).
 *
 * Enforces the `MAX_NODES` cap and reports progress every 50 nodes.
 *
 * @param domNode            - The extracted DOM node.
 * @param parent             - Parent Figma frame (may be `null` for root).
 * @param parentRect         - Absolute `{ x, y }` of the parent.
 * @param isAutoLayoutChild  - Whether the parent has auto-layout enabled.
 * @param gridRow           - Optional grid row index for grid placement.
 * @param gridColumn        - Optional grid column index for grid placement.
 * @returns The created SceneNode, or `null` if skipped.
 */
export async function createFigmaNode(
  domNode: DomNode,
  parent: any,
  parentRect: { x: number; y: number },
  isAutoLayoutChild: boolean,
  gridRow?: number,
  gridColumn?: number,
): Promise<any | null> {
  if (!domNode || nodeCount > MAX_NODES) return null;

  nodeCount++;

  // Report progress every 50 nodes
  if (nodeCount % 50 === 0) {
    figma.ui.postMessage({ type: 'progress', count: nodeCount });
  }

  switch (domNode.type) {
    case 'text':
      return createTextNode(domNode, parent, parentRect, isAutoLayoutChild, gridRow, gridColumn);

    case 'input':
      return createInputNode(domNode, parent, parentRect, isAutoLayoutChild);

    case 'image':
      return createImageNode(domNode, parent, parentRect, isAutoLayoutChild);

    case 'svg':
      return createSvgNode(domNode, parent, parentRect, isAutoLayoutChild);

    case 'frame':
      return createFrameNode(domNode, parent, parentRect, isAutoLayoutChild, gridRow, gridColumn);

    default:
      return null;
  }
}

// ─── Wire up the circular dependency ──────────────────────────────────────
// frame.ts needs createFigmaNode for recursive child rendering, but
// renderer.ts imports frame.ts. We break the cycle by injecting at init time.
injectCreateFigmaNode(createFigmaNode);
