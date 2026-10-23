// The word T1 states for an Aave V3 row, which the event page's h1 and its
// browser title repeat. Server-safe: the event page's metadata reads it.

import type { AaveV3Context } from "@/lib/shared/types/protocols/aave-v3";
import { AAVE_V3_SWAP_LABELS } from "@/lib/aave-v3/swap-kinds";
import { MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { getProtocolContract, type ProtocolContract } from "@/lib/shared/known-infrastructure";

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

const STAKED_LABEL = "Staked";
const MIGRATED_LABEL = "Migrated from";

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

/** A transfer out to a staking contract (lib/shared/known-infrastructure.ts)
 *  is a stake: Aave's Umbrella batch helper takes the aTokens and stakes
 *  them. A liquidation's fee transfer is never one. */
export function stakedVia(ctx: AaveV3Context, isFee: boolean, chainId: ChainId | undefined | null): boolean {
  if (isFee || ctx.eventType !== "transfer_out") return false;
  return getProtocolContract(ctx.counterparty, chainId ?? MAINNET_CHAIN_ID)?.kind === "staking";
}

/** The known contract a supply, borrow or repay went through: the Pool's
 *  caller (Supply/Borrow `user`, Repay `repayer`) where the registry names it
 *  and it is not the position's wallet. The head reads "Supplied · via
 *  <name>"; the "by" chip and the third-party test still read the signer. */
export function poolCallerContract(
  ctx: AaveV3Context,
  owner: string | undefined,
  chainId: ChainId | undefined | null,
): ProtocolContract | undefined {
  if (ctx.eventType !== "supply" && ctx.eventType !== "borrow" && ctx.eventType !== "repay") return undefined;
  if (!ctx.poolCaller || (owner && ctx.poolCaller === owner.toLowerCase())) return undefined;
  return getProtocolContract(ctx.poolCaller, chainId ?? MAINNET_CHAIN_ID);
}

/** The known contract a withdrawal was paid to: the Withdraw log's `to` where
 *  the registry names it and it is not the position's wallet. The head reads
 *  "Withdrew · to <name>". A WETH gateway is left out: the ETH came back to the
 *  wallet, and the row reads as a plain withdrawal.
 *
 *  A withdrawal reads, in order: to a WETH gateway (plain), to a known contract
 *  (this), plain. That is the transfer-out order (a liquidation's fee, the WETH
 *  gateway, a sale, a stake, a plain transfer) less the readings a Withdraw log
 *  cannot carry: the fee, the sale and the stake are aToken transfers. */
export function withdrawRecipient(
  ctx: AaveV3Context,
  owner: string | undefined,
  chainId: ChainId | undefined | null,
): ProtocolContract | undefined {
  if (ctx.eventType !== "withdraw" || !ctx.recipient) return undefined;
  if (owner && ctx.recipient === owner.toLowerCase()) return undefined;
  const named = getProtocolContract(ctx.recipient, chainId ?? MAINNET_CHAIN_ID);
  return named && named.kind !== "gateway" ? named : undefined;
}

/** The word T1 states for the row, which the phone spine view's caption
 *  repeats. A swap names its direction, sold → bought ("Debt swap GHO →
 *  cbBTC"); a supply from a swap sold the received side for the given. An
 *  aToken transfer to a WETH gateway is a withdrawal to ETH: the gateway
 *  withdraws it from the Pool and sends ETH on in the same transaction
 *  (WrappedTokenGatewayV3 withdrawETH), and the lifetime flows count it as
 *  withdrawn. The row says so, and names the gateway as the route. A
 *  distributor's payout reads "Claimed" or "Received" (`distributorPayout`),
 *  a stake "Staked" (`stakedVia`), and a supply or borrow a migration helper
 *  made "Migrated from Aave V2" (`migratesFrom` on the Pool caller). A
 *  transfer out the receipt shows as a sale through a router names what was
 *  sold and what came back ("Sold USDC → ETH", `ctx.sale`). */
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
  const migratedFrom = poolCallerContract(ctx, owner, chainId)?.migratesFrom;
  if (!isFee && ctx.eventType === "transfer_out" && ctx.sale)
    return `Sold${ctx.reserveSymbol ? ` ${ctx.reserveSymbol} → ${ctx.sale.leg.symbol}` : ""}`;
  return isFee
    ? "Liquidation fee"
    : viaGateway
      ? "Withdraw as ETH"
      : payout
        ? PAYOUT_LABELS[payout]
        : stakedVia(ctx, isFee, chainId)
          ? STAKED_LABEL
          : migratedFrom
            ? `${MIGRATED_LABEL} ${migratedFrom}`
            : sw && AAVE_V3_SWAP_LABELS[sw.kind]
              ? `${AAVE_V3_SWAP_LABELS[sw.kind]}${direction ? ` ${direction}` : ""}`
              : (LABELS[ctx.eventType] ?? ctx.eventType);
}
