/**
 * @pix2figma/figma-plugin — Embedded text renderer
 *
 * Handles badge / pill frames that wrap a single text label with
 * background and border-radius. Sets up auto-layout to centre the
 * text inside the frame.
 */

declare const figma: any;

import type { FrameDomNode } from '../helpers/types';
import { colorToFigma, getOpacity } from '../helpers/colors';
import { mapFontFamily, mapFontWeight, ensureFont } from '../helpers/fonts';
import { applyPadding } from '../helpers/styles';
import { DEFAULT_FONT_SIZE } from '../helpers/constants';

/**
 * Creates embedded text content inside a frame (badge/pill pattern).
 *
 * Configures the frame for horizontal auto-layout with centred alignment,
 * then appends a `WIDTH_AND_HEIGHT` text node.
 *
 * @param frame   - The parent Figma frame (already created and styled).
 * @param domNode - The extracted frame DOM node with `embeddedText`.
 */
export async function createEmbeddedTextNode(
  frame: any,
  domNode: FrameDomNode,
): Promise<void> {
  if (!domNode.embeddedText) return;

  const s = domNode.styles ?? {};

  // ── Set up auto-layout for centring ───────────────────────────────
  frame.layoutMode = 'HORIZONTAL';
  frame.primaryAxisAlignItems = 'CENTER';
  frame.counterAxisAlignItems = 'CENTER';
  frame.primaryAxisSizingMode = 'FIXED';
  frame.counterAxisSizingMode = 'FIXED';

  if (s.padding) {
    applyPadding(frame, s.padding);
  }

  // ── Create embedded text node ─────────────────────────────────────
  const fontFamily = mapFontFamily(s.fontFamily ?? '');
  const fontStyle = mapFontWeight(s.fontWeight ?? '400');
  await ensureFont(fontFamily, fontStyle);

  const textNode = figma.createText();
  textNode.fontName = { family: fontFamily, style: fontStyle };
  textNode.fontSize = s.fontSize ?? DEFAULT_FONT_SIZE;
  textNode.characters = domNode.embeddedText;
  textNode.textAutoResize = 'WIDTH_AND_HEIGHT';

  const textColor = colorToFigma(s.color);
  if (textColor) {
    textNode.fills = [
      { type: 'SOLID', color: textColor, opacity: getOpacity(s.color, 1) },
    ];
  }

  if (s.letterSpacing) {
    textNode.letterSpacing = { value: s.letterSpacing, unit: 'PIXELS' };
  }
  if (s.lineHeight) {
    textNode.lineHeight = { value: s.lineHeight, unit: 'PIXELS' };
  }

  frame.appendChild(textNode);
}
