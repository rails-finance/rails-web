// Maple positions listing — the `api` arm's presentation transform.
// ----------------------------------------------------------------------------
// The rails-server route (/api/maple/positions) does the structural work —
// filter, sort, paginate over mv_maple_wallets — and returns the page slice
// as RAW per-wallet rows (pool keys + the replayed lanes + scalars). This
// builder shapes them against the fixed pool catalog and layers the per-pool
// chain state (one multicall — NAV/exit rates + the liquid/deployed split):
//   • shares + escrowed (EXACT replay, = balanceOf + queue escrow) priced at
//     the pool's EXIT rate = `currentValue`, what the position redeems for at
//     this block — chain-derived, and computed the way the pool computes it
//     (BigInt over the raw aggregates; see lib/maple/exit-value.ts for why the
//     float rate cannot be re-multiplied).
//   • deposited principal (Σ deposit − withdraw − fill, amounts-only) rides
//     beside it; the spread between the two is earned interest.
// When RPC is down the pool state map is empty: `currentValue` stays null and
// callers degrade to amounts-only (never a partial total).

import { MAPLE_POOL_BY_KEY, MAPLE_SHARE_DECIMALS } from "@/lib/maple/asset-catalog";
import { getKnownInfrastructure } from "@/lib/shared/known-infrastructure";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { mapleExitAssets } from "@/lib/maple/exit-value";
import {
  resolveMaplePoolState,
  type MaplePoolState,
  type MaplePoolStateMap,
} from "@/lib/sources/chain/maple-pool-state";

export type MaplePositionStatus = "open" | "closed";
// Mirrors the rails route's sortBy allowlist (mig 188's collateral_usd on
// mv_maple_wallets). No "debt" value — a Maple lender position has no debt
// side, so the menu offers only Recent activity / Deposited.
export type MaplePositionSort = "recent" | "coll";
/** One pool the wallet lends into (the share lanes + their readings). */
export interface MaplePoolAmount {
  pool: string;
  /** Share token display symbol (syrupUSDC). */
  symbol: string;
  /** Funds asset display symbol (USDC). */
  assetSymbol: string;
  /** Funds asset address (lowercased). */
  assetAddress: string;
  decimals: number;
  /** Exact share balance in the wallet (= balanceOf at the indexed head). */
  shares: number;
  sharesRaw: string;
  /** Shares escrowed in the withdrawal queue (still the wallet's position). */
  escrowedShares: number;
  escrowedSharesRaw: string;
  /** Σ(deposit − withdraw − fill) assets — amounts-only principal. */
  depositedPrincipal: number;
  /** Lifetime gross flows (assets). */
  lifetimeDeposited: number;
  lifetimeWithdrawn: number;
  /** Withdrawal requests this wallet has made on this pool, lifetime. */
  requestCount: number;
  /** (shares + escrowed) × the pool's EXIT rate at head — what the position
   *  redeems for now (chain-derived). Null when RPC is down. */
  currentValue: number | null;
}

/** One lifetime-peak line (per pool lane's own MAX, replayed). */
export interface MaplePeakAmount {
  pool: string;
  symbol: string;
  assetSymbol: string;
  /** Peak deposited principal (assets). */
  peakDeposited: number;
  /** Peak share balance. */
  peakShares: number;
}

export interface MaplePositionSummary {
  wallet: string;
  status: MaplePositionStatus;
  /** True when any pool has shares waiting in the withdrawal queue. */
  inQueue: boolean;
  pools: MaplePoolAmount[];
  peakPools: MaplePeakAmount[];
  requestCount: number;
  firstActivityAt: number | null;
  lastActivityAt: number;
  lastBlockNumber: number;
  lastTxHash: string | null;
  txCount: number;
  /** Per-pool chain state (exit/NAV rates + the liquid/deployed split), keyed
   *  by pool key — the same read that valued `currentValue`. Empty when RPC
   *  is down. */
  poolState: Record<string, MaplePoolState>;
}

/** One open (wallet, pool) row as returned by the rails route. */
export interface RawMaplePoolRow {
  pool: string;
  sharesBalanceRaw: string;
  escrowedSharesRaw: string;
  depositedPrincipalRaw: string;
  lifetimeDepositedRaw: string;
  lifetimeWithdrawnRaw: string;
  requestCount: number;
}

export interface RawMaplePeakRow {
  pool: string;
  peakDepositedRaw: string;
  peakSharesRaw: string;
}

