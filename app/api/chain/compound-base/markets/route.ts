import { NextResponse } from "next/server";
import { loadCompoundV3Markets } from "@/lib/sources/chain/compound-markets";
import { COMPOUND_BASE_DEPLOYMENT } from "@/lib/compound-base/asset-catalog";

// Each Base Comet's own state at one head block — the same reader the Ethereum
// route uses, pointed at the five markets Compound governance deployed on Base.
//
// Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await loadCompoundV3Markets(COMPOUND_BASE_DEPLOYMENT));
  } catch (error) {
    console.error("Error loading Compound V3 Base markets from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load the markets";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
