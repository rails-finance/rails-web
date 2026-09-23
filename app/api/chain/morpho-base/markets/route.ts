import { NextResponse } from "next/server";
import { loadMorphoMarketsFromChain } from "@/lib/sources/chain/morpho-markets";
import { MORPHO_BASE_DEPLOYMENT } from "@/lib/sources/chain/morpho-deployments";

// Chain arm of the Morpho Blue Base protocol view — every one of the 4,306
// markets the CreateMarket census found, with its stored totals, its one rung
// and its own rate model, read at one block. The SSR page calls the reader
// directly; this route is the client retry path.
//
// The same reader serves Ethereum at /api/chain/morpho/markets. What differs is
// the roster, which is the one thing Blue will not state about itself — see
// morpho-deployments.ts. Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await loadMorphoMarketsFromChain(MORPHO_BASE_DEPLOYMENT));
  } catch (error) {
    console.error("Error loading Morpho Base markets from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load markets";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
