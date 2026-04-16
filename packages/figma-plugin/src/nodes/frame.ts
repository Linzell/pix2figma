/**
 * @pix2figma/figma-plugin — Frame node renderer
 *
 * The main recursive frame builder. Creates a Figma frame from a `FrameDomNode`,
 * applies styles & auto-layout, handles embedded text, list markers, renders
 * children (flow first, then absolute), sets child sizing, applies scroll
 * capping + fold markers, fixes SPACE_BETWEEN single-child, and positions.
 */

declare const figma: any;

import type { FrameDomNode, DomNode, ExtractedStyles } from '../helpers/types';
import { applyFills, applyBorder, applyBorderRadius, applyShadow } from '../helpers/styles';
import { applyAutoLayout, appendAndPosition, appendGridChild, fixSpaceBetweenSingleChild } from '../helpers/layout';
import { getNodeName } from '../helpers/naming';
import { capScrollContent, drawFoldMarker } from '../helpers/scroll';
import { MAX_SCROLL_FACTOR } from '../helpers/constants';
import { createEmbeddedTextNode } from './embedded';
import { createListMarker } from './list';

// ─── Lazy import to break circular dependency ─────────────────────────────
// renderer.ts imports frame.ts, and frame.ts needs the dispatcher from
// renderer.ts for recursive child creation. We import lazily at call time.

let _createFigmaNode: ((
  domNode: DomNode,
  parent: any,
  parentRect: { x: number; y: number },
  isAutoLayoutChild: boolean,
) => Promise<any | null>) | null = null;

const _stretchHeightNodes = new WeakMap<object, boolean>();

/**
 * Injects the `createFigmaNode` dispatcher to avoid circular imports.
 * Called once by `renderer.ts` during module initialisation.
 */
