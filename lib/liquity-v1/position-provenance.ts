// Provenance vocabulary for the Liquity V1 live-position view — the state-read
// builders behind the risk surfaces (collateral ratio, liquidation price,
// redemption queue, system state). The event-level vocabulary stays in
// ./event-provenance; this file covers only live eth_calls at the latest block
// against the fixed singleton contracts (every address chain-verified by
// scripts/verify-liquity-v1-chain.mjs).
//
// V1's ratio story is stronger than the Aave-family cards': the collateral
// ratio is not client arithmetic — TroveManager.getCurrentICR computes it on
// the contract itself, so it ships as kind "chain". Only the liquidation price
// (a rearrangement of the same equation) and the redemption-queue sums are
// "chain-derived".
//
// Two lanes live here, each naming its own route in `via`:
//   • the POSITION lane (/api/chain/liquity-v1/position) — one Trove,
//   • the SYSTEM lane (/api/chain/liquity-v1/system) — the whole protocol at
//     one head block, behind the protocol view (see the section at the foot).

import type { Provenance, ProvVerify } from "@/components/shared/provenance";
import { LIQUITY_V1_ADDRESSES } from "./asset-catalog";

const TROVE_MANAGER: Provenance["contract"] = {
  name: "Liquity V1 TroveManager",
  address: LIQUITY_V1_ADDRESSES.TROVE_MANAGER,
};
const PRICE_FEED: Provenance["contract"] = {
  name: "Liquity V1 PriceFeed",
  address: LIQUITY_V1_ADDRESSES.PRICE_FEED,
};
const MULTI_TROVE_GETTER: Provenance["contract"] = {
  name: "Liquity V1 MultiTroveGetter",
  address: LIQUITY_V1_ADDRESSES.MULTI_TROVE_GETTER,
};
const STABILITY_POOL: Provenance["contract"] = {
  name: "Liquity V1 StabilityPool",
  address: LIQUITY_V1_ADDRESSES.STABILITY_POOL,
};

const STATE_VERIFY: ProvVerify = {
  kind: "recompute",
  text: "Re-run the eth_call against any node",
};

const CHAIN_VIA = "GET /api/chain/liquity-v1/position";

/** The protocol's own ETH:USD price — PriceFeed.fetchPrice() simulated via
 *  eth_call at the latest block: the exact price a liquidation or redemption
 *  would use this block (Chainlink with a Tellor fallback, the protocol's own
 *  selection logic). */
export function protocolPriceProv(): Provenance {
  return {
    kind: "chain",
    pclass: "oracle",
    verify: STATE_VERIFY,
    summary:
      "ETH price in USD — the protocol's own PriceFeed.fetchPrice() simulated at the latest block: the exact price Liquity's liquidation and redemption paths would use this block (Chainlink, with a Tellor fallback, selected by the protocol's own logic — not a market-price cache).",
    contract: PRICE_FEED,
    via: `${CHAIN_VIA} · PriceFeed.fetchPrice @ head (eth_call simulation) · ÷10^18`,
  };
}

/** The Trove's ENTIRE collateral — getEntireDebtAndColl at the latest block,
 *  pending redistribution included: the balance the protocol's own liquidation
 *  and redemption paths act on. Preferred over the last recorded TroveUpdated
 *  absolute on the live card face — the captured index is frozen while the
 *  protocol moves, so the two can differ. */
export function entireCollateralProv(blockNumber?: number): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: STATE_VERIFY,
    summary:
      "ETH collateral the Trove holds — TroveManager.getEntireDebtAndColl at the latest block, pending redistribution from past liquidations included: the balance the protocol's own liquidation and redemption paths act on. Read live from the chain, so it reflects every operation and redemption since the captured history's last event.",
    contract: TROVE_MANAGER,
    via: `${CHAIN_VIA} · TroveManager.getEntireDebtAndColl(borrower)${blockNumber ? ` @ block ${blockNumber}` : " @ head"} · ÷10^18`,
  };
}

/** The Trove's ENTIRE debt — same read, same basis; interest-free, so exact. */
export function entireDebtProv(blockNumber?: number): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: STATE_VERIFY,
    summary:
      "LUSD debt the Trove owes — TroveManager.getEntireDebtAndColl at the latest block, pending redistribution included: the exact obligation the protocol's own ratio checks measure (Liquity V1 charges no ongoing interest). Read live from the chain, so it reflects every operation and redemption since the captured history's last event.",
    contract: TROVE_MANAGER,
    via: `${CHAIN_VIA} · TroveManager.getEntireDebtAndColl(borrower)${blockNumber ? ` @ block ${blockNumber}` : " @ head"} · ÷10^18`,
  };
}

