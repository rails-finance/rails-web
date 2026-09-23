// ============================================================================
// FETCH MOONWELL BASE MARKET ROSTER
// ============================================================================
//
// The option universe behind the Supplying / Borrowing facets on
// /base/moonwell — every market the Base sweep captured, fetched once per view
// and independent of any filter. Never derived from the rows on screen: the
// listing pages twenty of 86,872 wallets, and a facet built from that slice
// would offer whichever markets those twenty happened to touch.
//
// A market's identity here is its mToken ADDRESS. Two Base markets answer
// symbol() = "mUSDC" (the bridged and the native USDC), so the symbol is a
// label and nothing else — the value a chip carries, and the value the backend
// filters on, is the address.

/** One market as a facet option needs it. */
export interface MoonwellBaseRosterMarket {
  /** The mToken address, lowercased — the market's only unique key. */
  market: string;
  /** The underlying's symbol, e.g. "USDC" — the chip's label. */
  symbol: string;
  /** The mToken's own symbol, e.g. "mUSDC" — collides across two markets. */
  mSymbol: string;
  /** The underlying ERC-20, lowercased — what the token glyph resolves against. */
  underlying: string;
  decimals: number;
}

export interface MoonwellBaseMarketRosterResponse {
  markets: MoonwellBaseRosterMarket[];
  /** The Base block the sweep read this state at; null if the roster is empty. */
  block: number | null;
}

/** The roster as render state. "unavailable" is a first-class outcome, not an
 *  error: the facets then offer nothing, and the listing is unaffected — chip
 *  values are already the addresses the backend wants, so a missing roster
 *  costs the chips their labels and never costs the rows their correctness. */
export type MoonwellBaseRosterState =
  | { status: "loading"; markets: null }
  | { status: "unavailable"; markets: null }
  | { status: "ready"; markets: MoonwellBaseRosterMarket[] };

export const MOONWELL_BASE_ROSTER_LOADING: MoonwellBaseRosterState = { status: "loading", markets: null };
export const MOONWELL_BASE_ROSTER_UNAVAILABLE: MoonwellBaseRosterState = { status: "unavailable", markets: null };

export interface FetchMoonwellBaseMarketsParams {
  /** This deployment's own origin, for the SSR call. Omit in the browser. */
  baseUrl?: string;
  /** The signed reader headers a server render's hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
}

export async function fetchMoonwellBaseMarkets(
  p: FetchMoonwellBaseMarketsParams = {},
): Promise<MoonwellBaseMarketRosterResponse> {
  const res = await fetch(`${p.baseUrl ?? ""}/api/moonwell-base/markets`, { cache: "no-store", headers: p.headers });
  if (!res.ok) throw new Error(`fetchMoonwellBaseMarkets failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as MoonwellBaseMarketRosterResponse;
}
