import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import {
  parseAlchemixTransmuterQuery,
  readAlchemixTransmuterPositions,
} from "@/lib/sources/api/alchemix-transmuter-backend";

// api arm of the Alchemix V3 Transmuter listing. A thin shell over
// lib/sources/api/alchemix-transmuter-backend.ts: the query is allowlisted and
// the backend's answer is forwarded unchanged. Both explorers read this one
// route and separate themselves with `chainId`.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  try {
    const read = await readAlchemixTransmuterPositions(
      parseAlchemixTransmuterQuery(request.nextUrl.searchParams),
      readerIp,
      request.signal,
    );
    if (!read.ok) {
      console.error(`Backend API error: ${read.status} ${read.statusText}`);
      return NextResponse.json({ success: false, error: `Backend error: ${read.statusText}` }, { status: read.status });
    }
    return NextResponse.json(read.result, { headers: proxyCacheControl(read.upstream, LISTING_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching alchemix transmuter positions from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch positions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
