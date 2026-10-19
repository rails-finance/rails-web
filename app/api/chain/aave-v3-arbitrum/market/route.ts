import { NextResponse } from "next/server";
import { loadAaveMarketOverview } from "@/lib/sources/chain/aave-market-overview";
import { CHAIN_MARKET_CACHE_CONTROL } from "@/lib/api/proxy-cache";
import {
  AAVE_V3_ARBITRUM_CHAIN_ID,
  AAVE_V3_ARBITRUM_ORACLE,
  AAVE_V3_ARBITRUM_POOL,
  AAVE_V3_ARBITRUM_SYMBOL_BY_ADDR,
} from "@/lib/aave-v3-arbitrum/asset-catalog";

// Aave V3 on Arbitrum — every reserve on the Pool with its size, rates, risk
// configuration and the oracle's price; the reader behind the Ethereum and Base
// market routes, through ARBITRUM_RPC_URL. The catalog's symbols name the
// bridged USDC apart from the native one. A chainStale stub on RPC failure,
// never a 500; the success response caches ten minutes at the edge.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await loadAaveMarketOverview({
      pool: AAVE_V3_ARBITRUM_POOL,
      oracle: AAVE_V3_ARBITRUM_ORACLE,
      chainId: AAVE_V3_ARBITRUM_CHAIN_ID,
      symbolByAddr: AAVE_V3_ARBITRUM_SYMBOL_BY_ADDR,
    });
    return NextResponse.json(data, { headers: { "Cache-Control": CHAIN_MARKET_CACHE_CONTROL } });
  } catch (error) {
    console.error("Error reading Aave V3 Arbitrum market overview:", error);
    return NextResponse.json(
      {
        pool: AAVE_V3_ARBITRUM_POOL,
        oracle: AAVE_V3_ARBITRUM_ORACLE,
        blockNumber: 0,
        chainStale: true,
        reserves: [],
      },
      { status: 200 },
    );
  }
}
