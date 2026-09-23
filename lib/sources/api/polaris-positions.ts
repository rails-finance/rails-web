// Polaris positions listing — the `api` arm's presentation transform.
// ----------------------------------------------------------------------------
// The rails-server route (/api/polaris/positions) filters, sorts and pages
// over the reduced per-CDP state at the (market, cdpId) grain and returns the
// page slice as raw rows: the last CDPUpdated's absolutes, the replayed
// lifecycle, the lifetime sums, and the owner (the last cdp NFT Transfer's
// `to`). The envelope also carries one row per market (the replayed book).
//
// STATUS IS TWO-AXIS: `status` is the last CDPUpdated's operation (op 3 →
// liquidated, op 2 → closed, else open) and `liquidated` is the ever-flag —
// a CDP liquidated and reopened under the same id cannot exist (an id is
// minted once), so on this protocol the two agree, but the wire keeps them
// apart the way every explorer does.
//
// UNITS ARE NATIVE: pETH collateral, the market's stablecoin as debt, all 18
// decimals. Numerics arrive as decimal strings in raw 1e18 units.

import type { PolarisMarket } from "@/lib/polaris/asset-catalog";
import { POLARIS_MARKET_CONFIG, normalizeMarket } from "@/lib/polaris/asset-catalog";

export type PolarisPositionStatus = "open" | "closed" | "liquidated";
export type PolarisPositionSort = "recent" | "debt" | "coll" | "ratio";

export interface PolarisPositionSummary {
  market: PolarisMarket;
  /** The market's debt unit — "USDp" | "GOLDp". */
  stableSymbol: string;
  cdpId: string;
  /** Current holder — the last cdp NFT Transfer's `to`. */
  owner: string;
  ownerAtOpen: string;
  status: PolarisPositionStatus;
  liquidated: boolean;
  /** The last CDPUpdated's `_newColl` / `_newDebt` — scaled + raw twins. */
  coll: number;
  collRaw: string;
  debt: number;
  debtRaw: string;
  /** Lifetime maxima over the ledger — a terminal card's headline. */
  peakColl: number;
  peakDebt: number;
  /** Lifetime sums of the three ledger legs the holder never moved. */
  sumAccruedInterest: number;
  sumStableGain: number;
  sumBcTokenGain: number;
  firstBlock: number;
  firstTs: number;
  firstTxHash: string | null;
  lastBlock: number;
  lastTs: number;
  lastTxHash: string | null;
  /** CDPUpdated rows. */
  eventCount: number;
  transferCount: number;
  liqCount: number;
  /** The market's primary rate at the CDP's last touch, as a fraction. */
  lastPrimaryRate: number | null;
}

/** One market's replayed book, as the rails route states it beside the page. */
export interface PolarisMarketBook {
  market: PolarisMarket;
  openCount: number;
  closedCount: number;
  liquidatedCount: number;
  /** Σ over open rows' last state — the replayed book, not a head read. */
  openColl: number;
  openDebt: number;
  lastPrimaryRate: number | null;
  lastEventBlock: number;
  lastScannedBlock: number;
  // /markets adds the wider counters; absent on the listing envelope.
  cdpUpdatedCount?: number;
  liquidationCount?: number;
  spDepositOps?: number;
  spLastP?: string | null;
  spLastScale?: number | null;
  psmMintCount?: number;
  psmRedeemCount?: number;
}

/** One position row from the rails route (pre-presentation). */
export interface RawPolarisPositionRow {
  market: string;
  cdp_id: string;
  owner: string;
  owner_at_open: string;
  status: string;
  liquidated: boolean;
  coll_raw: string;
  debt_raw: string;
  peak_coll_raw: string;
  peak_debt_raw: string;
  sum_accrued_interest_raw: string;
  sum_stable_gain_raw: string;
  sum_bc_token_gain_raw: string;
  first_block: string | number;
  first_ts: string | number;
  first_tx_hash: string | null;
  last_block: string | number;
  last_ts: string | number;
  last_tx_hash: string | null;
  event_count: number | string;
  transfer_count: number | string;
  liq_count: number | string;
  last_primary_rate: string | null;
}

export interface RawPolarisMarketRow {
  market: string;
  open_count: number | string;
  closed_count: number | string;
  liquidated_count: number | string;
  open_coll_raw: string;
  open_debt_raw: string;
  last_primary_rate: string | null;
  last_event_block: string | number | null;
  last_scanned_block: string | number | null;
  cdp_updated_count?: number | string;
  liquidation_count?: number | string;
  sp_deposit_ops?: number | string;
  sp_last_p?: string | null;
  sp_last_scale?: number | string | null;
  psm_mint_count?: number | string;
  psm_redeem_count?: number | string;
}

