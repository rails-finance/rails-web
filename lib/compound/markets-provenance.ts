// Compound V3 (Comet) MARKET-SURFACE provenance vocabulary — the receipts for
// /compound/markets, one block's reading of each Comet contract.
// ----------------------------------------------------------------------------
// This is the market-level counterpart of lib/compound/*-provenance (which trace
// a WALLET's position and events). Nothing here concerns an account: every
// figure is a slot read on a Comet proxy at one head block, or an arithmetic
// over such reads. Three source classes, graded exactly as the ladder does:
//   • state   — a contract slot at the block (totalSupply, getUtilization, the
//     curve kinks, the reserve line, a collateral asset's pooled total). All
//     third-party verifiable: re-run the eth_call at the block against any node.
//   • oracle  — the market's own getPrice on a configured feed (the same price
//     its liquidation engine uses), and any value multiplied through it.
//   • derived — a ratio or Σ over those reads (utilisation-of-the-roster, a
//     value sum), chain-derived and no further than its weakest input.
//
// The structured `source: { block }` slot rides every builder ALONGSIDE naming
// the block in prose — the receipt's coordinates row reads the slot (the block
// and its copy button; `ProvReceipt`, components/shared/provenance.tsx).
// A state read whose block lived only in a sentence could not be re-run.
//
// The Comet proxy is the `contract` on every market-level receipt (the address
// the value was read from); a collateral-level receipt keeps the same proxy —
// pooled collateral totals are a Comet slot (totalsCollateral), not a token
// read. Real addresses throughout, threaded from the market row.

import type { Provenance } from "@/components/shared/provenance";

const LANE = "live Comet reads (/compound/markets)";

/** The coordinates a market-surface receipt needs: the block it was read at, the
 *  Comet proxy it was read from, and the units it speaks in. Collateral-level
 *  builders add the collateral asset's identity. */
export interface CompoundMarketCoords {
  blockNumber?: number;
  /** The Comet proxy address — the contract on every receipt for this market. */
  comet?: string;
  /** The market's base symbol (USDC / WETH / USDT). */
  baseSymbol?: string;
  /** The market's quote unit — "USD" or "ETH". */
  quoteUnit?: string;
  /** Collateral-level: the collateral token's symbol + address. */
  collateralSymbol?: string;
  collateralAsset?: string;
}

const cometContract = (coords?: CompoundMarketCoords): Provenance["contract"] => ({
  name: coords?.baseSymbol ? `${coords.baseSymbol} Comet` : "Comet market",
  address: coords?.comet ?? "0x0000000000000000000000000000000000000000",
});

const atBlock = (coords?: CompoundMarketCoords): string =>
  coords?.blockNumber != null ? ` at block ${coords.blockNumber}` : "";

const recompute = (call: string, coords?: CompoundMarketCoords): Provenance["verify"] => ({
  kind: "recompute",
  text:
    coords?.blockNumber != null
      ? `Re-run the ${call} eth_call at block ${coords.blockNumber} against any node`
      : `Re-run the ${call} eth_call against any node`,
});

// ── market-level: sizes ──────────────────────────────────────────────────────

/** Total base supplied or borrowed — Comet's own totals slot (interest already
 *  in it, via the live index). */
export const cvMarketBaseProv = (side: "supplied" | "borrowed", coords: CompoundMarketCoords): Provenance => {
  const method = side === "supplied" ? "totalSupply" : "totalBorrow";
  return {
    kind: "chain",
    pclass: "state",
    source: { block: coords.blockNumber },
    verify: recompute(`Comet.${method}`, coords),
    summary: `${coords.baseSymbol ?? "Base"} ${side} — the market's own \`${method}\`${atBlock(coords)}, scaled by the base asset's decimals. Interest is already in the figure: Comet carries a live index on its totals, so this is what the market records as ${side}, not a sum over events.`,
    contract: cometContract(coords),
    via: `${LANE} · Comet.${method} @ head`,
  };
};

/** Total supplied/borrowed VALUE in the market's quote unit — base amount × the
 *  market's own oracle price for its base. */
export const cvMarketValueProv = (side: "supplied" | "borrowed", coords: CompoundMarketCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  source: { block: coords.blockNumber },
  summary: `${coords.baseSymbol ?? "Base"} ${side} valued in ${coords.quoteUnit ?? "the quote unit"} — the base ${side} multiplied by the market's OWN getPrice on its base feed${atBlock(coords)} (the price its liquidation engine uses, never a market API). The quote unit is the base asset's own unit, so an ETH market's value is ETH and is never summed with a dollar market's.`,
  contract: cometContract(coords),
  via: `${LANE} · Comet.total${side === "supplied" ? "Supply" : "Borrow"} × Comet.getPrice(base feed) @ head`,
  formula: "base amount × oracle price",
  inputs: [
    {
      label: "base amount",
      kind: "chain",
      pclass: "state",
      note: `Comet.total${side === "supplied" ? "Supply" : "Borrow"} @ head`,
    },
    { label: "oracle price", kind: "chain-derived", pclass: "oracle", note: "Comet.getPrice on the base feed @ head" },
  ],
});

