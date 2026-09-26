import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { ALCHEMIX_TOKEN_ID, readAlchemixPosition } from "@/lib/sources/api/alchemix-position-backend";

// api arm of one Alchemist position — the reduced state at the (lineKey,
// tokenId) grain, joined to the head chain reading and graded.
//
// A thin shell: the read lives in lib/sources/api/alchemix-position-backend.ts
// and the backend answers in the shape the page renders, so the response goes
// through unchanged — `coverage` and `notes` included. Both Alchemix explorers
// read this one route; the line key names the chain's registry entry and the
// page has already checked that the line belongs to the chain in its URL.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ lineKey: string; tokenId: string }> }) {
  const { lineKey, tokenId } = await params;
  if (!ALCHEMIX_TOKEN_ID.test(tokenId)) {
    return NextResponse.json({ success: false, error: "Invalid tokenId. Must be a positive integer" }, { status: 400 });
  }
  const readerIp = readerIpFromRequest(request);
  try {
    const read = await readAlchemixPosition(lineKey, tokenId, readerIp, request.signal);
    if (!read.ok) {
      console.error(`Backend API error: ${read.status} ${read.statusText}`);
      return NextResponse.json({ success: false, error: `Backend error: ${read.statusText}` }, { status: read.status });
    }
    return NextResponse.json(read.result, { headers: proxyCacheControl(read.upstream, LISTING_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching the alchemix position from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch the position";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
