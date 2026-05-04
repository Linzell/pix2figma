/**
 * @pix2figma/extractor — Permit validation tests
 *
 * Tests the Kiiwi Design System permit validation against the Permis Design Avancé rules.
 * Run with: bun test packages/extractor/src/permit.test.ts
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { validatePermit, loadKiiwiTokens } from './permit';
import type {
  DomNode,
  FrameDomNode,
  TextDomNode,
  ParsedColor,
} from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeColor(hex: string, opacity = 1): ParsedColor {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return { hex, r, g, b, opacity };
}

function makeFrame(overrides: Partial<FrameDomNode> = {}): FrameDomNode {
  return {
    type: 'frame',
    tag: 'div',
    x: 0,
    y: 0,
    width: 800,
    height: 600,
    styles: {},
    ...overrides,
  };
}

function makeText(text: string, overrides: Partial<TextDomNode> = {}): TextDomNode {
  return {
    type: 'text',
    tag: 'p',
    text,
    x: 0,
    y: 0,
    width: 200,
    height: 24,
    styles: {},
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('Permit Validation — Spacing', () => {
  test('valid 4px scale spacing passes', () => {
    const tree = makeFrame({
      styles: {
        padding: { top: 8, right: 16, bottom: 8, left: 16 },
        layout: { mode: 'flex', direction: 'row', wrap: 'nowrap', justifyContent: 'flex-start', alignItems: 'center', gap: 12, rowGap: 0, columnGap: 0 },
      },
    });

    const result = validatePermit(tree);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('non-4px padding is flagged as error', () => {
    const tree = makeFrame({
      styles: {
        padding: { top: 13, right: 16, bottom: 25, left: 16 },
      },
    });

    const result = validatePermit(tree);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);

    const paddingErrors = result.errors.filter(e => e.category === 'non_4px_spacing');
    const values = paddingErrors.map(e => e.value);
    expect(values).toContain(13);
    expect(values).toContain(25);
  });

  test('non-4px layout gap is flagged as error', () => {
    const tree = makeFrame({
      styles: {
        layout: { mode: 'flex', direction: 'row', wrap: 'nowrap', justifyContent: 'flex-start', alignItems: 'center', gap: 10, rowGap: 0, columnGap: 14 },
      },
    });

    const result = validatePermit(tree);
    expect(result.valid).toBe(false);

    const gapErrors = result.errors.filter(e => e.category === 'non_4px_spacing');
    const values = gapErrors.map(e => e.value);
    expect(values).toContain(10); // Tailwind 2.5
    expect(values).toContain(14); // Tailwind 3.5
  });

  test('zero spacing is allowed', () => {
    const tree = makeFrame({
      styles: {
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        layout: { mode: 'flex', direction: 'row', wrap: 'nowrap', justifyContent: 'flex-start', alignItems: 'center', gap: 0, rowGap: 0, columnGap: 0 },
      },
    });

    const result = validatePermit(tree);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('suggestion provides nearest 4px value', () => {
    const tree = makeFrame({
      styles: {
        padding: { top: 13, right: 0, bottom: 0, left: 0 },
      },
    });

    const result = validatePermit(tree);
    const error = result.errors.find(e => e.value === 13);
    expect(error?.suggestion).toContain('12px');
  });
});

describe('Permit Validation — Colors', () => {
  beforeEach(() => {
    // Load some known Kiiwi tokens for testing
    loadKiiwiTokens(['#111827', '#4b5563', '#ffffff', '#1a56db', '#dc2626']);
  });

  test('Kiiwi token colors pass', () => {
    const tree = makeFrame({
      styles: {
        backgroundColor: makeColor('#ffffff'),
        color: makeColor('#111827'),
      },
    });

    const result = validatePermit(tree);
    expect(result.valid).toBe(true);
  });

  test('non-Kiiwi hex color is flagged (default: warning)', () => {
    const tree = makeFrame({
      styles: {
        backgroundColor: makeColor('#ff6b6b'), // Not a Kiiwi token
      },
    });

    const result = validatePermit(tree);
    const colorViolations = result.warnings.filter(v => v.category === 'non_kiiwi_color');
    expect(colorViolations.length).toBeGreaterThanOrEqual(1);
    expect(colorViolations[0].value).toBe('#ff6b6b');
  });

  test('non-Kiiwi hex color as error when configured', () => {
    const tree = makeFrame({
      styles: {
        backgroundColor: makeColor('#ff6b6b'),
      },
    });

    const result = validatePermit(tree, { unknownColorSeverity: 'error' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.category === 'non_kiiwi_color')).toBe(true);
  });

  test('border color is validated', () => {
    const tree = makeFrame({
      styles: {
        border: { width: 1, color: makeColor('#ff0000'), style: 'solid' },
      },
    });

    const result = validatePermit(tree);
    const borderViolations = result.warnings.filter(v => v.category === 'non_kiiwi_color' && v.message.includes('Border'));
    expect(borderViolations.length).toBeGreaterThan(0);
  });
});

describe('Permit Validation — UX Writing', () => {
  test('clean text passes', () => {
    const tree = makeFrame({
      children: [makeText('Votre agenda est synchronisé.')],
    });

    const result = validatePermit(tree);
    expect(result.warnings.filter(w => w.category === 'ux_writing_violation')).toHaveLength(0);
  });

  test('exclamation mark is flagged', () => {
    const tree = makeFrame({
      children: [makeText('Bienvenue !')],
    });

    const result = validatePermit(tree);
    const writingViolations = result.warnings.filter(w => w.category === 'ux_writing_violation');
    expect(writingViolations.some(v => v.message.includes('exclamation'))).toBe(true);
  });

  test('ellipsis is flagged', () => {
    const tree = makeFrame({
      children: [makeText('Chargement en cours...')],
    });

    const result = validatePermit(tree);
    const writingViolations = result.warnings.filter(w => w.category === 'ux_writing_violation');
    expect(writingViolations.some(v => v.message.includes('ellips'))).toBe(true);
  });

  test('ampersand is flagged', () => {
    const tree = makeFrame({
      children: [makeText('Consultation & Suivi')],
    });

    const result = validatePermit(tree);
    const writingViolations = result.warnings.filter(w => w.category === 'ux_writing_violation');
    expect(writingViolations.some(v => v.message.includes('ampersand'))).toBe(true);
  });

  test('RDV abbreviation is flagged', () => {
    const tree = makeFrame({
      children: [makeText('Prendre RDV')],
    });

    const result = validatePermit(tree);
    const writingViolations = result.warnings.filter(w => w.category === 'ux_writing_violation');
    expect(writingViolations.some(v => v.message.includes('RDV'))).toBe(true);
  });

  test('ALL CAPS is flagged', () => {
    const tree = makeFrame({
      children: [makeText('CONFIRMER VOTRE RENDEZ-VOUS')],
    });

    const result = validatePermit(tree);
    const writingViolations = result.warnings.filter(w => w.category === 'ux_writing_violation');
    expect(writingViolations.some(v => v.message.includes('CAPS'))).toBe(true);
  });

  test('allowed acronyms are not flagged', () => {
    const tree = makeFrame({
      children: [makeText('Télécharger le PDF')],
    });

    const result = validatePermit(tree);
    const capsViolations = result.warnings.filter(
      w => w.category === 'ux_writing_violation' && w.message.includes('CAPS')
    );
    expect(capsViolations).toHaveLength(0);
  });

  test('passive voice is flagged', () => {
    const tree = makeFrame({
      children: [makeText('La confirmation a été envoyée.')],
    });

    const result = validatePermit(tree);
    const writingViolations = result.warnings.filter(w => w.category === 'ux_writing_violation');
    expect(writingViolations.some(v => v.message.includes('passive'))).toBe(true);
  });

  test('embedded text in frame is validated', () => {
    const tree = makeFrame({
      embeddedText: 'Attention ! Erreur survenue...',
    });

    const result = validatePermit(tree);
    const writingViolations = result.warnings.filter(w => w.category === 'ux_writing_violation');
    expect(writingViolations.length).toBeGreaterThanOrEqual(2); // ! and ...
  });
});

describe('Permit Validation — Combined', () => {
  test('complex tree with multiple violations', () => {
    const tree = makeFrame({
      styles: {
        padding: { top: 13, right: 8, bottom: 8, left: 8 },
        backgroundColor: makeColor('#ff6b6b'),
      },
      children: [
        makeText('ATTENTION ! Veuillez patienter...'),
        makeFrame({
          styles: {
            layout: { mode: 'flex', direction: 'row', wrap: 'nowrap', justifyContent: 'flex-start', alignItems: 'center', gap: 7, rowGap: 0, columnGap: 0 },
          },
        }),
      ],
    });

    const result = validatePermit(tree, { unknownColorSeverity: 'error' });

    // Should have spacing errors (13px padding, 7px gap)
    expect(result.errors.filter(e => e.category === 'non_4px_spacing').length).toBeGreaterThanOrEqual(2);

    // Should have color error (#ff6b6b)
    expect(result.errors.some(e => e.category === 'non_kiiwi_color')).toBe(true);

    // Should have writing warnings (!, ..., CAPS)
    expect(result.warnings.filter(w => w.category === 'ux_writing_violation').length).toBeGreaterThanOrEqual(3);

    expect(result.valid).toBe(false);
  });

  test('clean complex tree passes', () => {
    loadKiiwiTokens(['#111827', '#ffffff']);

    const tree = makeFrame({
      styles: {
        padding: { top: 16, right: 24, bottom: 16, left: 24 },
        backgroundColor: makeColor('#ffffff'),
        color: makeColor('#111827'),
        layout: { mode: 'flex', direction: 'column', wrap: 'nowrap', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 12, rowGap: 0, columnGap: 0 },
      },
      children: [
        makeText('Votre rendez-vous est confirmé.'),
        makeText('Vous recevrez un rappel avant la consultation.'),
      ],
    });

    const result = validatePermit(tree);
    expect(result.valid).toBe(true);
    expect(result.summary).toContain('passes all');
  });
});

describe('Permit Validation — Configuration', () => {
  test('can disable individual checks', () => {
    const tree = makeFrame({
      styles: {
        padding: { top: 13, right: 0, bottom: 0, left: 0 },
      },
      children: [makeText('Attention !')],
    });

    const result = validatePermit(tree, {
      validateSpacing: false,
      validateWriting: false,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('summary format for clean tree', () => {
    const tree = makeFrame({});
    const result = validatePermit(tree);
    expect(result.summary).toContain('✅');
  });

  test('summary format for violations', () => {
    const tree = makeFrame({
      styles: {
        padding: { top: 13, right: 0, bottom: 0, left: 0 },
      },
    });
    const result = validatePermit(tree);
    expect(result.summary).toContain('⛔');
  });
});
