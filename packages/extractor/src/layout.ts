/**
 * @pix2figma/extractor — Layout, padding & scroll detection
 *
 * Runs in the browser. Extracts CSS flex/grid layout properties, padding,
 * and detects scrollable containers from a `CSSStyleDeclaration`.
 *
 * Grid layouts capture `gridTemplateColumns` and `gridTemplateRows` so the
 * Figma plugin can approximate them (Figma has no native CSS grid, so these
 * are typically converted to nested auto-layout frames).
 *
 * ## Tailwind gap handling
 *
 * Tailwind 4 uses CSS variables for gap values (e.g. `gap: calc(var(--spacing) * 4)`)
 * which may not resolve correctly in `getComputedStyle()`. This module parses
 * gap values directly from Tailwind class names as a fallback.
 */

import type { FlexLayout, GridLayout, LayoutInfo, Padding, ScrollInfo } from './types';

const TAILWIND_SPACING: Record<string, number> = {
  '0': 0, 'px': 1,
  '0.5': 2, '1': 4, '1.5': 6, '2': 8, '2.5': 10, '3': 12,
  '3.5': 14, '4': 16, '5': 20, '6': 24, '7': 28, '8': 32, '9': 36, '10': 40,
  '11': 44, '12': 48, '14': 56, '16': 64, '20': 80, '24': 96, '28': 112,
  '32': 128, '36': 144, '40': 160, '44': 176, '48': 192, '52': 208,
  '56': 224, '60': 240, '64': 256, '72': 288, '80': 320, '96': 384,
  '128': 512, '144': 576, '160': 640, '176': 704, '192': 768,
};

const TAILWIND_RADIUS: Record<string, number> = {
  'none': 0, 'sm': 4, 'md': 6, 'lg': 8, 'xl': 12, '2xl': 16, '3xl': 24, '4xl': 32,
  'full': 9999,
};

function parseTailwindGap(className: string, prefix: 'gap' | 'gap-x' | 'gap-y'): number {
  if (!className || typeof className !== 'string') return 0;
  
  const patterns = [
    new RegExp(`${prefix}-(\\[(?:[^\\]]+)\\])`, ''),
    new RegExp(`${prefix}-(\\d+(?:\\.\\d+)?)`, ''),
    new RegExp(`${prefix}-(--[a-zA-Z0-9_-]+)`, ''),
  ];

  for (const pattern of patterns) {
    try {
      const match = className.match(pattern);
      if (match && match[1] && typeof match[1] === 'string') {
        const value = match[1];
        if (typeof value !== 'string') { console.error('gap value is not string:', value); return 0; }
        if (value.startsWith('[')) {
          const inner = value.slice(1, -1);
          if (inner && inner.startsWith('--')) {
            const num = parseFloat(inner);
            return isNaN(num) ? 0 : num;
          }
          const num = parseFloat(inner);
          if (!isNaN(num)) return num;
        }
        return TAILWIND_SPACING[value] ?? (parseFloat(value) || 0);
      }
    } catch (e) {
      console.error('parseTailwindGap error:', e);
    }
  }
  return 0;
}

function extractTailwindGap(className: string): { gap: number; rowGap: number; columnGap: number } {
  const gap = parseTailwindGap(className, 'gap');
  const rowGap = parseTailwindGap(className, 'gap-y');
  const columnGap = parseTailwindGap(className, 'gap-x');

  const hasExplicitColumnGap = className.includes('gap-x-') || className.includes('column-gap-');
  const hasExplicitRowGap = className.includes('gap-y-') || className.includes('row-gap-');
  const hasExplicitGap = className.includes('gap-') && !hasExplicitColumnGap && !hasExplicitRowGap;

  return {
    gap: gap || rowGap,
    rowGap: rowGap || (hasExplicitGap ? gap : 0),
    columnGap: columnGap || (hasExplicitGap ? gap : 0),
  };
}

/**
 * Extract flex or grid layout info from computed styles.
 *
 * Returns `null` for block/inline/table/etc. display modes that don't
 * map to a Figma auto-layout mode.
 *
 * @param cs  Computed style declaration
 * @param el  HTML element (for Tailwind class name parsing as CSS var fallback)
 */
