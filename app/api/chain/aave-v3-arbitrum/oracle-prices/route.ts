import { NextRequest, NextResponse } from "next/server";
import { resolveAaveOraclePrices, aaveOraclePriceOf } from "@/lib/sources/chain/aave-oracle-prices";
import { AAVE_V3_ARBITRUM_CHAIN_ID, AAVE_V3_ARBITRUM_ORACLE } from "@/lib/aave-v3-arbitrum/asset-catalog";

// On-chain USD for Arbitrum reserve addresses — the Arbitrum Pool's IAaveOracle
// at a recent finalized block, from rails-server's at-block store (Arbitrum has no Sieve); the twin of the Base route. An asset the
// oracle cannot price is absent from the response.
//
// Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ASSETS = 40;

export async function GET(request: NextRequest) {
  const assets = (request.nextUrl.searchParams.get("assets") ?? "")
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter((a) => /^0x[0-9a-f]{40}$/.test(a))
    .slice(0, MAX_ASSETS);
  if (assets.length === 0) return NextResponse.json({ prices: {} });
  try {
    const map = await resolveAaveOraclePrices([{ oracle: AAVE_V3_ARBITRUM_ORACLE, assets }], AAVE_V3_ARBITRUM_CHAIN_ID);
    const prices: Record<string, number> = {};
    for (const a of assets) {
      const p = aaveOraclePriceOf(map, AAVE_V3_ARBITRUM_ORACLE, a);
      if (p != null && p > 0) prices[a] = p;
    }
    return NextResponse.json({ prices });
  } catch (error) {
    console.error("Error reading Aave V3 Arbitrum oracle prices:", error);
    return NextResponse.json({ prices: {} });
  }
}
