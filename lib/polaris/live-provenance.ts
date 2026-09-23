// Provenance vocabulary for the Polaris live reads — the chain overlay's
// sources (/api/chain/polaris/position and /markets). Two lanes:
//
//   • STATE — the cdpManager's own getters at the latest Sepolia block: the
//     recorded slots, the entire-debt/entire-coll figures that add the pending
//     legs, each pending leg, the ICR the contract computes, the rate and
//     mode in force, the MCRs, the totals; the cdpNft's ownerOf; the
//     stability pool's depth and P.
//   • ORACLE — the protocol's own price legs: the market's price feed (pETH
//     in the debt unit — what the ICR is judged at), the bonding curve (pETH
//     in ETH) and the medianisers (ETH/USD, XAU/USD). USD on this explorer is
//     always one of these legs or a product of two of them, and the receipt
//     names which.
//
// Every figure is a Sepolia TESTNET figure. The receipts say so once, on the
// USD legs, where a reader would otherwise take the number for money.

import type { Provenance, ProvVerify } from "@/components/shared/provenance";
import { POLARIS_CORE, POLARIS_MARKET_CONFIG, type PolarisMarket } from "./asset-catalog";

const LANE_VIA = "GET /api/chain/polaris/position";
const BOARD_VIA = "GET /api/chain/polaris/markets";

const stableOf = (market: PolarisMarket): string => POLARIS_MARKET_CONFIG[market].stable.symbol;
const manager = (market: PolarisMarket) => ({
  name: `Polaris ${stableOf(market)} CDPManager`,
  address: POLARIS_MARKET_CONFIG[market].cdpManager,
});
const feed = (market: PolarisMarket) => ({
  name: `Polaris ${stableOf(market)} PriceFeed`,
  address: POLARIS_MARKET_CONFIG[market].priceFeed,
});
const pool = (market: PolarisMarket) => ({
  name: `Polaris ${stableOf(market)} StabilityPool`,
  address: POLARIS_MARKET_CONFIG[market].stabilityPool,
});

const recompute = (method: string): ProvVerify => ({
  kind: "recompute",
  text: `Re-run ${method} against any Sepolia node at the stamped block — the figure is the contract's own answer.`,
});

/** getCDPEntireColl / getCDPEntireDebt — the whole figure, pending legs in. */
export function liveEntireProv(what: "coll" | "debt", market: PolarisMarket): Provenance {
  const stable = stableOf(market);
  return {
    kind: "chain",
    pclass: "state",
    verify: recompute(what === "coll" ? "getCDPEntireColl(id)" : "getCDPEntireDebt(id)"),
    summary:
      what === "coll"
        ? "pETH the CDP holds NOW — the cdpManager's own getCDPEntireColl(id) at the latest block: the recorded collateral plus every pending leg (the PSM share and reward pETH accrued since the last touch). The identity the contract keeps, and the verifier asserts: entireColl = coll + mintRedeemCollChange + bcTokenGain."
        : `${stable} the CDP owes NOW — the cdpManager's own getCDPEntireDebt(id) at the latest block: the recorded debt with interest accrued since the last touch, the pending PSM share, and the pending stability gain netted off. The identity the contract keeps: entireDebt = debt + accruedInterest + mintRedeemDebtChange − accruedStables.`,
    contract: manager(market),
    via: `${LANE_VIA} · ${what === "coll" ? "getCDPEntireColl" : "getCDPEntireDebt"}(id) @ head`,
  };
}

export type PolarisPendingLeg =
  | "accruedInterest"
  | "accruedStables"
  | "bcTokenGain"
  | "mintRedeemColl"
  | "mintRedeemDebt";

