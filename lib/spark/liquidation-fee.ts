// The liquidation protocol fee and the WETH gateway on a SparkLend timeline.
// ----------------------------------------------------------------------------
// RULE: an spToken transfer out of the position to the Spark treasury, in the
// same transaction as a LiquidationCall on this position whose collateral is
// the transferred reserve, is that liquidation's protocol fee — the Pool's
// `transferOnLiquidation(borrower → treasury, fee)`, fee = the reserve's
// liquidationProtocolFee × the bonus part of the seized collateral (the Aave V3
// LiquidationLogic SparkLend runs; lib/aave-v3/liquidation-fee.ts is the Aave
// twin). A transfer to the Spark WETH gateway is a withdrawal to ETH: the
// gateway withdraws the WETH from the Pool and sends ETH to the wallet in the
// same transaction. The flows count both the same way (lib/spark/flows-timeline).

import type { BaseActivityEvent, SparkContext } from "@/lib/shared/types/event-shape";
import { SPARK_TREASURY, SPARK_WETH_GATEWAY } from "./flows-timeline";

export type SparkTimelineEvent = BaseActivityEvent & { context: { protocol: "spark"; data: SparkContext } };

export const isSparkTreasury = (a: string | undefined): boolean => a?.toLowerCase() === SPARK_TREASURY;
export const isSparkWethGateway = (a: string | undefined): boolean => a?.toLowerCase() === SPARK_WETH_GATEWAY;

/** A transfer out to the WETH gateway: a withdrawal to ETH. */
export const isGatewayWithdrawal = (ctx: SparkContext): boolean =>
  ctx.eventType === "transfer_out" && isSparkWethGateway(ctx.counterparty);

/** The liquidation this fee transfer belongs to, among its same-transaction
 *  siblings; undefined when the row is not a liquidation fee. */
export function sparkFeeLiquidation(
  ctx: SparkContext,
  siblings: readonly SparkTimelineEvent[] | undefined,
): SparkContext | undefined {
  if (ctx.eventType !== "transfer_out" || !isSparkTreasury(ctx.counterparty)) return undefined;
  return siblings
    ?.map((s) => s.context.data)
    .find((s) => s.eventType === "liquidation" && (!s.collateralSymbol || s.collateralSymbol === ctx.reserveSymbol));
}

/** The fee transfer paid out of this liquidation's collateral, among its
 *  same-transaction siblings. */
export function sparkLiquidationFee(
  ctx: SparkContext,
  siblings: readonly SparkTimelineEvent[] | undefined,
): SparkContext | undefined {
  if (ctx.eventType !== "liquidation") return undefined;
  return siblings
    ?.map((s) => s.context.data)
    .find(
      (s) =>
        s.eventType === "transfer_out" &&
        isSparkTreasury(s.counterparty) &&
        (!ctx.collateralSymbol || s.reserveSymbol === ctx.collateralSymbol),
    );
}
