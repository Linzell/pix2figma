/**
 * @pix2figma/figma-plugin — Image node renderer
 *
 * Creates a placeholder rectangle for `<img>` elements.
 * Actual image data is not transferred — the placeholder uses a light grey
 * fill with border-radius from the extracted styles.
 */

declare const figma: any;

import type { ImageDomNode } from '../helpers/types';
import { applyBorderRadius } from '../helpers/styles';
import { appendAndPosition } from '../helpers/layout';
import { Colors } from '../helpers/constants';

/**
 * Creates a Figma rectangle placeholder for an image DOM node.
 *
 * @param domNode            - The extracted image DOM node.
 * @param parent             - Parent Figma frame.
 * @param parentRect         - Absolute `{ x, y }` of the parent.
 * @param isAutoLayoutChild  - Whether the parent has auto-layout enabled.
 * @returns The created RectangleNode, or `null`.
 */
export async function createImageNode(
  domNode: ImageDomNode,
  parent: any,
  parentRect: { x: number; y: number },
  isAutoLayoutChild: boolean,
  _gridRow?: number,
  _gridColumn?: number,
): Promise<any | null> {
  const s = domNode.styles ?? {};

  const imgRect = figma.createRectangle();
  imgRect.name = 'Image';
  imgRect.resize(
    Math.max(domNode.width ?? 100, 1),
    Math.max(domNode.height ?? 100, 1),
  );
  imgRect.fills = [{ type: 'SOLID', color: Colors.IMAGE_PLACEHOLDER }];

  applyBorderRadius(imgRect, s);

  // ── Append & position ─────────────────────────────────────────────
  const relX = (domNode.x ?? 0) - (parentRect?.x ?? 0);
  const relY = (domNode.y ?? 0) - (parentRect?.y ?? 0);
  appendAndPosition(imgRect, parent, s, isAutoLayoutChild, relX, relY);

  return imgRect;
}
