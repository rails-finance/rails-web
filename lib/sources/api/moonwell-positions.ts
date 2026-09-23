// Moonwell positions listing — the `api` arm's presentation transform.
// ----------------------------------------------------------------------------
// The rails-server route (/api/moonwell/positions) does the structural work —
// filter, sort, paginate over mv_moonwell_wallets — and returns the page slice
// as RAW per-wallet rows (market keys + the three replayed lanes + scalars).
// This builder shapes them against the fixed market catalog and layers the
// per-market chain state (one multicall — exchangeRateStored + oracle USD):
//   • mToken balance (EXACT replay, = balanceOf) × exchangeRateStored =
//     `current`, the supply value INCLUDING accrued interest — chain-derived.
//   • supply principal (Σ mint − redeem, amounts-only) rides beside it; the
//     spread between the two is earned interest.
//   • debt = the last event's EMITTED accountBorrows; interest accrued since
//     that event is NOT included (an uplift chain lane adds it later) — the
//     provenance says so.
// When RPC is down the market state map is empty: `current`/USD stay null and
// callers degrade to amounts-only (never a partial total).
//
// The ROSTER is a seam, not a constant. Ethereum's is the fixed four-market
// catalog plus a live multicall; Base's (lib/moonwell-base/listing-roster.ts)
// is the `marketState` the rails route ships beside the rows — twenty-one
// markets keyed by mToken address, every rate and price read at the same
// pinned block as the balances, so the proxy makes no chain call at all.

import { MOONWELL_MARKET_BY_KEY, MTOKEN_DECIMALS } from "@/lib/moonwell/asset-catalog";
import { resolveMoonwellMarketState } from "@/lib/sources/chain/moonwell-market-state";

/** "unread" is a row whose account has not been read from the chain yet — no
 *  state recorded, never mapped to "closed" (0018). */
export type MoonwellPositionStatus = "open" | "closed" | "liquidated" | "unread";
// Mirrors the rails route's sortBy allowlist (mig 181's debt_usd/collateral_usd
// on mv_moonwell_wallets). "lastActivity" | "events" was the prior shape —
// grepped with no caller, so this is a rename, not a widening.
export type MoonwellPositionSort = "recent" | "debt" | "coll";

/** One market the wallet supplies (the mToken lane + its two readings). */
export interface MoonwellSupplyAmount {
  market: string;
  symbol: string;
  /** Underlying token address (lowercased) — USD lookups key on this. */
  address: string;
  decimals: number;
  /** Exact mToken balance (8 dp, = balanceOf at the indexed head). */
  mTokens: number;
  mTokensRaw: string;
  /** Σ(mint − redeem) underlying — amounts-only principal (no slot holds it). */
  principal: number;
  /** mTokens × exchangeRateStored — current underlying value INCLUDING accrued
   *  interest (chain-derived). Null when RPC is down. */
  current: number | null;
}

/** One market the wallet borrows (the emitted-accountBorrows lane). */
export interface MoonwellBorrowAmount {
  market: string;
  symbol: string;
  address: string;
  decimals: number;
  /** Debt at the wallet's last borrow/repay event (emitted accountBorrows —
   *  interest to that moment included, interest since NOT). The detail page
   *  upgrades this to the live borrowBalanceStored when its chain read lands
   *  and marks the row `live`. */
  amount: number;
  amountRaw: string;
  /** True when `amount` is the live borrowBalanceStored read at head (the
   *  detail page's chain lane); the emitted-accountBorrows lane otherwise. */
  live?: boolean;
}

/** One lifetime-peak line (per market lane's own MAX, replayed). */
export interface MoonwellPeakAmount {
  market: string;
  symbol: string;
  address: string;
  decimals: number;
  amount: number;
  amountRaw: string;
}

