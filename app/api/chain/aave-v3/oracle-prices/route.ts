import { NextRequest, NextResponse } from "next/server";
import { resolveAaveOraclePrices, aaveOraclePriceOf } from "@/lib/sources/chain/aave-oracle-prices";
import { AAVE_V3_ORACLE } from "@/lib/aave-v3/asset-catalog";

// On-chain oracle USD for arbitrary V3 reserve addresses — IAaveOracle
// getAssetPrice at the live head, one batched multicall (the same oracle the
// listing transform prices its rows with). Exists for the detail page's
// lifetime-flow lines: the listing row's priceByAddress covers only the
// reserves the account still holds, so exited/liquidated reserves arrive
// unpriced and the economics tower degrades to the gated token list. An asset
// the oracle can't price is simply absent from the response — callers keep
// treating it as unpriced (never assert a partial total). Node runtime, no
// edge caching.

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
    const map = await resolveAaveOraclePrices([{ oracle: AAVE_V3_ORACLE, assets }]);
    const prices: Record<string, number> = {};
    for (const a of assets) {
      const p = aaveOraclePriceOf(map, AAVE_V3_ORACLE, a);
      if (p != null && p > 0) prices[a] = p;
    }
    return NextResponse.json({ prices });
  } catch (error) {
    console.error("Error reading Aave V3 oracle prices:", error);
    return NextResponse.json({ prices: {} });
  }
}
