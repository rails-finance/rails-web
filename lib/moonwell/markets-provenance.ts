// Moonwell (Ethereum L1) MARKET-SURFACE provenance vocabulary — the receipts for
// /moonwell/markets, one head block's reading of the protocol's own contracts.
// ----------------------------------------------------------------------------
// The market-level counterpart of lib/moonwell/*-provenance (which trace a
// WALLET's position and events). Nothing here concerns an account: every figure
// is a slot read at one head block, or an arithmetic over such reads. Moonwell's
// Ethereum deployment is a Compound V2 fork, so the reads are CToken-family — the
// same three source classes the ladder grades:
//   • state   — a contract slot at the block: an mToken's totalSupply /
//     totalBorrows / exchangeRateStored, the Comptroller's collateral factor,
//     caps and liquidation constants, a rate model's kink. All third-party
//     verifiable: re-run the eth_call at the block against any node.
//   • oracle  — the Comptroller's OWN Chainlink oracle wrapper
//     (getUnderlyingPrice), the same price its liquidation math uses, and any
//     value multiplied through it.
//   • derived — a ratio or Σ over those reads (a market's utilisation, the
//     roster's supplied/borrowed totals), chain-derived and no further than its
//     weakest input.
//
// The structured `source: { block }` slot rides every builder ALONGSIDE naming
// the block in prose — the receipt's coordinates row reads the slot (the block
// and its copy button; `ProvReceipt`, components/shared/provenance.tsx).
// A state read whose block lived only in a sentence could not be re-run.
//
// Real addresses throughout, threaded from the loaded payload: the mToken and
// its rate model come off the market row, the oracle off the Comptroller's own
// oracle() (data.oracle), and the Comptroller itself is the deployment's known
// registry address. Contracts differ per figure — an mToken read cites the
// mToken, a cap read the Comptroller, a price read the oracle wrapper.

import type { Provenance } from "@/components/shared/provenance";

const LANE = "live Moonwell reads (/moonwell/markets)";
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

/** The coordinates a market-surface receipt needs: the block it was read at, and
 *  whichever contracts the figure was read from. Not every builder uses every
 *  field — a cap read wants the Comptroller, a price read the oracle wrapper. */
export interface MoonwellMarketCoords {
  blockNumber?: number;
  /** The mToken (MErc20Delegator) address — most per-market reads. */
  mToken?: string;
  /** The mToken's own symbol (mWETH / mUSDC / mUSDT / mcbBTC). */
  mTokenSymbol?: string;
  /** The underlying token symbol (WETH / USDC / USDT / cbBTC). */
  underlyingSymbol?: string;
  /** The Comptroller (Unitroller proxy) — roster, caps, factors, liq constants. */
  comptroller?: string;
  /** The Chainlink oracle wrapper the Comptroller reads — USD prices. */
  oracle?: string;
  /** This market's own interest rate model — the kink lives here. */
  irm?: string;
}

const mTokenContract = (coords?: MoonwellMarketCoords): Provenance["contract"] => ({
  name: coords?.mTokenSymbol ? `${coords.mTokenSymbol} market` : "mToken market",
  address: coords?.mToken ?? ZERO_ADDR,
});

const comptrollerContract = (coords?: MoonwellMarketCoords): Provenance["contract"] => ({
  name: "Comptroller",
  address: coords?.comptroller ?? ZERO_ADDR,
});

const oracleContract = (coords?: MoonwellMarketCoords): Provenance["contract"] => ({
  name: "Chainlink oracle wrapper",
  address: coords?.oracle ?? ZERO_ADDR,
});

const irmContract = (coords?: MoonwellMarketCoords): Provenance["contract"] => ({
  name: "Interest rate model",
  address: coords?.irm ?? ZERO_ADDR,
});

const atBlock = (coords?: MoonwellMarketCoords): string =>
  coords?.blockNumber != null ? ` at block ${coords.blockNumber}` : "";

const recompute = (call: string, coords?: MoonwellMarketCoords): Provenance["verify"] => ({
  kind: "recompute",
  text:
    coords?.blockNumber != null
      ? `Re-run the ${call} eth_call at block ${coords.blockNumber} against any node`
      : `Re-run the ${call} eth_call against any node`,
});

const sym = (coords?: MoonwellMarketCoords) => coords?.underlyingSymbol ?? "the underlying";

// ── market-level: sizes ──────────────────────────────────────────────────────

/** Supplied underlying — the mToken's totalSupply (8-dp mTokens) × its
 *  exchangeRateStored, the accrued rate that turns mTokens into underlying. Two
 *  state slots multiplied, so chain-derived but never off the chain. */
export const mwSuppliedUnderlyingProv = (coords: MoonwellMarketCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: coords.blockNumber },
  summary: `${sym(coords)} supplied — the market's own \`totalSupply\` (its 8-dp mTokens) × \`exchangeRateStored\`${atBlock(coords)}, both read from the mToken. The exchange rate carries accrued interest, so the product is what the market records as supplied this block, not a sum over Mint/Redeem events.`,
  contract: mTokenContract(coords),
  via: `${LANE} · mToken.totalSupply × mToken.exchangeRateStored @ head`,
  formula: "mToken supply × exchange rate",
  inputs: [
    { label: "mToken supply", kind: "chain", pclass: "state", note: "mToken.totalSupply @ head" },
    { label: "exchange rate", kind: "chain", pclass: "state", note: "mToken.exchangeRateStored @ head" },
  ],
});

