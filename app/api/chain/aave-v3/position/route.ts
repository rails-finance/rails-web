import { NextRequest, NextResponse } from "next/server";
import { loadAaveV3PositionFromChain } from "@/lib/sources/chain/aave-v3-position";
import { asV3Market, POOL_BY_MARKET } from "@/lib/aave-v3/asset-catalog";

// Chain arm of the Aave V3 position read — the exact live-head detail. V3 is one
// pooled account per (wallet, market) — each market a separate Pool — so this
// takes `?wallet=` + `?market=` (core | prime | etherfi, default core). The
// candidate reserve set is the Pool's own getReservesList (chain-derived), read
// straight from that market's Pool at the live head. Node runtime, no edge
// caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const wallet = sp.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  const market = asV3Market(sp.get("market"));
  try {
    const atBlock = undefined; // de-T: read the live chain head
    const data = await loadAaveV3PositionFromChain(wallet, POOL_BY_MARKET[market], atBlock);
    return NextResponse.json({ ...data, market });
  } catch (error) {
    console.error("Error loading Aave V3 position from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load chain position";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
