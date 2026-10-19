import { NextResponse } from "next/server";
import { loadMorphoArbitrumMarkets } from "@/lib/sources/chain/morpho-arbitrum-markets";

// The Morpho Blue Arbitrum protocol page's markets table: the census's
// markets read at one pinned block, ranked where the loan token converts to
// dollars (lib/sources/chain/morpho-arbitrum-markets.ts).
//
// Node runtime; a minute fresh at the edge.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await loadMorphoArbitrumMarkets(), {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    console.error("Error reading Morpho Arbitrum markets:", error);
    const message = error instanceof Error ? error.message : "Failed to read the markets";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
