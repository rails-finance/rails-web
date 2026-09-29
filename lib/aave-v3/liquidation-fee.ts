// The liquidation protocol fee on an Aave V3 Ethereum timeline.
// ----------------------------------------------------------------------------
// RULE: an aToken transfer out of the position to the Aave Collector (the
// treasury), in the same transaction as a LiquidationCall on this position
// whose collateral is the transferred reserve, is that liquidation's protocol
// fee: `transferOnLiquidation(borrower → RESERVE_TREASURY_ADDRESS, fee)`, where
// fee = liquidationProtocolFee × the bonus part of the seized collateral
// (aave-v3-origin LiquidationLogic). The row stays a transfer on the wire; the
// page names it for what it is. The Pool sends it after the seizure, so the
// fee row's balance runs from the post-seizure balance to the liquidation's
// after-balance.
//
// Every Aave V3 market on Ethereum (Core, Prime, EtherFi) pays the same
// Collector. Other chains' collectors are not listed, so there the row stays a
// plain transfer.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { AaveV3Context } from "@/lib/shared/types/protocols/aave-v3";
import { MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";

type V3Event = BaseActivityEvent & { context: { protocol: "aave-v3"; data: AaveV3Context } };

const AAVE_COLLECTOR: Partial<Record<ChainId, string>> = {
  [MAINNET_CHAIN_ID]: "0x464c71f6c2f760dda6093dcb91c24c39e5d6e18c",
};

export const isAaveCollector = (address: string | undefined, chainId: ChainId = MAINNET_CHAIN_ID): boolean =>
  !!address && AAVE_COLLECTOR[chainId] === address.toLowerCase();

/** The liquidation this fee transfer belongs to, among its same-transaction
 *  siblings; undefined when the row is not a liquidation fee. */
export function feeLiquidation(
  ctx: AaveV3Context,
  siblings: readonly V3Event[] | undefined,
  chainId: ChainId = MAINNET_CHAIN_ID,
): AaveV3Context | undefined {
  if (ctx.eventType !== "transfer_out" || !isAaveCollector(ctx.counterparty, chainId)) return undefined;
  const reserve = ctx.reserve?.toLowerCase();
  return siblings
    ?.map((s) => s.context.data)
    .find((s) => s.eventType === "liquidation" && (!reserve || s.collateralAsset?.toLowerCase() === reserve));
}

/** The fee transfer paid out of this liquidation's collateral, among its
 *  same-transaction siblings. */
export function liquidationFee(
  ctx: AaveV3Context,
  siblings: readonly V3Event[] | undefined,
  chainId: ChainId = MAINNET_CHAIN_ID,
): AaveV3Context | undefined {
  if (ctx.eventType !== "liquidation") return undefined;
  const coll = ctx.collateralAsset?.toLowerCase();
  return siblings
    ?.map((s) => s.context.data)
    .find(
      (s) =>
        s.eventType === "transfer_out" &&
        isAaveCollector(s.counterparty, chainId) &&
        (!coll || s.reserve?.toLowerCase() === coll),
    );
}

/** The bonus a liquidation paid, read off its own figures: the collateral that
 *  left (seized + fee) valued against the debt cleared, at the block's oracle
 *  prices, and the fee's share of that bonus. Null where a price is missing. */
export function liquidationBonus(
  liq: AaveV3Context,
  fee: AaveV3Context | undefined,
): { bonus: number; feeShare: number | null; feeAmount: number } | null {
  const cp = liq.collateralPrice?.usd;
  const dp = liq.debtPrice?.usd;
  const seized = Number(liq.liquidatedCollateralAmount);
  const cleared = Number(liq.debtToCover);
  const feeAmount = fee ? Math.abs(Number(fee.amount)) || 0 : 0;
  if (!cp || !dp || !(seized > 0) || !(cleared > 0)) return null;
  const base = (cleared * dp) / cp; // collateral worth the debt cleared
  const total = seized + feeAmount;
  const bonusPart = total - base;
  if (!(bonusPart > 0)) return null;
  return { bonus: total / base - 1, feeShare: feeAmount > 0 ? feeAmount / bonusPart : null, feeAmount };
}

/** A bonus or share as Aave states it: "7.5%", "10%" (two decimals at most). */
export const pctPlain = (f: number): string => `${Number((f * 100).toFixed(2))}%`;

/** A liquidation leg's amount at two decimals ("3,938.39"), four below 1. */
export const fmt2 = (human?: string): string => {
  const n = Math.abs(Number(human ?? "0"));
  return n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 4 : 2, minimumFractionDigits: n < 1 ? 0 : 2 });
};
