import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { buildSparkTimeline, type MvRow } from "@/lib/sources/api/spark-timeline";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { resolveErc20Meta } from "@/lib/sources/chain/erc20-meta";
import { toServedFolder, type UpstreamFolderMembers } from "@/lib/sources/api/timeline-folder-wire";

// Opening one SparkLend folder — the members behind a header on
// `/timeline?group=1`.
// ----------------------------------------------------------------------------
// A folder row carries its members' aggregate and never its members
// (decision 0019, evening amendment, rule 2), so this is where the members
// come from. The read may be genuinely slow and that is by design (rule 3):
// folders are computed on demand and cached on the position's tip, never
// materialised, and the header has already answered the question — so an open
// is an audit, and an audit can wait.
//
// TWO KEYS, ONE DURABLE. `?event=` is the primary form: an event key is a
// chain coordinate, and a permalink carries it. `?folder=` is the convenience
// form, valid only within the answer that issued the id — this index gap-fills
// BACKWARDS, so a boundary-derived id cannot be persisted (see
// lib/shared/timeline-folder.ts's header). Exactly one of the two.
//
// A REFUSAL IS A SENTENCE, NOT AN EMPTY LIST. rails-server names four
// (`UNKNOWN_FOLDER`, `NOT_IN_A_FOLDER`, `BELOW_THE_WINDOW`, `NO_EVENTS`), each
// a different fact, and they are passed through with their code intact — an
// empty list would read as "this folder holds nothing", which is never true.
//
// Members come back in the same `spark_events_served` row shape `/timeline` serves,
// so `buildSparkTimeline` is reused verbatim and no second mapping exists.
// Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  const event = request.nextUrl.searchParams.get("event");
  const folderId = request.nextUrl.searchParams.get("folder");
  // Both keys upstream is an explicit 400 there ("two keys can name two
  // different folders"); neither is one too. Passed through rather than
  // second-guessed, the same rule the `recent` parameter follows next door.

  try {
    const qs = new URLSearchParams({ wallet });
    if (event) qs.set("event", event);
    if (folderId) qs.set("folder", folderId);
    const url = `${RAILS_API_URL}/api/spark/timeline/folder?${qs.toString()}`;
    const response = await fetch(url, createAuthFetchOptions(undefined, readerIp));
    if (!response.ok) {
      // The refusal's own code and sentence are the answer — see the header.
      const body = (await response.json().catch(() => null)) as { code?: string; message?: string } | null;
      return NextResponse.json(
        { error: "Not found", code: body?.code ?? "UNKNOWN_FOLDER", message: body?.message ?? response.statusText },
        { status: response.status },
      );
    }
    const upstream = (await response.json()) as UpstreamFolderMembers<MvRow>;
    const legAddresses = upstream.folder.legs
      .filter((leg) => leg.assetKeyKind === "tokenAddress" && leg.asset)
      .map((leg) => leg.asset.toLowerCase());
    const [data, legMetas] = await Promise.all([
      buildSparkTimeline(upstream.rows, wallet),
      resolveErc20Meta(legAddresses),
    ]);
    const folder = toServedFolder(upstream.folder, {
      symbol: (key: string) => legMetas.get(key)?.symbol,
      decimals: (key: string) => legMetas.get(key)?.decimals,
    });
    return NextResponse.json(toTimelineWire({ ...data, folder }, MAINNET_CHAIN_ID), {
      headers: proxyCacheControl(response, LISTING_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Error opening spark timeline folder:", error);
    const message = error instanceof Error ? error.message : "Failed to open folder";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
