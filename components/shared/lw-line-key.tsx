"use client";

// A chart's line key (rails-ops reference/asset-key-map.md, "Colour and the
// legend"): the key a legend row draws, its line's colour and dash
// (`lib/shared/chart-series-style.ts`).

import { SVG_DASH, type SeriesDash } from "@/lib/shared/chart-series-style";

/** A row's key: a 14 px stroke in the line's colour and dash. */
export function LineKey({
  color,
  dash = "solid",
  main = false,
  quiet = false,
}: {
  color: string;
  dash?: SeriesDash;
  main?: boolean;
  /** A retired line, drawn quieter. */
  quiet?: boolean;
}) {
  return (
    <svg aria-hidden width={14} height={6} className="shrink-0 self-center overflow-visible" data-line-key="">
      <line
        x1={0}
        x2={14}
        y1={3}
        y2={3}
        stroke={color}
        strokeWidth={main ? 2.5 : 1.75}
        strokeDasharray={SVG_DASH[dash]}
        strokeOpacity={quiet ? 0.5 : 1}
      />
    </svg>
  );
}
