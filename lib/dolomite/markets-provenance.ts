// Dolomite MARKET-SURFACE provenance vocabulary — the receipts for
// /dolomite/markets, one head block's reading of the DolomiteMargin core.
// ----------------------------------------------------------------------------
// The market-level counterpart of lib/dolomite/*-provenance (which trace a
// wallet's ACCOUNT and its events). Nothing here concerns an account: every
// figure is a call on the DolomiteMargin core at one head block, or an
// arithmetic over such calls. The classes grade exactly as the ladder does:
//   • state   — a core method read at the block (getNumMarkets, getMarketTotalPar,
//     getMarketCurrentIndex, getMarketMarginPremium, getMarginRatio, …). All
//     third-party verifiable: re-run the eth_call at the block against any node.
//   • oracle  — the core's OWN getMarketPrice (the same price its liquidation
//     engine uses), and any value multiplied through it.
//   • derived — a ratio or Σ over those reads (utilisation, a value sum), chain-
//     derived and no further than its weakest input.
//
// The structured `source: { block }` slot rides every builder ALONGSIDE naming
// the block in prose — the receipt's coordinates row reads the slot (the block
// and its copy button; `ProvReceipt`, components/shared/provenance.tsx).
// A state read whose block lived only in a sentence could not be re-run.
//
// Every market-level read hits ONE contract: DolomiteMargin (the core). The
// per-market TOKEN address is display identity, not where these figures were
// read — getMarketX(id) is a call on the core, so the core is the `contract`
// on every receipt. Its address is the pinned catalog constant because that IS
// the contract every read was performed against (the payload carries no field
// for it — only the token addresses and the override setter).
//
// ⚠️ The account-level carve-out is NOT expressed here: its terms
// (getAccountRiskOverrideByAccount) are account-keyed and unreadable on a
// market roster, so this vocabulary states only the GLOBAL constants the ladder
// is built from and points the reader at each position page for the override.

import type { Provenance } from "@/components/shared/provenance";
import { DOLOMITE_ADDRESSES } from "@/lib/dolomite/asset-catalog";

const LANE = "live DolomiteMargin reads (/dolomite/markets)";

/** The coordinates a market-surface receipt needs: the block it was read at, and
 *  (per-market) the market's numeric id and symbol. Summary/global builders take
 *  the block alone. */
export interface DolomiteMarketCoords {
  blockNumber?: number;
  /** Dolomite's own numeric market key. */
  marketId?: number;
  /** The market's token symbol (display only). */
  symbol?: string;
}

/** DolomiteMargin — the core every market-level read is a call on. */
const marginContract = (): Provenance["contract"] => ({
  name: "DolomiteMargin",
  address: DOLOMITE_ADDRESSES.MARGIN,
});

const atBlock = (c?: DolomiteMarketCoords): string => (c?.blockNumber != null ? ` at block ${c.blockNumber}` : "");

const recompute = (call: string, c?: DolomiteMarketCoords): Provenance["verify"] => ({
  kind: "recompute",
  text:
    c?.blockNumber != null
      ? `Re-run the ${call} eth_call at block ${c.blockNumber} against any node`
      : `Re-run the ${call} eth_call against any node`,
});

/** The market's name for the prose — its symbol, or a neutral fallback. */
const sym = (c?: DolomiteMarketCoords): string => c?.symbol ?? "This market";
/** The market's identity for the prose — "market 3" / "the market". */
const mkt = (c?: DolomiteMarketCoords): string => (c?.marketId != null ? `market ${c.marketId}` : "the market");

// ── roster ───────────────────────────────────────────────────────────────────

/** The number of markets the core lists — getNumMarkets, the roster enumerator
 *  Dolomite exposes (unlike Comet, whose roster is stated). */
export const dolRosterCountProv = (c: DolomiteMarketCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("DolomiteMargin.getNumMarkets", c),
  summary: `Markets listed — the core's own \`getNumMarkets\`${atBlock(c)}. Dolomite's admin can list markets (LogAddMarket), so the roster size is read from the core, never a hardcoded count.`,
  contract: marginContract(),
  via: `${LANE} · DolomiteMargin.getNumMarkets @ head`,
});

// ── per-market: sizes ──────────────────────────────────────────────────────────

/** A market's supplied / borrowed value in USD — its token amount valued at the
 *  core's own getMarketPrice (scale 1e(36 − decimals)). */
