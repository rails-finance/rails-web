import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import {
  parseAlchemixPositionsQuery,
  readAlchemixPositionsFromBackend,
} from "@/lib/sources/api/alchemix-positions-backend";

// api arm of the Alchemix V3 position listing — the LIVE rails-server index over
// the reduced per-position state at the (lineKey, tokenId) grain.
//
// A thin shell: the query allowlist and the backend read live in
// lib/sources/api/alchemix-positions-backend.ts. The backend already answers in
// the shape the page renders — every figure paired with the block it is true at,
// the grade, and the sentence that states the grade in words — so the response
// is forwarded unchanged, including `coverage` and `notes`. Both Alchemix
// explorers read this one route and separate themselves with `chainId`.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  try {
    const read = await readAlchemixPositionsFromBackend(
      parseAlchemixPositionsQuery(request.nextUrl.searchParams),
      readerIp,
      request.signal,
    );
    if (!read.ok) {
      console.error(`Backend API error: ${read.status} ${read.statusText}`);
      return NextResponse.json({ success: false, error: `Backend error: ${read.statusText}` }, { status: read.status });
    }
    return NextResponse.json(read.result, { headers: proxyCacheControl(read.upstream, LISTING_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching alchemix positions from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch positions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
