/**
 * @pix2figma/extractor — Border & border-radius parsing
 *
 * Runs in the browser. Extracts border widths, colors, styles, and
 * corner radii from a `CSSStyleDeclaration`.
 *
 * Border-radius values are clamped to `min(width, height) / 2` so that
 * CSS `rounded-full` (which resolves to absurdly large px values like
 * 9999px or 3.4e+38) maps correctly to Figma's max corner radius.
 */

import { parseColor } from './colors';
import type { ParsedBorder, ParsedBorderRadius } from './types';

const TAILWIND_RADIUS: Record<string, number> = {
  'none': 0, 'xs': 2, 'sm': 4, 'md': 6, 'lg': 8, 'xl': 12, '2xl': 16, '3xl': 24, '4xl': 32,
  'full': 9999,
};

function parseTailwindRadius(className: string): number {
  if (!className || typeof className !== 'string') return 0;
  
  const patterns = [
    /rounded-(\[(?:[^\]]+)\])/,
    /rounded-(\d+(?:\.\d+)?)/,
    /rounded-([a-z]+)/,
  ];

  for (const pattern of patterns) {
    try {
      const match = className.match(pattern);
      if (match && match[1] && typeof match[1] === 'string') {
        const value = match[1];
        if (typeof value !== 'string') { console.error('value is not string:', value); return 0; }
        if (value.startsWith('[')) {
          const inner = value.slice(1, -1);
          if (inner && inner.startsWith('--')) {
            const num = parseFloat(inner);
            return isNaN(num) ? 0 : num;
          }
          const num = parseFloat(inner);
          if (!isNaN(num)) return num;
        }
        return TAILWIND_RADIUS[value] ?? (parseFloat(value) || 0);
      }
    } catch (e) {
      console.error('parseTailwindRadius error:', e);
    }
  }
  return 0;
}

function extractTailwindRadius(className: string): { uniform: number; topLeft: number; topRight: number; bottomLeft: number; bottomRight: number } {
  if (!className || typeof className !== 'string') {
    return { uniform: 0, topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 };
  }
  
  function parseCorner(prefix: string): number {
    const cornerPatterns = [
      new RegExp(`${prefix}-(\\[(?:[^\\]]+)\\])`, ''),
      new RegExp(`${prefix}-(\\d+(?:\\.\\d+)?)`, ''),
      new RegExp(`${prefix}-([a-z]+)`, ''),
    ];
    for (const pattern of cornerPatterns) {
      try {
        const match = className.match(pattern);
        if (match && match[1] && typeof match[1] === 'string') {
          const value = match[1];
          if (typeof value !== 'string') { console.error('corner value is not string:', value); return 0; }
          if (value.startsWith('[')) {
            const inner = value.slice(1, -1);
            if (inner && inner.startsWith('--')) {
              const num = parseFloat(inner);
              return isNaN(num) ? 0 : num;
            }
            const num = parseFloat(inner);
            if (!isNaN(num)) return num;
          }
          return TAILWIND_RADIUS[value] ?? (parseFloat(value) || 0);
        }
      } catch (e) {
        console.error('parseCorner error:', e);
      }
    }
    return 0;
  }

  const all = parseTailwindRadius(className);
  const tl = parseCorner('rounded-tl');
  const tr = parseCorner('rounded-tr');
  const bl = parseCorner('rounded-bl');
  const br = parseCorner('rounded-br');

  if (tl === 0 && tr === 0 && bl === 0 && br === 0) {
    return { uniform: all, topLeft: all, topRight: all, bottomLeft: all, bottomRight: all };
  }
  return { uniform: 0, topLeft: tl, topRight: tr, bottomLeft: bl, bottomRight: br };
}

/**
 * Parse the four corner border-radius values from computed styles.
 *
 * Clamps each corner to `min(width, height) / 2` so that CSS
 * `border-radius: 9999px` (Tailwind `rounded-full`) produces a
 * perfect circle / pill shape in Figma.
 *
 * @param cs     Computed style declaration
 * @param width  Element's rendered width in px
 * @param height Element's rendered height in px
 * @param el     HTML element (for Tailwind class name parsing as CSS var fallback)
 */
export function parseBorderRadius(
  cs: CSSStyleDeclaration,
  width: number,
  height: number,
  el?: HTMLElement,
): ParsedBorderRadius {
  let tl = parseFloat(cs.borderTopLeftRadius) || 0;
  let tr = parseFloat(cs.borderTopRightRadius) || 0;
  let bl = parseFloat(cs.borderBottomLeftRadius) || 0;
  let br = parseFloat(cs.borderBottomRightRadius) || 0;

  if ((tl === 0 && tr === 0 && bl === 0 && br === 0) && el) {
    const className = typeof el.className === 'string' ? el.className : '';
    if (className) {
      const tw = extractTailwindRadius(className);
      tl = tw.topLeft;
      tr = tw.topRight;
      bl = tw.bottomLeft;
      br = tw.bottomRight;
      if (tw.uniform > 0) {
        tl = tw.uniform;
        tr = tw.uniform;
        bl = tw.uniform;
        br = tw.uniform;
      }
    }
  }

  const maxR = Math.min(width || 9999, height || 9999) / 2;
  tl = Math.min(tl, maxR);
  tr = Math.min(tr, maxR);
  bl = Math.min(bl, maxR);
  br = Math.min(br, maxR);

  if (tl === tr && tr === bl && bl === br) {
    return { uniform: tl, topLeft: tl, topRight: tl, bottomLeft: tl, bottomRight: tl };
  }

  return { uniform: 0, topLeft: tl, topRight: tr, bottomLeft: bl, bottomRight: br };
}

/**
 * Parse border widths, color, and style from computed styles.
 *
 * Supports per-side widths (Tailwind `border-t`, `border-b`, etc.).
 * Returns `null` when there is no visible border.
 *
 * @param cs Computed style declaration
 */
export function parseBorder(cs: CSSStyleDeclaration): ParsedBorder | null {
  const btw = parseFloat(cs.borderTopWidth) || 0;
  const brw = parseFloat(cs.borderRightWidth) || 0;
  const bbw = parseFloat(cs.borderBottomWidth) || 0;
  const blw = parseFloat(cs.borderLeftWidth) || 0;

  if (btw === 0 && brw === 0 && bbw === 0 && blw === 0) return null;

  // Pick the first non-transparent border color (top → right → bottom → left)
  const borderColor =
    parseColor(cs.borderTopColor) ??
    parseColor(cs.borderRightColor) ??
    parseColor(cs.borderBottomColor) ??
    parseColor(cs.borderLeftColor);

  if (!borderColor || borderColor.opacity === 0) return null;

  const allSame = btw === brw && brw === bbw && bbw === blw;
  const style = cs.borderTopStyle || cs.borderRightStyle || 'solid';

  const border: ParsedBorder = {
    width: btw,
    color: borderColor,
    style,
  };

  if (!allSame) {
    border.top = btw;
    border.right = brw;
    border.bottom = bbw;
    border.left = blw;
  }

  return border;
}
