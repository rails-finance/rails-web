// The contract with rails-server's Compound V3 Arbitrum lane, all three
// routes in one file (rails-ops TO-DO-arbitrum-scoping.md item 12; the server
// descriptor is api/src/services/arbitrum-families/compound-v3.mjs).
//
//   POST /api/compound-v3-arbitrum/visits    the position page's chain read
//   GET  /api/compound-v3-arbitrum/timeline  a wallet's history, Base's row shape
//   GET  /api/compound-v3-arbitrum/positions the recorded wallets, newest visit first
//
// The timeline envelope (coverage, confirmation, dropped logs) is the one every
// Arbitrum family answers, read by lib/aave-v3-arbitrum/api-contract.ts; the
// /positions row carries the same columns as Morpho Blue Arbitrum's, read by
// lib/morpho-arbitrum/api-contract.ts.
//
// SERVER-ONLY in use (the callers send the bearer token); the types are plain.

import type { CometIndexRow } from "@/lib/sources/api/compound-base-timeline";
import type { CompoundWalletChainResponse } from "@/lib/api/fetch-compound-wallet";
import {
  readPositionsAnswer as readArbitrumPositionsAnswer,
  type MorphoArbitrumPositionRow,
  type MorphoArbitrumPositionsResponse,
} from "@/lib/morpho-arbitrum/api-contract";
import { COMPOUND_ARBITRUM_DEPLOYMENT } from "./asset-catalog";
import { readCometMarkets } from "./comet-cards";
import { compoundArbitrumUsd } from "./usd";

/** rails-server's mount for this lane. */
export const COMPOUND_ARBITRUM_API_PREFIX = "/api/compound-v3-arbitrum";

// ── POST /visits ────────────────────────────────────────────────────────────

/** One collateral asset the wallet holds in a Comet: `collateralBalanceOf`
 *  raw, and its dollars (null where unpriced). */
export interface CompoundArbitrumVisitCollateral {
  asset: string;
  amount: string;
  usd: number | null;
}

/** One Comet: `balanceOf` and `borrowBalanceOf` raw, the held collateral,
 *  the Comet's `isLiquidatable`, and the page's dollar figures (null where
 *  unpriced). */
export interface CompoundArbitrumVisitMarket {
  comet: string;
  baseSupplied: string;
  baseBorrowed: string;
  collateral: CompoundArbitrumVisitCollateral[];
  isLiquidatable: boolean;
  supplyUsd: number | null;
  borrowUsd: number | null;
  collateralUsd: number | null;
}

/** The body. The server answers `{ wallet, visitCount, history }`, which the
 *  page does not read. */
export interface CompoundArbitrumVisitBody {
  wallet: string;
  blockNumber: number;
  chainStale?: boolean;
  totalSupplyUsd: number | null;
  totalCollateralUsd: number | null;
  totalDebtUsd: number | null;
  markets: CompoundArbitrumVisitMarket[];
}

/** The server takes at most this many collateral assets per Comet. */
const MAX_ASSETS = 32;

/** The visit from the page's Comet read: every Comet the wallet holds
 *  something in, plus every Comet the history names that it no longer does
 *  (zeros: the read asked all four). At most four, one per Comet. */
export function visitBodyOf(read: CompoundWalletChainResponse, historyMarketKeys: string[]): CompoundArbitrumVisitBody {
  const usd = compoundArbitrumUsd(read);
  const markets: CompoundArbitrumVisitMarket[] = read.positions.map((p) => {
    const u = usd.byComet.get(p.comet.toLowerCase());
    return {
      comet: p.comet.toLowerCase(),
      baseSupplied: p.supplyBalanceRaw,
      baseBorrowed: p.borrowBalanceRaw,
      collateral: p.collateral.slice(0, MAX_ASSETS).map((c) => ({
        asset: c.address.toLowerCase(),
        amount: c.balanceRaw,
        usd: u?.collateral.get(c.address.toLowerCase()) ?? null,
      })),
      isLiquidatable: p.isLiquidatable,
      supplyUsd: u?.supplyUsd ?? null,
      borrowUsd: u?.borrowUsd ?? null,
      collateralUsd: u?.collateralUsd ?? null,
    };
  });
  const held = new Set(markets.map((m) => m.comet));
  for (const key of historyMarketKeys) {
    const m = COMPOUND_ARBITRUM_DEPLOYMENT.markets.find((x) => x.key === key);
    if (!m || held.has(m.comet.toLowerCase())) continue;
    held.add(m.comet.toLowerCase());
    markets.push({
      comet: m.comet.toLowerCase(),
      baseSupplied: "0",
      baseBorrowed: "0",
      collateral: [],
      isLiquidatable: false,
      supplyUsd: 0,
      borrowUsd: 0,
      collateralUsd: 0,
    });
  }
  return {
    wallet: read.wallet.toLowerCase(),
    blockNumber: read.blockNumber,
    chainStale: read.chainStale,
    totalSupplyUsd: usd.totals.supplyUsd,
    totalCollateralUsd: usd.totals.collateralUsd,
    totalDebtUsd: usd.totals.debtUsd,
    markets: markets.slice(0, COMPOUND_ARBITRUM_DEPLOYMENT.markets.length),
  };
}

// ── GET /timeline?wallet= ───────────────────────────────────────────────────

/** One row: `/api/compound-base/timeline`'s row plus `comet`, the Comet's
 *  address (the reader resolves the Comet by `market`, the roster key).
 *  `tx_from` is null until the validator fills it. The mint and burn echoes
 *  of supplies, withdraws and absorbs are left out by the server; a base
 *  transfer it keeps has its zero side null, the other account's leg being
 *  outside this wallet's history. BuyCollateral is not carried. */
export type CompoundArbitrumTimelineRow = CometIndexRow & { comet?: string };

// ── GET /positions?limit=&offset= ───────────────────────────────────────────

/** Morpho Blue Arbitrum's row plus `markets`, the stored visit's Comets in
 *  stored order (the visit body's shape). Absent where the server does not
 *  send it; the listing then draws one card for the wallet. */
export interface CompoundArbitrumPositionRow extends MorphoArbitrumPositionRow {
  markets?: CompoundArbitrumVisitMarket[];
}

export interface CompoundArbitrumPositionsResponse extends Omit<MorphoArbitrumPositionsResponse, "rows"> {
  rows: CompoundArbitrumPositionRow[];
}

/** The answer checked against the contract; null when it does not hold one.
 *  A malformed `markets` element is dropped, and a `markets` that is not an
 *  array is no `markets` (lib/compound-arbitrum/comet-cards.ts). */
export function readPositionsAnswer(raw: unknown): CompoundArbitrumPositionsResponse | null {
  const answer = readArbitrumPositionsAnswer(raw);
  if (!answer) return null;
  const marketsByWallet = new Map<string, CompoundArbitrumVisitMarket[]>();
  for (const p of (raw as { rows: unknown[] }).rows) {
    if (!p || typeof p !== "object") continue;
    const { wallet, markets } = p as Record<string, unknown>;
    const read = readCometMarkets(markets);
    if (typeof wallet === "string" && read) marketsByWallet.set(wallet.toLowerCase(), read);
  }
  return {
    ...answer,
    rows: answer.rows.map((row) => {
      const markets = marketsByWallet.get(row.wallet);
      return markets ? { ...row, markets } : row;
    }),
  };
}
