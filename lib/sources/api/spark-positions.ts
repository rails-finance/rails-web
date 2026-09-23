// SparkLend positions listing — the `api` arm's presentation transform (chain-state tier).
// ----------------------------------------------------------------------------
// The rails-server route (/api/spark/positions) does the structural work —
// filter, sort, paginate over mv_spark_positions — and returns the page slice as
// RAW per-wallet rows (token addresses + reduced supply/debt balances + per-
// wallet scalars). The balances are the index's scaled-balance reduction
// (0008/0011): Σ scaled deltas from the wallet's own Pool events + aToken
// BalanceTransfers, × the reserve's current index — the current rebased balance,
// interest included, definitionally `balanceOf` at the indexed head. This builder
// resolves ERC20 symbol/decimals (one cached multicall over the page's reserve
// universe), splits each wallet's reserves into its supplied + borrowed sides,
// and shapes a SparkPositionSummary. A listing row carries no health factor
// (0018) — the route emits only its coverage flag (`chainHfStale`, true when the
// spark_position_chain sweep hasn't covered the wallet); risk is read live on
// the position page.

import { resolveErc20Meta, scaleRaw, type Erc20Meta } from "@/lib/sources/chain/erc20-meta";
import { resolveAaveOraclePrices, aaveOraclePriceOf } from "@/lib/sources/chain/aave-oracle-prices";
import { sanityCheckAaveBalances } from "@/lib/sources/chain/aave-family-balances";
import { SPARK_ADDRESSES } from "@/lib/spark/asset-catalog";

export type SparkPositionStatus = "open" | "closed" | "liquidated";
// Mirrors the rails route's sortBy allowlist (mig 183's debt_usd/collateral_usd
// on mv_spark_wallets). "lastActivity" | "events" was the prior shape —
// grepped with no caller, so this is a rename, not a widening.
export type SparkPositionSort = "recent" | "debt" | "coll";

/** One reserve the wallet holds on a given side, exact + scaled. */
export interface SparkReserveAmount {
  symbol: string;
  address: string;
  decimals: number;
  amount: number;
  amountRaw: string;
  /** How `amountRaw` was obtained. `"reduced"` — the index's scaled-balance
   *  reduction (0008/0011): the current rebased balance, interest included, equal
   *  to aToken/variableDebtToken `balanceOf` at the indexed head. `"replayed"` —
   *  an event-replay figure (only the PEAK lines, which are per-event maxima). */
  balanceSource: "reduced" | "replayed";
}

export interface SparkPositionSummary {
  wallet: string;
  status: SparkPositionStatus;
  /** Reserves the wallet has SUPPLIED (collateral side), ranked by raw balance. */
  supplies: SparkReserveAmount[];
  /** Reserves the wallet has BORROWED (debt side), ranked by raw balance. */
  borrows: SparkReserveAmount[];
  /** Highest recorded per-reserve supply / debt over the wallet's life (MAX of the
   *  per-event balances, per asset). Populated for closed/liquidated wallets, whose
   *  current reserves are empty — the closed card shows what each asset held at its
   *  height. Chain-state token amounts only, no USD (the Tier-3 rule). */
  peakSupplies: SparkReserveAmount[];
  peakBorrows: SparkReserveAmount[];
  supplyCount: number;
  borrowCount: number;
  liquidationCount: number;
  lastActivityAt: number;
  lastBlockNumber: number;
  lastTxHash: string | null;
  txCount: number;
  /** Chain-state USD layer: SparkLend's own on-chain oracle price (IAaveOracle
   *  getAssetPrice, chain-derived) per reserve, keyed by lowercased token address.
   *  Resolved server-side in the positions route; omits any reserve the oracle
   *  didn't price. Feeds the card's USD footnotes and the valued economics tower. */
  priceByAddress: Record<string, number>;
  /** True when the chain snapshot doesn't cover this wallet (never swept, or the
   *  sweep marked it stale). The row carries no health factor (0018). */
  chainHfStale: boolean;
}

