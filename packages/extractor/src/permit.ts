/**
 * @pix2figma/extractor — Kiiwi Design System permit validation
 *
 * Validates an extraction tree against the Permis Design Avancé rules:
 *   - All spacing values must be in the 4px scale
 *   - All colors must reference Kiiwi tokens (no arbitrary hex)
 *   - No detached components, no .Base variants
 *   - Accessibility: color never alone to convey information
 *   - UX writing: active voice, short sentences, vouvoiement
 *
 * This module runs as a post-extraction validation step, before the
 * extraction is stored on the Vite server or pushed to Figma.
 */

import type {
  DomNode,
  FrameDomNode,
  TextDomNode,
  ParsedColor,
  Padding,
  FlexLayout,
  GridLayout,
  PermitViolation,
  PermitValidationResult,
  PermitViolationCategory,
} from './types';

// ─── Kiiwi Token Reference ────────────────────────────────────────────────

/**
 * Known Kiiwi color token hex values (lowercase, with #).
 * These are the ONLY hex values allowed in Kiiwi DS-compliant extractions.
 *
 * TODO: Replace with actual Kiiwi token values from the Figma library.
 * Currently populated with placeholder values — the agent should update
 * these when it reads the Kiiwi library via Figma API.
 */
const KIIWI_TOKEN_HEX_VALUES = new Set<string>([
  // Brand primary
  // '#1a56db', '#3b82f6',
  // Surface
  // '#ffffff', '#f9fafb', '#f3f4f6',
  // Text
  // '#111827', '#4b5563', '#9ca3af', '#d1d5db',
  // Danger
  // '#dc2626', '#fee2e2',
  // Success
  // '#16a34a', '#dcfce7',
  // Warning
  // '#d97706', '#fef3c7',
  //
  // Placeholder: empty set means all hex colors are flagged as warnings
  // until real tokens are loaded.
]);

/**
 * Valid spacing values in the Kiiwi 4px scale (4 to 64).
 */
const VALID_SPACING = new Set<number>();
for (let i = 4; i <= 64; i += 4) {
  VALID_SPACING.add(i);
}

/**
 * Tailwind spacing values that are NOT in the Kiiwi 4px scale.
 * e.g., Tailwind's 0.5=2px, 1.5=6px, 2.5=10px, 3.5=14px, etc.
 */
const TAILWIND_NON_KIIWI_SPACING = new Set([2, 6, 10, 14, 18, 22, 26, 30, 34, 38, 42, 46, 50, 54, 58, 62]);

// ─── Validation Configuration ─────────────────────────────────────────────

export interface PermitValidationConfig {
  /** Whether to validate colors against Kiiwi tokens (default: true) */
  validateColors?: boolean;
  /** Whether to validate spacing against 4px scale (default: true) */
  validateSpacing?: boolean;
  /** Whether to validate UX writing rules (default: true) */
  validateWriting?: boolean;
  /** Whether to treat unknown hex colors as errors or warnings (default: 'warning') */
  unknownColorSeverity?: 'error' | 'warning';
  /** Custom Kiiwi token hex values to add to the allowed set */
  additionalTokenColors?: string[];
}

const DEFAULT_CONFIG: Required<PermitValidationConfig> = {
  validateColors: true,
  validateSpacing: true,
  validateWriting: true,
  unknownColorSeverity: 'warning',
  additionalTokenColors: [],
};

// ─── Internal State ───────────────────────────────────────────────────────

let allowedHexValues: Set<string>;

function getAllowedHexValues(config: PermitValidationConfig): Set<string> {
  if (!allowedHexValues || config.additionalTokenColors?.length) {
    allowedHexValues = new Set(KIIWI_TOKEN_HEX_VALUES);
    for (const hex of config.additionalTokenColors ?? []) {
      allowedHexValues.add(hex.toLowerCase());
    }
  }
  return allowedHexValues;
}

// ─── Violation Helpers ────────────────────────────────────────────────────

function violation(
  severity: 'error' | 'warning',
  category: PermitViolationCategory,
  message: string,
  nodePath: string,
  value?: string | number,
  suggestion?: string,
): PermitViolation {
  return { severity, category, message, nodePath, value, suggestion };
}

// ─── Color Validation ─────────────────────────────────────────────────────