const ZERO = BigInt(0);
const E18 = BigInt("1000000000000000000");

function bigintOf(raw: string | null | undefined): bigint {
  if (raw == null || raw === "") return ZERO;
  try {
    return BigInt(String(raw).split(".")[0]);
  } catch {
    return ZERO;
  }
}

/** Raw 1e18 integer string → number (18 decimals, every Polaris token). */
export function scale18(raw: string | null | undefined): number {
  const v = bigintOf(raw);
  const neg = v < ZERO;
  const a = neg ? -v : v;
  const n = Number(a / E18) + Number(a % E18) / 1e18;
  return neg ? -n : n;
}

const intOf = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

function statusOf(s: string): PolarisPositionStatus {
  return s === "open" || s === "liquidated" ? s : "closed";
}

/** Assemble the listing rows from the rails route's page slice. Order is
 *  preserved — filtering, sorting and paging already happened server-side. A
 *  row whose market is not one of the two is dropped rather than guessed. */
export function buildPolarisPositionRows(raw: RawPolarisPositionRow[]): PolarisPositionSummary[] {
  const out: PolarisPositionSummary[] = [];
  for (const r of raw) {
    const market = normalizeMarket(r.market);
    if (!market) continue;
    const collRaw = bigintOf(r.coll_raw);
    const debtRaw = bigintOf(r.debt_raw);
    out.push({
      market,
      stableSymbol: POLARIS_MARKET_CONFIG[market].stable.symbol,
      cdpId: String(r.cdp_id),
      owner: r.owner.toLowerCase(),
      ownerAtOpen: r.owner_at_open.toLowerCase(),
      status: statusOf(r.status),
      liquidated: !!r.liquidated,
      coll: scale18(r.coll_raw),
      collRaw: collRaw.toString(),
      debt: scale18(r.debt_raw),
      debtRaw: debtRaw.toString(),
      peakColl: scale18(r.peak_coll_raw),
      peakDebt: scale18(r.peak_debt_raw),
      sumAccruedInterest: scale18(r.sum_accrued_interest_raw),
      sumStableGain: scale18(r.sum_stable_gain_raw),
      sumBcTokenGain: scale18(r.sum_bc_token_gain_raw),
      firstBlock: intOf(r.first_block),
      firstTs: intOf(r.first_ts),
      firstTxHash: r.first_tx_hash,
      lastBlock: intOf(r.last_block),
      lastTs: intOf(r.last_ts),
      lastTxHash: r.last_tx_hash,
      eventCount: intOf(r.event_count),
      transferCount: intOf(r.transfer_count),
      liqCount: intOf(r.liq_count),
      lastPrimaryRate: r.last_primary_rate != null ? scale18(r.last_primary_rate) : null,
    });
  }
  return out;
}

export function buildPolarisMarketBooks(raw: RawPolarisMarketRow[] | undefined): PolarisMarketBook[] {
  const out: PolarisMarketBook[] = [];
  for (const r of raw ?? []) {
    const market = normalizeMarket(r.market);
    if (!market) continue;
    out.push({
      market,
      openCount: intOf(r.open_count),
      closedCount: intOf(r.closed_count),
      liquidatedCount: intOf(r.liquidated_count),
      openColl: scale18(r.open_coll_raw),
      openDebt: scale18(r.open_debt_raw),
      lastPrimaryRate: r.last_primary_rate != null ? scale18(r.last_primary_rate) : null,
      lastEventBlock: intOf(r.last_event_block),
      lastScannedBlock: intOf(r.last_scanned_block),
      ...(r.cdp_updated_count != null ? { cdpUpdatedCount: intOf(r.cdp_updated_count) } : {}),
      ...(r.liquidation_count != null ? { liquidationCount: intOf(r.liquidation_count) } : {}),
      ...(r.sp_deposit_ops != null ? { spDepositOps: intOf(r.sp_deposit_ops) } : {}),
      ...(r.sp_last_p !== undefined ? { spLastP: r.sp_last_p } : {}),
      ...(r.sp_last_scale !== undefined
        ? { spLastScale: r.sp_last_scale == null ? null : intOf(r.sp_last_scale) }
        : {}),
      ...(r.psm_mint_count != null ? { psmMintCount: intOf(r.psm_mint_count) } : {}),
      ...(r.psm_redeem_count != null ? { psmRedeemCount: intOf(r.psm_redeem_count) } : {}),
    });
  }
  return out;
}
