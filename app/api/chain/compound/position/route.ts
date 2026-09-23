import { NextRequest, NextResponse } from "next/server";
import { loadCompoundPositionFromChain } from "@/lib/sources/chain/compound-position";
import { COMPOUND_MARKETS } from "@/lib/compound/asset-catalog";

// Chain arm of the Compound V3 position read — the exact live-head detail for
// ONE (market, account). Comet positions are per market, so this needs
// `?wallet=` AND `?market=` (usdc | weth | usdt); the detail page issues one
// fetch per market the wallet holds. The loader enumerates the market's own
// asset roster on-chain (getAssetInfo), so no curated collateral list is
// needed. Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const wallet = sp.get("wallet");
  const market = sp.get("market");
  if (!wallet) return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  if (!market || !COMPOUND_MARKETS[market])
    return NextResponse.json({ error: "market must be one of usdc | weth | usdt" }, { status: 400 });
  try {
    const data = await loadCompoundPositionFromChain(wallet, market);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error loading Compound V3 position from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load chain position";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
