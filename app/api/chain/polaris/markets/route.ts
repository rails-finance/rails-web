import { NextResponse } from "next/server";
import { loadPolarisMarketsFromChain } from "@/lib/sources/chain/polaris-position";
import { CHAIN_MARKET_CACHE_CONTROL } from "@/lib/api/proxy-cache";

// Chain arm of the Polaris market board — both markets' own state at one head
// block (totals, the rate in force, mode, reserve ratio, the two MCRs, the
// stability pool's depth and P, the price legs). The markets page reads the
// same loader directly; this route is the JSON face of that read.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await loadPolarisMarketsFromChain();
    return NextResponse.json(data, { headers: { "Cache-Control": CHAIN_MARKET_CACHE_CONTROL } });
  } catch (error) {
    console.error("Error loading Polaris markets from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load chain markets";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
