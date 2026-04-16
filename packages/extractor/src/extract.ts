/**
 * @pix2figma/extractor — Main DOM extraction logic
 *
 * Runs in the browser. Walks the DOM tree starting from a root element,
 * producing a typed `DomNode` tree that captures geometry, styles, text,
 * images, SVGs, inputs, scroll containers, and list markers.
 *
 * Uses the following helper modules:
 *  - colors   — `parseColor`, `resolveColor`, `rgbToHex`
 *  - gradients — `parseGradient`
 *  - shadows  — `parseShadow`
 *  - borders  — `parseBorder`, `parseBorderRadius`
 *  - layout   — `extractLayout`, `extractPadding`, `detectScrollContainer`
 *  - text     — `measureTextNode`
 *  - filters  — `shouldExcludeElement`
 */

import type {
  DomNode,
  FrameDomNode,
  TextDomNode,
  InputDomNode,
  ImageDomNode,
  SvgDomNode,
  ExtractedStyles,
  ExtractionResult,
} from './types';

import { parseColor, resolveColor, rgbToHex } from './colors';
import { parseGradient } from './gradients';
import { parseShadow } from './shadows';
import { parseBorder, parseBorderRadius } from './borders';
import { extractLayout, extractPadding, detectScrollContainer } from './layout';
import { measureTextNode } from './text';
import { shouldExcludeElement } from './filters';

// ─── Constants ────────────────────────────────────────────────────────────

const MAX_DEPTH = 30;
const MAX_NODES = 10_000;

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK', 'META', 'HEAD', 'BR', 'WBR',
]);

// ─── Extraction options ──────────────────────────────────────────────────

export interface ExtractOptions {
  /** CSS selectors for elements to exclude */
  excludeSelectors?: string[];
  /** Whether this subtree is inside an expanded scroll container */
  isInsideScrollContainer?: boolean;
}

// ─── Node counter (reset per extraction) ─────────────────────────────────

let nodeCount = 0;

// ─── Tailwind gradient direction heuristic ───────────────────────────────

/**
 * When the computed gradient angle is the default 180°, check the element's
 * CSS class names for Tailwind gradient-direction hints. Browsers may
 * resolve `to bottom right` to a form that our parser defaults to 180°.
 */
function adjustGradientAngleFromClasses(
  angle: number,
  el: HTMLElement,
): number {
  if (angle !== 180) return angle;

  const cn = el.className;
  if (!cn || typeof cn !== 'string') return angle;

  if (cn.includes('bg-gradient-to-br') || cn.includes('to-br')) return 135;
  if (cn.includes('bg-gradient-to-tr') || cn.includes('to-tr')) return 45;
  if (cn.includes('bg-gradient-to-r') || cn.includes('to-r')) return 90;
  if (cn.includes('bg-gradient-to-l') || cn.includes('to-l')) return 270;
  if (cn.includes('bg-gradient-to-t') || cn.includes('to-t')) return 0;
  if (cn.includes('bg-gradient-to-bl') || cn.includes('to-bl')) return 225;
  if (cn.includes('bg-gradient-to-tl') || cn.includes('to-tl')) return 315;

  return angle;
}

// ─── Main recursive extractor ────────────────────────────────────────────

/**
 * Recursively extract a single DOM element into a `DomNode`.
 *
 * @param el         The HTML element to extract
 * @param depth      Current recursion depth (capped at `MAX_DEPTH`)
 * @param parentRect Parent's bounding rect (for relative positioning context)
 * @param options    Filter options (exclude selectors, scroll container flag)
 * @returns A `DomNode` or `null` if the element should be skipped
 */