/** Supplied or borrowed VALUE in USD — the underlying amount × the Comptroller's
 *  own oracle price for it (getUnderlyingPrice), the price its liquidation math
 *  uses. Chain-derived, oracle-class. */
export const mwValueUsdProv = (side: "supplied" | "borrowed", coords: MoonwellMarketCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  source: { block: coords.blockNumber },
  summary: `${sym(coords)} ${side} in USD — the ${side} underlying × the Comptroller's OWN oracle price (\`getUnderlyingPrice\`)${atBlock(coords)}, a Chainlink wrapper and the same price its liquidation math reads, never a market API.`,
  contract: oracleContract(coords),
  via: `${LANE} · ${side} underlying × oracle.getUnderlyingPrice(mToken) @ head`,
  formula: "underlying amount × oracle price",
  inputs: [
    {
      label: "underlying amount",
      kind: "chain-derived",
      pclass: "state",
      note: side === "supplied" ? "totalSupply × exchangeRateStored @ head" : "mToken.totalBorrows @ head",
    },
    {
      label: "oracle price",
      kind: "chain-derived",
      pclass: "oracle",
      note: "oracle.getUnderlyingPrice(mToken) @ head",
    },
  ],
});

// ── market-level: rate curve ─────────────────────────────────────────────────

/** The rate model's kink — the utilisation the interest curve turns steep at,
 *  read off THIS market's own model (the four roster models do not share one). */
export const mwKinkProv = (coords: MoonwellMarketCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: coords.blockNumber },
  verify: recompute("interestRateModel.kink", coords),
  summary: `${sym(coords)} rate-model kink${atBlock(coords)} — the \`kink\` on this market's OWN interest rate model (1e18-scaled): the utilisation its curve turns steep at, governance-set. Read from the model the mToken names, not assumed — the four roster markets do not share a kink.`,
  contract: irmContract(coords),
  via: `${LANE} · mToken.interestRateModel → model.kink @ head`,
});

/** A live annualised rate — supply/borrowRatePerTimestamp (Moonwell's per-SECOND
 *  accrual) × the model's own timestampsPerYear. Chain-derived, state-class. */
export const mwRateProv = (side: "supply" | "borrow", coords: MoonwellMarketCoords): Provenance => {
  const method = side === "supply" ? "supplyRatePerTimestamp" : "borrowRatePerTimestamp";
  return {
    kind: "chain-derived",
    pclass: "state",
    source: { block: coords.blockNumber },
    summary: `${sym(coords)} ${side} APR${atBlock(coords)} — the market's \`${method}\` (Moonwell accrues per SECOND, not per block — the per-block accessor its Compound V2 ancestor carries reverts here) × the model's own \`timestampsPerYear\` (31,536,000). The rate the contract itself would apply this block.`,
    contract: mTokenContract(coords),
    via: `${LANE} · mToken.${method} × model.timestampsPerYear @ head`,
    formula: "per-second rate × seconds per year",
    inputs: [
      { label: "per-second rate", kind: "chain", pclass: "state", note: `mToken.${method} @ head` },
      { label: "seconds per year", kind: "chain", pclass: "state", note: "model.timestampsPerYear @ head" },
    ],
  };
};

// ── market-level: governance parameters (Comptroller reads) ──────────────────

/** A market's collateral factor — the Comptroller's markets(mToken) second
 *  return, the share of this collateral's value that backs borrowing. */
export const mwCollateralFactorProv = (coords: MoonwellMarketCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: coords.blockNumber },
  verify: recompute("Comptroller.markets", coords),
  summary: `${sym(coords)} collateral factor${atBlock(coords)} — the Comptroller's \`markets(mToken)\` collateralFactorMantissa (1e18-scaled): the share of a supplier's collateral value in this market that backs borrowing. Zero means the market is switched off as collateral, not a 0% limit. A governance-set slot, read straight.`,
  contract: comptrollerContract(coords),
  via: `${LANE} · Comptroller.markets(mToken) · collateralFactorMantissa @ head`,
});

/** A governance ceiling in the market's own underlying token — the Comptroller's
 *  supplyCaps / borrowCaps slot (0 means uncapped in the fork's convention). */
export const mwCapProv = (side: "supply" | "borrow", coords: MoonwellMarketCoords): Provenance => {
  const method = side === "supply" ? "supplyCaps" : "borrowCaps";
  return {
    kind: "chain",
    pclass: "state",
    source: { block: coords.blockNumber },
    verify: recompute(`Comptroller.${method}`, coords),
    summary: `${sym(coords)} ${side} cap${atBlock(coords)} — the Comptroller's \`${method}(mToken)\`, in the market's own underlying token: the ceiling governance opened on what may ${side === "supply" ? "arrive" : "be borrowed"}. It sits on the ${side} axis, never the utilisation bar. Zero would mean uncapped; a value shown is a real limit, read straight.`,
    contract: comptrollerContract(coords),
    via: `${LANE} · Comptroller.${method}(mToken) @ head`,
  };
};