// ── market-level: rate curve ─────────────────────────────────────────────────

/** Utilisation — Comet's own getUtilization (totalBorrow ÷ totalSupply of the
 *  base), the number the whole rate curve is written against. */
export const cvUtilizationProv = (coords: CompoundMarketCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: coords.blockNumber },
  verify: recompute("Comet.getUtilization", coords),
  summary: `Utilisation — the market's own \`getUtilization\`${atBlock(coords)}: totalBorrow ÷ totalSupply of the base, the contract's OWN arithmetic (1e18-scaled), not re-derived here. Every point on the rate curve is priced from this one number.`,
  contract: cometContract(coords),
  via: `${LANE} · Comet.getUtilization @ head`,
});

/** A rate-curve kink — the utilisation a curve turns steep at (supplyKink /
 *  borrowKink), a governance-set slot on the same axis as the fill. */
export const cvKinkProv = (which: "supply" | "borrow", coords: CompoundMarketCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: coords.blockNumber },
  verify: recompute(`Comet.${which}Kink`, coords),
  summary: `${which === "supply" ? "Supply" : "Borrow"}-rate kink — the market's \`${which}Kink\`${atBlock(coords)}: the utilisation the ${which} curve turns steep at, governance-set (1e18-scaled). It sits on the utilisation axis, so it is drawn against the fill rather than stated apart.`,
  contract: cometContract(coords),
  via: `${LANE} · Comet.${which}Kink @ head`,
});

/** A live annualised rate — getSupplyRate / getBorrowRate at the current
 *  utilisation, the contract's per-second answer × seconds per year. */
export const cvRateProv = (side: "supply" | "borrow", coords: CompoundMarketCoords): Provenance => {
  const method = side === "supply" ? "getSupplyRate" : "getBorrowRate";
  return {
    kind: "chain-derived",
    pclass: "state",
    source: { block: coords.blockNumber },
    verify: recompute(`Comet.${method}`, coords),
    summary: `${side === "supply" ? "Supply" : "Borrow"} APR — the market's \`${method}\` at the current utilisation${atBlock(coords)}, annualized from the contract's per-second rate (× 31,536,000). The rate the contract itself would apply this block, read at the utilisation it reports.`,
    contract: cometContract(coords),
    via: `${LANE} · Comet.${method}(utilization) × seconds/year @ head`,
    formula: "per-second rate × seconds per year",
    inputs: [
      { label: "per-second rate", kind: "chain", pclass: "state", note: `Comet.${method}(utilization) @ head` },
      { label: "utilization", kind: "chain", pclass: "state", note: "Comet.getUtilization @ head" },
    ],
  };
};

// ── market-level: the reserve line ───────────────────────────────────────────

/** The market's reserve line — getReserves, SIGNED base units (can run
 *  negative), and its governance target. */
export const cvReservesProv = (kind: "line" | "target", coords: CompoundMarketCoords): Provenance => {
  const method = kind === "line" ? "getReserves" : "targetReserves";
  return {
    kind: "chain",
    pclass: "state",
    source: { block: coords.blockNumber },
    verify: recompute(`Comet.${method}`, coords),
    summary:
      kind === "line"
        ? `Reserve line — the market's \`getReserves\`${atBlock(coords)}, SIGNED base units: it can run negative. Below its target the market sells absorbed collateral at the configured discount to refill; at or above, those sales stop.`
        : `Reserve target — the market's \`targetReserves\`${atBlock(coords)}: the level governance set for the reserve line, above which the market stops selling absorbed collateral.`,
    contract: cometContract(coords),
    via: `${LANE} · Comet.${method} @ head`,
  };
};

/** The smallest borrow the market accepts — baseBorrowMin. */
export const cvBaseBorrowMinProv = (coords: CompoundMarketCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: coords.blockNumber },
  verify: recompute("Comet.baseBorrowMin", coords),
  summary: `Minimum borrow — the market's \`baseBorrowMin\`${atBlock(coords)}, base units: the smallest borrow the contract will open. A governance-set floor, read straight from the slot.`,
  contract: cometContract(coords),
  via: `${LANE} · Comet.baseBorrowMin @ head`,
});

/** Total collateral backing, market quote unit — Σ over the roster of each
 *  collateral's pooled total × its own oracle price. */
