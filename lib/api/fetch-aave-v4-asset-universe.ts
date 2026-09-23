// ============================================================================
// FETCH AAVE V4 ASSET-UNIVERSE
// ============================================================================
//
// Distinct token symbols seen across every open (wallet, spoke) position in
// mv_aave_v4_spoke_positions. Feeds the Supplying / Borrowing multi-select
// filters on /aave-v4. Data-driven on purpose — new spokes or reserves
// surface without a frontend config bump. Reserves whose symbol couldn't be
// resolved are returned as the "???" sentinel and the listing filter treats
// that as a first-class option.

/** One entry per distinct symbol in the (optionally market-scoped) universe.
 *
 *  `asSupply` / `asDebt` are EMPIRICAL — whether the symbol has ever appeared
 *  on each side in indexed positions. Advisory only (a "rarely seen here" mute).
 *
 *  `canSupply` / `canBorrow` are CONFIG-TRUTHFUL — the protocol's per-market
 *  availability, read from chain (aave_v4_reserve_config). They are present
 *  ONLY when the request was scoped to a spoke/hub; in the global (unscoped)
 *  response they're undefined because availability is inherently per-market
 *  (an asset borrowable in one spoke may be collateral-only in another). When
 *  present, the filter pills use them to hide assets the market doesn't offer. */
export interface AaveV4AssetUniverseEntry {
  symbol: string;
  asSupply: boolean;
  asDebt: boolean;
  canSupply?: boolean;
  canBorrow?: boolean;
}

export interface AaveV4AssetUniverseResponse {
  assets: AaveV4AssetUniverseEntry[];
}

export interface FetchAaveV4AssetUniverseParams {
  baseUrl?: string;
  /** Restrict to these spoke keys (e.g. ["main", "bluechip"]). When set, the
   *  response carries config-truthful canSupply/canBorrow scoped to them. */
  spokes?: string[];
  /** Restrict to the spokes in these hub tiers ("core" | "plus" | "prime").
   *  Intersects with `spokes` server-side when both are given. */
  hubs?: string[];
}

export async function fetchAaveV4AssetUniverse(
  p: FetchAaveV4AssetUniverseParams = {},
): Promise<AaveV4AssetUniverseResponse> {
  const qs = new URLSearchParams();
  for (const s of p.spokes ?? []) qs.append("spokes", s);
  for (const h of p.hubs ?? []) qs.append("hubs", h);
  const query = qs.toString();
  const url = `${p.baseUrl ?? ""}/api/aave-v4/asset-universe${query ? `?${query}` : ""}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`fetchAaveV4AssetUniverse failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as AaveV4AssetUniverseResponse;
}
