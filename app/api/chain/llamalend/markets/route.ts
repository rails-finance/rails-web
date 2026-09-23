import { NextResponse } from "next/server";
import { loadLlamalendMarkets } from "@/lib/sources/chain/llamalend-markets";

// Chain arm of the LlamaLend protocol view — every market the three factories
// list (market_count() / n_collaterals() / the V2 struct enumeration, never a
// hardcoded roster), version-tagged, with A, discounts, the live rate from
// each market's own monetary policy, utilisation and the AMM's own oracle,
// read at one head block. The SSR page calls the loader directly; this route
// is the client retry lane. Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await loadLlamalendMarkets());
  } catch (error) {
    console.error("Error loading LlamaLend markets from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load markets";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