/** One open (wallet, reserve) balance pair as returned by the rails route. */
export interface RawSparkReserve {
  reserve: string;
  supplyBalanceRaw: string;
  debtBalanceRaw: string;
}

/** One (wallet, reserve) peak pair (highest-recorded supply/debt) from the route. */
export interface RawSparkPeakReserve {
  reserve: string;
  peakSupplyRaw: string;
  peakDebtRaw: string;
}

/** One wallet's page-slice row from the rails route (pre-presentation). */
export interface RawSparkWalletRow {
  wallet: string;
  reserves: RawSparkReserve[];
  /** Per-reserve peaks (present for closed/liquidated wallets). */
  peakReserves?: RawSparkPeakReserve[];
  lastActivityAt: number;
  lastBlockNumber: number;
  lastTxHash: string | null;
  txCount: number;
  liquidationCount: number;
  lastLiquidationAt: number | null;
  /** Coverage flag from the spark_position_chain LEFT JOIN — true-stale when
   *  the snapshot doesn't cover the wallet. */
  chainHfStale?: boolean;
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

function statusOf(hasOpen: boolean, liquidationCount: number): SparkPositionStatus {
  if (hasOpen) return "open";
  return liquidationCount > 0 ? "liquidated" : "closed";
}

/** Assemble the listing rows from the rails route's raw page slice. Filtering,
 *  sorting and pagination already happened server-side, so this only resolves
 *  metadata and shapes the rows — order is preserved. */
export async function buildSparkPositionRows(raw: RawSparkWalletRow[]): Promise<SparkPositionSummary[]> {
  // One cached multicall over every referenced reserve address — including the
  // peak reserves (a closed wallet's only reserves live there), so their symbols
  // resolve too.
  const allAddrs = new Set<string>();
  for (const w of raw) {
    for (const r of w.reserves) allAddrs.add(r.reserve.toLowerCase());
    for (const r of w.peakReserves ?? []) allAddrs.add(r.reserve.toLowerCase());
  }
  const metas = await resolveErc20Meta([...allAddrs]);
  const fallback = (addr: string): Erc20Meta => ({
    address: addr,
    symbol: `${addr.slice(0, 6)}…${addr.slice(-4)}`,
    decimals: 18,
  });

  // On-chain oracle USD for every reserve on the page, from SparkLend's own
  // IAaveOracle (chain-derived). Batched into one multicall; degrades to an empty
  // map (token-only) if RPC is down, so callers never assert a partial total.
  const oraclePrices = await resolveAaveOraclePrices([{ oracle: SPARK_ADDRESSES.ORACLE, assets: [...allAddrs] }]);
  const priceOf = (addr: string) => aaveOraclePriceOf(oraclePrices, SPARK_ADDRESSES.ORACLE, addr);

  // Dev-only reconciliation: the reduced balances the page renders should equal a
  // live aToken / variableDebtToken `balanceOf` (the retired overlay's demoted
  // role). Fire-and-forget, never on the production request path.
  sanityCheckAaveBalances(
    "spark-positions",
    raw.flatMap((w) =>
      w.reserves.map((r) => ({
        pool: SPARK_ADDRESSES.POOL,
        wallet: w.wallet,
        reserve: r.reserve,
        supplyRaw: bigintOf(r.supplyBalanceRaw),
        debtRaw: bigintOf(r.debtBalanceRaw),
      })),
    ),
  );

  return raw.map((w) => {
    const supplies: (SparkReserveAmount & { _rank: bigint })[] = [];
    const borrows: (SparkReserveAmount & { _rank: bigint })[] = [];

    for (const r of w.reserves) {
      const addr = r.reserve.toLowerCase();
      const meta = metas.get(addr) ?? fallback(addr);
      // The route's reduced balance — current truth at the indexed head.
      const supplyRaw = bigintOf(r.supplyBalanceRaw);
      const debtRaw = bigintOf(r.debtBalanceRaw);
      // Strict chain-state: every reserve the chain says the wallet holds is
      // shown (any non-zero raw balance) — no dust floor. A reduced balance of 0
      // drops the reserve entirely (a fully-exited or transferred-out position — no
      // phantom line survives). The exact figure rides the reveal; the compact
      // headline never renders a non-zero as "0".
      if (supplyRaw > ZERO) {
        supplies.push({
          symbol: meta.symbol,
          address: addr,
          decimals: meta.decimals,
          amount: scaleRaw(supplyRaw, meta.decimals),
          amountRaw: supplyRaw.toString(),
          balanceSource: "reduced",
          _rank: supplyRaw,
        });
      }
      if (debtRaw > ZERO) {
        borrows.push({
          symbol: meta.symbol,
          address: addr,
          decimals: meta.decimals,
          amount: scaleRaw(debtRaw, meta.decimals),
          amountRaw: debtRaw.toString(),
          balanceSource: "reduced",
          _rank: debtRaw,
        });
      }
    }

    const byRank = (a: { _rank: bigint }, b: { _rank: bigint }) => (b._rank > a._rank ? 1 : b._rank < a._rank ? -1 : 0);
    supplies.sort(byRank);
    borrows.sort(byRank);
    const strip = ({ _rank, ...r }: SparkReserveAmount & { _rank: bigint }): SparkReserveAmount => {
      void _rank;
      return r;
    };

    // Peak reserve lines (highest-recorded, per asset) — same shape as the open
    // supplies/borrows, built from the route's per-reserve MAX. Split supply / debt
    // sides and rank by raw peak.
    const peakSupplies: (SparkReserveAmount & { _rank: bigint })[] = [];
    const peakBorrows: (SparkReserveAmount & { _rank: bigint })[] = [];
    for (const r of w.peakReserves ?? []) {
      const addr = r.reserve.toLowerCase();
      const meta = metas.get(addr) ?? fallback(addr);
      const supplyRaw = bigintOf(r.peakSupplyRaw);
      const debtRaw = bigintOf(r.peakDebtRaw);
      if (supplyRaw > ZERO) {
        peakSupplies.push({
          symbol: meta.symbol,
          address: addr,
          decimals: meta.decimals,
          amount: scaleRaw(supplyRaw, meta.decimals),
          amountRaw: r.peakSupplyRaw,
          balanceSource: "replayed",
          _rank: supplyRaw,
        });
      }
      if (debtRaw > ZERO) {
        peakBorrows.push({
          symbol: meta.symbol,
          address: addr,
          decimals: meta.decimals,
          amount: scaleRaw(debtRaw, meta.decimals),
          amountRaw: r.peakDebtRaw,
          balanceSource: "replayed",
          _rank: debtRaw,
        });
      }
    }
    peakSupplies.sort(byRank);
    peakBorrows.sort(byRank);

    const hasOpen = supplies.length > 0 || borrows.length > 0;
    return {
      wallet: w.wallet,
      status: statusOf(hasOpen, w.liquidationCount),
      supplies: supplies.map(strip),
      borrows: borrows.map(strip),
      peakSupplies: peakSupplies.map(strip),
      peakBorrows: peakBorrows.map(strip),
      supplyCount: supplies.length,
      borrowCount: borrows.length,
      liquidationCount: w.liquidationCount,
      lastActivityAt: w.lastActivityAt,
      lastBlockNumber: w.lastBlockNumber,
      lastTxHash: w.lastTxHash,
      txCount: w.txCount,
      // On-chain oracle USD keyed by lowercased reserve address (for the card /
      // economics, which look values up by address). Omits any reserve the oracle
      // didn't price, so the strict per-total guard degrades honestly. Peaks are
      // included so a closed life's lifetime-flow lines stay priceable — any
      // reserve that ever flowed has a nonzero peak.
      priceByAddress: Object.fromEntries(
        [...supplies, ...borrows, ...peakSupplies, ...peakBorrows]
          .map((r) => [r.address.toLowerCase(), priceOf(r.address)] as const)
          .filter((e): e is readonly [string, number] => e[1] != null),
      ),
      // Coverage flag passed straight through; stale when uncovered.
      chainHfStale: w.chainHfStale ?? true,
    };
  });
}