/** The Trove's current individual collateral ratio — computed BY the
 *  TroveManager itself (getCurrentICR = entire collateral × price ÷ entire
 *  debt), so a direct chain read, not client arithmetic. */
export function icrProv(): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: STATE_VERIFY,
    summary:
      "Collateral ratio — TroveManager.getCurrentICR for this borrower at the latest block: the contract's own ratio (entire collateral × PriceFeed price ÷ entire debt, pending redistribution rewards included). The same figure the liquidation path checks against the 110% minimum.",
    contract: TROVE_MANAGER,
    via: `${CHAIN_VIA} · TroveManager.getCurrentICR(borrower, price) @ head · ÷10^18`,
    inputs: [
      { label: "price", kind: "chain", pclass: "oracle", note: "PriceFeed.fetchPrice @ head" },
      { label: "entire coll / debt", kind: "chain", pclass: "state", note: "getEntireDebtAndColl @ head" },
    ],
  };
}

/** A chain-verified protocol constant (MCR 110% / CCR 150%) — a public constant
 *  getter on the TroveManager. */
export function ratioConstantProv(what: string, getter: string): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: STATE_VERIFY,
    summary: `${what} — a public constant on the TroveManager (${getter}), chain-verified. Fixed for the life of the protocol.`,
    contract: TROVE_MANAGER,
    via: `TroveManager.${getter} · ÷10^18 (chain-verified constant)`,
  };
}

/** The ETH price at which this Trove's ratio hits the 110% minimum — the
 *  liquidation equation rearranged for price: debt × MCR ÷ collateral, every
 *  input a chain read at the same block. */
export function liquidationPriceProv(ops?: { debt?: number; coll?: number }): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    verify: STATE_VERIFY,
    summary:
      "Liquidation price — the ETH price at which this Trove's collateral ratio reaches the 110% minimum, from the protocol's own liquidation equation rearranged for price. Every input is a chain read at the same block (entire debt/collateral, the MCR constant).",
    contract: TROVE_MANAGER,
    via: `${CHAIN_VIA} · derived from getEntireDebtAndColl @ head + MCR`,
    formula: "entire debt × MCR ÷ entire collateral",
    inputs: [
      {
        label: "entire debt",
        value: ops?.debt != null ? String(ops.debt) : undefined,
        kind: "chain",
        pclass: "state",
        note: "getEntireDebtAndColl @ head",
      },
      {
        label: "entire collateral",
        value: ops?.coll != null ? String(ops.coll) : undefined,
        kind: "chain",
        pclass: "state",
        note: "getEntireDebtAndColl @ head",
      },
      { label: "MCR", value: "1.10", kind: "chain", pclass: "state", note: "TroveManager.MCR constant" },
    ],
  };
}

/** LUSD the Trove could still draw before its ratio hits the active minimum
 *  (110%, or 150% while the system is in recovery mode) — the ratio equation
 *  rearranged for debt, every input a chain read at the same block. */
export function borrowHeadroomProv(threshold: string): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    verify: STATE_VERIFY,
    summary: `Borrowing headroom — the additional LUSD this Trove could owe before its collateral ratio falls to the ${threshold} minimum, from the ratio equation rearranged for debt. Every input is a chain read at the same block (entire collateral, the PriceFeed price, the ratio constant). A ceiling, not an offer — the one-time borrowing fee adds to any new draw.`,
    contract: TROVE_MANAGER,
    via: `${CHAIN_VIA} · derived from getEntireDebtAndColl + PriceFeed @ head`,
    formula: `entire collateral × price ÷ ${threshold} − entire debt`,
    inputs: [
      { label: "entire collateral", kind: "chain", pclass: "state", note: "getEntireDebtAndColl @ head" },
      { label: "price", kind: "chain", pclass: "oracle", note: "PriceFeed.fetchPrice @ head" },
      { label: "entire debt", kind: "chain", pclass: "state", note: "getEntireDebtAndColl @ head" },
    ],
  };
}

/** A system-wide state read — the total collateral ratio, the recovery-mode
 *  flag, or the open-trove count. */
export function systemStateProv(what: string, call: string): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: STATE_VERIFY,
    summary: `${what} — read from the TroveManager at the latest block (${call}). System-wide protocol state, not this Trove's own.`,
    contract: TROVE_MANAGER,
    via: `${CHAIN_VIA} · TroveManager.${call} @ head`,
  };
}

