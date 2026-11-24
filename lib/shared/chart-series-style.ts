// A chart line's dash, as a legend key draws it (rails-ops
// reference/asset-key-map.md, "Colour and the legend"). Pure, and imports
// nothing.

export const DASHES = ["solid", "dashed", "dotted", "long"] as const;
export type SeriesDash = (typeof DASHES)[number];
/** An SVG key's stroke-dasharray for each dash, at a 1.5 px stroke. */
export const SVG_DASH: Record<SeriesDash, string | undefined> = {
  solid: undefined,
  dashed: "3 2",
  dotted: "1 2",
  long: "6 2",
};