const PENDING: Record<PolarisPendingLeg, { method: string; summary: (stable: string) => string }> = {
  accruedInterest: {
    method: "getCDPAccruedInterest(id)",
    summary: (s) =>
      `Interest accrued since the last touch — the cdpManager's own getCDPAccruedInterest(id) at the latest block: simple accrual at the market's rate on the recorded debt, in ${s}. Pending: it is written into the debt at the CDP's next touch, where it becomes the CDPUpdated's _accruedInterest.`,
  },
  accruedStables: {
    method: "getCDPAccruedStables(id)",
    summary: (s) =>
      `${s} gain pending against the debt — the cdpManager's own getCDPAccruedStables(id) at the latest block: the CDP's share of distributed market revenue not yet credited. Applied as a debt reduction at the next touch (the CDPUpdated's _stableGain).`,
  },
  bcTokenGain: {
    method: "getCDPBcTokenGain(id)",
    summary: () =>
      "Reward pETH pending into the collateral — the cdpManager's own getCDPBcTokenGain(id) at the latest block: the CDP's share of bonding-curve token rewards not yet settled. Added to the collateral at the next touch (the CDPUpdated's _bcTokenGain).",
  },
  mintRedeemColl: {
    method: "getCDPMintRedeemCollChange(id)",
    summary: () =>
      "pETH pending from the PSM's activity — the cdpManager's own getCDPMintRedeemCollChange(id) at the latest block: the CDP's pro-rata share of collateral the PSM's mints (positive) and redemptions (negative) moved since the last touch.",
  },
  mintRedeemDebt: {
    method: "getCDPMintRedeemDebtChange(id)",
    summary: (s) =>
      `${s} of debt pending from the PSM's activity — the cdpManager's own getCDPMintRedeemDebtChange(id) at the latest block: the CDP's pro-rata share of debt the PSM's mints (positive) and redemptions (negative) moved since the last touch.`,
  },
};

/** One pending leg — a state read the next touch will write into the ledger. */
export function livePendingProv(leg: PolarisPendingLeg, market: PolarisMarket): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: recompute(PENDING[leg].method),
    summary: PENDING[leg].summary(stableOf(market)),
    contract: manager(market),
    via: `${LANE_VIA} · ${PENDING[leg].method} @ head`,
  };
}

/** getICR(id) — the contract's own collateral ratio at its own price. */
export function liveIcrProv(market: PolarisMarket): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: recompute("getICR(id)"),
    summary: `Collateral ratio — the cdpManager's own getICR(id) at the latest block: entire collateral × the market's price feed ÷ entire debt, computed by the contract. The protocol judging its own CDP against MCR (or the defensive-mode MCR when that mode is on), not a client-side reconstruction; the verifier asserts the identity entireColl × price ÷ entireDebt.`,
    contract: manager(market),
    via: `${LANE_VIA} · getICR(id) @ head (÷ 1e18)`,
    formula: "entireColl × price ÷ entireDebt",
    inputs: [
      { label: "entire collateral", kind: "chain", pclass: "state", note: "getCDPEntireColl(id)" },
      { label: "price", kind: "chain", pclass: "oracle", note: "the market's PriceFeed — pETH in the debt unit" },
      { label: "entire debt", kind: "chain", pclass: "state", note: "getCDPEntireDebt(id)" },
    ],
  };
}

/** entireColl × pethInDebt − entireDebt — the CDP's equity at the feed. Not a
 *  contract getter: three of the manager's and the feed's own reads, combined
 *  client-side. A valuation at the block the three reads land at, never a
 *  profit — realising one needs a price for each of the holder's own flows,
 *  which is a decision about basis, not a further chain read. */
export function liveEquityProv(market: PolarisMarket): Provenance {
  const stable = stableOf(market);
  return {
    kind: "chain",
    pclass: "oracle",
    verify: recompute("getCDPEntireColl(id) × priceFeed.previewPrice() − getCDPEntireDebt(id)"),
    summary: `The CDP's equity at the feed — entire collateral (getCDPEntireColl(id)) times the market's own price for pETH in ${stable} (the PriceFeed's previewPrice()), minus entire debt (getCDPEntireDebt(id)), all three read at the latest block. A valuation at this block, not a profit: it moves with the feed's price and with the interest and PSM share still pending, and it can be negative when the debt is worth more than the collateral. Turning it into a realised profit or loss needs a price for each of the holder's own deposits — a decision about basis, not a fact of the chain.`,
    contract: manager(market),
    via: `${LANE_VIA} · getCDPEntireColl(id) × previewPrice() − getCDPEntireDebt(id) @ head`,
    formula: "entireColl × pethInDebt − entireDebt",
    inputs: [
      { label: "entire collateral", kind: "chain", pclass: "state", note: "getCDPEntireColl(id)" },
      { label: "pETH price", kind: "chain", pclass: "oracle", note: "the market's PriceFeed — pETH in the debt unit" },
      { label: "entire debt", kind: "chain", pclass: "state", note: "getCDPEntireDebt(id)" },
    ],
  };
}

