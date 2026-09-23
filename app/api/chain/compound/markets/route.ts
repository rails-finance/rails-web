import { NextResponse } from "next/server";
import { loadCompoundV3Markets } from "@/lib/sources/chain/compound-markets";

// Chain arm of the Compound V3 protocol view — each Comet market's own state
// (utilisation, rates at that utilisation, kinks, reserves vs target, and the
// collateral roster with supply caps), read at one head block. The SSR page
// calls the loader directly; this route is the client retry lane.
// Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await loadCompoundV3Markets());
  } catch (error) {
    console.error("Error loading Compound V3 markets from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load markets";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
