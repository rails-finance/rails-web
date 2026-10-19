// Dolomite's timeline head as words (rails-ops decision 0045, TO-DO-ui-jobs
// 367). The kind is a past participle, named by what the leg did to the
// balance (`dolomiteBalanceAction`: a deposit into debt is a repayment, a
// withdrawal past zero a borrow), both legs in order where it crossed zero; a
// transfer's counterparty follows as its clause. The spine carries the
// figures.

import type { DolomiteContext } from "@/lib/shared/types/event-shape";
import { dolomiteBalanceAction } from "@/lib/dolomite/balance-action";

export const DOLOMITE_HEAD_WORDS = {
  sep: "·",
  deposited: "Deposited",
  withdrew: "Withdrew",
  borrowed: "Borrowed",
  repaid: "Repaid",
  transferred: "Transferred",
  traded: "Traded",
  liquidated: "Liquidated",
  seizedOut: "Collateral seized",
  seizedIn: "Received seized collateral",
  payout: "Repaid as liquidator",
  vaporised: "Vaporised",
  called: "Called",
  to: "to",
  from: "from",
  by: "by",
  for: "for",
  legSeized: "seized",
  legRepaid: "repaid",
} as const;

const W = DOLOMITE_HEAD_WORDS;
const both = (a: string, b: string) => `${a} ${W.sep} ${b}`;

/** The row's past-participle kind. */
export function dolomiteT1Kind(ctx: DolomiteContext, fallback: string): string {
  switch (dolomiteBalanceAction(ctx)) {
    case "deposit":
      return W.deposited;
    case "repay":
    case "received_repay":
      return W.repaid;
    case "repay_deposit":
      return both(W.repaid, W.deposited);
    case "withdraw":
      return W.withdrew;
    case "borrow":
    case "sent_borrow":
      return W.borrowed;
    case "withdraw_borrow":
      return both(W.withdrew, W.borrowed);
  }
  switch (ctx.eventType) {
    case "transfer_in":
    case "transfer_out":
      return W.transferred;
    case "trade_taker":
    case "trade_maker":
      return W.traded;
    case "liquidation":
      return W.liquidated;
    case "seize_out":
      return W.seizedOut;
    case "seize_in":
      return W.seizedIn;
    case "liquidation_payout":
      return W.payout;
    case "vaporize":
      return W.vaporised;
    case "call":
      return W.called;
    default:
      return fallback;
  }
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The head's words as one line, for the phone caption and the row's
 *  accessible name: "Deposited", "Transferred · to 0x1234…abcd". `name`: the
 *  counterparty's name where the chip draws one (the owner's other account). */
export function dolomiteT1Caption(ctx: DolomiteContext, fallback: string, name?: string): string {
  const kind = dolomiteT1Kind(ctx, fallback);
  if ((ctx.eventType !== "transfer_in" && ctx.eventType !== "transfer_out") || !ctx.counterparty) return kind;
  return `${kind} ${W.sep} ${ctx.eventType === "transfer_in" ? W.from : W.to} ${name ?? short(ctx.counterparty)}`;
}
