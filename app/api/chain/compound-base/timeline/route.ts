import { NextRequest, NextResponse } from "next/server";
import { loadCometEventsFromChain } from "@/lib/sources/chain/compound-v3-events";
import { loadCometEventsFromIndex } from "@/lib/sources/api/compound-base-timeline";
import { COMPOUND_BASE_DEPLOYMENT, COMPOUND_BASE_DEPLOY_BLOCK } from "@/lib/compound-base/asset-catalog";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";
import { readerIpFromRequest } from "@/lib/api/reader-ip";

// A wallet's whole life on Compound V3 Base: from the INDEX when the index
// can vouch for all of it, swept from the five Comets' own logs otherwise.
//
// The Sieve indexer captures every Comet event, and rails-server's
// /api/compound-base/timeline hands a wallet's rows over raw
// (lib/sources/api/compound-base-timeline). That is the Ethereum shape — an
// index behind the page, no chain read per visit — and it is used whenever
// the index's coverage says the history is whole: the five Comets' backfill
// at the Sieve checkpoint. Until then, or if the API is down, the live sweep
// (lib/sources/chain/compound-v3-events) runs exactly as before: the sweep IS
// the capture, from the earliest Comet's first block to the head, across
// every market in the roster, on every request. Whichever answered, the
// response names it in `coverage.source` and always carries `coverage` — a
// timeline drawn over a partial record looks exactly like a complete one, so
// the page renders the verdict.
//
// 503 with `unavailable: true` when neither could run (no history endpoint
// configured, or an RPC that refused everything) — deliberately distinct from
// an empty history, which is a 200 with no events.

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
    const indexed = await loadCometEventsFromIndex(
      {
        wallet,
        deployment: COMPOUND_BASE_DEPLOYMENT,
        apiPrefix: "/api/compound-base",
        deployBlock: COMPOUND_BASE_DEPLOY_BLOCK,
      },
      readerIp,
    ).catch((e: unknown) => {
      // The index being unreachable is a reason to sweep, not to fail.
      console.error("Compound V3 Base index read failed, sweeping instead:", e);
      return null;
    });
    // A HEAVY wallet is the answer to serve either way: whole when the index
    // sent its newest rows plus the seeds the rest travels as, a stated
    // horizon when it sent the rows alone — where the sweep would read the
    // five Comets' whole logs to reach a shallower one. The response carries
    // the verdict in its coverage and the page renders it.
    if (indexed?.whole || indexed?.heavy) {
      if (indexed.heavy && !indexed.whole)
        console.warn(`Compound V3 Base index answered a heavy wallet ${wallet} (${indexed.reason})`);
      return NextResponse.json(toTimelineWire(indexed.result, BASE_CHAIN_ID), {
        headers: { "Cache-Control": CACHE_CONTROL },
      });
    }
    if (indexed) console.warn(`Compound V3 Base index not whole for ${wallet} (${indexed.reason}) — sweeping`);

    const data = await loadCometEventsFromChain({
      wallet,
      deployment: COMPOUND_BASE_DEPLOYMENT,
      deployBlock: COMPOUND_BASE_DEPLOY_BLOCK,
      // An answer that was not whole still named the flagged markets; the
      // sweep honours them as the index replay would have (rails-ops decision
      // 0024).
      peakWithheldMarkets: indexed?.peakWithheldMarkets ?? [],
    });
    return NextResponse.json(toTimelineWire(data, BASE_CHAIN_ID), { headers: { "Cache-Control": CACHE_CONTROL } });
  } catch (error) {
    // An unconfigured endpoint is not an empty history, and the page says which.
    console.error("Error reading Compound V3 Base history:", error);
    const message = error instanceof Error ? error.message : "Failed to read the history";
    return NextResponse.json({ error: message, unavailable: true }, { status: 503 });
  }
}
