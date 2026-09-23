// GET /api/chain/moonwell/share-rate?market=<key> — one Ethereum market's own
// exchange-rate STEPS: the places its share rate moved further than the interest
// it could have accrued over the same seconds, with no Mint or Redeem in the
// market to explain the move.
//
// It is a proxy, not a reader. The series behind it is every Mint and Redeem
// this deployment's `moonwell_mint` / `moonwell_redeem` tables ever recorded
// for the market, and the pair test that finds a step runs in Postgres on the
// box — see rails-server-onboarding `sql/moonwell-share-rate.sql`. Only the
// candidates travel. `steps=1` is always sent: the timeline's market notes
// need the steps and never the series.
//
// UNLIKE Base, the market axis here is a short KEY ('weth' | 'usdc' | 'usdt' |
// 'cbbtc'), not the mToken address — this deployment's four markets are fixed
// and enumerable (lib/moonwell/asset-catalog.ts MOONWELL_MARKETS), so the
// upstream path segment is the key itself rather than an address to validate
// by shape.
//
// The share rate is DERIVED, not read: each Mint and Redeem states the
// underlying amount and the mTokens it was exchanged for, and their quotient is
// the market's rate at that block. So this route needs no oracle and no archive
// node, and it lives under /api/chain only because what it states is a fact
// about the chain rather than about a Rails position.
//
// A market with no steps answers `{ steps: [] }` — measured 2026-09-06, that is
// every key on this deployment (rails-ops pin: zero steps in all four markets'
// whole life under the shipped rule). An unknown key is a 400: unlike Base's
// open-ended address space, the four keys are the whole roster.

import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { ROSTER_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

const MARKET_KEYS = new Set(["weth", "usdc", "usdt", "cbbtc"]);

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  const market = (request.nextUrl.searchParams.get("market") ?? "").toLowerCase();
  if (!MARKET_KEYS.has(market)) {
    return NextResponse.json({ error: "A valid market key is required" }, { status: 400 });
  }
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  const upstream = `${RAILS_API_URL}/api/moonwell/markets/${market}/share-rate?steps=1`;
  try {
    const response = await fetch(upstream, createAuthFetchOptions(undefined, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    // Same TTL as the Base proxy — the backend already declares the roster's
    // own Cache-Control, this is the fallback.
    return NextResponse.json(await response.json(), {
      headers: proxyCacheControl(response, ROSTER_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Error fetching moonwell share-rate steps from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch share-rate steps";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