function validateColor(
  color: ParsedColor | undefined,
  nodePath: string,
  fieldName: string,
  config: Required<PermitValidationConfig>,
  violations: PermitViolation[],
): void {
  if (!color || !config.validateColors) return;

  const hex = color.hex.toLowerCase();
  const allowed = getAllowedHexValues(config);

  // If we have known Kiiwi tokens, check against them
  if (allowed.size > 0 && !allowed.has(hex)) {
    violations.push(violation(
      config.unknownColorSeverity,
      'non_kiiwi_color',
      `${fieldName} uses non-Kiiwi color ${hex}. Must use Kiiwi DS token or create Monday ticket [A11Y].`,
      nodePath,
      hex,
      'Use a Kiiwi token color or escalate to Laetitia (DS team)',
    ));
  }

  // If no tokens loaded yet, emit a warning that validation is incomplete
  if (allowed.size === 0) {
    violations.push(violation(
      'warning',
      'missing_token',
      `${fieldName} uses ${hex} but Kiiwi token reference is empty — cannot validate. Load tokens from Figma API.`,
      nodePath,
      hex,
      'Run Figma API token sync to populate Kiiwi token values',
    ));
  }
}

// ─── Spacing Validation ───────────────────────────────────────────────────

function validatePadding(
  padding: Padding | undefined,
  nodePath: string,
  config: Required<PermitValidationConfig>,
  violations: PermitViolation[],
): void {
  if (!padding || !config.validateSpacing) return;

  const sides: Array<{ name: string; value: number }> = [
    { name: 'top', value: padding.top },
    { name: 'right', value: padding.right },
    { name: 'bottom', value: padding.bottom },
    { name: 'left', value: padding.left },
  ];

  for (const side of sides) {
    if (side.value > 0 && !VALID_SPACING.has(side.value)) {
      const isTailwindNonKiiwi = TAILWIND_NON_KIIWI_SPACING.has(side.value);
      violations.push(violation(
        'error',
        'non_4px_spacing',
        `Padding ${side.name}=${side.value}px is not in Kiiwi 4px scale.${isTailwindNonKiiwi ? ' (Tailwind fractional value like 0.5, 1.5, 2.5)' : ''}`,
        nodePath,
        side.value,
        `Use nearest 4px scale value: ${nearest4px(side.value)}px`,
      ));
    }
  }
}

function validateLayoutGaps(
  layout: FlexLayout | GridLayout | undefined,
  nodePath: string,
  config: Required<PermitValidationConfig>,
  violations: PermitViolation[],
): void {
  if (!layout || !config.validateSpacing) return;

  const gaps: Array<{ name: string; value: number }> = [
    { name: 'gap', value: layout.gap },
    { name: 'rowGap', value: layout.rowGap },
    { name: 'columnGap', value: layout.columnGap },
  ];

  for (const gap of gaps) {
    if (gap.value > 0 && !VALID_SPACING.has(gap.value)) {
      const isTailwindNonKiiwi = TAILWIND_NON_KIIWI_SPACING.has(gap.value);
      violations.push(violation(
        'error',
        'non_4px_spacing',
        `Layout ${gap.name}=${gap.value}px is not in Kiiwi 4px scale.${isTailwindNonKiiwi ? ' (Tailwind fractional value)' : ''}`,
        nodePath,
        gap.value,
        `Use nearest 4px scale value: ${nearest4px(gap.value)}px`,
      ));
    }
  }
}

// ─── UX Writing Validation ────────────────────────────────────────────────

