import { NextRequest, NextResponse } from "next/server";
import { resolveAaveOraclePrices, aaveOraclePriceOf } from "@/lib/sources/chain/aave-oracle-prices";
import { AAVE_V3_BASE_CHAIN_ID, AAVE_V3_BASE_ORACLE } from "@/lib/aave-v3-base/asset-catalog";

// On-chain USD for arbitrary Base reserve addresses — the Base Pool's OWN
// IAaveOracle at the head, one batched multicall. The Ethereum twin of this
// route exists for the same reason: the economics tower values lifetime flows,
// and a reserve the wallet has fully exited is priced by nothing else on the
// page. An asset the oracle can't price is simply absent from the response —
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
    const map = await resolveAaveOraclePrices([{ oracle: AAVE_V3_BASE_ORACLE, assets }], AAVE_V3_BASE_CHAIN_ID);
    const prices: Record<string, number> = {};
    for (const a of assets) {
      const p = aaveOraclePriceOf(map, AAVE_V3_BASE_ORACLE, a);
      if (p != null && p > 0) prices[a] = p;
    }
    return NextResponse.json({ prices });
  } catch (error) {
    console.error("Error reading Aave V3 Base oracle prices:", error);
    return NextResponse.json({ prices: {} });
  }
}
