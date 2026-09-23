// ============================================================================
// FETCH MORPHO MARKET ROSTER
// ============================================================================
//
// Every market the L1 Morpho index holds, with the symbols that name it and how
// many positions sit in it — the option universe behind the Market / Loan /
// Collateral facets on /ethereum/morpho.
//
// It exists because the facets used to be derived from the rows on screen. The
// listing fetched 500 of 46,815 positions and offered the markets it happened to
// see, so a market with no recent activity could not be picked at all and a
// search only ever ran over that 1% slice. The roster is the whole membership
// list, fetched once per view and independent of any filter.
//
// The symbol → address direction matters as much as the labels: a Loan or
// Collateral chip filters the backend by TOKEN ADDRESS, not by market id (USDC
// alone is the loan token of ~503 markets — a market-id CSV for it would be a
// 33 KB query string). `tokens` carries that mapping, and a symbol maps to a
// LIST because two distinct contracts can carry the same symbol; selecting the
// symbol means both.

/** One market. `label` is the same string the position card's face carries
 *  (marketLabel), so a chip and a row name a market identically. */
export interface MorphoMarketRosterEntry {
  /** 0x-prefixed 64-hex market id — what a position row's `marketId` carries. */
  marketId: string;
  /** "USDC / PT-reUSD-10DEC2026", or "USDC (idle)" for a collateral-less market. */
  label: string;
  loanSymbol: string;
  /** null on an idle / supply-only market, which has no collateral side. */
  collateralSymbol: string | null;
  /** Liquidation LTV as a 0..1 fraction. */
  lltvFraction: number;
  /** Positions indexed in this market, of any status. */
  positions: number;
  /** Of those, the ones currently open. */
  openPositions: number;
}

export interface MorphoMarketRosterResponse {
  markets: MorphoMarketRosterEntry[];
  /** Token symbol → every ERC-20 address seen under it across the roster. */
  tokens: Record<string, string[]>;
  /** Markets the backend counted — equal to `markets.length` unless a row's
   *  params failed to decode. */
  total: number;
}

export interface FetchMorphoMarketRosterParams {
  baseUrl?: string;
  /** The signed reader headers a server render's hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
}

export async function fetchMorphoMarketRoster(
  p: FetchMorphoMarketRosterParams = {},
): Promise<MorphoMarketRosterResponse> {
  const res = await fetch(`${p.baseUrl ?? ""}/api/morpho/market-roster`, { cache: "no-store", headers: p.headers });
  if (!res.ok) throw new Error(`fetchMorphoMarketRoster failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as MorphoMarketRosterResponse;
}
