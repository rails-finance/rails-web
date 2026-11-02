// ============================================================================
// FETCH FRANKENCOIN COLLATERAL ROSTER
// ============================================================================
//
// Every collateral token the Frankencoin index has seen, the option universe
// behind the Collateral facet on /ethereum/frankencoin (rails-server
// `/api/frankencoin/collateral-roster`, 1 Nov 2026). Any ERC-20 can back a
// position, so the list is what the index holds. `token` is the lowercase
// address the positions route's `collateralTokens` takes. A token whose symbol
// the index could not resolve comes back with its short address as the symbol.

export interface FrankencoinCollateralRosterEntry {
  token: string;
  symbol: string;
  /** Positions on the token, of any status: the total `collateralTokens=<token>&status=open,closed,denied` returns. */
  positions: number;
  openPositions: number;
}

export interface FrankencoinCollateralRosterResponse {
  tokens: FrankencoinCollateralRosterEntry[];
  total: number;
}

export interface FetchFrankencoinCollateralRosterParams {
  baseUrl?: string;
  /** The signed reader headers a server render's hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
}

export async function fetchFrankencoinCollateralRoster(
  p: FetchFrankencoinCollateralRosterParams = {},
): Promise<FrankencoinCollateralRosterResponse> {
  const res = await fetch(`${p.baseUrl ?? ""}/api/frankencoin/collateral-roster`, {
    cache: "no-store",
    headers: p.headers,
  });
  if (!res.ok) throw new Error(`fetchFrankencoinCollateralRoster failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as FrankencoinCollateralRosterResponse;
}
