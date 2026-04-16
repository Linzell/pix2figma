/**
 * @pix2figma/figma-plugin — Constants
 *
 * All magic numbers and configuration values used across the Figma plugin.
 * Centralised here to avoid scattered literals and ease future tuning.
 */

// ─── Node limits ──────────────────────────────────────────────────────────

/** Hard cap on created Figma nodes per import to prevent hangs */
export const MAX_NODES = 5000;

// ─── UI dimensions ────────────────────────────────────────────────────────

export const UI_WIDTH = 400;
export const UI_HEIGHT = 560;

// ─── Layout ───────────────────────────────────────────────────────────────

/** Horizontal gap between state frames on the canvas */
export const STATE_GAP = 120;

// ─── Scroll capping ──────────────────────────────────────────────────────

/**
 * Scroll containers with content taller than `visibleHeight * MAX_SCROLL_FACTOR`
 * are capped to avoid absurdly tall frames (e.g. 35 000 px chat lists).
 */
export const MAX_SCROLL_FACTOR = 3;

// ─── Typography ───────────────────────────────────────────────────────────

export const DEFAULT_FONT_SIZE = 14;

/**
 * Character count below which single-line text uses WIDTH_AND_HEIGHT
 * auto-resize instead of fixed-width HEIGHT mode.
 */
export const SHORT_TEXT_THRESHOLD = 60;

/**
 * When `node.height < fontSize * SINGLE_LINE_HEIGHT_FACTOR` we treat the
 * text as single-line.
 */
export const SINGLE_LINE_HEIGHT_FACTOR = 1.8;

// ─── Checkbox / Radio ─────────────────────────────────────────────────────

/** Default corner radius for unchecked checkboxes when extractor has none */
export const DEFAULT_CHECKBOX_RADIUS = 3;

/** Inner dot size relative to the radio button's smallest dimension */
export const RADIO_DOT_RATIO = 0.45;

// ─── Fold markers ─────────────────────────────────────────────────────────

/** Dash pattern for the scroll-fold line `[dash, gap]` */
export const SCROLL_FOLD_DASH: readonly [number, number] = [8, 6];

/** Dash pattern for the viewport-fold line `[dash, gap]` */
export const VIEWPORT_FOLD_DASH: readonly [number, number] = [12, 8];

/**
 * The fold label is right-aligned; this offset from the right edge
 * positions it so it doesn't overflow narrow frames.
 */
export const FOLD_LABEL_RIGHT_OFFSET = 300;

// ─── Colours ──────────────────────────────────────────────────────────────

/**
 * Reusable colour constants.
 * All values are 0-1 Figma RGB (no alpha — use a separate opacity).
 */
export const Colors = {
  /** Dark background for unchecked checkboxes / radios */
  UNCHECKED_BG: { r: 0.15, g: 0.15, b: 0.18 } as const,

  /** Grey fallback for SVG icon placeholders */
  ICON_FALLBACK: { r: 0.6, g: 0.65, b: 0.7 } as const,

  /** Red-ish scroll-fold line */
  FOLD_LINE: { r: 1, g: 0.35, b: 0.35 } as const,

  /** Same red for the scroll-fold label text */
  FOLD_LABEL: { r: 1, g: 0.35, b: 0.35 } as const,

  /** Blue viewport-fold line */
  VIEWPORT_FOLD_LINE: { r: 0.3, g: 0.6, b: 1 } as const,

  /** Blue viewport-fold label */
  VIEWPORT_FOLD_LABEL: { r: 0.3, g: 0.6, b: 1 } as const,

  /** Teal accent fallback for checked checkboxes / radios */
  ACCENT_FALLBACK: { r: 0.25, g: 0.72, b: 0.66 } as const,

  /** White — checkmark, radio dot */
  WHITE: { r: 1, g: 1, b: 1 } as const,

  /** Fallback text colour for input placeholders */
  PLACEHOLDER_FALLBACK: { r: 0.6, g: 0.6, b: 0.6 } as const,

  /** Light grey placeholder for images */
  IMAGE_PLACEHOLDER: { r: 0.9, g: 0.9, b: 0.92 } as const,

  /** State label text colour */
  STATE_LABEL: { r: 0.2, g: 0.2, b: 0.2 } as const,
} as const;

// ─── Opacity defaults ─────────────────────────────────────────────────────

/** Default opacity for fold lines / labels */
export const FOLD_OPACITY = 0.7;

/** Default opacity for viewport fold lines / labels */
export const VIEWPORT_FOLD_OPACITY = 0.6;

/** Default opacity for unchecked checkbox border */
export const UNCHECKED_BORDER_OPACITY = 0.2;
