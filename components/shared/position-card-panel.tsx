// The position card's stats (rails-ops TO-DO-position-card 322): the
// additive values as a grid beneath the headlines, in the card itself with no
// inset of its own. Each stat is a muted heading (a press on it opens its
// read-more; a qualifier such as "since 6 Sep 2026" on a second muted line) over its
// value in the bold value type. The listing card has no stats (324).
//
// The stats stand apart from the headlines (decision 0040): one grid in the
// card's order, six columns at lg, three below it, two on a phone. A card
// carries at most 4 headlines and 6 stats; a stat's label reads on its own.
import type { ReactNode } from "react";
import { HeadingTip } from "@/components/shared/tip-label";

export interface PositionPanelRow {
  /** Stable key, and the row's `data-panel-row`. */
  id: string;
  label: string;
  value: ReactNode;
  /** A qualifier on the heading's second line ("since 6 Sep 2026"). */
  sub?: ReactNode;
  /** The row's read-more, opened from a "?" after the label on a click. */
  tip?: string;
}

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
      <dd className="min-w-0 pb-4 text-base font-semibold tabular-nums text-foreground">{r.value}</dd>
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
