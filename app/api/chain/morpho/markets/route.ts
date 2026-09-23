import { NextResponse } from "next/server";
import { loadMorphoMarketsFromChain } from "@/lib/sources/chain/morpho-markets";

// Chain arm of the Morpho Blue market roster — every market's live state at one head block,
// keyed off the generated census in lib/morpho/market-catalog.ts (Blue exposes no enumeration
// of its own). The SSR page calls the loader directly and never comes through here; this
// exists for the client retry lane, the same posture as the other chain-lane views. Node
// runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await loadMorphoMarketsFromChain();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error loading Morpho markets from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load chain markets";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
