// ============================================================================
// FETCH AAVE V4 BASE ASSET UNIVERSE
// ============================================================================
//
// The Equities hub's roster as the Mag7 spoke sees it: one entry per reserve
// the spoke reads, from /api/aave-v4-base/reserves (the same read the hub page
// draws its table from). A stock the hub lists appears in the listing's
// Supplying and Borrowing filters by itself, with no symbol typed here.
// Every reserve can be supplied; a reserve is borrowable when the spoke says so
// (USDC here, the stocks are collateral only).

import type { AaveV4AssetUniverseEntry } from "@/lib/api/fetch-aave-v4-asset-universe";
import { AAVE_V4_BASE_API_ROOT } from "@/lib/aave-v4/deployment-routes";

interface ReserveRow {
  symbol: string | null;
  borrowable: boolean;
}

/** The universe from the hub's reserves, a reserve whose symbol is unresolved left out. */
export function aaveV4BaseUniverseFromReserves(reserves: ReserveRow[]): AaveV4AssetUniverseEntry[] {
  return reserves
    .filter((r): r is ReserveRow & { symbol: string } => !!r.symbol)
    .map((r) => ({ symbol: r.symbol, asSupply: true, asDebt: r.borrowable, canSupply: true, canBorrow: r.borrowable }));
}

export async function fetchAaveV4BaseAssetUniverse(): Promise<AaveV4AssetUniverseEntry[]> {
  const res = await fetch(`${AAVE_V4_BASE_API_ROOT}/reserves`, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetchAaveV4BaseAssetUniverse failed: ${res.status} ${res.statusText}`);
  const body = (await res.json()) as { reserves: ReserveRow[] };
  return aaveV4BaseUniverseFromReserves(body.reserves);
}
