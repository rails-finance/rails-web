import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import {
  parsePolarisPositionsQuery,
  readPolarisPositionsFromBackend,
} from "@/lib/sources/api/polaris-positions-backend";

// api arm of the Polaris CDP listing — the LIVE rails-server index.
// rails-server does the structural filter/sort/paginate over the reduced
// per-CDP state at the (market, cdpId) grain and returns the page slice as raw
// rows ({ rows, total, limit, offset, markets }); presentation (scaling the
// 1e18 strings, the two-axis status) happens in buildPolarisPositionRows.
// Native units only. Returns the { success, data, pagination, markets }
// envelope. Node runtime; the response carries the listing's own cache header.
//
// This is a thin shell: the allowlist, the backend query and the row building
// live in lib/sources/api/polaris-positions-backend.ts, which the wallet
// share-image route also calls — in process, with the scraper's IP as the
// reader — instead of hopping back through here.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  try {
    const read = await readPolarisPositionsFromBackend(
      parsePolarisPositionsQuery(request.nextUrl.searchParams),
      readerIp,
      request.signal,
    );
    if (!read.ok) {
      console.error(`Backend API error: ${read.status} ${read.statusText}`);
      return NextResponse.json({ success: false, error: `Backend error: ${read.statusText}` }, { status: read.status });
    }
    return NextResponse.json(
      { success: true, ...read.result },
      { headers: proxyCacheControl(read.upstream, LISTING_CACHE_CONTROL) },
    );
  } catch (error) {
    console.error("Error fetching polaris positions from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch positions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
