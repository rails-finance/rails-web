// The position card's stats (rails-ops TO-DO-position-card 322): the
// additive values as a grid beneath the headlines, in the card itself with no
// inset of its own. Each stat is a muted heading (its "?" read-more beside
// it, a qualifier such as "since 6 Sep 2026" on a second muted line) over its
// value in the bold value type. Under three headlines at lg the stats stand
// under the headline they belong to, two columns to a headline: the
// collateral side's under the first, the debt side's under the second, the
// risk figures under the third. Elsewhere, and on cards with another number
// of headlines, they flow in order: six columns at lg, three from sm, two on
// a phone. The listing card has no stats (324).

import type { ReactNode } from "react";
import { RowHelp } from "@/components/shared/row-help";

export type PositionPanelGroup = "collateral" | "debt" | "risk";

export interface PositionPanelRow {
  /** Stable key, and the row's `data-panel-row`. */
  id: string;
  label: string;
  value: ReactNode;
  /** A qualifier on the heading's second line ("since 6 Sep 2026"). */
  sub?: ReactNode;
  /** The headline the stat stands under; read from its id and label where
   *  absent. */
  group?: PositionPanelGroup;
  /** The row's read-more, opened from a "?" after the label on a click. */
  tip?: string;
}

/** The family's two lists, left then right; the grid reads them in order. */
export type PositionPanelColumns = [PositionPanelRow[], PositionPanelRow[]];

// The headline a stat belongs to, by its words: the risk figures first (a
// liquidation, a ratio, a health), then the debt side's (interest charged,
// the room to borrow), and the rest to collateral.
const RISK =
  /liquidat|absorb|health|ratio|drop|\bltv\b|lltv|margin|redemption|in front|threshold|limit used|line used|soft|band|challenge|expir|due/i;
const DEBT = /borrow|charged|debt|repay|interest rate|annual interest|cost|fee|owed|drawable|stability/i;

function groupOf(r: PositionPanelRow): PositionPanelGroup {
  if (r.group) return r.group;
  // The borrow rate stands beside the interest earned, as Miles's mock has
  // it (14 Oct 2026), leaving the debt column the interest and the room.
  if (/borrow rate/i.test(r.label)) return "collateral";
  const words = `${r.id} ${r.label}`;
  if (RISK.test(words)) return "risk";
  if (DEBT.test(words)) return "debt";
  return "collateral";
}

// Each stat spans two rows of the grid (its heading, then its value) on the
// grid's own tracks (subgrid), so the headings of a row share the tallest
// one's height and the values beneath them start on one line.
function Stat({ r }: { r: PositionPanelRow }) {
  return (
    <div className="row-span-2 grid min-w-0 grid-rows-subgrid" data-panel-row={r.id}>
      <dt className="self-start pb-1 text-xs font-medium text-rb-500">
        {r.label}
        {r.tip && <RowHelp tip={r.tip} name={r.label} />}
        {r.sub != null && <span className="block font-normal">{r.sub}</span>}
      </dt>
      <dd className="min-w-0 pb-4 text-base font-semibold tabular-nums text-foreground">{r.value}</dd>
    </div>
  );
}

export function PositionCardPanel({ columns, heads }: { columns: PositionPanelColumns; heads: number }) {
  const rows = [...columns[0], ...columns[1]];
  if (rows.length === 0) return null;
  const flow = "grid grid-cols-2 gap-x-4 sm:grid-cols-3";
  if (heads !== 3)
    return (
      <dl className={`mt-6 -mb-4 ${flow} lg:grid-cols-6`} data-position-panel="" data-anatomy="C18">
        {rows.map((r) => (
          <Stat key={r.id} r={r} />
        ))}
      </dl>
    );
  const groups: PositionPanelGroup[] = ["collateral", "debt", "risk"];
  return (
    <dl className={`mt-6 -mb-4 ${flow} lg:grid-cols-3`} data-position-panel="" data-anatomy="C18">
      {groups.map((g) => {
        const own = rows.filter((r) => groupOf(r) === g);
        // Under lg the group gives way and its stats join the one flow; at lg
        // it is a column of two whose rows are the grid's, so the values line
        // up across the groups too.
        return (
          <div
            key={g}
            className="contents lg:grid lg:grid-cols-2 lg:grid-rows-subgrid lg:gap-x-4"
            style={own.length > 0 ? { gridRow: `span ${2 * Math.ceil(own.length / 2)}` } : undefined}
            data-panel-group={g}
          >
            {own.map((r) => (
              <Stat key={r.id} r={r} />
            ))}
          </div>
        );
      })}
    </dl>
  );
}
