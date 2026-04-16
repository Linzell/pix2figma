/**
 * @pix2figma/extractor — Shadow parsing utilities
 *
 * Runs in the browser. Parses CSS `box-shadow` values into an array of
 * normalised `ParsedShadow` objects.
 *
 * Unlike the original implementation this parser handles:
 *  - Multiple comma-separated shadows
 *  - oklch / oklab / hsl / color() values (via `parseColor`)
 *  - All standard shorthand orderings (inset prefix or suffix)
 */

import type { ParsedShadow } from './types';
import { parseColor } from './colors';

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Split a `box-shadow` value on top-level commas while respecting
 * parenthesised colour functions like `rgba(…)`, `oklch(…)`, etc.
 */
function splitShadows(str: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(') {
      depth++;
      current += ch;
    } else if (ch === ')') {
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  const last = current.trim();
  if (last) parts.push(last);
  return parts;
}

// ─── Single-shadow parser ────────────────────────────────────────────────

/**
 * CSS box-shadow grammar (per spec):
 *   `[inset]? <length>{2,4} <color>?`
 *
 * Length values are: x-offset, y-offset, blur-radius?, spread-radius?
 * The `inset` keyword can appear at the start or end.
 * The colour can be *any* CSS colour — including functional notations
 * with spaces and slashes (oklch, oklab, color()).
 */
function parseSingleShadow(raw: string): ParsedShadow | null {
  let str = raw.trim();
  if (!str || str === 'none') return null;

  // ── Detect & strip "inset" ──────────────────────────────────────────
  let inset = false;
  if (str && typeof str === 'string' && str.startsWith('inset')) {
    inset = true;
    str = str.slice(5).trim();
  } else if (str && typeof str === 'string' && str.endsWith('inset')) {
    inset = true;
    str = str.slice(0, -5).trim();
  }

  // ── Tokenise: pull numeric px values from the front ─────────────────
  // We greedily consume tokens that look like `<number>px` or bare `0`.
  // Whatever remains after that is the colour string.
  const nums: number[] = [];
  let remaining = str;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    remaining = remaining.trimStart();
    // Match a bare zero or a number followed by "px"
    const numMatch = remaining.match(/^(-?[\d.]+)(px)?\s*/);
    if (!numMatch) break;

    const val = parseFloat(numMatch[1]);
    if (Number.isNaN(val)) break;

    nums.push(val);
    remaining = remaining.slice(numMatch[0].length);

    // Stop after 4 numeric values (x, y, blur, spread)
    if (nums.length === 4) break;
  }

  // We need at least x and y offsets
  if (nums.length < 2) return null;

  const x = nums[0];
  const y = nums[1];
  const blur = nums[2] ?? 0;
  const spread = nums[3] ?? 0;

  // ── Colour ──────────────────────────────────────────────────────────
  const colorStr = remaining.trim();
  const color = parseColor(colorStr || 'rgba(0,0,0,0.1)');
  if (!color) return null;

  return { x, y, blur, spread, color, inset };
}

// ─── Main parser ─────────────────────────────────────────────────────────

/**
 * Parse a CSS `box-shadow` computed value into an array of `ParsedShadow`.
 *
 * Handles:
 *  - Multiple comma-separated shadows
 *  - `inset` keyword
 *  - Functional colour notations: `rgba()`, `oklch()`, `oklab()`, `color()`, `hsl()`, hex
 *
 * Returns `null` when the input is empty, `"none"`, or contains no valid
 * shadows.
 */
export function parseShadow(boxShadow: string): ParsedShadow[] | null {
  if (!boxShadow || boxShadow === 'none') return null;

  const rawParts = splitShadows(boxShadow);
  const shadows: ParsedShadow[] = [];

  for (const part of rawParts) {
    const parsed = parseSingleShadow(part);
    if (parsed) shadows.push(parsed);
  }

  return shadows.length > 0 ? shadows : null;
}
