// ============================================================================
// FETCH AAVE V4 HUBS (cross-hub comparison)
// ============================================================================
//
// The protocol-aggregate view of Aave V4's three hubs (Core / Plus / Prime):
// per-(hub, asset, spoke) credit lines, supply caps, current utilisation and
// per-hub active-position counts. Feeds the neutral side-by-side surface at
// /aave-v4/hubs — see aave-v4-hub-comparison.md.
//
// Wire shape mirrors rails-server-onboarding's api/src/services/aave-v4-hubs.ts. Big
// integers ride as STRINGS (caps in whole-token units; addedAssets / totalOwed
// in raw token units — full `decimals`). Don't parseFloat at the boundary;
// utilisation and USD/composition are computed at render time from these plus
// prices + asset-class buckets, same as the rest of the Aave V4 path.

export type HubTierKey = "core" | "plus" | "prime" | "paxos";

/** Canonical presentation order for the hub columns — never sorted by a metric.
 *  Paxos (Global Dollar / USDG) is the 4th hub, appended last as the newest. */
export const HUB_ORDER: HubTierKey[] = ["core", "plus", "prime", "paxos"];

export interface HubCreditLine {
  hub: HubTierKey;
  spoke: string;
  spokeName: string;
  assetId: number;
  symbol: string;
  underlying: string;
  decimals: number;
  /** LT fraction in (0,1], or null for borrow-only listings. */
  lt: number | null;
  /** Supply cap, whole-token units. "1099511627775" (2^40-1) ≈ uncapped. */
  addCap: string;
  /** Credit line (max draw), whole-token units. */
  drawCap: string;
  /** Supplied, raw token units. */
  addedAssets: string;
  /** Drawn (debt incl. interest), raw token units. */
  totalOwed: string;
  riskPremiumThreshold: number;
  active: boolean;
  halted: boolean;
  /** From reserve-config; null when config isn't yet indexed for this market. */
  canSupply: boolean | null;
  canBorrow: boolean | null;
  /** Latest variable borrow rate (the hub's `drawnRate`), ray (1e27) as a
   *  string. null until the rate pipeline has seen this (hub, asset). */
  borrowRate: string | null;
  /** Protocol's share of borrow interest (V4 reserve factor), in BPS
   *  (1000 = 10%). 0 for collateral-only / non-borrowable reserves. */
  liquidityFeeBps: number;
}

export interface AaveV4HubsResponse {
  blockNumber: number | null;
  hubs: HubTierKey[];
  lines: HubCreditLine[];
  positionCounts: Record<HubTierKey, number>;
  updatedAt: string | null;
}

export interface FetchAaveV4HubsParams {
  /** Server components must pass an absolute origin; client passes nothing. */
  baseUrl?: string;
}

export async function fetchAaveV4Hubs(p: FetchAaveV4HubsParams = {}): Promise<AaveV4HubsResponse> {
  const url = `${p.baseUrl ?? ""}/api/aave-v4/hubs`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`fetchAaveV4Hubs failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as AaveV4HubsResponse;
}
