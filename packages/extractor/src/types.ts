/**
 * @pix2figma/extractor — Shared type definitions
 *
 * These types define the shape of the DOM extraction tree.
 * Used by:
 *   - The browser-side extractor (produces these)
 *   - The Figma plugin (consumes these)
 */

// ─── Color ────────────────────────────────────────────────────────────────

export interface ParsedColor {
  hex: string;
  r: number; // 0–1
  g: number; // 0–1
  b: number; // 0–1
  opacity: number; // 0–1
}

// ─── Gradient ─────────────────────────────────────────────────────────────

export interface GradientStop {
  color: ParsedColor;
  position: number; // 0–1
}

export interface ParsedGradient {
  type: 'linear' | 'radial' | 'conic';
  angle: number; // degrees, 0 = top-to-bottom for linear
  stops: GradientStop[];
}

// ─── Shadow ───────────────────────────────────────────────────────────────

export interface ParsedShadow {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: ParsedColor;
  inset: boolean;
}

// ─── Border ───────────────────────────────────────────────────────────────

export interface ParsedBorder {
  width: number;
  color: ParsedColor;
  style: string;
  /** Per-side widths when not uniform */
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface ParsedBorderRadius {
  uniform: number;
  topLeft: number;
  topRight: number;
  bottomLeft: number;
  bottomRight: number;
}

// ─── Layout ───────────────────────────────────────────────────────────────

export interface FlexLayout {
  mode: 'flex';
  direction: string;
  wrap: string;
  justifyContent: string;
  alignItems: string;
  gap: number;
  rowGap: number;
  columnGap: number;
}

export interface GridLayout {
  mode: 'grid';
  templateColumns: string;
  templateRows: string;
  gap: number;
  rowGap: number;
  columnGap: number;
  columnCount?: number;
}

export type LayoutInfo = FlexLayout | GridLayout;

// ─── Scroll ───────────────────────────────────────────────────────────────

export interface ScrollInfo {
  visibleHeight: number;
  totalHeight: number;
}

// ─── Padding ──────────────────────────────────────────────────────────────

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

// ─── Extracted Styles ─────────────────────────────────────────────────────

export interface ExtractedStyles {
  // Background
  backgroundColor?: ParsedColor;
  gradient?: ParsedGradient;

  // Text
  color?: ParsedColor;
  fontSize?: number;
  fontWeight?: string;
  fontFamily?: string;
  lineHeight?: number;
  textAlign?: string;
  letterSpacing?: number;
  textTransform?: string;
  textDecoration?: string;

  // Border
  border?: ParsedBorder;
  borderRadius?: ParsedBorderRadius;

  // Shadow
  boxShadow?: ParsedShadow[];

  // Layout
  layout?: LayoutInfo;
  padding?: Padding;
  position?: 'absolute' | 'fixed';
  opacity?: number;
  clipContent?: boolean;

  // Scroll
  scrollInfo?: ScrollInfo;

  // Height stretch - true if element has h-full, h-screen, flex-1, etc.
  stretchHeight?: boolean;
}

// ─── DOM Node Types ───────────────────────────────────────────────────────

export type DomNodeType = 'text' | 'frame' | 'input' | 'image' | 'svg';

export interface BaseDomNode {
  tag: string;
  x: number;
  y: number;
  width: number;
  height: number;
  styles: ExtractedStyles;
}

export interface TextDomNode extends BaseDomNode {
  type: 'text';
  text: string;
}

export interface FrameDomNode extends BaseDomNode {
  type: 'frame';
  children?: DomNode[];
  /** Text embedded inside a badge/pill frame */
  embeddedText?: string;
  /** List marker type for <li> elements */
  listMarker?: string;
  listMarkerInside?: boolean;
}

export interface InputDomNode extends BaseDomNode {
  type: 'input';
  inputType: string;
  placeholder?: string;
  value?: string;
  placeholderColor?: ParsedColor;
  inputColor?: ParsedColor;
  /** For checkbox/radio */
  checked?: boolean;
  accentColor?: ParsedColor;
}

export interface ImageDomNode extends BaseDomNode {
  type: 'image';
  src: string;
}

export interface SvgDomNode extends BaseDomNode {
  type: 'svg';
  svgMarkup?: string;
  svgFillColor?: string;
}

export type DomNode =
  | TextDomNode
  | FrameDomNode
  | InputDomNode
  | ImageDomNode
  | SvgDomNode;

// ─── Extraction Result ────────────────────────────────────────────────────

export interface Viewport {
  width: number;
  height: number;
}

export interface ExtractionResult {
  viewport: Viewport;
  tree: DomNode;
}

export interface StoredExtraction {
  id: string;
  pageName: string;
  stateName: string;
  timestamp: number;
  tree: DomNode;
  viewport: Viewport;
}

// ─── Permit Validation ────────────────────────────────────────────────────

/**
 * Severity of a permit violation.
 * - `error`   — Hard block: action must not proceed, requires escalation
 * - `warning` — Soft issue: permitted but should be flagged for review
 */
export type PermitViolationSeverity = 'error' | 'warning';

/**
 * Category of a permit violation, matching the Permis Design Avancé rules.
 */
export type PermitViolationCategory =
  | 'non_kiiwi_color'        // Arbitrary hex not in Kiiwi tokens
  | 'non_4px_spacing'        // Spacing value not in 4px scale
  | 'detached_component'     // Component detached from library
  | 'base_component_used'    // .Base variant used instead of "To use"
  | 'non_ds_component'       // Component not from Kiiwi or Business
  | 'accessibility_risk'     // Color used alone to convey information
  | 'ux_writing_violation'   // Text doesn't follow UX writing guidelines
  | 'missing_token';         // No matching Kiiwi token found

/**
 * A single permit violation found during validation.
 */
export interface PermitViolation {
  /** Severity: error (hard block) or warning (review needed) */
  severity: PermitViolationSeverity;
  /** Category of the violation */
  category: PermitViolationCategory;
  /** Human-readable description */
  message: string;
  /** Path to the node in the DOM tree (e.g., "root > header > nav") */
  nodePath: string;
  /** The offending value (hex color, spacing px, text, etc.) */
  value?: string | number;
  /** Suggested fix */
  suggestion?: string;
}

/**
 * Result of validating an extraction tree against Kiiwi DS permit rules.
 */
export interface PermitValidationResult {
  /** Whether the extraction passes all checks (no errors) */
  valid: boolean;
  /** Total violations found */
  violationCount: number;
  /** Error-level violations (hard blocks) */
  errors: PermitViolation[];
  /** Warning-level violations (review needed) */
  warnings: PermitViolation[];
  /** Summary for reporting */
  summary: string;
}

// ─── Plugin Options ───────────────────────────────────────────────────────

export interface Pix2FigmaOptions {
  /** Dev server port (auto-detected from Vite config if not set) */
  port?: number;
  /** Max stored extractions before evicting oldest (default: 20) */
  maxExtractions?: number;
  /** Max POST body size in bytes (default: 50MB) */
  maxBodySize?: number;
  /** CSS selectors for elements to exclude from extraction */
  excludeSelectors?: string[];
  /** Figma plugin name (default: "Pix2Figma Screen Importer") */
  pluginName?: string;
}
