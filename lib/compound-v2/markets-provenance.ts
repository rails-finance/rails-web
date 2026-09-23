// Compound V2 MARKET-SURFACE provenance vocabulary — the receipts for
// /compound-v2/markets, one block's reading of the Comptroller's roster and each
// cToken's own state.
// ----------------------------------------------------------------------------
// This is the market-level counterpart of lib/compound-v2/{position,event}-
// provenance (which trace a WALLET's position and events). Nothing here concerns
// an account: every figure is a slot read on a cToken, the Comptroller, or the
// oracle it reads, at one head block — or an arithmetic over such reads. The
// source classes, graded exactly as the ladder does:
//   • state   — a contract slot at the block (totalSupply, totalBorrows, the
//     Comptroller's markets() record, the model's kink). Third-party verifiable:
//     re-run the eth_call at the block against any node.
//   • oracle  — the Comptroller's own price oracle (getUnderlyingPrice, the same
//     price its liquidation engine uses), and any value multiplied through it.
//     A no-feed market's price is a constant governance stored on that oracle —
//     still read from it, but nothing keeps it current, which the receipt says.
//   • derived — a ratio or Σ over those reads (a market's utilisation, a
//     roster-wide value sum), chain-derived and no further than its weakest input.
//
// The structured `source: { block }` slot rides every builder ALONGSIDE naming
// the block in prose — the receipt's coordinates row reads the slot (the block
// and its copy button; `ProvReceipt`, components/shared/provenance.tsx).
// A state read whose block lived only in a sentence could not be re-run.
//
// The `contract` on each receipt is the address the value was actually read
// FROM: the cToken for its own totals/rates, the Comptroller for the roster and
// the collateral factor, the oracle for a price. Real addresses throughout —
// the cToken, oracle and rate model are threaded from the market row; the
// Comptroller is the protocol's own fixed address.

import type { Provenance } from "@/components/shared/provenance";
import { COMPOUND_V2_ADDRESSES } from "@/lib/compound-v2/asset-catalog";

const LANE = "live Compound V2 reads (/compound-v2/markets)";

/** The coordinates a market-surface receipt needs: the block it was read at, the
 *  cToken it was read from, the market's own symbols, and the oracle / rate
 *  model addresses the loader read alongside it. */
export interface CompoundV2MarketCoords {
  blockNumber?: number;
  /** The cToken proxy address — the contract on this market's own reads. */
  cToken?: string;
  /** The cToken's own symbol (cETH / cUSDC / cDAI). */
  cTokenSymbol?: string;
  /** The underlying token's symbol (ETH / USDC / DAI) — what the amounts speak in. */
  underlyingSymbol?: string;
  /** The oracle the Comptroller itself reads — read from it, not hardcoded. */
  oracle?: string | null;
  /** The Chainlink-style feed backing the price, when there is one. */
  priceFeed?: string | null;
  /** This market's own interest rate model — annualization + kink read from it. */
  interestRateModel?: string | null;
}

const sym = (coords?: CompoundV2MarketCoords): string => coords?.underlyingSymbol ?? "Base";

const cTokenContract = (coords?: CompoundV2MarketCoords): Provenance["contract"] => ({
  name: coords?.cTokenSymbol ?? "cToken market",
  address: coords?.cToken,
});

const comptrollerContract = (): Provenance["contract"] => ({
  name: "Comptroller",
  address: COMPOUND_V2_ADDRESSES.COMPTROLLER,
});

const oracleContract = (coords?: CompoundV2MarketCoords): Provenance["contract"] => ({
  name: "Comptroller price oracle",
  address: coords?.oracle ?? undefined,
});

const irmContract = (coords?: CompoundV2MarketCoords): Provenance["contract"] => ({
  name: `${coords?.underlyingSymbol ?? "market"} rate model`,
  address: coords?.interestRateModel ?? undefined,
});

const atBlock = (coords?: CompoundV2MarketCoords): string =>
  coords?.blockNumber != null ? ` at block ${coords.blockNumber}` : "";

const recompute = (call: string, coords?: CompoundV2MarketCoords): Provenance["verify"] => ({
  kind: "recompute",
  text:
    coords?.blockNumber != null
      ? `Re-run the ${call} eth_call at block ${coords.blockNumber} against any node`
      : `Re-run the ${call} eth_call against any node`,
});

// ── roster summary (Comptroller-level) ───────────────────────────────────────

/** The count of markets listed — the Comptroller's own getAllMarkets() length. */
export const cvRosterProv = (coords: CompoundV2MarketCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: coords.blockNumber },
  verify: recompute("Comptroller.getAllMarkets", coords),
  summary: `Markets listed — the length of the Comptroller's own \`getAllMarkets()\`${atBlock(coords)}: the cToken markets it lists, read from the enumerator itself rather than a catalog. The roster is what the protocol says it is, not what this view decides.`,
  contract: comptrollerContract(),
  via: `${LANE} · Comptroller.getAllMarkets() @ head`,
});

