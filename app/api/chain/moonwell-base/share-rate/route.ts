// GET /api/chain/moonwell-base/share-rate?market=0x… — one Base market's own
// exchange-rate STEPS: the places its share rate moved further than the interest
// it could have accrued over the same seconds, with no Mint or Redeem in the
// market to explain the move.
//
// It is a proxy, not a reader. The series behind it is every Mint and Redeem
// the market ever emitted (2.63M rows on WETH), and the pair test that finds a
// step runs in Postgres on the box — see rails-server-onboarding
// `sieve-base/sql/moonwell-base-share-rate.sql`. Only the candidates travel.
// `steps=1` is always sent: the timeline's market notes need the steps and
// never the series, and the samples are capped at 5,000 rows upstream anyway.
//
// The share rate is DERIVED, not read: each Mint and Redeem states the
// underlying amount and the mTokens it was exchanged for, and their quotient is
// the market's rate at that block. So this route needs no oracle and no archive
// node, and it lives under /api/chain only because what it states is a fact
// about the chain rather than about a Rails position.
//
// A market with no steps answers `{ steps: [] }`, and an address that is not a
// market answers 200 with `decimals: null` — never a 404. The caller renders
// nothing either way, so a not-found would be an error the page has to swallow.

import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { ROSTER_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

/** An mToken address, and nothing else — the upstream path segment is built
 *  from this, so it is matched rather than escaped. */
const MTOKEN = /^0x[0-9a-fA-F]{40}$/;

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  const market = request.nextUrl.searchParams.get("market") ?? "";
  if (!MTOKEN.test(market)) {
    return NextResponse.json({ error: "A market mToken address is required" }, { status: 400 });
  }
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  const upstream = `${RAILS_API_URL}/api/moonwell-base/markets/${market.toLowerCase()}/share-rate?steps=1`;
  try {
    const response = await fetch(upstream, createAuthFetchOptions(undefined, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    // The backend already declares the roster's own TTL (10 min shared, an
    // hour stale-while-revalidate) on this route; the fallback exists so a
    // backend that stops declaring one does not make every note fetch a full
    // Vercel → box → Postgres round trip.
    return NextResponse.json(await response.json(), {
      headers: proxyCacheControl(response, ROSTER_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Error fetching moonwell-base share-rate steps from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch share-rate steps";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
