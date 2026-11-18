"use client";

// Which deployment an Aave V3 POSITION CARD is describing — the receipts and
// labels that differ between Ethereum's indexed three-market lane and a Base
// lender read straight from its own Pool.
// ----------------------------------------------------------------------------
// The card (components/protocol/aave-v3/aave-v3-position-card.tsx) is shared
// by every Aave-shaped listing. Its arithmetic is deployment-blind, but five
// things it prints are not, and each was wrong the first time a Seamless row
// rendered through it (2026-08-25):
//   • the market label read "Core" (MARKET_NAME had no Base key);
//   • the wallet pill filtered and bookmarked under "aave-v3";
//   • the balance receipts described the index's scaled-balance reduction and
//     named Ethereum's Core Pool, for a number that was a balanceOf on Base;
//   • the health-factor receipt named /api/aave-v3/positions and the mainnet
//     snapshot table;
//   • the USD and liquidation-price receipts named Ethereum's IAaveOracle.
// All five are one object now, provided by context so the card's inner pieces
// need no threading, and defaulting to Ethereum so nothing existing changes.

import { createContext, useContext, type ReactNode } from "react";
import type { Provenance } from "@/components/shared/provenance";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { AAVE_V3_POOL, MARKET_NAME, POOL_BY_MARKET } from "./asset-catalog";
import { accountDataProv, serverReadVia } from "./position-provenance";
import type { PositionHeadStamp } from "@/lib/api/fetch-aave-v3-position";

/** rails-server's head read and the block it read at. */
type ServerRead = PositionHeadStamp & { block: number };
import {
  positionSupplyProv,
  positionDebtProv,
  aaveV3PeakSupplyProv,
  aaveV3PeakBorrowProv,
  v3Oracle,
} from "./event-provenance";
import { aaveV3UsdReceipt, aaveV3LiqPriceReceipt, type AaveV3UsdRows } from "./usd-receipt";
import { aaveV3IndexBalanceNote } from "./price-notes";

export interface AaveV3CardDeployment {
  /** The session the wallet pill filters and bookmarks under. */
  session: SessionProtocol;
  /** Text beside the wallet naming the market; empty for a single-market
   *  deployment, where naming it would only repeat the page title. */
  marketLabel: (market: string) => string;
  /** `readBy`: rails-server's head read, where it answered the page's read. */
  supply: (symbol: string, atBlock?: number, readBy?: ServerRead) => Provenance;
  debt: (symbol: string, atBlock?: number, readBy?: ServerRead) => Provenance;
  /** The health factor's receipt — only on a deployment whose card is the
   *  position page's, where the HF is the page's own live Pool read. A
   *  listing deployment has none: a listing card carries no HF (0018). */
  healthFactor?: (market: string, atBlock?: number, readBy?: ServerRead) => Provenance;
  /** A side's dollars and the receipt that rebuilds them from its rows;
   *  null where a reserve is unpriced. `market`: the row's market, whose
   *  oracle prices it. */
  usd: (what: string, side: Side, rows: AaveV3UsdRows, market?: string) => UsdReceipt | null;
  liqPrice: (read: LiqRead, market?: string) => { prov: Provenance; liqPrice: number };
  /** "Liquidates on a drop of": 1 − 1 ÷ the health factor the Pool reports. */
  liqDrop: (market?: string) => Provenance;
  /** A closed account's "highest recorded" figures — where the maximum came
   *  from on this lane (the index's replay on Ethereum; the live sweep's
   *  principal replay on a Base lender). */
  peakSupply: (symbol: string) => Provenance;
  peakDebt: (symbol: string) => Provenance;
  /** The "incl. $X interest" caption — present on a deployment whose card
   *  carries the caption (a position page); a listing card has none. `rows`
   *  carry each reserve's interest in tokens. */
  interestCaption?: (side: Side, rows: AaveV3UsdRows, market?: string) => UsdReceipt | null;
}

type Side = "supply" | "debt";
type UsdReceipt = { prov: Provenance; usd: number };
/** The liquidation price's two reads. */
export interface LiqRead {
  symbol: string;
  price: number;
  priceBlock?: number | null;
  hf: number;
  hfBlock?: number | null;
}

