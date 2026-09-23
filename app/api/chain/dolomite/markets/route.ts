import { NextResponse } from "next/server";
import { loadDolomiteMarkets } from "@/lib/sources/chain/dolomite-markets";

// Chain arm of the Dolomite protocol view — every market the core lists
// (getNumMarkets → getMarketTokenAddress, never a hardcoded roster), its
// totals off par × the current index, the core's own oracle price, and the
// multiplicative risk ladder, read at one head block. The SSR page calls the
// loader directly; this route is the client retry lane.
// Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await loadDolomiteMarkets());
  } catch (error) {
    console.error("Error loading Dolomite markets from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load markets";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
