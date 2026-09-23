import { NextRequest, NextResponse } from "next/server";
import { loadMoonwellEventsFromChain } from "@/lib/sources/chain/moonwell-events";
import { loadMoonwellEventsFromIndex } from "@/lib/sources/api/moonwell-base-timeline";
import {
  MOONWELL_BASE_DEPLOYMENT,
  MOONWELL_BASE_DEPLOY_BLOCK,
  MOONWELL_BASE_REWARD_DISTRIBUTOR,
  MOONWELL_BASE_WETH_ROUTER,
} from "@/lib/moonwell-base/asset-catalog";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { groupedTimelineBody, readGroupedMoonwellBase } from "@/lib/moonwell-base/timeline-folders";

// A wallet's whole life on Moonwell Base: from the INDEX when the index can
// vouch for all of it, swept from the chain's own logs otherwise.
//
// The Sieve indexer captures every mToken's six events, and rails-server's
// /api/moonwell-base/timeline hands a wallet's rows over attributed
// (lib/sources/api/moonwell-base-timeline). That is the Ethereum shape — an
// index behind the page, no chain read per visit — and it is used whenever
// the index's coverage says the history is whole: backfill at the Sieve
// checkpoint, nothing cut. Until then, or if the API is down, the live sweep
// (lib/sources/chain/moonwell-events) runs exactly as before: it anchors on
// the reward distributor and expands each anchored transaction, from the
// Comptroller's deployment block to the head, on every request — the reader's
// header carries the reasoning and the measurements. Whichever answered, the
// response names it in `coverage.source` and always carries `coverage` — a
// timeline drawn over a partial record looks exactly like a complete one, and
// the sweep has one more way to be partial than the Aave one (a capped
// expansion, stated as a horizon), so the page renders the verdict.

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
    // `?group=1` — THE SAME HISTORY AS ROWS (leg C of the `0019` programme).
    // Every row is replayed first and the events it produced are grouped after,
    // so a folder is a transform over a finished answer; the reasoning is in
    // lib/moonwell-base/timeline-folders.ts. Only the index can be grouped: a
    // history the index cannot vouch for falls through to the flat answer
    // below, which sweeps, and the page reads a flat answer as flat.
    if (request.nextUrl.searchParams.get("group") === "1") {
      const read = await readGroupedMoonwellBase(
        {
          wallet,
          deployment: MOONWELL_BASE_DEPLOYMENT,
          deployBlock: MOONWELL_BASE_DEPLOY_BLOCK,
          router: MOONWELL_BASE_WETH_ROUTER,
          apiPrefix: "/api/moonwell-base",
        },
        readerIp,
      ).catch((e: unknown) => {
        console.error("Moonwell Base grouped read failed, answering flat instead:", e);
        return null;
      });
      if (read?.kind === "grouped") {
        return NextResponse.json(toTimelineWire(groupedTimelineBody(read.answer), BASE_CHAIN_ID), {
          headers: { "Cache-Control": CACHE_CONTROL },
        });
      }
    }

    const indexed = await loadMoonwellEventsFromIndex(
      {
        wallet,
        deployment: MOONWELL_BASE_DEPLOYMENT,
        deployBlock: MOONWELL_BASE_DEPLOY_BLOCK,
        router: MOONWELL_BASE_WETH_ROUTER,
        apiPrefix: "/api/moonwell-base",
      },
      readerIp,
    ).catch((e: unknown) => {
      // The index being unreachable is a reason to sweep, not to fail.
      console.error("Moonwell Base index read failed, sweeping instead:", e);
      return null;
    });
    // A HEAVY wallet is not whole and is still the answer to serve: the index
    // sends its newest rows from a stated horizon, where the sweep would spend
    // half a minute of chain reads to reach a shallower one. The response
    // carries the horizon either way and the page renders the verdict.
    if (indexed?.whole || indexed?.heavy) {
      if (indexed.heavy) console.warn(`Moonwell Base index answered a heavy wallet ${wallet} (${indexed.reason})`);
      return NextResponse.json(toTimelineWire(indexed.result, BASE_CHAIN_ID), {
        headers: { "Cache-Control": CACHE_CONTROL },
      });
    }
    if (indexed) console.warn(`Moonwell Base index not whole for ${wallet} (${indexed.reason}) — sweeping`);

    const data = await loadMoonwellEventsFromChain({
      wallet,
      deployment: MOONWELL_BASE_DEPLOYMENT,
      deployBlock: MOONWELL_BASE_DEPLOY_BLOCK,
      rewardDistributor: MOONWELL_BASE_REWARD_DISTRIBUTOR,
      router: MOONWELL_BASE_WETH_ROUTER,
      // An answer that was not whole still named the plumbing flag; the sweep
      // honours it as the index replay would have (rails-ops decision 0024).
      peakWithheld: indexed?.peakWithheld ?? false,
    });
    return NextResponse.json(toTimelineWire(data, BASE_CHAIN_ID), { headers: { "Cache-Control": CACHE_CONTROL } });
  } catch (error) {
    // An unconfigured endpoint is not an empty history, and the page says which.
    console.error("Error reading Moonwell Base history:", error);
    const message = error instanceof Error ? error.message : "Failed to read the history";
    return NextResponse.json({ error: message, unavailable: true }, { status: 503 });
  }
}
