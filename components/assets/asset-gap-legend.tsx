"use client";

// The gap chart's legend (rails-ops reference/asset-key-map.md, "The
// spread"; anatomy A3.1; ui-jobs 818): a row per other line at the legends'
// moment, its key, oracle and readers, its price, and its gap from the main
// line ("–" with the dash's reason where the two do not compare then). A line
// that passes SPREAD_LIMIT names its largest gap under its row, and that gap
// puts the cursor there; a Maker OSM line's gap names the hour's delay that
// causes it (Miles, 26 Oct 2026), and so does the heading where the main line
// is one (`?via=makerdao`). A row hovered or focused lights its line; pressed,
// it hides the line and shows it again. Where no line passes, one line under
// the rows says so.

import type { ReactNode } from "react";
import { formatDate } from "@/lib/date";
import { formatPrice } from "@/lib/shared/flows-price";
import { delayedLine, lineReaders, type PageLine } from "@/lib/shared/asset-roster";
import {
  dashTitle,
  fmtSignedSpread,
  fmtSpread,
  SPREAD_LIMIT,
  type DashReason,
  type LineSpread,
} from "@/lib/shared/asset-spread";
import { roundTime } from "@/components/assets/round-time";

const DAY_MS = 86_400_000;
const dayDate = (day: number) => formatDate(new Date(day * DAY_MS));

export interface GapRow {
  line: PageLine;
  spread: LineSpread;
  /** The line's price at the moment, null where it has none. */
  price: number | null;
  /** Its gap from the main line then, a fraction; null where the two do not compare. */
  gap: number | null;
  reason: DashReason;
  /** The legend's slot and dash, for the checks. */
  slot: number | string;
  dash: string;
}

export function AssetGapLegend({
  main,
  rows,
  stamp,
  onJump,
  keyOf,
  rowHover,
  lit,
  hidden,
  toggle,
  light,
  showAll,
  usual,
}: {
  main: PageLine;
  rows: GapRow[];
  /** The moment in words. */
  stamp: string | null;
  onJump: (day: number, ts?: number) => void;
  keyOf: (lineId: string) => ReactNode;
  rowHover: (lineId: string) => {
    onPointerEnter: (e: React.PointerEvent) => void;
    onPointerLeave: (e: React.PointerEvent) => void;
  };
  lit: string | null;
  hidden: ReadonlySet<string>;
  toggle: (lineId: string) => void;
  light: (lineId: string | null, by: "row") => void;
  showAll: () => void;
  /** The line most protocols read, where the main line is a protocol's. */
  usual: string | null;
}) {
  if (rows.length === 0) return null;
  const limit = fmtSpread(SPREAD_LIMIT);
  const mainName = main.oracle.name;
  const compared = rows.filter((o) => o.spread.largest != null);
  const apart = rows.length - compared.length;
  const loud = rows.some((o) => o.spread.passes);
  // Two lines with one set of readers are told apart by their oracle.
  const labels = rows.map((o) => lineReaders(o.line));
  const label = (i: number) =>
    labels.filter((l) => l === labels[i]).length > 1 ? `${labels[i]} (${rows[i].line.oracle.name})` : labels[i];
  const when = (g: NonNullable<LineSpread["largest"]>) => (g.ts != null ? roundTime(g.ts) : dayDate(g.day));
  const n = compared.length;
  return (
    <div className="mb-2 text-xs" data-asset-spread={loud ? "loud" : "quiet"} data-anatomy="A3.1">
      <div className="flex items-baseline justify-between gap-3 text-rb-500">
        <span>
          {loud &&
            `A gap past ${limit} from ${mainName}${delayedLine(main) ? ", an hour-delayed price," : ""} is named under its line`}
        </span>
        {stamp && (
          <span className="shrink-0 tabular-nums" data-asset-gap-stamp="">
            {stamp}
          </span>
        )}
      </div>
      <ul className="mt-1 space-y-0.5" data-asset-lw-legend="">
        {rows.map((o, i) => {
          const id = o.line.id;
          const off = hidden.has(id);
          const big = o.spread.passes ? o.spread.largest : null;
          const cause = delayedLine(o.line) ? ", an hour-delayed price," : "";
          const name = o.line.oracle.name;
          const readers = lineReaders(o.line);
          return (
            <li
              key={id}
              className={`transition-opacity ${(lit != null && lit !== id) || off ? "opacity-50" : ""}`}
              data-asset-lw-line={id}
              data-asset-lw-slot={o.slot}
              data-asset-lw-dash={o.dash}
              data-asset-lw-hidden={off ? "" : undefined}
              data-asset-lw-lit={lit === id ? "" : undefined}
              data-asset-spread-line={id}
              data-asset-spread-lit={lit === id ? "" : undefined}
              data-asset-spread-gap={big ? big.dev : undefined}
              data-asset-spread-delayed={cause ? "" : undefined}
              {...rowHover(id)}
            >
              <div className="flex items-baseline gap-3">
                <button
                  type="button"
                  aria-pressed={!off}
                  aria-label={`Show ${name}, ${readers}`}
                  title={off ? "Show this line" : "Hide this line"}
                  onClick={() => toggle(id)}
                  onFocus={() => light(id, "row")}
                  onBlur={() => light(null, "row")}
                  className="flex min-w-0 flex-1 items-baseline justify-between gap-3 rounded px-1 text-left hover:bg-[var(--surface-hover)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--rb-500)]"
                >
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    {keyOf(id)}
                    <span className="min-w-0 text-rb-500">
                      <span className="text-foreground">{name}</span> · {readers}
                      {usual === id && " · most read"}
                      {o.spread.largest == null && " · never read within ten minutes of it"}
                      {off && " · hidden"}
                    </span>
                  </span>
                  <span className="shrink-0 text-rb-500 tabular-nums" data-asset-lw-value={o.price ?? ""}>
                    {o.price == null ? "–" : formatPrice(o.price, "USD")}
                  </span>
                </button>
                <span
                  className={`w-16 shrink-0 text-right tabular-nums ${o.gap != null && Math.abs(o.gap) > SPREAD_LIMIT ? "text-[var(--caution)]" : "text-rb-500"}`}
                  data-asset-spread-at={o.gap ?? ""}
                  title={o.gap == null ? dashTitle(o.reason, mainName) : undefined}
                >
                  {o.gap == null ? "–" : fmtSignedSpread(o.gap)}
                </span>
              </div>
              {big && (
                <button
                  type="button"
                  className="ml-6 text-left text-foreground hover:underline"
                  onClick={() => onJump(big.day, big.ts)}
                  title="Put the cursor on this gap"
                  data-asset-spread-jump=""
                >
                  {label(i)}
                  {cause} {fmtSpread(big.dev)} {big.dev > 0 ? "above" : "below"} {mainName}, {when(big)}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {hidden.size > 0 && (
        <button
          type="button"
          onClick={showAll}
          className="mt-1 px-1 text-rb-500 underline-offset-2 hover:text-foreground hover:underline"
          data-asset-lw-show-all=""
        >
          Show all lines
        </button>
      )}
      {!loud && (
        <p className="mt-1 px-1 text-rb-500" data-asset-spread-quiet="">
          {n === 0
            ? `No other line was read within ten minutes of ${mainName} on any day.`
            : `${n === 1 ? "The other line agrees" : `The ${n} other lines agree`} with ${mainName} within ${limit}${
                apart > 0 ? `; ${apart} more ${apart === 1 ? "was" : "were"} never read within ten minutes of it` : ""
              }.`}
        </p>
      )}
    </div>
  );
}
