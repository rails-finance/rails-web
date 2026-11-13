// A grid of tiles with hairline dividers and no outer border or panel fills
// (Miles, 10 Nov 2026; anatomy V13): one column, two from lg. Each tile draws
// its own hairlines: under it, inset 20px from its ends from sm and full width
// below sm; a pair's two lines meet into one unbroken line from lg; the left
// tile of a pair draws a vertical line at its right edge, stopping 20px short
// of each end. The last tile draws none.
//
// The grid's scoped selectors take the outer margin, rounding and padding off
// the receipts scopes (`section[data-prov-scope]`) it holds: the tile pads.
// Users: the vault pages (components/vaults/vault-tiles.tsx), the Aave V4
// reserve page (components/shared/product/reserve-page.tsx, `layout="tiles"`).

import type { ReactNode } from "react";

export const TILE_GRID = [
  "grid grid-cols-1 lg:grid-cols-2",
  "[&_section[data-prov-scope]]:m-0 [&_section[data-prov-scope]]:rounded-none [&_section[data-prov-scope]]:p-0",
].join(" ");

/** A hairline's colour. */
export const RULE = "bg-rb-200 dark:bg-rb-500/30";

const PAD = "min-w-0 scroll-mt-4 py-5 sm:px-5";

export function Tile({
  id,
  wide,
  flush,
  left,
  right,
  last,
  segScope,
  children,
}: {
  id?: string;
  /** Both columns from lg. */
  wide?: boolean;
  /** No padding: the content pads itself (a pair of sections in one tile). */
  flush?: boolean;
  /** The left tile of a pair: a vertical hairline at its right edge from lg. */
  left?: boolean;
  /** The right tile of a pair: its bottom hairline meets the left tile's from lg. */
  right?: boolean;
  /** The last tile: no hairline under it. */
  last?: boolean;
  /** A `SegmentBar`'s or `ShareDonut`'s scope, lighting its segments with their rows. */
  segScope?: string;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      className={`relative ${flush ? "min-w-0 scroll-mt-4" : PAD} ${wide ? "lg:col-span-2" : ""}`}
      data-tile={id}
      data-seg-scope={segScope}
    >
      {children}
      {!last && (
        <i
          aria-hidden
          className={`pointer-events-none absolute bottom-0 h-px ${left ? "inset-x-0 sm:inset-x-5 lg:right-0" : right ? "inset-x-0 sm:inset-x-5 lg:left-0" : "inset-x-0 sm:inset-x-5"} ${RULE}`}
        />
      )}
      {left && (
        <i aria-hidden className={`pointer-events-none absolute inset-y-5 right-0 hidden w-px lg:block ${RULE}`} />
      )}
    </div>
  );
}