/** The rate in force — getInterestRate() = primaryRate() + secondaryRate(). */
export function liveRateProv(
  which: "combined" | "primary" | "secondary",
  market: PolarisMarket,
  board = false,
): Provenance {
  const method = which === "combined" ? "getInterestRate()" : which === "primary" ? "primaryRate()" : "secondaryRate()";
  return {
    kind: "chain",
    pclass: "state",
    verify: recompute(method),
    summary:
      which === "combined"
        ? "The interest rate in force on this market's debt — the cdpManager's own getInterestRate() at the latest block, primary + secondary, 1e18 = 100% per year. Algorithmic: nobody chose it. Simple accrual on each CDP's recorded debt since its last touch."
        : which === "primary"
          ? "The primary rate — the cdpManager's own primaryRate() at the latest block: the market's set rate, moved by PrimaryRateSet on the PSM's mints and redemptions."
          : "The secondary rate — the cdpManager's own secondaryRate() at the latest block: the utilisation-driven component, rising with the reserve-to-debt ratio's use.",
    contract: manager(market),
    via: `${board ? BOARD_VIA : LANE_VIA} · ${method} @ head (÷ 1e18)`,
    ...(which === "combined"
      ? {
          formula: "primaryRate + secondaryRate",
          inputs: [
            { label: "primary", kind: "chain", pclass: "state", note: "primaryRate()" },
            { label: "secondary", kind: "chain", pclass: "state", note: "secondaryRate()" },
          ],
        }
      : {}),
  };
}

/**
 * What a year of interest costs at the rate in force — recorded debt × rate.
 *
 * THE BASE IS THE RECORDED DEBT, NOT THE ENTIRE DEBT, and the summary says so
 * because the two differ enough to invite a correction: on usdp/8 a large PSM
 * mint share is pending, so the entire figure ran a quarter above the recorded
 * one when this was written. Recorded is right because it is the base the
 * contract itself accrues on — liveRateProv's own summary above states the
 * rule ("simple accrual on each CDP's recorded debt since its last touch").
 * The pending share joins the recorded debt at the next touch, and the cost
 * rises then; the figure is a projection at today's rate, and the rate is
 * algorithmic and moves.
 *
 * Liquity V2's own cost line (components/trove/TroveDetailsBand.tsx) is the
 * model, on the same base: the trove's recorded debt times its rate.
 */
export function polarisAnnualCostProv(market: PolarisMarket): Provenance {
  const stable = stableOf(market);
  return {
    kind: "derived",
    summary: `Estimated interest for a year at the rate in force — the CDP's recorded debt times the market's current rate, in ${stable}. A projection at today's rate, computed in the browser: the contract accrues on the recorded debt since the last touch and writes the interest in at the next one, the pending PSM share joins the recorded debt then, and the rate is algorithmic and moves.`,
    formula: "recorded debt × rate",
    inputs: [
      {
        label: "recorded debt",
        kind: "chain",
        pclass: "state",
        note: "getCDP(id).debt at the latest block — the recorded slot, before the pending legs",
      },
      {
        label: "rate",
        kind: "chain",
        pclass: "state",
        note: "getInterestRate() at the latest block — primary + secondary",
      },
    ],
  };
}

/** MCR() or DEFENSIVE_MODE_MCR() — the floor in force. */
export function liveMcrProv(defensive: boolean, market: PolarisMarket, board = false): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: recompute(defensive ? "DEFENSIVE_MODE_MCR()" : "MCR()"),
    summary: defensive
      ? "The minimum collateral ratio in force — the cdpManager's own DEFENSIVE_MODE_MCR() (150%) at the latest block, because isDefensiveMode() is true: the market's reserve-to-debt ratio has fallen below its threshold and the floor rises until it recovers."
      : "The minimum collateral ratio in force — the cdpManager's own MCR() (115%) at the latest block. A CDP below it can be liquidated; the floor rises to DEFENSIVE_MODE_MCR() (150%) when the market enters defensive mode.",
    contract: manager(market),
    via: `${board ? BOARD_VIA : LANE_VIA} · ${defensive ? "DEFENSIVE_MODE_MCR" : "MCR"}() @ head (÷ 1e18)`,
  };
}