const INTEREST_NOTE: Record<Side, (symbol: string) => string> = {
  supply: (s) =>
    `interest inside the ${s} balance since it last started from zero, from the rows' balances before and after`,
  debt: (s) =>
    `interest inside the ${s} debt since it last started from zero, from the rows' balances before and after`,
};
const INTEREST_WHAT: Record<Side, string> = {
  supply: "Supply interest inside the collateral balance above",
  debt: "Borrow interest inside the debt balance above",
};
/** Where each side's interest starts, and what it leaves to the Lifetime flows panel. */
const INTEREST_CAVEAT: Record<Side, string> = {
  supply:
    "Per reserve, the interest since the balance last started from zero; a balance under a cent counts as zero. Interest from before that start left with earlier withdrawals; the Lifetime flows panel counts all of it.",
  debt: "Per reserve, the interest since the debt last started from zero; a debt under a cent counts as zero. Interest from before that start was repaid; the Lifetime flows panel counts all of it.",
};

/** The dollar receipts every deployment shares: what changes is the oracle,
 *  the Pool and where each balance comes from. */
function usdReceipts(o: {
  oracleOf: (market?: string) => { name: string; address: string };
  poolOf: (market?: string) => { name: string; address: string };
  amountNote: (side: Side, symbol: string, block: number | null | undefined) => string;
  via: string;
}): Pick<AaveV3CardDeployment, "usd" | "liqPrice" | "interestCaption"> {
  return {
    usd: (what, side, rows, market) =>
      aaveV3UsdReceipt({
        what: `${what} in USD`,
        rows,
        oracle: o.oracleOf(market),
        amountNote: (sym) => o.amountNote(side, sym, rows.balanceBlock),
        via: o.via,
      }),
    liqPrice: (read, market) => aaveV3LiqPriceReceipt({ ...read, oracle: o.oracleOf(market), pool: o.poolOf(market) }),
    interestCaption: (side, rows, market) =>
      aaveV3UsdReceipt({
        what: INTEREST_WHAT[side],
        rows,
        oracle: o.oracleOf(market),
        amountNote: INTEREST_NOTE[side],
        note: INTEREST_CAVEAT[side],
        via: "(Σ (row before − previous row after) + (balance now − last row after)) × IAaveOracle getAssetPrice, per reserve",
      }),
  };
}

export const ETHEREUM_CARD_DEPLOYMENT: AaveV3CardDeployment = {
  session: "aave-v3",
  marketLabel: (m) => MARKET_NAME[m] ?? "Core",
  supply: positionSupplyProv,
  debt: positionDebtProv,
  // The position page merges its own live read over the listing view; the
  // receipt names that read (Pool.getUserAccountData @ head on the market's
  // Pool), not a snapshot.
  healthFactor: (market, _atBlock, readBy) =>
    accountDataProv("Health factor", "healthFactor", POOL_BY_MARKET[market] ?? AAVE_V3_POOL, readBy),
  ...usdReceipts({
    oracleOf: v3Oracle,
    poolOf: (market) => ({ name: "Aave V3 Pool", address: (market && POOL_BY_MARKET[market]) || AAVE_V3_POOL }),
    // The index accrues each balance to its latest indexed block, which the
    // listing does not state: the row names no block for it.
    amountNote: (side, sym) => aaveV3IndexBalanceNote(sym, side),
    via: "indexed balance × IAaveOracle getAssetPrice",
  }),
  liqDrop: (market) =>
    liqDropProv({ name: "Aave V3 Pool", address: (market && POOL_BY_MARKET[market]) || AAVE_V3_POOL }),
  peakSupply: aaveV3PeakSupplyProv,
  peakDebt: aaveV3PeakBorrowProv,
};

const Ctx = createContext<AaveV3CardDeployment>(ETHEREUM_CARD_DEPLOYMENT);

