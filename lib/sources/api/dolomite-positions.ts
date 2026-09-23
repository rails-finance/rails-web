// Dolomite positions listing — the `api` arm's presentation transform.
// ----------------------------------------------------------------------------
// The rails-server route (/api/dolomite/positions) does the structural work —
// filter, sort, paginate over mv_dolomite_positions at the (owner,
// account_number) grain — and returns the page slice as RAW per-account rows:
// the replayed SIGNED par per touched market (last-write-wins off the emitted
// newPar absolutes; openness is par <> 0, strict) plus scalars. This builder
// layers the per-market chain state (one O(markets) multicall — the shape's
// strongest property: par is exact from events and the index is per-market,
// so CURRENT wei for every position costs 21 eth_calls, not one per account):
//   • wei = par × the market's CURRENT index ÷ 1e18 — the token amount
//     INCLUDING interest (the index accrues on read; interest is per-second,
//     so no stored figure is current) — the `current` on each leg.
//   • the core's own oracle USD (getMarketPrice) and live rates.
// When RPC is down the state map is empty: `current`/USD stay null and callers
// degrade to par-only (never a partial total).
//
// The GRAIN IS THE PAIR: one row per Account.Info, never per owner — accounts
// are independently liquidated, and a per-owner row would assert a single
// collateralisation across them. Account 0 is the owner's "Dolomite Balance"
// (`isDolomiteBalance`); every other number is an isolated Borrow Position.
// account_number is a uint256 STRING end to end.
//
// STATUS IS TWO-AXIS: `status` is the lifecycle (open / closed / liquidated —
// 'liquidated' names only a CLOSED account that was liquidated), and
// `everLiquidated` is the orthogonal flag on open survivors too.

import { resolveDolomiteMarketState, type DolomiteMarketStateMap } from "@/lib/sources/chain/dolomite-markets";
import { accountLabel, isDolomiteBalanceNumber } from "@/lib/dolomite/asset-catalog";

export type DolomitePositionStatus = "open" | "closed" | "liquidated";
// Mirrors the rails route's sortBy allowlist (mig 186's debt_usd/collateral_usd
// on mv_dolomite_positions). "lastActivity" was the prior shape — grepped
// with no caller (dolomiteFiltersToFetchParams never set it), so this is a
// rename, not a widening.
export type DolomitePositionSort = "recent" | "debt" | "coll";

/** One market leg of an account (SIGNED par; the sign is the side). */
export interface DolomiteBalanceAmount {
  marketId: number;
  symbol: string;
  decimals: number;
  /** |par| scaled by decimals — the stored scaled balance (multiply by the
   *  market's interest index for tokens). */
  par: number;
  /** SIGNED raw par (integer string). */
  parRaw: string;
  /** |par| × the market's CURRENT index — the token amount NOW, interest
   *  included (chain-derived). Null when RPC is down. */
  current: number | null;
  /** The raw integer wei behind `current` (unsigned string). */
  currentRaw: string | null;
}

export interface DolomitePositionSummary {
  owner: string;
  /** uint256 — canonical decimal STRING. */
  accountNumber: string;
  /** Dolomite's own vocabulary: "Dolomite Balance" (account 0) or
   *  "Borrow Position #N". */
  accountLabel: string;
  isDolomiteBalance: boolean;
  /** Lifecycle only: 'liquidated' = a CLOSED account that was liquidated. */
  status: DolomitePositionStatus;
  /** The orthogonal liquidation flag — true on open survivors too. */
  everLiquidated: boolean;
  /** par > 0 legs (the lending side). */
  supplies: DolomiteBalanceAmount[];
  /** par < 0 legs — a negative balance IS the debt (no Borrow action exists). */
  borrows: DolomiteBalanceAmount[];
  /** Highest recorded per-market par (closed/liquidated rows only — the
   *  headline of an unwound card, since every current par is back at zero). */
  peakSupplies: DolomitePeakAmount[];
  peakBorrows: DolomitePeakAmount[];
  supplyCount: number;
  borrowCount: number;
  liquidationCount: number;
  lastActivityAt: number;
  lastBlockNumber: number;
  lastTxHash: string | null;
  /** Balance-grain rows (one per leg). */
  eventCount: number;
  /** Distinct transactions. */
  txCount: number;
  /** The core's own oracle USD per whole token, keyed by MARKET ID (string
   *  key — JSON objects key by string). Omits any unpriced market. */
  priceByMarket: Record<string, number>;
  /** Live APRs per market id (percent). */
  ratesByMarket: Record<string, { borrowAprPct: number | null; supplyAprPct: number | null }>;
}

/** One lifetime-peak line (per market lane's own MAX |par|, replayed). */
export interface DolomitePeakAmount {
  marketId: number;
  symbol: string;
  decimals: number;
  /** |peak par| scaled by decimals — par, not wei (labeled so). */
  amount: number;
  amountRaw: string;
}

/** One market leg as the rails route returns it (pre-presentation).
 *  marketId arrives as a STRING from pg — ids are small roster indexes, so
 *  Number() is safe HERE (unlike account_number). */
export interface RawDolomiteBalanceRow {
  marketId: string | number;
  /** Identity from the backend's dolomite_markets table (LogAddMarket-seeded). */
  symbol: string | null;
  decimals: number | null;
  /** SIGNED par (integer string) — the replayed emitted absolute. */
  parRaw: string;
}

/** Non-open rows only: each market lane's highest recorded par. */
export interface RawDolomitePeakRow {
  marketId: string | number;
  symbol: string | null;
  decimals: number | null;
  peakSupplyParRaw: string;
  peakBorrowParRaw: string;
}

