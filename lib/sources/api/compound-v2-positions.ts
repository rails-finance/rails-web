// Compound V2 positions listing — the `api` arm's presentation transform.
// ----------------------------------------------------------------------------
// The rails-server route (/api/compound-v2/positions) does the structural work
// — filter, sort, paginate over mv_compound_v2_wallets — and returns the page
// slice as RAW per-wallet rows (market keys + the three replayed lanes +
// scalars). This builder shapes them against the fixed market catalog and
// layers the per-market chain state (batched multicalls — exchangeRateStored,
// the Comptroller's oracle USD + its feed/no-feed config, per-block rates):
//   • cToken balance (EXACT replay, = balanceOf) × exchangeRateStored =
//     `current`, the supply value INCLUDING accrued interest — chain-derived.
//   • supply principal (Σ mint − redeem, amounts-only) rides beside it; the
//     spread between the two is earned interest.
//   • debt = the last event's EMITTED accountBorrows; interest accrued since
//     that event is NOT included (the detail page's chain lane upgrades it) —
//     the provenance says so.
// Prices and rates are keyed by MARKET KEY, not underlying address — two
// markets share the WBTC address (wbtc, wbtc2) and cETH has no underlying
// address at all, so the address is not a market identity here.
// When RPC is down the market state map is empty: `current`/USD stay null and
// callers degrade to amounts-only (never a partial total).
//
// STATUS IS TWO-AXIS: `status` is the lifecycle (open / closed / liquidated —
// 'liquidated' names only a CLOSED wallet that was liquidated), and
// `everLiquidated` is the orthogonal flag. Close factor 0.5 makes V2
// liquidations PARTIAL: an open, ever-liquidated survivor is `status: "open"`
// with `everLiquidated: true` — never rendered as terminal.

import { COMPOUND_V2_MARKET_BY_KEY, CTOKEN_DECIMALS, type CompoundV2Market } from "@/lib/compound-v2/asset-catalog";
import {
  resolveCompoundV2MarketState,
  type CompoundV2MarketStateMap,
} from "@/lib/sources/chain/compound-v2-market-state";

export type CompoundV2PositionStatus = "open" | "closed" | "liquidated";
// Mirrors the rails route's sortBy allowlist (mig 184's debt_usd/collateral_usd
// on mv_compound_v2_wallets). "lastActivity" | "events" was the prior shape —
// grepped with no caller, so this is a rename, not a widening.
export type CompoundV2PositionSort = "recent" | "debt" | "coll";

/** One market the wallet supplies (the cToken lane + its two readings). */
export interface CompoundV2SupplyAmount {
  market: string;
  symbol: string;
  /** cToken display label (cSAI / cWBTC2 are the catalog's own — see catalog). */
  cSymbol: string;
  decimals: number;
  /** Exact cToken balance (8 dp, = balanceOf at the indexed head). */
  cTokens: number;
  cTokensRaw: string;
  /** Σ(mint − redeem) underlying — amounts-only principal (no slot holds it).
   *  Can be 0 on a real position that arrived by transfer or seizure. */
  principal: number;
  /** cTokens × exchangeRateStored — current underlying value INCLUDING accrued
   *  interest (chain-derived). Null when RPC is down. */
  current: number | null;
}

/** One market the wallet borrows (the emitted-accountBorrows lane). */
export interface CompoundV2BorrowAmount {
  market: string;
  symbol: string;
  cSymbol: string;
  decimals: number;
  /** Debt at the wallet's last borrow/repay/liquidation event (emitted
   *  accountBorrows — interest to that moment included, interest since NOT).
   *  The detail page upgrades this to the live borrowBalanceStored when its
   *  chain read lands and marks the row `live`. */
  amount: number;
  amountRaw: string;
  /** True when `amount` is the live borrowBalanceStored read at head. */
  live?: boolean;
}

/** One lifetime-peak line (per market lane's own MAX, replayed). */
export interface CompoundV2PeakAmount {
  market: string;
  symbol: string;
  decimals: number;
  amount: number;
  amountRaw: string;
}

export interface CompoundV2PositionSummary {
  wallet: string;
  /** Lifecycle only: 'liquidated' = a CLOSED wallet that was liquidated. */
  status: CompoundV2PositionStatus;
  /** The orthogonal liquidation flag — true on open survivors too. */
  everLiquidated: boolean;
  supplies: CompoundV2SupplyAmount[];
  borrows: CompoundV2BorrowAmount[];
  peakSupplies: CompoundV2PeakAmount[];
  peakBorrows: CompoundV2PeakAmount[];
  supplyCount: number;
  borrowCount: number;
  liquidationCount: number;
  lastActivityAt: number;
  lastBlockNumber: number;
  lastTxHash: string | null;
  txCount: number;
  /** Chain-derived USD per whole underlying token, keyed by MARKET KEY —
   *  Compound's own oracle (the one the Comptroller prices with). Omits any
   *  market the oracle didn't price. */
  priceByMarket: Record<string, number>;
  /** Markets whose oracle price is a stored constant with NO feed behind it
   *  (true = frozen — cSAI's constant is $14.4263). Keyed by market key;
   *  present only for priced markets. */
  priceFixedByMarket: Record<string, boolean>;
  /** Annualized per-block rates per market key (null members when unread). */
  ratesByMarket: Record<string, { borrowApr: number | null; supplyApr: number | null }>;
}

