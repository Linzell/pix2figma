/**
 * @pix2figma/figma-plugin — Text node renderer
 *
 * Creates Figma TextNode from extracted text DOM nodes.
 * Handles font loading, colour, decoration, transform, and auto-resize mode.
 */

declare const figma: any;

import type { TextDomNode } from '../helpers/types';
import { colorToFigma, getOpacity } from '../helpers/colors';
import { mapFontFamily, mapFontWeight, mapTextAlign, ensureFont } from '../helpers/fonts';
import { appendAndPosition, appendGridChild } from '../helpers/layout';
import {
  DEFAULT_FONT_SIZE,
  SHORT_TEXT_THRESHOLD,
  SINGLE_LINE_HEIGHT_FACTOR,
} from '../helpers/constants';

/**
 * Creates a Figma text node from an extracted text DOM node.
 *
 * @param domNode            - The extracted text DOM node.
 * @param parent             - Parent Figma frame (may be `null` for root).
 * @param parentRect         - Absolute `{ x, y }` of the parent, for relative positioning.
 * @param isAutoLayoutChild  - Whether the parent has auto-layout enabled.
 * @param gridRow           - Optional grid row index for grid placement.
 * @param gridColumn        - Optional grid column index for grid placement.
 * @returns The created TextNode, or `null` if the node has no text.
 */
export async function createTextNode(
  domNode: TextDomNode,
  parent: any,
  parentRect: { x: number; y: number },
  isAutoLayoutChild: boolean,
  gridRow?: number,
  gridColumn?: number,
): Promise<any | null> {
  if (!domNode.text) return null;

  const s = domNode.styles ?? {};

  // Check if parent is a grid
  const parentIsGrid = parent?.layoutMode === 'GRID';

  // ── Font loading ──────────────────────────────────────────────────
  let fontFamily = mapFontFamily(s.fontFamily ?? '');
  let fontStyle = mapFontWeight(s.fontWeight ?? '400');
  const fontOk = await ensureFont(fontFamily, fontStyle);
  if (!fontOk) {
    fontFamily = 'Inter';
    fontStyle = 'Regular';
  }

  // ── Create text node ──────────────────────────────────────────────
  const textNode = figma.createText();
  textNode.fontName = { family: fontFamily, style: fontStyle };
  textNode.fontSize = s.fontSize ?? DEFAULT_FONT_SIZE;
  textNode.characters = domNode.text;

  // Line height & letter spacing
  if (s.lineHeight) {
    textNode.lineHeight = { value: s.lineHeight, unit: 'PIXELS' };
  }
  if (s.letterSpacing) {
    textNode.letterSpacing = { value: s.letterSpacing, unit: 'PIXELS' };
  }

  // Alignment
  textNode.textAlignHorizontal = mapTextAlign(s.textAlign ?? '');

  // ── Text colour ───────────────────────────────────────────────────
  const textColor = colorToFigma(s.color);
  if (textColor) {
    textNode.fills = [
      { type: 'SOLID', color: textColor, opacity: getOpacity(s.color, 1) },
    ];
  }

  // ── Text decoration ────────────────────────────────────────────────
  if (s.textDecoration?.includes('underline')) {
    textNode.textDecoration = 'UNDERLINE';
  } else if (s.textDecoration?.includes('line-through')) {
    textNode.textDecoration = 'STRIKETHROUGH';
  }

  // ── Text transform ─────────────────────────────────────────────────
  if (s.textTransform === 'uppercase') {
    textNode.textCase = 'UPPER';
  } else if (s.textTransform === 'lowercase') {
    textNode.textCase = 'LOWER';
  }

  // ── Sizing ────────────────────────────────────────────────────────
  textNode.resize(
    Math.max(domNode.width ?? 100, 1),
    Math.max(domNode.height ?? 20, 1),
  );

  // ── Auto-resize mode ──────────────────────────────────────────────
  //
  // - Inline text children (tag "#text") inside flex parents: always hug
  //   content so they don't stretch to parent width and break flex ordering.
  // - Multi-line text (height > 1.5× fontSize): HEIGHT with fixed width
  //   to preserve wrapping.
  // - Centred text: HEIGHT with fixed width so centering has room.
  // - Short single-line text: let Figma auto-size width.
  const fontSize = s.fontSize ?? DEFAULT_FONT_SIZE;
  const isInlineText = domNode.tag === '#text';
  const isSingleLine =
    !domNode.text.includes('\n') &&
    (domNode.height ?? 20) < fontSize * SINGLE_LINE_HEIGHT_FACTOR;
  const isCentered = s.textAlign === 'center';

  if (isInlineText) {
    textNode.textAutoResize = 'WIDTH_AND_HEIGHT';
  } else if (!isSingleLine || isCentered) {
    textNode.textAutoResize = 'HEIGHT';
  } else if (domNode.text.length < SHORT_TEXT_THRESHOLD) {
    textNode.textAutoResize = 'WIDTH_AND_HEIGHT';
  } else {
    textNode.textAutoResize = 'HEIGHT';
  }

  // ── Append & position ─────────────────────────────────────────────
  const relX = (domNode.x ?? 0) - (parentRect?.x ?? 0);
  const relY = (domNode.y ?? 0) - (parentRect?.y ?? 0);

  if (parentIsGrid && gridRow !== undefined && gridColumn !== undefined) {
    appendGridChild(textNode, parent, gridRow, gridColumn, s);
  } else {
    appendAndPosition(textNode, parent, s, isAutoLayoutChild, relX, relY);
  }

  return textNode;
}