/** The runway fraction — debt in front restated against the whole queue. */
export function queueShareProv(): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    verify: STATE_VERIFY,
    summary:
      "Share of the redemption queue in front of this Trove — debt in front ÷ the total recorded debt across the protocol's own SortedTroves list, both summed from the same MultiTroveGetter sweep at the same block. This is the redemption runway's fill: redemptions repay from the front of the queue (lowest collateral ratio first), so a larger share is a longer runway before they reach this Trove.",
    contract: MULTI_TROVE_GETTER,
    via: `${CHAIN_VIA} · MultiTroveGetter sweep of SortedTroves @ head · derived ratio`,
    formula: "debt in front ÷ Σ debt of all listed troves",
    inputs: [
      { label: "debt in front", kind: "chain-derived", pclass: "state", note: "Σ debt below this Trove" },
      { label: "queue total", kind: "chain-derived", pclass: "state", note: "Σ debt of the whole list" },
    ],
  };
}

// ── The system lane — /api/chain/liquity-v1/system ───────────────────────────
//
// The protocol view's builders: the same singleton contracts, read for the
// whole system at one head block rather than for one Trove. Each names the
// system route in `via`, so a receipt says which request delivered the figure.
//
// V1's shape drives the vocabulary here. There are no branches to compare and
// no user-set rates: redemptions take the LOWEST COLLATERAL RATIO first, so a
// Trove's queue position is an outcome (price × its own collateral), not a
// choice — and the only rate-like quantities are protocol-wide, decaying from
// one shared base rate. The V2 family's "a higher rate buys a later place"
// simply has no counterpart, and these summaries say so rather than borrowing
// the phrasing.

const SYSTEM_VIA = "GET /api/chain/liquity-v1/system";

/** A system-wide aggregate or verdict on the system lane — total collateral /
 *  debt, the TCR, the recovery-mode flag, the open-Trove count. */
export function systemLaneProv(what: string, call: string, note?: string): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: STATE_VERIFY,
    summary: `${what} — read from the TroveManager at the latest block (${call}). System-wide protocol state${note ? `. ${note}` : ", not any one Trove's"}.`,
    contract: TROVE_MANAGER,
    via: `${SYSTEM_VIA} · TroveManager.${call} @ head`,
  };
}

/** The protocol's own ETH:USD price on the system lane. */
export function systemPriceProv(stale: boolean): Provenance {
  return {
    kind: "chain",
    pclass: "oracle",
    verify: STATE_VERIFY,
    summary: stale
      ? "ETH price in USD — the PriceFeed's lastGoodPrice: the last value a user operation fetched (the live fetchPrice simulation failed on this read). Treat it as the protocol's most recent price, not this block's."
      : "ETH price in USD — the protocol's own PriceFeed.fetchPrice() simulated at the latest block: the exact price Liquity's liquidation and redemption paths would use this block (Chainlink, with a Tellor fallback, selected by the protocol's own logic — not a market-price cache). Every ratio on this page is measured at it.",
    contract: PRICE_FEED,
    via: `${SYSTEM_VIA} · PriceFeed.${stale ? "lastGoodPrice" : "fetchPrice"} @ head · ÷10^18`,
  };
}

/** The system's total collateral ratio — the TroveManager's own getTCR at its
 *  own price, and the quantity recovery mode turns on. */
export function systemTcrProv(): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: STATE_VERIFY,
    summary:
      "Total collateral ratio — TroveManager.getTCR at the protocol's own price, computed by the contract itself: the entire system's collateral value against its entire LUSD debt. Below the 150% critical ratio the system enters recovery mode, where the liquidation line rises from 110% to the TCR itself and borrowing is restricted.",
    contract: TROVE_MANAGER,
    via: `${SYSTEM_VIA} · TroveManager.getTCR(price) @ head · ÷10^18`,
    inputs: [
      { label: "price", kind: "chain", pclass: "oracle", note: "PriceFeed.fetchPrice @ head" },
      {
        label: "system coll / debt",
        kind: "chain",
        pclass: "state",
        note: "getEntireSystemColl / getEntireSystemDebt",
      },
    ],
  };
}

/** The shared base rate — V1's one rate-like protocol quantity. */
export function baseRateProv(): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: STATE_VERIFY,
    summary:
      "The base rate — TroveManager.baseRate at the latest block. Liquity V1 has no per-Trove interest rate: this single protocol-wide value is what both fees derive from. Redeeming raises it (in proportion to how much of the supply was redeemed) and time decays it back toward zero, so it reads as a measure of recent redemption pressure rather than a price anyone sets.",
    contract: TROVE_MANAGER,
    via: `${SYSTEM_VIA} · TroveManager.baseRate @ head · ÷10^18`,
  };
}

/** A current fee rate with decay applied, on the system lane. */
export function systemFeeRateProv(what: string, call: string): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: STATE_VERIFY,
    summary: `${what} — TroveManager.${call} at the latest block: the contract's own current rate (the shared base rate with time decay applied). A one-time fee, not an ongoing interest rate — V1 charges no interest.`,
    contract: TROVE_MANAGER,
    via: `${SYSTEM_VIA} · TroveManager.${call} @ head · ÷10^18`,
  };
}

