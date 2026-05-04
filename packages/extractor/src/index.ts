/**
 * @pix2figma/extractor — Public API
 *
 * Re-exports the main extraction function, overlay creator, and all types.
 */

// ─── Extraction ───────────────────────────────────────────────────────────

export { extractDOM, extractNode } from './extract';
export type { ExtractOptions } from './extract';

// ─── Permit Validation ────────────────────────────────────────────────────

export { validatePermit, loadKiiwiTokens } from './permit';
export type { PermitValidationConfig } from './permit';

// ─── Overlay ──────────────────────────────────────────────────────────────

export { createOverlay } from './overlay/overlay';

// ─── Types ────────────────────────────────────────────────────────────────

export type {
  ParsedColor,
  GradientStop,
  ParsedGradient,
  ParsedShadow,
  ParsedBorder,
  ParsedBorderRadius,
  FlexLayout,
  GridLayout,
  LayoutInfo,
  ScrollInfo,
  Padding,
  ExtractedStyles,
  DomNodeType,
  BaseDomNode,
  TextDomNode,
  FrameDomNode,
  InputDomNode,
  ImageDomNode,
  SvgDomNode,
  DomNode,
  Viewport,
  ExtractionResult,
  StoredExtraction,
  Pix2FigmaOptions,
  PermitViolationSeverity,
  PermitViolationCategory,
  PermitViolation,
  PermitValidationResult,
} from './types';
