/**
 * @pix2figma/figma-plugin — Main entry point
 *
 * Plugin entry point that shows the UI, handles messages from the UI iframe,
 * and orchestrates the DOM-to-Figma import pipeline.
 */

declare const figma: any;
declare const __html__: string;

import type { DomNode, FrameDomNode } from './helpers/types';
import { colorToFigma, getOpacity } from './helpers/colors';
import { ensureFont } from './helpers/fonts';
import { propagateScrollUnroll } from './helpers/scroll';
import {
  UI_WIDTH,
  UI_HEIGHT,
  STATE_GAP,
  Colors,
  VIEWPORT_FOLD_DASH,
  VIEWPORT_FOLD_OPACITY,
} from './helpers/constants';
import { createFigmaNode, resetNodeCount, getNodeCount } from './renderer';

// ─── Show plugin UI ───────────────────────────────────────────────────────

figma.showUI(__html__, { width: UI_WIDTH, height: UI_HEIGHT });

// ─── Message handler ──────────────────────────────────────────────────────

figma.ui.onmessage = async (msg: any) => {
  if (msg.type === 'cancel') {
    figma.closePlugin();
    return;
  }

  // ── DOM Import ──────────────────────────────────────────────────────
  if (msg.type === 'import-dom') {
    try {
      const data = msg.data;
      const name: string = data.name || 'Imported Page';
      const stateName: string = data.stateName || 'Default';
      const viewport = data.viewport;
      const tree: DomNode | undefined = data.tree;

      figma.ui.postMessage({
        type: 'import-status',
        status: `Setting up page "${name}" state "${stateName}"...`,
        phase: 'setup',
      });

      resetNodeCount();

      const vpWidth = viewport?.width ?? 1440;
      const vpHeight = viewport?.height ?? 900;
      const LABEL_HEIGHT = 50; // space above frame for label

      // ── Find or create a dedicated Figma page ─────────────────────
      let targetPage: any = null;
      for (const page of figma.root.children) {
        if (page.name === name) {
          targetPage = page;
          break;
        }
      }

      if (!targetPage) {
        targetPage = figma.createPage();
        targetPage.name = name;
      }

      figma.currentPage = targetPage;

      // ── Remove existing frame + label for this state ──────────────
      const toRemove: any[] = [];
      for (const child of targetPage.children) {
        if (child.name === stateName || child.name === `Label: ${stateName}`) {
          toRemove.push(child);
        }
      }
      for (const node of toRemove) {
        node.remove();
      }

      // ── Collect existing frames for x-position calculation ────────
      const existingFrames: any[] = [];
      for (const child of targetPage.children) {
        if (child.type === 'FRAME') {
          existingFrames.push(child);
        }
      }

      // Place after the rightmost existing frame
      let nextX = 0;
      for (const ef of existingFrames) {
        const rightEdge = ef.x + ef.width;
        if (rightEdge + STATE_GAP > nextX) {
          nextX = rightEdge + STATE_GAP;
        }
      }

      figma.ui.postMessage({
        type: 'import-status',
        status: `Creating layers for state "${stateName}"...`,
        phase: 'build',
      });

      // ── State label ───────────────────────────────────────────────
      await ensureFont('Inter', 'Bold');

      const label = figma.createText();
      label.fontName = { family: 'Inter', style: 'Bold' };
      label.characters = stateName;
      label.fontSize = 24;
      label.fills = [{ type: 'SOLID', color: Colors.STATE_LABEL }];
      label.name = `Label: ${stateName}`;
      label.x = nextX;
      label.y = -LABEL_HEIGHT;
      targetPage.appendChild(label);

      // ── Main page frame ───────────────────────────────────────────
      const pageFrame = figma.createFrame();
      pageFrame.name = stateName;
      pageFrame.resize(vpWidth, vpHeight);
      pageFrame.x = nextX;
      pageFrame.y = 0;
      pageFrame.clipsContent = true;
      targetPage.appendChild(pageFrame);

      // Background: match extracted root background or default white
      let rootBg: { r: number; g: number; b: number } | null = null;
      if (tree?.styles?.backgroundColor) {
        rootBg = colorToFigma(tree.styles.backgroundColor);
      }

      if (rootBg) {
        pageFrame.fills = [
          {
            type: 'SOLID',
            color: rootBg,
            opacity: getOpacity(tree!.styles.backgroundColor, 1),
          },
        ];
      } else {
        pageFrame.fills = [{ type: 'SOLID', color: Colors.WHITE }];
      }

      // ── Render children ───────────────────────────────────────────
      const rootRect = {
        x: tree?.x ?? 0,
        y: tree?.y ?? 0,
      };

      if (tree && 'children' in tree) {
        const frameTree = tree as FrameDomNode;
        if (frameTree.children) {
          for (const child of frameTree.children) {
            await createFigmaNode(child, pageFrame, rootRect, false);
          }
        }
      }

      // ── Post-process: propagate scroll unroll ─────────────────────
      propagateScrollUnroll(pageFrame, pageFrame);

      // ── Grow page frame if children exceed viewport ───────────────
      let maxChildBottom = vpHeight;
      for (const child of pageFrame.children) {
        const childBottom = child.y + child.height;
        if (childBottom > maxChildBottom) {
          maxChildBottom = childBottom;
        }
      }

      if (maxChildBottom > vpHeight) {
        pageFrame.resize(vpWidth, maxChildBottom);
        pageFrame.clipsContent = false;

        // ── Viewport fold marker ──────────────────────────────────
        const vpFoldLine = figma.createLine();
        vpFoldLine.name = 'Viewport fold';
        vpFoldLine.resize(vpWidth, 0);
        vpFoldLine.strokes = [
          {
            type: 'SOLID',
            color: Colors.VIEWPORT_FOLD_LINE,
            opacity: VIEWPORT_FOLD_OPACITY,
          },
        ];
        vpFoldLine.strokeWeight = 2;
        vpFoldLine.dashPattern = [...VIEWPORT_FOLD_DASH];
        pageFrame.appendChild(vpFoldLine);
        vpFoldLine.x = 0;
        vpFoldLine.y = vpHeight;

        await ensureFont('Inter', 'Semi Bold');

        const vpFoldLabel = figma.createText();
        vpFoldLabel.fontName = { family: 'Inter', style: 'Semi Bold' };
        vpFoldLabel.fontSize = 12;
        vpFoldLabel.characters = `Viewport fold (${vpWidth} × ${vpHeight})`;
        vpFoldLabel.fills = [
          {
            type: 'SOLID',
            color: Colors.VIEWPORT_FOLD_LABEL,
            opacity: VIEWPORT_FOLD_OPACITY,
          },
        ];
        vpFoldLabel.textAutoResize = 'WIDTH_AND_HEIGHT';
        vpFoldLabel.name = 'Viewport fold label';
        pageFrame.appendChild(vpFoldLabel);
        vpFoldLabel.x = vpWidth - 200;
        vpFoldLabel.y = vpHeight - 18;
      }

      // ── Scroll into view & report success ─────────────────────────
      figma.viewport.scrollAndZoomIntoView([pageFrame]);

      figma.ui.postMessage({
        type: 'import-done',
        name,
        stateName,
        nodeCount: getNodeCount(),
      });

      figma.notify(
        `Imported "${name} / ${stateName}" — ${getNodeCount()} layers`,
      );
    } catch (error) {
      console.error('Import error:', error);
      figma.ui.postMessage({
        type: 'import-error',
        message: String(error),
      });
    }
  }
};
