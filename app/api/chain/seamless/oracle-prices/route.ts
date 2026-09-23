import { NextRequest, NextResponse } from "next/server";
import { resolveAaveOraclePrices, aaveOraclePriceOf } from "@/lib/sources/chain/aave-oracle-prices";
import { SEAMLESS_CHAIN_ID, SEAMLESS_ORACLE } from "@/lib/seamless/asset-catalog";

// On-chain USD for arbitrary Seamless reserve addresses — this market's OWN
// IAaveOracle at the head, one batched multicall. Its own, not Aave's: the two
// markets price through different oracle deployments, and the economics tower
// values lifetime flows on reserves a wallet has fully exited, which nothing
// else on the page prices. An asset the oracle can't price is simply absent —
// the tower treats an absent price as unpriced and degrades the whole panel to
// the token-only list rather than assert a partial USD total.
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
    const map = await resolveAaveOraclePrices([{ oracle: SEAMLESS_ORACLE, assets }], SEAMLESS_CHAIN_ID);
    const prices: Record<string, number> = {};
    for (const a of assets) {
      const p = aaveOraclePriceOf(map, SEAMLESS_ORACLE, a);
      if (p != null && p > 0) prices[a] = p;
    }
    return NextResponse.json({ prices });
  } catch (error) {
    console.error("Error reading Seamless oracle prices:", error);
    return NextResponse.json({ prices: {} });
  }
}
