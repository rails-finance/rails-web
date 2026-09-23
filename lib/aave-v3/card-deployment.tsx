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
import { accountDataProv } from "./position-provenance";
import {
  positionSupplyProv,
  positionDebtProv,
  aaveV3UsdProvOnchain,
  aaveV3LiqPriceProv,
  aaveV3PeakSupplyProv,
  aaveV3PeakBorrowProv,
  aaveV3InterestCaptionProv,
} from "./event-provenance";

export interface AaveV3CardDeployment {
  /** The session the wallet pill filters and bookmarks under. */
  session: SessionProtocol;
  /** Text beside the wallet naming the market; empty for a single-market
   *  deployment, where naming it would only repeat the page title. */
  marketLabel: (market: string) => string;
  supply: (symbol: string, atBlock?: number) => Provenance;
  debt: (symbol: string, atBlock?: number) => Provenance;
  /** The health factor's receipt — only on a deployment whose card is the
   *  position page's, where the HF is the page's own live Pool read. A
   *  listing deployment has none: a listing card carries no HF (0018). */
  healthFactor?: (market: string, atBlock?: number) => Provenance;
  usd: (what: string) => Provenance;
  liqPrice: (symbol: string) => Provenance;
  /** A closed account's "highest recorded" figures — where the maximum came
   *  from on this lane (the index's replay on Ethereum; the live sweep's
   *  principal replay on a Base lender). */
  peakSupply: (symbol: string) => Provenance;
  peakDebt: (symbol: string) => Provenance;
  /** The "incl. $X interest" caption — present on a deployment whose card
   *  carries the caption (a position page); a listing card has none. */
  interestCaption?: (side: "supply" | "debt") => Provenance;
}