export function injectCreateFigmaNode(
  fn: (
    domNode: DomNode,
    parent: any,
    parentRect: { x: number; y: number },
    isAutoLayoutChild: boolean,
  ) => Promise<any | null>,
): void {
  _createFigmaNode = fn;
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Creates a Figma frame from an extracted frame DOM node.
 *
 * This is the main recursive builder that handles:
 * - Frame creation & styling
 * - Auto-layout configuration
 * - Embedded text (badge/pill)
 * - List markers (`<li>` elements)
 * - Child rendering (flow first, then absolute)
 * - Child sizing in auto-layout
 * - Scroll capping + fold markers
 * - SPACE_BETWEEN single-child fix
 * - Positioning relative to parent
 *
 * @param domNode            - The extracted frame DOM node.
 * @param parent             - Parent Figma frame (may be `null` for root).
 * @param parentRect         - Absolute `{ x, y }` of the parent.
 * @param isAutoLayoutChild  - Whether the parent has auto-layout enabled.
 * @param gridRow           - Optional grid row index for grid placement.
 * @param gridColumn        - Optional grid column index for grid placement.
 * @returns The created FrameNode, or `null`.
 */
export async function createFrameNode(
  domNode: FrameDomNode,
  parent: any,
  parentRect: { x: number; y: number },
  isAutoLayoutChild: boolean,
  gridRow?: number,
  gridColumn?: number,
): Promise<any | null> {
  const s: ExtractedStyles = domNode.styles ?? {};

  // ── Create & size frame ───────────────────────────────────────────
  const frame = figma.createFrame();
  frame.name = getNodeName(domNode);
  frame.resize(Math.max(domNode.width ?? 100, 1), Math.max(domNode.height ?? 20, 1));

  // ── Visual styles ─────────────────────────────────────────────────
  applyFills(frame, s);
  applyBorder(frame, s);
  applyBorderRadius(frame, s);
  applyShadow(frame, s);

  if (s.opacity !== undefined && s.opacity < 1) {
    frame.opacity = s.opacity;
  }

  frame.clipsContent = !!s.clipContent;

  // ── Auto-layout ───────────────────────────────────────────────────
  const hasAutoLayout = applyAutoLayout(frame, s);

  // Store raw justify for the SPACE_BETWEEN fix later
  const rawJustify =
    s.layout?.mode === 'flex'
      ? (s.layout as any).justifyContent ?? 'flex-start'
      : '';

  // ── Embedded text (badge/pill) ────────────────────────────────────
  // Must come before children so it marks hasAutoLayout correctly.
  // Note: createEmbeddedTextNode sets up auto-layout internally when present.
  let embeddedLayoutApplied = false;
  if (domNode.embeddedText) {
    await createEmbeddedTextNode(frame, domNode);
    embeddedLayoutApplied = true;
  }

  // ── List marker ───────────────────────────────────────────────────
  if (domNode.listMarker) {
    await createListMarker(frame, domNode);
  }

  // ── Children ──────────────────────────────────────────────────────
  // Text and element children are interleaved in DOM source order.
  // We separate flow vs. absolute and render flow first for correct z-order.
  const myRect = { x: domNode.x ?? 0, y: domNode.y ?? 0 };

  if (domNode.children) {
    const flowChildren: DomNode[] = [];
    const absChildren: DomNode[] = [];

    for (const child of domNode.children) {
      const childStyles = child.styles ?? {};
      const childIsAbsolute =
        childStyles.position === 'absolute' || childStyles.position === 'fixed';

      if (childIsAbsolute) {
        absChildren.push(child);
      } else {
        flowChildren.push(child);
      }
    }

    const layout = s.layout;
    const isGrid = layout?.mode === 'grid';
    const columnCount = isGrid ? ((layout as any).columnCount ?? 1) : 1;

    // Render flow children first
    const effectiveAutoLayout = hasAutoLayout || embeddedLayoutApplied;

    if (isGrid && columnCount > 1) {
      // For grid layout, use appendGridChild with row/column indices
      const childCount = flowChildren.length;
      const rowCount = Math.ceil(childCount / columnCount);

      // Set grid dimensions
      frame.gridColumnCount = columnCount;
      frame.gridRowCount = rowCount;

      // Set equal-width column sizes using FLEX (fr units)
      // For repeat(N, 1fr) patterns, use equal FLEX values
      const columnSizes = [];
      for (let i = 0; i < columnCount; i++) {
        columnSizes.push({ type: 'FLEX' as const, value: 1 });
      }
      frame.gridColumnSizes = columnSizes;

      // Place each child in its grid cell
      for (let i = 0; i < flowChildren.length; i++) {
        const child = flowChildren[i];
        const row = Math.floor(i / columnCount);
        const col = i % columnCount;
        const childNode = await _createFigmaNode!(child, frame, myRect, true, row, col);
        if (childNode && child.styles?.stretchHeight) {
          _stretchHeightNodes.set(childNode, true);
        }
      }
    } else {
      // For flex/other layouts, use standard flow
      for (const child of flowChildren) {
        const childNode = await _createFigmaNode!(child, frame, myRect, effectiveAutoLayout);
        if (childNode && child.styles?.stretchHeight) {
          _stretchHeightNodes.set(childNode, true);
        }
      }
    }

    // Render absolute children on top (layoutPositioning = "ABSOLUTE"
    // is set inside appendAndPosition via each node renderer)
    for (const child of absChildren) {
      await _createFigmaNode!(child, frame, myRect, false);
    }
  }

  // ── Child sizing in auto-layout ───────────────────────────────────
  const effectiveAutoLayout = hasAutoLayout || embeddedLayoutApplied;
  if (effectiveAutoLayout && frame.children) {
    const layout = s.layout;
    const isGridWithColumns = layout?.mode === 'grid' && (layout as any).columnCount > 1;

    for (const child of frame.children) {
      try {
        if ('layoutSizingHorizontal' in child) {
          if (isGridWithColumns) {
            child.layoutSizingHorizontal = 'FILL';
            child.layoutSizingVertical = 'FILL';
          } else if (_stretchHeightNodes.get(child)) {
            child.layoutSizingVertical = 'FILL';
          } else if (child.type === 'TEXT' && child.textAutoResize === 'WIDTH_AND_HEIGHT') {
            child.layoutSizingHorizontal = 'HUG';
            child.layoutSizingVertical = 'HUG';
          } else {
            child.layoutSizingHorizontal = 'FIXED';
            child.layoutSizingVertical = 'FIXED';
          }
        }
      } catch {
        // Ignore nodes that don't support sizing
      }
    }
  }

  // ── Fix SPACE_BETWEEN with a single flow child ────────────────────
  if (hasAutoLayout) {
    fixSpaceBetweenSingleChild(frame, rawJustify);
  }

  // ── Scroll container: cap + fold marker ───────────────────────────
  if (s.scrollInfo && s.scrollInfo.visibleHeight > 0) {
    const { visibleHeight, totalHeight = 0 } = s.scrollInfo;
    const cappedContentH = Math.round(visibleHeight * MAX_SCROLL_FACTOR);
    const foldWidth = Math.max(domNode.width ?? 100, 1);

    const wasCapped = capScrollContent(frame, s.scrollInfo, foldWidth);

    // Don't clip the scroll container itself — show the fold marker
    frame.clipsContent = false;

    await drawFoldMarker(
      frame,
      visibleHeight,
      foldWidth,
      wasCapped,
      totalHeight,
      cappedContentH,
    );
  }

  // ── Append & position ─────────────────────────────────────────────
  const relX = (domNode.x ?? 0) - (parentRect?.x ?? 0);
  const relY = (domNode.y ?? 0) - (parentRect?.y ?? 0);

  // Check if parent is a grid and we have grid coordinates
  const parentIsGrid = parent?.layoutMode === 'GRID';
  if (parentIsGrid && gridRow !== undefined && gridColumn !== undefined) {
    appendGridChild(frame, parent, gridRow, gridColumn, s);
  } else {
    appendAndPosition(frame, parent, s, isAutoLayoutChild, relX, relY);
  }

  return frame;
}
