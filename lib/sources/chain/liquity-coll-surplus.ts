// A liquidated Liquity-V2-architecture Trove's collateral surplus, read at the
// head: is it still claimable, or has the owner claimed it? Shared by Liquity
// V2 and its forks (Asymmetry, Ebisu, Basedollar), which run the same
// CollSurplusPool.
//
// The index records the surplus the Liquidation log credited, but not the
// claim: BorrowerOperations.claimCollateral() pays the owner's whole pool
// balance out and emits nothing on the TroveManager. So the replayed figure
// alone cannot say whether the collateral is still there. This reader:
//
//   1. finds the branch's CollSurplusPool in the liquidation transaction — the
//      contract that emitted CollBalanceUpdated(owner, …) — and accepts it only
//      when its troveManagerAddress() is the branch's TroveManager;
//   2. takes this Trove's surplus as the owner's pool balance after the
//      liquidation minus the balance one block before it;
//   3. looks for a later CollBalanceUpdated(owner, 0) — the claim, which
//      empties the balance in one call — and reads getCollateral(owner) at
//      the head. The balance the log before it recorded is what the claim
//      paid out: this Trove's surplus plus any other the same owner had
//      waiting in the pool, since claimColl pays the account's whole balance.
//
// rails-server's `/api/at-block/liquity-family/coll-surplus` reads it (its
// services/liquity-coll-surplus.ts): the receipt, the pool's TroveManager,
// the balance one block before, the claim's logs to the finalized block, its
// time and price are each kept once (server migs 412, 413, 417; rails-ops
// decisions/0056); the head balance and the logs past the finalized block are
// read on every request.
//
// SERVER-ONLY.

import { atBlockGet } from "./at-block-api";
import type { ChainId } from "@/lib/shared/chains";

/** The claim, when the pool's log search answered; a balance below the
 *  surplus with no log to date it reads as claimed with these fields null. */
export interface CollSurplusClaim {
  block: number | null;
  txHash: string | null;
  timestamp: number | null;
  /** The claim log's index in its block, to order it among same-block rows. */
  logIndex?: number | null;
  /** What the claim paid out in all: the owner's pool balance the log before
   *  it recorded (integer string). Above `surplusRaw` when the same claim
   *  also paid out other Troves' surplus. Null when no log dated the claim. */
  paidRaw?: string | null;
  /** The branch PriceFeed's lastGoodPrice at the end of the claim's block
   *  (integer string, scaled 1e(36 − collateral decimals)), and the feed read.
   *  Absent when the caller named no feed or the read failed. */
  priceRaw?: string | null;
  priceFeed?: string | null;
}

export interface CollSurplusRead {
  /** Head block the balance was read at. */
  blockNumber: number;
  /** The branch's CollSurplusPool; null when the liquidation credited no surplus. */
  pool: string | null;
  /** This Trove's surplus as the liquidation credited it (integer string). */
  surplusRaw: string;
  /** The owner's whole pool balance at the head (integer string). */
  balanceRaw: string;
  /** What the owner can still claim of this Trove's surplus (integer string). */
  claimableRaw: string;
  decimals: number;
  claimed: CollSurplusClaim | null;
}

export function readTroveCollSurplus(
  args: {
    chainId: ChainId;
    troveManager: string;
    owner: string;
    liquidationTx: string;
    decimals: number;
    /** The branch's PriceFeed: when named, the claim carries its lastGoodPrice
     *  at the claim's block. */
    priceFeed?: string;
  },
  readerIp?: string,
): Promise<CollSurplusRead> {
  const qs = new URLSearchParams({
    chain: String(args.chainId),
    troveManager: args.troveManager.toLowerCase(),
    owner: args.owner.toLowerCase(),
    tx: args.liquidationTx,
    decimals: String(args.decimals),
  });
  if (args.priceFeed) qs.set("priceFeed", args.priceFeed);
  return atBlockGet<CollSurplusRead>("liquity-family/coll-surplus", qs, readerIp);
}
