// f(x) V2 per-pool aggregates — the `api` arm's presentation transform.
// ----------------------------------------------------------------------------
// The rails-server route (/api/fx/stats) returns fx_pool_state (the worker
// sweep's settled reads: getTotalRawCollaterals / getTotalRawDebts /
// getNextPositionId at one head block, plus the latest indexed oracle price
// with its block) joined to roster counts. This shapes one FxPoolStatsSummary
// per pool for the listing's header band.
//
// UNITS: totals are RATE-NORMALIZED 1e18 (stETH-equivalent / WBTC-18dp) —
// same lane as per-position settled values, never the Operate token unit.

import { FX_POOLS, type FxPoolKey } from "@/lib/fx/asset-catalog";

/** One raw pool row from the rails stats route. */
export interface RawFxPoolStats {
  pool_key: FxPoolKey;
  total_raw_colls: string | null;
  total_raw_debts: string | null;
  next_position_id: string | null;
  oracle_price: string | null;
  price_block: string | null;
  block_number: string | null;
  refreshed_at: string | null;
  n_positions: number | null;
  n_open: number | null;
}

export interface FxPoolStatsSummary {
  pool: FxPoolKey;
  /** Collateral token symbol (the pool's identity in the UI). */
  poolSymbol: string;
  /** Rate-normalized unit the settled totals are in (stETH / WBTC). */
  normalizedSymbol: string;
  /** Settled pool-wide collateral in NORMALIZED units. */
  totalColls: number | null;
  /** Settled pool-wide fxUSD debt. */
  totalDebts: number | null;
  /** totalColls × the pool oracle price. */
  totalCollUsd: number | null;
  /** Positions with events, and the open subset (settled `closed = false`). */
  positionsEver: number | null;
  positionsOpen: number | null;
  /** Latest indexed oracle USD price per NORMALIZED unit + its block. */
  oraclePriceUsd: number | null;
  oraclePriceBlock: number | null;
  /** Head block the sweep's totals were read at. */
  settledBlock: number | null;
}

const WAD = 1e18;
const num = (s: string | null): number | null => (s == null ? null : Number(s) / WAD);
const int = (s: string | null): number | null => (s == null ? null : Number(s));

export function toFxPoolStats(r: RawFxPoolStats): FxPoolStatsSummary {
  const meta = FX_POOLS[r.pool_key];
  const totalColls = num(r.total_raw_colls);
  const oraclePriceUsd = num(r.oracle_price);
  return {
    pool: r.pool_key,
    poolSymbol: meta.tokenSymbol,
    normalizedSymbol: meta.normalizedSymbol,
    totalColls,
    totalDebts: num(r.total_raw_debts),
    totalCollUsd: totalColls != null && oraclePriceUsd != null ? totalColls * oraclePriceUsd : null,
    positionsEver: r.n_positions,
    positionsOpen: r.n_open,
    oraclePriceUsd,
    oraclePriceBlock: int(r.price_block),
    settledBlock: int(r.block_number),
  };
}

export function buildFxPoolStats(raw: RawFxPoolStats[]): FxPoolStatsSummary[] {
  // Fixed pool order (wsteth, wbtc) so the band never reorders between sweeps.
  const order = Object.keys(FX_POOLS) as FxPoolKey[];
  return raw.map(toFxPoolStats).sort((a, b) => order.indexOf(a.pool) - order.indexOf(b.pool));
}
