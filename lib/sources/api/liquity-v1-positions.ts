// Liquity V1 positions listing — the `api` arm's presentation transform (chain-state tier).
// ----------------------------------------------------------------------------
// The rails-server route (/api/liquity-v1/positions) does the structural work —
// filter, sort, paginate over mv_liquity_v1_positions — and returns the page slice
// as RAW per-wallet rows. Each Liquity V1 Trove is single-collateral (ETH) +
// single-debt (LUSD), so a row carries scalar balances (no reserve list, no ERC20
// multicall to resolve — both assets are fixed 18-decimal). This builder just scales
// the raw wei balances to display units and passes through status + scalars.

import { scaleRaw } from "@/lib/sources/chain/erc20-meta";
import { ASSET_DECIMALS } from "@/lib/liquity-v1/asset-catalog";

export type LiquityV1PositionStatus = "open" | "closed" | "liquidated";
/** Backend sort keys — all chain-direct. `ratio` is the two balances' own
 *  quotient (coll/debt), which is the protocol's ordering key rather than an
 *  interpretation: V1 sorts its redemption queue by nominal ICR, price-free, and
 *  with one collateral asset that order is the collateral-ratio order. NULL, and
 *  so sorted last either way, on a Trove with no debt. */
export type LiquityV1PositionSort = "recent" | "collateral" | "debt" | "ratio";

export interface LiquityV1PositionSummary {
  wallet: string;
  /** Trove-lifecycle index (mig 075): a wallet that closed a Trove and reopened has
   *  one summary per life. (wallet, epoch) is the position's identity. */
  epoch: number;
  status: LiquityV1PositionStatus;
  /** ETH collateral the Trove currently holds (display units). */
  collateral: number;
  /** LUSD debt the Trove currently owes (display units). */
  debt: number;
  collateralRaw: string;
  debtRaw: string;
  /** Highest ETH collateral / LUSD debt this life ever recorded (display units) —
   *  MAX of the absolute per-event balances. For a closed/liquidated Trove that now
   *  reads 0, this is what it held at its height. */
  peakCollateral: number;
  peakDebt: number;
  lastActivityAt: number;
  lastBlockNumber: number;
  lastTxHash: string | null;
  /** open/adjust/close operations (excludes involuntary liquidation/redemption). */
  txCount: number;
  liquidationCount: number;
  redemptionCount: number;
}

/** One (wallet, epoch) page-slice row from the rails route (pre-presentation). */
export interface RawLiquityV1WalletRow {
  wallet: string;
  epoch: number;
  collBalanceRaw: string;
  debtBalanceRaw: string;
  peakCollRaw: string;
  peakDebtRaw: string;
  status: LiquityV1PositionStatus;
  lastActivityAt: number;
  lastBlockNumber: number;
  lastTxHash: string | null;
  txCount: number;
  liquidationCount: number;
  redemptionCount: number;
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

/** Shape the listing rows from the rails route's raw page slice. Filtering, sorting
 *  and pagination already happened server-side — order is preserved. */
export function buildLiquityV1PositionRows(raw: RawLiquityV1WalletRow[]): LiquityV1PositionSummary[] {
  return raw.map((w) => ({
    wallet: w.wallet,
    epoch: w.epoch,
    status: w.status,
    collateral: scaleRaw(bigintOf(w.collBalanceRaw), ASSET_DECIMALS),
    debt: scaleRaw(bigintOf(w.debtBalanceRaw), ASSET_DECIMALS),
    collateralRaw: w.collBalanceRaw,
    debtRaw: w.debtBalanceRaw,
    peakCollateral: scaleRaw(bigintOf(w.peakCollRaw), ASSET_DECIMALS),
    peakDebt: scaleRaw(bigintOf(w.peakDebtRaw), ASSET_DECIMALS),
    lastActivityAt: w.lastActivityAt,
    lastBlockNumber: w.lastBlockNumber,
    lastTxHash: w.lastTxHash,
    txCount: w.txCount,
    liquidationCount: w.liquidationCount,
    redemptionCount: w.redemptionCount,
  }));
}
