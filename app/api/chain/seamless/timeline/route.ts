import { NextRequest, NextResponse } from "next/server";
import { loadAaveV3EventsFromChain } from "@/lib/sources/chain/aave-v3-events";
import { loadAaveV3EventsFromIndex } from "@/lib/sources/api/aave-v3-base-timeline";
import { SEAMLESS_CHAIN_ID, SEAMLESS_POOL, SEAMLESS_DEPLOY_BLOCK } from "@/lib/seamless/asset-catalog";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { readerIpFromRequest } from "@/lib/api/reader-ip";

// A wallet's whole life on Seamless: from the INDEX when the index can vouch
// for all of it, swept from the Pool's own logs otherwise.
//
// The Sieve indexer captures the Pool's events and the aTokens' transfers, and
// rails-server's /api/seamless/timeline hands a wallet's rows over decoded
// (lib/sources/api/aave-v3-base-timeline). That is the Ethereum shape — an
// index behind the page, no chain read per visit — and it is used whenever
// the index's coverage says the history is whole: backfill at the Sieve
// checkpoint, transfers captured. Until then, or if the API is down, the
// live sweep (lib/sources/chain/aave-v3-events) runs exactly as before: the
// sweep IS the capture, from the Pool's first block to the head, on every
// request. Whichever answered, the response names it in `coverage.source`
// and always carries `coverage` — a timeline drawn over a partial record
// looks exactly like a complete one, so the page renders the verdict.

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
    const indexed = await loadAaveV3EventsFromIndex(
      {
        wallet,
        chainId: SEAMLESS_CHAIN_ID,
        apiPrefix: "/api/seamless",
        deployBlock: SEAMLESS_DEPLOY_BLOCK,
      },
      readerIp,
    ).catch((e: unknown) => {
      // The index being unreachable is a reason to sweep, not to fail.
      console.error("Seamless index read failed, sweeping instead:", e);
      return null;
    });
    // A HEAVY wallet is not whole and is still the answer to serve: the index
    // sends its newest rows from a stated horizon, where the sweep would read
    // hundreds of thousands of logs to reach a shallower one. The response
    // carries the horizon either way and the page renders the verdict.
    if (indexed?.whole || indexed?.heavy) {
      if (indexed.heavy) console.warn(`Seamless index answered a heavy wallet ${wallet} (${indexed.reason})`);
      return NextResponse.json(toTimelineWire(indexed.result, SEAMLESS_CHAIN_ID), {
        headers: { "Cache-Control": CACHE_CONTROL },
      });
    }
    if (indexed) console.warn(`Seamless index not whole for ${wallet} (${indexed.reason}) — sweeping`);

    const data = await loadAaveV3EventsFromChain({
      wallet,
      pool: SEAMLESS_POOL,
      chainId: SEAMLESS_CHAIN_ID,
      deployBlock: SEAMLESS_DEPLOY_BLOCK,
      // An answer that was not whole still named the plumbing flag; the sweep
      // honours it as the index replay would have (rails-ops decision 0024).
      peakWithheld: indexed?.peakWithheld ?? false,
    });
    return NextResponse.json(toTimelineWire(data, SEAMLESS_CHAIN_ID), { headers: { "Cache-Control": CACHE_CONTROL } });
  } catch (error) {
    // An unconfigured endpoint is not an empty history, and the page says which.
    console.error("Error reading Seamless history:", error);
    const message = error instanceof Error ? error.message : "Failed to read the history";
    return NextResponse.json({ error: message, unavailable: true }, { status: 503 });
  }
}
