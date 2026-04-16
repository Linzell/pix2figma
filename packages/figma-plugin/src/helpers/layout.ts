/**
 * @pix2figma/figma-plugin — Layout helpers
 *
 * Handles Figma auto-layout setup (flex / grid), child positioning,
 * and the SPACE_BETWEEN single-child fix.
 */

import type { ExtractedStyles } from './types';
import { applyPadding } from './styles';

// ─── Justify / Align mapping ──────────────────────────────────────────────

/**
 * Maps CSS `justify-content` to Figma `primaryAxisAlignItems`.
 */
function mapJustify(
  value: string,
): 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN' {
  switch (value) {
    case 'center':
      return 'CENTER';
    case 'flex-end':
      return 'MAX';
    case 'space-between':
      return 'SPACE_BETWEEN';
    default:
      return 'MIN';
  }
}

/**
 * Maps CSS `align-items` to Figma `counterAxisAlignItems`.
 */
function mapAlign(value: string): 'MIN' | 'CENTER' | 'MAX' {
  switch (value) {
    case 'center':
      return 'CENTER';
    case 'flex-end':
      return 'MAX';
    default:
      return 'MIN';
  }
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Configures Figma auto-layout on a frame based on the extracted CSS layout.
 *
 * Supports `flex` (horizontal / vertical, with wrap) and `grid` (mapped to
 * a horizontal wrap layout, since Figma has no native CSS-grid equivalent).
 *
 * @param frame  - The Figma frame to configure.
 * @param styles - Extracted styles containing layout information.
 * @returns `true` if auto-layout was applied, `false` otherwise.
 */
export function applyAutoLayout(
  frame: any,
  styles: ExtractedStyles,
): boolean {
  const layout = styles.layout;

  if (layout?.mode === 'flex') {
    const dir = layout.direction;
    frame.layoutMode =
      dir === 'column' || dir === 'column-reverse'
        ? 'VERTICAL'
        : 'HORIZONTAL';
    frame.itemSpacing = layout.gap ?? 0;

    // Set vertical spacing for rowGap if different from gap
    if (layout.rowGap && layout.rowGap !== (layout.gap ?? 0)) {
      frame.verticalSpacing = layout.rowGap;
    }

    if (styles.padding) {
      applyPadding(frame, styles.padding);
    }

    const justify = layout.justifyContent ?? 'flex-start';
    const alignItems = layout.alignItems ?? 'stretch';

    frame.primaryAxisAlignItems = mapJustify(justify);
    frame.counterAxisAlignItems = mapAlign(alignItems);

    frame.primaryAxisSizingMode = 'FIXED';

    if (layout.wrap === 'wrap') {
      frame.layoutWrap = 'WRAP';
      // For wrap layouts approximating CSS grid, use AUTO counter axis
      // so children can size based on available width
      frame.counterAxisSizingMode = 'AUTO';
    } else {
      frame.counterAxisSizingMode = 'FIXED';
    }

    return true;
  }

  if (layout?.mode === 'grid') {
    // Use Figma's native Grid layout mode
    frame.layoutMode = 'GRID';
    frame.gridColumnGap = layout.columnGap ?? layout.gap ?? 0;
    frame.gridRowGap = layout.rowGap ?? layout.gap ?? 0;

    if (styles.padding) {
      applyPadding(frame, styles.padding);
    }

    return true;
  }

  // No layout mode
  frame.layoutMode = 'NONE';
  return false;
}

/**
 * Appends a node to its parent and applies positioning.
 *
 * Handles the absolute/fixed positioning pattern that is repeated 5+ times
 * in the original code. When a node is absolutely positioned it is marked
 * with `layoutPositioning = "ABSOLUTE"` so Figma's auto-layout ignores it.
 * Otherwise, `x` / `y` are only set when the node is NOT an auto-layout child.
 *
 * @param node              - The Figma node to append.
 * @param parent            - The parent Figma frame (may be `null` for root).
 * @param styles            - The node's extracted CSS styles (for position detection).
 * @param isAutoLayoutChild - Whether the parent has auto-layout enabled.
 * @param relX              - Relative X offset from the parent.
 * @param relY              - Relative Y offset from the parent.
 */
export function appendAndPosition(
  node: any,
  parent: any,
  styles: ExtractedStyles,
  isAutoLayoutChild: boolean,
  relX: number,
  relY: number,
): void {
  if (!parent) return;

  parent.appendChild(node);

  const isAbsolute =
    styles.position === 'absolute' || styles.position === 'fixed';

  if (isAbsolute) {
    try {
      node.layoutPositioning = 'ABSOLUTE';
    } catch {
      // Node type may not support layoutPositioning
    }
  }

  // Set coordinates when the node is outside auto-layout flow
  if (!isAutoLayoutChild || isAbsolute) {
    node.x = relX;
    node.y = relY;
  }
}

/**
 * Appends a node to a grid parent at the specified row and column.
 * Uses Figma's appendChildAt for proper grid placement.
 *
 * @param node       - The Figma node to append.
 * @param parent     - The parent Figma grid frame.
 * @param row        - Row index (0-based).
 * @param column     - Column index (0-based).
 * @param styles     - The node's extracted CSS styles (for position detection).
 */
export function appendGridChild(
  node: any,
  parent: any,
  row: number,
  column: number,
  styles: ExtractedStyles,
): void {
  if (!parent) return;

  try {
    parent.appendChildAt(node, column, row);
  } catch {
    // Fallback to regular append if appendChildAt fails
    parent.appendChild(node);
  }

  // Handle absolute positioning within grid
  const isAbsolute = styles?.position === 'absolute' || styles?.position === 'fixed';
  if (isAbsolute) {
    try {
      node.layoutPositioning = 'ABSOLUTE';
    } catch {
      // Node type may not support layoutPositioning
    }
  }
}

/**
 * Fixes `SPACE_BETWEEN` alignment when there is only one flow child.
 *
 * CSS `justify-content: space-between` with a single child places it at
 * `flex-start`. Figma's `SPACE_BETWEEN` centres a single child instead.
 * This function counts non-absolute children and falls back to `MIN`
 * when there are zero or one flow children.
 *
 * Should be called **after** all children have been appended.
 *
 * @param frame      - The parent Figma frame.
 * @param rawJustify - The original CSS `justify-content` value.
 */
export function fixSpaceBetweenSingleChild(
  frame: any,
  rawJustify: string,
): void {
  if (rawJustify !== 'space-between') return;

  let flowCount = 0;
  const children = frame.children;
  if (!children) return;

  for (const child of children) {
    try {
      if (child.layoutPositioning !== 'ABSOLUTE') {
        flowCount++;
      }
    } catch {
      // Ignore nodes without layoutPositioning
      flowCount++;
    }
  }

  if (flowCount <= 1) {
    frame.primaryAxisAlignItems = 'MIN';
  }
}