/** One wallet's page-slice row from the rails route (pre-presentation). */
export interface RawMapleWalletRow {
  wallet: string;
  status: string;
  inQueue: boolean;
  pools: RawMaplePoolRow[];
  peakPools?: RawMaplePeakRow[];
  firstActivityAt: number | null;
  lastActivityAt: number;
  lastBlockNumber: number;
  lastTxHash: string | null;
  txCount: number;
  requestCount: number;
}

const ZERO = BigInt(0);

function bigintOf(raw: string | null): bigint {
  if (raw == null || raw === "") return ZERO;
  try {
    return BigInt(raw.split(".")[0]);
  } catch {
    return ZERO;
  }
}

function scale(raw: bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

function statusOf(s: string): MaplePositionStatus {
  return s === "open" ? "open" : "closed";
}

/** Assemble the listing rows from the rails route's raw page slice. Filtering,
 *  sorting and pagination already happened server-side — order is preserved.
 *  Returns the rows plus the pool-state map (the access band reads it too). */
export async function buildMaplePositionRows(
  raw: RawMapleWalletRow[],
): Promise<{ rows: MaplePositionSummary[]; poolState: Record<string, MaplePoolState> }> {
  // One multicall for the two pools' rates + the liquid/deployed split;
  // empty map when RPC is down (amounts-only degradation).
  const state: MaplePoolStateMap = await resolveMaplePoolState();
  const poolState: Record<string, MaplePoolState> = {};
  for (const [key, s] of state.entries()) poolState[key] = s;

  // Belt-and-braces roster guard: known infrastructure (the CCIP bridge
  // escrows) must never render as a lender row, whichever half — this frontend
  // (Vercel) or the backend MV filter (the onboarding box) — deploys first.
  const rows = raw
    .filter((w) => !getKnownInfrastructure(w.wallet, MAINNET_CHAIN_ID))
    .map((w) => {
      const pools: MaplePoolAmount[] = [];
      for (const r of w.pools) {
        const p = MAPLE_POOL_BY_KEY[r.pool];
        if (!p) continue;
        const sharesRaw = bigintOf(r.sharesBalanceRaw);
        const escrowRaw = bigintOf(r.escrowedSharesRaw);
        if (sharesRaw <= ZERO && escrowRaw <= ZERO) continue;
        const shares = scale(sharesRaw, MAPLE_SHARE_DECIMALS);
        const escrowedShares = scale(escrowRaw, MAPLE_SHARE_DECIMALS);
        const st = state.get(p.key);
        pools.push({
          pool: p.key,
          symbol: p.symbol,
          assetSymbol: p.assetSymbol,
          assetAddress: p.asset,
          decimals: p.decimals,
          shares,
          sharesRaw: sharesRaw.toString(),
          escrowedShares,
          escrowedSharesRaw: escrowRaw.toString(),
          depositedPrincipal: scale(bigintOf(r.depositedPrincipalRaw), p.decimals),
          lifetimeDeposited: scale(bigintOf(r.lifetimeDepositedRaw), p.decimals),
          lifetimeWithdrawn: scale(bigintOf(r.lifetimeWithdrawnRaw), p.decimals),
          requestCount: r.requestCount,
          // The pool's own answer on the raw share count — never the float rate
          // re-multiplied, which is a different (and drifting) number. See
          // lib/maple/exit-value.ts.
          currentValue: st != null ? mapleExitAssets(sharesRaw + escrowRaw, st) : null,
        });
      }

      const peakPools: MaplePeakAmount[] = [];
      for (const r of w.peakPools ?? []) {
        const p = MAPLE_POOL_BY_KEY[r.pool];
        if (!p) continue;
        const dep = bigintOf(r.peakDepositedRaw);
        const shs = bigintOf(r.peakSharesRaw);
        if (dep <= ZERO && shs <= ZERO) continue;
        peakPools.push({
          pool: p.key,
          symbol: p.symbol,
          assetSymbol: p.assetSymbol,
          peakDeposited: scale(dep, p.decimals),
          peakShares: scale(shs, MAPLE_SHARE_DECIMALS),
        });
      }

      return {
        wallet: w.wallet,
        status: statusOf(w.status),
        inQueue: w.inQueue,
        pools,
        peakPools,
        requestCount: w.requestCount,
        firstActivityAt: w.firstActivityAt,
        lastActivityAt: w.lastActivityAt,
        lastBlockNumber: w.lastBlockNumber,
        lastTxHash: w.lastTxHash,
        txCount: w.txCount,
        poolState,
      };
    });

  return { rows, poolState };
}
