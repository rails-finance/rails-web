// The dollars on a Liquity V2 event's collateral sheet, so they add up to the
// cent: Last and Before are each amount × price as their receipts show them
// (shownUsd), the market move is Before − Last, the redistribution amount ×
// price, and the event's row what takes Before to the Total. Pure, so
// scripts/test/card-usd-receipt.test.mjs asserts the two identities.

import { shownUsd } from "@/lib/shared/shown-usd";

const toCents = (x: number): number => Math.round(x * 100) / 100;

export interface CollSheetUsd {
  /** The balance before, at the previous event's price; null with no price. */
  last: number | null;
  /** Before − Last. */
  market: number;
  before: number;
  redistribution: number;
  /** Total − Before − redistribution. */
  event: number;
  total: number;
}

export function collSheetUsd(o: {
  beforeColl: number;
  redistColl: number;
  /** This event's price for the rows (a liquidation's own). */
  priceNow: number;
  prevPrice: number | null | undefined;
  /** The cells' before and after dollars (shownUsd each). */
  before: number;
  total: number;
}): CollSheetUsd {
  const last = o.prevPrice ? shownUsd(o.beforeColl, o.prevPrice) : null;
  const redistribution = o.priceNow > 0 ? shownUsd(o.redistColl, o.priceNow) : 0;
  return {
    last,
    market: last != null ? toCents(o.before - last) : 0,
    before: o.before,
    redistribution,
    event: toCents(o.total - o.before - redistribution),
    total: o.total,
  };
}