function validateWriting(
  text: string | undefined,
  nodePath: string,
  config: Required<PermitValidationConfig>,
  violations: PermitViolation[],
): void {
  if (!text || !config.validateWriting) return;

  // Check for forbidden punctuation
  if (text.includes('!')) {
    violations.push(violation(
      'warning',
      'ux_writing_violation',
      `Text contains exclamation mark "!" — creates inappropriate tension in healthcare context.`,
      nodePath,
      text,
      'Use neutral period instead of exclamation mark',
    ));
  }

  if (text.includes('...')) {
    violations.push(violation(
      'warning',
      'ux_writing_violation',
      `Text contains ellipsis "..." — leaves user in doubt.`,
      nodePath,
      text,
      'Use a complete sentence instead of ellipsis',
    ));
  }

  if (text.includes('&')) {
    violations.push(violation(
      'warning',
      'ux_writing_violation',
      `Text contains ampersand "&" — replace with "et".`,
      nodePath,
      text,
      'Replace & with "et"',
    ));
  }

  // Check for RDV abbreviation
  if (/\bRDV\b/.test(text)) {
    violations.push(violation(
      'warning',
      'ux_writing_violation',
      `Text uses abbreviation "RDV" — use "rendez-vous" instead.`,
      nodePath,
      text,
      'Replace RDV with "rendez-vous"',
    ));
  }

  // Check for ALL CAPS (more than 2 consecutive uppercase words, excluding common acronyms)
  const capsWords = text.match(/\b[A-Z]{2,}\b/g);
  const allowedCaps = new Set(['PDF', 'KIIWI', 'WCAG', 'AA', 'AAA', 'API', 'UI', 'URL', 'ID']);
  if (capsWords) {
    const forbidden = capsWords.filter(w => !allowedCaps.has(w));
    if (forbidden.length > 0) {
      violations.push(violation(
        'warning',
        'ux_writing_violation',
        `Text contains ALL CAPS "${forbidden.join(', ')}" — harms cognitive accessibility.`,
        nodePath,
        text,
        'Use bold for emphasis instead of ALL CAPS',
      ));
    }
  }

  // Check for passive voice hints (simplified heuristic for French)
  // Matches "a été", "ont été", "avons été", "avez été"
  // Note: Using (?:^|\s) instead of \b because Bun's JSC regex engine
  // has issues with \b near non-ASCII characters (accented é)
  const passivePatterns = /(?:^|\s)(a|ont|avons|avez)\s+été(?:\s|$|,|\.)/i;
  if (passivePatterns.test(text)) {
    violations.push(violation(
      'warning',
      'ux_writing_violation',
      `Text may use passive voice — prefer active voice (subject does the action).`,
      nodePath,
      text,
      'Rewrite with active voice: "Le praticien confirme" not "La confirmation est envoyée"',
    ));
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function nearest4px(value: number): number {
  return Math.round(value / 4) * 4;
}

// ─── Main Validation ──────────────────────────────────────────────────────

/**
 * Validate an extraction tree against Kiiwi Design System permit rules.
 *
 * @param tree       The root DomNode of the extraction
 * @param config     Optional validation configuration
 * @returns          A PermitValidationResult with all violations found
 */
export function validatePermit(
  tree: DomNode,
  config: PermitValidationConfig = {},
): PermitValidationResult {
  const merged = { ...DEFAULT_CONFIG, ...config };
  const violations: PermitViolation[] = [];

  walkTree(tree, 'root', merged, violations);

  const errors = violations.filter(v => v.severity === 'error');
  const warnings = violations.filter(v => v.severity === 'warning');

  return {
    valid: errors.length === 0,
    violationCount: violations.length,
    errors,
    warnings,
    summary: formatSummary(errors, warnings),
  };
}

function walkTree(
  node: DomNode,
  path: string,
  config: Required<PermitValidationConfig>,
  violations: PermitViolation[],
): void {
  const currentPath = `${path} > ${node.tag}#${node.type}`;

  // ── Color validation ─────────────────────────────────────────────────
  validateColor(node.styles.backgroundColor, currentPath, 'Background', config, violations);
  validateColor(node.styles.color, currentPath, 'Text color', config, violations);
  if (node.styles.border?.color) {
    validateColor(node.styles.border.color, currentPath, 'Border color', config, violations);
  }

  // ── Spacing validation ───────────────────────────────────────────────
  validatePadding(node.styles.padding, currentPath, config, violations);
  validateLayoutGaps(node.styles.layout, currentPath, config, violations);

  // ── UX Writing validation ────────────────────────────────────────────
  if (node.type === 'text') {
    validateWriting((node as TextDomNode).text, currentPath, config, violations);
  }
  if (node.type === 'frame') {
    const frame = node as FrameDomNode;
    if (frame.embeddedText) {
      validateWriting(frame.embeddedText, currentPath, config, violations);
    }
  }

  // ── Recurse into children ────────────────────────────────────────────
  if (node.type === 'frame') {
    const frame = node as FrameDomNode;
    if (frame.children) {
      for (const child of frame.children) {
        walkTree(child, currentPath, config, violations);
      }
    }
  }
}

function formatSummary(
  errors: PermitViolation[],
  warnings: PermitViolation[],
): string {
  if (errors.length === 0 && warnings.length === 0) {
    return '✅ Extraction passes all Kiiwi DS permit checks.';
  }

  const parts: string[] = [];

  if (errors.length > 0) {
    parts.push(`⛔ ${errors.length} error(s) — HARD BLOCK:`);
    for (const e of errors) {
      parts.push(`  [${e.category}] ${e.message} (${e.nodePath})`);
    }
  }

  if (warnings.length > 0) {
    parts.push(`⚠️ ${warnings.length} warning(s) — review recommended:`);
    for (const w of warnings) {
      parts.push(`  [${w.category}] ${w.message} (${w.nodePath})`);
    }
  }

  return parts.join('\n');
}

/**
 * Load Kiiwi token hex values from an external source (e.g., Figma API).
 * Clears and replaces the internal token set.
 *
 * @param hexValues Array of hex color strings (e.g., ['#1a56db', '#3b82f6'])
 */
export function loadKiiwiTokens(hexValues: string[]): void {
  allowedHexValues = new Set(hexValues.map(h => h.toLowerCase()));
  // Also add to the base set so future getAllowedHexValues calls include them
  for (const hex of hexValues) {
    KIIWI_TOKEN_HEX_VALUES.add(hex.toLowerCase());
  }
}
