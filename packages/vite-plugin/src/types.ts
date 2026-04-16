/**
 * @pix2figma/vite-plugin — Types
 *
 * Re-exports shared types from @pix2figma/extractor and defines
 * any vite-plugin-specific types.
 */

export type {
  Pix2FigmaOptions,
  StoredExtraction,
  DomNode,
  Viewport,
  ExtractionResult,
} from '@pix2figma/extractor';

// ─── Server-internal types ────────────────────────────────────────────────

/**
 * A stored extraction enriched with a pre-computed node count.
 * The node count is calculated once at POST time, not on every GET.
 */
export interface StoredExtractionWithCount {
  id: string;
  pageName: string;
  stateName: string;
  timestamp: number;
  tree: import('@pix2figma/extractor').DomNode;
  viewport: import('@pix2figma/extractor').Viewport;
  /** Pre-computed at POST time */
  nodeCount: number;
}

/**
 * Summary returned by GET /__figma/screens
 */
export interface ExtractionSummary {
  id: string;
  pageName: string;
  stateName: string;
  timestamp: number;
  viewport: import('@pix2figma/extractor').Viewport;
  nodeCount: number;
}

/**
 * Resolved options with defaults applied.
 */
export interface ResolvedOptions {
  maxExtractions: number;
  maxBodySize: number;
  excludeSelectors: string[];
}
