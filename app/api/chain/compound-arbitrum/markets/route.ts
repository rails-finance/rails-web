import { NextResponse } from "next/server";
import { loadCompoundV3Markets } from "@/lib/sources/chain/compound-markets";
import { COMPOUND_ARBITRUM_DEPLOYMENT } from "@/lib/compound-arbitrum/asset-catalog";

// Each Arbitrum Comet's own state at one head block — the reader the Ethereum
// and Base routes use, pointed at the four Comets on Arbitrum.
//
// Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await loadCompoundV3Markets(COMPOUND_ARBITRUM_DEPLOYMENT));
  } catch (error) {
    console.error("Error loading Compound V3 Arbitrum markets from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load the markets";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