export interface MoonwellPositionSummary {
  wallet: string;
  status: MoonwellPositionStatus;
  supplies: MoonwellSupplyAmount[];
  borrows: MoonwellBorrowAmount[];
  peakSupplies: MoonwellPeakAmount[];
  peakBorrows: MoonwellPeakAmount[];
  supplyCount: number;
  borrowCount: number;
  liquidationCount: number;
  lastActivityAt: number;
  lastBlockNumber: number;
  lastTxHash: string | null;
  txCount: number;
  /** Chain-derived USD per whole underlying token, keyed by lowercased
   *  underlying address — Moonwell's own oracle (the one the Comptroller
   *  prices with). Omits any market the oracle didn't price. */
  priceByAddress: Record<string, number>;
  /** Annualized per-timestamp rates per market key (null members when unread). */
  ratesByMarket: Record<string, { borrowApr: number | null; supplyApr: number | null }>;
  /** The Base lane only: the block every balance on this row was read at. */
  chainBlock?: number;
}

/** One open (wallet, market) row as returned by the rails route. */
export interface RawMoonwellMarketRow {
  market: string;
  supplyPrincipalRaw: string;
  mtokenBalanceRaw: string;
  debtBalanceRaw: string;
}

export interface RawMoonwellPeakRow {
  market: string;
  peakSupplyRaw: string;
  peakDebtRaw: string;
}

/** One wallet's page-slice row from the rails route (pre-presentation). */
export interface RawMoonwellWalletRow {
  wallet: string;
  status: string;
  markets: RawMoonwellMarketRow[];
  peakMarkets?: RawMoonwellPeakRow[];
  lastActivityAt: number;
  lastBlockNumber: number;
  lastTxHash: string | null;
  txCount: number;
  liquidationCount: number;
  lastLiquidationAt: number | null;
  /** The Base lane only: the block every balance on the row was read at, and
   *  the Comptroller's own account verdict at that block (getAccountLiquidity,
   *  1e18 USD). Absent on the Ethereum index's rows. */
  chainBlock?: number;
  chainReadAt?: string | null;
  liquidityRaw?: string;
  shortfallRaw?: string;
}

/** One market as the listing builder needs it: identity plus the per-market
 *  chain state that turns an mToken balance into a value. Which deployment it
 *  came from is the caller's business. */
export interface MoonwellListingMarket {
  /** The row's market key — the index's tag on Ethereum, the mToken address on Base. */
  key: string;
  symbol: string;
  mSymbol: string;
  /** Underlying token address, lowercased — USD keys on it. */
  underlying: string;
  decimals: number;
  /** mTokens (8 dp) → whole underlying; null when the read did not land. */
  exchangeRate: number | null;
  priceUsd: number | null;
  borrowApr: number | null;
  supplyApr: number | null;
}

/** The markets a page of rows resolves against, keyed by the row's market key. */
export type MoonwellListingRoster = Map<string, MoonwellListingMarket>;

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

/** The route's status word, or "unread" for anything else — a Base row the
 *  chain has not been read for yet carries no status, and no state recorded is
 *  never "closed" (0018). */
function statusOf(s: string | null | undefined): MoonwellPositionStatus {
  return s === "open" || s === "closed" || s === "liquidated" ? s : "unread";
}

/** Ethereum's roster: the fixed catalog, with the four markets' exchange
 *  rates + oracle prices + rates from one head multicall (empty state when RPC
 *  is down — amounts-only degradation). */
async function ethereumRoster(): Promise<MoonwellListingRoster> {
  const state = await resolveMoonwellMarketState();
  const roster: MoonwellListingRoster = new Map();
  for (const m of Object.values(MOONWELL_MARKET_BY_KEY)) {
    const st = state.get(m.key);
    roster.set(m.key, {
      key: m.key,
      symbol: m.symbol,
      mSymbol: m.mSymbol,
      underlying: m.underlying,
      decimals: m.decimals,
      exchangeRate: st?.exchangeRate ?? null,
      priceUsd: st?.priceUsd ?? null,
      borrowApr: st?.borrowApr ?? null,
      supplyApr: st?.supplyApr ?? null,
    });
  }
  return roster;
}

