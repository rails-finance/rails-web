import { NextRequest, NextResponse } from "next/server";
import { loadMorphoMarketAtBlock } from "@/lib/sources/chain/morpho-position";
import { MORPHO_DEPLOYMENT, MORPHO_BASE_DEPLOYMENT } from "@/lib/sources/chain/morpho-deployments";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";

// A Morpho Blue market around one event: the market oracle's price and the
// IRM's borrow rate at the end of block N − 1 and of block N. The event card
// reads it to state the health factor before and after the event and the rate
// in force; a liquidation reads it for the price it ran on. A past block's
// answer never changes, so it is cached hard. Node runtime.

export const runtime = "nodejs";

const MARKET_ID = /^(0x)?[0-9a-fA-F]{64}$/;

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const market = sp.get("market");
  const block = Number(sp.get("block"));
  const chain = Number(sp.get("chain") ?? "1");
  if (!market || !MARKET_ID.test(market))
    return NextResponse.json({ error: "market must be a 32-byte hex id" }, { status: 400 });
  if (!Number.isInteger(block) || block <= 1)
    return NextResponse.json({ error: "block must be a block number" }, { status: 400 });
  const deployment = chain === BASE_CHAIN_ID ? MORPHO_BASE_DEPLOYMENT : MORPHO_DEPLOYMENT;
  try {
    const data = await loadMorphoMarketAtBlock(market, block, deployment);
    return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" } });
  } catch (error) {
    console.error("Error reading Morpho market at block:", error);
    return NextResponse.json({ error: "Failed to read the market at that block" }, { status: 502 });
  }
}