/** A roster-wide supplied/borrowed total in USD — Σ over the priced markets of
 *  each one's base value (base amount × the oracle's own price). */
export const cvSummaryValueProv = (side: "supplied" | "borrowed", coords: CompoundV2MarketCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  source: { block: coords.blockNumber },
  summary: `Total ${side} — Σ over every priced market of its ${side} value${atBlock(coords)} (the market's base ${side} × the Comptroller oracle's own price for it). Every leg a live read; only the markets the oracle answers a price for are in the sum, and the sum is ours.`,
  via: `${LANE} · Σ per-market ${side} value over the priced roster @ head`,
  formula: `Σ per-market ${side} value`,
  inputs: [
    {
      label: "base amount",
      kind: "chain",
      pclass: "state",
      note: `cToken ${side === "supplied" ? "totalSupply × exchangeRateStored" : "totalBorrows"} per market @ head`,
    },
    {
      label: "oracle price",
      kind: "chain-derived",
      pclass: "oracle",
      note: "oracle.getUnderlyingPrice per market @ head",
    },
  ],
});

/** A roster total restricted to the feed-backed markets — the same Σ with the
 *  no-feed (frozen-constant) markets excluded, so the headline can be read
 *  without leaning on a stored price. */
export const cvWithFeedValueProv = (side: "supplied" | "borrowed", coords: CompoundV2MarketCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  source: { block: coords.blockNumber },
  summary: `${side === "supplied" ? "Supplied" : "Borrowed"}, feed-backed only — Σ of the ${side} value${atBlock(coords)} over just the markets whose oracle config carries a live price feed (priceFeed ≠ address(0)). The no-feed markets, priced by a stored constant, are dropped from this sum so it never rests on a frozen number.`,
  via: `${LANE} · Σ ${side} value over the feed-backed markets @ head`,
  formula: `Σ feed-backed ${side} value`,
});

/** The supplied value carried by the no-feed markets alone — Σ over the markets
 *  the oracle prices from a stored constant. */
export const cvNoFeedSuppliedProv = (coords: CompoundV2MarketCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  source: { block: coords.blockNumber },
  summary: `Supplied, no-feed markets — Σ of the supplied value${atBlock(coords)} over just the markets the oracle prices from a stored constant (priceFeed = address(0)). Shown so the reader can see exactly how much of the supplied total is resting on a price nothing updates.`,
  via: `${LANE} · Σ supplied value over the no-feed markets @ head`,
  formula: "Σ no-feed supplied value",
});

// ── market-level: sizes ──────────────────────────────────────────────────────

/** Total base supplied or borrowed, in the market's own underlying token.
 *  Supplied is the cToken's totalSupply re-priced through exchangeRateStored;
 *  borrowed is totalBorrows read straight. */
export const cvMarketBaseProv = (side: "supplied" | "borrowed", coords: CompoundV2MarketCoords): Provenance => {
  if (side === "borrowed") {
    return {
      kind: "chain",
      pclass: "state",
      source: { block: coords.blockNumber },
      verify: recompute("cToken.totalBorrows", coords),
      summary: `${sym(coords)} borrowed — the market's own \`totalBorrows\`${atBlock(coords)}, scaled by the underlying's decimals. Interest is already in it: Compound V2 accrues borrows into this slot, so it is the debt the market records, not a sum over events.`,
      contract: cTokenContract(coords),
      via: `${LANE} · cToken.totalBorrows @ head`,
    };
  }
  return {
    kind: "chain-derived",
    pclass: "state",
    source: { block: coords.blockNumber },
    summary: `${sym(coords)} supplied — the cToken's \`totalSupply\` re-priced through \`exchangeRateStored\`${atBlock(coords)}: cTokens × exchange rate ÷ 1e18, then scaled by the underlying's decimals. The cToken accrues supply interest into its exchange rate, so this is the underlying the market holds, both legs live slots.`,
    contract: cTokenContract(coords),
    via: `${LANE} · cToken.totalSupply × cToken.exchangeRateStored @ head`,
    formula: "cToken totalSupply × exchange rate",
    inputs: [
      { label: "cToken totalSupply", kind: "chain", pclass: "state", note: "cToken.totalSupply @ head" },
      { label: "exchange rate", kind: "chain", pclass: "state", note: "cToken.exchangeRateStored @ head" },
    ],
  };
};

/** Total supplied/borrowed VALUE in USD — base amount × the Comptroller oracle's
 *  own price for the underlying. */