/** Assemble the listing rows from the rails route's raw page slice. Filtering,
 *  sorting and pagination already happened server-side — order is preserved.
 *  `roster` is the deployment's markets; Ethereum's is resolved here when none
 *  is passed. */
export async function buildMoonwellPositionRows(
  raw: RawMoonwellWalletRow[],
  roster?: MoonwellListingRoster,
): Promise<MoonwellPositionSummary[]> {
  const markets: MoonwellListingRoster = roster ?? (raw.length > 0 ? await ethereumRoster() : new Map());

  const priceByAddress: Record<string, number> = {};
  const ratesByMarket: MoonwellPositionSummary["ratesByMarket"] = {};
  for (const [key, m] of markets.entries()) {
    if (m.priceUsd != null) priceByAddress[m.underlying] = m.priceUsd;
    ratesByMarket[key] = { borrowApr: m.borrowApr, supplyApr: m.supplyApr };
  }

  return raw.map((w) => {
    const supplies: MoonwellSupplyAmount[] = [];
    const borrows: MoonwellBorrowAmount[] = [];

    for (const r of w.markets) {
      const m = markets.get(r.market);
      if (!m) continue;
      const mTokensRaw = bigintOf(r.mtokenBalanceRaw);
      const debtRaw = bigintOf(r.debtBalanceRaw);
      if (mTokensRaw > ZERO) {
        const mTokens = scale(mTokensRaw, MTOKEN_DECIMALS);
        supplies.push({
          market: m.key,
          symbol: m.symbol,
          address: m.underlying,
          decimals: m.decimals,
          mTokens,
          mTokensRaw: mTokensRaw.toString(),
          // Σ(mint − redeem) on the Ethereum index; "0" on the Base lane, which
          // has no replay behind its rows and shows `current` instead.
          principal: scale(bigintOf(r.supplyPrincipalRaw), m.decimals),
          current: m.exchangeRate != null ? mTokens * m.exchangeRate : null,
        });
      }
      if (debtRaw > ZERO) {
        borrows.push({
          market: m.key,
          symbol: m.symbol,
          address: m.underlying,
          decimals: m.decimals,
          amount: scale(debtRaw, m.decimals),
          amountRaw: debtRaw.toString(),
        });
      }
    }

    const peakSupplies: MoonwellPeakAmount[] = [];
    const peakBorrows: MoonwellPeakAmount[] = [];
    for (const r of w.peakMarkets ?? []) {
      const m = markets.get(r.market);
      if (!m) continue;
      const sup = bigintOf(r.peakSupplyRaw);
      const dbt = bigintOf(r.peakDebtRaw);
      if (sup > ZERO)
        peakSupplies.push({
          market: m.key,
          symbol: m.symbol,
          address: m.underlying,
          decimals: m.decimals,
          amount: scale(sup, m.decimals),
          amountRaw: sup.toString(),
        });
      if (dbt > ZERO)
        peakBorrows.push({
          market: m.key,
          symbol: m.symbol,
          address: m.underlying,
          decimals: m.decimals,
          amount: scale(dbt, m.decimals),
          amountRaw: dbt.toString(),
        });
    }

    return {
      wallet: w.wallet,
      status: statusOf(w.status),
      supplies,
      borrows,
      peakSupplies,
      peakBorrows,
      supplyCount: supplies.length,
      borrowCount: borrows.length,
      liquidationCount: w.liquidationCount,
      lastActivityAt: w.lastActivityAt,
      lastBlockNumber: w.lastBlockNumber,
      lastTxHash: w.lastTxHash,
      txCount: w.txCount,
      priceByAddress,
      ratesByMarket,
      chainBlock: w.chainBlock,
    };
  });
}
