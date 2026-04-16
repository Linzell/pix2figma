/**
 * @pix2figma/figma-plugin — Input node renderer
 *
 * Creates Figma frames for `<input>`, `<textarea>`, and `<select>` elements.
 * Handles checkbox/radio visual approximation and standard text inputs.
 */

declare const figma: any;

import type { InputDomNode } from '../helpers/types';
import { colorToFigma, getOpacity } from '../helpers/colors';
import { mapFontFamily, mapFontWeight, ensureFont } from '../helpers/fonts';
import { applyFills, applyBorder, applyBorderRadius, applyShadow } from '../helpers/styles';
import { appendAndPosition } from '../helpers/layout';
import {
  DEFAULT_FONT_SIZE,
  DEFAULT_CHECKBOX_RADIUS,
  RADIO_DOT_RATIO,
  Colors,
  UNCHECKED_BORDER_OPACITY,
} from '../helpers/constants';

// ─── Checkbox / Radio ─────────────────────────────────────────────────────

/**
 * Creates a visual approximation of a checkbox or radio button.
 */
async function createCheckboxRadio(
  domNode: InputDomNode,
  parent: any,
  parentRect: { x: number; y: number },
  isAutoLayoutChild: boolean,
): Promise<any> {
  const s = domNode.styles ?? {};
  const isRadio = domNode.inputType === 'radio';
  const isChecked = !!domNode.checked;

  const cW = Math.max(domNode.width ?? 16, 1);
  const cH = Math.max(domNode.height ?? 16, 1);

  const frame = figma.createFrame();
  frame.name = `${isRadio ? 'Radio' : 'Checkbox'} (${isChecked ? 'checked' : 'unchecked'})`;
  frame.resize(cW, cH);

  // ── Border radius ─────────────────────────────────────────────────
  const defaultRadius = isRadio ? Math.min(cW, cH) / 2 : DEFAULT_CHECKBOX_RADIUS;
  applyBorderRadius(frame, s);
  if (!s.borderRadius) {
    frame.topLeftRadius = defaultRadius;
    frame.topRightRadius = defaultRadius;
    frame.bottomLeftRadius = defaultRadius;
    frame.bottomRightRadius = defaultRadius;
  }

  // ── Accent colour ─────────────────────────────────────────────────
  const accentFigma = colorToFigma(domNode.accentColor) ?? Colors.ACCENT_FALLBACK;

  if (isChecked) {
    // Filled with accent colour
    frame.fills = [{ type: 'SOLID', color: accentFigma }];
    frame.strokes = [];

    if (isRadio) {
      // Inner filled circle (dot)
      const dot = figma.createEllipse();
      dot.name = 'Dot';
      const dotSize = Math.max(Math.round(Math.min(cW, cH) * RADIO_DOT_RATIO), 2);
      dot.resize(dotSize, dotSize);
      dot.fills = [{ type: 'SOLID', color: Colors.WHITE }];
      frame.appendChild(dot);
      try { dot.layoutPositioning = 'ABSOLUTE'; } catch { /* noop */ }
      dot.x = Math.round((cW - dotSize) / 2);
      dot.y = Math.round((cH - dotSize) / 2);
    } else {
      // Checkmark SVG
      try {
        const checkW = Math.round(cW * 0.75);
        const checkH = Math.round(cH * 0.75);
        const checkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="${checkW}" height="${checkH}"><polyline points="3,8 6.5,12 13,4" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        const checkNode = figma.createNodeFromSvg(checkSvg);
        checkNode.name = 'Checkmark';
        checkNode.resize(checkW, checkH);
        frame.appendChild(checkNode);
        try { checkNode.layoutPositioning = 'ABSOLUTE'; } catch { /* noop */ }
        checkNode.x = Math.round(cW * 0.125);
        checkNode.y = Math.round(cH * 0.125);
      } catch {
        // Fallback: just show the filled box
      }
    }
  } else {
    // Unchecked: apply extracted fills or dark background fallback
    applyFills(frame, s);
    if (!s.backgroundColor && !s.gradient) {
      frame.fills = [{ type: 'SOLID', color: Colors.UNCHECKED_BG, opacity: 0.8 }];
    }
    applyBorder(frame, s);
    if (!s.border?.color) {
      frame.strokes = [
        { type: 'SOLID', color: Colors.WHITE, opacity: UNCHECKED_BORDER_OPACITY },
      ];
      frame.strokeWeight = 1;
    }
  }

  // ── Append & position ─────────────────────────────────────────────
  const relX = (domNode.x ?? 0) - (parentRect?.x ?? 0);
  const relY = (domNode.y ?? 0) - (parentRect?.y ?? 0);
  appendAndPosition(frame, parent, s, isAutoLayoutChild, relX, relY);

  return frame;
}

