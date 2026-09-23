import { NextResponse } from "next/server";
import { loadMoonwellMarkets } from "@/lib/sources/chain/moonwell-market-state";
import { MOONWELL_BASE_DEPLOYMENT } from "@/lib/moonwell-base/asset-catalog";

// Chain arm of the Moonwell Base protocol view — every market the Base
// Comptroller lists, with its totals, its collateral factor and caps, its rate
// model and the oracle price the Comptroller itself would use, read at one head
// block. The SSR page calls the loader directly; this route is the client retry
// path. Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await loadMoonwellMarkets(MOONWELL_BASE_DEPLOYMENT));
  } catch (error) {
    console.error("Error loading Moonwell Base markets from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load markets";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
