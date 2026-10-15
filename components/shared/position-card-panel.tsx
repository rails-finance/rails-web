// The position card's stats (rails-ops TO-DO-position-card 322): the
// additive values as a grid beneath the headlines, in the card itself with no
// inset of its own. Each stat is a muted heading (a press on it opens its
// read-more; a qualifier such as "since 6 Sep 2026" on a second muted line) over its
// value in the bold value type. The listing card has no stats (324).
//
// A card carries at most 4 headlines and 6 stats, and at lg the stats are one
// row (Miles, 15 Oct 2026). Under three headlines at lg each stat stands
// under the headline it belongs to: the collateral side's under the first,
// the debt side's under the second, the risk figures under the third. The
// row is one track per stat (`panelTracks`), and each headline spans as many
// tracks as its group holds, so a debt side of three widens the Debt column
// rather than sending its third stat to a row of its own. Where every group
// holds two or fewer the headlines keep equal thirds, two tracks apiece.
// Elsewhere, and on cards with another number of headlines, the stats flow
// in order: six columns at lg, three from sm, two on a phone.
import type { CSSProperties, ReactNode } from "react";
import { HeadingTip } from "@/components/shared/tip-label";

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
        <HeadingTip text={r.label} tip={r.tip} />
        {r.sub != null && <span className="block font-normal">{r.sub}</span>}
      </dt>
      <dd className="min-w-0 pb-4 text-base font-semibold tabular-nums text-foreground">{r.value}</dd>
    </div>
  );
}

/** The caps a position card holds to (Miles, 15 Oct 2026). */
export const POSITION_CARD_MAX_HEADS = 4;
export const POSITION_CARD_MAX_STATS = 6;

/** At lg, the stats of a three-headline open card stand under their
 *  headlines on one row: how many tracks each headline spans, in order. Null
 *  where the stats flow instead (another number of headlines, no stats, or a
 *  grouping that would need more than six tracks: an empty group still takes
 *  one, under its headline). */
export function panelTracks(columns: PositionPanelColumns | undefined, heads: number): number[] | null {
  if (!columns || heads !== 3) return null;
  const rows = [...columns[0], ...columns[1]];
  if (rows.length === 0) return null;
  const counts = GROUPS.map((g) => rows.filter((r) => groupOf(r) === g).length);
  if (counts.every((n) => n <= 2)) return [2, 2, 2];
  const spans = counts.map((n) => Math.max(n, 1));
  return spans.reduce((a, b) => a + b, 0) <= POSITION_CARD_MAX_STATS ? spans : null;
}

/** The grid template at lg for a card whose headlines span `tracks`: read by
 *  both the headline grid and the stats grid, so their columns line up. */
export const tracksStyle = (tracks: number[]) =>
  ({ "--card-tracks": `repeat(${tracks.reduce((a, b) => a + b, 0)}, minmax(0, 1fr))` }) as CSSProperties;

const GROUPS: PositionPanelGroup[] = ["collateral", "debt", "risk"];

export function PositionCardPanel({ columns, tracks }: { columns: PositionPanelColumns; tracks: number[] | null }) {
  const rows = [...columns[0], ...columns[1]];
  if (rows.length === 0) return null;
  const flow = "grid grid-cols-2 gap-x-4 sm:grid-cols-3";
  if (!tracks)
    return (
      <dl className={`mt-6 -mb-4 ${flow} lg:grid-cols-6`} data-position-panel="" data-anatomy="C18">
        {rows.map((r) => (
          <Stat key={r.id} r={r} />
        ))}
      </dl>
    );
  return (
    <dl
      className={`mt-6 -mb-4 ${flow} lg:grid-cols-(--card-tracks)`}
      style={tracksStyle(tracks)}
      data-position-panel=""
      data-anatomy="C18"
    >
      {GROUPS.map((g, i) => {
        const own = rows.filter((r) => groupOf(r) === g);
        // Under lg the group gives way and its stats join the one flow; at lg
        // it spans its headline's tracks on the grid's own columns and rows,
        // so the stats line up under the headline and across the groups.
        return (
          <div
            key={g}
            className="contents lg:col-span-(--group-span) lg:grid lg:grid-cols-subgrid lg:grid-rows-subgrid"
            style={
              {
                "--group-span": tracks[i],
                ...(own.length > 0 ? { gridRow: "span 2" } : {}),
              } as CSSProperties
            }
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
