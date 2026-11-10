// The MetaMorpho vault page's grid of tiles (Miles, 10 Nov 2026): one column,
// two from lg, no outer border. Each tile draws its own hairlines: under it,
// inset 20px from its ends from sm and full width below sm; a pair's two lines
// meet into one unbroken line from lg; the left tile of a pair draws a
// vertical line at its right edge, stopping 20px short of each end. The last
// tile draws none.
//
// The grid's scoped selectors reset the sections it holds: no outer margin or
// rounding, no padding of their own (the tile pads), and The last 30 days
// without a frame round each chart, a hairline between them from sm.

import type { ReactNode } from "react";

export const VAULT_GRID = [
  "grid grid-cols-1 lg:grid-cols-2",
  "[&_[data-strip-tile]]:rounded-none [&_[data-strip-tile]]:border-0 [&_[data-strip-tile]]:px-0",
  "sm:[&_[data-strip-tile]+[data-strip-tile]]:border-l sm:[&_[data-strip-tile]+[data-strip-tile]]:pl-5",
  "[&_[data-strip-tile]+[data-strip-tile]]:border-rb-200 dark:[&_[data-strip-tile]+[data-strip-tile]]:border-rb-500/30",
  "[&_section[data-prov-scope]]:m-0 [&_section[data-prov-scope]]:rounded-none [&_section[data-prov-scope]]:p-0",
  "[--donut-ground:var(--background)]",
].join(" ");

/** The vault card (V2) as the grid's first tile: no frame or ground, padded
 *  as a tile, with a tile's hairline under it (`Tile flush`). The shell keeps
 *  its anatomy; only its box is reset. */
export const VAULT_CARD_TILE = [
  "[&>section]:mb-0",
  "[&_[data-position-card-shell]]:rounded-none [&_[data-position-card-shell]]:border-0 [&_[data-position-card-shell]]:bg-transparent",
  "[&_[data-position-card-shell]]:px-0 [&_[data-position-card-shell]]:py-5 sm:[&_[data-position-card-shell]]:px-5",
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
      data-vault-tile={id}
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

/** The page's one note on the charts' colours, at its foot. */
export function ColourNote() {
  return (
    <p className="mt-4 text-[11px] text-rb-500" data-vault-colour-note="">
      Colours tell the segments apart.
    </p>
  );
}
