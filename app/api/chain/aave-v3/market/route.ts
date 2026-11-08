import { NextResponse, type NextRequest } from "next/server";
import { loadAaveMarketOverview } from "@/lib/sources/chain/aave-market-overview";
import { CHAIN_MARKET_CACHE_CONTROL } from "@/lib/api/proxy-cache";
import { asV3Market, ORACLE_BY_MARKET, POOL_BY_MARKET, V3_SYMBOL_BY_ADDR } from "@/lib/aave-v3/asset-catalog";

// Live Aave V3 market overview on Ethereum — every reserve on one Pool with its
// size, rates, risk config and the market's own oracle price, read at the
// chain head (three multicall bursts). `?market=prime|etherfi` reads that
// market's Pool and oracle (lib/aave-v3/asset-catalog.ts AAVE_V3_MARKETS);
// none reads Core, through rails-server's head surface. Feeds /aave-v3/market
// and its reserve pages. The reader returns a chainStale stub on RPC failure,
// so this route never 500s into the surface. Node runtime; the success
// response is cacheable for ten minutes at the edge, the failure stub is not.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const market = asV3Market(req.nextUrl.searchParams.get("market"));
  const pool = POOL_BY_MARKET[market];
  const oracle = ORACLE_BY_MARKET[market];
  try {
    const data = await loadAaveMarketOverview({
      pool,
      oracle,
      symbolByAddr: V3_SYMBOL_BY_ADDR,
      // Core reads through rails-server's head surface; Prime and EtherFi read the chain.
      surface: market === "core" ? "aave-v3:ethereum:market" : undefined,
    });
    return NextResponse.json(data, { headers: { "Cache-Control": CHAIN_MARKET_CACHE_CONTROL } });
  } catch (error) {
    console.error("Error reading Aave V3 market overview:", error);
    return NextResponse.json({ pool, oracle, blockNumber: 0, chainStale: true, reserves: [] }, { status: 200 });
  }
}