/** The Stability Pool's LUSD — the liquidation backstop's depth. */
export function stabilityPoolProv(): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: STATE_VERIFY,
    summary:
      "LUSD in the Stability Pool — StabilityPool.getTotalLUSDDeposits at the latest block. This is the protocol's first line against liquidations: a liquidated Trove's debt is cancelled against these deposits and its ETH handed to the depositors. What the pool can't absorb is redistributed to the remaining Troves instead, which is why its depth is a system fact and not a depositor's private one.",
    contract: STABILITY_POOL,
    via: `${SYSTEM_VIA} · StabilityPool.getTotalLUSDDeposits @ head · ÷10^18`,
  };
}

/** SP depth against system debt — the absorption headroom. */
export function spCoverageProv(): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    verify: STATE_VERIFY,
    summary:
      "Share of the system's debt the Stability Pool could absorb — pool deposits ÷ entire system debt, both read at the same block. Not a prediction: liquidations arrive one Trove at a time and only ever need to absorb the ones below the minimum ratio. It states how deep the backstop is against the whole book, which is the bound on how much could ever be redistributed to other Troves instead.",
    contract: STABILITY_POOL,
    via: `${SYSTEM_VIA} · derived ratio`,
    formula: "Stability Pool deposits ÷ entire system debt",
    inputs: [
      { label: "pool deposits", kind: "chain", pclass: "state", note: "getTotalLUSDDeposits @ head" },
      { label: "system debt", kind: "chain", pclass: "state", note: "getEntireSystemDebt @ head" },
    ],
  };
}

/** The queue's order — the protocol's own sorted list, read as redemption
 *  order. V1's ordering key is the collateral ratio, not a user-set rate. */
export function queueOrderProv(): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: STATE_VERIFY,
    summary:
      "The redemption order — the protocol's OWN SortedTroves list, swept through MultiTroveGetter at the latest block. The contract keeps it in descending collateral ratio and redemptions take the LOWEST first, so the queue is shown reversed: front (redeemed first) at the top. The order is the protocol's, not a re-sort of ours. Unlike Liquity V2 and its forks, nothing about this position is chosen — a Trove's place is its collateral ratio, which the ETH price moves.",
    contract: MULTI_TROVE_GETTER,
    via: `${SYSTEM_VIA} · MultiTroveGetter sweep of SortedTroves @ head (reversed to redemption order)`,
  };
}

/** One queued Trove's ICR — the CONTRACT's own, at the same price. */
export function queueIcrProv(): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: STATE_VERIFY,
    summary:
      "Collateral ratio — TroveManager.getCurrentICR for this Trove at the protocol's own price, computed by the contract itself (not client arithmetic), at the same block as the rest of the queue. This is both the figure the liquidation path checks against the 110% minimum and the Trove's place in the redemption queue.",
    contract: TROVE_MANAGER,
    via: `${SYSTEM_VIA} · TroveManager.getCurrentICR(borrower, price) @ head · ÷10^18`,
  };
}

/** The whole queue's debt — what a redemption would have to consume to reach
 *  the back of it. */
export function queueDebtTotalProv(): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    verify: STATE_VERIFY,
    summary:
      "The whole queue's LUSD debt — every Trove in the protocol's own sorted list, summed from one MultiTroveGetter sweep at the latest block. This is what a redemption would have to consume to reach the back of the queue. RECORDED debt, not entire: pending redistribution rewards from earlier liquidations aren't applied to swept entries (they land on a Trove's next operation), so a Trove's own page — which reads getEntireDebtAndColl — can state a slightly larger figure than its share of this one. Both are the chain's; they answer different questions.",
    contract: MULTI_TROVE_GETTER,
    via: `${SYSTEM_VIA} · MultiTroveGetter sweep @ head · Σ recorded debt · ÷10^18`,
    formula: "Σ recorded debt across the sorted list",
  };
}

/** How many listed Troves are below the 110% minimum right now. */
export function queueBelowMinimumProv(): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    verify: STATE_VERIFY,
    summary:
      "Troves below the 110% minimum — how many in the protocol's own sorted list sit under its minimum collateral ratio at its own price. The contract's own comparison, counted over EVERY listed Trove rather than inferred from where the queue's order breaks: each ICR is TroveManager.getCurrentICR at the same block and price as the rest of this page. Below the minimum means liquidatable now, by anyone — a fact about the contract's threshold, not a judgement about a borrower.",
    contract: TROVE_MANAGER,
    via: `${SYSTEM_VIA} · count of TroveManager.getCurrentICR(borrower, price) < MCR @ head`,
    formula: "count(ICR < 110%) across the sorted list",
  };
}
