import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { buildAaveV3Timeline, type MvRow } from "@/lib/sources/api/aave-v3-timeline";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { resolveErc20Meta } from "@/lib/sources/chain/erc20-meta";
import { toServedFolder, type UpstreamFolderMembers } from "@/lib/sources/api/timeline-folder-wire";

// Opening one Aave V3 folder — the members behind a header on
// `/timeline?group=1`. The SparkLend twin of this route carries the argument in
// full (app/api/spark/timeline/folder/route.ts); only the market axis differs,
// and it differs the same way it does on `/timeline`: a position is per
// (wallet, market), so the market rides every hop.
//
// A folder row carries its members' aggregate and never its members
// (decision 0019, evening amendment, rule 2). The read may be genuinely slow
// and that is by design (rule 3) — folders are computed on demand and cached
// on the position's tip, never materialised — because the header has already
// answered the question, so an open is an audit.
//
// TWO KEYS, ONE DURABLE: `?event=` is an event key, a chain coordinate, and is
// what a permalink carries; `?folder=` is the response-scoped convenience form.
// A refusal comes back as a stated code and sentence, never an empty list.
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
  const market = request.nextUrl.searchParams.get("market");
  const event = request.nextUrl.searchParams.get("event");
  const folderId = request.nextUrl.searchParams.get("folder");

  try {
    // `swaps=1` as on /timeline, so the folder is cut from the same grouping.
    const qs = new URLSearchParams({ wallet, swaps: "1" });
    if (market) qs.set("market", market);
    if (event) qs.set("event", event);
    if (folderId) qs.set("folder", folderId);
    const url = `${RAILS_API_URL}/api/aave-v3/timeline/folder?${qs.toString()}`;
    const response = await fetch(url, createAuthFetchOptions(undefined, readerIp));
    if (!response.ok) {
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
      buildAaveV3Timeline(upstream.rows, wallet),
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
    console.error("Error opening aave-v3 timeline folder:", error);
    const message = error instanceof Error ? error.message : "Failed to open folder";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
