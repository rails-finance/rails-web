// The Moonwell Base listing's market roster — the option universe behind the
// Supplying / Borrowing facets on /base/moonwell.
//
// It asks the POSITIONS endpoint for something that is not positions, and the
// indirection is the point. rails-server ships `marketState` beside every page
// of rows: the markets the Base sweep actually captured, read at the tick's
// pinned block. That is the only set a facet may offer, because it is the only
// set the listing can match on — `supplyMarkets` / `borrowMarkets` filter over
// each row's captured per-market balances. The Comptroller's own
// `getAllMarkets()` (lib/sources/chain/moonwell-market-state.ts, which the
// /markets view reads) is the wider truth and the wrong one here: governance
// listing a twenty-second market would put a chip on the page that can only
// ever return zero rows.
//
// Nothing is written down. lib/moonwell-base/asset-catalog.ts refuses to keep a
// market list for the same reason it always did — this route doesn't add one,
// it forwards the roster that already travels with the rows.
//
// A market is identified by its mToken ADDRESS, never its symbol: two Base
// markets answer symbol() = "mUSDC" (the bridged and the native USDC).

import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { ROSTER_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import type { RawMoonwellBaseMarketState } from "@/lib/moonwell-base/listing-roster";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

/** `limit=1` because only the response's `marketState` is wanted — the single
 *  row is the smallest slice the endpoint will serve. */
const UPSTREAM = "/api/moonwell-base/positions?limit=1";

interface UpstreamResponse {
  marketState?: RawMoonwellBaseMarketState[] | null;
}

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  try {
    const response = await fetch(`${RAILS_API_URL}${UPSTREAM}`, createAuthFetchOptions(undefined, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const raw = (await response.json()) as UpstreamResponse;
    const state = raw.marketState ?? [];
    // Slimmed to what a chip needs: identity and a label. The rates, exchange
    // rates and prices in the same payload belong to the rows, not the facets.
    const markets = state.map((m) => ({
      market: m.market.toLowerCase(),
      symbol: m.symbol,
      mSymbol: m.mSymbol,
      underlying: m.underlying.toLowerCase(),
      decimals: m.decimals,
    }));
    return NextResponse.json(
      { markets, block: state[0]?.block ?? null },
      { headers: proxyCacheControl(response, ROSTER_CACHE_CONTROL) },
    );
  } catch (error) {
    console.error("Error fetching moonwell-base market roster from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch market roster";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