export const ETHEREUM_CARD_DEPLOYMENT: AaveV3CardDeployment = {
  session: "aave-v3",
  marketLabel: (m) => MARKET_NAME[m] ?? "Core",
  supply: positionSupplyProv,
  debt: positionDebtProv,
  // The position page merges its own live read over the listing view; the
  // receipt names that read (Pool.getUserAccountData @ head on the market's
  // Pool), not a snapshot.
  healthFactor: (market) => accountDataProv("Health factor", "healthFactor", POOL_BY_MARKET[market] ?? AAVE_V3_POOL),
  usd: aaveV3UsdProvOnchain,
  liqPrice: aaveV3LiqPriceProv,
  peakSupply: aaveV3PeakSupplyProv,
  peakDebt: aaveV3PeakBorrowProv,
  interestCaption: aaveV3InterestCaptionProv,
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
const RECOMPUTE = { kind: "recompute" as const, text: "Re-run the eth_call against any node" };

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
      summary: `Supplied ${symbol} the position holds${at(block)} — the balance the reserve's aToken reported for this wallet at the block this row names, which is a block after the account's most recent event. The aToken's balance climbs with the reserve's liquidity index, so every unit of interest earned up to that block is inside this figure. The position page reads the same balance at the chain head.`,
      contract: pool,
      via: `GET ${id.positionsRoute} · aToken balanceOf at the row's block`,
    }),
    debt: (symbol, block) => ({
      kind: "chain",
      pclass: "state",
      verify: RECOMPUTE,
      summary: `Borrowed ${symbol} the position owes${at(block)} — the balance the reserve's variableDebtToken reported for this wallet at the block this row names, which is a block after the account's most recent event. The debt token's balance climbs with the reserve's borrow index, so every unit of interest charged up to that block is inside this figure. The position page reads the same debt at the chain head.`,
      contract: pool,
      via: `GET ${id.positionsRoute} · variableDebtToken balanceOf at the row's block`,
    }),
    usd: (what) => ({
      kind: "chain-derived",
      pclass: "oracle",
      summary: `${what} valued in US dollars — the balance at the block this row names, times the price the Pool's oracle reports for that token. It is the price the Pool values collateral at, and the oracle gives it in US dollars with 8 decimal places.`,
      contract: oracle,
      via: "balanceOf at the row's block × oracle price",
      formula: "balance × oracle price",
      inputs: [
        { label: "balance", kind: "chain", pclass: "state", note: "balanceOf at the row's block" },
        { label: "oracle price", kind: "chain", note: "IAaveOracle getAssetPrice" },
      ],
    }),
    liqPrice: (symbol) => ({
      kind: "chain-derived",
      pclass: "state",
      summary: `Liquidation price for the ${symbol} collateral — the ${symbol} price at which this position becomes liquidatable: the price the Pool's oracle reports now, divided by the health factor the Pool gave at the block this row names. ${symbol} carries at least 99.5% of the priced collateral, so it anchors the read, and the figure holds while the debt's dollar value stands still.`,
      contract: oracle,
      via: "IAaveOracle getAssetPrice ÷ Pool getUserAccountData health factor",
      formula: "oracle price ÷ HF",
      inputs: [
        { label: "oracle price", kind: "chain", note: "IAaveOracle getAssetPrice" },
        { label: "health factor", kind: "chain", pclass: "state", note: "Pool getUserAccountData" },
      ],
    }),
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
}): AaveV3CardDeployment {
  const pool = { name: id.poolName, address: id.poolAddress };
  const oracle = { name: id.oracleName, address: id.oracleAddress };
  return {
    session: id.session,
    marketLabel: () => "",
    ...sweptPeakReceipts(pool),
    interestCaption: (side) => ({
      kind: "chain-derived",
      pclass: "state",
      summary:
        side === "supply"
          ? "Accrued supply interest inside the collateral balance above — per reserve, the balance the aToken reports for this page, less what its events account for: every deposit, less every withdrawal and the collateral a liquidation seized. The difference is valued at the price the Pool's oracle reports. Interest grew the collateral, so it is part of the headline figure."
          : "Accrued borrow interest inside the debt balance above — per reserve, the balance the variableDebtToken reports for this page, less what its events account for: every draw, less every repayment, the debt a liquidation covered and the debt the Pool wrote off. The difference is valued at the price the Pool's oracle reports. Interest grew the debt, so it is part of the headline figure.",
      contract: pool,
      via: `(balanceOf − Σ net event principal) × getAssetPrice, per reserve`,
      formula: "(current − net principal) × oracle price",
      inputs: [
        { label: "current", kind: "chain", pclass: "state", note: "balanceOf at the card's block" },
        {
          label: "net principal",
          kind: "chain-derived",
          pclass: "state",
          note: "Σ signed Pool event amounts",
        },
        { label: "oracle price", kind: "chain", note: `${oracle.name} getAssetPrice` },
      ],
    }),
    supply: (symbol, block) => ({
      kind: "chain",
      pclass: "state",
      verify: RECOMPUTE,
      summary: `Supplied ${symbol} the position holds${at(block)} — the balance the reserve's aToken reports for this wallet at that block, read for this page. The aToken's balance climbs with the reserve's liquidity index, so every unit of interest earned up to that block is inside this figure.`,
      contract: pool,
      via: `GET ${id.positionRoute} · aToken balanceOf${at(block)}`,
    }),
    debt: (symbol, block) => ({
      kind: "chain",
      pclass: "state",
      verify: RECOMPUTE,
      summary: `Borrowed ${symbol} the position owes${at(block)} — the balance the reserve's variableDebtToken reports for this wallet at that block, read for this page. The debt token's balance climbs with the reserve's borrow index, so every unit of interest charged up to that block is inside this figure.`,
      contract: pool,
      via: `GET ${id.positionRoute} · variableDebtToken balanceOf${at(block)}`,
    }),
    healthFactor: (_market, block) => ({
      kind: "chain",
      pclass: "state",
      verify: RECOMPUTE,
      summary: `Health factor — the figure the Pool gives for this wallet when it is asked for the account's state${at(block)}. It is the Pool's account arithmetic over its oracle's prices at that block. The Pool writes a health factor with 18 decimal places, so 10^18 stands for a factor of 1.`,
      contract: pool,
      via: `GET ${id.positionRoute} · Pool.getUserAccountData · healthFactor ÷10^18`,
    }),
    usd: (what) => ({
      kind: "chain-derived",
      pclass: "oracle",
      summary: `${what} valued in US dollars — the balance at the card's block, times the price the Pool's oracle reports for that token. It is the price the Pool values collateral at, and the oracle gives it in US dollars with 8 decimal places.`,
      contract: oracle,
      via: "balanceOf at the card's block × oracle price",
      formula: "balance × oracle price",
      inputs: [
        { label: "balance", kind: "chain", pclass: "state", note: "balanceOf at the card's block" },
        { label: "oracle price", kind: "chain", note: "IAaveOracle getAssetPrice" },
      ],
    }),
    liqPrice: (symbol) => ({
      kind: "chain-derived",
      pclass: "state",
      summary: `Liquidation price for the ${symbol} collateral — the ${symbol} price at which this position becomes liquidatable: the price the Pool's oracle reports now, divided by the health factor the Pool gave at the card's block. ${symbol} carries at least 99.5% of the priced collateral, so it anchors the read, and the figure holds while the debt's dollar value stands still.`,
      contract: oracle,
      via: "IAaveOracle getAssetPrice ÷ Pool getUserAccountData health factor",
      formula: "oracle price ÷ HF",
      inputs: [
        { label: "oracle price", kind: "chain", note: "IAaveOracle getAssetPrice" },
        { label: "health factor", kind: "chain", pclass: "state", note: "Pool getUserAccountData" },
      ],
    }),
  };
}
