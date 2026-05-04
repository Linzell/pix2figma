/**
 * @pix2figma/vite-plugin — Server middleware
 *
 * Creates Connect-compatible middleware that handles the /__figma/* endpoints.
 *
 * Endpoints:
 *   GET  /__figma/health     — health check
 *   POST /__figma/dom        — receive & store an extraction
 *   GET  /__figma/dom        — return the latest extraction
 *   GET  /__figma/dom/:id    — return a specific extraction by id
 *   GET  /__figma/screens    — list all stored extractions (with cached node counts)
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DomNode } from '@pix2figma/extractor';
import { validatePermit } from '@pix2figma/extractor';
import type { PermitValidationResult } from '@pix2figma/extractor';
import type {
  StoredExtractionWithCount,
  ExtractionSummary,
  ResolvedOptions,
} from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Count all nodes in a DomNode tree. Computed once at POST time.
 */
function countNodes(node: unknown): number {
  if (!node || typeof node !== 'object') return 0;
  let count = 1;
  const n = node as Record<string, unknown>;
  if (Array.isArray(n.children)) {
    for (const child of n.children) {
      count += countNodes(child);
    }
  }
  return count;
}

/**
 * Validate that a request Origin header is from localhost.
 * Accepts http://localhost:*, http://127.0.0.1:*, http://[::1]:*.
 */
const LOCALHOST_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

function isLocalhostOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // same-origin requests have no Origin header
  return LOCALHOST_ORIGIN_RE.test(origin);
}

function setCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  // Figma plugin UI runs in a sandboxed iframe with origin "null" (string literal).
  // Allow it alongside localhost origins.
  if (!origin || origin === 'null' || isLocalhostOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * Read the full request body with a size limit.
 * Rejects if the body exceeds `maxBytes`.
 */
function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];

    req.on('error', (err) => reject(err));

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(new Error(`Body exceeds maximum size of ${maxBytes} bytes`));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });
  });
}

// ─── Extraction Store ─────────────────────────────────────────────────────

/**
 * Bounded extraction store backed by a Map.
 *
 * Evicts the oldest entry (by timestamp, not Map insertion order)
 * when the map exceeds `maxSize`. A separate `latestId` field tracks
 * the most recently POSTed extraction so we don't rely on Map
 * insertion order for "latest".
 */
class ExtractionStore {
  private readonly map = new Map<string, StoredExtractionWithCount>();
  private readonly maxSize: number;
  private latestId: string | null = null;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get size(): number {
    return this.map.size;
  }

  get(id: string): StoredExtractionWithCount | undefined {
    return this.map.get(id);
  }

  getLatest(): StoredExtractionWithCount | undefined {
    if (!this.latestId) return undefined;
    return this.map.get(this.latestId);
  }

  set(id: string, extraction: StoredExtractionWithCount): void {
    this.map.set(id, extraction);
    this.latestId = id;
    this.evictIfNeeded();
  }

