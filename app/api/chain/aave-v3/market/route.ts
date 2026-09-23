import { NextResponse } from "next/server";
import { loadAaveMarketOverview } from "@/lib/sources/chain/aave-market-overview";
import { CHAIN_MARKET_CACHE_CONTROL } from "@/lib/api/proxy-cache";
import { AAVE_V3_POOL, AAVE_V3_ORACLE, V3_SYMBOL_BY_ADDR } from "@/lib/aave-v3/asset-catalog";

// Live Aave V3 Core market overview — every reserve on the Core Pool with its
// size, rates, risk config and the market's own oracle price, read at the
// chain head (three multicall bursts). Feeds /aave-v3/market. The reader
// returns a chainStale stub on RPC failure, so this route never 500s into the
// surface. Node runtime; the success response is cacheable for ten minutes at
// the edge, the failure stub is not.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await loadAaveMarketOverview({
      pool: AAVE_V3_POOL,
      oracle: AAVE_V3_ORACLE,
      symbolByAddr: V3_SYMBOL_BY_ADDR,
    });
    return NextResponse.json(data, { headers: { "Cache-Control": CHAIN_MARKET_CACHE_CONTROL } });
  } catch (error) {
    console.error("Error reading Aave V3 market overview:", error);
    return NextResponse.json(
      { pool: AAVE_V3_POOL, oracle: AAVE_V3_ORACLE, blockNumber: 0, chainStale: true, reserves: [] },
      { status: 200 },
    );
  }
}