/** Share of a cap in use — the market's own amount ÷ its cap, both in the
 *  underlying token. Chain-derived, state-class. */
export const mwCapUsedProv = (side: "supply" | "borrow", coords: MoonwellMarketCoords): Provenance => {
  const method = side === "supply" ? "supplyCaps" : "borrowCaps";
  const amount = side === "supply" ? "supplied" : "borrowed";
  const amountNote = side === "supply" ? "totalSupply × exchangeRateStored @ head" : "mToken.totalBorrows @ head";
  return {
    kind: "chain-derived",
    pclass: "state",
    source: { block: coords.blockNumber },
    summary: `${sym(coords)} ${side} cap used${atBlock(coords)} — the market's ${amount} underlying ÷ its \`${method}\` ceiling, both in the underlying token: how much of the room governance opened has been taken.`,
    contract: comptrollerContract(coords),
    via: `${LANE} · ${amount} underlying ÷ Comptroller.${method}(mToken) @ head`,
    formula: `${amount} ÷ ${side} cap`,
    inputs: [
      { label: amount, kind: "chain-derived", pclass: "state", note: amountNote },
      { label: `${side} cap`, kind: "chain", pclass: "state", note: `Comptroller.${method}(mToken) @ head` },
    ],
  };
};

// ── roster summary ───────────────────────────────────────────────────────────

/** The market count — the length of the Comptroller's OWN getAllMarkets(), read
 *  live, not a stated catalog roster. Moonwell enumerates its markets on-chain. */
export const mwRosterCountProv = (coords: MoonwellMarketCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: coords.blockNumber },
  verify: recompute("Comptroller.getAllMarkets", coords),
  summary: `Markets listed${atBlock(coords)} — the length of the Comptroller's OWN \`getAllMarkets()\`. Moonwell enumerates its markets on-chain (governance-gated listing, not a factory), so this count is read from the registry, never stated from a file. A fifth market would appear here the block it is listed.`,
  contract: comptrollerContract(coords),
  via: `${LANE} · Comptroller.getAllMarkets().length @ head`,
});

/** A USD total across the priced roster — Σ of each market's own supplied or
 *  borrowed value (base underlying × its oracle price). Chain-derived, oracle. */
export const mwSummaryValueProv = (side: "supplied" | "borrowed", coords: MoonwellMarketCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  source: { block: coords.blockNumber },
  summary: `Roster ${side} in USD${atBlock(coords)} — Σ over every priced market of its own ${side} value (underlying amount × the Comptroller's oracle price). Each leg a live read; a market the oracle answers 0 for is left out rather than counted as zero.`,
  via: `${LANE} · Σ per-market ${side} USD over the priced roster @ head`,
  formula: `Σ per-market ${side} value`,
});

/** The fullest market's share of its own supply cap — the max over the roster of
 *  supplied ÷ supplyCaps. Chain-derived, state-class (no oracle in it). */
export const mwSummaryCapMaxProv = (coords: MoonwellMarketCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: coords.blockNumber },
  summary: `Fullest supply cap${atBlock(coords)} — the largest share of any market's supply cap in use across the roster (max of supplied underlying ÷ \`supplyCaps\`, over every capped market). Every other market sits lower, so this one figure states how far the caps are from binding.`,
  via: `${LANE} · max over the roster of supplied ÷ Comptroller.supplyCaps @ head`,
});

/** The close factor — the Comptroller's protocol-wide closeFactorMantissa, the
 *  share of a shortfallen borrow one liquidation may repay. */
export const mwCloseFactorProv = (coords: MoonwellMarketCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: coords.blockNumber },
  verify: recompute("Comptroller.closeFactorMantissa", coords),
  summary: `Close factor${atBlock(coords)} — the Comptroller's protocol-wide \`closeFactorMantissa\` (1e18-scaled): the share of a shortfallen borrow a single liquidation may repay. A governance constant, read straight.`,
  contract: comptrollerContract(coords),
  via: `${LANE} · Comptroller.closeFactorMantissa @ head`,
});

/** The liquidation incentive — the Comptroller's liquidationIncentiveMantissa,
 *  the multiple of repaid value a liquidator seizes in collateral. */
export const mwLiquidationIncentiveProv = (coords: MoonwellMarketCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: coords.blockNumber },
  verify: recompute("Comptroller.liquidationIncentiveMantissa", coords),
  summary: `Liquidation incentive${atBlock(coords)} — the Comptroller's \`liquidationIncentiveMantissa\` (1e18-scaled): the multiple of the repaid value a liquidator seizes in collateral (1.10 = seize 110% of what was repaid). A governance constant, read straight.`,
  contract: comptrollerContract(coords),
  via: `${LANE} · Comptroller.liquidationIncentiveMantissa @ head`,
});