/** One account's page-slice row from the rails route (pre-presentation). */
export interface RawDolomiteAccountRow {
  owner: string;
  /** uint256 — STRING (hash-derived numbers are past 2^53). */
  accountNumber: string;
  isDolomiteBalance: boolean;
  status: string;
  everLiquidated: boolean;
  supplyMarketCount: number;
  borrowMarketCount: number;
  /** Open lanes only (par <> 0). */
  balances: RawDolomiteBalanceRow[];
  /** Non-open rows only. */
  peakMarkets?: RawDolomitePeakRow[];
  lastActivityAt: number;
  lastBlockNumber: number;
  lastTxHash: string | null;
  eventCount: number;
  txCount: number;
  liquidationCount: number;
  lastLiquidationAt: number | null;
}

const ZERO = BigInt(0);
const BASE = BigInt("1000000000000000000");

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

function statusOf(s: string): DolomitePositionStatus {
  return s === "open" || s === "liquidated" ? s : "closed";
}

/** Assemble the listing rows from the rails route's raw page slice. Filtering,
 *  sorting and pagination already happened server-side — order is preserved. */
export async function buildDolomitePositionRows(raw: RawDolomiteAccountRow[]): Promise<DolomitePositionSummary[]> {
  // ONE O(markets) multicall covers every row: par is exact from the index,
  // and current wei needs only each market's index (+ price + rates).
  const { state } =
    raw.length > 0 ? await resolveDolomiteMarketState() : { state: new Map() as DolomiteMarketStateMap };

  const priceByMarket: Record<string, number> = {};
  const ratesByMarket: DolomitePositionSummary["ratesByMarket"] = {};
  for (const [id, s] of state.entries()) {
    if (s.priceUsd != null) priceByMarket[String(id)] = s.priceUsd;
    ratesByMarket[String(id)] = { borrowAprPct: s.borrowAprPct, supplyAprPct: s.supplyAprPct };
  }

  return raw.map((a) => {
    const supplies: DolomiteBalanceAmount[] = [];
    const borrows: DolomiteBalanceAmount[] = [];

    for (const b of a.balances) {
      const par = bigintOf(b.parRaw);
      if (par === ZERO) continue; // openness is par <> 0, strict — a zero leg asserts nothing
      const marketId = Number(b.marketId);
      const st = state.get(marketId);
      const symbol = b.symbol ?? st?.symbol ?? `market #${marketId}`;
      const decimals = b.decimals ?? st?.decimals ?? 18;
      const mag = par < ZERO ? -par : par;
      // wei = par × index ÷ 1e18 rounded HALF-UP, the side's own index leg —
      // the deployed core's own parToWei rounding (MEASURED: floor left
      // supply legs 1 wei short; verify-dolomite-chain.mjs check F). The
      // chain lane's getAccountBalances reproduces this integer exactly at
      // ITS head; this one is at the market-state snapshot's.
      const indexRaw = st != null ? bigintOf(par > ZERO ? st.supplyIndexRaw : st.borrowIndexRaw) : null;
      const currentRaw = indexRaw != null ? (mag * indexRaw + BASE / BigInt(2)) / BASE : null;
      const leg: DolomiteBalanceAmount = {
        marketId,
        symbol,
        decimals,
        par: scale(mag, decimals),
        parRaw: par.toString(),
        current: currentRaw != null ? scale(currentRaw, decimals) : null,
        currentRaw: currentRaw != null ? currentRaw.toString() : null,
      };
      if (par > ZERO) supplies.push(leg);
      else borrows.push(leg);
    }

    // Non-open rows: the highest recorded par per market lane — the unwound
    // card's headline (every current par is back at zero). PAR amounts,
    // labeled so where they render.
    const peakSupplies: DolomitePeakAmount[] = [];
    const peakBorrows: DolomitePeakAmount[] = [];
    for (const p of a.peakMarkets ?? []) {
      const marketId = Number(p.marketId);
      const st = state.get(marketId);
      const symbol = p.symbol ?? st?.symbol ?? `market #${marketId}`;
      const decimals = p.decimals ?? st?.decimals ?? 18;
      const sup = bigintOf(p.peakSupplyParRaw);
      const dbt = bigintOf(p.peakBorrowParRaw);
      const dbtMag = dbt < ZERO ? -dbt : dbt;
      if (sup > ZERO)
        peakSupplies.push({ marketId, symbol, decimals, amount: scale(sup, decimals), amountRaw: sup.toString() });
      if (dbtMag > ZERO)
        peakBorrows.push({ marketId, symbol, decimals, amount: scale(dbtMag, decimals), amountRaw: dbtMag.toString() });
    }

    return {
      owner: a.owner.toLowerCase(),
      accountNumber: a.accountNumber,
      accountLabel: accountLabel(a.accountNumber),
      isDolomiteBalance: a.isDolomiteBalance ?? isDolomiteBalanceNumber(a.accountNumber),
      status: statusOf(a.status),
      everLiquidated: !!a.everLiquidated,
      supplies,
      borrows,
      peakSupplies,
      peakBorrows,
      supplyCount: supplies.length,
      borrowCount: borrows.length,
      liquidationCount: a.liquidationCount,
      lastActivityAt: a.lastActivityAt,
      lastBlockNumber: a.lastBlockNumber,
      lastTxHash: a.lastTxHash,
      eventCount: a.eventCount,
      txCount: a.txCount,
      priceByMarket,
      ratesByMarket,
    };
  });
}