export function AaveV3CardDeploymentProvider({
  value,
  children,
}: {
  value: AaveV3CardDeployment;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAaveV3CardDeployment(): AaveV3CardDeployment {
  return useContext(Ctx);
}

const at = (block?: number): string => (block != null ? ` at block ${block.toLocaleString("en-US")}` : "");
/** The drop the whole collateral can take before liquidation: a function of
 *  the Pool's health factor alone, so its one input is that read. */
const liqDropProv = (pool: { name: string; address: string }): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary:
    "Drop to liquidation — how far the dollar value of all the collateral can fall, the debt standing still, before the health factor reaches 1 and the position can be liquidated.",
  contract: pool,
  via: "1 − 1 ÷ Pool getUserAccountData health factor",
  formula: "1 − 1 ÷ health factor",
  inputs: [{ label: "health factor", kind: "chain", pclass: "state", note: "Pool getUserAccountData" }],
});

/** A Base or Arbitrum lender's balance row: the reserve token's balanceOf at
 *  the card's block. */
const balanceOfNote = (side: Side, sym: string, block: number | null | undefined) =>
  `${sym} ${side === "supply" ? "aToken" : "variableDebtToken"} balanceOf${at(block ?? undefined)}`;

const RECOMPUTE = { kind: "recompute" as const, text: "To check: make the same call to the contract on any node." };

/** A Base lender's LISTING card receipts: every current figure is a read of
 *  this deployment's contracts at the block the row names, taken after the
 *  account's most recent event and served whole — the balances from the reserve
 *  tokens, USD from the Pool's oracle. No health-factor receipt: a listing card
 *  carries none (0018); the position page reads the Pool's account math live.
 *
 *  `positionsRoute` is the via's leading custody segment, which the embedded
 *  receipt drops (receipts grammar §3); the table behind it used to ride there
 *  too and is gone — how Rails stores a figure tells the reader nothing about
 *  the figure. */
export function makeSweptCardDeployment(id: {
  session: SessionProtocol;
  poolName: string;
  poolAddress: string;
  oracleName: string;
  oracleAddress: string;
  /** e.g. "/api/seamless/positions". */
  positionsRoute: string;
}): AaveV3CardDeployment {
  const pool = { name: id.poolName, address: id.poolAddress };
  const oracle = { name: id.oracleName, address: id.oracleAddress };
  return {
    session: id.session,
    marketLabel: () => "",
    // A listing row carries no peaks (there is no replay behind the listing
    // lane); the position page's sweep is the only source of one on Base.
    ...sweptPeakReceipts(pool),
    supply: (symbol, block) => ({
      kind: "chain",
      pclass: "state",
      verify: RECOMPUTE,
      summary: `Supplied ${symbol} the position holds${at(block)} — the balance the reserve's aToken reported for this wallet at the block this row names, which is a block after the position's most recent event. The aToken's balance climbs with the reserve's liquidity index, so every unit of interest earned up to that block is inside this figure. The position page reads the same balance at the chain head.`,
      contract: pool,
      via: `GET ${id.positionsRoute} · aToken balanceOf at the row's block`,
    }),
    debt: (symbol, block) => ({
      kind: "chain",
      pclass: "state",
      verify: RECOMPUTE,
      summary: `Borrowed ${symbol} the position owes${at(block)} — the balance the reserve's variableDebtToken reported for this wallet at the block this row names, which is a block after the position's most recent event. The debt token's balance climbs with the reserve's borrow index, so every unit of interest charged up to that block is inside this figure. The position page reads the same debt at the chain head.`,
      contract: pool,
      via: `GET ${id.positionsRoute} · variableDebtToken balanceOf at the row's block`,
    }),
    ...usdReceipts({
      oracleOf: () => oracle,
      poolOf: () => pool,
      amountNote: balanceOfNote,
      via: "balanceOf at the row's block × IAaveOracle getAssetPrice",
    }),
    // A listing card carries no interest caption.
    interestCaption: undefined,
    liqDrop: () => liqDropProv(pool),
  };
}

/** The peak receipts every whole-life V3 lane on Base shares: the highest the
 *  running principal reached while the wallet's Pool events were replayed from
 *  the Pool's first block. Principal, not the rebased balance — the replay sums
 *  the amounts the logs carry, and interest accrues with no log to sum. */
