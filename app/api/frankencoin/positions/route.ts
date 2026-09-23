import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { buildFrankencoinPositionRows, type RawFrankencoinPositionRow } from "@/lib/sources/api/frankencoin-positions";

// api arm of the Frankencoin position listing — the LIVE rails-server index.
// rails-server does the structural filter/sort/paginate over the reduced
// per-position state at the POSITION grain (the Position contract address is
// the key; `owner` filters by the replayed, transfer-honored owner) and
// returns the page slice as raw rows ({ rows, total, limit, offset } — the
// compound-v2/dolomite route pair's envelope); presentation (scaling by the
// row's own per-token decimals, the two-axis status) happens in
// buildFrankencoinPositionRows. Native units only — no USD is added here or
// anywhere downstream. Returns the { success, data, pagination } envelope.
// Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

interface PositionsRawResponse {
  rows: RawFrankencoinPositionRow[];
  total: number;
  limit: number;
  offset: number;
}

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ success: false, error: "Server configuration error" }, { status: 500 });
  }

  const sp = request.nextUrl.searchParams;
  try {
    const qs = new URLSearchParams();
    if (sp.get("position")) qs.set("position", sp.get("position")!);
    if (sp.get("owner")) qs.set("owner", sp.get("owner")!);
    if (sp.get("status")) qs.set("status", sp.get("status")!);
    if (sp.get("hub")) qs.set("hub", sp.get("hub")!);
    if (sp.get("everChallenged")) qs.set("everChallenged", sp.get("everChallenged")!);
    if (sp.get("challengeSucceeded")) qs.set("challengeSucceeded", sp.get("challengeSucceeded")!);
    // Allowlist, like sortOrder: an unrecognised value is dropped rather than
    // forwarded verbatim, so rails-server's own default (recent) decides it.
    const sortBy = sp.get("sortBy");
    if (sortBy === "debt" || sortBy === "coll") qs.set("sortBy", sortBy);
    qs.set("sortOrder", sp.get("sortOrder") === "asc" ? "asc" : "desc");
    if (sp.get("limit") != null) qs.set("limit", sp.get("limit")!);
    if (sp.get("offset") != null) qs.set("offset", sp.get("offset")!);

    const url = `${RAILS_API_URL}/api/frankencoin/positions?${qs.toString()}`;
    const response = await fetch(url, createAuthFetchOptions({ signal: request.signal }, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { success: false, error: `Backend error: ${response.statusText}` },
        { status: response.status },
      );
    }
    const raw = (await response.json()) as PositionsRawResponse;
    const data = buildFrankencoinPositionRows(raw.rows);
    return NextResponse.json(
      {
        success: true,
        data,
        pagination: { total: raw.total, limit: raw.limit, offset: raw.offset },
      },
      { headers: proxyCacheControl(response, LISTING_CACHE_CONTROL) },
    );
  } catch (error) {
    console.error("Error fetching frankencoin positions from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch positions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
