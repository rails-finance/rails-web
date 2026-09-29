"use client";

// The position read at every block of its socialized rows (rebalances and
// pool-wide liquidations): getPosition at block − 1 and at the block, loaded
// once by the position page (useFxPositionReads) and shared with the card's
// split, each row's header and each run's header. A block that holds several
// of these rows is read once; its change belongs to the block, so only the
// block's top row (`leads`) states it.

import { createContext, useContext } from "react";
import type { FxStateAt } from "@/lib/sources/chain/fx-event-state";

export interface FxSocializedReads {
  reads: Record<string, FxStateAt> | null;
  /** Ids of the row in each block that states the block's change: its last,
   *  the one the newest-first timeline draws on top. */
  leads: Set<string>;
  /** Socialized rows per block. */
  peers?: Map<number, number>;
}

export const FxSocializedReadsContext = createContext<FxSocializedReads | null>(null);

export function useFxSocializedReads(): FxSocializedReads | null {
  return useContext(FxSocializedReadsContext);
}

/** The position's change over one block (after − before), in human units;
 *  null until both reads are in. */
export function fxBlockChange(
  reads: Record<string, FxStateAt> | null | undefined,
  block: number,
): { coll: number; debt: number } | null {
  const b = reads?.[String(block - 1)];
  const a = reads?.[String(block)];
  if (!a?.colls || !a.debts || !b?.colls || !b.debts) return null;
  return { coll: (Number(a.colls) - Number(b.colls)) / 1e18, debt: (Number(a.debts) - Number(b.debts)) / 1e18 };
}

/** The change summed over a set of blocks (each block once); null until every
 *  block has read. */
export function fxBlocksChange(
  reads: Record<string, FxStateAt> | null | undefined,
  blocks: number[],
): { coll: number; debt: number } | null {
  let coll = 0;
  let debt = 0;
  for (const b of new Set(blocks)) {
    const c = fxBlockChange(reads, b);
    if (!c) return null;
    coll += c.coll;
    debt += c.debt;
  }
  return { coll, debt };
}
