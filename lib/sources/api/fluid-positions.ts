// Fluid positions — the `api` arm's listing transform.
// ----------------------------------------------------------------------------
// rails-server's /api/fluid/positions returns one row per position NFT from
// mv_fluid_positions, each carrying an optional `chain` overlay row
// (fluid_position_chain — the vault resolver's SETTLED supply/borrow at head:
// liquidations + accrued interest applied by the protocol's own math). The
// settled figures are the primary display when present; the Σ replay lane is
// the fallback (and the two are deliberately distinguishable in provenance).
//
// No frontend RPC here — the overlay is maintained server-side by the
// fluid-backfill worker; this transform only shapes rows.

export type FluidPositionStatus = "open" | "closed";

export interface FluidPositionSummary {
  nftId: string;
  vault: string;
  vaultId: string;
  vaultType: number;
  supplySymbol: string | null;
  borrowSymbol: string | null;
  /** A smart leg's DEX pool composition from the roster (mig 158) — what the
   *  shares are OF. Null on token legs and until the roster heal reaches the
   *  vault; the name-only fallback stays "DEX shares". */
  supplyPoolPair: [string, string] | null;
  borrowPoolPair: [string, string] | null;
  supplyDecimals: number | null;
  borrowDecimals: number | null;
  owner: string | null;
  status: FluidPositionStatus;
  wasLiquidated: boolean;
  fullyLiquidated: boolean;
  /** Σ replay lane (impacts included), human-readable token units. */
  colNet: string;
  debtNet: string;
  /** Settled overlay at head (vault resolver truth) — null when absent
   *  (closed position, or the worker hasn't refreshed it yet). */
  settled: {
    supply: string;
    borrow: string;
    updatedBlock: number | null;
  } | null;
  eventCount: number;
  /** Distinct transactions of the position's own — liquidation sweeps (done TO
   *  the position) excluded, the figure the meta titles "Transactions
   *  (excludes liquidations)". */
  txCount: number;
  liquidationCount: number;
  lastLiquidationAt: number | null;
  firstActivityAt: number | null;
  lastActivityAt: number | null;
  lastBlockNumber: number | null;
  lastTxHash: string | null;
  peakCol: string;
  peakDebt: string;
}

/** Raw /api/fluid/positions row (pg numerics as strings). */
export interface RawFluidPositionRow {
  nft_id: string;
  vault: string;
  vault_id: string;
  vault_type: number;
  supply_symbol: string | null;
  borrow_symbol: string | null;
  /** Optional while the API deploys; absent reads as unnamed pools. */
  supply_pool_token0_symbol?: string | null;
  supply_pool_token1_symbol?: string | null;
  borrow_pool_token0_symbol?: string | null;
  borrow_pool_token1_symbol?: string | null;
  supply_decimals: number | null;
  borrow_decimals: number | null;
  owner: string | null;
  col_net: string;
  debt_net: string;
  status: string;
  was_liquidated: boolean;
  fully_liquidated: boolean;
  event_count: number;
  /** Optional while the API deploys; absent falls back to event_count. */
  tx_count?: number;
  liq_count: number;
  last_liq_ts: string | null;
  first_block: string | null;
  first_ts: string | null;
  last_block: string | null;
  last_ts: string | null;
  last_tx_hash: string | null;
  peak_col: string | null;
  peak_debt: string | null;
  chain: {
    nft_id: string;
    supply: string;
    borrow: string;
    owner: string | null;
    updated_block: string | null;
  } | null;
}

const ZERO = BigInt(0);
const SHARES_DECIMALS = 18;

function fmtUnits(rawStr: string | null, decimals: number): string {
  if (rawStr == null || rawStr === "") return "0";
  let raw: bigint;
  try {
    raw = BigInt(rawStr.split(".")[0]);
  } catch {
    return "0";
  }
  const neg = raw < ZERO;
  const a = neg ? -raw : raw;
  if (decimals <= 0) return `${neg ? "-" : ""}${a.toString()}`;
  const div = BigInt("1" + "0".repeat(decimals));
  const whole = (a / div).toString();
  const frac = (a % div).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

const tsOrNull = (v: string | null): number | null => (v != null ? Number(v) : null);

export function buildFluidPositionRows(rows: RawFluidPositionRow[]): FluidPositionSummary[] {
  return rows.map((r) => {
    const supplyDec = r.supply_decimals ?? SHARES_DECIMALS;
    const borrowDec = r.borrow_decimals ?? SHARES_DECIMALS;
    return {
      nftId: r.nft_id,
      vault: r.vault,
      vaultId: r.vault_id,
      vaultType: r.vault_type,
      supplySymbol: r.supply_symbol,
      borrowSymbol: r.borrow_symbol,
      supplyPoolPair:
        r.supply_pool_token0_symbol != null && r.supply_pool_token1_symbol != null
          ? [r.supply_pool_token0_symbol, r.supply_pool_token1_symbol]
          : null,
      borrowPoolPair:
        r.borrow_pool_token0_symbol != null && r.borrow_pool_token1_symbol != null
          ? [r.borrow_pool_token0_symbol, r.borrow_pool_token1_symbol]
          : null,
      supplyDecimals: r.supply_decimals,
      borrowDecimals: r.borrow_decimals,
      owner: r.owner?.toLowerCase() ?? null,
      status: (r.status === "open" ? "open" : "closed") as FluidPositionStatus,
      wasLiquidated: r.was_liquidated,
      fullyLiquidated: r.fully_liquidated,
      colNet: fmtUnits(r.col_net, supplyDec),
      debtNet: fmtUnits(r.debt_net, borrowDec),
      settled: r.chain
        ? {
            supply: fmtUnits(r.chain.supply, supplyDec),
            borrow: fmtUnits(r.chain.borrow, borrowDec),
            updatedBlock: r.chain.updated_block != null ? Number(r.chain.updated_block) : null,
          }
        : null,
      eventCount: Number(r.event_count ?? 0),
      txCount: Number(r.tx_count ?? r.event_count ?? 0),
      liquidationCount: Number(r.liq_count ?? 0),
      lastLiquidationAt: tsOrNull(r.last_liq_ts),
      firstActivityAt: tsOrNull(r.first_ts),
      lastActivityAt: tsOrNull(r.last_ts),
      lastBlockNumber: r.last_block != null ? Number(r.last_block) : null,
      lastTxHash: r.last_tx_hash,
      peakCol: fmtUnits(r.peak_col, supplyDec),
      peakDebt: fmtUnits(r.peak_debt, borrowDec),
    };
  });
}
