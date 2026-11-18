// Receipts for the Liquity V2 stability-pool deposit page: the branch pool's
// getters at head (the chain lane), the index's sums over a deposit's rows
// (rails-server migs 490 and 491), and one operation's fields from its log.
// The field meanings are rails-ops reference/liquity-v2-stability-pool-deposits.md.

import type { Provenance, ProvVerify } from "@/components/shared/provenance";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import { LIQUITY_V2_SP_POOLS } from "./sp-catalog";
import type { SpBranch } from "./sp-routes";

const VIA = "GET /api/chain/liquity-v2/stability-pool";

const pool = (b: SpBranch) => ({ name: `Liquity V2 ${b} StabilityPool`, address: LIQUITY_V2_SP_POOLS[b] });
const feed = (b: SpBranch) => ({
  name: `Liquity V2 ${b} PriceFeed`,
  address: LIQUITY_V2_BRANCHES[b.toLowerCase()].priceFeed,
});

const ask = (method: string): ProvVerify => ({
  kind: "recompute",
  text: `To check: ask any Ethereum archive node for ${method} at the stamped block.`,
});

const GETTER: Record<
  "compounded" | "yieldGain" | "pendingColl" | "collGain",
  { method: string; summary: (coll: string) => string }
> = {
  compounded: {
    method: "getCompoundedBoldDeposit(depositor)",
    summary: () =>
      "Deposit now — the pool's getCompoundedBoldDeposit(depositor) at the latest block: the BOLD recorded at the last touch, less what liquidations have burned since.",
  },
  yieldGain: {
    method: "getDepositorYieldGainWithPending(depositor)",
    summary: () =>
      "BOLD yield pending — the pool's getDepositorYieldGainWithPending(depositor) at the latest block: the yield the branch's interest has paid the deposit since its last touch, the interest not yet minted included. The next touch pays it; what that touch does not claim joins the deposit.",
  },
  pendingColl: {
    method: "getDepositorCollGain(depositor) + stashedColl(depositor)",
    summary: (c) =>
      `${c} pending — the pool's getDepositorCollGain(depositor), the ${c} liquidations have paid the deposit since its last touch, plus stashedColl(depositor), the ${c} earlier touches left unclaimed, both at the latest block.`,
  },
  collGain: {
    method: "getDepositorCollGain(depositor)",
    summary: (c) =>
      `${c} paid in since last touch — the pool's getDepositorCollGain(depositor) at the latest block: the ${c} liquidations have paid the deposit since its last touch, which the next touch writes.`,
  },
};

export function spLiveProv(what: keyof typeof GETTER, branch: SpBranch): Provenance {
  const g = GETTER[what];
  return {
    kind: "chain",
    pclass: "state",
    verify: ask(g.method),
    summary: g.summary(branch),
    contract: pool(branch),
    via: `${VIA} · ${g.method} @ head`,
  };
}

/** The pending loss: the recorded deposit less the deposit now. */
export function spPendingLossProv(branch: SpBranch): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    verify: ask("deposits(depositor) and getCompoundedBoldDeposit(depositor)"),
    summary:
      "BOLD burned since the last touch — the pool's deposits(depositor), the deposit recorded at the last touch, less its getCompoundedBoldDeposit(depositor), both at the latest block. The next touch writes it as the operation's deposit loss.",
    contract: pool(branch),
    formula: "deposits(depositor) − getCompoundedBoldDeposit(depositor)",
    via: `${VIA} @ head`,
  };
}

/** The deposit's share of its pool: the two getters and the division. */
export function spPoolShareProv(branch: SpBranch, deposit: string, total: string, block: number): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    verify: ask("getCompoundedBoldDeposit(depositor) and getTotalBoldDeposits()"),
    summary: `Share of the pool — the deposit now over all the BOLD in the ${branch} Stability Pool, both at the stamped block.`,
    contract: pool(branch),
    source: { block },
    formula: "getCompoundedBoldDeposit(depositor) ÷ getTotalBoldDeposits()",
    inputs: [
      {
        label: "Deposit now, getCompoundedBoldDeposit(depositor), BOLD",
        value: deposit,
        kind: "chain",
        pclass: "state",
      },
      { label: "All deposits, getTotalBoldDeposits(), BOLD", value: total, kind: "chain", pclass: "state" },
    ],
    via: `${VIA} · getCompoundedBoldDeposit(depositor) ÷ getTotalBoldDeposits() @ head`,
  };
}

const SUM: Record<string, (c: string) => string> = {
  deposited: () => "BOLD deposited — the sum of every DepositOperation's positive topUpOrWithdrawal on this deposit.",
  withdrawn: () => "BOLD withdrawn — the sum of every DepositOperation's negative topUpOrWithdrawal on this deposit.",
  burned: () =>
    "BOLD burned at touches — the sum of every DepositOperation's depositLossSinceLastOperation: the deposit liquidations used, written at the next touch.",
  kept: () =>
    "Yield kept — the sum of every DepositOperation's yieldGainSinceLastOperation less its yieldGainClaimed: the BOLD yield the touches added to the deposit.",
  recorded: () =>
    "Deposit at the last touch — the deposit before each operation, less its loss, plus its top-up or withdrawal and its yield kept, replayed from the first operation: the pool's deposits(depositor) after the latest one.",
  yieldGain: () => "BOLD yield paid at touches — the sum of every DepositOperation's yieldGainSinceLastOperation.",
  yieldClaimed: () => "BOLD yield claimed — the sum of every DepositOperation's yieldGainClaimed.",
  collGain: (c) => `${c} paid in at touches — the sum of every DepositOperation's ethGainSinceLastOperation.`,
  collClaimed: (c) =>
    `${c} claimed — the sum of every DepositOperation's ethGainClaimed, which includes the stash from earlier touches.`,
  stash: (c) =>
    `${c} stashed — the ${c} paid in at touches less what they sent, replayed from the first operation: the pool's stashedColl(depositor) after the latest one.`,
};

export function spSumProv(what: keyof typeof SUM, branch: SpBranch): Provenance {
  return {
    kind: "derived",
    pclass: "indexed",
    summary: SUM[what](branch),
    contract: pool(branch),
    via: "GET /api/liquity-v2/stability-pool/timeline · position",
  };
}

/** One operation's field, from its log. */
export function spTouchProv(summary: string, txHash: string, block: string, branch: SpBranch): Provenance {
  return {
    kind: "chain",
    pclass: "emitted",
    summary,
    contract: pool(branch),
    source: { block, txHash },
  };
}

/** The branch's collateral in USD at its PriceFeed, read with the deposit. */
export function spFeedProv(branch: SpBranch, stale: boolean): Provenance {
  return {
    kind: "chain",
    pclass: "oracle",
    verify: ask(stale ? "lastGoodPrice()" : "fetchPrice()"),
    summary: stale
      ? `${branch} in USD — the branch PriceFeed's lastGoodPrice() at the latest block: the price the branch's last operation fetched.`
      : `${branch} in USD — the branch PriceFeed's fetchPrice(), simulated at the latest block: the price the branch would liquidate and redeem at now.`,
    contract: feed(branch),
    via: `${VIA} · ${stale ? "lastGoodPrice()" : "fetchPrice()"} @ head`,
  };
}
