import { NextRequest, NextResponse } from "next/server";
import { loadMorphoPositionFromChain } from "@/lib/sources/chain/morpho-position";

// Chain arm of the Morpho Blue position read — the exact live-head detail for
// one (market, user). Both coordinates are required: Morpho positions live in
// the singleton keyed by the market id (keccak of the params tuple) plus the
// owner. The loader accrues interest in view and replicates the internal
// _isHealthy check (verified by scripts/verify-morpho-chain.mjs). Node
// runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MARKET_ID = /^(0x)?[0-9a-fA-F]{64}$/;

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const market = sp.get("market");
  const user = sp.get("user");
  if (!market || !user) return NextResponse.json({ error: "market and user are required" }, { status: 400 });
  if (!MARKET_ID.test(market)) return NextResponse.json({ error: "market must be a 32-byte hex id" }, { status: 400 });
  try {
    const data = await loadMorphoPositionFromChain(market, user);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error loading Morpho position from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load chain position";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
