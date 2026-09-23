import { NextResponse } from "next/server";
import { loadAaveMarketOverview } from "@/lib/sources/chain/aave-market-overview";
import { CHAIN_MARKET_CACHE_CONTROL } from "@/lib/api/proxy-cache";
import { AAVE_V3_BASE_CHAIN_ID, AAVE_V3_BASE_ORACLE, AAVE_V3_BASE_POOL } from "@/lib/aave-v3-base/asset-catalog";

// Aave V3 on Base — every reserve on the Pool with its size, rates, risk
// configuration and the market's own oracle price. The same reader that serves
// /api/chain/aave-v3/market and /api/chain/spark/market; the only difference is
// that this source names its chain, so the reader asks BASE_RPC_URL instead of
// ALCHEMY_URL.
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
      pool: AAVE_V3_BASE_POOL,
      oracle: AAVE_V3_BASE_ORACLE,
      chainId: AAVE_V3_BASE_CHAIN_ID,
    });
    return NextResponse.json(data, { headers: { "Cache-Control": CHAIN_MARKET_CACHE_CONTROL } });
  } catch (error) {
    console.error("Error reading Aave V3 Base market overview:", error);
    return NextResponse.json(
      {
        pool: AAVE_V3_BASE_POOL,
        oracle: AAVE_V3_BASE_ORACLE,
        blockNumber: 0,
        chainStale: true,
        reserves: [],
      },
      { status: 200 },
    );
  }
}
