// ============================================================================
// FETCH MAKERDAO ILK ROSTER
// ============================================================================
//
// Every collateral type (ilk) the MakerDAO index holds, with how many vaults sit
// in each — the option universe behind the Collateral type facet on
// /ethereum/makerdao, and the names its search box matches free text against.
//
// It exists because those options used to be derived from the rows on screen.
// The listing fetched 500 of 31,750 vaults, sorted by collateral USD, and
// offered whichever ilks turned up in that slice — so a collateral type holding
// no large vault could not be picked at all, and a search for one ran over 1.6%
// of the index without saying so.
//
// Maker has 42 ilks against Morpho's ~1,300 markets, which makes a static list
// tempting. The reason there isn't one: Maker's IlkRegistry is a CURATED list
// that governance removes an ilk from on wind-down (see UNLISTED_ILKS in
// lib/makerdao/asset-catalog), while the Vat — and this index — keep the ilk's
// vaults forever. Counting the index is the only enumerator that cannot quietly
// omit a collateral type.

/** One collateral type. `ilk` is the chain's own bytes32 name, rendered as the
 *  ASCII string a vault row carries ("ETH-A", "LSEV2-SKY-A"). The display
 *  symbol and icon come from ilkToCollateralSymbol at the render site, so a
 *  chip and a card face name the collateral identically. */
export interface MakerIlkRosterEntry {
  ilk: string;
  /** Vaults indexed under this ilk, of any status. */
  positions: number;
  /** Of those, the ones currently open. */
  openPositions: number;
}

export interface MakerIlkRosterResponse {
  ilks: MakerIlkRosterEntry[];
  /** Collateral types the backend counted — equal to `ilks.length`. */
  total: number;
}

export interface FetchMakerIlkRosterParams {
  baseUrl?: string;
  /** The signed reader headers a server render's hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
}

export async function fetchMakerIlkRoster(p: FetchMakerIlkRosterParams = {}): Promise<MakerIlkRosterResponse> {
  const res = await fetch(`${p.baseUrl ?? ""}/api/makerdao/ilk-roster`, { cache: "no-store", headers: p.headers });
  if (!res.ok) throw new Error(`fetchMakerIlkRoster failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as MakerIlkRosterResponse;
}
