import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { buildLlamalendPositionRows, type RawLlamalendPositionRow } from "@/lib/sources/api/llamalend-positions";

// api arm of the LlamaLend position listing — the LIVE rails-server index.
// rails-server does the structural filter/sort/paginate over
// mv_llamalend_positions at the (controller, user) grain and returns the page
// slice as raw per-position rows (the last emitted UserState absolutes +
// lifecycle scalars); we layer market identity (the factories' own roster)
// and the per-position soft-liq overlay (ONE multicall of user_state over the
// page's open rows — the converted amount lives in NO event, so only that
// read can carry it) in buildLlamalendPositionRows. Returns the
// { success, data, pagination } envelope. Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

interface PositionsRawResponse {
  rows: RawLlamalendPositionRow[];
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
    if (sp.get("user")) qs.set("user", sp.get("user")!);
    if (sp.get("controller")) qs.set("controller", sp.get("controller")!);
    if (sp.get("status")) qs.set("status", sp.get("status")!);
    if (sp.get("hasLiquidations")) qs.set("hasLiquidations", sp.get("hasLiquidations")!);
    // Allowlist, like sortOrder: an unrecognised value is dropped rather than
    // forwarded verbatim, so rails-server's own default (recent) decides it —
    // same "unrecognised ⇒ default, no error" stance the route takes throughout.
    const sortBy = sp.get("sortBy");
    if (sortBy === "debt" || sortBy === "coll") qs.set("sortBy", sortBy);
    qs.set("sortOrder", sp.get("sortOrder") === "asc" ? "asc" : "desc");
    if (sp.get("limit") != null) qs.set("limit", sp.get("limit")!);
    if (sp.get("offset") != null) qs.set("offset", sp.get("offset")!);

    const url = `${RAILS_API_URL}/api/llamalend/positions?${qs.toString()}`;
    const response = await fetch(url, createAuthFetchOptions({ signal: request.signal }, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { success: false, error: `Backend error: ${response.statusText}` },
        { status: response.status },
      );
    }
    const raw = (await response.json()) as PositionsRawResponse;
    const data = await buildLlamalendPositionRows(raw.rows);
    return NextResponse.json(
      {
        success: true,
        data,
        pagination: { total: raw.total, limit: raw.limit, offset: raw.offset },
      },
      { headers: proxyCacheControl(response, LISTING_CACHE_CONTROL) },
    );
  } catch (error) {
    console.error("Error fetching llamalend positions from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch positions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