export function extractNode(
  el: HTMLElement,
  depth: number,
  _parentRect: DOMRect | null,
  options: ExtractOptions = {},
): DomNode | null {
  if (depth > MAX_DEPTH) return null;
  if (nodeCount >= MAX_NODES) return null;
  if (!(el instanceof Element)) return null;

  const tag = el.tagName;
  if (SKIP_TAGS.has(tag)) return null;

  const rect = el.getBoundingClientRect();
  const cs = window.getComputedStyle(el);

  // ── Apply exclusion filters ─────────────────────────────────────────
  if (shouldExcludeElement(el, rect, cs, {
    excludeSelectors: options.excludeSelectors,
    isInsideScrollContainer: options.isInsideScrollContainer,
  })) {
    return null;
  }

  // ── Scroll container detection ──────────────────────────────────────
  const scrollInfo = detectScrollContainer(el, cs);
  const isScrollContainer = scrollInfo !== null;

  let effectiveHeight = Math.round(rect.height);
  let effectiveWidth = Math.round(rect.width);

  if (isScrollContainer) {
    // Use the FULL scroll height so all content is captured
    effectiveHeight = scrollInfo.totalHeight;
  }

  // Horizontal scroll: also expand width
  const ovfX = cs.overflowX;
  if ((ovfX === 'scroll' || ovfX === 'auto') && el.scrollWidth > el.clientWidth + 1) {
    effectiveWidth = Math.round(el.scrollWidth);
  }

  nodeCount++;

  // ── Base node ───────────────────────────────────────────────────────
  const baseX = Math.round(rect.left);
  const baseY = Math.round(rect.top);

  // ── Styles ──────────────────────────────────────────────────────────
  const styles: ExtractedStyles = {};

  // Background
  const bgColor = parseColor(cs.backgroundColor);
  if (bgColor && bgColor.opacity > 0) {
    styles.backgroundColor = bgColor;
  }

  const bgImage = cs.backgroundImage;
  const gradient = parseGradient(bgImage);
  if (gradient) {
    gradient.angle = adjustGradientAngleFromClasses(gradient.angle, el);
    styles.gradient = gradient;
  }

  // Text color
  const color = parseColor(cs.color);
  if (color) styles.color = color;

  // Typography
  styles.fontSize = parseFloat(cs.fontSize) || 14;
  styles.fontWeight = cs.fontWeight;
  styles.fontFamily = cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
  styles.lineHeight =
    cs.lineHeight === 'normal'
      ? 1.2 * (styles.fontSize ?? 14)
      : parseFloat(cs.lineHeight);
  styles.textAlign = cs.textAlign;
  styles.letterSpacing = parseFloat(cs.letterSpacing) || 0;
  if (cs.textTransform !== 'none') styles.textTransform = cs.textTransform;
  if (cs.textDecoration !== 'none' && !cs.textDecoration.includes('none')) {
    styles.textDecoration = cs.textDecoration;
  }

  // Border
  const border = parseBorder(cs);
  if (border) styles.border = border;

  // Border radius (pass dimensions for clamping rounded-full)
  const radius = parseBorderRadius(cs, rect.width, rect.height, el);
  if (
    radius.uniform > 0 ||
    radius.topLeft > 0 ||
    radius.topRight > 0 ||
    radius.bottomLeft > 0 ||
    radius.bottomRight > 0
  ) {
    styles.borderRadius = radius;
  }

  // Box shadow
  const shadow = parseShadow(cs.boxShadow);
  if (shadow) styles.boxShadow = shadow;

  // Height stretch - detect h-full, h-screen, flex-1, flex-grow, etc.
  const heightClass = typeof el.className === 'string' ? el.className : '';
  const hasHFull = heightClass.includes('h-full');
  const hasFlex1 = heightClass.includes('flex-1');
  const hasFlexGrow = heightClass.includes('flex-grow') || heightClass.includes('grow');
  const hasMinH0 = heightClass.includes('min-h-0');
  const hasHScreen = heightClass.includes('h-screen');
  
  if (hasHFull || hasFlex1 || hasFlexGrow || hasMinH0 || hasHScreen) {
    styles.stretchHeight = true;
  }

  // Opacity
  const opacity = parseFloat(cs.opacity);
  if (opacity < 1) styles.opacity = opacity;

  // Overflow: clipContent for overflow:hidden (not scroll/auto)
  if (cs.overflow === 'hidden' || cs.overflowX === 'hidden' || cs.overflowY === 'hidden') {
    if (!isScrollContainer) {
      styles.clipContent = true;
    }
  }

  // Scroll fold info
  if (isScrollContainer && scrollInfo.visibleHeight > 0) {
    styles.scrollInfo = {
      visibleHeight: scrollInfo.visibleHeight,
      totalHeight: scrollInfo.totalHeight,
    };
  }

  // Position: absolute/fixed
  const position = cs.position;
  if (position === 'absolute' || position === 'fixed') {
    styles.position = position;
  }

  // Layout hints
  const layout = extractLayout(cs, el);
  if (layout) styles.layout = layout;

  // Padding
  const padding = extractPadding(cs);
  if (padding) styles.padding = padding;

  // ── SVG handling ────────────────────────────────────────────────────
  if (tag === 'SVG' || el instanceof SVGElement) {
    const svgNode: SvgDomNode = {
      type: 'svg',
      tag: tag.toLowerCase(),
      x: baseX,
      y: baseY,
      width: effectiveWidth,
      height: effectiveHeight,
      styles,
    };

    try {
      const clone = el.cloneNode(true) as Element;
      clone.removeAttribute('class');

      // Ensure viewBox, width, height, and xmlns
      if (!clone.getAttribute('viewBox') && rect.width && rect.height) {
        clone.setAttribute(
          'viewBox',
          `0 0 ${Math.round(rect.width)} ${Math.round(rect.height)}`,
        );
      }
      clone.setAttribute('width', String(Math.round(rect.width)));
      clone.setAttribute('height', String(Math.round(rect.height)));
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

      // Resolve currentColor to the actual computed hex color
      const resolved = resolveColor(cs.color || '#000000');
      const hexColor = rgbToHex(resolved.r, resolved.g, resolved.b);
      let svgStr = clone.outerHTML.replace(/currentColor/g, hexColor);

      // Replace remaining oklch/oklab/hsl/color() functions that SVG doesn't support
      svgStr = svgStr.replace(/(?:oklch|oklab|hsl|color)\([^)]+\)/g, hexColor);

      svgNode.svgMarkup = svgStr;
    } catch {
      // SVG clone failed — node still returned without markup
    }

    return svgNode; // Don't recurse into SVG children
  }

  // ── Image handling ──────────────────────────────────────────────────
  if (tag === 'IMG') {
    const imgNode: ImageDomNode = {
      type: 'image',
      tag: 'img',
      x: baseX,
      y: baseY,
      width: effectiveWidth,
      height: effectiveHeight,
      styles,
      src: (el as HTMLImageElement).src,
    };
    return imgNode;
  }

  // ── Input handling ──────────────────────────────────────────────────
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    const inputEl = el as HTMLInputElement;
    const inputNode: InputDomNode = {
      type: 'input',
      tag: tag.toLowerCase(),
      x: baseX,
      y: baseY,
      width: effectiveWidth,
      height: effectiveHeight,
      styles,
      inputType: inputEl.type || 'text',
      placeholder: inputEl.placeholder || '',
      value: inputEl.value || '',
    };

    // Placeholder color via ::placeholder pseudo-element
    try {
      const phCs = window.getComputedStyle(el, '::placeholder');
      const phColorStr = phCs?.color;
      if (phColorStr) {
        const phColor = parseColor(phColorStr);
        if (phColor) {
          inputNode.placeholderColor = phColor;
        }
      }
    } catch {
      // ::placeholder style read failed
    }

    // Input text color
    if (styles.color) {
      inputNode.inputColor = styles.color;
    }

    // Checkbox/radio: capture checked state and accent color
    if (inputEl.type === 'checkbox' || inputEl.type === 'radio') {
      inputNode.checked = inputEl.checked;
      const accentStr = cs.accentColor;
      if (accentStr && accentStr !== 'auto') {
        const accentParsed = parseColor(accentStr);
        if (accentParsed) {
          inputNode.accentColor = accentParsed;
        }
      }
    }

    return inputNode;
  }

  // ── Children (preserving DOM source order of text and elements) ─────
  // Walk childNodes (not just element children) so that text nodes and
  // element children are interleaved in their original DOM order. This is
  // critical for flex layouts like "<Icon /> Sign In".
  const children: DomNode[] = [];
  let hasElementChildren = false;
  let hasTextChildren = false;

  // Children options: propagate scroll-container context
  const childOptions: ExtractOptions = {
    ...options,
    isInsideScrollContainer: options.isInsideScrollContainer || isScrollContainer,
  };

  for (const child of el.childNodes) {
    if (nodeCount >= MAX_NODES) break;

    if (child.nodeType === Node.TEXT_NODE) {
      const text = (child.textContent ?? '').trim();
      if (!text) continue;

      hasTextChildren = true;

      // Measure actual text node bounds using Range API
      const measured = measureTextNode(child as Text, rect);

      // Create an inline text child node (inherits parent styles)
      const textChild: TextDomNode = {
        type: 'text',
        tag: '#text',
        text,
        x: measured.x,
        y: measured.y,
        width: measured.width,
        height: measured.height,
        styles: {
          fontSize: styles.fontSize,
          fontWeight: styles.fontWeight,
          fontFamily: styles.fontFamily,
          lineHeight: styles.lineHeight,
          textAlign: styles.textAlign,
          letterSpacing: styles.letterSpacing,
          color: styles.color,
          textDecoration: styles.textDecoration,
          textTransform: styles.textTransform,
        },
      };
      children.push(textChild);
      nodeCount++;
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const childNode = extractNode(
        child as HTMLElement,
        depth + 1,
        rect,
        childOptions,
      );
      if (childNode) {
        hasElementChildren = true;
        children.push(childNode);
      }
    }
  }

  // ── Determine node type ─────────────────────────────────────────────

  // Pure text node (no element children) — collapse text children
  if (hasTextChildren && !hasElementChildren) {
    const textParts: string[] = [];
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = (child.textContent ?? '').trim();
        if (text) textParts.push(text);
      }
    }
    const combinedText = textParts.join(' ');

    // A text-only node with a visual box (bg, gradient, border-radius) should
    // be a frame wrapping the text — Figma text nodes don't get fills/corners.
    const hasVisualBox =
      (styles.backgroundColor && styles.backgroundColor.opacity > 0) ||
      styles.gradient != null ||
      (styles.borderRadius &&
        (styles.borderRadius.uniform > 0 || styles.borderRadius.topLeft > 0));

    if (hasVisualBox) {
      const frameNode: FrameDomNode = {
        type: 'frame',
        tag: tag.toLowerCase(),
        x: baseX,
        y: baseY,
        width: effectiveWidth,
        height: effectiveHeight,
        styles,
        embeddedText: combinedText,
      };
      assignListMarker(frameNode, tag, cs);
      return frameNode;
    }

    // Plain text node
    const textNode: TextDomNode = {
      type: 'text',
      tag: tag.toLowerCase(),
      text: combinedText,
      x: baseX,
      y: baseY,
      width: effectiveWidth,
      height: effectiveHeight,
      styles,
    };
    return textNode;
  }

  // Frame node (has element children, mixed children, or no children)
  const frameNode: FrameDomNode = {
    type: 'frame',
    tag: tag.toLowerCase(),
    x: baseX,
    y: baseY,
    width: effectiveWidth,
    height: effectiveHeight,
    styles,
  };

  if (children.length > 0) {
    frameNode.children = children;
  }

  assignListMarker(frameNode, tag, cs);

  return frameNode;
}

