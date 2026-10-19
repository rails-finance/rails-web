// Alchemix's timeline head as words (rails-ops decision 0045, TO-DO-ui-jobs
// 367): the Alchemist V3, the Transmuter and the V2 Alchemist. The kind is a
// past participle, the legs of one transaction in log order where the kind
// alone says nothing; a transfer's counterparty is its clause. The figures are
// on the spine's flank, the Figures sheet and the Explanation. Read by the
// headers (client) and by lib/alchemix/event-label.ts (the server's page
// title where the card has no teaser).

import type { AlchemixV2Context, AlchemixV3Context } from "@/lib/shared/types/event-shape";

export const ALCHEMIX_HEAD_WORDS = {
  sep: "·",
  opened: "Opened position",
  deposited: "Deposited",
  withdrew: "Withdrew",
  minted: "Minted",
  burned: "Burned",
  repaid: "Repaid",
  forceRepaid: "Force-repaid",
  /** A self-liquidation: the holder closed the position and its collateral
   *  paid the debt. */
  closedWithCollateral: "Closed with collateral",
  liquidated: "Liquidated",
  repaymentFee: "Repayment fee paid",
  mintedPosition: "Minted position",
  forwardedPosition: "Forwarded position",
  burnedPosition: "Burned position",
  transferred: "Transferred",
  redeemed: "Redeemed",
  batchLiquidated: "Batch liquidated",
  feeShortfall: "Fee shortfall paid",
  /** The Transmuter. */
  staked: "Staked",
  claimed: "Claimed",
  poked: "Poked",
  /** V2: the holder's own Liquidate sells their collateral to repay. */
  repaidFromCollateral: "Repaid from collateral",
  /** The version marker on a timeline carrying both. */
  v2: "V2",
} as const;

const W = ALCHEMIX_HEAD_WORDS;

/** One Alchemist (V3) or Transmuter leg's kind. A transfer's depends on what
 *  the transfer was: the position NFT's mint, a forwarding hop of the opening,
 *  the NFT's burn, or a change of hands. */
export function alchemixLegKind(ctx: AlchemixV3Context, transfer?: { forwarding?: boolean }): string {
  switch (ctx.eventType) {
    case "deposit":
      return W.deposited;
    case "withdraw":
      return W.withdrew;
    case "mint":
      return W.minted;
    case "burn":
      return W.burned;
    case "repay":
      return W.repaid;
    case "force_repay":
      return W.forceRepaid;
    case "self_liquidated":
      return W.closedWithCollateral;
    case "liquidated":
      return W.liquidated;
    case "repayment_fee":
      return W.repaymentFee;
    case "transfer":
      if (ctx.transfer?.transferType === "mint") return W.mintedPosition;
      if (ctx.transfer?.transferType === "burn") return W.burnedPosition;
      return transfer?.forwarding ? W.forwardedPosition : W.transferred;
    case "redemption":
      return W.redeemed;
    case "batch_liquidated":
      return W.batchLiquidated;
    case "fee_shortfall":
      return W.feeShortfall;
    case "transmuter_position_created":
      return W.staked;
    case "transmuter_position_claimed":
      return W.claimed;
    case "transmuter_position_poked":
      return W.poked;
  }
}

/** The move legs whose participles join into a combined row's kind. */
export const ALCHEMIX_AXIS_KINDS = new Set(["deposit", "withdraw", "mint", "burn"]);

/** A V2 row's kind. */
export function alchemixV2Kind(ctx: AlchemixV2Context): string {
  switch (ctx.eventType) {
    case "deposit":
      return W.deposited;
    case "withdraw":
      return W.withdrew;
    case "mint":
      return W.minted;
    case "burn":
      return W.burned;
    case "repay":
      return W.repaid;
    case "liquidate":
      return W.repaidFromCollateral;
    default:
      return W.repaid;
  }
}

/** A Transmuter card's kind: the stake, the claim, a poke, else the NFT's last
 *  move. */
export function transmuterKind(legs: { context: { data: AlchemixV3Context } }[]): string {
  const of = (type: string) => legs.find((l) => l.context.data.eventType === type);
  if (of("transmuter_position_created")) return W.staked;
  if (of("transmuter_position_claimed")) return W.claimed;
  if (of("transmuter_position_poked")) return W.poked;
  const transfers = legs.filter((l) => l.context.data.eventType === "transfer");
  const last = transfers[transfers.length - 1];
  return last ? alchemixLegKind(last.context.data) : W.transferred;
}
