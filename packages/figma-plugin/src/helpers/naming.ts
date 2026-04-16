/**
 * @pix2figma/figma-plugin — Node naming
 *
 * Derives a human-readable Figma layer name from a DOM node's tag and content.
 */

import type { DomNode } from './types';

// ─── Tag → Name mapping ──────────────────────────────────────────────────

/**
 * Lookup table from HTML tags to semantic Figma layer names.
 * Headings are handled separately to include the tag level.
 */
const TAG_NAMES: Record<string, string> = {
  nav: 'Navigation',
  header: 'Header',
  footer: 'Footer',
  main: 'Main Content',
  aside: 'Sidebar',
  section: 'Section',
  article: 'Article',
  form: 'Form',
  ul: 'List',
  ol: 'List',
  li: 'List Item',
  button: 'Button',
  a: 'Link',
  label: 'Label',
  table: 'Table',
  thead: 'Table Head',
  tbody: 'Table Body',
  tr: 'Table Row',
  td: 'Table Cell',
  th: 'Table Header Cell',
  dialog: 'Dialog',
  details: 'Details',
  summary: 'Summary',
  fieldset: 'Fieldset',
  legend: 'Legend',
};

/** Heading tags that get `"Heading (hN)"` names */
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Derives a human-readable Figma layer name from a DOM node.
 *
 * Priority:
 *  1. Short text content (< 30 chars) — used as-is for quick identification.
 *  2. Semantic tag mapping (nav → "Navigation", h1-h6 → "Heading (h1)", etc.).
 *  3. Falls back to the raw HTML tag name.
 *
 * Includes `h5` / `h6` support that was missing from the original implementation.
 *
 * @param domNode - The extracted DOM node.
 * @returns A descriptive layer name.
 */
export function getNodeName(domNode: DomNode): string {
  const tag = domNode.tag || 'div';

  // Short text content makes a great layer name
  if ('text' in domNode && domNode.text && domNode.text.length < 30) {
    return domNode.text;
  }

  // Headings: "Heading (h1)" .. "Heading (h6)"
  if (HEADING_TAGS.has(tag)) {
    return `Heading (${tag})`;
  }

  // Semantic tag lookup
  return TAG_NAMES[tag] ?? tag;
}
