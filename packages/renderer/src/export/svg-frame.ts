const SVG_PADDING = 18;

export type SvgBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const getSvgFrame = (bounds: SvgBounds) => ({
  width: bounds.width + SVG_PADDING * 2,
  height: bounds.height + SVG_PADDING * 2,
  offsetX: SVG_PADDING - bounds.x,
  offsetY: SVG_PADDING - bounds.y,
});