export const cvMarketValueProv = (side: "supplied" | "borrowed", coords: CompoundV2MarketCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  source: { block: coords.blockNumber },
  summary: `${sym(coords)} ${side} in USD — the base ${side} multiplied by the Comptroller oracle's own \`getUnderlyingPrice\`${atBlock(coords)} (the price it would liquidate with, scaled 1e(36 − decimals), never a market API). A whole-token price × the token amount already read from the cToken.`,
  contract: oracleContract(coords),
  via: `${LANE} · cToken ${side === "supplied" ? "totalSupply" : "totalBorrows"} × oracle.getUnderlyingPrice @ head`,
  formula: "base amount × oracle price",
  inputs: [
    {
      label: "base amount",
      kind: "chain",
      pclass: "state",
      note: `cToken ${side === "supplied" ? "totalSupply × exchangeRateStored" : "totalBorrows"} @ head`,
      contract: cTokenContract(coords),
    },
    {
      label: "oracle price",
      kind: "chain-derived",
      pclass: "oracle",
      note: "oracle.getUnderlyingPrice @ head",
      contract: oracleContract(coords),
    },
  ],
});

/** The Comptroller oracle's own price for one whole underlying token, USD.
 *  hasFeed distinguishes a live-feed price from a governance-stored constant. */
export const cvPriceProv = (hasFeed: boolean, coords: CompoundV2MarketCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  source: { block: coords.blockNumber },
  verify: recompute("oracle.getUnderlyingPrice", coords),
  summary: hasFeed
    ? `${sym(coords)} price — the Comptroller oracle's own \`getUnderlyingPrice\`${atBlock(coords)} for one whole token, scaled 1e(36 − decimals). A live feed (priceFeed ≠ address(0)) stands behind it; this is the price the protocol itself would liquidate with.`
    : `${sym(coords)} price, no feed — the Comptroller oracle's \`getUnderlyingPrice\`${atBlock(coords)}, but its \`getConfig\` shows priceFeed = address(0): a constant governance stored, with nothing keeping it current. Shown as the protocol's own number, flagged that it is frozen, never presented as a live reading.`,
  contract: oracleContract(coords),
  via: `${LANE} · oracle.getUnderlyingPrice · oracle.getConfig @ head`,
});

// ── market-level: rate curve ─────────────────────────────────────────────────

/** The rate-model kink — the utilisation the model's curve turns steep at, read
 *  from THIS market's own interest rate model. */
export const cvKinkProv = (coords: CompoundV2MarketCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: coords.blockNumber },
  verify: recompute("InterestRateModel.kink", coords),
  summary: `${sym(coords)} kink — the market's own interest rate model's \`kink()\`${atBlock(coords)} (1e18-scaled): the utilisation its curve turns steep at. Read from the model this cToken names, not assumed — the roster runs several models, and the oldest have no kink at all.`,
  contract: irmContract(coords),
  via: `${LANE} · InterestRateModel.kink() @ head`,
});

/** A live annualised rate — {supply,borrow}RatePerBlock × the model's own
 *  blocksPerYear, both the protocol's own arithmetic. */
export const cvRateProv = (side: "supply" | "borrow", coords: CompoundV2MarketCoords): Provenance => {
  const method = side === "supply" ? "supplyRatePerBlock" : "borrowRatePerBlock";
  return {
    kind: "chain-derived",
    pclass: "state",
    source: { block: coords.blockNumber },
    summary: `${sym(coords)} ${side} APR — the cToken's \`${method}\` annualized on its OWN model's \`blocksPerYear()\`${atBlock(coords)} (× 100). Per-block, not per-second, and the constant is read per model because the roster does not agree on one — cETH's model says 2,628,000 while the rest say 2,102,400.`,
    contract: cTokenContract(coords),
    via: `${LANE} · cToken.${method} × InterestRateModel.blocksPerYear() @ head`,
    formula: "per-block rate × blocks per year",
    inputs: [
      {
        label: "per-block rate",
        kind: "chain",
        pclass: "state",
        note: `cToken.${method} @ head`,
        contract: cTokenContract(coords),
      },
      {
        label: "blocks per year",
        kind: "chain",
        pclass: "state",
        note: "InterestRateModel.blocksPerYear() @ head",
        contract: irmContract(coords),
      },
    ],
  };
};

// ── collateral factor (Comptroller-level) ────────────────────────────────────

/** A market's collateral factor — the Comptroller's markets() record for the
 *  cToken, the share of a supply's value that can back borrowing. */
export const cvCollateralFactorProv = (coords: CompoundV2MarketCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: coords.blockNumber },
  verify: recompute("Comptroller.markets", coords),
  summary: `${sym(coords)} collateral factor — the \`collateralFactorMantissa\` in the Comptroller's own \`markets(cToken)\` record${atBlock(coords)} (1e18-scaled): the share of a supply's value that can back borrowing. A zero here is not a 0% limit — it is the market switched off as collateral, and the view says so rather than drawing a rung.`,
  contract: comptrollerContract(),
  via: `${LANE} · Comptroller.markets(cToken) · collateralFactorMantissa @ head`,
});
