/**
 * @pix2figma/figma-plugin — List marker renderer
 *
 * Prepends a bullet or number text node inside `<li>` frames.
 * CSS `::marker` pseudo-elements are invisible to DOM extraction,
 * so we recreate them as Figma text nodes.
 */

declare const figma: any;

import type { FrameDomNode } from '../helpers/types';
import { colorToFigma, getOpacity } from '../helpers/colors';
import { mapFontFamily, mapFontWeight, ensureFont } from '../helpers/fonts';
import { DEFAULT_FONT_SIZE } from '../helpers/constants';

// ─── Marker character lookup ──────────────────────────────────────────────

const MARKER_CHARS: Record<string, string> = {
  disc: '\u2022 ',            // bullet •
  circle: '\u25E6 ',          // white bullet ◦
  square: '\u25AA ',          // small black square ▪
  decimal: '1. ',             // simplified numeral
  'decimal-leading-zero': '01. ',
};

const DEFAULT_MARKER = '\u2022 '; // fallback to disc

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Prepends a list marker text node inside a `<li>` frame.
 *
 * @param frame   - The `<li>` Figma frame (already created).
 * @param domNode - The extracted frame DOM node with `listMarker`.
 */
export async function createListMarker(
  frame: any,
  domNode: FrameDomNode,
): Promise<void> {
  if (!domNode.listMarker) return;

  const markerChar = MARKER_CHARS[domNode.listMarker] ?? DEFAULT_MARKER;
  const s = domNode.styles ?? {};

  // ── Load font ─────────────────────────────────────────────────────
  const fontFamily = s.fontFamily ? mapFontFamily(s.fontFamily) : 'Inter';
  const fontStyle = s.fontWeight ? mapFontWeight(s.fontWeight) : 'Regular';
  await ensureFont(fontFamily, fontStyle);

  // ── Create marker text node ───────────────────────────────────────
  const markerText = figma.createText();
  markerText.fontName = { family: fontFamily, style: fontStyle };
  markerText.fontSize = s.fontSize ?? DEFAULT_FONT_SIZE;
  markerText.characters = markerChar;
  markerText.textAutoResize = 'WIDTH_AND_HEIGHT';
  markerText.name = 'List marker';

  const markerColor = colorToFigma(s.color);
  if (markerColor) {
    markerText.fills = [
      { type: 'SOLID', color: markerColor, opacity: getOpacity(s.color, 1) },
    ];
  }

  frame.appendChild(markerText);
}
