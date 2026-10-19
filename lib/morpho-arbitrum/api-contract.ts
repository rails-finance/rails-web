// The contract with rails-server's Morpho Blue Arbitrum lane, all three
// routes in one file (rails-ops TO-DO-arbitrum-scoping.md item 13; the server
// descriptor is api/src/services/arbitrum-families/morpho-blue.mjs).
//
//   POST /api/morpho-blue-arbitrum/visits    the position page's chain read
//   GET  /api/morpho-blue-arbitrum/timeline  a wallet's history, Base's row shape
//   GET  /api/morpho-blue-arbitrum/positions the recorded wallets, newest visit first
//
// The timeline envelope (coverage, confirmation, dropped logs) is the one every
// Arbitrum family answers, read by lib/aave-v3-arbitrum/api-contract.ts.
//
// SERVER-ONLY in use (the callers send the bearer token); the types are plain.

import type { MorphoIndexRow } from "@/lib/sources/api/morpho-base-timeline";
import type { MorphoWalletChainResponse } from "@/lib/api/fetch-morpho-wallet";
import { morphoArbitrumUsd } from "./usd";

/** rails-server's mount for this lane. */
export const MORPHO_ARBITRUM_API_PREFIX = "/api/morpho-blue-arbitrum";

// ── POST /visits ────────────────────────────────────────────────────────────

/** One market the wallet holds or held: Blue's `position(id, user)` raw, the
 *  market oracle's raw `price()` (null where the market has none or it was
 *  not read) and the page's dollar figures (null where unpriced). */
export interface MorphoArbitrumVisitMarket {
  id: string;
  supplyShares: string;
  borrowShares: string;
  collateral: string;
  oraclePrice: string | null;
  supplyUsd: number | null;
  borrowUsd: number | null;
  collateralUsd: number | null;
}

/** The body. The server answers `{ wallet, visitCount, history }`, which the
 *  page does not read. */
export interface MorphoArbitrumVisitBody {
  wallet: string;
  blockNumber: number;
  chainStale?: boolean;
  totalSupplyUsd: number | null;
  totalCollateralUsd: number | null;
  totalDebtUsd: number | null;
  markets: MorphoArbitrumVisitMarket[];
}

/** The server takes at most this many markets in one visit. */
const MAX_MARKETS = 1024;

const ZERO_MARKET = { supplyShares: "0", borrowShares: "0", collateral: "0", oraclePrice: null } as const;

/** The visit from the page's slot read, plus every market the history names
 *  that the wallet no longer holds anything in (all three slots zero at the
 *  read: the census sweep asked them). */
export function visitBodyOf(read: MorphoWalletChainResponse, historyMarketIds: string[]): MorphoArbitrumVisitBody {
  const usd = morphoArbitrumUsd(read);
  const markets: MorphoArbitrumVisitMarket[] = read.positions.map((p) => {
    const u = usd.byMarket.get(p.marketId.toLowerCase());
    return {
      id: p.marketId.toLowerCase(),
      supplyShares: p.supplySharesRaw,
      borrowShares: p.borrowSharesRaw,
      collateral: p.collateralRaw,
      oraclePrice: p.oraclePriceRaw && p.oraclePriceRaw !== "0" ? p.oraclePriceRaw : null,
      supplyUsd: u?.supplyUsd ?? null,
      borrowUsd: u?.borrowUsd ?? null,
      collateralUsd: u?.collateralUsd ?? null,
    };
  });
  const held = new Set(markets.map((m) => m.id));
  for (const raw of historyMarketIds) {
    const id = (raw.startsWith("0x") ? raw : `0x${raw}`).toLowerCase();
    if (held.has(id) || !/^0x[0-9a-f]{64}$/.test(id)) continue;
    held.add(id);
    markets.push({ id, ...ZERO_MARKET, supplyUsd: 0, borrowUsd: 0, collateralUsd: 0 });
  }
  return {
    wallet: read.wallet.toLowerCase(),
    blockNumber: read.blockNumber,
    chainStale: read.chainStale,
    totalSupplyUsd: usd.totals.supplyUsd,
    totalCollateralUsd: usd.totals.collateralUsd,
    totalDebtUsd: usd.totals.debtUsd,
    markets: markets.slice(0, MAX_MARKETS),
  };
}

