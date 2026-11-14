import { NextResponse } from "next/server";
import { loadMorphoMarketsFromChain } from "@/lib/sources/chain/morpho-markets";
import { MORPHO_ARBITRUM_DEPLOYMENT } from "@/lib/sources/chain/morpho-deployments";
import { publicErrorMessage } from "@/lib/api/public-error";

// Chain arm of the Morpho Blue Arbitrum markets roster: the census's markets
// with their stored totals, LLTVs and rates, read at the head by the reader
// Ethereum and Base share (lib/sources/chain/morpho-markets.ts). The SSR page
// calls the reader directly; this route is the client retry path.
//
// Node runtime; a minute fresh at the edge.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await loadMorphoMarketsFromChain(MORPHO_ARBITRUM_DEPLOYMENT), {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    console.error("Error reading Morpho Arbitrum markets:", error);
    const message = publicErrorMessage(error, "Failed to read the markets");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
