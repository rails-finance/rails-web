// ============================================================================
// FETCH DOLOMITE MARKET ROSTER
// ============================================================================
//
// Every market the Dolomite core holds, the option universe behind the Supplied
// and Borrowed asset facets on /ethereum/dolomite (rails-server
// `/api/dolomite/market-roster`, 1 Nov 2026). `marketId` is the core's numeric
// market id, the value the positions route's `supplyMarkets` / `borrowMarkets`
// take; the symbol is a label, and five stable markets (rUSD, srUSD, wsrUSD,
// cUSD, stcUSD) are told apart only by it.

export interface DolomiteMarketRosterEntry {
  marketId: string;
  symbol: string;
  token: string;
  /** Accounts that ever held a balance in the market, either sign. */
  positions: number;
  /** Of those, the ones holding one now (par <> 0, either sign). A supply or
   *  borrow filter splits by sign, so this figure is never drawn on a chip. */
  openPositions: number;
  /** Accounts holding the market as a supply now (par > 0): the total
   *  `supplyMarkets=<id>` returns for an open account. */
  supplyOpen: number;
  /** Accounts holding it as a borrow now (par < 0): the total `borrowMarkets=<id>` returns. */
  borrowOpen: number;
}

export interface DolomiteMarketRosterResponse {
  markets: DolomiteMarketRosterEntry[];
  total: number;
}

export interface FetchDolomiteMarketRosterParams {
  baseUrl?: string;
  /** The signed reader headers a server render's hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
}

export async function fetchDolomiteMarketRoster(
  p: FetchDolomiteMarketRosterParams = {},
): Promise<DolomiteMarketRosterResponse> {
  const res = await fetch(`${p.baseUrl ?? ""}/api/dolomite/market-roster`, { cache: "no-store", headers: p.headers });
  if (!res.ok) throw new Error(`fetchDolomiteMarketRoster failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as DolomiteMarketRosterResponse;
}
