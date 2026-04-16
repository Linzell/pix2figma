/**
 * @pix2figma/extractor — Gradient parsing utilities
 *
 * Runs in the browser. Parses CSS `linear-gradient(…)` values into a
 * normalised `ParsedGradient` with typed color stops.
 *
 * Currently supports `linear-gradient` only. Radial and conic can be added
 * later by extending the initial regex match.
 *
 * The dead `tempDiv` append / remove pattern from the original Vite plugin
 * has been removed — all parsing is done by splitting the computed gradient
 * string and feeding each token through `parseColor`.
 */

import type { ParsedGradient, GradientStop } from './types';
import { parseColor } from './colors';

// ─── Direction lookup ────────────────────────────────────────────────────

const DIRECTION_ANGLES: Record<string, number> = {
  'to top': 0,
  'to top right': 45,
  'to right top': 45,
  'to right': 90,
  'to bottom right': 135,
  'to right bottom': 135,
  'to bottom': 180,
  'to bottom left': 225,
  'to left bottom': 225,
  'to left': 270,
  'to top left': 315,
  'to left top': 315,
};

// ─── Regex (pre-compiled) ────────────────────────────────────────────────

const RE_LINEAR_GRADIENT = /linear-gradient\((.+)\)$/;
const RE_ANGLE_DEG = /^([\d.]+)deg/;
const RE_TRAILING_PERCENT = /\s+([\d.]+)%$/;

// ─── Token splitter ──────────────────────────────────────────────────────

/**
 * Split a string on commas while respecting nested parentheses.
 * e.g. `"oklch(0.5 0.2 240), red 50%"` → `["oklch(0.5 0.2 240)", "red 50%"]`
 */
function splitCommaRespectingParens(input: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let current = '';

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '(') {
      depth++;
      current += ch;
    } else if (ch === ')') {
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      tokens.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  const last = current.trim();
  if (last) tokens.push(last);
  return tokens;
}

// ─── Stop normaliser ─────────────────────────────────────────────────────

/**
 * Evenly distribute positions for stops that don't have an explicit one.
 * First stop defaults to 0, last to 1. Interior stops are interpolated.
 */
function normaliseStopPositions(stops: GradientStop[]): void {
  if (stops.length < 2) return;

  if (stops[0].position < 0) stops[0].position = 0;
  if (stops[stops.length - 1].position < 0) stops[stops.length - 1].position = 1;

  for (let i = 1; i < stops.length - 1; i++) {
    if (stops[i].position < 0) {
      // Find next stop with an explicit position
      let nextIdx = i + 1;
      while (nextIdx < stops.length - 1 && stops[nextIdx].position < 0) {
        nextIdx++;
      }
      const prevPos = stops[i - 1].position;
      const nextPos = stops[nextIdx].position;
      const span = nextIdx - (i - 1);
      for (let j = i; j < nextIdx; j++) {
        stops[j].position = prevPos + ((nextPos - prevPos) * (j - (i - 1))) / span;
      }
      i = nextIdx - 1; // skip already-filled
    }
  }

  // Clamp all to 0–1
  for (const stop of stops) {
    stop.position = Math.max(0, Math.min(1, stop.position));
  }
}

// ─── Main parser ─────────────────────────────────────────────────────────

/**
 * Parse a CSS `background-image` value that contains a `linear-gradient(…)`
 * into a normalised `ParsedGradient`.
 *
 * Returns `null` when:
 *  - the input doesn't contain "gradient"
 *  - the gradient is not `linear-gradient`
 *  - fewer than 2 valid colour stops are found
 */
export function parseGradient(bgImage: string): ParsedGradient | null {
  if (!bgImage || !bgImage.includes('gradient')) return null;

  const gradMatch = bgImage.match(RE_LINEAR_GRADIENT);
  if (!gradMatch) return null;

  const body = gradMatch[1];

  // ── Determine angle ────────────────────────────────────────────────

  let angle = 180; // CSS default: top → bottom
  let colorPart = body;

  const angleMatch = body.match(RE_ANGLE_DEG);
  if (angleMatch) {
    angle = +angleMatch[1];
    colorPart = body.substring(body.indexOf(',') + 1).trim();
  } else {
    // Check "to <direction>" keywords
    for (const [keyword, deg] of Object.entries(DIRECTION_ANGLES)) {
      if (body && typeof body === 'string' && body.startsWith(keyword)) {
        angle = deg;
        colorPart = body.substring(body.indexOf(',') + 1).trim();
        break;
      }
    }
  }

  // ── Parse colour stops ─────────────────────────────────────────────

  const tokens = splitCommaRespectingParens(colorPart);
  const stops: GradientStop[] = [];

  for (const token of tokens) {
    const trimmedToken = token.trim();

    // Extract optional trailing percentage (e.g. "red 50%")
    const posMatch = trimmedToken.match(RE_TRAILING_PERCENT);
    let position = -1; // sentinel: no explicit position
    let colorStr = trimmedToken;

    if (posMatch) {
      position = parseFloat(posMatch[1]) / 100;
      colorStr = trimmedToken.substring(0, trimmedToken.length - posMatch[0].length).trim();
    }

    const color = parseColor(colorStr);
    if (color) {
      stops.push({ color, position });
    }
  }

  // ── Normalise positions ────────────────────────────────────────────

  if (stops.length < 2) return null;
  normaliseStopPositions(stops);

  return { type: 'linear', angle, stops };
}
