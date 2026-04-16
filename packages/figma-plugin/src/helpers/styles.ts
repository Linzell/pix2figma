/**
 * @pix2figma/figma-plugin — Style application helpers
 *
 * Applies extracted CSS visual styles (fills, borders, radii, shadows,
 * padding) to Figma frame/rectangle nodes.
 */

import type { ExtractedStyles, Padding } from './types';
import { colorToFigma, getOpacity, createRGBA, degreesToTransform } from './colors';

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Applies background fills (solid and/or gradient) to a Figma node.
 *
 * When neither `backgroundColor` nor `gradient` is present in the styles
 * the node receives an empty fills array (transparent).
 *
 * @param node   - A Figma node with a `.fills` property (Frame, Rectangle, etc.).
 * @param styles - Extracted styles from the DOM extractor.
 */
export function applyFills(node: any, styles: ExtractedStyles): void {
  const fills: any[] = [];

  // ── Gradient fill ───────────────────────────────────────────────────
  const g = styles.gradient;
  if (g?.type === 'linear' && g.stops && g.stops.length >= 2) {
    const gradientStops = g.stops.map((stop, i) => {
      const stopColor = colorToFigma(stop.color);
      let pos = stop.position;
      if (typeof pos !== 'number' || Number.isNaN(pos)) {
        pos = i / (g.stops.length - 1);
      }
      pos = Math.max(0, Math.min(1, pos));
      return {
        position: pos,
        color: createRGBA(stop.color, 1),
      };
    });

    fills.push({
      type: 'GRADIENT_LINEAR',
      gradientTransform: degreesToTransform(g.angle ?? 180),
      gradientStops,
    });
  }

  // ── Solid background fill ───────────────────────────────────────────
  if (styles.backgroundColor) {
    const bg = colorToFigma(styles.backgroundColor);
    if (bg) {
      fills.push({
        type: 'SOLID',
        color: bg,
        opacity: getOpacity(styles.backgroundColor, 1),
      });
    }
  }

  node.fills = fills;
}

/**
 * Applies border strokes to a Figma node.
 *
 * Supports uniform borders and per-side widths (e.g. `border-top` only).
 * Dashed borders are mapped to Figma dash patterns.
 *
 * @param node   - A Figma node with stroke properties.
 * @param styles - Extracted styles from the DOM extractor.
 */
export function applyBorder(node: any, styles: ExtractedStyles): void {
  const border = styles.border;
  if (!border?.color) return;

  const borderColor = colorToFigma(border.color);
  if (!borderColor) return;

  node.strokes = [
    {
      type: 'SOLID',
      color: borderColor,
      opacity: getOpacity(border.color, 1),
    },
  ];
  node.strokeAlign = 'INSIDE';

  if (border.style === 'dashed') {
    node.dashPattern = [4, 4];
  }

  // Per-side stroke widths
  if (border.top !== undefined) {
    const maxWeight = Math.max(
      border.top ?? 0,
      border.right ?? 0,
      border.bottom ?? 0,
      border.left ?? 0,
    );
    node.strokeWeight = maxWeight;
    node.strokeTopWeight = border.top ?? 0;
    node.strokeRightWeight = border.right ?? 0;
    node.strokeBottomWeight = border.bottom ?? 0;
    node.strokeLeftWeight = border.left ?? 0;
  } else if (border.width > 0) {
    node.strokeWeight = border.width;
  }
}

/**
 * Applies border-radius to a Figma node.
 *
 * Clamps each radius to half the node's smallest dimension so Figma
 * doesn't reject absurdly large values (e.g. `9999px` for pills).
 *
 * @param node   - A Figma node with corner-radius properties.
 * @param styles - Extracted styles from the DOM extractor.
 */
export function applyBorderRadius(
  node: any,
  styles: ExtractedStyles,
): void {
  const br = styles.borderRadius;
  if (!br) return;

  const maxR = Math.min(node.width ?? 9999, node.height ?? 9999) / 2;

  if (br.uniform !== undefined && br.uniform !== null && br.uniform > 0) {
    node.cornerRadius = Math.min(br.uniform, maxR);
  } else if (br.uniform === 0 && br.topLeft === 0 && br.topRight === 0 && br.bottomLeft === 0 && br.bottomRight === 0) {
    node.cornerRadius = 0;
  } else {
    node.topLeftRadius = Math.min(br.topLeft ?? 0, maxR);
    node.topRightRadius = Math.min(br.topRight ?? 0, maxR);
    node.bottomLeftRadius = Math.min(br.bottomLeft ?? 0, maxR);
    node.bottomRightRadius = Math.min(br.bottomRight ?? 0, maxR);
  }
}

/**
 * Applies box-shadow effects to a Figma node.
 *
 * Maps CSS `box-shadow` entries (including `inset`) to Figma
 * `DROP_SHADOW` / `INNER_SHADOW` effects.
 *
 * @param node   - A Figma node with an `.effects` property.
 * @param styles - Extracted styles from the DOM extractor.
 */
export function applyShadow(node: any, styles: ExtractedStyles): void {
  const shadows = styles.boxShadow;
  if (!shadows) return;

  // boxShadow may be a single object or an array depending on extraction
  const shadowList = Array.isArray(shadows) ? shadows : [shadows];

  const effects = shadowList.map((shadow: any) => ({
    type: shadow.inset ? 'INNER_SHADOW' : 'DROP_SHADOW',
    visible: true,
    blendMode: 'NORMAL',
    color: createRGBA(shadow.color, 0.1),
    offset: { x: shadow.x ?? 0, y: shadow.y ?? 0 },
    radius: shadow.blur ?? 0,
    spread: shadow.spread ?? 0,
  }));

  if (effects.length > 0) {
    node.effects = effects;
  }
}

/**
 * Applies padding values to a Figma auto-layout frame.
 *
 * This is a DRY helper — the original code repeats the four-side padding
 * assignment in at least three places (flex, grid, embedded text).
 *
 * @param frame   - A Figma frame node with padding properties.
 * @param padding - Padding values from the extractor.
 */
export function applyPadding(frame: any, padding: Padding): void {
  frame.paddingTop = padding.top ?? 0;
  frame.paddingRight = padding.right ?? 0;
  frame.paddingBottom = padding.bottom ?? 0;
  frame.paddingLeft = padding.left ?? 0;
}
