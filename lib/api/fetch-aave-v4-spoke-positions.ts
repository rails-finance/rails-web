// ============================================================================
// FETCH AAVE V4 SPOKE-POSITIONS
// ============================================================================
//
// Discovery list for the /aave-v4 page — the analog of Liquity's /api/troves.
// One row per (wallet, spoke), backed by mv_aave_v4_spoke_positions in
// rails-server-onboarding.
//
// As of rails-server-onboarding migration 022 the MV holds only structural data
// (per-reserve balances + LTs). USD totals and the health factor are
// computed at read time in the Express handler against live DefiLlama
// prices — this matches the Liquity V2 pattern where price freshness is a
// read-time concern, not an MV-refresh concern.
//
// Wire shape mirrors rails-server-onboarding/api/src/routes/aaveV4.ts. Keep this
// file in sync with the SpokePositionRow / SpokePositionsResponse types
// there — both halves change together when filters or columns shift.

import type { AaveV4PriceSource } from "@/lib/shared/types/protocols/aave-v4";

/** Lifecycle status of a (wallet, spoke) position (server migration 057).
 *  'open' — ≥1 reserve still carries a live (event-replayed) balance. 'closed' —
 *  every balance was repaid/withdrawn to zero. 'liquidated' — the terminal event
 *  that emptied the position was a liquidation. Derived from chain-grounded data
 *  (truth-preserving delta-replay + terminal event action); see migration 057. */
export type AaveV4SpokePositionStatus = "open" | "closed" | "liquidated";

/** Per-reserve breakdown shipped with every listing row. Mirrors the detail
 *  page's chain-state shape so the listing card can build the same sim inputs
 *  (HF / liq price / borrowing power) the detail card uses — no per-row chain
 *  fetch from the client, no duplicate sim logic, no number drift between the
 *  two surfaces.
 *
 *  Balances ship as token-wei strings (numeric(78,0) precision). Scale by
 *  `decimals` at render time. `usdPrice` is the same price the server used to
 *  compute the row's totals — now the on-chain Aave oracle price (DefiLlama only
 *  for reserves the registry omits) — and `priceSource` names its lineage so the
 *  card can label the figure's provenance. Using them client-side means the
 *  listing's sim arrives at the same totals the server reports. */
export interface AaveV4SpokeReserveSummary {
  symbol: string;
  address: string;
  decimals: number;
  supplyBalanceRaw: string;
  debtBalanceRaw: string;
  isCollateral: boolean;
  lt: number | null;
  usdPrice: number | null;
  /** Lineage of `usdPrice` — on-chain (`chainlink` / `chainlink-eth-derived` /
   *  `pendle-twap`) vs off-chain (`defillama` / `stablecoin`); null when the
   *  reserve is unpriced. Lets the card tag the USD figure's provenance. */
  priceSource: AaveV4PriceSource | null;
}

export interface AaveV4SpokePositionRow {
  wallet: string;
  spoke: string;
  spokeName: string;
  totalSupplyUsd: number | null;
  totalDebtUsd: number | null;
  /** 1.0-scaled health factor. Sourced from the spoke contract's
   *  `getUserAccountData` (matches Aave UI exactly) when the chain overlay
   *  succeeded; falls back to derived `weightedColl/debt` when it didn't.
   *  Null when the position carries no debt. */
  healthFactor: number | null;
  /** 1.0-scaled position-wide collateral factor from the spoke contract.
   *  Matches Aave UI's per-position CF %. Null when chain data was
   *  unavailable on this request. */
  avgCollateralFactor: number | null;
  /** True when `healthFactor` / `avgCollateralFactor` came from the
   *  fallback derived-math path (chain RPC overlay failed). UI can render
   *  a "stale" badge when set. */
  chainHfStale: boolean;
  supplyAssetCount: number;
  debtAssetCount: number;
  dominantSupplySymbol: string | null;
  dominantSupplyAddress: string | null;
  dominantDebtSymbol: string | null;
  dominantDebtAddress: string | null;
  lastActivityAt: number;
  lastBlockNumber: number;
  lastTxHash: string | null;
  /** Freshest DefiLlama fetch among the assets in this position (epoch ms).
   *  Within ~5min of "now" on warm caches; older if the row's assets all
   *  came from a cold-fetch DefiLlama call that's now aged out. */
  oldestPriceFetchedAt: number | null;
  /** True if any non-zero balance reserve in this position lacks a price
   *  (DefiLlama returned nothing for it). USD/HF still computed from the
   *  priced reserves, but the totals understate reality. */
  hasMissingPrice: boolean;
  /** Lifetime liquidation event count for this (wallet, spoke). The listing
   *  card renders a LIQUIDATED badge whenever this is > 0. Computed from
   *  aave_v4_liquidation at MV refresh time. */
  liquidationCount: number;
  /** Epoch seconds of the most recent liquidation; null when never liquidated. */
  lastLiquidationAt: number | null;
  /** Lifecycle status (server migration 057). The directory listing only
   *  returns 'open'; the wallet view returns all three so a closed/liquidated
   *  position stays visible in a wallet's history. The card renders a
   *  CLOSED / LIQUIDATED pill and a muted treatment when this isn't 'open'. */
  status: AaveV4SpokePositionStatus;
  /** Epoch seconds of the first event on this (wallet, spoke). */
  openedAt: number | null;
  /** Epoch seconds of the closing event; null while the position is open. */
  closedAt: number | null;
  /** All-time high-water mark in USD — the largest the portfolio's summed
   *  supply / debt ever reached at a single moment, each reserve valued at its
   *  price-at-the-time (the event-block historic price), so a settled record
   *  stays fixed rather than drifting with today's market. Non-null only on
   *  closed/liquidated rows — the closed card shows these in place of live
   *  balances a zeroed position lacks. */
  peakSupplyUsd: number | null;
  peakDebtUsd: number | null;
  /** Distinct non-liquidation transaction count for this (wallet, spoke) —
   *  the activity tally shown beside the time-ago. Matches the detail card's
   *  txCount and Liquity's transactionCount. From mv_aave_v4_events (server
   *  migration 029); 0 on responses from an API that predates that migration. */
  txCount: number;
  ensName: string | null;
  /** Per-reserve breakdown — chain-state when overlay succeeded, MV-indexed
   *  fallback (with `chainHfStale=true`) otherwise. Feeds the listing card's
   *  asset cluster + the same `simulateAaveV4Position` the detail uses. */
  reserves: AaveV4SpokeReserveSummary[];
}

