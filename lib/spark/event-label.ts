// The word T1 states for a SparkLend row, which the event page's h1 and its
// browser title repeat. Server-safe: the event page's metadata reads it.

import type { SparkContext } from "@/lib/shared/types/event-shape";
import { isGatewayWithdrawal } from "@/lib/spark/liquidation-fee";

/** A transfer's verb, kept before the amount (the custody row's label, as Aave
 *  V3's "Transferred out"). */
export const TRANSFER_LABEL = { transfer_in: "Transfer in", transfer_out: "Transfer out" } as const;

/** The row's word: a liquidation fee and a gateway withdrawal name themselves;
 *  a transfer keeps its verb; any other row says its action label. `feeOf` is
 *  the liquidation a fee transfer belongs to. */
export function sparkRowLabel(ctx: SparkContext, actionLabel: string, feeOf?: SparkContext): string {
  if (feeOf) return "Liquidation fee";
  if (isGatewayWithdrawal(ctx)) return "Withdraw";
  if (ctx.eventType === "transfer_out" || ctx.eventType === "transfer_in") return TRANSFER_LABEL[ctx.eventType];
  return actionLabel;
}
