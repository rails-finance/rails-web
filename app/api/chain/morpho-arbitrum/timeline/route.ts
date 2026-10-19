import { NextRequest, NextResponse } from "next/server";
import { timelineCacheHeaders } from "@/lib/shared/decimals-unread";
import { loadMorphoArbitrumTimeline } from "@/lib/sources/api/morpho-arbitrum-timeline";
import { MORPHO_ARBITRUM_CHAIN_ID } from "@/lib/morpho-arbitrum/asset-catalog";
import { toGroupedTimelineWire } from "@/lib/shared/timeline-wire";
import { readerIpFromRequest } from "@/lib/api/reader-ip";

// A wallet's history on Morpho Blue Arbitrum: one read of rails-server's store
// (lib/sources/api/morpho-arbitrum-timeline), replayed per market into the
// shared cards. There is no sweep to fall back to on this chain, so a store
// that does not answer is a 503 the page states as "history not read", never
// an empty life. The answer carries `coverage` with the store's confirmation.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The validator moves the confirmation on: a minute fresh, then revalidated. */
const CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300";

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet))
    return NextResponse.json({ error: "wallet must be an address" }, { status: 400 });
  try {
    const data = await loadMorphoArbitrumTimeline(wallet, readerIpFromRequest(request));
    if (!data)
      return NextResponse.json({ error: "The history store did not answer", unavailable: true }, { status: 503 });
    const unread = data.positions.some((p) => p.loanDecimalsUnread || p.collateralDecimalsUnread);
    return NextResponse.json(toGroupedTimelineWire(data, MORPHO_ARBITRUM_CHAIN_ID), {
      headers: timelineCacheHeaders(
        data.positions.flatMap((p) => p.events),
        { "Cache-Control": CACHE_CONTROL },
        unread,
      ),
    });
  } catch (error) {
    console.error("Error reading Morpho Blue Arbitrum history:", error);
    return NextResponse.json({ error: "The history store did not answer", unavailable: true }, { status: 503 });
  }
}