/** isDefensiveMode() — the market's mode. */
export function liveModeProv(market: PolarisMarket, board = false): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: recompute("isDefensiveMode()"),
    summary:
      "Whether the market is in defensive mode — the cdpManager's own isDefensiveMode() at the latest block. On when the reserve-to-debt ratio is below 1.10; the MCR in force rises to 150% until the ratio recovers. Below 1.00 the market is in recovery.",
    contract: manager(market),
    via: `${board ? BOARD_VIA : LANE_VIA} · isDefensiveMode() @ head`,
  };
}

/** getReserveToDebtRatio() — the market's reserve backing its debt. */
export function liveReserveRatioProv(market: PolarisMarket, board = false): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: recompute("getReserveToDebtRatio()"),
    summary:
      "The reserve-to-debt ratio — the cdpManager's own getReserveToDebtRatio() at the latest block, 1e18 = 1.00: the market's reserve against the debt it backs. The defensive-mode threshold is 1.10 and recovery is 1.00, both the contract's own constants.",
    contract: manager(market),
    via: `${board ? BOARD_VIA : LANE_VIA} · getReserveToDebtRatio() @ head (÷ 1e18)`,
  };
}

/** ownerOf(id) — the current holder, from the NFT itself. */
export function liveOwnerProv(market: PolarisMarket): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: recompute("cdpNft.ownerOf(id)"),
    summary:
      "The CDP's current holder — the cdpNft's own ownerOf(id) at the latest block. The CDP is an NFT, so this is who may act on it now; the index's owner is the last Transfer's recipient, and the two agree on every open CDP (the verifier asserts it). Reverts once the NFT is burned.",
    contract: { name: `Polaris ${stableOf(market)} CDP NFT`, address: POLARIS_MARKET_CONFIG[market].cdpNft },
    via: `${LANE_VIA} · ownerOf(id) @ head`,
  };
}

/** getTotalColl() / getTotalDebt() — the market's whole book at head. */
export function liveTotalProv(what: "coll" | "debt", market: PolarisMarket): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: recompute(what === "coll" ? "getTotalColl()" : "getTotalDebt()"),
    summary:
      what === "coll"
        ? "All pETH in the market's CDPs — the cdpManager's own getTotalColl() at the latest block: the active collateral the manager accounts for, the chain's own figure rather than a sum over the index."
        : `All ${stableOf(market)} owed across the market's CDPs — the cdpManager's own getTotalDebt() at the latest block: the recorded debt the manager accounts for, before interest pending on each CDP since its last touch.`,
    contract: manager(market),
    via: `${BOARD_VIA} · ${what === "coll" ? "getTotalColl" : "getTotalDebt"}() @ head`,
  };
}

/** stabilityPool.getTotalStableTokenDeposits() — the pool's depth. */
export function liveSpDepositsProv(market: PolarisMarket): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: recompute("stabilityPool.getTotalStableTokenDeposits()"),
    summary: `${stableOf(market)} deposited in the stability pool — the pool's own getTotalStableTokenDeposits() at the latest block: what stands ready to absorb a liquidation's debt in exchange for its collateral.`,
    contract: pool(market),
    via: `${BOARD_VIA} · getTotalStableTokenDeposits() @ head`,
  };
}

/** stabilityPool.P() — the pool's running product. */
export function liveSpPProv(market: PolarisMarket): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: recompute("stabilityPool.P()"),
    summary:
      "The stability pool's running product P — the pool's own P() at the latest block, 1e36 at deploy: each liquidation the pool absorbs scales it down by the share of deposits consumed, which is how every depositor's compounded deposit is derived. Liquity V2's own mechanism, verbatim. The card states it as the fraction of deploy still standing; the value beside this receipt is the contract's raw integer.",
    contract: pool(market),
    via: `${BOARD_VIA} · P() @ head`,
  };
}

// ── the oracle legs ──────────────────────────────────────────────────────────

