import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { parseAlchemixV2Query, readAlchemixV2Positions } from "@/lib/sources/api/alchemix-v2-backend";

// api arm of the Alchemix V2 listing. A thin shell over
// lib/sources/api/alchemix-v2-backend.ts: the query is allowlisted and the
// backend's answer is forwarded unchanged.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  try {
    const read = await readAlchemixV2Positions(
      parseAlchemixV2Query(request.nextUrl.searchParams),
      readerIp,
      request.signal,
    );
    if (!read.ok) {
      console.error(`Backend API error: ${read.status} ${read.statusText}`);
      return NextResponse.json({ success: false, error: `Backend error: ${read.statusText}` }, { status: read.status });
    }
    return NextResponse.json(read.result, { headers: proxyCacheControl(read.upstream, LISTING_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching alchemix v2 positions from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch positions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
