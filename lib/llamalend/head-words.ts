// LlamaLend's timeline head as words (rails-ops decision 0045, TO-DO-ui-jobs
// 367): the past-participle kind, the operation's legs in leg order where the
// kind alone says nothing, and the protocol's name for a mode as a label
// beside it ("Self-liquidation", the borrower's own close from soft
// liquidation). The figures are on the spine's flank, the Figures sheet and
// the Explanation.

import type { LlamalendContext } from "@/lib/shared/types/event-shape";
import type { LlamalendLoanMark } from "@/lib/llamalend/event-figures";

export const LLAMALEND_HEAD_WORDS = {
  sep: "·",
  opened: "Opened loan",
  closed: "Closed loan",
  addedColl: "Added collateral",
  removedColl: "Removed collateral",
  borrowed: "Borrowed",
  repaid: "Repaid",
  liquidated: "Liquidated",
  /** The protocol's name for the borrower liquidating their own loan. */
  selfLiquidation: "Self-liquidation",
  /** The warning spine's legs on the borrower's liquidation row. */
  legTaken: "Taken",
  legConverted: "Converted",
  legCleared: "Cleared",
} as const;

const DUST = 1e-12;

export interface LlamalendT1Words {
  kind: string;
  /** The protocol's name for the mode, drawn beside the kind. */
  mode?: string;
  status?: "open" | "close";
}

/** The legs as participles in the order they run: what goes into the loan
 *  before what comes out, the collateral first where both go one way. */
function legs(coll: number, debt: number): string | null {
  const W = LLAMALEND_HEAD_WORDS;
  const c = coll > 0 ? W.addedColl : W.removedColl;
  const d = debt > 0 ? W.borrowed : W.repaid;
  if (coll === 0 && debt === 0) return null;
  if (debt === 0) return c;
  if (coll === 0) return d;
  return debt < 0 && coll < 0 ? `${d} ${W.sep} ${c}` : `${c} ${W.sep} ${d}`;
}

const LABEL: Record<Exclude<LlamalendContext["eventType"], "liquidation">, string> = {
  borrow: LLAMALEND_HEAD_WORDS.borrowed,
  add_collateral: LLAMALEND_HEAD_WORDS.addedColl,
  repay: LLAMALEND_HEAD_WORDS.repaid,
  remove_collateral: LLAMALEND_HEAD_WORDS.removedColl,
};

/** The head's words. `mark`: the page's read of which row opens or closes a
 *  loan; where there is none, the row's own flags decide. */
export function llamalendT1Words(ctx: LlamalendContext, mark?: LlamalendLoanMark | null): LlamalendT1Words {
  const W = LLAMALEND_HEAD_WORDS;
  const coll = Number(ctx.collateralDelta ?? "0") || 0;
  const debt = Number(ctx.debtDelta ?? "0") || 0;
  const debtAfter = ctx.debtAfter != null && ctx.debtAfter !== "" ? Number(ctx.debtAfter) : null;
  if (ctx.eventType === "liquidation") {
    const role = ctx.role ?? "borrower";
    if (role === "self" || ctx.selfLiquidation)
      return {
        kind: debtAfter != null && Math.abs(debtAfter) <= DUST ? W.closed : W.repaid,
        mode: W.selfLiquidation,
      };
    return { kind: W.liquidated };
  }
  const opens = mark ? mark.opens : !!ctx.isOpen;
  const closes = mark ? mark.closes : ctx.eventType === "repay" && debtAfter != null && debtAfter <= DUST;
  if (opens) return { kind: W.opened, status: "open" };
  if (closes) return { kind: W.closed, status: "close" };
  return { kind: legs(coll, debt) ?? LABEL[ctx.eventType] };
}

/** The words as one line: the phone caption, the row's accessible name and the
 *  title where the card has no teaser. */
export function llamalendT1Caption(w: LlamalendT1Words): string {
  return w.mode ? `${w.kind} ${LLAMALEND_HEAD_WORDS.sep} ${w.mode}` : w.kind;
}
