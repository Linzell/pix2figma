/**
 * @pix2figma/figma-plugin — SVG node renderer
 *
 * Creates a Figma vector from SVG markup (via `figma.createNodeFromSvg`),
 * falling back to a coloured rectangle placeholder when parsing fails.
 */

declare const figma: any;

import type { SvgDomNode } from '../helpers/types';
import { colorToFigma, getOpacity } from '../helpers/colors';
import { appendAndPosition } from '../helpers/layout';
import { Colors } from '../helpers/constants';

/**
 * Creates a Figma node from an extracted SVG DOM node.
 *
 * Attempts to use `figma.createNodeFromSvg` for a real vector node.
 * On failure, falls back to a coloured rectangle placeholder.
 *
 * @param domNode            - The extracted SVG DOM node.
 * @param parent             - Parent Figma frame.
 * @param parentRect         - Absolute `{ x, y }` of the parent.
 * @param isAutoLayoutChild  - Whether the parent has auto-layout enabled.
 * @returns The created SceneNode (vector or rectangle), or `null`.
 */
export async function createSvgNode(
  domNode: SvgDomNode,
  parent: any,
  parentRect: { x: number; y: number },
  isAutoLayoutChild: boolean,
  _gridRow?: number,
  _gridColumn?: number,
): Promise<any | null> {
  const s = domNode.styles ?? {};
  const w = Math.max(domNode.width ?? 16, 1);
  const h = Math.max(domNode.height ?? 16, 1);

  let svgNode: any = null;

  // Try to create a real vector from SVG markup
  if (domNode.svgMarkup) {
    try {
      svgNode = figma.createNodeFromSvg(domNode.svgMarkup);
      svgNode.name = 'Icon';
      svgNode.resize(w, h);
    } catch {
      svgNode = null; // fallback below
    }
  }

  // Fallback: coloured rectangle placeholder
  if (!svgNode) {
    svgNode = figma.createRectangle();
    svgNode.name = 'Icon (SVG)';
    svgNode.resize(w, h);

    const iconColor = colorToFigma(s.color);
    if (iconColor) {
      svgNode.fills = [
        { type: 'SOLID', color: iconColor, opacity: getOpacity(s.color, 1) },
      ];
    } else {
      svgNode.fills = [{ type: 'SOLID', color: Colors.ICON_FALLBACK }];
    }
    svgNode.cornerRadius = 2;
  }

  // ── Append & position ─────────────────────────────────────────────
  const relX = (domNode.x ?? 0) - (parentRect?.x ?? 0);
  const relY = (domNode.y ?? 0) - (parentRect?.y ?? 0);
  appendAndPosition(svgNode, parent, s, isAutoLayoutChild, relX, relY);

  return svgNode;
}
