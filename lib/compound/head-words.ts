// Compound V3's timeline head as words (rails-ops decision 0045,
// TO-DO-ui-jobs 367), on Ethereum and Base. The kind is a past participle; a
// base row that crosses zero names both legs in order ("Repaid · Supplied");
// an absorb's side and a transfer's counterparty follow as the clause. The
// spine carries the figures. The words are the `t1_*` entries of
// content/compound/event-prose.yaml (COMPOUND_HEAD_WORDS).

import type { CompoundContext } from "@/lib/shared/types/event-shape";
import { compoundBaseAct } from "@/lib/compound/row-facts";
import { COMPOUND_HEAD_WORDS as W } from "@/lib/compound/event-templates";

export interface CompoundT1Words {
  kind: string;
  /** A state the spine cannot show: an absorb's side, a zero amount. */
  clause?: string;
}

const isTransfer = (t: CompoundContext["eventType"]) =>
  t === "transfer_in" || t === "transfer_out" || t === "transfer_collateral_in" || t === "transfer_collateral_out";

/** The row's words. `fallback`: the label it came with, for a base row whose
 *  balance is not read. */
export function compoundT1Words(ctx: CompoundContext, fallback: string, baseDecimals?: number): CompoundT1Words {
  switch (ctx.eventType) {
    case "supply_collateral":
      return { kind: W.addedColl };
    case "withdraw_collateral":
      return { kind: W.withdrewColl };
    case "absorb_debt":
      return { kind: W.liquidated, clause: W.debtAbsorbed };
    case "absorb_collateral":
      return { kind: W.liquidated, clause: W.collAbsorbed };
    case "transfer_in":
    case "transfer_out":
    case "transfer_collateral_in":
    case "transfer_collateral_out":
      return { kind: W.transferred };
  }
  switch (compoundBaseAct(ctx, baseDecimals)) {
    case "supply":
      return { kind: W.supplied };
    case "repay":
      return { kind: W.repaid };
    case "repay_lend":
      return { kind: `${W.repaid} ${W.sep} ${W.supplied}` };
    case "withdraw":
      return { kind: W.withdrew };
    case "borrow":
      return { kind: W.borrowed };
    case "withdraw_borrow":
      return { kind: `${W.withdrew} ${W.sep} ${W.borrowed}` };
    case "supply_zero":
      return { kind: W.supplied, clause: W.zeroAmount };
    case "withdraw_zero":
      return { kind: W.withdrew, clause: W.zeroAmount };
    default:
      return { kind: ctx.eventType === "supply" ? W.supplied : ctx.eventType === "withdraw" ? W.withdrew : fallback };
  }
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The head's words as one line, for the phone caption and the row's
 *  accessible name: "Liquidated · Debt absorbed", "Transferred · to 0x…". */
export function compoundT1Caption(ctx: CompoundContext, fallback: string, baseDecimals?: number): string {
  const w = compoundT1Words(ctx, fallback, baseDecimals);
  if (isTransfer(ctx.eventType) && ctx.counterparty) {
    const lead = ctx.eventType === "transfer_out" || ctx.eventType === "transfer_collateral_out" ? W.to : W.from;
    return `${w.kind} ${W.sep} ${lead} ${short(ctx.counterparty)}`;
  }
  return w.clause ? `${w.kind} ${W.sep} ${w.clause}` : w.kind;
}
