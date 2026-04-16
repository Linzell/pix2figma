/**
 * @pix2figma/figma-plugin — Local type re-exports
 *
 * Re-exports the shared extractor types consumed by the Figma plugin helpers.
 * Keeps imports short across the helpers/ directory.
 */

export type {
  ParsedColor,
  GradientStop,
  ParsedGradient,
  ParsedShadow,
  ParsedBorder,
  ParsedBorderRadius,
  FlexLayout,
  GridLayout,
  LayoutInfo,
  ScrollInfo,
  Padding,
  ExtractedStyles,
  DomNodeType,
  BaseDomNode,
  TextDomNode,
  FrameDomNode,
  InputDomNode,
  ImageDomNode,
  SvgDomNode,
  DomNode,
  Viewport,
  ExtractionResult,
  StoredExtraction,
} from '@pix2figma/extractor';
