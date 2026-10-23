// The word T1 states for an Aave V3 row, which the event page's h1 and its
// browser title repeat. Server-safe: the event page's metadata reads it.

import type { AaveV3Context } from "@/lib/shared/types/protocols/aave-v3";
import { AAVE_V3_SWAP_LABELS } from "@/lib/aave-v3/swap-kinds";
import { MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { getProtocolContract } from "@/lib/shared/known-infrastructure";

const LABELS: Record<string, string> = {
  supply: "Supply",
  withdraw: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
  liquidation: "Liquidated",
  transfer_in: "Transferred in",
  transfer_out: "Transferred out",
  swap: "Swap",
  bad_debt_written_off: "Debt written off",
};

const PAYOUT_LABELS = { claimed: "Claimed", received: "Received" } as const;

/** A transfer in from a distributor (lib/shared/known-infrastructure.ts) is a
 *  payout: "claimed" when the position's wallet sent the transaction, the
 *  sender the "by" chip reads; "received" when another account sent it or the
 *  sender is unknown. */
export function distributorPayout(
  ctx: AaveV3Context,
  owner: string | undefined,
  chainId: ChainId | undefined | null,
): "claimed" | "received" | undefined {
  if (ctx.eventType !== "transfer_in") return undefined;
  if (getProtocolContract(ctx.counterparty, chainId ?? MAINNET_CHAIN_ID)?.kind !== "distributor") return undefined;
  return owner && ctx.txFrom === owner.toLowerCase() ? "claimed" : "received";
}

/** The word T1 states for the row, which the phone spine view's caption
 *  repeats. A swap names its direction, sold → bought ("Debt swap GHO →
 *  cbBTC"); a supply from a swap sold the received side for the given. An
 *  aToken transfer to a WETH gateway is a withdrawal to ETH: the gateway
 *  withdraws it from the Pool and sends ETH on in the same transaction
 *  (WrappedTokenGatewayV3 withdrawETH), and the lifetime flows count it as
 *  withdrawn. The row says so, and names the gateway as the route. A
 *  distributor's payout reads "Claimed" or "Received" (`distributorPayout`). */
export function aaveV3CtLabel(
  ctx: AaveV3Context,
  isFee: boolean,
  chainId: ChainId | undefined | null,
  owner?: string,
): string {
  const sw = ctx.swap;
  const direction =
    sw && ctx.reserveSymbol && sw.receivedSymbol
      ? sw.kind === "supply_from_swap"
        ? `${sw.receivedSymbol} → ${ctx.reserveSymbol}`
        : `${ctx.reserveSymbol} → ${sw.receivedSymbol}`
      : null;
  const named = getProtocolContract(ctx.counterparty, chainId ?? MAINNET_CHAIN_ID);
  const viaGateway = !isFee && ctx.eventType === "transfer_out" && named?.kind === "gateway";
  const payout = distributorPayout(ctx, owner, chainId);
  return isFee
    ? "Liquidation fee"
    : viaGateway
      ? "Withdraw as ETH"
      : payout
        ? PAYOUT_LABELS[payout]
        : sw && AAVE_V3_SWAP_LABELS[sw.kind]
          ? `${AAVE_V3_SWAP_LABELS[sw.kind]}${direction ? ` ${direction}` : ""}`
          : (LABELS[ctx.eventType] ?? ctx.eventType);
}