/** priceFeed.previewPrice() — pETH in the market's debt unit. */
export function livePethInDebtProv(market: PolarisMarket, board = false): Provenance {
  const stable = stableOf(market);
  return {
    kind: "chain",
    pclass: "oracle",
    verify: recompute("priceFeed.previewPrice()"),
    summary:
      market === "usdp"
        ? `pETH's price in ${stable} — the market's own PriceFeed at the latest block (previewPrice(), the view twin of the getPrice() the manager calls): the bonding curve's pETH-in-ETH price × the ETH/USD medianiser. The price the ICR is judged at. A Sepolia testnet feed — the medianiser reads Sepolia oracles, and the figure is a test figure.`
        : `pETH's price in ${stable} — the market's own PriceFeed at the latest block (previewPrice(), the view twin of the getPrice() the manager calls): the bonding curve's pETH-in-ETH price × ETH/USD ÷ XAU/USD, so the unit is troy ounces of gold. The price the ICR is judged at. A Sepolia testnet feed, and a test figure.`,
    contract: feed(market),
    via: `${board ? BOARD_VIA : LANE_VIA} · previewPrice() @ head (÷ 1e18)`,
    formula: market === "usdp" ? "currentPrice × ETH/USD" : "currentPrice × ETH/USD ÷ XAU/USD",
    inputs: [
      { label: "curve", kind: "chain", pclass: "oracle", note: "bondingCurve.currentPrice() — pETH in ETH" },
      { label: "ETH/USD", kind: "chain", pclass: "oracle", note: "the ETH/USD medianiser's previewExternalPrice()" },
      ...(market === "goldp"
        ? [
            {
              label: "XAU/USD",
              kind: "chain" as const,
              pclass: "oracle" as const,
              note: "the XAU/USD medianiser's previewExternalPrice()",
            },
          ]
        : []),
    ],
  };
}

/** bondingCurve.currentPrice() — pETH in ETH. */
export function liveCurvePriceProv(board = false): Provenance {
  return {
    kind: "chain",
    pclass: "oracle",
    verify: recompute("bondingCurve.currentPrice()"),
    summary:
      "pETH's price in ETH — the bonding curve's own currentPrice() at the latest block. pETH is minted on the curve against ETH, and this is the curve's spot price for it (1e18 = 1 ETH); the first leg of every price the protocol values pETH at.",
    contract: { name: "Polaris BondingCurve", address: POLARIS_CORE.bondingCurve },
    via: `${board ? BOARD_VIA : LANE_VIA} · currentPrice() @ head (÷ 1e18)`,
  };
}

/** A medianiser's previewExternalPrice() — ETH/USD or XAU/USD. */
export function liveMedianiserProv(which: "eth" | "xau", board = false): Provenance {
  return {
    kind: "chain",
    pclass: "oracle",
    verify: recompute("medianiser.previewExternalPrice()"),
    summary:
      which === "eth"
        ? `ETH in USD — the ETH/USD medianiser's own previewExternalPrice() at the latest block (the view twin of getExternalPrice()), the median over its configured Sepolia oracles (Chainlink's Sepolia ETH/USD feed among them). A testnet price: a test figure, not the market.`
        : `Gold in USD — the XAU/USD medianiser's own previewExternalPrice() at the latest block, the median over its configured Sepolia oracles. A testnet price: a test figure, not the market.`,
    contract:
      which === "eth"
        ? { name: "Polaris ETH/USD Medianiser", address: POLARIS_CORE.ethUsdMedianiser }
        : { name: "Polaris XAU/USD Medianiser", address: POLARIS_CORE.xauUsdMedianiser },
    via: `${board ? BOARD_VIA : LANE_VIA} · previewExternalPrice() @ head (÷ 1e18)`,
  };
}

/** A pETH amount in USD — amount × curve × ETH/USD, the protocol's own two legs. */
export function liveUsdValueProv(what: string, board = false): Provenance {
  return {
    kind: "chain-derived",
    pclass: "oracle",
    verify: {
      kind: "recompute",
      text: "Re-run bondingCurve.currentPrice() and the ETH/USD medianiser's previewExternalPrice() at the stamped block; multiply the pETH amount by both.",
    },
    summary: `${what} in USD — the pETH amount × the bonding curve's pETH-in-ETH price × the ETH/USD medianiser, both read at the latest block. These are the protocol's own two legs (the USDp feed is exactly their product); no price API is involved. Sepolia testnet figures throughout: a test dollar, not a real one.`,
    contract: { name: "Polaris BondingCurve", address: POLARIS_CORE.bondingCurve },
    via: `${board ? BOARD_VIA : LANE_VIA} · amount × currentPrice() × ETH/USD @ head`,
    formula: "amount × curve × ETH/USD",
    inputs: [
      { label: "amount", kind: "chain", pclass: "state", note: "the pETH figure valued" },
      { label: "curve", kind: "chain", pclass: "oracle", note: "bondingCurve.currentPrice()" },
      { label: "ETH/USD", kind: "chain", pclass: "oracle", note: "the ETH/USD medianiser's previewExternalPrice()" },
    ],
  };
}

