// f(x)'s timeline head as words (rails-ops decision 0045, TO-DO-ui-jobs 367):
// the past-participle kind, the operation's legs in leg order where the kind
// alone says nothing, and at most one clause for a state the spine cannot show
// ("Nothing left to take", "Debt written off", a transfer's "to 0x…"). The
// figures are on the spine's flank, the Figures sheet and the Explanation; a
// tick's or the pool's totals are in the Explanation.

import type { FxContext } from "@/lib/shared/types/event-shape";
import { fxLiquidationMoved } from "@/lib/fx/row-figures";

export const FX_HEAD_WORDS = {
  sep: "·",
  opened: "Opened position",
  reopened: "Reopened position",
  closed: "Closed position",
  adjusted: "Adjusted position",
  addedColl: "Added collateral",
  withdrewColl: "Withdrew collateral",
  borrowed: "Borrowed",
  repaid: "Repaid",
  liquidated: "Liquidated",
  rebalanced: "Rebalanced",
  redeemed: "Redeemed",
  transferred: "Transferred",
  minted: "Minted",
  nothingLeft: "Nothing left to take",
  debtWrittenOff: "Debt written off",
  /** The warning spine's legs. */
  legSeized: "Seized",
  legCleared: "Cleared",
  legCollateral: "Collateral",
  legDebt: "Debt",
} as const;

export interface FxT1Words {
  kind: string;
  /** A state the spine cannot show; a transfer's counterparty is drawn by the
   *  header as its chip. */
  clause?: string;
  status?: "open" | "close";
}

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

/** An adjust's legs as participles in the order they run: what goes into the
 *  position before what comes out, the collateral first where both go one way. */
function legs(coll: number, debt: number): string | null {
  const W = FX_HEAD_WORDS;
  const c = coll > 0 ? W.addedColl : W.withdrewColl;
  const d = debt > 0 ? W.borrowed : W.repaid;
  if (coll === 0 && debt === 0) return null;
  if (debt === 0) return c;
  if (coll === 0) return d;
  return debt < 0 && coll < 0 ? `${d} ${W.sep} ${c}` : `${c} ${W.sep} ${d}`;
}

/** The head's words. `writtenOff`: a pool-wide liquidation took more of the
 *  position's debt than its keeper repaid (the header reads the block's
 *  position change). */
export function fxT1Words(ctx: FxContext, opts: { writtenOff?: boolean } = {}): FxT1Words {
  const W = FX_HEAD_WORDS;
  switch (ctx.eventType) {
    case "transfer":
      return { kind: ctx.transferFrom === ZERO_ADDR ? W.minted : W.transferred };
    case "tickRebalance":
      return { kind: ctx.redemption ? W.redeemed : W.rebalanced };
    case "liquidation":
      if (ctx.poolWide === true) return { kind: W.liquidated, clause: opts.writtenOff ? W.debtWrittenOff : undefined };
      return { kind: W.liquidated, clause: fxLiquidationMoved(ctx) ? undefined : W.nothingLeft };
    case "operate": {
      if (ctx.reopens) return { kind: W.reopened, status: "open" };
      if (ctx.isOpen) return { kind: W.opened, status: "open" };
      if (ctx.emptiesPosition) return { kind: W.closed, status: "close" };
      const coll = Number(ctx.collDelta ?? "0") || 0;
      const debt = Number(ctx.debtDelta ?? "0") || 0;
      return { kind: legs(coll, debt) ?? W.adjusted };
    }
  }
}

/** The words as one line: the phone caption, the accessible name, and the
 *  page's title where the card has no teaser. `party`: a transfer's
 *  counterparty, as its chip reads. */
export function fxT1Caption(w: FxT1Words, party?: string): string {
  const tail = w.clause ?? party;
  return tail ? `${w.kind} ${FX_HEAD_WORDS.sep} ${tail}` : w.kind;
}