/** One open (wallet, market) row as returned by the rails route. */
export interface RawCompoundV2MarketRow {
  market: string;
  supplyPrincipalRaw: string;
  ctokenBalanceRaw: string;
  debtBalanceRaw: string;
}

export interface RawCompoundV2PeakRow {
  market: string;
  peakSupplyRaw: string;
  peakDebtRaw: string;
}

/** One wallet's page-slice row from the rails route (pre-presentation). */
export interface RawCompoundV2WalletRow {
  wallet: string;
  status: string;
  everLiquidated: boolean;
  markets: RawCompoundV2MarketRow[];
  peakMarkets?: RawCompoundV2PeakRow[];
  lastActivityAt: number;
  lastBlockNumber: number;
  lastTxHash: string | null;
  txCount: number;
  liquidationCount: number;
  lastLiquidationAt: number | null;
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

function statusOf(s: string): CompoundV2PositionStatus {
  return s === "open" || s === "liquidated" ? s : "closed";
}

/** Assemble the listing rows from the rails route's raw page slice. Filtering,
 *  sorting and pagination already happened server-side — order is preserved. */
export async function buildCompoundV2PositionRows(raw: RawCompoundV2WalletRow[]): Promise<CompoundV2PositionSummary[]> {
  // Batched multicalls for the twenty markets' exchange rates + oracle prices
  // (with feed config) + rates; empty map when RPC is down (amounts-only).
  const state: CompoundV2MarketStateMap = raw.length > 0 ? await resolveCompoundV2MarketState() : new Map();

  const priceByMarket: Record<string, number> = {};
  const priceFixedByMarket: Record<string, boolean> = {};
  const ratesByMarket: CompoundV2PositionSummary["ratesByMarket"] = {};
  for (const [key, s] of state.entries()) {
    if (s.priceUsd != null) {
      priceByMarket[key] = s.priceUsd;
      priceFixedByMarket[key] = !s.priceHasFeed;
    }
    ratesByMarket[key] = { borrowApr: s.borrowApr, supplyApr: s.supplyApr };
  }

  return raw.map((w) => {
    const supplies: CompoundV2SupplyAmount[] = [];
    const borrows: CompoundV2BorrowAmount[] = [];

    for (const r of w.markets) {
      const m: CompoundV2Market | undefined = COMPOUND_V2_MARKET_BY_KEY[r.market];
      if (!m) continue;
      const cTokensRaw = bigintOf(r.ctokenBalanceRaw);
      const debtRaw = bigintOf(r.debtBalanceRaw);
      if (cTokensRaw > ZERO) {
        const cTokens = scale(cTokensRaw, CTOKEN_DECIMALS);
        const st = state.get(m.key);
        supplies.push({
          market: m.key,
          symbol: m.symbol,
          cSymbol: m.cSymbol,
          decimals: m.decimals,
          cTokens,
          cTokensRaw: cTokensRaw.toString(),
          principal: scale(bigintOf(r.supplyPrincipalRaw), m.decimals),
          current: st != null ? cTokens * st.exchangeRate : null,
        });
      }
      if (debtRaw > ZERO) {
        borrows.push({
          market: m.key,
          symbol: m.symbol,
          cSymbol: m.cSymbol,
          decimals: m.decimals,
          amount: scale(debtRaw, m.decimals),
          amountRaw: debtRaw.toString(),
        });
      }
    }

    const peakSupplies: CompoundV2PeakAmount[] = [];
    const peakBorrows: CompoundV2PeakAmount[] = [];
    for (const r of w.peakMarkets ?? []) {
      const m = COMPOUND_V2_MARKET_BY_KEY[r.market];
      if (!m) continue;
      const sup = bigintOf(r.peakSupplyRaw);
      const dbt = bigintOf(r.peakDebtRaw);
      if (sup > ZERO)
        peakSupplies.push({
          market: m.key,
          symbol: m.symbol,
          decimals: m.decimals,
          amount: scale(sup, m.decimals),
          amountRaw: sup.toString(),
        });
      if (dbt > ZERO)
        peakBorrows.push({
          market: m.key,
          symbol: m.symbol,
          decimals: m.decimals,
          amount: scale(dbt, m.decimals),
          amountRaw: dbt.toString(),
        });
    }

    return {
      wallet: w.wallet,
      status: statusOf(w.status),
      everLiquidated: !!w.everLiquidated,
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
      priceByMarket,
      priceFixedByMarket,
      ratesByMarket,
    };
  });
}
