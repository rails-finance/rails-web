import { NextResponse } from "next/server";
import { loadAaveMarketOverview } from "@/lib/sources/chain/aave-market-overview";
import { CHAIN_MARKET_CACHE_CONTROL } from "@/lib/api/proxy-cache";
import { SPARK_ADDRESSES, SPARK_SYMBOL_BY_ADDR } from "@/lib/spark/asset-catalog";

// Live SparkLend market overview — every reserve on the single SparkLend Pool
// with its size, rates, risk config and SparkLend's own oracle price, read at
// the chain head. Feeds /spark/market. Same shared reader as Aave V3 Core
// (SparkLend is an Aave V3 fork with the identical Pool/oracle surface).
//
// The success response is cacheable for ten minutes at the edge, the
// chainStale failure stub is not.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await loadAaveMarketOverview({
      pool: SPARK_ADDRESSES.POOL,
      oracle: SPARK_ADDRESSES.ORACLE,
      symbolByAddr: SPARK_SYMBOL_BY_ADDR,
      capAutomator: SPARK_ADDRESSES.CAP_AUTOMATOR,
    });
    return NextResponse.json(data, { headers: { "Cache-Control": CHAIN_MARKET_CACHE_CONTROL } });
  } catch (error) {
    console.error("Error reading SparkLend market overview:", error);
    return NextResponse.json(
      { pool: SPARK_ADDRESSES.POOL, oracle: SPARK_ADDRESSES.ORACLE, blockNumber: 0, chainStale: true, reserves: [] },
      { status: 200 },
    );
  }
}
