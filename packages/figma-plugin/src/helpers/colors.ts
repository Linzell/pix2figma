/**
 * @pix2figma/figma-plugin — Colour helpers
 *
 * Converts extractor `ParsedColor` values into the Figma-native
 * `{ r, g, b }` / `{ r, g, b, a }` shapes, with null-safety.
 */

import type { ParsedColor } from './types';

// ─── Internal hex parser ──────────────────────────────────────────────────

/**
 * Parses a CSS hex string (`#RGB` or `#RRGGBB`) into Figma 0-1 RGB.
 *
 * @param hex - A 3- or 6-digit hex string, with or without `#`.
 * @returns Figma-compatible `{ r, g, b }` with values in 0-1.
 */
function hexToRGB(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const expanded =
    h.length === 3
      ? `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`
      : h;

  return {
    r: parseInt(expanded.substring(0, 2), 16) / 255,
    g: parseInt(expanded.substring(2, 4), 16) / 255,
    b: parseInt(expanded.substring(4, 6), 16) / 255,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Converts a `ParsedColor` to a Figma `{ r, g, b }` object (no alpha).
 *
 * Accepts `null` / `undefined` gracefully — returns `null` when the input
 * cannot be converted.
 *
 * @param c - Parsed colour from the extractor, or nullish.
 * @returns Figma RGB object, or `null`.
 */
export function colorToFigma(
  c: ParsedColor | null | undefined,
): { r: number; g: number; b: number } | null {
  if (!c) return null;

  // Already has numeric r/g/b channels
  if (c.r !== undefined && c.g !== undefined && c.b !== undefined) {
    return { r: c.r, g: c.g, b: c.b };
  }

  // Fall back to hex parsing
  if (c.hex) return hexToRGB(c.hex);

  return null;
}

/**
 * Extracts opacity from a `ParsedColor`, falling back to a default.
 *
 * @param c        - Parsed colour (may be nullish).
 * @param fallback - Value to return when the colour has no explicit opacity.
 *                   Defaults to `1` when omitted.
 * @returns Opacity in 0-1.
 */
export function getOpacity(
  c: ParsedColor | null | undefined,
  fallback = 1,
): number {
  return c?.opacity ?? fallback;
}

/**
 * Builds a full `{ r, g, b, a }` object from a parsed colour.
 *
 * Useful for Figma gradient stops and shadow colours that require an
 * explicit alpha channel.
 *
 * @param c               - Parsed colour (may be nullish).
 * @param fallbackOpacity - Alpha when the colour carries no opacity.
 * @returns An RGBA object with 0-1 channels.
 */
export function createRGBA(
  c: ParsedColor | null | undefined,
  fallbackOpacity = 1,
): { r: number; g: number; b: number; a: number } {
  const base = colorToFigma(c);
  return {
    r: base?.r ?? 0,
    g: base?.g ?? 0,
    b: base?.b ?? 0,
    a: getOpacity(c, fallbackOpacity),
  };
}

/**
 * Computes the gradient transform matrix from a CSS angle.
 *
 * Figma uses a 2×3 affine matrix for `GRADIENT_LINEAR` transforms.
 * CSS `linear-gradient(180deg)` is top-to-bottom; this maps that
 * convention to the Figma coordinate space.
 *
 * @param angle - CSS gradient angle in degrees.
 * @returns A 2×3 transform matrix compatible with `GradientPaint.gradientTransform`.
 */
export function degreesToTransform(
  angle: number,
): [[number, number, number], [number, number, number]] {
  const rad = ((angle - 90) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [
    [cos, sin, 0.5 - cos * 0.5 - sin * 0.5],
    [-sin, cos, 0.5 + sin * 0.5 - cos * 0.5],
  ];
}
