/**
 * @pix2figma/figma-plugin — Font helpers
 *
 * Maps CSS font metadata to the nearest Figma-available font and handles
 * async font loading with automatic fallback to Inter Regular.
 */

declare const figma: any;

// ─── Font loading cache ───────────────────────────────────────────────────

/**
 * Tracks which `family::style` combinations have already been loaded
 * to avoid redundant `figma.loadFontAsync` calls.
 */
const loadedFonts = new Map<string, boolean>();

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Maps a CSS `font-family` stack to a Figma-available font family.
 *
 * Falls back to `"Inter"` for unknown families — the closest cross-platform
 * equivalent of most system UI fonts.
 *
 * @param family - Raw CSS font-family value (may contain multiple comma-separated families).
 * @returns A single Figma font family name.
 */
export function mapFontFamily(family: string): string {
  if (!family) return 'Inter';

  const f = family.toLowerCase();

  if (f.includes('mono') || f.includes('courier')) return 'Roboto Mono';
  if (f.includes('system-ui') || f.includes('-apple-system') || f.includes('sans-serif')) return 'Inter';
  if (f.includes('inter')) return 'Inter';
  if (f.includes('arial') || f.includes('helvetica')) return 'Inter';
  if (f.includes('georgia') || f.includes('serif')) return 'Roboto Slab';

  return 'Inter';
}

/**
 * Maps a CSS `font-weight` (numeric or string) to a Figma font style name.
 *
 * @param weight - CSS weight value (`"400"`, `"bold"`, etc.).
 * @returns Figma font style string (`"Regular"`, `"Bold"`, etc.).
 */
export function mapFontWeight(weight: string): string {
  const w = parseInt(weight, 10);
  if (Number.isNaN(w)) return 'Regular';

  if (w <= 100) return 'Thin';
  if (w <= 200) return 'Extra Light';
  if (w <= 300) return 'Light';
  if (w <= 400) return 'Regular';
  if (w <= 500) return 'Medium';
  if (w <= 600) return 'Semi Bold';
  if (w <= 700) return 'Bold';
  if (w <= 800) return 'Extra Bold';
  return 'Black';
}

/**
 * Maps a CSS `text-align` value to the Figma `TextAlignHorizontal` enum.
 *
 * @param align - CSS text-align value.
 * @returns Figma alignment constant.
 */
export function mapTextAlign(
  align: string,
): 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED' {
  switch (align) {
    case 'center':
      return 'CENTER';
    case 'right':
      return 'RIGHT';
    case 'justify':
      return 'JUSTIFIED';
    default:
      return 'LEFT';
  }
}

/**
 * Loads a font asynchronously, falling back to `Inter Regular` on failure.
 *
 * Results are cached — calling this multiple times with the same
 * `family`/`style` pair is essentially free after the first load.
 *
 * @param family - Figma font family name (e.g. `"Inter"`).
 * @param style  - Figma font style name (e.g. `"Bold"`).
 * @returns `true` if the requested font was loaded, `false` if the fallback
 *          was used instead.
 */
export async function ensureFont(
  family: string,
  style: string,
): Promise<boolean> {
  const key = `${family}::${style}`;

  if (loadedFonts.has(key)) return true;

  try {
    await figma.loadFontAsync({ family, style });
    loadedFonts.set(key, true);
    return true;
  } catch {
    // Requested font unavailable — fall back to Inter Regular
    if (family !== 'Inter' || style !== 'Regular') {
      try {
        await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
        loadedFonts.set('Inter::Regular', true);
      } catch {
        // Nothing more we can do
      }
    }
    return false;
  }
}
