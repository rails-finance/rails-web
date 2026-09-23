import { NextResponse } from "next/server";
import { loadAaveMarketOverview } from "@/lib/sources/chain/aave-market-overview";
import { CHAIN_MARKET_CACHE_CONTROL } from "@/lib/api/proxy-cache";
import { SEAMLESS_CHAIN_ID, SEAMLESS_ORACLE, SEAMLESS_POOL } from "@/lib/seamless/asset-catalog";

// Seamless on Base — every reserve on the Pool with its size, rates, risk
// configuration and the market's own oracle price. The same reader that serves
// /api/chain/aave-v3/market, /api/chain/spark/market and
// /api/chain/aave-v3-base/market: Seamless is an Aave V3 fork answering the
// identical Pool interface, so the only thing that changes is which contracts
// and which chain the source names.
//
// The frozen bit rides in the payload like every other configuration bit, which
// is how this market's defining fact — all eighteen reserves closed to new
// business since 2025-04-15 — reaches the surface without a second read.
//
// No symbolByAddr: the Ethereum catalog's overrides are Ethereum addresses, and
// every Base reserve names itself. The reader returns a chainStale stub on RPC
// failure, so this route never 500s into the surface. Node runtime; the success
// response is cacheable for ten minutes at the edge, the failure stub is not.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await loadAaveMarketOverview({
      pool: SEAMLESS_POOL,
      oracle: SEAMLESS_ORACLE,
      chainId: SEAMLESS_CHAIN_ID,
    });
    return NextResponse.json(data, { headers: { "Cache-Control": CHAIN_MARKET_CACHE_CONTROL } });
  } catch (error) {
    console.error("Error reading Seamless market overview:", error);
    return NextResponse.json(
      { pool: SEAMLESS_POOL, oracle: SEAMLESS_ORACLE, blockNumber: 0, chainStale: true, reserves: [] },
      { status: 200 },
    );
  }
}