function sweptPeakReceipts(pool: {
  name: string;
  address: string;
}): Pick<AaveV3CardDeployment, "peakSupply" | "peakDebt"> {
  return {
    peakSupply: (symbol) => ({
      kind: "chain-derived",
      pclass: "state",
      summary: `The highest ${symbol} supply this wallet ever ran up on this Pool — the running balance its supplies, withdrawals, aToken transfers and liquidation seizures leave behind, walked from the Pool's first block to the head, at its highest point. The walk adds the amounts the logs carry and never lets the balance fall below zero, so the interest that accrued between events is missing from it: what the aToken reported at that moment was this figure or more.`,
      contract: pool,
      via: "max of the running supply principal across the wallet's Pool logs",
    }),
    peakDebt: (symbol) => ({
      kind: "chain-derived",
      pclass: "state",
      summary: `The highest ${symbol} debt this wallet ever ran up on this Pool — the running debt its draws, repayments and liquidation covers leave behind, walked from the Pool's first block to the head, at its highest point. The walk adds the amounts the logs carry and never lets the debt fall below zero, so the interest that accrued between events is missing from it: what the debt token reported at that moment was this figure or more.`,
      contract: pool,
      via: "max of the running debt principal across the wallet's Pool logs",
    }),
  };
}

/** A Base lender's POSITION PAGE receipts: every current figure is a read of
 *  the deployment's own contracts made live, for this request, at the block
 *  the card names — the balances from the reserve tokens, the account math
 *  from the Pool, USD from the Pool's own oracle — through the page's own
 *  chain proxy rather than a rails-server table. The listing's swept
 *  deployment above describes the same reads taken earlier by the worker;
 *  this one says they were taken now. */
export function makeLivePoolCardDeployment(id: {
  session: SessionProtocol;
  poolName: string;
  poolAddress: string;
  oracleName: string;
  oracleAddress: string;
  /** e.g. "/api/chain/aave-v3-base/position". */
  positionRoute: string;
  /** The server env var the route reads the chain through, named on the via
   *  line where the deployment states it (Arbitrum). */
  rpcEnv?: string;
}): AaveV3CardDeployment {
  const pool = { name: id.poolName, address: id.poolAddress };
  const oracle = { name: id.oracleName, address: id.oracleAddress };
  const route = id.rpcEnv ? `${id.positionRoute} · ${id.rpcEnv}` : id.positionRoute;
  return {
    session: id.session,
    marketLabel: () => "",
    ...sweptPeakReceipts(pool),
    supply: (symbol, block, readBy) => ({
      kind: "chain",
      pclass: "state",
      verify: RECOMPUTE,
      summary: `Supplied ${symbol} the position holds${at(block)} — the balance the reserve's aToken reports for this wallet at that block, read for this page. The aToken's balance climbs with the reserve's liquidity index, so every unit of interest earned up to that block is inside this figure.`,
      contract: pool,
      via: `GET ${route} · aToken balanceOf${at(block)}${serverReadVia(readBy)}`,
    }),
    debt: (symbol, block, readBy) => ({
      kind: "chain",
      pclass: "state",
      verify: RECOMPUTE,
      summary: `Borrowed ${symbol} the position owes${at(block)} — the balance the reserve's variableDebtToken reports for this wallet at that block, read for this page. The debt token's balance climbs with the reserve's borrow index, so every unit of interest charged up to that block is inside this figure.`,
      contract: pool,
      via: `GET ${route} · variableDebtToken balanceOf${at(block)}${serverReadVia(readBy)}`,
    }),
    healthFactor: (_market, block, readBy) => ({
      kind: "chain",
      pclass: "state",
      verify: RECOMPUTE,
      summary: `Health factor — the figure the Pool gives for this wallet when it is asked for the position's state${at(block)}. It is the Pool's account arithmetic over its oracle's prices at that block. The Pool writes a health factor with 18 decimal places, so 10^18 stands for a factor of 1.`,
      contract: pool,
      via: `GET ${route} · Pool.getUserAccountData${at(block)}${serverReadVia(readBy)} · healthFactor ÷10^18`,
    }),
    ...usdReceipts({
      oracleOf: () => oracle,
      poolOf: () => pool,
      amountNote: balanceOfNote,
      via: `${route} · balanceOf × IAaveOracle getAssetPrice, both at the card's block`,
    }),
    liqDrop: () => liqDropProv(pool),
  };
}