export interface AaveV4SpokePositionsResponse {
  rows: AaveV4SpokePositionRow[];
  total: number;
  limit: number;
  offset: number;
}

export type AaveV4SpokePositionSort = "lastActivity" | "supplyUsd" | "debtUsd" | "healthFactor";

export interface FetchAaveV4SpokePositionsParams {
  /** Multi-spoke filter. Empty/undefined = no spoke restriction. */
  spokes?: string[];
  /** Multi-hub filter (Core/Plus/Prime). The server resolves to the union
   *  of spokes belonging to those hubs and ANDs with `spokes` if both are
   *  provided. */
  hubs?: string[];
  wallet?: string;
  ownerEns?: string;
  hasDebt?: boolean;
  noDebt?: boolean;
  /** Tri-state filter on liquidation history. true → only liquidated
   *  positions, false → only non-liquidated, undefined → no restriction. */
  hasLiquidations?: boolean;
  healthBelow?: number;
  /** Hide effectively-closed positions (supply and debt both ~$0). */
  excludeClosed?: boolean;
  /** Hide dust positions whose combined supply + debt USD is below this. */
  minTotalUsd?: number;
  /** Lifecycle statuses to include (server migration 057). Empty/undefined
   *  lets the server apply its contextual default ('open' on the bare
   *  directory, all statuses on a wallet-scoped view). */
  status?: AaveV4SpokePositionStatus[];
  activeWithin?: number;
  /** Multi-asset filter on the supply side. Position must hold at least one
   *  of these symbols with a non-zero supply balance. "???" matches reserves
   *  whose symbol couldn't be resolved (unknown ERC20s). Empty/undefined =
   *  no restriction. */
  supplyAssets?: string[];
  /** Multi-asset filter on the debt side. Same semantics as `supplyAssets`,
   *  ANDed with it server-side when both are provided. */
  borrowAssets?: string[];
  sortBy?: AaveV4SpokePositionSort;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
  baseUrl?: string;
}

/** Deterministic querystring for the spoke-positions endpoint. Shared by the
 *  client fetch (below), the SSR server fetch, and the initial-data cache key so
 *  all three derive the exact same string from the same params — no drift. */
export function buildAaveV4SpokePositionsQuery(p: FetchAaveV4SpokePositionsParams): string {
  const qs = new URLSearchParams();
  if (p.spokes && p.spokes.length > 0) qs.set("spokes", p.spokes.join(","));
  if (p.hubs && p.hubs.length > 0) qs.set("hubs", p.hubs.join(","));
  if (p.wallet) qs.set("wallet", p.wallet);
  if (p.ownerEns) qs.set("ownerEns", p.ownerEns);
  if (p.hasDebt) qs.set("hasDebt", "true");
  if (p.noDebt) qs.set("noDebt", "true");
  if (p.hasLiquidations === true) qs.set("hasLiquidations", "true");
  if (p.hasLiquidations === false) qs.set("hasLiquidations", "false");
  if (p.healthBelow != null) qs.set("healthBelow", String(p.healthBelow));
  if (p.excludeClosed) qs.set("excludeClosed", "true");
  if (p.minTotalUsd != null) qs.set("minTotalUsd", String(p.minTotalUsd));
  if (p.status && p.status.length > 0) qs.set("status", p.status.join(","));
  if (p.activeWithin != null) qs.set("activeWithin", String(p.activeWithin));
  if (p.supplyAssets && p.supplyAssets.length > 0) qs.set("supplyAssets", p.supplyAssets.join(","));
  if (p.borrowAssets && p.borrowAssets.length > 0) qs.set("borrowAssets", p.borrowAssets.join(","));
  if (p.sortBy) qs.set("sortBy", p.sortBy);
  if (p.sortOrder) qs.set("sortOrder", p.sortOrder);
  if (p.limit != null) qs.set("limit", String(p.limit));
  if (p.offset != null) qs.set("offset", String(p.offset));
  return qs.toString();
}

export async function fetchAaveV4SpokePositions(
  p: FetchAaveV4SpokePositionsParams,
): Promise<AaveV4SpokePositionsResponse> {
  const url = `${p.baseUrl ?? ""}/api/aave-v4/spoke-positions?${buildAaveV4SpokePositionsQuery(p)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`fetchAaveV4SpokePositions failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as AaveV4SpokePositionsResponse;
}
