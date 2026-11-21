// Receipts for the Liquity V1 stability-pool deposit page: the pool's getters
// at head (the chain lane), the index's sums over a deposit's touches
// (rails-server mig 499), and one touch's fields from its logs. The field
// meanings are rails-ops reference/liquity-v1-stability-pool.md.

import type { Provenance, ProvVerify } from "@/components/shared/provenance";
import { LIQUITY_V1_ADDRESSES } from "./asset-catalog";

const VIA = "GET /api/chain/liquity-v1/stability-pool";
const INDEX_VIA = "GET /api/liquity-v1/stability-pool/timeline";

const POOL = { name: "Liquity V1 StabilityPool", address: LIQUITY_V1_ADDRESSES.STABILITY_POOL };
const FEED = { name: "Liquity V1 PriceFeed", address: LIQUITY_V1_ADDRESSES.PRICE_FEED };

const ask = (method: string): ProvVerify => ({
  kind: "recompute",
  text: `To check: ask any Ethereum archive node for ${method} at the stamped block.`,
});

const GETTER: Record<"compounded" | "ethGain" | "lqtyGain" | "frontEnd", { method: string; summary: string }> = {
  compounded: {
    method: "getCompoundedLUSDDeposit(depositor)",
    summary:
      "Deposit now — the pool's getCompoundedLUSDDeposit(depositor) at the latest block: the LUSD recorded at the last touch, less what liquidations have burned since.",
  },
  ethGain: {
    method: "getDepositorETHGain(depositor)",
    summary:
      "ETH pending — the pool's getDepositorETHGain(depositor) at the latest block: the ETH liquidations have paid the deposit since its last touch. The next touch pays it out.",
  },
  lqtyGain: {
    method: "getDepositorLQTYGain(depositor)",
    summary:
      "LQTY pending — the pool's getDepositorLQTYGain(depositor) at the latest block: the LQTY issued to the deposit since its last touch, the front end's share taken out. The next touch pays it, with the issuance that touch triggers.",
  },
  frontEnd: {
    method: "deposits(depositor)",
    summary:
      "Front end — the frontEndTag in the pool's deposits(depositor) at the latest block: the front end the deposit was opened through, which takes its kickback share of the deposit's LQTY.",
  },
};

export function spLiveProv(what: keyof typeof GETTER): Provenance {
  const g = GETTER[what];
  return {
    kind: "chain",
    pclass: "state",
    verify: ask(g.method),
    summary: g.summary,
    contract: POOL,
    via: `${VIA} · ${g.method} @ head`,
  };
}

/** The pending loss: the recorded deposit less the deposit now. */
export function spPendingLossProv(): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    verify: ask("deposits(depositor) and getCompoundedLUSDDeposit(depositor)"),
    summary:
      "LUSD burned since the last touch — the initialValue in the pool's deposits(depositor), the deposit recorded at the last touch, less its getCompoundedLUSDDeposit(depositor), both at the latest block. The next touch writes it as the touch's LUSD loss.",
    contract: POOL,
    formula: "deposits(depositor).initialValue − getCompoundedLUSDDeposit(depositor)",
    via: `${VIA} @ head`,
  };
}

/** The deposit's share of the pool: the two getters and the division. */
export function spPoolShareProv(deposit: string, total: string, block: number): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    verify: ask("getCompoundedLUSDDeposit(depositor) and getTotalLUSDDeposits()"),
    summary: "Share of the pool — the deposit now over all the LUSD in the Stability Pool, both at the stamped block.",
    contract: POOL,
    source: { block },
    formula: "getCompoundedLUSDDeposit(depositor) ÷ getTotalLUSDDeposits()",
    inputs: [
      {
        label: "Deposit now, getCompoundedLUSDDeposit(depositor), LUSD",
        value: deposit,
        kind: "chain",
        pclass: "state",
      },
      { label: "All deposits, getTotalLUSDDeposits(), LUSD", value: total, kind: "chain", pclass: "state" },
    ],
    via: `${VIA} · getCompoundedLUSDDeposit(depositor) ÷ getTotalLUSDDeposits() @ head`,
  };
}

const SUM = {
  deposited:
    "LUSD deposited — the sum of every touch's top-up: its UserDepositChanged less the deposit before it, net of the loss.",
  withdrawn:
    "LUSD withdrawn — the sum of every touch's withdrawal: the deposit before it, less the loss, less its UserDepositChanged.",
  burned:
    "LUSD burned at touches — the sum of every ETHGainWithdrawn's _LUSDLoss: the deposit liquidations used, written at the next touch.",
  recorded:
    "Deposit at the last touch — the _newDeposit of the deposit's last UserDepositChanged: the pool's deposits(depositor) after the last touch.",
  ethGain: "ETH paid at touches — the sum of every ETHGainWithdrawn's _ETH.",
  lqtyGain:
    "LQTY paid at touches — the sum of every LQTYPaidToDepositor's _LQTY: the depositor's share, the front end's taken out.",
  frontEnd:
    "Front end — the FrontEndTagSet the pool emitted when the deposit's current life opened: the front end that takes its kickback share of the deposit's LQTY.",
} as const;

/** An index sum: the deposit page reads it from the timeline route, a
 *  listing row from the listing route. */
export function spSumProv(what: keyof typeof SUM, surface: "detail" | "listing" = "detail"): Provenance {
  return {
    kind: "derived",
    pclass: "indexed",
    summary: SUM[what],
    contract: POOL,
    via: surface === "detail" ? `${INDEX_VIA} · position` : "GET /api/liquity-v1/stability-pool?wallet=… · row",
  };
}

/** One touch's field, from its logs. */
export function spTouchProv(summary: string, txHash: string, block: string): Provenance {
  return {
    kind: "chain",
    pclass: "emitted",
    summary,
    contract: POOL,
    source: { block, txHash },
  };
}

/** One touch's deposit change, which the pool does not emit. */
export function spChangeProv(txHash: string, block: string, before: string, loss: string, after: string): Provenance {
  return {
    kind: "chain-derived",
    pclass: "emitted",
    summary:
      "Deposited or withdrawn — the touch's UserDepositChanged _newDeposit, less the deposit before it net of the ETHGainWithdrawn _LUSDLoss. The pool emits no amount moved.",
    formula: "_newDeposit − (deposit before − _LUSDLoss)",
    inputs: [
      { label: "deposit before", value: before, kind: "derived", pclass: "indexed" },
      { label: "_LUSDLoss", value: loss, kind: "chain", pclass: "emitted" },
      { label: "_newDeposit", value: after, kind: "chain", pclass: "emitted" },
    ],
    contract: POOL,
    source: { block, txHash },
  };
}

/** ETH in USD at the PriceFeed, read with the deposit. */
export function spFeedProv(stale: boolean): Provenance {
  return {
    kind: "chain",
    pclass: "oracle",
    verify: ask(stale ? "lastGoodPrice()" : "fetchPrice()"),
    summary: stale
      ? "ETH in USD — the PriceFeed's lastGoodPrice() at the latest block: the price the protocol's last operation fetched."
      : "ETH in USD — the PriceFeed's fetchPrice(), simulated at the latest block: the price Liquity V1 would liquidate and redeem at now.",
    contract: FEED,
    via: `${VIA} · ${stale ? "lastGoodPrice()" : "fetchPrice()"} @ head`,
  };
}

/** A figure the index replays (rails-server mig 499); the logs emit none. */
export function spReplayedProv(summary: string, formula: string): Provenance {
  return { kind: "derived", pclass: "indexed", summary, formula, via: INDEX_VIA };
}