  list(): ExtractionSummary[] {
    return Array.from(this.map.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((e) => ({
        id: e.id,
        pageName: e.pageName,
        stateName: e.stateName,
        timestamp: e.timestamp,
        viewport: e.viewport,
        nodeCount: e.nodeCount,
      }));
  }

  /**
   * Evict the oldest entries (by timestamp) until we're within bounds.
   */
  private evictIfNeeded(): void {
    while (this.map.size > this.maxSize) {
      let oldestId: string | null = null;
      let oldestTs = Infinity;

      for (const [id, ext] of this.map) {
        if (ext.timestamp < oldestTs) {
          oldestTs = ext.timestamp;
          oldestId = id;
        }
      }

      if (oldestId) {
        this.map.delete(oldestId);
        // If we evicted the latest, find the new latest by timestamp
        if (this.latestId === oldestId) {
          this.latestId = null;
          let newestTs = 0;
          for (const [id, ext] of this.map) {
            if (ext.timestamp > newestTs) {
              newestTs = ext.timestamp;
              this.latestId = id;
            }
          }
        }
      } else {
        break; // safety: shouldn't happen
      }
    }
  }
}

// ─── Middleware factory ───────────────────────────────────────────────────

type NextFn = (err?: unknown) => void;
type Middleware = (req: IncomingMessage, res: ServerResponse, next: NextFn) => void;

/**
 * Create the Connect-compatible middleware that handles all /__figma/* routes.
 */
export function createFigmaMiddleware(options: ResolvedOptions): Middleware {
  const store = new ExtractionStore(options.maxExtractions);

  return (req: IncomingMessage, res: ServerResponse, next: NextFn) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const pathname = url.pathname;

    // Only handle /__figma/* routes
    if (!pathname.startsWith('/__figma')) {
      next();
      return;
    }

    // ── CORS ────────────────────────────────────────────────────────
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // ── GET /__figma/health ─────────────────────────────────────────
    if (pathname === '/__figma/health' && req.method === 'GET') {
      sendJson(res, 200, {
        status: 'ok',
        extractions: store.size,
      });
      return;
    }

    // ── GET /__figma/screens ────────────────────────────────────────
    if (pathname === '/__figma/screens' && req.method === 'GET') {
      sendJson(res, 200, store.list());
      return;
    }

    // ── POST /__figma/dom ───────────────────────────────────────────
    if (pathname === '/__figma/dom' && req.method === 'POST') {
      readBody(req, options.maxBodySize)
        .then((body) => {
          const data = JSON.parse(body);

          const id =
            data.id ||
            data.pageName?.toLowerCase().replace(/\s+/g, '-') ||
            `page-${Date.now()}`;

          const tree = data.tree as DomNode;
          const nodeCount = countNodes(tree);

          const extraction: StoredExtractionWithCount = {
            id,
            pageName: data.pageName || data.name || id,
            stateName: data.stateName || 'Default',
            timestamp: Date.now(),
            viewport: data.viewport || { width: 1440, height: 900 },
            tree,
            nodeCount,
          };

          store.set(id, extraction);

          // Run Kiiwi Design System permit validation on the extraction
          let permitResult: PermitValidationResult | undefined;
          try {
            permitResult = validatePermit(tree);
            if (!permitResult.valid || permitResult.warnings.length > 0) {
              console.warn(
                `[pix2figma] Permit validation for "${extraction.pageName}": ${permitResult.summary}`,
              );
            } else {
              console.log(
                `[pix2figma] Permit validation passed for "${extraction.pageName}"`,
              );
            }
          } catch (err) {
            // Non-fatal: permit validation should never block extraction storage
            console.warn('[pix2figma] Permit validation error:', err);
          }

          console.log(
            `[pix2figma] Stored extraction: "${extraction.pageName}" / "${extraction.stateName}" (${nodeCount} nodes)`,
          );

          sendJson(res, 200, {
            ok: true,
            id,
            nodeCount,
            permit: permitResult
              ? {
                  valid: permitResult.valid,
                  violationCount: permitResult.violationCount,
                  errorCount: permitResult.errors.length,
                  warningCount: permitResult.warnings.length,
                  summary: permitResult.summary,
                  errors: permitResult.errors,
                  warnings: permitResult.warnings,
                }
              : undefined,
          });
        })
        .catch((err: Error) => {
          const isBodyTooLarge = err.message.includes('exceeds maximum size');
          sendJson(res, isBodyTooLarge ? 413 : 400, {
            error: err.message,
          });
        });
      return;
    }

    // ── GET /__figma/dom — latest or by ?id= ────────────────────────
    if (pathname === '/__figma/dom' && req.method === 'GET') {
      const id = url.searchParams.get('id');

      if (id) {
        const ext = store.get(id);
        if (!ext) {
          sendJson(res, 404, { error: 'Not found' });
          return;
        }
        sendJson(res, 200, ext);
        return;
      }

      // Return latest
      const latest = store.getLatest();
      if (!latest) {
        sendJson(res, 404, { error: 'No extractions yet' });
        return;
      }
      sendJson(res, 200, latest);
      return;
    }

    // ── GET /__figma/dom/:id ────────────────────────────────────────
    const domByIdMatch = pathname.match(/^\/__figma\/dom\/(.+)$/);
    if (domByIdMatch && req.method === 'GET') {
      const id = decodeURIComponent(domByIdMatch[1]);
      const ext = store.get(id);
      if (!ext) {
        sendJson(res, 404, { error: 'Not found' });
        return;
      }
      sendJson(res, 200, ext);
      return;
    }

    // Not a recognised /__figma route
    next();
  };
}
