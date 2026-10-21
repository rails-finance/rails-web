import { NextRequest, NextResponse } from "next/server";
import { timelineCacheHeaders } from "@/lib/shared/decimals-unread";
import { loadMorphoArbitrumTimeline } from "@/lib/sources/api/morpho-arbitrum-timeline";
import { MORPHO_ARBITRUM_CHAIN_ID } from "@/lib/morpho-arbitrum/asset-catalog";
import { toGroupedTimelineWire } from "@/lib/shared/timeline-wire";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { ApiOverBudget, overBudgetResponse } from "@/lib/api/api-over-budget";
import { ChainTimelinePending } from "@/lib/api/fetch-chain-timeline";

// A wallet's history on Morpho Blue Arbitrum: one read of rails-server's store
// (lib/sources/api/morpho-arbitrum-timeline), replayed per market into the
// shared cards. There is no sweep to fall back to on this chain, so a store
// that does not answer is a 503 the page states as "history not read", never
// an empty life. The answer carries `coverage` with the store's confirmation.
// A wallet the store is still reading for the first time is a 202 the page
// asks again on (ChainTimelinePending).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** The reader waits up to 45 s for a first read of the store, and holds the
 *  request open after that while the store writes the body
 *  (lib/sources/api/arbitrum-store-read.ts). */
export const maxDuration = 240;

/** The validator moves the confirmation on: a confirmed answer is a minute
 *  fresh, then revalidated; any other is asked again by the page, uncached. */
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
        { "Cache-Control": data.coverage.confirmation?.status === "confirmed" ? CACHE_CONTROL : "no-store" },
        unread,
      ),
    });
  } catch (error) {
    // The reader is over the store's per-minute budget: a 429 the page waits
    // out, kept apart from the 503 of a store that is down.
    if (error instanceof ApiOverBudget) return overBudgetResponse(error);
    if (error instanceof ChainTimelinePending)
      return NextResponse.json({ pending: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
    console.error("Error reading Morpho Blue Arbitrum history:", error);
    return NextResponse.json({ error: "The history store did not answer", unavailable: true }, { status: 503 });
  }
}
