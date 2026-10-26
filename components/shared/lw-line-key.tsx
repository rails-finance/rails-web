"use client";

// A chart's line keys and the state that picks a line out (rails-ops
// reference/asset-key-map.md, "Colour and the legend"): the key a legend row
// draws (its line's colour and dash, `lib/shared/chart-series-style.ts`), and
// which line is lit (a row hovered or focused, or the line nearest the cursor)
// and which are hidden. The asset chart takes it; the position chart can.

import { useCallback, useMemo, useState } from "react";
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

export interface LineFocus {
  /** The lit line, and what lit it. */
  lit: { id: string; by: "row" | "chart" } | null;
  hidden: ReadonlySet<string>;
  light: (id: string | null, by: "row" | "chart") => void;
  toggle: (id: string) => void;
  showAll: () => void;
}

/** Which line is lit and which are hidden; `fixed` (the main line) never hides. */
export function useLineFocus(fixed: string | null): LineFocus {
  const [lit, setLit] = useState<LineFocus["lit"]>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const light = useCallback(
    (id: string | null, by: "row" | "chart") =>
      setLit((cur) => {
        if (id == null) return cur && cur.by === by ? null : cur;
        return cur?.id === id && cur.by === by ? cur : { id, by };
      }),
    [],
  );
  const toggle = useCallback(
    (id: string) => {
      if (id === fixed) return;
      setHidden((cur) => {
        const next = new Set(cur);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [fixed],
  );
  const showAll = useCallback(() => setHidden(new Set()), []);
  return useMemo(() => ({ lit, hidden, light, toggle, showAll }), [lit, hidden, light, toggle, showAll]);
}