// ── GET /timeline?wallet= ───────────────────────────────────────────────────

/** One row: Base's `TimelineRow` without the market totals and the gas, plus
 *  `receiver` (the third party of a Withdraw, Borrow or WithdrawCollateral,
 *  null on the others; the reader ignores it). `tx_from` is null until the
 *  validator fills it. */
export type MorphoArbitrumTimelineRow = MorphoIndexRow & { receiver?: string | null };

// ── GET /positions?limit=&offset= ───────────────────────────────────────────

/** A visited wallet's history state; null before a visit has queued one. */
export interface MorphoArbitrumPositionHistory {
  status: "unconfirmed" | "confirmed" | "disputed";
  bodySource: "etherscan" | "tenderly" | null;
  confirmedThroughBlock: number | null;
  validatedAt: string | null;
  droppedCount: number;
  error: string | null;
}

/** One recorded wallet: the stored read (dollar figures as the server's
 *  decimal strings, read here as numbers) and its visit counts. */
export interface MorphoArbitrumPositionRow {
  wallet: string;
  blockNumber: number | null;
  totalSupplyUsd: number | null;
  totalCollateralUsd: number | null;
  totalDebtUsd: number | null;
  supplyCount: number;
  borrowCount: number;
  collateralCount: number;
  chainOpen: boolean | null;
  chainHasDebt: boolean | null;
  chainStale: boolean;
  refreshedAt: string | null;
  firstVisitedAt: string | null;
  lastVisitedAt: string | null;
  visitCount: number;
  history: MorphoArbitrumPositionHistory | null;
}

export interface MorphoArbitrumPositionsResponse {
  rows: MorphoArbitrumPositionRow[];
  total: number;
  limit: number;
  offset: number;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

/** The answer checked against the contract; null when it does not hold one.
 *  A row without a wallet address is dropped. */
export function readPositionsAnswer(raw: unknown): MorphoArbitrumPositionsResponse | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.rows)) return null;
  const rows = (r.rows as Record<string, unknown>[]).flatMap((p): MorphoArbitrumPositionRow[] => {
    if (!p || typeof p !== "object" || typeof p.wallet !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(p.wallet)) return [];
    const h = p.history as Record<string, unknown> | null | undefined;
    const status = h?.status;
    const history: MorphoArbitrumPositionHistory | null =
      h && (status === "unconfirmed" || status === "confirmed" || status === "disputed")
        ? {
            status,
            bodySource: h.bodySource === "etherscan" || h.bodySource === "tenderly" ? h.bodySource : null,
            confirmedThroughBlock: num(h.confirmedThroughBlock),
            validatedAt: str(h.validatedAt),
            droppedCount: num(h.droppedCount) ?? 0,
            error: str(h.error),
          }
        : null;
    return [
      {
        wallet: p.wallet.toLowerCase(),
        blockNumber: num(p.blockNumber),
        totalSupplyUsd: num(p.totalSupplyUsd),
        totalCollateralUsd: num(p.totalCollateralUsd),
        totalDebtUsd: num(p.totalDebtUsd),
        supplyCount: num(p.supplyCount) ?? 0,
        borrowCount: num(p.borrowCount) ?? 0,
        collateralCount: num(p.collateralCount) ?? 0,
        chainOpen: bool(p.chainOpen),
        chainHasDebt: bool(p.chainHasDebt),
        chainStale: p.chainStale === true,
        refreshedAt: str(p.refreshedAt),
        firstVisitedAt: str(p.firstVisitedAt),
        lastVisitedAt: str(p.lastVisitedAt),
        visitCount: num(p.visitCount) ?? 0,
        history,
      },
    ];
  });
  return {
    rows,
    total: num(r.total) ?? rows.length,
    limit: num(r.limit) ?? rows.length,
    offset: num(r.offset) ?? 0,
  };
}
