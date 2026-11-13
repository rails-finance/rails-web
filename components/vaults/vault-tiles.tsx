// The vault pages' tile grid (anatomy V13): the shared grid
// (components/shared/tile-grid.tsx) with the vault sections' resets. The
// last 30 days loses its frame round each chart, with a hairline between them
// from sm; the donuts take the page's ground.

import { TILE_GRID } from "@/components/shared/tile-grid";

export const VAULT_GRID = [
  TILE_GRID,
  "[&_[data-strip-tile]]:rounded-none [&_[data-strip-tile]]:border-0 [&_[data-strip-tile]]:px-0",
  "sm:[&_[data-strip-tile]+[data-strip-tile]]:border-l sm:[&_[data-strip-tile]+[data-strip-tile]]:pl-5",
  "[&_[data-strip-tile]+[data-strip-tile]]:border-rb-200 dark:[&_[data-strip-tile]+[data-strip-tile]]:border-rb-500/30",
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

/** The page's one note on the charts' colours, at its foot. */
export function ColourNote() {
  return (
    <p className="mt-4 text-[11px] text-rb-500" data-vault-colour-note="">
      Colours tell the segments apart.
    </p>
  );
}