// ── the listing's derived figures ────────────────────────────────────────────
// The listing states an APPROXIMATE ratio: one read of the market board per
// page load (never one per row) priced against each row's last emitted
// figures. The CDP's own page states the contract's getICR(id) instead.

/** coll × the market's feed ÷ debt on the row's last emitted figures. */
export function listingIcrProv(market: PolarisMarket): Provenance {
  const stable = stableOf(market);
  return {
    kind: "chain-derived",
    pclass: "oracle",
    verify: {
      kind: "recompute",
      text: "Re-run the market's priceFeed.previewPrice() at the stamped block, multiply the CDP's last emitted collateral by it and divide by its last emitted debt.",
    },
    summary:
      "Collateral ratio, approximate — the CDP's last emitted collateral × the market's price feed at the time of the listing read ÷ its last emitted debt. The same formula the cdpManager's getICR computes, but on the last stated figures: interest accrued since the last touch and the PSM's pending share are settled only at the CDP's next touch, so the contract's own figure can differ. The CDP's page states getICR(id).",
    contract: feed(market),
    via: `${BOARD_VIA} · last emitted coll × previewPrice() ÷ last emitted debt`,
    formula: "coll × price ÷ debt",
    inputs: [
      { label: "collateral", kind: "chain", pclass: "emitted", note: "the CDP's last emitted coll, from the index" },
      { label: "price", kind: "chain", pclass: "oracle", note: `the market's PriceFeed — pETH in ${stable}` },
      { label: "debt", kind: "chain", pclass: "emitted", note: "the CDP's last emitted debt, from the index" },
    ],
  };
}

/** debt × the MCR in force ÷ coll — the pETH price at which the row's stated
 *  figures reach the floor, in the market's own unit. */
export function listingLiqPriceProv(defensive: boolean, market: PolarisMarket): Provenance {
  const stable = stableOf(market);
  return {
    kind: "chain-derived",
    pclass: "oracle",
    verify: {
      kind: "recompute",
      text: `Re-run the cdpManager's ${defensive ? "DEFENSIVE_MODE_MCR()" : "MCR()"} at the stamped block, multiply the CDP's last emitted debt by it and divide by its last emitted collateral.`,
    },
    summary: `The pETH price, in ${stable}, at which this CDP's stated figures reach the floor — its last emitted debt × the minimum collateral ratio in force (the cdpManager's own ${defensive ? "DEFENSIVE_MODE_MCR() — 150%, because the market is in defensive mode" : "MCR() — 115%"}) ÷ its last emitted collateral. Approximate for the same reason the ratio is: interest and the PSM's share settle only at the next touch, and the price the protocol judges against moves every block.`,
    contract: manager(market),
    via: `${BOARD_VIA} · last emitted debt × ${defensive ? "DEFENSIVE_MODE_MCR" : "MCR"}() ÷ last emitted coll`,
    formula: "debt × MCR ÷ coll",
    inputs: [
      { label: "debt", kind: "chain", pclass: "emitted", note: "the CDP's last emitted debt, from the index" },
      {
        label: "MCR",
        kind: "chain",
        pclass: "state",
        note: defensive ? "DEFENSIVE_MODE_MCR() — the floor in force" : "MCR() — the floor in force",
      },
      { label: "collateral", kind: "chain", pclass: "emitted", note: "the CDP's last emitted coll, from the index" },
    ],
  };
}

// ── the holder strip's derived figures ───────────────────────────────────────
// A wallet search states its own positions at a glance above the cards. Two of
// those figures are sums over the wallet's OPEN CDPs — one exact (pETH is one
// token across both markets), one that had to be priced to be summed at all
// (USDp and GOLDp are different units). Both are summed from the rows the page
// is showing, and both carry the same caveat the listing's ratio does: the
// interest each CDP has accrued since its last touch, and the PSM's pending
// share, settle only at that CDP's next touch and are in none of it.