// ─── List marker helper ──────────────────────────────────────────────────

function assignListMarker(
  node: FrameDomNode,
  tag: string,
  cs: CSSStyleDeclaration,
): void {
  if (tag !== 'LI') return;

  const listType = cs.listStyleType;
  if (listType && listType !== 'none') {
    node.listMarker = listType;
    node.listMarkerInside = cs.listStylePosition === 'inside';
  }
}

// ─── Public entry point ──────────────────────────────────────────────────

/**
 * Extract the full DOM tree starting from a root selector or element.
 *
 * @param rootSelector  CSS selector for the root element (defaults to `#root` or `<body>`)
 * @param options       Extraction options
 * @returns The typed extraction result with viewport info and node tree
 */
export function extractDOM(
  rootSelector?: string,
  options: ExtractOptions = {},
): ExtractionResult {
  // Reset node counter
  nodeCount = 0;

  // Find root element
  let root: HTMLElement | null = null;
  if (rootSelector) {
    root = document.querySelector<HTMLElement>(rootSelector);
  }
  if (!root) {
    root = document.getElementById('root') ?? document.body;
  }

  const tree = extractNode(root, 0, null, options);

  return {
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    tree: tree ?? {
      type: 'frame',
      tag: 'body',
      x: 0,
      y: 0,
      width: window.innerWidth,
      height: window.innerHeight,
      styles: {},
    },
  };
}