export const dolMarketValueProv = (side: "supplied" | "borrowed", c: DolomiteMarketCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  source: { block: c.blockNumber },
  summary: `${sym(c)} ${side} in USD — ${mkt(c)}'s ${side} amount valued at the core's OWN \`getMarketPrice\`${atBlock(c)} (scale 1e(36 − decimals)), the same price its liquidation engine uses, never a market API.`,
  contract: marginContract(),
  via: `${LANE} · (par × index) × getMarketPrice @ head`,
  formula: "amount × oracle price",
  inputs: [
    {
      label: "amount",
      kind: "chain-derived",
      pclass: "state",
      note: "getMarketTotalPar × getMarketCurrentIndex ÷ 1e18 @ head",
    },
    { label: "oracle price", kind: "chain-derived", pclass: "oracle", note: "getMarketPrice @ head" },
  ],
});

/** A market's own oracle price — getMarketPrice, the same price the core's
 *  risk engine values and liquidates with. The per-account risk card carried
 *  this figure per touched market; this is the roster-wide counterpart. */
export const dolMarketPriceProv = (c: DolomiteMarketCoords): Provenance => ({
  kind: "chain",
  pclass: "oracle",
  source: { block: c.blockNumber },
  verify: recompute("DolomiteMargin.getMarketPrice", c),
  summary: `${sym(c)} price in USD — ${mkt(c)}'s own \`getMarketPrice\`${atBlock(c)} (scale 1e(36 − decimals)), the same price the core's risk engine values and liquidates with. Live feeds, not pins (anti-pin proven: no stable answers exactly 1e(36 − decimals)).`,
  contract: marginContract(),
  via: `${LANE} · getMarketPrice @ head`,
});

// ── per-market: the risk ladder ─────────────────────────────────────────────────

/** A market's own margin premium — getMarketMarginPremium, multiplicative with
 *  the global ratio (dYdX Solo semantics), never additive. */
export const dolMarginPremiumProv = (c: DolomiteMarketCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("DolomiteMargin.getMarketMarginPremium", c),
  summary: `${sym(c)} margin premium — ${mkt(c)}'s own \`getMarketMarginPremium\`${atBlock(c)} (1e18 → fraction). It MULTIPLIES the global minimum collateralisation (Solo semantics: adjusted borrow = raw × (1 + premium)); it does not add to it.`,
  contract: marginContract(),
  via: `${LANE} · getMarketMarginPremium @ head`,
});

/** A market's effective minimum collateralisation as collateral — the ladder's
 *  rung: (1 + global marginRatio) × (1 + its margin premium). */
export const dolMinCollatProv = (c: DolomiteMarketCoords): Provenance => ({
  kind: "chain-derived",
  source: { block: c.blockNumber },
  summary: `${sym(c)} minimum collateralisation — ${mkt(c)}'s effective minimum as collateral${atBlock(c)}: (1 + the global margin ratio, \`getMarginRatio\`) × (1 + its margin premium, \`getMarketMarginPremium\`). Multiplicative, the core's own arithmetic — a 27.5% premium lands at ≈150%, not an additive 145%.`,
  contract: marginContract(),
  via: `${LANE} · (1 + getMarginRatio) × (1 + getMarketMarginPremium) @ head`,
  formula: "(1 + margin ratio) × (1 + margin premium)",
  inputs: [
    { label: "margin ratio", kind: "chain", pclass: "state", note: "getMarginRatio @ head" },
    { label: "margin premium", kind: "chain", pclass: "state", note: "getMarketMarginPremium @ head" },
  ],
});

/** A market's liquidation spread — the collateral premium a liquidator earns
 *  seizing it: the global spread × (1 + its spread premium). */
export const dolMarketSpreadProv = (c: DolomiteMarketCoords): Provenance => ({
  kind: "chain-derived",
  source: { block: c.blockNumber },
  summary: `${sym(c)} liquidation spread — the collateral premium a liquidator earns seizing ${mkt(c)}${atBlock(c)}: the global \`getLiquidationSpread\` × (1 + its \`getMarketSpreadPremium\`).`,
  contract: marginContract(),
  via: `${LANE} · getLiquidationSpread × (1 + getMarketSpreadPremium) @ head`,
  formula: "liquidation spread × (1 + spread premium)",
  inputs: [
    { label: "liquidation spread", kind: "chain", pclass: "state", note: "getLiquidationSpread @ head" },
    { label: "spread premium", kind: "chain", pclass: "state", note: "getMarketSpreadPremium @ head" },
  ],
});

