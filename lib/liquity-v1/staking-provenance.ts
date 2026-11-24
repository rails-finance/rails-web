// Receipts for the Liquity V1 LQTY stake page: LQTYStaking's getters at head
// (the chain lane), the index's sums over a stake's touches (rails-server mig
// 502), and one touch's fields from its logs.

import type { Provenance, ProvVerify } from "@/components/shared/provenance";
import { LIQUITY_V1_ADDRESSES } from "./asset-catalog";

const VIA = "GET /api/chain/liquity-v1/staking";
const INDEX_VIA = "GET /api/liquity-v1/staking/timeline";
const WALLET_VIA = "GET /api/chain/wallet/<address>";

const STAKING = { name: "Liquity V1 LQTYStaking", address: LIQUITY_V1_ADDRESSES.LQTY_STAKING };
const FEED = { name: "Liquity V1 PriceFeed", address: LIQUITY_V1_ADDRESSES.PRICE_FEED };

const ask = (method: string): ProvVerify => ({
  kind: "recompute",
  text: `To check: ask any Ethereum archive node for ${method} at the stamped block.`,
});

const GETTER: Record<"stake" | "lusdGain" | "ethGain", { method: string; summary: string }> = {
  stake: {
    method: "stakes(staker)",
    summary:
      "Stake — LQTYStaking's stakes(staker) at the latest block: the LQTY the staker has staked and not unstaked.",
  },
  lusdGain: {
    method: "getPendingLUSDGain(staker)",
    summary:
      "LUSD pending — LQTYStaking's getPendingLUSDGain(staker) at the latest block: the stake's share of the borrowing fees paid in since its last touch. The next touch pays it out.",
  },
  ethGain: {
    method: "getPendingETHGain(staker)",
    summary:
      "ETH pending — LQTYStaking's getPendingETHGain(staker) at the latest block: the stake's share of the redemption fees paid in since its last touch. The next touch pays it out.",
  },
};

/** An LQTYStaking getter at head. `wallet`: read by the wallet page's route
 *  at that block. */
export function stLiveProv(what: keyof typeof GETTER, wallet?: { block: number }): Provenance {
  const g = GETTER[what];
  return {
    kind: "chain",
    pclass: "state",
    verify: ask(g.method),
    summary: g.summary,
    contract: STAKING,
    via: wallet
      ? `${WALLET_VIA} · ${g.method} @ block ${wallet.block.toLocaleString("en-US")}`
      : `${VIA} · ${g.method} @ head`,
  };
}

/** The stake's share of all LQTY staked: the two getters and the division. */
export function stShareProv(stake: string, total: string, block: number): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    verify: ask("stakes(staker) and totalLQTYStaked()"),
    summary: "Share of the staked LQTY — the stake over all the LQTY staked, both at the stamped block.",
    contract: STAKING,
    source: { block },
    formula: "stakes(staker) ÷ totalLQTYStaked()",
    inputs: [
      { label: "Stake, stakes(staker), LQTY", value: stake, kind: "chain", pclass: "state" },
      { label: "All stakes, totalLQTYStaked(), LQTY", value: total, kind: "chain", pclass: "state" },
    ],
    via: `${VIA} · stakes(staker) ÷ totalLQTYStaked() @ head`,
  };
}

const SUM = {
  staked: "LQTY staked — the sum of every touch's stake increase: its StakeChanged less the stake before it.",
  unstaked: "LQTY unstaked — the sum of every touch's stake decrease: the stake before it less its StakeChanged.",
  stake:
    "Stake at the last touch — the _newStake of the stake's last StakeChanged: LQTYStaking's stakes(staker) since.",
  lusdGain: "LUSD paid at touches — the sum of every StakingGainsWithdrawn's LUSDGain.",
  ethGain: "ETH paid at touches — the sum of every StakingGainsWithdrawn's ETHGain.",
} as const;

/** An index sum: the stake page reads it from the timeline route, a listing
 *  row from the listing route. */
export function stSumProv(what: keyof typeof SUM, surface: "detail" | "listing" = "detail"): Provenance {
  return {
    kind: "derived",
    pclass: "indexed",
    summary: SUM[what],
    contract: STAKING,
    via: surface === "detail" ? `${INDEX_VIA} · position` : "GET /api/liquity-v1/staking?wallet=… · row",
  };
}

/** One touch's field, from its logs. */
export function stTouchProv(summary: string, txHash: string, block: string): Provenance {
  return {
    kind: "chain",
    pclass: "emitted",
    summary,
    contract: STAKING,
    source: { block, txHash },
  };
}

/** One touch's stake change, which LQTYStaking does not emit. */
export function stChangeProv(txHash: string, block: string, before: string, after: string): Provenance {
  return {
    kind: "chain-derived",
    pclass: "emitted",
    summary:
      "Staked or unstaked — the touch's StakeChanged _newStake, less the stake before it. LQTYStaking emits no amount moved.",
    formula: "_newStake − stake before",
    inputs: [
      { label: "stake before", value: before, kind: "derived", pclass: "indexed" },
      { label: "_newStake", value: after, kind: "chain", pclass: "emitted" },
    ],
    contract: STAKING,
    source: { block, txHash },
  };
}

/** ETH in USD at the PriceFeed, read with the stake. */
export function stFeedProv(stale: boolean, wallet?: { block: number }): Provenance {
  const method = stale ? "lastGoodPrice()" : "fetchPrice()";
  return {
    kind: "chain",
    pclass: "oracle",
    verify: ask(method),
    summary: stale
      ? "ETH in USD — the PriceFeed's lastGoodPrice() at the latest block: the price the protocol's last operation fetched."
      : "ETH in USD — the PriceFeed's fetchPrice(), simulated at the latest block: the price Liquity V1 would liquidate and redeem at now.",
    contract: FEED,
    via: wallet
      ? `${WALLET_VIA} · ${method} @ block ${wallet.block.toLocaleString("en-US")}`
      : `${VIA} · ${method} @ head`,
  };
}

/** A figure the index replays (rails-server mig 502); the logs emit none. */
export function stReplayedProv(summary: string, formula: string): Provenance {
  return { kind: "derived", pclass: "indexed", summary, formula, via: INDEX_VIA };
}