export const cvCollateralBackingProv = (coords: CompoundMarketCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  source: { block: coords.blockNumber },
  summary: `Collateral backing — the market's collateral valued in ${coords.quoteUnit ?? "the quote unit"}${atBlock(coords)}: Σ over the market's own roster (numAssets / getAssetInfo) of each asset's pooled total (totalsCollateral) × its configured oracle price. Every leg a live Comet read; the sum is ours.`,
  contract: cometContract(coords),
  via: `${LANE} · Σ totalsCollateral × getPrice over the roster @ head`,
  formula: "Σ (collateral total × oracle price)",
  inputs: [
    { label: "collateral total", kind: "chain", pclass: "state", note: "Comet.totalsCollateral per asset @ head" },
    { label: "oracle price", kind: "chain-derived", pclass: "oracle", note: "Comet.getPrice per asset feed @ head" },
  ],
});

// ── collateral-level ─────────────────────────────────────────────────────────

/** One collateral asset's market-wide pooled total — totalsCollateral, the
 *  asset's own units (pooled per asset, not per account). */
export const cvCollateralSuppliedProv = (coords: CompoundMarketCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: coords.blockNumber },
  verify: recompute("Comet.totalsCollateral", coords),
  summary: `${coords.collateralSymbol ?? "Collateral"} supplied — the market's \`totalsCollateral\` for this asset${atBlock(coords)}, in the asset's own units. Comet pools collateral per asset (not per account), so this is the whole market's holding of it, scaled by getAssetInfo's own \`scale\`.`,
  contract: cometContract(coords),
  via: `${LANE} · Comet.totalsCollateral(asset) @ head`,
});

/** One collateral asset's value in the market's quote unit — pooled total × its
 *  configured oracle price. */
export const cvCollateralValueProv = (coords: CompoundMarketCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  source: { block: coords.blockNumber },
  summary: `${coords.collateralSymbol ?? "Collateral"} value — its pooled total valued in ${coords.quoteUnit ?? "the quote unit"}${atBlock(coords)}: totalsCollateral × the market's OWN getPrice on this asset's configured feed. The price its liquidation engine uses, not a market API.`,
  contract: cometContract(coords),
  via: `${LANE} · Comet.totalsCollateral × Comet.getPrice(asset feed) @ head`,
  formula: "collateral total × oracle price",
  inputs: [
    { label: "collateral total", kind: "chain", pclass: "state", note: "Comet.totalsCollateral(asset) @ head" },
    { label: "oracle price", kind: "chain-derived", pclass: "oracle", note: "Comet.getPrice on the asset feed @ head" },
  ],
});

/** A collateral asset's governance factor — borrowCollateralFactor /
 *  liquidateCollateralFactor / liquidationFactor, off getAssetInfo. */
export const cvCollateralFactorProv = (
  which: "borrow" | "liquidate" | "liquidation",
  coords: CompoundMarketCoords,
): Provenance => {
  const field =
    which === "borrow"
      ? "borrowCollateralFactor"
      : which === "liquidate"
        ? "liquidateCollateralFactor"
        : "liquidationFactor";
  const gloss =
    which === "borrow"
      ? "what new borrowing can be drawn against this collateral (0 means new borrowing is switched off while it stays liquidation-eligible)"
      : which === "liquidate"
        ? "the collateral ratio at which a position holding this asset becomes absorbable"
        : "the share of the collateral's value an absorbed account is credited";
  return {
    kind: "chain",
    pclass: "state",
    source: { block: coords.blockNumber },
    verify: recompute("Comet.getAssetInfo", coords),
    summary: `${coords.collateralSymbol ?? "Collateral"} ${field} — off the market's \`getAssetInfo\` for this asset${atBlock(coords)} (1e18-scaled): ${gloss}. A governance-set slot, read straight.`,
    contract: cometContract(coords),
    via: `${LANE} · Comet.getAssetInfo(asset) · ${field} @ head`,
  };
};

// ── roster summary (block-level; no single contract) ─────────────────────────

/** A quote-unit total over the markets sharing one unit — Σ of the per-market
 *  values (never blended across units). */
export const cvSummaryValueProv = (
  side: "supplied" | "borrowed",
  unit: string,
  coords: CompoundMarketCoords,
): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  source: { block: coords.blockNumber },
  summary: `${unit === "USD" ? "Dollar-market" : `${unit}-market`} ${side} — Σ over the markets quoting in ${unit} of each one's ${side} value${atBlock(coords)} (base total × its own oracle price). One unit per sum: markets in other units stand apart, never blended into this figure.`,
  via: `${LANE} · Σ per-market ${side} value over the ${unit} markets @ head`,
  formula: `Σ ${unit}-market ${side} value`,
});