// ─── Standard text input ──────────────────────────────────────────────────

/**
 * Creates a Figma frame for a text input, textarea, or select element.
 */
async function createStandardInput(
  domNode: InputDomNode,
  parent: any,
  parentRect: { x: number; y: number },
  isAutoLayoutChild: boolean,
): Promise<any> {
  const s = domNode.styles ?? {};
  const iType = domNode.inputType ?? 'text';

  const frame = figma.createFrame();
  frame.name = `Input (${iType})`;
  frame.resize(Math.max(domNode.width ?? 200, 1), Math.max(domNode.height ?? 36, 1));

  applyFills(frame, s);
  applyBorder(frame, s);
  applyBorderRadius(frame, s);
  applyShadow(frame, s);

  // FIX from audit: transparent background when none detected (NOT white)
  // The parent wrapper typically provides the visual box in dark-themed apps.
  if (!s.backgroundColor && !s.gradient) {
    frame.fills = [];
  }

  // ── Display text (value or placeholder) ───────────────────────────
  const displayText = domNode.value ?? domNode.placeholder ?? '';
  const isPlaceholder = !domNode.value && !!domNode.placeholder;

  if (displayText) {
    const iFontFamily = mapFontFamily(s.fontFamily ?? '');
    const iFontStyle = mapFontWeight(s.fontWeight ?? '400');
    await ensureFont(iFontFamily, iFontStyle);

    const iTextNode = figma.createText();
    iTextNode.fontName = { family: iFontFamily, style: iFontStyle };
    iTextNode.fontSize = s.fontSize ?? DEFAULT_FONT_SIZE;
    iTextNode.characters = displayText;

    // Determine text colour based on placeholder vs. value
    let inputTextColor: { r: number; g: number; b: number } | null = null;
    let inputTextOpacity = 1;

    if (isPlaceholder && domNode.placeholderColor) {
      inputTextColor = colorToFigma(domNode.placeholderColor);
      inputTextOpacity = getOpacity(domNode.placeholderColor, 0.6);
    } else if (!isPlaceholder && domNode.inputColor) {
      inputTextColor = colorToFigma(domNode.inputColor);
      inputTextOpacity = getOpacity(domNode.inputColor, 1);
    } else if (isPlaceholder && s.color) {
      inputTextColor = colorToFigma(s.color);
      inputTextOpacity = 0.5; // Dimmed version of text colour
    }

    if (!inputTextColor) {
      inputTextColor = Colors.PLACEHOLDER_FALLBACK;
      inputTextOpacity = 1;
    }

    iTextNode.fills = [
      { type: 'SOLID', color: inputTextColor, opacity: inputTextOpacity },
    ];

    iTextNode.x = s.padding?.left ?? 8;
    iTextNode.y = Math.max(0, ((domNode.height ?? 36) - (s.fontSize ?? DEFAULT_FONT_SIZE)) / 2);
    frame.appendChild(iTextNode);
  }

  // ── Append & position ─────────────────────────────────────────────
  const relX = (domNode.x ?? 0) - (parentRect?.x ?? 0);
  const relY = (domNode.y ?? 0) - (parentRect?.y ?? 0);
  appendAndPosition(frame, parent, s, isAutoLayoutChild, relX, relY);

  return frame;
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Creates a Figma node from an extracted input DOM node.
 *
 * Routes to checkbox/radio or standard text input handling.
 *
 * @param domNode            - The extracted input DOM node.
 * @param parent             - Parent Figma frame.
 * @param parentRect         - Absolute `{ x, y }` of the parent.
 * @param isAutoLayoutChild  - Whether the parent has auto-layout enabled.
 * @returns The created FrameNode, or `null`.
 */
export async function createInputNode(
  domNode: InputDomNode,
  parent: any,
  parentRect: { x: number; y: number },
  isAutoLayoutChild: boolean,
  _gridRow?: number,
  _gridColumn?: number,
): Promise<any | null> {
  const iType = domNode.inputType ?? 'text';

  if (iType === 'checkbox' || iType === 'radio') {
    return createCheckboxRadio(domNode, parent, parentRect, isAutoLayoutChild);
  }

  return createStandardInput(domNode, parent, parentRect, isAutoLayoutChild);
}
