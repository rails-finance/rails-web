import { NextResponse } from "next/server";
import { loadCompoundV2Markets } from "@/lib/sources/chain/compound-v2-markets";

// Chain arm of the Compound V2 protocol view — every market the Comptroller lists,
// with its totals, its collateral factor, its rate model and the oracle price
// the Comptroller itself would use, read at one head block. The SSR page calls
// the loader directly; this route is the client retry lane.
// Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await loadCompoundV2Markets());
  } catch (error) {
    console.error("Error loading Compound V2 markets from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load markets";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