/** Σ last emitted coll over the wallet's open CDPs — pETH, one token, exact. */
export function holderCollProv(): Provenance {
  return {
    kind: "chain",
    pclass: "emitted",
    verify: {
      kind: "recompute",
      text: "Add the last emitted collateral of each open CDP the wallet holds — every one of them is on the page under this strip.",
    },
    summary:
      "All the pETH the wallet's open CDPs hold — the sum of each CDP's last emitted collateral, from the index. Exact rather than approximate: pETH is the collateral in both markets, so the legs are one token and the sum is a quantity of it. Reward pETH accrued since each CDP's last touch is not in it; it lands on the CDP at its next touch.",
    via: "GET /api/polaris/positions?wallet=… · Σ last emitted coll over the open rows",
    formula: "Σ coll over the wallet's open CDPs",
    inputs: [
      {
        label: "collateral",
        kind: "chain",
        pclass: "emitted",
        note: "each open CDP's last emitted coll, from the index",
      },
    ],
  };
}

/** Σ last emitted debt over the wallet's open CDPs in ONE market — one token,
 *  so the sum is a quantity of it and nothing is converted. */
export function holderDebtSumProv(market: PolarisMarket): Provenance {
  const stable = stableOf(market);
  return {
    kind: "chain",
    pclass: "emitted",
    verify: {
      kind: "recompute",
      text: `Add the last emitted debt of each open CDP the wallet holds in the ${stable} market — every one of them is on the page under this strip.`,
    },
    summary: `${stable} the wallet's open CDPs owe — the sum of each CDP's last emitted debt, from the index. The wallet borrows in this market only, so the sum is a quantity of one token and nothing was converted to reach it. Interest since each CDP's last touch and any pending PSM share are not in it; both settle at that CDP's next touch.`,
    contract: manager(market),
    via: "GET /api/polaris/positions?wallet=… · Σ last emitted debt over the open rows",
    formula: `Σ debt over the wallet's open ${stable} CDPs`,
    inputs: [
      { label: "debt", kind: "chain", pclass: "emitted", note: "each open CDP's last emitted debt, from the index" },
    ],
  };
}

/** Σ (leg × its market's feed) over the wallet's open CDPs — the debt in one
 *  unit, because USDp and GOLDp are not the same one. */
export function holderDebtValueProv(): Provenance {
  return {
    kind: "chain-derived",
    pclass: "oracle",
    verify: {
      kind: "recompute",
      text: "Add the last emitted debt of each open CDP the wallet holds, market by market; take USDp at one dollar and GOLDp at the XAU/USD medianiser's price at the stamped block.",
    },
    summary:
      "What the wallet's open CDPs owe, in dollars — each CDP's last emitted debt in its own market's unit, USDp at one dollar and GOLDp at the gold price the protocol's own feed stated at the latest read. An estimate for two reasons: the two markets' debts are different tokens and a sum of them exists only at a price, and interest since each CDP's last touch and any pending PSM share settle at the next touch rather than here. A Sepolia testnet figure — a test dollar, not a real one.",
    contract: { name: "Polaris XAU/USD Medianiser", address: POLARIS_CORE.xauUsdMedianiser },
    via: `${BOARD_VIA} · Σ last emitted debt × the market's own unit price @ head`,
    formula: "Σ debt × the market's unit in USD",
    inputs: [
      {
        label: "USDp debt",
        kind: "chain",
        pclass: "emitted",
        note: "Σ last emitted debt in the USDp market — one USDp is one dollar",
      },
      {
        label: "GOLDp debt",
        kind: "chain",
        pclass: "emitted",
        note: "Σ last emitted debt in the GOLDp market — a troy ounce of gold each",
      },
      { label: "XAU/USD", kind: "chain", pclass: "oracle", note: "the XAU/USD medianiser's previewExternalPrice()" },
    ],
  };
}

/** The wallet's open pETH valued at the protocol's own two legs. */
export function holderCollUsdProv(): Provenance {
  return liveUsdValueProv("The wallet's collateral", true);
}
