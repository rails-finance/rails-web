// MakerDAO vaults listing — the `api` arm's presentation transform.
// ----------------------------------------------------------------------------
// The rails-server route (/api/makerdao/vaults) does the structural work — filter,
// sort, paginate over mv_makerdao_positions ⋈ maker_ilk_state — and returns the
// page slice as RAW per-urn rows (the replayed ink/art + the per-ilk rate/price).
// This builder owns the presentation (its own toSummary() below): resolve the
// collateral symbol from the ilk, scale ink (wad), compute the §2 debt
// (art × rate) and §3 USD, and shape each MakerVaultSummary.

import { ilkToCollateralSymbol } from "@/lib/makerdao/asset-catalog";

export type MakerVaultStatus = "open" | "closed" | "liquidated";
// `debt` orders by the raw normalized art; `debtDai` by art x the ilk's live
// rate — the DAI actually owed, and the only one of the two that means
// anything ACROSS ilks (rates run 1.0 to ~1.17).
export type MakerVaultSort =
  | "debt"
  | "debtDai"
  | "collateral"
  | "collateralUsd"
  | "events"
  | "lastActivity"
  | "created";

export interface MakerVaultSummary {
  cdpId: string | null;
  urn: string;
  ilk: string;
  collateralSymbol: string;
  /** Resolved EOA owner (via the DSProxy hop), when captured. */
  owner: string | null;
  status: MakerVaultStatus;
  collateral: { amount: number; amountRaw: string; symbol: string; valueUsd: number | null };
  /** Current DAI debt = art x rate (the §2 multiply); raw normalized art kept. */
  debt: { dai: number | null; artRaw: string };
  /** Highest recorded collateral (ink) + DAI debt over the vault's life — the MAX
   *  of the per-event balances (peak ink; peak art repriced at each event's own
   *  historic rate). For a closed/liquidated vault that now reads 0, this is what
   *  it held at its height. `peakDebtDai` is null when the rate history was absent. */
  peak: { collateral: number; collateralRaw: string; debtDai: number | null; debtDaiRaw: string | null };
  /** Per-ilk ambient (rate ray, OSM-derived USD) that priced this row. */
  ilkState: { rate: string | null; priceUsd: number | null };
  /** Whether this vault was ever liquidated (a permanent history marker). Maker
   *  carries the boolean only — no per-vault liquidation count. Orthogonal to
   *  `status` (mig 156's two-axis model): a live vault can carry it. */
  everLiquidated: boolean;
  /** txCount = distinct transactions of the vault's OWN record (grab seizures
   *  and their lse-* auction markers excluded; multi-row txs deduped) — what
   *  the activity chip's title actually claims. eventCount keeps the raw MV
   *  row count. lastEventAt = unix seconds of the most recent event. */
  activity: { firstBlock: number; lastBlock: number; eventCount: number; txCount: number; lastEventAt: number | null };
  /** LockStake Engine urn (decision 0013): cdp-less, urn-addressed, SKY
   *  collateral, USDS debt. Only ever-debt-bearing engine urns reach the
   *  listing (the backend's LSE gate); lseIndex is the owner-scoped Open
   *  ordinal, not a global id. */
  lse: boolean;
  lseIndex: string | null;
}

const RAY = 1e27;
const WAD = 1e18;
const DUST_WEI = 1e12;

/** One per-urn page-slice row from the rails route (pre-presentation). Wei/ray
 *  values are decimal strings. */
export interface RawMakerVaultRow {
  urn: string;
  ilk: string;
  ink_wei: string;
  art_wei: string;
  event_count: string;
  first_block: string;
  last_block: string;
  cdp: string | null;
  owner_eoa: string | null;
  liquidated: boolean;
  rate: string | null;
  price_usd: string | null;
  /** Highest recorded ink (wad) + DAI debt (wei) over the vault's life. */
  peak_ink_wei: string;
  peak_debt_dai_wei: string | null;
  /** Distinct own-tx count (grab/lse-* excluded) + last event's unix seconds.
   *  Absent on pre-Run-11 payloads. */
  tx_count?: number;
  last_event_ts?: string | null;
  /** LockStake Engine urn marker + owner-scoped Open ordinal (mig 104).
   *  Absent on pre-104 payloads. */
  lse?: boolean;
  lse_index?: string | null;
}

const wad = (weiStr: string | null): number => (weiStr == null ? 0 : Number(weiStr) / WAD);

function statusOf(inkWei: string, artWei: string, liquidated: boolean): MakerVaultStatus {
  // Balance first (the two-axis model, mig 156): a urn holding ink or art above
  // dust is OPEN whatever its seizure history — Maker liquidations are partial
  // by design, and 411 re-collateralised vaults wore the terminal card while
  // the Vat held their balance. The terminal word then keys on the record:
  // seizures in it mark the outcome Liquidated, else Closed.
  const open = Math.abs(Number(inkWei)) > DUST_WEI || Math.abs(Number(artWei)) > DUST_WEI;
  if (open) return "open";
  return liquidated ? "liquidated" : "closed";
}

function toSummary(r: RawMakerVaultRow): MakerVaultSummary {
  const collAmount = wad(r.ink_wei);
  const priceUsd = r.price_usd != null ? Number(r.price_usd) : null;
  const rateRay = r.rate != null ? Number(r.rate) : null;
  const debtDai = rateRay != null ? (Number(r.art_wei) * rateRay) / RAY / WAD : null;
  return {
    cdpId: r.cdp,
    urn: r.urn,
    ilk: r.ilk,
    collateralSymbol: ilkToCollateralSymbol(r.ilk),
    owner: r.owner_eoa,
    status: statusOf(r.ink_wei, r.art_wei, r.liquidated),
    collateral: {
      amount: collAmount,
      amountRaw: r.ink_wei,
      symbol: ilkToCollateralSymbol(r.ilk),
      valueUsd: priceUsd != null ? collAmount * priceUsd : null,
    },
    debt: { dai: debtDai, artRaw: r.art_wei },
    peak: {
      collateral: wad(r.peak_ink_wei),
      collateralRaw: r.peak_ink_wei,
      debtDai: r.peak_debt_dai_wei != null ? Number(r.peak_debt_dai_wei) / WAD : null,
      debtDaiRaw: r.peak_debt_dai_wei,
    },
    ilkState: { rate: r.rate, priceUsd },
    everLiquidated: r.liquidated,
    activity: {
      firstBlock: Number(r.first_block),
      lastBlock: Number(r.last_block),
      eventCount: Number(r.event_count),
      txCount: Number(r.tx_count ?? r.event_count),
      lastEventAt: r.last_event_ts != null ? Number(r.last_event_ts) : null,
    },
    lse: r.lse ?? false,
    lseIndex: r.lse_index ?? null,
  };
}

/** Assemble the listing rows from the rails route's raw page slice. Filtering,
 *  sorting and pagination already happened server-side — order is preserved. */
export function buildMakerVaultRows(raw: RawMakerVaultRow[]): MakerVaultSummary[] {
  return raw.map(toSummary);
}
