// The position card's stats (rails-ops TO-DO-position-card 322): the
// additive values as a grid beneath the headlines, in the card itself with no
// inset of its own. Each stat is a muted heading (a press on it opens its
// read-more; a qualifier such as "since 6 Sep 2026" on a second muted line) over its
// value in the bold value type. The listing card has no stats (324).
//
// A value that strings words round its figures (ui-jobs 381) marks each figure
// (`PanelFigure`, or a `TokenFigure`, which carries the mark): a value holding
// a marked figure sets its words in the sub line's muted tone at text-sm, and
// the marked figures keep the bold white. A value with no mark (a figure alone,
// bare or in its Prov) reads bold white whole.
//
// A stat of two or more assets carries a `breakdown`: its figure and the
// assets' icons are one button that opens them over the card (C19).
//
// The stats stand apart from the headlines (decision 0040): one grid in the
// card's order, six columns at lg, three below it, two on a phone. A card
// carries at most 4 headlines and 6 stats; a stat's label reads on its own.
import type { ReactNode } from "react";
import { HeadingTip } from "@/components/shared/tip-label";
import { TokenFigure } from "@/components/shared/token-figure";
import { StatBreakdown, type PanelRowBreakdown } from "@/components/shared/stat-breakdown";

export interface PositionPanelRow {
  /** Stable key, and the row's `data-panel-row`. */
  id: string;
  label: string;
  value: ReactNode;
  /** A qualifier on the heading's second line ("since 6 Sep 2026"). */
  sub?: ReactNode;
  /** The row's read-more, opened from a "?" after the label on a click. */
  tip?: ReactNode;
  /** The token `value` is stated in: its icon follows the figure, at panel
   *  size, and opens the asset panel (the ticker and, with `figure`, the exact
   *  amount). A value in dollars, a ratio, a count or a percentage has none.
   *  A row stating several tokens draws `TokenFigure` per figure instead. */
  asset?: { symbol: string; address?: string; figure?: string };
  /** A stat of two or more assets: `value` and the assets' icons become one
   *  button (C19) that opens this breakdown over the card. */
  breakdown?: PanelRowBreakdown;
}

/** A figure inside a stat value that words surround ("74.4% reached"): it
 *  keeps the bold white while the words round it take the muted tone. A
 *  value's one reading in words ("closed now") takes it too. */
export function PanelFigure({ children }: { children: ReactNode }) {
  return <span data-panel-figure="">{children}</span>;
}

// The value's base is bold white; holding a marked figure, the base turns to
// the muted words and the figures inside take the bold white back.
const VALUE_TYPE =
  "min-w-0 pb-4 text-base font-semibold tabular-nums text-foreground " +
  "has-[[data-panel-figure]]:text-sm has-[[data-panel-figure]]:font-normal has-[[data-panel-figure]]:text-rb-500 " +
  "[&_[data-panel-figure]]:text-base [&_[data-panel-figure]]:font-semibold [&_[data-panel-figure]]:text-foreground";

/** The family's two lists, left then right; the grid reads them in order. */
export type PositionPanelColumns = [PositionPanelRow[], PositionPanelRow[]];

/** The caps a position card holds to (decision 0040). */
export const POSITION_CARD_MAX_HEADS = 4;
export const POSITION_CARD_MAX_STATS = 6;

// Each stat spans two rows of the grid (its heading, then its value) on the
// grid's own tracks (subgrid), so the headings of a row share the tallest
// one's height and the values beneath them start on one line.
function Stat({ r }: { r: PositionPanelRow }) {
  return (
    <div className="row-span-2 grid min-w-0 grid-rows-subgrid" data-panel-row={r.id}>
      <dt className="self-start pb-1 text-xs font-medium text-rb-500">
        <HeadingTip text={r.label} tip={r.tip} />
        {r.sub != null && <span className="block font-normal">{r.sub}</span>}
      </dt>
      <dd className={VALUE_TYPE}>
        {r.breakdown ? (
          <StatBreakdown id={r.id} label={r.label} figure={r.value} breakdown={r.breakdown} />
        ) : r.asset && r.value != null ? (
          <TokenFigure symbol={r.asset.symbol} address={r.asset.address} figure={r.asset.figure}>
            {r.value}
          </TokenFigure>
        ) : (
          r.value
        )}
      </dd>
    </div>
  );
}

export function PositionCardPanel({ columns }: { columns: PositionPanelColumns }) {
  const rows = [...columns[0], ...columns[1]];
  if (rows.length === 0) return null;
  return (
    <dl
      className="mt-6 -mb-4 grid grid-cols-2 gap-x-4 sm:grid-cols-3 lg:grid-cols-6"
      data-position-panel=""
      data-anatomy="C18"
    >
      {rows.map((r) => (
        <Stat key={r.id} r={r} />
      ))}
    </dl>
  );
}
