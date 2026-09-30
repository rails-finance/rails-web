"use client";

// <BreakdownRow> — one line of an amount breakdown: a label with an optional
// sign and swatch, a value that is one figure or before → after, each figure
// with its receipt, and the assets that make it up beneath it, open or behind
// a chevron. A highlighted row takes a tint and weight. The Lifetime flows
// panel's side sums draw with it (components/shared/lifetime-flows-tip.tsx),
// and the Aave-family event card's Collateral and Debt cells are to move onto
// it (rails-ops TO-DO-ui-jobs §213): a total with its before → after and its
// reserves beneath is a `total` row with `alwaysOpen` parts.
//
// Every row is its own four-column grid (sign, swatch, label, value) with
// fixed widths for the first two, so rows line up without a table and a
// highlight paints the whole row. Token chips beside a printed symbol are
// decorative: a copied row reads "WBTC $5,473".

import { type CSSProperties, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { TransitionArrow } from "@/components/shared/state-transition";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";

/** A figure as printed, with its receipt. */
export interface BreakdownFigure {
  text: string;
  prov?: Provenance;
  /** The receipt's value key, where it differs from the text. */
  value?: string;
}

/** One asset beneath a row: its chip and symbol, its token amount where the
 *  caller has one, and its USD. */
export interface BreakdownPart {
  symbol: string;
  /** Draw the token chip (false for a line that names no token). */
  icon?: boolean;
  amount?: BreakdownFigure;
  usd?: BreakdownFigure;
}

const ROW = "grid grid-cols-[0.75rem_1rem_minmax(0,1fr)_auto] items-center gap-x-0.5 rounded-[3px] py-0.5";

function Fig({ f, className }: { f: BreakdownFigure; className?: string }) {
  const body = <span className={className}>{f.text}</span>;
  return f.prov ? (
    <Prov info={f.prov} value={f.value}>
      {body}
    </Prov>
  ) : (
    body
  );
}

/** One figure, or before → after where the two differ. */
function Value({ value }: { value: BreakdownFigure | { before: BreakdownFigure; after: BreakdownFigure } }) {
  if (!("before" in value)) return <Fig f={value} />;
  const moved = (value.before.value ?? value.before.text) !== (value.after.value ?? value.after.text);
  return (
    <span className="inline-flex items-center gap-1">
      {moved && (
        <>
          <Fig f={value.before} className="text-rb-500" />
          <TransitionArrow size="sm" />
        </>
      )}
      <Fig f={value.after} />
    </span>
  );
}

export interface BreakdownRowProps {
  label: ReactNode;
  /** The label as words, for the chevron's name ("Show the assets in Withdrawn"). */
  name?: string;
  /** The row's key, for the parts' id and the data attributes. */
  rowKey: string;
  sign?: "" | "+" | "−";
  /** The swatch's fill; null draws the swatch's empty cell. */
  swatch?: CSSProperties | null;
  value: BreakdownFigure | { before: BreakdownFigure; after: BreakdownFigure };
  parts?: BreakdownPart[];
  /** Parts beyond those listed, counted in a closing line. */
  more?: number;
  /** Parts shown beneath the row (a total's, always; others behind the chevron). */
  open?: boolean;
  /** Draws the chevron that opens and closes the parts. */
  onToggle?: () => void;
  highlighted?: boolean;
  /** A click on the row (the chevron excepted). */
  onSelect?: () => void;
  /** The total under a rule. */
  total?: boolean;
  /** Extra attributes on the row (data-* for the verifiers). */
  attrs?: Record<string, string>;
}

export function BreakdownRow({
  label,
  name,
  rowKey,
  sign,
  swatch,
  value,
  parts = [],
  more = 0,
  open = false,
  onToggle,
  highlighted = false,
  onSelect,
  total = false,
  attrs,
}: BreakdownRowProps) {
  const partsId = `breakdown-parts-${rowKey.replace(/[^A-Za-z0-9_-]/g, "-")}`;
  const shown = open && parts.length > 0;
  return (
    <>
      <div
        className={`${ROW} ${total ? "mt-0.5 border-t font-semibold" : ""} ${highlighted ? "bg-rb-500/15 font-semibold text-foreground" : total ? "" : "text-rb-500"} ${onSelect ? "cursor-pointer" : ""}`}
        style={total ? { borderColor: "var(--rb-tooltip-border)" } : undefined}
        onClick={onSelect}
        {...(highlighted ? { "data-breakdown-active": "" } : {})}
        {...attrs}
      >
        <span className="pr-0.5 text-right">{sign}</span>
        <span className="flex items-center">
          {swatch !== undefined && (
            <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-[2px]" style={swatch ?? undefined} />
          )}
        </span>
        <span className="inline-flex min-w-0 items-center gap-0.5 pr-2">
          <span className="min-w-0">{label}</span>
          {onToggle && parts.length > 0 && (
            <button
              type="button"
              className="inline-flex size-5 shrink-0 items-center justify-center rounded text-rb-500 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rb-400"
              aria-expanded={shown}
              aria-controls={partsId}
              aria-label={`${shown ? "Hide" : "Show"} the assets${name ? ` in ${name}` : ""}`}
              data-breakdown-chevron=""
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
            >
              <ChevronDown size={12} aria-hidden className={shown ? "rotate-180" : ""} />
            </button>
          )}
        </span>
        <span className="whitespace-nowrap pr-0.5 text-right tabular-nums text-foreground">
          <Value value={value} />
        </span>
      </div>
      {shown && (
        <div id={partsId} className="flex flex-col" data-breakdown-parts={rowKey}>
          {parts.map((p) => (
            <div
              key={p.symbol}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 py-0.5 pl-9 pr-0.5 text-rb-500"
              data-breakdown-part={p.symbol}
            >
              <span className="inline-flex min-w-0 items-center gap-1.5">
                {p.icon !== false && <TokenChipIcon symbol={p.symbol} size={14} decorative />}
                <span className="truncate">{p.symbol}</span>
              </span>
              <span className="whitespace-nowrap text-right tabular-nums">{p.amount && <Fig f={p.amount} />}</span>
              <span className="whitespace-nowrap text-right tabular-nums">{p.usd && <Fig f={p.usd} />}</span>
            </div>
          ))}
          {more > 0 && <div className="py-0.5 pl-9 text-rb-500">{more} more</div>}
        </div>
      )}
    </>
  );
}