// ── per-market: utilisation and rates ────────────────────────────────────────────

/** A market's live APR. Borrow = getMarketInterestRate (per second) annualized;
 *  supply = borrow × utilisation × the core's earnings rate. */
export const dolRateProv = (side: "supply" | "borrow", c: DolomiteMarketCoords): Provenance => {
  if (side === "borrow") {
    return {
      kind: "chain-derived",
      pclass: "state",
      source: { block: c.blockNumber },
      verify: recompute("DolomiteMargin.getMarketInterestRate", c),
      summary: `${sym(c)} borrow APR — ${mkt(c)}'s \`getMarketInterestRate\` (per second, 1e18) annualized (× 31,536,000)${atBlock(c)}. The rate the core itself applies this block; the index accrues on read.`,
      contract: marginContract(),
      via: `${LANE} · getMarketInterestRate × seconds/year @ head`,
      formula: "per-second rate × seconds per year",
      inputs: [{ label: "per-second rate", kind: "chain", pclass: "state", note: "getMarketInterestRate @ head" }],
    };
  }
  return {
    kind: "chain-derived",
    source: { block: c.blockNumber },
    summary: `${sym(c)} supply APR — what suppliers earn on ${mkt(c)}${atBlock(c)}: its borrow APR × utilisation × the core's \`getEarningsRate\` (the share of borrow interest paid through, 0.8). Dolomite's own formula, every input the core's.`,
    contract: marginContract(),
    via: `${LANE} · borrow APR × utilisation × getEarningsRate @ head`,
    formula: "borrow APR × utilisation × earnings rate",
    inputs: [
      {
        label: "borrow APR",
        kind: "chain-derived",
        pclass: "state",
        note: "getMarketInterestRate × seconds/year @ head",
      },
      { label: "utilisation", kind: "chain-derived", pclass: "state", note: "borrowed ÷ supplied @ head" },
      { label: "earnings rate", kind: "chain", pclass: "state", note: "getEarningsRate @ head" },
    ],
  };
};

// ── roster summary ───────────────────────────────────────────────────────────

/** A roster-wide value total — Σ over the priced markets of each one's value. */
export const dolSummaryValueProv = (side: "supplied" | "borrowed", c: DolomiteMarketCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  source: { block: c.blockNumber },
  summary: `Total ${side} — Σ over the priced roster of each market's ${side} value${atBlock(c)} ((par × current index) × getMarketPrice). Every leg a live core read; the sum is ours.`,
  contract: marginContract(),
  via: `${LANE} · Σ per-market ${side} value @ head`,
  formula: `Σ ${side} value`,
});

// ── global risk constants (the ladder's base, and the carve-out's frame) ──────

/** The global minimum collateralisation — 1 + getMarginRatio, the floor every
 *  zero-premium market sits at and the frame the carve-out narrows. */
export const dolGlobalMinProv = (c: DolomiteMarketCoords): Provenance => ({
  kind: "chain-derived",
  source: { block: c.blockNumber },
  summary: `Global minimum collateralisation — 1 + the core's own \`getMarginRatio\`${atBlock(c)}, the floor every zero-premium market sits at. Per-market margin premiums multiply up from here; the account-level override (read per account on each position page) narrows it.`,
  contract: marginContract(),
  via: `${LANE} · 1 + getMarginRatio @ head`,
  formula: "1 + margin ratio",
  inputs: [{ label: "margin ratio", kind: "chain", pclass: "state", note: "getMarginRatio @ head" }],
});

/** The global liquidation spread — getLiquidationSpread, before any per-market
 *  spread premium multiplies it. */
export const dolGlobalSpreadProv = (c: DolomiteMarketCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("DolomiteMargin.getLiquidationSpread", c),
  summary: `Global liquidation spread — the core's own \`getLiquidationSpread\`${atBlock(c)}, the collateral premium a liquidator earns before any per-market spread premium multiplies it. The account-level override (read per account on each position page) narrows it.`,
  contract: marginContract(),
  via: `${LANE} · getLiquidationSpread @ head`,
});