export function extractLayout(cs: CSSStyleDeclaration, el?: HTMLElement): LayoutInfo | null {
  const display = cs.display;

  let twGap = { gap: 0, rowGap: 0, columnGap: 0 };
  const className = el && typeof el.className === 'string' ? el.className : '';
  if (className) {
    twGap = extractTailwindGap(className);
  }

  if (display === 'flex' || display === 'inline-flex') {
    const cssGap = parseFloat(cs.gap) || 0;
    const cssRowGap = parseFloat(cs.rowGap) || 0;
    const cssColumnGap = parseFloat(cs.columnGap) || 0;
    const layout: FlexLayout = {
      mode: 'flex',
      direction: cs.flexDirection,
      wrap: cs.flexWrap,
      justifyContent: cs.justifyContent,
      alignItems: cs.alignItems,
      gap: cssGap || twGap.gap,
      rowGap: cssRowGap || twGap.rowGap,
      columnGap: cssColumnGap || twGap.columnGap,
    };
    return layout;
  }

  if (display === 'grid' || display === 'inline-grid') {
    const cssGap = parseFloat(cs.gap) || 0;
    const cssRowGap = parseFloat(cs.rowGap) || parseFloat(cs.gridRowGap) || 0;
    const cssColumnGap = parseFloat(cs.columnGap) || parseFloat(cs.gridColumnGap) || 0;
    const templateColumns = cs.gridTemplateColumns;

    // Parse column count from gridTemplateColumns
    let columnCount = 0;
    if (templateColumns) {
      const repeatMatch = templateColumns.match(/repeat\s*\(\s*(\d+)/);
      if (repeatMatch) {
        columnCount = parseInt(repeatMatch[1], 10);
      } else {
        // Count space-separated values (1fr, 200px, etc.)
        columnCount = templateColumns.trim().split(/\s+/).length;
      }
    }

    const layout: GridLayout = {
      mode: 'grid',
      templateColumns: templateColumns,
      templateRows: cs.gridTemplateRows,
      gap: cssGap || twGap.gap,
      rowGap: cssRowGap || twGap.rowGap,
      columnGap: cssColumnGap || twGap.columnGap,
      columnCount,
    };
    return layout;
  }

  return null;
}

/**
 * Extract padding values from computed styles.
 *
 * Returns `null` when all four sides are zero.
 *
 * @param cs Computed style declaration
 */
export function extractPadding(cs: CSSStyleDeclaration): Padding | null {
  const top = parseFloat(cs.paddingTop) || 0;
  const right = parseFloat(cs.paddingRight) || 0;
  const bottom = parseFloat(cs.paddingBottom) || 0;
  const left = parseFloat(cs.paddingLeft) || 0;

  if (top === 0 && right === 0 && bottom === 0 && left === 0) return null;

  return { top, right, bottom, left };
}

/**
 * Detect whether an element is a scrollable container and return scroll metrics.
 *
 * A scroll container is an element whose `overflow-y` (or `overflow-x`) is
 * `scroll` or `auto` **and** whose `scrollHeight` exceeds its `clientHeight`
 * (i.e. content actually overflows).
 *
 * When detected, the caller should use the **full** `scrollHeight` /
 * `scrollWidth` as the element's dimensions so the Figma extraction captures
 * all content. The `visibleHeight` tells the Figma plugin where to draw a
 * fold-marker and cap the visual frame height.
 *
 * @param el The HTML element
 * @param cs Its computed style declaration
 */
export function detectScrollContainer(
  el: HTMLElement,
  cs: CSSStyleDeclaration,
): ScrollInfo | null {
  const ovfY = cs.overflowY;

  // Only `scroll` and `auto` produce scrollable containers.
  // `hidden` clips but doesn't scroll — handled separately as `clipContent`.
  if (ovfY !== 'scroll' && ovfY !== 'auto') return null;

  // Content must actually exceed the visible area (1px tolerance for sub-pixel rounding)
  if (el.scrollHeight <= el.clientHeight + 1) return null;

  return {
    visibleHeight: el.clientHeight,
    totalHeight: Math.round(el.scrollHeight),
  };
}
