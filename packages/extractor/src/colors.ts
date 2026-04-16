/**
 * @pix2figma/extractor — Color parsing utilities
 *
 * Runs in the browser. Converts CSS color strings (hex, rgb, rgba, hsl,
 * oklch, oklab, color(), named colors, …) into a normalised ParsedColor.
 *
 * Uses a hidden 1×1 canvas as a fallback resolver so that *every* format
 * the browser supports is handled — including oklch() and oklab().
 *
 * Resolved RGB values are cached in a Map to avoid repeated canvas reads.
 */

import type { ParsedColor } from './types';

// ─── Canvas-based resolver (lazy-initialised) ────────────────────────────

let _canvas: HTMLCanvasElement | null = null;
let _ctx: CanvasRenderingContext2D | null = null;

function getCanvasContext(): CanvasRenderingContext2D {
  if (!_ctx) {
    _canvas = document.createElement('canvas');
    _canvas.width = 1;
    _canvas.height = 1;
    _ctx = _canvas.getContext('2d')!;
  }
  return _ctx;
}

// ─── Resolution cache ────────────────────────────────────────────────────

const colorCache = new Map<string, { r: number; g: number; b: number; a: number }>();

/**
 * Resolve **any** CSS color string the browser understands to an RGBA
 * quadruplet using a hidden 1×1 canvas.
 *
 * RGB channels are returned in the **0-255** range; alpha in **0-1**.
 * Results are cached so repeated calls with the same input are free.
 */
export function resolveColor(str: string): { r: number; g: number; b: number; a: number } {
  const cached = colorCache.get(str);
  if (cached) return cached;

  const ctx = getCanvasContext();
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = 'rgba(0,0,0,0)'; // reset to transparent
  ctx.fillStyle = str;
  ctx.fillRect(0, 0, 1, 1);

  const data = ctx.getImageData(0, 0, 1, 1).data;
  const result = { r: data[0], g: data[1], b: data[2], a: data[3] / 255 };
  colorCache.set(str, result);
  return result;
}

// ─── Hex helper ──────────────────────────────────────────────────────────

/**
 * Convert 0-255 RGB channels to a 6-digit hex string (e.g. `#0a1b2c`).
 */
export function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((ch) => {
        const hex = Math.round(ch).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      })
      .join('')
  );
}

// ─── Regex patterns (pre-compiled) ───────────────────────────────────────

const RE_RGBA = /^rgba?\(\s*([\d.]+),?\s*([\d.]+),?\s*([\d.]+)(?:[,/]\s*([\d.]+))?\s*\)$/;
const RE_HEX3 = /^#([\da-f])([\da-f])([\da-f])$/i;
const RE_HEX4 = /^#([\da-f])([\da-f])([\da-f])([\da-f])$/i;
const RE_HEX6 = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i;
const RE_HEX8 = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i;

// ─── Main parser ─────────────────────────────────────────────────────────

/**
 * Parse a CSS color string into a normalised `ParsedColor`.
 *
 * Fast-paths exist for:
 *  - `rgb()` / `rgba()`
 *  - 3, 4, 6 and 8-digit hex
 *
 * Everything else (hsl, oklch, oklab, `color()`, named colours, …)
 * falls through to the canvas-based `resolveColor`.
 *
 * Returns `null` for transparent or unparseable values.
 */
export function parseColor(str: string): ParsedColor | null {
  if (!str || str === 'transparent' || str === 'rgba(0, 0, 0, 0)') {
    return null;
  }

  const trimmed = str.trim();

  // ── rgb(r, g, b) / rgba(r, g, b, a) ────────────────────────────────
  const rgbaMatch = trimmed.match(RE_RGBA);
  if (rgbaMatch) {
    const r = +rgbaMatch[1];
    const g = +rgbaMatch[2];
    const b = +rgbaMatch[3];
    const a = rgbaMatch[4] !== undefined ? +rgbaMatch[4] : 1;
    if (a === 0) return null;
    return { hex: rgbToHex(r, g, b), opacity: a, r: r / 255, g: g / 255, b: b / 255 };
  }

  // ── Hex formats ─────────────────────────────────────────────────────

  // #rgb → #rrggbb
  const hex3 = trimmed.match(RE_HEX3);
  if (hex3) {
    const r = parseInt(hex3[1] + hex3[1], 16);
    const g = parseInt(hex3[2] + hex3[2], 16);
    const b = parseInt(hex3[3] + hex3[3], 16);
    return { hex: rgbToHex(r, g, b), opacity: 1, r: r / 255, g: g / 255, b: b / 255 };
  }

  // #rgba → #rrggbbaa
  const hex4 = trimmed.match(RE_HEX4);
  if (hex4) {
    const r = parseInt(hex4[1] + hex4[1], 16);
    const g = parseInt(hex4[2] + hex4[2], 16);
    const b = parseInt(hex4[3] + hex4[3], 16);
    const a = parseInt(hex4[4] + hex4[4], 16) / 255;
    if (a === 0) return null;
    return { hex: rgbToHex(r, g, b), opacity: a, r: r / 255, g: g / 255, b: b / 255 };
  }

  // #rrggbb
  const hex6 = trimmed.match(RE_HEX6);
  if (hex6) {
    const r = parseInt(hex6[1], 16);
    const g = parseInt(hex6[2], 16);
    const b = parseInt(hex6[3], 16);
    return { hex: rgbToHex(r, g, b), opacity: 1, r: r / 255, g: g / 255, b: b / 255 };
  }

  // #rrggbbaa
  const hex8 = trimmed.match(RE_HEX8);
  if (hex8) {
    const r = parseInt(hex8[1], 16);
    const g = parseInt(hex8[2], 16);
    const b = parseInt(hex8[3], 16);
    const a = parseInt(hex8[4], 16) / 255;
    if (a === 0) return null;
    return { hex: rgbToHex(r, g, b), opacity: a, r: r / 255, g: g / 255, b: b / 255 };
  }

  // ── Fallback: canvas-based resolution for hsl, oklch, oklab, etc. ──
  const resolved = resolveColor(trimmed);
  if (resolved.a === 0) return null;
  return {
    hex: rgbToHex(resolved.r, resolved.g, resolved.b),
    opacity: resolved.a,
    r: resolved.r / 255,
    g: resolved.g / 255,
    b: resolved.b / 255,
  };
}
