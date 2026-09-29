import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL } from "@/lib/api/proxy-cache";
import { parseSkyPositionsQuery, readSkyPositions, SkyReadError } from "@/lib/sources/api/sky-savings";

// The Sky Savings listing's JSON face: one page of rails-server's
// /api/sky-savings/positions, read with the bearer token as the reader. The
// envelope (asOf, gate, coverage, excluded) travels with the rows, because the
// listing states no figure unless the gate passed.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const page = await readSkyPositions(
      parseSkyPositionsQuery(request.nextUrl.searchParams),
      readerIpFromRequest(request),
      request.signal,
    );
    return NextResponse.json({ success: true, ...page }, { headers: { "Cache-Control": LISTING_CACHE_CONTROL } });
  } catch (error) {
    const status = error instanceof SkyReadError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Failed to fetch positions";
    console.error("sky-savings positions proxy:", message);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
