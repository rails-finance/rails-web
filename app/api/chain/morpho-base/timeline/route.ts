import { NextRequest, NextResponse } from "next/server";
import { loadMorphoEventsFromChain } from "@/lib/sources/chain/morpho-blue-events";
import { loadMorphoEventsFromIndex } from "@/lib/sources/api/morpho-base-timeline";
import { MORPHO_BASE_DEPLOYMENT } from "@/lib/sources/chain/morpho-deployments";
import { MORPHO_BASE_DEPLOY_BLOCK } from "@/lib/morpho-base/asset-catalog";
import { toGroupedTimelineWire } from "@/lib/shared/timeline-wire";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";
import { readerIpFromRequest } from "@/lib/api/reader-ip";

// A wallet's whole life on Morpho Blue Base: from the INDEX when the index
// can vouch for all of it, swept from the singleton's own logs otherwise.
//
// The Sieve indexer captures the singleton's events, and rails-server's
// /api/morpho-base/timeline hands a wallet's rows over raw
// (lib/sources/api/morpho-base-timeline). That is the Ethereum shape — an
// index behind the page, no chain read per visit — and it is used whenever
// the index's coverage says the history is whole: backfill at the Sieve
// checkpoint, the lender side captured, the read not cut. Until then, or if
// the API is down, the live sweep (lib/sources/chain/morpho-blue-events) runs
// exactly as before: the sweep IS the capture, from the singleton's first
// block to the head, on every request. Whichever answered, the response
// names it in `coverage.source` and always carries `coverage` — a timeline
// drawn over a partial record looks exactly like a complete one, so the page
// renders the verdict. Both are replayed per market by the one replay.
//
// Node runtime — the readers are server-only (RPC endpoints live in env).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The sweep is expensive; the index read is not, but a wallet's history is
 *  append-only either way. A minute fresh, then stale-while-revalidate. */
const CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=600";

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet))
    return NextResponse.json({ error: "wallet must be an address" }, { status: 400 });

  try {
    const indexed = await loadMorphoEventsFromIndex(
      {
        wallet,
        deployment: MORPHO_BASE_DEPLOYMENT,
        deployBlock: MORPHO_BASE_DEPLOY_BLOCK,
      },
      readerIp,
    ).catch((e: unknown) => {
      // The index being unreachable is a reason to sweep, not to fail.
      console.error("Morpho Blue Base index read failed, sweeping instead:", e);
      return null;
    });
    if (indexed?.whole)
      return NextResponse.json(toGroupedTimelineWire(indexed.result, BASE_CHAIN_ID), {
        headers: { "Cache-Control": CACHE_CONTROL },
      });
    if (indexed) console.warn(`Morpho Blue Base index not whole for ${wallet} (${indexed.reason}) — sweeping`);

    const data = await loadMorphoEventsFromChain({
      wallet,
      deployment: MORPHO_BASE_DEPLOYMENT,
      deployBlock: MORPHO_BASE_DEPLOY_BLOCK,
    });
    return NextResponse.json(toGroupedTimelineWire(data, BASE_CHAIN_ID), {
      headers: { "Cache-Control": CACHE_CONTROL },
    });
  } catch (error) {
    // Distinguished on purpose: an unconfigured endpoint is not an empty
    // history, and the page says which one it is looking at.
    console.error("Error reading Morpho Blue Base history:", error);
    const message = error instanceof Error ? error.message : "Failed to read the history";
    return NextResponse.json({ error: message, unavailable: true }, { status: 503 });
  }
}
